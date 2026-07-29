import { describe, it, expect, beforeEach } from 'vitest'
import { SETTING_KEYS, SECRET_KEYS, validateSetting, loadEffectiveConfig } from '../../src/core/settings.js'
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
  it('overlays DB settings over defaults', () => {
    putSetting(db, 'thresholds.economy', '2.5')
    putSetting(db, 'maxPerRoute', '5')
    putSetting(db, 'digestTo', 'other@example.com')
    const cfg = loadEffectiveConfig(db, {})
    expect(cfg.thresholds.economy).toBe(2.5)
    expect(cfg.thresholds.premiumConservative).toBe(3.0)
    expect(cfg.maxPerRoute).toBe(5)
    expect(cfg.pointsBalance).toBe(220000)
    expect(cfg.digestTo).toBe('other@example.com')
  })
})

describe('expanded settings', () => {
  it('DB rows override defaults', () => {
    const db = openDb(':memory:')
    putSetting(db, 'origin', 'YVR')
    putSetting(db, 'ratios', JSON.stringify({ aeroplan: 1 }))
    putSetting(db, 'excludedCountries', JSON.stringify([]))
    putSetting(db, 'seatsAeroKey', 'from-db')
    const cfg = loadEffectiveConfig(db, {})
    expect(cfg.origin).toBe('YVR')
    expect(cfg.ratios).toEqual({ aeroplan: 1 })
    expect(cfg.excludedCountries).toEqual([])
    expect(cfg.seatsAeroKey).toBe('from-db')
  })
  it('env beats DB', () => {
    const db = openDb(':memory:')
    putSetting(db, 'seatsAeroKey', 'from-db')
    putSetting(db, 'origin', 'YVR')
    const cfg = loadEffectiveConfig(db, { SEATS_AERO_KEY: 'from-env', ORIGIN: 'YYC' })
    expect(cfg.seatsAeroKey).toBe('from-env')
    expect(cfg.origin).toBe('YYC')
  })
  it('legacy mrBalance row still honored', () => {
    const db = openDb(':memory:')
    putSetting(db, 'mrBalance', '55000')
    expect(loadEffectiveConfig(db, {}).pointsBalance).toBe(55000)
  })
  it('validates new keys', () => {
    expect(validateSetting('origin', 'YYZ')).toBeNull()
    expect(validateSetting('origin', 'toronto')).toMatch(/IATA/)
    expect(validateSetting('scanSchedule', JSON.stringify({ times: ['07:00'], timezone: 'America/Edmonton' }))).toBeNull()
    expect(validateSetting('scanSchedule', JSON.stringify({ times: ['7am'], timezone: 'America/Edmonton' }))).not.toBeNull()
    expect(validateSetting('scanSchedule', JSON.stringify({ times: ['07:00'], timezone: 'Mars/Olympus' }))).not.toBeNull()
    expect(validateSetting('ratios', JSON.stringify({ aeroplan: 1 }))).toBeNull()
    expect(validateSetting('ratios', JSON.stringify({ aeroplan: 9 }))).not.toBeNull()
    expect(validateSetting('excludedCountries', JSON.stringify(['Canada']))).toBeNull()
    expect(validateSetting('excludedCountries', '"nope"')).not.toBeNull()
    expect(validateSetting('smtp.port', '465')).toBeNull()
    expect(validateSetting('smtp.port', '99999')).not.toBeNull()
    expect(validateSetting('digestEnabled', 'true')).toBeNull()
    expect(validateSetting('digestEnabled', 'yes')).not.toBeNull()
    expect(validateSetting('seatsAeroKey', 'abc')).toBeNull()
    expect(validateSetting('seatsAeroKey', '')).not.toBeNull()
  })
  it('exports SECRET_KEYS', () => {
    expect([...SECRET_KEYS]).toEqual(['seatsAeroKey', 'smtp.password'])
  })
})
