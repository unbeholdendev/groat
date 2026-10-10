import type { Database } from "bun:sqlite";

const migrations = [
  `CREATE TABLE expenses (
    id INTEGER PRIMARY KEY,
    note TEXT NOT NULL,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `ALTER TABLE expenses ADD COLUMN deleted_at TEXT`,
  `CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    base_currency TEXT NOT NULL,
    currencies TEXT NOT NULL,
    theme TEXT NOT NULL,
    onboarded INTEGER NOT NULL
  ) STRICT;
  INSERT INTO settings VALUES (1, 'GBP', '["GBP"]', 'system', 0);
  CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    parent_id INTEGER REFERENCES categories(id),
    sort INTEGER NOT NULL
  ) STRICT;`,
  `CREATE TABLE rates (
    date TEXT NOT NULL,
    currency TEXT NOT NULL,
    rate REAL NOT NULL,
    source TEXT NOT NULL,
    PRIMARY KEY (date, currency)
  ) STRICT`,
  `ALTER TABLE categories ADD COLUMN builtin INTEGER NOT NULL DEFAULT 0;
  UPDATE categories SET builtin = 1 WHERE name = 'Uncategorised' AND parent_id IS NULL;
  INSERT INTO categories (name, icon, color, parent_id, sort, builtin)
    SELECT 'Uncategorised', '📦', '#71717a', NULL, 100, 1 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE builtin = 1);
  ALTER TABLE expenses ADD COLUMN category_id INTEGER REFERENCES categories(id);
  UPDATE expenses SET category_id = (SELECT id FROM categories WHERE builtin = 1);
  CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
  CREATE TABLE expense_tags (
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (expense_id, tag_id)
  ) STRICT;`,
  `CREATE TABLE recurring (
    id INTEGER PRIMARY KEY,
    note TEXT NOT NULL,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    tags TEXT NOT NULL,
    unit TEXT NOT NULL,
    every INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    needs_confirmation INTEGER NOT NULL,
    paused INTEGER NOT NULL DEFAULT 0,
    last_date TEXT,
    deleted_at TEXT
  ) STRICT;
  ALTER TABLE expenses ADD COLUMN recurring_id INTEGER REFERENCES recurring(id);
  ALTER TABLE expenses ADD COLUMN status TEXT NOT NULL DEFAULT 'normal';`,
  `CREATE TABLE chats (id INTEGER PRIMARY KEY, title TEXT NOT NULL) STRICT;
  CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY,
    chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    message TEXT NOT NULL
  ) STRICT;`,
  `ALTER TABLE recurring RENAME COLUMN unit TO period`,
];

export const visible = "deleted_at IS NULL";
export const countable = `${visible} AND status = 'normal'`;

export const today = (clock: () => Date) => clock().toISOString().slice(0, 10);

export const isDate = (s: unknown) =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(Date.parse(s) || 0).toISOString().slice(0, 10) === s;

export const uncategorised = (db: Database) => (db.query("SELECT id FROM categories WHERE builtin = 1").get() as { id: number }).id;

export function settings(db: Database) {
  const s = db.query("SELECT * FROM settings").get() as Record<string, string | number>;
  const currencies = JSON.parse(s.currencies as string) as string[];
  const last = db
    .query(`SELECT currency FROM expenses WHERE ${visible} AND recurring_id IS NULL ORDER BY id DESC LIMIT 1`)
    .get() as { currency: string } | null;
  return {
    baseCurrency: s.base_currency as string,
    currencies,
    lastCurrency: last && currencies.includes(last.currency) ? last.currency : (s.base_currency as string),
    theme: s.theme as string,
    onboarded: s.onboarded === 1,
  };
}

export function migrate(db: Database) {
  db.run("PRAGMA foreign_keys = ON");
  const { user_version } = db.query("PRAGMA user_version").get() as { user_version: number };
  db.transaction(() => {
    for (let i = user_version; i < migrations.length; i++) db.run(migrations[i]);
    db.run(`PRAGMA user_version = ${migrations.length}`);
  })();
}
