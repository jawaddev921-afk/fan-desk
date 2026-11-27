# ADR-0002: Move to Next.js (App Router), keeping the feature-driven structure

**Status:** Accepted. The `index.ts`/`ui.ts` barrels it describes were replaced by ADR-0003.
**Date:** 2026-11-12
**Deciders:** project owner

## Context
The app was a hand-written `node:http` server with a 700-line vanilla JavaScript dashboard that built HTML strings. Adding screens,
forms and live updates meant more of the same by hand, with no components, no routing and no type checking of the UI.

## Decision
Use Next.js 16 (App Router, React 19). Keep what already worked: features own their tables, logic and endpoints; the boundary
checker enforces the rules. What changed:

| Before | Now |
|---|---|
| `server.ts` + a route list per feature | `src/app/api/**/route.ts`, each a thin line wiring a feature's handler to `route()` |
| `public/app.js` (strings in `innerHTML`) | React components in `features/<f>/components`, pages in `src/app` |
| tabs switched by JavaScript state | real routes: `/inbox`, `/inbox/<fan>`, `/assistant`, `/connection`, `/login`, `/signup` |
| tests next to the code | `tests/unit` and `tests/e2e` at the root |
| one entry `index.ts` per feature | `index.ts` (server) and `ui.ts` (browser) |

## Options Considered
### A: Keep the vanilla frontend, only add the Next.js server
Half a conversion: the part that grows (the UI) would stay strings.

### B: React SPA + the old Node server
Two build systems and a second place for routing; Next gives routing, bundling and the server together.

### C: Next.js with Server Components calling features directly (no API)
Fewer round trips, but the API folder is wanted (webhooks, a stable contract) and the dashboard polls anyway.

### D: Next.js, API as route handlers, UI as client components over that API (chosen)
Smallest change in behaviour: the API contract and all end-to-end checks carry over unchanged.

## Trade-off Analysis
Next.js loads a module once per bundle, so state kept in a module variable can exist several times (the AI worker would not see
events emitted by a route). Everything that must be unique (database handle, event bus, rate limits) now lives on `globalThis`
via `shared/singleton.ts`. The database and the config open on first use, not at import, so `next build` has no side effects.

## Consequences
- Easier: components and routes; deep links to a fan; one build; typed UI/API contract (each feature's `types.ts`).
- Harder: browser code must never import server code. `npm run check` (the first step of `npm test`) fails for any file marked `"use client"`
  (or reached from one) that imports a database/crypto/`index.ts` module.
- The client address is not visible to route handlers: without a trusted proxy (`TRUST_PROXY=true`) per-IP rate limits share one bucket.
- Run exactly one server process: the worker and the in-memory limiter assume it (the database became Postgres in ADR-0004).
- The webhook URL changed to `/api/webhooks/fansapi/<token>` (none had been registered).

## Cleanup that followed (2026-11-12)
After an independent review (`architecture`, `codebase-design`, `ponytail-audit` skills; every claim re-checked against the code):
- View types moved into their features; the session moved to `accounts` (it is "who is logged in"); `shared/ui` is generic again.
- `(dashboard)/layout.tsx` reads the session on the server (a real page login check, no first-paint "Loading" step).
- The checker became a gate: first step of `npm test`, a test on the real `src`, and new rules (route wrapper, no module-level `let`, import style).
- Removed: redundant `runtime`/`force-dynamic` lines, an unused endpoint and exports, two pass-through page files.
- Left alone on purpose: `server-only` (needs `--conditions=react-server` for the Node unit tests), a lock against a second server process.

## Action Items
1. [x] Handlers as plain functions, thin route files, `proxy.ts` (login redirect + CSP nonce), `instrumentation.ts` (worker)
2. [x] UI converted to React; tests moved to the root; checker extended and covered by unit tests
3. [ ] An automated browser test in the repo (today only hand-run Chrome scripts cover the UI)
4. [ ] Postgres + migrations before running several instances
