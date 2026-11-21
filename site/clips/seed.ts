import type { APIRequestContext } from "@playwright/test";

type Row = {
  note: string;
  amount: string;
  currency?: string;
  date: string;
  category: string;
  tags?: string[];
};

let state: number;
const random = () => {
  state = (state * 1103515245 + 12345) % 2 ** 31;
  return state / 2 ** 31;
};
const pick = <T>(xs: T[]) => xs[Math.floor(random() * xs.length)];
const iso = (d: Date) => d.toLocaleDateString("en-CA");
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};
const money = (low: number, high: number) => (low + random() * (high - low)).toFixed(2);

function rows(): Row[] {
  state = 7;
  const out: Row[] = [];
  for (let n = 180; n >= 1; n--) {
    const d = daysAgo(n);
    const date = iso(d);
    const weekday = d.getDay();
    if (weekday >= 1 && weekday <= 5 && random() < 0.7)
      out.push({ note: "coffee", amount: n > 120 ? "3.20" : n > 50 ? "3.60" : "4.10", date, category: "Eating out" });
    if (weekday === 6)
      out.push({ note: pick(["tesco", "lidl", "sainsbury's"]), amount: money(38, 74), date, category: "Groceries" });
    if (weekday === 3 && random() < 0.6) out.push({ note: "lidl", amount: money(12, 25), date, category: "Groceries" });
    if (weekday === 5 && random() < 0.75)
      out.push({
        note: pick(["ramen", "thai takeaway", "pizza", "dim sum"]),
        amount: money(n < 40 ? 28 : 18, n < 40 ? 46 : 32),
        date,
        category: "Eating out",
        tags: random() < 0.5 ? ["friends"] : [],
      });
    if (weekday >= 1 && weekday <= 4 && random() < 0.3)
      out.push({ note: "tube", amount: money(2.8, 5.6), date, category: "Public transport" });
    if (d.getDate() === 3) out.push({ note: "electricity", amount: money(62, 96), date, category: "Utilities" });
    if (d.getDate() === 8) out.push({ note: "spotify", amount: "11.99", date, category: "Subscriptions" });
    if (d.getDate() === 12) out.push({ note: "phone", amount: "18.00", date, category: "Utilities" });
    if (random() < 0.05)
      out.push({
        note: pick(["cinema", "gig tickets", "bowling"]),
        amount: money(14, 48),
        date,
        category: "Entertainment",
      });
    if (random() < 0.04)
      out.push({ note: pick(["pharmacy", "dentist"]), amount: money(6, 60), date, category: "Health" });
    if (random() < 0.04) out.push({ note: pick(["uber", "taxi home"]), amount: money(9, 24), date, category: "Taxi" });
    if (n === 64) out.push({ note: "train to Leeds", amount: "46.20", date, category: "Public transport" });
    if (n === 33) out.push({ note: "birthday present", amount: "35.00", date, category: "Gifts", tags: ["family"] });
  }
  const trip = 95;
  out.unshift(
    {
      note: "flights to Lisbon",
      amount: "184.00",
      date: iso(daysAgo(trip + 30)),
      category: "Travel",
      tags: ["lisbon"],
    },
    {
      note: "hotel",
      amount: "342.00",
      currency: "EUR",
      date: iso(daysAgo(trip)),
      category: "Travel",
      tags: ["lisbon"],
    },
    {
      note: "pastéis de nata",
      amount: "7.50",
      currency: "EUR",
      date: iso(daysAgo(trip - 1)),
      category: "Eating out",
      tags: ["lisbon"],
    },
    {
      note: "dinner in Alfama",
      amount: "58.00",
      currency: "EUR",
      date: iso(daysAgo(trip - 1)),
      category: "Eating out",
      tags: ["lisbon"],
    },
    {
      note: "tram 28",
      amount: "6.00",
      currency: "EUR",
      date: iso(daysAgo(trip - 2)),
      category: "Public transport",
      tags: ["lisbon"],
    },
  );
  return out;
}

export async function seed(api: APIRequestContext, ai: { url: string; key: string; model: string }) {
  const ok = async (res: Promise<{ ok(): boolean; status(): number; text(): Promise<string> }>, what: string) => {
    const r = await res;
    if (!r.ok()) throw new Error(`${what}: ${r.status()} ${await r.text()}`);
    return r;
  };
  await ok(api.post("/api/setup", { data: { username: "sam", password: crypto.randomUUID() } }), "setup");
  await ok(api.post("/api/onboarding", { data: { baseCurrency: "GBP" } }), "onboarding");
  await ok(api.put("/api/settings", { data: { theme: "light" } }), "theme");
  await ok(api.post("/api/users", { data: { username: "alex", password: crypto.randomUUID() } }), "member");
  await ok(
    api.put("/api/ai", { data: { baseUrl: ai.url, key: ai.key, sttBaseUrl: `${ai.url}/stt`, sttKey: "stub" } }),
    "ai",
  );
  await ok(api.put("/api/models", { data: { chat: ai.model, vision: ai.model, stt: "whisper-1" } }), "models");

  const categories: { id: number; name: string }[] = await (await api.get("/api/categories")).json();
  const id = (name: string) => {
    const c = categories.find((c) => c.name === name);
    if (!c) throw new Error(`no category ${name}`);
    return c.id;
  };
  for (const { category, ...r } of rows())
    await ok(
      api.post("/api/transactions", { data: { currency: "GBP", tags: [], ...r, categoryId: id(category) } }),
      r.note,
    );

  const monthly = (note: string, amount: string, category: string, months: number) => {
    const start = daysAgo(0);
    start.setMonth(start.getMonth() - months, 1);
    return ok(
      api.post("/api/recurring", {
        data: {
          note,
          amount,
          currency: "GBP",
          period: "month",
          every: 1,
          startDate: iso(start),
          categoryId: id(category),
        },
      }),
      note,
    );
  };
  await monthly("rent", "1150", "Rent/Mortgage", 6);
  await monthly("netflix", "10.99", "Subscriptions", 6);
  await monthly("gym", "34", "Health", 6);
}
