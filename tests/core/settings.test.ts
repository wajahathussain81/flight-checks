import { describe, it, expect, beforeEach } from 'vitest'
import { SETTING_KEYS, validateSetting, loadEffectiveConfig } from '../../src/core/settings.js'
import { openDb, putSetting, type DB } from '../../src/core/db.js'

const ENV = {
  SEATS_AERO_KEY: 'sk1',
  GMAIL_USER: 'hl@gmail.com', GMAIL_APP_PASSWORD: 'gp', DIGEST_TO: 'me@example.com',
}

let db: DB
beforeEach(() => { db = openDb(':memory:') })

describe('validateSetting', () => {
  it('rejects unknown keys', () => expect(validateSetting('dbPath', 'x')).toMatch(/unknown/i))
  it('rejects non-positive numbers', () => {
    expect(validateSetting('pointsBalance', '-5')).toBeTruthy()
    expect(validateSetting('thresholds.economy', 'abc')).toBeTruthy()
  })
  it('requires integer maxPerRoute', () => {
    expect(validateSetting('maxPerRoute', '2.5')).toBeTruthy()
    expect(validateSetting('maxPerRoute', '2')).toBeNull()
  })
  it('validates digestTo as email', () => {
    expect(validateSetting('digestTo', 'not-an-email')).toBeTruthy()
    expect(validateSetting('digestTo', 'a@b.com')).toBeNull()
  })
  it('accepts valid numbers', () => expect(validateSetting('minValue.premium', '1500')).toBeNull())
})

describe('loadEffectiveConfig', () => {
  it('returns env defaults with an empty settings table', () => {
    const cfg = loadEffectiveConfig(db, ENV)
    expect(cfg.thresholds.economy).toBe(1.75)
    expect(cfg.maxPerRoute).toBe(3)
    expect(cfg.digestTo).toBe('me@example.com')
  })
  it('overlays DB settings over env defaults', () => {
    putSetting(db, 'thresholds.economy', '2.5')
    putSetting(db, 'maxPerRoute', '5')
    putSetting(db, 'digestTo', 'other@example.com')
    const cfg = loadEffectiveConfig(db, ENV)
    expect(cfg.thresholds.economy).toBe(2.5)
    expect(cfg.thresholds.premiumConservative).toBe(3.0)
    expect(cfg.maxPerRoute).toBe(5)
    expect(cfg.pointsBalance).toBe(220000)
    expect(cfg.digestTo).toBe('other@example.com')
  })
})
