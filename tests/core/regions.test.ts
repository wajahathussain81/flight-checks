import { describe, it, expect } from 'vitest'
import {
  AIRPORT_CITY, COUNTRY_CONTINENT, continentOf, continentOfAirport, countryOf,
} from '../../src/core/regions.js'

describe('COUNTRY_CONTINENT', () => {
  it('maps every airport country to a continent', () => {
    for (const { country } of Object.values(AIRPORT_CITY)) {
      expect(COUNTRY_CONTINENT[country], `missing continent for ${country}`).toBeTruthy()
    }
  })
  it('falls back to Other for unknown countries', () => {
    expect(continentOf('Atlantis')).toBe('Other')
    expect(continentOf('Japan')).toBe('Asia & Middle East')
  })
})

describe('countryOf', () => {
  it('resolves airports the curated table never had', () => {
    expect(countryOf('DPS')).toBe('Indonesia')
    expect(continentOfAirport('DPS')).toBe('Asia')
  })

  it('still resolves curated airports', () => {
    expect(countryOf('CUN')).toBe('Mexico')
  })
})

describe('countryOf regression: curated airports must match AIRPORT_CITY', () => {
  it('resolves every curated airport to the same country as AIRPORT_CITY', () => {
    const mismatches: string[] = []
    for (const [code, { country }] of Object.entries(AIRPORT_CITY)) {
      if (countryOf(code) !== country) {
        mismatches.push(`${code}: countryOf=${countryOf(code)} AIRPORT_CITY=${country}`)
      }
    }
    expect(mismatches).toEqual([])
  })
})
