# flight-checks

Self-hosted award-flight deal watcher. Twice a day it pulls award availability from the [seats.aero](https://seats.aero) Partner API for flights out of Calgary (YYC), scores every fare in **cents per Amex MR point**, stores an append-only snapshot history in SQLite, emails a ranked digest, and serves a LAN dashboard for browsing, saving, and dismissing deals.

Built because manually checking award availability across five loyalty programs is a part-time job, and a scheduled pipeline with a scoring function does it better.

## How it works

```
systemd timer (07:00 / 19:00)
        │
        ▼
  scanner ──► seats.aero API ──► prefilter ──► valuation ──► SQLite snapshot ──► email digest
                                                                  │
                                                                  ▼
                                                        Hono API + React dashboard
                                                        (filter / sort / save / dismiss /
                                                         trigger scans / edit settings)
```

- **`src/scanner/`** — the scheduled job: API pull → prefilter → static cash-fare estimate → cpp scoring → snapshot → digest. Country-scoped scans can be triggered from the dashboard and never send digests.
- **`src/server/`** — Hono API serving the newest finished scan plus deal state. `app.ts` is fully testable; `index.ts` just binds the port.
- **`src/web/`** — React + Vite dashboard with continent/country/month/cabin filters and per-deal history sparklines.
- **`src/core/`** — config, valuation math, prefilter rules, SQLite layer. UI settings overlay env defaults through a whitelist (`loadEffectiveConfig`); secrets stay env-only.

### Scoring rules

All money is CAD; the ranking metric is cents per **MR point** (program miles ÷ transfer ratio, per program). Premium cabins use a conservative comp (cash value capped at 3× economy) so lie-flat seats don't inflate their own math. Digests only include deals clearing both a cpp threshold (≥1.75¢ economy, ≥3.0¢ premium) and a minimum net cash value, and a deal only re-alerts if its value improves ≥15% or seats increase — the inbox stays quiet unless something is actually worth booking.

## Engineering rules

- **No live APIs in tests, ever.** `fetch` and the mail transport are mocked; `npm run scan -- --dry-run` runs the full pipeline from fixtures with zero network.
- **No web scraping.** External surface is exactly two things: the seats.aero Partner API and Gmail SMTP.
- **Secrets never touch git.** Local secrets live in gitignored `env.local`; the deploy script installs them to `/etc/flight-checks/env` (mode 600) on the target.
- **Snapshots are append-only** — history charts come free and no scan can destroy data.

## Deployment

Runs in a Debian LXC on a Proxmox host, managed by systemd:

- `flight-checks-scan.timer` — scans at 07:00 and 19:00 America/Edmonton
- `flight-checks-web.service` — dashboard on port 3000 (LAN only)
- `./deploy/deploy.sh` — rsync, `npm ci`, build, install units, restart

## Stack

TypeScript (Node 22, strict, ESM) · Hono · better-sqlite3 · React 19 + Vite · nodemailer · Vitest (12 test files, mocked network) · systemd on Proxmox LXC

## Development

```bash
npm ci
npx vitest run              # full suite, no network
npm run scan -- --dry-run   # end-to-end pipeline from fixtures
npm run serve               # dashboard on :3000
```

Design docs and implementation plans are in `docs/superpowers/` — the project was built spec-first, with the plan as the source of truth during implementation.

## License

MIT
