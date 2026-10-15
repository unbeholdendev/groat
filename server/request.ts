import type { Context } from "hono";
import type { z } from "zod";

export function valid<T extends z.ZodType>(schema: T, input: unknown): { data: z.output<T> } | { error: string } {
  const parsed = schema.safeParse(input, { error: (issue) => `invalid ${String(issue.path?.[0] ?? "request")}` });
  return parsed.success ? { data: parsed.data } : { error: parsed.error.issues[0].message };
}

export const json = (c: Context) => c.req.json<unknown>().catch(() => undefined);

export const body = async <T extends z.ZodType>(c: Context, schema: T) => valid(schema, await json(c));

export const query = <T extends z.ZodType>(c: Context, schema: T) => valid(schema, c.req.query());
