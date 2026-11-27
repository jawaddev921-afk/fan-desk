import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFakeOfmapi } from "../../support/fakeofmapi.ts";
import { closeAppPool, startTestDb } from "../../support/pgserver.ts";

const pg = await startTestDb();
const fake = await startFakeOfmapi([1]);
process.env.DATABASE_URL = pg.url;
process.env.DB_POOL_MAX = "1";
process.env.APP_SECRET ||= "ab".repeat(32);
process.env.OFMAPI_BASE_URL = fake.base;
const { encrypt } = await import("../../../src/lib/crypto.ts");
const users = await import("../../../src/features/auth/queries.ts");
const accounts = await import("../../../src/features/accounts/queries.ts");
const creator = await import("../../../src/features/creator/service.ts");

after(async () => {
  await fake.stop();
  await closeAppPool();
  await pg.stop();
});

const user = await users.insertUser("vault@example.com", "x");
await accounts.insertConnection(user.id, { keyEnc: encrypt("ofmapi_test_key_000000000000"), last4: "0000", teamName: null, teamSlug: null, credits: null, webhookToken: "t".repeat(24), webhookSecretEnc: encrypt("s") });
await accounts.insertAccount("acct_vault", user.id, "v", "V", "{}");

test("a folder, a type and a search are sent with the provider's own parameter names", async () => {
  fake.stats.vaultCalls.length = 0;
  const all = await creator.vaultPage(user.id, "acct_vault");
  const folder = await creator.vaultPage(user.id, "acct_vault", { folder: "12", type: "video", query: "red dress" });
  assert.equal(all.items.length, 12);
  assert.equal(folder.items.length, 6); // the fake answers a folder with its own six
  assert.deepEqual(fake.stats.vaultCalls, ["", "?category=12&type=video&query=red%20dress"]); // `category`, not `categoryId`
});

test("folder names that arrive HTML-escaped are shown as text", async () => {
  assert.deepEqual((await creator.vaultFolders(user.id, "acct_vault")).map((f) => f.name), ["Beach", "Shower & bath"]);
});

test("a picture whose link we do not know is found again in the Vault, and a dead link is refreshed", async () => {
  const lost = await creator.vaultThumb(user.id, "acct_vault", "505"); // never listed in this process
  assert.ok(lost && lost.ok);
  assert.match(lost.headers.get("content-type") ?? "", /^image\//);
  fake.stats.failVsvgOnce = true; // the cached link has expired
  const again = await creator.vaultThumb(user.id, "acct_vault", "505");
  assert.ok(again && again.ok);
  assert.equal(await creator.vaultThumb(user.id, "acct_vault", "99999"), null); // not in the Vault at all: nothing to show, no crash
});
