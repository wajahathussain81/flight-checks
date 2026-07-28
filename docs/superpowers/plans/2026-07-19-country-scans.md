# Country-Scoped Scans + Continent Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the standing execution mode is orchestrating-codex-workers (Claude orchestrates, Codex implements, one dispatch per task).

**Goal:** From the Deals tab, pick a continent or country, and refresh a single country's availability on demand with a fast scoped scan — without polluting the digest/alert pipeline.

**Architecture:** Scans gain a `scope` column (`'full'` or a country name). Scoped scans query seats.aero for only that country's airports, write snapshots, and **skip the digest and alert recording entirely** (so a country peek never marks deals as already-alerted). `/api/deals` picks the newest finished scan whose scope is `'full'` or matches the requested country. A static `COUNTRY_CONTINENT` map powers a continent filter in the API and UI. Scoped scans run as a spawned `tsx` process (args don't fit the fixed systemd unit); full manual scans keep going through systemd.

**Tech Stack:** unchanged.

## Global Constraints

- `npx vitest run` + `npx tsc --noEmit` green at every task boundary (plus `npm run build` for UI work).
- No live network/SMTP in tests; inject fakes.
- Scoped scans: snapshots only — no digest email, no alert rows.
- Continent bucket names (exact): `North America`, `Caribbean & Central America`, `South America`, `Europe`, `Asia & Middle East`, `Oceania`.

---

### Task 1: Core + scanner — scope column, continent map, scoped fetch/run

**Files:**
- Modify: `src/core/regions.ts`, `src/core/db.ts`, `src/scanner/seatsaero.ts`, `src/scanner/run.ts`, `src/scanner/index.ts`
- Test: `tests/core/regions.test.ts` (extend or create), `tests/core/db.test.ts`, `tests/scanner/run.test.ts`, `tests/scanner/seatsaero.test.ts` (extend)

**Interfaces produced (later tasks import these exact names):**
- `COUNTRY_CONTINENT: Record<string, string>` and `continentOf(country: string): string` from `src/core/regions.js`
- `startScan(db: DB, scope?: string): number` (default `'full'`)
- `fetchAvailability(cfg: Config, fetchFn?: typeof fetch, country?: string)`
- `runScan(opts: { dryRun?: boolean; env?: ...; country?: string })`
- CLI: `npx tsx src/scanner/index.ts --country "Japan"`

- [ ] **Step 1: Failing tests.**

`tests/core/regions.test.ts` — add:

```ts
import { AIRPORT_CITY, COUNTRY_CONTINENT, continentOf } from '../../src/core/regions.js'

describe('COUNTRY_CONTINENT', () => {
  it('maps every airport country to a continent', () => {
    for (const { country } of Object.values(AIRPORT_CITY)) {
      expect(COUNTRY_CONTINENT[country], `missing continent for ${country}`).toBeTruthy()
    }
  })
  it('falls back to Other for unknown countries', () => {
    expect(continentOf('Atlantis')).toBe('Other')
    expect(continentOf('Japan')).toBe('Asia & Middle East')
  })
})
```

`tests/core/db.test.ts` — add inside/alongside existing describes:

```ts
describe('scan scope', () => {
  it('defaults to full and records country scopes', () => {
    const a = startScan(db)
    const b = startScan(db, 'Japan')
    const rows = db.prepare('SELECT id, scope FROM scans ORDER BY id').all() as Array<{ id: number; scope: string }>
    expect(rows.find(r => r.id === a)?.scope).toBe('full')
    expect(rows.find(r => r.id === b)?.scope).toBe('Japan')
  })
  it('migrates an existing scans table without the scope column', () => {
    const path = `${process.env.TMPDIR ?? '/tmp'}/flight-checks-migrate-${process.pid}.db`
    rmSync(path, { force: true })
    const raw = new Database(path)
    raw.exec(`CREATE TABLE scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, finished_at TEXT,
      rows_pulled INTEGER NOT NULL DEFAULT 0, finalists INTEGER NOT NULL DEFAULT 0, errors TEXT NOT NULL DEFAULT '')`)
    raw.prepare('INSERT INTO scans (started_at) VALUES (?)').run('2026-01-01T00:00:00Z')
    raw.close()
    const migrated = openDb(path)
    const row = migrated.prepare('SELECT scope FROM scans').get() as { scope: string }
    expect(row.scope).toBe('full')
    migrated.close()
    rmSync(path, { force: true })
  })
})
```

(imports: `import Database from 'better-sqlite3'` and `import { rmSync } from 'node:fs'`.)

`tests/scanner/run.test.ts` — add:

```ts
  it('scopes a scan to one country: snapshots only, no alerts', async () => {
    const dbPath = `${process.env.TMPDIR ?? '/tmp'}/flight-checks-scoped-${process.pid}.db`
    rmSync(dbPath, { force: true })
    const result = await runScan({ dryRun: true, country: 'UK', env: { ...env, DB_PATH: dbPath } })
    // fixture has 3 UK rows; the 120k-mile one fails prefilter -> 2 snapshots; digest skipped -> 0 alerts
    expect(result.snapshots).toBe(2)
    expect(result.alerts).toBe(0)
    const db = openDb(dbPath)
    expect((db.prepare('SELECT scope FROM scans ORDER BY id DESC LIMIT 1').get() as { scope: string }).scope).toBe('UK')
    expect((db.prepare('SELECT COUNT(*) AS n FROM alerts').get() as { n: number }).n).toBe(0)
    const routes = db.prepare('SELECT DISTINCT route FROM snapshots').all() as Array<{ route: string }>
    expect(routes.every(r => r.route === 'YYC-LHR')).toBe(true)
  })
```

`tests/scanner/seatsaero.test.ts` — add (mirroring the existing fake-fetch URL-capture pattern in that file):

```ts
  it('limits destinations to the requested country', async () => {
    let captured = ''
    const fake: typeof fetch = async url => {
      captured = String(url)
      return new Response(JSON.stringify({ data: [], hasMore: false }), { status: 200 })
    }
    await fetchAvailability(cfg, fake, 'Japan')
    const dests = new URL(captured).searchParams.get('destination_airport')
    expect(dests).toBe('NRT,HND,KIX')
  })
```

- [ ] **Step 2: Run to verify failures** — `npx vitest run tests/core/regions.test.ts tests/core/db.test.ts tests/scanner/run.test.ts tests/scanner/seatsaero.test.ts`.

- [ ] **Step 3: Implement.**

`src/core/regions.ts` — append:

```ts
export const COUNTRY_CONTINENT: Record<string, string> = {
  Canada: 'North America', USA: 'North America',
  Mexico: 'Caribbean & Central America', Panama: 'Caribbean & Central America',
  'Costa Rica': 'Caribbean & Central America', Jamaica: 'Caribbean & Central America',
  'Dominican Republic': 'Caribbean & Central America', Bahamas: 'Caribbean & Central America',
  Barbados: 'Caribbean & Central America',
  Brazil: 'South America', Argentina: 'South America', Chile: 'South America',
  Peru: 'South America', Colombia: 'South America',
  UK: 'Europe', France: 'Europe', Netherlands: 'Europe', Germany: 'Europe',
  Switzerland: 'Europe', Austria: 'Europe', Denmark: 'Europe', Sweden: 'Europe',
  Norway: 'Europe', Finland: 'Europe', Ireland: 'Europe', Spain: 'Europe',
  Portugal: 'Europe', Italy: 'Europe', Greece: 'Europe', Turkey: 'Europe',
  Poland: 'Europe', Czechia: 'Europe', Belgium: 'Europe', Iceland: 'Europe',
  Japan: 'Asia & Middle East', 'South Korea': 'Asia & Middle East', China: 'Asia & Middle East',
  'Hong Kong': 'Asia & Middle East', Taiwan: 'Asia & Middle East', Thailand: 'Asia & Middle East',
  Singapore: 'Asia & Middle East', Malaysia: 'Asia & Middle East', Indonesia: 'Asia & Middle East',
  Philippines: 'Asia & Middle East', Vietnam: 'Asia & Middle East', India: 'Asia & Middle East',
  UAE: 'Asia & Middle East', Qatar: 'Asia & Middle East', Israel: 'Asia & Middle East',
  Australia: 'Oceania', 'New Zealand': 'Oceania', Fiji: 'Oceania', 'French Polynesia': 'Oceania',
}

export function continentOf(country: string): string {
  return COUNTRY_CONTINENT[country] ?? 'Other'
}
```

`src/core/db.ts` — in `SCHEMA`, the scans table becomes:

```sql
CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  rows_pulled INTEGER NOT NULL DEFAULT 0,
  finalists INTEGER NOT NULL DEFAULT 0,
  errors TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT 'full'
);
```

In `openDb`, after `db.exec(SCHEMA)`:

```ts
  const scanCols = db.prepare('PRAGMA table_info(scans)').all() as Array<{ name: string }>
  if (!scanCols.some(c => c.name === 'scope')) {
    db.exec("ALTER TABLE scans ADD COLUMN scope TEXT NOT NULL DEFAULT 'full'")
  }
```

`startScan` becomes:

```ts
export function startScan(db: DB, scope = 'full'): number {
  const r = db.prepare('INSERT INTO scans (started_at, scope) VALUES (?, ?)').run(new Date().toISOString(), scope)
  return Number(r.lastInsertRowid)
}
```

`src/scanner/seatsaero.ts` — `fetchAvailability(cfg: Config, fetchFn: typeof fetch = fetch, country?: string)`; the destination filter becomes:

```ts
  const destinations = Object.keys(AIRPORT_REGION)
    .filter(a => a !== cfg.origin && AIRPORT_CITY[a]?.country !== 'Canada')
    .filter(a => !country || AIRPORT_CITY[a]?.country === country)
    .join(',')
```

`src/scanner/run.ts` — `runScan(opts: { dryRun?: boolean; env?: Record<string, string | undefined>; country?: string } = {})`:
- `const scanId = startScan(db, opts.country ?? 'full')`
- import `AIRPORT_CITY` from `../core/regions.js`; after loading rows (both dry-run fixture and live), when `opts.country` is set: `rows = rows.filter(r => AIRPORT_CITY[r.route.split('-')[1]]?.country === opts.country)` (live fetch already scopes at the API level via `fetchAvailability(cfg, fetch, opts.country)` — pass the country through; the filter is a cheap invariant either way).
- Wrap the entire digest/alert block (`selectAlerts` … `recordAlerts`) in `if (!opts.country) { ... }`; for scoped scans set `const alerts: ScoredDeal[] = []`. `finishScan` unchanged.

`src/scanner/index.ts`:

```ts
import { runScan } from './run.js'

const dryRun = process.argv.includes('--dry-run')
const countryIdx = process.argv.indexOf('--country')
const country = countryIdx >= 0 ? process.argv[countryIdx + 1] : undefined
runScan({ dryRun, country }).then(r => {
  console.log(`scan ${r.scanId}: ${r.snapshots} snapshots, ${r.alerts} alerts, ${r.errors.length} errors`)
  if (r.errors.length) { console.error(r.errors.join('\n')); process.exitCode = 1 }
})
```

- [ ] **Step 4: Verify** — `npx vitest run` all pass; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** — `git add -A src tests && git commit -m "feat: country-scoped scans and continent map in core/scanner"`

---

### Task 2: Server — scan-scope-aware deals, continent filter, scoped scan trigger

**Files:**
- Modify: `src/server/app.ts`, `src/server/index.ts`
- Test: `tests/server/app.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1 (`COUNTRY_CONTINENT`, `continentOf`, `startScan(db, scope)`).
- Produces: `createApp(db, opts?: { startScan?: (country?: string) => void; env?: ... })`; `/api/deals` honors `continent` and country-scoped scans; `/api/meta` gains `continents: string[]` and `countryContinents: Record<string, string>`; `POST /api/scan` accepts optional JSON body `{ country }` (400 on unknown country).

- [ ] **Step 1: Failing tests** — append to `tests/server/app.test.ts`:

```ts
describe('scoped scans and continents', () => {
  it('uses a newer country-scoped scan only for that country', () => {
    // beforeEach seeded a finished full scan with YYC-LHR deals.
    const scoped = startScan(db, 'UK')
    insertSnapshots(db, scoped, [{ ...deal(), cppConservative: 9.99 }])
    finishScan(db, scoped, { rowsPulled: 1, finalists: 1, errors: [] })
    return (async () => {
      const uk = await (await createApp(db).request('/api/deals?country=UK')).json()
      expect(uk.deals[0].cpp_conservative).toBe(9.99)
      const all = await (await createApp(db).request('/api/deals')).json()
      expect(all.deals.every((d: { cpp_conservative: number }) => d.cpp_conservative !== 9.99)).toBe(true)
    })()
  })
  it('filters by continent and exposes continent meta', async () => {
    const eu = await (await createApp(db).request('/api/deals?continent=Europe')).json()
    expect(eu.deals.length).toBeGreaterThan(0)
    const asia = await (await createApp(db).request('/api/deals?continent=Asia %26 Middle East')).json()
    expect(asia.deals).toHaveLength(0)
    const meta = await (await createApp(db, { env: ENV }).request('/api/meta')).json()
    expect(meta.continents).toContain('Europe')
    expect(meta.countryContinents['Japan']).toBe('Asia & Middle East')
  })
  it('passes a country to startScan and rejects unknown countries', async () => {
    const calls: Array<string | undefined> = []
    const app = createApp(db, { startScan: c => { calls.push(c) } })
    expect((await app.request('/api/scan', { method: 'POST' })).status).toBe(200)
    expect((await app.request('/api/scan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'Japan' }),
    })).status).toBe(200)
    expect(calls).toEqual([undefined, 'Japan'])
    expect((await app.request('/api/scan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'Atlantis' }),
    })).status).toBe(400)
  })
})
```

(extend the db import with `insertSnapshots, finishScan` if missing; note the URL-encoded `%26` for the ampersand in the continent query. If the existing `deal()` fixture shape differs from `ScoredDeal`, adapt the scoped-scan seeding to the fixture actually used by `insertSnapshots` in the existing beforeEach — report as deviation.)

- [ ] **Step 2: Run to verify failures.**

- [ ] **Step 3: Implement.** In `src/server/app.ts`:
- Extend the import from regions: `import { AIRPORT_CITY, airportLabel, COUNTRY_CONTINENT, continentOf } from '../core/regions.js'`.
- opts type becomes `{ startScan?: (country?: string) => void; env?: Record<string, string | undefined> }`.
- `/api/deals`: replace the `latest` query with:

```ts
    const latest = db.prepare(
      "SELECT id FROM scans WHERE finished_at IS NOT NULL AND (scope = 'full' OR scope = ?) ORDER BY id DESC LIMIT 1",
    ).get(q.country ?? '') as { id: number } | undefined
```

and after the country filter add:

```ts
    if (q.continent) rows = rows.filter(d => continentOf(AIRPORT_CITY[destOf(d.route)]?.country ?? '') === q.continent)
```

- `/api/meta` becomes:

```ts
  app.get('/api/meta', c => {
    const countries = [...new Set(Object.values(AIRPORT_CITY).map(i => i.country))].sort()
    const continents = [...new Set(countries.map(continentOf))].sort()
    const countryContinents = Object.fromEntries(countries.map(cn => [cn, continentOf(cn)]))
    return c.json({ countries, continents, countryContinents, mrBalance: loadEffectiveConfig(db, env).mrBalance })
  })
```

- `POST /api/scan` becomes async; parse the optional body before the running-scan guard:

```ts
  app.post('/api/scan', async c => {
    const body = await c.req.json().catch(() => null) as { country?: string } | null
    const country = body?.country
    if (country && !(country in COUNTRY_CONTINENT)) return c.json({ error: `unknown country: ${country}` }, 400)
    const open = db.prepare('SELECT started_at FROM scans WHERE finished_at IS NULL ORDER BY id DESC LIMIT 1')
      .get() as { started_at: string } | undefined
    if (open && Date.now() - Date.parse(open.started_at) < 30 * 60_000) {
      return c.json({ error: 'a scan is already running' }, 409)
    }
    opts.startScan?.(country)
    return c.json({ started: true })
  })
```

In `src/server/index.ts`, `startScan` becomes:

```ts
const startScan = (country?: string): void => {
  if (country) {
    execFile('npx', ['tsx', 'src/scanner/index.ts', '--country', country])
    return
  }
  execFile('systemctl', ['start', '--no-block', 'flight-checks-scan.service'], err => {
    if (err) execFile('npx', ['tsx', 'src/scanner/index.ts'])
  })
}
```

- [ ] **Step 4: Verify** — `npx vitest run` all pass; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** — `git add src/server tests/server && git commit -m "feat: continent filter, scoped-scan-aware deals, and country scan trigger API"`

---

### Task 3: Web UI — continent dropdown + Scan-country button

**Files:**
- Modify: `src/web/api.ts`, `src/web/App.tsx`
- Gate: `npm run build` + `npx tsc --noEmit` + `npx vitest run`.

- [ ] **Step 1: `src/web/api.ts`** — `Meta` gains `continents: string[]; countryContinents: Record<string, string>`. `ScanRow` gains `scope: string`. `DealQuery` gains `continent?: string`; `fetchDealsFiltered` sets `p.set('continent', f.continent)` when present. `triggerScan` gains an optional country:

```ts
export const triggerScan = async (country?: string): Promise<void> => {
  const res = await fetch('/api/scan', {
    method: 'POST',
    ...(country ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country }) } : {}),
  })
  if (!res.ok) throw new Error((await res.json() as { error: string }).error)
}
```

- [ ] **Step 2: `src/web/App.tsx`** —
  - `DealsTab` receives `meta` (full `Meta`) instead of just `countries`. Filter state gains `continent: ''`. A continent `<select>` renders before the country one (options from `meta.continents`); when a continent is chosen, the country dropdown lists only `meta.countries.filter(c => meta.countryContinents[c] === continent)`, and if the currently selected country is not in the chosen continent it resets to `''`. `continent` is passed in `fetchDealsFiltered`.
  - When `filters.country` is set, render a `Scan {country}` button (className `small`) at the end of the filter bar: on click `triggerScan(filters.country)` then poll `fetchScans()` every 5 s until the newest scan has `finished_at !== null` (or 20 polls), then refetch deals; label `Scanning…` and disabled while polling; errors to `onError`. Reuse the RunsTab polling approach (local `scanning` state + effect).
  - `RunsTab` table gains a `Scope` column rendering `scan.scope`.
- [ ] **Step 3: Verify** — `npm run build`, `npx tsc --noEmit`, `npx vitest run` all green.
- [ ] **Step 4: Commit** — `git add src/web && git commit -m "feat: continent filter and per-country scan button in dashboard"`

---

### Task 4: Deploy + live verification (orchestrator-only — never Codex)

- [ ] `./deploy/deploy.sh`
- [ ] `/api/meta` shows continents + countryContinents.
- [ ] `POST /api/scan {"country":"Japan"}` → 200; scans row appears with `scope='Japan'`, finishes in seconds, snapshots all YYC-NRT/HND/KIX; **no new digest email, no new alert rows**.
- [ ] `/api/deals?country=Japan` served from the scoped scan; `/api/deals` still served from the last full scan; `/api/deals?continent=Europe` returns only European routes.
- [ ] Update CLAUDE.md (scoped scans + continent filter) and commit.
