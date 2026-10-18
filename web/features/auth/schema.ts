import { z } from "zod";

export const password = z.string().min(1, "Enter a password");
export const credentials = z.object({ username: z.string().trim().min(1, "Enter a username"), password });
