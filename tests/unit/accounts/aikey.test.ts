import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeAppPool, startTestDb } from "../../support/pgserver.ts";

const pg = await startTestDb();
process.env.DATABASE_URL = pg.url;
process.env.DB_POOL_MAX = "1";
process.env.APP_SECRET ||= "ab".repeat(32);
const { db } = await import("../../../src/lib/db.ts");
const svc = await import("../../../src/features/accounts/service.ts");

after(async () => {
  await closeAppPool();
  await pg.stop();
});

const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";
const ok = async () => {};
let userA = 0, userB = 0;

test("setup: two users", async () => {
  await db.run("INSERT INTO users (email, pw_hash, name, created_at) VALUES ('a@k.test','x','A',1), ('b@k.test','x','B',1)");
  userA = (await db.one<{ id: number }>("SELECT id FROM users WHERE email = 'a@k.test'"))!.id;
  userB = (await db.one<{ id: number }>("SELECT id FROM users WHERE email = 'b@k.test'"))!.id;
});

test("a Claude key is checked, stored encrypted, and only its last 4 characters can be read back", async () => {
  assert.equal(await svc.claudeKeyLast4(userA), null);
  const r = await svc.setClaudeKey(userA, `  ${KEY}  `, ok);
  assert.equal(r.last4, KEY.slice(-4));
  const row = await db.one<{ key_enc: string; key_last4: string }>("SELECT key_enc, key_last4 FROM ai_keys WHERE user_id = ?", [userA]);
  assert.ok(row && !row.key_enc.includes(KEY) && !row.key_enc.includes("sk-ant")); // not stored in the clear
  assert.equal(await svc.claudeKeyLast4(userA), KEY.slice(-4));
});

test("a key that is not Claude-shaped, or that Anthropic rejects, is never stored", async () => {
  await assert.rejects(svc.setClaudeKey(userB, "not-a-key", ok), /does not look like a Claude API key/);
  await assert.rejects(svc.setClaudeKey(userB, KEY, async () => { throw new Error("401"); }), /401/);
  assert.equal(await svc.claudeKeyLast4(userB), null);
  assert.equal(await svc.claudeClientFor(userB), null);
});

test("the assistant gets a ready client for the owner's key, and nothing for a user without one; removing the key stops it", async () => {
  assert.ok(await svc.claudeClientFor(userA)); // a client, never the key itself
  assert.equal(await svc.claudeClientFor(userB), null); // one user's key is never used for another
  await svc.removeClaudeKey(userA);
  assert.equal(await svc.claudeClientFor(userA), null);
  assert.equal(await svc.claudeKeyLast4(userA), null);
});

test("replacing a key keeps one row per user", async () => {
  await svc.setClaudeKey(userA, KEY, ok);
  await svc.setClaudeKey(userA, KEY.replace(/.{4}$/, "WXYZ"), ok);
  assert.equal((await db.one<{ n: number }>("SELECT COUNT(*)::int AS n FROM ai_keys WHERE user_id = ?", [userA]))!.n, 1);
  assert.equal(await svc.claudeKeyLast4(userA), "WXYZ");
});
