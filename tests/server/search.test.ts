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
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: [] }), { status: 200 })))
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
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: [] }), { status: 200 })))
    await post(createApp(db), {
      origin: 'YYC', destination: 'CUN', dateFrom: '2027-03-10', dateTo: '2027-04-15',
    })
    const n = db.prepare('SELECT COUNT(*) AS n FROM snapshots').get() as { n: number }
    expect(n.n).toBe(0)
    vi.unstubAllGlobals()
  })

  it('surfaces an upstream error instead of an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response('nope', { status: 503 })))
    const res = await post(createApp(openDb(':memory:')), {
      origin: 'YYC', destination: 'CUN', dateFrom: '2027-03-10', dateTo: '2027-04-15',
    })
    expect(res.status).toBe(502)
    vi.unstubAllGlobals()
  })
})
