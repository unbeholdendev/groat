import type { z } from "zod";
import type { period } from "../../lib/schemas";

export type Period = z.infer<typeof period>;
export type Slice = Period["categories"][number];
export const row = "flex w-full items-center gap-3 px-4 text-left hover:bg-surface2";
export const list = (id: number, [from, to]: [string, string]) => ({
  to: "/" as const,
  search: { category: String(id), from, to },
});
