import { and, eq, isNull, lt } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Ctx } from "./app";
import { extract } from "./draft";
import { valid } from "./request";
import { attachments } from "./schema";

const maxSize = 5 * 1024 * 1024;
const photo = z.object({
  image: z.file().mime(["image/jpeg", "image/png", "image/webp"], "Send a JPEG, PNG or WebP image"),
});

export function attachmentRoutes(ctx: Ctx) {
  const { db, clock } = ctx;
  const app = new Hono();

  app.post(
    "/api/drafts/photo",
    bodyLimit({ maxSize, onError: (c) => c.json({ error: "That image is too large" }, 413) }),
    async (c) => {
      const off = await ctx.ai.unavailable("vision");
      if (off) return c.json({ error: off }, 403);
      const parsed = valid(photo, await c.req.parseBody().catch(() => undefined));
      if ("error" in parsed) return c.json(parsed, 400);
      const { image } = parsed.data;
      const bytes = Buffer.from(await image.arrayBuffer());
      const draft = await extract(ctx, { image: `data:${image.type};base64,${bytes.toString("base64")}` });
      const now = clock();
      db.delete(attachments)
        .where(
          and(
            isNull(attachments.transactionId),
            lt(attachments.createdAt, new Date(now.getTime() - 864e5).toISOString()),
          ),
        )
        .run();
      const { id } = db
        .insert(attachments)
        .values({ mime: image.type, bytes, createdAt: now.toISOString() })
        .returning({ id: attachments.id })
        .get();
      return c.json({ ...draft, attachmentId: id });
    },
  );

  app.get("/api/attachments/:id", (c) => {
    const row = db
      .select()
      .from(attachments)
      .where(eq(attachments.id, Number(c.req.param("id"))))
      .get();
    return row
      ? c.body(new Uint8Array(row.bytes), 200, { "content-type": row.mime })
      : c.json({ error: "Not found" }, 404);
  });

  app.onError((e, c) => c.json({ error: e.message }, 502));

  return app;
}
