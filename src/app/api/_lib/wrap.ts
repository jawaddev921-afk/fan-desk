import "server-only";
import { sessionUser } from "@/features/auth/service.ts";
import { HttpError, readJson, readText, type Ctx, type Handler, type PublicCtx, type PublicHandler } from "@/lib/http.ts";
import { meView } from "./views.ts";

// Turns a feature's plain handler into a Next.js route handler. This is the only place that knows about
// CSRF, the login cookie, error responses and the dashboard state (`me`), so features stay free of them.

type RouteContext = { params: Promise<Record<string, string>> };

/** Browsers send `X-Requested-With` only from our own pages, and cross-site forms cannot set it. */
function checkCsrf(req: Request): void {
  if (req.method === "GET" || req.method === "HEAD") return;
  if (req.headers.get("x-requested-with") !== "fan-desk") throw new HttpError(403, "Missing request header");
  const origin = req.headers.get("origin");
  if (origin) {
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      throw new HttpError(403, "Bad origin");
    }
    if (host !== req.headers.get("host")) throw new HttpError(403, "Cross-site request blocked");
  }
}

async function run(req: Request, context: RouteContext, opts: { csrf?: boolean }, call: (base: PublicCtx) => unknown): Promise<Response> {
  const headers = new Headers({ "Cache-Control": "no-store" });
  try {
    if (opts.csrf !== false) checkCsrf(req);
    const base: PublicCtx = {
      req,
      url: new URL(req.url),
      params: (await context.params) ?? {},
      json: () => readJson(req),
      text: (limit?: number) => readText(req, limit),
      headers,
    };
    const out = await call(base);
    return out instanceof Response ? out : Response.json(out, { headers });
  } catch (err) {
    if (err instanceof HttpError) {
      return Response.json(err.fields ? { error: err.message, fields: err.fields } : { error: err.message }, { status: err.status, headers: { "Cache-Control": "no-store" } });
    }
    console.error("[api]", err);
    return Response.json({ error: "Internal error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

/** An endpoint for a logged-in user. `withMe` adds the refreshed dashboard state to the answer. */
export function route(handler: Handler, opts: { withMe?: boolean } = {}) {
  return (req: Request, context: RouteContext) =>
    run(req, context, {}, async (base) => {
      const user = await sessionUser(req);
      if (!user) throw new HttpError(401, "Please log in.");
      const ctx: Ctx = { ...base, user };
      const out = await handler(ctx);
      return opts.withMe && !(out instanceof Response) ? { ...(out as object), me: await meView(user) } : out;
    });
}

/** An endpoint that works without a login (sign-up, login, the OFMAPI webhook). `csrf: false` is for server-to-server calls. */
export function publicRoute(handler: PublicHandler, opts: { csrf?: boolean } = {}) {
  return (req: Request, context: RouteContext) => run(req, context, opts, handler);
}
