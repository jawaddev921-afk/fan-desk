// Inbox logic: fans and messages (live and from sync), scoring, and the events OFMAPI pushes to the webhook.
import "server-only";
import { bus } from "../../lib/events.ts";
import { singleton } from "../../lib/singleton.ts";
import { HttpError } from "../../lib/http.ts";
import { apiFor } from "../accounts/service.ts";
import { apiMessage } from "../../lib/integrations/ofmapi.ts";
import { claimPolls, claimRunningSyncs, getAccount, recordSyncError, requestPoll, saveSyncProgress, setAccountNote, startAccountSync, type Account } from "../accounts/queries.ts";
import { rateLimit } from "../auth/service.ts";
import { parseSettings } from "../accounts/schema.ts";
import { addMessage, deleteAccountFans, deleteOldEvents, deleteOldMessages, getFan, clearMediaPending, getStoredMedia, hasCompleteMessage, messagesWithMedia, markEventSeen, markPaid, saveScore, setFanMode, setMessageMedia, upsertFan, type Fan, type StoredMedia } from "./queries.ts";

// ---- ingest: a fan's message and payments
export function htmlToText(html: string | null | undefined): string {
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export const isFanId = (v: unknown): v is string | number => (typeof v === "number" || typeof v === "string") && /^\d{1,20}$/.test(String(v));

/**
 * Store a message from a fan. Returns false if it was already stored.
 * triggerReply = false stores the message without waking the AI (used for old messages found by Sync).
 */
async function ingestFanMessage(
  account: Account,
  fan: { id: string; username?: string | null; name?: string | null },
  totalSpend: number | null,
  text: string,
  opts: { ofId?: string | null; createdAt?: number; triggerReply?: boolean; mediaPending?: boolean },
): Promise<boolean> {
  const f = await upsertFan(account.account_id, fan.id, { username: fan.username, name: fan.name, totalSpend });
  if (!(await addMessage(account.account_id, fan.id, "in", "fan", text, { ofId: opts.ofId, createdAt: opts.createdAt, mediaPending: opts.mediaPending }))) return false;

  const threshold = parseSettings(account.settings).humanSpendThreshold;
  if (f.mode === "assistant" && threshold != null && f.total_spend >= threshold) {
    await setFanMode(account.account_id, fan.id, "human", `existing spender ($${f.total_spend})`);
  }
  await rescore(account.account_id, fan.id);
  if (opts.triggerReply !== false) await bus.emit("fan:message", account.account_id, fan.id, {});
  return true;
}

/**
 * Store one message found in a chat's full history, either direction, without waking the AI or
 * changing fan mode. Used by a full sync to rebuild what was said. Live fan messages go through
 * ingestFanMessage; live creator replies sent directly in OnlyFans go through recordHumanReply.
 * Returns false if this OnlyFans message id was already stored (safe to call again on every sync).
 */
async function importHistoryMessage(
  account: Account,
  fan: { id: string; username?: string | null; name?: string | null },
  direction: "in" | "out",
  text: string,
  opts: { ofId?: string | null; createdAt?: number; media?: StoredMedia[] },
): Promise<boolean> {
  await upsertFan(account.account_id, fan.id, { username: fan.username, name: fan.name });
  return addMessage(account.account_id, fan.id, direction, direction === "in" ? "fan" : "human", text, opts);
}

/** A tip or PPV purchase: the fan is paying, so a human takes over. */
async function recordPayment(account: Account, fanId: string, kind: "tip" | "PPV purchase", amount: number): Promise<void> {
  await markPaid(account.account_id, fanId);
  await addMessage(account.account_id, fanId, "in", "system", `[${kind} $${amount}]`);
  await setFanMode(account.account_id, fanId, "human", `${kind} $${amount}`);
  await rescore(account.account_id, fanId);
}


/** A person (not us) replied in OnlyFans: store it and pause the AI for this fan. */
export async function recordHumanReply(accountId: string, fanId: string, msgId: string | null, text: string): Promise<void> {
  await addMessage(accountId, fanId, "out", "human", text, { ofId: msgId });
  await setFanMode(accountId, fanId, "human", "creator/team replied in OnlyFans");
}

// ---- scoring: how valuable a fan is
const INTENT_POINTS: Record<string, number> = { buying: 30, curious: 15, casual: 5, spam: 0, unknown: 5 };
const WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * 0-100: up to 50 for lifetime spend (log scale, $500+ = full), up to 30 for the latest
 * message intent, 20 if the fan paid in the last 7 days. Spam is always 0.
 */
export function scoreOf(fan: Pick<Fan, "total_spend" | "intent" | "last_paid_at">, now: number): { score: number; tier: "hot" | "warm" | "cold" } {
  const spend = 50 * Math.min(1, Math.log10(1 + fan.total_spend) / Math.log10(501));
  const intent = INTENT_POINTS[fan.intent] ?? 5;
  const recent = fan.last_paid_at && now - fan.last_paid_at < WEEK ? 20 : 0;
  const score = fan.intent === "spam" ? 0 : Math.round(spend + intent + recent);
  return { score, tier: score >= 60 ? "hot" : score >= 30 ? "warm" : "cold" };
}

export async function rescore(accountId: string, fanId: string, now = Date.now()): Promise<void> {
  const fan = await getFan(accountId, fanId);
  if (!fan) return;
  const { score, tier } = scoreOf(fan, now);
  await saveScore(accountId, fanId, score, tier);
}

// ---- sync: the first import runs in the background
// A new account starts an import of the last SYNC_WINDOW_DAYS days (accounts/queries.ts marks it 'running'). The worker (a loop locally,
// the cron on Vercel) calls runSyncSteps: each step reads inbox pages for up to STEP_BUDGET_MS and saves where it is (cursor and counters),
// so the import can stop and continue and no request has to wait for it. Inbox pages come newest first; the import ends after two pages
// with nothing inside the window. Per conversation it reads up to MESSAGE_PAGES_PER_CHAT pages (about 10 messages each, newest first),
// and skips a conversation whose latest message we already store. One slow or failed call skips that conversation, never the import.
export const SYNC_WINDOW_DAYS = 90;
const WINDOW_MS = SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const STEP_BUDGET_MS = 120_000;
const LEASE_MS = STEP_BUDGET_MS + 120_000; // a step holds the import this long; it ends well before
const SYNC_COOLDOWN_MS = 20_000;
const FRESH_MS = 6 * 60 * 60 * 1000; // only a fresh, newly-seen last message wakes the AI
const MAX_CHATS = 3000;
const MESSAGE_PAGES_PER_CHAT = 3;
const RETRY_MS = 60_000;
const GIVE_UP_AFTER_MS = 6 * 60 * 60 * 1000;

function fanOf(chat: any): { id: string; username?: string | null; name?: string | null } | null {
  if (!isFanId(chat?.userId)) return null;
  return { id: String(chat.userId), username: chat.username ?? null, name: chat.name ? htmlToText(chat.name) : null }; // the API sends names HTML-escaped ("&amp;")
}

/** The photos, videos... of a message from the API. Only media the account can view gets a link; locked (paid) media is just labelled. */
function mediaOf(m: any): StoredMedia[] {
  return (Array.isArray(m?.media) ? m.media : []).map((x: any) => ({
    id: String(x.id),
    type: String(x.type ?? "media"),
    locked: !x.canView,
    price: Number(m.price) || 0,
    width: Number(x.width) > 0 ? Number(x.width) : null,
    height: Number(x.height) > 0 ? Number(x.height) : null,
    duration: Number(x.duration) > 0 ? Number(x.duration) : null,
    url: x.canView && typeof (x.downloadUrls?.full ?? x.downloadUrl) === "string" ? String(x.downloadUrls?.full ?? x.downloadUrl) : null,
  }));
}

function textOf(m: any): string {
  const t = htmlToText(m.text) || (m.mediaCount ? `[sent ${m.mediaCount} media]` : "[empty message]");
  return m.isTip ? `[tip] ${t}` : t;
}

/** "Sync now": run the import again from the newest chat (the worker does the work; this returns at once). */
export async function requestSync(account: Account): Promise<void> {
  await rateLimit(`sync:${account.account_id}`, 1, SYNC_COOLDOWN_MS, `Please wait ${SYNC_COOLDOWN_MS / 1000}s before syncing again.`);
  await startAccountSync(account.account_id);
}

/** One round for the worker: continue every running import that nobody else is working on. */
export async function runSyncSteps(): Promise<void> {
  for (const account of await claimRunningSyncs(LEASE_MS)) {
    try {
      await syncStep(account);
    } catch (err) {
      const giveUp = Date.now() - (account.sync_started_at ?? Date.now()) > GIVE_UP_AFTER_MS;
      await recordSyncError(account.account_id, err instanceof Error ? err.message : String(err), giveUp ? null : RETRY_MS);
    }
  }
}

async function syncStep(account: Account): Promise<void> {
  const api = await apiFor(account.user_id);
  const cutoff = Date.now() - WINDOW_MS;
  const startedAt = Date.now();
  let cursor = account.sync_cursor;
  let chats = account.sync_chats;
  let messages = account.sync_messages;
  let oldPages = account.sync_old_pages;

  while (Date.now() - startedAt < STEP_BUDGET_MS) {
    const r = await api.inbox(account.account_id, cursor ?? undefined);
    if (!r.ok) throw new HttpError(502, `OFMAPI error: ${apiMessage(r)}`);
    const page: any[] = Array.isArray(r.body?.conversations) ? r.body.conversations : [];
    let inWindow = 0;
    for (const chat of page) {
      const fan = fanOf(chat);
      if (!fan || !(Date.parse(chat.lastMessageTime ?? "") >= cutoff)) continue; // older than the window
      inWindow++;
      chats++;
      messages += await readConversation(api, account, fan, chat, cutoff);
    }
    oldPages = inWindow === 0 ? oldPages + 1 : 0;
    cursor = r.body?.cursor != null ? String(r.body.cursor) : null;
    const finished = !page.length || !r.body?.hasMore || cursor == null || oldPages >= 2 || chats >= MAX_CHATS;
    await saveSyncProgress(account.account_id, { cursor, chats, messages, oldPages, status: finished ? "done" : "running" });
    if (finished) return;
  }
}

/** Stores one conversation's latest messages (both directions). Returns how many were new. */
async function readConversation(api: Awaited<ReturnType<typeof apiFor>>, account: Account, fan: { id: string; username?: string | null; name?: string | null }, chat: any, cutoff: number): Promise<number> {
  await upsertFan(account.account_id, fan.id, { username: fan.username, name: fan.name, avatarUrl: typeof chat.avatar === "string" ? chat.avatar : null });
  if (chat.lastMessageId != null && (await hasCompleteMessage(account.account_id, String(chat.lastMessageId)))) return 0; // already up to date

  let imported = 0;
  const newIds = new Set<string>();
  let cursor: string | undefined;
  for (let p = 0; p < MESSAGE_PAGES_PER_CHAT; p++) {
    let r;
    try {
      r = await api.conversation(account.account_id, fan.id, cursor);
    } catch {
      break; // a timeout or network error: skip this conversation, the import goes on
    }
    if (r.status === 429) throw new HttpError(429, "OFMAPI asked to slow down"); // the step stops and is retried later
    if (!r.ok) break;
    const page: any[] = Array.isArray(r.body?.messages) ? r.body.messages : [];
    if (!page.length) break;
    let oldest = Infinity;
    for (const m of page) {
      const at = Date.parse(m.createdAt ?? "");
      if (Number.isFinite(at)) oldest = Math.min(oldest, at);
      const isNew = await importHistoryMessage(account, fan, m.isFromMe ? "out" : "in", textOf(m), { ofId: String(m.id), createdAt: at || undefined, media: mediaOf(m) });
      if (isNew) {
        imported++;
        newIds.add(String(m.id));
      }
    }
    await clearMediaPending(account.account_id, page.map((m) => String(m.id)));
    if (!r.body?.hasMore || r.body?.cursor == null || oldest < cutoff) break; // all of the window is read
    cursor = String(r.body.cursor);
  }
  if (imported > 0) await rescore(account.account_id, fan.id);

  // The conversation list already told us the last message and whether it is unread; if that message turned out to be
  // new (not something an earlier import already stored), from the fan, and fresh, wake the AI.
  if (chat.lastMessageId != null && chat.lastMessageIsFromMe === false && newIds.has(String(chat.lastMessageId))) {
    const created = Date.parse(chat.lastMessageTime ?? "");
    const fresh = Number.isFinite(created) && Date.now() - created < FRESH_MS && (chat.unreadCount > 0 || chat.isRead === false);
    if (fresh) await bus.emit("fan:message", account.account_id, fan.id, {});
  }
  return imported;
}

// ---- one chat on demand: its newest messages and fresh media links, read when someone needs that chat
// The provider's media links expire, and a sync only keeps the latest messages. So when a chat is opened, before the AI answers a fan, and when a
// media link stopped working, that one chat is read again (never more than once a minute per chat, shared by everyone asking at once).
// The normal read covers the newest pages. When a link of an OLDER message died, the read goes on page by page until that message is found
// (new messages push old ones down, so it may be deep); if the whole chat was read and the message is not in it, the sender removed it
// and its media is marked `gone` (so nobody asks again).
const REFRESH_COOLDOWN_MS = 60_000;
const FIND_MAX_PAGES = 150; // the provider's pages are small (about 3 messages): a chat of 400 messages is 130 pages
const GIVE_UP_FIND_MS = 60 * 60 * 1000; // a message we could not find is not searched for again for an hour
const WAIT_FOR_FIND_MS = 15_000; // a request waits this long for a search; it goes on in the background and the page asks again
const giveUps = () => singleton("find-give-ups", () => new Map<string, number>());
const refreshes = () => singleton("chat-refreshes", () => new Map<string, { at: number; running: Promise<number> | null }>());

/** Reads the chat again: stores messages we do not have, and replaces the media links with fresh ones. `find` is the OnlyFans id of an older message to look for. `skipped` means it was refreshed a moment ago. */
export async function refreshConversation(account: Account, fanId: string, opts: { find?: string } = {}): Promise<{ imported: number; skipped: boolean }> {
  const key = `${account.account_id}:${fanId}:${opts.find ? "find" : "newest"}`;
  const state = refreshes().get(key);
  if (state?.running) return { imported: await state.running, skipped: false };
  if (state && Date.now() - state.at < REFRESH_COOLDOWN_MS) return { imported: 0, skipped: true };
  const entry: { at: number; running: Promise<number> | null } = { at: Date.now(), running: null };
  entry.running = (async () => {
    const fan = await getFan(account.account_id, fanId);
    if (!fan) return 0;
    const api = await apiFor(account.user_id);
    let imported = 0;
    let cursor: string | undefined;
    let found = false;
    let reachedEnd = false;
    const seen = new Set<string>();
    for (let p = 0; p < (opts.find ? FIND_MAX_PAGES : MESSAGE_PAGES_PER_CHAT); p++) {
      const r = await api.conversation(account.account_id, fanId, cursor);
      if (!r.ok) return imported; // a failed read proves nothing: do not mark anything as removed
      const page: any[] = Array.isArray(r.body?.messages) ? r.body.messages : [];
      for (const m of page) {
        seen.add(String(m.id));
        if (opts.find && String(m.id) === opts.find) found = true;
        const media = mediaOf(m);
        const at = Date.parse(m.createdAt ?? "");
        const isNew = await importHistoryMessage(account, { id: fanId, username: fan.username, name: fan.name }, m.isFromMe ? "out" : "in", textOf(m), { ofId: String(m.id), createdAt: at || undefined, media });
        if (isNew) imported++;
        else if (media.length) await setMessageMedia(account.account_id, String(m.id), media); // the links we stored may be dead: replace them
      }
      await clearMediaPending(account.account_id, page.map((m) => String(m.id)));
      if (!page.length || !r.body?.hasMore || r.body?.cursor == null) {
        reachedEnd = true;
        break;
      }
      if (found) break;
      cursor = String(r.body.cursor);
    }
    if (imported > 0) await rescore(account.account_id, fanId);
    if (opts.find && !found) {
      if (reachedEnd) await markRemovedMedia(account.account_id, fanId, seen);
      else giveUps().set(`${account.account_id}:${opts.find}`, Date.now()); // read as far as allowed, not there: do not start the same long search again soon
    }
    return imported;
  })()
    .catch(() => 0) // a slow or failed read never breaks the page or the AI: they use what is stored
    .finally(() => {
      entry.running = null;
      entry.at = Date.now();
    });
  refreshes().set(key, entry);
  return { imported: await entry.running, skipped: false };
}

/** The whole chat was read and these stored messages with media are not in it: the sender removed them. */
async function markRemovedMedia(accountId: string, fanId: string, seen: Set<string>): Promise<void> {
  for (const m of await messagesWithMedia(accountId, fanId)) {
    if (m.of_id && !seen.has(m.of_id) && m.media.some((x) => !x.gone && !x.locked)) await setMessageMedia(accountId, m.of_id, m.media.map((x) => ({ ...x, gone: true, url: null })));
  }
}

// A chat with many pictures asks for all of them at once; too many connections to the provider at the same time make some of them time out.
const MAX_PARALLEL_DOWNLOADS = 4;
const gate = () => singleton("media-gate", () => ({ active: 0, waiting: [] as (() => void)[] }));
async function withDownloadSlot<T>(fn: () => Promise<T>): Promise<T> {
  const g = gate();
  if (g.active >= MAX_PARALLEL_DOWNLOADS) await new Promise<void>((resolve) => g.waiting.push(resolve));
  g.active++;
  try {
    return await fn();
  } finally {
    g.active--;
    g.waiting.shift()?.();
  }
}

/**
 * The file of one media of one message, ready to stream, or null. If the provider says the link is no longer valid, the
 * conversation is read again for fresh links and the download is tried once more.
 */
export function fetchMedia(account: Account, messageId: number, mediaId: string): Promise<Response | null> {
  return withDownloadSlot(() => downloadMedia(account, messageId, mediaId)).catch(() => null); // a network error is "not available" (the page retries), never a crash
}

async function downloadMedia(account: Account, messageId: number, mediaId: string): Promise<Response | null> {
  const api = await apiFor(account.user_id);
  const find = async () => {
    const msg = await getStoredMedia(account.account_id, messageId);
    return { msg, item: msg?.media?.find((x) => x.id === mediaId) };
  };
  let { msg, item } = await find();
  if (!msg || !item?.url || item.locked || item.gone) return null; // not ours, unknown, paid and locked, or removed by the sender
  let res = await api.download(item.url);
  if (res && (res.status === 410 || res.status === 403 || res.status === 404)) {
    await res.arrayBuffer().catch(() => {});
    if (msg.of_id && Date.now() - (giveUps().get(`${account.account_id}:${msg.of_id}`) ?? 0) < GIVE_UP_FIND_MS) return null; // searched recently and not found
    const search = refreshConversation(account, msg.fan_id, msg.of_id ? { find: msg.of_id } : {});
    const done = await Promise.race([search.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), WAIT_FOR_FIND_MS))]);
    if (!done) return null; // a long search is still running in the background: "not available yet", the page asks again
    item = (await find()).item;
    res = item?.url && !item.gone ? await api.download(item.url) : null;
  }
  return res && res.ok ? res : null;
}

// ---- live polling: new messages and their pictures without a button
// The webhook is the fast path but it only carries the words. Every POLL_EVERY_MS (or at once after a webhook about pictures) each connected account's
// newest inbox page is looked at: one call when nothing changed. A conversation whose latest message we do not store completely is read, so the message,
// its pictures and the AI's wake-up arrive within a minute even where no webhook can reach us.
const POLL_EVERY_MS = 60_000;
const POLL_MAX_PAGES = 5;

export async function runInboxPolls(): Promise<void> {
  for (const account of await claimPolls(POLL_EVERY_MS)) {
    try {
      await pollInbox(account);
    } catch (err) {
      console.error(`[poll] ${account.account_id}:`, err instanceof Error ? err.message : err);
    }
  }
}

async function pollInbox(account: Account): Promise<void> {
  const api = await apiFor(account.user_id);
  const cutoff = Date.now() - WINDOW_MS;
  let cursor: string | undefined;
  for (let page = 0; page < POLL_MAX_PAGES; page++) {
    const r = await api.inbox(account.account_id, cursor);
    if (!r.ok) return;
    const chats: any[] = Array.isArray(r.body?.conversations) ? r.body.conversations : [];
    let changed = 0;
    for (const chat of chats) {
      const fan = fanOf(chat);
      if (!fan || !(Date.parse(chat.lastMessageTime ?? "") >= cutoff)) continue;
      if (chat.lastMessageId != null && (await hasCompleteMessage(account.account_id, String(chat.lastMessageId)))) continue; // nothing new here
      changed++;
      await readConversation(api, account, fan, chat, cutoff);
    }
    if (changed === 0 || !r.body?.hasMore || r.body?.cursor == null) return; // a page with nothing new: everything below it is older
    cursor = String(r.body.cursor);
  }
}

/** Subscribe to what the accounts feature announces: when a key is removed, the fans and messages of its accounts go too. */
export function startInbox(): void {
  const state = singleton("inbox-started", () => ({ started: false }));
  if (state.started) return;
  state.started = true;
  bus.on("connection:removed", (accountIds) => deleteAccountFans(accountIds));
}

// ---- webhook: events OFMAPI pushes to us
/** False if this event was already processed (OFMAPI delivers at least once). */
async function markSeen(userId: number, key: string | undefined, event: string): Promise<boolean> {
  if (!key) return true; // ephemeral events (e.g. typing) may carry no key
  return markEventSeen(userId, key, event);
}

/** The text of a webhook message (HTML), or a note when it is only media. */
function hookText(message: any): string {
  const text = htmlToText(message?.text) || (message?.media_count ? `[sent ${message.media_count} media]` : "[empty message]");
  return message?.is_tip ? `[tip] ${text}` : text;
}

/**
 * Handle one verified webhook for the user that owns this endpoint. Envelope: { event, event_id, account_id, payload }.
 * OFMAPI waits 10 seconds, so nothing slow happens here (AI and sending run in the worker).
 * shortcut: the payload field names come from OFMAPI's docs; a real messages.received delivery has not been captured yet. Check them against one.
 */
export async function handleWebhook(userId: number, body: any, idempotencyKey: string | undefined): Promise<void> {
  const event = body?.event;
  const accountId = body?.account_id;
  const p = body?.payload ?? {};
  if (typeof event !== "string" || typeof accountId !== "string") return;

  const account = await getAccount(accountId);
  if (!account || account.user_id !== userId) return; // tenant isolation: ignore other people's accounts
  if (!(await markSeen(userId, idempotencyKey ?? body?.event_id, event))) return;

  switch (event) {
    case "messages.received": {
      const msg = p.message ?? {};
      const from = msg.user ?? {};
      const fanId = p.from_user_id ?? from.id;
      if (!isFanId(fanId)) break;
      await ingestFanMessage(
        account,
        { id: String(fanId), username: from.username, name: from.name },
        null, // the webhook does not carry the fan's lifetime spend
        hookText(msg),
        { ofId: (msg.id ?? p.id) != null ? String(msg.id ?? p.id) : null, createdAt: Date.parse(msg.created_at ?? "") || undefined, mediaPending: Number(msg.media_count) > 0 },
      );
      if (Number(msg.media_count) > 0) await requestPoll(accountId); // the pictures are fetched by the next poll, now rather than in a minute
      break;
    }

    case "users.typing": {
      const fanId = p.user_id ?? p.fan?.id ?? p.from_user_id ?? p.id;
      if (isFanId(fanId)) await bus.emit("fan:typing", accountId, String(fanId));
      break;
    }

    case "messages.ppv.unlocked":
    case "tips.received": {
      const fan = p.fan ?? {};
      const fanId = fan.id ?? p.chat_id;
      if (!isFanId(fanId)) break;
      await upsertFan(accountId, String(fanId), { username: fan.username, name: fan.name });
      await recordPayment(account, String(fanId), event === "tips.received" ? "tip" : "PPV purchase", Number(p.amount) || 0);
      break;
    }

    case "messages.sent": {
      // Fires for every message sent from the account, including ours. For this event `message.user` is the fan it went to.
      // If it was not sent by this app, a person replied directly in OnlyFans: pause the AI for this fan.
      const msg = p.message ?? {};
      const toId = msg.user?.id;
      if (!isFanId(toId) || !(await getFan(accountId, String(toId)))) break;
      const msgId = (msg.id ?? p.id) != null ? String(msg.id ?? p.id) : null;
      await bus.emit("account:sent", accountId, String(toId), msgId, htmlToText(msg.text)); // the assistant tells us if it was not ours
      break;
    }

    case "accounts.session_expired":
      await setAccountNote(accountId, "OnlyFans reported: session expired. Reconnect this account in OFMAPI.");
      break;

    default:
      break;
  }
}

// ---- retention: what we keep (ADR-0004)
const EVENT_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const MESSAGE_KEEP_MS = 365 * 24 * 60 * 60 * 1000;

/** Nightly clean-up: webhook ids (only needed to ignore duplicate deliveries) after 30 days, messages after 12 months. */
export async function purgeOldData(now = Date.now()): Promise<void> {
  await deleteOldEvents(now - EVENT_KEEP_MS);
  await deleteOldMessages(now - MESSAGE_KEEP_MS);
}

// ---- fan id from a URL
/** The fan named in the URL (`.../fans/[fanId]`): digits only, so it is safe to use as a key. */
export function requireFanId(raw: string | undefined): string {
  if (!isFanId(raw)) throw new HttpError(404, "Not found");
  return String(raw);
}
