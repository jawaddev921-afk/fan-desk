import "server-only";
import { db } from "../../lib/db.ts";

export type Connection = {
  user_id: number;
  key_enc: string;
  key_last4: string;
  team_name: string | null;
  team_slug: string | null;
  credits_balance: number | null;
  webhook_token: string;
  webhook_secret_enc: string;
  webhook_id: string | null;
  webhook_error: string | null;
  webhook_registered_at: number | null;
  updated_at: number;
};

export type Account = {
  account_id: string;
  user_id: number;
  username: string | null;
  display_name: string | null;
  settings: string;
  ai_enabled: number;
  avatar_url: string | null;
  send_mode: "draft" | "auto";
  note: string | null;
  created_at: number;
  sync_status: "idle" | "running" | "done" | "failed";
  sync_cursor: string | null;
  sync_chats: number;
  sync_messages: number;
  sync_old_pages: number;
  sync_started_at: number | null;
  sync_updated_at: number | null;
  sync_lease_until: number | null;
  sync_error: string | null;
  poll_at: number | null;
};

export const getAccount = (accountId: string) => db.one<Account>("SELECT * FROM accounts WHERE account_id = ?", [accountId]);

export const accountsOfUser = (userId: number) => db.all<Account>("SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at", [userId]);

/** The only way handlers fetch an account: it must belong to the logged-in user. */
export async function ownedAccount(userId: number, accountId: string): Promise<Account | undefined> {
  const a = await getAccount(accountId);
  return a && a.user_id === userId ? a : undefined;
}

export const getConnection = (userId: number) => db.one<Connection>("SELECT * FROM connections WHERE user_id = ?", [userId]);

export const getConnectionByToken = (token: string) => db.one<Connection>("SELECT * FROM connections WHERE webhook_token = ?", [token]);

export async function setAccountNote(accountId: string, note: string | null): Promise<void> {
  await db.run("UPDATE accounts SET note = ? WHERE account_id = ?", [note, accountId]);
}

export async function disableAi(accountId: string): Promise<void> {
  await db.run("UPDATE accounts SET ai_enabled = 0 WHERE account_id = ?", [accountId]);
}

export async function deleteConnection(userId: number): Promise<void> {
  await db.run("DELETE FROM connections WHERE user_id = ?", [userId]);
}

/** Replace the key of an existing connection (values are already encrypted). */
export async function updateConnectionKey(
  userId: number,
  c: { keyEnc: string; last4: string; teamName: string | null; teamSlug: string | null; credits: number | null; webhookId: string | null },
): Promise<void> {
  await db.run(
    "UPDATE connections SET key_enc = ?, key_last4 = ?, team_name = ?, team_slug = ?, credits_balance = ?, webhook_id = ?, updated_at = ? WHERE user_id = ?",
    [c.keyEnc, c.last4, c.teamName, c.teamSlug, c.credits, c.webhookId, Date.now(), userId],
  );
}

export async function insertConnection(
  userId: number,
  c: { keyEnc: string; last4: string; teamName: string | null; teamSlug: string | null; credits: number | null; webhookToken: string; webhookSecretEnc: string },
): Promise<void> {
  await db.run(
    `INSERT INTO connections (user_id, key_enc, key_last4, team_name, team_slug, credits_balance, webhook_token, webhook_secret_enc, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, c.keyEnc, c.last4, c.teamName, c.teamSlug, c.credits, c.webhookToken, c.webhookSecretEnc, Date.now()],
  );
}

export async function setWebhookError(userId: number, error: string): Promise<void> {
  await db.run("UPDATE connections SET webhook_error = ? WHERE user_id = ?", [error, userId]);
}

/** The webhook now exists at the provider; `secretEnc` is the signing secret it returned (encrypted), which later deliveries are checked against. */
export async function setWebhookRegistered(userId: number, webhookId: string | null, secretEnc: string): Promise<void> {
  await db.run("UPDATE connections SET webhook_id = ?, webhook_secret_enc = ?, webhook_error = NULL, webhook_registered_at = ? WHERE user_id = ?", [webhookId, secretEnc, Date.now(), userId]);
}

export const setAccountAvatar = (accountId: string, url: string) => db.run("UPDATE accounts SET avatar_url = ? WHERE account_id = ?", [url, accountId]);

export async function updateAccountProfile(accountId: string, username: string | null, displayName: string | null): Promise<void> {
  await db.run("UPDATE accounts SET username = ?, display_name = ? WHERE account_id = ?", [username, displayName, accountId]);
}

export async function insertAccount(accountId: string, userId: number, username: string | null, displayName: string | null, settingsJson: string): Promise<void> {
  const now = Date.now();
  // A new account starts its first import right away (the worker picks it up): the user pastes the key and watches the chats arrive.
  await db.run("INSERT INTO accounts (account_id, user_id, username, display_name, settings, created_at, sync_status, sync_started_at, sync_updated_at) VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)", [
    accountId,
    userId,
    username,
    displayName,
    settingsJson,
    now,
    now,
    now,
  ]);
}

export const setAiEnabled = (accountId: string, on: boolean) => db.run("UPDATE accounts SET ai_enabled = ? WHERE account_id = ?", [on ? 1 : 0, accountId]);

export async function saveSettings(accountId: string, settingsJson: string, aiEnabled: boolean, sendMode: "draft" | "auto"): Promise<void> {
  await db.run("UPDATE accounts SET settings = ?, ai_enabled = ?, send_mode = ? WHERE account_id = ?", [settingsJson, aiEnabled ? 1 : 0, sendMode, accountId]);
}

// ---- background sync state (the sync itself is in the inbox feature)
/** Starts (or restarts) the account's import from the newest chat. False if one is already running. */
export async function startAccountSync(accountId: string): Promise<boolean> {
  const now = Date.now();
  const changed = await db.run(
    `UPDATE accounts SET sync_status = 'running', sync_cursor = NULL, sync_chats = 0, sync_messages = 0, sync_old_pages = 0,
       sync_started_at = ?, sync_updated_at = ?, sync_lease_until = NULL, sync_error = NULL
     WHERE account_id = ? AND sync_status != 'running'`,
    [now, now, accountId],
  );
  return changed > 0;
}

/** Claims up to 2 running syncs nobody holds, for `leaseMs` (SKIP LOCKED: two workers never take the same account). */
export const claimRunningSyncs = (leaseMs: number) =>
  db.all<Account>(
    `UPDATE accounts SET sync_lease_until = ? WHERE account_id IN (
       SELECT account_id FROM accounts WHERE sync_status = 'running' AND (sync_lease_until IS NULL OR sync_lease_until < ?)
       ORDER BY sync_started_at LIMIT 2 FOR UPDATE SKIP LOCKED)
     RETURNING *`,
    [Date.now() + leaseMs, Date.now()],
  );

export async function saveSyncProgress(
  accountId: string,
  p: { cursor: string | null; chats: number; messages: number; oldPages: number; status: "running" | "done" },
): Promise<void> {
  await db.run(
    "UPDATE accounts SET sync_cursor = ?, sync_chats = ?, sync_messages = ?, sync_old_pages = ?, sync_status = ?, sync_updated_at = ?, sync_lease_until = NULL, sync_error = NULL WHERE account_id = ?",
    [p.cursor, p.chats, p.messages, p.oldPages, p.status, Date.now(), accountId],
  );
}

/** A step failed: remember why. `retryAfterMs` keeps the sync running and tries again later; null gives up (status failed). */
export async function recordSyncError(accountId: string, error: string, retryAfterMs: number | null): Promise<void> {
  const now = Date.now();
  await db.run("UPDATE accounts SET sync_error = ?, sync_status = ?, sync_updated_at = ?, sync_lease_until = ? WHERE account_id = ?", [
    error.slice(0, 300),
    retryAfterMs == null ? "failed" : "running",
    now,
    retryAfterMs == null ? null : now + retryAfterMs,
    accountId,
  ]);
}

/** Removes the user's accounts (their chats are removed by the inbox and assistant features, which hear `connection:removed`). */
export async function deleteAccountsOfUser(userId: number): Promise<void> {
  await db.run("DELETE FROM accounts WHERE user_id = ?", [userId]);
}

// ---- live polling (the work is in the inbox feature)
/** Claims up to 3 connected accounts (first import done) whose inbox is due to be looked at, and sets their next time. SKIP LOCKED: two workers never poll the same account. */
export const claimPolls = (everyMs: number) =>
  db.all<Account>(
    `UPDATE accounts SET poll_at = ? WHERE account_id IN (
       SELECT a.account_id FROM accounts a JOIN connections c ON c.user_id = a.user_id
       WHERE a.sync_status = 'done' AND (a.poll_at IS NULL OR a.poll_at <= ?)
       ORDER BY a.poll_at NULLS FIRST LIMIT 3 FOR UPDATE OF a SKIP LOCKED)
     RETURNING *`,
    [Date.now() + everyMs, Date.now()],
  );

/** Look at this account's inbox as soon as possible (a webhook just said something happened). */
export async function requestPoll(accountId: string): Promise<void> {
  await db.run("UPDATE accounts SET poll_at = 0 WHERE account_id = ?", [accountId]);
}

// ---- the user's Claude key (encrypted; the plain key never leaves accounts/service.ts)
export type AiKeyRow = { user_id: number; provider: string; key_enc: string; key_last4: string; created_at: number };
export const getAiKey = (userId: number) => db.one<AiKeyRow>("SELECT * FROM ai_keys WHERE user_id = ?", [userId]);
export const saveAiKey = (userId: number, keyEnc: string, last4: string) =>
  db.run("INSERT INTO ai_keys (user_id, provider, key_enc, key_last4, created_at) VALUES (?, 'claude', ?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET key_enc = EXCLUDED.key_enc, key_last4 = EXCLUDED.key_last4, created_at = EXCLUDED.created_at", [userId, keyEnc, last4, Date.now()]);
export const deleteAiKey = (userId: number) => db.run("DELETE FROM ai_keys WHERE user_id = ?", [userId]);

