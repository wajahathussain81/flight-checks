// Curated trip-vibe tags for every destination in AIRPORT_REGION.
// Same static-metadata philosophy as regions.ts — no external lookups.
export const THEMES = ['beach', 'city', 'nature'] as const
export type Theme = (typeof THEMES)[number]

export const AIRPORT_THEMES: Record<string, Theme[]> = {
  // North America
  YYZ: ['city'], YVR: ['city', 'nature'], YYC: ['city', 'nature'], YUL: ['city'],
  YEG: ['city'], YOW: ['city'], YWG: ['city'], YHZ: ['city', 'nature'],
  JFK: ['city'], EWR: ['city'], LGA: ['city'], LAX: ['city', 'beach'],
  SFO: ['city'], SEA: ['city', 'nature'], ORD: ['city'], DFW: ['city'],
  DEN: ['city', 'nature'], PHX: ['city', 'nature'], LAS: ['city'], MIA: ['city', 'beach'],
  MCO: ['city'], BOS: ['city'], IAD: ['city'], ATL: ['city'],
  HNL: ['beach', 'nature'], OGG: ['beach', 'nature'], ANC: ['nature'],
  // Europe
  LHR: ['city'], LGW: ['city'], CDG: ['city'], AMS: ['city'], FRA: ['city'], MUC: ['city'],
  ZRH: ['city', 'nature'], GVA: ['city', 'nature'], VIE: ['city'], CPH: ['city'],
  ARN: ['city'], OSL: ['city', 'nature'], HEL: ['city', 'nature'], DUB: ['city'],
  EDI: ['city'], MAD: ['city'], BCN: ['city', 'beach'], LIS: ['city', 'beach'],
  FCO: ['city'], MXP: ['city'], ATH: ['city', 'beach'], IST: ['city', 'beach'],
  WAW: ['city'], PRG: ['city'], BRU: ['city'], KEF: ['nature'],
  // Asia + Middle East
  NRT: ['city'], HND: ['city'], KIX: ['city'], ICN: ['city'], PEK: ['city'], PVG: ['city'],
  HKG: ['city'], TPE: ['city'], BKK: ['city', 'beach'], SIN: ['city'],
  KUL: ['city', 'beach'], CGK: ['city', 'beach'], MNL: ['city', 'beach'], SGN: ['city'],
  HAN: ['city', 'nature'], DEL: ['city'], BOM: ['city'], DXB: ['city', 'beach'],
  AUH: ['city', 'beach'], DOH: ['city'], TLV: ['city', 'beach'],
  // Latin America + Caribbean
  MEX: ['city'], CUN: ['beach'], SJD: ['beach'], PVR: ['beach'],
  GRU: ['city'], GIG: ['city', 'beach'], EZE: ['city'], SCL: ['city', 'nature'],
  LIM: ['city'], BOG: ['city'], PTY: ['city', 'beach'], SJO: ['nature', 'beach'],
  MBJ: ['beach'], PUJ: ['beach'], NAS: ['beach'], BGI: ['beach'],
  // Oceania
  SYD: ['city', 'beach'], MEL: ['city'], BNE: ['city', 'beach'], AKL: ['city', 'nature'],
  NAN: ['beach'], PPT: ['beach', 'nature'],
}
