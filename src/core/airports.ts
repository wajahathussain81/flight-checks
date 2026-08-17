import data from './airports.data.json' with { type: 'json' }

export interface AirportInfo {
  city: string
  /** ISO 3166-1 alpha-2, e.g. "CA". Use countryName() for the settings-facing name. */
  country: string
  continent: string
  lat: number
  lon: number
}

const AIRPORTS = data as Record<string, AirportInfo>

export function airportInfo(code: string): AirportInfo | undefined {
  return AIRPORTS[code]
}

const toRad = (deg: number): number => (deg * Math.PI) / 180
const EARTH_RADIUS_KM = 6371

export interface AirportSuggestion { code: string; city: string; country: string; continent: string }

/** Typeahead lookup by IATA code or city, ranked exact-code > code-prefix > city-prefix > city-substring. */
export function searchAirports(query: string, limit = 8): AirportSuggestion[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const ranked: Array<[number, AirportSuggestion]> = []
  for (const [code, info] of Object.entries(AIRPORTS)) {
    const lowerCode = code.toLowerCase()
    const lowerCity = info.city.toLowerCase()
    let rank: number | undefined
    if (lowerCode === q) rank = 0
    else if (lowerCode.startsWith(q)) rank = 1
    else if (lowerCity.startsWith(q)) rank = 2
    else if (lowerCity.includes(q)) rank = 3
    if (rank !== undefined) ranked.push([rank, { code, city: info.city, country: info.country, continent: info.continent }])
  }
  ranked.sort((a, b) => a[0] - b[0] || a[1].code.localeCompare(b[1].code))
  return ranked.slice(0, limit).map(([, suggestion]) => suggestion)
}

export function distanceKm(a: string, b: string): number | undefined {
  const from = AIRPORTS[a]
  const to = AIRPORTS[b]
  if (!from || !to) return undefined
  const dLat = toRad(to.lat - from.lat)
  const dLon = toRad(to.lon - from.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}
