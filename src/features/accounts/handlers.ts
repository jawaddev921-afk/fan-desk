// Account endpoints: plain functions (ctx) => data. src/app/api/**/route.ts wires them to URLs.
import "server-only";
import { parseBody, type Handler } from "../../lib/http.ts";
import { rateLimit } from "../auth/service.ts";
import { saveSettings } from "./queries.ts";
import { AccountPatchSchema, SaveClaudeKeyBody, SaveKeyBody } from "./schema.ts";
import { disconnect, importAccounts, registerWebhook, removeClaudeKey, requireAccount, requireConnection, saveApiKey, setClaudeKey } from "./service.ts";

export const saveKeyHandler: Handler = async ({ user, json }) => {
  const b = parseBody(SaveKeyBody, await json());
  return { ok: true, imported: await saveApiKey(user.id, b.apiKey) };
};

export const disconnectHandler: Handler = async ({ user }) => {
  await disconnect(user.id);
  return { ok: true };
};

export const refreshAccountsHandler: Handler = async ({ user }) => ({ ok: true, imported: await importAccounts(user.id) });

export const registerWebhookHandler: Handler = async ({ user }) => {
  await registerWebhook(user.id);
  return { ok: true };
};

export const updateAccountHandler: Handler = async (ctx) => {
  const account = await requireAccount(ctx);
  const { ai_enabled, send_mode, ...settings } = parseBody(AccountPatchSchema, await ctx.json(), "settings");
  if (ai_enabled) await requireConnection(ctx.user.id);
  await saveSettings(account.account_id, JSON.stringify(settings), ai_enabled, send_mode);
  return { ok: true };
};

export const saveClaudeKeyHandler: Handler = async ({ user, json }) => {
  await rateLimit(`ai-key:${user.id}`, 8, 10 * 60 * 1000, "Too many tries. Wait a few minutes.");
  return { ok: true, ...(await setClaudeKey(user.id, parseBody(SaveClaudeKeyBody, await json()).apiKey)) };
};
export const removeClaudeKeyHandler: Handler = async ({ user }) => {
  await removeClaudeKey(user.id);
  return { ok: true };
};

