import type { ScanSchedule } from '../core/config.js'

function tzOffsetMs(ts: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const p = Object.fromEntries(dtf.formatToParts(new Date(ts)).map(x => [x.type, x.value]))
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
  return asUtc - ts
}

// UTC instant for wall-clock y-m-d hh:mm in timeZone (double-adjust for DST edges)
function zonedTimeToUtc(y: number, m: number, d: number, hh: number, mm: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  let ts = guess - tzOffsetMs(guess, timeZone)
  const offset = tzOffsetMs(ts, timeZone)
  if (guess - offset !== ts) ts = guess - offset
  return new Date(ts)
}

export function nextRunAt(schedule: ScanSchedule, now: Date): Date {
  const dayParts = (ts: number): { y: number; m: number; d: number } => {
    const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: schedule.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    const p = Object.fromEntries(dtf.formatToParts(new Date(ts)).map(x => [x.type, x.value]))
    return { y: +p.year, m: +p.month, d: +p.day }
  }
  const candidates: Date[] = []
  for (let offset = 0; offset <= 2; offset++) {
    const { y, m, d } = dayParts(now.getTime() + offset * 86_400_000)
    for (const t of schedule.times) {
      const [hh, mm] = t.split(':').map(Number)
      candidates.push(zonedTimeToUtc(y, m, d, hh, mm, schedule.timezone))
    }
  }
  return candidates.filter(c => c.getTime() > now.getTime()).sort((a, b) => a.getTime() - b.getTime())[0]
}

export function startScheduler(opts: {
  getSchedule: () => ScanSchedule
  fire: () => void
  enabled?: boolean
}): { refresh: () => void; stop: () => void; next: () => Date | null } {
  const enabled = opts.enabled ?? true
  let timer: NodeJS.Timeout | null = null
  let nextAt: Date | null = null
  const arm = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    nextAt = null
    if (!enabled) return
    nextAt = nextRunAt(opts.getSchedule(), new Date())
    timer = setTimeout(() => {
      try { opts.fire() } catch (err) { console.error('[scheduler] fire failed:', err) }
      arm()
    }, nextAt.getTime() - Date.now())
    timer.unref?.()
  }
  arm()
  return { refresh: arm, stop: () => { if (timer) clearTimeout(timer) }, next: () => nextAt }
}
