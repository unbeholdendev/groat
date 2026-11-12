import type { Database } from "bun:sqlite";
import type { MiddlewareHandler } from "hono";
import type { ChatGpt } from "./ai/chatgpt/account";
import type { Ai } from "./ai/models";
import type { Db } from "./db";
import type { Valuer } from "./rates/valuer";

export type Deps = {
  db: Database;
  credentials?: Database;
  clock: () => Date;
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
};

export type Ctx = Omit<Deps, "db"> & {
  db: Db;
  ai: Ai;
  chatgpt: ChatGpt;
  value: Valuer;
  publishChanges: MiddlewareHandler;
  broadcast: (message: object) => void;
};

export const today = (clock: () => Date) => clock().toISOString().slice(0, 10);
