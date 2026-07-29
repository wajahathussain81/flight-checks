export interface DealRow {
  id: number; route: string; date: string; cabin: string; program: string
  miles: number; taxes_cad: number; cash_cad: number; economy_cash_cad: number | null
  mr_points: number; cpp_raw: number; cpp_conservative: number; seats: number; direct: number
  status: 'saved' | 'dismissed' | null; note: string
}
export interface HistoryPoint { created_at: string; cpp: number; cash_cad: number; miles: number }
export interface ScanRow {
  id: number; started_at: string; finished_at: string | null
  rows_pulled: number; finalists: number; errors: string; scope: string
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.json() as Promise<T>
}

export const fetchDeals = (cabin?: string) =>
  get<{ deals: DealRow[] }>(`/api/deals${cabin ? `?cabin=${cabin}` : ''}`).then(r => r.deals)
export const fetchHistory = (route: string, cabin: string) =>
  get<{ points: HistoryPoint[] }>(`/api/history?route=${route}&cabin=${cabin}`).then(r => r.points)
export const fetchScans = () => get<{ scans: ScanRow[] }>('/api/scans').then(r => r.scans)

export interface Meta {
  countries: string[]; continents: string[]; countryContinents: Record<string, string>; pointsBalance: number
}
export interface ShortlistRow { alertKey: string; note: string; current: DealRow | null }
export interface SettingEntry { value: number | string; default: number | string; overridden: boolean }

export interface DealQuery {
  cabin?: string; continent?: string; country?: string; month?: string; minCpp?: string; q?: string
  sort?: string; dir?: string; includeDismissed?: boolean
}

export const fetchDealsFiltered = (f: DealQuery) => {
  const p = new URLSearchParams()
  if (f.cabin) p.set('cabin', f.cabin)
  if (f.continent) p.set('continent', f.continent)
  if (f.country) p.set('country', f.country)
  if (f.month) p.set('month', f.month)
  if (f.minCpp) p.set('minCpp', f.minCpp)
  if (f.q) p.set('q', f.q)
  if (f.sort) p.set('sort', f.sort)
  if (f.dir) p.set('dir', f.dir)
  if (f.includeDismissed) p.set('includeDismissed', '1')
  return get<{ deals: DealRow[] }>(`/api/deals?${p}`).then(r => r.deals)
}
export const fetchMeta = () => get<Meta>('/api/meta')
export const fetchShortlist = () => get<{ deals: ShortlistRow[] }>('/api/shortlist').then(r => r.deals)
export const fetchSettings = () => get<{ settings: Record<string, SettingEntry> }>('/api/settings').then(r => r.settings)

async function send(path: string, method: string, body: unknown): Promise<void> {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({ error: res.status })) as { error: string }).error)
}
export const postDealStatus = (alertKey: string, status: 'saved' | 'dismissed' | null, note = '') =>
  send('/api/deals/status', 'POST', { alertKey, status, note })
export const putSettingValue = (key: string, value: string | null) => send('/api/settings', 'PUT', { key, value })
export const triggerScan = async (country?: string): Promise<void> => {
  const res = await fetch('/api/scan', {
    method: 'POST',
    ...(country ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country }) } : {}),
  })
  if (!res.ok) throw new Error((await res.json() as { error: string }).error)
}
