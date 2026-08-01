import { useState } from 'react'
import type { ScoredDeal } from '../core/types.js'
import { airportLabel } from '../core/regions.js'
import { explanationMessage, type SearchExplanation } from './searchMessage.js'

const CABINS = ['economy', 'premium', 'business', 'first']
const asError = (error: unknown) => error instanceof Error ? error : new Error(String(error))

const emptyForm = { origin: 'YYC', destination: '', dateFrom: '', dateTo: '', cabins: [] as string[] }

const toggleItem = (list: string[], item: string): string[] =>
  list.includes(item) ? list.filter(x => x !== item) : [...list, item]

interface SearchResult {
  deals: ScoredDeal[]
  explanation?: SearchExplanation
}

export function SearchTab({ onError }: { onError: (error: Error) => void }) {
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: form.origin,
          destination: form.destination,
          dateFrom: form.dateFrom,
          dateTo: form.dateTo,
          cabins: form.cabins,
        }),
      })
      const body = await res.json().catch(() => ({})) as SearchResult & { error?: string }
      if (!res.ok) {
        const message = body.error ?? `search failed: ${res.status}`
        setError(message)
        setResult(null)
        onError(new Error(message))
        return
      }
      setResult(body)
    } catch (err) {
      const asErr = asError(err)
      setError(asErr.message)
      setResult(null)
      onError(asErr)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="overflow">
      <section className="settings-group">
        <h2>Search a route</h2>
        <div className="settings-row">
          <label htmlFor="search-origin">Origin</label>
          <input id="search-origin" value={form.origin}
            onChange={event => setForm(current => ({ ...current, origin: event.target.value.toUpperCase() }))} />
        </div>
        <div className="settings-row">
          <label htmlFor="search-destination">Destination</label>
          <input id="search-destination" value={form.destination}
            onChange={event => setForm(current => ({ ...current, destination: event.target.value.toUpperCase() }))} />
        </div>
        <div className="settings-row">
          <label htmlFor="search-from">Travel window</label>
          <input id="search-from" type="date" value={form.dateFrom}
            onChange={event => setForm(current => ({ ...current, dateFrom: event.target.value }))} />
          <input type="date" value={form.dateTo}
            onChange={event => setForm(current => ({ ...current, dateTo: event.target.value }))} />
        </div>
        <div className="settings-row">
          <label>Cabins (empty = all)</label>
          <span>
            {CABINS.map(cabin => (
              <label key={cabin} style={{ marginRight: '1em' }}>
                <input type="checkbox" checked={form.cabins.includes(cabin)}
                  onChange={() => setForm(current => ({ ...current, cabins: toggleItem(current.cabins, cabin) }))} />
                {' '}{cabin}
              </label>
            ))}
          </span>
        </div>
        <button disabled={loading || !form.destination || !form.dateFrom || !form.dateTo} onClick={() => void submit()}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </section>

      <p>Results come from seats.aero&apos;s cached data, not a live search.</p>

      {error && <p className="wizard-err">{error}</p>}

      {!error && result && result.deals.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Route</th><th>Destination</th><th>Date</th><th>Cabin</th><th>Program</th>
              <th>MR points</th><th>Taxes</th><th>¢/pt</th><th>Seats</th>
            </tr>
          </thead>
          <tbody>
            {result.deals.map(deal => {
              const cpp = deal.cabin === 'economy' ? deal.cppRaw : deal.cppConservative
              return (
                <tr key={`${deal.route}|${deal.date}|${deal.cabin}|${deal.program}`}>
                  <td>{deal.route}</td><td>{airportLabel(deal.route.split('-')[1])}</td><td>{deal.date}</td>
                  <td>{deal.cabin}</td><td>{deal.program}</td><td>{deal.mrPoints.toLocaleString()}</td>
                  <td>${deal.taxesCad.toFixed(0)}</td>
                  <td className="value">{cpp.toFixed(2)}</td>
                  <td>{deal.seats}{deal.direct ? ' · direct' : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {!error && result && result.deals.length === 0 && result.explanation && (
        <p>{explanationMessage(result.explanation)}</p>
      )}
    </div>
  )
}
