import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import pg from "pg";
import { closeAppPool, startTestDb } from "../../support/pgserver.ts";

// node --test runs each test file in its own process, so the database pool and the working directory are ours alone.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "migrations-"));
fs.mkdirSync(path.join(dir, "migrations"));
const write = (name: string, sql: string) => fs.writeFileSync(path.join(dir, "migrations", name), sql);
process.chdir(dir);
const server = await startTestDb();
process.env.DATABASE_URL = server.url;
process.env.DB_POOL_MAX = "1";
const { db } = await import("../../../src/lib/db.ts");

// Inspect through a separate connection: asking the app's own `db` would run the (failing) migration again.
const inspect = async <T extends object>(sql: string) => {
  const c = new pg.Client({ connectionString: server.url });
  await c.connect();
  try {
    return (await c.query(sql)).rows as T[];
  } finally {
    await c.end();
  }
};
const tables = async () => (await inspect<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")).map((t) => t.table_name);

after(async () => {
  await closeAppPool();
  await server.stop();
});

test("migrations run in order, once, and a failing one is rolled back completely", async () => {
  write("000_first.sql", "CREATE TABLE a (x INTEGER);");
  write("001_bad.sql", "CREATE TABLE b (x INTEGER); SELECT * FROM does_not_exist;");

  await assert.rejects(db.all("SELECT 1"), /migration 001_bad\.sql failed/);
  assert.deepEqual(await tables(), ["_migrations", "a"]); // 000 stayed; 001 left nothing behind, not even table b
  assert.deepEqual((await inspect<{ name: string }>("SELECT name FROM _migrations")).map((r) => r.name), ["000_first.sql"]);

  write("001_bad.sql", "CREATE TABLE b (x INTEGER);"); // fixed: the next call applies it, and 000 is not run again
  assert.deepEqual((await db.all<{ name: string }>("SELECT name FROM _migrations ORDER BY name")).map((r) => r.name), ["000_first.sql", "001_bad.sql"]);
  assert.deepEqual(await tables(), ["_migrations", "a", "b"]);
});

test("a missing migrations folder is an error that says where it looked", async () => {
  fs.rmSync(path.join(dir, "migrations"), { recursive: true });
  await closeAppPool(); // a fresh start, the way a new process would begin
  await assert.rejects(db.all("SELECT 1"), /migrations folder not found at .*migrations/);
});
