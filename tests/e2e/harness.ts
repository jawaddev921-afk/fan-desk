// Everything the end-to-end checks stand on: assertions, a logged-in-client helper, and building + starting the app.
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { startTestDb } from "../support/pgserver.ts";
import { fansApi, ollama } from "./fakes.ts";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fan-desk-e2e-"));
const APP_SECRET = crypto.randomBytes(32).toString("hex");
const PORT = 4100, FANS_PORT = 4101, OLLAMA_PORT = 4102;
export const BASE = `http://localhost:${PORT}`;

pg.types.setTypeParser(20, Number); // BIGINT and COUNT as numbers, like the app does
pg.types.setTypeParser(1700, Number);
process.env.APP_SECRET = APP_SECRET; // so we can decrypt webhook secrets the same way the server does
export const { decrypt } = await import("../../src/lib/crypto.ts");

// ------------------------------------------------------------------ assertions
let failed = 0;
export const failures = () => failed;
export function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ← ${detail}`}`);
  if (!ok) failed++;
}
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function waitFor(fn: () => unknown, ms = 8000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(100);
  }
  return !!(await fn());
}

// ------------------------------------------------------------------ client helpers
export class Client {
  cookie = "";
  async call(method: string, p: string, body?: unknown, headers: Record<string, string> = { "X-Requested-With": "fan-desk" }) {
    const res = await fetch(BASE + p, {
      method,
      headers: { "Content-Type": "application/json", ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  }
}

export function signedWebhook(token: string, secret: string, payload: unknown, idem?: string) {
  const raw = JSON.stringify(payload);
  return fetch(`${BASE}/api/webhooks/fansapi/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Signature: crypto.createHmac("sha256", secret).update(raw).digest("hex"), ...(idem ? { "X-OFAPI-Idempotency-Key": idem } : {}) },
    body: raw,
  });
}
export const msgEvt = (acct: string, fanId: number, text: string, spend = 0, id?: string) => ({
  event: "messages.received",
  account_id: acct,
  payload: { id: id ?? String(Math.random()).slice(2, 14), text: `<p>${text}</p>`, isTip: false, mediaCount: 0, fromUser: { id: fanId, username: `fan${fanId}`, name: `Fan ${fanId}` }, fanData: { spending: { total: spend } } },
});

/** Builds the app and starts it against the fake services. `stop()` shuts everything down and deletes the temp data. */
export async function startApp(): Promise<{ stop(): Promise<void>; log(): string }> {
  testDb = await startTestDb();
  fansApi.listen(FANS_PORT);
  ollama.listen(OLLAMA_PORT);
  // The app runs the way it ships: a production build, started with `next start`. It builds into its own folder
  // (.next-e2e) so a developer's .next is never touched. Every setting is given here on purpose: Next would otherwise
  // also load the developer's real .env (their real key, PUBLIC_URL, ...) into the test server.
  const NEXT = path.join(ROOT, "node_modules/next/dist/bin/next");
  const env = {
    ...process.env,
    NODE_ENV: "production" as const,
    NEXT_DIST_DIR: ".next-e2e",
    NEXT_TELEMETRY_DISABLED: "1",
    APP_SECRET,
    DATABASE_URL: testDb.url,
    CRON_SECRET: "e2e-cron-secret",
    DB_POOL_MAX: "1", // the in-process Postgres is one session; the app takes one connection and the checks use another
    PORT: String(PORT),
    FANSAPI_BASE_URL: `http://localhost:${FANS_PORT}/api`,
    AI_PROVIDER: "ollama",
    OLLAMA_URL: `http://localhost:${OLLAMA_PORT}`,
    REPLY_DEBOUNCE_MS: "200",
    PUBLIC_URL: "https://desk.example.test",
    ALLOW_SIGNUP: "true",
    TRUST_PROXY: "false",
    ANTHROPIC_API_KEY: "",
  };
  console.log("building the app (next build)...");
  try {
    execFileSync(process.execPath, [NEXT, "build"], { cwd: ROOT, env, stdio: "pipe" });
  } catch (err: any) {
    console.error("next build failed:\n" + String(err.stdout ?? "") + String(err.stderr ?? ""));
    process.exit(1);
  }
  const server = spawn(process.execPath, [NEXT, "start", "-p", String(PORT)], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));
  let up = false;
  for (let i = 0; i < 100 && !up; i++) {
    up = await fetch(`${BASE}/api/health`).then((r) => r.ok, () => false);
    if (!up) await sleep(200);
  }
  if (!up) {
    console.error("server did not start:\n" + serverLog);
    server.kill();
    process.exit(1);
  }
  return {
    log: () => serverLog,
    async stop() {
      server.kill();
      fansApi.close();
      ollama.close();
      await testDb?.stop();
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}

let testDb: Awaited<ReturnType<typeof startTestDb>> | undefined;

/** Reads the app's database directly (its own connection), to check what really got stored. SQL uses `?` like the app's queries. */
export async function q<T = any>(sql: string, ...args: any[]): Promise<T[]> {
  const c = new pg.Client({ connectionString: testDb!.url });
  await c.connect();
  try {
    let n = 0;
    return (await c.query(sql.replace(/\?/g, () => "$" + ++n), args)).rows as T[];
  } finally {
    await c.end();
  }
}

/** Every row of every table as JSON text: to prove that a secret is stored nowhere in the clear. */
export async function dumpAll(): Promise<string> {
  let out = "";
  for (const { table_name } of await q<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")) {
    for (const r of await q<{ j: string }>(`SELECT to_json(t)::text AS j FROM ${table_name} t`)) out += r.j;
  }
  return out;
}
