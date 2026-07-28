import { describe, it, expect, beforeEach } from 'vitest'
import { createApp } from '../../src/server/app.js'
import { openDb, startScan, finishScan, insertSnapshots, putSetting, setDealStatus, type DB } from '../../src/core/db.js'
import type { ScoredDeal } from '../../src/core/types.js'

const ENV = { SEATS_AERO_KEY: 'sk1', GMAIL_USER: 'hl@gmail.com', GMAIL_APP_PASSWORD: 'gp', DIGEST_TO: 'me@example.com' }

const deal = (over: Partial<ScoredDeal> = {}): ScoredDeal => ({
  route: 'YYC-LHR', date: '2026-05-14', cabin: 'business', program: 'aeroplan',
  miles: 70000, taxesCad: 150, seats: 2, direct: true,
  cashCad: 9000, economyCashCad: 1000, mrPoints: 70000, cppRaw: 12.64, cppConservative: 4.07,
  ...over,
})
const stats = { rowsPulled: 10, finalists: 2, errors: [] }

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
