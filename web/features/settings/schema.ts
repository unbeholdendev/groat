import { z } from "zod";
import { password } from "../auth/schema";

export const newPassword = z.object({ password });
export const tokenName = z.object({ name: z.string().trim().min(1, "Enter a name") });
