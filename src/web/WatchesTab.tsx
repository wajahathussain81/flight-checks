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
  excludeCountries: [], includeContinents: [], themes: [], cabins: [], topN: 5,
}

const toggleItem = (list: string[], item: string): string[] =>
  list.includes(item) ? list.filter(x => x !== item) : [...list, item]

const toInput = (w: WatchRow): WatchInput => ({
  name: w.name, enabled: w.enabled, dateFrom: w.dateFrom, dateTo: w.dateTo,
  excludeCountries: w.excludeCountries, includeContinents: w.includeContinents,
  themes: w.themes, cabins: w.cabins, topN: w.topN,
})

const watchSummary = (w: WatchRow): string => [
  `${w.dateFrom} → ${w.dateTo}`,
  w.excludeCountries.length ? `excl. ${w.excludeCountries.join(', ')}` : '',
  w.includeContinents.join(', '),
  w.themes.join('/'),
  w.cabins.join('/'),
].filter(Boolean).join(' · ')

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
    <div className="overflow">
      <table>
        <thead>
          <tr><th>Watch</th><th>Rules</th><th>State</th><th>Top</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {watches.map(w => (
            <tr key={w.id} className={w.state !== 'active' ? 'dimmed' : ''}>
              <td>
                <a href="#watch" onClick={event => { event.preventDefault(); setSelected(w.id) }}>{w.name}</a>
              </td>
              <td>{watchSummary(w)}</td>
              <td>{w.state}</td>
              <td>{w.topN}</td>
              <td>
                <button className="small" onClick={() => void toggleEnabled(w)}>
                  {w.enabled ? 'Disable' : 'Enable'}
                </button>{' '}
                <button className="small" onClick={() => { setEditing(w.id); setForm(toInput(w)) }}>Edit</button>{' '}
                <button className="small" onClick={() => void remove(w.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {watches.length === 0 && <p>No watches yet — create one below.</p>}

      <section className="settings-group">
        <h2>{editing === null ? 'New watch' : `Edit: ${form.name || 'watch'}`}</h2>
        <div className="settings-row">
          <label htmlFor="watch-name">Name</label>
          <input id="watch-name" value={form.name}
            onChange={event => setForm(current => ({ ...current, name: event.target.value }))} />
        </div>
        <div className="settings-row">
          <label htmlFor="watch-from">Travel window</label>
          <input id="watch-from" type="date" value={form.dateFrom}
            onChange={event => setForm(current => ({ ...current, dateFrom: event.target.value }))} />
          <input type="date" value={form.dateTo}
            onChange={event => setForm(current => ({ ...current, dateTo: event.target.value }))} />
        </div>
        <div className="settings-row">
          <label>Exclude countries</label>
          <select multiple size={6} value={form.excludeCountries}
            onChange={event => setForm(current => ({
              ...current,
              excludeCountries: [...event.target.selectedOptions].map(o => o.value),
            }))}>
            {meta.countries.map(country => <option key={country} value={country}>{country}</option>)}
          </select>
        </div>
        <div className="settings-row">
          <label>Continents (empty = anywhere)</label>
          <select multiple size={6} value={form.includeContinents}
            onChange={event => setForm(current => ({
              ...current,
              includeContinents: [...event.target.selectedOptions].map(o => o.value),
            }))}>
            {meta.continents.map(continent => <option key={continent} value={continent}>{continent}</option>)}
          </select>
        </div>
        <div className="settings-row">
          <label>Vibe (empty = any)</label>
          <span>
            {THEMES.map(theme => (
              <label key={theme} style={{ marginRight: '1em' }}>
                <input type="checkbox" checked={form.themes.includes(theme)}
                  onChange={() => setForm(current => ({ ...current, themes: toggleItem(current.themes, theme) }))} />
                {' '}{theme}
              </label>
            ))}
          </span>
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
        <div className="settings-row">
          <label htmlFor="watch-topn">Top deals per digest</label>
          <input id="watch-topn" type="number" min={1} value={form.topN}
            onChange={event => setForm(current => ({ ...current, topN: Number(event.target.value) }))} />
        </div>
        <button onClick={() => void submit()}>{editing === null ? 'Create watch' : 'Save changes'}</button>
        {editing !== null && (
          <button onClick={() => { setEditing(null); setForm(emptyForm) }}>Cancel</button>
        )}
      </section>

      {selectedWatch && (
        <section>
          <h2>👀 {selectedWatch.name} — current matches</h2>
          <table>
            <thead>
              <tr>
                <th>Route</th><th>Destination</th><th>Date</th><th>Cabin</th><th>Program</th>
                <th>MR points</th><th>Taxes</th><th>¢/pt</th><th>Seats</th>
              </tr>
            </thead>
            <tbody>
              {deals.map(d => {
                const cpp = d.cabin === 'economy' ? d.cpp_raw : d.cpp_conservative
                return (
                  <tr key={d.id}>
                    <td>{d.route}</td><td>{airportLabel(d.route.split('-')[1])}</td><td>{d.date}</td>
                    <td>{d.cabin}</td><td>{d.program}</td><td>{d.mr_points.toLocaleString()}</td>
                    <td>${d.taxes_cad.toFixed(0)}</td>
                    <td className="value">{cpp.toFixed(2)}</td>
                    <td>{d.seats}{d.direct ? ' · direct' : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {deals.length === 0 && <p>No deals in this window yet.</p>}
        </section>
      )}
    </div>
  )
}
