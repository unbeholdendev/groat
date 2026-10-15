import type { Context } from "hono";

export const json = (c: Context) => c.req.json().catch(() => ({}));

export const filled = (...values: unknown[]) => values.every((v) => typeof v === "string" && v.trim());
