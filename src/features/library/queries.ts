import "server-only";
import { db } from "../../lib/db.ts";
import type { LibraryMessage } from "./types.ts";

type Row = { id: number; created_at: number; folder_id: number | null; title: string; text: string; price: number; ai_pricing: number; media: LibraryMessage["media"]; account_ids: string[] };
const toMessage = (r: Row): LibraryMessage => ({ id: r.id, folderId: r.folder_id, title: r.title, text: r.text, price: Number(r.price), aiPricing: !!r.ai_pricing, media: r.media, accountIds: r.account_ids, createdAt: Number(r.created_at) });

export const foldersOf = (userId: number) =>
  db.all<{ id: number; name: string; count: number }>(
    "SELECT f.id, f.name, COUNT(m.id) AS count FROM library_folders f LEFT JOIN library_messages m ON m.folder_id = f.id WHERE f.user_id = ? GROUP BY f.id ORDER BY f.id",
    [userId],
  );
export const messagesOf = async (userId: number) => (await db.all<Row>("SELECT * FROM library_messages WHERE user_id = ? ORDER BY id", [userId])).map(toMessage);

export async function settingsOf(userId: number): Promise<{ fallbackName: string; capitalize: boolean }> {
  const r = await db.one<{ fallback_name: string; capitalize: number }>("SELECT * FROM library_settings WHERE user_id = ?", [userId]);
  return { fallbackName: r?.fallback_name ?? "babe", capitalize: r ? !!r.capitalize : true };
}
export const saveSettings = (userId: number, fallbackName: string, capitalize: boolean) =>
  db.run(
    `INSERT INTO library_settings (user_id, fallback_name, capitalize) VALUES (?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET fallback_name = excluded.fallback_name, capitalize = excluded.capitalize`,
    [userId, fallbackName, capitalize ? 1 : 0],
  );

export const folderOwned = async (userId: number, id: number) => !!(await db.one("SELECT 1 FROM library_folders WHERE id = ? AND user_id = ?", [id, userId]));
export const addFolder = (userId: number, name: string) => db.run("INSERT INTO library_folders (user_id, name) VALUES (?, ?)", [userId, name]);
export const deleteFolder = (userId: number, id: number) => db.run("DELETE FROM library_folders WHERE id = ? AND user_id = ?", [id, userId]); // its messages stay, without a folder

export type MessageInput = { title: string; text: string; price: number; aiPricing: boolean; folderId: number | null; accountIds: string[] };
export const addMessage = (userId: number, m: MessageInput) =>
  db.run(
    "INSERT INTO library_messages (user_id, folder_id, title, text, price, ai_pricing, account_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?)",
    [userId, m.folderId, m.title, m.text, m.price, m.aiPricing ? 1 : 0, JSON.stringify(m.accountIds), Date.now()],
  );
export async function updateMessage(userId: number, id: number, m: MessageInput): Promise<number> {
  return db.run(
    "UPDATE library_messages SET folder_id = ?, title = ?, text = ?, price = ?, ai_pricing = ?, account_ids = ?::jsonb WHERE id = ? AND user_id = ?",
    [m.folderId, m.title, m.text, m.price, m.aiPricing ? 1 : 0, JSON.stringify(m.accountIds), id, userId],
  );
}
export const deleteMessage = (userId: number, id: number) => db.run("DELETE FROM library_messages WHERE id = ? AND user_id = ?", [id, userId]);
