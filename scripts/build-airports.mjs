// Regenerates src/core/airports.data.json from the OurAirports dataset (public domain).
// Usage: curl -sL https://davidmegginson.github.io/ourairports-data/airports.csv -o airports.csv
//        node scripts/build-airports.mjs airports.csv
import { readFileSync, writeFileSync } from 'node:fs'

const CONTINENTS = {
  AF: 'Africa', AN: 'Antarctica', AS: 'Asia', EU: 'Europe',
  NA: 'North America', OC: 'Oceania', SA: 'South America',
}

const parseCsvLine = (line) => {
  const out = []
  let cur = '', quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

const csv = readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean)
const header = parseCsvLine(csv[0])
const col = (name) => header.indexOf(name)
const [iC, tC, nC, laC, loC, coC, ctC, muC] =
  ['iata_code', 'type', 'name', 'latitude_deg', 'longitude_deg', 'continent', 'iso_country', 'municipality']
    .map(col)

const KEEP = new Set(['large_airport', 'medium_airport'])
const out = {}
for (const line of csv.slice(1)) {
  const f = parseCsvLine(line)
  const iata = f[iC]?.trim()
  if (!iata || iata.length !== 3 || !KEEP.has(f[tC])) continue
  out[iata] = {
    city: (f[muC] || f[nC] || '').trim(),
    country: f[ctC].trim(),
    continent: CONTINENTS[f[coC].trim()] ?? 'Other',
    lat: Number(f[laC]),
    lon: Number(f[loC]),
  }
}

writeFileSync(new URL('../src/core/airports.data.json', import.meta.url), JSON.stringify(out) + '\n')
console.log(`wrote ${Object.keys(out).length} airports`)
