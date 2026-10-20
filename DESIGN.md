---
name: Expenses
description: A bold, self-hosted expense tracker built around one line at thumb reach.
colors:
  ground: "#f5f7fb"
  surface: "#ffffff"
  surface-2: "#eef0f6"
  ink: "#12161f"
  ink-2: "#4e525e"
  ink-3: "#676c77"
  hairline: "#e4e6ec"
  hairline-strong: "#d3d6dd"
  track: "#e9ebf1"
  accent: "#3250f0"
  accent-soft: "#e0ebff"
  on-accent: "#ffffff"
  amber: "#9a5a00"
  amber-line: "#efca9f"
  amber-soft: "#fdf0de"
  up: "#d02b31"
  down: "#007840"
  glass: "rgb(255 255 255 / 0.72)"
  ground-dark: "#0d0f15"
  surface-dark: "#171920"
  surface-2-dark: "#21242c"
  ink-dark: "#f4f5f9"
  ink-2-dark: "#b7bac3"
  ink-3-dark: "#91959e"
  hairline-dark: "#272a31"
  hairline-strong-dark: "#373a43"
  track-dark: "#23262e"
  accent-dark: "#779bff"
  accent-soft-dark: "#21305b"
  on-accent-dark: "#070d25"
  amber-dark: "#eca851"
  amber-line-dark: "#573c1c"
  amber-soft-dark: "#2e2214"
  up-dark: "#fc7a79"
  down-dark: "#59d38c"
  glass-dark: "rgb(23 25 32 / 0.7)"
  cat-rose: "#f16f7e"
  cat-tangerine: "#f98942"
  cat-sun: "#f4bf3f"
  cat-lime: "#99d352"
  cat-jade: "#3fbe90"
  cat-aqua: "#26c0cf"
  cat-orchid: "#bf73df"
  cat-pink: "#e977bb"
typography:
  hero:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "60px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.04em"
    fontFeature: "tnum"
  hero-long:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.04em"
  display:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 650
    letterSpacing: "-0.02em"
  input:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 500
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.375
  label:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  caption:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  tab:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
  amount:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "15px"
    fontWeight: 500
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  amount-sm:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 500
    fontFeature: "tnum"
rounded:
  token: "4px"
  tile-sm: "9px"
  tile: "11px"
  field: "14px"
  panel: "22px"
  card: "24px"
  dock: "26px"
  chip: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  gutter: "20px"
  section: "28px"
  column: "448px"
components:
  hero-numeral:
    textColor: "{colors.ink}"
    typography: "{typography.hero}"
  delta-up:
    textColor: "{colors.up}"
    typography: "{typography.amount-sm}"
  delta-down:
    textColor: "{colors.down}"
    typography: "{typography.amount-sm}"
  month-stepper:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.chip}"
    size: "36px"
  day-skyline:
    height: "112px"
  day-skyline-segment:
    rounded: "2.5px"
  day-skyline-empty:
    backgroundColor: "{colors.hairline-strong}"
    height: "2px"
  category-tile:
    backgroundColor: "color-mix(category 16%, surface); 24% in dark"
    rounded: "{rounded.tile}"
    size: "36px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
  expense-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "12px 16px"
    height: "62px"
  dock:
    backgroundColor: "{colors.glass}"
    rounded: "{rounded.dock}"
    padding: "8px"
  one-line-bar:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.input}"
    rounded: "{rounded.field}"
    height: "48px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.field}"
    padding: "0 20px"
    height: "44px"
  button-quiet:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "0 16px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "0 14px"
    height: "44px"
  chip:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "6px 12px"
  token-amount:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.token}"
  token-tag:
    backgroundColor: "{colors.track}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.token}"
  segmented:
    backgroundColor: "{colors.track}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    height: "40px"
  segmented-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.chip}"
  answer-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.input}"
    rounded: "{rounded.card}"
    padding: "18px 20px 10px"
  tab-bar-current:
    textColor: "{colors.ink}"
---

# Design System: Expenses

## Overview

**Creative North Star: "The Denomination"**

A banknote says what it is worth in one huge numeral. This app does the same with your month: Home and Stats open on the ground with one number set big and sure in ink. Under it on Home the month is told as a skyline of days, one column per day, stacked in category colour. The rest of the screen hands that number its detail: what changed, where it went, and the rows behind it.

It is bold consumer fintech held to a precise standard. One committed hue (Cobalt) marks what is live or commits; it paints no field. Eight curated category hues give every expense an identity in a tinted tile and every day its colour in the skyline. Figures that line up in a column are set in Geist Mono; the one headline figure is set in Geist at 60px. Things move: totals count up, the skyline lifts, rows grow in, the spend line draws itself, the dock is frosted glass at thumb reach.

Dark is the hero theme, the one screenshots and reviews start from: a cool near-black ground, lifted surfaces, a bright cobalt accent. Light is its full twin, not an afterthought: cool off-white ground, white panels, a deeper cobalt. Theme follows the system by default.

The one-line bar is still the way in. Nothing about its parsing, ghost completion, chips, receipt or undo changes; only its clothes do.

**Key characteristics:**
- A 60px total in ink on the ground at the top of Home and Stats; no coloured field.
- The Day skyline under the Home total: one stacked column per day.
- Grouped panels on a cool ground; inset hairlines inside a panel, none between panels.
- Category emoji in tinted tiles; category colour in tiles, the skyline, its legend, share tracks and nowhere else.
- Geist for words and the hero numeral; Geist Mono for every other amount, delta and axis label.
- One frosted dock: bar and tabs as one surface.
- Motion with a job: rise, press, count-up, lift, grow-in, draw.

## Colors

Every colour is a CSS variable in `web/index.css` with a light value on `:root` and a dark twin on `.dark`. Tailwind names are in brackets.

### Primary
- **Cobalt** (`accent`): live input, parsed amount token, the leading "?", primary buttons, focus outlines, the current-tab icon, links that go on ("Continue in chat", "All Food expenses"), the selected filter state, the filter count badge, this period's line and area on the Stats chart.
- **Cobalt Wash** (`accent-soft`): focus halo, parsed amount pill, text selection.

### Category palette
Eight hues at matched OKLCH lightness and chroma, all at least 47° from Cobalt (268°) so no category reads as the accent:

| Name | Hex | OKLCH | Default use |
|---|---|---|---|
| Rose | `#f16f7e` | 0.70 0.16 15 | Health |
| Tangerine | `#f98942` | 0.74 0.16 50 | Food |
| Sun | `#f4bf3f` | 0.83 0.15 85 | Entertainment |
| Lime | `#99d352` | 0.80 0.17 130 | Travel |
| Jade | `#3fbe90` | 0.72 0.13 165 | Home |
| Aqua | `#26c0cf` | 0.74 0.12 205 | Transport |
| Orchid | `#bf73df` | 0.68 0.17 315 | Subscriptions |
| Pink | `#e977bb` | 0.72 0.16 345 | Shopping, Gifts |

Uncategorised is neutral: drawn, not coloured, in tiles (see Category tile); Ink 3 in the skyline and its legend.

### Semantic
- **Over** (`up`): spend up versus the previous period; destructive and error text.
- **Under** (`down`): spend down.
- Change is plain `up`/`down` mono text with a drawn arrow, never a filled pill.
- **Amber** (`amber`, `amber-line`, `amber-soft`): pending recurring expenses, the "no rate" warning and the skyline tick for a day with only unconverted spend.

### Neutral
- **Ground** (`bg`): page background, and the ground under the headline figure on every screen.
- **Surface** (`surface`): panels, inputs, answer card, segmented thumb.
- **Surface 2** (`surface2`): the bar's input well, quiet buttons, hover on rows and month steppers, the form header's Cancel and currency chips.
- **Ink, Ink 2, Ink 3** (`ink`, `ink2`, `ink3`): primary, secondary, tertiary text. Ink 3 is at least 4.9:1 on ground in light and 5.2:1 on Surface 2 in dark.
- **Hairline, Strong hairline** (`line`, `line2`): inset row dividers inside panels; input borders; empty and future days in the skyline; chart baseline and today rule.
- **Track** (`track`): empty share tracks, segmented well, tag token.
- **Glass** (`glass`, `glass-line`): the dock and the suggestion chips.

### Named rules
**The Ground Rule.** The headline figure sits on the ground, in ink. No coloured field or card behind it.

**The Accent Rule.** Cobalt marks what is live or what commits, plus this period's line on Stats. Never category data, never headings, never a background.

**The Category Colour Rule.** Category colour appears as a tinted tile behind the emoji, as skyline segments and legend squares on Home, and as share-track fills on Stats. Never as text colour, never as a button.

**The Twin Token Rule.** Components use tokens, never raw hex. A category's own colour reaches CSS through the `--c` custom property on `.tile` or an inline `background`.

## Typography

**Words and the hero numeral:** Geist Variable. **Column figures:** Geist Mono Variable (`num` utility). Both self-hosted via `@fontsource-variable`.

The split is a rule, not a mood: the one figure that states the screen's headline is set in Geist; every other amount, delta, percentage and axis label is Geist Mono so columns align and figures read as data.

### Scale
- **Hero** 60px / 1, 600, -0.04em, tabular. Pence at 0.5em, weight 500, 65% opacity. Strings over 9 characters (large totals) drop to **Hero long** 44px, over 12 (BTC, millions) to 34px and over 14 to 28px so they fit. The steps are `numeralSize` in `web/components/total.tsx`, shared by `Total` (which counts up) and the expense form amount.
- **Display** 34px / 1.1, 700, -0.035em (`text-display font-bold`): every page title ("Stats", "Categories", Settings, Bin, Recurring, Chats, the sign-in masthead). Home has no Display title; its month is a 15px label (see Layout).
- **Title** 20px, 650, -0.02em: section heads ("By category", "By tag").
- **Input** 17px, 500, -0.01em: the bar and AI answer text.
- **Body** 15px, 500 for notes and names, 400 for prose.
- **Label** 13px, 500: day headers, chips, field labels, text buttons, segmented options.
- **Caption** 12px, 500: second lines of rows, legends, hints under the bar.
- **Tab** 11px, 600: tab labels.
- Tile emoji (19px, 15px small) is a glyph size set by the tile, not a text step.
- **Amount** Geist Mono 15px, 500, -0.01em: row amounts, category totals.
- **Amount small** Geist Mono 11-13px, 500: original-currency line, deltas, shares, day totals, chart and skyline labels.

### Named rules
**Sentence case.** No uppercase or letter-spaced labels. No eyebrow above a heading or above the hero numeral; context follows the figure, it never precedes it.

**Tabular everywhere.** `tabular-nums` is on `body`; `num` adds Geist Mono.

## Layout

One centred column, 448px max, 20px gutters, on phone and desktop. At `lg` the tabs become a left rail and the dock is only the bar; desktop beyond that is out of scope for now.

### Home
1. **Header**, on the ground. A horizontal swipe on it steps months (right for earlier, left for later).
   - Row 1, Ink 2: a 36px round month stepper (no fill, drawn chevron, `surface2` on hover), the month as the h1 at 15px 600 ("October"; "March 2025" outside this year), the next stepper, then the filter button pushed far right. In the current month the next stepper stays in place, disabled at 30%. The filter button fills Ink with a Ground icon while open; active filters show an 18px `accent` count badge, `on-accent` mono 11px, with a 2px Ground ring.
   - Row 2, 16px below: the hero numeral in Ink, counting up.
   - Row 3, 10px below: the delta ("↑ 12%" with a drawn arrow, mono, `up` or `down`) then "vs Sept by today" in Label, Ink 2. No previous data: just "this month".
   - Row 4, 20px below: the Day skyline (see Components), then a wrapping legend in Caption, Ink 2: an 8px colour square (2px radius), the name, the mono share in Ink 3; the top three categories, then "Other" with drawn dots.
   - A filtered list replaces the month with "Filtered", drops the steppers, and shows the matching total with "N matching" in Ink 2; no skyline.
2. **Pending recurring**: one amber panel (`amber-soft` fill, panel radius) above the days: tile, note, "due today" caption, Confirm pill (amber text on surface, `amber-line` border).
3. **Day groups**: header 13px, 600, Ink 2 ("Today", "Yesterday", "Mon 6 Oct"), 24px above, 8px below; day total right-aligned in mono 13px Ink 3, **hidden when the day has one row** (it would repeat the row). Rows sit in one `surface` panel per day (22px radius, `shadow-panel`). Each day carries the id `day-YYYY-MM-DD` so a skyline column can scroll to it.
4. **Expense row** (62px, one button, 12px 16px padding): 36px tile; text column with the note (Body 500, Ink, one line) over a Caption line in Ink 3 (category name, then tags as "#friends"); amount right in Amount mono Ink, with the original-currency amount beneath in Amount small Ink 3 when foreign. Inset hairline between rows starting at the text column (left 64px). Hover: `surface2`. Press: scale 0.97 on the row. On touch, swiping a row left slides it over an `up` slot with a drawn bin icon in `surface`; released past 96px it moves to the bin and the receipt offers Undo.
5. Bottom padding clears the dock: `pb-40` (160px) on phones, 16px at `lg`, where the dock is sticky.

### Stats
1. **Header**, on the ground: "Stats" in Display, the period control, the hero numeral in Ink 28px below, the delta with "vs Sept by today" in Ink 2, and the chart.
2. Segmented control, 16px below the title: a `track` well, full radius, 40px tall (44px hit), four options; the selected thumb is `surface` (`line2` in dark) with `shadow-thumb` and Ink text, the rest Ink 2, sliding between options (translate, 260ms). Custom dates sit below it with Label labels.
3. **Spend chart**, 112px tall, full column width, drawn in SVG from `/api/stats` buckets (day up to 62 days, then week, then month) as cumulative steps: flat between spends, a day bucket rises straight up at its day, a week or month bucket rises across its span.
   - This period: a 2.5px Cobalt line, round joins, with an area fill below it from Cobalt at 18% to 0 at the baseline.
   - Previous period (`span().full`): a 1.5px Ink 3 line, dashed 4 4, across its whole length; it ends with its total as a mono 11px Ink 3 label at the right edge ("Sep £1,840").
   - Baseline: 1px `line2`.
   - Today marker (only while the period is in progress): a 1px `line2` rule from top to baseline at today's x, and an 11px Cobalt dot with a 3px Ground ring at the end of this period's line.
   - X axis: first and last day of the period as mono 11px Ink 3 labels under the baseline. No y axis, no gridlines.
   - Scale: x by day index over the longer of the two periods; y over the larger of this period's total and the previous period's full total, so neither line clips and an empty previous period does not pin anything to zero.
   - Accessible name on the SVG states both totals, as now.
   - Scrub: hover or drag along the chart (touch-action pan-y, so vertical scroll still works) to drop an Ink 3 rule at that day with a ringed Cobalt dot on this period's line and a small Ink 3 dot on the ghost. While scrubbing, the delta row reads "10 Oct · £52.00  vs Sept £25.00" instead; it returns on release.
4. **By category** (Title, 28px above): one `surface` panel of rows. Row: 36px tile; name (Body 500) and amount (Amount) on line 1, with the delta in mono 12px `up`/`down` beside the amount; line 2 is the share track (6px, `track`, filled in category colour to the category's share of the period total) with the share as mono 12px Ink 3 ("34%") at its right. Categories with no spend last period show no delta; under the panel one Caption line lists them once: "New since Sep: 🎁 Gifts, ✈️ Travel". Drill-down expands inside the panel: child rows 48px, 28px tiles, indented to the text column.
5. **By tag**: same panel and row, a `track` tile with a drawn hash icon, no share track.

### Settings and secondary screens
Same grammar as Home: Title section heads ("Currencies", "Theme", "Household", "More", "API tokens"), each over one Level 1 panel of 62px rows. A row leads with a 36px `track` tile holding a drawn icon (or the member's initial on `accent-soft`), ends with a drawn chevron when it navigates, and destructive or secondary actions are Label text buttons. Settings save as they change; there is no Save button outside onboarding. Theme is the shared segmented control. Sign out is its own panel, `up` text. Recurring, Bin and Chats lists use the same panels and category tiles.

## Elevation & Depth

Three levels.
- **Level 0, Ground** (`bg`): the page, and every headline figure.
- **Level 1, Panel** (`surface`, `shadow-panel`): day groups, category lists, inputs. Light: soft offset shadow. Dark: no shadow, a faint top inner highlight; separation comes from Surface being lighter than Ground.
- **Level 2, Floating** (`glass` + `shadow-dock`, or `surface` + `shadow-lift`): the dock, suggestion chips, the answer card. Only things the user is talking to float.

All shadows are tokens with dark twins and carry a y-offset and blur; no zero-offset halos except the 3px focus ring.

## Shapes

Radii grow with size: parsed tokens 4px, small tiles 9px, tiles 11px, fields and buttons 14px, panels 22px, cards 24px, dock 26px, chips and pills and segments fully round. Data marks: skyline columns 3px apart with 2.5px-radius segments 1px apart, legend squares 8px at 2px radius, share tracks 6px, chart line 2.5px. Chrome icons are drawn on a 24px grid, round caps and joins, 1.6px stroke at 20px and up, 2px at 18px and below.

## Components

### Category tile
`<Tile category={c} />` in `web/category.tsx`. 36px square, 11px radius, emoji at 19px on the category colour mixed 16% into Surface (24% in dark). `small` gives 28px, 9px radius, 15px emoji, for chips, drill-down children and receipts. A builtin category (Uncategorised) renders a drawn dashed circle in Ink 3 on a neutral tile instead of its emoji. Stats slices lack `builtin`; look it up from `useCategories()` by id.

### Hero numeral
`<Total amount currency unit className />` in `web/period.tsx`. Ink on the ground. Counts up over 700ms on exponential ease-out: from 0 the first time per session, from the previous value after that (month step, preset change, add). Reduced motion: no count. The final value is in an `sr-only` span; the animated digits are `aria-hidden`.

### Delta
`<Pill d />` in `web/components/total.tsx`: mono, no fill, `up` or `down` text with a 12px drawn arrow (rotated for down), or Ink 3 with no arrow when flat. The comparison text after it is Ink 2.

### Day skyline (signature)
In `web/features/expenses/summary.tsx`, under the Home delta. A 112px grid, one column per day of the month, 3px gap, bottom-aligned.
- **Past day with spend**: a button whose height is its total relative to the month's biggest day, stacked from category-colour segments (1px gap, 2.5px radius, 2px minimum), biggest category of the month at the bottom, uncategorised in Ink 3. Its name is "Mon 6 Oct, £42.10: Food £30.00, Home £12.10". Tapping it scrolls smoothly to that day's group in the list. Press scale applies. Hover, touch or focus dims the other bars to 35% (ticks and dots stay) and swaps the delta row for "Mon 6 Oct · £42.10" then the day's categories (emoji and name for one, emoji and mono amount each for several) in Ink 3.
- **Past day with no spend**: a 2px `line2` tick on the baseline.
- **Past day with only unconverted spend** (no rate yet): the same tick in `amber`.
- **Future day**: a centred 3px `line2` dot.
- **Today**: outlined 1.5px in Ink, offset 2px, whichever of the above it is.
- **Axis**: mono 11px Ink 3, "1" at the left and the last day number at the right, 8px below.
- **Legend**: see Home row 4. It carries the accessible "By category" name for the split.
- **Motion**: columns lift from the bottom (`animate-lift`), staggered 15ms per day.

### Masthead
`<Masthead title>` in `web/components/masthead.tsx`, for sign-in and onboarding, on the ground: a 48px `accent` app tile (14px radius) holding an `on-accent` ring, then 28px below a row of 31 3px `line2` dots spread across the column (an empty skyline), the title in Display Ink, and a subtitle in Ink 2.

### Expense form header
`web/features/expenses/form/form-header.tsx`, on the ground. Top row: Cancel as a 36px `surface2` pill, the title at 17px 600, the submit as a 36px `accent` pill with `on-accent` text. Then the amount at 60px, 600, Ink, with the currency symbol in Ink 3 and the placeholder in Ink 3 at 50%; unit and currency chips are `surface2` pills in mono 13px with an Ink 3 drawn chevron. The note input is a 48px `surface2` well at 17px 500; on focus it turns `surface` with a 2px Cobalt ring. Errors are Label in `up`.

### Dock (signature)
One frosted surface holding the bar and the tabs, floating 8px from the screen sides and 8px above the home indicator (`bottom: max(env(safe-area-inset-bottom), 8px)`), inside the 448px column, `glass` utility (blur 24px, saturate 1.8, `glass-line` border), `rounded-dock`, `shadow-dock`, 8px padding. Total height about 116px plus the safe area. No gradient fade behind it.
- **Bar row**: the input well is `surface2`, `rounded-field`, 48px; on focus or text it turns `surface` with an `accent` border and `shadow-bar-active`. Input 17px 500. Parsed tokens, ghost completion, the leading "?" and Chat's locked ask mode are unchanged. Empty: a 40px round Ink 3 plus for the full form and the `/` hint on fine pointers. With text: the primary button (40px, round, Cobalt, drawn return icon) reads Add, Ask or Full form.
- **Tabs row**: four tabs, 52px tall, a 22px drawn icon over an 11px 600 label. Current tab: icon in Cobalt, label in Ink. Others: Ink 3. Icons are redrawn: Expenses is a receipt (not a list), Stats is a rising line, Categories is the 2x2 tile grid, Settings is two sliders (not a sun).
- **At `lg`**: the dock holds only the bar, and it is sticky: it follows the last row on a short page and pins 24px from the bottom on a long one, with chips and the answer card rising over the content; tabs live in the left rail (current tab on `surface2`, rows `rounded-field`).
- **Hint line and receipt** sit under the bar inside the dock, Caption, 6px above the tabs. Receipt: small tile, "Added coffee · £3.20" in Ink 2 with mono amount, Undo in Cobalt on the right. Behaviour unchanged.
- **Chips** float above the dock as separate glass pills (`glass`, full radius, 32px, Label), rising in. Category chip leads with a small tile.
- **Answer card** rises above the dock: `surface`, `rounded-card`, `shadow-lift`, up to 55% of the viewport; the page behind dims to Ground at 70%.

### Buttons
- **Primary** (`primary` utility): 44px, Cobalt fill, 15px 600, `rounded-field`, press scale. One per view.
- **Quiet** (`quiet` utility): 44px, `surface2` fill, no border, press scale.
- **Month stepper**: 36px round, no fill, drawn icon in Ink 2, `surface2` on hover, 44px hit, press scale; disabled at 30%.
- **Text actions**: Label, no fill; Ink 2 to dismiss, Cobalt to go on, `up` to destroy.
- **Inline confirm** and no browser dialogs: unchanged.
- **Focus**: 2px Cobalt outline, 2px offset.

### Inputs
`input` utility: 44px, Surface, Strong hairline border, `rounded-field`, focus Cobalt border plus 3px Cobalt Wash ring. Labels above in Label Ink 2. Native appearance is off; a select carries a drawn Ink 3 chevron (`--chevron`, twinned per theme). Category colour is picked from the eight palette swatches, with one custom swatch.

## Motion

One curve, `--ease-out` = `cubic-bezier(0.16, 1, 0.3, 1)`. Durations 90 to 900ms by distance travelled. Every item below is off under `prefers-reduced-motion` (a global guard in `index.css` collapses animations and transitions to 1ms and cancels press scale; `Total` skips counting).
- **Rise** (`.rise`): new floating content (answer card, chips, receipt, inline confirm) enters 12px low and transparent, 420ms, via `@starting-style`.
- **Press** (`press` utility, built into `primary` and `quiet`): scale 0.97 on `:active` in 90ms, back in 220ms. Rows, month steppers, skyline columns, tabs, chips, segments.
- **Count-up**: the hero numeral, 700ms.
- **Lift** (`animate-lift` with `origin-bottom`): skyline columns grow up from the baseline, 640ms, staggered 15ms per day through `animation-delay`.
- **Grow in** (`.grow-in` on a row's wrapper): a newly added row opens its height from 0 and fades in, 420ms, so the list makes room instead of jumping.
- **Draw** (`draw` utility on an SVG path with `pathLength="1"`): the chart lines draw left to right in 900ms; the area fill uses `animate-fade` with a 200ms delay; the today dot uses `animate-fade` after the line.
- **Fill** (`animate-fill` with `origin-left`): share tracks grow from the left, 640ms, staggered 30ms per row through `animation-delay`.
- **Segment slide**: the segmented thumb translates between options, 260ms.
- **Navigate**: tab links cross-fade the page in 200ms; the month steppers slide it 24px the way they go (out 200ms, in 320ms). Both are view transitions; the dock has its own `view-transition-name` and stays put. Filters and Stats ranges change in place, without a transition.

No page-load choreography beyond these, no scroll-triggered effects, no parallax.

## Do's and Don'ts

### Do
- **Do** open Home and Stats on the ground with the 60px numeral in Ink; let context follow it.
- **Do** tell the Home month as the Day skyline: one column per day, stacked in category colour, tappable to its day.
- **Do** set every non-hero amount, delta, share and axis label in Geist Mono (`num`).
- **Do** give every category row a tinted tile; use the eight-hue palette for defaults and swatches.
- **Do** group rows in Level 1 panels with inset hairlines.
- **Do** draw the cumulative spend line with the previous period as a ghost, and a today marker while the period runs.
- **Do** hide a day's total when the day has one row.
- **Do** show "new" once, as one line under the category panel.
- **Do** keep the bar, its parsing, ghost, chips, receipt and undo exactly as they behave now.
- **Do** reference tokens, never raw hex, so the dark twin follows.

### Don't
- **Don't** add donuts or pies. Bars, lines, tracks and the skyline are the chart vocabulary.
- **Don't** add a floating action button or a multi-field form as the way in.
- **Don't** put the headline figure on a coloured field or card, or fill the delta as a pill.
- **Don't** use Cobalt for decoration or as a background behind content.
- **Don't** colour text, buttons or backgrounds with category colours beyond tiles, the skyline and its legend, and tracks.
- **Don't** put an eyebrow label above a heading or the numeral, or use uppercase labels.
- **Don't** use Unicode glyphs as icons (arrows, hashes, chevrons); draw them. Emoji are category content, not icons.
- **Don't** use gradient text, glass anywhere but the dock and chips, or zero-offset glows.
- **Don't** animate without a job, or skip the reduced-motion guard.
