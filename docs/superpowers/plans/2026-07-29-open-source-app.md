# Open-Source Self-Hosted App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is executed by Codex worker agents orchestrated per `orchestrating-codex-workers`; each worker sees only its own task, so the **Interfaces** blocks are authoritative.

**Goal:** Make flight-checks self-hostable by anyone: boot with zero env vars, configure everything (including secrets) through a first-run browser wizard, run via `docker compose up` with a built-in scheduler, and ship contributor infrastructure (CI, docs, templates).

**Architecture:** Config precedence becomes `env var (if set) > DB settings row > shipped default`, with the current Amex MR Canada values as shipped defaults. Secrets (`seatsAeroKey`, `smtp.password`) live in the SQLite `settings` table, write-only through the API. The web server owns scheduling (setTimeout re-armed per run, IANA timezone aware) and spawns the scanner as a child process; the `systemctl` trigger path is deleted.

**Tech Stack:** Node 22, TypeScript ESM (`NodeNext`), tsx runtime (no backend build), Hono, better-sqlite3, nodemailer, React 19 + Vite, Vitest, Docker.

**Spec:** `docs/superpowers/specs/2026-07-29-open-source-app-design.md`

## Global Constraints

- All work on branch `open-source-app` (created from `main` at execution start).
- `npx vitest run` must be green at every commit. Never watch mode.
- No live APIs in tests — mock `fetch` and mail transports, always.
- Secrets never in git, never in logs, never in API GET responses.
- `DB_PATH` and `PORT` stay env-only; they are never settings keys.
- Existing DB rows must keep working: honor legacy `mrBalance` settings row and legacy `GMAIL_USER`/`GMAIL_APP_PASSWORD`/`MR_BALANCE` env vars.
- The DB `snapshots.mr_points` column and `ScoredDeal.mrPoints` field keep their names (schema churn is out of scope); they mean "points after transfer ratio".
- Commit messages: conventional prefix (`feat:`/`chore:`/`docs:`), **no AI attribution trailers of any kind**.
- Match existing code style: no semicolons where absent, single quotes, compact modules.

---

### Task 1: Generalized Config (no-throw load, SMTP, points-program fields)

**Files:**
- Modify: `src/core/config.ts` (full rewrite below)
- Modify: `src/core/settings.ts` (compile fix only — `mrBalance` → `pointsBalance` internals; full expansion is Task 2)
- Modify: `src/scanner/digest.ts` (transport + labels)
- Modify: `src/server/app.ts:55` (`mrBalance` → `pointsBalance` in `/api/meta` JSON stays named `mrBalance` — see below)
- Modify: `tests/core/config.test.ts`, plus any test that sets `GMAIL_USER`/`MR_BALANCE` env fixtures

**Interfaces:**
- Produces (imported by every later task):
  ```ts
  export interface SmtpConfig { host: string; port: number; user: string; password: string }
  export interface ScanSchedule { times: string[]; timezone: string }
  export interface Config {
    seatsAeroKey: string; smtp: SmtpConfig; digestTo: string; digestEnabled: boolean
    dbPath: string; origin: string; pointsProgram: string; pointsBalance: number
    currency: string; excludedCountries: string[]; ratios: Record<string, number>
    thresholds: { economy: number; premiumConservative: number }
    minValue: { economy: number; premium: number }
    maxPerRoute: number; alertImprovement: number; scanSchedule: ScanSchedule
  }
  export function defaultConfig(): Config
  export function applyEnv(cfg: Config, env: Record<string, string | undefined>): Config
  export function loadConfig(env?: Record<string, string | undefined>): Config  // NEVER throws
  export function configComplete(cfg: Config): boolean   // seatsAeroKey !== ''
  export function digestReady(cfg: Config): boolean      // digestEnabled && smtp.user && smtp.password && digestTo
  ```
- `Config.gmailUser`, `Config.gmailAppPassword`, `Config.mrBalance` are **deleted**. Grep for them and fix every site in this task.

- [ ] **Step 1: Rewrite `tests/core/config.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { loadConfig, configComplete, digestReady } from '../../src/core/config.js'

describe('loadConfig', () => {
  it('returns full defaults with an empty env (no throw)', () => {
    const cfg = loadConfig({})
    expect(cfg.seatsAeroKey).toBe('')
    expect(cfg.origin).toBe('YYC')
    expect(cfg.pointsProgram).toBe('Amex MR (Canada)')
    expect(cfg.pointsBalance).toBe(220000)
    expect(cfg.currency).toBe('CAD')
    expect(cfg.excludedCountries).toEqual(['Canada'])
    expect(cfg.ratios).toEqual({ aeroplan: 1, british: 1, flyingblue: 0.75, delta: 0.75, etihad: 0.75 })
    expect(cfg.smtp).toEqual({ host: 'smtp.gmail.com', port: 465, user: '', password: '' })
    expect(cfg.scanSchedule).toEqual({ times: ['07:00', '19:00'], timezone: 'America/Edmonton' })
    expect(cfg.digestEnabled).toBe(true)
  })
  it('applies env overrides including legacy aliases', () => {
    const cfg = loadConfig({
      SEATS_AERO_KEY: 'sk1', GMAIL_USER: 'me@gmail.com', GMAIL_APP_PASSWORD: 'pw',
      DIGEST_TO: 'to@x.com', MR_BALANCE: '100000', ORIGIN: 'YVR', DB_PATH: '/tmp/x.db',
    })
    expect(cfg.seatsAeroKey).toBe('sk1')
    expect(cfg.smtp.user).toBe('me@gmail.com')
    expect(cfg.smtp.password).toBe('pw')
    expect(cfg.pointsBalance).toBe(100000)
    expect(cfg.origin).toBe('YVR')
  })
  it('prefers SMTP_* over GMAIL_* when both set', () => {
    const cfg = loadConfig({ SMTP_USER: 'a@b.c', GMAIL_USER: 'z@z.z', SMTP_HOST: 'mail.x.com', SMTP_PORT: '587' })
    expect(cfg.smtp).toMatchObject({ user: 'a@b.c', host: 'mail.x.com', port: 587 })
  })
})

describe('completeness', () => {
  it('configComplete requires only the seats.aero key', () => {
    expect(configComplete(loadConfig({}))).toBe(false)
    expect(configComplete(loadConfig({ SEATS_AERO_KEY: 'k' }))).toBe(true)
  })
  it('digestReady requires smtp user+password and a recipient', () => {
    expect(digestReady(loadConfig({}))).toBe(false)
    expect(digestReady(loadConfig({ GMAIL_USER: 'u@g.c', GMAIL_APP_PASSWORD: 'p', DIGEST_TO: 't@x.c' }))).toBe(true)
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (`npx vitest run tests/core/config.test.ts` — missing exports / old shape)

- [ ] **Step 3: Rewrite `src/core/config.ts`**

```ts
export interface SmtpConfig { host: string; port: number; user: string; password: string }
export interface ScanSchedule { times: string[]; timezone: string }

export interface Config {
  seatsAeroKey: string
  smtp: SmtpConfig
  digestTo: string
  digestEnabled: boolean
  dbPath: string
  origin: string
  pointsProgram: string
  pointsBalance: number
  currency: string
  excludedCountries: string[]
  ratios: Record<string, number>
  thresholds: { economy: number; premiumConservative: number }
  minValue: { economy: number; premium: number }
  maxPerRoute: number
  alertImprovement: number
  scanSchedule: ScanSchedule
}

export function defaultConfig(): Config {
  return {
    seatsAeroKey: '',
    smtp: { host: 'smtp.gmail.com', port: 465, user: '', password: '' },
    digestTo: '',
    digestEnabled: true,
    dbPath: 'data/flights.db',
    origin: 'YYC',
    pointsProgram: 'Amex MR (Canada)',
    pointsBalance: 220000,
    currency: 'CAD',
    excludedCountries: ['Canada'],
    ratios: { aeroplan: 1, british: 1, flyingblue: 0.75, delta: 0.75, etihad: 0.75 },
    thresholds: { economy: 1.75, premiumConservative: 3.0 },
    minValue: { economy: 400, premium: 1200 },
    maxPerRoute: 3,
    alertImprovement: 0.15,
    scanSchedule: { times: ['07:00', '19:00'], timezone: 'America/Edmonton' },
  }
}

export function applyEnv(cfg: Config, env: Record<string, string | undefined>): Config {
  if (env.SEATS_AERO_KEY) cfg.seatsAeroKey = env.SEATS_AERO_KEY
  if (env.SMTP_HOST) cfg.smtp.host = env.SMTP_HOST
  if (env.SMTP_PORT) cfg.smtp.port = Number(env.SMTP_PORT)
  const user = env.SMTP_USER ?? env.GMAIL_USER
  if (user) cfg.smtp.user = user
  const password = env.SMTP_PASSWORD ?? env.GMAIL_APP_PASSWORD
  if (password) cfg.smtp.password = password
  if (env.DIGEST_TO) cfg.digestTo = env.DIGEST_TO
  if (env.DB_PATH) cfg.dbPath = env.DB_PATH
  if (env.ORIGIN) cfg.origin = env.ORIGIN
  const balance = env.POINTS_BALANCE ?? env.MR_BALANCE
  if (balance) cfg.pointsBalance = Number(balance)
  if (env.MIN_VALUE_ECONOMY) cfg.minValue.economy = Number(env.MIN_VALUE_ECONOMY)
  if (env.MIN_VALUE_PREMIUM) cfg.minValue.premium = Number(env.MIN_VALUE_PREMIUM)
  if (env.MAX_PER_ROUTE) cfg.maxPerRoute = Number(env.MAX_PER_ROUTE)
  return cfg
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return applyEnv(defaultConfig(), env)
}

export const configComplete = (cfg: Config): boolean => cfg.seatsAeroKey !== ''
export const digestReady = (cfg: Config): boolean =>
  cfg.digestEnabled && cfg.smtp.user !== '' && cfg.smtp.password !== '' && cfg.digestTo !== ''
```

- [ ] **Step 4: Fix every compile/test ripple.** `grep -rn 'gmailUser\|gmailAppPassword\|mrBalance' src tests` and fix:
  - `src/core/settings.ts`: `cfg.mrBalance` → `cfg.pointsBalance`; when reading DB overrides accept **both** rows: `num('pointsBalance') ?? num('mrBalance') ?? cfg.pointsBalance`. Leave `SETTING_KEYS` as-is except rename `'mrBalance'` entry to `'pointsBalance'` (Task 2 expands the rest).
  - `src/scanner/digest.ts`: replace `gmailTransport` with
    ```ts
    function smtpTransport(cfg: Config): MailTransport {
      return nodemailer.createTransport({
        host: cfg.smtp.host, port: cfg.smtp.port, secure: cfg.smtp.port === 465,
        auth: { user: cfg.smtp.user, pass: cfg.smtp.password },
      })
    }
    ```
    `sendDigest` default transport uses it; `from` becomes `` `Flight Checks <${cfg.smtp.user}>` ``; `cfg.mrBalance` → `cfg.pointsBalance`; the cost cell `${fmt.format(d.mrPoints)} MR` becomes `${fmt.format(d.mrPoints)} pts`; the benchmarks footer becomes `` `<p style="color:#666">Ranked in cents per ${cfg.pointsProgram} point.</p>` ``.
  - `src/server/app.ts`: `/api/meta` returns `pointsBalance: loadEffectiveConfig(db, env).pointsBalance` (rename the JSON field too); `/api/settings` `pick()` case `'mrBalance'` → `'pointsBalance'`.
  - `src/web/api.ts` `Meta.mrBalance` → `pointsBalance`; `src/web/App.tsx` any `meta.mrBalance` usage.
  - Tests that build env fixtures (`tests/scanner/*.test.ts`, `tests/server/app.test.ts`, `tests/core/settings.test.ts`): they may keep `GMAIL_USER`/`GMAIL_APP_PASSWORD`/`MR_BALANCE` vars (aliases still work); update only assertions touching removed Config fields, and any test asserting `loadConfig` throws on missing env — that behavior is gone; replace with a `configComplete` assertion.

- [ ] **Step 5: Full suite green** — `npx vitest run` → all pass.

- [ ] **Step 6: Commit** — `git commit -m "feat: generalized no-throw config with SMTP and points-program fields"`

---

### Task 2: Settings expansion (all keys, secrets, env > DB > default)

**Files:**
- Modify: `src/core/settings.ts` (full rewrite below)
- Modify: `tests/core/settings.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1's `defaultConfig`, `applyEnv`, `Config`.
- Produces:
  ```ts
  export const SETTING_KEYS: readonly string[]  // full list below
  export const SECRET_KEYS: readonly ['seatsAeroKey', 'smtp.password']
  export function validateSetting(key: string, value: string): string | null
  export function applySettings(cfg: Config, s: Record<string, string>): Config
  export function loadEffectiveConfig(db: DB, env?: Record<string, string | undefined>): Config
  ```
- Key list (exact strings): `thresholds.economy`, `thresholds.premiumConservative`, `minValue.economy`, `minValue.premium`, `maxPerRoute`, `pointsBalance`, `alertImprovement`, `digestTo`, `origin`, `pointsProgram`, `currency`, `excludedCountries` (JSON string[]), `ratios` (JSON object), `scanSchedule` (JSON `{times,timezone}`), `digestEnabled` (`'true'|'false'`), `smtp.host`, `smtp.port`, `smtp.user`, `seatsAeroKey`, `smtp.password`.
- Precedence in `loadEffectiveConfig`: `applyEnv(applySettings(defaultConfig(), getSettings(db)), env)` — env wins over DB, DB wins over defaults.

- [ ] **Step 1: Extend `tests/core/settings.test.ts`** (keep existing passing cases; add):

```ts
import { openDb } from '../../src/core/db.js'
import { putSetting } from '../../src/core/db.js'
import { loadEffectiveConfig, validateSetting, SECRET_KEYS } from '../../src/core/settings.js'

describe('expanded settings', () => {
  it('DB rows override defaults', () => {
    const db = openDb(':memory:')
    putSetting(db, 'origin', 'YVR')
    putSetting(db, 'ratios', JSON.stringify({ aeroplan: 1 }))
    putSetting(db, 'excludedCountries', JSON.stringify([]))
    putSetting(db, 'seatsAeroKey', 'from-db')
    const cfg = loadEffectiveConfig(db, {})
    expect(cfg.origin).toBe('YVR')
    expect(cfg.ratios).toEqual({ aeroplan: 1 })
    expect(cfg.excludedCountries).toEqual([])
    expect(cfg.seatsAeroKey).toBe('from-db')
  })
  it('env beats DB', () => {
    const db = openDb(':memory:')
    putSetting(db, 'seatsAeroKey', 'from-db')
    putSetting(db, 'origin', 'YVR')
    const cfg = loadEffectiveConfig(db, { SEATS_AERO_KEY: 'from-env', ORIGIN: 'YYC' })
    expect(cfg.seatsAeroKey).toBe('from-env')
    expect(cfg.origin).toBe('YYC')
  })
  it('legacy mrBalance row still honored', () => {
    const db = openDb(':memory:')
    putSetting(db, 'mrBalance', '55000')
    expect(loadEffectiveConfig(db, {}).pointsBalance).toBe(55000)
  })
  it('validates new keys', () => {
    expect(validateSetting('origin', 'YYZ')).toBeNull()
    expect(validateSetting('origin', 'toronto')).toMatch(/IATA/)
    expect(validateSetting('scanSchedule', JSON.stringify({ times: ['07:00'], timezone: 'America/Edmonton' }))).toBeNull()
    expect(validateSetting('scanSchedule', JSON.stringify({ times: ['7am'], timezone: 'America/Edmonton' }))).not.toBeNull()
    expect(validateSetting('scanSchedule', JSON.stringify({ times: ['07:00'], timezone: 'Mars/Olympus' }))).not.toBeNull()
    expect(validateSetting('ratios', JSON.stringify({ aeroplan: 1 }))).toBeNull()
    expect(validateSetting('ratios', JSON.stringify({ aeroplan: 9 }))).not.toBeNull()
    expect(validateSetting('excludedCountries', JSON.stringify(['Canada']))).toBeNull()
    expect(validateSetting('excludedCountries', '"nope"')).not.toBeNull()
    expect(validateSetting('smtp.port', '465')).toBeNull()
    expect(validateSetting('smtp.port', '99999')).not.toBeNull()
    expect(validateSetting('digestEnabled', 'true')).toBeNull()
    expect(validateSetting('digestEnabled', 'yes')).not.toBeNull()
    expect(validateSetting('seatsAeroKey', 'abc')).toBeNull()
    expect(validateSetting('seatsAeroKey', '')).not.toBeNull()
  })
  it('exports SECRET_KEYS', () => {
    expect([...SECRET_KEYS]).toEqual(['seatsAeroKey', 'smtp.password'])
  })
})
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Rewrite `src/core/settings.ts`**

```ts
import { defaultConfig, applyEnv, type Config } from './config.js'
import { getSettings, type DB } from './db.js'

export const SETTING_KEYS = [
  'thresholds.economy', 'thresholds.premiumConservative',
  'minValue.economy', 'minValue.premium',
  'maxPerRoute', 'pointsBalance', 'alertImprovement', 'digestTo',
  'origin', 'pointsProgram', 'currency', 'excludedCountries', 'ratios',
  'scanSchedule', 'digestEnabled', 'smtp.host', 'smtp.port', 'smtp.user',
  'seatsAeroKey', 'smtp.password',
] as const

export type SettingKey = (typeof SETTING_KEYS)[number]
export const SECRET_KEYS = ['seatsAeroKey', 'smtp.password'] as const

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const NUMERIC: readonly string[] = [
  'thresholds.economy', 'thresholds.premiumConservative', 'minValue.economy',
  'minValue.premium', 'maxPerRoute', 'pointsBalance', 'alertImprovement',
]

const validTimezone = (tz: string): boolean => {
  try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); return true } catch { return false }
}
const parseJson = (v: string): unknown => { try { return JSON.parse(v) } catch { return undefined } }

export function validateSetting(key: string, value: string): string | null {
  if (!(SETTING_KEYS as readonly string[]).includes(key)) return `unknown setting: ${key}`
  if (key === 'digestTo') return EMAIL.test(value) ? null : 'must be an email address'
  if (key === 'origin') return /^[A-Z]{3}$/.test(value) ? null : 'must be a 3-letter IATA code'
  if (key === 'pointsProgram' || key === 'currency' || key === 'smtp.host' || key === 'smtp.user')
    return value.trim() ? null : 'must not be empty'
  if ((SECRET_KEYS as readonly string[]).includes(key)) return value ? null : 'must not be empty'
  if (key === 'digestEnabled') return value === 'true' || value === 'false' ? null : "must be 'true' or 'false'"
  if (key === 'smtp.port') {
    const n = Number(value)
    return Number.isInteger(n) && n >= 1 && n <= 65535 ? null : 'must be a port (1-65535)'
  }
  if (key === 'excludedCountries') {
    const v = parseJson(value)
    return Array.isArray(v) && v.every(x => typeof x === 'string') ? null : 'must be a JSON array of country names'
  }
  if (key === 'ratios') {
    const v = parseJson(value)
    if (!v || typeof v !== 'object' || Array.isArray(v)) return 'must be a JSON object of program: ratio'
    const vals = Object.values(v as Record<string, unknown>)
    return vals.length > 0 && vals.every(r => typeof r === 'number' && r > 0 && r <= 2)
      ? null : 'ratios must be numbers in (0, 2]'
  }
  if (key === 'scanSchedule') {
    const v = parseJson(value) as { times?: unknown; timezone?: unknown } | undefined
    if (!v || !Array.isArray(v.times) || typeof v.timezone !== 'string') return 'must be JSON {times, timezone}'
    if (!v.times.length || !v.times.every(t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)))
      return 'times must be HH:MM (24h)'
    return validTimezone(v.timezone) ? null : 'unknown IANA timezone'
  }
  const n = Number(value)
  if (!NUMERIC.includes(key)) return null
  if (!Number.isFinite(n) || n <= 0) return 'must be a positive number'
  if (key === 'maxPerRoute' && !Number.isInteger(n)) return 'must be an integer'
  return null
}

export function applySettings(cfg: Config, s: Record<string, string>): Config {
  const num = (key: string): number | undefined => (key in s ? Number(s[key]) : undefined)
  cfg.thresholds.economy = num('thresholds.economy') ?? cfg.thresholds.economy
  cfg.thresholds.premiumConservative = num('thresholds.premiumConservative') ?? cfg.thresholds.premiumConservative
  cfg.minValue.economy = num('minValue.economy') ?? cfg.minValue.economy
  cfg.minValue.premium = num('minValue.premium') ?? cfg.minValue.premium
  cfg.maxPerRoute = num('maxPerRoute') ?? cfg.maxPerRoute
  cfg.pointsBalance = num('pointsBalance') ?? num('mrBalance') ?? cfg.pointsBalance
  cfg.alertImprovement = num('alertImprovement') ?? cfg.alertImprovement
  cfg.digestTo = s.digestTo ?? cfg.digestTo
  cfg.origin = s.origin ?? cfg.origin
  cfg.pointsProgram = s.pointsProgram ?? cfg.pointsProgram
  cfg.currency = s.currency ?? cfg.currency
  if (s.excludedCountries) cfg.excludedCountries = JSON.parse(s.excludedCountries)
  if (s.ratios) cfg.ratios = JSON.parse(s.ratios)
  if (s.scanSchedule) cfg.scanSchedule = JSON.parse(s.scanSchedule)
  if (s.digestEnabled) cfg.digestEnabled = s.digestEnabled === 'true'
  cfg.smtp.host = s['smtp.host'] ?? cfg.smtp.host
  if (s['smtp.port']) cfg.smtp.port = Number(s['smtp.port'])
  cfg.smtp.user = s['smtp.user'] ?? cfg.smtp.user
  cfg.smtp.password = s['smtp.password'] ?? cfg.smtp.password
  cfg.seatsAeroKey = s.seatsAeroKey ?? cfg.seatsAeroKey
  return cfg
}

export function loadEffectiveConfig(db: DB, env: Record<string, string | undefined> = process.env): Config {
  return applyEnv(applySettings(defaultConfig(), getSettings(db)), env)
}
```

- [ ] **Step 4: Full suite green.** Note: `tests/server/app.test.ts` settings-endpoint tests may assert the old 8-key list — update expected key sets there (endpoint reshaping itself happens in Task 4; only the key list grows now).

- [ ] **Step 5: Commit** — `git commit -m "feat: DB-backed settings for every config key with env>DB>default precedence"`

---

### Task 3: Scanner generalization (rolling dates, excludedCountries, digest gating, key probe)

**Files:**
- Modify: `src/scanner/seatsaero.ts` (rolling window, `cfg.excludedCountries`, add `probeKey`)
- Modify: `src/scanner/run.ts` (gate digest on `digestReady`, always record alerts, refuse to scan unconfigured)
- Test: `tests/scanner/seatsaero.test.ts`, `tests/scanner/run.test.ts`

**Interfaces:**
- Consumes: `configComplete`, `digestReady` from Task 1.
- Produces:
  ```ts
  // seatsaero.ts
  export async function probeKey(key: string, fetchFn?: typeof fetch): Promise<{ ok: boolean; message: string }>
  ```
  `runScan` return shape unchanged: `{ scanId, snapshots, alerts, errors }`, plus new early-exit: if `!configComplete(cfg)` it returns `{ scanId: -1, snapshots: 0, alerts: 0, errors: ['not configured: missing seats.aero API key'] }` **without** opening a scan row.

- [ ] **Step 1: Add failing tests**

In `tests/scanner/seatsaero.test.ts`:

```ts
it('uses a rolling 12-month window, not hard-coded 2026', async () => {
  let captured = ''
  const fetchFn = (async (url: RequestInfo | URL) => {
    captured = String(url)
    return new Response(JSON.stringify({ data: [], hasMore: false }), { status: 200 })
  }) as typeof fetch
  await fetchAvailability(cfg, fetchFn)
  const params = new URL(captured).searchParams
  expect(params.get('start_date')).toBe(new Date().toISOString().slice(0, 10))
  const end = new Date(params.get('end_date')!)
  const days = (end.getTime() - Date.now()) / 86_400_000
  expect(days).toBeGreaterThan(360)
  expect(days).toBeLessThan(370)
})

it('respects cfg.excludedCountries instead of hard-coded Canada', async () => {
  let captured = ''
  const fetchFn = (async (url: RequestInfo | URL) => {
    captured = String(url)
    return new Response(JSON.stringify({ data: [], hasMore: false }), { status: 200 })
  }) as typeof fetch
  await fetchAvailability({ ...cfg, excludedCountries: [] }, fetchFn)
  const dests = new URL(captured).searchParams.get('destination_airport')!.split(',')
  expect(dests).toContain('YVR')  // Canadian airport allowed when exclusion list is empty
})

describe('probeKey', () => {
  it('ok on 200, structured failure on 401', async () => {
    const ok200 = (async () => new Response('{"data":[]}', { status: 200 })) as typeof fetch
    const no401 = (async () => new Response('nope', { status: 401 })) as typeof fetch
    expect((await probeKey('k', ok200)).ok).toBe(true)
    const bad = await probeKey('k', no401)
    expect(bad.ok).toBe(false)
    expect(bad.message).toMatch(/401/)
  })
})
```

In `tests/scanner/run.test.ts` (existing tests build a full env; add):

```ts
it('refuses to run without a seats.aero key', async () => {
  const r = await runScan({ env: { DB_PATH: ':memory:' } })
  expect(r.scanId).toBe(-1)
  expect(r.errors[0]).toMatch(/not configured/)
})

it('records alerts but skips email when digest is not configured', async () => {
  // env with SEATS_AERO_KEY but no GMAIL/SMTP vars; dryRun fixture path
  const r = await runScan({ dryRun: true, env: { SEATS_AERO_KEY: 'k', DB_PATH: ':memory:' } })
  expect(r.alerts).toBeGreaterThan(0)   // selection still runs
  // no throw, and errors contains no 'email:' entry
  expect(r.errors.find(e => e.startsWith('email:'))).toBeUndefined()
})
```

(Adapt the second test's DB handling to how existing run tests inject the DB — follow the file's existing pattern exactly.)

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

`src/scanner/seatsaero.ts` — in `fetchAvailability`:
```ts
const isoDay = (d: Date): string => d.toISOString().slice(0, 10)
// destinations filter:
.filter(a => a !== cfg.origin && !cfg.excludedCountries.includes(AIRPORT_CITY[a]?.country ?? ''))
// date params:
url.searchParams.set('start_date', isoDay(new Date()))
url.searchParams.set('end_date', isoDay(new Date(Date.now() + 365 * 86_400_000)))
```
Add at bottom (reuse `BASE`):
```ts
export async function probeKey(key: string, fetchFn: typeof fetch = fetch): Promise<{ ok: boolean; message: string }> {
  const url = new URL(`${BASE}/search`)
  url.searchParams.set('origin_airport', 'YYZ')
  url.searchParams.set('destination_airport', 'LHR')
  url.searchParams.set('start_date', new Date().toISOString().slice(0, 10))
  url.searchParams.set('end_date', new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10))
  url.searchParams.set('take', '1')
  try {
    const res = await fetchFn(url.toString(), { headers: { 'Partner-Authorization': key, Accept: 'application/json' } })
    if (res.ok) return { ok: true, message: 'seats.aero key accepted' }
    return { ok: false, message: `seats.aero rejected the key (HTTP ${res.status})` }
  } catch (err) {
    return { ok: false, message: `could not reach seats.aero: ${err}` }
  }
}
```

`src/scanner/run.ts`:
```ts
import { configComplete, digestReady, loadConfig, type Config } from '../core/config.js'
// at top of runScan, after loading cfg via loadEffectiveConfig:
if (!configComplete(cfg)) {
  return { scanId: -1, snapshots: 0, alerts: 0, errors: ['not configured: missing seats.aero API key'] }
}
```
(Note: open the DB first — effective config needs it — but bail before `startScan`.) In the digest block, keep alert selection and `recordAlerts` unconditional for full scans; wrap only the email send:
```ts
if (!opts.country) {
  alerts.push(...selectAlerts(db, scored, cfg))
  if (alerts.length > 0 || errors.length > 0) {
    if (!digestReady(cfg)) {
      console.log('[digest] skipped: email not configured or disabled')
    } else if (opts.dryRun) {
      console.log(`[dry-run] would email: ${subject}`)
    } else {
      try { await sendDigest(cfg, subject, html) } catch (err) { errors.push(`email: ${err}`) }
    }
    recordAlerts(db, scanId, alerts)
  }
}
```
(Build `html`/`subject` only when needed; keep existing subject logic verbatim.)

- [ ] **Step 4: Full suite green** — also run `npm run scan -- --dry-run` with `SEATS_AERO_KEY=x` set: pipeline completes from fixtures, logs the digest skip unless GMAIL vars present in `env.local`.

- [ ] **Step 5: Commit** — `git commit -m "feat: rolling scan window, configurable exclusions, digest gating, key probe"`

---

### Task 4: Server API (status, secret redaction, batch settings, test endpoints, direct spawn)

**Files:**
- Modify: `src/server/app.ts`
- Modify: `src/server/index.ts`
- Test: `tests/server/app.test.ts`

**Interfaces:**
- Consumes: `SECRET_KEYS`, `validateSetting`, `loadEffectiveConfig` (Task 2); `configComplete`, `digestReady` (Task 1); `probeKey` (Task 3); `MailTransport` type (digest.ts).
- Produces (HTTP contract the web tasks depend on):
  - `GET /api/status` → `{ configured: boolean, digestReady: boolean }`
  - `GET /api/settings` → `{ settings }` where secret keys have shape `{ secret: true, set: boolean, overridden: boolean }` (no value, no default) and all other keys keep `{ value, default, overridden }`.
  - `PUT /api/settings` accepts `{ key, value }` (unchanged) **or** `{ settings: Array<{ key: string, value: string | null }> }`; batch is all-or-nothing (validate everything first, then write in one better-sqlite3 transaction). Errors: `{ error, key }` 400.
  - `POST /api/test/seatsaero` body `{ key?: string }` → `{ ok, message }` (uses body key, else effective config key; 400 if neither).
  - `POST /api/test/email` body `{ smtp?: {host,port,user,password}, digestTo?: string }` → `{ ok, message }`. `createApp` opts gains `mailTransport?: (smtp: SmtpConfig) => MailTransport` and `probe?: typeof probeKey` for test injection.
  - `POST /api/scan` → 409 `{ error: 'not configured' }` when `!configComplete(loadEffectiveConfig(db, env))`.
- `src/server/index.ts`: `startScan` spawns `execFile('npx', ['tsx', 'src/scanner/index.ts', ...country args])` for **both** full and country scans — the `systemctl` branch is deleted. Port from `Number(process.env.PORT ?? 3000)`.

- [ ] **Step 1: Add failing tests to `tests/server/app.test.ts`** (follow the file's existing `createApp(db, {...})` + `app.request()` pattern):

```ts
describe('GET /api/status', () => {
  it('unconfigured DB → configured:false', async () => {
    const res = await app.request('/api/status')
    expect(await res.json()).toEqual({ configured: false, digestReady: false })
  })
  it('configured once key stored', async () => {
    putSetting(db, 'seatsAeroKey', 'k')
    const res = await app.request('/api/status')
    expect((await res.json()).configured).toBe(true)
  })
})

describe('secret handling', () => {
  it('GET /api/settings never returns secret values', async () => {
    putSetting(db, 'seatsAeroKey', 'super-secret')
    const { settings } = await (await app.request('/api/settings')).json()
    expect(JSON.stringify(settings)).not.toContain('super-secret')
    expect(settings.seatsAeroKey).toEqual({ secret: true, set: true, overridden: true })
    expect(settings['smtp.password']).toEqual({ secret: true, set: false, overridden: false })
  })
})

describe('PUT /api/settings batch', () => {
  it('writes all rows atomically', async () => {
    const res = await app.request('/api/settings', { method: 'PUT', body: JSON.stringify({ settings: [
      { key: 'seatsAeroKey', value: 'k1' }, { key: 'origin', value: 'YVR' },
    ] }), headers: { 'Content-Type': 'application/json' } })
    expect(res.status).toBe(200)
    expect(getSettings(db).origin).toBe('YVR')
  })
  it('rejects the whole batch on one invalid entry', async () => {
    const res = await app.request('/api/settings', { method: 'PUT', body: JSON.stringify({ settings: [
      { key: 'origin', value: 'YVR' }, { key: 'smtp.port', value: 'nope' },
    ] }), headers: { 'Content-Type': 'application/json' } })
    expect(res.status).toBe(400)
    expect((await res.json()).key).toBe('smtp.port')
    expect(getSettings(db).origin).toBeUndefined()
  })
})

describe('test endpoints', () => {
  it('POST /api/test/seatsaero proxies to injected probe', async () => {
    const appProbed = createApp(db, { probe: async () => ({ ok: true, message: 'yes' }) })
    const res = await appProbed.request('/api/test/seatsaero', { method: 'POST', body: JSON.stringify({ key: 'k' }), headers: { 'Content-Type': 'application/json' } })
    expect(await res.json()).toEqual({ ok: true, message: 'yes' })
  })
  it('POST /api/test/email sends via injected transport', async () => {
    const sent: unknown[] = []
    const appMail = createApp(db, { mailTransport: () => ({ sendMail: async o => { sent.push(o); return {} } }) })
    const res = await appMail.request('/api/test/email', { method: 'POST', body: JSON.stringify({
      smtp: { host: 'h', port: 465, user: 'u@x.c', password: 'p' }, digestTo: 't@x.c',
    }), headers: { 'Content-Type': 'application/json' } })
    expect((await res.json()).ok).toBe(true)
    expect(sent).toHaveLength(1)
  })
})

it('POST /api/scan → 409 when unconfigured', async () => {
  const res = await app.request('/api/scan', { method: 'POST' })
  expect(res.status).toBe(409)
})
```
(Existing scan tests that expect 200: give their fixture DB a `seatsAeroKey` row or pass `env: { SEATS_AERO_KEY: 'k' }`.)

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement in `src/server/app.ts`.** Key fragments:

```ts
import { configComplete, digestReady, type SmtpConfig } from '../core/config.js'
import { SETTING_KEYS, SECRET_KEYS, validateSetting, loadEffectiveConfig } from '../core/settings.js'
import { probeKey } from '../scanner/seatsaero.js'
import type { MailTransport } from '../scanner/digest.js'
import nodemailer from 'nodemailer'

// opts: { startScan?; env?; probe?; mailTransport? }
const probe = opts.probe ?? probeKey
const makeTransport = opts.mailTransport ?? ((smtp: SmtpConfig): MailTransport =>
  nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, auth: { user: smtp.user, pass: smtp.password } }))

app.get('/api/status', c => {
  const cfg = loadEffectiveConfig(db, env)
  return c.json({ configured: configComplete(cfg), digestReady: digestReady(cfg) })
})
```

`GET /api/settings`: replace the `pick` switch with a generic reader off `defaultConfig()`/effective config (a `valueOf(cfg, key)` helper mirroring `applySettings`'s key map — JSON keys are `JSON.stringify`ed for display); for `SECRET_KEYS` return `{ secret: true, set: <effective value !== ''>, overridden: key in overrides }`.

`PUT /api/settings`: if body has `settings` array → validate all (`{ error, key }` on first failure), then `db.transaction(...)` applying `putSetting`/`deleteSetting` per entry; keep the single-key path as-is.

Test endpoints:
```ts
app.post('/api/test/seatsaero', async c => {
  const body = await c.req.json().catch(() => ({})) as { key?: string }
  const key = body.key || loadEffectiveConfig(db, env).seatsAeroKey
  if (!key) return c.json({ ok: false, message: 'no key provided or stored' }, 400)
  return c.json(await probe(key))
})

app.post('/api/test/email', async c => {
  const body = await c.req.json().catch(() => ({})) as { smtp?: Partial<SmtpConfig>; digestTo?: string }
  const cfg = loadEffectiveConfig(db, env)
  const smtp = { ...cfg.smtp, ...body.smtp }
  const to = body.digestTo || cfg.digestTo
  if (!smtp.user || !smtp.password || !to) return c.json({ ok: false, message: 'smtp user, password, and recipient required' }, 400)
  try {
    await makeTransport(smtp).sendMail({ from: `Flight Checks <${smtp.user}>`, to, subject: 'Flight Checks test email', html: '<p>It works ✅</p>' })
    return c.json({ ok: true, message: `sent to ${to}` })
  } catch (err) { return c.json({ ok: false, message: String(err) }) }
})
```

`POST /api/scan`: before the concurrency check, `if (!configComplete(loadEffectiveConfig(db, env))) return c.json({ error: 'not configured' }, 409)`.

`src/server/index.ts`:
```ts
const startScan = (country?: string): void => {
  execFile('npx', country ? ['tsx', 'src/scanner/index.ts', '--country', country] : ['tsx', 'src/scanner/index.ts'])
}
serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000), hostname: '0.0.0.0' })
```

- [ ] **Step 4: Full suite green.**
- [ ] **Step 5: Commit** — `git commit -m "feat: status endpoint, secret redaction, batch settings, connection tests, direct scan spawn"`

---

### Task 5: In-process scheduler

**Files:**
- Create: `src/server/scheduler.ts`
- Modify: `src/server/index.ts` (wire it), `src/server/app.ts` (call `opts.onSettingsChanged?.()` after successful PUT)
- Test: `tests/server/scheduler.test.ts`

**Interfaces:**
- Consumes: `ScanSchedule` type (Task 1).
- Produces:
  ```ts
  export function nextRunAt(schedule: ScanSchedule, now: Date): Date
  export function startScheduler(opts: {
    getSchedule: () => ScanSchedule
    fire: () => void
    enabled?: boolean            // default true; SCHEDULER=off maps to false
  }): { refresh: () => void; stop: () => void; next: () => Date | null }
  ```
- `createApp` opts gains `onSettingsChanged?: () => void`, invoked after any successful settings write (single or batch); `index.ts` passes `scheduler.refresh`.

- [ ] **Step 1: Write `tests/server/scheduler.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextRunAt, startScheduler } from '../../src/server/scheduler.js'

const SCHED = { times: ['07:00', '19:00'], timezone: 'America/Edmonton' }

describe('nextRunAt', () => {
  it('picks the next time later today (MDT = UTC-6)', () => {
    // 2026-07-29 10:00 MDT == 16:00 UTC → next is 19:00 MDT == 2026-07-30T01:00Z
    const next = nextRunAt(SCHED, new Date('2026-07-29T16:00:00Z'))
    expect(next.toISOString()).toBe('2026-07-30T01:00:00.000Z')
  })
  it('rolls to tomorrow morning after the last slot', () => {
    // 20:00 MDT → next is 07:00 MDT tomorrow == 13:00Z
    const next = nextRunAt(SCHED, new Date('2026-07-30T02:00:00Z'))
    expect(next.toISOString()).toBe('2026-07-30T13:00:00.000Z')
  })
  it('handles the MST/MDT switch (Nov 1 2026, clocks back)', () => {
    // Oct 31 2026 20:00 MDT (Nov 1 02:00Z) → next 07:00 local is MST (UTC-7) == 14:00Z
    const next = nextRunAt(SCHED, new Date('2026-11-01T02:00:00Z'))
    expect(next.toISOString()).toBe('2026-11-01T14:00:00.000Z')
  })
})

describe('startScheduler', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('fires at the scheduled time and re-arms', () => {
    vi.setSystemTime(new Date('2026-07-29T16:00:00Z'))
    const fired: number[] = []
    const s = startScheduler({ getSchedule: () => SCHED, fire: () => fired.push(Date.now()) })
    vi.advanceTimersByTime(9 * 3600_000)   // → 01:00Z, first fire
    expect(fired).toHaveLength(1)
    expect(s.next()!.toISOString()).toBe('2026-07-30T13:00:00.000Z')  // re-armed
    s.stop()
  })
  it('refresh() re-reads the schedule', () => {
    vi.setSystemTime(new Date('2026-07-29T16:00:00Z'))
    let sched = SCHED
    const s = startScheduler({ getSchedule: () => sched, fire: () => {} })
    sched = { times: ['18:00'], timezone: 'America/Edmonton' }
    s.refresh()
    expect(s.next()!.toISOString()).toBe('2026-07-30T00:00:00.000Z')
    s.stop()
  })
  it('enabled:false never arms', () => {
    const s = startScheduler({ getSchedule: () => SCHED, fire: () => {}, enabled: false })
    expect(s.next()).toBeNull()
    s.stop()
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (module doesn't exist).

- [ ] **Step 3: Create `src/server/scheduler.ts`**

```ts
import type { ScanSchedule } from '../core/config.js'

function tzOffsetMs(ts: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const p = Object.fromEntries(dtf.formatToParts(new Date(ts)).map(x => [x.type, x.value]))
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
  return asUtc - ts
}

// UTC instant for wall-clock y-m-d hh:mm in timeZone (double-adjust for DST edges)
function zonedTimeToUtc(y: number, m: number, d: number, hh: number, mm: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  let ts = guess - tzOffsetMs(guess, timeZone)
  const offset = tzOffsetMs(ts, timeZone)
  if (guess - offset !== ts) ts = guess - offset
  return new Date(ts)
}

export function nextRunAt(schedule: ScanSchedule, now: Date): Date {
  const dayParts = (ts: number): { y: number; m: number; d: number } => {
    const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: schedule.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    const p = Object.fromEntries(dtf.formatToParts(new Date(ts)).map(x => [x.type, x.value]))
    return { y: +p.year, m: +p.month, d: +p.day }
  }
  const candidates: Date[] = []
  for (let offset = 0; offset <= 2; offset++) {
    const { y, m, d } = dayParts(now.getTime() + offset * 86_400_000)
    for (const t of schedule.times) {
      const [hh, mm] = t.split(':').map(Number)
      candidates.push(zonedTimeToUtc(y, m, d, hh, mm, schedule.timezone))
    }
  }
  return candidates.filter(c => c.getTime() > now.getTime()).sort((a, b) => a.getTime() - b.getTime())[0]
}

export function startScheduler(opts: {
  getSchedule: () => ScanSchedule
  fire: () => void
  enabled?: boolean
}): { refresh: () => void; stop: () => void; next: () => Date | null } {
  const enabled = opts.enabled ?? true
  let timer: NodeJS.Timeout | null = null
  let nextAt: Date | null = null
  const arm = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    nextAt = null
    if (!enabled) return
    nextAt = nextRunAt(opts.getSchedule(), new Date())
    timer = setTimeout(() => {
      try { opts.fire() } catch (err) { console.error('[scheduler] fire failed:', err) }
      arm()
    }, nextAt.getTime() - Date.now())
    timer.unref?.()
  }
  arm()
  return { refresh: arm, stop: () => { if (timer) clearTimeout(timer) }, next: () => nextAt }
}
```

- [ ] **Step 4: Wire it.**
  - `src/server/app.ts`: add `onSettingsChanged?: () => void` to opts; call it after every successful `putSetting`/`deleteSetting`/batch commit in `PUT /api/settings`.
  - `src/server/index.ts`:
    ```ts
    import { startScheduler } from './scheduler.js'
    import { loadEffectiveConfig } from '../core/settings.js'
    const scheduler = startScheduler({
      getSchedule: () => loadEffectiveConfig(db).scanSchedule,
      fire: () => startScan(),
      enabled: process.env.SCHEDULER !== 'off',
    })
    const app = createApp(db, { startScan, onSettingsChanged: scheduler.refresh })
    console.log(`flight-checks on http://0.0.0.0:${port} — next scan: ${scheduler.next()?.toISOString() ?? 'scheduler off'}`)
    ```

- [ ] **Step 5: Full suite green, then commit** — `git commit -m "feat: in-process timezone-aware scan scheduler"`

---

### Task 6: Setup wizard (web)

**Files:**
- Create: `src/web/Wizard.tsx`
- Modify: `src/web/api.ts` (status + batch + test clients), `src/web/App.tsx` (status gate)

**Interfaces:**
- Consumes HTTP contract from Task 4. New api.ts exports:
  ```ts
  export interface Status { configured: boolean; digestReady: boolean }
  export const fetchStatus = () => get<Status>('/api/status')
  export const putSettingsBatch = (settings: Array<{ key: string; value: string | null }>) =>
    send('/api/settings', 'PUT', { settings })
  export const testSeatsAero = (key: string) =>
    fetch('/api/test/seatsaero', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) }).then(r => r.json()) as Promise<{ ok: boolean; message: string }>
  export const testEmail = (smtp: { host: string; port: number; user: string; password: string }, digestTo: string) =>
    fetch('/api/test/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ smtp, digestTo }) }).then(r => r.json()) as Promise<{ ok: boolean; message: string }>
  ```
- Produces: `<Wizard onDone={() => void} />` — full-screen 3-step onboarding. No new CSS framework; reuse classes from `src/web/styles.css` and add a `.wizard` block there.

- [ ] **Step 1: Implement `src/web/Wizard.tsx`**

```tsx
import { useState } from 'react'
import { putSettingsBatch, testSeatsAero, testEmail } from './api.js'

const DEFAULT_RATIOS: Record<string, number> = { aeroplan: 1, british: 1, flyingblue: 0.75, delta: 0.75, etihad: 0.75 }

export function Wizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [key, setKey] = useState('')
  const [origin, setOrigin] = useState('YYC')
  const [program, setProgram] = useState('Amex MR (Canada)')
  const [balance, setBalance] = useState('220000')
  const [currency, setCurrency] = useState('CAD')
  const [ratios, setRatios] = useState<Array<[string, string]>>(Object.entries(DEFAULT_RATIOS).map(([k, v]) => [k, String(v)]))
  const [wantEmail, setWantEmail] = useState(false)
  const [smtp, setSmtp] = useState({ host: 'smtp.gmail.com', port: '465', user: '', password: '' })
  const [digestTo, setDigestTo] = useState('')

  const testKey = async () => {
    setBusy(true)
    const r = await testSeatsAero(key).catch(e => ({ ok: false, message: String(e) }))
    setMsg({ ok: r.ok, text: r.message }); setBusy(false)
  }
  const testMail = async () => {
    setBusy(true)
    const r = await testEmail({ ...smtp, port: Number(smtp.port) }, digestTo).catch(e => ({ ok: false, message: String(e) }))
    setMsg({ ok: r.ok, text: r.message }); setBusy(false)
  }
  const finish = async () => {
    setBusy(true)
    const settings: Array<{ key: string; value: string | null }> = [
      { key: 'seatsAeroKey', value: key },
      { key: 'origin', value: origin.toUpperCase() },
      { key: 'pointsProgram', value: program },
      { key: 'pointsBalance', value: balance },
      { key: 'currency', value: currency },
      { key: 'ratios', value: JSON.stringify(Object.fromEntries(ratios.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), Number(v)]))) },
      { key: 'digestEnabled', value: wantEmail ? 'true' : 'false' },
    ]
    if (wantEmail) settings.push(
      { key: 'smtp.host', value: smtp.host }, { key: 'smtp.port', value: smtp.port },
      { key: 'smtp.user', value: smtp.user }, { key: 'smtp.password', value: smtp.password },
      { key: 'digestTo', value: digestTo },
    )
    try { await putSettingsBatch(settings); onDone() }
    catch (e) { setMsg({ ok: false, text: String(e) }) }
    setBusy(false)
  }

  return (
    <div className="wizard">
      <h1>✈️ flight-checks</h1>
      <p className="wizard-sub">Award-flight deal watcher. Three steps and you're scanning.</p>
      <div className="wizard-steps">{[1, 2, 3].map(n => <span key={n} className={n === step ? 'active' : n < step ? 'done' : ''}>{n}</span>)}</div>

      {step === 1 && <section>
        <h2>Connect seats.aero</h2>
        <label>Partner API key <input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="pro_..." /></label>
        <label>Home airport <input value={origin} onChange={e => setOrigin(e.target.value)} maxLength={3} placeholder="YYC" /></label>
        <div className="wizard-actions">
          <button disabled={!key || busy} onClick={testKey}>Test connection</button>
          <button disabled={!key || !/^[A-Za-z]{3}$/.test(origin)} onClick={() => { setMsg(null); setStep(2) }}>Next ▶</button>
        </div>
      </section>}

      {step === 2 && <section>
        <h2>Your points</h2>
        <label>Program name <input value={program} onChange={e => setProgram(e.target.value)} /></label>
        <label>Balance <input type="number" value={balance} onChange={e => setBalance(e.target.value)} /></label>
        <label>Currency label <input value={currency} onChange={e => setCurrency(e.target.value)} maxLength={3} /></label>
        <h3>Transfer ratios <small>(seats.aero source → points per program mile)</small></h3>
        {ratios.map(([k, v], i) => (
          <div key={i} className="ratio-row">
            <input value={k} onChange={e => setRatios(r => r.map((x, j) => j === i ? [e.target.value, x[1]] : x))} />
            <input type="number" step="0.05" value={v} onChange={e => setRatios(r => r.map((x, j) => j === i ? [x[0], e.target.value] : x))} />
            <button onClick={() => setRatios(r => r.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button onClick={() => setRatios(r => [...r, ['', '1']])}>+ add program</button>
        <div className="wizard-actions">
          <button onClick={() => setStep(1)}>◀ Back</button>
          <button disabled={ratios.filter(([k]) => k.trim()).length === 0} onClick={() => { setMsg(null); setStep(3) }}>Next ▶</button>
        </div>
      </section>}

      {step === 3 && <section>
        <h2>Email digest <small>(optional)</small></h2>
        <label className="check"><input type="checkbox" checked={wantEmail} onChange={e => setWantEmail(e.target.checked)} /> Email me a digest after each scheduled scan</label>
        {wantEmail && <>
          <label>SMTP host <input value={smtp.host} onChange={e => setSmtp(s => ({ ...s, host: e.target.value }))} /></label>
          <label>Port <input type="number" value={smtp.port} onChange={e => setSmtp(s => ({ ...s, port: e.target.value }))} /></label>
          <label>User <input value={smtp.user} onChange={e => setSmtp(s => ({ ...s, user: e.target.value }))} /></label>
          <label>Password <input type="password" value={smtp.password} onChange={e => setSmtp(s => ({ ...s, password: e.target.value }))} /></label>
          <label>Send digest to <input value={digestTo} onChange={e => setDigestTo(e.target.value)} /></label>
          <button disabled={busy || !smtp.user || !smtp.password || !digestTo} onClick={testMail}>Send test email</button>
        </>}
        <div className="wizard-actions">
          <button onClick={() => setStep(2)}>◀ Back</button>
          <button disabled={busy} onClick={finish}>Finish ✔</button>
        </div>
      </section>}

      {msg && <p className={msg.ok ? 'wizard-ok' : 'wizard-err'}>{msg.text}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Gate in `App.tsx`.** On mount, `fetchStatus()`; while loading render nothing; if `!status.configured` render `<Wizard onDone={() => fetchStatus().then(setStatus)} />` instead of the tab shell. After `onDone`, the normal dashboard mounts and its existing initial loads run.

- [ ] **Step 3: Styles.** Add a `.wizard` block to `src/web/styles.css` consistent with existing look (centered max-width 560px card, stacked labels, step dots via `.wizard-steps span.active`). Reuse existing button/input styling.

- [ ] **Step 4: Verify.** `npx vitest run` green; `npm run build` succeeds; manual check: `rm -f /tmp/wiz.db; DB_PATH=/tmp/wiz.db npm run serve` → browser shows wizard; completing step 1-3 with a dummy key lands on the dashboard (scan will 401 later, fine); restart server → dashboard (not wizard) because settings persisted.

- [ ] **Step 5: Commit** — `git commit -m "feat: first-run setup wizard"`

---

### Task 7: Settings tab expansion

**Files:**
- Modify: `src/web/App.tsx` (SettingsTab), `src/web/api.ts` (`SettingEntry` union)

**Interfaces:**
- Consumes: Task 4's `GET /api/settings` shape. Update `SettingEntry`:
  ```ts
  export type SettingEntry =
    | { value: number | string; default: number | string; overridden: boolean }
    | { secret: true; set: boolean; overridden: boolean }
  ```

- [ ] **Step 1: Extend SettingsTab** to render every key from the response, grouped: **Scanning** (`origin`, `excludedCountries`, `scanSchedule`, `maxPerRoute`), **Points** (`pointsProgram`, `pointsBalance`, `currency`, `ratios`), **Thresholds** (4 numeric + `alertImprovement`), **Email** (`digestEnabled`, `digestTo`, `smtp.*`), **Connection** (`seatsAeroKey`). Rules:
  - Secret keys render a password input with placeholder `••••• (set)` / `not set`; saving sends the new value only if non-empty; a "clear" button sends `value: null`.
  - JSON keys (`ratios`, `excludedCountries`, `scanSchedule`) render as a textarea containing pretty-printed JSON; save sends the raw string (server validates).
  - Keep the existing per-key save/reset interaction pattern already in SettingsTab — extend, don't redesign.
- [ ] **Step 2: Verify** — suite green, `npm run build` green, manual: change `scanSchedule` in the UI, server log's next-scan time updates after refresh (scheduler.refresh via `onSettingsChanged`).
- [ ] **Step 3: Commit** — `git commit -m "feat: settings tab covers all config keys incl. secrets"`

---

### Task 8: Docker + .env.example

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.env.example`
- Modify: `package.json` (move `tsx` from devDependencies to dependencies; metadata fixes)

**Interfaces:** none consumed by code; produces the canonical install path documented in Task 9.

- [ ] **Step 1: `package.json` edits** — move `"tsx"` to `dependencies`; set `"license": "MIT"`, `"description": "Self-hosted award-flight deal watcher — seats.aero scanner, cents-per-point scoring, email digests, React dashboard"`, `"repository": { "type": "git", "url": "https://github.com/wajahathussain81/flight-checks" }`, `"keywords": ["award-travel", "seats-aero", "self-hosted", "points", "miles"]`, `"author": "Wajahat Hussain"`, `"engines": { "node": ">=22" }`; delete `"main"` and `"directories"`. Run `npm install` to sync the lockfile.

- [ ] **Step 2: `Dockerfile`**

```dockerfile
FROM node:22 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DB_PATH=/data/flights.db
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json tsconfig.json ./
COPY src ./src
EXPOSE 3000
CMD ["node", "node_modules/.bin/tsx", "src/server/index.ts"]
```

- [ ] **Step 3: `docker-compose.yml`**

```yaml
services:
  flight-checks:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
    environment:
      - TZ=${TZ:-UTC}
    restart: unless-stopped
```

- [ ] **Step 4: `.dockerignore`**

```
node_modules
dist
data
env.local
.git
docs
*.md
```

- [ ] **Step 5: `.env.example`** (root; every var optional — the wizard covers all of it):

```bash
# All of these are OPTIONAL — the setup wizard stores config in the database.
# Env vars OVERRIDE wizard/database values; set them only for headless installs.

# SEATS_AERO_KEY=            # seats.aero Partner API key
# ORIGIN=YYC                 # home airport (IATA)
# DB_PATH=data/flights.db
# PORT=3000
# SCHEDULER=on               # 'off' disables the built-in scan scheduler

# SMTP_HOST=smtp.gmail.com   # legacy GMAIL_USER / GMAIL_APP_PASSWORD also accepted
# SMTP_PORT=465
# SMTP_USER=
# SMTP_PASSWORD=
# DIGEST_TO=

# POINTS_BALANCE=            # legacy MR_BALANCE also accepted
# MIN_VALUE_ECONOMY=400
# MIN_VALUE_PREMIUM=1200
# MAX_PER_ROUTE=3
```

- [ ] **Step 6: Verify** — `npx vitest run` green; if Docker is available locally run `docker build -t flight-checks .` (if the docker CLI is unavailable, note it in the task report — CI does not build images; the final integration task verifies on the container host if possible).

- [ ] **Step 7: Commit** — `git commit -m "feat: Dockerfile, compose file, env example; package metadata"`

---### Task 9: Contributor infrastructure + docs overhaul

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`
- Modify: `README.md` (rewrite), `CLAUDE.md` (trim), `.gitignore` (add `CLAUDE.local.md`), `deploy/` (remove scan units), `deploy/deploy.sh`, `deploy/env.example`
- Create (gitignored): `CLAUDE.local.md`

- [ ] **Step 1: `.github/workflows/ci.yml`**

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx vitest run
      - run: npm run build
```
Run `npx tsc --noEmit` locally FIRST; if there are pre-existing type errors, fix them in this task (they must be zero before the workflow lands).

- [ ] **Step 2: Issue/PR templates.**
  - `bug_report.yml`: YAML form — fields: what happened (textarea, required), expected behavior (textarea), how are you running it (dropdown: docker compose / npm / other), logs (textarea, render: shell).
  - `feature_request.yml`: problem statement (textarea, required), proposed solution (textarea), alternatives considered (textarea).
  - `PULL_REQUEST_TEMPLATE.md`: checklist — `npx vitest run` green; no live API calls in tests; secrets untouched; description of change + motivation.

- [ ] **Step 3: `CONTRIBUTING.md`** — sections: Dev setup (`npm install`, `npm run scan -- --dry-run`, `npm run serve`, `npx vitest run`); Architecture map (one paragraph per `src/` dir, lifted from README); Rules (mock fetch/mail in tests — never hit live APIs; secrets never in git; snapshots append-only; conventional-ish commit prefixes); How to add a region/airport (edit `src/core/regions.ts` maps: `AIRPORT_REGION`, `AIRPORT_CITY`, `COUNTRY_CONTINENT`, cash tables — with a 4-line example); PR flow (fork → branch → CI green → review).

- [ ] **Step 4: `CODE_OF_CONDUCT.md`** — Contributor Covenant v2.1 standard text, contact method: GitHub issues to the maintainer.

- [ ] **Step 5: `README.md` rewrite.** Structure (write real prose, keep the existing diagram and scoring section, drop personal framing like "for 2026 travel" and the fixed YYC wording):
  1. Title + one-paragraph pitch ("watches award availability from YOUR home airport…").
  2. Screenshot placeholder: `![dashboard](docs/screenshot.png)` with an HTML comment `<!-- TODO(maintainer): drop in a real screenshot -->` — this is the only allowed TODO.
  3. **Quick start**: `git clone … && cd flight-checks && docker compose up -d` → open `http://localhost:3000` → the setup wizard walks through seats.aero key, home airport, points program, optional email digest. Second variant: bare Node (`npm install && npm run serve`). Note: needs a seats.aero Pro subscription for the Partner API.
  4. How it works (keep current diagram; update systemd mention → built-in scheduler).
  5. Scoring rules (keep, generalized wording: "cents per point of YOUR program").
  6. Configuration reference: table of setting keys + env vars from `.env.example`, precedence note (env > UI settings > defaults).
  7. Deployment notes: docker compose (canonical), bare node + systemd unit example (web service only), `SCHEDULER=off` + external cron alternative.
  8. Contributing → link CONTRIBUTING.md; License → MIT.

- [ ] **Step 6: `CLAUDE.md` trim + `CLAUDE.local.md`.** Remove from `CLAUDE.md`: the Deployment section's homelab specifics (LXC number, Proxmox host, ssh alias, container paths, journalctl command) and the "User's balance: ~220k MR" sentence. Replace the Deployment section with: docker compose is canonical; `deploy/` holds an example systemd web unit; scheduler is in-process. Update Architecture section: scan trigger is a direct child-process spawn (no systemctl); settings cover all config incl. secrets (write-only). Add line: "Maintainer-specific deployment notes live in `CLAUDE.local.md` (gitignored)." Create `CLAUDE.local.md` containing the removed homelab content verbatim; add `CLAUDE.local.md` to `.gitignore`.

- [ ] **Step 7: `deploy/` cleanup.** Delete `flight-checks-scan.service` and `flight-checks-scan.timer`. In `deploy.sh`: remove references to them; add `ssh` step `systemctl disable --now flight-checks-scan.timer 2>/dev/null || true` (one-time migration); keep web service install/restart. Update `deploy/env.example` to match `.env.example` (add a note that on an already-configured host, config env vars shadow wizard settings — trim to `DB_PATH` + secrets if you want the UI to govern).

- [ ] **Step 8: Verify** — `npx vitest run`, `npm run build`, `npx tsc --noEmit` all green. `git grep -iE 'proxmox|lxc|homelab|ssh flight-checks|192\.168'` returns nothing tracked (CLAUDE.local.md is ignored).

- [ ] **Step 9: Commit** — `git commit -m "docs: contributor infrastructure, CI, README overhaul, homelab notes extracted"`

---

### Task 10: Integration, PR, release

**Files:** none new (verification + release mechanics)

- [ ] **Step 1: Full local verification** on `open-source-app`: `npx vitest run` && `npx tsc --noEmit` && `npm run build` && `SEATS_AERO_KEY=x npm run scan -- --dry-run`. Fresh-boot check: `rm -f /tmp/fresh.db; DB_PATH=/tmp/fresh.db PORT=3100 npm run serve &` → `curl -s localhost:3100/api/status` → `{"configured":false,...}`; kill it.
- [ ] **Step 2: Push + PR.** `git push -u origin open-source-app`; open PR to `main` titled "Open-source release: setup wizard, DB config, Docker, contributor infra" with a summary of the four pillars. **No AI attribution in the PR body.**
- [ ] **Step 3: CI green.** Watch `gh pr checks --watch`. Fix failures on the branch until green.
- [ ] **Step 4: Merge** (squash or merge per user preference — ask if unclear), then on main: `gh repo edit wajahathussain81/flight-checks --add-topic award-travel --add-topic self-hosted --add-topic seats-aero --add-topic points --add-topic typescript --add-topic miles`.
- [ ] **Step 5: Deploy to the maintainer's container** (best-effort; requires LAN/VPN): `./deploy/deploy.sh`, then `ssh flight-checks "systemctl disable --now flight-checks-scan.timer; systemctl restart flight-checks-web"` and `curl http://<container-ip>:3000/api/status` → `configured: true` (env file has the key). If unreachable, report and leave as a follow-up.
- [ ] **Step 6: Update memory/docs.** Note in the final report: container env file now shadows wizard settings for the keys it sets; recommend trimming it to `DB_PATH` + secrets.

---

## Self-review notes

- Spec coverage: config model → Tasks 1-2; wizard → Tasks 4, 6; secrets → Tasks 2, 4, 7; scheduler/Docker → Tasks 5, 8; systemctl removal → Task 4; contributor infra/README/CLAUDE trim → Task 9; repo metadata/deploy → Task 10. Rolling date window (spec's "usable by anyone" implication, found hard-coded 2026 in seatsaero.ts) → Task 3.
- Type consistency: `Config` shape defined once in Task 1 and echoed in every consumer task's Interfaces block; `SettingEntry` union updated in Task 7 to match Task 4's redaction shape.
- Known judgment calls delegated to workers: exact styles.css rules (Task 6), SettingsTab layout details (Task 7), README prose polish (Task 9) — all bounded by explicit structure lists above.
