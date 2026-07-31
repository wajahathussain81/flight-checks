# Worldwide Discovery & On-Demand Search — Design

**Date:** 2026-07-31
**Status:** Approved

## Purpose

Two capabilities the app cannot currently deliver:

1. **Worldwide discovery** — surface the best award deals anywhere seats.aero monitors,
   rather than only the 96 hand-curated destinations in `AIRPORT_REGION`, and from a small
   set of positioning origins rather than Calgary alone.
2. **On-demand lookup** — check a specific origin/destination/date-range immediately from
   the dashboard, instead of waiting for the next scheduled scan.

### Motivating failure

A trip watch for post-Ramadan beach destinations returned five rows, all `YYC-CUN`. Three
separate causes, all invisible to the user:

- Jakarta (`CGK`) is searched on every scan and has returned **zero rows across all 30
  scans**. Bali (`DPS`), Phuket (`HKT`) and Maldives (`MLE`) are not in the airport table
  at all and have never been searched once.
- An empty result is indistinguishable from an unmonitored route.
- Ranking is `sort by score, take top N` with no per-route cap, so one strong destination
  consumes every slot.

## Constraints

- **Live Search is unavailable.** The seats.aero Live Search API is commercial-partners
  only, explicitly not available on Pro "regardless of use case". On-demand lookup means
  querying the *cache* immediately, not real-time inventory. The UI must not imply otherwise.
- **No scraping.** External services remain the seats.aero Partner API and SMTP. The
  airport dataset is vendored as a static file, not fetched.
- Snapshots stay append-only. Ranking stays cents per point after transfer ratio.

## API endpoints used

| Endpoint | Use | Notes |
| --- | --- | --- |
| `GET /partnerapi/search` | Ad-hoc lookup | Requires `destination_airport`. Supports `skip` **and** `cursor`; `take` default 500, responses clamped to 10–1000. |
| `GET /partnerapi/availability` | Worldwide scan | `source` (one program), optional `origin_region`/`destination_region` from `[North America, South America, Africa, Asia, Europe, Oceania]`. **No origin-airport filter.** |
| `GET /partnerapi/routes` | Coverage map | All routes a program monitors. |

Existing `skip`-based pagination in `src/scanner/seatsaero.ts` is **correct** and stays.

## Airport metadata

New `src/core/airports.ts` backed by a vendored OurAirports-derived static file (public
domain, checked in) mapping IATA code → `{ city, country, continent, lat, lon }`.

`src/core/regions.ts` keeps theme tags and the country→continent grouping. `AIRPORT_REGION`
is retired as the searchable-destination ceiling; anything in the dataset is in scope.

Airports absent from the dataset are dropped with a counted warning, never a crash.

## Distance-based pricing

`TYPICAL_CASH_CAD` and `OPTIMISTIC_CASH_CAD` are keyed by eight coarse regions, so Cancun
and São Paulo share a band. Worldwide coverage makes hand-maintained per-region bands
untenable.

Replacement: cash estimate as a function of great-circle distance and cabin, in
`src/scanner/pricing.ts`. Bands are configuration, expressed as CAD-per-cabin at distance
breakpoints with linear interpolation between them.

**This changes scores on deals already being tracked.** Existing snapshots are not
rewritten; history charts will show a discontinuity at the cutover, which is expected and
should be noted in the dashboard's history view.

## Origins and positioning

Config gains:

```ts
origins: Array<{ code: string; positioningCad: number }>
```

Defaults: `YYC` 0 (home), `YVR` 150, `SEA` 200, `YYZ` 250, `LAX` 280. Tunable in settings.

Scoring subtracts `positioningCad` from the deal's cash value **before** computing cents
per point, so a single ranked list stays comparable across origins. A deal whose value
after the penalty is ≤ 0 is dropped.

`snapshots` gains an `origin` column, defaulted to `YYC` for existing rows.

`scans` gains a `truncated` column (JSON array of program names whose results hit the page
cap, default `[]`) so a partial scan is visible in the dashboard and not mistaken for full
coverage.

## Route coverage

New `route_coverage(source, origin, destination, last_seen)` table, populated from
`/routes` per configured program and refreshed weekly (on the first full scan of each
ISO week).

When a search returns nothing, the server consults `route_coverage` and reports one of:

- **No availability** — route is monitored, nothing currently bookable.
- **Not monitored** — no configured program monitors this pair; naming which programs, if
  any, monitor it at all.

## Scan flow

For each configured program:

1. Paginate `GET /availability?source=<program>&origin_region=<region>` with `take=500`,
   `skip` incrementing, once per distinct continent among the configured origins — derived
   from the airport dataset, not hardcoded, so adding a non-North-American origin works
   without a code change.
2. Filter locally to configured origins.
3. Attach airport metadata; drop unknown airports.
4. Distance-based cash estimate → score with positioning penalty.
5. Prefilter → append to `snapshots`.

A program that errors mid-scan is logged and skipped; one bad response must not fail the
run. HTTP 429 backs off and retries with a cap.

### Volume guard

`/availability` has no origin-airport filter, so a `North America` pull returns every NA
origin and discards most of it locally. This is a large multiple of current API usage and
the Pro quota is unknown.

A per-program page cap is configuration. **Whenever the cap truncates a program's results,
the scan logs it explicitly and records it on the scan row** — silent truncation must never
read as full coverage. If quota proves binding, the follow-up is a two-tier split (broad
infrequent sweep + narrow frequent scan), which is out of scope here.

## Ad-hoc search

`POST /api/search` with `{ origin, destination, dateFrom, dateTo, cabins? }`:

- Calls `/partnerapi/search` synchronously.
- Scores with the same functions as the scanner, including the positioning penalty.
- Returns scored results **without writing to `snapshots`**, so history and trend charts
  stay clean.
- On empty, returns the coverage explanation above.
- On API error, surfaces the error rather than an empty list.

Dashboard gains a Search tab: origin (defaulting to home), destination, date range, cabin
filter, results table reusing the deals view. Copy states results come from seats.aero's
cache, not live inventory.

## Per-route cap on watches

`src/core/watches.ts` ranks with `sort` then `slice(0, topN)`. Add a configurable
`maxPerRoute` (default 1) so one destination cannot consume every slot; remaining slots
fill by score across distinct routes.

## Testing

- Fixtures for `/availability` and `/routes` beside the existing ones; `fetch` and the mail
  transport stay mocked. No live API calls from tests.
- Unit tests: distance-band pricing at and between breakpoints; positioning penalty
  including the drop-at-or-below-zero case; coverage explanation for both empty cases;
  `maxPerRoute` ranking.
- A test asserts every airport referenced by `AIRPORT_THEMES` exists in the vendored
  dataset, so theme tags cannot drift from the airport table.
- `npm run scan -- --dry-run` keeps working from fixtures.

## Out of scope

- Live Search (unavailable on Pro).
- Chained positioning flights — positioning is a flat configured cost, not a searched leg.
- Two-tier scan split; revisit only if the volume guard shows quota is binding.
- Backfilling `origin` or re-scoring historical snapshots.
