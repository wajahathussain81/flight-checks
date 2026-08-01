import { describe, it, expect } from 'vitest'
import { mrPointsNeeded, cpp, conservativeCash, scoreDeal, rankingCpp } from '../../src/core/valuation.js'
import type { AwardRow } from '../../src/core/types.js'

const row = (over: Partial<AwardRow> = {}): AwardRow => ({
  route: 'YYC-LHR', date: '2026-05-14', cabin: 'business', program: 'aeroplan',
  miles: 70000, taxesCad: 150, seats: 2, direct: true, ...over,
})

describe('mrPointsNeeded', () => {
  it('is miles at 1:1', () => expect(mrPointsNeeded(70000, 1)).toBe(70000))
  it('rounds up at 0.75 ratio', () => expect(mrPointsNeeded(50000, 0.75)).toBe(66667))
  it('rejects zero ratio', () => expect(() => mrPointsNeeded(1000, 0)).toThrow())
})

describe('cpp', () => {
  it('computes cents per point net of taxes', () => {
    // (4350 - 150) / 70000 * 100 = 6.0
    expect(cpp(4350, 150, 70000)).toBeCloseTo(6.0)
  })
  it('returns 0 when taxes exceed cash', () => expect(cpp(100, 150, 10000)).toBe(0))
})

describe('conservativeCash', () => {
  it('caps premium at 3x economy', () => expect(conservativeCash(9000, 1000, 'business')).toBe(3000))
  it('keeps cash when below the cap', () => expect(conservativeCash(2500, 1000, 'business')).toBe(2500))
  it('never caps economy', () => expect(conservativeCash(9000, 1000, 'economy')).toBe(9000))
  it('falls back to raw cash without an economy comp', () => expect(conservativeCash(9000, null, 'first')).toBe(9000))
})

describe('scoreDeal', () => {
  it('produces raw and conservative cpp', () => {
    const d = scoreDeal(row(), 9000, 1000, 1)
    expect(d.mrPoints).toBe(70000)
    expect(d.cppRaw).toBeCloseTo(12.64, 2)          // (9000-150)/70000*100
    expect(d.cppConservative).toBeCloseTo(4.07, 2)  // (3000-150)/70000*100
  })
})

describe('scoreDeal positioning penalty', () => {
  const positioningRow = row({
    route: 'LAX-DPS', date: '2027-04-01', miles: 60_000, taxesCad: 100, direct: false,
  })

  it('subtracts positioning cost from the cash value', () => {
    const without = scoreDeal(positioningRow, 3000, 1000, 1, 0)
    const with280 = scoreDeal(positioningRow, 3000, 1000, 1, 280)
    expect(with280.cppConservative).toBeLessThan(without.cppConservative)
  })

  it('defaults to no penalty when omitted', () => {
    expect(scoreDeal(positioningRow, 3000, 1000, 1).cppRaw)
      .toBe(scoreDeal(positioningRow, 3000, 1000, 1, 0).cppRaw)
  })

  it('scores zero when positioning exceeds the deal value', () => {
    expect(scoreDeal(positioningRow, 3000, 1000, 1, 99_000).cppRaw).toBe(0)
  })
})

describe('rankingCpp', () => {
  it('uses raw for economy, conservative for premium', () => {
    const e = scoreDeal(row({ cabin: 'economy', miles: 25000 }), 600, 600, 1)
    const b = scoreDeal(row(), 9000, 1000, 1)
    expect(rankingCpp(e)).toBe(e.cppRaw)
    expect(rankingCpp(b)).toBe(b.cppConservative)
  })
})
