import { describe, it, expect } from 'vitest'
import { estimateCashFares } from '../../src/scanner/pricing.js'

describe('estimateCashFares', () => {
  it('returns typical fare plus economy comp for premium cabins', () => {
    const fares = estimateCashFares('YYC-LHR', 'business')

    expect(fares.cashCad).toBeGreaterThan(3000)
    expect(fares.cashCad).toBeLessThan(3600)
    expect(fares.economyCashCad).not.toBeNull()
    expect(fares.economyCashCad!).toBeLessThan(fares.cashCad)
  })
  it('returns null economy comp for economy cabin', () => {
    const fares = estimateCashFares('YYC-CDG', 'economy')

    expect(fares.cashCad).toBeGreaterThan(820)
    expect(fares.cashCad).toBeLessThan(1050)
    expect(fares.economyCashCad).toBeNull()
  })
  it('returns a zero fare for unknown airports so the route is filtered downstream', () => {
    expect(estimateCashFares('YYC-XXX', 'first')).toEqual({ cashCad: 0, economyCashCad: null })
  })
  it('prices mexico/caribbean beach routes below deep south america', () => {
    const cancun = estimateCashFares('YYC-CUN', 'business')
    const saoPaulo = estimateCashFares('YYC-GRU', 'business')

    expect(cancun.cashCad).toBeGreaterThan(1050)
    expect(cancun.cashCad).toBeLessThan(1400)
    expect(cancun.cashCad).toBeLessThan(saoPaulo.cashCad)
  })
})
