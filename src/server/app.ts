import { Hono } from 'hono'
import { getSettings, getDealStatuses, setDealStatus, putSetting, deleteSetting, alertKey, type DB } from '../core/db.js'
import { SETTING_KEYS, validateSetting, loadEffectiveConfig } from '../core/settings.js'
import { loadConfig } from '../core/config.js'
import { AIRPORT_CITY, airportLabel, COUNTRY_CONTINENT, continentOf } from '../core/regions.js'

interface SnapshotRow {
  id: number; scan_id: number; route: string; date: string; cabin: string; program: string
  miles: number; taxes_cad: number; cash_cad: number; economy_cash_cad: number | null
  mr_points: number; cpp_raw: number; cpp_conservative: number; seats: number; direct: number
}

const rankOf = (d: SnapshotRow): number => (d.cabin === 'economy' ? d.cpp_raw : d.cpp_conservative)
const destOf = (route: string): string => route.split('-')[1]

export function createApp(
  db: DB,
  opts: { startScan?: (country?: string) => void; env?: Record<string, string | undefined> } = {},
): Hono {
  const env = opts.env ?? process.env
  const app = new Hono()

  app.get('/api/deals', c => {
    const q = c.req.query()
    const latest = db.prepare(
      "SELECT id FROM scans WHERE finished_at IS NOT NULL AND (scope = 'full' OR scope = ?) ORDER BY id DESC LIMIT 1",
    ).get(q.country ?? '') as { id: number } | undefined
    if (!latest) return c.json({ deals: [] })
    let rows = db.prepare('SELECT * FROM snapshots WHERE scan_id = ?').all(latest.id) as SnapshotRow[]
    if (q.cabin) rows = rows.filter(d => d.cabin === q.cabin)
    if (q.month) rows = rows.filter(d => d.date.startsWith(q.month))
    if (q.minCpp) rows = rows.filter(d => rankOf(d) >= Number(q.minCpp))
    if (q.country) rows = rows.filter(d => AIRPORT_CITY[destOf(d.route)]?.country === q.country)
    if (q.continent) rows = rows.filter(d => continentOf(AIRPORT_CITY[destOf(d.route)]?.country ?? '') === q.continent)
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
    const continents = [...new Set(countries.map(continentOf))].sort()
    const countryContinents = Object.fromEntries(countries.map(cn => [cn, continentOf(cn)]))
    return c.json({ countries, continents, countryContinents, mrBalance: loadEffectiveConfig(db, env).mrBalance })
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
