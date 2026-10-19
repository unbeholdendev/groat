# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Installable PWA, used mostly on a phone; desktop browser also works.

## Users

Primarily the author, as a personal tool. It will be open-sourced and self-hostable, so anyone running their own instance is a user too. One instance serves one person (single settings row, no accounts).

## Jobs

Two jobs, equal weight:

1. **Log an expense in seconds**, usually on the phone right after paying.
2. **See where the money goes**: totals, trends and category breakdowns over a period, compared with the previous one.

## Capabilities

- Expenses: note, amount, currency, date, category, tags. Note autocomplete fills amount, currency and category from past entries.
- Multi-currency with a base currency. Every currency Frankfurter quotes, plus BTC, is offered, recently used first; no list to set up. Rates fetched automatically (Frankfurter for fiat, mempool.space for BTC); an expense without a rate stays out of totals until one is fetched.
- Bitcoin is first-class: amounts in BTC or sats, toggleable.
- Recurring expenses: every N days/weeks/months/years, optional end date, optional "confirm each" which creates pending expenses.
- Categories: two-level tree, user-chosen emoji and colour, reorderable; deleting one moves its expenses elsewhere.
- Tags: free-form, renamable, deletable.
- Filters (text, date range, category, currency, tag) and CSV export of the filtered list.
- Bin: deleted expenses can be restored or purged.
- Stats: presets (this month, last month, year to date), grouped by day/week/month, category breakdown with drill-down, change vs previous period.
- Optional AI chat: ask questions about spending (read-only SQL) and get drafted expenses to review and save.
- Onboarding sets the base currency. Theme: system, light or dark.

## Constraints

- Self-hosted, single Docker image, SQLite. No third-party UI kit; React + Tailwind.
- Nothing in the current UI is a brand commitment; it is evidence only.

## Brand commitments

- Familiar finance-app conventions, played straight, plus one signature: a one-line add ("ramen 24.50 #friends") at thumb reach that fills category from past notes; starting with "?" asks the AI.
- Craft bar: bold consumer fintech (Revolut, Monzo, Cash App) held to Linear's precision. Big confident numerals, committed colour, expressive charts and motion. Loud in a good way, never a toy.
