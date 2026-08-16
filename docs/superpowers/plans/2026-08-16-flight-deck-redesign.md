# Flight Deck Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the worker of record is Codex (`codex:codex-rescue`) orchestrated by Claude per the global `orchestrating-codex-workers` rule.

**Goal:** Restyle the entire dashboard in the approved Apple-style "Flight Deck" design language — sidebar app shell, SF Pro system typography, Apple semantic color tokens in light/dark, grouped-inset settings — with zero behavior or API changes.

**Architecture:** Pure frontend change confined to `src/web/`. One rewritten stylesheet (`src/web/styles.css`) carries the full token system and component classes; each tab's TSX is then migrated to the new class vocabulary task by task, so the app builds and runs after every task. The normative design sources are `design.md` (repo root) and the rendered spec `docs/superpowers/specs/2026-08-16-flight-deck-design.html`, whose `<style>` block contains production-quality CSS for every token and component — port values from it verbatim, never invent new ones.

**Tech Stack:** React 18 + Vite + TypeScript strict (existing). No new dependencies. No webfonts — the system font stack only.

## Global Constraints

- **No new npm dependencies.** CSS + TSX edits only.
- **No behavior changes:** every fetch call, filter, sort, poll loop, and settings write stays byte-identical in behavior. This plan renames classes and restructures markup only.
- **Colors only via tokens.** Every color in TSX/CSS references a `var(--…)` token defined in Task 1. Raw hex in a component is a defect.
- **Both themes always:** light tokens on `:root`, dark under `@media (prefers-color-scheme: dark)`. Never define a color only in the dark block.
- **Fonts:** `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif` (body) and the same stack with `"SF Pro Display"` for titles. Numerals in data cells always get `font-variant-numeric: tabular-nums`.
- **Accessibility:** every interactive element keeps a visible `:focus-visible` ring (`2px solid var(--accent)`, offset 2px); `prefers-reduced-motion: reduce` disables all transitions; icon-only buttons carry `aria-label`.
- **Copy rules:** UI copy stays sentence case ("Scan now", not "SCAN NOW"). The Search tab must keep wording that results come from seats.aero's cache, not live inventory.
- **Gates after every task** (run all three, all must pass): `npx tsc --noEmit` && `npx vitest run` && `npm run build`.
- Branch: `flight-deck-redesign`. One commit per task, message prefix `style:` (or `feat:` where markup structure changes), no AI attribution trailers.

---

### Task 1: Design tokens and base stylesheet

**Files:**
- Modify: `src/web/styles.css` (full rewrite)
- Read first: `design.md`, `docs/superpowers/specs/2026-08-16-flight-deck-design.html` (its `<style>` block is the source CSS)

**Interfaces:**
- Produces: the CSS custom properties consumed by every later task: `--bg, --surface, --surface-2, --inset, --label, --label-2, --label-3, --separator, --separator-faint, --accent, --accent-tint, --green, --green-tint, --red, --red-tint, --orange, --orange-tint, --shadow-card, --shadow-window, --sidebar-bg, --on-accent, --on-accent-dim`.

- [ ] **Step 1: Rewrite `styles.css` head section.** Delete the current 37-line file contents and write, in order: (a) the `:root` light token block and the `@media (prefers-color-scheme: dark)` dark token block copied verbatim from the spec HTML (drop the `[data-theme]` guards — the app has no theme toggle, media query only), plus two additions to the light `:root` block only (identical in both themes, so never redefined in dark): `--on-accent: #FFFFFF; --on-accent-dim: rgba(255, 255, 255, 0.75);` — see `design.md` §Color; (b) base rules:

```css
* { box-sizing: border-box; }
body {
  margin: 0; padding: 0;
  background: var(--bg); color: var(--label);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  font-size: 15px; line-height: 1.5;
}
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.overflow { overflow-x: auto; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }
```

- [ ] **Step 2: Re-add the legacy classes still referenced by unmigrated TSX, restyled through tokens** so the app stays presentable mid-plan. Keep these selectors working until their tabs are migrated (they are deleted in Task 10): `nav`/`nav button`/`nav button.active`, `table`/`th`/`td` (hairline `border-bottom: 1px solid var(--separator-faint)`, header cells 12px/600 uppercase `var(--label-3)`), `tr.fits` (`background: var(--green-tint)`), `tr.dimmed`, `.value`, `select`/`input`/`textarea` (inset fill, 9px radius, focus ring `border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-tint)`), `button` default (plain style), `.filters`, `.banner`, `.settings-row`, `.settings-group`, `.wizard*`, `.ratio-row`, `pre.err`, `button.small`, `th.sortable`.
- [ ] **Step 3: Run gates:** `npx tsc --noEmit && npx vitest run && npm run build` — all pass.
- [ ] **Step 4: Commit** `style: flight deck design tokens and base styles`.

### Task 2: Component class library

**Files:**
- Modify: `src/web/styles.css` (append)
- Read first: `design.md` §Components; spec HTML `<style>` block

**Interfaces:**
- Produces the class vocabulary used by Tasks 3–9 (names are contractual): `.btn`, `.btn-primary`, `.btn-tinted`, `.btn-plain`, `.btn-destructive`, `.btn-quiet`, `.btn-sm`; `.segmented` (+ child `button.on`); `.field`; `.chip`, `.chip-green`, `.chip-blue`, `.chip-orange`, `.chip-red`, `.chip-neutral`, `.dot`; `.toggle` (+ `.on`); `.icon-btn` (+ `.saved`); `.card`; `.sidebar`, `.side-item` (+ `.on`), `.side-section`, `.side-count`; `.content`, `.content-header`, `.content-sub`; `.filter-bar`; `.stat-row`, `.stat`; `.deal-list`, `.deal-head`, `.deal-row`, `.deal-route`, `.deal-dest`, `.deal-num`, `.cpp`, `.cpp-great`, `.deal-actions`; `.inset-group`, `.inset-group-title`, `.inset-list`, `.inset-row`, `.inset-value`, `.inset-field`; `.toast`, `.toast-err`.

- [ ] **Step 1: Port component CSS from the spec HTML verbatim**, adapting only: `.specimen` becomes `.card` (generic white card: `background: var(--surface); border-radius: 14px; box-shadow: var(--shadow-card); padding: 1.5rem;`); the mockup-only classes (`.window`, `.titlebar`, `.lights`, `.app-shell`, page-typography classes like `.swatch`, `.type-row`, `.principles`) are **not** ported. The sidebar count span becomes class `.side-count` (spec uses a bare `.count` inside `.side-item` — rename to avoid collisions). `.deal-head`/`.deal-row` keep the spec's grid template `1.5fr 1fr 0.8fr 1fr 0.9fr 0.8fr 0.9fr` with `min-width: 640px`. While porting, replace every literal `#fff` with `var(--on-accent)` and every `rgba(255,255,255,0.75)` with `var(--on-accent-dim)` (`.btn-primary` color, `.toggle::after` fill, `.side-item.on` foreground and its count) per `design.md`'s no-raw-hex rule.
- [ ] **Step 2: Add the toast** (replaces `.banner` visually; `.banner` itself stays until Task 3 removes its last use):

```css
.toast {
  position: fixed; top: 1rem; left: 50%; transform: translateX(-50%);
  z-index: 50; max-width: min(90vw, 480px);
  border-radius: 12px; padding: 0.65rem 1.1rem;
  font-size: 0.9rem; font-weight: 500; cursor: pointer;
  box-shadow: var(--shadow-window);
}
.toast-err { background: var(--red-tint); color: var(--red); border: 1px solid var(--red-tint); }
```

- [ ] **Step 3: Run gates** (CSS-only change; build must pass).
- [ ] **Step 4: Commit** `style: flight deck component classes`.

### Task 3: App shell — sidebar, large-title header, toast

**Files:**
- Modify: `src/web/App.tsx` (the `App` component and top-level layout only; tab components untouched)
- Modify: `src/web/index.html` (set `<html>`-level background early paint: add `<meta name="color-scheme" content="light dark">` in head)

**Interfaces:**
- Consumes: Task 2 classes `.sidebar`, `.side-item`, `.side-section`, `.side-count`, `.content`, `.content-header`, `.content-sub`, `.toast toast-err`, `.btn`.
- Produces: `App` renders `<div className="shell">` grid (sidebar + content). Tab metadata constant `TABS` (exact shape below) that later tasks may read but not modify. Existing `Tab` union type unchanged.

- [ ] **Step 1: Add shell layout CSS** (append to `styles.css`):

```css
.shell { display: grid; grid-template-columns: 210px 1fr; min-height: 100vh; }
.sidebar { position: sticky; top: 0; height: 100vh; overflow-y: auto; }
.content { padding: 1.6rem 2rem 3rem; min-width: 0; }
.app-title { display: flex; align-items: center; gap: 0.5rem; font-size: 0.95rem; font-weight: 700; letter-spacing: -0.01em; padding: 1rem 0.9rem 0.9rem; }
@media (max-width: 700px) { .shell { grid-template-columns: 1fr; } .sidebar { position: static; height: auto; display: flex; overflow-x: auto; } }
```

- [ ] **Step 2: Restructure `App`'s return.** Define above the component:

```tsx
const TABS: Array<{ id: Tab; label: string; icon: JSX.Element; section?: string }> = [
  { id: 'deals', label: 'Deals', icon: <PlaneIcon /> },
  { id: 'search', label: 'Search', icon: <SearchIcon /> },
  { id: 'watches', label: 'Watches', icon: <EyeIcon /> },
  { id: 'shortlist', label: 'Shortlist', icon: <StarIcon /> },
  { id: 'history', label: 'History', icon: <ChartIcon /> },
  { id: 'runs', label: 'Runs', icon: <ClockIcon />, section: 'System' },
  { id: 'settings', label: 'Settings', icon: <GearIcon /> },
]
```

The seven `*Icon` components are 16×16 inline `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">` elements — copy the seven paths exactly from the sidebar mockup in `docs/superpowers/specs/2026-08-16-flight-deck-design.html` (plane, magnifier, eye, star, chart, clock, gear). Render:

```tsx
<div className="shell">
  <nav className="sidebar" aria-label="Sections">
    <div className="app-title">✈️ Flight Checks</div>
    {TABS.map(t => (
      <span key={t.id}>
        {t.section && <div className="side-section">{t.section}</div>}
        <button className={`side-item${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
          {t.icon}{t.label}
        </button>
      </span>
    ))}
  </nav>
  <main className="content">
    {banner && <p className="toast toast-err" role="alert" onClick={() => setBanner(null)}>{banner}</p>}
    {/* existing tab conditionals unchanged */}
  </main>
</div>
```

`.side-item` must gain `width: 100%; border: none; background: transparent; cursor: pointer; font: inherit;` in CSS since it is now a `<button>` (append these to the ported rule). Delete the old `<h1>✈️ Flight Checks</h1>` and `<nav>` markup and the `.banner` usage.
- [ ] **Step 3: Run gates.** Then `npm run serve` briefly and confirm the sidebar renders, tabs switch, and the toast appears on a forced error (e.g. stop the API and click Scan) — then behavior is unchanged.
- [ ] **Step 4: Commit** `feat: sidebar app shell with flight deck styling`.

### Task 4: Deals tab — header, stat cards, filter bar, deal list

**Files:**
- Modify: `src/web/App.tsx` (`DealsTab` only)
- Test: `tests/web/dealStats.test.ts` (new)
- Create: `src/web/dealStats.ts`

**Interfaces:**
- Consumes: `.content-header`, `.content-sub`, `.stat-row`, `.stat`, `.filter-bar`, `.field`, `.segmented`, `.deal-list` family, `.chip*`, `.icon-btn`, `.btn*`.
- Produces: `dealStats(deals: DealRow[], pointsBalance: number): { bestCpp: number | null; fitCount: number; businessSeats: number; countries: number }` in `src/web/dealStats.ts`. cpp of a row = `cabin === 'economy' ? cpp_raw : cpp_conservative` (same rule the table already uses). `countries` counts distinct `destination_country` if the field exists on `DealRow`, else distinct destination airport codes (`route.split('-')[1]`).

- [ ] **Step 1: Write the failing test** `tests/web/dealStats.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dealStats } from '../../src/web/dealStats.js'

const row = (over: Partial<any>) => ({
  id: 1, route: 'YYC-HND', date: '2026-11-14', cabin: 'business', program: 'aeroplan',
  mr_points: 85000, taxes_cad: 120, cash_cad: 4120, cpp_raw: 3.4, cpp_conservative: 3.12,
  seats: 2, direct: true, status: null, ...over,
})

describe('dealStats', () => {
  it('summarizes best cpp, balance fits, business seats, and destinations', () => {
    const stats = dealStats([
      row({}),
      row({ id: 2, route: 'YEG-CDG', cabin: 'economy', cpp_raw: 2.87, mr_points: 35000, seats: 4 }),
      row({ id: 3, route: 'YYC-BKK', mr_points: 240000, cpp_conservative: 2.05, seats: 3 }),
    ] as any, 220000)
    expect(stats.bestCpp).toBe(3.12)
    expect(stats.fitCount).toBe(2)
    expect(stats.businessSeats).toBe(5)
    expect(stats.countries).toBe(3)
  })
  it('returns null best on empty input', () => {
    expect(dealStats([], 0).bestCpp).toBeNull()
  })
})
```

- [ ] **Step 2: Run it, watch it fail** (`npx vitest run tests/web/dealStats.test.ts` — module not found).
- [ ] **Step 3: Implement `src/web/dealStats.ts`** exactly to the interface above; make the test pass.
- [ ] **Step 4: Restyle `DealsTab` markup** (no data-flow changes):
  - Wrap in a header: `<div className="content-header"><div><h4>Deals</h4><p className="content-sub">{…}</p></div>{country && scanButton}</div>` where the subtitle shows result count (`{deals.length.toLocaleString()} deals` — scan metadata is not fetched here; do not add a fetch).
  - Stat cards from `dealStats(deals, meta.pointsBalance)`: Best value (`bestCpp?.toFixed(2) ?? '—'` + small `¢/pt`), `Fit your {`${Math.round(meta.pointsBalance / 1000)}k`}` (fitCount), Business seats, Destinations.
  - `.filters` div → `.filter-bar`; every `<select>`/`<input>` gets `className="field"`. Replace the cabin `<select>` with a segmented control: `<div className="segmented" role="tablist">` of five buttons (All/Economy/Premium/Business/First) setting `filters.cabin` to `'' | 'economy' | 'premium' | 'business' | 'first'`, active one gets class `on`. Replace the "show dismissed" checkbox label with a `.btn btn-sm` toggle-style button is **not** wanted — keep the checkbox, styled inside a `<label className="chip chip-neutral">`.
  - Table: keep the `<table>` element but set `className="deal-list-table"` and add CSS aliasing the deal-list look onto table elements (append to `styles.css`): container div keeps `.deal-list` rounded border; `thead th` reuse `.deal-head` typography; `tbody tr:hover { background: var(--accent-tint); }`. Route cell renders `<span className="deal-route">{deal.route}<span className="deal-dest">{airportLabel(...)}</span></span>`. Cabin cell: `<span className="chip chip-neutral">{deal.cabin}</span>`. Points cell appends `<span className="chip chip-green"><span className="dot" />fits</span>` when `deal.mr_points <= meta.pointsBalance` (replaces the `tr.fits` row tint — remove that class from the row). ¢/pt cell: `<span className={"cpp" + (cpp >= 2.5 ? " cpp-great" : "")}>` (2.5 is presentation-only, hardcode with a named const `GREAT_CPP = 2.5`). Seats cell renders `{deal.seats}` plus `<span className="chip chip-blue">direct</span>` when direct. Actions: two `.icon-btn`s — save (`★`/`☆`, class `saved` when saved, `aria-label="Save"`) and dismiss (`✕`, `aria-label="Dismiss"`), same handlers.
- [ ] **Step 5: Run gates; visually check the Deals tab in both themes.**
- [ ] **Step 6: Commit** `feat: flight deck deals screen with stat cards`.

### Task 5: Search tab

**Files:**
- Modify: `src/web/SearchTab.tsx`

**Interfaces:**
- Consumes: `.card`, `.field`, `.chip*`, `.btn btn-primary`, deal-list table classes from Task 4.

- [ ] **Step 1: Restyle the form** into a `.card` (max-width 560px): each `.settings-row` becomes a labeled column (`<label className="field-label">` — add `.field-label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--label-2); margin-bottom: 0.3rem; }` to `styles.css`), inputs get `className="field"`. Cabin checkboxes become toggle chips: `<button type="button" className={form.cabins.includes(cabin) ? 'chip chip-blue' : 'chip chip-neutral'} aria-pressed={...}>` calling the existing `toggleItem` state update. Submit button → `.btn btn-primary`. Keep the cache-not-live sentence, styled `.content-sub`.
- [ ] **Step 2: Results table** gets the identical classes/markup treatment as the Deals table (route+city stacked, cabin chip, cpp emphasis, direct chip). Error line class `wizard-err` → a `.chip chip-red` block; empty-explanation stays a plain paragraph.
- [ ] **Step 3: Run gates; commit** `style: flight deck search screen`.

### Task 6: Shortlist and Runs tabs

**Files:**
- Modify: `src/web/App.tsx` (`ShortlistTab`, `RunsTab`)

- [ ] **Step 1: ShortlistTab:** table gets the Task 4 table classes; note `<input>` → `className="field"`; "Unsave" → `.btn btn-sm btn-plain`; History link → `.btn btn-sm btn-quiet` button calling the same `onPick`. Missing row state (`no longer available`) renders `<span className="chip chip-orange">no longer available</span>`.
- [ ] **Step 2: RunsTab:** "Scan now" → `.btn btn-primary` in a `.content-header` with `<h4>Runs</h4>`. Status column: finished rows show `<span className="chip chip-green"><span className="dot" />done</span>`, running rows `<span className="chip chip-blue"><span className="dot" />running</span>` (add `@keyframes pulse { 50% { opacity: 0.45; } } .chip-blue .dot { animation: pulse 1.5s ease-in-out infinite; }` — reduced-motion already disables it). Errors: `—` when none; otherwise a `<details>` whose summary is `<span className="chip chip-red">{n} error(s)</span>` (count = number of lines) and body is the existing `pre.err` restyled `font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.78rem; color: var(--red);`.
- [ ] **Step 3: Run gates; commit** `style: flight deck shortlist and runs screens`.

### Task 7: History tab and chart

**Files:**
- Modify: `src/web/Sparkline.tsx` (full rewrite), `src/web/App.tsx` (`HistoryTab` headings only)

**Interfaces:**
- Produces: `Sparkline({ values, width?, height? })` — same props, new rendering. No caller changes needed.

- [ ] **Step 1: Rewrite `Sparkline.tsx`:**

```tsx
export function Sparkline({ values, width = 640, height = 140 }: {
  values: number[]; width?: number; height?: number
}) {
  if (values.length === 0) return <p className="content-sub">No history yet.</p>
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const pad = 12
  const pt = (v: number, i: number): [number, number] => [
    pad + (i * (width - 2 * pad)) / Math.max(values.length - 1, 1),
    height - pad - ((v - min) * (height - 2 * pad)) / span,
  ]
  const pts = values.map((v, i) => pt(v, i))
  const line = pts.map(p => p.join(',')).join(' ')
  const area = `${pad},${height - pad} ${line} ${pts[pts.length - 1][0]},${height - pad}`
  const [ex, ey] = pts[pts.length - 1]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label="value history" style={{ maxWidth: '100%', height: 'auto' }}>
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={pad} x2={width - pad} y1={pad + f * (height - 2 * pad)} y2={pad + f * (height - 2 * pad)}
          stroke="var(--separator-faint)" strokeWidth="1" />
      ))}
      <polygon points={area} fill="var(--accent-tint)" />
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      <circle cx={ex} cy={ey} r="4" fill="var(--accent)" />
      <text x={pad} y={12} fontSize="11" fill="var(--label-2)">{max.toFixed(2)}</text>
      <text x={pad} y={height - 2} fontSize="11" fill="var(--label-2)">{min.toFixed(2)}</text>
    </svg>
  )
}
```

- [ ] **Step 2: `HistoryTab`:** wrap in `.card`; `<h3>` headings become `.t-headline`-styled (add `.card h3 { font-size: 1.0625rem; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 0.6rem; }`); the empty-pick message becomes `.content-sub`.
- [ ] **Step 3: Run gates; commit** `style: flight deck history chart`.

### Task 8: Settings — grouped inset lists with human labels

**Files:**
- Create: `src/web/settingLabels.ts`
- Test: `tests/web/settingLabels.test.ts` (new)
- Modify: `src/web/App.tsx` (`SettingsTab`, `SETTINGS_GROUPS` stays the data source)

**Interfaces:**
- Produces: `SETTING_LABELS: Record<string, { label: string; hint?: string }>` in `src/web/settingLabels.ts` with exactly these entries:

```ts
export const SETTING_LABELS: Record<string, { label: string; hint?: string }> = {
  'origin': { label: 'Home airports', hint: 'Origins with positioning cost, e.g. [{"code":"YYC","positioningCad":0}]' },
  'excludedCountries': { label: 'Excluded countries', hint: 'JSON array of country names to skip' },
  'scanSchedule': { label: 'Scan schedule', hint: 'Cron-style schedule for full scans' },
  'maxPerRoute': { label: 'Max results per route', hint: 'Caps one route’s rows in digests and watches' },
  'pointsProgram': { label: 'Points program' },
  'pointsBalance': { label: 'Points balance' },
  'currency': { label: 'Currency' },
  'ratios': { label: 'Transfer ratios', hint: 'seats.aero source → points per mile' },
  'thresholds.economy': { label: 'Economy alert threshold', hint: 'Minimum ¢/pt before an economy deal alerts' },
  'thresholds.premiumConservative': { label: 'Premium alert threshold', hint: 'Conservative ¢/pt for premium cabins' },
  'minValue.economy': { label: 'Economy minimum value' },
  'minValue.premium': { label: 'Premium minimum value' },
  'alertImprovement': { label: 'Re-alert improvement', hint: 'How much a deal must improve to alert again' },
  'digestEnabled': { label: 'Email digest' },
  'digestTo': { label: 'Send digest to' },
  'smtp.host': { label: 'SMTP host' },
  'smtp.port': { label: 'SMTP port' },
  'smtp.user': { label: 'SMTP user' },
  'smtp.password': { label: 'SMTP password' },
  'seatsAeroKey': { label: 'seats.aero API key', hint: 'Partner API key (pro_…)' },
}
export const settingLabel = (key: string): { label: string; hint?: string } =>
  SETTING_LABELS[key] ?? { label: key }
```

- [ ] **Step 1: Write the failing test** `tests/web/settingLabels.test.ts` — every key rendered by the Settings tab has a human label:

```ts
import { describe, expect, it } from 'vitest'
import { SETTING_LABELS, settingLabel } from '../../src/web/settingLabels.js'

const GROUP_KEYS = [
  'origin', 'excludedCountries', 'scanSchedule', 'maxPerRoute',
  'pointsProgram', 'pointsBalance', 'currency', 'ratios',
  'thresholds.economy', 'thresholds.premiumConservative',
  'minValue.economy', 'minValue.premium', 'alertImprovement',
  'digestEnabled', 'digestTo', 'smtp.host', 'smtp.port', 'smtp.user', 'smtp.password',
  'seatsAeroKey',
]

describe('settingLabels', () => {
  it('covers every settings-tab key with a non-key label', () => {
    for (const key of GROUP_KEYS) {
      expect(SETTING_LABELS[key], key).toBeDefined()
      expect(SETTING_LABELS[key].label).not.toBe(key)
    }
  })
  it('falls back to the raw key for unknown settings', () => {
    expect(settingLabel('mystery').label).toBe('mystery')
  })
})
```

- [ ] **Step 2: Run it, watch it fail; implement `settingLabels.ts`; watch it pass.**
- [ ] **Step 3: Restyle `SettingsTab`:** each group renders `<div className="inset-group"><div className="inset-group-title">{group.heading}</div><div className="inset-list">…rows…</div></div>`. Each row: `<div className="inset-row"><span className="grow">{label}{hint && <span className="hint">{hint}</span>}{entry.overridden && <span className="hint">default: {String(entry.default)}</span>}</span>{control}{buttons}</div>` using `settingLabel(key)`. Controls: `digestEnabled` becomes `<button className={"toggle" + (value === 'true' ? ' on' : '')} role="switch" aria-checked={value === 'true'} aria-label="Email digest" onClick={…toggle value between 'true'/'false' then save immediately…}>` (toggle saves on click — call the existing `save` after updating input state; keep the underlying string 'true'/'false' contract). JSON settings keep the `<textarea>` (class `field`, full-width row variant `.inset-row.tall { align-items: flex-start; }`). Secrets keep the password `<input className="field">` + Save/Clear as `.btn btn-sm btn-tinted` / `.btn btn-sm btn-destructive`. Plain values: `<input className="inset-field">` saving on the existing Save button (`.btn btn-sm btn-tinted`), Reset `.btn btn-sm btn-plain`.
- [ ] **Step 4: Run gates; verify each settings group renders, a value saves, `digestEnabled` toggles, a secret shows the set-placeholder.**
- [ ] **Step 5: Commit** `feat: grouped inset settings with human labels`.

### Task 9: Wizard onboarding card

**Files:**
- Modify: `src/web/Wizard.tsx`; `src/web/styles.css` (wizard section rewrite)

- [ ] **Step 1: Restyle wizard CSS** (replace the legacy `.wizard*` rules): `.wizard { max-width: 560px; margin: 4rem auto; padding: 2.5rem; background: var(--surface); border-radius: 14px; box-shadow: var(--shadow-window); }`; step dots `.wizard-steps span { width: 2rem; height: 2rem; border-radius: 50%; display: grid; place-items: center; font-size: 0.85rem; font-weight: 600; background: var(--inset); color: var(--label-2); }` with `.active { background: var(--accent); color: #fff; }` and `.done { background: var(--green); color: #fff; }`; `.wizard-ok { color: var(--green); }`, `.wizard-err { color: var(--red); }`.
- [ ] **Step 2: Markup:** inputs get `className="field"`; primary advance buttons ("Next ▶" → "Next", "Finish ✔" → "Finish") become `.btn btn-primary`; "◀ Back" → "Back" as `.btn btn-plain`; "Test connection"/"Send test email" → `.btn btn-tinted`; ratio-row remove button → `.icon-btn` with `aria-label="Remove program"`; "+ add program" → `.btn btn-sm btn-tinted` labeled "Add program". Title becomes `<h1>✈️ Flight Checks</h1>` (product name, sentence intro below unchanged).
- [ ] **Step 3: Run gates; commit** `style: flight deck onboarding wizard`.

### Task 10: Watches tab + legacy cleanup + final QA

**Files:**
- Modify: `src/web/WatchesTab.tsx`, `src/web/styles.css`

- [ ] **Step 1: Read `src/web/WatchesTab.tsx` in full**, then apply the established vocabulary with no behavior change: the create/edit form goes in a `.card` with `.field` inputs and `.field-label`s; cabin/continent/theme multi-selects that are checkboxes become chip toggle buttons exactly like Task 5's cabins; each existing watch renders as a `.card` (title = watch name in Headline style; criteria as `.chip chip-neutral`s; travel window as `.content-sub`); primary submit `.btn btn-primary`; delete `.btn btn-sm btn-destructive`; any results table gets the Task 4 table classes.
- [ ] **Step 2: Delete legacy CSS** now unreferenced: old `nav` rules, `.banner`, `.filters`, `tr.fits`, `button.small`, `.settings-row`, `.settings-group` (grep `src/web` for each class before deleting; keep any still referenced).
- [ ] **Step 3: Full gates** `npx tsc --noEmit && npx vitest run && npm run build`, then `npm run serve` and click through all seven tabs and the wizard (`?wizard` state can be reached by temporarily clearing `configured` — instead just verify tabs) in **both** OS themes; verify no horizontal body scroll at 375px width (tables scroll inside `.overflow`).
- [ ] **Step 4: Commit** `style: flight deck watches screen and legacy cleanup`.

---

## Self-review notes

- Spec coverage: tokens (T1), components/buttons (T2), shell+toast (T3), Deals with stat cards/chips/hover (T4), Search card + cache copy (T5), Shortlist orange missing-state + Runs status chips/pulse (T6), History area chart (T7), Settings grouped-inset + human labels + toggle (T8), Wizard hello-card (T9), Watches + cleanup + dual-theme QA (T10). Screen-by-screen table in the design spec is fully covered.
- Types: `dealStats` and `SETTING_LABELS`/`settingLabel` signatures are stated once and consumed with the same names. Class vocabulary is defined in T2's Produces list and used verbatim afterward.
- Behavior freeze: no fetch, poll, or settings-write logic is altered anywhere; `digestEnabled` toggle reuses the existing `save` path with the existing `'true' | 'false'` string contract.
