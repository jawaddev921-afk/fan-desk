// What every API handler sees. Features write plain functions against these types; src/app/api/_lib/wrap.ts
// turns them into Next.js route handlers (CSRF check, login check, error mapping).
import "server-only";
import type { ZodType } from "zod";
export class HttpError extends Error {
  status: number;
  /** Optional message per form field, so the UI can show each error next to its input. */
  fields?: Record<string, string>;
  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export type SessionUser = { id: number; email: string; name: string | null };

export type PublicCtx = {
  req: Request;
  url: URL;
  /** Dynamic segments of the route path, e.g. { accountId: "acct_1" }. Not validated: handlers check what they use. */
  params: Record<string, string>;
  json(): Promise<Record<string, unknown>>;
  text(limit?: number): Promise<string>;
  /** Headers the handler wants on its response (for example Set-Cookie). */
  headers: Headers;
};
export type Ctx = PublicCtx & { user: SessionUser };

/** Returns the JSON to send with status 200, or a ready-made Response when the status or body must be custom. */
export type Handler = (ctx: Ctx) => unknown;
export type PublicHandler = (ctx: PublicCtx) => unknown;

/** The request body as the schema's type, or a 400 that names the field. `name` is used when the problem is the body as a whole. */
export function parseBody<T>(schema: ZodType<T>, data: unknown, name = "request"): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, r.error.issues.map((i) => `${i.path.join(".") || name}: ${i.message}`).join("; "));
  return r.data;
}

export function must<T>(v: T | undefined | null, what = "Not found"): T {
  if (v === undefined || v === null) throw new HttpError(404, what);
  return v;
}

/** Read a request body as text, refusing anything bigger than `limit` bytes. */
export async function readText(req: Request, limit = 200_000): Promise<string> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > limit) throw new HttpError(413, "Request body too large");
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, "Request body too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const raw = await readText(req);
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (v === null || typeof v !== "object") throw new Error();
    return v;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}
