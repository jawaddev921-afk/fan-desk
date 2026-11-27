// Accounts logic: the OFMAPI key, the accounts it exposes, webhook registration and verification, ownership checks.
import "server-only";
import { config } from "../../lib/config.ts";
import Anthropic from "@anthropic-ai/sdk";
import { decrypt, encrypt, hmacHex, randomToken, safeEqual } from "../../lib/crypto.ts";
import { bus } from "../../lib/events.ts";
import { HttpError, must, type Ctx } from "../../lib/http.ts";
import { apiMessage, createOfmApi } from "../../lib/integrations/ofmapi.ts";
import { accountsOfUser, deleteAccountsOfUser, deleteConnection, disableAi, getAccount, getConnection, getConnectionByToken, insertAccount, insertConnection, ownedAccount, setAccountAvatar, setWebhookError, setWebhookRegistered, updateAccountProfile, updateConnectionKey, deleteAiKey, getAiKey, saveAiKey } from "./queries.ts";
import { defaultSettings } from "./schema.ts";

/** Events we ask OFMAPI to deliver. The inbox feature knows how to handle each of them. */
const WEBHOOK_EVENTS = ["messages.received", "messages.sent", "messages.ppv.unlocked", "tips.received", "users.typing", "accounts.session_expired"];

const ACCOUNT_ID = /^acct_[A-Za-z0-9_-]+$/;

/** The user's connection, or a 400 telling them to connect their OFMAPI key. */
export async function requireConnection(userId: number) {
  const conn = await getConnection(userId);
  if (!conn) throw new HttpError(400, "Connect your OFMAPI key first.");
  return conn;
}

export const apiFor = async (userId: number) => {
  const conn = await requireConnection(userId);
  return createOfmApi(decrypt(conn.key_enc));
};

/** Validate the key with OFMAPI, store it encrypted, and import the connected accounts. */
export async function saveApiKey(userId: number, apiKey: string) {
  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (/\s/.test(key)) throw new HttpError(400, "The key has a space or line break inside it. Paste only the key, nothing else.");
  if (/[^\x21-\x7e]/.test(key)) throw new HttpError(400, "The key has a character that is not plain text (for example a curly quote). Copy it again.");
  if (key.length < 20 || key.length > 200) throw new HttpError(400, `That is ${key.length} characters; an OFMAPI key is 20-200. It may be cut off or empty.`);

  let check;
  try {
    check = await createOfmApi(key).listAccounts(); // the key check and the account list are the same call
  } catch {
    throw new HttpError(502, "Could not reach OFMAPI. Try again in a moment.");
  }
  if (!check.ok) {
    throw new HttpError(400, check.status === 401 || check.status === 403 ? "OFMAPI rejected this key." : `OFMAPI error: ${apiMessage(check)}`);
  }

  const existing = await getConnection(userId);
  if (existing) {
    // The old key's webhook belongs to the old key: remove it (best effort) so it does not keep delivering.
    if (existing.webhook_id) await createOfmApi(decrypt(existing.key_enc)).deleteWebhook(existing.webhook_id).catch(() => {});
    await updateConnectionKey(userId, { keyEnc: encrypt(key), last4: key.slice(-4), teamName: null, teamSlug: null, credits: null, webhookId: null });
  } else {
    await insertConnection(userId, {
      keyEnc: encrypt(key),
      last4: key.slice(-4),
      teamName: null,
      teamSlug: null,
      credits: null,
      webhookToken: randomToken(24),
      webhookSecretEnc: encrypt(randomToken(32)),
    });
  }
  return importAccounts(userId);
}

/** Pull the account list from OFMAPI. An account already owned by another user is never taken over. */
export async function importAccounts(userId: number) {
  const r = await (await apiFor(userId)).listAccounts();
  if (!r.ok) throw new HttpError(502, `OFMAPI error: ${apiMessage(r)}`);
  const list: any[] = Array.isArray(r.body) ? r.body : Array.isArray(r.body?.data) ? r.body.data : [];
  const out = { imported: 0, updated: 0, conflicts: [] as string[] };
  for (const a of list) {
    const id = typeof a?.id === "string" && ACCOUNT_ID.test(a.id) ? a.id : null;
    if (!id || !a.ofUsername) continue; // an account whose OnlyFans login failed has no username: nothing to import yet
    const username: string | null = a.ofUsername ?? null;
    const display: string | null = a.displayName ?? null;
    const existing = await getAccount(id);
    if (existing && existing.user_id !== userId) {
      out.conflicts.push(username ?? id);
    } else if (existing) {
      await updateAccountProfile(id, username, display);
      out.updated++;
    } else {
      await insertAccount(id, userId, username, display, JSON.stringify(defaultSettings(display || username || "the creator")));
      out.imported++;
    }
    if (typeof a.avatarUrl === "string") await setAccountAvatar(id, a.avatarUrl);
  }
  return out;
}

export function webhookUrl(token: string): string | null {
  return config.publicUrl ? `${config.publicUrl}/api/webhooks/ofmapi/${token}` : null;
}

/** Create the user's webhook in OFMAPI, pointing at this server (an existing one is replaced, which also gives a fresh signing secret). */
export async function registerWebhook(userId: number) {
  const conn = await requireConnection(userId);
  const url = webhookUrl(conn.webhook_token);
  if (!url || !url.startsWith("https://")) {
    throw new HttpError(400, "This server has no public HTTPS address (PUBLIC_URL). Set it, or use a tunnel such as cloudflared.");
  }
  const accountIds = (await accountsOfUser(userId)).map((a) => a.account_id);
  if (!accountIds.length) throw new HttpError(400, "No accounts are connected in OFMAPI yet.");

  const api = await apiFor(userId);
  if (conn.webhook_id) await api.deleteWebhook(conn.webhook_id).catch(() => {});
  const r = await api.createWebhook({ url, events: WEBHOOK_EVENTS, accountFilter: accountIds, description: "Fan Desk" });
  if (!r.ok) {
    const msg = apiMessage(r);
    await setWebhookError(userId, msg);
    throw new HttpError(400, `OFMAPI refused the webhook: ${msg}`);
  }
  const id: string | null = r.body?.id ?? null;
  const secret: string | null = r.body?.secret ?? null;
  if (!id || !secret) throw new HttpError(502, "OFMAPI did not return a webhook id and secret.");
  await setWebhookRegistered(userId, id, encrypt(secret));
  return { webhookId: id };
}

export async function disconnect(userId: number): Promise<void> {
  const conn = await getConnection(userId);
  if (!conn) return;
  if (conn.webhook_id) {
    try {
      await (await apiFor(userId)).deleteWebhook(conn.webhook_id); // best effort
    } catch {
      /* ignore */
    }
  }
  const ids = (await accountsOfUser(userId)).map((a) => a.account_id);
  for (const id of ids) await disableAi(id);
  await bus.emit("connection:removed", ids); // the inbox and the assistant delete these accounts' chats, queued sends and usage
  await deleteAccountsOfUser(userId);
  await deleteConnection(userId);
}

const SIGNATURE_TOLERANCE_S = 300; // a delivery signed longer ago than this is refused (replay protection)

/**
 * Check a webhook call from OFMAPI: the token in the URL picks the user, the signature proves it is OFMAPI.
 * Header `X-OFMAPI-Signature: t=<unix seconds>,v1=<hex>`; v1 = HMAC-SHA256 of "<t>.<raw body>" with the whole `whsec_...` secret.
 */
export async function verifyWebhook(token: string, body: string, signature: string | undefined): Promise<{ userId: number } | { status: 404 | 401 }> {
  const conn = await getConnectionByToken(token);
  if (!conn) return { status: 404 };
  const t = /(?:^|,)t=(\d+)/.exec(signature ?? "")?.[1];
  const v1 = /(?:^|,)v1=([0-9a-f]+)/.exec(signature ?? "")?.[1];
  if (!t || !v1 || Math.abs(Date.now() / 1000 - Number(t)) > SIGNATURE_TOLERANCE_S) return { status: 401 };
  if (!safeEqual(v1, hmacHex(decrypt(conn.webhook_secret_enc), `${t}.${body}`))) return { status: 401 };
  return { userId: conn.user_id };
}

// ---- ownership check used by every account endpoint
/** The account named in the URL (`/api/accounts/[accountId]/...`), only if it belongs to the logged-in user. */
export async function requireAccount(ctx: Ctx) {
  const id = ctx.params.accountId ?? "";
  if (!ACCOUNT_ID.test(id)) throw new HttpError(404, "Not found");
  return must(await ownedAccount(ctx.user.id, id));
}

// ---- the user's Claude key: validated, stored encrypted, handed to the assistant only as a ready client
const KEY_SHAPE = /^sk-ant-[A-Za-z0-9_-]{20,}$/;
/** Asks Anthropic whether the key works (one cheap read-only call). Throws a plain message the user can act on. */
async function checkClaudeKey(key: string): Promise<void> {
  try {
    await new Anthropic({ apiKey: key, maxRetries: 0, timeout: 15_000 }).models.list({ limit: 1 });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) throw new HttpError(400, "Anthropic did not accept this key. Copy it again from console.anthropic.com (it starts with sk-ant-).");
    throw new HttpError(502, "Could not reach Anthropic to check the key. Try again in a moment.");
  }
}
export async function setClaudeKey(userId: number, raw: string, check: (key: string) => Promise<void> = checkClaudeKey): Promise<{ last4: string }> {
  const key = raw.trim();
  if (!KEY_SHAPE.test(key)) throw new HttpError(400, "That does not look like a Claude API key (it starts with sk-ant-).");
  await check(key);
  await saveAiKey(userId, encrypt(key), key.slice(-4));
  return { last4: key.slice(-4) };
}
export async function removeClaudeKey(userId: number): Promise<void> {
  await deleteAiKey(userId);
}
/** A ready Claude client with this user's own key, or null when they have not added one (the server's own provider is used then). */
export async function claudeClientFor(userId: number): Promise<Anthropic | null> {
  const row = await getAiKey(userId);
  return row ? new Anthropic({ apiKey: decrypt(row.key_enc) }) : null;
}
export async function claudeKeyLast4(userId: number): Promise<string | null> {
  return (await getAiKey(userId))?.key_last4 ?? null;
}

