import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { defaultConfig } from '../../src/core/config.js'
import { fetchBulkAvailability } from '../../src/scanner/seatsaero.js'

const fixture = JSON.parse(readFileSync('tests/fixtures/availability-aeroplan.json', 'utf8'))

// Declare the url parameter so mock.calls entries are typed [url, init?] and
// assertions on the requested URL typecheck.
const mockFetch = (body: unknown) =>
  vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status: 200 }))

describe('fetchBulkAvailability', () => {
  it('keeps only rows departing a configured origin', async () => {
    const cfg = { ...defaultConfig(), ratios: { aeroplan: 1 } }
    const { rows } = await fetchBulkAvailability(cfg, mockFetch(fixture) as unknown as typeof fetch)
    const origins = [...new Set(rows.map(r => r.route.split('-')[0]))]
    expect(origins.sort()).toEqual(['LAX', 'YYC'])
  })

  it('queries the availability endpoint once per program per origin continent', async () => {
    const cfg = { ...defaultConfig(), ratios: { aeroplan: 1 } }
    const fetchFn = mockFetch(fixture)
    await fetchBulkAvailability(cfg, fetchFn as unknown as typeof fetch)
    const urls = fetchFn.mock.calls.map(c => String(c[0]))
    expect(urls.every(u => u.includes('/partnerapi/availability'))).toBe(true)
    expect(urls.every(u => u.includes('source=aeroplan'))).toBe(true)
    expect(urls.some(u => u.includes('origin_region=North+America'))).toBe(true)
  })

  it('reports a program as truncated when the page cap is hit', async () => {
    const cfg = { ...defaultConfig(), ratios: { aeroplan: 1 }, maxPagesPerProgram: 1 }
    const alwaysMore = mockFetch({ ...fixture, hasMore: true })
    const { truncated } = await fetchBulkAvailability(cfg, alwaysMore as unknown as typeof fetch)
    expect(truncated).toContain('aeroplan')
  })

  it('reports a failure rather than returning an empty result silently', async () => {
    const cfg = { ...defaultConfig(), ratios: { aeroplan: 1 } }
    const unauthorized = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response('bad_partner_key', { status: 401 }))
    const { rows, failures } = await fetchBulkAvailability(cfg, unauthorized as unknown as typeof fetch)
    expect(rows).toEqual([])
    // A scan that pulled nothing because auth failed must be distinguishable from
    // one that genuinely found nothing.
    expect(failures.length).toBeGreaterThan(0)
    expect(failures.join(' ')).toContain('aeroplan')
  })

  it('skips a failing program without failing the run', async () => {
    const cfg = { ...defaultConfig(), ratios: { aeroplan: 1, delta: 1 } }
    let call = 0
    const flaky = vi.fn(async () => {
      call++
      return call === 1
        ? new Response('boom', { status: 500 })
        : new Response(JSON.stringify(fixture), { status: 200 })
    })
    const { rows } = await fetchBulkAvailability(cfg, flaky as unknown as typeof fetch)
    expect(rows.length).toBeGreaterThan(0)
  })
})
