import "server-only";
import crypto from "node:crypto";
import { db } from "../../lib/db.ts";

export type OutboxItem = {
  id: string;
  account_id: string;
  fan_id: string;
  text: string;
  source: string;
  status: string;
  of_message_id: string | null;
  error: string | null;
  attempts: number;
  next_attempt_at: number;
  created_at: number;
  updated_at: number;
};

export async function createOutboxItem(
  accountId: string,
  fanId: string,
  text: string,
  source: "assistant" | "human",
  status: "draft" | "queued",
  error: string | null = null,
): Promise<string> {
  const id = crypto.randomUUID(); // also the provider's Idempotency-Key
  const now = Date.now();
  await db.run(
    `INSERT INTO outbox (id, account_id, fan_id, text, source, status, error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, accountId, fanId, text, source, status, error, now, now],
  );
  return id;
}

export const getOutboxItem = (id: string) => db.one<OutboxItem>("SELECT * FROM outbox WHERE id = ?", [id]);

export const outboxOfFan = (accountId: string, fanId: string) =>
  db.all<OutboxItem>("SELECT * FROM outbox WHERE account_id = ? AND fan_id = ? ORDER BY created_at DESC LIMIT 50", [accountId, fanId]);

/** Drafts and failed sends waiting for a person. */
export async function pendingCount(accountId: string): Promise<number> {
  const row = await db.one<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE account_id = ? AND status IN ('draft','unknown','failed')", [accountId]);
  return row!.n;
}

export async function pendingByFan(accountId: string): Promise<Map<string, number>> {
  const rows = await db.all<{ fan_id: string; n: number }>(
    "SELECT fan_id, COUNT(*) AS n FROM outbox WHERE account_id = ? AND status IN ('draft','unknown','failed') GROUP BY fan_id",
    [accountId],
  );
  return new Map(rows.map((r) => [r.fan_id, r.n]));
}

export async function scheduleReply(accountId: string, fanId: string, delayMs: number): Promise<void> {
  await db.run(
    `INSERT INTO reply_jobs (account_id, fan_id, run_at) VALUES (?, ?, ?)
     ON CONFLICT (account_id, fan_id) DO UPDATE SET run_at = excluded.run_at`,
    [accountId, fanId, Date.now() + delayMs],
  );
}

export async function delayReplyIfPending(accountId: string, fanId: string, delayMs: number): Promise<void> {
  await db.run("UPDATE reply_jobs SET run_at = ? WHERE account_id = ? AND fan_id = ?", [Date.now() + delayMs, accountId, fanId]);
}

/** The fan went to a human: forget the pending reply and reject the AI's unsent drafts. */
export async function cancelAssistantWork(accountId: string, fanId: string): Promise<void> {
  await db.run("DELETE FROM reply_jobs WHERE account_id = ? AND fan_id = ?", [accountId, fanId]);
  await db.run(
    "UPDATE outbox SET status = 'rejected', error = 'fan handed to human', updated_at = ? WHERE account_id = ? AND fan_id = ? AND source = 'assistant' AND status IN ('draft','queued')",
    [Date.now(), accountId, fanId],
  );
}

/** The provider key was removed: nothing for these accounts may be sent any more. */
export async function cancelAllWork(accountId: string): Promise<void> {
  await db.run("DELETE FROM reply_jobs WHERE account_id = ?", [accountId]);
  await db.run("UPDATE outbox SET status = 'rejected', error = 'key removed', updated_at = ? WHERE account_id = ? AND status IN ('draft','queued')", [Date.now(), accountId]);
}

/** The key was removed: forget the account's drafts, sends and usage too. */
export async function deleteAccountAssistantData(accountId: string): Promise<void> {
  await db.run("DELETE FROM reply_jobs WHERE account_id = ?", [accountId]);
  await db.run("DELETE FROM outbox WHERE account_id = ?", [accountId]);
  await db.run("DELETE FROM usage WHERE account_id = ?", [accountId]);
}

export async function approveDraft(id: string, editedText: string | null): Promise<void> {
  await db.run("UPDATE outbox SET status = 'queued', text = COALESCE(?, text), error = NULL, updated_at = ? WHERE id = ?", [editedText, Date.now(), id]);
}

export async function rejectItem(id: string): Promise<void> {
  await db.run("UPDATE outbox SET status = 'rejected', updated_at = ? WHERE id = ?", [Date.now(), id]);
}

export async function recordUsage(accountId: string, model: string, input: number, output: number): Promise<void> {
  await db.run("INSERT INTO usage (account_id, at, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?)", [accountId, Date.now(), model, input, output]);
}

export const usageByModel = (accountId: string, since: number) =>
  db.all<{ model: string; calls: number; input: number; output: number }>(
    "SELECT model, COUNT(*) AS calls, SUM(input_tokens) AS input, SUM(output_tokens) AS output FROM usage WHERE account_id = ? AND at > ? GROUP BY model",
    [accountId, since],
  );

/** True if a message sent from the account is one of ours (same OnlyFans id, or same text just now). */
export async function isOurMessage(accountId: string, fanId: string, msgId: string | null, text: string): Promise<boolean> {
  const row = await db.one(
    `SELECT 1 FROM outbox WHERE account_id = ? AND fan_id = ?
       AND ((of_message_id IS NOT NULL AND of_message_id = ?)
         OR (status IN ('queued','sent','unknown') AND text = ? AND updated_at > ?))`,
    [accountId, fanId, msgId, text, Date.now() - 10 * 60 * 1000],
  );
  return !!row;
}

export async function recentAssistantReplies(accountId: string, fanId: string, since: number): Promise<number> {
  const row = await db.one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM outbox WHERE account_id = ? AND fan_id = ? AND source = 'assistant' AND created_at > ? AND status != 'rejected'",
    [accountId, fanId, since],
  );
  return row!.n;
}

/** Claims up to 4 due reply jobs in one statement (SKIP LOCKED: two workers never take the same one). */
export const dueReplyJobs = () =>
  db.all<{ account_id: string; fan_id: string }>(
    `WITH due AS (SELECT account_id, fan_id FROM reply_jobs WHERE run_at <= ? ORDER BY run_at LIMIT 4 FOR UPDATE SKIP LOCKED)
     DELETE FROM reply_jobs j USING due WHERE j.account_id = due.account_id AND j.fan_id = due.fan_id
     RETURNING j.account_id, j.fan_id`,
    [Date.now()],
  );

/** Claims up to 10 sends that are due: they become 'sending' in the same statement, so two overlapping workers never send the same one. */
export const claimQueued = () =>
  db.all<OutboxItem>(
    `UPDATE outbox SET status = 'sending', updated_at = ? WHERE id IN (
       SELECT id FROM outbox WHERE status = 'queued' AND next_attempt_at <= ? ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED)
     RETURNING *`,
    [Date.now(), Date.now()],
  );

/** A send claimed long ago and never finished (the worker died): we cannot know if it went out, so it is 'unknown' and never resent by itself. */
export async function markStuckSendsUnknown(olderThanMs: number): Promise<void> {
  await db.run("UPDATE outbox SET status = 'unknown', error = 'the worker stopped while sending; check OnlyFans before resending', updated_at = ? WHERE status = 'sending' AND updated_at < ?", [
    Date.now(),
    Date.now() - olderThanMs,
  ]);
}

export async function markSent(id: string, messageId: string | null): Promise<void> {
  await db.run("UPDATE outbox SET status = 'sent', of_message_id = ?, error = NULL, updated_at = ? WHERE id = ?", [messageId, Date.now(), id]);
}

/** One more failed attempt: the item goes back to 'queued' to be tried again, or is marked failed after the 8th. */
export async function markRetry(item: OutboxItem, error: string, retryAfterMs: number): Promise<void> {
  const now = Date.now();
  await db.run(
    `UPDATE outbox SET attempts = attempts + 1, error = ?, next_attempt_at = ?, updated_at = ?,
       status = CASE WHEN attempts + 1 >= 8 THEN 'failed' ELSE 'queued' END WHERE id = ?`,
    [error, now + retryAfterMs, now, item.id],
  );
}

export async function markStatus(id: string, status: "unknown" | "failed" | "rejected", error: string | null): Promise<void> {
  await db.run("UPDATE outbox SET status = ?, error = ?, updated_at = ? WHERE id = ?", [status, error, Date.now(), id]);
}
