import { describe, expect, it } from 'vitest'
import { optimisticCashCad, typicalCashCad } from '../../src/core/fares.js'

describe('typicalCashCad', () => {
  it('prices a short hop below a long haul', () => {
    expect(typicalCashCad(500, 'economy')).toBeLessThan(typicalCashCad(9000, 'economy'))
  })

  it('prices business above economy at the same distance', () => {
    expect(typicalCashCad(3000, 'business')).toBeGreaterThan(typicalCashCad(3000, 'economy'))
  })

  it('interpolates linearly between breakpoints', () => {
    const low = typicalCashCad(2000, 'economy')
    const high = typicalCashCad(6000, 'economy')
    const mid = typicalCashCad(4000, 'economy')
    expect(mid).toBeGreaterThan(low)
    expect(mid).toBeLessThan(high)
  })

  it('clamps below the first and above the last breakpoint', () => {
    expect(typicalCashCad(0, 'economy')).toBe(typicalCashCad(500, 'economy'))
    expect(typicalCashCad(99_000, 'first')).toBe(typicalCashCad(15_000, 'first'))
  })
})

describe('optimisticCashCad', () => {
  it('is always at least the typical estimate', () => {
    for (const d of [500, 3000, 9000, 15_000]) {
      expect(optimisticCashCad(d, 'business')).toBeGreaterThanOrEqual(typicalCashCad(d, 'business'))
    }
  })
})
