# Worldwide Discovery & On-Demand Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fixed-origin scanning over 96 hand-curated destinations with multi-origin worldwide discovery via seats.aero's bulk `/availability` endpoint, plus an instant on-demand search that distinguishes "no availability" from "route not monitored".

**Architecture:** A vendored public-domain airport dataset supplies country/continent/coordinates for every IATA code, which lets cash-fare estimates key off great-circle distance instead of eight coarse region buckets. Origins become a configured list, each with a flat positioning cost subtracted from a deal's value before scoring. The scanner pulls per-program bulk availability and filters to configured origins locally; a `route_coverage` table built from `/routes` explains empty results.

**Tech Stack:** TypeScript ESM (Node 22, strict, `NodeNext`), better-sqlite3, Hono, React + Vite, Vitest.

## Global Constraints

- **No scraping.** External services are the seats.aero Partner API and SMTP only. The airport dataset is vendored as a checked-in file generated once by a script; runtime never fetches it.
- **Live Search is unavailable** (commercial partners only). On-demand search queries the cache. UI copy must not imply real-time inventory.
- Mock `fetch` and the mail transport in tests. Never hit live APIs from the test suite.
- Snapshots are append-only. Ad-hoc searches never write to `snapshots`.
- Ranking is cents per point after applying the configured transfer ratio.
- Run `npx vitest run` and `npx tsc --noEmit` before claiming any task done.
- Never add AI attribution trailers to commit messages.

---

### Task 1: Airport dataset and metadata module

**Files:**
- Create: `scripts/build-airports.mjs`
- Create: `src/core/airports.data.json` (generated, committed)
- Create: `src/core/airports.ts`
- Test: `tests/core/airports.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `AirportInfo { city: string; country: string; continent: string; lat: number; lon: number }`; `airportInfo(code: string): AirportInfo | undefined`; `distanceKm(a: string, b: string): number | undefined`.

- [ ] **Step 1: Write the generation script**

`scripts/build-airports.mjs` — reads the OurAirports CSV (public domain) from a local path and writes the JSON the app ships with.

```js
// Usage: curl -sL https://davidmegginson.github.io/ourairports-data/airports.csv -o /tmp/airports.csv
//        node scripts/build-airports.mjs /tmp/airports.csv
import { readFileSync, writeFileSync } from 'node:fs'

const CONTINENTS = { AF: 'Africa', AN: 'Antarctica', AS: 'Asia', EU: 'Europe', NA: 'North America', OC: 'Oceania', SA: 'South America' }

const parseCsvLine = (line) => {
  const out = []
  let cur = '', quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

const csv = readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean)
const header = parseCsvLine(csv[0])
const col = (name) => header.indexOf(name)
const [iC, tC, nC, laC, loC, coC, ctC, muC] =
  ['iata_code', 'type', 'name', 'latitude_deg', 'longitude_deg', 'continent', 'iso_country', 'municipality'].map(col)

const KEEP = new Set(['large_airport', 'medium_airport'])
const out = {}
for (const line of csv.slice(1)) {
  const f = parseCsvLine(line)
  const iata = f[iC]?.trim()
  if (!iata || iata.length !== 3 || !KEEP.has(f[tC])) continue
  out[iata] = {
    city: (f[muC] || f[nC] || '').trim(),
    country: f[ctC].trim(),
    continent: CONTINENTS[f[coC].trim()] ?? 'Other',
    lat: Number(f[laC]),
    lon: Number(f[loC]),
  }
}
writeFileSync(new URL('../src/core/airports.data.json', import.meta.url), JSON.stringify(out, null, 0) + '\n')
console.log(`wrote ${Object.keys(out).length} airports`)
```

- [ ] **Step 2: Generate the dataset**

```bash
curl -sL https://davidmegginson.github.io/ourairports-data/airports.csv -o /tmp/airports.csv
node scripts/build-airports.mjs /tmp/airports.csv
```

Expected: `wrote 7000+ airports` and `src/core/airports.data.json` exists.

Note: `iso_country` is a two-letter code (`CA`, `MX`), not a country name. Task 3 maps it to the names `excludedCountries` uses.

- [ ] **Step 3: Write the failing test**

`tests/core/airports.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { airportInfo, distanceKm } from '../../src/core/airports.js'

describe('airportInfo', () => {
  it('resolves a known airport', () => {
    const yyc = airportInfo('YYC')
    expect(yyc?.country).toBe('CA')
    expect(yyc?.continent).toBe('North America')
  })

  it('returns undefined for an unknown code', () => {
    expect(airportInfo('ZZZ')).toBeUndefined()
  })

  it('includes airports the old curated table never had', () => {
    expect(airportInfo('DPS')?.country).toBe('ID')
    expect(airportInfo('HKT')?.country).toBe('TH')
  })
})

describe('distanceKm', () => {
  it('computes great-circle distance', () => {
    // YYC -> LHR is roughly 7000 km
    expect(distanceKm('YYC', 'LHR')).toBeGreaterThan(6800)
    expect(distanceKm('YYC', 'LHR')).toBeLessThan(7400)
  })

  it('is zero for the same airport', () => {
    expect(distanceKm('YYC', 'YYC')).toBeCloseTo(0)
  })

  it('returns undefined when either airport is unknown', () => {
    expect(distanceKm('YYC', 'ZZZ')).toBeUndefined()
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/core/airports.test.ts`
Expected: FAIL — cannot resolve `../../src/core/airports.js`.

- [ ] **Step 5: Write the implementation**

`src/core/airports.ts`:

```ts
import data from './airports.data.json' with { type: 'json' }

export interface AirportInfo {
  city: string
  country: string
  continent: string
  lat: number
  lon: number
}

const AIRPORTS = data as Record<string, AirportInfo>

export function airportInfo(code: string): AirportInfo | undefined {
  return AIRPORTS[code]
}

const toRad = (deg: number): number => (deg * Math.PI) / 180
const EARTH_RADIUS_KM = 6371

export function distanceKm(a: string, b: string): number | undefined {
  const from = AIRPORTS[a]
  const to = AIRPORTS[b]
  if (!from || !to) return undefined
  const dLat = toRad(to.lat - from.lat)
  const dLon = toRad(to.lon - from.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/core/airports.test.ts && npx tsc --noEmit`
Expected: PASS. If `tsc` rejects the JSON import, add `"resolveJsonModule": true` to `tsconfig.json` `compilerOptions`.

- [ ] **Step 7: Guard the theme tags against drift**

`AIRPORT_THEMES` in `src/core/themes.ts` was written against the old 96-airport table. Append to `tests/core/airports.test.ts`:

```ts
import { AIRPORT_THEMES } from '../../src/core/themes.js'

describe('theme tags', () => {
  it('only tag airports present in the vendored dataset', () => {
    const missing = Object.keys(AIRPORT_THEMES).filter(code => !airportInfo(code))
    expect(missing).toEqual([])
  })
})
```

Run: `npx vitest run tests/core/airports.test.ts`
Expected: PASS. If any code is missing, it is a small or closed airport the dataset filters out — remove it from `AIRPORT_THEMES` rather than widening the dataset filter.

- [ ] **Step 8: Commit**

```bash
git add scripts/build-airports.mjs src/core/airports.data.json src/core/airports.ts tests/core/airports.test.ts tsconfig.json
git commit -m "feat: vendored airport dataset with distance lookup"
```

---

### Task 2: Distance-based fare estimates

**Files:**
- Create: `src/core/fares.ts`
- Modify: `src/scanner/pricing.ts` (whole file)
- Modify: `src/core/prefilter.ts:16-20` (`optimisticPotential`)
- Test: `tests/core/fares.test.ts`

**Interfaces:**
- Consumes: `distanceKm` from Task 1.
- Produces: `typicalCashCad(distanceKm: number, cabin: Cabin): number`; `optimisticCashCad(distanceKm: number, cabin: Cabin): number`. `estimateCashFares(route, cabin)` keeps its existing signature and `FareEstimate` return type.

- [ ] **Step 1: Write the failing test**

`tests/core/fares.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { optimisticCashCad, typicalCashCad } from '../../src/core/fares.js'

describe('typicalCashCad', () => {
  it('prices a short hop below a long haul', () => {
    expect(typicalCashCad(500, 'economy')).toBeLessThan(typicalCashCad(9000, 'economy'))
  })

  it('prices business above economy at the same distance', () => {
    expect(typicalCashCad(3000, 'business')).toBeGreaterThan(typicalCashCad(3000, 'economy'))
  })

  it('interpolates linearly between breakpoints', () => {
    const low = typicalCashCad(2000, 'economy')
    const high = typicalCashCad(6000, 'economy')
    const mid = typicalCashCad(4000, 'economy')
    expect(mid).toBeGreaterThan(low)
    expect(mid).toBeLessThan(high)
  })

  it('clamps below the first and above the last breakpoint', () => {
    expect(typicalCashCad(0, 'economy')).toBe(typicalCashCad(500, 'economy'))
    expect(typicalCashCad(99_000, 'first')).toBe(typicalCashCad(15_000, 'first'))
  })
})

describe('optimisticCashCad', () => {
  it('is always at least the typical estimate', () => {
    for (const d of [500, 3000, 9000, 15_000]) {
      expect(optimisticCashCad(d, 'business')).toBeGreaterThanOrEqual(typicalCashCad(d, 'business'))
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/fares.test.ts`
Expected: FAIL — cannot resolve `../../src/core/fares.js`.

- [ ] **Step 3: Write the implementation**

`src/core/fares.ts`:

```ts
import type { Cabin } from './types.js'

// Typical one-way CAD fares from a Canadian origin at each distance breakpoint.
// Static stand-in for a live pricing API (Amadeus Self-Service shut down 2026-07-17).
const BREAKPOINTS_KM = [500, 2000, 4000, 6000, 9000, 12_000, 15_000]

const TYPICAL: Record<Cabin, number[]> = {
  economy: [180, 300, 450, 650, 900, 1150, 1350],
  premium: [320, 520, 780, 1100, 1500, 1900, 2200],
  business: [500, 850, 1300, 1900, 2700, 3500, 4200],
  first: [750, 1300, 2000, 2900, 4200, 5600, 6800],
}

// Best-plausible fares, used only to discard hopeless rows cheaply.
const OPTIMISTIC_MULTIPLIER = 1.6

function interpolate(table: number[], distanceKm: number): number {
  if (distanceKm <= BREAKPOINTS_KM[0]) return table[0]
  const last = BREAKPOINTS_KM.length - 1
  if (distanceKm >= BREAKPOINTS_KM[last]) return table[last]
  for (let i = 1; i <= last; i++) {
    if (distanceKm <= BREAKPOINTS_KM[i]) {
      const span = BREAKPOINTS_KM[i] - BREAKPOINTS_KM[i - 1]
      const t = (distanceKm - BREAKPOINTS_KM[i - 1]) / span
      return Math.round(table[i - 1] + t * (table[i] - table[i - 1]))
    }
  }
  return table[last]
}

export function typicalCashCad(distanceKm: number, cabin: Cabin): number {
  return interpolate(TYPICAL[cabin], distanceKm)
}

export function optimisticCashCad(distanceKm: number, cabin: Cabin): number {
  return Math.round(typicalCashCad(distanceKm, cabin) * OPTIMISTIC_MULTIPLIER)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/fares.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewire pricing to use distance**

Replace `src/scanner/pricing.ts` entirely:

```ts
import type { Cabin } from '../core/types.js'
import { distanceKm } from '../core/airports.js'
import { typicalCashCad } from '../core/fares.js'

export interface FareEstimate { cashCad: number; economyCashCad: number | null }

// Distance-based estimator standing in for a live pricing API (Amadeus
// Self-Service shut down 2026-07-17). Swap this module's internals to
// reintroduce one.
export function estimateCashFares(route: string, cabin: Cabin): FareEstimate {
  const [origin, dest] = route.split('-')
  const km = distanceKm(origin, dest)
  if (km === undefined) return { cashCad: 0, economyCashCad: null }
  return {
    cashCad: typicalCashCad(km, cabin),
    economyCashCad: cabin === 'economy' ? null : typicalCashCad(km, 'economy'),
  }
}
```

A route with an unknown airport returns `cashCad: 0`, which scores 0 cpp and is filtered out downstream rather than crashing.

- [ ] **Step 6: Rewire the prefilter**

In `src/core/prefilter.ts`, replace the `OPTIMISTIC_CASH_CAD`/`regionOf` import with:

```ts
import { distanceKm } from './airports.js'
import { optimisticCashCad } from './fares.js'
```

and replace `optimisticPotential`:

```ts
export function optimisticPotential(row: AwardRow, ratio: number): number {
  const [origin, dest] = row.route.split('-')
  const km = distanceKm(origin, dest)
  if (km === undefined) return 0
  const optimistic = conservativeCash(
    optimisticCashCad(km, row.cabin),
    optimisticCashCad(km, 'economy'),
    row.cabin,
  )
  return cpp(optimistic, row.taxesCad, mrPointsNeeded(row.miles, ratio))
}
```

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS. Existing pricing/prefilter tests asserting old region-bucket numbers will fail — update their expected values to the distance-based figures. Do not delete the assertions.

- [ ] **Step 8: Commit**

```bash
git add src/core/fares.ts src/scanner/pricing.ts src/core/prefilter.ts tests/
git commit -m "feat: distance-based cash fare estimates"
```

---

### Task 3: Multi-origin config and positioning penalty

**Files:**
- Modify: `src/core/config.ts:4-40` (`Config`, `defaultConfig`, `applyEnv`)
- Modify: `src/core/valuation.ts:31-51` (`scoreDeal`)
- Modify: `src/core/db.ts` (SCHEMA, migration, insert)
- Create: `src/core/countries.ts`
- Test: `tests/core/valuation.test.ts` (extend), `tests/core/countries.test.ts`

**Interfaces:**
- Consumes: `airportInfo` from Task 1.
- Produces: `OriginConfig { code: string; positioningCad: number }`; `cfg.origins: OriginConfig[]`; `scoreDeal(row, cashCad, economyCashCad, ratio, positioningCad?)` — fifth parameter defaults to `0`; `countryName(isoCode: string): string`.

- [ ] **Step 1: Write the failing test for the positioning penalty**

Append to `tests/core/valuation.test.ts`:

```ts
import { scoreDeal } from '../../src/core/valuation.js'
import type { AwardRow } from '../../src/core/types.js'

const row: AwardRow = {
  route: 'LAX-DPS', date: '2027-04-01', cabin: 'business', program: 'aeroplan',
  miles: 60_000, taxesCad: 100, seats: 2, direct: false,
}

describe('scoreDeal positioning penalty', () => {
  it('subtracts positioning cost from the cash value', () => {
    const without = scoreDeal(row, 3000, 1000, 1, 0)
    const with280 = scoreDeal(row, 3000, 1000, 1, 280)
    expect(with280.cppConservative).toBeLessThan(without.cppConservative)
  })

  it('defaults to no penalty when omitted', () => {
    expect(scoreDeal(row, 3000, 1000, 1).cppRaw).toBe(scoreDeal(row, 3000, 1000, 1, 0).cppRaw)
  })

  it('scores zero when positioning exceeds the deal value', () => {
    expect(scoreDeal(row, 3000, 1000, 1, 99_000).cppRaw).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/valuation.test.ts`
Expected: FAIL — `scoreDeal` accepts four arguments.

- [ ] **Step 3: Implement the penalty**

In `src/core/valuation.ts`, change `scoreDeal`:

```ts
export function scoreDeal(
  row: AwardRow,
  cashCad: number,
  economyCashCad: number | null,
  ratio: number,
  positioningCad = 0,
): ScoredDeal {
  const mrPoints = mrPointsNeeded(row.miles, ratio)
  const netCash = Math.max(0, cashCad - positioningCad)
  const netEconomy = economyCashCad === null ? null : Math.max(0, economyCashCad - positioningCad)
  const conservativeCashCad = conservativeCash(netCash, netEconomy, row.cabin)
  const roundToTwoDecimals = (value: number): number => Math.round(value * 100) / 100

  return {
    ...row,
    cashCad: netCash,
    economyCashCad: netEconomy,
    mrPoints,
    cppRaw: roundToTwoDecimals(cpp(netCash, row.taxesCad, mrPoints)),
    cppConservative: roundToTwoDecimals(cpp(conservativeCashCad, row.taxesCad, mrPoints)),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/valuation.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the country-code mapping**

The dataset stores ISO codes; `excludedCountries` uses names. Create `src/core/countries.ts`:

```ts
// ISO 3166-1 alpha-2 to the country names used in settings and watches.
const NAMES: Record<string, string> = {
  CA: 'Canada', US: 'USA', MX: 'Mexico', GB: 'United Kingdom', IE: 'Ireland',
  FR: 'France', DE: 'Germany', NL: 'Netherlands', ES: 'Spain', PT: 'Portugal',
  IT: 'Italy', CH: 'Switzerland', AT: 'Austria', IS: 'Iceland', GR: 'Greece',
  TR: 'Turkey', IL: 'Israel', AE: 'UAE', QA: 'Qatar', SA: 'Saudi Arabia',
  IN: 'India', LK: 'Sri Lanka', MV: 'Maldives', TH: 'Thailand', VN: 'Vietnam',
  SG: 'Singapore', MY: 'Malaysia', ID: 'Indonesia', PH: 'Philippines',
  HK: 'Hong Kong', TW: 'Taiwan', JP: 'Japan', KR: 'South Korea', CN: 'China',
  AU: 'Australia', NZ: 'New Zealand', FJ: 'Fiji', PF: 'French Polynesia',
  BR: 'Brazil', AR: 'Argentina', CL: 'Chile', PE: 'Peru', CO: 'Colombia',
  PA: 'Panama', CR: 'Costa Rica', JM: 'Jamaica', DO: 'Dominican Republic',
  BS: 'Bahamas', BB: 'Barbados', CU: 'Cuba', ZA: 'South Africa',
  EG: 'Egypt', MA: 'Morocco', KE: 'Kenya', ET: 'Ethiopia',
}

export function countryName(isoCode: string): string {
  return NAMES[isoCode] ?? isoCode
}
```

`tests/core/countries.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { countryName } from '../../src/core/countries.js'

describe('countryName', () => {
  it('maps known ISO codes to settings names', () => {
    expect(countryName('ID')).toBe('Indonesia')
    expect(countryName('US')).toBe('USA')
  })

  it('falls back to the raw code when unmapped', () => {
    expect(countryName('XX')).toBe('XX')
  })
})
```

- [ ] **Step 6: Route country and continent lookups through the dataset**

`AIRPORT_CITY` and `continentOf` in `src/core/regions.ts` only know the old 96 airports, so
watch country exclusions and continent filters would silently pass every new worldwide
destination. Add to `src/core/regions.ts`:

```ts
import { airportInfo } from './airports.js'
import { countryName } from './countries.js'

export function countryOf(code: string): string {
  const info = airportInfo(code)
  return info ? countryName(info.country) : (AIRPORT_CITY[code]?.country ?? '')
}

export function continentOfAirport(code: string): string {
  return airportInfo(code)?.continent ?? continentOf(countryOf(code))
}
```

Replace every `AIRPORT_CITY[dest]?.country` with `countryOf(dest)` and every
`continentOf(AIRPORT_CITY[dest]?.country ?? '')` with `continentOfAirport(dest)` in
`src/core/watches.ts` and `src/scanner/seatsaero.ts`. Add to `tests/core/regions.test.ts`:

```ts
describe('countryOf', () => {
  it('resolves airports the curated table never had', () => {
    expect(countryOf('DPS')).toBe('Indonesia')
    expect(continentOfAirport('DPS')).toBe('Asia')
  })

  it('still resolves curated airports', () => {
    expect(countryOf('CUN')).toBe('Mexico')
  })
})
```

- [ ] **Step 7: Add origins to config**

In `src/core/config.ts`, add above `Config`:

```ts
export interface OriginConfig { code: string; positioningCad: number }
```

Add to the `Config` interface, immediately after `origin: string`:

```ts
  origins: OriginConfig[]
```

Add to `defaultConfig()`'s returned object, after `origin: 'YYC',`:

```ts
    origins: [
      { code: 'YYC', positioningCad: 0 },
      { code: 'YVR', positioningCad: 150 },
      { code: 'SEA', positioningCad: 200 },
      { code: 'YYZ', positioningCad: 250 },
      { code: 'LAX', positioningCad: 280 },
    ],
```

Add to `applyEnv`, before `return cfg`:

```ts
  if (env.ORIGINS) {
    cfg.origins = env.ORIGINS.split(',').map(entry => {
      const [code, cost] = entry.split(':')
      return { code: code.trim(), positioningCad: Number(cost ?? 0) }
    })
  }
```

`ORIGINS` format is `YYC:0,YVR:150,LAX:280`.

- [ ] **Step 8: Add the snapshots origin column**

In `src/core/db.ts` SCHEMA, add to the `snapshots` table after `route TEXT NOT NULL,`:

```sql
  origin TEXT NOT NULL DEFAULT '',
```

In `openDb`, after the existing `scans.scope` migration:

```ts
  const snapCols = db.prepare('PRAGMA table_info(snapshots)').all() as Array<{ name: string }>
  if (!snapCols.some(c => c.name === 'origin')) {
    db.exec("ALTER TABLE snapshots ADD COLUMN origin TEXT NOT NULL DEFAULT 'YYC'")
  }
```

Find the snapshot INSERT statement in `src/core/db.ts` and add `origin` to its column list and `?` placeholders, deriving the value with `d.route.split('-')[0]`.

- [ ] **Step 9: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/core/config.ts src/core/valuation.ts src/core/countries.ts src/core/regions.ts src/core/db.ts tests/
git commit -m "feat: multi-origin config with positioning penalty"
```

---

### Task 4: Bulk availability scanning

**Files:**
- Modify: `src/scanner/seatsaero.ts` (add `fetchBulkAvailability`)
- Modify: `src/scanner/run.ts` (call it for full scans)
- Modify: `src/core/db.ts` (`scans.truncated` column, `finishScan`)
- Create: `tests/fixtures/availability-aeroplan.json`
- Test: `tests/scanner/bulk-availability.test.ts`

**Interfaces:**
- Consumes: `cfg.origins` from Task 3; `airportInfo` from Task 1.
- Produces: `fetchBulkAvailability(cfg, fetchFn?): Promise<{ rows: AwardRow[]; truncated: string[] }>`.

- [ ] **Step 1: Create the fixture**

`tests/fixtures/availability-aeroplan.json` — mirrors the cached-search shape already parsed by `parseCachedSearch`:

```json
{
  "data": [
    {
      "Route": { "Source": "aeroplan", "OriginAirport": "YYC", "DestinationAirport": "CUN" },
      "Date": "2027-04-03",
      "JAvailable": true, "JMileageCost": "34300", "JTotalTaxes": 16792, "JRemainingSeats": 9, "JDirect": true,
      "TaxesCurrency": "CAD"
    },
    {
      "Route": { "Source": "aeroplan", "OriginAirport": "LAX", "DestinationAirport": "DPS" },
      "Date": "2027-04-05",
      "JAvailable": true, "JMileageCost": "60000", "JTotalTaxes": 9800, "JRemainingSeats": 2, "JDirect": false,
      "TaxesCurrency": "CAD"
    },
    {
      "Route": { "Source": "aeroplan", "OriginAirport": "JFK", "DestinationAirport": "LHR" },
      "Date": "2027-04-06",
      "JAvailable": true, "JMileageCost": "50000", "JTotalTaxes": 20000, "JRemainingSeats": 4, "JDirect": true,
      "TaxesCurrency": "CAD"
    }
  ],
  "hasMore": false
}
```

`JFK` is deliberately not a configured origin — it must be filtered out.

- [ ] **Step 2: Write the failing test**

`tests/scanner/bulk-availability.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { defaultConfig } from '../../src/core/config.js'
import { fetchBulkAvailability } from '../../src/scanner/seatsaero.js'

const fixture = JSON.parse(readFileSync('tests/fixtures/availability-aeroplan.json', 'utf8'))

const mockFetch = (body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))

describe('fetchBulkAvailability', () => {
  it('keeps only rows departing a configured origin', async () => {
    const cfg = { ...defaultConfig(), ratios: { aeroplan: 1 } }
    const { rows } = await fetchBulkAvailability(cfg, mockFetch(fixture) as unknown as typeof fetch)
    const origins = [...new Set(rows.map(r => r.route.split('-')[0]))]
    expect(origins.sort()).toEqual(['LAX', 'YYC'])
  })

  it('queries the availability endpoint once per program per origin continent', async () => {
    const cfg = { ...defaultConfig(), ratios: { aeroplan: 1 } }
    const fetchFn = mockFetch(fixture)
    await fetchBulkAvailability(cfg, fetchFn as unknown as typeof fetch)
    const urls = fetchFn.mock.calls.map(c => String(c[0]))
    expect(urls.every(u => u.includes('/partnerapi/availability'))).toBe(true)
    expect(urls.every(u => u.includes('source=aeroplan'))).toBe(true)
    expect(urls.some(u => u.includes('origin_region=North+America'))).toBe(true)
  })

  it('reports a program as truncated when the page cap is hit', async () => {
    const cfg = { ...defaultConfig(), ratios: { aeroplan: 1 }, maxPagesPerProgram: 1 }
    const alwaysMore = mockFetch({ ...fixture, hasMore: true })
    const { truncated } = await fetchBulkAvailability(cfg, alwaysMore as unknown as typeof fetch)
    expect(truncated).toContain('aeroplan')
  })

  it('skips a failing program without failing the run', async () => {
    const cfg = { ...defaultConfig(), ratios: { aeroplan: 1, delta: 1 } }
    let call = 0
    const flaky = vi.fn(async () => {
      call++
      return call === 1
        ? new Response('boom', { status: 500 })
        : new Response(JSON.stringify(fixture), { status: 200 })
    })
    const { rows } = await fetchBulkAvailability(cfg, flaky as unknown as typeof fetch)
    expect(rows.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/scanner/bulk-availability.test.ts`
Expected: FAIL — `fetchBulkAvailability` is not exported.

- [ ] **Step 4: Add `maxPagesPerProgram` to config**

In `src/core/config.ts`, add to `Config` after `maxPerRoute: number`:

```ts
  maxPagesPerProgram: number
```

and to `defaultConfig()` after `maxPerRoute: 3,`:

```ts
    maxPagesPerProgram: 40,
```

and to `applyEnv` before `return cfg`:

```ts
  if (env.MAX_PAGES_PER_PROGRAM) cfg.maxPagesPerProgram = Number(env.MAX_PAGES_PER_PROGRAM)
```

- [ ] **Step 5: Implement `fetchBulkAvailability`**

Append to `src/scanner/seatsaero.ts` (it already imports `parseCachedSearch`'s dependencies):

```ts
import { airportInfo } from '../core/airports.js'

export async function fetchBulkAvailability(
  cfg: Config,
  fetchFn: typeof fetch = fetch,
): Promise<{ rows: AwardRow[]; truncated: string[] }> {
  const originCodes = new Set(cfg.origins.map(o => o.code))
  const regions = [...new Set(
    cfg.origins.map(o => airportInfo(o.code)?.continent).filter((c): c is string => Boolean(c)),
  )]
  const rows: AwardRow[] = []
  const truncated: string[] = []
  const take = 500

  for (const program of Object.keys(cfg.ratios)) {
    let hitCap = false
    for (const region of regions) {
      let skip = 0
      for (let page = 0; page < cfg.maxPagesPerProgram; page++) {
        const url = new URL(`${BASE}/availability`)
        url.searchParams.set('source', program)
        url.searchParams.set('origin_region', region)
        url.searchParams.set('take', String(take))
        url.searchParams.set('skip', String(skip))
        let json: { hasMore?: boolean }
        try {
          const res = await fetchFn(url.toString(), {
            headers: { 'Partner-Authorization': cfg.seatsAeroKey, Accept: 'application/json' },
          })
          if (!res.ok) throw new Error(`seats.aero ${res.status}`)
          json = await res.json()
        } catch {
          break // skip this program/region; one bad response must not fail the scan
        }
        rows.push(...parseCachedSearch(json, cfg).filter(r => originCodes.has(r.route.split('-')[0])))
        if (!json.hasMore) break
        skip += take
        if (page === cfg.maxPagesPerProgram - 1) hitCap = true
      }
    }
    if (hitCap) truncated.push(program)
  }
  return { rows, truncated }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/scanner/bulk-availability.test.ts`
Expected: PASS.

- [ ] **Step 7: Record truncation on the scan row**

In `src/core/db.ts` SCHEMA, add to `scans` after `scope TEXT NOT NULL DEFAULT 'full'`:

```sql
  ,truncated TEXT NOT NULL DEFAULT '[]'
```

In `openDb`, after the `snapshots.origin` migration:

```ts
  if (!scanCols.some(c => c.name === 'truncated')) {
    db.exec("ALTER TABLE scans ADD COLUMN truncated TEXT NOT NULL DEFAULT '[]'")
  }
```

Change `finishScan`'s signature and body:

```ts
export function finishScan(
  db: DB, scanId: number,
  stats: { rowsPulled: number; finalists: number; errors: string[]; truncated?: string[] },
): void {
  db.prepare('UPDATE scans SET finished_at = ?, rows_pulled = ?, finalists = ?, errors = ?, truncated = ? WHERE id = ?')
    .run(new Date().toISOString(), stats.rowsPulled, stats.finalists, stats.errors.join('\n'),
         JSON.stringify(stats.truncated ?? []), scanId)
}
```

- [ ] **Step 8: Wire the scanner**

In `src/scanner/run.ts`, for full scans (`scope === 'full'`) call `fetchBulkAvailability(cfg)` instead of `fetchAvailability(cfg)`; keep `fetchAvailability` for country-scoped scans. Pass `truncated` through to `finishScan`. When scoring, look up the origin's penalty:

```ts
const penalty = new Map(cfg.origins.map(o => [o.code, o.positioningCad]))
// ...at the scoreDeal call site:
scoreDeal(row, fares.cashCad, fares.economyCashCad, ratio, penalty.get(row.route.split('-')[0]) ?? 0)
```

Log truncation explicitly so a partial scan is never mistaken for full coverage:

```ts
if (truncated.length > 0) {
  console.warn(`page cap reached; results truncated for: ${truncated.join(', ')}`)
}
```

- [ ] **Step 9: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit && npm run scan -- --dry-run`
Expected: all PASS; dry run completes from fixtures.

- [ ] **Step 10: Commit**

```bash
git add src/scanner/seatsaero.ts src/scanner/run.ts src/core/db.ts src/core/config.ts tests/
git commit -m "feat: worldwide multi-origin scanning via bulk availability"
```

---

### Task 5: Route coverage map

**Files:**
- Modify: `src/core/db.ts` (add `route_coverage` table)
- Create: `src/core/coverage.ts`
- Modify: `src/scanner/seatsaero.ts` (add `fetchRoutes`)
- Modify: `src/scanner/run.ts` (weekly refresh)
- Test: `tests/core/coverage.test.ts`

**Interfaces:**
- Consumes: `DB` from `src/core/db.ts`.
- Produces: `recordCoverage(db, source, routes)`; `explainEmpty(db, origin, dest): { reason: 'no-availability' | 'not-monitored'; monitoredBy: string[] }`; `fetchRoutes(cfg, source, fetchFn?): Promise<Array<{ origin: string; destination: string }>>`.

- [ ] **Step 1: Add the table**

In `src/core/db.ts` SCHEMA:

```sql
CREATE TABLE IF NOT EXISTS route_coverage (
  source TEXT NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  PRIMARY KEY (source, origin, destination)
);
```

- [ ] **Step 2: Write the failing test**

`tests/core/coverage.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { openDb } from '../../src/core/db.js'
import { explainEmpty, recordCoverage } from '../../src/core/coverage.js'

const seeded = () => {
  const db = openDb(':memory:')
  recordCoverage(db, 'aeroplan', [{ origin: 'YYC', destination: 'CUN' }])
  recordCoverage(db, 'delta', [{ origin: 'LAX', destination: 'DPS' }])
  return db
}

describe('explainEmpty', () => {
  it('reports no-availability for a monitored route', () => {
    expect(explainEmpty(seeded(), 'YYC', 'CUN').reason).toBe('no-availability')
  })

  it('reports not-monitored for a route no program covers', () => {
    const result = explainEmpty(seeded(), 'YYC', 'DPS')
    expect(result.reason).toBe('not-monitored')
    expect(result.monitoredBy).toEqual([])
  })

  it('names the programs that monitor a route from elsewhere', () => {
    expect(explainEmpty(seeded(), 'LAX', 'DPS').monitoredBy).toEqual(['delta'])
  })

  it('is idempotent across repeated recordings', () => {
    const db = seeded()
    recordCoverage(db, 'aeroplan', [{ origin: 'YYC', destination: 'CUN' }])
    const n = db.prepare('SELECT COUNT(*) AS n FROM route_coverage').get() as { n: number }
    expect(n.n).toBe(2)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/core/coverage.test.ts`
Expected: FAIL — cannot resolve `../../src/core/coverage.js`.

- [ ] **Step 4: Implement coverage**

`src/core/coverage.ts`:

```ts
import type { DB } from './db.js'

export interface RoutePair { origin: string; destination: string }

export function recordCoverage(db: DB, source: string, routes: RoutePair[]): void {
  const stmt = db.prepare(
    `INSERT INTO route_coverage (source, origin, destination, last_seen) VALUES (?, ?, ?, ?)
     ON CONFLICT(source, origin, destination) DO UPDATE SET last_seen = excluded.last_seen`,
  )
  const now = new Date().toISOString()
  const tx = db.transaction((rows: RoutePair[]) => {
    for (const r of rows) stmt.run(source, r.origin, r.destination, now)
  })
  tx(routes)
}

export function explainEmpty(
  db: DB, origin: string, dest: string,
): { reason: 'no-availability' | 'not-monitored'; monitoredBy: string[] } {
  const exact = db.prepare(
    'SELECT source FROM route_coverage WHERE origin = ? AND destination = ?',
  ).all(origin, dest) as Array<{ source: string }>
  if (exact.length > 0) {
    return { reason: 'no-availability', monitoredBy: exact.map(r => r.source) }
  }
  const elsewhere = db.prepare(
    'SELECT DISTINCT source FROM route_coverage WHERE destination = ?',
  ).all(dest) as Array<{ source: string }>
  return { reason: 'not-monitored', monitoredBy: elsewhere.map(r => r.source) }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/core/coverage.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the routes fetcher**

Append to `src/scanner/seatsaero.ts`:

```ts
export async function fetchRoutes(
  cfg: Config, source: string, fetchFn: typeof fetch = fetch,
): Promise<Array<{ origin: string; destination: string }>> {
  const url = new URL(`${BASE}/routes`)
  url.searchParams.set('source', source)
  const res = await fetchFn(url.toString(), {
    headers: { 'Partner-Authorization': cfg.seatsAeroKey, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`seats.aero ${res.status}`)
  const json = await res.json() as { data?: Array<{ OriginAirport: string; DestinationAirport: string }> }
  return (json.data ?? []).map(r => ({ origin: r.OriginAirport, destination: r.DestinationAirport }))
}
```

- [ ] **Step 7: Refresh coverage weekly**

In `src/scanner/run.ts`, on full scans only, refresh when the newest `last_seen` is older than seven days:

```ts
const newest = db.prepare('SELECT MAX(last_seen) AS t FROM route_coverage').get() as { t: string | null }
const weekOld = !newest.t || Date.now() - Date.parse(newest.t) > 7 * 86_400_000
if (weekOld) {
  for (const source of Object.keys(cfg.ratios)) {
    try {
      recordCoverage(db, source, await fetchRoutes(cfg, source))
    } catch (err) {
      console.warn(`route coverage refresh failed for ${source}: ${err}`)
    }
  }
}
```

- [ ] **Step 8: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/core/coverage.ts src/core/db.ts src/scanner/seatsaero.ts src/scanner/run.ts tests/
git commit -m "feat: route coverage map from seats.aero routes endpoint"
```

---

### Task 6: On-demand search API

**Files:**
- Modify: `src/server/app.ts` (add `POST /api/search`)
- Test: `tests/server/search.test.ts`

**Interfaces:**
- Consumes: `fetchAvailability` from `src/scanner/seatsaero.ts`; `estimateCashFares` from Task 2; `scoreDeal` from Task 3; `explainEmpty` from Task 5.
- Produces: `POST /api/search` accepting `{ origin, destination, dateFrom, dateTo, cabins? }`, returning `{ deals: ScoredDeal[] }` or `{ deals: [], explanation: { reason, monitoredBy } }`.

- [ ] **Step 1: Write the failing test**

`tests/server/search.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/server/app.js'
import { openDb } from '../../src/core/db.js'
import { recordCoverage } from '../../src/core/coverage.js'

const post = (app: ReturnType<typeof createApp>, body: unknown) =>
  app.request('/api/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/search', () => {
  it('rejects a request missing required fields', async () => {
    const res = await post(createApp(openDb(':memory:')), { origin: 'YYC' })
    expect(res.status).toBe(400)
  })

  it('explains an empty result for an unmonitored route', async () => {
    const db = openDb(':memory:')
    recordCoverage(db, 'aeroplan', [{ origin: 'YYC', destination: 'CUN' }])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })))
    const res = await post(createApp(db), {
      origin: 'YYC', destination: 'DPS', dateFrom: '2027-03-10', dateTo: '2027-04-15',
    })
    const body = await res.json()
    expect(body.deals).toEqual([])
    expect(body.explanation.reason).toBe('not-monitored')
    vi.unstubAllGlobals()
  })

  it('does not write ad-hoc results to snapshots', async () => {
    const db = openDb(':memory:')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })))
    await post(createApp(db), {
      origin: 'YYC', destination: 'CUN', dateFrom: '2027-03-10', dateTo: '2027-04-15',
    })
    const n = db.prepare('SELECT COUNT(*) AS n FROM snapshots').get() as { n: number }
    expect(n.n).toBe(0)
    vi.unstubAllGlobals()
  })

  it('surfaces an upstream error instead of an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })))
    const res = await post(createApp(openDb(':memory:')), {
      origin: 'YYC', destination: 'CUN', dateFrom: '2027-03-10', dateTo: '2027-04-15',
    })
    expect(res.status).toBe(502)
    vi.unstubAllGlobals()
  })
})
```

If `createApp` has a different name or signature in `src/server/app.ts`, match the existing export rather than changing it.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/search.test.ts`
Expected: FAIL — route returns 404.

- [ ] **Step 3: Implement the route**

In `src/server/app.ts`, following the existing route style:

```ts
app.post('/api/search', async c => {
  const body = await c.req.json().catch(() => null) as {
    origin?: string; destination?: string; dateFrom?: string; dateTo?: string; cabins?: string[]
  } | null
  if (!body?.origin || !body.destination || !body.dateFrom || !body.dateTo) {
    return c.json({ error: 'origin, destination, dateFrom and dateTo are required' }, 400)
  }

  const cfg = loadEffectiveConfig(db, process.env)
  let rows
  try {
    rows = await fetchSearch(cfg, body.origin, body.destination, body.dateFrom, body.dateTo)
  } catch (err) {
    return c.json({ error: `seats.aero request failed: ${err}` }, 502)
  }

  const penalty = new Map(cfg.origins.map(o => [o.code, o.positioningCad]))
  const deals = rows
    .filter(r => !body.cabins?.length || body.cabins.includes(r.cabin))
    .map(r => {
      const fares = estimateCashFares(r.route, r.cabin)
      return scoreDeal(r, fares.cashCad, fares.economyCashCad,
        cfg.ratios[r.program] ?? 1, penalty.get(body.origin!) ?? 0)
    })
    .sort((a, b) => rankingCpp(b) - rankingCpp(a))

  if (deals.length === 0) {
    return c.json({ deals: [], explanation: explainEmpty(db, body.origin, body.destination) })
  }
  return c.json({ deals })
})
```

Add a `fetchSearch(cfg, origin, destination, startDate, endDate, fetchFn?)` export to `src/scanner/seatsaero.ts` that calls `/search` for one pair — reuse the existing `fetchAvailability` body, replacing the destination list with the single destination and the date range with the supplied one.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/search.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/app.ts src/scanner/seatsaero.ts tests/server/search.test.ts
git commit -m "feat: on-demand search API with coverage explanation"
```

---

### Task 7: Dashboard search tab

**Files:**
- Create: `src/web/Search.tsx`
- Modify: `src/web/App.tsx` (register the tab)
- Test: `tests/web/search.test.tsx`

**Interfaces:**
- Consumes: `POST /api/search` from Task 6.
- Produces: a `Search` React component.

- [ ] **Step 1: Write the failing test**

`tests/web/search.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Search } from '../../src/web/Search.js'

describe('Search', () => {
  it('states results come from the cache, not live inventory', () => {
    render(<Search />)
    expect(screen.getByText(/cached/i)).toBeTruthy()
  })

  it('shows the coverage explanation when nothing is found', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      deals: [], explanation: { reason: 'not-monitored', monitoredBy: [] },
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    render(<Search />)
    await userEvent.type(screen.getByLabelText(/destination/i), 'DPS')
    await userEvent.click(screen.getByRole('button', { name: /search/i }))

    await waitFor(() => expect(screen.getByText(/not monitored/i)).toBeTruthy())
    vi.unstubAllGlobals()
  })
})
```

Match the existing dashboard's testing setup — if other `src/web` components are tested differently, follow that pattern instead.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/web/search.test.tsx`
Expected: FAIL — cannot resolve `../../src/web/Search.js`.

- [ ] **Step 3: Implement the component**

`src/web/Search.tsx` — a form with origin (defaulting to the configured home origin), destination, date-from, date-to and a cabin multi-select; on submit it POSTs to `/api/search` and renders results with the existing deals table component. Render the two empty states distinctly:

- `not-monitored` → "No program you have configured monitors this route." plus, when `monitoredBy` is non-empty, "Monitored by: <programs>".
- `no-availability` → "This route is monitored, but nothing is currently available."

Include static copy near the results: "Results come from seats.aero's cached data, not a live search."

- [ ] **Step 4: Register the tab**

In `src/web/App.tsx`, add a `Search` tab beside the existing Deals / Watches / History / Settings tabs, following the existing tab registration pattern exactly.

- [ ] **Step 5: Run tests and build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/web/Search.tsx src/web/App.tsx tests/web/search.test.tsx
git commit -m "feat: dashboard search tab for on-demand lookups"
```

---

### Task 8: Per-route cap on watch results

**Files:**
- Modify: `src/core/db.ts` (add `watches.max_per_route`)
- Modify: `src/core/watches.ts:120-140` (ranking, row mapping, insert/update)
- Test: `tests/core/watches.test.ts` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Watch.maxPerRoute: number` (default `1`), honoured by the watch matcher.

This task is independent of Tasks 1–7 and can be implemented in parallel.

- [ ] **Step 1: Write the failing test**

Append to `tests/core/watches.test.ts`:

```ts
describe('maxPerRoute', () => {
  const deal = (route: string, cpp: number, date: string) => ({
    route, date, cabin: 'business' as const, program: 'aeroplan', miles: 30_000,
    taxesCad: 100, seats: 4, direct: true, cashCad: 1200, economyCashCad: 450,
    mrPoints: 30_000, cppRaw: cpp, cppConservative: cpp,
  })

  it('caps how many results one route may contribute', () => {
    const watch = { ...baseWatch, topN: 3, maxPerRoute: 1 }
    const deals = [
      deal('YYC-CUN', 3.0, '2027-04-03'),
      deal('YYC-CUN', 2.9, '2027-04-04'),
      deal('YYC-AUH', 2.1, '2027-04-05'),
    ]
    const result = matchWatch(watch, deals)
    expect(result.map(d => d.route)).toEqual(['YYC-CUN', 'YYC-AUH'])
  })

  it('still fills topN from distinct routes', () => {
    const watch = { ...baseWatch, topN: 2, maxPerRoute: 1 }
    const deals = [
      deal('YYC-CUN', 3.0, '2027-04-03'),
      deal('YYC-AUH', 2.1, '2027-04-05'),
      deal('YYC-BCN', 2.0, '2027-04-06'),
    ]
    expect(matchWatch(watch, deals)).toHaveLength(2)
  })
})
```

Reuse whatever `baseWatch` fixture the existing tests in this file already define; if none exists, build one matching the `Watch` interface.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/watches.test.ts`
Expected: FAIL — `maxPerRoute` is not a property of `Watch`.

- [ ] **Step 3: Add the column**

In `src/core/db.ts`, add to the `watches` table before `created_at`:

```sql
  max_per_route INTEGER NOT NULL DEFAULT 1,
```

In `openDb`, alongside the other migrations:

```ts
  const watchCols = db.prepare('PRAGMA table_info(watches)').all() as Array<{ name: string }>
  if (!watchCols.some(c => c.name === 'max_per_route')) {
    db.exec('ALTER TABLE watches ADD COLUMN max_per_route INTEGER NOT NULL DEFAULT 1')
  }
```

- [ ] **Step 4: Implement the cap**

In `src/core/watches.ts`: add `maxPerRoute?: number` to the watch input interface and `maxPerRoute: number` to the `Watch` interface; map `r.max_per_route` in the row mapper; add it to the INSERT and UPDATE statements with a default of `1`; validate it as a positive integer beside the existing `topN` check.

Replace the `.sort(...).slice(0, watch.topN)` chain at `src/core/watches.ts:133-134`:

```ts
    .sort((a, b) => rank(b) - rank(a))
    .reduce<ScoredDeal[]>((acc, deal) => {
      if (acc.length >= watch.topN) return acc
      const perRoute = acc.filter(d => d.route === deal.route).length
      if (perRoute >= watch.maxPerRoute) return acc
      acc.push(deal)
      return acc
    }, [])
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/core/watches.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Expose it in the API and UI**

Add `maxPerRoute` to the watch create/update payload validation in `src/server/app.ts` and to the watch form in the dashboard's Watches tab, following the existing `topN` field exactly.

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/core/db.ts src/core/watches.ts src/server/app.ts src/web/ tests/
git commit -m "feat: per-route cap on watch results"
```

---

### Task 9: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Update the architecture notes**

In `CLAUDE.md`, update the Architecture section: origins are a configured list with positioning costs; full scans use `/availability` per program filtered to configured origins; cash estimates are distance-based via the vendored airport dataset; `route_coverage` explains empty results; ad-hoc search is synchronous and writes no snapshots.

Update the Hard rules section: replace "Cash comparisons are static regional estimates in `src/core/regions.ts`" with the distance-based model in `src/core/fares.ts`, keeping the no-scraping rule intact and noting that Live Search is unavailable on Pro.

- [ ] **Step 2: Update the README**

Document the new `ORIGINS` and `MAX_PAGES_PER_PROGRAM` environment variables, the Search tab, and the one-time `scripts/build-airports.mjs` regeneration step.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: worldwide discovery and on-demand search"
```

---

## Verification

Before opening a PR:

```bash
npx vitest run
npx tsc --noEmit
npm run build
npm run scan -- --dry-run
```

All four must pass. Then deploy to staging LXC 116 before production.
