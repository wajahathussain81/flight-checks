# Dashboard App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the standing execution mode is orchestrating-codex-workers (Claude orchestrates, Codex implements, one dispatch per task).

**Goal:** Turn the read-only dashboard into the primary flight-checks interface: filter/sort/search deals, save/dismiss with notes, trigger and monitor scans, and edit settings — all from the browser.

**Architecture:** Approach A from the spec (`docs/superpowers/specs/2026-07-19-dashboard-app-design.md`). Scanner keeps ownership of `scans`/`snapshots`/`alerts`; the server additionally owns new `settings` and `deal_status` tables; both read everything. Settings overlay env defaults via `loadEffectiveConfig(db, env)`. Scan triggering shells out to systemd so manual and timed scans share one unit.

**Tech Stack:** unchanged — TypeScript ESM strict, better-sqlite3, Hono, React 18 + Vite, vitest, tsx (no backend build).

## Global Constraints

- All existing tests keep passing at every task boundary; `npx vitest run` + `npx tsc --noEmit` are the gate for every task.
- No live network or SMTP in tests; inject fakes (fetch, mail transport, exec).
- `dbPath` stays env-only (never a UI setting — config bootstrap reads it before the DB exists).
- Settings whitelist (exact keys): `thresholds.economy`, `thresholds.premiumConservative`, `minValue.economy`, `minValue.premium`, `maxPerRoute`, `mrBalance`, `alertImprovement`, `digestTo`.
- Crashed scans must not wedge the scan trigger: a scan counts as "running" only if `finished_at IS NULL` **and** `started_at` is within the last 30 minutes.
- API errors: 400 invalid input, 409 scan already running, message in `{ error }`.

---

### Task 1: DB layer — settings + deal_status tables and helpers

**Files:**
- Modify: `src/core/db.ts`
- Test: `tests/core/db.test.ts` (extend)

**Interfaces:**
- Consumes: existing `openDb`, `alertKey`.
- Produces (later tasks import these exact names from `src/core/db.js`):
  - `getSettings(db: DB): Record<string, string>`
  - `putSetting(db: DB, key: string, value: string): void`
  - `deleteSetting(db: DB, key: string): void`
  - `setDealStatus(db: DB, alertKey: string, status: 'saved' | 'dismissed' | null, note?: string): void` — null deletes the row
  - `getDealStatuses(db: DB): Map<string, { status: 'saved' | 'dismissed'; note: string }>`

- [ ] **Step 1: Write the failing tests** — append to `tests/core/db.test.ts` (add `getSettings, putSetting, deleteSetting, setDealStatus, getDealStatuses` to the existing import from `../../src/core/db.js`):

```ts
describe('settings table', () => {
  it('round-trips, upserts, and deletes', () => {
    expect(getSettings(db)).toEqual({})
    putSetting(db, 'maxPerRoute', '5')
    putSetting(db, 'maxPerRoute', '4')
    putSetting(db, 'digestTo', 'a@b.com')
    expect(getSettings(db)).toEqual({ maxPerRoute: '4', digestTo: 'a@b.com' })
    deleteSetting(db, 'maxPerRoute')
    expect(getSettings(db)).toEqual({ digestTo: 'a@b.com' })
  })
})

describe('deal_status table', () => {
  it('sets, updates, clears, and lists statuses', () => {
    setDealStatus(db, 'YYC-LHR|2026-05-14|business|aeroplan', 'saved', 'anniversary trip')
    setDealStatus(db, 'YYC-CDG|2026-09-03|economy|flyingblue', 'dismissed')
    expect(getDealStatuses(db).get('YYC-LHR|2026-05-14|business|aeroplan'))
      .toEqual({ status: 'saved', note: 'anniversary trip' })
    expect(getDealStatuses(db).get('YYC-CDG|2026-09-03|economy|flyingblue'))
      .toEqual({ status: 'dismissed', note: '' })
    setDealStatus(db, 'YYC-LHR|2026-05-14|business|aeroplan', 'dismissed', 'too pricey')
    expect(getDealStatuses(db).get('YYC-LHR|2026-05-14|business|aeroplan'))
      .toEqual({ status: 'dismissed', note: 'too pricey' })
    setDealStatus(db, 'YYC-LHR|2026-05-14|business|aeroplan', null)
    expect(getDealStatuses(db).size).toBe(1)
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/core/db.test.ts`; expected FAIL: `getSettings` is not exported.

- [ ] **Step 3: Implement** — in `src/core/db.ts` append to the `SCHEMA` template string:

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deal_status (
  alert_key TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('saved', 'dismissed')),
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
```

and add at the end of the file:

```ts
export function getSettings(db: DB): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

export function putSetting(db: DB, key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .run(key, value, new Date().toISOString())
}

export function deleteSetting(db: DB, key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}

export function setDealStatus(db: DB, alertKey: string, status: 'saved' | 'dismissed' | null, note = ''): void {
  if (status === null) {
    db.prepare('DELETE FROM deal_status WHERE alert_key = ?').run(alertKey)
    return
  }
  db.prepare('INSERT INTO deal_status (alert_key, status, note, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(alert_key) DO UPDATE SET status = excluded.status, note = excluded.note, updated_at = excluded.updated_at')
    .run(alertKey, status, note, new Date().toISOString())
}

export function getDealStatuses(db: DB): Map<string, { status: 'saved' | 'dismissed'; note: string }> {
  const rows = db.prepare('SELECT alert_key, status, note FROM deal_status').all() as Array<{ alert_key: string; status: 'saved' | 'dismissed'; note: string }>
  return new Map(rows.map(r => [r.alert_key, { status: r.status, note: r.note }]))
}
```

- [ ] **Step 4: Verify** — `npx vitest run` all pass; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** — `git add src/core/db.ts tests/core/db.test.ts && git commit -m "feat: add settings and deal_status tables with helpers"`

---

### Task 2: Settings core — whitelist, validation, effective config

**Files:**
- Create: `src/core/settings.ts`
- Test: `tests/core/settings.test.ts`

**Interfaces:**
- Consumes: `loadConfig`/`Config` (config.ts), `getSettings`, `DB` (db.ts).
- Produces (exact, from `src/core/settings.js`):
  - `SETTING_KEYS: readonly string[]` — the 8 whitelisted keys from Global Constraints, in that order.
  - `validateSetting(key: string, value: string): string | null` — returns an error message, or null when valid.
  - `loadEffectiveConfig(db: DB, env?: Record<string, string | undefined>): Config` — `loadConfig(env)` overlaid with DB settings.

- [ ] **Step 1: Write the failing test** — `tests/core/settings.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { SETTING_KEYS, validateSetting, loadEffectiveConfig } from '../../src/core/settings.js'
import { openDb, putSetting, type DB } from '../../src/core/db.js'

const ENV = {
  SEATS_AERO_KEY: 'sk1',
  GMAIL_USER: 'hl@gmail.com', GMAIL_APP_PASSWORD: 'gp', DIGEST_TO: 'me@example.com',
}

let db: DB
beforeEach(() => { db = openDb(':memory:') })

describe('validateSetting', () => {
  it('rejects unknown keys', () => expect(validateSetting('dbPath', 'x')).toMatch(/unknown/i))
  it('rejects non-positive numbers', () => {
    expect(validateSetting('mrBalance', '-5')).toBeTruthy()
    expect(validateSetting('thresholds.economy', 'abc')).toBeTruthy()
  })
  it('requires integer maxPerRoute', () => {
    expect(validateSetting('maxPerRoute', '2.5')).toBeTruthy()
    expect(validateSetting('maxPerRoute', '2')).toBeNull()
  })
  it('validates digestTo as email', () => {
    expect(validateSetting('digestTo', 'not-an-email')).toBeTruthy()
    expect(validateSetting('digestTo', 'a@b.com')).toBeNull()
  })
  it('accepts valid numbers', () => expect(validateSetting('minValue.premium', '1500')).toBeNull())
})

describe('loadEffectiveConfig', () => {
  it('returns env defaults with an empty settings table', () => {
    const cfg = loadEffectiveConfig(db, ENV)
    expect(cfg.thresholds.economy).toBe(1.75)
    expect(cfg.maxPerRoute).toBe(3)
    expect(cfg.digestTo).toBe('me@example.com')
  })
  it('overlays DB settings over env defaults', () => {
    putSetting(db, 'thresholds.economy', '2.5')
    putSetting(db, 'maxPerRoute', '5')
    putSetting(db, 'digestTo', 'other@example.com')
    const cfg = loadEffectiveConfig(db, ENV)
    expect(cfg.thresholds.economy).toBe(2.5)
    expect(cfg.thresholds.premiumConservative).toBe(3.0)
    expect(cfg.maxPerRoute).toBe(5)
    expect(cfg.mrBalance).toBe(220000)
    expect(cfg.digestTo).toBe('other@example.com')
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/core/settings.test.ts`; expected FAIL: cannot find module.

- [ ] **Step 3: Implement** — `src/core/settings.ts`:

```ts
import { loadConfig, type Config } from './config.js'
import { getSettings, type DB } from './db.js'

export const SETTING_KEYS = [
  'thresholds.economy', 'thresholds.premiumConservative',
  'minValue.economy', 'minValue.premium',
  'maxPerRoute', 'mrBalance', 'alertImprovement', 'digestTo',
] as const

export type SettingKey = (typeof SETTING_KEYS)[number]

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function validateSetting(key: string, value: string): string | null {
  if (!(SETTING_KEYS as readonly string[]).includes(key)) return `unknown setting: ${key}`
  if (key === 'digestTo') return EMAIL.test(value) ? null : 'must be an email address'
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 'must be a positive number'
  if (key === 'maxPerRoute' && !Number.isInteger(n)) return 'must be an integer'
  return null
}

export function loadEffectiveConfig(db: DB, env: Record<string, string | undefined> = process.env): Config {
  const cfg = loadConfig(env)
  const s = getSettings(db)
  const num = (key: string): number | undefined => (key in s ? Number(s[key]) : undefined)
  cfg.thresholds.economy = num('thresholds.economy') ?? cfg.thresholds.economy
  cfg.thresholds.premiumConservative = num('thresholds.premiumConservative') ?? cfg.thresholds.premiumConservative
  cfg.minValue.economy = num('minValue.economy') ?? cfg.minValue.economy
  cfg.minValue.premium = num('minValue.premium') ?? cfg.minValue.premium
  cfg.maxPerRoute = num('maxPerRoute') ?? cfg.maxPerRoute
  cfg.mrBalance = num('mrBalance') ?? cfg.mrBalance
  cfg.alertImprovement = num('alertImprovement') ?? cfg.alertImprovement
  cfg.digestTo = s.digestTo ?? cfg.digestTo
  return cfg
}
```

- [ ] **Step 4: Verify** — `npx vitest run` all pass; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** — `git add src/core/settings.ts tests/core/settings.test.ts && git commit -m "feat: add settings whitelist, validation, and effective config overlay"`

---

### Task 3: Scanner integration — dismissal suppression + effective config

**Files:**
- Modify: `src/scanner/digest.ts`, `src/scanner/run.ts`
- Test: `tests/scanner/digest.test.ts`, `tests/scanner/run.test.ts` (extend both)

**Interfaces:**
- Consumes: `getDealStatuses`, `setDealStatus`, `putSetting`, `alertKey` (db.ts), `loadEffectiveConfig` (settings.ts).
- Produces: no new exports; behavior changes only.

- [ ] **Step 1: Write the failing tests.** In `tests/scanner/digest.test.ts` (add `setDealStatus` to the db import), inside `describe('selectAlerts', ...)`:

```ts
  it('excludes dismissed deals', () => {
    const d = deal()
    setDealStatus(db, 'YYC-LHR|2026-05-14|business|aeroplan', 'dismissed')
    expect(selectAlerts(db, [d], cfg)).toHaveLength(0)
    setDealStatus(db, 'YYC-LHR|2026-05-14|business|aeroplan', 'saved')
    expect(selectAlerts(db, [d], cfg)).toHaveLength(1)
  })
```

In `tests/scanner/run.test.ts` (add `putSetting` to the db import), inside the describe block:

```ts
  it('honors DB settings overrides', async () => {
    const dbPath = `${process.env.TMPDIR ?? '/tmp'}/flight-checks-settings-${process.pid}.db`
    const setup = openDb(dbPath)
    putSetting(setup, 'minValue.premium', '3000')
    setup.close()
    const result = await runScan({ dryRun: true, env: { ...env, DB_PATH: dbPath } })
    // business deal nets $2,632 < $3,000 floor -> its alert is suppressed; economy alerts unaffected
    expect(result.snapshots).toBe(3)
    expect(result.alerts).toBe(2)
  })
```

- [ ] **Step 2: Run to verify failures** — `npx vitest run tests/scanner/digest.test.ts tests/scanner/run.test.ts`; the two new tests FAIL (dismissed deal still alerted; alerts 3 not 1).

- [ ] **Step 3: Implement.** In `src/scanner/digest.ts`, add `getDealStatuses` to the db import line, and at the top of `selectAlerts` replace `const eligible = deals.filter(d => {` with:

```ts
  const statuses = getDealStatuses(db)
  const eligible = deals.filter(d => {
    if (statuses.get(alertKey(d))?.status === 'dismissed') return false
```

(`alertKey` is already imported.) In `src/scanner/run.ts`, add `import { loadEffectiveConfig } from '../core/settings.js'` and replace the two config/db lines at the top of `runScan` with:

```ts
  const baseCfg = loadConfig(opts.env ?? process.env)
  const db: DB = openDb(baseCfg.dbPath)
  const cfg: Config = loadEffectiveConfig(db, opts.env ?? process.env)
```

- [ ] **Step 4: Verify** — `npx vitest run` all pass; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** — `git add src/scanner/digest.ts src/scanner/run.ts tests/scanner/digest.test.ts tests/scanner/run.test.ts && git commit -m "feat: suppress dismissed deals and honor UI settings in scans"`

---

### Task 4: Server API — filters, meta, status, shortlist, settings, scan trigger

**Files:**
- Modify: `src/server/app.ts`, `src/server/index.ts`
- Test: `tests/server/app.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1 db helpers, Task 2 settings module, `AIRPORT_CITY`/`airportLabel` (regions.ts), `alertKey` (db.ts).
- Produces: `createApp(db: DB, opts?: { startScan?: () => void; env?: Record<string, string | undefined> }): Hono` (existing call sites with one argument keep working). Endpoints exactly per the spec section "API".

- [ ] **Step 1: Write the failing tests** — append to `tests/server/app.test.ts` (extend the db import with `putSetting, setDealStatus`; the existing `deal`/`stats` fixtures and `beforeEach` seeding stay; define at top `const ENV = { SEATS_AERO_KEY: 'sk1', GMAIL_USER: 'hl@gmail.com', GMAIL_APP_PASSWORD: 'gp', DIGEST_TO: 'me@example.com' }`):

```ts
describe('GET /api/deals filters', () => {
  it('filters by country and month, sorts by requested column', async () => {
    const res = await createApp(db).request('/api/deals?country=UK&month=2026-05&sort=seats&dir=asc')
    const { deals } = await res.json()
    expect(deals).toHaveLength(2)
    expect(deals.every((d: { route: string }) => d.route === 'YYC-LHR')).toBe(true)
  })
  it('searches by city name', async () => {
    const { deals } = await (await createApp(db).request('/api/deals?q=london')).json()
    expect(deals.length).toBeGreaterThan(0)
    const none = await (await createApp(db).request('/api/deals?q=tokyo')).json()
    expect(none.deals).toHaveLength(0)
  })
  it('hides dismissed deals unless includeDismissed=1', async () => {
    setDealStatus(db, 'YYC-LHR|2026-05-14|economy|aeroplan', 'dismissed')
    const { deals } = await (await createApp(db).request('/api/deals')).json()
    expect(deals).toHaveLength(1)
    const all = await (await createApp(db).request('/api/deals?includeDismissed=1')).json()
    expect(all.deals).toHaveLength(2)
    expect(all.deals.find((d: { cabin: string }) => d.cabin === 'economy').status).toBe('dismissed')
  })
})

describe('GET /api/meta', () => {
  it('lists countries and effective mrBalance', async () => {
    putSetting(db, 'mrBalance', '150000')
    const meta = await (await createApp(db, { env: ENV }).request('/api/meta')).json()
    expect(meta.countries).toContain('UK')
    expect(meta.countries).toContain('Japan')
    expect(meta.mrBalance).toBe(150000)
  })
})

describe('deal status + shortlist', () => {
  it('sets status and serves the shortlist with current snapshot', async () => {
    const app = createApp(db)
    const post = await app.request('/api/deals/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertKey: 'YYC-LHR|2026-05-14|business|aeroplan', status: 'saved', note: 'go' }),
    })
    expect(post.status).toBe(200)
    const { deals } = await (await app.request('/api/shortlist')).json()
    expect(deals).toHaveLength(1)
    expect(deals[0].note).toBe('go')
    expect(deals[0].current.cpp_conservative).toBe(4.07)
  })
  it('rejects bad status values', async () => {
    const res = await createApp(db).request('/api/deals/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertKey: 'x', status: 'meh' }),
    })
    expect(res.status).toBe(400)
  })
})

describe('settings API', () => {
  it('gets defaults, accepts valid puts, rejects invalid', async () => {
    const app = createApp(db, { env: ENV })
    const before = await (await app.request('/api/settings')).json()
    expect(before.settings['maxPerRoute']).toEqual({ value: 3, default: 3, overridden: false })
    const put = await app.request('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'maxPerRoute', value: '5' }),
    })
    expect(put.status).toBe(200)
    const after = await (await app.request('/api/settings')).json()
    expect(after.settings['maxPerRoute']).toEqual({ value: 5, default: 3, overridden: true })
    const bad = await app.request('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'dbPath', value: 'hack' }),
    })
    expect(bad.status).toBe(400)
  })
})

describe('POST /api/scan', () => {
  it('triggers when idle and 409s while running', async () => {
    let calls = 0
    const app = createApp(db, { startScan: () => { calls++ } })
    expect((await app.request('/api/scan', { method: 'POST' })).status).toBe(200)
    expect(calls).toBe(1)
    startScan(db) // unfinished recent scan
    expect((await app.request('/api/scan', { method: 'POST' })).status).toBe(409)
  })
})
```

- [ ] **Step 2: Run to verify failures** — `npx vitest run tests/server/app.test.ts`; new tests FAIL (unknown routes / missing filters).

- [ ] **Step 3: Implement** — rewrite `src/server/app.ts`:

```ts
import { Hono } from 'hono'
import { getSettings, getDealStatuses, setDealStatus, putSetting, deleteSetting, alertKey, type DB } from '../core/db.js'
import { SETTING_KEYS, validateSetting, loadEffectiveConfig } from '../core/settings.js'
import { loadConfig } from '../core/config.js'
import { AIRPORT_CITY, airportLabel } from '../core/regions.js'

interface SnapshotRow {
  id: number; scan_id: number; route: string; date: string; cabin: string; program: string
  miles: number; taxes_cad: number; cash_cad: number; economy_cash_cad: number | null
  mr_points: number; cpp_raw: number; cpp_conservative: number; seats: number; direct: number
}

const rankOf = (d: SnapshotRow): number => (d.cabin === 'economy' ? d.cpp_raw : d.cpp_conservative)
const destOf = (route: string): string => route.split('-')[1]

export function createApp(
  db: DB,
  opts: { startScan?: () => void; env?: Record<string, string | undefined> } = {},
): Hono {
  const env = opts.env ?? process.env
  const app = new Hono()

  app.get('/api/deals', c => {
    const q = c.req.query()
    const latest = db.prepare('SELECT id FROM scans WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1')
      .get() as { id: number } | undefined
    if (!latest) return c.json({ deals: [] })
    let rows = db.prepare('SELECT * FROM snapshots WHERE scan_id = ?').all(latest.id) as SnapshotRow[]
    if (q.cabin) rows = rows.filter(d => d.cabin === q.cabin)
    if (q.month) rows = rows.filter(d => d.date.startsWith(q.month))
    if (q.minCpp) rows = rows.filter(d => rankOf(d) >= Number(q.minCpp))
    if (q.country) rows = rows.filter(d => AIRPORT_CITY[destOf(d.route)]?.country === q.country)
    if (q.q) {
      const needle = q.q.toLowerCase()
      rows = rows.filter(d => d.route.toLowerCase().includes(needle) || airportLabel(destOf(d.route)).toLowerCase().includes(needle))
    }
    const statuses = getDealStatuses(db)
    const keyed = rows.map(d => ({ ...d, ...(statuses.get(alertKey(d)) ?? { status: null, note: '' }) }))
    const visible = q.includeDismissed === '1' ? keyed : keyed.filter(d => d.status !== 'dismissed')
    const sorters: Record<string, (d: SnapshotRow) => number | string> = {
      cpp: rankOf, date: d => d.date, mr_points: d => d.mr_points, seats: d => d.seats, cash_cad: d => d.cash_cad,
    }
    const sortFn = sorters[q.sort ?? 'cpp'] ?? sorters.cpp
    const dir = (q.dir ?? (q.sort && q.sort !== 'cpp' ? 'asc' : 'desc')) === 'asc' ? 1 : -1
    visible.sort((a, b) => (sortFn(a) < sortFn(b) ? -dir : sortFn(a) > sortFn(b) ? dir : 0))
    return c.json({ deals: visible.slice(0, 200) })
  })

  app.get('/api/meta', c => {
    const countries = [...new Set(Object.values(AIRPORT_CITY).map(i => i.country))].sort()
    return c.json({ countries, mrBalance: loadEffectiveConfig(db, env).mrBalance })
  })

  app.post('/api/deals/status', async c => {
    const body = await c.req.json().catch(() => null) as { alertKey?: string; status?: unknown; note?: string } | null
    if (!body?.alertKey || ![null, 'saved', 'dismissed'].includes(body.status as string | null)) {
      return c.json({ error: 'alertKey and status (saved|dismissed|null) required' }, 400)
    }
    setDealStatus(db, body.alertKey, body.status as 'saved' | 'dismissed' | null, body.note ?? '')
    return c.json({ ok: true })
  })

  app.get('/api/shortlist', c => {
    const saved = [...getDealStatuses(db)].filter(([, v]) => v.status === 'saved')
    const stmt = db.prepare('SELECT * FROM snapshots WHERE route = ? AND date = ? AND cabin = ? AND program = ? ORDER BY id DESC LIMIT 1')
    const deals = saved.map(([key, v]) => {
      const [route, date, cabin, program] = key.split('|')
      return { alertKey: key, note: v.note, current: (stmt.get(route, date, cabin, program) as SnapshotRow | undefined) ?? null }
    })
    return c.json({ deals })
  })

  app.get('/api/settings', c => {
    const base = loadConfig(env)
    const eff = loadEffectiveConfig(db, env)
    const overrides = getSettings(db)
    const pick = (cfg: typeof base, key: string): number | string => {
      switch (key) {
        case 'thresholds.economy': return cfg.thresholds.economy
        case 'thresholds.premiumConservative': return cfg.thresholds.premiumConservative
        case 'minValue.economy': return cfg.minValue.economy
        case 'minValue.premium': return cfg.minValue.premium
        case 'maxPerRoute': return cfg.maxPerRoute
        case 'mrBalance': return cfg.mrBalance
        case 'alertImprovement': return cfg.alertImprovement
        default: return cfg.digestTo
      }
    }
    const settings = Object.fromEntries(SETTING_KEYS.map(k => [k, { value: pick(eff, k), default: pick(base, k), overridden: k in overrides }]))
    return c.json({ settings })
  })

  app.put('/api/settings', async c => {
    const body = await c.req.json().catch(() => null) as { key?: string; value?: string | null } | null
    if (!body?.key) return c.json({ error: 'key required' }, 400)
    if (body.value === null || body.value === undefined) {
      if (!(SETTING_KEYS as readonly string[]).includes(body.key)) return c.json({ error: `unknown setting: ${body.key}` }, 400)
      deleteSetting(db, body.key)
      return c.json({ ok: true })
    }
    const err = validateSetting(body.key, String(body.value))
    if (err) return c.json({ error: err }, 400)
    putSetting(db, body.key, String(body.value))
    return c.json({ ok: true })
  })

  app.post('/api/scan', c => {
    const open = db.prepare('SELECT started_at FROM scans WHERE finished_at IS NULL ORDER BY id DESC LIMIT 1')
      .get() as { started_at: string } | undefined
    if (open && Date.now() - Date.parse(open.started_at) < 30 * 60_000) {
      return c.json({ error: 'a scan is already running' }, 409)
    }
    opts.startScan?.()
    return c.json({ started: true })
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

And in `src/server/index.ts`, replace `const app = createApp(db)` with:

```ts
import { execFile } from 'node:child_process'

const startScan = (): void => {
  execFile('systemctl', ['start', '--no-block', 'flight-checks-scan.service'], err => {
    if (err) execFile('npx', ['tsx', 'src/scanner/index.ts'])
  })
}
const app = createApp(db, { startScan })
```

(keep the import block at the top of the file together).

- [ ] **Step 4: Verify** — `npx vitest run` all pass; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** — `git add src/server/app.ts src/server/index.ts tests/server/app.test.ts && git commit -m "feat: add filters, meta, deal status, shortlist, settings, and scan trigger APIs"`

---

### Task 5: Web UI — five tabs

**Files:**
- Modify: `src/web/api.ts`, `src/web/App.tsx`, `src/web/styles.css`
- No unit tests (markup); gate is `npm run build` + `npx vitest run` + `npx tsc --noEmit`.

**Interfaces:**
- Consumes: every endpoint from Task 4, exactly as specced there.
- Produces: static build in `dist/web`.

- [ ] **Step 1: Extend `src/web/api.ts`** — add to `DealRow`: `status: 'saved' | 'dismissed' | null; note: string`. Add below the existing exports:

```ts
export interface Meta { countries: string[]; mrBalance: number }
export interface ShortlistRow { alertKey: string; note: string; current: DealRow | null }
export interface SettingEntry { value: number | string; default: number | string; overridden: boolean }

export interface DealQuery {
  cabin?: string; country?: string; month?: string; minCpp?: string; q?: string
  sort?: string; dir?: string; includeDismissed?: boolean
}

export const fetchDealsFiltered = (f: DealQuery) => {
  const p = new URLSearchParams()
  if (f.cabin) p.set('cabin', f.cabin)
  if (f.country) p.set('country', f.country)
  if (f.month) p.set('month', f.month)
  if (f.minCpp) p.set('minCpp', f.minCpp)
  if (f.q) p.set('q', f.q)
  if (f.sort) p.set('sort', f.sort)
  if (f.dir) p.set('dir', f.dir)
  if (f.includeDismissed) p.set('includeDismissed', '1')
  return get<{ deals: DealRow[] }>(`/api/deals?${p}`).then(r => r.deals)
}
export const fetchMeta = () => get<Meta>('/api/meta')
export const fetchShortlist = () => get<{ deals: ShortlistRow[] }>('/api/shortlist').then(r => r.deals)
export const fetchSettings = () => get<{ settings: Record<string, SettingEntry> }>('/api/settings').then(r => r.settings)

async function send(path: string, method: string, body: unknown): Promise<void> {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({ error: res.status })) as { error: string }).error)
}
export const postDealStatus = (alertKey: string, status: 'saved' | 'dismissed' | null, note = '') =>
  send('/api/deals/status', 'POST', { alertKey, status, note })
export const putSettingValue = (key: string, value: string | null) => send('/api/settings', 'PUT', { key, value })
export const triggerScan = async (): Promise<void> => {
  const res = await fetch('/api/scan', { method: 'POST' })
  if (!res.ok) throw new Error((await res.json() as { error: string }).error)
}
```

- [ ] **Step 2: Rewrite `src/web/App.tsx`** with tabs Deals · Shortlist · History · Runs · Settings:
  - Shared: `const [banner, setBanner] = useState<string | null>(null)` in `App`, rendered as `{banner && <p className="banner" onClick={() => setBanner(null)}>{banner}</p>}`; pass `onError: (e: Error) => setBanner(e.message)` down. `alertKeyOf = (d: DealRow) => `${d.route}|${d.date}|${d.cabin}|${d.program}``. Fetch `/api/meta` once in `App`; pass `mrBalance` to DealsTab (replaces the `MR_BALANCE` constant, which is deleted).
  - **DealsTab**: state `{ cabin, country, month, minCpp, q, sort, dir, includeDismissed }`; filter bar renders country `<select>` (from meta.countries), month `<select>` (unique `date.slice(0,7)` of loaded deals plus currently selected), cabin `<select>` (existing options), `<input type="number">` for min ¢/pt, `<input type="search">` for text, and a "show dismissed" checkbox. Table headers are `<th onClick={...}>` toggling sort column/direction (arrow indicator `▲`/`▼` on the active column). Each row appends a cell with `Save`/`Dismiss` buttons (`✓ saved` state shown when `d.status === 'saved'`); buttons call `postDealStatus(alertKeyOf(d), next)` then refetch; dismissed rows render with `className="dimmed"` when shown.
  - **ShortlistTab**: `fetchShortlist()`; table of saved deals: alertKey parts, `current` cpp/seats (or "no longer available" when `current` is null), `<input>` for the note saved on blur via `postDealStatus(key, 'saved', note)`, an Unsave button (`postDealStatus(key, null)`), and a link that jumps to the History tab for that route/cabin (reuse the existing `onPick` mechanism lifted to `App`).
  - **HistoryTab**: unchanged.
  - **RunsTab**: adds a `Scan now` button above the table → `triggerScan()` then poll `fetchScans()` every 5 s while the newest scan has `finished_at === null` (stop polling when finished; also stop after 20 polls); button disabled with label `Scanning…` while polling; errors go to the banner.
  - **SettingsTab**: `fetchSettings()`; one row per key: label, `<input>` prefilled with `value`, Save button (`putSettingValue(key, input)` then refetch), and when `overridden` a `reset` button (`putSettingValue(key, null)`) plus the default shown as `default: X`.
- [ ] **Step 3: Add styles** — append to `src/web/styles.css`:

```css
.banner { background: #dc2626; color: white; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
.filters { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; align-items: center; }
.filters input, .filters select { padding: 0.35rem; font-size: 0.95rem; }
tr.dimmed { opacity: 0.45; }
th.sortable { cursor: pointer; user-select: none; }
button.small { padding: 0.15rem 0.5rem; font-size: 0.85rem; border: 1px solid #8886; background: transparent; border-radius: 4px; cursor: pointer; }
button.small.active { background: #22c55e; color: white; border-color: #22c55e; }
.settings-row { display: flex; gap: 0.75rem; align-items: center; margin-bottom: 0.6rem; }
.settings-row label { min-width: 220px; }
```

- [ ] **Step 4: Verify** — `npm run build` succeeds; `npx tsc --noEmit` clean; `npx vitest run` all pass. Then boot locally with a seeded DB and click through every tab (orchestrator does this).
- [ ] **Step 5: Commit** — `git add src/web && git commit -m "feat: full dashboard app - filters, shortlist, scan control, settings"`

---

### Task 6: Deploy + live verification (orchestrator-only — never Codex)

- [ ] **Step 1:** `./deploy/deploy.sh`
- [ ] **Step 2:** `curl -s http://<container-ip>:3000/api/meta` → countries list + mrBalance.
- [ ] **Step 3:** Trigger a scan from the API (`curl -X POST http://<container-ip>:3000/api/scan`), confirm 200, watch `/api/scans` until finished, confirm a second immediate POST while running returns 409.
- [ ] **Step 4:** Save + dismiss a deal via the UI/API, confirm `/api/shortlist`, and confirm a dismissed top deal is absent from the next digest's alerts.
- [ ] **Step 5:** Change a setting (e.g. `maxPerRoute` to 2) in the Settings tab, run a scan, verify the digest respects it, then reset.
- [ ] **Step 6:** Commit any deploy tweaks; update CLAUDE.md architecture line (server owns settings/deal_status; scan trigger via systemd).
