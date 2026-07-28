# Flight Checks — Design

**Date:** 2026-07-18
**Status:** Approved

## Purpose

An always-on award-flight deal watcher for 2026 travel. Scans broadly from Calgary (YYC), finds award availability bookable with the user's ~220k Amex Membership Rewards (Canada) points, compares against cash fares, ranks every deal in cents per MR point, and emails a twice-daily digest of standouts. A local dashboard shows deal history and value trends.

## Hosting

Runs in LXC container 113 (`flight-checks`, Debian 13, <container-ip>) on the user's Proxmox server. Node.js 22, SQLite on local disk, systemd timers for scheduling. Deploy = git push from the Mac, pull + restart script on the container. No cloud hosting.

## Architecture

One TypeScript project, two entry points sharing one SQLite database:

```
flight-checks/
├── src/
│   ├── scanner/      # scheduled job: fetch → filter → price → score → alert
│   ├── server/       # dashboard backend (Hono, LAN only, port 3000)
│   ├── web/          # dashboard frontend (React + Vite)
│   └── core/         # shared: valuation math, db access, config, types
├── data/flights.db   # SQLite — append-only snapshots + alert log
└── deploy/           # systemd units, deploy script
```

- **Scanner** runs twice daily via systemd timer (`07:00` and `19:00` America/Edmonton).
- **Server** is a systemd service serving the built React app + a small JSON API, read-only against the DB.
- Scanner writes, server reads; no other coupling.

## Data sources (no scraping)

| Source | Role | Notes |
|---|---|---|
| seats.aero Pro API | Award availability | Cached-search endpoints; covers all target programs |
| Amadeus Self-Service API | Cash fares (CAD) | Free tier ~2k calls/mo; budget 30 calls/scan, 72h fare cache |
| Gmail SMTP (homelab account) | Email digests | nodemailer + app password; to user@example.com |

Secrets live in `/etc/flight-checks/env` on the container (not in git).

## Programs & transfer ratios (Amex MR Canada)

| Program | MR → miles | Expected role |
|---|---|---|
| Aeroplan | 1 : 1 | Primary |
| British Airways Avios | 1 : 1 | Short-haul partners |
| Flying Blue | 1 : 0.75 | Promo Rewards to Europe |
| Cathay Asia Miles | 1 : 0.75 | Long-haul Asia J |
| Delta SkyMiles | 1 : 0.75 | Scanned, rarely wins |

Ratios are config, not code — editable without redeploy.

## Scan funnel

1. **Bulk pull:** seats.aero cached availability departing YYC, all published 2026 dates (~355 days out), economy + premium, direct and 1-stop.
2. **Local pre-filter:** dedupe to cheapest miles per (route, date, cabin, program); drop rows that cannot clear 1.75 ¢/pt even under an optimistic cash-fare assumption (config: per-region optimistic fare table).
3. **Cash-price finalists:** Amadeus exact route/date/cabin, ≤30 calls per run, 72h cache keyed (route, date, cabin). Overflow finalists carry to next run, highest-potential first.
4. **Score, snapshot, alert.**

## Valuation

```
MR points needed = program miles ÷ transfer ratio
value (¢/pt)     = (cash fare CAD − award taxes/fees CAD) ÷ MR points needed × 100
```

- All amounts normalized to CAD.
- Ranking is always ¢ per **MR point**.
- **Premium-cabin conservative value:** cash comp capped at 3× same-route economy fare; ranking and thresholds use the conservative number, digest shows both raw and conservative.
- Benchmarks shown in UI/digest: 1.0 ¢/pt (statement credit floor), 1.75 ¢/pt (Fixed Points Travel).

## Alerting rules

- Digest includes: economy deals ≥ 1.75 ¢/pt, premium deals ≥ 3.0 ¢/pt (conservative). Top 10 of each.
- "Fits 220k budget" marker on deals where MR points needed ≤ configured balance.
- Dedupe: a previously alerted (route, date, cabin, program) stays silent unless value improves ≥ 15% or seat count increases.
- Scan failures (either API) are retried with backoff; persistent failure is reported in the next digest, never silently swallowed.

## Data model (SQLite)

- `snapshots` — append-only: scan_id, timestamp, route, date, cabin, program, miles, taxes_cad, cash_cad, cash_source, cpp_raw, cpp_conservative, seats. Powers history charts.
- `alerts` — what was emailed and when, for dedupe.
- `fare_cache` — Amadeus responses with fetched_at for 72h TTL.
- `scans` — one row per run: started, finished, rows pulled, finalists, API calls used, errors.

## Dashboard (LAN: http://<container-ip>:3000)

- **Deals** — current best, sortable by ¢/pt, filters: cabin, region, program, fits-budget.
- **History** — per-route charts of ¢/pt and cash price over time.
- **Runs** — scan log with API quota usage and errors.

## Error handling

- API failures: 3 retries with exponential backoff; run continues with partial data and records the error on the `scans` row.
- Amadeus quota guard: hard stop at monthly budget with digest warning.
- Email failure: logged; deals still snapshotted so nothing is lost.

## Testing

- Unit tests for valuation math, transfer ratios, pre-filter, and alert dedupe (vitest).
- Fixture-based tests for API response parsing (recorded seats.aero/Amadeus JSON).
- No live-API tests in CI; a `--dry-run` scanner flag exercises the full pipeline against fixtures.

## Out of scope (v1)

- Positioning flights, multi-city awards, stopover optimization
- Non-flight redemptions (hotels, statement credit tracking)
- Auto-booking of any kind
- Public internet exposure of the dashboard
