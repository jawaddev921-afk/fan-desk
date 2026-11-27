// Auth logic: sign-up, login, sessions, rate limits.
import "server-only";
import { config } from "../../lib/config.ts";
import { hashPassword, randomToken, sha256, verifyPassword } from "../../lib/crypto.ts";
import { HttpError } from "../../lib/http.ts";
import { sendEmail } from "../../lib/integrations/resend.ts";
import { clearRateLimit, deleteExpiredRateLimits, deleteExpiredSessions, deleteExpiredSignupRequests, deleteSession, getSessionUser, getUserByEmail, hitRateLimit, insertSession, insertUser, savePendingSignup, takePendingSignup, type User } from "./queries.ts";
import { EMAIL_RE, nameProblem, passwordProblems } from "./schema.ts";

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE = "sid";

// shortcut: Next.js route handlers do not expose the socket address, so without a trusted proxy every client shares
// one "local" bucket for per-IP limits. Run behind a reverse proxy with TRUST_PROXY=true (README), then each client has its own.
export function clientIp(req: Request): string {
  if (config.trustProxy) {
    const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (first) return first;
  }
  return "local";
}

// N hits per window per key, kept in the database so every server instance counts the same hits.
export async function rateLimit(key: string, max: number, windowMs: number, message = "Too many attempts. Try again later."): Promise<void> {
  if ((await hitRateLimit(key, windowMs)).n > max) throw new HttpError(429, message);
}

const VERIFY_LINK_MS = 24 * 60 * 60 * 1000;

/** The account now (no email provider configured), or `pending`: an email with a confirmation link was sent and the account is created when it is opened. */
export type SignupResult = { user: User } | { pending: true };

export async function signup(name: string, email: string, password: string, acceptedTerms: boolean, origin: string): Promise<SignupResult> {
  if (!config.allowSignup) throw new HttpError(403, "Sign-ups are closed on this server.");
  email = email.trim().toLowerCase();
  name = name.trim().replace(/\s+/g, " ");
  const fields: Record<string, string> = {};
  const nameIssue = nameProblem(name);
  if (nameIssue) fields.name = nameIssue;
  if (!EMAIL_RE.test(email)) fields.email = "Enter a valid email address, like name@example.com.";
  const problem = passwordProblems(password, email)[0];
  if (problem) fields.password = problem;
  if (!acceptedTerms) fields.terms = "Please confirm this to create your account.";
  if (Object.keys(fields).length) throw new HttpError(400, "Please fix the highlighted fields.", fields);

  const taken = () => new HttpError(409, "An account with this email already exists. Log in instead?", { email: "An account with this email already exists." });
  const pw = await hashPassword(password);
  if (!config.requireEmailVerification) {
    try {
      return { user: await insertUser(email, pw, name) };
    } catch (err) {
      if ((err as { code?: string }).code !== "23505") throw err; // 23505 = unique violation: the email is taken
      throw taken();
    }
  }

  // The account does not exist until the email is confirmed: keep the request, send the link.
  if (await getUserByEmail(email)) throw taken();
  const token = randomToken(32);
  await savePendingSignup({ tokenHash: sha256(token), email, name, pwHash: pw, termsAcceptedAt: Date.now(), expiresAt: Date.now() + VERIFY_LINK_MS });
  const link = `${config.publicUrl || origin}/verify?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Confirm your email for Fan Desk",
    text: `Hi ${name},\n\nConfirm your email to finish creating your Fan Desk account:\n\n${link}\n\nThe link works once and expires in 24 hours. If you did not sign up, you can ignore this email.\n`,
    html: `<p>Hi ${escapeHtml(name)},</p><p>Confirm your email to finish creating your Fan Desk account:</p><p><a href="${link}">Confirm my email</a></p><p style="color:#666">The link works once and expires in 24 hours. If you did not sign up, you can ignore this email.</p>`,
  });
  return { pending: true };
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Opening the emailed link: creates the account (with the name, password and consent from the sign-up) and returns it. The link works once. */
export async function verifyEmail(token: string): Promise<User> {
  const pending = /^[A-Za-z0-9_-]{20,100}$/.test(token) ? await takePendingSignup(sha256(token)) : undefined;
  if (!pending) throw new HttpError(400, "This link has expired or was already used. Sign up again to get a new one.");
  try {
    return await insertUser(pending.email, pending.pw_hash, pending.name, { termsAcceptedAt: pending.terms_accepted_at });
  } catch (err) {
    if ((err as { code?: string }).code !== "23505") throw err;
    throw new HttpError(409, "This email already has an account. Log in instead.");
  }
}

const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export async function login(email: string, password: string, ip: string): Promise<User> {
  email = email.trim().toLowerCase();
  const limitKey = `login:${ip}:${email}`;
  await rateLimit(limitKey, 8, 15 * 60 * 1000);
  const user = await getUserByEmail(email);
  const ok = await verifyPassword(password, user?.pw_hash ?? DUMMY_HASH); // same work whether or not the user exists
  if (!user || !ok) throw new HttpError(401, "Wrong email or password.");
  await clearRateLimit(limitKey);
  return user;
}

export async function createSession(headers: Headers, userId: number): Promise<void> {
  const token = randomToken(32);
  await insertSession(sha256(token), userId, Date.now() + SESSION_MS);
  headers.append("Set-Cookie", `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}${config.secureCookies ? "; Secure" : ""}`);
}

function readToken(cookieHeader: string | null): string | null {
  const m = (cookieHeader ?? "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]{20,100})`));
  return m ? m[1] : null;
}

/** The logged-in user for a request's Cookie header (pages read it from next/headers, API routes from the Request). */
export async function sessionUserFromCookie(cookieHeader: string | null): Promise<User | null> {
  const token = readToken(cookieHeader);
  if (!token) return null;
  const row = await getSessionUser(sha256(token));
  if (!row || row.exp < Date.now()) return null;
  return row;
}

export const sessionUser = (req: Request): Promise<User | null> => sessionUserFromCookie(req.headers.get("cookie"));

export async function destroySession(req: Request, headers: Headers): Promise<void> {
  const token = readToken(req.headers.get("cookie"));
  if (token) await deleteSession(sha256(token));
  headers.append("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

/** Hourly clean-up: expired sessions, and rate-limit rows whose window is over (they would otherwise only ever grow). */
export async function purgeExpiredSessions(): Promise<void> {
  await deleteExpiredSessions();
  await deleteExpiredRateLimits();
  await deleteExpiredSignupRequests();
}
