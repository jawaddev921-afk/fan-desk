import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeAppPool, startTestDb } from "../../support/pgserver.ts";

// The real migrations and the real pg driver, against an in-process Postgres.
const pg = await startTestDb();
process.env.DATABASE_URL = pg.url;
process.env.DB_POOL_MAX = "1";
process.env.APP_SECRET ||= "ab".repeat(32);
const { db } = await import("../../../src/lib/db.ts");
const q = await import("../../../src/features/inbox/queries.ts");

after(async () => {
  await closeAppPool();
  await pg.stop();
});

const A = "acct_test1";

test("a message with the same OnlyFans id is stored once; addMessage says whether it was new", async () => {
  await q.upsertFan(A, "1", { username: "one" });
  assert.equal(await q.addMessage(A, "1", "in", "fan", "hello", { ofId: "m1", createdAt: 1000 }), true);
  assert.equal(await q.addMessage(A, "1", "in", "fan", "hello again", { ofId: "m1", createdAt: 2000 }), false);
  assert.equal((await q.recentMessages(A, "1")).length, 1);
  assert.equal((await q.getFan(A, "1"))?.last_message_at, 1000); // BIGINT comes back as a number, not a string
});

test("messages without an OnlyFans id are never treated as duplicates", async () => {
  assert.equal(await q.addMessage(A, "1", "out", "human", "a"), true);
  assert.equal(await q.addMessage(A, "1", "out", "human", "a"), true);
});

test("upsertFan keeps the larger spend and does not overwrite a name with nothing", async () => {
  await q.upsertFan(A, "2", { username: "two", name: "Two", totalSpend: 50 });
  const f = await q.upsertFan(A, "2", { totalSpend: 20 });
  assert.equal(f.total_spend, 50);
  assert.equal(f.name, "Two");
  assert.equal((await q.upsertFan(A, "2", { totalSpend: 90 })).total_spend, 90);
});

test("markEventSeen is true the first time and false for a repeated delivery", async () => {
  assert.equal(await q.markEventSeen(1, "k1", "messages.received"), true);
  assert.equal(await q.markEventSeen(1, "k1", "messages.received"), false);
});

test("listFans: human first, then best score, and a fan who never wrote goes last (not first)", async () => {
  await q.upsertFan(A, "10", {});
  await q.upsertFan(A, "11", {});
  await q.upsertFan(A, "12", {});
  await q.saveScore(A, "10", 40, "warm");
  await q.saveScore(A, "11", 40, "warm");
  await q.saveScore(A, "12", 40, "warm");
  await q.addMessage(A, "11", "in", "fan", "x", { createdAt: 5000 }); // 11 wrote; 10 and 12 never did
  await q.setFanMode(A, "12", "human", "test");
  const ids = (await q.listFans(A, null)).map((f) => f.fan_id).filter((id) => ["10", "11", "12"].includes(id));
  assert.deepEqual(ids, ["12", "11", "10"]);
  assert.deepEqual((await q.listFans(A, "hot")).length, 0);
});

test("fanCounts counts as numbers", async () => {
  const c = await q.fanCounts(A);
  assert.equal(typeof c.total, "number");
  assert.equal(c.human, 1);
});

test("row level security is on for every table (closes the public REST API on Supabase)", async () => {
  const off = await db.all<{ relname: string }>("SELECT relname FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace AND NOT relrowsecurity");
  assert.deepEqual(off.map((r) => r.relname), []);
});

test("purgeOldData removes webhook ids after 30 days and messages after 12 months, nothing newer", async () => {
  const { purgeOldData } = await import("../../../src/features/inbox/service.ts");
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  await db.run("INSERT INTO events (user_id, idempotency_key, event, received_at) VALUES (9, 'old', 'x', ?), (9, 'new', 'x', ?)", [now - 31 * day, now - 29 * day]);
  await q.addMessage(A, "70", "in", "fan", "ancient", { createdAt: now - 400 * day });
  await q.addMessage(A, "70", "in", "fan", "recent", { createdAt: now - 300 * day });
  await purgeOldData(now);
  assert.deepEqual((await db.all<{ idempotency_key: string }>("SELECT idempotency_key FROM events WHERE user_id = 9")).map((r) => r.idempotency_key), ["new"]);
  assert.deepEqual((await q.recentMessages(A, "70")).map((m) => m.text), ["recent"]);
});

test("hasCompleteMessage knows which OnlyFans messages are stored completely (a sync skips conversations that are up to date); pending media is not complete", async () => {
  await q.addMessage(A, "80", "in", "fan", "stored", { ofId: "of-known" });
  assert.equal(await q.hasCompleteMessage(A, "of-known"), true);
  assert.equal(await q.hasCompleteMessage(A, "of-unknown"), false);
  assert.equal(await q.hasCompleteMessage("acct_other", "of-known"), false); // per account
  await q.addMessage(A, "80", "in", "fan", "look", { ofId: "of-pending", mediaPending: true }); // the webhook said it has pictures
  assert.equal(await q.hasCompleteMessage(A, "of-pending"), false);
  await q.clearMediaPending(A, ["of-pending"]); // the provider's list was read (it had no media for it)
  assert.equal(await q.hasCompleteMessage(A, "of-pending"), true);
  await q.addMessage(A, "80", "in", "fan", "look", { ofId: "of-pending2", mediaPending: true });
  await q.setMessageMedia(A, "of-pending2", [{ id: "x", type: "photo", locked: false, price: 0, url: "u" }]); // its media arrived
  assert.equal(await q.hasCompleteMessage(A, "of-pending2"), true);
});

test("media is stored with the message, added to an older copy, read back by message id, replaced when the links are refreshed, and only for the right account", async () => {
  const item = { id: "m1", type: "photo", locked: false, price: 0, url: "https://api.ofmapi.com/v1/media/abc" };
  await q.addMessage(A, "90", "in", "fan", "no media yet", { ofId: "of-m1" });
  assert.deepEqual((await q.recentMessages(A, "90"))[0].media, []); // a message without media reads as an empty list
  assert.equal(await q.addMessage(A, "90", "in", "fan", "no media yet", { ofId: "of-m1", media: [item] }), false); // already stored: false, but the media is added
  const row = (await q.recentMessages(A, "90"))[0];
  assert.deepEqual(row.media, [item]);
  assert.deepEqual((await q.getStoredMedia(A, row.id))?.media, [item]);
  assert.equal(await q.getStoredMedia("acct_other", row.id), undefined); // another account cannot read it
  const fresh = { ...item, url: "https://api.ofmapi.com/v1/media/new" };
  await q.setMessageMedia(A, "of-m1", [fresh]);
  assert.deepEqual((await q.getStoredMedia(A, row.id))?.media, [fresh]);
});

test("a fan's photo link is saved, kept when a later update has none, and replaced when a new one comes", async () => {
  await q.upsertFan(A, "91", { avatarUrl: "https://public.onlyfans.com/a.jpg" });
  assert.equal((await q.upsertFan(A, "91", { name: "x" })).avatar_url, "https://public.onlyfans.com/a.jpg");
  assert.equal((await q.upsertFan(A, "91", { avatarUrl: "https://public.onlyfans.com/b.jpg" })).avatar_url, "https://public.onlyfans.com/b.jpg");
});

test("widelySent ranks what reached the most fans and ignores a message sent to fewer than 3", async () => {
  const B = "acct_wide";
  const ppv = [{ id: "1", type: "photo", locked: true, price: 9, url: null }];
  for (const f of ["a", "b", "c", "d"]) { await q.upsertFan(B, f, {}); await q.addMessage(B, f, "out", "human", "big ppv", { media: ppv }); }
  for (const f of ["a", "b", "c"]) await q.addMessage(B, f, "out", "human", "hello all");
  for (const f of ["a", "b"]) await q.addMessage(B, f, "out", "human", "only two");
  const best = await q.widelySent(B, "best");
  assert.deepEqual(best.map((r) => [r.text, r.price, r.fans]), [["big ppv", 9, 4]]);
  assert.deepEqual((await q.widelySent(B, "mass")).map((r) => [r.text, r.fans]), [["big ppv", 4], ["hello all", 3]]);
});

test("herTypicalWords is the median length of her one-to-one replies and ignores a text sent to 3+ fans", async () => {
  const C = "acct_style";
  assert.equal(await q.herTypicalWords(C), null); // too few messages
  for (let i = 0; i < 20; i++) { await q.upsertFan(C, `f${i}`, {}); await q.addMessage(C, `f${i}`, "out", "human", i % 2 ? `yes babe ${i}` : `mm that sounds fun ${i}, tell me more`); }
  for (const f of ["a", "b", "c"]) { await q.upsertFan(C, f, {}); await q.addMessage(C, f, "out", "human", "this is a long mass message sent to many fans at once to skew the length of replies"); }
  const typical = await q.herTypicalWords(C);
  assert.ok(typical !== null && typical >= 3 && typical <= 8); // the mass text (17 words) is not counted
});
