---
name: Groat
description: A bold, self-hosted expense tracker built around one line at thumb reach.
colors:
  ground: "#e3e8dd"
  surface: "#f4f6ef"
  surface-2: "#e9ede3"
  ink: "#13261e"
  ink-2: "#3e5148"
  ink-3: "#53655c"
  hairline: "#d3dbcd"
  hairline-strong: "#b8c5b5"
  track: "#d3dbcd"
  accent: "#1d5a43"
  accent-soft: "#cddfce"
  on-accent: "#f2f6ee"
  amber: "#8f5300"
  amber-line: "#efca9f"
  amber-soft: "#fdf0de"
  up: "#a3262a"
  down: "#1d5a43"
  glass: "rgb(244 246 239 / 0.94)"
  ground-dark: "#101c17"
  surface-dark: "#1a2a22"
  surface-2-dark: "#24372c"
  ink-dark: "#edf2e5"
  ink-2-dark: "#c3d1c3"
  ink-3-dark: "#a1b5a5"
  hairline-dark: "#304638"
  hairline-strong-dark: "#486350"
  track-dark: "#2a4032"
  accent-dark: "#a6d6b2"
  accent-soft-dark: "#2e4c3b"
  on-accent-dark: "#10271b"
  amber-dark: "#eca851"
  amber-line-dark: "#573c1c"
  amber-soft-dark: "#2e2214"
  up-dark: "#fc7a79"
  down-dark: "#59d38c"
  glass-dark: "rgb(26 42 34 / 0.94)"
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
    fontFamily: "Libre Caslon Text, Georgia, serif"
    fontSize: "60px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  hero-long:
    fontFamily: "Libre Caslon Text, Georgia, serif"
    fontSize: "44px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
  display:
    fontFamily: "Cinzel, Georgia, serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.06em"
  title:
    fontFamily: "Cinzel, Georgia, serif"
    fontSize: "13px"
    fontWeight: 600
    letterSpacing: "0.1em"
  input:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 500
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.375
  label:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  caption:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  tab:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
  amount:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  amount-sm:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    fontFeature: "tnum"
rounded:
  token: "4px"
  tile-sm: "9px"
  tile: "11px"
  field: "6px"
  panel: "4px"
  card: "8px"
  dock: "8px"
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
    rounded: "{rounded.chip}"
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
    backgroundColor: "{colors.surface}"
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

# Groat design system

## Overview

Banknote engraving, chosen for Groat's old-coin name without turning expense entry into a period prop. Green paper, Roman capitals and a serif total carry the identity. Body text stays plain and readable. Keep the one-line entry bar, daily skyline and existing interactions.

## Colors

Use the light and dark tokens in the front matter and `web/index.css`. Light mode has green paper `#e3e8dd`, paper panels `#f4f6ef` and green ink `#13261e`. Dark mode has forest ground `#101c17`, lifted panels `#1a2a22` and pale ink `#edf2e5`. Theme follows the system unless the user chooses one.

Accent green marks committing actions, active navigation, links, focus and this period's Stats line. Red and green indicate spending changes and errors. Text colours must pass 4.5:1 on their actual backgrounds.

Keep the existing category palette. Category colour appears in tinted emoji circles, skyline segments, legends and share tracks. It does not colour labels or buttons. Pass it through `--c` or the existing data-mark background.

## Typography

Self-host fonts through Fontsource. Cinzel 600 and 700 supplies Roman capitals for page titles, the month and section headings. Libre Caslon Text 700 supplies the Home and Stats total. Source Sans 3 supplies notes, controls and other amounts.

- Page titles: 34px, 700, 1.1 line height, 0.06em tracking.
- Month: the existing 15px label, Cinzel capitals.
- Section headings: 13px, 600, 0.1em tracking. Day headings: 12px.
- Main total: 60px, 700, line height 1, -0.02em tracking. Pence: half size at 65% opacity. Keep the existing 44px, 34px and 28px steps for long amounts.
- Body and row amounts: 15px. Entry bar: 17px. Labels: 13px. Captions: 12px. Tabs: 11px.

Use lining tabular figures on the body and `num` utility. Keep controls, user content and prose in sentence case. Do not uppercase transaction notes. Do not add eyebrow labels above headings or totals.

## Layout

One centred column, 448px maximum, with 20px gutters. On wide screens the navigation moves into the left rail and the category breakdown can sit to the right. The mobile dock stays at the bottom; the desktop entry bar remains sticky.

Home opens with month controls, the total, comparison, 112px daily skyline and category legend. Transactions share a paper panel with day headings and inset row dividers. Rows retain their 62px height, emoji circle, note, category and right-aligned amount. Day totals use 16px semibold Source Sans 3 in primary ink; row amounts use secondary ink. Hide a day total when it repeats the only row.

Stats keeps its period control, total, cumulative spending chart, previous-period comparison and category and tag lists. Preserve chart scrubbing, keyboard day selection and the accessible data table. Forms, settings, categories, recurring transactions and the bin use the same type and tokens.

## Elevation & Depth

Ground holds the main figures. Panels use the existing soft offset shadow in light mode and faint inner highlight in dark mode. Floating suggestions and answers retain their existing elevation. Keep decorative artwork behind content and outside hit testing.

## Shapes

Panels have 4px corners; fields and buttons 6px; cards and desktop dock 8px. Category tiles are plain tinted circles, 36px or 28px small. Pills, parsed tokens, steppers and segmented controls retain their existing shapes. Do not add double borders, dotted coin rims or background grain.

## Components

The total counts up through the existing reduced-motion-aware component. Keep the area behind totals and category readouts free of ornament.

The skyline remains one column per day, stacked in category colour. Keep future dots, empty ticks, today's outline, pointer and keyboard selection and scrolling to the selected day.

The entry bar keeps its parser, completion, category chips, receipt, undo, camera and voice actions. Rest and focus colours use the shared tokens. Primary actions and focus use accent green. Never change entry behaviour to serve the visual theme.

Keep the current motion curve and reduced-motion guard. Totals count up, chart lines draw, new rows open and controls press.

## Do's and Don'ts

- Keep amounts readable and aligned, including long BTC and fiat values.
- Use Roman capitals for headings and plain sans-serif text for the work.
- Keep category colours and user emoji intact.
- Check Home, Stats and forms at phone and desktop sizes in both themes.
- Do not add grain, double frames, dotted category rims or playful display fonts.
- Do not add decorative animation, pies, a floating add button or a replacement entry flow.
