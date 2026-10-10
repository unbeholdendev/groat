import { Database } from "bun:sqlite";

const bytes = await Bun.stdin.bytes();
// A WAL database image says so in bytes 18-19; an in-memory copy cannot open WAL, so mark it rollback-journal.
bytes.fill(1, 18, 20);
const db = Database.deserialize(bytes, true);
const limit = Number(process.argv[3]);
try {
  const rows = [];
  for (const row of db.query(process.argv[2]).iterate()) if (rows.push(row) > limit) break;
  console.log(JSON.stringify({ rows: rows.slice(0, limit), truncated: rows.length > limit }));
} catch (e) {
  console.log(JSON.stringify({ error: String(e) }));
}
