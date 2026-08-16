export const SETTING_LABELS: Record<string, { label: string; hint?: string }> = {
  'origin': { label: 'Home airports', hint: 'Origins with positioning cost, e.g. [{"code":"YYC","positioningCad":0}]' },
  'excludedCountries': { label: 'Excluded countries', hint: 'JSON array of country names to skip' },
  'scanSchedule': { label: 'Scan schedule', hint: 'Cron-style schedule for full scans' },
  'maxPerRoute': { label: 'Max results per route', hint: 'Caps one route’s rows in digests and watches' },
  'pointsProgram': { label: 'Points program' },
  'pointsBalance': { label: 'Points balance' },
  'currency': { label: 'Currency' },
  'ratios': { label: 'Transfer ratios', hint: 'seats.aero source → points per mile' },
  'thresholds.economy': { label: 'Economy alert threshold', hint: 'Minimum ¢/pt before an economy deal alerts' },
  'thresholds.premiumConservative': { label: 'Premium alert threshold', hint: 'Conservative ¢/pt for premium cabins' },
  'minValue.economy': { label: 'Economy minimum value' },
  'minValue.premium': { label: 'Premium minimum value' },
  'alertImprovement': { label: 'Re-alert improvement', hint: 'How much a deal must improve to alert again' },
  'digestEnabled': { label: 'Email digest' },
  'digestTo': { label: 'Send digest to' },
  'smtp.host': { label: 'SMTP host' },
  'smtp.port': { label: 'SMTP port' },
  'smtp.user': { label: 'SMTP user' },
  'smtp.password': { label: 'SMTP password' },
  'seatsAeroKey': { label: 'seats.aero API key', hint: 'Partner API key (pro_…)' },
}
export const settingLabel = (key: string): { label: string; hint?: string } =>
  SETTING_LABELS[key] ?? { label: key }
