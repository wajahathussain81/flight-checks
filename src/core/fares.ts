import type { Cabin } from './types.js'

// Typical one-way CAD fares from a Canadian origin at each distance breakpoint.
// Static stand-in for a live pricing API (Amadeus Self-Service shut down 2026-07-17).
const BREAKPOINTS_KM = [500, 2000, 4000, 6000, 9000, 12_000, 15_000]

// Calibrated so the interpolated value at a route's real distance lands near the
// region estimate it replaces: YYC-CUN (~3.9k km) business ≈ 1200, YYC-LHR
// (~7.0k km) business ≈ 3300, YYC-SYD (~13.5k km) business ≈ 4700.
const TYPICAL: Record<Cabin, number[]> = {
  economy: [200, 320, 460, 830, 1100, 1200, 1300],
  premium: [330, 520, 720, 1350, 1750, 1900, 2000],
  business: [550, 850, 1250, 2900, 4000, 4400, 4700],
  first: [800, 1250, 1850, 4500, 6200, 6500, 6700],
}

// Best-plausible fares, used only to discard hopeless rows cheaply.
const OPTIMISTIC_MULTIPLIER = 1.6

function interpolate(table: number[], distanceKm: number): number {
  if (distanceKm <= BREAKPOINTS_KM[0]) return table[0]
  const last = BREAKPOINTS_KM.length - 1
  if (distanceKm >= BREAKPOINTS_KM[last]) return table[last]
  for (let i = 1; i <= last; i++) {
    if (distanceKm <= BREAKPOINTS_KM[i]) {
      const span = BREAKPOINTS_KM[i] - BREAKPOINTS_KM[i - 1]
      const t = (distanceKm - BREAKPOINTS_KM[i - 1]) / span
      return Math.round(table[i - 1] + t * (table[i] - table[i - 1]))
    }
  }
  return table[last]
}

export function typicalCashCad(distanceKm: number, cabin: Cabin): number {
  return interpolate(TYPICAL[cabin], distanceKm)
}

export function optimisticCashCad(distanceKm: number, cabin: Cabin): number {
  return Math.round(typicalCashCad(distanceKm, cabin) * OPTIMISTIC_MULTIPLIER)
}
