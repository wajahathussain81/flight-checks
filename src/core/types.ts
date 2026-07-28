export type Cabin = 'economy' | 'premium' | 'business' | 'first'

export interface AwardRow {
  route: string      // "YYC-LHR"
  date: string       // "2026-05-14"
  cabin: Cabin
  program: string    // seats.aero Source, e.g. "aeroplan"
  miles: number
  taxesCad: number
  seats: number
  direct: boolean
}

export interface ScoredDeal extends AwardRow {
  cashCad: number
  economyCashCad: number | null
  mrPoints: number
  cppRaw: number
  cppConservative: number
}
