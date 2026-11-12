import { z } from "zod";

export const chatMessage = z.looseObject({
  role: z.string(),
  content: z.string().nullish(),
  tool_calls: z
    .array(z.looseObject({ id: z.string(), function: z.looseObject({ name: z.string(), arguments: z.string() }) }))
    .optional(),
  tool_call_id: z.string().optional(),
});
export type Message = z.infer<typeof chatMessage>;
