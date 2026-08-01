import { describe, expect, it } from 'vitest'
import { countryName } from '../../src/core/countries.js'

describe('countryName', () => {
  it('maps known ISO codes to settings names', () => {
    expect(countryName('ID')).toBe('Indonesia')
    expect(countryName('US')).toBe('USA')
  })

  it('falls back to the raw code when unmapped', () => {
    expect(countryName('XX')).toBe('XX')
  })
})
