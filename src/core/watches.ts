import type { DB } from './db.js'
import type { Cabin } from './types.js'
import { continentOfAirport, countryOf, COUNTRY_CONTINENT } from './regions.js'
import { AIRPORT_THEMES, THEMES, type Theme } from './themes.js'

export interface WatchInput {
  name: string
  enabled?: boolean
  dateFrom: string
  dateTo: string
  excludeCountries?: string[]
  includeContinents?: string[]
  themes?: Theme[]
  cabins?: Cabin[]
  topN?: number
}

export interface Watch {
  id: number
  name: string
  enabled: boolean
  dateFrom: string
  dateTo: string
  excludeCountries: string[]
  includeContinents: string[]
  themes: Theme[]
  cabins: Cabin[]
  topN: number
  createdAt: string
}

const CABINS: readonly string[] = ['economy', 'premium', 'business', 'first']
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export function validateWatchInput(input: unknown): string | null {
  const w = input as Partial<WatchInput> | null
  if (!w || typeof w !== 'object') return 'body required'
  if (typeof w.name !== 'string' || w.name.trim() === '') return 'name required'
  if (typeof w.dateFrom !== 'string' || !ISO_DAY.test(w.dateFrom)) return 'dateFrom must be YYYY-MM-DD'
  if (typeof w.dateTo !== 'string' || !ISO_DAY.test(w.dateTo)) return 'dateTo must be YYYY-MM-DD'
  if (w.dateFrom > w.dateTo) return 'dateFrom must be on or before dateTo'
  const continents = new Set(Object.values(COUNTRY_CONTINENT))
  for (const c of w.excludeCountries ?? []) if (!(c in COUNTRY_CONTINENT)) return `unknown country: ${c}`
  for (const c of w.includeContinents ?? []) if (!continents.has(c)) return `unknown continent: ${c}`
  for (const t of w.themes ?? []) if (!(THEMES as readonly string[]).includes(t)) return `unknown theme: ${t}`
  for (const c of w.cabins ?? []) if (!CABINS.includes(c)) return `unknown cabin: ${c}`
  if (w.topN !== undefined && (!Number.isInteger(w.topN) || w.topN < 1)) return 'topN must be a positive integer'
  return null
}

interface WatchRow {
  id: number; name: string; enabled: number; date_from: string; date_to: string
  exclude_countries: string; include_continents: string; themes: string; cabins: string
  top_n: number; created_at: string
}

function parseRow(r: WatchRow): Watch {
  return {
    id: r.id, name: r.name, enabled: r.enabled === 1,
    dateFrom: r.date_from, dateTo: r.date_to,
    excludeCountries: JSON.parse(r.exclude_countries) as string[],
    includeContinents: JSON.parse(r.include_continents) as string[],
    themes: JSON.parse(r.themes) as Theme[],
    cabins: JSON.parse(r.cabins) as Cabin[],
    topN: r.top_n, createdAt: r.created_at,
  }
}

export function listWatches(db: DB): { watches: Watch[]; errors: string[] } {
  const rows = db.prepare('SELECT * FROM watches ORDER BY id').all() as WatchRow[]
  const watches: Watch[] = []
  const errors: string[] = []
  for (const r of rows) {
    try { watches.push(parseRow(r)) } catch { errors.push(`watch ${r.id} (${r.name}): malformed row skipped`) }
  }
  return { watches, errors }
}

export function getWatch(db: DB, id: number): Watch | null {
  const r = db.prepare('SELECT * FROM watches WHERE id = ?').get(id) as WatchRow | undefined
  if (!r) return null
  try { return parseRow(r) } catch { return null }
}

export function createWatch(db: DB, input: WatchInput): Watch {
  const res = db.prepare(`INSERT INTO watches
    (name, enabled, date_from, date_to, exclude_countries, include_continents, themes, cabins, top_n, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    input.name.trim(), input.enabled === false ? 0 : 1, input.dateFrom, input.dateTo,
    JSON.stringify(input.excludeCountries ?? []), JSON.stringify(input.includeContinents ?? []),
    JSON.stringify(input.themes ?? []), JSON.stringify(input.cabins ?? []),
    input.topN ?? 5, new Date().toISOString())
  return getWatch(db, Number(res.lastInsertRowid)) as Watch
}

export function updateWatch(db: DB, id: number, input: WatchInput): Watch | null {
  if (!getWatch(db, id)) return null
  db.prepare(`UPDATE watches SET name = ?, enabled = ?, date_from = ?, date_to = ?,
    exclude_countries = ?, include_continents = ?, themes = ?, cabins = ?, top_n = ? WHERE id = ?`).run(
    input.name.trim(), input.enabled === false ? 0 : 1, input.dateFrom, input.dateTo,
    JSON.stringify(input.excludeCountries ?? []), JSON.stringify(input.includeContinents ?? []),
    JSON.stringify(input.themes ?? []), JSON.stringify(input.cabins ?? []),
    input.topN ?? 5, id)
  return getWatch(db, id)
}

export function deleteWatch(db: DB, id: number): boolean {
  return db.prepare('DELETE FROM watches WHERE id = ?').run(id).changes > 0
}

export type WatchState = 'active' | 'expired' | 'disabled'

export function watchState(w: Watch, today: string): WatchState {
  if (!w.enabled) return 'disabled'
  if (w.dateTo < today) return 'expired'
  return 'active'
}

export function matchWatch<T extends { route: string; date: string; cabin: string }>(
  watch: Watch, deals: T[], rank: (d: T) => number,
): T[] {
  return deals
    .filter(d => {
      const dest = d.route.split('-')[1]
      const country = countryOf(dest)
      if (d.date < watch.dateFrom || d.date > watch.dateTo) return false
      if (watch.excludeCountries.includes(country)) return false
      if (watch.includeContinents.length > 0 && !watch.includeContinents.includes(continentOfAirport(dest))) return false
      if (watch.themes.length > 0 && !watch.themes.some(t => (AIRPORT_THEMES[dest] ?? []).includes(t))) return false
      if (watch.cabins.length > 0 && !(watch.cabins as readonly string[]).includes(d.cabin)) return false
      return true
    })
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, watch.topN)
}
