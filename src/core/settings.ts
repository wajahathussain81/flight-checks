import { defaultConfig, applyEnv, type Config } from './config.js'
import { getSettings, type DB } from './db.js'

export const SETTING_KEYS = [
  'thresholds.economy', 'thresholds.premiumConservative',
  'minValue.economy', 'minValue.premium',
  'maxPerRoute', 'pointsBalance', 'alertImprovement', 'digestTo',
  'origin', 'pointsProgram', 'currency', 'excludedCountries', 'ratios',
  'scanSchedule', 'digestEnabled', 'smtp.host', 'smtp.port', 'smtp.user',
  'seatsAeroKey', 'smtp.password',
] as const

export type SettingKey = (typeof SETTING_KEYS)[number]
export const SECRET_KEYS = ['seatsAeroKey', 'smtp.password'] as const

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const NUMERIC: readonly string[] = [
  'thresholds.economy', 'thresholds.premiumConservative', 'minValue.economy',
  'minValue.premium', 'maxPerRoute', 'pointsBalance', 'alertImprovement',
]

const validTimezone = (tz: string): boolean => {
  try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); return true } catch { return false }
}
const parseJson = (v: string): unknown => { try { return JSON.parse(v) } catch { return undefined } }

export function validateSetting(key: string, value: string): string | null {
  if (!(SETTING_KEYS as readonly string[]).includes(key)) return `unknown setting: ${key}`
  if (key === 'digestTo') return EMAIL.test(value) ? null : 'must be an email address'
  if (key === 'origin') return /^[A-Z]{3}$/.test(value) ? null : 'must be a 3-letter IATA code'
  if (key === 'pointsProgram' || key === 'currency' || key === 'smtp.host' || key === 'smtp.user')
    return value.trim() ? null : 'must not be empty'
  if ((SECRET_KEYS as readonly string[]).includes(key)) return value ? null : 'must not be empty'
  if (key === 'digestEnabled') return value === 'true' || value === 'false' ? null : "must be 'true' or 'false'"
  if (key === 'smtp.port') {
    const n = Number(value)
    return Number.isInteger(n) && n >= 1 && n <= 65535 ? null : 'must be a port (1-65535)'
  }
  if (key === 'excludedCountries') {
    const v = parseJson(value)
    return Array.isArray(v) && v.every(x => typeof x === 'string') ? null : 'must be a JSON array of country names'
  }
  if (key === 'ratios') {
    const v = parseJson(value)
    if (!v || typeof v !== 'object' || Array.isArray(v)) return 'must be a JSON object of program: ratio'
    const vals = Object.values(v as Record<string, unknown>)
    return vals.length > 0 && vals.every(r => typeof r === 'number' && r > 0 && r <= 2)
      ? null : 'ratios must be numbers in (0, 2]'
  }
  if (key === 'scanSchedule') {
    const v = parseJson(value) as { times?: unknown; timezone?: unknown } | undefined
    if (!v || !Array.isArray(v.times) || typeof v.timezone !== 'string') return 'must be JSON {times, timezone}'
    if (!v.times.length || !v.times.every(t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)))
      return 'times must be HH:MM (24h)'
    return validTimezone(v.timezone) ? null : 'unknown IANA timezone'
  }
  const n = Number(value)
  if (!NUMERIC.includes(key)) return null
  if (!Number.isFinite(n) || n <= 0) return 'must be a positive number'
  if (key === 'maxPerRoute' && !Number.isInteger(n)) return 'must be an integer'
  return null
}

export function applySettings(cfg: Config, s: Record<string, string>): Config {
  const num = (key: string): number | undefined => (key in s ? Number(s[key]) : undefined)
  cfg.thresholds.economy = num('thresholds.economy') ?? cfg.thresholds.economy
  cfg.thresholds.premiumConservative = num('thresholds.premiumConservative') ?? cfg.thresholds.premiumConservative
  cfg.minValue.economy = num('minValue.economy') ?? cfg.minValue.economy
  cfg.minValue.premium = num('minValue.premium') ?? cfg.minValue.premium
  cfg.maxPerRoute = num('maxPerRoute') ?? cfg.maxPerRoute
  cfg.pointsBalance = num('pointsBalance') ?? num('mrBalance') ?? cfg.pointsBalance
  cfg.alertImprovement = num('alertImprovement') ?? cfg.alertImprovement
  cfg.digestTo = s.digestTo ?? cfg.digestTo
  cfg.origin = s.origin ?? cfg.origin
  cfg.pointsProgram = s.pointsProgram ?? cfg.pointsProgram
  cfg.currency = s.currency ?? cfg.currency
  if (s.excludedCountries) cfg.excludedCountries = JSON.parse(s.excludedCountries)
  if (s.ratios) cfg.ratios = JSON.parse(s.ratios)
  if (s.scanSchedule) cfg.scanSchedule = JSON.parse(s.scanSchedule)
  if (s.digestEnabled) cfg.digestEnabled = s.digestEnabled === 'true'
  cfg.smtp.host = s['smtp.host'] ?? cfg.smtp.host
  if (s['smtp.port']) cfg.smtp.port = Number(s['smtp.port'])
  cfg.smtp.user = s['smtp.user'] ?? cfg.smtp.user
  cfg.smtp.password = s['smtp.password'] ?? cfg.smtp.password
  cfg.seatsAeroKey = s.seatsAeroKey ?? cfg.seatsAeroKey
  return cfg
}

export function loadEffectiveConfig(db: DB, env: Record<string, string | undefined> = process.env): Config {
  return applyEnv(applySettings(defaultConfig(), getSettings(db)), env)
}
