export interface SmtpConfig { host: string; port: number; user: string; password: string }
export interface ScanSchedule { times: string[]; timezone: string }
export interface OriginConfig { code: string; positioningCad: number }

export interface Config {
  seatsAeroKey: string
  smtp: SmtpConfig
  digestTo: string
  digestEnabled: boolean
  dbPath: string
  origin: string
  origins: OriginConfig[]
  pointsProgram: string
  pointsBalance: number
  currency: string
  excludedCountries: string[]
  ratios: Record<string, number>
  thresholds: { economy: number; premiumConservative: number }
  minValue: { economy: number; premium: number }
  maxPerRoute: number
  maxPagesPerProgram: number
  alertImprovement: number
  scanSchedule: ScanSchedule
}

export function defaultConfig(): Config {
  return {
    seatsAeroKey: '',
    smtp: { host: 'smtp.gmail.com', port: 465, user: '', password: '' },
    digestTo: '',
    digestEnabled: true,
    dbPath: 'data/flights.db',
    origin: 'YYC',
    origins: [
      { code: 'YYC', positioningCad: 0 },
      { code: 'YVR', positioningCad: 150 },
      { code: 'SEA', positioningCad: 200 },
      { code: 'YYZ', positioningCad: 250 },
      { code: 'LAX', positioningCad: 280 },
    ],
    pointsProgram: 'Amex MR (Canada)',
    pointsBalance: 220000,
    currency: 'CAD',
    excludedCountries: ['Canada'],
    ratios: { aeroplan: 1, british: 1, flyingblue: 0.75, delta: 0.75, etihad: 0.75 },
    thresholds: { economy: 1.75, premiumConservative: 3.0 },
    minValue: { economy: 400, premium: 1200 },
    maxPerRoute: 3,
    maxPagesPerProgram: 150,
    alertImprovement: 0.15,
    scanSchedule: { times: ['07:00', '19:00'], timezone: 'America/Edmonton' },
  }
}

export function applyEnv(cfg: Config, env: Record<string, string | undefined>): Config {
  if (env.SEATS_AERO_KEY) cfg.seatsAeroKey = env.SEATS_AERO_KEY
  if (env.SMTP_HOST) cfg.smtp.host = env.SMTP_HOST
  if (env.SMTP_PORT) cfg.smtp.port = Number(env.SMTP_PORT)
  const user = env.SMTP_USER ?? env.GMAIL_USER
  if (user) cfg.smtp.user = user
  const password = env.SMTP_PASSWORD ?? env.GMAIL_APP_PASSWORD
  if (password) cfg.smtp.password = password
  if (env.DIGEST_TO) cfg.digestTo = env.DIGEST_TO
  if (env.DB_PATH) cfg.dbPath = env.DB_PATH
  if (env.ORIGIN) cfg.origin = env.ORIGIN
  const balance = env.POINTS_BALANCE ?? env.MR_BALANCE
  if (balance) cfg.pointsBalance = Number(balance)
  if (env.MIN_VALUE_ECONOMY) cfg.minValue.economy = Number(env.MIN_VALUE_ECONOMY)
  if (env.MIN_VALUE_PREMIUM) cfg.minValue.premium = Number(env.MIN_VALUE_PREMIUM)
  if (env.MAX_PER_ROUTE) cfg.maxPerRoute = Number(env.MAX_PER_ROUTE)
  if (env.MAX_PAGES_PER_PROGRAM) cfg.maxPagesPerProgram = Number(env.MAX_PAGES_PER_PROGRAM)
  if (env.ORIGINS) {
    cfg.origins = env.ORIGINS.split(',').map(entry => {
      const [code, cost] = entry.split(':')
      return { code: code.trim(), positioningCad: Number(cost ?? 0) }
    })
  }
  return cfg
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return applyEnv(defaultConfig(), env)
}

export const configComplete = (cfg: Config): boolean => cfg.seatsAeroKey !== ''
export const digestReady = (cfg: Config): boolean =>
  cfg.digestEnabled && cfg.smtp.user !== '' && cfg.smtp.password !== '' && cfg.digestTo !== ''
