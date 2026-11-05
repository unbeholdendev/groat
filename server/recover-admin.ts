import { Database } from "bun:sqlite";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

export async function recoverAdmin(db: Database, username: string, password: string) {
  if (!password) throw new Error("Password must not be empty");
  const user = db.query<{ id: number }, [string]>("SELECT id FROM users WHERE username = ? AND role = 'admin' AND deleted_at IS NULL").get(username);
  if (!user) throw new Error("Active admin not found");
  const hash = await Bun.password.hash(password);
  db.transaction(() => {
    db.run("UPDATE users SET password_hash = ? WHERE id = ?", [hash, user.id]);
    db.run("DELETE FROM sessions WHERE user_id = ?", [user.id]);
  })();
}

if (import.meta.main) {
  if (!process.stdin.isTTY || process.argv.length > 2) throw new Error("Run interactively without arguments");
  const input = createInterface({ input: process.stdin, output: process.stdout });
  const username = (await input.question("Admin username: ")).trim();
  input.close();
  const hidden = createInterface({ input: process.stdin, output: new Writable({ write(_chunk, _encoding, done) { done(); } }), terminal: true });
  try {
    process.stderr.write("New password (hidden): ");
    const password = await hidden.question("");
    process.stderr.write("\nRepeat password (hidden): ");
    if (password !== await hidden.question("")) throw new Error("Passwords do not match");
    const db = new Database(process.env.DB_PATH ?? "data.db", { readonly: false, create: false });
    try { await recoverAdmin(db, username, password); } finally { db.close(); }
    process.stderr.write("\nPassword reset. All admin sessions signed out.\n");
  } finally {
    hidden.close();
  }
}
