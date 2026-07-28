import { runScan } from './run.js'

const dryRun = process.argv.includes('--dry-run')
const countryIdx = process.argv.indexOf('--country')
const country = countryIdx >= 0 ? process.argv[countryIdx + 1] : undefined
runScan({ dryRun, country }).then(r => {
  console.log(`scan ${r.scanId}: ${r.snapshots} snapshots, ${r.alerts} alerts, ${r.errors.length} errors`)
  if (r.errors.length) { console.error(r.errors.join('\n')); process.exitCode = 1 }
})
