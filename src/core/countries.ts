// ISO 3166-1 alpha-2 to the country names used in settings and watches.
const NAMES: Record<string, string> = {
  CA: 'Canada', US: 'USA', MX: 'Mexico', GB: 'UK', IE: 'Ireland',
  FR: 'France', DE: 'Germany', NL: 'Netherlands', ES: 'Spain', PT: 'Portugal',
  IT: 'Italy', CH: 'Switzerland', AT: 'Austria', IS: 'Iceland', GR: 'Greece',
  TR: 'Turkey', IL: 'Israel', AE: 'UAE', QA: 'Qatar', SA: 'Saudi Arabia',
  IN: 'India', LK: 'Sri Lanka', MV: 'Maldives', TH: 'Thailand', VN: 'Vietnam',
  SG: 'Singapore', MY: 'Malaysia', ID: 'Indonesia', PH: 'Philippines',
  HK: 'Hong Kong', TW: 'Taiwan', JP: 'Japan', KR: 'South Korea', CN: 'China',
  AU: 'Australia', NZ: 'New Zealand', FJ: 'Fiji', PF: 'French Polynesia',
  BR: 'Brazil', AR: 'Argentina', CL: 'Chile', PE: 'Peru', CO: 'Colombia',
  PA: 'Panama', CR: 'Costa Rica', JM: 'Jamaica', DO: 'Dominican Republic',
  BS: 'Bahamas', BB: 'Barbados', CU: 'Cuba', ZA: 'South Africa',
  EG: 'Egypt', MA: 'Morocco', KE: 'Kenya', ET: 'Ethiopia',
  DK: 'Denmark', SE: 'Sweden', NO: 'Norway', FI: 'Finland', PL: 'Poland',
  CZ: 'Czechia', BE: 'Belgium',
}

export const COUNTRY_CODES: readonly string[] = Object.keys(NAMES)

export function countryName(isoCode: string): string {
  return NAMES[isoCode] ?? isoCode
}
