import "server-only";
import { HttpError } from "../../lib/http.ts";
import { accountsOfUser } from "../accounts/queries.ts";
import * as q from "./queries.ts";
import type { LibraryView } from "./types.ts";

// ---- reading
export async function libraryOf(userId: number): Promise<LibraryView> {
  const [folders, messages, settings] = await Promise.all([q.foldersOf(userId), q.messagesOf(userId), q.settingsOf(userId)]);
  return { folders, messages, settings };
}

// ---- writing: a message may only point at the user's own folder and accounts
async function checked(userId: number, m: q.MessageInput): Promise<q.MessageInput> {
  if (m.folderId !== null && !(await q.folderOwned(userId, m.folderId))) throw new HttpError(404, "Folder not found");
  const mine = new Set((await accountsOfUser(userId)).map((a) => a.account_id));
  return { ...m, accountIds: m.accountIds.filter((id) => mine.has(id)) };
}
export async function saveMessage(userId: number, id: number | null, body: q.MessageInput): Promise<void> {
  const m = await checked(userId, body);
  if (id === null) await q.addMessage(userId, m);
  else if (!(await q.updateMessage(userId, id, m))) throw new HttpError(404, "Message not found");
}
export async function importMessages(userId: number, body: { folderId: number | null; rows: { title: string; text: string; price: number }[] }): Promise<number> {
  if (body.folderId !== null && !(await q.folderOwned(userId, body.folderId))) throw new HttpError(404, "Folder not found");
  for (const r of body.rows) await q.addMessage(userId, { ...r, aiPricing: false, folderId: body.folderId, accountIds: [] });
  return body.rows.length;
}
