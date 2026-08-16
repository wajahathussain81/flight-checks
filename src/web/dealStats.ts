import type { DealRow } from './api.js'

export function dealStats(deals: DealRow[], pointsBalance: number): {
  bestCpp: number | null
  fitCount: number
  businessSeats: number
  countries: number
} {
  const cppValues = deals.map(deal => deal.cabin === 'economy' ? deal.cpp_raw : deal.cpp_conservative)
  const destinations = new Set(deals.map(deal => deal.route.split('-')[1]))

  return {
    bestCpp: cppValues.length > 0 ? Math.max(...cppValues) : null,
    fitCount: deals.filter(deal => deal.mr_points <= pointsBalance).length,
    businessSeats: deals
      .filter(deal => deal.cabin === 'business')
      .reduce((total, deal) => total + deal.seats, 0),
    countries: destinations.size,
  }
}
