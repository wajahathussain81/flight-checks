import { describe, it, expect } from 'vitest'
import { rmSync } from 'node:fs'
import { runScan } from '../../src/scanner/run.js'
import { openDb, putSetting } from '../../src/core/db.js'

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
})
