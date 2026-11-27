// Demo mode: runs the app with a fake OFMAPI and a fake local AI, and seeds a demo user with one account and fans.
// No real keys, credits or fans involved. Usage: npm run demo   → http://localhost:3300  (demo@example.com / demo-password-123)
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { startFakeOfmapi } from "../tests/support/fakeofmapi.ts";
import { startTestDb } from "../tests/support/pgserver.ts";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fan-desk-demo-"));
const APP_SECRET = crypto.randomBytes(32).toString("hex");
const PORT = 3300;
const demoDb = await startTestDb(); // an in-process Postgres, thrown away when the demo stops
process.env.APP_SECRET = APP_SECRET;
process.env.DATABASE_URL = demoDb.url;
process.env.DB_POOL_MAX = "1";
const { encrypt } = await import("../src/lib/crypto.ts");
const accounts = await import("../src/features/accounts/queries.ts");

const ofmapi = await startFakeOfmapi([0, 0, 1, 2, 3, 5, 8, 13]); // conversations of different ages, newest first
const ai = http.createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  const user: string = JSON.parse(raw).messages.at(-1).content;
  const last = ([...user.matchAll(/^FAN: (.*)$/gm)].at(-1)?.[1] ?? "").toLowerCase();
  const d = last.includes("custom")
    ? { intent: "buying", needs_human: true, handoff_reason: "custom order", reply: "", summary: "Wants a custom video; needs the creator to confirm." }
    : last.includes("price") || last.includes("pics")
      ? { intent: "buying", needs_human: false, handoff_reason: "", reply: "The photo set (20 photos) is $15. Want me to send it?", summary: "Asking for prices; ready to buy a photo set." }
      : { intent: "casual", needs_human: false, handoff_reason: "", reply: "Hello! What are you looking for today?", summary: "Casual hello." };
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ message: { content: JSON.stringify(d) }, prompt_eval_count: 1500, eval_count: 120 }));
});
ai.listen(3302);

// `next dev`: no build needed, but every page compiles on its first visit, so the first requests below are slow.
// `npm run demo -- --prod` builds and runs it the way it ships (the same CSP, no dev tools); it builds into .next-e2e.
const NEXT = path.join(ROOT, "node_modules/next/dist/bin/next");
const PROD = process.argv.includes("--prod");
if (PROD) execFileSync(process.execPath, [NEXT, "build"], { cwd: ROOT, env: { ...process.env, NEXT_DIST_DIR: ".next-e2e", NEXT_TELEMETRY_DISABLED: "1" }, stdio: "inherit" });
const server = spawn(process.execPath, [NEXT, PROD ? "start" : "dev", ...(PROD ? [] : ["--webpack"]), "-p", String(PORT)], {
  cwd: ROOT,
  env: { NEXT_TELEMETRY_DISABLED: "1", ...(PROD ? { NEXT_DIST_DIR: ".next-e2e", NODE_ENV: "production" as const } : {}),  ...process.env, APP_SECRET, PORT: String(PORT), DATABASE_URL: demoDb.url, DB_POOL_MAX: "1", OFMAPI_BASE_URL: ofmapi.base, RESEND_API_KEY: "", AI_PROVIDER: "ollama", OLLAMA_URL: process.env.DEMO_OLLAMA_URL ?? "http://localhost:3302", REPLY_DEBOUNCE_MS: "300", PUBLIC_URL: "https://demo.example.test" },
  stdio: ["ignore", "inherit", "inherit"],
});
for (let i = 0; i < 150; i++) {
  if (await fetch(`http://localhost:${PORT}/api/health`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}

let cookie = "";
const call = async (method: string, p: string, body?: unknown) => {
  const res = await fetch(`http://localhost:${PORT}${p}`, { method, headers: { "Content-Type": "application/json", "X-Requested-With": "fan-desk", ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  return res.json().catch(() => ({}));
};
await call("POST", "/api/auth/signup", { name: "Demo", email: "demo@example.com", password: "demo-password-123", terms: true });
const user = (await (await import("../src/lib/db.ts")).db.one<{ id: number }>("SELECT id FROM users WHERE email = ?", ["demo@example.com"]))!.id;
await accounts.insertConnection(user, { keyEnc: encrypt("ofmapi_demo_key_000000000000"), last4: "0000", teamName: null, teamSlug: null, credits: null, webhookToken: "d".repeat(24), webhookSecretEnc: encrypt("s") });
await accounts.insertAccount("acct_demo1", user, "sara_demo", "Sara", "{}"); // starts as 'running': the first import reads the fake OFMAPI
await call("PUT", "/api/accounts/acct_demo1", {
  name: "Sara", persona: "Friendly, warm, short messages.", menu: [{ item: "Photo set (20 photos)", price: 15, details: "Sent as a PPV message" }, { item: "Custom video", price: 50, details: "3-5 days, Sara confirms" }],
  rules: ["Customs are confirmed by Sara personally before payment."], humanSpendThreshold: 100, ai_enabled: true, send_mode: "draft",
});

console.log(`\nDEMO ready: http://localhost:${PORT}   login: demo@example.com / demo-password-123\n(Ctrl+C to stop)`);
process.on("SIGINT", async () => { server.kill(); ofmapi.stop(); ai.close(); await demoDb.stop(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(0); });
