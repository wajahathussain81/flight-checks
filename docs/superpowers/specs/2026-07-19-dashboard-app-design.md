# Dashboard App Design — flight-checks web application

**Date:** 2026-07-19 · **Status:** approved (approach A)

Turn the read-only LAN dashboard into the primary interface for flight-checks: explore and organize deals, run and monitor scans, tune settings, and manage a deal shortlist — all from the browser. Access control stays the LAN/VPN boundary; no login.

## Architecture amendment

Old rule: scanner writes, server reads. New rule:

- Scanner owns `scans`, `snapshots`, `alerts` (unchanged, append-only).
- Server additionally owns two new tables: `settings`, `deal_status`.
- Both processes read everything.
- Scan triggering goes through systemd (`systemctl start flight-checks-scan.service --no-block`) so manual and scheduled scans share one unit, journal, and failure boundary. Local dev fallback spawns `npx tsx src/scanner/index.ts`.

## Schema (added to `openDb`, `CREATE TABLE IF NOT EXISTS` — upgrades production DB in place)

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deal_status (
  alert_key TEXT PRIMARY KEY,     -- route|date|cabin|program (existing alertKey())
  status TEXT NOT NULL CHECK (status IN ('saved', 'dismissed')),
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
```

## Settings

Whitelisted keys, validated on write, stored as strings in `settings`:
`thresholds.economy`, `thresholds.premiumConservative`, `minValue.economy`, `minValue.premium`, `maxPerRoute`, `mrBalance`, `alertImprovement`, `digestTo` (email format; all others positive numbers).

Precedence: `loadConfig(env)` provides defaults; DB rows override. New `loadEffectiveConfig(db, env)` in core applies the overlay; **scanner and server both use it**, so a UI change affects the next scan without redeploy.

## API (Hono, all JSON)

- `GET /api/deals` — latest finished scan; query params: `cabin`, `country`, `month` (`2026-10`), `minCpp`, `q` (substring match on route or destination city), `sort` (`cpp`|`date`|`mr_points`|`seats`|`cash_cad`, default `cpp`), `dir` (`asc`|`desc`), `includeDismissed` (`1` to include). Rows are joined with `deal_status` (`status`, `note` fields, null when unset). Limit 200.
- `GET /api/meta` — `{ countries: string[], mrBalance: number }` (countries derived from `AIRPORT_CITY`; mrBalance from effective config — replaces the hardcoded constant in the web app).
- `POST /api/deals/status` — `{ alertKey, status: 'saved'|'dismissed'|null, note? }`; null clears the row. 400 on bad status.
- `GET /api/shortlist` — saved deals joined with each key's **latest** snapshot (current cpp/seats or null if gone) + note.
- `GET /api/settings` — `{ settings: { key: { value, default, overridden } } }` for the whitelist.
- `PUT /api/settings` — `{ key, value | null }`; null resets to default. 400 on unknown key or invalid value.
- `POST /api/scan` — 409 `{ error }` if latest scan has `finished_at IS NULL`; else triggers systemd and returns `{ started: true }`.
- `GET /api/history`, `GET /api/scans` — unchanged.

## Digest integration

`selectAlerts` gains: deals whose `alert_key` has `status = 'dismissed'` are excluded before thresholds. Saved deals behave normally (still re-alert on improvement).

## UI (React, existing single-page app; tabs: Deals · Shortlist · History · Runs · Settings)

- **Deals**: filter bar (country select, month select, cabin select, min ¢/pt input, search box) + clickable column headers for sorting; Save/Dismiss buttons per row; dismissed hidden behind a "show dismissed" toggle; "fits balance" highlight uses `/api/meta` mrBalance.
- **Shortlist**: saved deals with live current values (better/worse/gone vs. when saved is visible via the History chart link), editable note, unsave button.
- **History**: unchanged.
- **Runs**: "Scan now" button (disabled + spinner while a scan is unfinished; poll `/api/scans` every 5 s during a run), scan table as today.
- **Settings**: form of whitelisted fields showing effective values, save per field, "reset to default" per overridden field.

## Error handling

API errors: 400 invalid input, 409 scan already running, 500 unexpected (message in `{ error }`). UI surfaces failures as a dismissible banner; optimistic updates roll back on error.

## Testing

Vitest: settings validation + precedence overlay; deals filtering/sorting/search SQL; deal-status round-trip; `selectAlerts` dismissal suppression; shortlist join; scan endpoint with injected fake exec (started / 409 paths). UI verified by `npm run build` + serving with a seeded DB. No live network in tests.

## Out of scope / unchanged

Append-only snapshot history, digest rendering/SMTP, deploy model (`deploy.sh` + systemd), auth (VPN is the boundary), scan scheduling.
