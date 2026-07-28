import nodemailer from 'nodemailer'
import type { Config } from '../core/config.js'
import type { ScoredDeal } from '../core/types.js'
import { rankingCpp } from '../core/valuation.js'
import { lastAlert, alertKey, getDealStatuses, type DB } from '../core/db.js'
import { airportLabel } from '../core/regions.js'

export function selectAlerts(db: DB, deals: ScoredDeal[], cfg: Config): ScoredDeal[] {
  const statuses = getDealStatuses(db)
  const eligible = deals.filter(d => {
    if (statuses.get(alertKey(d))?.status === 'dismissed') return false
    const cpp = d.cabin === 'economy' ? d.cppRaw : d.cppConservative
    const threshold = d.cabin === 'economy' ? cfg.thresholds.economy : cfg.thresholds.premiumConservative
    const minValue = d.cabin === 'economy' ? cfg.minValue.economy : cfg.minValue.premium
    return cpp >= threshold && (cpp * d.mrPoints) / 100 >= minValue
  })

  const fresh = eligible.filter(d => {
    const prev = lastAlert(db, alertKey(d))
    if (!prev) return true
    return rankingCpp(d) >= prev.cpp * (1 + cfg.alertImprovement) || d.seats > prev.seats
  })

  const byValue = (a: ScoredDeal, b: ScoredDeal) => rankingCpp(b) - rankingCpp(a)
  const capPerRoute = (list: ScoredDeal[]): ScoredDeal[] => {
    const counts = new Map<string, number>()
    const out: ScoredDeal[] = []
    for (const d of list) {
      const key = `${d.route}|${d.cabin}`
      const n = counts.get(key) ?? 0
      if (n >= cfg.maxPerRoute) continue
      counts.set(key, n + 1)
      out.push(d)
    }
    return out
  }
  const premium = capPerRoute(fresh.filter(d => d.cabin !== 'economy').sort(byValue)).slice(0, 10)
  const economy = capPerRoute(fresh.filter(d => d.cabin === 'economy').sort(byValue)).slice(0, 10)
  return [...premium, ...economy]
}

const fmt = new Intl.NumberFormat('en-CA')

function dealRow(d: ScoredDeal, cfg: Config): string {
  const fire = d.cabin !== 'economy' && d.cppConservative >= cfg.thresholds.premiumConservative ? ' 🔥' : ''
  const budget = d.mrPoints <= cfg.mrBalance ? ` ✅ fits ${fmt.format(cfg.mrBalance)}` : ''
  const value = d.cabin === 'economy'
    ? `${d.cppRaw.toFixed(2)} ¢/pt`
    : `${d.cppConservative.toFixed(2)} ¢/pt conservative (${d.cppRaw.toFixed(2)} raw)`
  return `<tr>
    <td>${d.route}<br><small style="color:#666">${airportLabel(d.route.split('-')[1])}</small></td><td>${d.date}</td><td>${d.cabin}${fire}</td><td>${d.program}</td>
    <td>${fmt.format(d.mrPoints)} MR + $${d.taxesCad.toFixed(0)}</td>
    <td>vs $${fmt.format(Math.round(d.cashCad))} cash</td>
    <td><b>${value}</b>${budget}</td>
    <td>${d.seats} seat(s)${d.direct ? ', direct' : ''}</td>
  </tr>`
}

export function renderDigest(deals: ScoredDeal[], cfg: Config, errors: string[] = []): string {
  const rows = deals.map(d => dealRow(d, cfg)).join('\n')
  const errorBlock = errors.length
    ? `<h3>⚠️ Scan problems</h3><pre>${errors.join('\n')}</pre>`
    : ''
  const body = deals.length
    ? `<table border="1" cellpadding="6" cellspacing="0">
        <tr><th>Route</th><th>Date</th><th>Cabin</th><th>Program</th><th>Cost</th><th>Cash comp</th><th>Value</th><th>Availability</th></tr>
        ${rows}</table>`
    : '<p>No deals cleared the thresholds this scan.</p>'
  return `<h2>Flight Checks digest</h2>${body}
    <p style="color:#666">Benchmarks: statement credit 1.00 ¢/pt · Fixed Points Travel ~1.75 ¢/pt.</p>
    ${errorBlock}`
}

export interface MailTransport {
  sendMail(opts: { from: string; to: string; subject: string; html: string }): Promise<unknown>
}

function gmailTransport(cfg: Config): MailTransport {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: cfg.gmailUser, pass: cfg.gmailAppPassword },
  })
}

export async function sendDigest(
  cfg: Config, subject: string, html: string,
  transport: MailTransport = gmailTransport(cfg),
): Promise<void> {
  await transport.sendMail({
    from: `Flight Checks <${cfg.gmailUser}>`,
    to: cfg.digestTo,
    subject,
    html,
  })
}
