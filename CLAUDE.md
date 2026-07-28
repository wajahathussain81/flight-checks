# flight-checks

Award-flight deal watcher for 2026 travel. Scans seats.aero for award availability from **YYC** to international destinations only (Canadian destinations are excluded at the request level), prices deals against static per-region cash-fare estimates, ranks everything in **cents per Amex MR (Canada) point**, emails a twice-daily digest via Gmail SMTP, and serves a LAN dashboard app (filter/sort/search deals by continent/country/month/cabin, save/dismiss with notes, trigger scans, edit settings — all from the browser).

## Key documents

- Spec: `docs/superpowers/specs/2026-07-18-flight-checks-design.md`
- Implementation plan (source of truth while building): `docs/superpowers/plans/2026-07-18-flight-checks.md`

## Architecture

Single TypeScript ESM package (Node 22, strict mode, `NodeNext` modules). The backend has **no build step** — it runs via `tsx`; only the dashboard is built (Vite). Two entry points share one SQLite DB: the scanner owns `scans`/`snapshots`/`alerts`, the server owns `settings`/`deal_status`, both read everything. UI settings overlay env defaults via `loadEffectiveConfig(db, env)` (`src/core/settings.ts`) — whitelisted keys only, `dbPath` stays env-only. The server triggers manual full scans via `systemctl start --no-block flight-checks-scan.service` (409 if a scan started <30 min ago is unfinished). Country-scoped scans (`POST /api/scan {"country"}` or the per-country button) spawn `tsx src/scanner/index.ts --country <name>` directly: they query seats.aero for just that country's airports, write snapshots with `scans.scope = <country>`, and **never** send digests or record alerts. `/api/deals` serves the newest finished scan whose scope is `full` or matches the requested country; `COUNTRY_CONTINENT` in `regions.ts` powers the continent filter:

- `src/scanner/` — scheduled job: seats.aero pull → prefilter → static fare estimate → score → snapshot → digest
- `src/server/` — Hono API + static dashboard on port 3000 (`app.ts` is testable, `index.ts` binds)
- `src/web/` — React + Vite dashboard (builds to `dist/web`)
- `src/core/` — config, types, valuation math, prefilter, SQLite layer
- `data/flights.db` — SQLite, snapshots are append-only (powers history charts)

## Commands

- `npx vitest run` — full test suite (always run before claiming done)
- `npx vitest run tests/core/config.test.ts` — single test file (always this form, never watch mode)
- `npm run scan -- --dry-run` — full pipeline from `tests/fixtures/`, no network
- `npm run serve` — dashboard server on :3000
- `npm run build` — Vite build of the dashboard
- `./deploy/deploy.sh` — rsync to container, install, restart services

## Hard rules

- **No web scraping.** External services are exactly: seats.aero Partner API and Gmail SMTP. Amadeus Self-Service was decommissioned 2026-07-17; cash comps are static per-region estimates (`TYPICAL_CASH_CAD` in `src/core/regions.ts`, applied by `src/scanner/pricing.ts` — swap that module's internals to reintroduce a live pricing API).
- **Secrets never in git.** Local secrets live in `env.local` (gitignored); the container reads `/etc/flight-checks/env`. `deploy.sh` copies the former to the latter.
- All money is CAD; the ranking metric is cents per **MR point** (program miles ÷ transfer ratio), never per airline mile.
- Premium-cabin ranking uses the **conservative** cpp (cash comp capped at 3× economy). Thresholds: economy ≥ 1.75 ¢/pt, premium ≥ 3.0 ¢/pt. Alerts additionally require a minimum net cash value — economy ≥ $400, premium ≥ $1,200 (`MIN_VALUE_ECONOMY`/`MIN_VALUE_PREMIUM`) — to keep short-haul hops out of the digest; they still appear on the dashboard. Digest buckets cap at 10 deals with at most 3 dates per route+cabin (`MAX_PER_ROUTE`). Re-alert an already-alerted deal only if its value improves ≥ 15% or seat count increases.
- Mock `fetch`/mail transport in tests; never hit live APIs from the test suite.

## Deployment

Runs in LXC **113** (`flight-checks`, Debian 13) on the user's Proxmox host (`homelab`, <proxmox-ip>). Container IP **<container-ip>**; from the Mac use `ssh flight-checks` (alias in `~/.ssh/config`).

- App dir on container: `/opt/flight-checks`
- systemd: `flight-checks-web.service` (dashboard), `flight-checks-scan.timer` (07:00 & 19:00 America/Edmonton)
- Dashboard: http://<container-ip>:3000 (LAN only — do not expose publicly)
- Logs: `ssh flight-checks "journalctl -u flight-checks-scan.service -n 50"`

## Domain cheat-sheet

Amex MR Canada transfer ratios (config in `src/core/config.ts`, keyed by seats.aero `Source`): aeroplan 1:1, british 1:1, flyingblue 0.75, delta 0.75, etihad 0.75. Rows whose `Source` isn't in this map are dropped; non-CAD taxes fall back to per-region estimates (no currency conversion in v1). Value benchmarks: statement credit 1.0 ¢/pt (floor), Fixed Points Travel ~1.75 ¢/pt (transfer must beat this). User's balance: ~220k MR points (`MR_BALANCE` env).
