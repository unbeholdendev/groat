import { z } from "zod";

export const categoryForm = z.object({
  name: z.string().trim().min(1, "Enter a name"),
  icon: z.string().trim().min(1, "Enter an emoji"),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a colour"),
  parentId: z.string().transform((id) => Number(id) || null),
});

export const tagForm = z.object({ name: z.string().trim().min(1, "Enter a name") });
