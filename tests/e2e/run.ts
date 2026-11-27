// End-to-end checks: the real app (a production build, started with `next start`) against a fake Fans API and a fake Ollama.
// No real credits, keys or fans are touched. Run: npm run test:e2e
import { KEY1, KEY2, ollamaStats, sent, webhookCalls } from "./fakes.ts";
import { BASE, check, Client, decrypt, dumpAll, failures, msgEvt, q, signedWebhook, sleep, startApp, waitFor } from "./harness.ts";

const app = await startApp();

try {
  // ---- basics + security headers
  const health = await fetch(`${BASE}/api/health`);
  check("health endpoint", health.status === 200);
  check("the cron endpoint refuses a call without its secret", (await fetch(`${BASE}/api/cron/tick`)).status === 401);
  check("the cron endpoint refuses a wrong secret", (await fetch(`${BASE}/api/cron/tick`, { headers: { Authorization: "Bearer nope" } })).status === 401);
  check("the cron endpoint runs a tick with the right secret", (await fetch(`${BASE}/api/cron/tick`, { headers: { Authorization: "Bearer e2e-cron-secret" } })).status === 200);
  const home = await fetch(`${BASE}/`, { redirect: "manual" });
  check("a logged-out visitor is sent to /login", home.status === 307 && new URL(home.headers.get("location") ?? "", BASE).pathname === "/login", `${home.status} ${home.headers.get("location")}`);
  const page = await fetch(`${BASE}/login`);
  const csp = page.headers.get("content-security-policy") ?? "";
  check("pages are served with a strict CSP using a fresh nonce", page.status === 200 && csp.includes("script-src 'self' 'nonce-") && csp.includes("default-src 'none'") && !csp.includes("unsafe-inline"), csp);
  const page2 = await fetch(`${BASE}/login`);
  check("the CSP nonce differs on every request", (page2.headers.get("content-security-policy") ?? "") !== csp);
  check("fixed security headers are present", page.headers.get("x-content-type-options") === "nosniff" && page.headers.get("x-frame-options") === "DENY");
  const csrf = await new Client().call("POST", "/api/auth/login", { email: "a@b.co", password: "x" }, {});
  check("state-changing request without the custom header is blocked (CSRF)", csrf.status === 403, String(csrf.status));
  const xsite = await new Client().call("POST", "/api/auth/login", { email: "a@b.co", password: "x" }, { "X-Requested-With": "fan-desk", Origin: "https://evil.example" });
  check("cross-origin request is blocked", xsite.status === 403, String(xsite.status));

  // ---- signup / login
  const u1 = new Client(), u2 = new Client();
  check("weak password rejected", (await u1.call("POST", "/api/auth/signup", { email: "one@example.com", password: "short", terms: true })).status === 400);
  const bad = await new Client().call("POST", "/api/auth/signup", { email: "not-an-email", password: "password123" });
  check("signup reports every problem at once, per field (email, password, consent)", bad.status === 400 && !!bad.json.fields?.email && /too common/.test(bad.json.fields?.password) && !!bad.json.fields?.terms, bad.text);
  check("consent is required even with a good email and password", (await new Client().call("POST", "/api/auth/signup", { email: "noterms@example.com", password: "correct-horse-battery" })).json.fields?.terms !== undefined);
  check("signup works", (await u1.call("POST", "/api/auth/signup", { email: "one@example.com", password: "correct-horse-battery", terms: true })).status === 200 && u1.cookie.startsWith("sid="));
  check("duplicate email rejected", (await new Client().call("POST", "/api/auth/signup", { email: "ONE@example.com", password: "correct-horse-battery", terms: true })).status === 409)
  check("signup stored when the user accepted the terms", (await q("SELECT terms_accepted_at FROM users WHERE email='one@example.com'"))[0]?.terms_accepted_at > 0);
  check("wrong password rejected", (await new Client().call("POST", "/api/auth/login", { email: "one@example.com", password: "wrong-password-1" })).status === 401);
  check("no session → 401", (await new Client().call("GET", "/api/me")).status === 401);
  const sc = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "fan-desk" }, body: JSON.stringify({ email: "one@example.com", password: "correct-horse-battery" }) });
  const cookieHdr = sc.headers.get("set-cookie") ?? "";
  check("session cookie is HttpOnly + SameSite", /HttpOnly/i.test(cookieHdr) && /SameSite=Lax/i.test(cookieHdr), cookieHdr);

  // ---- connect key
  const dash = await fetch(`${BASE}/inbox`, { headers: { Cookie: u1.cookie } });
  check("a logged-in page is rendered on the server with the user already in it", dash.status === 200 && (await dash.text()).includes("one@example.com"));
  const stale = await fetch(`${BASE}/inbox`, { headers: { Cookie: "sid=" + "a".repeat(43) }, redirect: "manual" });
  check("a dead session cookie is sent to /login?expired=1 (and /login then shows, no redirect loop)", stale.status === 307 && (stale.headers.get("location") ?? "").includes("/login?expired=1") && (await fetch(`${BASE}/login?expired=1`, { headers: { Cookie: "sid=" + "a".repeat(43) }, redirect: "manual" })).status === 200);
  check("malformed key rejected", (await u1.call("PUT", "/api/connection", { apiKey: "short" })).status === 400);
  check("key Fans API rejects → 400", (await u1.call("PUT", "/api/connection", { apiKey: "ofapi_wrongkey_cccccccccccc" })).status === 400);
  const saved = await u1.call("PUT", "/api/connection", { apiKey: KEY1 });
  check("valid key accepted, 1 account imported", saved.status === 200 && saved.json?.imported?.imported === 1, saved.text);
  const me = await u1.call("GET", "/api/me");
  check("/api/me shows last4 + credits, never the key", me.json?.connection?.keyLast4 === KEY1.slice(-4) && me.json?.connection?.creditsBalance === 42 && !me.text.includes(KEY1), me.text.slice(0, 200));
  check("API key is not stored in plaintext in any table", !(await dumpAll()).includes(KEY1));
  const acctState = me.json.accounts[0];
  check("new accounts start with AI OFF and draft mode", acctState.aiEnabled === false && acctState.sendMode === "draft");

  const token = new URL(me.json.connection.webhook.url).pathname.split("/").pop()!;
  const conn = (await q("SELECT webhook_secret_enc FROM connections WHERE user_id = (SELECT id FROM users WHERE email = 'one@example.com')"))[0];
  const secret = decrypt(conn.webhook_secret_enc);

  // ---- webhook auth
  const A1 = "acct_aaa111";
  check("unknown webhook token → 404", (await signedWebhook("x".repeat(32), secret, msgEvt(A1, 111, "hi"))).status === 404);
  const badSig = await fetch(`${BASE}/api/webhooks/fansapi/${token}`, { method: "POST", headers: { Signature: "deadbeef" }, body: "{}" });
  check("bad signature → 401", badSig.status === 401);

  // ---- AI off by default: message stored, AI never called
  check("webhook accepted", (await signedWebhook(token, secret, msgEvt(A1, 100, "hello there"), "evt-0")).status === 200);
  await sleep(2500);
  check("AI off: fan stored but AI not called and nothing drafted", (await q("SELECT * FROM fans WHERE fan_id='100'")).length === 1 && ollamaStats.calls === 0 && (await q("SELECT * FROM outbox")).length === 0, `calls=${ollamaStats.calls}`);

  // ---- settings validation + enable AI (draft)
  const goodSettings = { name: "Sara", assistantIntro: "Hi! I'm Sara's assistant. Sara reads everything personally.", persona: "Friendly", menu: [{ item: "Photo set", price: 15 }], rules: [], humanSpendThreshold: 100, ai_enabled: true, send_mode: "draft" };
  const noAssistant = await u1.call("PUT", `/api/accounts/${A1}`, { ...goodSettings, assistantIntro: "Hi it's Sara, how are you doing today?" });
  check("intro that does not say 'assistant' is rejected", noAssistant.status === 400 && /assistant/i.test(noAssistant.text), noAssistant.text);
  check("settings saved + AI enabled", (await u1.call("PUT", `/api/accounts/${A1}`, goodSettings)).status === 200);

  // ---- draft mode
  await signedWebhook(token, secret, msgEvt(A1, 111, "what is the price?"), "evt-1");
  check("draft created with disclosure intro + menu price", await waitFor(async () => (await q("SELECT * FROM outbox WHERE fan_id='111' AND status='draft'")).length === 1));
  const draft = (await q("SELECT * FROM outbox WHERE fan_id='111'"))[0];
  check("draft starts with the assistant intro and quotes $15", draft?.text.startsWith("Hi! I'm Sara's assistant.") && draft.text.includes("$15"), draft?.text);
  check("draft mode: nothing sent yet", sent.length === 0);
  check("fan intent + score updated by AI", (await q("SELECT intent, tier FROM fans WHERE fan_id='111'"))[0]?.intent === "buying");
  check("approve queues and delivers via Fans API with Idempotency-Key", (await u1.call("POST", `/api/outbox/${draft.id}/approve`, {})).status === 200 && (await waitFor(async () => sent.length === 1)));
  check("sent with the user's own key, right chat and idempotency key = outbox id", sent[0]?.key === KEY1 && sent[0].chat === "111" && sent[0].acct === A1 && sent[0].idem === draft.id);
  check("outbox marked sent and credits tracked", (await waitFor(async () => (await q("SELECT status FROM outbox WHERE id=?", draft.id))[0]?.status === "sent")) && (await q("SELECT credits_balance FROM connections"))[0].credits_balance === 42);

  // ---- duplicate delivery
  await signedWebhook(token, secret, msgEvt(A1, 111, "what is the price?"), "evt-1");
  check("duplicate webhook delivery is ignored", (await q("SELECT COUNT(*) AS n FROM messages WHERE fan_id='111' AND direction='in'"))[0].n === 1);

  // ---- auto mode
  check("switch to auto", (await u1.call("PUT", `/api/accounts/${A1}`, { ...goodSettings, send_mode: "auto" })).status === 200);
  await signedWebhook(token, secret, msgEvt(A1, 222, "price?"), "evt-2");
  check("auto mode sends by itself, first message has the intro", await waitFor(async () => sent.some((s) => s.chat === "222")));
  check("intro text present in the sent message", sent.find((s) => s.chat === "222")!.text.startsWith("Hi! I'm Sara's assistant."));
  await signedWebhook(token, secret, msgEvt(A1, 222, "price again?"), "evt-3");
  check("second message to the same fan has no intro", await waitFor(async () => sent.filter((s) => s.chat === "222").length === 2) && !sent.filter((s) => s.chat === "222")[1].text.includes("assistant."));

  // ---- guards
  await signedWebhook(token, secret, msgEvt(A1, 333, "badprice"), "evt-4");
  check("price not on menu → held as draft even in auto mode", await waitFor(async () => (await q("SELECT * FROM outbox WHERE fan_id='333' AND status='draft'")).length === 1) && !sent.some((s) => s.chat === "333"));
  await signedWebhook(token, secret, msgEvt(A1, 444, "I want a custom video"), "evt-5");
  check("custom request → handed to human, nothing sent", await waitFor(async () => (await q("SELECT mode FROM fans WHERE fan_id='444'"))[0]?.mode === "human") && !sent.some((s) => s.chat === "444"));
  await signedWebhook(token, secret, msgEvt(A1, 555, "this is spam", 0), "evt-6");
  await sleep(1800);
  check("spam gets no reply", !sent.some((s) => s.chat === "555") && (await q("SELECT * FROM outbox WHERE fan_id='555'")).length === 0);
  const before = ollamaStats.calls;
  await signedWebhook(token, secret, msgEvt(A1, 666, "hi", 150), "evt-7");
  await sleep(1800);
  check("existing big spender goes straight to a human, no reply", (await q("SELECT mode FROM fans WHERE fan_id='666'"))[0]?.mode === "human" && !sent.some((s) => s.chat === "666"));

  // ---- payment → human
  await signedWebhook(token, secret, { event: "tips.received", account_id: A1, payload: { amountGross: 20, fan: { id: 222, username: "fan222", name: "Fan 222" }, fanData: { spending: { total: 20 } } } }, "evt-8");
  check("tip moves the fan to human mode", await waitFor(async () => (await q("SELECT mode FROM fans WHERE fan_id='222'"))[0]?.mode === "human"));
  const sentTo222 = sent.filter((s) => s.chat === "222").length;
  await signedWebhook(token, secret, msgEvt(A1, 222, "thank you! price?"), "evt-9");
  await sleep(2000);
  check("after payment the AI no longer replies to that fan", sent.filter((s) => s.chat === "222").length === sentTo222);

  // ---- someone replies directly in OnlyFans
  await signedWebhook(token, secret, msgEvt(A1, 777777, "hello"), "evt-10");
  await sleep(600);
  await signedWebhook(token, secret, { event: "messages.sent", account_id: A1, payload: { id: 7001, text: "<p>hey it's me</p>", toUser: { id: 777777 } } }, "evt-11");
  check("a reply typed in OnlyFans pauses the AI for that fan", await waitFor(async () => (await q("SELECT mode FROM fans WHERE fan_id='777777'"))[0]?.mode === "human"));

  // ---- sync now
  const s1 = await u1.call("POST", `/api/accounts/${A1}/sync`);
  check(
    "sync pulls every chat's full history (both directions)",
    s1.status === 200 && s1.json.chatsChecked === 3 && s1.json.fansFound === 3 && s1.json.messagesImported === 5,
    s1.text,
  );
  check("fresh unread chat from sync gets an AI reply", await waitFor(async () => sent.some((s) => s.chat === "777")));
  await sleep(1500);
  check("older history for that same fan was stored too, not just the last message", (await q("SELECT * FROM messages WHERE fan_id='777' AND direction='in'")).length === 2);
  check("old message from sync is stored but the AI does not reply to it", (await q("SELECT * FROM messages WHERE fan_id='888'")).length === 1 && !sent.some((s) => s.chat === "888"));
  check("a message the creator already sent in OnlyFans is stored as an outbound message, not a fan message", (await q("SELECT direction FROM messages WHERE fan_id='999111' AND of_id='5003'"))[0]?.direction === "out");
  check("sync is rate limited (credits protection)", (await u1.call("POST", `/api/accounts/${A1}/sync`)).status === 429);

  // ---- register webhook in Fans API
  const rw = await u1.call("POST", "/api/connection/webhook");
  const created = webhookCalls.find((c) => c.method === "POST")?.body;
  check("webhook registered at Fans API with our URL, secret, events and account scope", rw.status === 200 && created?.endpoint_url === `https://desk.example.test/api/webhooks/fansapi/${token}` && created.signing_secret === secret && created.events.includes("messages.received") && created.account_scope === "inclusive" && created.account_ids[0] === A1, JSON.stringify(created));
  check("webhook enabled after creation", webhookCalls.some((c) => c.method === "PUT" && c.body.enabled === true) && (await u1.call("GET", "/api/me")).json.connection.webhook.registered === true);

  // ---- usage
  const usage = await u1.call("GET", `/api/accounts/${A1}/usage`);
  check("AI usage is logged", usage.status === 200 && usage.json.byModel[0]?.calls > 3, usage.text);

  // ---- tenant isolation
  check("user 2 signs up and connects", (await u2.call("POST", "/api/auth/signup", { email: "two@example.com", password: "another-long-passphrase", terms: true })).status === 200);
  const s2 = await u2.call("PUT", "/api/connection", { apiKey: KEY2 });
  check("shared account is not taken over (1 imported, 1 conflict)", s2.json?.imported?.imported === 1 && s2.json.imported.conflicts.length === 1, s2.text);
  check("user 2 cannot read user 1's account", (await u2.call("GET", `/api/accounts/${A1}/fans`)).status === 404);
  check("user 2 cannot read user 1's fan", (await u2.call("GET", `/api/accounts/${A1}/fans/111`)).status === 404);
  check("user 2 cannot change user 1's settings", (await u2.call("PUT", `/api/accounts/${A1}`, goodSettings)).status === 404);
  check("user 2 cannot sync user 1's account", (await u2.call("POST", `/api/accounts/${A1}/sync`)).status === 404);
  const d333 = (await q("SELECT id FROM outbox WHERE fan_id='333'"))[0];
  check("user 2 cannot approve user 1's draft", (await u2.call("POST", `/api/outbox/${d333.id}/approve`, {})).status === 404 && (await q("SELECT status FROM outbox WHERE id=?", d333.id))[0].status === "draft");
  const me2 = (await u2.call("GET", "/api/me")).json;
  const token2 = new URL(me2.connection.webhook.url).pathname.split("/").pop()!;
  const secret2 = decrypt((await q("SELECT webhook_secret_enc FROM connections WHERE user_id = (SELECT id FROM users WHERE email = 'two@example.com')"))[0].webhook_secret_enc);
  await signedWebhook(token2, secret2, msgEvt(A1, 31337, "injected into someone else's account"), "evt-x1");
  await signedWebhook(token, secret, msgEvt("acct_bbb222", 31338, "wrong tenant"), "evt-x2");
  await sleep(400);
  check("webhook for an account the token owner does not own is ignored (both ways)", (await q("SELECT * FROM fans WHERE fan_id IN ('31337','31338')")).length === 0);
  const rw2 = await u2.call("POST", "/api/connection/webhook");
  check("Fans API refusal (plan without webhooks) is shown to the user", rw2.status === 400 && /plan does not allow/i.test(rw2.text), rw2.text);

  // ---- disconnect + logout
  const dc = await u1.call("DELETE", "/api/connection");
  check("disconnect removes the key, deletes the webhook, turns AI off", dc.status === 200 && dc.json.me.connection === null && webhookCalls.some((c) => c.method === "DELETE") && dc.json.me.accounts[0].aiEnabled === false, dc.text.slice(0, 200));
  await u1.call("POST", "/api/auth/logout");
  check("logout ends the session", (await u1.call("GET", "/api/me")).status === 401);
} catch (err) {
  console.error("TEST CRASHED:", err);
  check("the test run did not crash", false, String(err));
} finally {
  await app.stop();
}
if (app.log().includes("Error") && !app.log().includes("ExperimentalWarning")) console.log("\nserver log:\n" + app.log());
console.log(failures() ? `\n${failures()} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures() ? 1 : 0);
