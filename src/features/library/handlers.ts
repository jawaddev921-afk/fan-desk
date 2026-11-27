// Library endpoints (per user; accounts are only a tag on a message).
import "server-only";
import { z } from "zod";
import { must, parseBody, type Handler } from "../../lib/http.ts";
import * as q from "./queries.ts";
import { importMessages, libraryOf, saveMessage } from "./service.ts";

const MessageBody = z.object({
  title: z.string().trim().min(1, "Give the message a title").max(120),
  text: z.string().max(5000).default(""),
  price: z.number().min(0).max(500).default(0),
  aiPricing: z.boolean().default(false),
  folderId: z.number().int().nullable().default(null),
  accountIds: z.array(z.string().max(80)).max(50).default([]),
});
const FolderBody = z.object({ name: z.string().trim().min(1, "Give the folder a name").max(60) });
const SettingsBody = z.object({ fallbackName: z.string().trim().min(1).max(30), capitalize: z.boolean() });
const ImportBody = z.object({
  folderId: z.number().int().nullable().default(null),
  rows: z.array(z.object({ title: z.string().trim().min(1).max(120), text: z.string().max(5000), price: z.number().min(0).max(500) })).min(1).max(500),
});

const idOf = (ctx: { params: Record<string, string> }, key: string) => must(/^\d{1,9}$/.test(ctx.params[key] ?? "") ? Number(ctx.params[key]) : null);

export const libraryHandler: Handler = ({ user }) => libraryOf(user.id);
export const addFolderHandler: Handler = async ({ user, json }) => {
  await q.addFolder(user.id, parseBody(FolderBody, await json()).name);
  return { ok: true };
};
export const deleteFolderHandler: Handler = async (ctx) => {
  await q.deleteFolder(ctx.user.id, idOf(ctx, "id"));
  return { ok: true };
};
export const addMessageHandler: Handler = async ({ user, json }) => {
  await saveMessage(user.id, null, parseBody(MessageBody, await json()));
  return { ok: true };
};
export const updateMessageHandler: Handler = async (ctx) => {
  await saveMessage(ctx.user.id, idOf(ctx, "id"), parseBody(MessageBody, await ctx.json()));
  return { ok: true };
};
export const deleteMessageHandler: Handler = async (ctx) => {
  await q.deleteMessage(ctx.user.id, idOf(ctx, "id"));
  return { ok: true };
};
export const saveSettingsHandler: Handler = async ({ user, json }) => {
  const b = parseBody(SettingsBody, await json());
  await q.saveSettings(user.id, b.fallbackName, b.capitalize);
  return { ok: true };
};
export const importHandler: Handler = async ({ user, json }) => ({ ok: true, imported: await importMessages(user.id, parseBody(ImportBody, await json())) });
