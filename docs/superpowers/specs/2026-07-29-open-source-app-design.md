# flight-checks: open-source self-hosted app — design

**Date:** 2026-07-29
**Status:** Approved

## Goal

Turn flight-checks from a personal YYC/Amex-MR tool into a self-hostable open-source
application anyone can run, configure entirely from the browser, and contribute to.
Repo is already public at `github.com/wajahathussain81/flight-checks` (MIT).

Four pillars:

1. **DB-backed config with env seeding** — the app boots with zero env vars.
2. **First-run setup wizard** (the "landing page") — enter everything in the browser.
3. **Docker + in-process scheduler** — `docker compose up` is the canonical install.
4. **Contributor infrastructure** — CI, docs, templates.

## 1. Config model

`loadConfig(env)` stops throwing on missing env vars. Precedence per key:

```
env var (if set)  >  DB settings row  >  shipped default
```

Shipped defaults are the current hard-coded Amex MR Canada values (ratios,
thresholds, YYC origin, Canada exclusion, CAD label). `DB_PATH` and `PORT` stay
env-only and never appear in settings.

New/expanded setting keys (all editable via wizard + Settings tab):

| Key | Type | Default |
|---|---|---|
| `seatsAeroKey` | secret string | — (required for scans) |
| `origin` | IATA string | `YYC` |
| `pointsProgram` | string label | `Amex MR (Canada)` |
| `pointsBalance` | number | 220000 (renames `mrBalance`) |
| `ratios` | JSON `Record<source, number>` | current 5-program map |
| `currency` | string label | `CAD` |
| `excludedCountries` | JSON string[] | `["Canada"]` |
| `thresholds.economy` / `.premiumConservative` | number | 1.75 / 3.0 |
| `minValue.economy` / `.premium` | number | 400 / 1200 |
| `maxPerRoute`, `alertImprovement` | number | 3 / 0.15 |
| `scanSchedule` | JSON `{times: string[], timezone: string}` | 07:00 & 19:00 America/Edmonton |
| `digestEnabled` | boolean | false until SMTP configured |
| `digestTo` | email | — |
| `smtp` | JSON `{host, port, user}` + secret `smtpPassword` | Gmail preset (`smtp.gmail.com:465`) |

Config completeness: `configComplete(cfg)` = seats.aero key present. The digest is
independently optional (`digestEnabled` + SMTP present). Scanner runs without email
config; it just skips the digest step and logs why.

**Secrets in DB (approved decision):** `seatsAeroKey` and `smtpPassword` are stored
in the `settings` table. `GET /api/settings` returns secrets redacted as
`{ set: true }` / `{ set: false }`; they are write-only. Env vars (`SEATS_AERO_KEY`,
`SMTP_PASSWORD`/`GMAIL_APP_PASSWORD`) still override for headless installs.
`GMAIL_USER`/`GMAIL_APP_PASSWORD` remain accepted as legacy aliases mapping onto the
generic SMTP keys. Secrets never appear in logs, digests, or API GET responses.

## 2. Setup wizard (landing page)

Server exposes `GET /api/status` → `{ configured: boolean, ... }`. When
`configured === false`, the React app renders the wizard instead of the dashboard.

- **Step 1 — Connect:** seats.aero API key (password field, "Test connection"
  button → `POST /api/test/seatsaero` performs a 1-row live probe), home airport
  (IATA, validated).
- **Step 2 — Points:** program name, balance, editable transfer-ratio table
  prefilled with the MR Canada map (add/remove rows; row key = seats.aero `Source`),
  currency label.
- **Step 3 — Email digest (optional, skippable):** SMTP host/port/user/password
  with Gmail preset, recipient, "Send test email" button → `POST /api/test/email`.
- **Finish:** writes all settings in one `PUT /api/settings` batch, flips to the
  dashboard, offers to trigger a first scan.

The existing Settings tab expands to cover every wizard field so anything can be
changed later. Advanced keys (thresholds, minValue, schedule, excluded countries)
live only in Settings, not the wizard — wizard stays 3 steps.

## 3. Scheduler + Docker

- **In-process scheduler:** the web server owns scheduling. On boot and on settings
  change it computes the next run from `scanSchedule` (times + IANA timezone,
  plain `setTimeout` re-armed after each run — no cron library) and spawns the
  scanner exactly like country scans do today: `tsx src/scanner/index.ts` child
  process. The `systemctl start flight-checks-scan.service` trigger path is
  deleted; `POST /api/scan` (full) also spawns directly. Concurrency guard (409 if
  unfinished scan <30 min old) is preserved and also gates scheduled runs.
- **Docker:** multi-stage `Dockerfile` (node:22-alpine; build web with Vite, run
  server via tsx), `docker-compose.yml` with a single `./data:/data` volume
  (`DB_PATH=/data/flights.db`), port 3000. `SCHEDULER=off` env escape hatch for
  people who want external cron.
- **Existing LXC deploy:** `deploy.sh` and the web service keep working; the scan
  timer/service units are removed from `deploy/` and the deploy script disables
  them if present. Scheduling now comes from the always-on web service.

## 4. Contributor infrastructure

- `.github/workflows/ci.yml` — on push/PR: `npm ci`, `tsc --noEmit`,
  `npx vitest run`, `npm run build`.
- `CONTRIBUTING.md` — dev setup, no-live-APIs-in-tests rule, fixture workflow,
  PR expectations. `CODE_OF_CONDUCT.md` (Contributor Covenant).
- `.github/ISSUE_TEMPLATE/` bug + feature templates, `PULL_REQUEST_TEMPLATE.md`.
- `.env.example` at repo root documenting every env var (all optional now).
- README overhaul: pitch, screenshot placeholder, `docker compose up` quick start,
  wizard walkthrough, architecture diagram, config reference table, contributing
  pointer. Remove "for 2026 travel"/personal framing.
- `CLAUDE.md` trimmed to generic project guidance; homelab/Proxmox/SSH specifics
  move to gitignored `CLAUDE.local.md`.
- GitHub repo metadata: topics (`award-travel`, `self-hosted`, `seats-aero`,
  `points`, `typescript`), description already set.

## Error handling

- Wizard "test" endpoints return structured `{ ok, message }`; failures never
  persist settings.
- Scanner without a key: exits with a clear log line, records nothing.
- Scheduler survives scanner crashes (child exit ≠ server exit) and re-arms.
- Settings validation extends the existing whitelist pattern
  (`validateSetting`): IATA format, IANA timezone, ratio bounds (0 < r ≤ 2),
  port range, email format.

## Testing

TDD throughout; all existing tests keep passing (renames aside). New coverage:
config precedence (env > DB > default), secret redaction, `configComplete`,
scheduler next-run math (timezone + DST edges, mocked timers), wizard API
(`/api/status`, test endpoints with mocked fetch/transport, batch settings PUT),
scanner skip-digest path. No live APIs in tests, ever. CI must be green on the PR.

## Out of scope (YAGNI)

Multi-program presets beyond MR Canada, currency conversion, auth/multi-user,
public marketing site, HTTPS termination, migrations UI. The generalization makes
these easy for contributors to add later — that's the point.
