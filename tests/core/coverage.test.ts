import { describe, expect, it } from 'vitest'
import { openDb } from '../../src/core/db.js'
import { explainEmpty, recordCoverage } from '../../src/core/coverage.js'

const seeded = () => {
  const db = openDb(':memory:')
  recordCoverage(db, 'aeroplan', [{ origin: 'YYC', destination: 'CUN' }])
  recordCoverage(db, 'delta', [{ origin: 'LAX', destination: 'DPS' }])
  return db
}

describe('explainEmpty', () => {
  it('reports no-availability for a monitored route', () => {
    const result = explainEmpty(seeded(), 'YYC', 'CUN')
    expect(result.reason).toBe('no-availability')
    expect(result.monitoredBy).toEqual(['aeroplan'])
  })

  it('reports not-monitored with no programs when nothing reaches the destination', () => {
    const result = explainEmpty(seeded(), 'YYC', 'XXX')
    expect(result.reason).toBe('not-monitored')
    expect(result.monitoredBy).toEqual([])
  })

  it('names programs reaching the destination from another origin', () => {
    // The motivating case: nothing flies YYC-DPS, but delta covers DPS from LAX, so
    // positioning to LAX would unlock it. Surfacing that hint is the point of the field.
    const result = explainEmpty(seeded(), 'YYC', 'DPS')
    expect(result.reason).toBe('not-monitored')
    expect(result.monitoredBy).toEqual(['delta'])
  })

  it('is idempotent across repeated recordings', () => {
    const db = seeded()
    recordCoverage(db, 'aeroplan', [{ origin: 'YYC', destination: 'CUN' }])
    const n = db.prepare('SELECT COUNT(*) AS n FROM route_coverage').get() as { n: number }
    expect(n.n).toBe(2)
  })
})
