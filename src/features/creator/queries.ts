import "server-only";
import { db } from "../../lib/db.ts";
import type { BioValues, Rule, RuleGroup } from "./schema.ts";
import type { ItemKind } from "./types.ts";

type BioRow = { bio: BioValues; train: Record<string, string>; flags: { enabled: boolean; bump: boolean }; targeting: unknown; advanced: unknown; updated_at: number | null };
export async function bioRowOf(accountId: string): Promise<BioRow> {
  return (await db.one<BioRow>("SELECT bio, train, flags, targeting, advanced, updated_at FROM creator_bio WHERE account_id = ?", [accountId])) ?? { bio: {}, train: {}, flags: { enabled: true, bump: false }, targeting: {}, advanced: {}, updated_at: null };
}
const upsert = (column: "bio" | "train" | "flags" | "targeting" | "advanced", accountId: string, value: unknown) =>
  db.run(
    `INSERT INTO creator_bio (account_id, ${column}, updated_at) VALUES (?, ?::jsonb, ?)
     ON CONFLICT (account_id) DO UPDATE SET ${column} = excluded.${column}, updated_at = excluded.updated_at`,
    [accountId, JSON.stringify(value), Date.now()],
  );
export const saveBio = (accountId: string, bio: BioValues) => upsert("bio", accountId, bio);
export const saveTrain = (accountId: string, train: Record<string, string>) => upsert("train", accountId, train);
export const saveTargeting = (accountId: string, targeting: unknown) => upsert("targeting", accountId, targeting);
export const saveAdvanced = (accountId: string, advanced: unknown) => upsert("advanced", accountId, advanced);
export const saveFlags = (accountId: string, flags: BioRow["flags"]) => upsert("flags", accountId, flags);

type ItemRow = { id: number; live: number; data: unknown };
export const itemsOf = (accountId: string, kind: ItemKind) => db.all<ItemRow>("SELECT id, live, data FROM creator_items WHERE account_id = ? AND kind = ? ORDER BY id", [accountId, kind]);
export const addItem = (accountId: string, kind: ItemKind, live: boolean, data: unknown) =>
  db.run("INSERT INTO creator_items (account_id, kind, live, data, created_at) VALUES (?, ?, ?, ?::jsonb, ?)", [accountId, kind, live ? 1 : 0, JSON.stringify(data), Date.now()]);
export const updateItem = (accountId: string, id: number, kind: ItemKind, live: boolean, data: unknown) =>
  db.run("UPDATE creator_items SET live = ?, data = ?::jsonb WHERE id = ? AND account_id = ? AND kind = ?", [live ? 1 : 0, JSON.stringify(data), id, accountId, kind]);
export const deleteItem = (accountId: string, id: number) => db.run("DELETE FROM creator_items WHERE id = ? AND account_id = ?", [id, accountId]);
export async function countItems(accountId: string): Promise<Record<ItemKind, number>> {
  const rows = await db.all<{ kind: ItemKind; n: number }>("SELECT kind, COUNT(*) AS n FROM creator_items WHERE account_id = ? GROUP BY kind", [accountId]);
  const out: Record<ItemKind, number> = { update: 0, product: 0, bump: 0, script: 0, sample: 0, fanlist: 0, flow: 0 };
  for (const r of rows) out[r.kind] = r.n;
  return out;
}
/** Live updates that have not run out, for the limit of 7 (and later for the assistant's prompt). */
export async function activeUpdates(accountId: string, exceptId = 0): Promise<number> {
  const r = await db.one<{ n: number }>("SELECT COUNT(*) AS n FROM creator_items WHERE account_id = ? AND kind = 'update' AND live = 1 AND (data->>'endsAt')::bigint > ? AND id <> ?", [accountId, Date.now(), exceptId]);
  return r!.n;
}
export async function itemExists(accountId: string, kind: ItemKind, id: number): Promise<boolean> {
  return !!(await db.one("SELECT 1 FROM creator_items WHERE id = ? AND account_id = ? AND kind = ?", [id, accountId, kind]));
}

// ---- "Request from Creator" links
export const addRequest = (hash: string, accountId: string, expiresAt: number) =>
  db.run("INSERT INTO creator_requests (token_hash, account_id, expires_at, created_at) VALUES (?, ?, ?, ?)", [hash, accountId, expiresAt, Date.now()]);
export const purgeRequests = () => db.run("DELETE FROM creator_requests WHERE expires_at < ?", [Date.now()]);
/** The account a live link belongs to, with the name to show on the page. */
export const requestAccount = (hash: string) =>
  db.one<{ account_id: string; name: string }>(
    "SELECT r.account_id, COALESCE(a.display_name, a.username, 'the creator') AS name FROM creator_requests r JOIN accounts a ON a.account_id = r.account_id WHERE r.token_hash = ? AND r.expires_at > ?",
    [hash, Date.now()],
  );

// ---- fan list members
export const addMembers = (listId: number, fanIds: string[]) =>
  fanIds.length ? db.run("INSERT INTO creator_list_members (list_id, fan_id) SELECT ?, unnest(?::text[]) ON CONFLICT DO NOTHING", [listId, fanIds]) : Promise.resolve(0);
export async function memberCount(listId: number): Promise<number> {
  return (await db.one<{ n: number }>("SELECT COUNT(*) AS n FROM creator_list_members WHERE list_id = ?", [listId]))!.n;
}
/** True if the fan is on any of these lists (of this account: list ids are item ids). */
export async function onAnyList(accountId: string, fanId: string, listIds: number[]): Promise<boolean> {
  if (!listIds.length) return false;
  return !!(await db.one("SELECT 1 FROM creator_list_members m JOIN creator_items i ON i.id = m.list_id WHERE m.fan_id = ? AND i.account_id = ? AND m.list_id = ANY(?::int[])", [fanId, accountId, listIds]));
}
/** Takes one unfinished OnlyFans list copy for a minute (two workers never take the same one). */
export async function claimListSync(): Promise<{ id: number; account_id: string; data: { ofId: string; cursor?: string | null } } | undefined> {
  const now = Date.now();
  return db.one(
    `UPDATE creator_items SET data = jsonb_set(data, '{leaseUntil}', to_jsonb(?::bigint))
     WHERE id = (SELECT id FROM creator_items WHERE kind = 'fanlist' AND (data->>'ofId') IS NOT NULL AND COALESCE((data->>'done')::boolean, true) = false AND COALESCE((data->>'leaseUntil')::bigint, 0) < ? ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING id, account_id, data`,
    [now + 60_000, now],
  );
}
export const saveListProgress = (id: number, patch: Record<string, unknown>) => db.run("UPDATE creator_items SET data = data || ?::jsonb WHERE id = ?", [JSON.stringify(patch), id]);


// ---- fans matching rules (the Fan Lists page)

const FIELD_SQL: Record<Rule["field"], string> = {
  spend: "total_spend",
  lastMessage: "((? - COALESCE(last_message_at, 0)) / 86400000.0)",
  subscribed: "((? - subscribed_at) / 86400000.0)",
  jazz: "mode",
  escalation: "(handoff_reason IS NOT NULL)",
};
function condOf(g: RuleGroup, now: number): { sql: string; params: unknown[] } | null {
  const parts: { sql: string; params: unknown[] }[] = [];
  for (const x of g.rules) {
    if ("rules" in x) { const c = condOf(x, now); if (c) parts.push(c); continue; }
    const needsNow = x.field === "lastMessage" || x.field === "subscribed";
    if (x.field === "jazz") parts.push({ sql: "mode = ?", params: [x.value] });
    else if (x.field === "escalation") parts.push({ sql: `${FIELD_SQL.escalation} = ?`, params: [x.value === "yes"] });
    else parts.push({ sql: `${FIELD_SQL[x.field]} ${x.op} ?`, params: [...(needsNow ? [now] : []), Number(x.value)] });
  }
  return parts.length ? { sql: `(${parts.map((p) => p.sql).join(g.match === "all" ? " AND " : " OR ")})`, params: parts.flatMap((p) => p.params) } : null;
}
type FanRow = { fan_id: string; username: string | null; name: string | null; total_spend: number; last_message_at: number | null; subscribed_at: number | null; mode: string; avatar_url: string | null };
export async function fansMatching(accountId: string, rules: RuleGroup, search: string, now: number, page: { page: number; size: number; desc: boolean } = { page: 1, size: 50, desc: true }) {
  const where = ["account_id = ?"];
  const params: unknown[] = [accountId];
  const c = condOf(rules, now);
  if (c) { where.push(c.sql); params.push(...c.params); }
  const q = search.trim().toLowerCase().slice(0, 60);
  if (q) { where.push("(LOWER(COALESCE(username, '')) LIKE ? OR LOWER(COALESCE(name, '')) LIKE ?)"); params.push(`%${q}%`, `%${q}%`); }
  const sum = await db.one<{ n: number; spend: number; b0: number; b1: number; b2: number; b3: number }>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(total_spend), 0) AS spend,
       COUNT(*) FILTER (WHERE total_spend <= 0) AS b0, COUNT(*) FILTER (WHERE total_spend > 0 AND total_spend < 50) AS b1,
       COUNT(*) FILTER (WHERE total_spend >= 50 AND total_spend < 200) AS b2, COUNT(*) FILTER (WHERE total_spend >= 200) AS b3
     FROM fans WHERE ${where.join(" AND ")}`, params);
  const rows = await db.all<FanRow>(`SELECT fan_id, username, name, total_spend, last_message_at, subscribed_at, mode, avatar_url FROM fans WHERE ${where.join(" AND ")} ORDER BY total_spend ${page.desc ? "DESC" : "ASC"}, fan_id LIMIT ? OFFSET ?`, [...params, page.size, (page.page - 1) * page.size]);
  return { sum: sum!, rows };
}

