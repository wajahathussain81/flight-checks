import type { AwardRow, Cabin, ScoredDeal } from './types.js'

export function mrPointsNeeded(miles: number, ratio: number): number {
  if (ratio <= 0) {
    throw new Error('Transfer ratio must be greater than zero')
  }

  return Math.ceil(miles / ratio)
}

export function cpp(cashCad: number, taxesCad: number, mrPoints: number): number {
  const netCashCad = cashCad - taxesCad
  if (netCashCad <= 0 || mrPoints <= 0) {
    return 0
  }

  return netCashCad / mrPoints * 100
}

export function conservativeCash(
  cashCad: number,
  economyCashCad: number | null,
  cabin: Cabin,
): number {
  if (cabin === 'economy' || economyCashCad === null) {
    return cashCad
  }

  return Math.min(cashCad, economyCashCad * 3)
}

export function scoreDeal(
  row: AwardRow,
  cashCad: number,
  economyCashCad: number | null,
  ratio: number,
  positioningCad = 0,
): ScoredDeal {
  const mrPoints = mrPointsNeeded(row.miles, ratio)
  const netCash = Math.max(0, cashCad - positioningCad)
  const netEconomy = economyCashCad === null ? null : Math.max(0, economyCashCad - positioningCad)
  const conservativeCashCad = conservativeCash(netCash, netEconomy, row.cabin)
  const roundToTwoDecimals = (value: number): number => Math.round(value * 100) / 100

  return {
    ...row,
    cashCad: netCash,
    economyCashCad: netEconomy,
    mrPoints,
    cppRaw: roundToTwoDecimals(cpp(netCash, row.taxesCad, mrPoints)),
    cppConservative: roundToTwoDecimals(cpp(conservativeCashCad, row.taxesCad, mrPoints)),
  }
}

export function rankingCpp(d: ScoredDeal): number {
  return d.cabin === 'economy' ? d.cppRaw : d.cppConservative
}
