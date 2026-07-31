# flight-checks

Self-hosted award-flight deal watcher. It scans seats.aero from a configurable home airport, prices deals against static regional cash-fare estimates, ranks them in cents per point, emails an optional digest, and serves a dashboard for filtering, saving, dismissing, and scanning deals.

## Key documents

- Spec: `docs/superpowers/specs/2026-07-18-flight-checks-design.md`
- Implementation plan: `docs/superpowers/plans/2026-07-18-flight-checks.md`
- Open-source app plan: `docs/superpowers/plans/2026-07-29-open-source-app.md`

## Architecture

Single TypeScript ESM package (Node 22, strict mode, `NodeNext` modules). The backend runs through `tsx`; Vite builds the dashboard. Two entry points share one SQLite database: the scanner owns `scans`/`snapshots`/`alerts`, while the server owns `settings`/`deal_status`/`watches`, and both read everything.

All application configuration is available through settings, including secrets. `loadEffectiveConfig(db, env)` in `src/core/settings.ts` applies environment variables over database settings over defaults. Secret settings are write-only in API responses. Manual full and country-scoped scans are launched directly as child processes; no systemd scan service is involved. Country-scoped scans set `scans.scope` to the country and never send digests or record alerts. `/api/deals` serves the newest finished full scan or matching country scan. Trip watches are server-owned rows the scanner evaluates on full scans: each active watch filters the scan's scored deals by travel window, country exclusions, continents, themes, and cabins, and its top-N appears in the digest without recording alerts.

- `src/scanner/` — seats.aero pull → prefilter → static fare estimate → score → append-only snapshot → optional digest
- `src/server/` — Hono API, static dashboard host, built-in scheduler, and child-process scan trigger
- `src/web/` — React and Vite dashboard, setup wizard, settings, deal filters, and history
- `src/core/` — configuration, settings, types, valuation, prefiltering, airport metadata, and SQLite
- `data/flights.db` — SQLite data; append-only snapshots power history charts

## Commands

- `npx vitest run` — full test suite (always run before claiming done)
- `npx vitest run tests/core/config.test.ts` — single test file (always this form, never watch mode)
- `npx tsc --noEmit` — strict TypeScript check
- `npm run scan -- --dry-run` — full pipeline from `tests/fixtures/`, with no network
- `npm run serve` — dashboard server on port 3000
- `npm run build` — Vite dashboard build

## Hard rules

- **No web scraping.** External services are the seats.aero Partner API and SMTP. Cash comparisons are static regional estimates in `src/core/regions.ts`; change `src/scanner/pricing.ts` to introduce another pricing source.
- **Secrets never belong in git.** Local secrets belong in ignored environment files or the settings database.
- Ranking is cents per point after applying the configured transfer ratio, never cents per airline mile.
- Premium ranking uses the conservative score. Alert thresholds, minimum values, route caps, and re-alert improvement are configuration.
- Mock `fetch` and the mail transport in tests. Never hit live APIs from the test suite.
- Snapshots are append-only.

## Deployment

Docker Compose is the canonical deployment. For bare-node installations, `deploy/` contains an example systemd web unit and deployment script. Scheduling runs in-process with the web server and can be disabled with `SCHEDULER=off` when an external scheduler owns scan timing.

Maintainer-specific deployment notes live in `CLAUDE.local.md` (gitignored).

## Domain cheat-sheet

The default points program is Amex Membership Rewards Canada. Default transfer ratios, keyed by seats.aero `Source`, are aeroplan 1:1, british 1:1, flyingblue 0.75, delta 0.75, and etihad 0.75. Rows whose source is not configured are dropped. Non-CAD taxes fall back to regional estimates. The default value benchmarks are 1.0 cent per point for statement credit and approximately 1.75 cents per point for fixed-points travel.
