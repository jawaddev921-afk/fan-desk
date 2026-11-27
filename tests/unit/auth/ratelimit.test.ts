import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeAppPool, startTestDb } from "../../support/pgserver.ts";

const pg = await startTestDb();
process.env.DATABASE_URL = pg.url;
process.env.DB_POOL_MAX = "1";
process.env.APP_SECRET ||= "ab".repeat(32);
const { rateLimit, purgeExpiredSessions } = await import("../../../src/features/auth/service.ts");
const { db } = await import("../../../src/lib/db.ts");

after(async () => {
  await closeAppPool();
  await pg.stop();
});

const tooMany = (p: Promise<void>) => assert.rejects(p, (e: { status?: number }) => e.status === 429);

test("the limit is per key: the third hit in the window is refused, another key is not affected", async () => {
  await rateLimit("k1", 2, 60_000);
  await rateLimit("k1", 2, 60_000);
  await tooMany(rateLimit("k1", 2, 60_000));
  await rateLimit("k2", 2, 60_000);
});

test("a new window starts when the old one is over", async () => {
  await rateLimit("k3", 1, 40);
  await tooMany(rateLimit("k3", 1, 40));
  await new Promise((r) => setTimeout(r, 70));
  await rateLimit("k3", 1, 40);
});

test("the message can be set (the sync cooldown says how long to wait)", async () => {
  await rateLimit("sync:x", 1, 60_000, "wait 20s");
  await assert.rejects(rateLimit("sync:x", 1, 60_000, "wait 20s"), /wait 20s/);
});

test("the hourly clean-up removes finished windows only", async () => {
  await rateLimit("old", 5, 10);
  await new Promise((r) => setTimeout(r, 30));
  await rateLimit("live", 5, 60_000);
  await purgeExpiredSessions();
  const keys = (await db.all<{ key: string }>("SELECT key FROM rate_limits")).map((r) => r.key);
  assert.ok(!keys.includes("old") && keys.includes("live"));
});

test("concurrent hits are all counted (one atomic statement, no lost updates)", async () => {
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => rateLimit("race", 4, 60_000)));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 4);
});
