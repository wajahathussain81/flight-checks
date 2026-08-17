import { Hono } from 'hono'
import { getSettings, getDealStatuses, setDealStatus, putSetting, deleteSetting, alertKey, type DB } from '../core/db.js'
import { SETTING_KEYS, SECRET_KEYS, validateSetting, loadEffectiveConfig, type SettingKey } from '../core/settings.js'
import { defaultConfig, configComplete, digestReady, type Config, type SmtpConfig } from '../core/config.js'
import {
  AIRPORT_CITY, airportLabel, continentOf, continentOfAirport, COUNTRY_CONTINENT, countryOf,
} from '../core/regions.js'
import {
  createWatch, deleteWatch, getWatch, listWatches, matchWatch, updateWatch,
  validateWatchInput, watchState, type WatchInput,
} from '../core/watches.js'
import { probeKey, fetchSearch } from '../scanner/seatsaero.js'
import type { MailTransport } from '../scanner/digest.js'
import nodemailer from 'nodemailer'
import { estimateCashFares } from '../scanner/pricing.js'
import { scoreDeal, rankingCpp } from '../core/valuation.js'
import { explainEmpty } from '../core/coverage.js'
import { searchAirports } from '../core/airports.js'

interface SnapshotRow {
  id: number; scan_id: number; route: string; date: string; cabin: string; program: string
  miles: number; taxes_cad: number; cash_cad: number; economy_cash_cad: number | null
  mr_points: number; cpp_raw: number; cpp_conservative: number; seats: number; direct: number
}

const rankOf = (d: SnapshotRow): number => (d.cabin === 'economy' ? d.cpp_raw : d.cpp_conservative)
const destOf = (route: string): string => route.split('-')[1]
const todayIso = (): string => new Date().toISOString().slice(0, 10)
const curatedCodes = new Set(Object.keys(AIRPORT_CITY))

const valueOf = (cfg: Config, key: SettingKey): number | string | boolean => {
  switch (key) {
    case 'thresholds.economy': return cfg.thresholds.economy
    case 'thresholds.premiumConservative': return cfg.thresholds.premiumConservative
    case 'minValue.economy': return cfg.minValue.economy
    case 'minValue.premium': return cfg.minValue.premium
    case 'maxPerRoute': return cfg.maxPerRoute
    case 'pointsBalance': return cfg.pointsBalance
    case 'alertImprovement': return cfg.alertImprovement
    case 'digestTo': return cfg.digestTo
    case 'origin': return cfg.origin
    case 'pointsProgram': return cfg.pointsProgram
    case 'currency': return cfg.currency
    case 'excludedCountries': return JSON.stringify(cfg.excludedCountries)
    case 'ratios': return JSON.stringify(cfg.ratios)
    case 'scanSchedule': return JSON.stringify(cfg.scanSchedule)
    case 'digestEnabled': return cfg.digestEnabled
    case 'smtp.host': return cfg.smtp.host
    case 'smtp.port': return cfg.smtp.port
    case 'smtp.user': return cfg.smtp.user
    case 'seatsAeroKey': return cfg.seatsAeroKey
    case 'smtp.password': return cfg.smtp.password
  }
}

export function createApp(
  db: DB,
  opts: {
    startScan?: (country?: string) => void
    onSettingsChanged?: () => void
    env?: Record<string, string | undefined>
    probe?: typeof probeKey
    mailTransport?: (smtp: SmtpConfig) => MailTransport
  } = {},
): Hono {
  const env = opts.env ?? process.env
  const probe = opts.probe ?? probeKey
  const makeTransport = opts.mailTransport ?? ((smtp: SmtpConfig): MailTransport =>
    nodemailer.createTransport({
      host: smtp.host, port: smtp.port, secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.password },
    }))
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
    if (q.country) rows = rows.filter(d => countryOf(destOf(d.route)) === q.country)
    if (q.continent) rows = rows.filter(d => continentOfAirport(destOf(d.route)) === q.continent)
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
    // Countries you can actually filter to: everything seen in scanned data, unioned
    // with the curated list so the dropdown is populated before the first scan.
    const seen = db.prepare('SELECT DISTINCT route FROM snapshots').all() as Array<{ route: string }>
    const seenCountries = seen.map(r => countryOf(destOf(r.route))).filter(Boolean)
    const curated = Object.values(AIRPORT_CITY).map(i => i.country)
    const countries = [...new Set([...curated, ...seenCountries])].sort()
    const continents = [...new Set(countries.map(continentOf))].sort()
    const countryContinents = Object.fromEntries(countries.map(cn => [cn, continentOf(cn)]))
    const origins = loadEffectiveConfig(db, env).origins.map(o => o.code)
    return c.json({ countries, continents, countryContinents, pointsBalance: loadEffectiveConfig(db, env).pointsBalance, origins })
  })

  app.get('/api/airports', c => {
    const q = c.req.query('q') ?? ''
    return c.json({ airports: searchAirports(q, 8, curatedCodes) })
  })

  app.get('/api/status', c => {
    const cfg = loadEffectiveConfig(db, env)
    return c.json({ configured: configComplete(cfg), digestReady: digestReady(cfg) })
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

  app.get('/api/settings', c => {
    const base = defaultConfig()
    const eff = loadEffectiveConfig(db, env)
    const overrides = getSettings(db)
    const settings = Object.fromEntries(SETTING_KEYS.map(k => {
      const overridden = k in overrides
      if ((SECRET_KEYS as readonly string[]).includes(k)) {
        return [k, { secret: true, set: valueOf(eff, k) !== '', overridden }]
      }
      return [k, { value: valueOf(eff, k), default: valueOf(base, k), overridden }]
    }))
    return c.json({ settings })
  })

  app.put('/api/settings', async c => {
    const body = await c.req.json().catch(() => null) as {
      key?: string
      value?: string | null
      settings?: Array<{ key: string; value: string | null }>
    } | null
    if (Array.isArray(body?.settings)) {
      for (const setting of body.settings) {
        const err = setting.value === null
          ? (!(SETTING_KEYS as readonly string[]).includes(setting.key) ? `unknown setting: ${setting.key}` : null)
          : validateSetting(setting.key, String(setting.value))
        if (err) return c.json({ error: err, key: setting.key }, 400)
      }
      db.transaction((settings: Array<{ key: string; value: string | null }>) => {
        for (const setting of settings) {
          if (setting.value === null) deleteSetting(db, setting.key)
          else putSetting(db, setting.key, String(setting.value))
        }
      })(body.settings)
      opts.onSettingsChanged?.()
      return c.json({ ok: true })
    }
    if (!body?.key) return c.json({ error: 'key required' }, 400)
    if (body.value === null || body.value === undefined) {
      if (!(SETTING_KEYS as readonly string[]).includes(body.key)) return c.json({ error: `unknown setting: ${body.key}` }, 400)
      deleteSetting(db, body.key)
      opts.onSettingsChanged?.()
      return c.json({ ok: true })
    }
    const err = validateSetting(body.key, String(body.value))
    if (err) return c.json({ error: err }, 400)
    putSetting(db, body.key, String(body.value))
    opts.onSettingsChanged?.()
    return c.json({ ok: true })
  })

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
    if (!smtp.user || !smtp.password || !to) {
      return c.json({ ok: false, message: 'smtp user, password, and recipient required' }, 400)
    }
    try {
      await makeTransport(smtp).sendMail({
        from: `Flight Checks <${smtp.user}>`,
        to,
        subject: 'Flight Checks test email',
        html: '<p>It works ✅</p>',
      })
      return c.json({ ok: true, message: `sent to ${to}` })
    } catch (err) {
      return c.json({ ok: false, message: String(err) })
    }
  })

  app.post('/api/scan', async c => {
    const body = await c.req.json().catch(() => null) as { country?: string } | null
    const country = body?.country
    if (country && !(country in COUNTRY_CONTINENT)) return c.json({ error: `unknown country: ${country}` }, 400)
    if (!configComplete(loadEffectiveConfig(db, env))) return c.json({ error: 'not configured' }, 409)
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

  app.post('/api/search', async c => {
    const body = await c.req.json().catch(() => null) as {
      origin?: string; destination?: string; dateFrom?: string; dateTo?: string; cabins?: string[]
    } | null
    if (!body?.origin || !body.destination || !body.dateFrom || !body.dateTo) {
      return c.json({ error: 'origin, destination, dateFrom and dateTo are required' }, 400)
    }

    const cfg = loadEffectiveConfig(db, env)
    let rows
    try {
      rows = await fetchSearch(cfg, body.origin, body.destination, body.dateFrom, body.dateTo)
    } catch (err) {
      return c.json({ error: `seats.aero request failed: ${err}` }, 502)
    }

    const positioningCad = cfg.origins.find(o => o.code === body.origin)?.positioningCad ?? 0
    const deals = rows
      .filter(r => !body.cabins?.length || body.cabins.includes(r.cabin))
      .map(r => {
        const fares = estimateCashFares(r.route, r.cabin)
        return scoreDeal(r, fares.cashCad, fares.economyCashCad, cfg.ratios[r.program] ?? 1, positioningCad)
      })
      .sort((a, b) => rankingCpp(b) - rankingCpp(a))

    if (deals.length === 0) {
      return c.json({ deals: [], explanation: explainEmpty(db, body.origin, body.destination) })
    }
    return c.json({ deals })
  })

  app.get('/api/scans', c => {
    const scans = db.prepare('SELECT * FROM scans ORDER BY id DESC LIMIT 50').all()
    return c.json({ scans })
  })

  return app
}
