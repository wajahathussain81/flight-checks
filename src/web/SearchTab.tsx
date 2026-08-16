import { useState } from 'react'
import type { ScoredDeal } from '../core/types.js'
import { airportLabel } from '../core/regions.js'
import { explanationMessage, type SearchExplanation } from './searchMessage.js'

const CABINS = ['economy', 'premium', 'business', 'first']
const GREAT_CPP = 2.5
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
    <div>
      <section className="card" style={{ maxWidth: 560 }}>
        <h2>Search a route</h2>
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <label className="field-label" htmlFor="search-origin">Origin</label>
            <input className="field" id="search-origin" value={form.origin} style={{ width: '100%' }}
              onChange={event => setForm(current => ({ ...current, origin: event.target.value.toUpperCase() }))} />
          </div>
          <div>
            <label className="field-label" htmlFor="search-destination">Destination</label>
            <input className="field" id="search-destination" value={form.destination} style={{ width: '100%' }}
              onChange={event => setForm(current => ({ ...current, destination: event.target.value.toUpperCase() }))} />
          </div>
          <div>
            <label className="field-label" htmlFor="search-from">Travel window</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <input className="field" id="search-from" aria-label="Travel window start" type="date" value={form.dateFrom}
                onChange={event => setForm(current => ({ ...current, dateFrom: event.target.value }))} />
              <input className="field" aria-label="Travel window end" type="date" value={form.dateTo}
                onChange={event => setForm(current => ({ ...current, dateTo: event.target.value }))} />
            </div>
          </div>
          <div>
            <span className="field-label" id="search-cabins">Cabins (empty = all)</span>
            <div role="group" aria-labelledby="search-cabins" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {CABINS.map(cabin => (
              <button
                key={cabin}
                type="button"
                className={form.cabins.includes(cabin) ? 'chip chip-blue' : 'chip chip-neutral'}
                aria-pressed={form.cabins.includes(cabin)}
                onClick={() => setForm(current => ({ ...current, cabins: toggleItem(current.cabins, cabin) }))}
              >
                {cabin}
              </button>
            ))}
            </div>
          </div>
          <div>
            <button className="btn btn-primary" disabled={loading || !form.destination || !form.dateFrom || !form.dateTo} onClick={() => void submit()}>
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>
        </div>
      </section>

      <p className="content-sub">Results come from seats.aero&apos;s cached data, not a live search.</p>

      {error && <p className="chip chip-red">{error}</p>}

      {!error && result && result.deals.length > 0 && (
        <div className="deal-list overflow">
          <table className="deal-list-table">
            <thead>
              <tr>
                <th>Route</th><th>Date</th><th>Cabin</th><th>Program</th>
                <th>MR points</th><th>Taxes</th><th>¢/pt</th><th>Seats</th>
              </tr>
            </thead>
            <tbody>
              {result.deals.map(deal => {
                const cpp = deal.cabin === 'economy' ? deal.cppRaw : deal.cppConservative
                return (
                  <tr key={`${deal.route}|${deal.date}|${deal.cabin}|${deal.program}`}>
                    <td>
                      <span className="deal-route">
                        {deal.route}
                        <span className="deal-dest">{airportLabel(deal.route.split('-')[1])}</span>
                      </span>
                    </td>
                    <td className="deal-num">{deal.date}</td>
                    <td><span className="chip chip-neutral">{deal.cabin}</span></td>
                    <td>{deal.program}</td>
                    <td className="deal-num">{deal.mrPoints.toLocaleString()}</td>
                    <td className="deal-num">${deal.taxesCad.toFixed(0)}</td>
                    <td>
                      <span className={'cpp' + (cpp >= GREAT_CPP ? ' cpp-great' : '')}>
                        {cpp.toFixed(2)}
                      </span>
                    </td>
                    <td className="deal-num">
                      {deal.seats}{' '}
                      {deal.direct && <span className="chip chip-blue">direct</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!error && result && result.deals.length === 0 && result.explanation && (
        <p>{explanationMessage(result.explanation)}</p>
      )}
    </div>
  )
}
