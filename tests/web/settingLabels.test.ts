import { describe, expect, it } from 'vitest'
import { SETTING_LABELS, settingLabel } from '../../src/web/settingLabels.js'

const GROUP_KEYS = [
  'origin', 'excludedCountries', 'scanSchedule', 'maxPerRoute',
  'pointsProgram', 'pointsBalance', 'currency', 'ratios',
  'thresholds.economy', 'thresholds.premiumConservative',
  'minValue.economy', 'minValue.premium', 'alertImprovement',
  'digestEnabled', 'digestTo', 'smtp.host', 'smtp.port', 'smtp.user', 'smtp.password',
  'seatsAeroKey',
]

describe('settingLabels', () => {
  it('covers every settings-tab key with a non-key label', () => {
    for (const key of GROUP_KEYS) {
      expect(SETTING_LABELS[key], key).toBeDefined()
      expect(SETTING_LABELS[key].label).not.toBe(key)
    }
  })
  it('falls back to the raw key for unknown settings', () => {
    expect(settingLabel('mystery').label).toBe('mystery')
  })
})
