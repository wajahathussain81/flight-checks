import { describe, it, expect } from 'vitest'
import { loadConfig } from '../../src/core/config.js'

const FULL_ENV = {
  SEATS_AERO_KEY: 'sk1',
  GMAIL_USER: 'hl@gmail.com', GMAIL_APP_PASSWORD: 'gp', DIGEST_TO: 'me@example.com',
}

describe('loadConfig', () => {
  it('throws naming the missing var', () => {
    const { GMAIL_APP_PASSWORD: _omit, ...partial } = FULL_ENV
    expect(() => loadConfig(partial)).toThrow('GMAIL_APP_PASSWORD')
  })

  it('applies defaults', () => {
    const cfg = loadConfig(FULL_ENV)
    expect(cfg.origin).toBe('YYC')
    expect(cfg.mrBalance).toBe(220000)
    expect(cfg.dbPath).toBe('data/flights.db')
    expect(cfg.thresholds).toEqual({ economy: 1.75, premiumConservative: 3.0 })
    expect(cfg.minValue).toEqual({ economy: 400, premium: 1200 })
    expect(cfg.maxPerRoute).toBe(3)
    expect(cfg.ratios.aeroplan).toBe(1)
    expect(cfg.ratios.flyingblue).toBe(0.75)
  })

  it('honors env overrides', () => {
    const cfg = loadConfig({ ...FULL_ENV, ORIGIN: 'YYZ', MR_BALANCE: '150000' })
    expect(cfg.origin).toBe('YYZ')
    expect(cfg.mrBalance).toBe(150000)
  })
})
