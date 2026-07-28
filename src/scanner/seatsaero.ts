import type { Config } from '../core/config.js'
import type { AwardRow, Cabin } from '../core/types.js'
import { regionOf, TAX_ESTIMATE_CAD, AIRPORT_REGION, AIRPORT_CITY } from '../core/regions.js'

const BASE = 'https://seats.aero/partnerapi'

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
  // International only: skip the origin and all Canadian destinations.
  const destinations = Object.keys(AIRPORT_REGION)
    .filter(a => a !== cfg.origin && AIRPORT_CITY[a]?.country !== 'Canada')
    .filter(a => !country || AIRPORT_CITY[a]?.country === country)
    .join(',')
  const take = 1000
  const maxPages = 100 // runaway guard: ~12 pages observed live with the sources filter
  let skip = 0
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${BASE}/search`)
    url.searchParams.set('origin_airport', cfg.origin)
    url.searchParams.set('destination_airport', destinations)
    url.searchParams.set('start_date', '2026-01-01')
    url.searchParams.set('end_date', '2026-12-31')
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
