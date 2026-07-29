import { loadConfig, type Config } from './config.js'
import { getSettings, type DB } from './db.js'

export const SETTING_KEYS = [
  'thresholds.economy', 'thresholds.premiumConservative',
  'minValue.economy', 'minValue.premium',
  'maxPerRoute', 'pointsBalance', 'alertImprovement', 'digestTo',
] as const

export type SettingKey = (typeof SETTING_KEYS)[number]

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function validateSetting(key: string, value: string): string | null {
  if (!(SETTING_KEYS as readonly string[]).includes(key)) return `unknown setting: ${key}`
  if (key === 'digestTo') return EMAIL.test(value) ? null : 'must be an email address'
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 'must be a positive number'
  if (key === 'maxPerRoute' && !Number.isInteger(n)) return 'must be an integer'
  return null
}

export function loadEffectiveConfig(db: DB, env: Record<string, string | undefined> = process.env): Config {
  const cfg = loadConfig(env)
  const s = getSettings(db)
  const num = (key: string): number | undefined => (key in s ? Number(s[key]) : undefined)
  cfg.thresholds.economy = num('thresholds.economy') ?? cfg.thresholds.economy
  cfg.thresholds.premiumConservative = num('thresholds.premiumConservative') ?? cfg.thresholds.premiumConservative
  cfg.minValue.economy = num('minValue.economy') ?? cfg.minValue.economy
  cfg.minValue.premium = num('minValue.premium') ?? cfg.minValue.premium
  cfg.maxPerRoute = num('maxPerRoute') ?? cfg.maxPerRoute
  cfg.pointsBalance = num('pointsBalance') ?? num('mrBalance') ?? cfg.pointsBalance
  cfg.alertImprovement = num('alertImprovement') ?? cfg.alertImprovement
  cfg.digestTo = s.digestTo ?? cfg.digestTo
  return cfg
}
