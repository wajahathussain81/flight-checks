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
