import { describe, it, expect } from 'vitest'
import { dedupeCheapest, isViable, optimisticPotential } from '../../src/core/prefilter.js'
import type { AwardRow } from '../../src/core/types.js'

const THRESHOLDS = { economy: 1.75, premiumConservative: 3.0 }

const row = (over: Partial<AwardRow> = {}): AwardRow => ({
  route: 'YYC-LHR', date: '2026-05-14', cabin: 'business', program: 'aeroplan',
  miles: 70000, taxesCad: 150, seats: 2, direct: true, ...over,
})

describe('dedupeCheapest', () => {
  it('keeps the cheapest miles per route+date+cabin+program', () => {
    const out = dedupeCheapest([row({ miles: 90000 }), row({ miles: 70000 }), row({ miles: 80000 })])
    expect(out).toHaveLength(1)
    expect(out[0].miles).toBe(70000)
  })
  it('keeps distinct keys separate', () => {
    const out = dedupeCheapest([row(), row({ date: '2026-05-15' }), row({ program: 'flyingblue' })])
    expect(out).toHaveLength(3)
  })
})

describe('isViable', () => {
  it('accepts business to Europe at reasonable miles', () => {
    // optimistic: min(5000, 3*1400=4200) => (4200-150)/70000*100 = 5.8 >= 3.0
    expect(isViable(row(), 1, THRESHOLDS)).toBe(true)
  })
  it('rejects absurd mileage economy to Europe', () => {
    // (1400-150)/100000*100 = 1.25 < 1.75
    expect(isViable(row({ cabin: 'economy', miles: 100000 }), 1, THRESHOLDS)).toBe(false)
  })
  it('accepts cheap intra-NA economy', () => {
    // (700-80)/15000*100 = 4.13 >= 1.75
    expect(isViable(row({ route: 'YYC-JFK', cabin: 'economy', miles: 15000, taxesCad: 80 }), 1, THRESHOLDS)).toBe(true)
  })
})

describe('optimisticPotential', () => {
  it('is higher for cheaper awards on the same market', () => {
    const cheap = optimisticPotential(row({ miles: 55000 }), 1)
    const dear = optimisticPotential(row({ miles: 90000 }), 1)
    expect(cheap).toBeGreaterThan(dear)
  })
})
