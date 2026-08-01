import type { AwardRow } from './types.js'
import { cpp, mrPointsNeeded, conservativeCash } from './valuation.js'
import { distanceKm } from './airports.js'
import { optimisticCashCad } from './fares.js'

export function dedupeCheapest(rows: AwardRow[]): AwardRow[] {
  const best = new Map<string, AwardRow>()
  for (const r of rows) {
    const key = `${r.route}|${r.date}|${r.cabin}|${r.program}`
    const cur = best.get(key)
    if (!cur || r.miles < cur.miles) best.set(key, r)
  }
  return [...best.values()]
}

export function optimisticPotential(row: AwardRow, ratio: number): number {
  const [origin, dest] = row.route.split('-')
  const km = distanceKm(origin, dest)
  if (km === undefined) return 0
  const optimistic = conservativeCash(
    optimisticCashCad(km, row.cabin),
    optimisticCashCad(km, 'economy'),
    row.cabin,
  )
  return cpp(optimistic, row.taxesCad, mrPointsNeeded(row.miles, ratio))
}

export function isViable(
  row: AwardRow,
  ratio: number,
  thresholds: { economy: number; premiumConservative: number },
): boolean {
  const threshold = row.cabin === 'economy' ? thresholds.economy : thresholds.premiumConservative
  return optimisticPotential(row, ratio) >= threshold
}
