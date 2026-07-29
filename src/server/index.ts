import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { execFile } from 'node:child_process'
import { createApp } from './app.js'
import { startScheduler } from './scheduler.js'
import { openDb } from '../core/db.js'
import { loadEffectiveConfig } from '../core/settings.js'

const db = openDb(process.env.DB_PATH ?? 'data/flights.db')
const startScan = (country?: string): void => {
  execFile('npx', country
    ? ['tsx', 'src/scanner/index.ts', '--country', country]
    : ['tsx', 'src/scanner/index.ts'])
}
const scheduler = startScheduler({
  getSchedule: () => loadEffectiveConfig(db).scanSchedule,
  fire: () => startScan(),
  enabled: process.env.SCHEDULER !== 'off',
})
const app = createApp(db, { startScan, onSettingsChanged: scheduler.refresh })
app.use('/*', serveStatic({ root: './dist/web' }))

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })
console.log(`flight-checks on http://0.0.0.0:${port} — next scan: ${scheduler.next()?.toISOString() ?? 'scheduler off'}`)
