import { describe, expect, it } from 'vitest'
import { dealStats } from '../../src/web/dealStats.js'

const row = (over: Partial<any>) => ({
  id: 1, route: 'YYC-HND', date: '2026-11-14', cabin: 'business', program: 'aeroplan',
  mr_points: 85000, taxes_cad: 120, cash_cad: 4120, cpp_raw: 3.4, cpp_conservative: 3.12,
  seats: 2, direct: true, status: null, ...over,
})

describe('dealStats', () => {
  it('summarizes best cpp, balance fits, business seats, and destinations', () => {
    const stats = dealStats([
      row({}),
      row({ id: 2, route: 'YEG-CDG', cabin: 'economy', cpp_raw: 2.87, mr_points: 35000, seats: 4 }),
      row({ id: 3, route: 'YYC-BKK', mr_points: 240000, cpp_conservative: 2.05, seats: 3 }),
    ] as any, 220000)
    expect(stats.bestCpp).toBe(3.12)
    expect(stats.fitCount).toBe(2)
    expect(stats.businessSeats).toBe(5)
    expect(stats.countries).toBe(3)
  })
  it('returns null best on empty input', () => {
    expect(dealStats([], 0).bestCpp).toBeNull()
  })
})
