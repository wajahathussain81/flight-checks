# flight-checks

flight-checks is a self-hosted award-flight deal watcher that watches award availability from your home airport, compares redemptions across your points programs, emails the best opportunities, and gives you a dashboard for filtering, saving, and dismissing deals. Any home airport and points program can be configured; the shipped defaults use Calgary (YYC) and Amex Membership Rewards Canada.

<!-- TODO(maintainer): drop in a real screenshot -->
![dashboard](docs/screenshot.png)

## Quick start

The canonical installation uses Docker Compose:

```bash
git clone https://github.com/wajahathussain81/flight-checks.git
cd flight-checks
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000). On a fresh installation, the setup wizard walks through your seats.aero API key, home airport, points program and transfer ratios, and an optional email digest.

For a bare Node.js 22 installation:

```bash
npm install
npm run build
npm run serve
```

The scanner uses the seats.aero Partner API, which requires a [seats.aero Pro subscription](https://seats.aero/).

## How it works

```text
built-in scheduler (configured times)
        │
        ▼
  scanner ──► seats.aero API ──► prefilter ──► valuation ──► SQLite snapshot ──► email digest
                                                                  │
                                                                  ▼
                                                        Hono API + React dashboard
                                                        (filter / sort / save / dismiss /
                                                         trigger scans / edit settings)
```

- `src/scanner/` runs the scan pipeline: bulk API pull → prefilter → distance-based cash-fare estimate → points scoring → snapshot → digest. Full scans query seats.aero's bulk availability endpoint per program and keep the rows departing your configured origins. Country-scoped scans can be triggered from the dashboard and never send digests.
- `src/server/` provides the Hono API, dashboard host, built-in scheduler, and direct child-process scan trigger. `app.ts` is fully testable; `index.ts` binds the port.
- `src/web/` is the React and Vite dashboard, with a Search tab for on-demand route lookups, continent, country, month, and cabin filters, per-deal history, and a Watches tab for trip watches (travel window + destination rules + beach/city/nature themes) that each full scan reports on in the digest.
- `src/core/` contains configuration, valuation math, prefilter rules, airport data, distance-based fares, route coverage, and the SQLite layer. UI settings are stored in SQLite, while secrets are write-only in API responses.

Airport metadata comes from a vendored subset of the public-domain [OurAirports](https://ourairports.com/data/) dataset at `src/core/airports.data.json`. It is never fetched at runtime. To refresh it:

```bash
curl -sL https://davidmegginson.github.io/ourairports-data/airports.csv -o airports.csv
node scripts/build-airports.mjs airports.csv
```

### On-demand search

The Search tab queries seats.aero's **cached** data for a single origin, destination and date range, and returns scored results immediately without writing snapshots. seats.aero's Live Search endpoint is restricted to commercial partners and is not available on Pro accounts, so results reflect the cache rather than real-time inventory.

When a search returns nothing, the app distinguishes two cases: the route is monitored but currently has no availability, or no configured program monitors it at all — in which case it names any programs that reach that destination from a different origin, so you know positioning elsewhere would unlock it.

Snapshots are append-only, so every scan adds history without destroying previous observations.

## Scoring rules

The ranking metric is cents per point of your program. Program miles are divided by the configured transfer ratio to determine the points required, then taxes and the origin's positioning cost are subtracted from a cash-fare estimate. That estimate interpolates over great-circle distance and cabin rather than using coarse regions, and the breakpoint tables are in CAD and intentionally easy to replace in `src/core/fares.ts`.

Deals from origins other than home carry a configurable positioning cost that is subtracted before scoring, so a strong deal out of a distant hub does not outrank a home-airport deal on raw score alone.

Premium cabins use a conservative comparison, capped at three times the economy cash value, so an unusually high premium fare does not inflate its own score. By default, email digests require at least 1.75 cents per point for economy or 3.0 cents per point for premium cabins, plus a minimum net cash value. A deal is re-alerted only when its value improves by at least 15% or its seat count increases. All thresholds, transfer ratios, cash estimates, and alert limits are configurable.

## Configuration

The setup wizard and Settings screen are the normal place to configure flight-checks. Effective configuration follows this precedence:

**environment variables > UI/database settings > defaults**

Secrets saved through the UI are stored in SQLite but are write-only through the settings API. Environment variables are most useful for headless or centrally managed installations.

| Setting key | Environment variable | Purpose |
| --- | --- | --- |
| `seatsAeroKey` | `SEATS_AERO_KEY` | seats.aero Partner API key |
| `origin` | `ORIGIN` | Three-letter home-airport IATA code |
| `origins` | `ORIGINS` | Origins to scan with positioning costs, e.g. `YYC:0,YVR:150,LAX:280` |
| `maxPagesPerProgram` | `MAX_PAGES_PER_PROGRAM` | Page cap per program on bulk scans (default 150, 500 rows per page); truncation is logged and recorded on the scan |
| `pointsProgram` | — | Display name for your points currency |
| `pointsBalance` | `POINTS_BALANCE` (`MR_BALANCE` legacy) | Available points balance |
| `currency` | — | Display currency for cash comparisons |
| `excludedCountries` | — | JSON list of countries to omit |
| `ratios` | — | JSON map of seats.aero program sources to transfer ratios |
| `thresholds.economy` | — | Minimum economy cents-per-point score |
| `thresholds.premiumConservative` | — | Minimum conservative premium score |
| `minValue.economy` | `MIN_VALUE_ECONOMY` | Minimum economy net cash value for alerts |
| `minValue.premium` | `MIN_VALUE_PREMIUM` | Minimum premium net cash value for alerts |
| `maxPerRoute` | `MAX_PER_ROUTE` | Maximum dates per route and cabin in a digest (trip watches have their own per-watch `maxPerRoute`, default 1) |
| `alertImprovement` | — | Fractional improvement required before re-alerting |
| `scanSchedule` | — | JSON schedule with local times and an IANA timezone |
| `digestEnabled` | — | Enables or disables email digests |
| `digestTo` | `DIGEST_TO` | Digest recipient |
| `smtp.host` | `SMTP_HOST` | SMTP server host |
| `smtp.port` | `SMTP_PORT` | SMTP server port |
| `smtp.user` | `SMTP_USER` (`GMAIL_USER` legacy) | SMTP username |
| `smtp.password` | `SMTP_PASSWORD` (`GMAIL_APP_PASSWORD` legacy) | SMTP password or app password |
| Runtime only | `DB_PATH` | SQLite database path |
| Runtime only | `PORT` | Dashboard port, default `3000` |
| Runtime only | `SCHEDULER` | Set to `off` to disable the built-in scheduler |

See [`.env.example`](.env.example) for an environment-file template. Leaving variables unset lets the wizard and database settings govern the application.

## Deployment

Docker Compose is the canonical deployment. It builds the application, publishes port 3000, mounts `./data` for durable SQLite storage, and restarts the service unless stopped:

```bash
docker compose up -d
docker compose logs -f
```

For a bare-node host, install dependencies, build the dashboard, and keep `npm run serve` running. The example web-only unit in `deploy/flight-checks-web.service` can be adapted to your paths:

```ini
[Unit]
Description=Flight Checks dashboard
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/opt/flight-checks
EnvironmentFile=/etc/flight-checks/env
ExecStart=/opt/flight-checks/node_modules/.bin/tsx src/server/index.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

The web process runs the scheduler in-process using the schedule configured in the UI. If another scheduler should own scan timing, set `SCHEDULER=off` for the web process and invoke `npm run scan` from cron or another job runner.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, project rules, and the pull request flow. All participation is covered by the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
