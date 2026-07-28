import { describe, it, expect, beforeEach, vi } from 'vitest'
import { selectAlerts, renderDigest, sendDigest } from '../../src/scanner/digest.js'
import { openDb, recordAlerts, setDealStatus, type DB } from '../../src/core/db.js'
import { loadConfig } from '../../src/core/config.js'
import type { ScoredDeal } from '../../src/core/types.js'

const cfg = loadConfig({
  SEATS_AERO_KEY: 'sk1',
  GMAIL_USER: 'hl@gmail.com', GMAIL_APP_PASSWORD: 'gp', DIGEST_TO: 'me@example.com',
})

const deal = (over: Partial<ScoredDeal> = {}): ScoredDeal => ({
  route: 'YYC-LHR', date: '2026-05-14', cabin: 'business', program: 'aeroplan',
  miles: 70000, taxesCad: 150, seats: 2, direct: true,
  cashCad: 9000, economyCashCad: 1000, mrPoints: 70000, cppRaw: 12.64, cppConservative: 4.07,
  ...over,
})

let db: DB
beforeEach(() => { db = openDb(':memory:') })

describe('selectAlerts', () => {
  it('drops deals below the minimum net value floor', () => {
    const shortHaul = deal({ route: 'YYC-YVR', mrPoints: 15800, cppConservative: 3.42 }) // net ~$540 < $1200
    const keeper = deal()                                                                // net ~$2850
    const out = selectAlerts(db, [shortHaul, keeper], cfg)
    expect(out.map(d => d.route)).toEqual(['YYC-LHR'])
  })

  it('applies cabin-specific thresholds', () => {
    const keep = deal()                                                       // 4.07 >= 3.0
    const dropPremium = deal({ date: '2026-06-01', cppConservative: 2.5 })    // < 3.0
    const keepEcon = deal({ date: '2026-07-01', cabin: 'economy', cppRaw: 1.9, cppConservative: 1.9 })
    const dropEcon = deal({ date: '2026-08-01', cabin: 'economy', cppRaw: 1.5, cppConservative: 1.5 })
    const out = selectAlerts(db, [keep, dropPremium, keepEcon, dropEcon], cfg)
    expect(out.map(d => d.date)).toEqual(['2026-05-14', '2026-07-01']) // premium bucket first
  })

  it('suppresses repeats unless value improves 15% or seats increase', () => {
    const d = deal()
    recordAlerts(db, 1, [d])
    expect(selectAlerts(db, [d], cfg)).toHaveLength(0)
    expect(selectAlerts(db, [{ ...d, cppConservative: 4.07 * 1.16 }], cfg)).toHaveLength(1)
    expect(selectAlerts(db, [{ ...d, seats: 5 }], cfg)).toHaveLength(1)
  })

  it('caps each bucket at 10, best first', () => {
    const deals = Array.from({ length: 14 }, (_, i) =>
      deal({ route: `YYC-X${i}`, date: `2026-05-${String(i + 1).padStart(2, '0')}`, cppConservative: 3 + i * 0.1 }))
    const out = selectAlerts(db, deals, cfg)
    expect(out).toHaveLength(10)
    expect(out[0].cppConservative).toBeCloseTo(4.3)
  })

  it('caps dates per route+cabin at maxPerRoute, best first', () => {
    const deals = Array.from({ length: 6 }, (_, i) =>
      deal({ date: `2026-06-0${i + 1}`, cppConservative: 4 + i * 0.01 }))
    const out = selectAlerts(db, deals, cfg)
    expect(out).toHaveLength(3)
    expect(out[0].cppConservative).toBeCloseTo(4.05)
  })

  it('excludes dismissed deals', () => {
    const d = deal()
    setDealStatus(db, 'YYC-LHR|2026-05-14|business|aeroplan', 'dismissed')
    expect(selectAlerts(db, [d], cfg)).toHaveLength(0)
    setDealStatus(db, 'YYC-LHR|2026-05-14|business|aeroplan', 'saved')
    expect(selectAlerts(db, [d], cfg)).toHaveLength(1)
  })
})

describe('renderDigest', () => {
  it('marks budget fit and shows both premium numbers', () => {
    const html = renderDigest([deal(), deal({ date: '2026-06-02', mrPoints: 300000 })], cfg)
    expect(html).toContain('YYC-LHR')
    expect(html).toContain('London, UK')
    expect(html).toContain('4.07')      // conservative
    expect(html).toContain('12.64')     // raw
    expect(html).toContain('fits 220,000')
  })
  it('includes errors section when present', () => {
    const html = renderDigest([], cfg, ['seats.aero: 500'])
    expect(html).toContain('seats.aero: 500')
  })
})

describe('sendDigest', () => {
  it('sends via the provided transport with sender and recipient', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: '1' })
    await sendDigest(cfg, 'subject', '<p>hi</p>', { sendMail })
    expect(sendMail).toHaveBeenCalledWith({
      from: 'Flight Checks <hl@gmail.com>',
      to: 'me@example.com',
      subject: 'subject',
      html: '<p>hi</p>',
    })
  })
  it('propagates transport failures', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('535 auth failed'))
    await expect(sendDigest(cfg, 's', '<p></p>', { sendMail })).rejects.toThrow('535')
  })
})
