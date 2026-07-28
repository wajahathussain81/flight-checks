import { describe, it, expect } from 'vitest'
import { estimateCashFares } from '../../src/scanner/pricing.js'

describe('estimateCashFares', () => {
  it('returns typical fare plus economy comp for premium cabins', () => {
    expect(estimateCashFares('YYC-LHR', 'business')).toEqual({ cashCad: 3300, economyCashCad: 950 })
  })
  it('returns null economy comp for economy cabin', () => {
    expect(estimateCashFares('YYC-CDG', 'economy')).toEqual({ cashCad: 950, economyCashCad: null })
  })
  it('falls back to the other region for unknown destinations', () => {
    expect(estimateCashFares('YYC-XXX', 'first')).toEqual({ cashCad: 5300, economyCashCad: 1000 })
  })
  it('prices mexico/caribbean beach routes below deep south america', () => {
    expect(estimateCashFares('YYC-CUN', 'business')).toEqual({ cashCad: 1200, economyCashCad: 450 })
    expect(estimateCashFares('YYC-GRU', 'business')).toEqual({ cashCad: 3000, economyCashCad: 800 })
  })
})
