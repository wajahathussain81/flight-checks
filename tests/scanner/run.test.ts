import { describe, it, expect, vi } from 'vitest'
import { rmSync } from 'node:fs'
import { runScan } from '../../src/scanner/run.js'
import { openDb, putSetting } from '../../src/core/db.js'
import { createWatch } from '../../src/core/watches.js'

const env = {
  SEATS_AERO_KEY: 'sk1',
  GMAIL_USER: 'hl@gmail.com', GMAIL_APP_PASSWORD: 'gp', DIGEST_TO: 'me@example.com', DB_PATH: ':memory:',
}

describe('runScan --dry-run', () => {
  it('runs the full pipeline from fixtures without network', async () => {
    const result = await runScan({ dryRun: true, env })
    // 4 fixture rows, 1 killed by prefilter, 3 scored+snapshotted
    expect(result.snapshots).toBe(3)
    expect(result.alerts).toBeGreaterThanOrEqual(1)
    expect(result.errors).toEqual([])
  })

  it('persists snapshots and scan stats to the db file', async () => {
    const dbPath = `${process.env.TMPDIR ?? '/tmp'}/flight-checks-test-${process.pid}.db`
    await runScan({ dryRun: true, env: { ...env, DB_PATH: dbPath } })
    const db = openDb(dbPath)
    const scan = db.prepare('SELECT * FROM scans ORDER BY id DESC LIMIT 1').get() as Record<string, unknown>
    expect(scan.finished_at).toBeTruthy()
    expect(scan.finalists).toBe(3)
    const snaps = db.prepare('SELECT COUNT(*) AS n FROM snapshots').get() as { n: number }
    expect(snaps.n).toBe(3)
  })

  it('honors DB settings overrides', async () => {
    const dbPath = `${process.env.TMPDIR ?? '/tmp'}/flight-checks-settings-${process.pid}.db`
    const setup = openDb(dbPath)
    putSetting(setup, 'minValue.premium', '3000')
    setup.close()
    const result = await runScan({ dryRun: true, env: { ...env, DB_PATH: dbPath } })
    // business deal nets $2,632 < $3,000 floor -> its alert is suppressed; economy alerts unaffected
    expect(result.snapshots).toBe(3)
    expect(result.alerts).toBe(2)
  })

  it('scopes a scan to one country: snapshots only, no alerts', async () => {
    const dbPath = `${process.env.TMPDIR ?? '/tmp'}/flight-checks-scoped-${process.pid}.db`
    rmSync(dbPath, { force: true })
    const result = await runScan({ dryRun: true, country: 'UK', env: { ...env, DB_PATH: dbPath } })
    // fixture has 3 UK rows; the 120k-mile one fails prefilter -> 2 snapshots; digest skipped -> 0 alerts
    expect(result.snapshots).toBe(2)
    expect(result.alerts).toBe(0)
    const db = openDb(dbPath)
    expect((db.prepare('SELECT scope FROM scans ORDER BY id DESC LIMIT 1').get() as { scope: string }).scope).toBe('UK')
    expect((db.prepare('SELECT COUNT(*) AS n FROM alerts').get() as { n: number }).n).toBe(0)
    const routes = db.prepare('SELECT DISTINCT route FROM snapshots').all() as Array<{ route: string }>
    expect(routes.every(r => r.route === 'YYC-LHR')).toBe(true)
  })

  it('refuses to run without a seats.aero key', async () => {
    const r = await runScan({ env: { DB_PATH: ':memory:' } })
    expect(r.scanId).toBe(-1)
    expect(r.errors[0]).toMatch(/not configured/)
  })

  it('records alerts but skips email when digest is not configured', async () => {
    const dbPath = `${process.env.TMPDIR ?? '/tmp'}/flight-checks-no-digest-${process.pid}.db`
    rmSync(dbPath, { force: true })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const r = await runScan({ dryRun: true, env: { SEATS_AERO_KEY: 'k', DB_PATH: dbPath } })
      expect(r.alerts).toBeGreaterThan(0)
      expect(r.errors.find(e => e.startsWith('email:'))).toBeUndefined()
      expect(log).toHaveBeenCalledWith('[digest] skipped: email not configured or disabled')
      const db = openDb(dbPath)
      expect((db.prepare('SELECT COUNT(*) AS n FROM alerts').get() as { n: number }).n).toBe(r.alerts)
    } finally {
      log.mockRestore()
    }
  })

  it('evaluates watches on full scans without recording watch alerts', async () => {
    const dbPath = `${process.env.TMPDIR ?? '/tmp'}/flight-checks-watch-${process.pid}.db`
    rmSync(dbPath, { force: true })
    const setup = openDb(dbPath)
    createWatch(setup, { name: 'UK spring', dateFrom: '2026-05-01', dateTo: '2026-09-30' })
    setup.close()
    const result = await runScan({ dryRun: true, env: { ...env, DB_PATH: dbPath } })
    expect(result.snapshots).toBe(3)
    const db = openDb(dbPath)
    // watch matches never land in the alerts table — only threshold alerts do
    expect((db.prepare('SELECT COUNT(*) AS n FROM alerts').get() as { n: number }).n).toBe(result.alerts)
  })

  it('sends the digest for an active watch even when nothing else alerts', async () => {
    const dbPath = `${process.env.TMPDIR ?? '/tmp'}/flight-checks-watch-only-${process.pid}.db`
    rmSync(dbPath, { force: true })
    const setup = openDb(dbPath)
    createWatch(setup, { name: 'Quiet window', dateFrom: '2030-01-01', dateTo: '2030-02-01' })
    // thresholds nobody clears -> no finalists, no alerts, watch has no matches
    putSetting(setup, 'thresholds.economy', '99')
    putSetting(setup, 'thresholds.premiumConservative', '99')
    setup.close()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const result = await runScan({ dryRun: true, env: { ...env, DB_PATH: dbPath } })
      expect(result.alerts).toBe(0)
      expect(log).toHaveBeenCalledWith('[dry-run] would email: 👀 Trip watch — no matches yet')
    } finally {
      log.mockRestore()
    }
  })
})
