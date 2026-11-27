// Settings from the environment, read when first used (not when imported), so `next build` and the unit tests
// can load this file without APP_SECRET being set.
import "server-only";
function appSecret(): string {
  const v = process.env.APP_SECRET;
  if (!v) throw new Error("Missing env var APP_SECRET (see .env.example)");
  if (!/^[0-9a-fA-F]{64}$/.test(v)) throw new Error("APP_SECRET must be 64 hex characters. Generate one with: openssl rand -hex 32");
  return v;
}

export const config = {
  get appSecret() {
    return appSecret();
  },
  get publicUrl() {
    return (process.env.PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
  },
  /** Cookies are marked Secure when the public address is https. SECURE_COOKIES=false turns that off (testing a tunnel while logged in at http://localhost). */
  get secureCookies() {
    const v = process.env.SECURE_COOKIES;
    return v ? v === "true" : this.publicUrl.startsWith("https://");
  },
  get allowSignup() {
    return process.env.ALLOW_SIGNUP !== "false";
  },
  get trustProxy() {
    return process.env.TRUST_PROXY === "true";
  },
  get ofmapiBaseUrl() {
    return (process.env.OFMAPI_BASE_URL ?? "https://api.ofmapi.com/v1").replace(/\/+$/, "");
  },
  get aiProvider(): "claude" | "ollama" {
    return process.env.AI_PROVIDER === "ollama" ? "ollama" : "claude";
  },
  get aiModel() {
    return process.env.AI_MODEL ?? "claude-sonnet-5-5";
  },
  get ollamaUrl() {
    return process.env.OLLAMA_URL ?? "http://localhost:11434";
  },
  get ollamaModel() {
    return process.env.OLLAMA_MODEL ?? "qwen2.5:3b";
  },
  get replyDebounceMs() {
    return Number(process.env.REPLY_DEBOUNCE_MS ?? 8000);
  },
  /** Postgres connection string (Supabase: use the pooler URL). `npm run db:dev` starts a local one. */
  get databaseUrl() {
    const u = process.env.DATABASE_URL;
    if (!u) throw new Error("DATABASE_URL is not set (run `npm run db:dev` for a local database)");
    return u;
  },
  /** Resend (resend.com) key for the emails we send. Unset: no email is sent and sign-up needs no confirmation. */
  get resendApiKey() {
    return process.env.RESEND_API_KEY ?? "";
  },
  get emailApiUrl() {
    return (process.env.EMAIL_API_URL ?? "https://api.resend.com").replace(/\/+$/, "");
  },
  /** Must be an address on a domain verified in Resend (Resend's own onboarding@resend.dev only reaches the account owner). */
  get emailFrom() {
    return process.env.EMAIL_FROM ?? "Fan Desk <onboarding@resend.dev>";
  },
  /** A new account must confirm its email first. On whenever a Resend key is set; REQUIRE_EMAIL_VERIFICATION=false turns it off. */
  get requireEmailVerification() {
    const v = process.env.REQUIRE_EMAIL_VERIFICATION;
    return v ? v === "true" : !!this.resendApiKey;
  },
  /** Shared secret the host's cron sends to /api/cron/tick. Unset: the endpoint is off. */
  get cronSecret() {
    return process.env.CRON_SECRET ?? "";
  },
  get dbPoolMax() {
    return Number(process.env.DB_POOL_MAX ?? 5);
  },
};
