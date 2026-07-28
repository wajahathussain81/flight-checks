import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { rmSync } from 'node:fs'
import {
  openDb, startScan, finishScan, insertSnapshots, alertKey, lastAlert,
  recordAlerts, getSettings, putSetting, deleteSetting, setDealStatus, getDealStatuses, type DB,
} from '../../src/core/db.js'
import { rankingCpp } from '../../src/core/valuation.js'
import type { ScoredDeal } from '../../src/core/types.js'

const deal = (over: Partial<ScoredDeal> = {}): ScoredDeal => ({
  route: 'YYC-LHR', date: '2026-05-14', cabin: 'business', program: 'aeroplan',
  miles: 70000, taxesCad: 150, seats: 2, direct: true,
  cashCad: 9000, economyCashCad: 1000, mrPoints: 70000, cppRaw: 12.64, cppConservative: 4.07,
  ...over,
})

let db: DB
beforeEach(() => { db = openDb(':memory:') })

describe('scans + snapshots', () => {
  it('round-trips a scan with snapshots', () => {
    const id = startScan(db)
    insertSnapshots(db, id, [deal(), deal({ cabin: 'economy', cppRaw: 2.1, cppConservative: 2.1 })])
    finishScan(db, id, { rowsPulled: 500, finalists: 2, errors: [] })
    const scan = db.prepare('SELECT * FROM scans WHERE id = ?').get(id) as Record<string, unknown>
    expect(scan.finished_at).toBeTruthy()
    expect(scan.finalists).toBe(2)
    const count = db.prepare('SELECT COUNT(*) AS n FROM snapshots WHERE scan_id = ?').get(id) as { n: number }
    expect(count.n).toBe(2)
  })
})

describe('scan scope', () => {
  it('defaults to full and records country scopes', () => {
    const a = startScan(db)
    const b = startScan(db, 'Japan')
    const rows = db.prepare('SELECT id, scope FROM scans ORDER BY id').all() as Array<{ id: number; scope: string }>
    expect(rows.find(r => r.id === a)?.scope).toBe('full')
    expect(rows.find(r => r.id === b)?.scope).toBe('Japan')
  })
  it('migrates an existing scans table without the scope column', () => {
    const path = `${process.env.TMPDIR ?? '/tmp'}/flight-checks-migrate-${process.pid}.db`
    rmSync(path, { force: true })
    const raw = new Database(path)
    raw.exec(`CREATE TABLE scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, finished_at TEXT,
      rows_pulled INTEGER NOT NULL DEFAULT 0, finalists INTEGER NOT NULL DEFAULT 0, errors TEXT NOT NULL DEFAULT '')`)
    raw.prepare('INSERT INTO scans (started_at) VALUES (?)').run('2026-01-01T00:00:00Z')
    raw.close()
    const migrated = openDb(path)
    const row = migrated.prepare('SELECT scope FROM scans').get() as { scope: string }
    expect(row.scope).toBe('full')
    migrated.close()
    rmSync(path, { force: true })
  })
})

describe('alerts', () => {
  it('returns null before any alert, then the recorded values', () => {
    const d = deal()
    expect(lastAlert(db, alertKey(d))).toBeNull()
    recordAlerts(db, 1, [d])
    expect(lastAlert(db, alertKey(d))).toEqual({ cpp: rankingCpp(d), seats: 2 })
  })
})

describe('settings table', () => {
  it('round-trips, upserts, and deletes', () => {
    expect(getSettings(db)).toEqual({})
    putSetting(db, 'maxPerRoute', '5')
    putSetting(db, 'maxPerRoute', '4')
    putSetting(db, 'digestTo', 'a@b.com')
    expect(getSettings(db)).toEqual({ maxPerRoute: '4', digestTo: 'a@b.com' })
    deleteSetting(db, 'maxPerRoute')
    expect(getSettings(db)).toEqual({ digestTo: 'a@b.com' })
  })
})

describe('deal_status table', () => {
  it('sets, updates, clears, and lists statuses', () => {
    setDealStatus(db, 'YYC-LHR|2026-05-14|business|aeroplan', 'saved', 'anniversary trip')
    setDealStatus(db, 'YYC-CDG|2026-09-03|economy|flyingblue', 'dismissed')
    expect(getDealStatuses(db).get('YYC-LHR|2026-05-14|business|aeroplan'))
      .toEqual({ status: 'saved', note: 'anniversary trip' })
    expect(getDealStatuses(db).get('YYC-CDG|2026-09-03|economy|flyingblue'))
      .toEqual({ status: 'dismissed', note: '' })
    setDealStatus(db, 'YYC-LHR|2026-05-14|business|aeroplan', 'dismissed', 'too pricey')
    expect(getDealStatuses(db).get('YYC-LHR|2026-05-14|business|aeroplan'))
      .toEqual({ status: 'dismissed', note: 'too pricey' })
    setDealStatus(db, 'YYC-LHR|2026-05-14|business|aeroplan', null)
    expect(getDealStatuses(db).size).toBe(1)
  })
})
