# Contributing

Thanks for helping improve flight-checks. Bug fixes, documentation improvements, new airport coverage, and focused feature proposals are all welcome.

## Development setup

flight-checks requires Node.js 22 or newer. Install dependencies, exercise the scanner without network access, and start the dashboard with:

```bash
npm install
npm run scan -- --dry-run
npm run serve
```

Run the complete test suite before submitting a change:

```bash
npx vitest run
```

The web client is built with `npm run build`. The development server listens on `http://localhost:3000`; a new database opens the setup wizard.

## Architecture map

`src/scanner/` is the scan pipeline: it requests seats.aero availability, prefilters rows, applies static cash-fare estimates, scores deals, writes an append-only snapshot, and optionally sends an email digest.

`src/server/` is the Hono API and dashboard host. `app.ts` contains the testable application, while `index.ts` binds the port, starts the in-process scheduler, and launches scans as child processes.

`src/web/` is the React and Vite dashboard. It provides deal filters and history, saved and dismissed states, manual scan controls, the setup wizard, and settings.

`src/core/` contains shared configuration, settings precedence, types, valuation and prefilter rules, airport metadata, and the SQLite layer.

## Rules

- Mock `fetch` and the mail transport in tests. Tests must never call live APIs.
- Never commit API keys, passwords, email credentials, or local environment files.
- Keep scan snapshots append-only so historical charts and comparisons remain trustworthy.
- Use clear, conventional-ish commit prefixes such as `feat:`, `fix:`, `docs:`, `test:`, and `chore:`.

## How to add a region or airport

Edit the maps in `src/core/regions.ts`. An airport needs an `AIRPORT_REGION` entry and an `AIRPORT_CITY` entry. Add its country to `COUNTRY_CONTINENT` when the country is new. If you introduce a new region key, add it to `OPTIMISTIC_CASH_CAD`, `TYPICAL_CASH_CAD`, and `TAX_ESTIMATE_CAD`; review all three cash tables even when reusing an existing region.

These four representative lines are drawn from the existing maps:

```ts
LHR: 'europe',
LHR: { city: 'London', country: 'UK' },
UK: 'Europe',
europe: { economy: 950, premium: 1500, business: 3300, first: 5300 },
```

Keep IATA codes uppercase, use the exact same region and country spelling across maps, and add or update tests for behavior that changes.

## Pull request flow

1. Fork the repository.
2. Create a focused branch from `main`.
3. Make the change and keep commits readable.
4. Run the test, type-check, and build commands until CI is green.
5. Open a pull request that explains the change and its motivation, then address review feedback.
