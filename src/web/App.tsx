import { useCallback, useEffect, useState } from 'react'
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
import { airportLabel } from '../core/regions.js'

type Tab = 'deals' | 'search' | 'watches' | 'shortlist' | 'history' | 'runs' | 'settings'
type SortColumn = 'cpp' | 'date' | 'mr_points' | 'seats' | 'cash_cad'

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

  return (
    <div className="overflow">
      <div className="filters">
        <select
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
        <select value={filters.country} onChange={event => setFilters(current => ({ ...current, country: event.target.value }))}>
          <option value="">All countries</option>
          {countries.map(country => <option key={country} value={country}>{country}</option>)}
        </select>
        <select value={filters.month} onChange={event => setFilters(current => ({ ...current, month: event.target.value }))}>
          <option value="">All months</option>
          {months.map(month => <option key={month} value={month}>{month}</option>)}
        </select>
        <select value={filters.cabin} onChange={event => setFilters(current => ({ ...current, cabin: event.target.value }))}>
          <option value="">All cabins</option>
          <option value="economy">Economy</option>
          <option value="premium">Premium economy</option>
          <option value="business">Business</option>
          <option value="first">First</option>
        </select>
        <input
          type="number"
          placeholder="Min ¢/pt"
          value={filters.minCpp}
          onChange={event => setFilters(current => ({ ...current, minCpp: event.target.value }))}
        />
        <input
          type="search"
          placeholder="Search"
          value={filters.q}
          onChange={event => setFilters(current => ({ ...current, q: event.target.value }))}
        />
        <label>
          <input
            type="checkbox"
            checked={filters.includeDismissed}
            onChange={event => setFilters(current => ({ ...current, includeDismissed: event.target.checked }))}
          />{' '}
          show dismissed
        </label>
        {filters.country && (
          <button className="small" disabled={scanning} onClick={() => void scanCountry()}>
            {scanning ? 'Scanning…' : `Scan ${filters.country}`}
          </button>
        )}
      </div>
      <table>
        <thead>
          <tr>
            <th>Route</th><th>Destination</th>{sortLabel('Date', 'date')}<th>Cabin</th><th>Program</th>
            {sortLabel('MR points', 'mr_points')}<th>Taxes</th>{sortLabel('Cash comp', 'cash_cad')}
            {sortLabel('¢/pt', 'cpp')}{sortLabel('Seats', 'seats')}<th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {deals.map(deal => {
            const cpp = deal.cabin === 'economy' ? deal.cpp_raw : deal.cpp_conservative
            const rowClasses = [deal.mr_points <= meta.pointsBalance ? 'fits' : '', deal.status === 'dismissed' ? 'dimmed' : '']
              .filter(Boolean).join(' ')
            return (
              <tr
                key={deal.id}
                className={rowClasses}
                onClick={() => onPick(deal.route, deal.cabin)}
                style={{ cursor: 'pointer' }}
              >
                <td>{deal.route}</td><td>{airportLabel(deal.route.split('-')[1])}</td><td>{deal.date}</td>
                <td>{deal.cabin}</td><td>{deal.program}</td><td>{deal.mr_points.toLocaleString()}</td>
                <td>${deal.taxes_cad.toFixed(0)}</td><td>${Math.round(deal.cash_cad).toLocaleString()}</td>
                <td className="value">{cpp.toFixed(2)}{deal.cabin !== 'economy' ? ` (${deal.cpp_raw.toFixed(2)} raw)` : ''}</td>
                <td>{deal.seats}{deal.direct ? ' · direct' : ''}</td>
                <td onClick={event => event.stopPropagation()}>
                  <button
                    className={`small${deal.status === 'saved' ? ' active' : ''}`}
                    onClick={() => void changeStatus(deal, 'saved')}
                  >
                    {deal.status === 'saved' ? '✓ saved' : 'Save'}
                  </button>{' '}
                  <button className="small" onClick={() => void changeStatus(deal, 'dismissed')}>
                    {deal.status === 'dismissed' ? 'Undo dismiss' : 'Dismiss'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
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
    <div className="overflow">
      <table>
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
                  : <td colSpan={2}>no longer available</td>}
                <td>
                  <input
                    value={notes[deal.alertKey] ?? ''}
                    onChange={event => setNotes(current => ({ ...current, [deal.alertKey]: event.target.value }))}
                    onBlur={() => void saveNote(deal.alertKey)}
                  />
                </td>
                <td>
                  <button className="small" onClick={() => void unsave(deal.alertKey)}>Unsave</button>{' · '}
                  <a href="#history" onClick={event => { event.preventDefault(); onPick(route, cabin) }}>History</a>
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
  if (!route) return <p>Pick a deal on the Deals tab to see its history.</p>
  return (
    <div>
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
    <div className="overflow">
      <button disabled={scanning} onClick={() => void scanNow()}>{scanning ? 'Scanning…' : 'Scan now'}</button>
      <table>
        <thead><tr><th>#</th><th>Scope</th><th>Started</th><th>Finished</th><th>Rows</th><th>Finalists</th><th>Errors</th></tr></thead>
        <tbody>
          {scans.map(scan => (
            <tr key={scan.id}>
              <td>{scan.id}</td><td>{scan.scope}</td><td>{scan.started_at}</td><td>{scan.finished_at ?? 'running'}</td>
              <td>{scan.rows_pulled}</td><td>{scan.finalists}</td>
              <td>{scan.errors ? <pre className="err">{scan.errors}</pre> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
        <section className="settings-group" key={group.heading}>
          <h2>{group.heading}</h2>
          {group.keys.map(key => {
            const entry = settings[key]
            if (!entry) return null
            const secret = 'secret' in entry
            const value = inputs[key] ?? settingInputValue(key, entry)
            return (
              <div className="settings-row" key={key}>
                <label htmlFor={`setting-${key}`}>{key}</label>
                {secret ? (
                  <input
                    id={`setting-${key}`}
                    type="password"
                    value={value}
                    placeholder={entry.set ? '••••• (set)' : 'not set'}
                    onChange={event => setInputs(current => ({ ...current, [key]: event.target.value }))}
                  />
                ) : JSON_SETTINGS.has(key) ? (
                  <textarea
                    id={`setting-${key}`}
                    value={value}
                    onChange={event => setInputs(current => ({ ...current, [key]: event.target.value }))}
                  />
                ) : key === 'digestEnabled' ? (
                  <select
                    id={`setting-${key}`}
                    value={value}
                    onChange={event => setInputs(current => ({ ...current, [key]: event.target.value }))}
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    id={`setting-${key}`}
                    value={value}
                    onChange={event => setInputs(current => ({ ...current, [key]: event.target.value }))}
                  />
                )}
                <button disabled={secret && !value} onClick={() => void save(key)}>Save</button>
                {secret ? (
                  <button onClick={() => void reset(key)}>Clear</button>
                ) : entry.overridden && (
                  <>
                    <button onClick={() => void reset(key)}>Reset</button>
                    <span>default: {String(entry.default)}</span>
                  </>
                )}
              </div>
            )
          })}
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
  const [meta, setMeta] = useState<Meta>({ countries: [], continents: [], countryContinents: {}, pointsBalance: 0 })
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
    <div>
      <h1>✈️ Flight Checks</h1>
      {banner && <p className="banner" onClick={() => setBanner(null)}>{banner}</p>}
      <nav>
        {(['deals', 'search', 'watches', 'shortlist', 'history', 'runs', 'settings'] as Tab[]).map(currentTab => (
          <button key={currentTab} className={tab === currentTab ? 'active' : ''} onClick={() => setTab(currentTab)}>
            {currentTab[0].toUpperCase() + currentTab.slice(1)}
          </button>
        ))}
      </nav>
      {tab === 'deals' && (
        <DealsTab meta={meta} onPick={onPick} onError={onError} />
      )}
      {tab === 'search' && <SearchTab onError={onError} />}
      {tab === 'watches' && <WatchesTab meta={meta} onError={onError} />}
      {tab === 'shortlist' && <ShortlistTab onPick={onPick} onError={onError} />}
      {tab === 'history' && <HistoryTab route={picked.route} cabin={picked.cabin} onError={onError} />}
      {tab === 'runs' && <RunsTab onError={onError} />}
      {tab === 'settings' && <SettingsTab onError={onError} />}
    </div>
  )
}
