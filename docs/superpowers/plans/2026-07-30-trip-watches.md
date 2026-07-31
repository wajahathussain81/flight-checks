# Trip Watches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Named "trip watches" (travel-date window + destination rules + themes) that every full scan evaluates, reporting the top matching deals in the digest email and on a dashboard tab.

**Architecture:** Watches live in a new server-owned `watches` SQLite table; the scanner reads them and ranks each scan's already-scored deals through a pure `matchWatch` filter, appending per-watch sections to the digest. A new curated `AIRPORT_THEMES` map in core tags every destination with beach/city/nature vibes. The server exposes watch CRUD plus a `watches/:id/deals` view over the newest full scan; the dashboard gets a Watches tab.

**Tech Stack:** TypeScript ESM (Node 22, strict, NodeNext), better-sqlite3, Hono, React + Vite, vitest.

**Spec:** `docs/superpowers/specs/2026-07-30-trip-watches-design.md`

## Global Constraints

- Node 22, TypeScript strict, ESM with `NodeNext` — all relative imports end in `.js` even from `.ts` files.
- No web scraping; no new external services. Watches only filter data already fetched from seats.aero.
- Mock `fetch` and the mail transport in tests; never hit live APIs.
- Snapshots are append-only; watches must not write snapshots.
- Ranking is cents per point: `cppRaw` for economy, `cppConservative` for premium cabins (`rankingCpp` in `src/core/valuation.ts`).
- Country names use the exact `AIRPORT_CITY` spellings (`USA`, not `United States`).
- Commit messages: conventional style (`feat:`, `test:`, `docs:`), **no AI attribution trailers of any kind**.
- Verification commands: `npx vitest run` (full suite) and `npx tsc --noEmit`. Single file: `npx vitest run tests/core/watches.test.ts` (never watch mode).

---

### Task 1: Destination themes (`src/core/themes.ts`)

**Files:**
- Create: `src/core/themes.ts`
- Test: `tests/core/themes.test.ts`

**Interfaces:**
- Consumes: `AIRPORT_REGION` from `src/core/regions.js` (test only).
- Produces: `THEMES: readonly ['beach', 'city', 'nature']`, `type Theme = (typeof THEMES)[number]`, `AIRPORT_THEMES: Record<string, Theme[]>` covering every airport in `AIRPORT_REGION`.

- [ ] **Step 1: Write the failing test**

Create `tests/core/themes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { AIRPORT_REGION } from '../../src/core/regions.js'
import { AIRPORT_THEMES, THEMES } from '../../src/core/themes.js'

describe('AIRPORT_THEMES', () => {
  it('tags every airport in AIRPORT_REGION with at least one theme', () => {
    const untagged = Object.keys(AIRPORT_REGION).filter(a => !(AIRPORT_THEMES[a]?.length >= 1))
    expect(untagged).toEqual([])
  })

  it('uses only known themes', () => {
    for (const [airport, themes] of Object.entries(AIRPORT_THEMES)) {
      for (const t of themes) {
        expect(THEMES, `${airport} has unknown theme ${t}`).toContain(t)
      }
    }
  })

  it('has no airports outside AIRPORT_REGION', () => {
    const extra = Object.keys(AIRPORT_THEMES).filter(a => !(a in AIRPORT_REGION))
    expect(extra).toEqual([])
  })

  it('spot-checks curated tags', () => {
    expect(AIRPORT_THEMES.CUN).toEqual(['beach'])
    expect(AIRPORT_THEMES.FCO).toEqual(['city'])
    expect(AIRPORT_THEMES.KEF).toEqual(['nature'])
    expect(AIRPORT_THEMES.IST).toContain('city')
    expect(AIRPORT_THEMES.IST).toContain('beach')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/themes.test.ts`
Expected: FAIL — `Cannot find module '../../src/core/themes.js'` (or equivalent resolve error).

- [ ] **Step 3: Write the implementation**

Create `src/core/themes.ts`:

```ts
// Curated trip-vibe tags for every destination in AIRPORT_REGION.
// Same static-metadata philosophy as regions.ts — no external lookups.
export const THEMES = ['beach', 'city', 'nature'] as const
export type Theme = (typeof THEMES)[number]

export const AIRPORT_THEMES: Record<string, Theme[]> = {
  // North America
  YYZ: ['city'], YVR: ['city', 'nature'], YYC: ['city', 'nature'], YUL: ['city'],
  YEG: ['city'], YOW: ['city'], YWG: ['city'], YHZ: ['city', 'nature'],
  JFK: ['city'], EWR: ['city'], LGA: ['city'], LAX: ['city', 'beach'],
  SFO: ['city'], SEA: ['city', 'nature'], ORD: ['city'], DFW: ['city'],
  DEN: ['city', 'nature'], PHX: ['city', 'nature'], LAS: ['city'], MIA: ['city', 'beach'],
  MCO: ['city'], BOS: ['city'], IAD: ['city'], ATL: ['city'],
  HNL: ['beach', 'nature'], OGG: ['beach', 'nature'], ANC: ['nature'],
  // Europe
  LHR: ['city'], LGW: ['city'], CDG: ['city'], AMS: ['city'], FRA: ['city'], MUC: ['city'],
  ZRH: ['city', 'nature'], GVA: ['city', 'nature'], VIE: ['city'], CPH: ['city'],
  ARN: ['city'], OSL: ['city', 'nature'], HEL: ['city', 'nature'], DUB: ['city'],
  EDI: ['city'], MAD: ['city'], BCN: ['city', 'beach'], LIS: ['city', 'beach'],
  FCO: ['city'], MXP: ['city'], ATH: ['city', 'beach'], IST: ['city', 'beach'],
  WAW: ['city'], PRG: ['city'], BRU: ['city'], KEF: ['nature'],
  // Asia + Middle East
  NRT: ['city'], HND: ['city'], KIX: ['city'], ICN: ['city'], PEK: ['city'], PVG: ['city'],
  HKG: ['city'], TPE: ['city'], BKK: ['city', 'beach'], SIN: ['city'],
  KUL: ['city', 'beach'], CGK: ['city', 'beach'], MNL: ['city', 'beach'], SGN: ['city'],
  HAN: ['city', 'nature'], DEL: ['city'], BOM: ['city'], DXB: ['city', 'beach'],
  AUH: ['city', 'beach'], DOH: ['city'], TLV: ['city', 'beach'],
  // Latin America + Caribbean
  MEX: ['city'], CUN: ['beach'], SJD: ['beach'], PVR: ['beach'],
  GRU: ['city'], GIG: ['city', 'beach'], EZE: ['city'], SCL: ['city', 'nature'],
  LIM: ['city'], BOG: ['city'], PTY: ['city', 'beach'], SJO: ['nature', 'beach'],
  MBJ: ['beach'], PUJ: ['beach'], NAS: ['beach'], BGI: ['beach'],
  // Oceania
  SYD: ['city', 'beach'], MEL: ['city'], BNE: ['city', 'beach'], AKL: ['city', 'nature'],
  NAN: ['beach'], PPT: ['beach', 'nature'],
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/themes.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/themes.ts tests/core/themes.test.ts
git commit -m "feat: curated destination theme tags (beach/city/nature)"
```

---

### Task 2: Watches table and CRUD (`src/core/watches.ts`)

**Files:**
- Modify: `src/core/db.ts` (append to the `SCHEMA` template string, before the closing backtick)
- Create: `src/core/watches.ts`
- Test: `tests/core/watches.test.ts`

**Interfaces:**
- Consumes: `DB`, `openDb` from `src/core/db.js`; `COUNTRY_CONTINENT` from `src/core/regions.js`; `THEMES`, `Theme` from `src/core/themes.js`; `Cabin` from `src/core/types.js`.
- Produces (used by Tasks 3–6):
  - `interface WatchInput { name: string; enabled?: boolean; dateFrom: string; dateTo: string; excludeCountries?: string[]; includeContinents?: string[]; themes?: Theme[]; cabins?: Cabin[]; topN?: number }`
  - `interface Watch { id: number; name: string; enabled: boolean; dateFrom: string; dateTo: string; excludeCountries: string[]; includeContinents: string[]; themes: Theme[]; cabins: Cabin[]; topN: number; createdAt: string }`
  - `validateWatchInput(input: unknown): string | null`
  - `listWatches(db: DB): { watches: Watch[]; errors: string[] }`
  - `getWatch(db: DB, id: number): Watch | null`
  - `createWatch(db: DB, input: WatchInput): Watch`
  - `updateWatch(db: DB, id: number, input: WatchInput): Watch | null`
  - `deleteWatch(db: DB, id: number): boolean`
  - `type WatchState = 'active' | 'expired' | 'disabled'`; `watchState(w: Watch, today: string): WatchState`

- [ ] **Step 1: Add the table to the schema**

In `src/core/db.ts`, inside the `SCHEMA` string after the `deal_status` table:

```sql
CREATE TABLE IF NOT EXISTS watches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  exclude_countries TEXT NOT NULL DEFAULT '[]',
  include_continents TEXT NOT NULL DEFAULT '[]',
  themes TEXT NOT NULL DEFAULT '[]',
  cabins TEXT NOT NULL DEFAULT '[]',
  top_n INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL
);
```

(`CREATE TABLE IF NOT EXISTS` is the established migration mechanism — existing databases pick the table up on next open.)

- [ ] **Step 2: Write the failing tests**

Create `tests/core/watches.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, type DB } from '../../src/core/db.js'
import {
  createWatch, deleteWatch, getWatch, listWatches, updateWatch,
  validateWatchInput, watchState, type WatchInput,
} from '../../src/core/watches.js'

const input: WatchInput = {
  name: 'Post-Ramadan international',
  dateFrom: '2027-03-10', dateTo: '2027-04-15',
  excludeCountries: ['USA', 'Canada'], themes: ['beach'], topN: 5,
}

let db: DB
beforeEach(() => { db = openDb(':memory:') })

describe('watch CRUD', () => {
  it('creates with defaults and reads back', () => {
    const w = createWatch(db, input)
    expect(w.id).toBeGreaterThan(0)
    expect(w.enabled).toBe(true)
    expect(w.includeContinents).toEqual([])
    expect(w.cabins).toEqual([])
    expect(w.createdAt).toBeTruthy()
    expect(getWatch(db, w.id)).toEqual(w)
  })

  it('lists watches', () => {
    createWatch(db, input)
    createWatch(db, { ...input, name: 'Second' })
    const { watches, errors } = listWatches(db)
    expect(watches.map(w => w.name)).toEqual(['Post-Ramadan international', 'Second'])
    expect(errors).toEqual([])
  })

  it('updates and returns null for unknown id', () => {
    const w = createWatch(db, input)
    const updated = updateWatch(db, w.id, { ...input, name: 'Renamed', enabled: false, topN: 3 })
    expect(updated?.name).toBe('Renamed')
    expect(updated?.enabled).toBe(false)
    expect(updated?.topN).toBe(3)
    expect(updateWatch(db, 9999, input)).toBeNull()
  })

  it('deletes', () => {
    const w = createWatch(db, input)
    expect(deleteWatch(db, w.id)).toBe(true)
    expect(deleteWatch(db, w.id)).toBe(false)
    expect(getWatch(db, w.id)).toBeNull()
  })

  it('skips malformed rows with an error instead of throwing', () => {
    createWatch(db, input)
    db.prepare(`INSERT INTO watches (name, date_from, date_to, themes, created_at)
      VALUES ('broken', '2027-03-10', '2027-04-15', 'not-json', '2026-07-30')`).run()
    const { watches, errors } = listWatches(db)
    expect(watches).toHaveLength(1)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/broken/)
  })
})

describe('validateWatchInput', () => {
  it('accepts a valid input', () => {
    expect(validateWatchInput(input)).toBeNull()
  })
  it.each([
    [{}, /name/],
    [{ ...input, name: '  ' }, /name/],
    [{ ...input, dateFrom: '2027-3-1' }, /dateFrom/],
    [{ ...input, dateTo: 'soon' }, /dateTo/],
    [{ ...input, dateFrom: '2027-05-01' }, /before/],
    [{ ...input, excludeCountries: ['Narnia'] }, /unknown country/],
    [{ ...input, includeContinents: ['Atlantis'] }, /unknown continent/],
    [{ ...input, themes: ['ski'] }, /unknown theme/],
    [{ ...input, cabins: ['suite'] }, /unknown cabin/],
    [{ ...input, topN: 0 }, /topN/],
    [{ ...input, topN: 2.5 }, /topN/],
  ])('rejects %j', (bad, pattern) => {
    expect(validateWatchInput(bad)).toMatch(pattern)
  })
})

describe('watchState', () => {
  const w = () => createWatch(db, input)
  it('active while enabled and not past dateTo', () => {
    expect(watchState(w(), '2027-04-15')).toBe('active')
    expect(watchState(w(), '2026-07-30')).toBe('active')
  })
  it('expired after dateTo', () => {
    expect(watchState(w(), '2027-04-16')).toBe('expired')
  })
  it('disabled wins over dates', () => {
    const watch = createWatch(db, { ...input, enabled: false })
    expect(watchState(watch, '2026-07-30')).toBe('disabled')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/core/watches.test.ts`
Expected: FAIL — cannot resolve `src/core/watches.js`.

- [ ] **Step 4: Write the implementation**

Create `src/core/watches.ts`:

```ts
import type { DB } from './db.js'
import type { Cabin } from './types.js'
import { COUNTRY_CONTINENT } from './regions.js'
import { THEMES, type Theme } from './themes.js'

export interface WatchInput {
  name: string
  enabled?: boolean
  dateFrom: string
  dateTo: string
  excludeCountries?: string[]
  includeContinents?: string[]
  themes?: Theme[]
  cabins?: Cabin[]
  topN?: number
}

export interface Watch {
  id: number
  name: string
  enabled: boolean
  dateFrom: string
  dateTo: string
  excludeCountries: string[]
  includeContinents: string[]
  themes: Theme[]
  cabins: Cabin[]
  topN: number
  createdAt: string
}

const CABINS: readonly string[] = ['economy', 'premium', 'business', 'first']
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export function validateWatchInput(input: unknown): string | null {
  const w = input as Partial<WatchInput> | null
  if (!w || typeof w !== 'object') return 'body required'
  if (typeof w.name !== 'string' || w.name.trim() === '') return 'name required'
  if (typeof w.dateFrom !== 'string' || !ISO_DAY.test(w.dateFrom)) return 'dateFrom must be YYYY-MM-DD'
  if (typeof w.dateTo !== 'string' || !ISO_DAY.test(w.dateTo)) return 'dateTo must be YYYY-MM-DD'
  if (w.dateFrom > w.dateTo) return 'dateFrom must be on or before dateTo'
  const continents = new Set(Object.values(COUNTRY_CONTINENT))
  for (const c of w.excludeCountries ?? []) if (!(c in COUNTRY_CONTINENT)) return `unknown country: ${c}`
  for (const c of w.includeContinents ?? []) if (!continents.has(c)) return `unknown continent: ${c}`
  for (const t of w.themes ?? []) if (!(THEMES as readonly string[]).includes(t)) return `unknown theme: ${t}`
  for (const c of w.cabins ?? []) if (!CABINS.includes(c)) return `unknown cabin: ${c}`
  if (w.topN !== undefined && (!Number.isInteger(w.topN) || w.topN < 1)) return 'topN must be a positive integer'
  return null
}

interface WatchRow {
  id: number; name: string; enabled: number; date_from: string; date_to: string
  exclude_countries: string; include_continents: string; themes: string; cabins: string
  top_n: number; created_at: string
}

function parseRow(r: WatchRow): Watch {
  return {
    id: r.id, name: r.name, enabled: r.enabled === 1,
    dateFrom: r.date_from, dateTo: r.date_to,
    excludeCountries: JSON.parse(r.exclude_countries) as string[],
    includeContinents: JSON.parse(r.include_continents) as string[],
    themes: JSON.parse(r.themes) as Theme[],
    cabins: JSON.parse(r.cabins) as Cabin[],
    topN: r.top_n, createdAt: r.created_at,
  }
}

export function listWatches(db: DB): { watches: Watch[]; errors: string[] } {
  const rows = db.prepare('SELECT * FROM watches ORDER BY id').all() as WatchRow[]
  const watches: Watch[] = []
  const errors: string[] = []
  for (const r of rows) {
    try { watches.push(parseRow(r)) } catch { errors.push(`watch ${r.id} (${r.name}): malformed row skipped`) }
  }
  return { watches, errors }
}

export function getWatch(db: DB, id: number): Watch | null {
  const r = db.prepare('SELECT * FROM watches WHERE id = ?').get(id) as WatchRow | undefined
  if (!r) return null
  try { return parseRow(r) } catch { return null }
}

export function createWatch(db: DB, input: WatchInput): Watch {
  const res = db.prepare(`INSERT INTO watches
    (name, enabled, date_from, date_to, exclude_countries, include_continents, themes, cabins, top_n, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    input.name.trim(), input.enabled === false ? 0 : 1, input.dateFrom, input.dateTo,
    JSON.stringify(input.excludeCountries ?? []), JSON.stringify(input.includeContinents ?? []),
    JSON.stringify(input.themes ?? []), JSON.stringify(input.cabins ?? []),
    input.topN ?? 5, new Date().toISOString())
  return getWatch(db, Number(res.lastInsertRowid)) as Watch
}

export function updateWatch(db: DB, id: number, input: WatchInput): Watch | null {
  if (!getWatch(db, id)) return null
  db.prepare(`UPDATE watches SET name = ?, enabled = ?, date_from = ?, date_to = ?,
    exclude_countries = ?, include_continents = ?, themes = ?, cabins = ?, top_n = ? WHERE id = ?`).run(
    input.name.trim(), input.enabled === false ? 0 : 1, input.dateFrom, input.dateTo,
    JSON.stringify(input.excludeCountries ?? []), JSON.stringify(input.includeContinents ?? []),
    JSON.stringify(input.themes ?? []), JSON.stringify(input.cabins ?? []),
    input.topN ?? 5, id)
  return getWatch(db, id)
}

export function deleteWatch(db: DB, id: number): boolean {
  return db.prepare('DELETE FROM watches WHERE id = ?').run(id).changes > 0
}

export type WatchState = 'active' | 'expired' | 'disabled'

export function watchState(w: Watch, today: string): WatchState {
  if (!w.enabled) return 'disabled'
  if (w.dateTo < today) return 'expired'
  return 'active'
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/core/watches.test.ts tests/core/db.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add src/core/db.ts src/core/watches.ts tests/core/watches.test.ts
git commit -m "feat: watches table with validated CRUD in core"
```

---

### Task 3: Watch matcher (`matchWatch`)

**Files:**
- Modify: `src/core/watches.ts` (append)
- Test: `tests/core/watches.test.ts` (append)

**Interfaces:**
- Consumes: `AIRPORT_CITY`, `continentOf` from `src/core/regions.js`; `AIRPORT_THEMES` from `src/core/themes.js`; `Watch` from Task 2.
- Produces: `matchWatch<T extends { route: string; date: string; cabin: string }>(watch: Watch, deals: T[], rank: (d: T) => number): T[]` — generic so the scanner passes `ScoredDeal[]` with `rankingCpp` and the server passes snake_case snapshot rows with its own rank function.

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/watches.test.ts` (add `matchWatch` to the existing import from `watches.js`, and add this import at the top):

```ts
import { matchWatch } from '../../src/core/watches.js'   // merge into existing import
import { rankingCpp } from '../../src/core/valuation.js'
import type { ScoredDeal } from '../../src/core/types.js'
```

```ts
const deal = (over: Partial<ScoredDeal> = {}): ScoredDeal => ({
  route: 'YYC-CUN', date: '2027-03-20', cabin: 'economy', program: 'aeroplan',
  miles: 30000, taxesCad: 90, seats: 2, direct: true,
  cashCad: 700, economyCashCad: 700, mrPoints: 30000, cppRaw: 2.03, cppConservative: 2.03,
  ...over,
})

describe('matchWatch', () => {
  const watch = () => createWatch(db, input) // Mar 10 – Apr 15 2027, excl USA+Canada, beach

  it('includes window edges and rejects outside dates', () => {
    const deals = [
      deal({ date: '2027-03-10' }), deal({ date: '2027-04-15' }),
      deal({ date: '2027-03-09' }), deal({ date: '2027-04-16' }),
    ]
    expect(matchWatch(watch(), deals, rankingCpp).map(d => d.date).sort())
      .toEqual(['2027-03-10', '2027-04-15'])
  })

  it('drops excluded countries', () => {
    const deals = [deal(), deal({ route: 'YYC-MIA' }), deal({ route: 'YYC-YYZ' })]
    expect(matchWatch(watch(), deals, rankingCpp).map(d => d.route)).toEqual(['YYC-CUN'])
  })

  it('applies themes: beach keeps CUN, drops LHR', () => {
    const deals = [deal(), deal({ route: 'YYC-LHR' })]
    expect(matchWatch(watch(), deals, rankingCpp).map(d => d.route)).toEqual(['YYC-CUN'])
  })

  it('applies includeContinents when set', () => {
    const w = createWatch(db, { ...input, themes: [], includeContinents: ['Oceania'] })
    const deals = [deal(), deal({ route: 'YYC-NAN' })]
    expect(matchWatch(w, deals, rankingCpp).map(d => d.route)).toEqual(['YYC-NAN'])
  })

  it('applies cabin filter when set', () => {
    const w = createWatch(db, { ...input, cabins: ['business'] })
    const deals = [deal(), deal({ cabin: 'business', cppConservative: 4.0 })]
    expect(matchWatch(w, deals, rankingCpp).map(d => d.cabin)).toEqual(['business'])
  })

  it('ranks by the provided rank function and caps at topN', () => {
    const w = createWatch(db, { ...input, topN: 2 })
    const deals = [
      deal({ cppRaw: 1.5, cppConservative: 1.5, miles: 40000 }),
      deal({ route: 'YYC-MBJ', cppRaw: 3.0, cppConservative: 3.0 }),
      deal({ route: 'YYC-PUJ', cabin: 'business', cppRaw: 9.9, cppConservative: 2.0 }),
    ]
    const got = matchWatch(w, deals, rankingCpp)
    // business ranks on conservative (2.0), so MBJ economy (3.0) wins
    expect(got.map(d => d.route)).toEqual(['YYC-MBJ', 'YYC-PUJ'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/watches.test.ts`
Expected: FAIL — `matchWatch` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/core/watches.ts` (add `AIRPORT_CITY, continentOf` to the regions import and `AIRPORT_THEMES` to the themes import):

```ts
export function matchWatch<T extends { route: string; date: string; cabin: string }>(
  watch: Watch, deals: T[], rank: (d: T) => number,
): T[] {
  return deals
    .filter(d => {
      const dest = d.route.split('-')[1]
      const country = AIRPORT_CITY[dest]?.country ?? ''
      if (d.date < watch.dateFrom || d.date > watch.dateTo) return false
      if (watch.excludeCountries.includes(country)) return false
      if (watch.includeContinents.length > 0 && !watch.includeContinents.includes(continentOf(country))) return false
      if (watch.themes.length > 0 && !watch.themes.some(t => (AIRPORT_THEMES[dest] ?? []).includes(t))) return false
      if (watch.cabins.length > 0 && !(watch.cabins as readonly string[]).includes(d.cabin)) return false
      return true
    })
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, watch.topN)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/watches.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/watches.ts tests/core/watches.test.ts
git commit -m "feat: watch matcher with window, region, theme, and cabin rules"
```

---

### Task 4: Scanner and digest integration

**Files:**
- Modify: `src/scanner/digest.ts`
- Modify: `src/scanner/run.ts`
- Test: `tests/scanner/digest.test.ts` (append), `tests/scanner/run.test.ts` (append)

**Interfaces:**
- Consumes: `listWatches`, `matchWatch`, `watchState`, `Watch` from `src/core/watches.js`; `rankingCpp` from `src/core/valuation.js`.
- Produces: `interface WatchResult { watch: Watch; deals: ScoredDeal[] }` exported from `src/scanner/digest.js`; `renderDigest(deals, cfg, errors = [], watchResults: WatchResult[] = [])` gains a 4th optional parameter (existing call sites unaffected).

- [ ] **Step 1: Write the failing digest tests**

`tests/scanner/digest.test.ts` already provides `cfg` (via `loadConfig`), a `deal(over)` helper, and a fresh in-memory `db` in `beforeEach` — use them. Extend the existing digest import to `import { selectAlerts, renderDigest, sendDigest, type WatchResult } from '../../src/scanner/digest.js'` and add `import { createWatch } from '../../src/core/watches.js'`. Then append:

```ts
describe('renderDigest watch sections', () => {
  const makeWatch = () => createWatch(db, {
    name: 'Post-Ramadan international',
    dateFrom: '2027-03-10', dateTo: '2027-04-15',
    excludeCountries: ['USA', 'Canada'], themes: ['beach'],
  })

  it('renders a section per watch with matching deals', () => {
    const match = deal({ route: 'YYC-CUN', date: '2027-03-20' })
    const watchResults: WatchResult[] = [{ watch: makeWatch(), deals: [match] }]
    const html = renderDigest([], cfg, [], watchResults)
    expect(html).toContain('Post-Ramadan international')
    expect(html).toContain('2027-03-10')
    expect(html).toContain('YYC-CUN')
  })

  it('renders a no-matches line for an empty watch', () => {
    const html = renderDigest([], cfg, [], [{ watch: makeWatch(), deals: [] }])
    expect(html).toContain('No deals in your window yet')
  })

  it('renders no watch block when there are no watches', () => {
    expect(renderDigest([deal()], cfg)).not.toContain('👀')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scanner/digest.test.ts`
Expected: FAIL — `WatchResult` not exported / sections missing.

- [ ] **Step 3: Implement digest rendering**

In `src/scanner/digest.ts`:

Add the import and type:

```ts
import type { Watch } from '../core/watches.js'

export interface WatchResult { watch: Watch; deals: ScoredDeal[] }
```

Extract the deal table (DRY — the main body and each watch section share it). Replace the table construction inside `renderDigest` with a helper placed next to `dealRow`:

```ts
const TABLE_HEADER = '<tr><th>Route</th><th>Date</th><th>Cabin</th><th>Program</th><th>Cost</th><th>Cash comp</th><th>Value</th><th>Availability</th></tr>'

function dealTable(deals: ScoredDeal[], cfg: Config): string {
  return `<table border="1" cellpadding="6" cellspacing="0">
        ${TABLE_HEADER}
        ${deals.map(d => dealRow(d, cfg)).join('\n')}</table>`
}

function watchSummary(w: Watch): string {
  const parts = [`${w.dateFrom} → ${w.dateTo}`]
  if (w.excludeCountries.length) parts.push(`excl. ${w.excludeCountries.join(', ')}`)
  if (w.includeContinents.length) parts.push(w.includeContinents.join(', '))
  if (w.themes.length) parts.push(w.themes.join('/'))
  if (w.cabins.length) parts.push(w.cabins.join('/'))
  return parts.join(' · ')
}
```

Replace `renderDigest` with:

```ts
export function renderDigest(
  deals: ScoredDeal[], cfg: Config, errors: string[] = [], watchResults: WatchResult[] = [],
): string {
  const errorBlock = errors.length
    ? `<h3>⚠️ Scan problems</h3><pre>${errors.join('\n')}</pre>`
    : ''
  const body = deals.length
    ? dealTable(deals, cfg)
    : '<p>No deals cleared the thresholds this scan.</p>'
  const watchBlock = watchResults.map(({ watch, deals: matches }) =>
    `<h3>👀 ${watch.name} <small style="color:#666">${watchSummary(watch)}</small></h3>` +
    (matches.length ? dealTable(matches, cfg) : '<p>No deals in your window yet.</p>')).join('\n')
  return `<h2>Flight Checks digest</h2>${body}
    ${watchBlock}
    <p style="color:#666">Ranked in cents per ${cfg.pointsProgram} point.</p>
    ${errorBlock}`
}
```

- [ ] **Step 4: Run digest tests**

Run: `npx vitest run tests/scanner/digest.test.ts`
Expected: PASS (new and pre-existing tests).

- [ ] **Step 5: Write the failing run tests**

Append to `tests/scanner/run.test.ts` (inside the existing describe block; `createWatch` and `putSetting` imports go at the top):

```ts
import { createWatch } from '../../src/core/watches.js'
```

```ts
  it('evaluates watches on full scans without recording watch alerts', async () => {
    const dbPath = `${process.env.TMPDIR ?? '/tmp'}/flight-checks-watch-${process.pid}.db`
    rmSync(dbPath, { force: true })
    const setup = openDb(dbPath)
    createWatch(setup, { name: 'UK spring', dateFrom: '2026-05-01', dateTo: '2026-09-30' })
    setup.close()
    const result = await runScan({ dryRun: true, env: { ...env, DB_PATH: dbPath } })
    expect(result.snapshots).toBe(3)
    const db = openDb(dbPath)
    // watch matches never land in the alerts table — only threshold alerts do
    expect((db.prepare('SELECT COUNT(*) AS n FROM alerts').get() as { n: number }).n).toBe(result.alerts)
  })

  it('sends the digest for an active watch even when nothing else alerts', async () => {
    const dbPath = `${process.env.TMPDIR ?? '/tmp'}/flight-checks-watch-only-${process.pid}.db`
    rmSync(dbPath, { force: true })
    const setup = openDb(dbPath)
    createWatch(setup, { name: 'Quiet window', dateFrom: '2030-01-01', dateTo: '2030-02-01' })
    // thresholds nobody clears -> no finalists, no alerts, watch has no matches
    putSetting(setup, 'thresholds.economy', '99')
    putSetting(setup, 'thresholds.premiumConservative', '99')
    setup.close()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const result = await runScan({ dryRun: true, env: { ...env, DB_PATH: dbPath } })
      expect(result.alerts).toBe(0)
      expect(log).toHaveBeenCalledWith('[dry-run] would email: 👀 Trip watch — no matches yet')
    } finally {
      log.mockRestore()
    }
  })
```

- [ ] **Step 6: Run tests to verify the new ones fail**

Run: `npx vitest run tests/scanner/run.test.ts`
Expected: the two new tests FAIL (no watch evaluation yet; second test sends no digest at all today).

- [ ] **Step 7: Implement scanner integration**

In `src/scanner/run.ts`:

Add imports:

```ts
import { rankingCpp } from '../core/valuation.js'
import { listWatches, matchWatch, watchState } from '../core/watches.js'
import { selectAlerts, renderDigest, sendDigest, type WatchResult } from './digest.js'  // extend existing import
```

Replace the block from `const alerts: ScoredDeal[] = []` through the end of `if (!opts.country) { ... }` with:

```ts
  const alerts: ScoredDeal[] = []
  if (!opts.country) {
    const watchData = listWatches(db)
    errors.push(...watchData.errors)
    const today = new Date().toISOString().slice(0, 10)
    const watchResults: WatchResult[] = watchData.watches
      .filter(w => watchState(w, today) === 'active')
      .map(w => ({ watch: w, deals: matchWatch(w, scored, rankingCpp) }))
    const watchMatches = watchResults.flatMap(r => r.deals)
    alerts.push(...selectAlerts(db, scored, cfg))
    if (alerts.length > 0 || errors.length > 0 || watchResults.length > 0) {
      if (!digestReady(cfg)) {
        console.log('[digest] skipped: email not configured or disabled')
      } else {
        const subject = alerts.length > 0
          ? `✈️ ${alerts.length} deal(s) — best ${Math.max(...alerts.map(a => a.cabin === 'economy' ? a.cppRaw : a.cppConservative)).toFixed(2)} ¢/pt`
          : watchMatches.length > 0
            ? `👀 Trip watch — best ${Math.max(...watchMatches.map(rankingCpp)).toFixed(2)} ¢/pt`
            : errors.length > 0
              ? '⚠️ Flight Checks scan had errors'
              : '👀 Trip watch — no matches yet'
        if (opts.dryRun) {
          console.log(`[dry-run] would email: ${subject}`)
        } else {
          const html = renderDigest(alerts, cfg, errors, watchResults)
          try { await sendDigest(cfg, subject, html) } catch (err) { errors.push(`email: ${err}`) }
        }
      }
      recordAlerts(db, scanId, alerts)
    }
  }
```

(Behavior notes the implementer must preserve: country-scoped scans never touch watches; `recordAlerts` receives only threshold alerts; the digest now also fires when at least one *active* watch exists — that is the user-chosen "top deals every scan" behavior.)

- [ ] **Step 8: Run the scanner tests**

Run: `npx vitest run tests/scanner/run.test.ts tests/scanner/digest.test.ts`
Expected: PASS, including all pre-existing tests (they seed no watches, so their digest behavior is unchanged).

- [ ] **Step 9: Commit**

```bash
git add src/scanner/digest.ts src/scanner/run.ts tests/scanner/digest.test.ts tests/scanner/run.test.ts
git commit -m "feat: evaluate trip watches each full scan and email per-watch top deals"
```

---

### Task 5: Watch API routes

**Files:**
- Modify: `src/server/app.ts`
- Test: `tests/server/app.test.ts` (append)

**Interfaces:**
- Consumes: everything Task 2/3 produces; existing `SnapshotRow`, `rankOf`, `destOf` in `app.ts`.
- Produces HTTP API:
  - `GET /api/watches` → `{ watches: Array<Watch & { state: WatchState }> }`
  - `POST /api/watches` (WatchInput body) → 201 `{ watch }` | 400 `{ error }`
  - `PUT /api/watches/:id` → `{ watch }` | 400 | 404
  - `DELETE /api/watches/:id` → `{ ok: true }` | 404
  - `GET /api/watches/:id/deals` → `{ watch, deals }` from the newest finished **full** scan | 404

- [ ] **Step 1: Write the failing tests**

Append to `tests/server/app.test.ts`:

```ts
const watchInput = {
  name: 'Post-Ramadan international',
  dateFrom: '2026-05-01', dateTo: '2026-09-30',
  excludeCountries: ['USA', 'Canada'], themes: ['city'],
}
const post = (path: string, body: unknown, method = 'POST') =>
  createApp(db).request(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('/api/watches', () => {
  it('creates, lists with state, updates, and deletes', async () => {
    const created = await post('/api/watches', watchInput)
    expect(created.status).toBe(201)
    const { watch } = await created.json()
    expect(['active', 'expired']).toContain(watch.state) // real clock; window spans mid-2026

    const list = await createApp(db).request('/api/watches')
    const { watches } = await list.json()
    expect(watches).toHaveLength(1)

    const updated = await post(`/api/watches/${watch.id}`, { ...watchInput, name: 'Renamed' }, 'PUT')
    expect(((await updated.json()) as { watch: { name: string } }).watch.name).toBe('Renamed')

    const gone = await createApp(db).request(`/api/watches/${watch.id}`, { method: 'DELETE' })
    expect(gone.status).toBe(200)
    expect((await (await createApp(db).request('/api/watches')).json()).watches).toHaveLength(0)
  })

  it('validates input', async () => {
    expect((await post('/api/watches', { ...watchInput, excludeCountries: ['Narnia'] })).status).toBe(400)
    expect((await post('/api/watches', { ...watchInput, name: '' })).status).toBe(400)
  })

  it('404s on unknown ids', async () => {
    expect((await post('/api/watches/999', watchInput, 'PUT')).status).toBe(404)
    expect((await createApp(db).request('/api/watches/999', { method: 'DELETE' })).status).toBe(404)
    expect((await createApp(db).request('/api/watches/999/deals')).status).toBe(404)
  })

  it('returns matching deals from the newest full scan', async () => {
    const s3 = startScan(db)
    insertSnapshots(db, s3, [
      deal({ route: 'YYC-CUN', date: '2026-06-01', cabin: 'economy', cppRaw: 2.0, cppConservative: 2.0 }),
      deal({ route: 'YYC-LHR', date: '2026-06-01' }),
      deal({ route: 'YYC-MIA', date: '2026-06-01' }),
    ])
    finishScan(db, s3, stats)
    const { watch } = await (await post('/api/watches', { ...watchInput, themes: ['beach'] })).json()
    const res = await createApp(db).request(`/api/watches/${watch.id}/deals`)
    const { deals } = await res.json()
    expect(deals.map((d: { route: string }) => d.route)).toEqual(['YYC-CUN'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/server/app.test.ts`
Expected: new describe FAILs with 404s (routes don't exist).

- [ ] **Step 3: Implement the routes**

In `src/server/app.ts`, add the import:

```ts
import {
  createWatch, deleteWatch, getWatch, listWatches, matchWatch, updateWatch,
  validateWatchInput, watchState, type WatchInput,
} from '../core/watches.js'
```

Add a helper next to `rankOf`/`destOf`:

```ts
const todayIso = (): string => new Date().toISOString().slice(0, 10)
```

Add the routes inside `createApp`, after the `/api/shortlist` route:

```ts
  app.get('/api/watches', c => {
    const { watches } = listWatches(db)
    return c.json({ watches: watches.map(w => ({ ...w, state: watchState(w, todayIso()) })) })
  })

  app.post('/api/watches', async c => {
    const body = await c.req.json().catch(() => null)
    const err = validateWatchInput(body)
    if (err) return c.json({ error: err }, 400)
    const watch = createWatch(db, body as WatchInput)
    return c.json({ watch: { ...watch, state: watchState(watch, todayIso()) } }, 201)
  })

  app.put('/api/watches/:id', async c => {
    const body = await c.req.json().catch(() => null)
    const err = validateWatchInput(body)
    if (err) return c.json({ error: err }, 400)
    const watch = updateWatch(db, Number(c.req.param('id')), body as WatchInput)
    if (!watch) return c.json({ error: 'watch not found' }, 404)
    return c.json({ watch: { ...watch, state: watchState(watch, todayIso()) } })
  })

  app.delete('/api/watches/:id', c => {
    if (!deleteWatch(db, Number(c.req.param('id')))) return c.json({ error: 'watch not found' }, 404)
    return c.json({ ok: true })
  })

  app.get('/api/watches/:id/deals', c => {
    const watch = getWatch(db, Number(c.req.param('id')))
    if (!watch) return c.json({ error: 'watch not found' }, 404)
    const latest = db.prepare(
      "SELECT id FROM scans WHERE finished_at IS NOT NULL AND scope = 'full' ORDER BY id DESC LIMIT 1",
    ).get() as { id: number } | undefined
    const rows = latest
      ? db.prepare('SELECT * FROM snapshots WHERE scan_id = ?').all(latest.id) as SnapshotRow[]
      : []
    return c.json({
      watch: { ...watch, state: watchState(watch, todayIso()) },
      deals: matchWatch(watch, rows, rankOf),
    })
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/server/app.test.ts`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: Commit**

```bash
git add src/server/app.ts tests/server/app.test.ts
git commit -m "feat: watch CRUD API and per-watch deal view"
```

---

### Task 6: Dashboard Watches tab

**Files:**
- Modify: `src/web/api.ts` (append)
- Create: `src/web/WatchesTab.tsx`
- Modify: `src/web/App.tsx`

No web test harness exists; verification is `npx tsc --noEmit` + `npm run build`.

- [ ] **Step 1: Add API client functions**

Append to `src/web/api.ts`:

```ts
export interface WatchRow {
  id: number; name: string; enabled: boolean; dateFrom: string; dateTo: string
  excludeCountries: string[]; includeContinents: string[]; themes: string[]; cabins: string[]
  topN: number; createdAt: string; state: 'active' | 'expired' | 'disabled'
}
export interface WatchInput {
  name: string; enabled: boolean; dateFrom: string; dateTo: string
  excludeCountries: string[]; includeContinents: string[]; themes: string[]; cabins: string[]
  topN: number
}
export const fetchWatches = () => get<{ watches: WatchRow[] }>('/api/watches').then(r => r.watches)
export const fetchWatchDeals = (id: number) =>
  get<{ deals: DealRow[] }>(`/api/watches/${id}/deals`).then(r => r.deals)
export const createWatchApi = (w: WatchInput) => send('/api/watches', 'POST', w)
export const updateWatchApi = (id: number, w: WatchInput) => send(`/api/watches/${id}`, 'PUT', w)
export const deleteWatchApi = (id: number) => send(`/api/watches/${id}`, 'DELETE', {})
```

- [ ] **Step 2: Create the Watches tab component**

Create `src/web/WatchesTab.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import {
  createWatchApi, deleteWatchApi, fetchWatchDeals, fetchWatches, updateWatchApi,
  type DealRow, type Meta, type WatchInput, type WatchRow,
} from './api.js'
import { airportLabel } from '../core/regions.js'
import { THEMES } from '../core/themes.js'

const CABINS = ['economy', 'premium', 'business', 'first']
const asError = (error: unknown) => error instanceof Error ? error : new Error(String(error))

const emptyForm: WatchInput = {
  name: '', enabled: true, dateFrom: '', dateTo: '',
  excludeCountries: [], includeContinents: [], themes: [], cabins: [], topN: 5,
}

const toggleItem = (list: string[], item: string): string[] =>
  list.includes(item) ? list.filter(x => x !== item) : [...list, item]

const toInput = (w: WatchRow): WatchInput => ({
  name: w.name, enabled: w.enabled, dateFrom: w.dateFrom, dateTo: w.dateTo,
  excludeCountries: w.excludeCountries, includeContinents: w.includeContinents,
  themes: w.themes, cabins: w.cabins, topN: w.topN,
})

const watchSummary = (w: WatchRow): string => [
  `${w.dateFrom} → ${w.dateTo}`,
  w.excludeCountries.length ? `excl. ${w.excludeCountries.join(', ')}` : '',
  w.includeContinents.join(', '),
  w.themes.join('/'),
  w.cabins.join('/'),
].filter(Boolean).join(' · ')

export function WatchesTab({ meta, onError }: { meta: Meta; onError: (error: Error) => void }) {
  const [watches, setWatches] = useState<WatchRow[]>([])
  const [form, setForm] = useState<WatchInput>(emptyForm)
  const [editing, setEditing] = useState<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [deals, setDeals] = useState<DealRow[]>([])

  const load = useCallback(async () => {
    try { setWatches(await fetchWatches()) } catch (error) { onError(asError(error)) }
  }, [onError])
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (selected === null) { setDeals([]); return }
    fetchWatchDeals(selected).then(setDeals).catch(error => onError(asError(error)))
  }, [selected, onError])

  const submit = async () => {
    try {
      if (editing === null) await createWatchApi(form)
      else await updateWatchApi(editing, form)
      setForm(emptyForm)
      setEditing(null)
      await load()
    } catch (error) { onError(asError(error)) }
  }

  const toggleEnabled = async (w: WatchRow) => {
    try {
      await updateWatchApi(w.id, { ...toInput(w), enabled: !w.enabled })
      await load()
    } catch (error) { onError(asError(error)) }
  }

  const remove = async (id: number) => {
    try {
      await deleteWatchApi(id)
      if (selected === id) setSelected(null)
      if (editing === id) { setEditing(null); setForm(emptyForm) }
      await load()
    } catch (error) { onError(asError(error)) }
  }

  const selectedWatch = watches.find(w => w.id === selected)

  return (
    <div className="overflow">
      <table>
        <thead>
          <tr><th>Watch</th><th>Rules</th><th>State</th><th>Top</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {watches.map(w => (
            <tr key={w.id} className={w.state !== 'active' ? 'dimmed' : ''}>
              <td>
                <a href="#watch" onClick={event => { event.preventDefault(); setSelected(w.id) }}>{w.name}</a>
              </td>
              <td>{watchSummary(w)}</td>
              <td>{w.state}</td>
              <td>{w.topN}</td>
              <td>
                <button className="small" onClick={() => void toggleEnabled(w)}>
                  {w.enabled ? 'Disable' : 'Enable'}
                </button>{' '}
                <button className="small" onClick={() => { setEditing(w.id); setForm(toInput(w)) }}>Edit</button>{' '}
                <button className="small" onClick={() => void remove(w.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {watches.length === 0 && <p>No watches yet — create one below.</p>}

      <section className="settings-group">
        <h2>{editing === null ? 'New watch' : `Edit: ${form.name || 'watch'}`}</h2>
        <div className="settings-row">
          <label htmlFor="watch-name">Name</label>
          <input id="watch-name" value={form.name}
            onChange={event => setForm(current => ({ ...current, name: event.target.value }))} />
        </div>
        <div className="settings-row">
          <label htmlFor="watch-from">Travel window</label>
          <input id="watch-from" type="date" value={form.dateFrom}
            onChange={event => setForm(current => ({ ...current, dateFrom: event.target.value }))} />
          <input type="date" value={form.dateTo}
            onChange={event => setForm(current => ({ ...current, dateTo: event.target.value }))} />
        </div>
        <div className="settings-row">
          <label>Exclude countries</label>
          <select multiple size={6} value={form.excludeCountries}
            onChange={event => setForm(current => ({
              ...current,
              excludeCountries: [...event.target.selectedOptions].map(o => o.value),
            }))}>
            {meta.countries.map(country => <option key={country} value={country}>{country}</option>)}
          </select>
        </div>
        <div className="settings-row">
          <label>Continents (empty = anywhere)</label>
          <select multiple size={6} value={form.includeContinents}
            onChange={event => setForm(current => ({
              ...current,
              includeContinents: [...event.target.selectedOptions].map(o => o.value),
            }))}>
            {meta.continents.map(continent => <option key={continent} value={continent}>{continent}</option>)}
          </select>
        </div>
        <div className="settings-row">
          <label>Vibe (empty = any)</label>
          <span>
            {THEMES.map(theme => (
              <label key={theme} style={{ marginRight: '1em' }}>
                <input type="checkbox" checked={form.themes.includes(theme)}
                  onChange={() => setForm(current => ({ ...current, themes: toggleItem(current.themes, theme) }))} />
                {' '}{theme}
              </label>
            ))}
          </span>
        </div>
        <div className="settings-row">
          <label>Cabins (empty = all)</label>
          <span>
            {CABINS.map(cabin => (
              <label key={cabin} style={{ marginRight: '1em' }}>
                <input type="checkbox" checked={form.cabins.includes(cabin)}
                  onChange={() => setForm(current => ({ ...current, cabins: toggleItem(current.cabins, cabin) }))} />
                {' '}{cabin}
              </label>
            ))}
          </span>
        </div>
        <div className="settings-row">
          <label htmlFor="watch-topn">Top deals per digest</label>
          <input id="watch-topn" type="number" min={1} value={form.topN}
            onChange={event => setForm(current => ({ ...current, topN: Number(event.target.value) }))} />
        </div>
        <button onClick={() => void submit()}>{editing === null ? 'Create watch' : 'Save changes'}</button>
        {editing !== null && (
          <button onClick={() => { setEditing(null); setForm(emptyForm) }}>Cancel</button>
        )}
      </section>

      {selectedWatch && (
        <section>
          <h2>👀 {selectedWatch.name} — current matches</h2>
          <table>
            <thead>
              <tr>
                <th>Route</th><th>Destination</th><th>Date</th><th>Cabin</th><th>Program</th>
                <th>MR points</th><th>Taxes</th><th>¢/pt</th><th>Seats</th>
              </tr>
            </thead>
            <tbody>
              {deals.map(d => {
                const cpp = d.cabin === 'economy' ? d.cpp_raw : d.cpp_conservative
                return (
                  <tr key={d.id}>
                    <td>{d.route}</td><td>{airportLabel(d.route.split('-')[1])}</td><td>{d.date}</td>
                    <td>{d.cabin}</td><td>{d.program}</td><td>{d.mr_points.toLocaleString()}</td>
                    <td>${d.taxes_cad.toFixed(0)}</td>
                    <td className="value">{cpp.toFixed(2)}</td>
                    <td>{d.seats}{d.direct ? ' · direct' : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {deals.length === 0 && <p>No deals in this window yet.</p>}
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Wire the tab into App.tsx**

In `src/web/App.tsx`:

1. Add the import after the `Wizard` import:

```ts
import { WatchesTab } from './WatchesTab.js'
```

2. Change the `Tab` type:

```ts
type Tab = 'deals' | 'watches' | 'shortlist' | 'history' | 'runs' | 'settings'
```

3. In the `<nav>` array literal, change to:

```ts
{(['deals', 'watches', 'shortlist', 'history', 'runs', 'settings'] as Tab[]).map(currentTab => (
```

4. Add the tab render after the deals tab:

```tsx
{tab === 'watches' && <WatchesTab meta={meta} onError={onError} />}
```

- [ ] **Step 4: Verify types and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: Vite build succeeds.

Run: `npx vitest run`
Expected: full suite PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/api.ts src/web/WatchesTab.tsx src/web/App.tsx
git commit -m "feat: dashboard watches tab with CRUD and live match view"
```

---

### Task 7: Docs and final verification

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Update CLAUDE.md**

In the Architecture paragraph, change

> the server owns `settings`/`deal_status`

to

> the server owns `settings`/`deal_status`/`watches`

and append this sentence to the end of that paragraph:

> Trip watches are server-owned rows the scanner evaluates on full scans: each active watch filters the scan's scored deals by travel window, country exclusions, continents, themes, and cabins, and its top-N appears in the digest without recording alerts.

- [ ] **Step 2: Update README.md**

In "How it works", update the `src/web/` bullet (line ~46) to mention the tab:

> - `src/web/` is the React and Vite dashboard, with continent, country, month, and cabin filters, per-deal history, and a Watches tab for trip watches (travel window + destination rules + beach/city/nature themes) that each full scan reports on in the digest.

- [ ] **Step 3: Full verification**

Run each and confirm output:

```bash
npx vitest run          # all tests pass
npx tsc --noEmit        # no type errors
npm run scan -- --dry-run   # pipeline runs from fixtures, exit 0
npm run build           # dashboard builds
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: trip watches in architecture notes and README"
```

---

## After the plan (operational, not part of this repo work)

Once merged and deployed, create the first watch as data via the dashboard (or `POST /api/watches`):

```json
{
  "name": "Post-Ramadan international", "enabled": true,
  "dateFrom": "2027-03-10", "dateTo": "2027-04-15",
  "excludeCountries": ["USA", "Canada"], "includeContinents": [],
  "themes": ["beach"], "cabins": [], "topN": 5
}
```

Test on staging LXC 116 (docker compose) before production LXC 113 (`./deploy/deploy.sh`).
