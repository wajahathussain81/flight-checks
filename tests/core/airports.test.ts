import { describe, expect, it } from 'vitest'
import { airportInfo, distanceKm, searchAirports } from '../../src/core/airports.js'
import { AIRPORT_THEMES } from '../../src/core/themes.js'

describe('airportInfo', () => {
  it('resolves a known airport', () => {
    const yyc = airportInfo('YYC')
    expect(yyc?.country).toBe('CA')
    expect(yyc?.continent).toBe('North America')
  })

  it('returns undefined for an unknown code', () => {
    expect(airportInfo('ZZZ')).toBeUndefined()
  })

  it('includes airports the old curated table never had', () => {
    expect(airportInfo('DPS')?.country).toBe('ID')
    expect(airportInfo('HKT')?.country).toBe('TH')
  })
})

describe('distanceKm', () => {
  it('computes great-circle distance', () => {
    // YYC -> LHR is roughly 7000 km
    expect(distanceKm('YYC', 'LHR')).toBeGreaterThan(6800)
    expect(distanceKm('YYC', 'LHR')).toBeLessThan(7400)
  })

  it('is zero for the same airport', () => {
    expect(distanceKm('YYC', 'YYC')).toBeCloseTo(0)
  })

  it('returns undefined when either airport is unknown', () => {
    expect(distanceKm('YYC', 'ZZZ')).toBeUndefined()
  })
})

describe('searchAirports', () => {
  it('returns [] for a blank query', () => {
    expect(searchAirports('')).toEqual([])
    expect(searchAirports('   ')).toEqual([])
  })

  it('ranks an exact code match first', () => {
    const results = searchAirports('YYC')
    expect(results[0].code).toBe('YYC')
  })

  it('matches an ISO country code below an exact airport code', () => {
    const japan = searchAirports('JP')
    expect(japan).toHaveLength(8)
    expect(japan.every(r => r.country === 'JP')).toBe(true)

    const exactAirport = searchAirports('YYC')
    expect(exactAirport[0].code).toBe('YYC')
  })

  it('matches a country display name and its case-insensitive prefix', () => {
    for (const query of ['Japan', 'japa']) {
      const results = searchAirports(query)
      expect(results).toHaveLength(8)
      expect(results.every(r => r.country === 'JP')).toBe(true)
    }
  })

  it('prefers supplied airport codes within the same rank', () => {
    const results = searchAirports('JP', 8, new Set(['HND']))
    expect(results[0].code).toBe('HND')
    expect(results.some(r => r.code === 'AOJ')).toBe(true)
  })

  it('matches by code prefix', () => {
    const results = searchAirports('LH')
    expect(results.some(r => r.code === 'LHR')).toBe(true)
  })

  it('matches by city, case-insensitively', () => {
    const results = searchAirports('london')
    expect(results.some(r => r.code === 'LHR')).toBe(true)
  })

  it('respects the limit', () => {
    const results = searchAirports('A', 3)
    expect(results.length).toBeLessThanOrEqual(3)
  })
})

describe('theme tags', () => {
  it('only tag airports present in the vendored dataset', () => {
    const missing = Object.keys(AIRPORT_THEMES).filter(code => !airportInfo(code))
    expect(missing).toEqual([])
  })
})
