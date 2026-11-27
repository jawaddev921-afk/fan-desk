# ADR-0001: Feature-driven architecture with enforced boundaries

**Status:** Accepted. Superseded in part by ADR-0002 and ADR-0003 (every feature now has the same role-named files, no `index.ts`): the feature rules still stand; the file layout (`server.ts`, `public/`, `routes.ts`) and the checker (now larger, see `scripts/check-boundaries.ts`) have changed.
**Date:** 2026-11-11
**Deciders:** project owner

## Context
`db.ts` held every table and `server.ts` held every route, so any change touched the same two files and nothing stopped
one concern from reaching into another's data. Next steps (PPV catalog, chatter roles, Postgres) would each cut across both.

## Decision
Split by **feature** (what the product does), not by technical layer. Each feature owns its tables, logic and HTTP routes;
the rest of the app only sees its `index.ts`.

```
src/server.ts            entry: listen, start assistant
src/app/                 router (CSRF, headers, auth, static) + read-model views that mix features
src/shared/              config, crypto, db handle, http types, event bus. Knows no feature.
src/features/auth        users, sessions, login routes
src/features/accounts    Fans API key, creator accounts, per-account settings, ownership check
src/features/inbox       fans, messages, scoring, webhook receiver, "Sync now", takeover/release
src/features/assistant   AI replies, outbox (drafts + sending), AI usage
```
Inside a feature: `index.ts` = public API; every other file is private. There is no `lib/` folder: the checker already
forbids importing anything but `index.ts`, so a `lib/` level would add path length and no privacy.
Dependencies point one way: `auth`, `accounts` <- `inbox` <- `assistant`. Lower features tell higher ones what happened through
`shared/events.ts` (typed bus), never by importing them.

## Options Considered
### A: Keep layers (db / services / routes)
| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Change locality | Poor: one feature edits 3 layers |

### B: Feature folders without enforcement
Cheap, but boundaries rot within weeks.

### C: Feature folders + `npm run check` (chosen)
Same folders plus a ~55-line script that fails on deep imports, `shared` importing features, feature cycles, and a lower feature importing a higher one. No new dependency.

### D: Microservices / packages per feature
Rejected: one SQLite file, one process, one developer. No seam varies yet.

## Trade-off Analysis
Chose C. A "feature" boundary only helps if it is enforced, and the checker costs one script. Event bus instead of mutual
imports because `inbox` must wake the assistant while the assistant reads the inbox: that is a cycle without it.

## Consequences
- Easier: change one feature without reading others; delete or replace one (e.g. assistant) cleanly; test through `index.ts`.
- Harder: a screen that mixes features needs a read model in `app/views.ts`; a cross-feature reaction needs a bus event.
- Revisit: when moving to Postgres, each feature's `store.ts` is the only place SQL lives. Add per-feature migrations then.

## Action Items
1. [x] Move tables, queries and routes into features
2. [x] `scripts/check-boundaries.ts` and `npm run check`
3. [x] Unit tests next to the code for pure logic (price guard, scoring, crypto, html parsing, settings)
   [ ] More unit tests only where a bug has appeared; e2e stays the main safety net
4. [ ] Postgres + migrations before running several instances
