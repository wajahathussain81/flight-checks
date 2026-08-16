# Flight Deck Design System

## Overview

Flight Deck gives Flight Checks the native feel of a macOS app: a sidebar app shell, SF Pro system typography, quiet layered surfaces, and a single Apple system-blue accent. Three principles govern every screen:

- **Deference to content.** The chrome is grey and quiet. Color appears only where it means something: blue for actions and selection, green for “fits your balance,” and red for errors—never decoratively.
- **Depth through layers, not lines.** White cards float on a soft grey ground with faint shadows, following the macOS window model; hairline separators replace table borders, and nothing is boxed twice.
- **Clarity of hierarchy.** Every screen opens with a large title and a one-line summary; data uses tabular numerals, and the ranking metric (¢/pt) is the visually heaviest item in each row.

## Color

The palette is semantic and theme-aware. Apple system blue is the single brand accent.

### Light

| Variable | Exact value | Use |
| --- | --- | --- |
| `--bg` | `#F5F5F7` | Window ground and page canvas. |
| `--surface` | `#FFFFFF` | Primary card, window, and selected-control surface. |
| `--surface-2` | `#FAFAFC` | Secondary card fill, title bar, deal header, and stat surface. |
| `--inset` | `#F2F2F7` | Recessed controls, fields, neutral chips, and grouped lists. |
| `--label` | `#1D1D1F` | Primary text and neutral high-emphasis values. |
| `--label-2` | `#6E6E73` | Secondary text, metadata, hints, and inactive controls. |
| `--label-3` | `#AEAEB2` | Tertiary text, placeholders, captions, and inactive toggle track. |
| `--separator` | `rgba(0, 0, 0, 0.10)` | Stronger structural hairlines. |
| `--separator-faint` | `rgba(0, 0, 0, 0.06)` | Subtle row, card, window, and sidebar hairlines. |
| `--accent` | `#007AFF` | Primary action, selection, links, icons, focus, and blue status. |
| `--accent-tint` | `rgba(0, 122, 255, 0.12)` | Tinted actions, blue chips, focus halo, and row hover wash. |
| `--green` | `#34C759` | Positive state, strong value, saved state, and enabled toggle. |
| `--green-tint` | `rgba(52, 199, 89, 0.13)` | Positive chips and saved-action fill. |
| `--red` | `#FF3B30` | Error and destructive text. |
| `--red-tint` | `rgba(255, 59, 48, 0.12)` | Error chips, destructive buttons, and error toast fill. |
| `--orange` | `#FF9500` | Warning and partial-state text. |
| `--orange-tint` | `rgba(255, 149, 0, 0.14)` | Warning and partial-state chip fill. |
| `--shadow-card` | `0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.05)` | Floating cards and specimens. |
| `--shadow-window` | `0 2px 6px rgba(0,0,0,0.08), 0 18px 50px rgba(0,0,0,0.16)` | App windows and sheet-like presentations. |
| `--sidebar-bg` | `rgba(246, 246, 248, 0.9)` | Translucent source-list sidebar. |
| `--on-accent` | `#FFFFFF` | Foreground on accent/green fills: primary button text, selected sidebar item, toggle knob. |
| `--on-accent-dim` | `rgba(255, 255, 255, 0.75)` | Muted foreground on accent fills, e.g. the selected sidebar count. |

### Dark

Dark tokens apply under `@media (prefers-color-scheme: dark)` unless `data-theme="light"` is set, and directly when `data-theme="dark"` is set.

| Variable | Exact value | Use |
| --- | --- | --- |
| `--bg` | `#161618` | Window ground and page canvas. |
| `--surface` | `#1E1E20` | Primary card, window, and selected-control surface. |
| `--surface-2` | `#232326` | Secondary card fill, title bar, deal header, and stat surface. |
| `--inset` | `#2A2A2D` | Recessed controls, fields, neutral chips, and grouped lists. |
| `--label` | `#F5F5F7` | Primary text and neutral high-emphasis values. |
| `--label-2` | `#98989F` | Secondary text, metadata, hints, and inactive controls. |
| `--label-3` | `#636368` | Tertiary text, placeholders, captions, and inactive toggle track. |
| `--separator` | `rgba(255, 255, 255, 0.13)` | Stronger structural hairlines. |
| `--separator-faint` | `rgba(255, 255, 255, 0.07)` | Subtle row, card, window, and sidebar hairlines. |
| `--accent` | `#0A84FF` | Primary action, selection, links, icons, focus, and blue status. |
| `--accent-tint` | `rgba(10, 132, 255, 0.18)` | Tinted actions, blue chips, focus halo, and row hover wash. |
| `--green` | `#30D158` | Positive state, strong value, saved state, and enabled toggle. |
| `--green-tint` | `rgba(48, 209, 88, 0.16)` | Positive chips and saved-action fill. |
| `--red` | `#FF453A` | Error and destructive text. |
| `--red-tint` | `rgba(255, 69, 58, 0.16)` | Error chips, destructive buttons, and error toast fill. |
| `--orange` | `#FF9F0A` | Warning and partial-state text. |
| `--orange-tint` | `rgba(255, 159, 10, 0.17)` | Warning and partial-state chip fill. |
| `--shadow-card` | `0 1px 2px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.3)` | Floating cards and specimens. |
| `--shadow-window` | `0 2px 6px rgba(0,0,0,0.4), 0 18px 50px rgba(0,0,0,0.55)` | App windows and sheet-like presentations. |
| `--sidebar-bg` | `rgba(40, 40, 43, 0.9)` | Translucent source-list sidebar. |
| `--on-accent` | `#FFFFFF` | Foreground on accent/green fills (same in both themes). |
| `--on-accent-dim` | `rgba(255, 255, 255, 0.75)` | Muted foreground on accent fills (same in both themes). |

Semantic tint fills use 12–18% alpha to back chips and secondary buttons. Full-strength semantic color is reserved for meaningful text, glyphs, selection, the enabled toggle, and the primary action.

**Hard rule:** components only ever reference semantic tokens, never raw hex or rgba values. The approved specimen used literal `#fff` for primary/selected foregrounds and the toggle knob; production resolves those through `var(--on-accent)` (and `var(--on-accent-dim)` for muted text on accent fills).

## Typography

Use SF Pro through the operating-system stack with zero font payload.

- **Text stack:** `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif`
- **Display stack:** `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif`
- Apply `-webkit-font-smoothing: antialiased` and a default body `line-height: 1.5`.
- Use the display stack for large display titles; use the text stack for interface copy and controls.

| Style | Size | Weight | Tracking and treatment | Color |
| --- | --- | --- | --- | --- |
| Large Title | `34px` | `700` | `-0.022em`; `line-height: 1.1` | `var(--label)` |
| Title 2 | `22px` | `700` | `-0.018em` | `var(--label)` |
| Headline | `17px` | `600` | `-0.01em` | `var(--label)` |
| Body | `15px` | `400` | Default tracking | `var(--label)` |
| Numeric | `17px` | `600` | `font-variant-numeric: tabular-nums` | Semantic by state |
| Footnote | `13px` | `400` | Default tracking | `var(--label-2)` |
| Caption | `12px` | `600` | Uppercase; `letter-spacing: 0.06em` | `var(--label-3)` |

Every figure—prices, points, counts, dates, scan totals, and ¢/pt—uses `font-variant-numeric: tabular-nums`.

## Surfaces & depth

- **Window ground:** `var(--bg)` is the quiet outer canvas.
- **Card surface:** `var(--surface)` holds primary windows and elevated content; `var(--surface-2)` separates quieter card regions, title bars, headers, and stat blocks.
- **Inset fill:** `var(--inset)` indicates recessed controls and grouped settings without another enclosing border.
- **7px radius:** small buttons, segmented-control options, and row icon buttons.
- **9px radius:** standard buttons, text fields, selects, and segmented-control containers.
- **12px radius:** stat cards, deal-list containers, grouped-inset lists, and other inset containers. Status chips remain pills at `999px`.
- **14px radius:** cards, specimens, and app windows.
- **Card shadow:** always `var(--shadow-card)`; use it only when a card must float above the ground.
- **Window shadow:** always `var(--shadow-window)`; a window also has `border: 1px solid var(--separator-faint)` and `overflow: hidden`.
- **Hairlines:** use `1px solid var(--separator-faint)` for row divisions and subtle edges, or `1px solid var(--separator)` for stronger structural separation. Never restore conventional boxed table borders.

## Components

All dimensions and states below come from the approved artifact. If a state is not listed for a component, the artifact defines no additional visual override for it; retain the base style plus the global focus-visible rule.

### Window chrome and content frame

- `.window`: `border-radius: 14px`; `overflow: hidden`; `box-shadow: var(--shadow-window)`; `border: 1px solid var(--separator-faint)`; `background: var(--surface)`; `margin-top: 1.25rem`.
- `.titlebar`: flex; center aligned; `gap: 0.5rem`; `padding: 0.7rem 1rem`; `background: var(--surface-2)`; bottom `1px solid var(--separator-faint)` hairline.
- The traffic-light group is flex with `gap: 7px`; each circular light is `12px × 12px`.
- `.titlebar-title`: grows to fill the row; center aligned; `font-size: 0.82rem`; `font-weight: 600`; `color: var(--label-2)`; `margin-right: 3rem` to optically balance the traffic lights.
- `.content` uses `padding: 1.4rem 1.6rem` and `overflow-x: auto` so dense deal rows stay intact.
- Window chrome is static and has no hover, active, disabled, or focus state.

### Filter bar

- `.filter-bar`: flex with wrapping, `gap: 0.5rem`, and `margin-bottom: 1rem`.
- Compose fields, selects, a segmented cabin control, search, and at most one tinted contextual scan action without introducing another enclosing card.
- The artifact’s flexible search field uses `flex: 1` and `min-width: 8rem`; its minimum-¢/pt specimen uses `width: 7.5rem`.
- Each child retains its own component hover, active, disabled, and focus-visible behavior.

### Buttons

- Base `.btn`: inherited font; `font-size: 0.9rem`; `font-weight: 590`; `letter-spacing: -0.005em`; no border; `border-radius: 9px`; `padding: 0.5rem 1.05rem`; pointer cursor.
- Transition `transform`, `filter`, and `background` with `0.12s ease`.
- `.btn-primary`: `background: var(--accent)` with a constant-white foreground resolved semantically; only one primary action appears per screen.
- `.btn-primary:hover`: `filter: brightness(1.08)`.
- `.btn-tinted`: `background: var(--accent-tint)` and `color: var(--accent)` for secondary actions.
- `.btn-plain`: `background: var(--inset)` and `color: var(--label)` for neutral actions.
- `.btn-destructive`: `background: var(--red-tint)` and `color: var(--red)`.
- `.btn-quiet`: transparent background, `color: var(--accent)`, and `padding-inline: 0.5rem` for inline actions.
- `.btn-sm`: `font-size: 0.8rem`; `padding: 0.32rem 0.75rem`; `border-radius: 7px`.
- Active: `transform: scale(0.97)`.
- Disabled: `opacity: 0.45`, default cursor, and no active transform.
- Focus-visible: `outline: 2px solid var(--accent)` with `outline-offset: 2px`.

### Segmented control

- `.segmented`: `display: inline-flex`; `background: var(--inset)`; `border-radius: 9px`; `padding: 2px`; `gap: 2px`.
- Each button inherits the font at `0.85rem` and `500`; it has no border, transparent background, `color: var(--label-2)`, `padding: 0.35rem 0.9rem`, `border-radius: 7px`, and a pointer cursor.
- Selected `.on`: `background: var(--surface)`; `color: var(--label)`; `font-weight: 600`; `box-shadow: 0 1px 3px rgba(0,0,0,0.12)`.
- Hover, active, and disabled add no artifact-specific override. Focus-visible uses the global 2px accent outline.

### Text fields & selects

- `.field`: inherited font at `0.9rem`; `background: var(--inset)`; `border: 1px solid transparent`; `border-radius: 9px`; `padding: 0.5rem 0.85rem`; `color: var(--label)`; `min-width: 0`.
- Placeholder text uses `var(--label-3)`.
- Inputs and selects share this shape so a filter bar reads as one family.
- Focus: remove the default outline, set `border-color: var(--accent)`, and apply `box-shadow: 0 0 0 3px var(--accent-tint)`.
- Search-field extension: `padding-left: 2rem`; non-repeating background icon positioned at `0.65rem center`.
- Hover, active, and disabled add no artifact-specific override. Keyboard focus must remain visibly represented by the accent border and halo.

### Status chips

- `.chip`: inline flex; center aligned; `gap: 0.35rem`; `font-size: 0.78rem`; `font-weight: 600`; `border-radius: 999px`; `padding: 0.22rem 0.7rem`; zero letter-spacing.
- Green “Fits balance”: `background: var(--green-tint)` and `color: var(--green)`.
- Blue “Direct” and “running”: `background: var(--accent-tint)` and `color: var(--accent)`.
- Orange warning or partial scan: `background: var(--orange-tint)` and `color: var(--orange)`.
- Red error: `background: var(--red-tint)` and `color: var(--red)`.
- Neutral program or cabin: `background: var(--inset)` and `color: var(--label-2)`.
- Optional `.dot` glyph: `7px × 7px`, `border-radius: 50%`, `background: currentColor`.
- Chips replace full-row green fills and inline “· direct” text. Non-interactive chips have no hover, active, disabled, or focus state.

### Toggle switch

- `.toggle`: `44px × 26px`; pill radius `999px`; `background: var(--label-3)`; relative positioning; no border; pointer cursor; `flex-shrink: 0`.
- Track transition: `background 0.15s ease`.
- Knob: empty `::after`, absolutely positioned `top: 2px; left: 2px`; `22px × 22px`; `border-radius: 50%`; constant-white fill resolved semantically; `box-shadow: 0 1px 3px rgba(0,0,0,0.25)`; transition `left 0.15s ease`.
- On: track becomes `var(--green)` and knob moves to `left: 20px`.
- Hover, active, and disabled add no artifact-specific override. Focus-visible uses the global 2px accent outline.

### Sidebar source list

- `.app-shell`: grid with `grid-template-columns: 200px 1fr` and `min-height: 460px`.
- `.sidebar`: `background: var(--sidebar-bg)`; right hairline `1px solid var(--separator-faint)`; `padding: 0.9rem 0.6rem`.
- `.side-item`: flex, center aligned, `gap: 0.6rem`; `font-size: 0.86rem`; `font-weight: 500`; `color: var(--label)`; `padding: 0.42rem 0.7rem`; `border-radius: 8px`; `margin-bottom: 1px`.
- Glyphs are `16px × 16px`, non-shrinking, and `color: var(--accent)`.
- Selected `.on`: `background: var(--accent)`; constant-white foreground resolved semantically; `font-weight: 600`; its glyph uses the same foreground.
- Live `.count`: pushed right with `margin-left: auto`; `font-size: 0.72rem`; `font-weight: 600`; `color: var(--label-3)`; tabular numerals. In the selected item, it uses `rgba(255,255,255,0.75)` through a semantic selected-count treatment.
- `.side-section`: `font-size: 0.68rem`; `font-weight: 700`; uppercase; `letter-spacing: 0.06em`; `color: var(--label-3)`; `padding: 0.9rem 0.7rem 0.3rem`.
- Hover, active, and disabled add no artifact-specific override. Interactive items use the global focus-visible outline.

### Large-title content header

- Production screen title uses the 34px Large Title style. The scaled window specimen’s `.content-header h4` is `1.55rem`, `700`, `letter-spacing: -0.02em`, with zero margin.
- `.content`: `padding: 1.4rem 1.6rem` and horizontal overflow enabled.
- `.content-header`: flex; center aligned; space-between; `gap: 1rem`; `margin-bottom: 1rem`; wrapping enabled.
- Subtitle `.content-sub`: `font-size: 0.8rem`; `color: var(--label-2)`; `margin: 0.1rem 0 0`. Treat it as the one-line footnote summary.
- Place exactly one `.btn-primary` action opposite the title group.

### Stat cards

- `.stat-row`: responsive grid `repeat(auto-fit, minmax(130px, 1fr))`; `gap: 0.75rem`; `margin-bottom: 1.1rem`.
- `.stat`: `background: var(--surface-2)`; `border: 1px solid var(--separator-faint)`; `border-radius: 12px`; `padding: 0.75rem 0.95rem`.
- Label `.k`: `font-size: 0.7rem`; `font-weight: 600`; uppercase; `letter-spacing: 0.05em`; `color: var(--label-3)`.
- Value `.v`: `font-size: 1.35rem`; `font-weight: 700`; `letter-spacing: -0.02em`; tabular numerals; `line-height: 1.2`.
- Value suffix: `font-size: 0.75rem`; `font-weight: 600`; `color: var(--green)`; zero letter-spacing.
- Static cards have no hover, active, disabled, or focus state.

### Deal list

- `.deal-list`: `border: 1px solid var(--separator-faint)`; `border-radius: 12px`; `overflow: hidden`.
- `.deal-head` and `.deal-row`: grid columns `1.5fr 1fr 0.8fr 1fr 0.9fr 0.8fr 0.9fr`; `gap: 0.75rem`; center aligned; `padding: 0.6rem 1rem`; `min-width: 640px`.
- `.deal-head`: `font-size: 0.7rem`; `font-weight: 600`; uppercase; `letter-spacing: 0.05em`; `color: var(--label-3)`; `background: var(--surface-2)`; bottom hairline.
- `.deal-row`: `font-size: 0.86rem`; bottom hairline except on the last row; transition `background 0.1s ease`.
- Row hover: `background: var(--accent-tint)` and pointer cursor.
- Route `.deal-route`: `font-weight: 600`; `letter-spacing: -0.005em`.
- City `.deal-dest`: stacked block beneath the route; `font-size: 0.74rem`; `font-weight: 400`; `color: var(--label-2)`.
- All `.deal-num` cells use tabular numerals.
- ¢/pt `.cpp` is the boldest cell at `font-weight: 700` with tabular numerals; strong `.cpp-great` uses `var(--green)`, otherwise `.cpp-ok` uses `var(--label)`.
- `.deal-actions`: flex, `gap: 0.35rem`, aligned to the row end.
- `.icon-btn`: `26px × 26px`; `border-radius: 7px`; no border; `background: var(--inset)`; `color: var(--label-2)`; pointer cursor; grid-centered; `font-size: 0.8rem`.
- Icon-button hover uses `var(--accent)`; saved uses `background: var(--green-tint)` and `color: var(--green)`.
- Row actions use the global focus-visible outline; the artifact defines no disabled override.

### Grouped-inset settings lists

- `.inset-group`: `max-width: 560px`.
- Caption `.inset-group-title`: `font-size: 0.72rem`; `font-weight: 600`; uppercase; `letter-spacing: 0.06em`; `color: var(--label-3)`; `padding: 0 1rem 0.4rem`.
- `.inset-list`: `background: var(--inset)`; `border-radius: 12px`; `overflow: hidden`.
- `.inset-row`: flex; center aligned; `gap: 0.9rem`; `padding: 0.7rem 1rem`; `font-size: 0.88rem`; bottom `1px solid var(--separator-faint)` except on the final row.
- The label region grows with `flex: 1`. Its hint is a block at `0.74rem` and `color: var(--label-2)`.
- Read-only `.inset-value`: `color: var(--label-2)` and `font-size: 0.85rem`.
- Editable `.inset-field`: inherited font at `0.85rem`; right-aligned; transparent background; no border; `color: var(--accent)`; `width: 7rem`; no default focus outline.
- Replace raw keys with human labels and hint lines, for example `thresholds.economy` becomes “Economy alert threshold” with “Minimum ¢/pt before a deal alerts.”
- Booleans use the toggle. Inline editors remain keyboard reachable and receive the global focus-visible treatment even though the specimen removes the default outline.

### Error toast

- Replace the full-width error banner with a floating toast at the top center.
- Use a rounded shape, `var(--red-tint)` fill, and the red semantic foreground `var(--red)`; click dismisses it.
- Geometry (approved in the implementation plan): fixed at `top: 1rem`, horizontally centered (`left: 50%; transform: translateX(-50%)`); `max-width: min(90vw, 480px)`; `border-radius: 12px`; `padding: 0.65rem 1.1rem`; `font-size: 0.9rem`; `font-weight: 500`; `box-shadow: var(--shadow-window)`. No auto-dismiss timeout — it stays until clicked.
- Because dismissal is interactive, expose it to the keyboard and apply the global focus-visible outline.

## Motion

- Tab switches cross-fade content in `150ms`. Do not slide or bounce.
- Buttons press to `transform: scale(0.97)`; their transform, filter, and background transitions use `0.12s ease`.
- Deal-row hover color transitions with `background 0.1s ease`.
- Toggle track and knob transitions use `0.15s ease`.
- During scans, the primary button shows an inline spinner and the Runs row pulses its blue “running” chip. Pulse (approved in the implementation plan): the chip’s dot animates `opacity` to `0.45` at the 50% keyframe, `1.5s ease-in-out infinite`.
- Under `@media (prefers-reduced-motion: reduce)`, apply `transition: none !important` to all elements and disable the scan pulse and cross-fade.

## Accessibility

- Every interactive element is keyboard reachable.
- Every interactive element uses `:focus-visible` with `outline: 2px solid var(--accent)` and `outline-offset: 2px`; field controls additionally retain their accent border and `0 0 0 3px var(--accent-tint)` halo.
- Preserve legible contrast in both themes by pairing semantic foreground and background tokens exactly as specified.
- Do not encode status by color alone: chips carry text, “Fits balance” may include the dot glyph, toggles expose their state and label, icon actions have accessible names, and scanning/error states have readable text.
- Honor reduced-motion preferences by disabling all transitions and pulsing behavior.
