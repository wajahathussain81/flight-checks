import { useEffect, useRef, useState } from 'react'
import type { ScoredDeal } from '../core/types.js'
import { airportLabel } from '../core/regions.js'
import { countryName } from '../core/countries.js'
import { explanationMessage, type SearchExplanation } from './searchMessage.js'
import { fetchAirports, type AirportSuggestion } from './api.js'

const CABINS = ['economy', 'premium', 'business', 'first']
const GREAT_CPP = 2.5
const SUGGEST_DEBOUNCE_MS = 200
const asError = (error: unknown) => error instanceof Error ? error : new Error(String(error))

const emptyForm = { origin: 'YYC', destination: '', dateFrom: '', dateTo: '', cabins: [] as string[] }

const toggleItem = (list: string[], item: string): string[] =>
  list.includes(item) ? list.filter(x => x !== item) : [...list, item]

interface SearchResult {
  deals: ScoredDeal[]
  explanation?: SearchExplanation
}

interface AirportOption {
  code: string
  detail: string
}

function AirportField({ id, label, value, options, onChange }: {
  id: string
  label: string
  value: string
  options: AirportOption[]
  onChange: (value: string) => void
}) {
  const [focused, setFocused] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const optionRefs = useRef<Array<HTMLDivElement | null>>([])
  const listboxId = `${id}-options`
  const optionsKey = options.map(option => `${option.code}:${option.detail}`).join('|')
  const panelOpen = focused && open && options.length > 0

  useEffect(() => {
    setActiveIndex(-1)
  }, [value, optionsKey])

  useEffect(() => {
    if (panelOpen && activeIndex >= 0) optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, panelOpen])

  const selectOption = (option: AirportOption) => {
    onChange(option.code)
    setActiveIndex(-1)
    setOpen(false)
  }

  return (
    <div>
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="airport-field">
        <input
          className="field"
          id={id}
          value={value}
          style={{ width: '100%' }}
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={panelOpen}
          aria-controls={listboxId}
          aria-activedescendant={panelOpen && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          onFocus={() => { setFocused(true); setOpen(true) }}
          onBlur={() => { setFocused(false); setOpen(false); setActiveIndex(-1) }}
          onChange={event => {
            setOpen(true)
            onChange(event.target.value.toUpperCase())
          }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' && options.length > 0) {
              event.preventDefault()
              setOpen(true)
              setActiveIndex(current => current < options.length - 1 ? current + 1 : 0)
            } else if (event.key === 'ArrowUp' && options.length > 0) {
              event.preventDefault()
              setOpen(true)
              setActiveIndex(current => current > 0 ? current - 1 : options.length - 1)
            } else if (event.key === 'Enter' && panelOpen) {
              event.preventDefault()
              if (activeIndex >= 0) selectOption(options[activeIndex])
            } else if (event.key === 'Escape' && panelOpen) {
              event.preventDefault()
              setActiveIndex(-1)
              setOpen(false)
            }
          }}
        />
        {panelOpen && (
          <div className="airport-suggestions" id={listboxId} role="listbox">
            {options.map((option, index) => (
              <div
                className={'airport-suggestion' + (index === activeIndex ? ' active' : '')}
                id={`${listboxId}-${index}`}
                key={`${option.code}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                ref={element => { optionRefs.current[index] = element }}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={event => event.preventDefault()}
                onClick={() => selectOption(option)}
              >
                <span className="airport-suggestion-code">{option.code}</span>
                <span className="airport-suggestion-detail">{option.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Debounced airport typeahead: fetches suggestions for a field's current value, ignoring stale responses. */
function useAirportSuggestions(query: string) {
  const [suggestions, setSuggestions] = useState<AirportSuggestion[]>([])
  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      fetchAirports(query)
        .then(results => { if (!cancelled) setSuggestions(results) })
        .catch(() => { /* suggestions are best-effort; ignore failures */ })
    }, SUGGEST_DEBOUNCE_MS)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query])
  return suggestions
}

export function SearchTab({ onError, origins }: { onError: (error: Error) => void; origins: string[] }) {
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const originEdited = useRef(false)

  // Origin pre-populates from the configured origins once they load, unless the user already touched the field.
  useEffect(() => {
    if (originEdited.current) return
    if (origins.length > 0) setForm(current => ({ ...current, origin: origins[0] }))
  }, [origins])

  const originSuggestions = useAirportSuggestions(form.origin)
  const destinationSuggestions = useAirportSuggestions(form.destination)
  // Below the 2-char search threshold, fall back to the user's own configured origins as options.
  const originOptions = form.origin.trim().length < 2
    ? origins.map(code => ({ code, detail: airportLabel(code) }))
    : originSuggestions.map(s => ({ code: s.code, detail: `${s.city}, ${countryName(s.country)}` }))
  const destinationOptions = destinationSuggestions.map(s => ({
    code: s.code,
    detail: `${s.city}, ${countryName(s.country)}`,
  }))

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
          <AirportField
            id="search-origin"
            label="Origin"
            value={form.origin}
            options={originOptions}
            onChange={value => {
              originEdited.current = true
              setForm(current => ({ ...current, origin: value }))
            }}
          />
          <AirportField
            id="search-destination"
            label="Destination"
            value={form.destination}
            options={destinationOptions}
            onChange={value => setForm(current => ({ ...current, destination: value }))}
          />
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
