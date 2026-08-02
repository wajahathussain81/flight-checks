import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ScoredDeal } from './types.js'
import { rankingCpp } from './valuation.js'

export type DB = Database.Database

const SCHEMA = `
CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  rows_pulled INTEGER NOT NULL DEFAULT 0,
  finalists INTEGER NOT NULL DEFAULT 0,
  errors TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT 'full'
  ,truncated TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL REFERENCES scans(id),
  created_at TEXT NOT NULL,
  route TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL, cabin TEXT NOT NULL, program TEXT NOT NULL,
  miles INTEGER NOT NULL, taxes_cad REAL NOT NULL,
  cash_cad REAL NOT NULL, economy_cash_cad REAL,
  mr_points INTEGER NOT NULL, cpp_raw REAL NOT NULL, cpp_conservative REAL NOT NULL,
  seats INTEGER NOT NULL, direct INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_scan ON snapshots(scan_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_route ON snapshots(route, date, cabin, program);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL,
  alert_key TEXT NOT NULL,
  cpp REAL NOT NULL,
  seats INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_key ON alerts(alert_key, id);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deal_status (
  alert_key TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('saved', 'dismissed')),
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS watches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  exclude_countries TEXT NOT NULL DEFAULT '[]',
  include_continents TEXT NOT NULL DEFAULT '[]',
  themes TEXT NOT NULL DEFAULT '[]',
  cabins TEXT NOT NULL DEFAULT '[]',
  top_n INTEGER NOT NULL DEFAULT 5,
  max_per_route INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS route_coverage (
  source TEXT NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  PRIMARY KEY (source, origin, destination)
);
`

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  const scanCols = db.prepare('PRAGMA table_info(scans)').all() as Array<{ name: string }>
  if (!scanCols.some(c => c.name === 'scope')) {
    db.exec("ALTER TABLE scans ADD COLUMN scope TEXT NOT NULL DEFAULT 'full'")
  }
  const watchCols = db.prepare('PRAGMA table_info(watches)').all() as Array<{ name: string }>
  if (!watchCols.some(c => c.name === 'max_per_route')) {
    db.exec('ALTER TABLE watches ADD COLUMN max_per_route INTEGER NOT NULL DEFAULT 1')
  }
  const snapCols = db.prepare('PRAGMA table_info(snapshots)').all() as Array<{ name: string }>
  if (!snapCols.some(c => c.name === 'origin')) {
    db.exec("ALTER TABLE snapshots ADD COLUMN origin TEXT NOT NULL DEFAULT 'YYC'")
  }
  if (!scanCols.some(c => c.name === 'truncated')) {
    db.exec("ALTER TABLE scans ADD COLUMN truncated TEXT NOT NULL DEFAULT '[]'")
  }
  return db
}

export function startScan(db: DB, scope = 'full'): number {
  const r = db.prepare('INSERT INTO scans (started_at, scope) VALUES (?, ?)').run(new Date().toISOString(), scope)
  return Number(r.lastInsertRowid)
}

export function finishScan(
  db: DB, scanId: number,
  stats: { rowsPulled: number; finalists: number; errors: string[]; truncated?: string[] },
): void {
  db.prepare('UPDATE scans SET finished_at = ?, rows_pulled = ?, finalists = ?, errors = ?, truncated = ? WHERE id = ?')
    .run(new Date().toISOString(), stats.rowsPulled, stats.finalists, stats.errors.join('\n'),
         JSON.stringify(stats.truncated ?? []), scanId)
}

export function insertSnapshots(db: DB, scanId: number, deals: ScoredDeal[]): void {
  const stmt = db.prepare(`INSERT INTO snapshots
    (scan_id, created_at, route, origin, date, cabin, program, miles, taxes_cad, cash_cad, economy_cash_cad,
     mr_points, cpp_raw, cpp_conservative, seats, direct)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const now = new Date().toISOString()
  const insertAll = db.transaction((rows: ScoredDeal[]) => {
    for (const d of rows) {
      stmt.run(scanId, now, d.route, d.route.split('-')[0], d.date, d.cabin, d.program, d.miles, d.taxesCad,
        d.cashCad, d.economyCashCad, d.mrPoints, d.cppRaw, d.cppConservative, d.seats, d.direct ? 1 : 0)
    }
  })
  insertAll(deals)
}

export function alertKey(d: { route: string; date: string; cabin: string; program: string }): string {
  return `${d.route}|${d.date}|${d.cabin}|${d.program}`
}

export function lastAlert(db: DB, key: string): { cpp: number; seats: number } | null {
  const row = db.prepare('SELECT cpp, seats FROM alerts WHERE alert_key = ? ORDER BY id DESC LIMIT 1')
    .get(key) as { cpp: number; seats: number } | undefined
  return row ?? null
}

export function recordAlerts(db: DB, scanId: number, deals: ScoredDeal[]): void {
  const stmt = db.prepare('INSERT INTO alerts (scan_id, alert_key, cpp, seats, created_at) VALUES (?, ?, ?, ?, ?)')
  const now = new Date().toISOString()
  for (const d of deals) stmt.run(scanId, alertKey(d), rankingCpp(d), d.seats, now)
}

export function getSettings(db: DB): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

export function putSetting(db: DB, key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .run(key, value, new Date().toISOString())
}

export function deleteSetting(db: DB, key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}

export function setDealStatus(db: DB, alertKey: string, status: 'saved' | 'dismissed' | null, note = ''): void {
  if (status === null) {
    db.prepare('DELETE FROM deal_status WHERE alert_key = ?').run(alertKey)
    return
  }
  db.prepare('INSERT INTO deal_status (alert_key, status, note, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(alert_key) DO UPDATE SET status = excluded.status, note = excluded.note, updated_at = excluded.updated_at')
    .run(alertKey, status, note, new Date().toISOString())
}

export function getDealStatuses(db: DB): Map<string, { status: 'saved' | 'dismissed'; note: string }> {
  const rows = db.prepare('SELECT alert_key, status, note FROM deal_status').all() as Array<{ alert_key: string; status: 'saved' | 'dismissed'; note: string }>
  return new Map(rows.map(r => [r.alert_key, { status: r.status, note: r.note }]))
}
