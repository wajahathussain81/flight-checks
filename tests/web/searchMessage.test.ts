import { describe, expect, it } from 'vitest'
import { explanationMessage } from '../../src/web/searchMessage.js'

describe('explanationMessage', () => {
  it('explains a monitored route with no current availability', () => {
    expect(explanationMessage({ reason: 'no-availability', monitoredBy: ['aeroplan'] }))
      .toBe('This route is monitored, but nothing is currently available.')
  })

  it('explains an unmonitored route with no coverage anywhere', () => {
    expect(explanationMessage({ reason: 'not-monitored', monitoredBy: [] }))
      .toBe('No program you have configured monitors this route.')
  })

  it('names the programs that reach the destination from elsewhere', () => {
    const message = explanationMessage({ reason: 'not-monitored', monitoredBy: ['delta', 'flyingblue'] })
    expect(message).toBe(
      'No program you have configured flies this route, but delta, flyingblue reach this destination from another origin — positioning there would unlock it.',
    )
    expect(message).toContain('delta')
    expect(message).toContain('flyingblue')
  })
})
