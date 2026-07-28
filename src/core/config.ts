export interface Config {
  seatsAeroKey: string
  gmailUser: string
  gmailAppPassword: string
  digestTo: string
  dbPath: string
  origin: string
  mrBalance: number
  ratios: Record<string, number>
  thresholds: { economy: number; premiumConservative: number }
  minValue: { economy: number; premium: number }
  maxPerRoute: number
  alertImprovement: number
}

const REQUIRED_ENV_VARS = [
  'SEATS_AERO_KEY',
  'GMAIL_USER',
  'GMAIL_APP_PASSWORD',
  'DIGEST_TO',
] as const

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  for (const name of REQUIRED_ENV_VARS) {
    if (!env[name]) {
      throw new Error(`Missing required env var: ${name}`)
    }
  }

  return {
    seatsAeroKey: env.SEATS_AERO_KEY!,
    gmailUser: env.GMAIL_USER!,
    gmailAppPassword: env.GMAIL_APP_PASSWORD!,
    digestTo: env.DIGEST_TO!,
    dbPath: env.DB_PATH ?? 'data/flights.db',
    origin: env.ORIGIN ?? 'YYC',
    mrBalance: Number(env.MR_BALANCE ?? 220000),
    ratios: {
      aeroplan: 1,
      british: 1,
      flyingblue: 0.75,
      delta: 0.75,
      etihad: 0.75,
    },
    thresholds: { economy: 1.75, premiumConservative: 3.0 },
    minValue: { economy: Number(env.MIN_VALUE_ECONOMY ?? 400), premium: Number(env.MIN_VALUE_PREMIUM ?? 1200) },
    maxPerRoute: Number(env.MAX_PER_ROUTE ?? 3),
    alertImprovement: 0.15,
  }
}
