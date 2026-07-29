import { describe, expect, it } from 'vitest'
import { loadConfig, configComplete, digestReady } from '../../src/core/config.js'

describe('loadConfig', () => {
  it('returns full defaults with an empty env (no throw)', () => {
    const cfg = loadConfig({})
    expect(cfg.seatsAeroKey).toBe('')
    expect(cfg.origin).toBe('YYC')
    expect(cfg.pointsProgram).toBe('Amex MR (Canada)')
    expect(cfg.pointsBalance).toBe(220000)
    expect(cfg.currency).toBe('CAD')
    expect(cfg.excludedCountries).toEqual(['Canada'])
    expect(cfg.ratios).toEqual({ aeroplan: 1, british: 1, flyingblue: 0.75, delta: 0.75, etihad: 0.75 })
    expect(cfg.smtp).toEqual({ host: 'smtp.gmail.com', port: 465, user: '', password: '' })
    expect(cfg.scanSchedule).toEqual({ times: ['07:00', '19:00'], timezone: 'America/Edmonton' })
    expect(cfg.digestEnabled).toBe(true)
  })
  it('applies env overrides including legacy aliases', () => {
    const cfg = loadConfig({
      SEATS_AERO_KEY: 'sk1', GMAIL_USER: 'me@gmail.com', GMAIL_APP_PASSWORD: 'pw',
      DIGEST_TO: 'to@x.com', MR_BALANCE: '100000', ORIGIN: 'YVR', DB_PATH: '/tmp/x.db',
    })
    expect(cfg.seatsAeroKey).toBe('sk1')
    expect(cfg.smtp.user).toBe('me@gmail.com')
    expect(cfg.smtp.password).toBe('pw')
    expect(cfg.pointsBalance).toBe(100000)
    expect(cfg.origin).toBe('YVR')
  })
  it('prefers SMTP_* over GMAIL_* when both set', () => {
    const cfg = loadConfig({ SMTP_USER: 'a@b.c', GMAIL_USER: 'z@z.z', SMTP_HOST: 'mail.x.com', SMTP_PORT: '587' })
    expect(cfg.smtp).toMatchObject({ user: 'a@b.c', host: 'mail.x.com', port: 587 })
  })
})

describe('completeness', () => {
  it('configComplete requires only the seats.aero key', () => {
    expect(configComplete(loadConfig({}))).toBe(false)
    expect(configComplete(loadConfig({ SEATS_AERO_KEY: 'k' }))).toBe(true)
  })
  it('digestReady requires smtp user+password and a recipient', () => {
    expect(digestReady(loadConfig({}))).toBe(false)
    expect(digestReady(loadConfig({ GMAIL_USER: 'u@g.c', GMAIL_APP_PASSWORD: 'p', DIGEST_TO: 't@x.c' }))).toBe(true)
  })
})
