import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import {
  fetchDealsFiltered,
  fetchHistory,
  fetchMeta,
  fetchScans,
  fetchSettings,
  fetchShortlist,
  fetchStatus,
  postDealStatus,
  putSettingValue,
  triggerScan,
  type DealRow,
  type HistoryPoint,
  type Meta,
  type ScanRow,
  type SettingEntry,
  type ShortlistRow,
  type Status,
} from './api.js'
import { Sparkline } from './Sparkline.js'
import { Wizard } from './Wizard.js'
import { WatchesTab } from './WatchesTab.js'
import { SearchTab } from './SearchTab.js'
import { dealStats } from './dealStats.js'
import { settingLabel } from './settingLabels.js'
import { airportLabel } from '../core/regions.js'

type Tab = 'deals' | 'search' | 'watches' | 'shortlist' | 'history' | 'runs' | 'settings'
type SortColumn = 'cpp' | 'date' | 'mr_points' | 'seats' | 'cash_cad'

const PlaneIcon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M14.6 1.4c.5.5.5 1.4.1 1.9L10.9 8l1.4 5.2-1.2 1.2-2.7-4.6-2.7 2.7.3 1.9-.9.9-1.3-2.5L1.3 11l.9-.9 1.9.3 2.7-2.7L2.9 5l1.2-1.2L9.3 5.2l3.4-3.8c.5-.5 1.4-.5 1.9 0z" />
  </svg>
)

const SearchIcon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M11.7 10.3a6 6 0 1 0-1.4 1.4l3 3 1.4-1.4-3-3zM6 10a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" />
  </svg>
)

const EyeIcon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 3a7.5 7.5 0 0 1 7 4.7A7.5 7.5 0 0 1 8 12.5 7.5 7.5 0 0 1 1 7.7 7.5 7.5 0 0 1 8 3zm0 2.2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" />
  </svg>
)

const StarIcon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 1.5l2 4.1 4.5.6-3.2 3.2.7 4.5L8 11.8l-4 2.1.7-4.5L1.5 6.2l4.5-.6L8 1.5z" />
  </svg>
)

const ChartIcon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M2 13h12v1.5H2V13zm1.5-4.5L6 11l3-3.5 2 2L14.5 5l-1-1-2.5 3-2-2L6 8.6 4.5 7l-1 1.5z" />
  </svg>
)

const ClockIcon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 1.5A6.5 6.5 0 1 1 1.5 8H3a5 5 0 1 0 5-5V1.5zM7.5 4H9v4.2l3 1.8-.7 1.3L7.5 9V4z" />
  </svg>
)

const GearIcon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M9.4 1l.4 1.8a5.6 5.6 0 0 1 1.4.8l1.7-.6 1.4 2.4-1.3 1.2a5.7 5.7 0 0 1 0 1.7l1.3 1.2-1.4 2.4-1.7-.6a5.6 5.6 0 0 1-1.4.8L9.4 15H6.6l-.4-1.8a5.6 5.6 0 0 1-1.4-.8l-1.7.6-1.4-2.4L3 9.4a5.7 5.7 0 0 1 0-1.7L1.7 6.4l1.4-2.4 1.7.6a5.6 5.6 0 0 1 1.4-.8L6.6 1h2.8zM8 5.8A2.2 2.2 0 1 0 8 10.2 2.2 2.2 0 0 0 8 5.8z" />
  </svg>
)

const TABS: Array<{ id: Tab; label: string; icon: JSX.Element; section?: string }> = [
  { id: 'deals', label: 'Deals', icon: <PlaneIcon /> },
  { id: 'search', label: 'Search', icon: <SearchIcon /> },
  { id: 'watches', label: 'Watches', icon: <EyeIcon /> },
  { id: 'shortlist', label: 'Shortlist', icon: <StarIcon /> },
  { id: 'history', label: 'History', icon: <ChartIcon /> },
  { id: 'runs', label: 'Runs', icon: <ClockIcon />, section: 'System' },
  { id: 'settings', label: 'Settings', icon: <GearIcon /> },
]

const alertKeyOf = (d: DealRow) => `${d.route}|${d.date}|${d.cabin}|${d.program}`
const asError = (error: unknown) => error instanceof Error ? error : new Error(String(error))

function DealsTab({
  meta,
  onPick,
  onError,
}: {
  meta: Meta
  onPick: (route: string, cabin: string) => void
  onError: (error: Error) => void
}) {
  const GREAT_CPP = 2.5
  const [filters, setFilters] = useState({
    cabin: '',
    continent: '',
    country: '',
    month: '',
    minCpp: '',
    q: '',
    sort: 'cpp',
    dir: 'desc',
    includeDismissed: false,
  })
  const [deals, setDeals] = useState<DealRow[]>([])
  const [scanning, setScanning] = useState(false)

  const loadDeals = useCallback(async () => {
    try {
      setDeals(await fetchDealsFiltered(filters))
    } catch (error) {
      onError(asError(error))
    }
  }, [filters, onError])

  useEffect(() => { void loadDeals() }, [loadDeals])

  useEffect(() => {
    if (!scanning) return
    let cancelled = false
    let polls = 0
    let timer: ReturnType<typeof setTimeout>

    const poll = async () => {
      try {
        const next = await fetchScans()
        if (cancelled) return
        polls += 1
        if (next[0]?.finished_at === null && polls < 20) {
          timer = setTimeout(poll, 5000)
        } else {
          setScanning(false)
          await loadDeals()
        }
      } catch (error) {
        if (!cancelled) {
          setScanning(false)
          onError(asError(error))
        }
      }
    }

    timer = setTimeout(poll, 5000)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [scanning, loadDeals, onError])

  const scanCountry = async () => {
    setScanning(true)
    try {
      await triggerScan(filters.country)
    } catch (error) {
      setScanning(false)
      onError(asError(error))
    }
  }

  const months = [...new Set([
    ...deals.map(deal => deal.date.slice(0, 7)),
    ...(filters.month ? [filters.month] : []),
  ])].sort()
  const countries = filters.continent
    ? meta.countries.filter(country => meta.countryContinents[country] === filters.continent)
    : meta.countries

  const setSort = (sort: SortColumn) => {
    setFilters(current => ({
      ...current,
      sort,
      dir: current.sort === sort
        ? (current.dir === 'asc' ? 'desc' : 'asc')
        : (sort === 'cpp' ? 'desc' : 'asc'),
    }))
  }

  const sortLabel = (label: string, sort: SortColumn) => (
    <th className="sortable" onClick={() => setSort(sort)}>
      {label}{filters.sort === sort ? (filters.dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )

  const changeStatus = async (deal: DealRow, status: 'saved' | 'dismissed') => {
    try {
      await postDealStatus(alertKeyOf(deal), deal.status === status ? null : status)
      await loadDeals()
    } catch (error) {
      onError(asError(error))
    }
  }

  const stats = dealStats(deals, meta.pointsBalance)

  return (
    <div>
      <div className="content-header">
        <div>
          <h4>Deals</h4>
          <p className="content-sub">{deals.length.toLocaleString()} deals</p>
        </div>
        {filters.country && (
          <button className="btn btn-primary" disabled={scanning} onClick={() => void scanCountry()}>
            {scanning ? 'Scanning…' : `Scan ${filters.country}`}
          </button>
        )}
      </div>
      <div className="stat-row">
        <div className="stat">
          <div className="k">Best value</div>
          <div className="v">{stats.bestCpp?.toFixed(2) ?? '—'} <small>¢/pt</small></div>
        </div>
        <div className="stat">
          <div className="k">Fit your {Math.round(meta.pointsBalance / 1000)}k</div>
          <div className="v">{stats.fitCount.toLocaleString()}</div>
        </div>
        <div className="stat">
          <div className="k">Business seats</div>
          <div className="v">{stats.businessSeats.toLocaleString()}</div>
        </div>
        <div className="stat">
          <div className="k">Destinations</div>
          <div className="v">{stats.countries.toLocaleString()}</div>
        </div>
      </div>
      <div className="filter-bar">
        <select
          className="field"
          value={filters.continent}
          onChange={event => {
            const continent = event.target.value
            setFilters(current => ({
              ...current,
              continent,
              country: continent && meta.countryContinents[current.country] !== continent ? '' : current.country,
            }))
          }}
        >
          <option value="">All continents</option>
          {meta.continents.map(continent => <option key={continent} value={continent}>{continent}</option>)}
        </select>
        <select className="field" value={filters.country} onChange={event => setFilters(current => ({ ...current, country: event.target.value }))}>
          <option value="">All countries</option>
          {countries.map(country => <option key={country} value={country}>{country}</option>)}
        </select>
        <select className="field" value={filters.month} onChange={event => setFilters(current => ({ ...current, month: event.target.value }))}>
          <option value="">All months</option>
          {months.map(month => <option key={month} value={month}>{month}</option>)}
        </select>
        <div className="segmented" role="tablist" aria-label="Cabin">
          {([
            ['', 'All'],
            ['economy', 'Economy'],
            ['premium', 'Premium'],
            ['business', 'Business'],
            ['first', 'First'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filters.cabin === value}
              className={filters.cabin === value ? 'on' : ''}
              onClick={() => setFilters(current => ({ ...current, cabin: value }))}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          className="field"
          type="number"
          placeholder="Min ¢/pt"
          value={filters.minCpp}
          onChange={event => setFilters(current => ({ ...current, minCpp: event.target.value }))}
        />
        <input
          className="field"
          type="search"
          placeholder="Search"
          value={filters.q}
          onChange={event => setFilters(current => ({ ...current, q: event.target.value }))}
        />
        <label className="chip chip-neutral">
          <input
            className="field"
            type="checkbox"
            checked={filters.includeDismissed}
            onChange={event => setFilters(current => ({ ...current, includeDismissed: event.target.checked }))}
          />
          Show dismissed
        </label>
      </div>
      <div className="deal-list overflow">
        <table className="deal-list-table">
          <thead>
            <tr>
              <th>Route</th>{sortLabel('Date', 'date')}<th>Cabin</th><th>Program</th>
              {sortLabel('MR points', 'mr_points')}<th>Taxes</th>{sortLabel('Cash comp', 'cash_cad')}
              {sortLabel('¢/pt', 'cpp')}{sortLabel('Seats', 'seats')}<th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {deals.map(deal => {
              const cpp = deal.cabin === 'economy' ? deal.cpp_raw : deal.cpp_conservative
              return (
                <tr
                  key={deal.id}
                  className={deal.status === 'dismissed' ? 'dimmed' : undefined}
                  onClick={() => onPick(deal.route, deal.cabin)}
                >
                  <td>
                    <span className="deal-route">
                      {deal.route}
                      <span className="deal-dest">{airportLabel(deal.route.split('-')[1])}</span>
                    </span>
                  </td>
                  <td className="deal-num">{deal.date}</td>
                  <td><span className="chip chip-neutral">{deal.cabin}</span></td>
                  <td>{deal.program}</td>
                  <td className="deal-num">
                    {deal.mr_points.toLocaleString()}{' '}
                    {deal.mr_points <= meta.pointsBalance && (
                      <span className="chip chip-green"><span className="dot" />fits</span>
                    )}
                  </td>
                  <td className="deal-num">${deal.taxes_cad.toFixed(0)}</td>
                  <td className="deal-num">${Math.round(deal.cash_cad).toLocaleString()}</td>
                  <td>
                    <span className={'cpp' + (cpp >= GREAT_CPP ? ' cpp-great' : '')}>
                      {cpp.toFixed(2)}{deal.cabin !== 'economy' ? ` (${deal.cpp_raw.toFixed(2)} raw)` : ''}
                    </span>
                  </td>
                  <td className="deal-num">
                    {deal.seats}{' '}
                    {deal.direct && <span className="chip chip-blue">direct</span>}
                  </td>
                  <td onClick={event => event.stopPropagation()}>
                    <span className="deal-actions">
                      <button
                        className={`icon-btn${deal.status === 'saved' ? ' saved' : ''}`}
                        aria-label="Save"
                        onClick={() => void changeStatus(deal, 'saved')}
                      >
                        {deal.status === 'saved' ? '★' : '☆'}
                      </button>
                      <button
                        className="icon-btn"
                        aria-label="Dismiss"
                        onClick={() => void changeStatus(deal, 'dismissed')}
                      >
                        ✕
                      </button>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {deals.length === 0 && <p>No snapshots yet — wait for the next scan.</p>}
    </div>
  )
}

function ShortlistTab({
  onPick,
  onError,
}: {
  onPick: (route: string, cabin: string) => void
  onError: (error: Error) => void
}) {
  const [deals, setDeals] = useState<ShortlistRow[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})

  const loadShortlist = useCallback(async () => {
    try {
      const next = await fetchShortlist()
      setDeals(next)
      setNotes(Object.fromEntries(next.map(deal => [deal.alertKey, deal.note])))
    } catch (error) {
      onError(asError(error))
    }
  }, [onError])

  useEffect(() => { void loadShortlist() }, [loadShortlist])

  const saveNote = async (alertKey: string) => {
    try {
      await postDealStatus(alertKey, 'saved', notes[alertKey] ?? '')
    } catch (error) {
      onError(asError(error))
    }
  }

  const unsave = async (alertKey: string) => {
    try {
      await postDealStatus(alertKey, null)
      await loadShortlist()
    } catch (error) {
      onError(asError(error))
    }
  }

  return (
    <div className="deal-list overflow">
      <table className="deal-list-table">
        <thead>
          <tr><th>Route</th><th>Date</th><th>Cabin</th><th>Program</th><th>Current ¢/pt</th><th>Seats</th><th>Note</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {deals.map(deal => {
            const [route, date, cabin, program] = deal.alertKey.split('|')
            const currentCpp = deal.current && (deal.current.cabin === 'economy' ? deal.current.cpp_raw : deal.current.cpp_conservative)
            return (
              <tr key={deal.alertKey}>
                <td>{route}</td><td>{date}</td><td>{cabin}</td><td>{program}</td>
                {deal.current
                  ? <><td>{currentCpp?.toFixed(2)}</td><td>{deal.current.seats}</td></>
                  : <td colSpan={2}><span className="chip chip-orange">no longer available</span></td>}
                <td>
                  <input
                    className="field"
                    value={notes[deal.alertKey] ?? ''}
                    onChange={event => setNotes(current => ({ ...current, [deal.alertKey]: event.target.value }))}
                    onBlur={() => void saveNote(deal.alertKey)}
                  />
                </td>
                <td>
                  <button className="btn btn-sm btn-plain" onClick={() => void unsave(deal.alertKey)}>Unsave</button>{' '}
                  <button className="btn btn-sm btn-quiet" onClick={() => onPick(route, cabin)}>History</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {deals.length === 0 && <p>No saved deals.</p>}
    </div>
  )
}

function HistoryTab({ route, cabin, onError }: { route: string; cabin: string; onError: (error: Error) => void }) {
  const [points, setPoints] = useState<HistoryPoint[]>([])
  useEffect(() => {
    if (route) fetchHistory(route, cabin).then(setPoints).catch(error => onError(asError(error)))
  }, [route, cabin, onError])
  if (!route) return <p className="content-sub">Pick a deal on the Deals tab to see its history.</p>
  return (
    <div className="card">
      <h3>{route} · {cabin} · ¢/pt over time</h3>
      <Sparkline values={points.map(point => point.cpp)} />
      <h3>Cash fare (CAD)</h3>
      <Sparkline values={points.map(point => point.cash_cad)} />
    </div>
  )
}

function RunsTab({ onError }: { onError: (error: Error) => void }) {
  const [scans, setScans] = useState<ScanRow[]>([])
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    fetchScans().then(setScans).catch(error => onError(asError(error)))
  }, [onError])

  useEffect(() => {
    if (!scanning) return
    let cancelled = false
    let polls = 0
    let timer: ReturnType<typeof setTimeout>

    const poll = async () => {
      try {
        const next = await fetchScans()
        if (cancelled) return
        setScans(next)
        polls += 1
        if (next[0]?.finished_at === null && polls < 20) {
          timer = setTimeout(poll, 5000)
        } else {
          setScanning(false)
        }
      } catch (error) {
        if (!cancelled) {
          setScanning(false)
          onError(asError(error))
        }
      }
    }

    timer = setTimeout(poll, 5000)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [scanning, onError])

  const scanNow = async () => {
    setScanning(true)
    try {
      await triggerScan()
    } catch (error) {
      setScanning(false)
      onError(asError(error))
    }
  }

  return (
    <div>
      <div className="content-header">
        <h4>Runs</h4>
        <button className="btn btn-primary" disabled={scanning} onClick={() => void scanNow()}>
          {scanning ? 'Scanning…' : 'Scan now'}
        </button>
      </div>
      <div className="deal-list overflow">
        <table className="deal-list-table">
          <thead><tr><th>#</th><th>Scope</th><th>Status</th><th>Started</th><th>Finished</th><th>Rows</th><th>Finalists</th><th>Errors</th></tr></thead>
          <tbody>
            {scans.map(scan => {
              const errorCount = scan.errors?.split(/\r?\n/).filter(line => line.trim().length > 0).length ?? 0
              return (
                <tr key={scan.id}>
                  <td>{scan.id}</td><td>{scan.scope}</td>
                  <td>
                    {scan.finished_at === null
                      ? <span className="chip chip-blue"><span className="dot" />running</span>
                      : <span className="chip chip-green"><span className="dot" />done</span>}
                  </td>
                  <td>{scan.started_at}</td><td>{scan.finished_at ?? 'running'}</td>
                  <td>{scan.rows_pulled}</td><td>{scan.finalists}</td>
                  <td>
                    {errorCount === 0 ? '—' : (
                      <details>
                        <summary><span className="chip chip-red">{errorCount} error{errorCount === 1 ? '' : 's'}</span></summary>
                        <pre className="err">{scan.errors}</pre>
                      </details>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const SETTINGS_GROUPS = [
  {
    heading: 'Scanning',
    keys: ['origin', 'excludedCountries', 'scanSchedule', 'maxPerRoute'],
  },
  {
    heading: 'Points',
    keys: ['pointsProgram', 'pointsBalance', 'currency', 'ratios'],
  },
  {
    heading: 'Thresholds',
    keys: [
      'thresholds.economy',
      'thresholds.premiumConservative',
      'minValue.economy',
      'minValue.premium',
      'alertImprovement',
    ],
  },
  {
    heading: 'Email',
    keys: ['digestEnabled', 'digestTo', 'smtp.host', 'smtp.port', 'smtp.user', 'smtp.password'],
  },
  {
    heading: 'Connection',
    keys: ['seatsAeroKey'],
  },
] as const

const JSON_SETTINGS = new Set(['ratios', 'excludedCountries', 'scanSchedule'])

const settingInputValue = (key: string, entry: SettingEntry): string => {
  if ('secret' in entry) return ''
  const value = String(entry.value)
  return JSON_SETTINGS.has(key) ? JSON.stringify(JSON.parse(value), null, 2) : value
}

function SettingsTab({ onError }: { onError: (error: Error) => void }) {
  const [settings, setSettings] = useState<Record<string, SettingEntry>>({})
  const [inputs, setInputs] = useState<Record<string, string>>({})

  const loadSettings = useCallback(async () => {
    try {
      const next = await fetchSettings()
      setSettings(next)
      setInputs(Object.fromEntries(Object.entries(next).map(([key, entry]) => [key, settingInputValue(key, entry)])))
    } catch (error) {
      onError(asError(error))
    }
  }, [onError])

  useEffect(() => { void loadSettings() }, [loadSettings])

  const save = async (key: string) => {
    const entry = settings[key]
    if (!entry || ('secret' in entry && !inputs[key])) return
    try {
      await putSettingValue(key, inputs[key] ?? '')
      await loadSettings()
    } catch (error) {
      onError(asError(error))
    }
  }

  const reset = async (key: string) => {
    try {
      await putSettingValue(key, null)
      await loadSettings()
    } catch (error) {
      onError(asError(error))
    }
  }

  return (
    <div>
      {SETTINGS_GROUPS.map(group => (
        <section className="inset-group" key={group.heading}>
          <div className="inset-group-title">{group.heading}</div>
          <div className="inset-list">
            {group.keys.map(key => {
              const entry = settings[key]
              if (!entry) return null
              const secret = 'secret' in entry
              const value = inputs[key] ?? settingInputValue(key, entry)
              const { label, hint } = settingLabel(key)
              return (
                <div className={JSON_SETTINGS.has(key) ? 'inset-row tall' : 'inset-row'} key={key}>
                  <span className="grow">
                    <label htmlFor={`setting-${key}`}>{label}</label>
                    {hint && <span className="hint">{hint}</span>}
                    {!secret && entry.overridden && <span className="hint">default: {String(entry.default)}</span>}
                  </span>
                  {key === 'digestEnabled' ? (
                    <button
                      id="setting-digestEnabled"
                      className={'toggle' + (value === 'true' ? ' on' : '')}
                      role="switch"
                      aria-checked={value === 'true'}
                      aria-label="Email digest"
                      onClick={() => {
                        const next = value === 'true' ? 'false' : 'true'
                        setInputs(current => ({ ...current, digestEnabled: next }))
                        void putSettingValue('digestEnabled', next).then(loadSettings).catch(err => onError(asError(err)))
                      }}
                    />
                  ) : JSON_SETTINGS.has(key) ? (
                    <textarea
                      className="field"
                      id={`setting-${key}`}
                      value={value}
                      onChange={event => setInputs(current => ({ ...current, [key]: event.target.value }))}
                    />
                  ) : secret ? (
                    <input
                      className="field"
                      id={`setting-${key}`}
                      type="password"
                      value={value}
                      placeholder={entry.set ? '••••• (set)' : 'not set'}
                      onChange={event => setInputs(current => ({ ...current, [key]: event.target.value }))}
                    />
                  ) : (
                    <input
                      className="inset-field"
                      id={`setting-${key}`}
                      value={value}
                      onChange={event => setInputs(current => ({ ...current, [key]: event.target.value }))}
                    />
                  )}
                  {key !== 'digestEnabled' && (
                    <button className="btn btn-sm btn-tinted" disabled={secret && !value} onClick={() => void save(key)}>Save</button>
                  )}
                  {secret ? (
                    <button className="btn btn-sm btn-destructive" onClick={() => void reset(key)}>Clear</button>
                  ) : entry.overridden && (
                    <button className="btn btn-sm btn-plain" onClick={() => void reset(key)}>Reset</button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

export default function App() {
  const [status, setStatus] = useState<Status | null>(null)
  const [tab, setTab] = useState<Tab>('deals')
  const [picked, setPicked] = useState<{ route: string; cabin: string }>({ route: '', cabin: 'economy' })
  const [banner, setBanner] = useState<string | null>(null)
  const [meta, setMeta] = useState<Meta>({ countries: [], continents: [], countryContinents: {}, pointsBalance: 0, origins: [] })
  const onError = useCallback((error: Error) => setBanner(error.message), [])
  const onPick = useCallback((route: string, cabin: string) => {
    setPicked({ route, cabin })
    setTab('history')
  }, [])

  useEffect(() => {
    fetchStatus().then(setStatus).catch(error => onError(asError(error)))
  }, [onError])

  useEffect(() => {
    if (!status?.configured) return
    fetchMeta().then(setMeta).catch(error => onError(asError(error)))
  }, [status?.configured, onError])

  if (!status) return null
  if (!status.configured) return <Wizard onDone={() => { void fetchStatus().then(setStatus) }} />

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Sections">
        <div className="app-title">✈️ Flight Checks</div>
        {TABS.map(t => (
          <span key={t.id}>
            {t.section && <div className="side-section">{t.section}</div>}
            <button className={`side-item${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
              {t.icon}{t.label}
            </button>
          </span>
        ))}
      </nav>
      <main className="content">
        {banner && <p className="toast toast-err" role="alert" onClick={() => setBanner(null)}>{banner}</p>}
        {tab === 'deals' && (
          <DealsTab meta={meta} onPick={onPick} onError={onError} />
        )}
        {tab === 'search' && <SearchTab onError={onError} origins={meta.origins} />}
        {tab === 'watches' && <WatchesTab meta={meta} onError={onError} />}
        {tab === 'shortlist' && <ShortlistTab onPick={onPick} onError={onError} />}
        {tab === 'history' && <HistoryTab route={picked.route} cabin={picked.cabin} onError={onError} />}
        {tab === 'runs' && <RunsTab onError={onError} />}
        {tab === 'settings' && <SettingsTab onError={onError} />}
      </main>
    </div>
  )
}
