import type { Config } from '../core/config.js'
import type { AwardRow, Cabin } from '../core/types.js'
import { regionOf, TAX_ESTIMATE_CAD, AIRPORT_REGION, countryOf } from '../core/regions.js'
import { airportInfo } from '../core/airports.js'

const BASE = 'https://seats.aero/partnerapi'
const isoDay = (d: Date): string => d.toISOString().slice(0, 10)

const CABIN_FIELDS: Array<{ cabin: Cabin; prefix: 'Y' | 'W' | 'J' | 'F' }> = [
  { cabin: 'economy', prefix: 'Y' },
  { cabin: 'premium', prefix: 'W' },
  { cabin: 'business', prefix: 'J' },
  { cabin: 'first', prefix: 'F' },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseCachedSearch(json: any, cfg: Config): AwardRow[] {
  const out: AwardRow[] = []
  for (const item of json?.data ?? []) {
    const program: string | undefined = item?.Route?.Source
    if (!program || !(program in cfg.ratios)) continue
    const origin = item.Route.OriginAirport
    const dest = item.Route.DestinationAirport
    const route = `${origin}-${dest}`
    for (const { cabin, prefix } of CABIN_FIELDS) {
      if (!item[`${prefix}Available`]) continue
      const miles = Number(item[`${prefix}MileageCost`])
      if (!miles) continue
      const taxesRaw = Number(item[`${prefix}TotalTaxes`] ?? 0)
      const taxesCad = taxesRaw > 0 && item.TaxesCurrency === 'CAD'
        ? taxesRaw / 100
        : TAX_ESTIMATE_CAD[regionOf(dest)]
      out.push({
        route,
        date: item.Date,
        cabin,
        program,
        miles,
        taxesCad,
        seats: Number(item[`${prefix}RemainingSeats`] ?? 0) || 1,
        direct: Boolean(item[`${prefix}Direct`]),
      })
    }
  }
  return out
}

export async function fetchAvailability(cfg: Config, fetchFn: typeof fetch = fetch, country?: string): Promise<AwardRow[]> {
  const rows: AwardRow[] = []
  // Cached search returns nothing without explicit destinations.
  // Skip the origin and destinations in excluded countries.
  const destinations = Object.keys(AIRPORT_REGION)
    .filter(a => a !== cfg.origin && !cfg.excludedCountries.includes(countryOf(a)))
    .filter(a => !country || countryOf(a) === country)
    .join(',')
  const take = 1000
  const maxPages = 100 // runaway guard: ~12 pages observed live with the sources filter
  let skip = 0
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${BASE}/search`)
    url.searchParams.set('origin_airport', cfg.origin)
    url.searchParams.set('destination_airport', destinations)
    url.searchParams.set('start_date', isoDay(new Date()))
    url.searchParams.set('end_date', isoDay(new Date(Date.now() + 365 * 86_400_000)))
    url.searchParams.set('take', String(take))
    url.searchParams.set('sources', Object.keys(cfg.ratios).join(','))
    if (skip > 0) url.searchParams.set('skip', String(skip))
    const res = await fetchFn(url.toString(), {
      headers: { 'Partner-Authorization': cfg.seatsAeroKey, Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`seats.aero ${res.status}: ${await res.text()}`)
    const json = await res.json()
    rows.push(...parseCachedSearch(json, cfg))
    if (!json.hasMore) break
    skip += take
  }
  return rows
}

export async function fetchSearch(
  cfg: Config, origin: string, destination: string, startDate: string, endDate: string,
  fetchFn: typeof fetch = fetch,
): Promise<AwardRow[]> {
  const rows: AwardRow[] = []
  const take = 500
  let skip = 0
  for (let page = 0; page < cfg.maxPagesPerProgram; page++) {
    const url = new URL(`${BASE}/search`)
    url.searchParams.set('origin_airport', origin)
    url.searchParams.set('destination_airport', destination)
    url.searchParams.set('start_date', startDate)
    url.searchParams.set('end_date', endDate)
    url.searchParams.set('take', String(take))
    url.searchParams.set('sources', Object.keys(cfg.ratios).join(','))
    if (skip > 0) url.searchParams.set('skip', String(skip))
    const res = await fetchFn(url.toString(), {
      headers: { 'Partner-Authorization': cfg.seatsAeroKey, Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`seats.aero ${res.status}: ${await res.text()}`)
    const json = await res.json()
    rows.push(...parseCachedSearch(json, cfg))
    if (!json.hasMore) break
    skip += take
  }
  return rows
}

export async function fetchBulkAvailability(
  cfg: Config,
  fetchFn: typeof fetch = fetch,
): Promise<{ rows: AwardRow[]; truncated: string[] }> {
  const originCodes = new Set(cfg.origins.map(o => o.code))
  const regions = [...new Set(
    cfg.origins.map(o => airportInfo(o.code)?.continent).filter((c): c is string => Boolean(c)),
  )]
  const rows: AwardRow[] = []
  const truncated: string[] = []
  const take = 500

  for (const program of Object.keys(cfg.ratios)) {
    let hitCap = false
    for (const region of regions) {
      let skip = 0
      for (let page = 0; page < cfg.maxPagesPerProgram; page++) {
        const url = new URL(`${BASE}/availability`)
        url.searchParams.set('source', program)
        url.searchParams.set('origin_region', region)
        url.searchParams.set('take', String(take))
        url.searchParams.set('skip', String(skip))
        let json: { hasMore?: boolean }
        try {
          const res = await fetchFn(url.toString(), {
            headers: { 'Partner-Authorization': cfg.seatsAeroKey, Accept: 'application/json' },
          })
          if (!res.ok) throw new Error(`seats.aero ${res.status}`)
          json = await res.json()
        } catch {
          break // skip this program/region; one bad response must not fail the scan
        }
        rows.push(...parseCachedSearch(json, cfg).filter(r => originCodes.has(r.route.split('-')[0])))
        if (!json.hasMore) break
        skip += take
        if (page === cfg.maxPagesPerProgram - 1) hitCap = true
      }
    }
    if (hitCap) truncated.push(program)
  }
  return { rows, truncated }
}

export async function fetchRoutes(
  cfg: Config, source: string, fetchFn: typeof fetch = fetch,
): Promise<Array<{ origin: string; destination: string }>> {
  const url = new URL(`${BASE}/routes`)
  url.searchParams.set('source', source)
  const res = await fetchFn(url.toString(), {
    headers: { 'Partner-Authorization': cfg.seatsAeroKey, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`seats.aero ${res.status}`)
  const json = await res.json() as { data?: Array<{ OriginAirport: string; DestinationAirport: string }> }
  return (json.data ?? []).map(r => ({ origin: r.OriginAirport, destination: r.DestinationAirport }))
}

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
