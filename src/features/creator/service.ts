import "server-only";
import crypto from "node:crypto";
import { singleton } from "../../lib/singleton.ts";
import { HttpError } from "../../lib/http.ts";
import { setAiEnabled } from "../accounts/queries.ts";
import { apiFor, requireConnection } from "../accounts/service.ts";
import { rateLimit } from "../auth/service.ts";
import * as q from "./queries.ts";
import { getAccount } from "../accounts/queries.ts";
import { getFan, herTypicalWords, recentMessages, recentPpvs, setFanStats, widelySent, type Fan } from "../inbox/queries.ts";
import { htmlToText } from "../inbox/service.ts";
import { config } from "../../lib/config.ts";
import { bioEmojis, buildWriterContext, closestAnswer, cleanAdvanced, cleanGroup, cleanBio, cleanTargeting, fanTurnsSince, isBuiltInSample, MAX_LIVE_UPDATES, type BioValues } from "./schema.ts";
import type { CreatorView, FanPreview, Item, ItemData, ItemKind, OfList, SentPpv, VaultFolder } from "./types.ts";

// ---- bio, train and flags
export async function creatorOf(accountId: string): Promise<CreatorView> {
  const [row, counts] = await Promise.all([q.bioRowOf(accountId), q.countItems(accountId)]);
  return { values: row.bio, train: row.train, flags: row.flags, targeting: cleanTargeting(row.targeting), advanced: cleanAdvanced(row.advanced), updatedAt: row.updated_at, counts };
}
/** The master switch on the Creator tab. Off = the assistant writes nothing for this account (default: on). */
export async function creatorEnabled(accountId: string): Promise<boolean> {
  return (await q.bioRowOf(accountId)).flags.enabled;
}
export const updateAdvanced = (accountId: string, raw: unknown) => q.saveAdvanced(accountId, cleanAdvanced(raw));
export async function updateTargeting(accountId: string, patch: { chats?: unknown; bump?: unknown }): Promise<void> {
  const cur = cleanTargeting((await q.bioRowOf(accountId)).targeting);
  await q.saveTargeting(accountId, cleanTargeting({ chats: patch.chats ?? cur.chats, bump: patch.bump ?? cur.bump }));
}
export const updateBio = (accountId: string, values: BioValues) => q.saveBio(accountId, cleanBio(values));

export async function updateTrain(accountId: string, key: string, response: string): Promise<void> {
  const custom = /^custom\/(\d{1,9})$/.exec(key);
  if (!isBuiltInSample(key) && !(custom && (await q.itemExists(accountId, "sample", Number(custom[1]))))) throw new HttpError(404, "Unknown sample");
  const { train } = await q.bioRowOf(accountId);
  const text = response.trim();
  if (text) train[key] = text;
  else delete train[key];
  await q.saveTrain(accountId, train);
}

/** Copies the bio answers, or the Train answers to the built-in samples, from another account of the same user. */
export async function copyFrom(what: "bio" | "train", toAccountId: string, fromAccountId: string): Promise<void> {
  const from = await q.bioRowOf(fromAccountId);
  if (what === "bio") {
    await q.saveBio(toAccountId, from.bio);
    return;
  }
  const { train } = await q.bioRowOf(toAccountId);
  for (const [key, v] of Object.entries(from.train)) if (isBuiltInSample(key)) train[key] = v; // custom samples are per account
  await q.saveTrain(toAccountId, train);
}

export async function updateFlags(userId: number, accountId: string, patch: { enabled?: boolean; bump?: boolean; handleChats?: boolean }): Promise<void> {
  if (patch.handleChats !== undefined) {
    if (patch.handleChats) await requireConnection(userId); // same rule as the Assistant settings: AI needs a connection
    await setAiEnabled(accountId, patch.handleChats);
  }
  const { flags } = await q.bioRowOf(accountId);
  await q.saveFlags(accountId, { enabled: patch.enabled ?? flags.enabled, bump: patch.bump ?? flags.bump });
}

// ---- items
export async function itemsOf<K extends ItemKind>(accountId: string, kind: K): Promise<Item<K>[]> {
  return (await q.itemsOf(accountId, kind)).map((r) => ({ id: r.id, live: !!r.live, data: r.data as ItemData[K] }));
}
async function checkLimit(accountId: string, kind: ItemKind, live: boolean, data: unknown, id = 0) {
  if (kind === "update" && live && (data as ItemData["update"]).endsAt > Date.now() && (await q.activeUpdates(accountId, id)) >= MAX_LIVE_UPDATES)
    throw new HttpError(400, `You can have up to ${MAX_LIVE_UPDATES} active live updates at a time.`);
}
export async function createItem(accountId: string, kind: ItemKind, live: boolean, data: unknown): Promise<void> {
  await checkLimit(accountId, kind, live, data);
  await q.addItem(accountId, kind, live, data);
}
export async function saveItem(accountId: string, id: number, kind: ItemKind, live: boolean, data: unknown): Promise<void> {
  await checkLimit(accountId, kind, live, data, id);
  if (!(await q.updateItem(accountId, id, kind, live, data))) throw new HttpError(404, "Not found");
}
export async function removeItem(accountId: string, id: number): Promise<void> {
  await q.deleteItem(accountId, id);
  const { train } = await q.bioRowOf(accountId);
  if (train[`custom/${id}`] !== undefined) { // a deleted custom sample takes its answer with it
    delete train[`custom/${id}`];
    await q.saveTrain(accountId, train);
  }
}

// ---- Request from Creator: a link to a page where the creator fills in her own bio
const WEEK = 7 * 24 * 60 * 60 * 1000;
const sha = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const validToken = (token: string | undefined): token is string => !!token && /^[A-Za-z0-9_-]{43}$/.test(token);

export async function createBioRequest(accountId: string): Promise<string> {
  await q.purgeRequests();
  const token = crypto.randomBytes(32).toString("base64url");
  await q.addRequest(sha(token), accountId, Date.now() + WEEK);
  return token;
}
async function liveRequest(token: string | undefined) {
  if (!validToken(token)) throw new HttpError(404, "This link is not valid.");
  await rateLimit(`bioreq:${sha(token)}`, 60, 10 * 60 * 1000); // the link is a secret, but a guessing or flooding loop still stops
  const r = await q.requestAccount(sha(token));
  if (!r) throw new HttpError(404, "This link is not valid or has expired.");
  return r;
}
export async function requestedBio(token: string | undefined): Promise<{ name: string; values: BioValues }> {
  const r = await liveRequest(token);
  return { name: r.name, values: (await q.bioRowOf(r.account_id)).bio };
}
/** The creator's answers are merged over what is saved, so a question she leaves untouched keeps its answer. */
export async function saveRequestedBio(token: string | undefined, values: BioValues): Promise<void> {
  const r = await liveRequest(token);
  await q.saveBio(r.account_id, cleanBio({ ...(await q.bioRowOf(r.account_id)).bio, ...values }));
}

// ---- Vault: pick media from the creator's own Vault
type VaultCache = Map<string, string>;
const thumbs = () => singleton<VaultCache>("vault-thumbs", () => new Map()); // "account:media id" -> the provider's thumbnail link (links expire, so a miss or a dead link is looked up again)
export type VaultItem = { id: string; type: string; duration: number | null; createdAt: string | null };

/** Remembers the thumbnail links of a listing and returns the items that can be shown. */
function remember(accountId: string, media: unknown): VaultItem[] {
  const cache = thumbs();
  if (cache.size > 3000) cache.clear();
  const items: VaultItem[] = [];
  for (const m of Array.isArray(media) ? media : []) {
    const thumb = m?.downloadUrls?.thumb ?? m?.downloadUrls?.preview;
    if (m?.id == null || !m.canView || m.hasError || typeof thumb !== "string") continue;
    cache.set(`${accountId}:${m.id}`, thumb);
    items.push({ id: String(m.id), type: String(m.type ?? "photo"), duration: typeof m.duration === "number" ? m.duration : null, createdAt: typeof m.createdAt === "string" ? m.createdAt : null });
  }
  return items;
}

export async function vaultPage(userId: number, accountId: string, o: { cursor?: string; folder?: string; type?: string; query?: string } = {}): Promise<{ items: VaultItem[]; cursor: string | null; hasMore: boolean }> {
  const r = await (await apiFor(userId)).vaultMedia(accountId, o);
  if (!r.ok) throw new HttpError(502, "Could not read the Vault right now.");
  return { items: remember(accountId, r.body?.media), cursor: typeof r.body?.cursor === "string" ? r.body.cursor : null, hasMore: !!r.body?.hasMore };
}

const SCAN_PAGES = 6; // up to 240 items are read to find one picture again
const scans = () => singleton<Map<string, Promise<void>>>("vault-scans", () => new Map());
/** Reads the Vault page by page until the item's link is known again (the provider has no "get one item"). One scan per account at a time. */
async function findAgain(userId: number, accountId: string, mediaId: string): Promise<void> {
  const running = scans().get(accountId);
  if (running) return running;
  const job = (async () => {
    let cursor: string | undefined;
    for (let i = 0; i < SCAN_PAGES; i++) {
      const r = await (await apiFor(userId)).vaultMedia(accountId, { cursor });
      if (!r.ok) return;
      remember(accountId, r.body?.media);
      if (thumbs().has(`${accountId}:${mediaId}`) || !r.body?.hasMore || typeof r.body?.cursor !== "string") return;
      cursor = r.body.cursor;
    }
  })().finally(() => scans().delete(accountId));
  scans().set(accountId, job);
  return job;
}

/** The thumbnail of one Vault item, found again (and its link refreshed) if the link is unknown or has expired. */
export async function vaultThumb(userId: number, accountId: string, mediaId: string): Promise<Response | null> {
  const key = `${accountId}:${mediaId}`;
  const fetchIt = async () => {
    const url = thumbs().get(key);
    const res = url ? await (await apiFor(userId)).download(url) : null;
    return res?.ok ? res : null;
  };
  const first = await fetchIt();
  if (first) return first;
  thumbs().delete(key);
  await findAgain(userId, accountId, mediaId);
  return fetchIt();
}

export async function vaultFolders(userId: number, accountId: string): Promise<VaultFolder[]> {
  const r = await (await apiFor(userId)).vaultFolders(accountId);
  if (!r.ok) throw new HttpError(502, "Could not read the Vault folders right now.");
  return (Array.isArray(r.body?.categories) ? r.body.categories : []).filter((c: any) => c?.id != null && c.hasMedia).map((c: any) => ({ id: String(c.id), name: htmlToText(String(c.name ?? "Folder")), photos: Number(c.photosCount) || 0, videos: (Number(c.videosCount) || 0) + (Number(c.gifsCount) || 0), audios: Number(c.audiosCount) || 0 }));
}

/** The creator's own OnlyFans lists (to copy one as a fan list). */
export async function ofLists(userId: number, accountId: string): Promise<OfList[]> {
  const r = await (await apiFor(userId)).lists(accountId);
  if (!r.ok) throw new HttpError(502, "Could not read your OnlyFans lists right now.");
  return (Array.isArray(r.body?.lists) ? r.body.lists : []).filter((l: any) => l?.id != null).map((l: any) => ({ id: String(l.id), name: htmlToText(String(l.name ?? "List")), type: String(l.type ?? ""), usersCount: Number(l.usersCount) || 0 }));
}

/** PPVs sent from this account, from the chats we have stored. */
export async function sentPpvs(accountId: string): Promise<SentPpv[]> {
  return (await recentPpvs(accountId)).map((p) => ({ text: p.text, price: p.price, sentAt: p.sentAt, media: p.media.map((m) => ({ id: String(m.id), type: m.type })) }));
}

/** Best sent PPVs / mass messages: what reached the most fans (a purchase is not linked to one message, so this is reach, not sales). */
export async function widelySentMessages(accountId: string, kind: "best" | "mass"): Promise<SentPpv[]> {
  return (await widelySent(accountId, kind)).map((p) => ({ text: p.text, price: p.price, sentAt: p.sentAt, fans: p.fans, media: p.media.map((m) => ({ id: String(m.id), type: m.type })) }));
}

// ---- fan lists copied from OnlyFans: the members arrive a few pages at a time (the worker calls runListSyncs)
const LIST_CAP = 2000; // the first 2000 members of a list are copied

export async function importOfList(userId: number, accountId: string, name: string, ofId: string): Promise<void> {
  const lists = await ofLists(userId, accountId);
  const list = lists.find((l) => l.id === ofId);
  if (!list) throw new HttpError(404, "That OnlyFans list was not found.");
  await q.addItem(accountId, "fanlist", true, { name, ofId, count: 0, total: list.usersCount, done: false, cursor: null });
}

/** One step of copying a list: reads the next pages of members. Safe to call often; a failed step is retried in five minutes. */
export async function runListSyncs(): Promise<void> {
  const row = await q.claimListSync();
  if (!row) return;
  try {
    const account = await getAccount(row.account_id);
    if (!account) throw new Error("account gone");
    const r = await (await apiFor(account.user_id)).listMembers(row.account_id, row.data.ofId, row.data.cursor ?? undefined, 5);
    if (!r.ok) throw new Error(`provider ${r.status}`);
    await q.addMembers(row.id, (Array.isArray(r.body?.users) ? r.body.users : []).filter((u: any) => u?.id != null).map((u: any) => String(u.id)));
    const count = await q.memberCount(row.id);
    const more = !!r.body?.hasMore && typeof r.body?.cursor === "string";
    await q.saveListProgress(row.id, { cursor: more ? r.body.cursor : null, done: !more || count >= LIST_CAP, capped: more && count >= LIST_CAP, count, leaseUntil: 0 });
  } catch (err) {
    console.error("[creator] list copy step failed:", err instanceof Error ? err.message : err);
    await q.saveListProgress(row.id, { leaseUntil: Date.now() + 5 * 60_000 });
  }
}

// ---- real fan data (spend, subscribe date) for the targeting rules
const STATS_TTL = 6 * 60 * 60 * 1000;
/** The fan with spend and subscribe date read from the provider if ours are older than six hours. A provider error keeps what we have. */
async function withStats(userId: number, accountId: string, fan: Fan): Promise<Fan> {
  if (fan.stats_at && Date.now() - fan.stats_at < STATS_TTL) return fan;
  try {
    const api = await apiFor(userId);
    let total: number | null = null;
    let since: number | null = null;
    const spend = await api.fansSpend(accountId, [fan.fan_id]);
    const row = spend.ok ? spend.body?.fans?.[0] : null;
    if (row?.available !== false && typeof row?.total === "number") total = row.total;
    if (fan.username) {
      const found = await api.fansSearch(accountId, fan.username);
      const mine = found.ok ? (found.body?.fans ?? []).find((f: any) => String(f?.id) === fan.fan_id) : null;
      if (mine?.subscribedAt && Number.isFinite(Date.parse(mine.subscribedAt))) since = Date.parse(mine.subscribedAt);
    }
    await setFanStats(accountId, fan.fan_id, total, since);
    return (await getFan(accountId, fan.fan_id)) ?? fan;
  } catch {
    return fan;
  }
}

/** Why the writer must not handle this fan (a reason to show the team), or null if it may. Checks the "Choose who messages" rules. */
export async function targetingVerdict(userId: number, accountId: string, fanId: string): Promise<string | null> {
  const t = cleanTargeting((await q.bioRowOf(accountId)).targeting).chats;
  const stat = t.highSpender.on || t.newFans.on || t.oldFans.on || t.timeWasters.on;
  if (!stat && !t.excludeLists.length && !t.onlyOnLists) return null;
  if (t.onlyOnLists && !(await q.onAnyList(accountId, fanId, t.onlyLists))) return "not on the fan lists the writer is limited to";
  if (t.excludeLists.length && (await q.onAnyList(accountId, fanId, t.excludeLists))) return "on an excluded fan list";
  if (!stat) return null;
  const found = await getFan(accountId, fanId);
  if (!found) return null;
  const fan = await withStats(userId, accountId, found);
  if (t.highSpender.on && fan.total_spend >= t.highSpender.amount) return `high spender ($${fan.total_spend} spent, limit $${t.highSpender.amount})`;
  if (fan.subscribed_at) {
    const days = (Date.now() - fan.subscribed_at) / 86_400_000;
    if (t.newFans.on && days < t.newFans.days) return `new fan (subscribed ${Math.floor(days)} days ago, limit ${t.newFans.days})`;
    if (t.oldFans.on && days > t.oldFans.days) return `old fan (subscribed ${Math.floor(days)} days ago, limit ${t.oldFans.days})`;
  }
  if (t.timeWasters.on) {
    const w = t.timeWasters;
    const limit = fan.total_spend <= 0 ? w.noSpend : fan.total_spend >= w.overAmount ? w.overAfter : w.underAfter;
    const turns = fanTurnsSince(await recentMessages(accountId, fanId, 300), fan.last_paid_at);
    if (limit > 0 && turns >= limit) return `time waster (${turns} messages since the last purchase, limit ${limit})`;
  }
  return null;
}

// ---- what the writer is told about the creator
/** The profile text for the writer prompt (Bio, Train answers, live updates, live products) and the product prices it may quote. */
export async function writerContext(accountId: string, focus?: string): Promise<{ text: string; prices: number[]; botAnswer: boolean; lowercase: boolean; emojis: string[]; maxWords: number; fallback: string; closest: string | null }> {
  const [typical, row, updates, products, samples, scripts] = await Promise.all([herTypicalWords(accountId), q.bioRowOf(accountId), itemsOf(accountId, "update"), itemsOf(accountId, "product"), itemsOf(accountId, "sample"), itemsOf(accountId, "script")]);
  const now = Date.now();
  const live = products.filter((p) => p.live);
  return {
    text: buildWriterContext({
      bio: row.bio,
      train: row.train,
      customSamples: samples.map((x) => ({ id: x.id, title: x.data.title, fan: x.data.fan })),
      updates: updates.filter((u) => u.live && u.data.endsAt > now).map((u) => u.data.content),
      products: live.map((p) => p.data),
      scripts: scripts.filter((x) => x.live && ["jazz", "keywords"].includes(x.data.startsOn ?? "jazz")).map((x) => x.data), // event scripts start on their event; keyword ones are also a hint for the writer
      focus,
      typicalWords: typical ?? undefined,
      // a small local model reads about 35 tokens a second on a CPU: a shorter profile is the difference between 15 and 60 seconds
      ...(config.aiProvider === "ollama" ? { maxExamples: 3, maxChars: 3200 } : {}),
    }),
    prices: live.map((p) => p.data.price),
    lowercase: row.bio.capitalization === "Lowercase",
    emojis: bioEmojis(row.bio),
    fallback: closestAnswer(row.train, samples.map((x) => ({ id: x.id, fan: x.data.fan })), focus ?? "") ?? "mm keep going 😏 tell me more",
    closest: closestAnswer(row.train, samples.map((x) => ({ id: x.id, fan: x.data.fan })), focus ?? ""),
    maxWords: Math.min(40, Math.max(10, (typical ?? 8) * 2 + 2)), // twice her usual length is already long for her (8 words when we do not know yet)
    botAnswer: !!row.bio.not_creator_reply?.toString().trim(), // the creator wrote what to say, so the model may use it
  };
}


// ---- fan list rules: who matches (live preview)
export async function previewFans(accountId: string, rules: unknown, search: string, page = { page: 1, size: 50, desc: true }): Promise<FanPreview> {
  const { sum, rows } = await q.fansMatching(accountId, cleanGroup(rules), search, Date.now(), page);
  return {
    total: sum.n, spend: sum.spend, buckets: [sum.b0, sum.b1, sum.b2, sum.b3],
    fans: rows.map((r) => ({ id: r.fan_id, username: r.username, name: r.name, spend: r.total_spend, lastMessageAt: r.last_message_at, subscribedAt: r.subscribed_at, human: r.mode === "human", avatar: r.avatar_url })),
  };
}
