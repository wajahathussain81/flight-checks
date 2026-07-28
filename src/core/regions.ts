import type { Cabin } from './types.js'

export const AIRPORT_REGION: Record<string, string> = {
  // North America
  YYZ: 'na', YVR: 'na-short', YYC: 'na', YUL: 'na', YEG: 'na-short', YOW: 'na', YWG: 'na-short', YHZ: 'na',
  JFK: 'na', EWR: 'na', LGA: 'na', LAX: 'na', SFO: 'na', SEA: 'na-short', ORD: 'na', DFW: 'na',
  DEN: 'na-short', PHX: 'na', LAS: 'na-short', MIA: 'na', MCO: 'na', BOS: 'na', IAD: 'na', ATL: 'na',
  HNL: 'na', OGG: 'na', ANC: 'na',
  // Europe
  LHR: 'europe', LGW: 'europe', CDG: 'europe', AMS: 'europe', FRA: 'europe', MUC: 'europe',
  ZRH: 'europe', GVA: 'europe', VIE: 'europe', CPH: 'europe', ARN: 'europe', OSL: 'europe',
  HEL: 'europe', DUB: 'europe', EDI: 'europe', MAD: 'europe', BCN: 'europe', LIS: 'europe',
  FCO: 'europe', MXP: 'europe', ATH: 'europe', IST: 'europe', WAW: 'europe', PRG: 'europe',
  BRU: 'europe', KEF: 'europe',
  // Asia + Middle East
  NRT: 'asia', HND: 'asia', KIX: 'asia', ICN: 'asia', PEK: 'asia', PVG: 'asia', HKG: 'asia',
  TPE: 'asia', BKK: 'asia', SIN: 'asia', KUL: 'asia', CGK: 'asia', MNL: 'asia', SGN: 'asia',
  HAN: 'asia', DEL: 'asia', BOM: 'asia', DXB: 'asia', AUH: 'asia', DOH: 'asia', TLV: 'asia',
  // Latin America + Caribbean
  MEX: 'mexico-carib', CUN: 'mexico-carib', SJD: 'mexico-carib', PVR: 'mexico-carib', GRU: 'latam', GIG: 'latam',
  EZE: 'latam', SCL: 'latam', LIM: 'latam', BOG: 'latam', PTY: 'mexico-carib', SJO: 'mexico-carib',
  MBJ: 'mexico-carib', PUJ: 'mexico-carib', NAS: 'mexico-carib', BGI: 'mexico-carib',
  // Oceania
  SYD: 'oceania', MEL: 'oceania', BNE: 'oceania', AKL: 'oceania', NAN: 'oceania', PPT: 'oceania',
}

export function regionOf(iata: string): string {
  return AIRPORT_REGION[iata] ?? 'other'
}

export const AIRPORT_CITY: Record<string, { city: string; country: string }> = {
  YYZ: { city: 'Toronto', country: 'Canada' }, YVR: { city: 'Vancouver', country: 'Canada' },
  YYC: { city: 'Calgary', country: 'Canada' }, YUL: { city: 'Montreal', country: 'Canada' },
  YEG: { city: 'Edmonton', country: 'Canada' }, YOW: { city: 'Ottawa', country: 'Canada' },
  YWG: { city: 'Winnipeg', country: 'Canada' }, YHZ: { city: 'Halifax', country: 'Canada' },
  JFK: { city: 'New York', country: 'USA' }, EWR: { city: 'Newark', country: 'USA' },
  LGA: { city: 'New York', country: 'USA' }, LAX: { city: 'Los Angeles', country: 'USA' },
  SFO: { city: 'San Francisco', country: 'USA' }, SEA: { city: 'Seattle', country: 'USA' },
  ORD: { city: 'Chicago', country: 'USA' }, DFW: { city: 'Dallas', country: 'USA' },
  DEN: { city: 'Denver', country: 'USA' }, PHX: { city: 'Phoenix', country: 'USA' },
  LAS: { city: 'Las Vegas', country: 'USA' }, MIA: { city: 'Miami', country: 'USA' },
  MCO: { city: 'Orlando', country: 'USA' }, BOS: { city: 'Boston', country: 'USA' },
  IAD: { city: 'Washington', country: 'USA' }, ATL: { city: 'Atlanta', country: 'USA' },
  HNL: { city: 'Honolulu', country: 'USA' }, OGG: { city: 'Maui', country: 'USA' },
  ANC: { city: 'Anchorage', country: 'USA' },
  LHR: { city: 'London', country: 'UK' }, LGW: { city: 'London', country: 'UK' },
  CDG: { city: 'Paris', country: 'France' }, AMS: { city: 'Amsterdam', country: 'Netherlands' },
  FRA: { city: 'Frankfurt', country: 'Germany' }, MUC: { city: 'Munich', country: 'Germany' },
  ZRH: { city: 'Zurich', country: 'Switzerland' }, GVA: { city: 'Geneva', country: 'Switzerland' },
  VIE: { city: 'Vienna', country: 'Austria' }, CPH: { city: 'Copenhagen', country: 'Denmark' },
  ARN: { city: 'Stockholm', country: 'Sweden' }, OSL: { city: 'Oslo', country: 'Norway' },
  HEL: { city: 'Helsinki', country: 'Finland' }, DUB: { city: 'Dublin', country: 'Ireland' },
  EDI: { city: 'Edinburgh', country: 'UK' }, MAD: { city: 'Madrid', country: 'Spain' },
  BCN: { city: 'Barcelona', country: 'Spain' }, LIS: { city: 'Lisbon', country: 'Portugal' },
  FCO: { city: 'Rome', country: 'Italy' }, MXP: { city: 'Milan', country: 'Italy' },
  ATH: { city: 'Athens', country: 'Greece' }, IST: { city: 'Istanbul', country: 'Turkey' },
  WAW: { city: 'Warsaw', country: 'Poland' }, PRG: { city: 'Prague', country: 'Czechia' },
  BRU: { city: 'Brussels', country: 'Belgium' }, KEF: { city: 'Reykjavik', country: 'Iceland' },
  NRT: { city: 'Tokyo', country: 'Japan' }, HND: { city: 'Tokyo', country: 'Japan' },
  KIX: { city: 'Osaka', country: 'Japan' }, ICN: { city: 'Seoul', country: 'South Korea' },
  PEK: { city: 'Beijing', country: 'China' }, PVG: { city: 'Shanghai', country: 'China' },
  HKG: { city: 'Hong Kong', country: 'Hong Kong' }, TPE: { city: 'Taipei', country: 'Taiwan' },
  BKK: { city: 'Bangkok', country: 'Thailand' }, SIN: { city: 'Singapore', country: 'Singapore' },
  KUL: { city: 'Kuala Lumpur', country: 'Malaysia' }, CGK: { city: 'Jakarta', country: 'Indonesia' },
  MNL: { city: 'Manila', country: 'Philippines' }, SGN: { city: 'Ho Chi Minh City', country: 'Vietnam' },
  HAN: { city: 'Hanoi', country: 'Vietnam' }, DEL: { city: 'Delhi', country: 'India' },
  BOM: { city: 'Mumbai', country: 'India' }, DXB: { city: 'Dubai', country: 'UAE' },
  AUH: { city: 'Abu Dhabi', country: 'UAE' }, DOH: { city: 'Doha', country: 'Qatar' },
  TLV: { city: 'Tel Aviv', country: 'Israel' },
  MEX: { city: 'Mexico City', country: 'Mexico' }, CUN: { city: 'Cancun', country: 'Mexico' },
  SJD: { city: 'Los Cabos', country: 'Mexico' }, PVR: { city: 'Puerto Vallarta', country: 'Mexico' },
  GRU: { city: 'Sao Paulo', country: 'Brazil' }, GIG: { city: 'Rio de Janeiro', country: 'Brazil' },
  EZE: { city: 'Buenos Aires', country: 'Argentina' }, SCL: { city: 'Santiago', country: 'Chile' },
  LIM: { city: 'Lima', country: 'Peru' }, BOG: { city: 'Bogota', country: 'Colombia' },
  PTY: { city: 'Panama City', country: 'Panama' }, SJO: { city: 'San Jose', country: 'Costa Rica' },
  MBJ: { city: 'Montego Bay', country: 'Jamaica' }, PUJ: { city: 'Punta Cana', country: 'Dominican Republic' },
  NAS: { city: 'Nassau', country: 'Bahamas' }, BGI: { city: 'Bridgetown', country: 'Barbados' },
  SYD: { city: 'Sydney', country: 'Australia' }, MEL: { city: 'Melbourne', country: 'Australia' },
  BNE: { city: 'Brisbane', country: 'Australia' }, AKL: { city: 'Auckland', country: 'New Zealand' },
  NAN: { city: 'Nadi', country: 'Fiji' }, PPT: { city: 'Papeete', country: 'French Polynesia' },
}

export function airportLabel(iata: string): string {
  const info = AIRPORT_CITY[iata]
  return info ? `${info.city}, ${info.country}` : iata
}

export const COUNTRY_CONTINENT: Record<string, string> = {
  Canada: 'North America', USA: 'North America',
  Mexico: 'Caribbean & Central America', Panama: 'Caribbean & Central America',
  'Costa Rica': 'Caribbean & Central America', Jamaica: 'Caribbean & Central America',
  'Dominican Republic': 'Caribbean & Central America', Bahamas: 'Caribbean & Central America',
  Barbados: 'Caribbean & Central America',
  Brazil: 'South America', Argentina: 'South America', Chile: 'South America',
  Peru: 'South America', Colombia: 'South America',
  UK: 'Europe', France: 'Europe', Netherlands: 'Europe', Germany: 'Europe',
  Switzerland: 'Europe', Austria: 'Europe', Denmark: 'Europe', Sweden: 'Europe',
  Norway: 'Europe', Finland: 'Europe', Ireland: 'Europe', Spain: 'Europe',
  Portugal: 'Europe', Italy: 'Europe', Greece: 'Europe', Turkey: 'Europe',
  Poland: 'Europe', Czechia: 'Europe', Belgium: 'Europe', Iceland: 'Europe',
  Japan: 'Asia & Middle East', 'South Korea': 'Asia & Middle East', China: 'Asia & Middle East',
  'Hong Kong': 'Asia & Middle East', Taiwan: 'Asia & Middle East', Thailand: 'Asia & Middle East',
  Singapore: 'Asia & Middle East', Malaysia: 'Asia & Middle East', Indonesia: 'Asia & Middle East',
  Philippines: 'Asia & Middle East', Vietnam: 'Asia & Middle East', India: 'Asia & Middle East',
  UAE: 'Asia & Middle East', Qatar: 'Asia & Middle East', Israel: 'Asia & Middle East',
  Australia: 'Oceania', 'New Zealand': 'Oceania', Fiji: 'Oceania', 'French Polynesia': 'Oceania',
}

export function continentOf(country: string): string {
  return COUNTRY_CONTINENT[country] ?? 'Other'
}

// "Best plausible" cash fares from YYC, used only to discard hopeless rows cheaply.
export const OPTIMISTIC_CASH_CAD: Record<string, Record<Cabin, number>> = {
  'na-short': { economy: 400, premium: 650, business: 1000, first: 1500 },
  'mexico-carib': { economy: 700, premium: 1100, business: 1900, first: 2800 },
  na:      { economy: 700,  premium: 1200, business: 2500, first: 3500 },
  europe:  { economy: 1400, premium: 2200, business: 5000, first: 8000 },
  asia:    { economy: 1800, premium: 2800, business: 6500, first: 11000 },
  latam:   { economy: 1200, premium: 2000, business: 4500, first: 6000 },
  oceania: { economy: 2000, premium: 3000, business: 7000, first: 10000 },
  other:   { economy: 1500, premium: 2400, business: 5500, first: 8000 },
}

// Typical (median-ish) one-way fares from YYC, used for scoring cash comps.
// Static stand-in for a live pricing API (Amadeus Self-Service shut down 2026-07-17).
export const TYPICAL_CASH_CAD: Record<string, Record<Cabin, number>> = {
  'na-short': { economy: 250, premium: 400, business: 600, first: 900 },
  'mexico-carib': { economy: 450, premium: 700, business: 1200, first: 1800 },
  na:      { economy: 450,  premium: 800,  business: 1600, first: 2300 },
  europe:  { economy: 950,  premium: 1500, business: 3300, first: 5300 },
  asia:    { economy: 1200, premium: 1900, business: 4300, first: 7300 },
  latam:   { economy: 800,  premium: 1300, business: 3000, first: 4000 },
  oceania: { economy: 1300, premium: 2000, business: 4700, first: 6700 },
  other:   { economy: 1000, premium: 1600, business: 3700, first: 5300 },
}

// Used when seats.aero has no usable taxes for a row.
export const TAX_ESTIMATE_CAD: Record<string, number> = {
  'na-short': 60,
  'mexico-carib': 90,
  na: 80, europe: 250, asia: 130, latam: 110, oceania: 150, other: 150,
}
