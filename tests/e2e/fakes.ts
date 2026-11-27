// Fake outside services for the end-to-end tests: the Fans API and Ollama (the AI). No real keys, credits or fans are touched.
import http from "node:http";

export const KEY1 = "ofapi_testkey_user1_aaaaaaaaaaaa";
export const KEY2 = "ofapi_testkey_user2_bbbbbbbbbbbb";

// ------------------------------------------------------------------ fake Fans API
type Sent = { acct: string; chat: string; text: string; idem: string; key: string };
export const sent: Sent[] = [];
export const webhookCalls: any[] = [];
const sentByIdem = new Map<string, any>();
const keyOf = (req: http.IncomingMessage) => (req.headers.authorization ?? "").replace("Bearer ", "");

export const fansApi = http.createServer(async (req, res) => {
  const url = new URL(req.url!, "http://x");
  let raw = "";
  for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : null;
  const key = keyOf(req);
  const reply = (status: number, data: unknown, extra: Record<string, string> = {}) => {
    res.writeHead(status, { "Content-Type": "application/json", "x-ofapi-credits-balance": "42", ...extra });
    res.end(JSON.stringify(data));
  };
  if (![KEY1, KEY2].includes(key)) return reply(401, { message: "Unauthenticated." });

  if (url.pathname === "/api/whoami") return reply(200, { api_key: { name: "k" }, team: { name: key === KEY1 ? "Team One" : "Team Two", slug: key === KEY1 ? "t1" : "t2" } });
  if (url.pathname === "/api/accounts") {
    const mine = key === KEY1 ? [{ id: "acct_aaa111", onlyfans_username: "sara", display_name: "Sara" }]
      : [{ id: "acct_bbb222", onlyfans_username: "bella", display_name: "Bella" }, { id: "acct_aaa111", onlyfans_username: "sara", display_name: "Sara" }];
    return reply(200, { data: mine });
  }
  if (req.method === "POST" && url.pathname === "/api/webhooks") {
    if (key === KEY2) return reply(403, { message: "Your current plan does not allow access to webhooks. Please upgrade your plan to use this feature." });
    webhookCalls.push({ method: "POST", body });
    return reply(200, { data: { id: "wh_1", enabled: false } });
  }
  if (req.method === "PUT" && url.pathname === "/api/webhooks/wh_1") { webhookCalls.push({ method: "PUT", body }); return reply(200, { data: { id: "wh_1", enabled: true } }); }
  if (req.method === "DELETE" && url.pathname === "/api/webhooks/wh_1") { webhookCalls.push({ method: "DELETE" }); return reply(200, { data: {} }); }

  let m = url.pathname.match(/^\/api\/(acct_\w+)\/chats$/);
  if (m && req.method === "GET") {
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 3 * 86400_000).toISOString();
    const all = [
      { unreadMessagesCount: 1, fan: { id: 777, name: "Fresh Fan", username: "fresh" }, lastMessage: { id: 5001, text: "<p>what is the price?</p>", isSentByMe: false, isNew: true, createdAt: now } },
      { unreadMessagesCount: 1, fan: { id: 888, name: "Old Fan", username: "old" }, lastMessage: { id: 5002, text: "<p>hello from days ago</p>", isSentByMe: false, isNew: true, createdAt: old } },
      { unreadMessagesCount: 0, fan: { id: 999111, name: "Answered", username: "ans" }, lastMessage: { id: 5003, text: "<p>we replied</p>", isSentByMe: true, isNew: false, createdAt: now } },
    ];
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const PAGE = 2; // the real API caps a page (10) whatever `limit` asks for; sync must follow next_page
    return reply(200, { data: all.slice(offset, offset + PAGE), _pagination: { next_page: offset + PAGE < all.length ? `${url.origin}${url.pathname}?offset=${offset + PAGE}` : null } });
  }
  // Full message history per chat (both directions), oldest first, used by Sync.
  m = url.pathname.match(/^\/api\/(acct_\w+)\/chats\/(\d+)\/messages$/);
  if (m && req.method === "GET") {
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 3 * 86400_000).toISOString();
    const history: Record<string, unknown[]> = {
      "777": [
        { id: 4998, text: "<p>hey are you around?</p>", isSentByMe: false, createdAt: old },
        { id: 5001, text: "<p>what is the price?</p>", isSentByMe: false, createdAt: now },
      ],
      "888": [{ id: 5002, text: "<p>hello from days ago</p>", isSentByMe: false, createdAt: old }],
      "999111": [
        { id: 4999, text: "<p>hi there</p>", isSentByMe: false, createdAt: old },
        { id: 5003, text: "<p>we replied</p>", isSentByMe: true, createdAt: now },
      ],
    };
    return reply(200, { data: history[m[2]] ?? [], _pagination: { next_page: null } });
  }
  m = url.pathname.match(/^\/api\/(acct_\w+)\/chats\/(\d+)\/messages$/);
  if (m && req.method === "POST") {
    const idem = String(req.headers["idempotency-key"] ?? "");
    if (sentByIdem.has(idem)) return reply(200, sentByIdem.get(idem), { "Idempotent-Replayed": "true" });
    sent.push({ acct: m[1], chat: m[2], text: body.text, idem, key });
    const out = { data: { id: 9000 + sent.length, text: body.text } };
    sentByIdem.set(idem, out);
    return reply(200, out);
  }
  reply(404, { message: "not found" });
});

// ------------------------------------------------------------------ fake Ollama
export const ollamaStats = { calls: 0 };
export const ollama = http.createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  const body = JSON.parse(raw);
  ollamaStats.calls++;
  const user: string = body.messages.at(-1).content;
  const fanLines = [...user.matchAll(/^FAN: (.*)$/gm)].map((m) => m[1]);
  const last = (fanLines.at(-1) ?? "").toLowerCase();
  let d: any = { intent: "casual", needs_human: false, handoff_reason: "", reply: "Hello! How can I help?", summary: "casual chat" };
  if (last.includes("custom")) d = { intent: "buying", needs_human: true, handoff_reason: "custom order", reply: "", summary: "wants a custom" };
  else if (last.includes("spam")) d = { intent: "spam", needs_human: false, handoff_reason: "", reply: "", summary: "spam" };
  else if (last.includes("badprice")) d = { intent: "buying", needs_human: false, handoff_reason: "", reply: "That one is $999 for you.", summary: "asked price" };
  else if (last.includes("price")) d = { intent: "buying", needs_human: false, handoff_reason: "", reply: "The photo set is $15.", summary: "asked price" };
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ message: { content: JSON.stringify(d) }, prompt_eval_count: 1000, eval_count: 100 }));
});
