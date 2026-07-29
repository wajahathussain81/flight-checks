import { readFileSync } from 'node:fs'
import { configComplete, digestReady, loadConfig, type Config } from '../core/config.js'
import { loadEffectiveConfig } from '../core/settings.js'
import { AIRPORT_CITY } from '../core/regions.js'
import type { AwardRow, ScoredDeal } from '../core/types.js'
import { scoreDeal } from '../core/valuation.js'
import { dedupeCheapest, isViable, optimisticPotential } from '../core/prefilter.js'
import { openDb, startScan, finishScan, insertSnapshots, recordAlerts, type DB } from '../core/db.js'
import { fetchAvailability } from './seatsaero.js'
import { estimateCashFares } from './pricing.js'
import { selectAlerts, renderDigest, sendDigest } from './digest.js'

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try { return await fn() } catch (err) {
      lastErr = err
      await new Promise(r => setTimeout(r, 1000 * 2 ** i))
    }
  }
  throw lastErr
}

export async function runScan(
  opts: { dryRun?: boolean; env?: Record<string, string | undefined>; country?: string } = {},
): Promise<{ scanId: number; snapshots: number; alerts: number; errors: string[] }> {
  const baseCfg = loadConfig(opts.env ?? process.env)
  const db: DB = openDb(baseCfg.dbPath)
  const cfg: Config = loadEffectiveConfig(db, opts.env ?? process.env)
  if (!configComplete(cfg)) {
    return { scanId: -1, snapshots: 0, alerts: 0, errors: ['not configured: missing seats.aero API key'] }
  }
  const scanId = startScan(db, opts.country ?? 'full')
  const errors: string[] = []

  let rows: AwardRow[] = []
  try {
    rows = opts.dryRun
      ? (JSON.parse(readFileSync('tests/fixtures/awards.json', 'utf8')) as AwardRow[])
      : await withRetry(() => fetchAvailability(cfg, fetch, opts.country))
  } catch (err) {
    errors.push(`seats.aero: ${err}`)
  }

  if (opts.country) {
    rows = rows.filter(r => AIRPORT_CITY[r.route.split('-')[1]]?.country === opts.country)
  }

  const deduped = dedupeCheapest(rows)
  const finalists = deduped
    .filter(r => r.program in cfg.ratios && isViable(r, cfg.ratios[r.program], cfg.thresholds))
    .sort((a, b) => optimisticPotential(b, cfg.ratios[b.program]) - optimisticPotential(a, cfg.ratios[a.program]))

  const scored: ScoredDeal[] = finalists.map(row => {
    const est = estimateCashFares(row.route, row.cabin)
    return scoreDeal(row, est.cashCad, est.economyCashCad, cfg.ratios[row.program])
  })

  insertSnapshots(db, scanId, scored)
  const alerts: ScoredDeal[] = []
  if (!opts.country) {
    alerts.push(...selectAlerts(db, scored, cfg))
    if (alerts.length > 0 || errors.length > 0) {
      if (!digestReady(cfg)) {
        console.log('[digest] skipped: email not configured or disabled')
      } else {
        const subject = alerts.length > 0
          ? `✈️ ${alerts.length} deal(s) — best ${Math.max(...alerts.map(a => a.cabin === 'economy' ? a.cppRaw : a.cppConservative)).toFixed(2)} ¢/pt`
          : '⚠️ Flight Checks scan had errors'
        if (opts.dryRun) {
          console.log(`[dry-run] would email: ${subject}`)
        } else {
          const html = renderDigest(alerts, cfg, errors)
          try { await sendDigest(cfg, subject, html) } catch (err) { errors.push(`email: ${err}`) }
        }
      }
      recordAlerts(db, scanId, alerts)
    }
  }

  finishScan(db, scanId, { rowsPulled: rows.length, finalists: finalists.length, errors })
  return { scanId, snapshots: scored.length, alerts: alerts.length, errors }
}
