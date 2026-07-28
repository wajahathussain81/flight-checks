import type { Cabin } from '../core/types.js'
import { regionOf, TYPICAL_CASH_CAD } from '../core/regions.js'

export interface FareEstimate { cashCad: number; economyCashCad: number | null }

// Static estimator standing in for a live pricing API (Amadeus Self-Service
// shut down 2026-07-17). Swap this module's internals to reintroduce one.
export function estimateCashFares(route: string, cabin: Cabin): FareEstimate {
  const dest = route.split('-')[1]
  const fares = TYPICAL_CASH_CAD[regionOf(dest)]
  return { cashCad: fares[cabin], economyCashCad: cabin === 'economy' ? null : fares.economy }
}
