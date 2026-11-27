import "server-only";
import { config } from "../config.ts";

export type ApiResult = { ok: boolean; status: number; body: any; retryAfterMs: number };

export type SendResult =
  | { kind: "sent"; messageId: string | null }
  | { kind: "retry"; error: string; retryAfterMs: number } // definitely not sent; safe to retry with the same key
  | { kind: "unknown"; error: string } // may have been sent: never resend automatically
  | { kind: "failed"; error: string }; // permanent

export const apiMessage = (r: ApiResult): string => String(r.body?.detail ?? r.body?.title ?? r.body?.message ?? r.body?.error ?? `HTTP ${r.status}`).slice(0, 300);

/** An OFMAPI client bound to one user's key. The base URL is fixed by the server config, never by user input. */
export function createOfmApi(key: string) {
  async function request(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<ApiResult> {
    const res = await fetch(`${config.ofmapiBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...extra,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(method === "GET" ? 60_000 : 30_000), // reads from OnlyFans are sometimes slow; a send must not wait that long
    });
    return {
      ok: res.ok,
      status: res.status,
      body: await res.json().catch(() => null),
      retryAfterMs: Number(res.headers.get("retry-after") ?? 10) * 1000,
    };
  }

  const enc = encodeURIComponent;
  const page = (cursor?: string) => (cursor ? `?cursor=${enc(cursor)}` : "");

  return {
    /** Checks the key and lists the connected accounts in one call: `{ data: [{ id, ofUsername, displayName, status, ... }] }`. */
    listAccounts: () => request("GET", "/accounts"),
    /** One page (10) of the account's conversations, newest first: `{ conversations, cursor, hasMore }`. */
    inbox: (account: string, cursor?: string) => request("GET", `/accounts/${enc(account)}/inbox${page(cursor)}`),
    /** One page (40) of the creator's Vault: `{ media: [{ id, type, duration, canView, hasError, downloadUrls: { thumb, ... } }], cursor, hasMore }`. */
    vaultMedia: (account: string, o: { cursor?: string; folder?: string; type?: string; query?: string } = {}) => {
      const q = [o.cursor && `cursor=${enc(o.cursor)}`, o.folder && `category=${enc(o.folder)}`, o.type && o.type !== "all" && `type=${enc(o.type)}`, o.query && `query=${enc(o.query)}`].filter(Boolean).join("&");
      return request("GET", `/accounts/${enc(account)}/vault/media${q ? `?${q}` : ""}`);
    },
    /** The Vault's folders: `{ categories: [{ id, name, photosCount, videosCount, audiosCount }], cursor, hasMore }`. */
    vaultFolders: (account: string, cursor?: string) => request("GET", `/accounts/${enc(account)}/vault/categories${page(cursor)}`),
    /** Members of one OnlyFans list, `pages` pages of 10 per call (about a second each): `{ users: [{ id, username, subscribedAt, ... }], cursor, hasMore }`. */
    listMembers: (account: string, listId: string, cursor?: string, pages = 5) => request("GET", `/accounts/${enc(account)}/lists/${enc(listId)}/members?pages=${pages}${cursor ? `&cursor=${enc(cursor)}` : ""}`),
    /** Spend per fan (up to a handful of ids): `{ fans: [{ fanId, total, subscriptions, tips, messages, posts, streams }] }`. */
    fansSpend: (account: string, ids: string[]) => request("GET", `/accounts/${enc(account)}/fans/spend?ids=${ids.map(enc).join(",")}`),
    /** Fans whose name or username matches: `{ fans: [{ id, username, subscribedAt, subscriptionExpiresAt, ... }] }`. */
    fansSearch: (account: string, query: string) => request("GET", `/accounts/${enc(account)}/fans?pages=1&query=${enc(query)}`),
    /** The creator's OnlyFans lists: `{ lists: [{ id, name, type, usersCount }], cursor, hasMore }`. */
    lists: (account: string, cursor?: string) => request("GET", `/accounts/${enc(account)}/lists${page(cursor)}`),
    /** One page of a conversation's messages, newest first: `{ messages, cursor, hasMore }`. `userId` is the fan's OnlyFans id. */
    conversation: (account: string, userId: string, cursor?: string) => request("GET", `/accounts/${enc(account)}/conversations/${enc(userId)}${page(cursor)}`),
    /**
     * A media file the API listed for a message. Its link is on the API's own host and needs the key, so only that host is allowed:
     * this never fetches an address chosen by a user. Returns the raw response (to stream on) or null.
     */
    async download(url: string): Promise<Response | null> {
      const base = new URL(config.ofmapiBaseUrl);
      let target: URL;
      try {
        target = new URL(url);
      } catch {
        return null;
      }
      if (target.origin !== base.origin) return null;
      for (let attempt = 0; ; attempt++) {
        try {
          return await fetch(target, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(60_000) });
        } catch (err) {
          if (attempt >= 1) throw err; // a connect timeout or a dropped connection happens now and then: try once more before giving up
          await new Promise((resolve) => setTimeout(resolve, 700));
        }
      }
    },
    /** `{ url, events, accountFilter, description }` -> `{ id, secret }` (the secret is shown only once). */
    createWebhook: (payload: unknown) => request("POST", "/webhooks", payload),
    deleteWebhook: (id: string) => request("DELETE", `/webhooks/${enc(id)}`),

    /**
     * POST /accounts/{account}/conversations/{fan}/messages. The Idempotency-Key is the outbox id and is reused on every retry.
     * shortcut: OFMAPI's answer to a send and whether it honours the key are NOT verified yet (the first real send is a planned,
     * consented test), so anything that is not a clear success or a clear permanent refusal is "unknown": never resent by itself.
     */
    async sendMessage(account: string, userId: string, text: string, idempotencyKey: string): Promise<SendResult> {
      let r: ApiResult;
      try {
        r = await request("POST", `/accounts/${enc(account)}/conversations/${enc(userId)}/messages`, { text }, { "Idempotency-Key": idempotencyKey });
      } catch (err) {
        return { kind: "unknown", error: `network: ${String(err)}` }; // may or may not have reached OnlyFans
      }
      if (r.ok) {
        const id = r.body?.id ?? r.body?.message?.id ?? r.body?.queueId;
        return { kind: "sent", messageId: id != null ? String(id) : null };
      }
      if (r.status === 429) return { kind: "retry", error: "rate limited", retryAfterMs: Math.max(r.retryAfterMs, 30_000) };
      if (r.status === 400 || r.status === 401 || r.status === 403 || r.status === 404 || r.status === 422) return { kind: "failed", error: `HTTP ${r.status} ${apiMessage(r)}` };
      return { kind: "unknown", error: `HTTP ${r.status} ${apiMessage(r)}`.trim() };
    },
  };
}
