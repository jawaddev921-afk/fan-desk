// Assistant endpoints: plain functions (ctx) => data. src/app/api/**/route.ts wires them to URLs.
import "server-only";
import { config } from "../../lib/config.ts";
import { safeEqual } from "../../lib/crypto.ts";
import { HttpError, must, parseBody, type Ctx, type Handler, type PublicHandler } from "../../lib/http.ts";
import { ownedAccount } from "../accounts/queries.ts";
import { requireAccount, requireConnection } from "../accounts/service.ts";
import { purgeExpiredSessions, rateLimit } from "../auth/service.ts";
import { getFan, setFanMode } from "../inbox/queries.ts";
import { z } from "zod";
import { runListSyncs } from "../creator/service.ts";
import { purgeOldData, requireFanId, runInboxPolls, runSyncSteps } from "../inbox/service.ts";
import * as store from "./queries.ts";
import { ApproveBody, ReplyBody } from "./schema.ts";
import { checkLength, estimateCostUsd, previewReply, runWorkerTick } from "./service.ts";

/** The outbox item named in the URL, only if its account belongs to the logged-in user. */
async function ownedItem(ctx: Ctx) {
  const id = ctx.params.id ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, "Not found");
  const item = must(await store.getOutboxItem(id));
  must(await ownedAccount(ctx.user.id, item.account_id));
  return item;
}

export const approveHandler: Handler = async (ctx) => {
  const item = await ownedItem(ctx);
  if (item.status !== "draft") throw new HttpError(409, `Cannot approve an item that is ${item.status}`);
  const edited = (parseBody(ApproveBody, await ctx.json()).text ?? "").trim();
  checkLength(edited);
  const fan = await getFan(item.account_id, item.fan_id);
  if (item.source === "assistant" && fan?.mode === "human") throw new HttpError(409, "This fan was handed to a human; reply as a human instead.");
  await store.approveDraft(item.id, edited || null);
  return { ok: true };
};

export const rejectHandler: Handler = async (ctx) => {
  const item = await ownedItem(ctx);
  if (!["draft", "unknown", "failed"].includes(item.status)) throw new HttpError(409, `Cannot reject an item that is ${item.status}`);
  await store.rejectItem(item.id);
  return { ok: true };
};

export const usageHandler: Handler = async (ctx) => {
  const rows = await store.usageByModel((await requireAccount(ctx)).account_id, Date.now() - 30 * 24 * 60 * 60 * 1000);
  const total = rows.reduce((s, r) => s + estimateCostUsd(r.model, r.input, r.output), 0);
  return { days: 30, byModel: rows, estimatedCostUsd: Math.round(total * 10000) / 10000 };
};

export const regenerateHandler: Handler = async (ctx) => {
  const account = await requireAccount(ctx);
  const fan = must(await getFan(account.account_id, requireFanId(ctx.params.fanId)));
  if (fan.mode === "human") throw new HttpError(409, "This fan is with a human. Hand back to the AI first.");
  await store.scheduleReply(account.account_id, fan.fan_id, 0);
  return { ok: true };
};

export const replyHandler: Handler = async (ctx) => {
  const account = await requireAccount(ctx);
  const fan = must(await getFan(account.account_id, requireFanId(ctx.params.fanId)));
  const text = parseBody(ReplyBody, await ctx.json()).text.trim();
  if (!text) throw new HttpError(400, "Write a message first.");
  checkLength(text);
  await requireConnection(ctx.user.id);
  await setFanMode(account.account_id, fan.fan_id, "human", "replied from dashboard");
  return { ok: true, id: await store.createOutboxItem(account.account_id, fan.fan_id, text, "human", "queued") };
};

/**
 * Called every minute by the host's cron (vercel.json): drafts and sends what is due, continues the imports that are running, and once an hour cleans up.
 * Vercel sends `Authorization: Bearer <CRON_SECRET>`. Without CRON_SECRET the endpoint does not exist.
 */
export const cronTickHandler: PublicHandler = async ({ req }) => {
  const secret = config.cronSecret;
  if (!secret) return new Response("not found", { status: 404 });
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return new Response("unauthorized", { status: 401 });
  await Promise.all([runWorkerTick(), runSyncSteps(), runInboxPolls(), runListSyncs()]); // a long import must not delay sends, so they run side by side
  if (new Date().getUTCMinutes() === 0) {
    await purgeExpiredSessions();
    await purgeOldData();
  }
  return { ok: true };
};

/** "Try Jazz": the draft for a sample fan message. Limited per user because every call is a paid model call. */
export const previewHandler: Handler = async (ctx) => {
  const account = await requireAccount(ctx);
  const { turns, followUp, instruction } = parseBody(z.object({ turns: z.array(z.object({ from: z.enum(["fan", "creator"]), text: z.string().trim().min(1).max(1000) })).min(1).max(20), followUp: z.boolean().optional(), instruction: z.string().trim().max(1000).optional() }).refine((b) => b.followUp || b.instruction || b.turns.at(-1)!.from === "fan", "The chat must end with a fan message"), await ctx.json());
  await rateLimit(`preview:${ctx.user.id}`, 20, 10 * 60 * 1000, "Too many tries. Wait a few minutes.");
  return previewReply(account.account_id, turns, followUp, instruction);
};
