import { isNull } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { users } from "../schema";

export const credentials = z.object({ username: z.string().trim().min(1), password: z.string().min(1) });
export const active = isNull(users.deletedAt);
export const hashCost =
  Bun.env.NODE_ENV === "test" ? ({ algorithm: "argon2id", memoryCost: 8, timeCost: 1 } as const) : undefined;

export type Env = { Variables: { user: { id: number; role: string } } };

export const admin: MiddlewareHandler<Env> = async (c, next) => {
  if (c.get("user").role !== "admin") return c.json({ error: "Only admins can do that" }, 403);
  await next();
};
