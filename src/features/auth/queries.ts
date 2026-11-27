import "server-only";
import { db } from "../../lib/db.ts";

export type User = { id: number; email: string; name: string | null; email_verified_at: number | null; pw_hash: string; created_at: number; terms_accepted_at: number | null };

/** `termsAcceptedAt` is when they ticked the box (a confirmed sign-up keeps the time of the request); the email is confirmed when `verified` is true. */
export async function insertUser(email: string, pwHash: string, name: string | null = null, opts: { termsAcceptedAt?: number; verified?: boolean } = {}): Promise<User> {
  const now = Date.now();
  const user = await db.one<User>(
    "INSERT INTO users (email, name, pw_hash, created_at, terms_accepted_at, email_verified_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *",
    [email, name, pwHash, now, opts.termsAcceptedAt ?? now, opts.verified === false ? null : now],
  );
  return user!;
}

/** A sign-up waiting for its email to be confirmed. A new request for the same email replaces the old one (its link stops working). */
export async function savePendingSignup(p: { tokenHash: string; email: string; name: string; pwHash: string; termsAcceptedAt: number; expiresAt: number }): Promise<void> {
  await db.run("DELETE FROM signup_requests WHERE email = ?", [p.email]);
  await db.run("INSERT INTO signup_requests (token_hash, email, name, pw_hash, terms_accepted_at, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    p.tokenHash,
    p.email,
    p.name,
    p.pwHash,
    p.termsAcceptedAt,
    Date.now(),
    p.expiresAt,
  ]);
}

export type PendingSignup = { email: string; name: string; pw_hash: string; terms_accepted_at: number };

/** Takes the pending sign-up for this token (it can be used once) if it has not expired. */
export const takePendingSignup = (tokenHash: string) =>
  db.one<PendingSignup>("DELETE FROM signup_requests WHERE token_hash = ? AND expires_at > ? RETURNING email, name, pw_hash, terms_accepted_at", [tokenHash, Date.now()]);

export async function deleteExpiredSignupRequests(): Promise<void> {
  await db.run("DELETE FROM signup_requests WHERE expires_at < ?", [Date.now()]);
}

export const getUserByEmail = (email: string) => db.one<User>("SELECT * FROM users WHERE email = ?", [email]);

export async function insertSession(tokenHash: string, userId: number, expiresAt: number): Promise<void> {
  await db.run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [tokenHash, userId, expiresAt]);
}

export const getSessionUser = (tokenHash: string) =>
  db.one<User & { exp: number }>("SELECT u.*, s.expires_at AS exp FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?", [tokenHash]);

export async function deleteSession(tokenHash: string): Promise<void> {
  await db.run("DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
}

export async function deleteExpiredSessions(): Promise<void> {
  await db.run("DELETE FROM sessions WHERE expires_at < ?", [Date.now()]);
}

/** Counts one hit for `key` in a window of `windowMs` (a new window starts when the old one is over). One atomic statement. */
export async function hitRateLimit(key: string, windowMs: number): Promise<{ n: number; resetAt: number }> {
  const now = Date.now();
  const row = await db.one<{ n: number; reset_at: number }>(
    `INSERT INTO rate_limits (key, n, reset_at) VALUES (?, 1, ?)
     ON CONFLICT (key) DO UPDATE SET
       n = CASE WHEN rate_limits.reset_at < ? THEN 1 ELSE rate_limits.n + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at < ? THEN ? ELSE rate_limits.reset_at END
     RETURNING n, reset_at`,
    [key, now + windowMs, now, now, now + windowMs],
  );
  return { n: row!.n, resetAt: row!.reset_at };
}

export async function clearRateLimit(key: string): Promise<void> {
  await db.run("DELETE FROM rate_limits WHERE key = ?", [key]);
}

export async function deleteExpiredRateLimits(): Promise<void> {
  await db.run("DELETE FROM rate_limits WHERE reset_at < ?", [Date.now()]);
}
