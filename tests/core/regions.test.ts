import { describe, it, expect } from 'vitest'
import { AIRPORT_CITY, COUNTRY_CONTINENT, continentOf } from '../../src/core/regions.js'

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
