import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeAppPool, startTestDb } from "../../support/pgserver.ts";

const pg = await startTestDb();
process.env.DATABASE_URL = pg.url;
process.env.DB_POOL_MAX = "1";
process.env.APP_SECRET ||= "ab".repeat(32);
const { db } = await import("../../../src/lib/db.ts");
const q = await import("../../../src/features/assistant/queries.ts");

after(async () => {
  await closeAppPool();
  await pg.stop();
});

const A = "acct_test2";

test("dueReplyJobs hands out each due job once, at most 4, and leaves later ones", async () => {
  for (const f of ["1", "2", "3", "4", "5"]) await q.scheduleReply(A, f, -1000);
  await q.scheduleReply(A, "6", 60_000); // not due yet
  const first = await q.dueReplyJobs();
  const second = await q.dueReplyJobs();
  assert.equal(first.length, 4);
  assert.equal(second.length, 1);
  assert.equal(new Set([...first, ...second].map((j) => j.fan_id)).size, 5); // nothing handed out twice
  assert.equal((await q.dueReplyJobs()).length, 0);
});

test("scheduling again moves the run time instead of adding a second job", async () => {
  await q.scheduleReply(A, "9", 60_000);
  await q.scheduleReply(A, "9", -1);
  assert.equal((await q.dueReplyJobs()).filter((j) => j.fan_id === "9").length, 1);
});

test("an outbox item fails for good after the 8th failed attempt, not before", async () => {
  const id = await q.createOutboxItem(A, "20", "hi", "assistant", "queued");
  for (let i = 1; i <= 7; i++) await q.markRetry((await q.getOutboxItem(id))!, "boom", 0);
  assert.equal((await q.getOutboxItem(id))?.status, "queued");
  await q.markRetry((await q.getOutboxItem(id))!, "boom", 0);
  const item = (await q.getOutboxItem(id))!;
  assert.equal(item.status, "failed");
  assert.equal(item.attempts, 8);
});

test("approving a draft queues it, and an edited text replaces the old one", async () => {
  const id = await q.createOutboxItem(A, "21", "draft text", "assistant", "draft");
  await q.approveDraft(id, "edited text");
  const item = (await q.getOutboxItem(id))!;
  assert.deepEqual([item.status, item.text], ["queued", "edited text"]);
  const id2 = await q.createOutboxItem(A, "21", "keep me", "assistant", "draft");
  await q.approveDraft(id2, null);
  assert.equal((await q.getOutboxItem(id2))?.text, "keep me");
});

test("pending counts and usage sums come back as numbers", async () => {
  assert.equal(typeof (await q.pendingCount(A)), "number");
  await q.recordUsage(A, "m", 10, 5);
  await q.recordUsage(A, "m", 20, 6);
  const [u] = await q.usageByModel(A, 0);
  assert.deepEqual([u.calls, u.input, u.output], [2, 30, 11]); // SUM(INTEGER) is NUMERIC in Postgres; the driver must not hand back "30"
});

test("isOurMessage matches by OnlyFans id, or by the same text sent just now", async () => {
  const id = await q.createOutboxItem(A, "30", "same text", "assistant", "queued");
  assert.equal(await q.isOurMessage(A, "30", null, "same text"), true);
  await q.markSent(id, "of-77");
  assert.equal(await q.isOurMessage(A, "30", "of-77", "different"), true);
  assert.equal(await q.isOurMessage(A, "30", "other", "different"), false);
});

test("the claim query really is one statement that deletes what it returns", async () => {
  await q.scheduleReply(A, "40", -1);
  assert.equal((await db.one<{ n: number }>("SELECT COUNT(*) AS n FROM reply_jobs WHERE fan_id = '40'"))!.n, 1);
  await q.dueReplyJobs();
  assert.equal((await db.one<{ n: number }>("SELECT COUNT(*) AS n FROM reply_jobs WHERE fan_id = '40'"))!.n, 0);
});

test("claimQueued hands each due send to one worker only, and marks it 'sending'", async () => {
  const a = await q.createOutboxItem(A, "50", "one", "assistant", "queued");
  const b = await q.createOutboxItem(A, "51", "two", "assistant", "queued");
  const first = await q.claimQueued();
  const second = await q.claimQueued();
  const mine = (items: { id: string }[]) => items.filter((i) => i.id === a || i.id === b).length;
  assert.equal(mine(first), 2); // other tests leave queued items behind, so look only at ours
  assert.ok(first.every((i) => i.status === "sending"));
  assert.equal(second.length, 0); // a second overlapping worker finds nothing to send
});

test("a retry puts a claimed send back in the queue; drafts are never claimed", async () => {
  const id = await q.createOutboxItem(A, "52", "again", "assistant", "queued");
  const [item] = (await q.claimQueued()).filter((i) => i.id === id);
  await q.markRetry(item, "temporary", 0);
  assert.equal((await q.getOutboxItem(id))?.status, "queued");
  await q.createOutboxItem(A, "53", "just a draft", "assistant", "draft");
  assert.ok((await q.claimQueued()).every((i) => i.fan_id !== "53"));
});

test("a send stuck in 'sending' becomes 'unknown' (never resent by itself), a fresh one is left alone", async () => {
  const old = await q.createOutboxItem(A, "54", "old", "assistant", "queued");
  await q.claimQueued();
  await db.run("UPDATE outbox SET updated_at = ? WHERE id = ?", [Date.now() - 10 * 60 * 1000, old]);
  const fresh = await q.createOutboxItem(A, "55", "fresh", "assistant", "queued");
  await q.claimQueued();
  await q.markStuckSendsUnknown(5 * 60 * 1000);
  assert.equal((await q.getOutboxItem(old))?.status, "unknown");
  assert.equal((await q.getOutboxItem(fresh))?.status, "sending");
  assert.equal((await q.claimQueued()).length, 0); // an 'unknown' item is not claimed again
});
