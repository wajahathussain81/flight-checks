import type { Cabin } from '../core/types.js'
import { distanceKm } from '../core/airports.js'
import { typicalCashCad } from '../core/fares.js'

export interface FareEstimate { cashCad: number; economyCashCad: number | null }

// Distance-based estimator standing in for a live pricing API (Amadeus
// Self-Service shut down 2026-07-17). Swap this module's internals to
// reintroduce one.
export function estimateCashFares(route: string, cabin: Cabin): FareEstimate {
  const [origin, dest] = route.split('-')
  const km = distanceKm(origin, dest)
  // An airport missing from the dataset scores 0 cpp and is filtered downstream.
  if (km === undefined) return { cashCad: 0, economyCashCad: null }
  return {
    cashCad: typicalCashCad(km, cabin),
    economyCashCad: cabin === 'economy' ? null : typicalCashCad(km, 'economy'),
  }
}
