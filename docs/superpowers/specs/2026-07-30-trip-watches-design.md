# Trip Watches — Design

**Date:** 2026-07-30
**Status:** Approved

## Purpose

Let the user define named "trip watches" — a travel-date window plus destination rules
(excluded countries, optional continents, optional themes, optional cabins) — and have
every scheduled full scan report the current best matching deals in the digest email and
on the dashboard. The motivating watch: best award deals outside the US and Canada for
post-Ramadan travel, Mar 10 – Apr 15 2027, beach destinations, using Amex MR points.

Watches are a ranked **view** over each scan's scored deals. They write no snapshots and
create no new pricing sources.

## Data model

New `watches` table in the shared SQLite database. The **server owns it** (CRUD), the
scanner only reads it — same ownership split as `settings`/`deal_status`. Created with
`CREATE TABLE IF NOT EXISTS` in `src/core/db.ts` alongside the existing tables.

| column               | type    | notes                                              |
| -------------------- | ------- | -------------------------------------------------- |
| `id`                 | INTEGER | primary key                                        |
| `name`               | TEXT    | required, non-empty                                |
| `enabled`            | INTEGER | default 1                                          |
| `date_from`          | TEXT    | ISO day, required                                  |
| `date_to`            | TEXT    | ISO day, required, must be ≥ `date_from`           |
| `exclude_countries`  | TEXT    | JSON array of country names, default `[]`          |
| `include_continents` | TEXT    | JSON array, default `[]` = anywhere                |
| `themes`             | TEXT    | JSON array of theme slugs, default `[]` = any vibe |
| `cabins`             | TEXT    | JSON array of cabins, default `[]` = all cabins    |
| `top_n`              | INTEGER | default 5                                          |
| `created_at`         | TEXT    | ISO timestamp                                      |

A watch is **active** when `enabled = 1` and `date_to` is today or later; otherwise it is
**disabled** or **expired**. Expired watches are skipped by the scanner and labeled in
the UI; they are kept until deleted.

## Destination themes

New `src/core/themes.ts`:

- `type Theme = 'beach' | 'city' | 'nature'`
- `AIRPORT_THEMES: Record<string, Theme[]>` — curated static tags for every airport in
  `AIRPORT_REGION`, one or more themes each (e.g. CUN → beach; FCO → city;
  KEF → nature; IST → city + beach). Same static-metadata philosophy as `regions.ts` —
  no external lookups.
- A unit test asserts every airport in `AIRPORT_REGION` has at least one theme, so new
  destinations cannot ship untagged.

## Matching and ranking

A pure function in core (e.g. `matchWatch(watch, deals)`):

1. Travel `date` within `[date_from, date_to]`.
2. Destination country not in `exclude_countries`.
3. If `include_continents` is non-empty, destination continent must be included.
4. If `themes` is non-empty, destination must carry at least one selected theme.
5. If `cabins` is non-empty, the deal's cabin must be included.
6. Rank by cents per point — raw cpp for economy, conservative cpp for premium cabins
   (existing convention) — and keep the top `top_n`.

Watches rank within deals that already passed the existing viability prefilter, so the
scan pipeline is unchanged; if nothing in the window is viable yet, the watch reports
zero matches.

## Scanner and digest behavior

- Watches are evaluated during **full scans only**; country-scoped scans remain
  digest-free and watch-free.
- The digest gains one section per active watch: name, window, region/theme summary, and
  the ranked matches (route, city, cabin, program, miles, taxes, cpp). A watch with zero
  matches renders a "no deals in your window yet" line so the market state is always
  visible.
- Digest send condition becomes: alerts **or** errors **or** at least one active watch
  (previously alerts or errors). Digest readiness gating (`digestReady`) is unchanged.
- Watch sections bypass `recordAlerts` and the re-alert improvement rule — they are a
  recurring overview, not one-shot alerts. Threshold-based alerting is untouched.

## API (Hono, server)

- `GET /api/watches` — list all watches with computed state (`active` / `expired` /
  `disabled`).
- `POST /api/watches` — create. Validates: non-empty name, valid ISO dates with
  `date_from ≤ date_to`, countries against airport metadata, continents against
  `COUNTRY_CONTINENT`, themes against the taxonomy, cabins against the cabin type,
  `top_n ≥ 1`. Invalid input → 400 with a message.
- `PUT /api/watches/:id` — update, same validation. Unknown id → 404.
- `DELETE /api/watches/:id` — delete. Unknown id → 404.
- `GET /api/watches/:id/deals` — the watch's current matches, applying the same matcher
  to the newest finished full scan (the same source `/api/deals` uses). This is exactly
  what the next digest section would show.

## Dashboard

A "Watches" section in the dashboard:

- List: name, window, region/theme summary, computed state, enabled toggle, edit,
  delete.
- "New watch" form: name, date range, excluded-country multi-select, optional continent
  multi-select, theme chips, cabin chips, top-N.
- Selecting a watch shows its current matches via `GET /api/watches/:id/deals`, using
  the existing deal-card rendering.

The first watch is created as **data** after deployment (via the UI or API), not seeded
in code: name "Post-Ramadan international", Mar 10 – Apr 15 2027, exclude `USA` (and
`Canada` — already excluded from fetch by default config, but listed for robustness;
country names use the `AIRPORT_CITY` spellings), theme `beach`, all cabins, top 5.

## Error handling

- Scanner: a malformed watch row (bad JSON, bad dates) is skipped with a scan-error
  entry rather than failing the scan.
- Server: validation failures return 400; missing ids 404. JSON columns are parsed once
  at the read boundary into a typed `Watch` object.

## Testing

- Core: `matchWatch` unit tests (window edges, exclusions, continents, themes, cabins,
  ranking convention, top-N), theme-coverage test for `AIRPORT_THEMES`.
- Server: CRUD + validation tests, `watches/:id/deals` against a seeded scan.
- Scanner: digest rendering with watch sections (matches and zero-match line), digest
  send-condition change, dry-run integration via `tests/fixtures/` with a seeded watch.
- Fetch and mail transport mocked throughout; no live APIs.

## Out of scope

- Watch-specific alert thresholds or re-alert rules.
- Watch-specific scan scheduling or scoped seats.aero fetches (watches filter the
  existing full-scan data).
- Automatic Ramadan/holiday date calculation.
- New pricing sources.
