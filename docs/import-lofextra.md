# Moving from Lofextra

Settings → Backup and import → **Import from CSV** takes this app's own export format. To move from Lofextra, turn its SQLite database into that format with `sqlite3`, then import the file into a new, empty instance.

Lofextra stores amounts as floats in major units, BTC in BTC (sats input is divided by 10⁸), and `createdAt` as the purchase time in epoch milliseconds. The query rounds amounts back to exact decimals, and turns `createdAt` into a date in the time zone of the machine running it.

```sh
sqlite3 -readonly -header -csv lofextra.db > expenses.csv <<'SQL'
SELECT
  date(t.createdAt / 1000, 'unixepoch', 'localtime') AS date,
  t.title AS note,
  printf(CASE coalesce(t.currency, 'USD') WHEN 'BTC' THEN '%.8f' ELSE '%.2f' END, t.amount) AS amount,
  coalesce(t.currency, 'USD') AS currency,
  CASE WHEN c.deletedAt IS NULL THEN c.title END AS category
FROM transactions t
LEFT JOIN categories c ON c.id = t.categoryId
WHERE t.deletedAt IS NULL
ORDER BY t.createdAt;
SQL
```

Deleted transactions are left out. Transactions in a deleted category land in Uncategorised. Categories that don't exist yet are created; rename or merge them afterwards, since deleting a category can move its expenses to another.

Not carried over: recurring schedules (their past transactions are), base amounts (recomputed from rates), and which Lofextra account made each transaction (everything is attributed to the admin who imports). Currencies with three decimals, such as KWD, are rounded to two; change `'%.2f'` if you have any.

Check the preview before you confirm: the count and totals per currency should match Lofextra.
