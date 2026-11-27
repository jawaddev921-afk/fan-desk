import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFakeResend, tokenOf } from "../../support/fakeresend.ts";
import { closeAppPool, startTestDb } from "../../support/pgserver.ts";

const pg = await startTestDb();
const mail = await startFakeResend();
process.env.DATABASE_URL = pg.url;
process.env.DB_POOL_MAX = "1";
process.env.APP_SECRET ||= "ab".repeat(32);
process.env.RESEND_API_KEY = "re_test_key_not_real";
process.env.EMAIL_API_URL = mail.url;
process.env.EMAIL_FROM = "Fan Desk <noreply@example.test>";
delete process.env.REQUIRE_EMAIL_VERIFICATION; // with a Resend key, confirmation is required
delete process.env.PUBLIC_URL;
const { db } = await import("../../../src/lib/db.ts");
const auth = await import("../../../src/features/auth/service.ts");
const q = await import("../../../src/features/auth/queries.ts");

after(async () => {
  await mail.stop();
  await closeAppPool();
  await pg.stop();
});

const ORIGIN = "https://desk.example.test";
const PASSWORD = "correct-horse-battery";
const userCount = async () => (await db.one<{ n: number }>("SELECT COUNT(*) AS n FROM users"))!.n;
const status = (fn: () => Promise<unknown>) => fn().then(() => 0, (e: { status?: number }) => e.status ?? -1);

test("sign-up with an email provider creates no account yet: it sends a link", async () => {
  const r = await auth.signup("Sarena Khan", "Sarena@Example.com", PASSWORD, true, ORIGIN);
  assert.deepEqual(r, { pending: true });
  assert.equal(await userCount(), 0);
  assert.equal(mail.mails.length, 1);
  const m = mail.mails[0];
  assert.deepEqual(m.to, ["sarena@example.com"]); // lower-cased
  assert.equal(m.from, "Fan Desk <noreply@example.test>");
  assert.equal(m.authorization, "Bearer re_test_key_not_real");
  assert.match(m.subject, /Confirm your email/);
  assert.match(m.text, new RegExp(`^Hi Sarena Khan,`));
  assert.match(m.text, new RegExp(`${ORIGIN}/verify\\?token=`));
  assert.ok(m.html.includes(`${ORIGIN}/verify?token=`));
});

test("opening the link creates the account with the name, a confirmed email and the original consent time; it works once", async () => {
  const token = tokenOf(mail.mails[0]);
  const user = await auth.verifyEmail(token);
  assert.deepEqual([user.email, user.name], ["sarena@example.com", "Sarena Khan"]);
  assert.ok(user.email_verified_at && user.terms_accepted_at);
  assert.equal(await userCount(), 1);
  assert.equal(await status(() => auth.verifyEmail(token)), 400); // used
  // the person can now log in with the password chosen at sign-up
  assert.equal((await auth.login("sarena@example.com", PASSWORD, "1.1.1.1")).id, user.id);
});

test("an email that already has an account is refused (and no mail is sent)", async () => {
  const before = mail.mails.length;
  assert.equal(await status(() => auth.signup("Other", "sarena@example.com", PASSWORD, true, ORIGIN)), 409);
  assert.equal(mail.mails.length, before);
});

test("asking again for the same email replaces the link: the old one stops working", async () => {
  await auth.signup("Lexi", "lexi@example.com", PASSWORD, true, ORIGIN);
  await auth.signup("Lexi S", "lexi@example.com", PASSWORD, true, ORIGIN);
  const [first, second] = mail.mails.slice(-2).map(tokenOf);
  assert.equal(await status(() => auth.verifyEmail(first)), 400);
  assert.equal((await auth.verifyEmail(second)).name, "Lexi S");
});

test("an expired link is refused, junk tokens too", async () => {
  await auth.signup("Late", "late@example.com", PASSWORD, true, ORIGIN);
  const token = tokenOf(mail.mails.at(-1)!);
  await db.run("UPDATE signup_requests SET expires_at = ? WHERE email = 'late@example.com'", [Date.now() - 1]);
  assert.equal(await status(() => auth.verifyEmail(token)), 400);
  for (const junk of ["", "short", "../../etc/passwd", "a".repeat(300)]) assert.equal(await status(() => auth.verifyEmail(junk)), 400);
  assert.equal(await q.takePendingSignup("nope"), undefined);
});

test("the name is required and checked, along with the rest, and each problem is reported per field", async () => {
  await assert.rejects(auth.signup("", "x", "short", false, ORIGIN), (e: { status?: number; fields?: Record<string, string> }) => e.status === 400 && !!e.fields?.name && !!e.fields?.email && !!e.fields?.password && !!e.fields?.terms);
  await assert.rejects(auth.signup("<b>x</b>", "ok@example.com", PASSWORD, true, ORIGIN), (e: { fields?: Record<string, string> }) => !!e.fields?.name);
});

test("if the email cannot be sent the person gets a plain error that never contains the key", async () => {
  mail.state.fail = true;
  try {
    await assert.rejects(auth.signup("Bad", "bad@example.com", PASSWORD, true, ORIGIN), (e: { status?: number; message: string }) => e.status === 502 && !e.message.includes("re_test_key_not_real"));
  } finally {
    mail.state.fail = false;
  }
});

test("without an email provider (or with confirmation turned off) the account is created at once, with its name", async () => {
  process.env.REQUIRE_EMAIL_VERIFICATION = "false";
  try {
    const r = await auth.signup("Direct", "direct@example.com", PASSWORD, true, ORIGIN);
    assert.ok("user" in r && r.user.name === "Direct" && !!r.user.email_verified_at);
  } finally {
    delete process.env.REQUIRE_EMAIL_VERIFICATION;
  }
});

test("the hourly clean-up removes expired sign-up requests only", async () => {
  await auth.signup("Keep", "keep@example.com", PASSWORD, true, ORIGIN);
  await auth.signup("Drop", "drop@example.com", PASSWORD, true, ORIGIN);
  await db.run("UPDATE signup_requests SET expires_at = ? WHERE email = 'drop@example.com'", [Date.now() - 1000]);
  await auth.purgeExpiredSessions();
  const left = (await db.all<{ email: string }>("SELECT email FROM signup_requests")).map((r) => r.email);
  assert.ok(left.includes("keep@example.com") && !left.includes("drop@example.com"));
});
