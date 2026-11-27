// Creator endpoints. Every one is for one of the user's own accounts.
import "server-only";
import { z } from "zod";
import { config } from "../../lib/config.ts";
import { HttpError, must, parseBody, type Ctx, type Handler, type PublicHandler } from "../../lib/http.ts";
import { ownedAccount } from "../accounts/queries.ts";
import { requireAccount } from "../accounts/service.ts";
import { isAvatarUrl } from "../inbox/schema.ts";
import { BUMP_TRIGGERS, SCRIPT_TRIGGERS } from "./schema.ts";
import { previewFans, copyFrom, createBioRequest, createItem, creatorOf, itemsOf, importOfList, removeItem, requestedBio, saveItem, saveRequestedBio, sentPpvs, widelySentMessages, updateAdvanced, updateBio, updateFlags, updateTargeting, updateTrain, vaultFolders, vaultPage, vaultThumb, ofLists } from "./service.ts";
import type { ItemKind } from "./types.ts";

const BioBody = z.object({ values: z.record(z.string().max(40), z.union([z.string().max(2000), z.array(z.string().max(80)).max(40)])) });
const text = (max: number) => z.string().trim().max(max);
const ITEM_DATA = {
  product: z.object({ name: text(80).min(1, "Give the product a name"), price: z.number().min(0).max(10000), description: text(1000), tags: z.array(text(40)).max(20), progression: z.number().int().min(1).max(4), bundle: z.boolean(), media: z.array(z.object({ id: text(80), type: text(20), free: z.boolean().optional() })).max(200) }),
  bump: z.object({ message: text(1000).min(1, "Write the message"), price: z.number().min(0).max(500), trigger: z.enum(BUMP_TRIGGERS), media: z.array(z.object({ id: text(80), type: text(20), free: z.boolean().optional() })).max(200).default([]), onlyLists: z.array(z.number().int()).max(200).default([]), neverLists: z.array(z.number().int()).max(200).default([]) }),
  script: z.object({ name: text(80).min(1, "Give the script a name"), trigger: text(300).min(1, "Describe when the script starts"), steps: z.array(text(1000).min(1)).min(1, "Add at least one message").max(20), expiresHours: z.number().min(0).max(720).optional(), exitOn: z.boolean().optional(), startsOn: z.enum(["jazz", "keywords", "content", "subscribe", "resubscribe", "online", "like", "tip", "buy", "expire"]).optional(), keywords: z.array(text(40).min(1)).max(20).optional(), stepOptions: z.array(z.object({ mode: z.enum(["exact", "rewrite"]).optional(), afterReply: z.boolean().optional(), waitMinutes: z.number().min(0).max(10080).optional(), productId: z.number().int().min(0).nullable().optional() })).max(20).optional(), exitLimit: z.number().int().min(1).max(50).optional() }).refine((x) => x.startsOn !== "keywords" || (x.keywords ?? []).some((k) => k.trim()), { message: "Add at least one keyword", path: ["keywords"] }),
  update: z.object({ content: text(500).min(1, "Write the update"), endsAt: z.number(), startsAt: z.number().optional() }),
  fanlist: z.object({ name: text(60).min(1, "Give the list a name"), ofId: z.string().max(40).nullable(), count: z.number().int().min(0).nullable(), rules: z.unknown().optional(), updatedAt: z.number().optional() }),
  flow: z.object({
    title: text(80).min(1, "Give the flow a title"),
    nodes: z.array(z.object({ id: text(40).min(1), kind: z.enum(["start", "delay", "condition", "message", "tag", "merge"]), parent: text(40).nullable(), branch: z.enum(["true", "false"]).nullable(), config: z.record(z.string().max(40), z.union([z.string().max(2000), z.number(), z.boolean(), z.array(z.object({ id: text(80), type: text(20), free: z.boolean().optional() })).max(100)])) })).min(1).max(80),
    exit: z.object({ superFan: z.boolean(), spentOn: z.boolean(), spent: z.number().min(0).max(1_000_000) }),
    goal: z.object({ on: z.boolean(), amount: z.number().min(0).max(1_000_000) }),
    status: z.enum(["draft", "active", "stopped"]),
    editedAt: z.number(),
  }),
  sample: z.object({ category: text(40).min(1, "Choose a category"), title: text(80).min(1, "Give the sample a title"), fan: z.array(text(500).min(1)).min(1, "Add at least one fan message").max(10) }),
} as const;
const Kind = z.enum(["update", "product", "bump", "script", "sample", "fanlist", "flow"]);
const ItemBody = z.object({ kind: Kind, live: z.boolean(), data: z.unknown() });

const idOf = (ctx: Ctx, key: string) => must(/^\d{1,9}$/.test(ctx.params[key] ?? "") ? Number(ctx.params[key]) : null);
const accountId = async (ctx: Ctx) => (await requireAccount(ctx)).account_id;
const itemBody = async (ctx: Ctx) => {
  const b = parseBody(ItemBody, await ctx.json());
  return { kind: b.kind as ItemKind, live: b.live, data: parseBody(ITEM_DATA[b.kind] as z.ZodType<unknown>, b.data, b.kind) };
};

export const creatorHandler: Handler = async (ctx) => creatorOf(await accountId(ctx));
export const saveBioHandler: Handler = async (ctx) => {
  const id = await accountId(ctx);
  await updateBio(id, parseBody(BioBody, await ctx.json()).values);
  return { ok: true };
};
export const trainHandler: Handler = async (ctx) => {
  const b = parseBody(z.object({ key: z.string().max(60), response: z.string().max(2000) }), await ctx.json());
  await updateTrain(await accountId(ctx), b.key, b.response);
  return { ok: true };
};
export const copyBioHandler: Handler = async (ctx) => {
  const to = await accountId(ctx);
  const b = parseBody(z.object({ fromAccountId: z.string().max(80), what: z.enum(["bio", "train"]).default("bio") }), await ctx.json());
  must(await ownedAccount(ctx.user.id, b.fromAccountId)); // only the user's own accounts
  await copyFrom(b.what, to, b.fromAccountId);
  return { ok: true };
};
export const flagsHandler: Handler = async (ctx) => {
  const patch = parseBody(z.object({ enabled: z.boolean().optional(), bump: z.boolean().optional(), handleChats: z.boolean().optional() }), await ctx.json());
  await updateFlags(ctx.user.id, await accountId(ctx), patch);
  return { ok: true };
};
export const listItemsHandler: Handler = async (ctx) => ({ items: await itemsOf(await accountId(ctx), parseBody(Kind, ctx.url.searchParams.get("kind"), "kind")) });
export const addItemHandler: Handler = async (ctx) => {
  const id = await accountId(ctx);
  const b = await itemBody(ctx);
  await createItem(id, b.kind, b.live, b.data);
  return { ok: true };
};
export const updateItemHandler: Handler = async (ctx) => {
  const id = await accountId(ctx);
  const b = await itemBody(ctx);
  await saveItem(id, idOf(ctx, "itemId"), b.kind, b.live, b.data);
  return { ok: true };
};
export const deleteItemHandler: Handler = async (ctx) => {
  const id = await accountId(ctx);
  await removeItem(id, idOf(ctx, "itemId"));
  return { ok: true };
};

/** The creator's own profile photo, fetched from the stored provider address and served from our origin (CSP keeps `img-src 'self'`). */
export const photoHandler: Handler = async (ctx) => {
  const account = await requireAccount(ctx);
  if (!isAvatarUrl(account.avatar_url)) throw new HttpError(404, "Not found");
  let res: Response;
  try {
    res = await fetch(account.avatar_url, { signal: AbortSignal.timeout(8_000) });
  } catch {
    throw new HttpError(404, "Photo not available"); // the page falls back to initials
  }
  if (!res.ok || !res.body || !(res.headers.get("content-type") ?? "").startsWith("image/")) throw new HttpError(404, "Photo not available");
  return new Response(res.body, { headers: { "Content-Type": res.headers.get("content-type")!, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
};

/** Makes a link the creator can open to fill in her own bio (valid 7 days). */
export const requestLinkHandler: Handler = async (ctx) => {
  const token = await createBioRequest(await accountId(ctx));
  return { url: `${config.publicUrl ?? ctx.url.origin}/request/${token}` };
};
// The two handlers below are public: the link itself is the secret (43 random characters, only its hash is stored, 7 days, rate limited).
export const requestGetHandler: PublicHandler = async (ctx) => requestedBio(ctx.params.token);
export const requestSaveHandler: PublicHandler = async (ctx) => {
  await saveRequestedBio(ctx.params.token, parseBody(BioBody, await ctx.json()).values);
  return { ok: true };
};

export const vaultHandler: Handler = async (ctx) => {
  const p = ctx.url.searchParams;
  const type = p.get("type") ?? "";
  return vaultPage(ctx.user.id, await accountId(ctx), {
    cursor: p.get("cursor") ?? undefined,
    folder: p.get("folder")?.replace(/\D/g, "").slice(0, 20) || undefined, // folder ids are numbers
    type: ["photo", "video", "audio", "gif"].includes(type) ? type : undefined,
    query: p.get("query")?.trim().slice(0, 80) || undefined,
  });
};
export const vaultFoldersHandler: Handler = async (ctx) => ({ folders: await vaultFolders(ctx.user.id, await accountId(ctx)) });
export const ofListsHandler: Handler = async (ctx) => ({ lists: await ofLists(ctx.user.id, await accountId(ctx)) });
export const ppvsHandler: Handler = async (ctx) => {
  const kind = ctx.url.searchParams.get("kind");
  const id = await accountId(ctx);
  return { ppvs: kind === "best" || kind === "mass" ? await widelySentMessages(id, kind) : await sentPpvs(id) };
};
export const advancedHandler: Handler = async (ctx) => {
  await updateAdvanced(await accountId(ctx), parseBody(z.unknown(), await ctx.json()));
  return { ok: true };
};
export const fanPreviewHandler: Handler = async (ctx) => {
  const b = parseBody(z.object({ rules: z.unknown(), q: z.string().max(60).optional(), page: z.number().int().min(1).max(100000).optional(), size: z.number().int().min(5).max(100).optional(), desc: z.boolean().optional() }), await ctx.json());
  return previewFans(await accountId(ctx), b.rules, b.q ?? "", { page: b.page ?? 1, size: b.size ?? 10, desc: b.desc ?? true });
};
export const targetingHandler: Handler = async (ctx) => {
  const b = parseBody(z.object({ chats: z.unknown().optional(), bump: z.unknown().optional() }), await ctx.json());
  await updateTargeting(await accountId(ctx), b);
  return { ok: true };
};
export const vaultThumbHandler: Handler = async (ctx) => {
  const res = await vaultThumb(ctx.user.id, await accountId(ctx), (ctx.url.searchParams.get("id") ?? "").slice(0, 40));
  if (!res || !res.body || !(res.headers.get("content-type") ?? "").startsWith("image/")) throw new HttpError(404, "Not available");
  return new Response(res.body, { headers: { "Content-Type": res.headers.get("content-type")!, "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff" } });
};

export const importListHandler: Handler = async (ctx) => {
  const b = parseBody(z.object({ name: text(60).min(1, "Give the list a name"), ofId: z.string().regex(/^[\w-]{1,30}$/) }), await ctx.json());
  await importOfList(ctx.user.id, await accountId(ctx), b.name, b.ofId);
  return { ok: true };
};
