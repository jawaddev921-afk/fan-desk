# ADR-0003: Every feature has the same role-named files, no barrels

**Status:** Accepted
**Date:** 2026-11-12
**Deciders:** project owner

## Context
After the Next.js conversion each feature had `index.ts` (server) and `ui.ts` (browser) barrels plus files named by subject
(`ingest.ts`, `worker.ts`, `scoring.ts`, ...). Features differed in shape, there were 38 files in 4 features, and the
"server code must not reach the browser" rule rested only on our own script. A larger project of the owner's
(about 22 features) uses one fixed set of file names per feature, no barrels, and the `server-only` package.

## Decision
Adopt that convention at our size.

| Role file | Holds | Browser-safe |
|---|---|---|
| `handlers.ts` | the feature's endpoints as plain functions | no (only route files import it) |
| `service.ts` | its logic | no |
| `queries.ts` | all its SQL and tables | no |
| `schema.ts` | pure rules / zod | yes |
| `types.ts` | the view types the API sends | yes |
| `components/` | React | yes |

Other features import only `service`, `queries`, `schema`, `types` or `components/*`. Every server file starts with
`import "server-only"`. The checker also refuses any other file at the top of a feature, and `knip` runs in `npm run check`.

## Options Considered
- **A: keep barrels, rename only.** Lowest risk, but two files per feature that only re-export, and still our script as the only guard.
- **B: role files, no barrels (chosen).** Same names everywhere, fewer files, a second guard from the compiler.
- **C: no convention.** What we had.

## Trade-off Analysis
Logic files merged into one `service.ts` per feature (104 to 296 lines), so a file is longer, but it has `// ---- topic` banners
and there is one place to look. Subject names (`webhook.ts`, `worker.ts`) are gone; the banners keep them findable.

## Consequences
- Easier: any feature reads the same; unused code is caught by `knip`; a browser import of server code fails the build, not only our check.
- Harder: Node scripts and tests need `--conditions=react-server` (built into the npm scripts).
- The webhook is still in two features (registration in `accounts`, receiver in `inbox`): the dependency order requires it.

## Also adopted (same day)
- `src/shared/` became `src/lib/` (server, with `lib/client/` for browser helpers), `src/components/common/` and `src/config/`.
- Numbered SQL migrations (`migrations/`, runner in `lib/db.ts`) replaced per-feature `CREATE TABLE IF NOT EXISTS` and the ad-hoc `ALTER` guard.
- Request bodies are parsed with zod (`parseBody`) where the feature's `schema.ts` is not imported by the browser (`accounts`, `assistant`).
- Not adopted: server actions / server components for the dashboard (the UI polls and the e2e tests use the HTTP API).

## Action Items
1. [x] Role-named files in all 4 features, barrels removed, `server-only` everywhere, checker and tests rewritten
2. [ ] A test that the events we ask Fans API for are the events `inbox` handles
