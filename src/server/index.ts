import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { execFile } from 'node:child_process'
import { createApp } from './app.js'
import { openDb } from '../core/db.js'

const db = openDb(process.env.DB_PATH ?? 'data/flights.db')
const startScan = (country?: string): void => {
  execFile('npx', country
    ? ['tsx', 'src/scanner/index.ts', '--country', country]
    : ['tsx', 'src/scanner/index.ts'])
}
const app = createApp(db, { startScan })
app.use('/*', serveStatic({ root: './dist/web' }))

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })
console.log(`flight-checks dashboard on http://0.0.0.0:${port}`)
