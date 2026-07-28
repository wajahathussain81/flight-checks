# Flight Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an award-flight deal watcher that scans seats.aero for availability from YYC, prices deals against Amadeus cash fares, ranks them in cents per Amex MR point, emails a twice-daily digest via Gmail SMTP, and serves a LAN dashboard — deployed to LXC 113 on the user's Proxmox server.

**Architecture:** Single TypeScript ESM package. A scanner CLI (systemd timer, 07:00/19:00 America/Edmonton) writes append-only snapshots to SQLite; a Hono server reads the same DB and serves a Vite/React dashboard on port 3000. Scanner writes, server reads — no other coupling.

**Tech Stack:** Node 22, TypeScript (strict, ESM, run via `tsx` — no tsc build for backend), better-sqlite3, Hono + @hono/node-server, React 18 + Vite, vitest, systemd, rsync deploy.

## AMENDMENT (2026-07-18): Amadeus replaced by static fare estimates

Amadeus Self-Service was decommissioned on 2026-07-17 (keys deactivated, registrations closed). Decision: cash comparisons now come from **static per-region typical-fare tables** behind a clean pricing interface, so a live API can slot in later. Where this amendment conflicts with task bodies below, **the amendment wins**.

**Task 1 (config):** `REQUIRED = ['SEATS_AERO_KEY', 'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'DIGEST_TO']`. The `Config` interface drops `amadeusKey`, `amadeusSecret`, `amadeusHost`, `amadeusCallsPerRun`, `amadeusMonthlyBudget`, `fareCacheHours`; everything else is unchanged. Tests drop all `AMADEUS_*` env vars and amadeus/fareCache expectations (defaults test now checks: origin, mrBalance, dbPath, thresholds, ratios only).

**Task 4 (db):** Drop the `fare_cache` and `api_calls` tables and the functions `getCachedFare`, `putCachedFare`, `recordApiCall`, `apiCallsThisMonth` (and their tests) — no network pricing means no cache or call ledger. Drop the `amadeus_calls` column from `scans`; `finishScan` stats become `{ rowsPulled: number; finalists: number; errors: string[] }`. Everything else (scans, snapshots, alerts, alertKey/lastAlert/recordAlerts) is unchanged.

**Task 6 (replaces the Amadeus client entirely):**
- `src/core/regions.ts` additionally exports typical (median-ish) one-way fares from YYC used for scoring — distinct from `OPTIMISTIC_CASH_CAD`, which remains prefilter-only:

```ts
export const TYPICAL_CASH_CAD: Record<string, Record<Cabin, number>> = {
  na:      { economy: 450,  premium: 800,  business: 1600, first: 2300 },
  europe:  { economy: 950,  premium: 1500, business: 3300, first: 5300 },
  asia:    { economy: 1200, premium: 1900, business: 4300, first: 7300 },
  latam:   { economy: 800,  premium: 1300, business: 3000, first: 4000 },
  oceania: { economy: 1300, premium: 2000, business: 4700, first: 6700 },
  other:   { economy: 1000, premium: 1600, business: 3700, first: 5300 },
}
```

- New file `src/scanner/pricing.ts` (test: `tests/scanner/pricing.test.ts`):

```ts
import type { Cabin } from '../core/types.js'
import { regionOf, TYPICAL_CASH_CAD } from '../core/regions.js'

export interface FareEstimate { cashCad: number; economyCashCad: number | null }

// Static estimator standing in for a live pricing API (Amadeus Self-Service
// shut down 2026-07-17). Swap this module's internals to reintroduce one.
export function estimateCashFares(route: string, cabin: Cabin): FareEstimate {
  const dest = route.split('-')[1]
  const fares = TYPICAL_CASH_CAD[regionOf(dest)]
  return { cashCad: fares[cabin], economyCashCad: cabin === 'economy' ? null : fares.economy }
}
```

Tests: europe business → `{ cashCad: 3300, economyCashCad: 950 }`; economy cabin → `economyCashCad: null`; unknown destination airport falls back to the `other` region.

**Task 8 (orchestrator):** Import `estimateCashFares` from `./pricing.js` instead of `fetchCashFare`. Delete the `Pricer` type, `fixturePricer`, `tests/fixtures/fares.json`, and the network-budget loop — scoring becomes a simple synchronous map over finalists: `scoreDeal(row, est.cashCad, est.economyCashCad, cfg.ratios[row.program])`. Dry-run now differs from live only in the awards source (fixture vs. seats.aero) and in not sending email. Test env drops `AMADEUS_*`; expectations stay `snapshots: 3` (and 3 alerts: LHR business cpp cons. 3.76, LHR economy 2.19, CDG economy 2.10; the 120k-mile row still dies in prefilter). `finishScan` stats lose `amadeusCalls`.

**Task 9 (server):** test `stats` object becomes `{ rowsPulled: 10, finalists: 2, errors: [] }`. No other change.

**Task 10 (dashboard):** `ScanRow` drops `amadeus_calls`; the Runs tab drops the "Amadeus calls" column.

**Task 11 (deploy):** `deploy/env.example` drops the `AMADEUS_*` lines.

## Global Constraints

- Node >= 22, `"type": "module"` in package.json, TypeScript `strict: true`, module `NodeNext`.
- No web scraping anywhere. External services are exactly: seats.aero Partner API and Gmail SMTP (via nodemailer). (Amadeus was removed — see amendment above.)
- Secrets never in git. Runtime secrets come only from environment (locally the gitignored `env.local`; on the container via `EnvironmentFile=/etc/flight-checks/env`).
- All money values are CAD. Ranking metric is cents per **MR point** (not per airline mile).
- Alert thresholds: economy ≥ 1.75 ¢/pt (raw), premium cabins ≥ 3.0 ¢/pt (conservative). Re-alert only if value improves ≥ 15% or seat count increases.
- MR transfer ratios (config, keyed by seats.aero `Source` value): `aeroplan: 1`, `british: 1`, `flyingblue: 0.75`, `delta: 0.75`, `etihad: 0.75`. Rows whose Source is not in this map are dropped.
- Cash comps are static per-region estimates (`TYPICAL_CASH_CAD`) — no pricing API, no per-scan network budget.
- Container: `ssh flight-checks` (root@<container-ip>), app dir `/opt/flight-checks`, dashboard `http://<container-ip>:3000`.
- Test command is always `npx vitest run <file>`.

---

### Task 1: Project scaffolding + config module

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `src/core/config.ts`
- Test: `tests/core/config.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `loadConfig(env?: NodeJS.ProcessEnv): Config` from `src/core/config.ts`. All later tasks import `Config` from here. Exact shape below — do not deviate.

- [x] **Step 1: Scaffold package**

```bash
npm init -y
npm pkg set type=module version=0.1.0 name=flight-checks
npm pkg set scripts.test="vitest run" scripts.scan="tsx src/scanner/index.ts" scripts.serve="tsx src/server/index.ts" scripts.build="vite build"
npm install better-sqlite3 hono @hono/node-server react react-dom nodemailer
npm install -D typescript tsx vitest vite @vitejs/plugin-react @types/node @types/react @types/react-dom @types/better-sqlite3 @types/nodemailer
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "jsx": "react-jsx",
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

`.gitignore` already exists at the repo root (with `env.local` in it) — verify it contains `node_modules/`, `data/`, `dist/`, `.env`, `env.local`, `*.log` and leave it as is.

- [x] **Step 2: Write the failing test**

`tests/core/config.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadConfig } from '../../src/core/config.js'

const FULL_ENV = {
  SEATS_AERO_KEY: 'sk1', AMADEUS_KEY: 'ak', AMADEUS_SECRET: 'as',
  GMAIL_USER: 'hl@gmail.com', GMAIL_APP_PASSWORD: 'gp', DIGEST_TO: 'me@example.com',
}

describe('loadConfig', () => {
  it('throws naming the missing var', () => {
    const { GMAIL_APP_PASSWORD: _omit, ...partial } = FULL_ENV
    expect(() => loadConfig(partial)).toThrow('GMAIL_APP_PASSWORD')
  })

  it('applies defaults', () => {
    const cfg = loadConfig(FULL_ENV)
    expect(cfg.origin).toBe('YYC')
    expect(cfg.mrBalance).toBe(220000)
    expect(cfg.dbPath).toBe('data/flights.db')
    expect(cfg.thresholds).toEqual({ economy: 1.75, premiumConservative: 3.0 })
    expect(cfg.ratios.aeroplan).toBe(1)
    expect(cfg.ratios.flyingblue).toBe(0.75)
    expect(cfg.amadeusCallsPerRun).toBe(30)
    expect(cfg.amadeusHost).toBe('https://test.api.amadeus.com')
  })

  it('honors env overrides', () => {
    const cfg = loadConfig({ ...FULL_ENV, ORIGIN: 'YYZ', MR_BALANCE: '150000' })
    expect(cfg.origin).toBe('YYZ')
    expect(cfg.mrBalance).toBe(150000)
  })
})
```

- [x] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/core/config.test.ts`
Expected: FAIL — cannot find module `src/core/config.js`.

- [x] **Step 4: Implement config**

`src/core/config.ts`:

```ts
export interface Config {
  seatsAeroKey: string
  amadeusKey: string
  amadeusSecret: string
  amadeusHost: string
  gmailUser: string
  gmailAppPassword: string
  digestTo: string
  dbPath: string
  origin: string
  mrBalance: number
  ratios: Record<string, number>
  thresholds: { economy: number; premiumConservative: number }
  alertImprovement: number
  amadeusCallsPerRun: number
  amadeusMonthlyBudget: number
  fareCacheHours: number
}

const REQUIRED = ['SEATS_AERO_KEY', 'AMADEUS_KEY', 'AMADEUS_SECRET', 'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'DIGEST_TO'] as const

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  for (const key of REQUIRED) {
    if (!env[key]) throw new Error(`Missing required env var: ${key}`)
  }
  return {
    seatsAeroKey: env.SEATS_AERO_KEY!,
    amadeusKey: env.AMADEUS_KEY!,
    amadeusSecret: env.AMADEUS_SECRET!,
    amadeusHost: env.AMADEUS_HOST ?? 'https://test.api.amadeus.com',
    gmailUser: env.GMAIL_USER!,
    gmailAppPassword: env.GMAIL_APP_PASSWORD!,
    digestTo: env.DIGEST_TO!,
    dbPath: env.DB_PATH ?? 'data/flights.db',
    origin: env.ORIGIN ?? 'YYC',
    mrBalance: Number(env.MR_BALANCE ?? 220000),
    ratios: { aeroplan: 1, british: 1, flyingblue: 0.75, delta: 0.75, etihad: 0.75 },
    thresholds: { economy: 1.75, premiumConservative: 3.0 },
    alertImprovement: 0.15,
    amadeusCallsPerRun: Number(env.AMADEUS_CALLS_PER_RUN ?? 30),
    amadeusMonthlyBudget: Number(env.AMADEUS_MONTHLY_BUDGET ?? 1900),
    fareCacheHours: 72,
  }
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/core/config.test.ts`
Expected: PASS (3 tests).

- [x] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore src/core/config.ts tests/core/config.test.ts
git commit -m "feat: scaffold project and add config module"
```

---

### Task 2: Types + valuation math

**Files:**
- Create: `src/core/types.ts`, `src/core/valuation.ts`
- Test: `tests/core/valuation.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (all later tasks depend on these exact names):
  - `types.ts`: `type Cabin = 'economy' | 'premium' | 'business' | 'first'`; `interface AwardRow { route: string; date: string; cabin: Cabin; program: string; miles: number; taxesCad: number; seats: number; direct: boolean }`; `interface ScoredDeal extends AwardRow { cashCad: number; economyCashCad: number | null; mrPoints: number; cppRaw: number; cppConservative: number }`
  - `valuation.ts`: `mrPointsNeeded(miles, ratio): number`, `cpp(cashCad, taxesCad, mrPoints): number`, `conservativeCash(cashCad, economyCashCad, cabin): number`, `scoreDeal(row, cashCad, economyCashCad, ratio): ScoredDeal`, `rankingCpp(d: ScoredDeal): number`

- [x] **Step 1: Write types (no test needed — pure declarations)**

`src/core/types.ts`:

```ts
export type Cabin = 'economy' | 'premium' | 'business' | 'first'

export interface AwardRow {
  route: string      // "YYC-LHR"
  date: string       // "2026-05-14"
  cabin: Cabin
  program: string    // seats.aero Source, e.g. "aeroplan"
  miles: number
  taxesCad: number
  seats: number
  direct: boolean
}

export interface ScoredDeal extends AwardRow {
  cashCad: number
  economyCashCad: number | null
  mrPoints: number
  cppRaw: number
  cppConservative: number
}
```

- [x] **Step 2: Write the failing test**

`tests/core/valuation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mrPointsNeeded, cpp, conservativeCash, scoreDeal, rankingCpp } from '../../src/core/valuation.js'
import type { AwardRow } from '../../src/core/types.js'

const row = (over: Partial<AwardRow> = {}): AwardRow => ({
  route: 'YYC-LHR', date: '2026-05-14', cabin: 'business', program: 'aeroplan',
  miles: 70000, taxesCad: 150, seats: 2, direct: true, ...over,
})

describe('mrPointsNeeded', () => {
  it('is miles at 1:1', () => expect(mrPointsNeeded(70000, 1)).toBe(70000))
  it('rounds up at 0.75 ratio', () => expect(mrPointsNeeded(50000, 0.75)).toBe(66667))
  it('rejects zero ratio', () => expect(() => mrPointsNeeded(1000, 0)).toThrow())
})

describe('cpp', () => {
  it('computes cents per point net of taxes', () => {
    // (4350 - 150) / 70000 * 100 = 6.0
    expect(cpp(4350, 150, 70000)).toBeCloseTo(6.0)
  })
  it('returns 0 when taxes exceed cash', () => expect(cpp(100, 150, 10000)).toBe(0))
})

describe('conservativeCash', () => {
  it('caps premium at 3x economy', () => expect(conservativeCash(9000, 1000, 'business')).toBe(3000))
  it('keeps cash when below the cap', () => expect(conservativeCash(2500, 1000, 'business')).toBe(2500))
  it('never caps economy', () => expect(conservativeCash(9000, 1000, 'economy')).toBe(9000))
  it('falls back to raw cash without an economy comp', () => expect(conservativeCash(9000, null, 'first')).toBe(9000))
})

describe('scoreDeal', () => {
  it('produces raw and conservative cpp', () => {
    const d = scoreDeal(row(), 9000, 1000, 1)
    expect(d.mrPoints).toBe(70000)
    expect(d.cppRaw).toBeCloseTo(12.64, 2)          // (9000-150)/70000*100
    expect(d.cppConservative).toBeCloseTo(4.07, 2)  // (3000-150)/70000*100
  })
})

describe('rankingCpp', () => {
  it('uses raw for economy, conservative for premium', () => {
    const e = scoreDeal(row({ cabin: 'economy', miles: 25000 }), 600, 600, 1)
    const b = scoreDeal(row(), 9000, 1000, 1)
    expect(rankingCpp(e)).toBe(e.cppRaw)
    expect(rankingCpp(b)).toBe(b.cppConservative)
  })
})
```

- [x] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/core/valuation.test.ts`
Expected: FAIL — cannot find module `src/core/valuation.js`.

- [x] **Step 4: Implement valuation**

`src/core/valuation.ts`:

```ts
import type { AwardRow, Cabin, ScoredDeal } from './types.js'

export function mrPointsNeeded(miles: number, ratio: number): number {
  if (ratio <= 0) throw new Error(`Invalid transfer ratio: ${ratio}`)
  return Math.ceil(miles / ratio)
}

export function cpp(cashCad: number, taxesCad: number, mrPoints: number): number {
  const net = cashCad - taxesCad
  if (net <= 0 || mrPoints <= 0) return 0
  return (net / mrPoints) * 100
}

export function conservativeCash(cashCad: number, economyCashCad: number | null, cabin: Cabin): number {
  if (cabin === 'economy' || economyCashCad == null) return cashCad
  return Math.min(cashCad, economyCashCad * 3)
}

const round2 = (n: number): number => Math.round(n * 100) / 100

export function scoreDeal(row: AwardRow, cashCad: number, economyCashCad: number | null, ratio: number): ScoredDeal {
  const mrPoints = mrPointsNeeded(row.miles, ratio)
  return {
    ...row,
    cashCad,
    economyCashCad,
    mrPoints,
    cppRaw: round2(cpp(cashCad, row.taxesCad, mrPoints)),
    cppConservative: round2(cpp(conservativeCash(cashCad, economyCashCad, row.cabin), row.taxesCad, mrPoints)),
  }
}

export function rankingCpp(d: ScoredDeal): number {
  return d.cabin === 'economy' ? d.cppRaw : d.cppConservative
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/core/valuation.test.ts`
Expected: PASS (11 tests).

- [x] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/valuation.ts tests/core/valuation.test.ts
git commit -m "feat: add domain types and cents-per-point valuation math"
```

---

### Task 3: Regions table + pre-filter

**Files:**
- Create: `src/core/regions.ts`, `src/core/prefilter.ts`
- Test: `tests/core/prefilter.test.ts`

**Interfaces:**
- Consumes: `AwardRow` (Task 2), `mrPointsNeeded`/`cpp` (Task 2).
- Produces:
  - `regions.ts`: `regionOf(iata: string): string`, `OPTIMISTIC_CASH_CAD: Record<string, Record<Cabin, number>>`, `TAX_ESTIMATE_CAD: Record<string, number>`
  - `prefilter.ts`: `dedupeCheapest(rows: AwardRow[]): AwardRow[]`, `isViable(row: AwardRow, ratio: number, thresholds: { economy: number; premiumConservative: number }): boolean`, `optimisticPotential(row: AwardRow, ratio: number): number`

- [x] **Step 1: Write regions data**

`src/core/regions.ts`:

```ts
import type { Cabin } from './types.js'

export const AIRPORT_REGION: Record<string, string> = {
  // North America
  YYZ: 'na', YVR: 'na', YYC: 'na', YUL: 'na', YEG: 'na', YOW: 'na', YWG: 'na', YHZ: 'na',
  JFK: 'na', EWR: 'na', LGA: 'na', LAX: 'na', SFO: 'na', SEA: 'na', ORD: 'na', DFW: 'na',
  DEN: 'na', PHX: 'na', LAS: 'na', MIA: 'na', MCO: 'na', BOS: 'na', IAD: 'na', ATL: 'na',
  HNL: 'na', OGG: 'na', ANC: 'na',
  // Europe
  LHR: 'europe', LGW: 'europe', CDG: 'europe', AMS: 'europe', FRA: 'europe', MUC: 'europe',
  ZRH: 'europe', GVA: 'europe', VIE: 'europe', CPH: 'europe', ARN: 'europe', OSL: 'europe',
  HEL: 'europe', DUB: 'europe', EDI: 'europe', MAD: 'europe', BCN: 'europe', LIS: 'europe',
  FCO: 'europe', MXP: 'europe', ATH: 'europe', IST: 'europe', WAW: 'europe', PRG: 'europe',
  BRU: 'europe', KEF: 'europe',
  // Asia + Middle East
  NRT: 'asia', HND: 'asia', KIX: 'asia', ICN: 'asia', PEK: 'asia', PVG: 'asia', HKG: 'asia',
  TPE: 'asia', BKK: 'asia', SIN: 'asia', KUL: 'asia', CGK: 'asia', MNL: 'asia', SGN: 'asia',
  HAN: 'asia', DEL: 'asia', BOM: 'asia', DXB: 'asia', AUH: 'asia', DOH: 'asia', TLV: 'asia',
  // Latin America + Caribbean
  MEX: 'latam', CUN: 'latam', SJD: 'latam', PVR: 'latam', GRU: 'latam', GIG: 'latam',
  EZE: 'latam', SCL: 'latam', LIM: 'latam', BOG: 'latam', PTY: 'latam', SJO: 'latam',
  MBJ: 'latam', PUJ: 'latam', NAS: 'latam', BGI: 'latam',
  // Oceania
  SYD: 'oceania', MEL: 'oceania', BNE: 'oceania', AKL: 'oceania', NAN: 'oceania', PPT: 'oceania',
}

export function regionOf(iata: string): string {
  return AIRPORT_REGION[iata] ?? 'other'
}

// "Best plausible" cash fares from YYC, used only to discard hopeless rows cheaply.
export const OPTIMISTIC_CASH_CAD: Record<string, Record<Cabin, number>> = {
  na:      { economy: 700,  premium: 1200, business: 2500, first: 3500 },
  europe:  { economy: 1400, premium: 2200, business: 5000, first: 8000 },
  asia:    { economy: 1800, premium: 2800, business: 6500, first: 11000 },
  latam:   { economy: 1200, premium: 2000, business: 4500, first: 6000 },
  oceania: { economy: 2000, premium: 3000, business: 7000, first: 10000 },
  other:   { economy: 1500, premium: 2400, business: 5500, first: 8000 },
}

// Used when seats.aero has no usable taxes for a row.
export const TAX_ESTIMATE_CAD: Record<string, number> = {
  na: 80, europe: 250, asia: 130, latam: 110, oceania: 150, other: 150,
}
```

- [x] **Step 2: Write the failing test**

`tests/core/prefilter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { dedupeCheapest, isViable, optimisticPotential } from '../../src/core/prefilter.js'
import type { AwardRow } from '../../src/core/types.js'

const THRESHOLDS = { economy: 1.75, premiumConservative: 3.0 }

const row = (over: Partial<AwardRow> = {}): AwardRow => ({
  route: 'YYC-LHR', date: '2026-05-14', cabin: 'business', program: 'aeroplan',
  miles: 70000, taxesCad: 150, seats: 2, direct: true, ...over,
})

describe('dedupeCheapest', () => {
  it('keeps the cheapest miles per route+date+cabin+program', () => {
    const out = dedupeCheapest([row({ miles: 90000 }), row({ miles: 70000 }), row({ miles: 80000 })])
    expect(out).toHaveLength(1)
    expect(out[0].miles).toBe(70000)
  })
  it('keeps distinct keys separate', () => {
    const out = dedupeCheapest([row(), row({ date: '2026-05-15' }), row({ program: 'flyingblue' })])
    expect(out).toHaveLength(3)
  })
})

describe('isViable', () => {
  it('accepts business to Europe at reasonable miles', () => {
    // optimistic: min(5000, 3*1400=4200) => (4200-150)/70000*100 = 5.8 >= 3.0
    expect(isViable(row(), 1, THRESHOLDS)).toBe(true)
  })
  it('rejects absurd mileage economy to Europe', () => {
    // (1400-150)/100000*100 = 1.25 < 1.75
    expect(isViable(row({ cabin: 'economy', miles: 100000 }), 1, THRESHOLDS)).toBe(false)
  })
  it('accepts cheap intra-NA economy', () => {
    // (700-80)/15000*100 = 4.13 >= 1.75
    expect(isViable(row({ route: 'YYC-JFK', cabin: 'economy', miles: 15000, taxesCad: 80 }), 1, THRESHOLDS)).toBe(true)
  })
})

describe('optimisticPotential', () => {
  it('is higher for cheaper awards on the same market', () => {
    const cheap = optimisticPotential(row({ miles: 55000 }), 1)
    const dear = optimisticPotential(row({ miles: 90000 }), 1)
    expect(cheap).toBeGreaterThan(dear)
  })
})
```

- [x] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/core/prefilter.test.ts`
Expected: FAIL — cannot find module `src/core/prefilter.js`.

- [x] **Step 4: Implement prefilter**

`src/core/prefilter.ts`:

```ts
import type { AwardRow } from './types.js'
import { cpp, mrPointsNeeded, conservativeCash } from './valuation.js'
import { OPTIMISTIC_CASH_CAD, regionOf } from './regions.js'

export function dedupeCheapest(rows: AwardRow[]): AwardRow[] {
  const best = new Map<string, AwardRow>()
  for (const r of rows) {
    const key = `${r.route}|${r.date}|${r.cabin}|${r.program}`
    const cur = best.get(key)
    if (!cur || r.miles < cur.miles) best.set(key, r)
  }
  return [...best.values()]
}

export function optimisticPotential(row: AwardRow, ratio: number): number {
  const dest = row.route.split('-')[1]
  const fares = OPTIMISTIC_CASH_CAD[regionOf(dest)]
  const optimistic = conservativeCash(fares[row.cabin], fares.economy, row.cabin)
  return cpp(optimistic, row.taxesCad, mrPointsNeeded(row.miles, ratio))
}

export function isViable(
  row: AwardRow,
  ratio: number,
  thresholds: { economy: number; premiumConservative: number },
): boolean {
  const threshold = row.cabin === 'economy' ? thresholds.economy : thresholds.premiumConservative
  return optimisticPotential(row, ratio) >= threshold
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/core/prefilter.test.ts`
Expected: PASS (6 tests).

- [x] **Step 6: Commit**

```bash
git add src/core/regions.ts src/core/prefilter.ts tests/core/prefilter.test.ts
git commit -m "feat: add region tables and award pre-filter"
```

---

### Task 4: Database layer

**Files:**
- Create: `src/core/db.ts`
- Test: `tests/core/db.test.ts`

**Interfaces:**
- Consumes: `ScoredDeal` (Task 2).
- Produces (exact signatures later tasks use):
  - `openDb(path: string): DB` (`:memory:` works; creates schema; WAL mode)
  - `startScan(db): number` / `finishScan(db, scanId, stats: { rowsPulled: number; finalists: number; amadeusCalls: number; errors: string[] })`
  - `insertSnapshots(db, scanId: number, deals: ScoredDeal[]): void`
  - `alertKey(d: { route: string; date: string; cabin: string; program: string }): string`
  - `lastAlert(db, key: string): { cpp: number; seats: number } | null` / `recordAlerts(db, scanId: number, deals: ScoredDeal[]): void`
  - `getCachedFare(db, key: string, maxAgeHours: number, now?: number): number | null` / `putCachedFare(db, key: string, cashCad: number, now?: number): void`
  - `recordApiCall(db, api: string, now?: number): void` / `apiCallsThisMonth(db, api: string, now?: number): number`
  - `type DB` re-exported for other modules.

- [x] **Step 1: Write the failing test**

`tests/core/db.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  openDb, startScan, finishScan, insertSnapshots, alertKey, lastAlert,
  recordAlerts, getCachedFare, putCachedFare, recordApiCall, apiCallsThisMonth, type DB,
} from '../../src/core/db.js'
import { rankingCpp } from '../../src/core/valuation.js'
import type { ScoredDeal } from '../../src/core/types.js'

const deal = (over: Partial<ScoredDeal> = {}): ScoredDeal => ({
  route: 'YYC-LHR', date: '2026-05-14', cabin: 'business', program: 'aeroplan',
  miles: 70000, taxesCad: 150, seats: 2, direct: true,
  cashCad: 9000, economyCashCad: 1000, mrPoints: 70000, cppRaw: 12.64, cppConservative: 4.07,
  ...over,
})

let db: DB
beforeEach(() => { db = openDb(':memory:') })

describe('scans + snapshots', () => {
  it('round-trips a scan with snapshots', () => {
    const id = startScan(db)
    insertSnapshots(db, id, [deal(), deal({ cabin: 'economy', cppRaw: 2.1, cppConservative: 2.1 })])
    finishScan(db, id, { rowsPulled: 500, finalists: 2, amadeusCalls: 3, errors: [] })
    const scan = db.prepare('SELECT * FROM scans WHERE id = ?').get(id) as Record<string, unknown>
    expect(scan.finished_at).toBeTruthy()
    expect(scan.finalists).toBe(2)
    const count = db.prepare('SELECT COUNT(*) AS n FROM snapshots WHERE scan_id = ?').get(id) as { n: number }
    expect(count.n).toBe(2)
  })
})

describe('alerts', () => {
  it('returns null before any alert, then the recorded values', () => {
    const d = deal()
    expect(lastAlert(db, alertKey(d))).toBeNull()
    recordAlerts(db, 1, [d])
    expect(lastAlert(db, alertKey(d))).toEqual({ cpp: rankingCpp(d), seats: 2 })
  })
})

describe('fare cache', () => {
  it('expires entries past maxAgeHours', () => {
    const now = 1_750_000_000_000
    putCachedFare(db, 'YYC-LHR|2026-05-14|business', 8800, now)
    expect(getCachedFare(db, 'YYC-LHR|2026-05-14|business', 72, now + 71 * 3600_000)).toBe(8800)
    expect(getCachedFare(db, 'YYC-LHR|2026-05-14|business', 72, now + 73 * 3600_000)).toBeNull()
  })
})

describe('api call ledger', () => {
  it('counts only the current month and api', () => {
    const jun15 = Date.UTC(2026, 5, 15)
    const jul15 = Date.UTC(2026, 6, 15)
    recordApiCall(db, 'amadeus', jun15)
    recordApiCall(db, 'amadeus', jul15)
    recordApiCall(db, 'amadeus', jul15)
    recordApiCall(db, 'other', jul15)
    expect(apiCallsThisMonth(db, 'amadeus', jul15)).toBe(2)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/db.test.ts`
Expected: FAIL — cannot find module `src/core/db.js`.

- [x] **Step 3: Implement db layer**

`src/core/db.ts`:

```ts
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ScoredDeal } from './types.js'
import { rankingCpp } from './valuation.js'

export type DB = Database.Database

const SCHEMA = `
CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  rows_pulled INTEGER NOT NULL DEFAULT 0,
  finalists INTEGER NOT NULL DEFAULT 0,
  amadeus_calls INTEGER NOT NULL DEFAULT 0,
  errors TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL REFERENCES scans(id),
  created_at TEXT NOT NULL,
  route TEXT NOT NULL, date TEXT NOT NULL, cabin TEXT NOT NULL, program TEXT NOT NULL,
  miles INTEGER NOT NULL, taxes_cad REAL NOT NULL,
  cash_cad REAL NOT NULL, economy_cash_cad REAL,
  mr_points INTEGER NOT NULL, cpp_raw REAL NOT NULL, cpp_conservative REAL NOT NULL,
  seats INTEGER NOT NULL, direct INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_scan ON snapshots(scan_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_route ON snapshots(route, date, cabin, program);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL,
  alert_key TEXT NOT NULL,
  cpp REAL NOT NULL,
  seats INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_key ON alerts(alert_key, id);
CREATE TABLE IF NOT EXISTS fare_cache (
  cache_key TEXT PRIMARY KEY,
  cash_cad REAL NOT NULL,
  fetched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS api_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api TEXT NOT NULL,
  called_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_calls ON api_calls(api, called_at);
`

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  return db
}

export function startScan(db: DB): number {
  const r = db.prepare('INSERT INTO scans (started_at) VALUES (?)').run(new Date().toISOString())
  return Number(r.lastInsertRowid)
}

export function finishScan(
  db: DB, scanId: number,
  stats: { rowsPulled: number; finalists: number; amadeusCalls: number; errors: string[] },
): void {
  db.prepare('UPDATE scans SET finished_at = ?, rows_pulled = ?, finalists = ?, amadeus_calls = ?, errors = ? WHERE id = ?')
    .run(new Date().toISOString(), stats.rowsPulled, stats.finalists, stats.amadeusCalls, stats.errors.join('\n'), scanId)
}

export function insertSnapshots(db: DB, scanId: number, deals: ScoredDeal[]): void {
  const stmt = db.prepare(`INSERT INTO snapshots
    (scan_id, created_at, route, date, cabin, program, miles, taxes_cad, cash_cad, economy_cash_cad,
     mr_points, cpp_raw, cpp_conservative, seats, direct)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const now = new Date().toISOString()
  const insertAll = db.transaction((rows: ScoredDeal[]) => {
    for (const d of rows) {
      stmt.run(scanId, now, d.route, d.date, d.cabin, d.program, d.miles, d.taxesCad,
        d.cashCad, d.economyCashCad, d.mrPoints, d.cppRaw, d.cppConservative, d.seats, d.direct ? 1 : 0)
    }
  })
  insertAll(deals)
}

export function alertKey(d: { route: string; date: string; cabin: string; program: string }): string {
  return `${d.route}|${d.date}|${d.cabin}|${d.program}`
}

export function lastAlert(db: DB, key: string): { cpp: number; seats: number } | null {
  const row = db.prepare('SELECT cpp, seats FROM alerts WHERE alert_key = ? ORDER BY id DESC LIMIT 1')
    .get(key) as { cpp: number; seats: number } | undefined
  return row ?? null
}

export function recordAlerts(db: DB, scanId: number, deals: ScoredDeal[]): void {
  const stmt = db.prepare('INSERT INTO alerts (scan_id, alert_key, cpp, seats, created_at) VALUES (?, ?, ?, ?, ?)')
  const now = new Date().toISOString()
  for (const d of deals) stmt.run(scanId, alertKey(d), rankingCpp(d), d.seats, now)
}

export function getCachedFare(db: DB, key: string, maxAgeHours: number, now: number = Date.now()): number | null {
  const row = db.prepare('SELECT cash_cad, fetched_at FROM fare_cache WHERE cache_key = ?')
    .get(key) as { cash_cad: number; fetched_at: number } | undefined
  if (!row) return null
  if (now - row.fetched_at > maxAgeHours * 3600_000) return null
  return row.cash_cad
}

export function putCachedFare(db: DB, key: string, cashCad: number, now: number = Date.now()): void {
  db.prepare('INSERT INTO fare_cache (cache_key, cash_cad, fetched_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET cash_cad = excluded.cash_cad, fetched_at = excluded.fetched_at')
    .run(key, cashCad, now)
}

export function recordApiCall(db: DB, api: string, now: number = Date.now()): void {
  db.prepare('INSERT INTO api_calls (api, called_at) VALUES (?, ?)').run(api, now)
}

export function apiCallsThisMonth(db: DB, api: string, now: number = Date.now()): number {
  const d = new Date(now)
  const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
  const row = db.prepare('SELECT COUNT(*) AS n FROM api_calls WHERE api = ? AND called_at >= ?')
    .get(api, monthStart) as { n: number }
  return row.n
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/db.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git add src/core/db.ts tests/core/db.test.ts
git commit -m "feat: add sqlite layer for scans, snapshots, alerts, caches"
```

---

### Task 5: seats.aero client

**Files:**
- Create: `src/scanner/seatsaero.ts`, `tests/fixtures/seatsaero-search.json`
- Test: `tests/scanner/seatsaero.test.ts`

**Interfaces:**
- Consumes: `Config` (Task 1), `AwardRow` (Task 2), `regionOf`/`TAX_ESTIMATE_CAD` (Task 3).
- Produces:
  - `parseCachedSearch(json: unknown, cfg: Config): AwardRow[]`
  - `fetchAvailability(cfg: Config, fetchFn?: typeof fetch): Promise<AwardRow[]>` — paginates the seats.aero cached-search endpoint with `Partner-Authorization` header until `hasMore` is false.

- [x] **Step 1: Create the fixture**

`tests/fixtures/seatsaero-search.json` (shape mirrors seats.aero `/partnerapi/search` cached-search responses):

```json
{
  "data": [
    {
      "ID": "abc1",
      "Route": { "OriginAirport": "YYC", "DestinationAirport": "LHR", "Source": "aeroplan" },
      "Date": "2026-05-14",
      "YAvailable": true, "YMileageCost": "35000", "YTotalTaxes": 18500, "YRemainingSeats": 4, "YDirect": false,
      "WAvailable": false, "WMileageCost": "0", "WTotalTaxes": 0, "WRemainingSeats": 0, "WDirect": false,
      "JAvailable": true, "JMileageCost": "70000", "JTotalTaxes": 22100, "JRemainingSeats": 2, "JDirect": true,
      "FAvailable": false, "FMileageCost": "0", "FTotalTaxes": 0, "FRemainingSeats": 0, "FDirect": false,
      "TaxesCurrency": "CAD"
    },
    {
      "ID": "abc2",
      "Route": { "OriginAirport": "YYC", "DestinationAirport": "CDG", "Source": "flyingblue" },
      "Date": "2026-09-03",
      "YAvailable": true, "YMileageCost": "25000", "YTotalTaxes": 0, "YRemainingSeats": 9, "YDirect": false,
      "WAvailable": false, "WMileageCost": "0", "WTotalTaxes": 0, "WRemainingSeats": 0, "WDirect": false,
      "JAvailable": false, "JMileageCost": "0", "JTotalTaxes": 0, "JRemainingSeats": 0, "JDirect": false,
      "FAvailable": false, "FMileageCost": "0", "FTotalTaxes": 0, "FRemainingSeats": 0, "FDirect": false,
      "TaxesCurrency": "EUR"
    },
    {
      "ID": "abc3",
      "Route": { "OriginAirport": "YYC", "DestinationAirport": "SYD", "Source": "velocity" },
      "Date": "2026-03-10",
      "YAvailable": true, "YMileageCost": "40000", "YTotalTaxes": 9000, "YRemainingSeats": 2, "YDirect": false,
      "WAvailable": false, "WMileageCost": "0", "WTotalTaxes": 0, "WRemainingSeats": 0, "WDirect": false,
      "JAvailable": false, "JMileageCost": "0", "JTotalTaxes": 0, "JRemainingSeats": 0, "JDirect": false,
      "FAvailable": false, "FMileageCost": "0", "FTotalTaxes": 0, "FRemainingSeats": 0, "FDirect": false,
      "TaxesCurrency": "AUD"
    }
  ],
  "count": 3,
  "hasMore": false,
  "cursor": 0
}
```

- [x] **Step 2: Write the failing test**

`tests/scanner/seatsaero.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseCachedSearch, fetchAvailability } from '../../src/scanner/seatsaero.js'
import { loadConfig } from '../../src/core/config.js'

const cfg = loadConfig({
  SEATS_AERO_KEY: 'sk1', AMADEUS_KEY: 'ak', AMADEUS_SECRET: 'as',
  GMAIL_USER: 'hl@gmail.com', GMAIL_APP_PASSWORD: 'gp', DIGEST_TO: 'me@example.com',
})
const fixture = JSON.parse(readFileSync('tests/fixtures/seatsaero-search.json', 'utf8'))

describe('parseCachedSearch', () => {
  const rows = parseCachedSearch(fixture, cfg)

  it('emits one row per available cabin for known programs', () => {
    // abc1 => economy + business, abc2 => economy; abc3 (velocity) dropped
    expect(rows).toHaveLength(3)
    expect(rows.map(r => r.program).sort()).toEqual(['aeroplan', 'aeroplan', 'flyingblue'])
  })

  it('converts CAD taxes from cents', () => {
    const j = rows.find(r => r.cabin === 'business')!
    expect(j.route).toBe('YYC-LHR')
    expect(j.miles).toBe(70000)
    expect(j.taxesCad).toBe(221)
    expect(j.seats).toBe(2)
    expect(j.direct).toBe(true)
  })

  it('falls back to region tax estimate for non-CAD or missing taxes', () => {
    const fb = rows.find(r => r.program === 'flyingblue')!
    expect(fb.taxesCad).toBe(250) // europe estimate, EUR taxes not converted in v1
  })
})

describe('fetchAvailability', () => {
  it('paginates until hasMore is false and sends the auth header', async () => {
    const page1 = { ...fixture, hasMore: true, cursor: 99 }
    const page2 = { ...fixture, data: [fixture.data[1]], hasMore: false }
    const calls: string[] = []
    const fakeFetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(url))
      expect((init!.headers as Record<string, string>)['Partner-Authorization']).toBe('sk1')
      const body = calls.length === 1 ? page1 : page2
      return new Response(JSON.stringify(body), { status: 200 })
    }) as typeof fetch
    const rows = await fetchAvailability(cfg, fakeFetch)
    expect(calls).toHaveLength(2)
    expect(calls[0]).toContain('origin_airport=YYC')
    expect(calls[1]).toContain('cursor=99')
    expect(rows).toHaveLength(4) // 3 from page1 + 1 from page2
  })

  it('throws on non-200', async () => {
    const fakeFetch = (async () => new Response('nope', { status: 401 })) as typeof fetch
    await expect(fetchAvailability(cfg, fakeFetch)).rejects.toThrow('401')
  })
})
```

- [x] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/scanner/seatsaero.test.ts`
Expected: FAIL — cannot find module `src/scanner/seatsaero.js`.

- [x] **Step 4: Implement the client**

`src/scanner/seatsaero.ts`:

```ts
import type { Config } from '../core/config.js'
import type { AwardRow, Cabin } from '../core/types.js'
import { regionOf, TAX_ESTIMATE_CAD } from '../core/regions.js'

const BASE = 'https://seats.aero/partnerapi'

const CABIN_FIELDS: Array<{ cabin: Cabin; prefix: 'Y' | 'W' | 'J' | 'F' }> = [
  { cabin: 'economy', prefix: 'Y' },
  { cabin: 'premium', prefix: 'W' },
  { cabin: 'business', prefix: 'J' },
  { cabin: 'first', prefix: 'F' },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseCachedSearch(json: any, cfg: Config): AwardRow[] {
  const out: AwardRow[] = []
  for (const item of json?.data ?? []) {
    const program: string | undefined = item?.Route?.Source
    if (!program || !(program in cfg.ratios)) continue
    const origin = item.Route.OriginAirport
    const dest = item.Route.DestinationAirport
    const route = `${origin}-${dest}`
    for (const { cabin, prefix } of CABIN_FIELDS) {
      if (!item[`${prefix}Available`]) continue
      const miles = Number(item[`${prefix}MileageCost`])
      if (!miles) continue
      const taxesRaw = Number(item[`${prefix}TotalTaxes`] ?? 0)
      const taxesCad = taxesRaw > 0 && item.TaxesCurrency === 'CAD'
        ? taxesRaw / 100
        : TAX_ESTIMATE_CAD[regionOf(dest)]
      out.push({
        route,
        date: item.Date,
        cabin,
        program,
        miles,
        taxesCad,
        seats: Number(item[`${prefix}RemainingSeats`] ?? 0) || 1,
        direct: Boolean(item[`${prefix}Direct`]),
      })
    }
  }
  return out
}

export async function fetchAvailability(cfg: Config, fetchFn: typeof fetch = fetch): Promise<AwardRow[]> {
  const rows: AwardRow[] = []
  let cursor: number | undefined
  do {
    const url = new URL(`${BASE}/search`)
    url.searchParams.set('origin_airport', cfg.origin)
    url.searchParams.set('start_date', '2026-01-01')
    url.searchParams.set('end_date', '2026-12-31')
    url.searchParams.set('take', '1000')
    if (cursor !== undefined) url.searchParams.set('cursor', String(cursor))
    const res = await fetchFn(url.toString(), {
      headers: { 'Partner-Authorization': cfg.seatsAeroKey, Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`seats.aero ${res.status}: ${await res.text()}`)
    const json = await res.json()
    rows.push(...parseCachedSearch(json, cfg))
    cursor = json.hasMore ? Number(json.cursor) : undefined
  } while (cursor !== undefined)
  return rows
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/scanner/seatsaero.test.ts`
Expected: PASS (5 tests).

- [x] **Step 6: Commit**

```bash
git add src/scanner/seatsaero.ts tests/scanner/seatsaero.test.ts tests/fixtures/seatsaero-search.json
git commit -m "feat: add seats.aero cached-search client with pagination"
```

---

### Task 6: Amadeus client with cache + budget guard

**Files:**
- Create: `src/scanner/amadeus.ts`
- Test: `tests/scanner/amadeus.test.ts`

**Interfaces:**
- Consumes: `Config` (Task 1), `Cabin` (Task 2), db helpers `getCachedFare`/`putCachedFare`/`recordApiCall`/`apiCallsThisMonth` and `DB` (Task 4).
- Produces:
  - `resetTokenCache(): void` (test hook)
  - `fetchCashFare(cfg: Config, db: DB, q: { route: string; date: string; cabin: Cabin }, fetchFn?: typeof fetch): Promise<{ cashCad: number | null; networkCall: boolean }>` — returns cached fare with `networkCall: false`; returns `{ cashCad: null, networkCall: false }` when monthly budget exhausted; on API failure returns `{ cashCad: null, networkCall: true }` (never throws).

- [x] **Step 1: Write the failing test**

`tests/scanner/amadeus.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { fetchCashFare, resetTokenCache } from '../../src/scanner/amadeus.js'
import { openDb, putCachedFare, recordApiCall, apiCallsThisMonth, type DB } from '../../src/core/db.js'
import { loadConfig } from '../../src/core/config.js'

const cfg = loadConfig({
  SEATS_AERO_KEY: 'sk1', AMADEUS_KEY: 'ak', AMADEUS_SECRET: 'as',
  GMAIL_USER: 'hl@gmail.com', GMAIL_APP_PASSWORD: 'gp', DIGEST_TO: 'me@example.com', AMADEUS_MONTHLY_BUDGET: '3',
})
const q = { route: 'YYC-LHR', date: '2026-05-14', cabin: 'business' as const }

const tokenResponse = new Response(JSON.stringify({ access_token: 'tok', expires_in: 1799 }), { status: 200 })
const offersBody = { data: [{ price: { grandTotal: '8802.40' } }, { price: { grandTotal: '9100.00' } }] }

let db: DB
beforeEach(() => { db = openDb(':memory:'); resetTokenCache() })

describe('fetchCashFare', () => {
  it('serves from cache without a network call', async () => {
    putCachedFare(db, 'YYC-LHR|2026-05-14|business', 8800)
    const boom = (async () => { throw new Error('should not fetch') }) as unknown as typeof fetch
    expect(await fetchCashFare(cfg, db, q, boom)).toEqual({ cashCad: 8800, networkCall: false })
  })

  it('authenticates, fetches min offer, caches it', async () => {
    const urls: string[] = []
    const fakeFetch = (async (url: RequestInfo | URL) => {
      urls.push(String(url))
      if (String(url).includes('/oauth2/token')) return tokenResponse.clone()
      return new Response(JSON.stringify(offersBody), { status: 200 })
    }) as typeof fetch
    const r = await fetchCashFare(cfg, db, q, fakeFetch)
    expect(r).toEqual({ cashCad: 8802.4, networkCall: true })
    expect(urls[1]).toContain('travelClass=BUSINESS')
    expect(urls[1]).toContain('currencyCode=CAD')
    expect(apiCallsThisMonth(db, 'amadeus')).toBe(1)
    // second call is a cache hit
    const boom = (async () => { throw new Error('no') }) as unknown as typeof fetch
    expect(await fetchCashFare(cfg, db, q, boom)).toEqual({ cashCad: 8802.4, networkCall: false })
  })

  it('refuses when the monthly budget is spent', async () => {
    recordApiCall(db, 'amadeus'); recordApiCall(db, 'amadeus'); recordApiCall(db, 'amadeus')
    const boom = (async () => { throw new Error('no') }) as unknown as typeof fetch
    expect(await fetchCashFare(cfg, db, q, boom)).toEqual({ cashCad: null, networkCall: false })
  })

  it('returns null on API failure instead of throwing', async () => {
    const fakeFetch = (async (url: RequestInfo | URL) => {
      if (String(url).includes('/oauth2/token')) return tokenResponse.clone()
      return new Response('rate limited', { status: 429 })
    }) as typeof fetch
    expect(await fetchCashFare(cfg, db, q, fakeFetch)).toEqual({ cashCad: null, networkCall: true })
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scanner/amadeus.test.ts`
Expected: FAIL — cannot find module `src/scanner/amadeus.js`.

- [x] **Step 3: Implement the client**

`src/scanner/amadeus.ts`:

```ts
import type { Config } from '../core/config.js'
import type { Cabin } from '../core/types.js'
import { getCachedFare, putCachedFare, recordApiCall, apiCallsThisMonth, type DB } from '../core/db.js'

let cachedToken: { token: string; expiresAt: number } | null = null

export function resetTokenCache(): void { cachedToken = null }

async function getToken(cfg: Config, fetchFn: typeof fetch): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token
  const res = await fetchFn(`${cfg.amadeusHost}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cfg.amadeusKey,
      client_secret: cfg.amadeusSecret,
    }).toString(),
  })
  if (!res.ok) throw new Error(`amadeus auth ${res.status}`)
  const json = await res.json()
  cachedToken = { token: json.access_token, expiresAt: now + json.expires_in * 1000 }
  return cachedToken.token
}

const CABIN_TO_AMADEUS: Record<Cabin, string> = {
  economy: 'ECONOMY', premium: 'PREMIUM_ECONOMY', business: 'BUSINESS', first: 'FIRST',
}

export async function fetchCashFare(
  cfg: Config, db: DB,
  q: { route: string; date: string; cabin: Cabin },
  fetchFn: typeof fetch = fetch,
): Promise<{ cashCad: number | null; networkCall: boolean }> {
  const key = `${q.route}|${q.date}|${q.cabin}`
  const cached = getCachedFare(db, key, cfg.fareCacheHours)
  if (cached !== null) return { cashCad: cached, networkCall: false }
  if (apiCallsThisMonth(db, 'amadeus') >= cfg.amadeusMonthlyBudget) {
    return { cashCad: null, networkCall: false }
  }
  try {
    const token = await getToken(cfg, fetchFn)
    const [origin, dest] = q.route.split('-')
    const url = new URL(`${cfg.amadeusHost}/v2/shopping/flight-offers`)
    url.searchParams.set('originLocationCode', origin)
    url.searchParams.set('destinationLocationCode', dest)
    url.searchParams.set('departureDate', q.date)
    url.searchParams.set('adults', '1')
    url.searchParams.set('travelClass', CABIN_TO_AMADEUS[q.cabin])
    url.searchParams.set('currencyCode', 'CAD')
    url.searchParams.set('max', '5')
    recordApiCall(db, 'amadeus')
    const res = await fetchFn(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return { cashCad: null, networkCall: true }
    const json = await res.json()
    const prices = (json.data ?? [])
      .map((o: { price?: { grandTotal?: string } }) => Number(o.price?.grandTotal))
      .filter((n: number) => Number.isFinite(n) && n > 0)
    if (prices.length === 0) return { cashCad: null, networkCall: true }
    const min = Math.min(...prices)
    putCachedFare(db, key, min)
    return { cashCad: min, networkCall: true }
  } catch {
    return { cashCad: null, networkCall: true }
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scanner/amadeus.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git add src/scanner/amadeus.ts tests/scanner/amadeus.test.ts
git commit -m "feat: add amadeus cash-fare client with cache and budget guard"
```

---

### Task 7: Digest — alert selection, dedupe, render, send

**Files:**
- Create: `src/scanner/digest.ts`
- Test: `tests/scanner/digest.test.ts`

**Interfaces:**
- Consumes: `Config` (Task 1), `ScoredDeal`/`rankingCpp` (Task 2), db helpers `lastAlert`/`alertKey`/`recordAlerts` and `DB` (Task 4).
- Produces:
  - `selectAlerts(db: DB, deals: ScoredDeal[], cfg: Config): ScoredDeal[]` — threshold filter + re-alert dedupe + top-10 per bucket (premium listed first).
  - `renderDigest(deals: ScoredDeal[], cfg: Config, errors?: string[]): string` — HTML email body.
  - `sendDigest(cfg: Config, subject: string, html: string, transport?: MailTransport): Promise<void>` — sends via Gmail SMTP (nodemailer, `smtp.gmail.com:465`), throws on failure. `type MailTransport = { sendMail(opts: { from: string; to: string; subject: string; html: string }): Promise<unknown> }` is also exported for tests.

- [x] **Step 1: Write the failing test**

`tests/scanner/digest.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { selectAlerts, renderDigest, sendDigest } from '../../src/scanner/digest.js'
import { openDb, recordAlerts, type DB } from '../../src/core/db.js'
import { loadConfig } from '../../src/core/config.js'
import type { ScoredDeal } from '../../src/core/types.js'

const cfg = loadConfig({
  SEATS_AERO_KEY: 'sk1', AMADEUS_KEY: 'ak', AMADEUS_SECRET: 'as',
  GMAIL_USER: 'hl@gmail.com', GMAIL_APP_PASSWORD: 'gp', DIGEST_TO: 'me@example.com',
})

const deal = (over: Partial<ScoredDeal> = {}): ScoredDeal => ({
  route: 'YYC-LHR', date: '2026-05-14', cabin: 'business', program: 'aeroplan',
  miles: 70000, taxesCad: 150, seats: 2, direct: true,
  cashCad: 9000, economyCashCad: 1000, mrPoints: 70000, cppRaw: 12.64, cppConservative: 4.07,
  ...over,
})

let db: DB
beforeEach(() => { db = openDb(':memory:') })

describe('selectAlerts', () => {
  it('applies cabin-specific thresholds', () => {
    const keep = deal()                                                       // 4.07 >= 3.0
    const dropPremium = deal({ date: '2026-06-01', cppConservative: 2.5 })    // < 3.0
    const keepEcon = deal({ date: '2026-07-01', cabin: 'economy', cppRaw: 1.9, cppConservative: 1.9 })
    const dropEcon = deal({ date: '2026-08-01', cabin: 'economy', cppRaw: 1.5, cppConservative: 1.5 })
    const out = selectAlerts(db, [keep, dropPremium, keepEcon, dropEcon], cfg)
    expect(out.map(d => d.date)).toEqual(['2026-05-14', '2026-07-01']) // premium bucket first
  })

  it('suppresses repeats unless value improves 15% or seats increase', () => {
    const d = deal()
    recordAlerts(db, 1, [d])
    expect(selectAlerts(db, [d], cfg)).toHaveLength(0)
    expect(selectAlerts(db, [{ ...d, cppConservative: 4.07 * 1.16 }], cfg)).toHaveLength(1)
    expect(selectAlerts(db, [{ ...d, seats: 5 }], cfg)).toHaveLength(1)
  })

  it('caps each bucket at 10, best first', () => {
    const deals = Array.from({ length: 14 }, (_, i) =>
      deal({ date: `2026-05-${String(i + 1).padStart(2, '0')}`, cppConservative: 3 + i * 0.1 }))
    const out = selectAlerts(db, deals, cfg)
    expect(out).toHaveLength(10)
    expect(out[0].cppConservative).toBeCloseTo(4.3)
  })
})

describe('renderDigest', () => {
  it('marks budget fit and shows both premium numbers', () => {
    const html = renderDigest([deal(), deal({ date: '2026-06-02', mrPoints: 300000 })], cfg)
    expect(html).toContain('YYC-LHR')
    expect(html).toContain('4.07')      // conservative
    expect(html).toContain('12.64')     // raw
    expect(html).toContain('fits 220,000')
  })
  it('includes errors section when present', () => {
    const html = renderDigest([], cfg, ['seats.aero: 500'])
    expect(html).toContain('seats.aero: 500')
  })
})

describe('sendDigest', () => {
  it('sends via the provided transport with sender and recipient', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: '1' })
    await sendDigest(cfg, 'subject', '<p>hi</p>', { sendMail })
    expect(sendMail).toHaveBeenCalledWith({
      from: 'Flight Checks <hl@gmail.com>',
      to: 'me@example.com',
      subject: 'subject',
      html: '<p>hi</p>',
    })
  })
  it('propagates transport failures', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('535 auth failed'))
    await expect(sendDigest(cfg, 's', '<p></p>', { sendMail })).rejects.toThrow('535')
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scanner/digest.test.ts`
Expected: FAIL — cannot find module `src/scanner/digest.js`.

- [x] **Step 3: Implement digest**

`src/scanner/digest.ts`:

```ts
import nodemailer from 'nodemailer'
import type { Config } from '../core/config.js'
import type { ScoredDeal } from '../core/types.js'
import { rankingCpp } from '../core/valuation.js'
import { lastAlert, alertKey, type DB } from '../core/db.js'

export function selectAlerts(db: DB, deals: ScoredDeal[], cfg: Config): ScoredDeal[] {
  const eligible = deals.filter(d =>
    d.cabin === 'economy'
      ? d.cppRaw >= cfg.thresholds.economy
      : d.cppConservative >= cfg.thresholds.premiumConservative)

  const fresh = eligible.filter(d => {
    const prev = lastAlert(db, alertKey(d))
    if (!prev) return true
    return rankingCpp(d) >= prev.cpp * (1 + cfg.alertImprovement) || d.seats > prev.seats
  })

  const byValue = (a: ScoredDeal, b: ScoredDeal) => rankingCpp(b) - rankingCpp(a)
  const premium = fresh.filter(d => d.cabin !== 'economy').sort(byValue).slice(0, 10)
  const economy = fresh.filter(d => d.cabin === 'economy').sort(byValue).slice(0, 10)
  return [...premium, ...economy]
}

const fmt = new Intl.NumberFormat('en-CA')

function dealRow(d: ScoredDeal, cfg: Config): string {
  const fire = d.cabin !== 'economy' && d.cppConservative >= cfg.thresholds.premiumConservative ? ' 🔥' : ''
  const budget = d.mrPoints <= cfg.mrBalance ? ` ✅ fits ${fmt.format(cfg.mrBalance)}` : ''
  const value = d.cabin === 'economy'
    ? `${d.cppRaw.toFixed(2)} ¢/pt`
    : `${d.cppConservative.toFixed(2)} ¢/pt conservative (${d.cppRaw.toFixed(2)} raw)`
  return `<tr>
    <td>${d.route}</td><td>${d.date}</td><td>${d.cabin}${fire}</td><td>${d.program}</td>
    <td>${fmt.format(d.mrPoints)} MR + $${d.taxesCad.toFixed(0)}</td>
    <td>vs $${fmt.format(Math.round(d.cashCad))} cash</td>
    <td><b>${value}</b>${budget}</td>
    <td>${d.seats} seat(s)${d.direct ? ', direct' : ''}</td>
  </tr>`
}

export function renderDigest(deals: ScoredDeal[], cfg: Config, errors: string[] = []): string {
  const rows = deals.map(d => dealRow(d, cfg)).join('\n')
  const errorBlock = errors.length
    ? `<h3>⚠️ Scan problems</h3><pre>${errors.join('\n')}</pre>`
    : ''
  const body = deals.length
    ? `<table border="1" cellpadding="6" cellspacing="0">
        <tr><th>Route</th><th>Date</th><th>Cabin</th><th>Program</th><th>Cost</th><th>Cash comp</th><th>Value</th><th>Availability</th></tr>
        ${rows}</table>`
    : '<p>No deals cleared the thresholds this scan.</p>'
  return `<h2>Flight Checks digest</h2>${body}
    <p style="color:#666">Benchmarks: statement credit 1.00 ¢/pt · Fixed Points Travel ~1.75 ¢/pt.</p>
    ${errorBlock}`
}

export interface MailTransport {
  sendMail(opts: { from: string; to: string; subject: string; html: string }): Promise<unknown>
}

function gmailTransport(cfg: Config): MailTransport {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: cfg.gmailUser, pass: cfg.gmailAppPassword },
  })
}

export async function sendDigest(
  cfg: Config, subject: string, html: string,
  transport: MailTransport = gmailTransport(cfg),
): Promise<void> {
  await transport.sendMail({
    from: `Flight Checks <${cfg.gmailUser}>`,
    to: cfg.digestTo,
    subject,
    html,
  })
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scanner/digest.test.ts`
Expected: PASS (7 tests).

- [x] **Step 5: Commit**

```bash
git add src/scanner/digest.ts tests/scanner/digest.test.ts
git commit -m "feat: add digest selection, dedupe, rendering, and gmail smtp delivery"
```

---

### Task 8: Scanner orchestrator + dry-run mode

**Files:**
- Create: `src/scanner/run.ts`, `src/scanner/index.ts`, `tests/fixtures/awards.json`, `tests/fixtures/fares.json`
- Test: `tests/scanner/run.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–7 (exact names as declared there).
- Produces:
  - `runScan(opts?: { dryRun?: boolean; env?: Record<string, string | undefined> }): Promise<{ scanId: number; snapshots: number; alerts: number; errors: string[] }>`
  - `src/scanner/index.ts` CLI entry: `tsx src/scanner/index.ts [--dry-run]`.

- [x] **Step 1: Create fixtures**

`tests/fixtures/awards.json` (parsed `AwardRow[]`, used instead of the seats.aero API in dry-run):

```json
[
  { "route": "YYC-LHR", "date": "2026-05-14", "cabin": "business", "program": "aeroplan",
    "miles": 70000, "taxesCad": 221, "seats": 2, "direct": true },
  { "route": "YYC-LHR", "date": "2026-05-14", "cabin": "economy", "program": "aeroplan",
    "miles": 35000, "taxesCad": 185, "seats": 4, "direct": false },
  { "route": "YYC-CDG", "date": "2026-09-03", "cabin": "economy", "program": "flyingblue",
    "miles": 25000, "taxesCad": 250, "seats": 9, "direct": false },
  { "route": "YYC-LHR", "date": "2026-11-20", "cabin": "economy", "program": "aeroplan",
    "miles": 120000, "taxesCad": 185, "seats": 1, "direct": false }
]
```

(The 120k-mile row exists to prove the pre-filter drops it.)

`tests/fixtures/fares.json` (keyed `route|date|cabin`, used instead of Amadeus in dry-run):

```json
{
  "YYC-LHR|2026-05-14|business": 8800,
  "YYC-LHR|2026-05-14|economy": 1450,
  "YYC-CDG|2026-09-03|economy": 1300
}
```

- [x] **Step 2: Write the failing test**

`tests/scanner/run.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { runScan } from '../../src/scanner/run.js'
import { openDb } from '../../src/core/db.js'

const env = {
  SEATS_AERO_KEY: 'sk1', AMADEUS_KEY: 'ak', AMADEUS_SECRET: 'as',
  GMAIL_USER: 'hl@gmail.com', GMAIL_APP_PASSWORD: 'gp', DIGEST_TO: 'me@example.com', DB_PATH: ':memory:',
}

describe('runScan --dry-run', () => {
  it('runs the full pipeline from fixtures without network', async () => {
    const result = await runScan({ dryRun: true, env })
    // 4 fixture rows, 1 killed by prefilter, 3 scored+snapshotted
    expect(result.snapshots).toBe(3)
    expect(result.alerts).toBeGreaterThanOrEqual(1)
    expect(result.errors).toEqual([])
  })

  it('persists snapshots and scan stats to the db file', async () => {
    const dbPath = `${process.env.TMPDIR ?? '/tmp'}/flight-checks-test-${process.pid}.db`
    await runScan({ dryRun: true, env: { ...env, DB_PATH: dbPath } })
    const db = openDb(dbPath)
    const scan = db.prepare('SELECT * FROM scans ORDER BY id DESC LIMIT 1').get() as Record<string, unknown>
    expect(scan.finished_at).toBeTruthy()
    expect(scan.finalists).toBe(3)
    const snaps = db.prepare('SELECT COUNT(*) AS n FROM snapshots').get() as { n: number }
    expect(snaps.n).toBe(3)
  })
})
```

- [x] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/scanner/run.test.ts`
Expected: FAIL — cannot find module `src/scanner/run.js`.

- [x] **Step 4: Implement orchestrator**

`src/scanner/run.ts`:

```ts
import { readFileSync } from 'node:fs'
import { loadConfig, type Config } from '../core/config.js'
import type { AwardRow, ScoredDeal } from '../core/types.js'
import { scoreDeal } from '../core/valuation.js'
import { dedupeCheapest, isViable, optimisticPotential } from '../core/prefilter.js'
import { openDb, startScan, finishScan, insertSnapshots, recordAlerts, type DB } from '../core/db.js'
import { fetchAvailability } from './seatsaero.js'
import { fetchCashFare } from './amadeus.js'
import { selectAlerts, renderDigest, sendDigest } from './digest.js'

type Pricer = (q: { route: string; date: string; cabin: AwardRow['cabin'] })
  => Promise<{ cashCad: number | null; networkCall: boolean }>

function fixturePricer(): Pricer {
  const fares: Record<string, number> = JSON.parse(readFileSync('tests/fixtures/fares.json', 'utf8'))
  return async q => ({ cashCad: fares[`${q.route}|${q.date}|${q.cabin}`] ?? null, networkCall: false })
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try { return await fn() } catch (err) {
      lastErr = err
      await new Promise(r => setTimeout(r, 1000 * 2 ** i))
    }
  }
  throw lastErr
}

export async function runScan(
  opts: { dryRun?: boolean; env?: Record<string, string | undefined> } = {},
): Promise<{ scanId: number; snapshots: number; alerts: number; errors: string[] }> {
  const cfg: Config = loadConfig(opts.env ?? process.env)
  const db: DB = openDb(cfg.dbPath)
  const scanId = startScan(db)
  const errors: string[] = []

  let rows: AwardRow[] = []
  try {
    rows = opts.dryRun
      ? (JSON.parse(readFileSync('tests/fixtures/awards.json', 'utf8')) as AwardRow[])
      : await withRetry(() => fetchAvailability(cfg))
  } catch (err) {
    errors.push(`seats.aero: ${err}`)
  }

  const deduped = dedupeCheapest(rows)
  const finalists = deduped
    .filter(r => r.program in cfg.ratios && isViable(r, cfg.ratios[r.program], cfg.thresholds))
    .sort((a, b) => optimisticPotential(b, cfg.ratios[b.program]) - optimisticPotential(a, cfg.ratios[a.program]))

  const pricer: Pricer = opts.dryRun ? fixturePricer() : q => fetchCashFare(cfg, db, q)
  const scored: ScoredDeal[] = []
  let networkCalls = 0
  for (const row of finalists) {
    if (networkCalls >= cfg.amadeusCallsPerRun) break
    const fare = await pricer({ route: row.route, date: row.date, cabin: row.cabin })
    if (fare.networkCall) networkCalls++
    if (fare.cashCad === null) continue
    let economyCash: number | null = null
    if (row.cabin !== 'economy' && networkCalls < cfg.amadeusCallsPerRun) {
      const eco = await pricer({ route: row.route, date: row.date, cabin: 'economy' })
      if (eco.networkCall) networkCalls++
      economyCash = eco.cashCad
    }
    scored.push(scoreDeal(row, fare.cashCad, economyCash, cfg.ratios[row.program]))
  }

  insertSnapshots(db, scanId, scored)
  const alerts = selectAlerts(db, scored, cfg)
  if (alerts.length > 0 || errors.length > 0) {
    const html = renderDigest(alerts, cfg, errors)
    const subject = alerts.length > 0
      ? `✈️ ${alerts.length} deal(s) — best ${Math.max(...alerts.map(a => a.cabin === 'economy' ? a.cppRaw : a.cppConservative)).toFixed(2)} ¢/pt`
      : '⚠️ Flight Checks scan had errors'
    if (opts.dryRun) {
      console.log(`[dry-run] would email: ${subject}`)
    } else {
      try { await sendDigest(cfg, subject, html) } catch (err) { errors.push(`email: ${err}`) }
    }
    recordAlerts(db, scanId, alerts)
  }

  finishScan(db, scanId, { rowsPulled: rows.length, finalists: finalists.length, amadeusCalls: networkCalls, errors })
  return { scanId, snapshots: scored.length, alerts: alerts.length, errors }
}
```

`src/scanner/index.ts`:

```ts
import { runScan } from './run.js'

const dryRun = process.argv.includes('--dry-run')
runScan({ dryRun }).then(r => {
  console.log(`scan ${r.scanId}: ${r.snapshots} snapshots, ${r.alerts} alerts, ${r.errors.length} errors`)
  if (r.errors.length) { console.error(r.errors.join('\n')); process.exitCode = 1 }
})
```

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/scanner/run.test.ts`
Expected: PASS (2 tests). Note: the first test's `alerts` count reflects that all three fixture deals clear their thresholds; the dry-run pricer counts no network calls.

- [x] **Step 6: Run the full suite and the CLI dry-run**

Run: `npx vitest run` — Expected: all tests pass.
Run: `DB_PATH=':memory:' SEATS_AERO_KEY=x AMADEUS_KEY=x AMADEUS_SECRET=x GMAIL_USER=x GMAIL_APP_PASSWORD=x DIGEST_TO=x npx tsx src/scanner/index.ts --dry-run`
Expected: prints `[dry-run] would email: ✈️ ...` then `scan 1: 3 snapshots, 3 alerts, 0 errors`.

- [x] **Step 7: Commit**

```bash
git add src/scanner/run.ts src/scanner/index.ts tests/scanner/run.test.ts tests/fixtures/awards.json tests/fixtures/fares.json
git commit -m "feat: add scanner orchestrator with dry-run mode"
```

---

### Task 9: Dashboard API server

**Files:**
- Create: `src/server/app.ts`, `src/server/index.ts`
- Test: `tests/server/app.test.ts`

**Interfaces:**
- Consumes: `DB`/`openDb`/`startScan`/`finishScan`/`insertSnapshots` (Task 4).
- Produces:
  - `createApp(db: DB): Hono` with routes:
    - `GET /api/deals` → `{ deals: [...] }` — snapshots of the latest finished scan, ordered by ranking cpp desc, limit 100; optional `?cabin=economy`.
    - `GET /api/history?route=YYC-LHR&cabin=business` → `{ points: [{ created_at, cpp, cash_cad, miles }] }` (cpp = raw for economy, conservative otherwise).
    - `GET /api/scans` → `{ scans: [...] }` — last 50 scans, newest first.
  - `src/server/index.ts` binds `0.0.0.0:3000` and serves static files from `dist/web`.

- [x] **Step 1: Write the failing test**

`tests/server/app.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createApp } from '../../src/server/app.js'
import { openDb, startScan, finishScan, insertSnapshots, type DB } from '../../src/core/db.js'
import type { ScoredDeal } from '../../src/core/types.js'

const deal = (over: Partial<ScoredDeal> = {}): ScoredDeal => ({
  route: 'YYC-LHR', date: '2026-05-14', cabin: 'business', program: 'aeroplan',
  miles: 70000, taxesCad: 150, seats: 2, direct: true,
  cashCad: 9000, economyCashCad: 1000, mrPoints: 70000, cppRaw: 12.64, cppConservative: 4.07,
  ...over,
})
const stats = { rowsPulled: 10, finalists: 2, amadeusCalls: 2, errors: [] }

let db: DB
beforeEach(() => {
  db = openDb(':memory:')
  const s1 = startScan(db)
  insertSnapshots(db, s1, [deal({ cppConservative: 3.5 })])
  finishScan(db, s1, stats)
  const s2 = startScan(db)
  insertSnapshots(db, s2, [deal(), deal({ cabin: 'economy', cppRaw: 2.1, cppConservative: 2.1 })])
  finishScan(db, s2, stats)
})

describe('GET /api/deals', () => {
  it('returns latest finished scan ordered by ranking cpp', async () => {
    const res = await createApp(db).request('/api/deals')
    expect(res.status).toBe(200)
    const { deals } = await res.json()
    expect(deals).toHaveLength(2)
    expect(deals[0].cabin).toBe('business') // 4.07 > 2.1
  })
  it('filters by cabin', async () => {
    const res = await createApp(db).request('/api/deals?cabin=economy')
    const { deals } = await res.json()
    expect(deals).toHaveLength(1)
    expect(deals[0].cabin).toBe('economy')
  })
})

describe('GET /api/history', () => {
  it('returns the series across scans for one market', async () => {
    const res = await createApp(db).request('/api/history?route=YYC-LHR&cabin=business')
    const { points } = await res.json()
    expect(points).toHaveLength(2)
    expect(points.map((p: { cpp: number }) => p.cpp)).toEqual([3.5, 4.07])
  })
  it('400s without a route', async () => {
    expect((await createApp(db).request('/api/history')).status).toBe(400)
  })
})

describe('GET /api/scans', () => {
  it('lists scans newest first', async () => {
    const { scans } = await (await createApp(db).request('/api/scans')).json()
    expect(scans).toHaveLength(2)
    expect(scans[0].id).toBeGreaterThan(scans[1].id)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/app.test.ts`
Expected: FAIL — cannot find module `src/server/app.js`.

- [x] **Step 3: Implement server**

`src/server/app.ts`:

```ts
import { Hono } from 'hono'
import type { DB } from '../core/db.js'

export function createApp(db: DB): Hono {
  const app = new Hono()

  app.get('/api/deals', c => {
    const cabin = c.req.query('cabin')
    const latest = db.prepare('SELECT id FROM scans WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1')
      .get() as { id: number } | undefined
    if (!latest) return c.json({ deals: [] })
    const sql = `SELECT * FROM snapshots WHERE scan_id = ? ${cabin ? 'AND cabin = ?' : ''}
      ORDER BY CASE WHEN cabin = 'economy' THEN cpp_raw ELSE cpp_conservative END DESC LIMIT 100`
    const deals = cabin
      ? db.prepare(sql).all(latest.id, cabin)
      : db.prepare(sql).all(latest.id)
    return c.json({ deals })
  })

  app.get('/api/history', c => {
    const route = c.req.query('route')
    if (!route) return c.json({ error: 'route is required' }, 400)
    const cabin = c.req.query('cabin') ?? 'economy'
    const points = db.prepare(`
      SELECT created_at,
             CASE WHEN cabin = 'economy' THEN cpp_raw ELSE cpp_conservative END AS cpp,
             cash_cad, miles
      FROM snapshots WHERE route = ? AND cabin = ? ORDER BY id ASC`).all(route, cabin)
    return c.json({ points })
  })

  app.get('/api/scans', c => {
    const scans = db.prepare('SELECT * FROM scans ORDER BY id DESC LIMIT 50').all()
    return c.json({ scans })
  })

  return app
}
```

`src/server/index.ts`:

```ts
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createApp } from './app.js'
import { openDb } from '../core/db.js'

const db = openDb(process.env.DB_PATH ?? 'data/flights.db')
const app = createApp(db)
app.use('/*', serveStatic({ root: './dist/web' }))

serve({ fetch: app.fetch, port: 3000, hostname: '0.0.0.0' })
console.log('flight-checks dashboard on http://0.0.0.0:3000')
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/app.test.ts`
Expected: PASS (5 tests).

- [x] **Step 5: Commit**

```bash
git add src/server/app.ts src/server/index.ts tests/server/app.test.ts
git commit -m "feat: add hono dashboard api"
```

---

### Task 10: React dashboard

**Files:**
- Create: `vite.config.ts`, `src/web/index.html`, `src/web/main.tsx`, `src/web/App.tsx`, `src/web/api.ts`, `src/web/Sparkline.tsx`, `src/web/styles.css`

**Interfaces:**
- Consumes: the three JSON endpoints from Task 9 (`/api/deals`, `/api/history`, `/api/scans`) — snapshot rows use the snake_case DB column names (`cpp_raw`, `cpp_conservative`, `mr_points`, `cash_cad`, `taxes_cad`).
- Produces: static build in `dist/web` (what `src/server/index.ts` serves). Verification is `npm run build` + serving it; no unit tests for markup.

- [x] **Step 1: Vite config**

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  build: { outDir: '../../dist/web', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:3000' } },
})
```

- [x] **Step 2: Static shell and API helper**

`src/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Flight Checks</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`src/web/api.ts`:

```ts
export interface DealRow {
  id: number; route: string; date: string; cabin: string; program: string
  miles: number; taxes_cad: number; cash_cad: number; economy_cash_cad: number | null
  mr_points: number; cpp_raw: number; cpp_conservative: number; seats: number; direct: number
}
export interface HistoryPoint { created_at: string; cpp: number; cash_cad: number; miles: number }
export interface ScanRow {
  id: number; started_at: string; finished_at: string | null
  rows_pulled: number; finalists: number; amadeus_calls: number; errors: string
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.json() as Promise<T>
}

export const fetchDeals = (cabin?: string) =>
  get<{ deals: DealRow[] }>(`/api/deals${cabin ? `?cabin=${cabin}` : ''}`).then(r => r.deals)
export const fetchHistory = (route: string, cabin: string) =>
  get<{ points: HistoryPoint[] }>(`/api/history?route=${route}&cabin=${cabin}`).then(r => r.points)
export const fetchScans = () => get<{ scans: ScanRow[] }>('/api/scans').then(r => r.scans)
```

`src/web/styles.css`:

```css
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { margin: 0; padding: 1.5rem; max-width: 1100px; margin-inline: auto; }
nav { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
nav button { padding: 0.5rem 1rem; border: 1px solid #8884; background: transparent; border-radius: 6px; cursor: pointer; font-size: 1rem; }
nav button.active { background: #4462ee; color: white; border-color: #4462ee; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 0.45rem 0.6rem; border-bottom: 1px solid #8883; white-space: nowrap; }
tr.fits { background: #22c55e18; }
.value { font-weight: 700; }
.overflow { overflow-x: auto; }
select { padding: 0.35rem; font-size: 1rem; margin-right: 0.5rem; }
pre.err { color: #dc2626; white-space: pre-wrap; }
```

- [x] **Step 3: Sparkline component**

`src/web/Sparkline.tsx`:

```tsx
export function Sparkline({ values, width = 640, height = 120 }: {
  values: number[]; width?: number; height?: number
}) {
  if (values.length === 0) return <p>No history yet.</p>
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const pad = 10
  const pts = values.map((v, i) => {
    const x = pad + (i * (width - 2 * pad)) / Math.max(values.length - 1, 1)
    const y = height - pad - ((v - min) * (height - 2 * pad)) / span
    return `${x},${y}`
  })
  return (
    <svg width={width} height={height} role="img" aria-label="value history">
      <polyline points={pts.join(' ')} fill="none" stroke="#4462ee" strokeWidth="2" />
      <text x={pad} y={12} fontSize="11" fill="#888">{max.toFixed(2)}</text>
      <text x={pad} y={height - 2} fontSize="11" fill="#888">{min.toFixed(2)}</text>
    </svg>
  )
}
```

- [x] **Step 4: App with three tabs**

`src/web/App.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { fetchDeals, fetchHistory, fetchScans, type DealRow, type HistoryPoint, type ScanRow } from './api.js'
import { Sparkline } from './Sparkline.js'

const MR_BALANCE = 220000
type Tab = 'deals' | 'history' | 'runs'

function DealsTab({ onPick }: { onPick: (route: string, cabin: string) => void }) {
  const [cabin, setCabin] = useState('')
  const [deals, setDeals] = useState<DealRow[]>([])
  useEffect(() => { fetchDeals(cabin || undefined).then(setDeals).catch(console.error) }, [cabin])
  return (
    <div className="overflow">
      <select value={cabin} onChange={e => setCabin(e.target.value)}>
        <option value="">All cabins</option>
        <option value="economy">Economy</option>
        <option value="premium">Premium economy</option>
        <option value="business">Business</option>
        <option value="first">First</option>
      </select>
      <table>
        <thead><tr><th>Route</th><th>Date</th><th>Cabin</th><th>Program</th><th>MR points</th><th>Taxes</th><th>Cash comp</th><th>¢/pt</th><th>Seats</th></tr></thead>
        <tbody>
          {deals.map(d => {
            const cpp = d.cabin === 'economy' ? d.cpp_raw : d.cpp_conservative
            return (
              <tr key={d.id} className={d.mr_points <= MR_BALANCE ? 'fits' : ''}
                  onClick={() => onPick(d.route, d.cabin)} style={{ cursor: 'pointer' }}>
                <td>{d.route}</td><td>{d.date}</td><td>{d.cabin}</td><td>{d.program}</td>
                <td>{d.mr_points.toLocaleString()}</td><td>${d.taxes_cad.toFixed(0)}</td>
                <td>${Math.round(d.cash_cad).toLocaleString()}</td>
                <td className="value">{cpp.toFixed(2)}{d.cabin !== 'economy' ? ` (${d.cpp_raw.toFixed(2)} raw)` : ''}</td>
                <td>{d.seats}{d.direct ? ' · direct' : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {deals.length === 0 && <p>No snapshots yet — wait for the next scan.</p>}
    </div>
  )
}

function HistoryTab({ route, cabin }: { route: string; cabin: string }) {
  const [points, setPoints] = useState<HistoryPoint[]>([])
  useEffect(() => {
    if (route) fetchHistory(route, cabin).then(setPoints).catch(console.error)
  }, [route, cabin])
  if (!route) return <p>Pick a deal on the Deals tab to see its history.</p>
  return (
    <div>
      <h3>{route} · {cabin} · ¢/pt over time</h3>
      <Sparkline values={points.map(p => p.cpp)} />
      <h3>Cash fare (CAD)</h3>
      <Sparkline values={points.map(p => p.cash_cad)} />
    </div>
  )
}

function RunsTab() {
  const [scans, setScans] = useState<ScanRow[]>([])
  useEffect(() => { fetchScans().then(setScans).catch(console.error) }, [])
  return (
    <div className="overflow">
      <table>
        <thead><tr><th>#</th><th>Started</th><th>Finished</th><th>Rows</th><th>Finalists</th><th>Amadeus calls</th><th>Errors</th></tr></thead>
        <tbody>
          {scans.map(s => (
            <tr key={s.id}>
              <td>{s.id}</td><td>{s.started_at}</td><td>{s.finished_at ?? 'running'}</td>
              <td>{s.rows_pulled}</td><td>{s.finalists}</td><td>{s.amadeus_calls}</td>
              <td>{s.errors ? <pre className="err">{s.errors}</pre> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>('deals')
  const [picked, setPicked] = useState<{ route: string; cabin: string }>({ route: '', cabin: 'economy' })
  return (
    <div>
      <h1>✈️ Flight Checks</h1>
      <nav>
        {(['deals', 'history', 'runs'] as Tab[]).map(t => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      {tab === 'deals' && <DealsTab onPick={(route, cabin) => { setPicked({ route, cabin }); setTab('history') }} />}
      {tab === 'history' && <HistoryTab route={picked.route} cabin={picked.cabin} />}
      {tab === 'runs' && <RunsTab />}
    </div>
  )
}
```

`src/web/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client'
import App from './App.js'

createRoot(document.getElementById('root')!).render(<App />)
```

- [x] **Step 5: Verify build and serve**

Run: `npm run build`
Expected: Vite build succeeds, `dist/web/index.html` exists.

Run: `DB_PATH=':memory:' npx tsx src/server/index.ts &` then `curl -s http://localhost:3000/ | head -5` then kill the server.
Expected: curl returns the built `index.html` (contains `<title>Flight Checks</title>`).

- [x] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [x] **Step 7: Commit**

```bash
git add vite.config.ts src/web
git commit -m "feat: add react dashboard with deals, history, runs tabs"
```

---

### Task 11: Deploy to the container

**Files:**
- Create: `deploy/flight-checks-scan.service`, `deploy/flight-checks-scan.timer`, `deploy/flight-checks-web.service`, `deploy/env.example`, `deploy/deploy.sh`

**Interfaces:**
- Consumes: the whole app; container access via `ssh flight-checks` (alias for root@<container-ip>).
- Produces: running production system — `flight-checks-web.service` (dashboard) and `flight-checks-scan.timer` (07:00 & 19:00 America/Edmonton) on the container, app in `/opt/flight-checks`, secrets in `/etc/flight-checks/env`.

- [x] **Step 1: Write systemd units**

`deploy/flight-checks-scan.service`:

```ini
[Unit]
Description=Flight Checks scanner run
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/opt/flight-checks
EnvironmentFile=/etc/flight-checks/env
ExecStart=/opt/flight-checks/node_modules/.bin/tsx src/scanner/index.ts
TimeoutStartSec=900
```

`deploy/flight-checks-scan.timer`:

```ini
[Unit]
Description=Flight Checks twice-daily scan

[Timer]
OnCalendar=*-*-* 07:00:00
OnCalendar=*-*-* 19:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

`deploy/flight-checks-web.service`:

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

`deploy/env.example`:

```bash
SEATS_AERO_KEY=replace-me
AMADEUS_KEY=replace-me
AMADEUS_SECRET=replace-me
# switch to https://api.amadeus.com once a production Amadeus app is approved
AMADEUS_HOST=https://test.api.amadeus.com
GMAIL_USER=replace-me@gmail.com
GMAIL_APP_PASSWORD=replace-me
DIGEST_TO=user@example.com
DB_PATH=/opt/flight-checks/data/flights.db
ORIGIN=YYC
MR_BALANCE=220000
```

- [x] **Step 2: Write deploy script**

`deploy/deploy.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
HOST=flight-checks
APP=/opt/flight-checks

rsync -az --delete \
  --exclude .git --exclude node_modules --exclude data --exclude dist --exclude env.local \
  ./ "$HOST:$APP/"

# env.local (gitignored, on the Mac) is the source of truth for secrets
if [ -f env.local ]; then
  ssh "$HOST" mkdir -p /etc/flight-checks
  scp -q env.local "$HOST:/etc/flight-checks/env"
  ssh "$HOST" chmod 600 /etc/flight-checks/env
fi

ssh "$HOST" bash -s <<'REMOTE'
set -euo pipefail
cd /opt/flight-checks
npm ci
npm run build
mkdir -p data /etc/flight-checks
[ -f /etc/flight-checks/env ] || { cp deploy/env.example /etc/flight-checks/env; chmod 600 /etc/flight-checks/env; echo "WARNING: /etc/flight-checks/env created from example — fill in real keys"; }
cp deploy/flight-checks-scan.service deploy/flight-checks-scan.timer deploy/flight-checks-web.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now flight-checks-web.service flight-checks-scan.timer
systemctl restart flight-checks-web.service
echo "deployed. timers:"
systemctl list-timers flight-checks-scan.timer --no-pager
REMOTE
```

Run: `chmod +x deploy/deploy.sh`

- [x] **Step 3: Set container timezone (one-time)**

Run: `ssh flight-checks "timedatectl set-timezone America/Edmonton && timedatectl | grep 'Time zone'"`
Expected: `Time zone: America/Edmonton (MDT, -0600)` (or MST in winter).

- [x] **Step 4: First deploy**

Run: `./deploy/deploy.sh`
Expected: rsync + `npm ci` + build succeed; output ends with the timer listing showing next triggers at 07:00/19:00; warning that env was created from example (unless keys were already installed).

- [ ] **Step 5: Install real API keys**

If the user has filled in `env.local` (seats.aero key, Amadeus key/secret, Gmail user + app password), re-running `./deploy/deploy.sh` copies it to `/etc/flight-checks/env` automatically; then `ssh flight-checks "systemctl restart flight-checks-web.service"`. If keys are not yet available, leave the example values — the web service and timer run, and scan runs will report config errors until keys land.

- [x] **Step 6: Verify end-to-end**

Run: `ssh flight-checks "cd /opt/flight-checks && set -a && . /etc/flight-checks/env && set +a && npx tsx src/scanner/index.ts --dry-run"`
Expected: `scan N: 3 snapshots, 3 alerts, 0 errors` (fixtures pipeline works on the container).

Run: `curl -s http://<container-ip>:3000/api/scans | head -c 300`
Expected: JSON with at least the dry-run scan.

Run: open `http://<container-ip>:3000` — dashboard renders with the dry-run snapshot data.

With real keys installed, also run one live scan: `ssh flight-checks "systemctl start flight-checks-scan.service && journalctl -u flight-checks-scan.service -n 20 --no-pager"`
Expected: scan completes, digest email arrives at user@example.com.

- [ ] **Step 7: Commit**

```bash
git add deploy/
git commit -m "feat: add systemd units and rsync deploy for the proxmox container"
```
