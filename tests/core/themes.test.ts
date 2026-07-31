import { describe, it, expect } from 'vitest'
import { AIRPORT_REGION } from '../../src/core/regions.js'
import { AIRPORT_THEMES, THEMES } from '../../src/core/themes.js'

describe('AIRPORT_THEMES', () => {
  it('tags every airport in AIRPORT_REGION with at least one theme', () => {
    const untagged = Object.keys(AIRPORT_REGION).filter(a => !(AIRPORT_THEMES[a]?.length >= 1))
    expect(untagged).toEqual([])
  })

  it('uses only known themes', () => {
    for (const [airport, themes] of Object.entries(AIRPORT_THEMES)) {
      for (const t of themes) {
        expect(THEMES, `${airport} has unknown theme ${t}`).toContain(t)
      }
    }
  })

  it('has no airports outside AIRPORT_REGION', () => {
    const extra = Object.keys(AIRPORT_THEMES).filter(a => !(a in AIRPORT_REGION))
    expect(extra).toEqual([])
  })

  it('spot-checks curated tags', () => {
    expect(AIRPORT_THEMES.CUN).toEqual(['beach'])
    expect(AIRPORT_THEMES.FCO).toEqual(['city'])
    expect(AIRPORT_THEMES.KEF).toEqual(['nature'])
    expect(AIRPORT_THEMES.IST).toContain('city')
    expect(AIRPORT_THEMES.IST).toContain('beach')
  })
})
