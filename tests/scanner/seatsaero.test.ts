import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseCachedSearch, fetchAvailability, probeKey } from '../../src/scanner/seatsaero.js'
import { loadConfig } from '../../src/core/config.js'

const cfg = loadConfig({
  SEATS_AERO_KEY: 'sk1',
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
    const page1 = { ...fixture, hasMore: true }
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
    expect(decodeURIComponent(calls[0])).toContain('destination_airport=JFK')
    expect(decodeURIComponent(calls[0])).not.toMatch(/destination_airport=[^&]*YYC/)
    expect(decodeURIComponent(calls[0])).not.toMatch(/destination_airport=[^&]*(YYZ|YVR|YUL|YEG|YOW|YWG|YHZ)/)
    expect(calls[0]).toContain('sources=aeroplan')
    expect(calls[0]).not.toContain('skip=')
    expect(calls[1]).toContain('skip=1000')
    expect(rows).toHaveLength(4) // 3 from page1 + 1 from page2
  })

  it('throws on non-200', async () => {
    const fakeFetch = (async () => new Response('nope', { status: 401 })) as typeof fetch
    await expect(fetchAvailability(cfg, fakeFetch)).rejects.toThrow('401')
  })

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
    expect(dests).toContain('YVR')
  })
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
