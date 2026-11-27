import "server-only";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { config } from "./config.ts";
import { singleton } from "./singleton.ts";

// BIGINT (timestamps in ms, COUNT) and NUMERIC (SUM of integers) arrive as strings by default; every value we store fits a JS number.
pg.types.setTypeParser(20, Number);
pg.types.setTypeParser(1700, Number);

/** The three calls the queries need. SQL keeps `?` placeholders; they are turned into $1, $2 ... here. */
export type Db = {
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** Runs a statement and returns how many rows it changed. */
  run(sql: string, params?: unknown[]): Promise<number>;
};

type Queryable = { query(text: string, values?: unknown[]): Promise<pg.QueryResult> };

const toPg = (sql: string) => {
  let n = 0;
  return sql.replace(/\?/g, () => "$" + ++n);
};

const over = (q: () => Promise<Queryable>): Db => ({
  all: async (sql, params = []) => (await (await q()).query(toPg(sql), params)).rows,
  one: async (sql, params = []) => (await (await q()).query(toPg(sql), params)).rows[0],
  run: async (sql, params = []) => (await (await q()).query(toPg(sql), params)).rowCount ?? 0,
});

const pool = () => singleton("pg-pool", () => new pg.Pool({ connectionString: config.databaseUrl, max: config.dbPoolMax }));
const state = singleton("db-state", () => ({ ready: null as Promise<void> | null }));

/**
 * Applies every migrations/NNN_name.sql that has not run yet, in order, each in one transaction. An advisory lock makes
 * parallel cold starts (several serverless instances) wait for each other instead of applying the same file twice.
 * shortcut: no "down" migrations and no checksum, a file that already ran must never be edited.
 */
async function migrate(): Promise<void> {
  const dir = path.join(process.cwd(), "migrations");
  if (!fs.existsSync(dir)) throw new Error(`migrations folder not found at ${dir} (start the server from the project root)`);
  const c = await pool().connect();
  try {
    await c.query("SELECT pg_advisory_lock(727274)");
    await c.query("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)");
    await c.query("ALTER TABLE _migrations ENABLE ROW LEVEL SECURITY"); // like every table: closed to Supabase's public REST API
    const done = new Set((await c.query("SELECT name FROM _migrations")).rows.map((r) => r.name as string));
    for (const file of fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()) {
      if (done.has(file)) continue;
      await c.query("BEGIN");
      try {
        await c.query(fs.readFileSync(path.join(dir, file), "utf8"));
        await c.query("INSERT INTO _migrations (name, applied_at) VALUES ($1, $2)", [file, Date.now()]);
        await c.query("COMMIT");
      } catch (err) {
        await c.query("ROLLBACK").catch(() => {});
        throw new Error(`migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    await c.query("SELECT pg_advisory_unlock(727274)").catch(() => {});
    c.release();
  }
}

const ready = () => (state.ready ??= migrate().catch((e) => ((state.ready = null), Promise.reject(e))));

/** The database. The first call connects and migrates; nothing runs at import time. */
export const db: Db = over(async () => (await ready(), pool()));
