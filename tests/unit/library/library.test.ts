import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeAppPool, startTestDb } from "../../support/pgserver.ts";

const pg = await startTestDb();
process.env.DATABASE_URL = pg.url;
process.env.DB_POOL_MAX = "1";
process.env.APP_SECRET ||= "ab".repeat(32);
const { db } = await import("../../../src/lib/db.ts");
const { addFolder, foldersOf } = await import("../../../src/features/library/queries.ts");
const { importMessages, libraryOf, saveMessage } = await import("../../../src/features/library/service.ts");
const { parseRows, renderMessage } = await import("../../../src/features/library/schema.ts");

after(async () => {
  await closeAppPool();
  await pg.stop();
});

const s = { fallbackName: "babe", capitalize: true };

test("{name} is the fan's first name, or the nickname when there is none", () => {
  assert.equal(renderMessage("hi {name}!", "sam smith", s), "hi Sam!");
  assert.equal(renderMessage("hi {name}!", "xX_fan_Xx", s), "hi Babe!"); // not a name
  assert.equal(renderMessage("hi {name}!", null, { fallbackName: "babe", capitalize: false }), "hi babe!");
  assert.equal(renderMessage("{name}, {NAME}", "ana", s), "Ana, Ana");
});

test("pasted rows: header skipped, price read with or without $", () => {
  assert.deepEqual(parseRows("Title\tText\tPrice\nHello\thi {name}\t$12.5\nFree one\tjust text"), [
    { title: "Hello", text: "hi {name}", price: 12.5 },
    { title: "Free one", text: "just text", price: 0 },
  ]);
});

test("a user's library is private: another user's folder cannot be used", async () => {
  await db.run("INSERT INTO users (email, pw_hash, name, created_at) VALUES ('a@x.test','x','A',1), ('b@x.test','x','B',1)");
  const [a, b] = (await db.all<{ id: number }>("SELECT id FROM users WHERE email IN ('a@x.test','b@x.test') ORDER BY email")).map((r) => r.id);
  await addFolder(a!, "Dripset 1");
  const folderId = (await foldersOf(a!))[0]!.id;
  const body = { title: "t", text: "x", price: 5, aiPricing: false, folderId, accountIds: [] };
  await saveMessage(a!, null, body);
  await assert.rejects(saveMessage(b!, null, body), /Folder not found/);
  assert.equal(await importMessages(a!, { folderId, rows: [{ title: "i", text: "y", price: 0 }] }), 1);
  const lib = await libraryOf(a!);
  assert.deepEqual([lib.messages.length, lib.folders[0]!.count, (await libraryOf(b!)).messages.length], [2, 2, 0]);
});
