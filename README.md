# Fan Desk

A multi-user web app. Each user signs up, pastes their own **Fans API key**, and manages their OnlyFans
messages in one place: an inbox, an AI **assistant** that answers new fans (as the creator's assistant,
never as the creator), fan scoring, and a hand-off to a human as soon as a fan pays.

## How it works

```
user logs in → pastes Fans API key → we validate it, store it AES-256-GCM encrypted, import their accounts
                                   → register a per-user webhook at Fans API (or use "Sync now")

fan message ─► POST /api/webhooks/fansapi/<user token>   (HMAC-checked, de-duplicated, tenant-checked)
            ─► worker: AI decides intent / reply / needs_human
                 ├─ needs_human, tip, PPV purchase, big spender, creator replied in OnlyFans → human
                 ├─ price not on the menu, reply too long                                    → held as a draft
                 └─ otherwise: draft (a person approves) or auto-send (Idempotency-Key per message)
```

Safety rules enforced in code (not just in the prompt):
- The first AI message to every fan starts with the account's intro line, and saving settings is refused unless
  that line says it is an **assistant**.
- The AI is OFF for every new account until the owner turns it on; the default send mode is **draft**.
- A fan who tips / buys a PPV is handed to a human and the AI stops replying to them.
- Auto mode still holds back any reply that quotes a price not on the menu.
- Max 8 AI replies per fan per hour, then a human takes over. Messages older than 12h are never auto-answered.
- Sends use one `Idempotency-Key` per message; an unclear result is shown as `unknown` and never resent automatically.

Security:
- Passwords: scrypt. Sessions: random token, only its hash is stored; cookie is HttpOnly + SameSite=Lax (+ Secure on https).
- Fans API keys and webhook secrets: AES-256-GCM with `APP_SECRET`. The key is never sent back to the browser.
- Every API route checks that the account belongs to the logged-in user; webhooks for accounts the token owner
  does not own are ignored.
- CSRF: state-changing requests need the `X-Requested-With` header and a same-origin `Origin`. Strict nonce-based CSP, no inline scripts or styles.
- Login/sign-up are rate limited (in memory). Sign-up needs a consent checkbox and a password of 10+ characters that is not a common password.
- Not built yet: email verification and "forgot password" (they need an email provider).

## Run it

Needs Node 24+.

```bash
npm install
cp .env.example .env        # then fill it in (APP_SECRET: openssl rand -hex 32)
npm run dev                 # http://localhost:3000   (development)
npm run build && npm start  # the same app as it ships (production)
```

- **Back up `APP_SECRET`.** Without it, saved keys cannot be decrypted.
- Set `ANTHROPIC_API_KEY` for Claude (default model `claude-sonnet-5-5`), or `AI_PROVIDER=ollama` for free local tests.
- Webhooks need a public **HTTPS** address: set `PUBLIC_URL` (for local tests: `cloudflared tunnel --url http://localhost:3000`),
  then press *Register webhook* on the Connection page. Webhooks need a Fans API plan that includes them (Basic+).
  The endpoint is `{PUBLIC_URL}/api/webhooks/fansapi/<token>`.
- After you have created your users, set `ALLOW_SIGNUP=false`.
- Run one server process (the AI worker starts inside the server and the rate limiter is in memory; both move into the database in ADR-0004 M2). Behind a reverse proxy set `TRUST_PROXY=true`, otherwise all
  visitors share one rate-limit bucket (Next.js route handlers do not see the client address). Never expose the plain-HTTP port to the internet.

## Try it without any keys

```bash
npm run demo     # http://localhost:3300   demo@example.com / demo-password-123
```
Runs the real app (Next dev server) against a fake Fans API and a fake AI, seeded with a few fans. `npm run demo -- --prod` runs a production build.

## Tests

```bash
npm test         # tests/unit + tests/e2e: the e2e builds the app and runs it with `next start` against a fake Fans API + fake Ollama
npm run check    # typecheck + architecture boundaries (docs/adr/0001, docs/adr/0002)
```

## Limits (v1)

- Postgres via `DATABASE_URL` (`npm run db:dev` locally). The worker loop and the in-memory rate limiter still assume one server process until ADR-0004 M2.
- AI cost is paid by whoever runs this server (Anthropic key in `.env`). Per-account usage is shown in Assistant settings.
- Not built yet: team members/roles per account, PPV catalog selling, mass messages, billing for your own customers.
- Check OnlyFans' current terms on AI and automation before using auto mode; the risk sits with the creator's account.
