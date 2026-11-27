import "server-only";
import { db } from "../../lib/db.ts";
import { bus } from "../../lib/events.ts";
import type { FanView } from "./types.ts";

/** What we keep for a media: the provider's link too. Those links stop working after a while (OnlyFans signs them), so they are refreshed when needed and never sent to the browser. */
export type StoredMedia = { id: string; type: string; locked: boolean; price: number; url: string | null; gone?: boolean; width?: number | null; height?: number | null; duration?: number | null };

export type Fan = FanView; // one shape for the database row and the API view

export type Message = {
  id: number;
  account_id: string;
  fan_id: string;
  direction: "in" | "out";
  source: string;
  text: string;
  of_id: string | null;
  created_at: number;
  media: StoredMedia[];
};

export const getFan = (accountId: string, fanId: string) => db.one<Fan>("SELECT * FROM fans WHERE account_id = ? AND fan_id = ?", [accountId, fanId]);

export async function upsertFan(
  accountId: string,
  fanId: string,
  info: { username?: string | null; name?: string | null; totalSpend?: number | null; avatarUrl?: string | null },
): Promise<Fan> {
  await db.run(
    `INSERT INTO fans (account_id, fan_id, username, name, total_spend, avatar_url) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (account_id, fan_id) DO UPDATE SET
       username = COALESCE(excluded.username, fans.username),
       name = COALESCE(excluded.name, fans.name),
       avatar_url = COALESCE(excluded.avatar_url, fans.avatar_url),
       total_spend = GREATEST(fans.total_spend, excluded.total_spend)`,
    [accountId, fanId, info.username ?? null, info.name ?? null, info.totalSpend ?? 0, info.avatarUrl ?? null],
  );
  return (await getFan(accountId, fanId))!;
}

/** Returns false if this OnlyFans message id was already stored. */
export async function addMessage(
  accountId: string,
  fanId: string,
  direction: "in" | "out",
  source: string,
  text: string,
  opts: { ofId?: string | null; createdAt?: number; media?: StoredMedia[]; mediaPending?: boolean } = {},
): Promise<boolean> {
  const at = opts.createdAt ?? Date.now();
  const media = opts.media?.length ? JSON.stringify(opts.media) : null;
  const changed = await db.run(
    "INSERT INTO messages (account_id, fan_id, direction, source, text, of_id, created_at, media, media_pending) VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?) ON CONFLICT DO NOTHING",
    [accountId, fanId, direction, source, text, opts.ofId ?? null, at, media, !!opts.mediaPending && !media],
  );
  if (changed === 0) {
    // Stored by an earlier sync, before media was kept: add the media now (never overwrite what is there).
    if (media && opts.ofId) await db.run("UPDATE messages SET media = ?::jsonb, media_pending = false WHERE account_id = ? AND of_id = ? AND media IS NULL", [media, accountId, opts.ofId]);
    return false;
  }
  if (direction === "in") {
    await db.run("UPDATE fans SET last_message_at = GREATEST(COALESCE(last_message_at, 0), ?) WHERE account_id = ? AND fan_id = ?", [at, accountId, fanId]);
  }
  return true;
}

export async function recentMessages(accountId: string, fanId: string, limit = 30): Promise<Message[]> {
  const rows = await db.all<Omit<Message, "media"> & { media: StoredMedia[] | null }>("SELECT * FROM messages WHERE account_id = ? AND fan_id = ? ORDER BY created_at DESC, id DESC LIMIT ?", [accountId, fanId, limit]);
  return rows.reverse().map((m) => ({ ...m, media: m.media ?? [] }));
}

/** The media of one stored message (and whose conversation it is), only if the message belongs to this account. */
export const getStoredMedia = (accountId: string, messageId: number) =>
  db.one<{ fan_id: string; of_id: string | null; media: StoredMedia[] | null }>("SELECT fan_id, of_id, media FROM messages WHERE account_id = ? AND id = ?", [accountId, messageId]);

/** The stored messages of one chat that have media (to tell which of them the provider no longer lists). */
export const messagesWithMedia = (accountId: string, fanId: string) =>
  db.all<{ of_id: string | null; media: StoredMedia[] }>("SELECT of_id, media FROM messages WHERE account_id = ? AND fan_id = ? AND of_id IS NOT NULL AND media IS NOT NULL", [accountId, fanId]);

/** Replaces a message's media with fresh links (the old ones stopped working). */
export async function setMessageMedia(accountId: string, ofId: string, media: StoredMedia[]): Promise<void> {
  await db.run("UPDATE messages SET media = ?::jsonb, media_pending = false WHERE account_id = ? AND of_id = ?", [JSON.stringify(media), accountId, ofId]);
}

/** Handing a fan to a human tells the assistant (via the bus) to stop its pending work for them. */
export async function setFanMode(accountId: string, fanId: string, mode: "assistant" | "human", reason: string | null): Promise<void> {
  await db.run("UPDATE fans SET mode = ?, handoff_reason = ? WHERE account_id = ? AND fan_id = ?", [mode, reason, accountId, fanId]);
  if (mode === "human") await bus.emit("fan:human", accountId, fanId);
}

export async function markPaid(accountId: string, fanId: string): Promise<void> {
  await db.run("UPDATE fans SET last_paid_at = ? WHERE account_id = ? AND fan_id = ?", [Date.now(), accountId, fanId]);
}

export async function saveAnalysis(accountId: string, fanId: string, intent: string, summary: string): Promise<void> {
  await db.run("UPDATE fans SET intent = ?, ai_summary = ? WHERE account_id = ? AND fan_id = ?", [intent, summary, accountId, fanId]);
}

export async function saveScore(accountId: string, fanId: string, score: number, tier: string): Promise<void> {
  await db.run("UPDATE fans SET score = ?, tier = ? WHERE account_id = ? AND fan_id = ?", [score, tier, accountId, fanId]);
}

/** False if this webhook delivery was already processed. */
export async function markEventSeen(userId: number, key: string, event: string): Promise<boolean> {
  const changed = await db.run("INSERT INTO events (user_id, idempotency_key, event, received_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING", [userId, key, event, Date.now()]);
  return changed > 0;
}

/** True if we already stored this OnlyFans message completely: a message whose pictures we were told about but have not fetched yet is not complete. */
export async function hasCompleteMessage(accountId: string, ofId: string): Promise<boolean> {
  return !!(await db.one("SELECT 1 FROM messages WHERE account_id = ? AND of_id = ? AND NOT media_pending", [accountId, ofId]));
}

/** These messages were read from the provider: whatever media they have is now stored, so nothing is pending for them. */
export async function clearMediaPending(accountId: string, ofIds: string[]): Promise<void> {
  if (ofIds.length) await db.run("UPDATE messages SET media_pending = false WHERE account_id = ? AND of_id = ANY(?) AND media_pending", [accountId, ofIds]);
}

/** Removes everything we stored about these accounts' fans (the key was removed). */
export async function deleteAccountFans(accountIds: string[]): Promise<void> {
  if (!accountIds.length) return;
  await db.run("DELETE FROM messages WHERE account_id = ANY(?)", [accountIds]);
  await db.run("DELETE FROM fans WHERE account_id = ANY(?)", [accountIds]);
}

export async function deleteOldEvents(before: number): Promise<void> {
  await db.run("DELETE FROM events WHERE received_at < ?", [before]);
}

export async function deleteOldMessages(before: number): Promise<void> {
  await db.run("DELETE FROM messages WHERE created_at < ?", [before]);
}

export function listFans(accountId: string, tier: string | null): Promise<Fan[]> {
  const byTier = tier && ["hot", "warm", "cold"].includes(tier);
  return db.all<Fan>(
    `SELECT * FROM fans WHERE account_id = ? ${byTier ? "AND tier = ?" : ""}
     ORDER BY (mode = 'human') DESC, score DESC, last_message_at DESC NULLS LAST LIMIT 500`,
    byTier ? [accountId, tier] : [accountId],
  );
}

export async function fanCounts(accountId: string): Promise<{ total: number; human: number; hot: number }> {
  const row = await db.one<{ total: number; human: number; hot: number }>(
    `SELECT (SELECT COUNT(*) FROM fans WHERE account_id = ?) AS total,
            (SELECT COUNT(*) FROM fans WHERE account_id = ? AND mode = 'human') AS human,
            (SELECT COUNT(*) FROM fans WHERE account_id = ? AND tier = 'hot') AS hot`,
    [accountId, accountId, accountId],
  );
  return row!;
}

/** Messages the creator side sent with a priced (locked) attachment, newest first, the same text and price counted once. */
export async function recentPpvs(accountId: string, limit = 100): Promise<{ text: string; price: number; media: StoredMedia[]; sentAt: number }[]> {
  const rows = await db.all<{ text: string; media: StoredMedia[]; created_at: number }>(
    "SELECT text, media, created_at FROM messages WHERE account_id = ? AND direction = 'out' AND jsonb_typeof(media) = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements(media) e WHERE COALESCE((e->>'price')::numeric, 0) > 0) ORDER BY created_at DESC LIMIT 1000",
    [accountId],
  );
  const seen = new Set<string>();
  const out = [];
  for (const r of rows) {
    const price = Math.max(...r.media.map((m) => Number(m.price) || 0));
    const key = `${r.text}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: r.text, price, media: r.media, sentAt: r.created_at });
    if (out.length >= limit) break;
  }
  return out;
}

/** Messages we sent that went to several fans: `best` = priced ones (PPVs), `mass` = any text. Ranked by how many fans got it; the sales are not known, only the reach. */
export async function widelySent(accountId: string, kind: "best" | "mass", limit = 100): Promise<{ text: string; price: number; media: StoredMedia[]; sentAt: number; fans: number }[]> {
  const priced = "EXISTS (SELECT 1 FROM jsonb_array_elements(media) e WHERE COALESCE((e->>'price')::numeric, 0) > 0)";
  const rows = await db.all<{ text: string; media: StoredMedia[]; last_at: number; fans: number }>(
    `SELECT text, (array_agg(media ORDER BY created_at DESC))[1] AS media, MAX(created_at) AS last_at, COUNT(DISTINCT fan_id) AS fans FROM messages WHERE account_id = ? AND direction = 'out' AND source <> 'system' AND text <> '' AND ${kind === "best" ? `jsonb_typeof(media) = 'array' AND ${priced}` : "TRUE"} GROUP BY text HAVING COUNT(DISTINCT fan_id) >= 3 ORDER BY fans DESC, last_at DESC LIMIT ?`,
    [accountId, limit],
  );
  return rows.map((r) => ({ text: r.text, price: Array.isArray(r.media) ? Math.max(0, ...r.media.map((m) => Number(m.price) || 0)) : 0, media: Array.isArray(r.media) ? r.media : [], sentAt: r.last_at, fans: r.fans }));
}

/** How long her real texts are: the median word count of the replies a person sent to single fans (mass messages, the same text to 3+ fans, are left out). Null when there are too few. */
export async function herTypicalWords(accountId: string): Promise<number | null> {
  const rows = await db.all<{ text: string }>(
    "SELECT text FROM messages WHERE account_id = ? AND direction = 'out' AND source = 'human' AND text <> '' AND text NOT IN (SELECT text FROM messages WHERE account_id = ? AND direction = 'out' GROUP BY text HAVING COUNT(DISTINCT fan_id) >= 3) ORDER BY created_at DESC LIMIT 300",
    [accountId, accountId],
  );
  if (rows.length < 15) return null;
  const n = rows.map((r) => r.text.trim().split(/\s+/).length).sort((a, b) => a - b);
  return n[Math.floor(n.length / 2)]!;
}

/** Spend and subscribe date as the provider reports them (`stats_at` says how fresh they are). */
export const setFanStats = (accountId: string, fanId: string, totalSpend: number | null, subscribedAt: number | null) =>
  db.run("UPDATE fans SET total_spend = COALESCE(?, total_spend), subscribed_at = COALESCE(?, subscribed_at), stats_at = ? WHERE account_id = ? AND fan_id = ?", [totalSpend, subscribedAt, Date.now(), accountId, fanId]);
