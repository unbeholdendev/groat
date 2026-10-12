---
name: Expenses
description: A calm, self-hosted expense tracker built around one line at thumb reach.
colors:
  ground: "#fafaf9"
  surface: "#ffffff"
  ink: "#1b1c1f"
  ink-2: "#55575e"
  ink-3: "#6e7078"
  hairline: "#e9e8e4"
  hairline-strong: "#dedcd7"
  track: "#f0efeb"
  accent: "#3b5bdb"
  accent-soft: "#eef1fc"
  on-accent: "#ffffff"
  amber: "#a35a00"
  amber-line: "#e7cfae"
  up: "#b4372c"
  down: "#2f7d4f"
  ground-dark: "#121214"
  surface-dark: "#1b1b1f"
  ink-dark: "#ececee"
  ink-2-dark: "#a9aab1"
  ink-3-dark: "#8b8c93"
  hairline-dark: "#26262b"
  hairline-strong-dark: "#34343a"
  track-dark: "#232328"
  accent-dark: "#7b93f2"
  accent-soft-dark: "#1e2442"
  on-accent-dark: "#0e1330"
  amber-dark: "#e0a050"
  amber-line-dark: "#4a3820"
  up-dark: "#ef8a7e"
  down-dark: "#6cc495"
typography:
  display:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    letterSpacing: "-0.025em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 500
    lineHeight: 1.375
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.375
    fontFeature: "tnum"
  body-sm:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
  label:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  caption:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  tab:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
rounded:
  token: "3px"
  sm: "4px"
  chip: "7px"
  md: "8px"
  bar: "12px"
  card: "14px"
  full: "9999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "10px"
  gutter: "20px"
  group: "22px"
  column: "448px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-quiet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  button-text:
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "6px 10px"
  button-confirm:
    textColor: "{colors.amber}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "4px 10px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "3px 8px"
  one-line-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.bar}"
    padding: "5px 5px 5px 14px"
    height: "50px"
  token-amount:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.token}"
  token-tag:
    backgroundColor: "{colors.track}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.token}"
  answer-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.card}"
    padding: "14px 16px 8px"
  segmented:
    backgroundColor: "{colors.track}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "32px"
  segmented-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.chip}"
  tab-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-3}"
    typography: "{typography.tab}"
  tab-bar-current:
    textColor: "{colors.ink}"
  expense-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "10px 0"
---

# Design System: Expenses

## Overview

**Creative North Star: "The Quiet Ledger"**

A ledger on warm off-white paper, ruled in hairlines, with one blue pen. Everything at rest is ink and paper; the blue appears only where the user is writing or about to commit. Numbers lead every row and are set in tabular figures so columns of money line up without a table.

Density is phone-first and calm: one centred column, rows separated by hairlines rather than boxes, and a single docked bar at thumb reach that does the work of a form. Chrome stays small and grey so the user's own content (their notes, amounts and chosen emoji) carries the colour. Dark theme is the same ledger with the lamps down: every token has a lifted dark twin, nothing is restyled.

Statistics are measured, not charted. Spend is a ruler against last period, categories are short share tracks, and the only multi-colour mark on the home screen is a 3px split line.

**Key Characteristics:**
- Warm off-white ground, white surfaces, near-black ink, hairline rules.
- One blue accent, reserved for live input, parsed tokens, primary actions and the ruler fill.
- Category colour only as dots, the 3px split and share tracks.
- Geist Variable throughout, tabular numerals everywhere.
- User emoji for categories; drawn stroke icons for chrome.
- Flat at rest; soft shadow only on the docked bar and the floating answer.
- One authored motion: things rise into place.

## Colors

Near-neutral warm greys with one cool blue and three semantic tones; every token has a dark twin under `.dark`.

### Primary
- **Ledger Blue** (accent): the live bar's border and caret, the parsed amount, the leading "?" in ask mode, primary buttons, active filter state, accent text actions ("Continue in chat") and the ruler fill on Stats. Focus outlines use it too.
- **Blue Wash** (accent-soft): the 3px focus halo around the active bar and inputs, the parsed amount's pill, text selection.
- **On Blue** (on-accent): text on primary buttons.

### Tertiary
- **Ledger Amber** (amber, amber-line): pending recurring expenses only. A 7px amber dot, an amber-outlined Confirm button, and the "no rate" warning.
- **Over Red** (up): spending up versus the previous period, and destructive or error text.
- **Under Green** (down): spending down versus the previous period.

### Neutral
- **Warm Paper** (ground): page background, PWA theme and the fade behind the docked bar.
- **Sheet White** (surface): bar, answer card, chips, inputs, tab bar, selected segment.
- **Ledger Ink** (ink): primary text and amounts; the "by now" tick on the ruler.
- **Second Ink** (ink-2): day labels, field labels, secondary actions.
- **Third Ink** (ink-3): placeholders, captions, day totals, inactive tabs, legend names, the elapsed-days bar.
- **Hairline** (hairline): row dividers, tab bar top rule, answer footer rule.
- **Strong Hairline** (hairline-strong): borders of inputs, chips, quiet buttons, the resting bar and the answer card.
- **Track** (track): empty part of the ruler and share tracks, segmented control well, tag token pill.

### Named Rules
**The One Pen Rule.** The accent marks what is live or what commits: the active bar, parsed tokens, primary actions, focus, and the ruler fill. Never use it for decoration, headings or category data.

**The Category Colour Rule.** User category colours appear only as small dots (6 to 7px), the 3px split line and 4px share tracks. Never fill text, backgrounds or buttons with them.

**The Twin Token Rule.** Every colour is a CSS variable with a light value on `:root` and a dark value on `.dark`. Components reference tokens, never raw hex, so the dark theme needs no component changes.

## Typography

**Display Font:** Geist Variable (with system-ui, sans-serif), self-hosted
**Body Font:** Geist Variable (with system-ui, sans-serif)

**Character:** One neutral grotesk in four weights of attention. Hierarchy comes from size and ink tone, not from a second family.

### Hierarchy
- **Display** (600, 28px, tight tracking): the period total only. Pence drop to 17px medium in Third Ink so pounds read first.
- **Headline** (600, 22px, tight tracking): page titles (Expenses, Stats, Categories, Settings, Chats).
- **Title** (500, 17px, -0.01em): the one-line bar input and the AI answer text.
- **Body** (400, 15px, 1.375): rows, notes, amounts. Set on `body` with tabular numerals and antialiasing.
- **Body small** (500, 14px): button text and secondary lines.
- **Label** (500, 13px): day headers, field labels, chips, text buttons, deltas.
- **Caption** (400, 12px): legends, ruler labels, hints under the bar.
- **Tab** (500, 11px): tab bar labels under 21px icons.

### Named Rules
**The Tabular Rule.** All numerals are tabular (`tnum` on body). Money must align down a column without a table.

**The Sentence Case Rule.** Labels and headers are sentence case at normal tracking. No uppercase labels.

## Layout

A single column, 448px max, centred, with 20px side gutters, on phone and desktop alike. No breakpoints: desktop shows the same column in the middle of the ground. Top padding respects the safe area (at least 20px).

The bottom is a fixed dock: the one-line bar sits above a four-tab bar (Expenses, Stats, Categories, Settings), both inside the same 448px column, with the tab bar padded for the home indicator. Content keeps 192px bottom padding so the last row clears the dock. A gradient from transparent to Warm Paper over 26px sits behind the bar so rows fade under it.

Rhythm: rows are 10px top and bottom with 10px gaps; day groups open with 22px above and 6px below their header; small clusters use 6px or 8px gaps. Rows are a three-column grid (24px emoji, flexible note, auto amount) aligned on the baseline.

## Elevation & Depth

Flat at rest. Hierarchy comes from Sheet White on Warm Paper and hairlines, not shadow. Two things float, and they are the two things the user is talking to: the docked bar and the answer card. Shadows are soft, negative-spread and tinted with ink, never offset.

### Shadow Vocabulary
- **Bar rest** (`box-shadow: 0 6px 18px -10px rgb(27 28 31 / 0.22)`): the docked bar when idle.
- **Bar active** (`box-shadow: 0 0 0 3px var(--accent-soft), 0 6px 18px -8px rgb(27 28 31 / 0.18)`): the bar while focused or holding text; pairs with an accent border.
- **Answer lift** (`box-shadow: 0 12px 32px -14px rgb(27 28 31 / 0.28)`): the AI answer card above the bar.
- **Segment thumb** (`box-shadow: 0 1px 2px rgb(27 28 31 / 0.12)`): the selected period in the segmented control.

### Named Rules
**The Two Floaters Rule.** Only the bar and the answer card float. Lists, rows and forms stay flat on the ground.

## Shapes

Gently rounded, small radii that grow with the size of the object: 3px for parsed tokens, 4px for tracks and the split, 7px for chips, text buttons and segments, 8px for inputs and buttons, 12px for the bar, 14px for the answer card, full circles for dots. Borders are 1px hairlines. Data marks are thin: the split is 3px, share tracks 4px, the ruler 8px with a 2px by 16px tick.

Chrome icons are drawn on a 24px grid with round caps and joins: 1.6px stroke at 21px (tabs, the recurring mark), 2px stroke at 18px and below so small icons hold their weight. Categories use the user's own emoji, never drawn icons.

## Components

### Buttons
Quiet and compact; one blue button per view at most.
- **Shape:** gently rounded (8px), 40px tall.
- **Primary:** Ledger Blue fill, On Blue text, 14px medium, 16px side padding. Disabled at 50% opacity. In the bar it shrinks to 38px tall and carries a small return-key hint.
- **Quiet:** Sheet White with a Strong Hairline border, ink text. Drops to 32px and 13px inside rows.
- **Text actions:** 13px medium, no border, 7px radius; Second Ink for dismiss, Ledger Blue for go-on, Over Red for destructive.
- **Confirm (pending):** amber text with an amber-line border, 7px radius.
- **Focus:** 2px Ledger Blue outline, 2px offset, everywhere.

### Chips
- **Style:** Sheet White, Strong Hairline border, 7px radius, 13px medium ink, optional 6px category dot and emoji, trailing 10px chevron. A transparent native select or date input sits on top.
- **State:** appear only while typing in the bar, rising in above it, separated by faint middle dots. "from past notes" in caption marks an inferred category.

### Inputs / Fields
- **Style:** 40px, Sheet White, 1px Strong Hairline, 8px radius, 15px ink, Third Ink placeholder. Labels sit above in 13px medium Second Ink with a 6px gap.
- **Focus:** border turns Ledger Blue with a 3px Blue Wash ring.

### Navigation
Four-tab bar on Sheet White under a Hairline top rule. Each tab is a 21px drawn icon over an 11px medium label; current tab in ink, others in Third Ink. No pill, no underline, no accent.

### One-line Bar (signature)
The app's single entry point. Sheet White, 12px radius, 50px minimum, Strong Hairline border with the Bar rest shadow. On focus or text it gains an accent border and Bar active shadow. Input is 17px medium. A mirrored layer colours the text as it is parsed: the amount in a Blue Wash pill with blue text, tags in a Track pill with Second Ink, both 3px radius. A leading "?" turns blue and switches to ask mode. Empty, it shows a Third Ink plus that opens the full form.

### Answer Card
Rises above the bar in ask mode. Sheet White, 14px radius, Strong Hairline border, Answer lift shadow, up to 55% of the viewport. Text in Title style. Footer actions are right-aligned text actions above a Hairline. The page behind dims under Warm Paper at 75%.

### Ruler (Stats)
An 8px Track bar filled with Ledger Blue to this period's total, an ink tick at last period's same-day total with its label above, and so-far and last-total labels below in caption with 13px ink values. A 4px Third Ink bar shows days elapsed. Category rows follow: emoji, name, amount, delta in Over Red or Under Green, and a 4px share track in the category colour.

### Expense Rows and Day Groups
Day header in 13px medium: day name in Second Ink, day total in Third Ink. Rows on Hairline dividers: emoji, note in medium ink with tags in Third Ink, amount right-aligned; foreign amounts show the base amount beneath in caption. Pending recurring rows lead with a 7px amber dot.

### Motion
One authored motion, Rise: new content (answer card, chip row) enters 10px low and transparent and settles over 360ms on `cubic-bezier(0.16, 1, 0.3, 1)` via `@starting-style`. Off under reduced motion. Nothing else animates.

## Do's and Don'ts

### Do:
- **Do** reference colour through tokens (`--accent`, `--ink2`, `--line`) so dark theme follows for free.
- **Do** keep the accent to live input, parsed tokens, primary actions, focus and the ruler fill.
- **Do** show category colour only as 6 to 7px dots, the 3px split and 4px share tracks.
- **Do** separate rows with 1px hairlines and keep them flat on the ground.
- **Do** use the user's emoji for categories and 24px-grid stroke icons (1.6px, round caps) for chrome.
- **Do** use Rise for anything that appears in response to the bar, and switch it off for reduced motion.
- **Do** keep every surface inside the centred 448px column with 20px gutters.

### Don't:
- **Don't** add charts (donuts, pies, bar charts) to Stats; measure with the ruler and share tracks.
- **Don't** add a floating action button or a multi-field add form as the primary way in; the bar is the way in.
- **Don't** add shadows to lists, rows or forms; only the bar and the answer card float.
- **Don't** use uppercase or letter-spaced labels, or small labels above headings.
- **Don't** use text glyphs as icons; draw them.
- **Don't** introduce a second typeface or a second accent hue.
