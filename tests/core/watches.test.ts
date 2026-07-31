import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, type DB } from '../../src/core/db.js'
import {
  createWatch, deleteWatch, getWatch, listWatches, matchWatch, updateWatch,
  validateWatchInput, watchState, type WatchInput,
} from '../../src/core/watches.js'
import { rankingCpp } from '../../src/core/valuation.js'
import type { ScoredDeal } from '../../src/core/types.js'

const input: WatchInput = {
  name: 'Post-Ramadan international',
  dateFrom: '2027-03-10', dateTo: '2027-04-15',
  excludeCountries: ['USA', 'Canada'], themes: ['beach'], topN: 5,
}

let db: DB
beforeEach(() => { db = openDb(':memory:') })

describe('watch CRUD', () => {
  it('creates with defaults and reads back', () => {
    const w = createWatch(db, input)
    expect(w.id).toBeGreaterThan(0)
    expect(w.enabled).toBe(true)
    expect(w.includeContinents).toEqual([])
    expect(w.cabins).toEqual([])
    expect(w.createdAt).toBeTruthy()
    expect(getWatch(db, w.id)).toEqual(w)
  })

  it('lists watches', () => {
    createWatch(db, input)
    createWatch(db, { ...input, name: 'Second' })
    const { watches, errors } = listWatches(db)
    expect(watches.map(w => w.name)).toEqual(['Post-Ramadan international', 'Second'])
    expect(errors).toEqual([])
  })

  it('updates and returns null for unknown id', () => {
    const w = createWatch(db, input)
    const updated = updateWatch(db, w.id, { ...input, name: 'Renamed', enabled: false, topN: 3 })
    expect(updated?.name).toBe('Renamed')
    expect(updated?.enabled).toBe(false)
    expect(updated?.topN).toBe(3)
    expect(updateWatch(db, 9999, input)).toBeNull()
  })

  it('deletes', () => {
    const w = createWatch(db, input)
    expect(deleteWatch(db, w.id)).toBe(true)
    expect(deleteWatch(db, w.id)).toBe(false)
    expect(getWatch(db, w.id)).toBeNull()
  })

  it('skips malformed rows with an error instead of throwing', () => {
    createWatch(db, input)
    db.prepare(`INSERT INTO watches (name, date_from, date_to, themes, created_at)
      VALUES ('broken', '2027-03-10', '2027-04-15', 'not-json', '2026-07-30')`).run()
    const { watches, errors } = listWatches(db)
    expect(watches).toHaveLength(1)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/broken/)
  })
})

describe('validateWatchInput', () => {
  it('accepts a valid input', () => {
    expect(validateWatchInput(input)).toBeNull()
  })
  it.each([
    [{}, /name/],
    [{ ...input, name: '  ' }, /name/],
    [{ ...input, dateFrom: '2027-3-1' }, /dateFrom/],
    [{ ...input, dateTo: 'soon' }, /dateTo/],
    [{ ...input, dateFrom: '2027-05-01' }, /before/],
    [{ ...input, excludeCountries: ['Narnia'] }, /unknown country/],
    [{ ...input, includeContinents: ['Atlantis'] }, /unknown continent/],
    [{ ...input, themes: ['ski'] }, /unknown theme/],
    [{ ...input, cabins: ['suite'] }, /unknown cabin/],
    [{ ...input, topN: 0 }, /topN/],
    [{ ...input, topN: 2.5 }, /topN/],
  ])('rejects %j', (bad, pattern) => {
    expect(validateWatchInput(bad)).toMatch(pattern)
  })
})

describe('watchState', () => {
  const w = () => createWatch(db, input)
  it('active while enabled and not past dateTo', () => {
    expect(watchState(w(), '2027-04-15')).toBe('active')
    expect(watchState(w(), '2026-07-30')).toBe('active')
  })
  it('expired after dateTo', () => {
    expect(watchState(w(), '2027-04-16')).toBe('expired')
  })
  it('disabled wins over dates', () => {
    const watch = createWatch(db, { ...input, enabled: false })
    expect(watchState(watch, '2026-07-30')).toBe('disabled')
  })
})

const deal = (over: Partial<ScoredDeal> = {}): ScoredDeal => ({
  route: 'YYC-CUN', date: '2027-03-20', cabin: 'economy', program: 'aeroplan',
  miles: 30000, taxesCad: 90, seats: 2, direct: true,
  cashCad: 700, economyCashCad: 700, mrPoints: 30000, cppRaw: 2.03, cppConservative: 2.03,
  ...over,
})

describe('matchWatch', () => {
  const watch = () => createWatch(db, input) // Mar 10 – Apr 15 2027, excl USA+Canada, beach

  it('includes window edges and rejects outside dates', () => {
    const deals = [
      deal({ date: '2027-03-10' }), deal({ date: '2027-04-15' }),
      deal({ date: '2027-03-09' }), deal({ date: '2027-04-16' }),
    ]
    expect(matchWatch(watch(), deals, rankingCpp).map(d => d.date).sort())
      .toEqual(['2027-03-10', '2027-04-15'])
  })

  it('drops excluded countries', () => {
    const deals = [deal(), deal({ route: 'YYC-MIA' }), deal({ route: 'YYC-YYZ' })]
    expect(matchWatch(watch(), deals, rankingCpp).map(d => d.route)).toEqual(['YYC-CUN'])
  })

  it('applies themes: beach keeps CUN, drops LHR', () => {
    const deals = [deal(), deal({ route: 'YYC-LHR' })]
    expect(matchWatch(watch(), deals, rankingCpp).map(d => d.route)).toEqual(['YYC-CUN'])
  })

  it('applies includeContinents when set', () => {
    const w = createWatch(db, { ...input, themes: [], includeContinents: ['Oceania'] })
    const deals = [deal(), deal({ route: 'YYC-NAN' })]
    expect(matchWatch(w, deals, rankingCpp).map(d => d.route)).toEqual(['YYC-NAN'])
  })

  it('applies cabin filter when set', () => {
    const w = createWatch(db, { ...input, cabins: ['business'] })
    const deals = [deal(), deal({ cabin: 'business', cppConservative: 4.0 })]
    expect(matchWatch(w, deals, rankingCpp).map(d => d.cabin)).toEqual(['business'])
  })

  it('ranks by the provided rank function and caps at topN', () => {
    const w = createWatch(db, { ...input, topN: 2 })
    const deals = [
      deal({ cppRaw: 1.5, cppConservative: 1.5, miles: 40000 }),
      deal({ route: 'YYC-MBJ', cppRaw: 3.0, cppConservative: 3.0 }),
      deal({ route: 'YYC-PUJ', cabin: 'business', cppRaw: 9.9, cppConservative: 2.0 }),
    ]
    const got = matchWatch(w, deals, rankingCpp)
    // business ranks on conservative (2.0), so MBJ economy (3.0) wins
    expect(got.map(d => d.route)).toEqual(['YYC-MBJ', 'YYC-PUJ'])
  })
})
