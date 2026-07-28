import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { execFile } from 'node:child_process'
import { createApp } from './app.js'
import { openDb } from '../core/db.js'

const db = openDb(process.env.DB_PATH ?? 'data/flights.db')
const startScan = (country?: string): void => {
  if (country) {
    execFile('npx', ['tsx', 'src/scanner/index.ts', '--country', country])
    return
  }
  execFile('systemctl', ['start', '--no-block', 'flight-checks-scan.service'], err => {
    if (err) execFile('npx', ['tsx', 'src/scanner/index.ts'])
  })
}
const app = createApp(db, { startScan })
app.use('/*', serveStatic({ root: './dist/web' }))

serve({ fetch: app.fetch, port: 3000, hostname: '0.0.0.0' })
console.log('flight-checks dashboard on http://0.0.0.0:3000')
