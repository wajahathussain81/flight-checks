import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextRunAt, startScheduler } from '../../src/server/scheduler.js'

const SCHED = { times: ['07:00', '19:00'], timezone: 'America/Edmonton' }

describe('nextRunAt', () => {
  it('picks the next time later today (MDT = UTC-6)', () => {
    // 2026-07-29 10:00 MDT == 16:00 UTC → next is 19:00 MDT == 2026-07-30T01:00Z
    const next = nextRunAt(SCHED, new Date('2026-07-29T16:00:00Z'))
    expect(next.toISOString()).toBe('2026-07-30T01:00:00.000Z')
  })
  it('rolls to tomorrow morning after the last slot', () => {
    // 20:00 MDT → next is 07:00 MDT tomorrow == 13:00Z
    const next = nextRunAt(SCHED, new Date('2026-07-30T02:00:00Z'))
    expect(next.toISOString()).toBe('2026-07-30T13:00:00.000Z')
  })
  it('handles the MST/MDT switch (Nov 1 2026, clocks back)', () => {
    // Oct 31 2026 20:00 MDT (Nov 1 02:00Z) → next 07:00 local is MST (UTC-7) == 14:00Z
    const next = nextRunAt(SCHED, new Date('2026-11-01T02:00:00Z'))
    expect(next.toISOString()).toBe('2026-11-01T14:00:00.000Z')
  })
})

describe('startScheduler', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('fires at the scheduled time and re-arms', () => {
    vi.setSystemTime(new Date('2026-07-29T16:00:00Z'))
    const fired: number[] = []
    const s = startScheduler({ getSchedule: () => SCHED, fire: () => fired.push(Date.now()) })
    vi.advanceTimersByTime(9 * 3600_000)   // → 01:00Z, first fire
    expect(fired).toHaveLength(1)
    expect(s.next()!.toISOString()).toBe('2026-07-30T13:00:00.000Z')  // re-armed
    s.stop()
  })
  it('refresh() re-reads the schedule', () => {
    vi.setSystemTime(new Date('2026-07-29T16:00:00Z'))
    let sched = SCHED
    const s = startScheduler({ getSchedule: () => sched, fire: () => {} })
    sched = { times: ['18:00'], timezone: 'America/Edmonton' }
    s.refresh()
    expect(s.next()!.toISOString()).toBe('2026-07-30T00:00:00.000Z')
    s.stop()
  })
  it('enabled:false never arms', () => {
    const s = startScheduler({ getSchedule: () => SCHED, fire: () => {}, enabled: false })
    expect(s.next()).toBeNull()
    s.stop()
  })
})
