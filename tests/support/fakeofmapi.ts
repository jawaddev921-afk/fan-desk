// A small fake of the OFMAPI endpoints the sync reads: GET /v1/accounts/:id/inbox and GET /v1/accounts/:id/conversations/:userId (cursor = offset).
import http from "node:http";

const DAY = 24 * 60 * 60 * 1000;

/** `ageDays` per conversation, newest first. Every conversation has two messages: the latest (that age) and one an hour before. */
export async function startFakeOfmapi(ageDays: number[], pageSize = 3) {
  const stats = { inbox: 0, conversation: 0, failInboxOnce: false, rateLimitConversation: false, downloads: 0, inFlight: 0, maxInFlight: 0, dropNextDownloads: 0, downloadDelayMs: 0, messagePageSize: 100, memberCalls: 0, failVsvgOnce: false, vaultCalls: [] as string[] };
  const spend = new Map<number, number>(); // what the provider says each fan spent
  const subscribed = new Map<number, string>(); // when each fan subscribed (ISO)
  const hidden = new Set<number>(); // messages the sender removed
  const valid = new Set<string>(); // links that still work; every conversation read hands out a fresh one
  let counter = 0;
  const extra = new Map<number, { id: number; text: string; photo: boolean }[]>(); // messages that arrived at the provider after the import (newest first)
  const now = Date.now();
  const conv = (i: number) => {
    const userId = 1000 + i;
    const at = now - ageDays[i] * DAY;
    return { userId, lastMessageId: userId * 10 + 1, lastMessageTime: new Date(at).toISOString(), at };
  };
  const photo = (req: http.IncomingMessage, userId: string) => {
    const token = `t${++counter}`;
    valid.add(token);
    return { id: `${userId}-photo`, type: "photo", canView: true, width: 800, height: 600, downloadUrls: { full: `http://${req.headers.host}/v1/dl/${token}` } };
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url!, "http://x");
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    let m = url.pathname.match(/^\/v1\/accounts\/[^/]+\/inbox$/);
    if (m) {
      stats.inbox++;
      if (stats.failInboxOnce) {
        stats.failInboxOnce = false;
        return json(500, { detail: "boom" });
      }
      const offset = Number(url.searchParams.get("cursor") ?? 0);
      // newest first: a conversation that got a new message after the import goes to the top with that message as its latest
      const all = ageDays
        .map((_, i) => {
          const c = conv(i);
          const e = extra.get(c.userId)?.[0];
          return { id: String(c.userId), userId: c.userId, username: `fan${c.userId}`, name: `Fan ${c.userId}`, avatar: `https://public.onlyfans.com/files/${c.userId}/avatar.jpg`, lastMessageId: e ? e.id : c.lastMessageId, lastMessageTime: e ? new Date().toISOString() : c.lastMessageTime, lastMessageIsFromMe: false, unreadCount: 1, isRead: false };
        })
        .sort((a, b) => Date.parse(b.lastMessageTime) - Date.parse(a.lastMessageTime));
      return json(200, { conversations: all.slice(offset, offset + pageSize), cursor: String(offset + pageSize), hasMore: offset + pageSize < all.length });
    }
    // Lists, members, spend and fan search for the Creator rules.
    m = url.pathname.match(/^\/v1\/accounts\/[^/]+\/lists$/);
    if (m) return json(200, { lists: [{ id: "77", name: "Old fans", type: "custom", usersCount: 25 }], cursor: null, hasMore: false });
    m = url.pathname.match(/^\/v1\/accounts\/[^/]+\/lists\/(\w+)\/members$/);
    if (m) {
      if (m[1] !== "77") return json(404, { detail: "List not found" });
      const from = Number(url.searchParams.get("cursor") ?? 0);
      const pages = Number(url.searchParams.get("pages") ?? 1);
      const users = Array.from({ length: Math.max(0, Math.min(25 - from, pages * 10)) }, (_, i) => ({ id: 3000 + from + i, username: `fan${3000 + from + i}`, subscribedAt: new Date(Date.now() - 86400000 * 30).toISOString() }));
      stats.memberCalls++;
      return json(200, { listId: m[1], users, cursor: String(from + users.length), hasMore: from + users.length < 25 });
    }
    m = url.pathname.match(/^\/v1\/accounts\/[^/]+\/fans\/spend$/);
    if (m) return json(200, { fans: (url.searchParams.get("ids") ?? "").split(",").filter(Boolean).map((id) => ({ fanId: Number(id), username: `fan${id}`, available: true, total: spend.get(Number(id)) ?? 0, subscriptions: 0, tips: 0, messages: 0, posts: 0, streams: 0 })) });
    m = url.pathname.match(/^\/v1\/accounts\/[^/]+\/fans$/);
    if (m) {
      const q = url.searchParams.get("query") ?? "";
      const id = Number(q.replace("fan", ""));
      return json(200, { fans: subscribed.has(id) ? [{ id, username: q, subscribedAt: subscribed.get(id), subscriptionExpiresAt: null }] : [], cursor: null, hasMore: false });
    }
    // The creator's Vault (folders and media) for the dashboard demo: a coloured square per item.
    m = url.pathname.match(/^\/v1\/accounts\/[^/]+\/vault\/categories$/);
    if (m) return json(200, { categories: [{ id: "11", name: "Beach", hasMedia: true, photosCount: 6, videosCount: 2, gifsCount: 0, audiosCount: 0 }, { id: "12", name: "Shower &amp; bath", hasMedia: true, photosCount: 4, videosCount: 1, gifsCount: 0, audiosCount: 0 }], cursor: null, hasMore: false });
    m = url.pathname.match(/^\/v1\/accounts\/[^/]+\/vault\/media$/);
    if (m) {
      stats.vaultCalls.push(url.search);
      const folder = url.searchParams.get("category");
      const items = Array.from({ length: folder ? 6 : 12 }, (_, i) => ({ id: String(500 + i + (folder === "12" ? 40 : 0)), type: i % 4 === 3 ? "video" : "photo", createdAt: new Date(Date.now() - (i < 5 ? 0 : 86400000 * 3)).toISOString(), duration: i % 4 === 3 ? 95 : null, hasError: false, isReady: true, canView: true, downloadUrls: { thumb: `http://${req.headers.host}/v1/vsvg/${500 + i + (folder === "12" ? 40 : 0)}` } }));
      return json(200, { media: items, cursor: null, hasMore: false });
    }
    m = url.pathname.match(/^\/v1\/vsvg\/(\d+)$/);
    if (m) {
      if (stats.failVsvgOnce) { stats.failVsvgOnce = false; return json(410, { detail: "link expired" }); }
      res.writeHead(200, { "Content-Type": "image/svg+xml" });
      return res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="hsl(${(Number(m[1]) * 47) % 360} 55% 45%)"/></svg>`);
    }
    m = url.pathname.match(/^\/v1\/dl\/(\w+)$/);
    if (m) {
      stats.downloads++;
      if (stats.dropNextDownloads > 0) {
        stats.dropNextDownloads--;
        return req.socket.destroy(); // a dropped connection
      }
      if (!valid.has(m[1])) return json(410, { detail: "OF CDN returned status 403. Refresh the conversation to get fresh URLs." });
      stats.maxInFlight = Math.max(stats.maxInFlight, ++stats.inFlight);
      return setTimeout(() => {
        stats.inFlight--;
        res.writeHead(200, { "Content-Type": "image/jpeg" });
        res.end(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
      }, stats.downloadDelayMs);
    }
    m = url.pathname.match(/^\/v1\/accounts\/[^/]+\/conversations\/(\d+)$/);
    if (m) {
      stats.conversation++;
      if (stats.rateLimitConversation) return json(429, { detail: "slow down" });
      const c = conv(Number(m[1]) - 1000);
      const all = [
          ...(extra.get(Number(m[1])) ?? []).map((e) => ({ id: e.id, text: `<p>${e.text}</p>`, createdAt: new Date().toISOString(), isFromMe: false, price: 0, media: e.photo ? [photo(req, m[1])] : [] })),
          { id: c.lastMessageId, text: "<p>latest</p>", createdAt: new Date(c.at).toISOString(), isFromMe: false, price: 0, media: [photo(req, m[1]), { id: `${m[1]}-locked`, type: "video", canView: false, downloadUrls: {} }] },
          { id: c.lastMessageId - 1, text: "<p>earlier</p>", createdAt: new Date(c.at - 3600_000).toISOString(), isFromMe: true, price: 0, media: [] },
        ].filter((x) => !hidden.has(x.id));
      const offset = Number(url.searchParams.get("cursor") ?? 0);
      const size = stats.messagePageSize;
      return json(200, { conversationId: m[1], messages: all.slice(offset, offset + size), cursor: String(offset + size), hasMore: offset + size < all.length });
    }
    json(404, { detail: "Not Found" });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as import("node:net").AddressInfo).port;
  return { base: `http://127.0.0.1:${port}/v1`, stats, setSpend: (id: number, n: number) => spend.set(id, n), setSubscribed: (id: number, iso: string) => subscribed.set(id, iso), expireLinks: () => valid.clear(),
    /** The sender removes this message: the provider stops listing it. */
    removeMessage: (messageId: number) => hidden.add(messageId),
    /** A new message from this fan reaches the provider (after the import). */
    addLatest: (userId: number, text: string, opts: { photo?: boolean } = {}) => {
      const id = 900000 + userId + (extra.get(userId)?.length ?? 0);
      extra.set(userId, [{ id, text, photo: !!opts.photo }, ...(extra.get(userId) ?? [])]);
      return id; // the id of the new message
    }, stop: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
