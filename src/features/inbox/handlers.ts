// Inbox endpoints: plain functions (ctx) => data. src/app/api/**/route.ts wires them to URLs.
import "server-only";
import { HttpError, must, type Ctx, type Handler, type PublicHandler } from "../../lib/http.ts";
import { apiFor, requireAccount, verifyWebhook } from "../accounts/service.ts";
import { getFan, setFanMode } from "./queries.ts";
import { isAvatarUrl } from "./schema.ts";
import { fetchMedia, handleWebhook, refreshConversation, requestSync, requireFanId } from "./service.ts";

// OFMAPI calls this. The token in the URL picks the user; the signature proves the call is from OFMAPI.
export const webhookHandler: PublicHandler = async ({ req, params, text }) => {
  const token = params.token ?? "";
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new Response("not found", { status: 404 });
  const body = await text(1_000_000);
  const check = await verifyWebhook(token, body, req.headers.get("x-ofmapi-signature") ?? undefined);
  if ("status" in check) return new Response(check.status === 404 ? "not found" : "bad signature", { status: check.status });
  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  await handleWebhook(check.userId, event, req.headers.get("x-ofmapi-idempotency-key") ?? undefined);
  return new Response("ok");
};

/** "Sync now": starts the import again; the worker does the work in the background and the dashboard shows the progress. */
export const syncHandler: Handler = async (ctx) => {
  await requestSync(await requireAccount(ctx));
  return { ok: true };
};

/**
 * A fan's photo, fetched by this server and passed on: the browser never has to reach OnlyFans (some networks block it), and
 * Content-Security-Policy keeps `img-src 'self'`. Only the address stored for that fan is fetched, never one from the request.
 */
export const avatarHandler: Handler = async (ctx) => {
  const account = await requireAccount(ctx);
  const fan = await getFan(account.account_id, requireFanId(ctx.url.searchParams.get("fan") ?? undefined));
  if (!fan || !isAvatarUrl(fan.avatar_url)) throw new HttpError(404, "Not found");
  let res: Response;
  try {
    res = await fetch(fan.avatar_url, { signal: AbortSignal.timeout(8_000) });
  } catch {
    throw new HttpError(404, "Photo not available"); // the page falls back to initials
  }
  if (!res.ok || !res.body || !(res.headers.get("content-type") ?? "").startsWith("image/")) throw new HttpError(404, "Photo not available");
  return new Response(res.body, { headers: { "Content-Type": res.headers.get("content-type")!, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
};

/** Called when a chat is opened: reads that one chat again (new messages, fresh media links). Does nothing if it was refreshed a moment ago. */
export const refreshFanHandler: Handler = async (ctx) => {
  const account = await requireAccount(ctx);
  const fanId = requireFanId(ctx.params.fanId);
  must(await getFan(account.account_id, fanId));
  return { ok: true, ...(await refreshConversation(account, fanId)) };
};

/** A photo/video/audio of one of this account's messages, by message and media id: fetched with the user's own key and streamed (the key and the provider's links never reach the browser). */
export const mediaHandler: Handler = async (ctx) => {
  const account = await requireAccount(ctx);
  const messageId = Number(ctx.url.searchParams.get("message"));
  const mediaId = ctx.url.searchParams.get("media") ?? "";
  if (!Number.isInteger(messageId) || !mediaId) throw new HttpError(404, "Not found");
  const res = await fetchMedia(account, messageId, mediaId);
  if (!res?.body) throw new HttpError(404, "Media not available");
  const type = res.headers.get("content-type") ?? "";
  if (!/^(image|video|audio)\//.test(type)) throw new HttpError(415, "Not a media file");
  return new Response(res.body, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400, immutable", "X-Content-Type-Options": "nosniff" } });
};

async function changeMode(ctx: Ctx, mode: "assistant" | "human", reason: string | null) {
  const account = await requireAccount(ctx);
  const fanId = requireFanId(ctx.params.fanId);
  must(await getFan(account.account_id, fanId));
  await setFanMode(account.account_id, fanId, mode, reason);
  return { ok: true };
}

export const takeoverHandler: Handler = (ctx) => changeMode(ctx, "human", "taken over from dashboard");
export const releaseHandler: Handler = (ctx) => changeMode(ctx, "assistant", null);
