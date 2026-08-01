import type { DB } from './db.js'

export interface RoutePair { origin: string; destination: string }

export function recordCoverage(db: DB, source: string, routes: RoutePair[]): void {
  const stmt = db.prepare(
    `INSERT INTO route_coverage (source, origin, destination, last_seen) VALUES (?, ?, ?, ?)
     ON CONFLICT(source, origin, destination) DO UPDATE SET last_seen = excluded.last_seen`,
  )
  const now = new Date().toISOString()
  const tx = db.transaction((rows: RoutePair[]) => {
    for (const r of rows) stmt.run(source, r.origin, r.destination, now)
  })
  tx(routes)
}

export function explainEmpty(
  db: DB, origin: string, dest: string,
): { reason: 'no-availability' | 'not-monitored'; monitoredBy: string[] } {
  const exact = db.prepare(
    'SELECT source FROM route_coverage WHERE origin = ? AND destination = ?',
  ).all(origin, dest) as Array<{ source: string }>
  if (exact.length > 0) {
    return { reason: 'no-availability', monitoredBy: exact.map(r => r.source) }
  }
  // Nothing flies this pair. Report who reaches the destination from anywhere else —
  // that is what tells the user positioning to another origin would unlock it.
  const elsewhere = db.prepare(
    'SELECT DISTINCT source FROM route_coverage WHERE destination = ?',
  ).all(dest) as Array<{ source: string }>
  return { reason: 'not-monitored', monitoredBy: elsewhere.map(r => r.source) }
}
