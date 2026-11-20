import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import webpush from "web-push";
import { z } from "zod";
import { active, type Env } from "./auth/access";
import type { Ctx } from "./context";
import { seeded } from "./db";
import { errorKind, log } from "./logging";
import { body } from "./request";
import * as schema from "./schema";

const zone = z.string().refine((timeZone) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
});
const pushServices = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];
const pushService = z.url({ protocol: /^https$/ }).refine((url) => {
  const { hostname } = new URL(url);
  return pushServices.some((s) => hostname === s || hostname.endsWith(`.${s}`));
});
const subscribe = z.object({
  subscription: z.object({
    endpoint: pushService,
    keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  }),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timeZone: zone,
});
const unsubscribe = z.object({ endpoint: z.string() });

const payload = JSON.stringify({ title: "Groat", body: "Anything to add from today?" });

function local(at: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function reminders({ db, clock, fetch }: Pick<Ctx, "db" | "clock" | "fetch">) {
  const keys = () => {
    const { vapidPublicKey, vapidPrivateKey } = seeded(db.select().from(schema.settings).get());
    if (vapidPublicKey && vapidPrivateKey) return { publicKey: vapidPublicKey, privateKey: vapidPrivateKey };
    const fresh = webpush.generateVAPIDKeys();
    db.update(schema.settings).set({ vapidPublicKey: fresh.publicKey, vapidPrivateKey: fresh.privateKey }).run();
    return fresh;
  };

  const push = async (reminder: typeof schema.reminders.$inferSelect) => {
    const { endpoint, p256dh, auth, origin } = reminder;
    const request = webpush.generateRequestDetails({ endpoint, keys: { p256dh, auth } }, payload, {
      vapidDetails: { subject: origin.startsWith("https:") ? origin : "mailto:groat@example.invalid", ...keys() },
      TTL: 4 * 3600,
    });
    const { "Content-Length": _, ...headers } = request.headers;
    const res = await fetch(request.endpoint, {
      method: request.method,
      headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, String(v)])),
      body: new Uint8Array(request.body),
      redirect: "manual",
    });
    if (res.status === 404 || res.status === 410)
      db.delete(schema.reminders).where(eq(schema.reminders.endpoint, endpoint)).run();
    else if (!res.ok) log("warn", "reminder.failed", { status: res.status });
  };

  const tick = async () => {
    const now = clock();
    const due = db
      .select({ reminder: schema.reminders })
      .from(schema.reminders)
      .innerJoin(schema.users, and(eq(schema.users.id, schema.reminders.userId), active))
      .all()
      .map(({ reminder }) => ({ reminder, at: local(now, reminder.timeZone) }))
      .filter(({ reminder, at }) => at.time >= reminder.time && reminder.lastSentOn !== at.day);
    await Promise.all(
      due.map(({ reminder, at }) => {
        db.update(schema.reminders)
          .set({ lastSentOn: at.day })
          .where(eq(schema.reminders.endpoint, reminder.endpoint))
          .run();
        return push(reminder).catch((error) => log("warn", "reminder.failed", { error: errorKind(error) }));
      }),
    );
  };

  const routes = new Hono<Env>();

  routes.get("/api/reminders", (c) =>
    c.json({
      publicKey: keys().publicKey,
      reminders: db
        .select({ endpoint: schema.reminders.endpoint, time: schema.reminders.time })
        .from(schema.reminders)
        .where(eq(schema.reminders.userId, c.get("user").id))
        .all(),
    }),
  );

  routes.put("/api/reminders", async (c) => {
    const input = await body(c, subscribe);
    if ("error" in input) return c.json(input, 400);
    const { subscription, time, timeZone } = input.data;
    const at = local(clock(), timeZone);
    const row = {
      userId: c.get("user").id,
      ...subscription.keys,
      origin: c.req.header("origin") ?? new URL(c.req.url).origin,
      time,
      timeZone,
      lastSentOn: at.time >= time ? at.day : null,
    };
    db.insert(schema.reminders)
      .values({ endpoint: subscription.endpoint, ...row })
      .onConflictDoUpdate({ target: schema.reminders.endpoint, set: row })
      .run();
    return c.json({ endpoint: subscription.endpoint, time });
  });

  routes.delete("/api/reminders", async (c) => {
    const input = await body(c, unsubscribe);
    if ("error" in input) return c.json(input, 400);
    db.delete(schema.reminders)
      .where(and(eq(schema.reminders.endpoint, input.data.endpoint), eq(schema.reminders.userId, c.get("user").id)))
      .run();
    return c.json({});
  });

  return { routes, tick };
}
