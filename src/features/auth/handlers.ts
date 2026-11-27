// Auth endpoints: plain functions (ctx) => data. src/app/api/**/route.ts wires them to URLs.
import "server-only";
import type { PublicHandler } from "../../lib/http.ts";
import { clientIp, createSession, destroySession, login, rateLimit, signup, verifyEmail } from "./service.ts";

export const signupHandler: PublicHandler = async ({ req, json, headers }) => {
  await rateLimit(`signup:${clientIp(req)}`, 10, 60 * 60 * 1000);
  const b = await json();
  await rateLimit(`signup-email:${String(b.email ?? "").trim().toLowerCase()}`, 5, 60 * 60 * 1000, "We already sent several emails to this address. Check your inbox and spam folder, or try again in an hour.");
  const r = await signup(String(b.name ?? ""), String(b.email ?? ""), String(b.password ?? ""), b.terms === true, new URL(req.url).origin);
  if ("pending" in r) return { ok: true, verify: "email_sent" }; // no session yet: the account is created when the link is opened
  await createSession(headers, r.user.id);
  return { ok: true };
};

/** The page behind the emailed link calls this: it creates the account and logs the person in. */
export const verifyHandler: PublicHandler = async ({ req, json, headers }) => {
  await rateLimit(`verify:${clientIp(req)}`, 20, 60 * 60 * 1000);
  const user = await verifyEmail(String((await json()).token ?? ""));
  await createSession(headers, user.id);
  return { ok: true };
};

export const loginHandler: PublicHandler = async ({ req, json, headers }) => {
  const b = await json();
  const user = await login(String(b.email ?? ""), String(b.password ?? ""), clientIp(req));
  await createSession(headers, user.id);
  return { ok: true };
};

export const logoutHandler: PublicHandler = async ({ req, headers }) => {
  await destroySession(req, headers);
  return { ok: true };
};
