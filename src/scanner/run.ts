import { readFileSync } from 'node:fs'
import { configComplete, digestReady, loadConfig, type Config } from '../core/config.js'
import { loadEffectiveConfig } from '../core/settings.js'
import { countryOf } from '../core/regions.js'
import type { AwardRow, ScoredDeal } from '../core/types.js'
import { rankingCpp, scoreDeal } from '../core/valuation.js'
import { listWatches, matchWatch, watchState } from '../core/watches.js'
import { dedupeCheapest, isViable, optimisticPotential } from '../core/prefilter.js'
import { openDb, startScan, finishScan, insertSnapshots, recordAlerts, type DB } from '../core/db.js'
import { recordCoverage } from '../core/coverage.js'
import { fetchAvailability, fetchBulkAvailability, fetchRoutes } from './seatsaero.js'
import { estimateCashFares } from './pricing.js'
import { selectAlerts, renderDigest, sendDigest, type WatchResult } from './digest.js'

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
  let truncated: string[] = []
  try {
    if (opts.dryRun) {
      rows = JSON.parse(readFileSync('tests/fixtures/awards.json', 'utf8')) as AwardRow[]
    } else if (opts.country) {
      rows = await withRetry(() => fetchAvailability(cfg, fetch, opts.country))
    } else {
      const bulk = await withRetry(() => fetchBulkAvailability(cfg))
      rows = bulk.rows
      truncated = bulk.truncated
      errors.push(...bulk.failures)
    }
  } catch (err) {
    errors.push(`seats.aero: ${err}`)
  }

  if (truncated.length > 0) {
    console.warn(`page cap reached; results truncated for: ${truncated.join(', ')}`)
  }

  if (!opts.dryRun && !opts.country) {
    const newest = db.prepare('SELECT MAX(last_seen) AS t FROM route_coverage').get() as { t: string | null }
    const weekOld = !newest.t || Date.now() - Date.parse(newest.t) > 7 * 86_400_000
    if (weekOld) {
      for (const source of Object.keys(cfg.ratios)) {
        try {
          recordCoverage(db, source, await fetchRoutes(cfg, source))
        } catch (err) {
          // Scan output goes to a detached child process, so a warning here is
          // effectively invisible. Record it on the scan so a stale or empty
          // coverage map is visible in the dashboard and digest.
          errors.push(`route coverage (${source}): ${err}`)
        }
      }
    }
  }

  if (opts.country) {
    rows = rows.filter(r => countryOf(r.route.split('-')[1]) === opts.country)
  }

  const deduped = dedupeCheapest(rows)
  const finalists = deduped
    .filter(r => r.program in cfg.ratios && isViable(r, cfg.ratios[r.program], cfg.thresholds))
    .sort((a, b) => optimisticPotential(b, cfg.ratios[b.program]) - optimisticPotential(a, cfg.ratios[a.program]))

  const penalty = new Map(cfg.origins.map(o => [o.code, o.positioningCad]))
  const scored: ScoredDeal[] = finalists.map(row => {
    const est = estimateCashFares(row.route, row.cabin)
    return scoreDeal(row, est.cashCad, est.economyCashCad, cfg.ratios[row.program],
      penalty.get(row.route.split('-')[0]) ?? 0)
  })

  insertSnapshots(db, scanId, scored)
  const alerts: ScoredDeal[] = []
  if (!opts.country) {
    const watchData = listWatches(db)
    errors.push(...watchData.errors)
    const today = new Date().toISOString().slice(0, 10)
    const watchResults: WatchResult[] = watchData.watches
      .filter(w => watchState(w, today) === 'active')
      .map(w => ({ watch: w, deals: matchWatch(w, scored, rankingCpp) }))
    const watchMatches = watchResults.flatMap(r => r.deals)
    alerts.push(...selectAlerts(db, scored, cfg))
    if (alerts.length > 0 || errors.length > 0 || watchResults.length > 0) {
      if (!digestReady(cfg)) {
        console.log('[digest] skipped: email not configured or disabled')
      } else {
        const subject = alerts.length > 0
          ? `✈️ ${alerts.length} deal(s) — best ${Math.max(...alerts.map(a => a.cabin === 'economy' ? a.cppRaw : a.cppConservative)).toFixed(2)} ¢/pt`
          : watchMatches.length > 0
            ? `👀 Trip watch — best ${Math.max(...watchMatches.map(rankingCpp)).toFixed(2)} ¢/pt`
            : errors.length > 0
              ? '⚠️ Flight Checks scan had errors'
              : '👀 Trip watch — no matches yet'
        if (opts.dryRun) {
          console.log(`[dry-run] would email: ${subject}`)
        } else {
          const html = renderDigest(alerts, cfg, errors, watchResults)
          try { await sendDigest(cfg, subject, html) } catch (err) { errors.push(`email: ${err}`) }
        }
      }
      recordAlerts(db, scanId, alerts)
    }
  }

  finishScan(db, scanId, { rowsPulled: rows.length, finalists: finalists.length, errors, truncated })
  return { scanId, snapshots: scored.length, alerts: alerts.length, errors }
}
