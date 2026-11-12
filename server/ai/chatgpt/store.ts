import { Database } from "bun:sqlite";
import type { z } from "zod";

export function privateStore(store = new Database(":memory:")) {
  store.run("PRAGMA secure_delete = ON");
  store.run("CREATE TABLE IF NOT EXISTS private (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const raw = (key: string) =>
    store.query<{ value: string }, [string]>("SELECT value FROM private WHERE key = ?").get(key)?.value;
  const write = (key: string, value: string) => store.run("INSERT OR REPLACE INTO private VALUES (?, ?)", [key, value]);
  const parse = (value: string): unknown => {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  };
  const read = <T extends z.ZodType>(key: string, schema: T): z.output<T> | undefined => {
    const value = raw(key);
    const parsed = value === undefined ? undefined : schema.safeParse(parse(value));
    return parsed?.success ? parsed.data : undefined;
  };
  const put = (key: string, value: unknown) => write(key, JSON.stringify(value));
  const remove = (key: string) => store.run("DELETE FROM private WHERE key = ?", [key]);
  const adopt = (preferred: number[]) => {
    if (raw("instance") !== undefined) return;
    for (const user of preferred) {
      const saved = raw(`user:${user}`);
      if (saved === undefined) continue;
      write("instance", saved);
      const registration = raw(`registration:${user}`);
      if (registration !== undefined) write("registration", registration);
      break;
    }
    store.run("DELETE FROM private WHERE key LIKE 'user:%' OR key LIKE 'registration:%' OR key LIKE 'pending:%'");
  };
  const clear = () => store.run("DELETE FROM private");
  return { read, put, remove, adopt, clear };
}
