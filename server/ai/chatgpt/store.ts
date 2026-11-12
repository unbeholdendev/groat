import { Database } from "bun:sqlite";

export function privateStore(store = new Database(":memory:")) {
  store.run("PRAGMA secure_delete = ON");
  store.run("CREATE TABLE IF NOT EXISTS private (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const read = <T>(key: string) => {
    const row = store.query<{ value: string }, [string]>("SELECT value FROM private WHERE key = ?").get(key);
    return row ? (JSON.parse(row.value) as T) : undefined;
  };
  const put = (key: string, value: unknown) =>
    store.run("INSERT OR REPLACE INTO private VALUES (?, ?)", [key, JSON.stringify(value)]);
  const remove = (key: string) => store.run("DELETE FROM private WHERE key = ?", [key]);
  const adopt = (preferred: number[]) => {
    if (read("instance")) return;
    const user = preferred.find((u) => read(`user:${u}`));
    if (user !== undefined) {
      put("instance", read(`user:${user}`));
      const registration = read(`registration:${user}`);
      if (registration) put("registration", registration);
    }
    store.run("DELETE FROM private WHERE key LIKE 'user:%' OR key LIKE 'registration:%' OR key LIKE 'pending:%'");
  };
  const clear = () => store.run("DELETE FROM private");
  return { read, put, remove, adopt, clear };
}
