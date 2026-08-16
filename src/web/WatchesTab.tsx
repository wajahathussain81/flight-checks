import { useCallback, useEffect, useState } from 'react'
import {
  createWatchApi, deleteWatchApi, fetchWatchDeals, fetchWatches, updateWatchApi,
  type DealRow, type Meta, type WatchInput, type WatchRow,
} from './api.js'
import { airportLabel } from '../core/regions.js'
import { THEMES } from '../core/themes.js'

const CABINS = ['economy', 'premium', 'business', 'first']
const asError = (error: unknown) => error instanceof Error ? error : new Error(String(error))

const emptyForm: WatchInput = {
  name: '', enabled: true, dateFrom: '', dateTo: '',
  excludeCountries: [], includeContinents: [], themes: [], cabins: [], topN: 5, maxPerRoute: 1,
}

const toggleItem = (list: string[], item: string): string[] =>
  list.includes(item) ? list.filter(x => x !== item) : [...list, item]

const toInput = (w: WatchRow): WatchInput => ({
  name: w.name, enabled: w.enabled, dateFrom: w.dateFrom, dateTo: w.dateTo,
  excludeCountries: w.excludeCountries, includeContinents: w.includeContinents,
  themes: w.themes, cabins: w.cabins, topN: w.topN, maxPerRoute: w.maxPerRoute,
})

export function WatchesTab({ meta, onError }: { meta: Meta; onError: (error: Error) => void }) {
  const [watches, setWatches] = useState<WatchRow[]>([])
  const [form, setForm] = useState<WatchInput>(emptyForm)
  const [editing, setEditing] = useState<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [deals, setDeals] = useState<DealRow[]>([])

  const load = useCallback(async () => {
    try { setWatches(await fetchWatches()) } catch (error) { onError(asError(error)) }
  }, [onError])
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (selected === null) { setDeals([]); return }
    fetchWatchDeals(selected).then(setDeals).catch(error => onError(asError(error)))
  }, [selected, onError])

  const submit = async () => {
    try {
      if (editing === null) await createWatchApi(form)
      else await updateWatchApi(editing, form)
      setForm(emptyForm)
      setEditing(null)
      await load()
    } catch (error) { onError(asError(error)) }
  }

  const toggleEnabled = async (w: WatchRow) => {
    try {
      await updateWatchApi(w.id, { ...toInput(w), enabled: !w.enabled })
      await load()
    } catch (error) { onError(asError(error)) }
  }

  const remove = async (id: number) => {
    try {
      await deleteWatchApi(id)
      if (selected === id) setSelected(null)
      if (editing === id) { setEditing(null); setForm(emptyForm) }
      await load()
    } catch (error) { onError(asError(error)) }
  }

  const selectedWatch = watches.find(w => w.id === selected)

  return (
    <div>
      <div className="watch-grid">
        {watches.map(w => (
          <article className="card" key={w.id}>
            <div className="watch-card-header">
              <div>
                <h3>
                  <a href="#watch" onClick={event => { event.preventDefault(); setSelected(w.id) }}>{w.name}</a>
                </h3>
                <p className="content-sub">Travel window: {w.dateFrom} → {w.dateTo}</p>
                <p className="content-sub">State: {w.state} · Top {w.topN} · Max {w.maxPerRoute} per route</p>
              </div>
              <div className="watch-actions">
                <button type="button" className="btn btn-sm btn-plain" onClick={() => void toggleEnabled(w)}>
                  {w.enabled ? 'Disable' : 'Enable'}
                </button>
                <button type="button" className="btn btn-sm btn-plain" onClick={() => { setEditing(w.id); setForm(toInput(w)) }}>Edit</button>
                <button type="button" className="btn btn-sm btn-destructive" onClick={() => void remove(w.id)}>Delete</button>
              </div>
            </div>
            <div className="watch-criteria" aria-label="Watch criteria">
              <span className="chip chip-neutral">
                Excludes: {w.excludeCountries.length > 0 ? w.excludeCountries.join(', ') : 'none'}
              </span>
              <span className="chip chip-neutral">
                Continents: {w.includeContinents.length > 0 ? w.includeContinents.join(', ') : 'anywhere'}
              </span>
              <span className="chip chip-neutral">Vibe: {w.themes.length > 0 ? w.themes.join(', ') : 'any'}</span>
              <span className="chip chip-neutral">Cabins: {w.cabins.length > 0 ? w.cabins.join(', ') : 'all'}</span>
            </div>
          </article>
        ))}
      </div>
      {watches.length === 0 && <p className="content-sub">No watches yet — create one below.</p>}

      <section className="card watch-form">
        <h3>{editing === null ? 'New watch' : `Edit: ${form.name || 'watch'}`}</h3>
        <div className="watch-form-grid">
          <div>
            <label className="field-label" htmlFor="watch-name">Name</label>
            <input className="field" id="watch-name" value={form.name}
              onChange={event => setForm(current => ({ ...current, name: event.target.value }))} />
          </div>
          <div>
            <span className="field-label" id="watch-window">Travel window</span>
            <div className="watch-field-row" role="group" aria-labelledby="watch-window">
              <input className="field" id="watch-from" aria-label="Travel window start" type="date" value={form.dateFrom}
                onChange={event => setForm(current => ({ ...current, dateFrom: event.target.value }))} />
              <input className="field" aria-label="Travel window end" type="date" value={form.dateTo}
                onChange={event => setForm(current => ({ ...current, dateTo: event.target.value }))} />
            </div>
          </div>
          <div>
            <span className="field-label" id="watch-countries">Exclude countries</span>
            <div className="watch-chip-group" role="group" aria-labelledby="watch-countries">
              {meta.countries.map(country => (
                <button
                  key={country}
                  type="button"
                  className={form.excludeCountries.includes(country) ? 'chip chip-blue' : 'chip chip-neutral'}
                  aria-pressed={form.excludeCountries.includes(country)}
                  onClick={() => setForm(current => ({
                    ...current,
                    excludeCountries: toggleItem(current.excludeCountries, country),
                  }))}
                >
                  {country}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="field-label" id="watch-continents">Continents (empty = anywhere)</span>
            <div className="watch-chip-group" role="group" aria-labelledby="watch-continents">
              {meta.continents.map(continent => (
                <button
                  key={continent}
                  type="button"
                  className={form.includeContinents.includes(continent) ? 'chip chip-blue' : 'chip chip-neutral'}
                  aria-pressed={form.includeContinents.includes(continent)}
                  onClick={() => setForm(current => ({
                    ...current,
                    includeContinents: toggleItem(current.includeContinents, continent),
                  }))}
                >
                  {continent}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="field-label" id="watch-themes">Vibe (empty = any)</span>
            <div className="watch-chip-group" role="group" aria-labelledby="watch-themes">
              {THEMES.map(theme => (
                <button
                  key={theme}
                  type="button"
                  className={form.themes.includes(theme) ? 'chip chip-blue' : 'chip chip-neutral'}
                  aria-pressed={form.themes.includes(theme)}
                  onClick={() => setForm(current => ({ ...current, themes: toggleItem(current.themes, theme) }))}
                >
                  {theme}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="field-label" id="watch-cabins">Cabins (empty = all)</span>
            <div className="watch-chip-group" role="group" aria-labelledby="watch-cabins">
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
            <label className="field-label" htmlFor="watch-topn">Top deals per digest</label>
            <input className="field" id="watch-topn" type="number" min={1} value={form.topN}
              onChange={event => setForm(current => ({ ...current, topN: Number(event.target.value) }))} />
          </div>
          <div>
            <label className="field-label" htmlFor="watch-maxperroute">Max per route</label>
            <input className="field" id="watch-maxperroute" type="number" min={1} value={form.maxPerRoute}
              onChange={event => setForm(current => ({ ...current, maxPerRoute: Number(event.target.value) }))} />
            <span className="content-sub">1 shows a single deal per destination, so one route cannot fill every slot.</span>
          </div>
          <div className="watch-actions">
            <button type="button" className="btn btn-primary" onClick={() => void submit()}>
              {editing === null ? 'Create watch' : 'Save changes'}
            </button>
            {editing !== null && (
              <button type="button" className="btn btn-sm btn-plain" onClick={() => { setEditing(null); setForm(emptyForm) }}>Cancel</button>
            )}
          </div>
        </div>
      </section>

      {selectedWatch && (
        <section className="watch-results">
          <h2>👀 {selectedWatch.name} — current matches</h2>
          <div className="deal-list overflow">
            <table className="deal-list-table">
              <thead>
                <tr>
                  <th>Route</th><th>Date</th><th>Cabin</th><th>Program</th>
                  <th>MR points</th><th>Taxes</th><th>¢/pt</th><th>Seats</th>
                </tr>
              </thead>
              <tbody>
                {deals.map(d => {
                  const cpp = d.cabin === 'economy' ? d.cpp_raw : d.cpp_conservative
                  return (
                    <tr key={d.id}>
                      <td>
                        <span className="deal-route">
                          {d.route}
                          <span className="deal-dest">{airportLabel(d.route.split('-')[1])}</span>
                        </span>
                      </td>
                      <td className="deal-num">{d.date}</td>
                      <td><span className="chip chip-neutral">{d.cabin}</span></td>
                      <td>{d.program}</td>
                      <td className="deal-num">{d.mr_points.toLocaleString()}</td>
                      <td className="deal-num">${d.taxes_cad.toFixed(0)}</td>
                      <td><span className="cpp">{cpp.toFixed(2)}</span></td>
                      <td className="deal-num">
                        {d.seats}{' '}
                        {d.direct && <span className="chip chip-blue">direct</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {deals.length === 0 && <p className="content-sub">No deals in this window yet.</p>}
        </section>
      )}
    </div>
  )
}
