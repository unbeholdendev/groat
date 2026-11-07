import { expect, test } from "bun:test";
import { setup, frankfurter } from "./harness";

test("shared manual rates preserve originals, survive base changes and reset to automatic", async () => {
  let up = false;
  const t = setup("2026-10-10T12:00:00Z", url => up ? frankfurter({ "2026-10-02": { EUR: 0.8, GBP: 0.76 } })(url) : new Response("down", { status: 503 }));
  await t.call("POST", "/api/onboarding", { baseCurrency: "GBP" });
  for (const note of ["a", "b"]) await t.call("POST", "/api/transactions", { note, amount: "10", currency: "EUR", date: "2026-10-02" });
  expect((await t.call("GET", "/api/stats?from=2026-10-02&to=2026-10-02")).body.unconverted).toBe(2);
  for (const [currency, rate] of [["EUR", 0.8], ["GBP", 0.72]]) expect((await t.call("PUT", "/api/rates", { date: "2026-10-02", currency, rate })).status).toBe(200);
  const rows = (await t.call("GET", "/api/transactions")).body;
  expect(rows.map((r: any) => r.baseAmount)).toEqual([900, 900]);
  expect(rows[0]).toMatchObject({ amount: 1000, currency: "EUR", conversion: { date: "2026-10-02", from: { source: "manual" }, to: { source: "manual" } } });
  expect((await t.call("GET", "/api/stats?from=2026-10-02&to=2026-10-02")).body).toMatchObject({ total: 1800, unconverted: 0 });
  expect(await (await t.request("/api/export")).text()).toContain("manual");
  await t.call("PUT", "/api/settings", { baseCurrency: "USD" });
  expect((await t.call("GET", "/api/transactions")).body[0].baseAmount).toBe(1250);
  await t.call("PUT", "/api/rates", { date: "2026-10-02", currency: "EUR", rate: 1 });
  up = true;
  t.restart();
  expect((await t.call("GET", "/api/transactions")).body[0].baseAmount).toBe(1000);
  await t.call("DELETE", "/api/rates?date=2026-10-02&currency=EUR");
  expect((await t.call("GET", "/api/transactions")).body[0].baseAmount).toBe(1250);
});

test("failed historical rates recover after ten minutes without restarting", async () => {
  let up = false;
  const t = setup("2026-10-10T12:00:00Z", url => up ? frankfurter({ "2026-10-02": { EUR: 0.8 } })(url) : new Response("down", { status: 503 }));
  await t.call("POST", "/api/onboarding", { baseCurrency: "USD" });
  await t.call("POST", "/api/transactions", { note: "a", amount: "10", currency: "EUR", date: "2026-10-02" });
  up = true;
  t.clock.now = new Date("2026-10-10T12:11:00Z");
  expect((await t.call("GET", "/api/transactions")).body[0].baseAmount).toBe(1250);
});

test("manual input rejects invalid rates and USD; weekend provenance survives restart", async () => {
  const t = setup("2026-10-10T12:00:00Z", frankfurter({ "2026-10-02": { EUR: 0.8 } }));
  await t.call("POST", "/api/onboarding", { baseCurrency: "USD" });
  for (const rate of [0, -1, "0.8", null]) expect((await t.call("PUT", "/api/rates", { date: "2026-10-04", currency: "EUR", rate })).status).toBe(400);
  expect((await t.call("PUT", "/api/rates", { date: "2026-10-04", currency: "USD", rate: 2 })).status).toBe(400);
  await t.call("POST", "/api/transactions", { note: "weekend", amount: "10", currency: "EUR", date: "2026-10-04" });
  t.restart();
  expect((await t.call("GET", "/api/transactions")).body[0].conversion.from).toMatchObject({ rateDate: "2026-10-02", source: "frankfurter" });
});

test("reset during the live cache window removes manual precedence and retries", async () => {
  const t = setup("2026-10-10T12:00:00Z", frankfurter({ "2026-10-10": { EUR: 0.8 } }));
  await t.call("POST", "/api/onboarding", { baseCurrency: "USD" });
  await t.call("POST", "/api/transactions", { note: "a", amount: "10", currency: "EUR", date: "2026-10-10" });
  await t.call("PUT", "/api/rates", { date: "2026-10-10", currency: "EUR", rate: 1 });
  expect((await t.call("GET", "/api/transactions")).body[0].baseAmount).toBe(1000);
  await t.call("DELETE", "/api/rates?date=2026-10-10&currency=EUR");
  expect((await t.call("GET", "/api/transactions")).body[0]).toMatchObject({ baseAmount: 1250, conversion: { from: { source: "frankfurter" } } });
});

test("manual rates are scoped to their date and persist when another base needs rates", async () => {
  const t = setup("2026-10-10T12:00:00Z");
  await t.call("POST", "/api/onboarding", { baseCurrency: "USD" });
  await t.call("PUT", "/api/rates", { date: "2026-10-02", currency: "EUR", rate: 0.8 });
  for (const date of ["2026-10-01", "2026-10-02"]) await t.call("POST", "/api/transactions", { note: date, amount: "10", currency: "EUR", date });
  await t.call("POST", "/api/transactions", { note: "Cash", amount: "2", currency: "USD", date: "2026-10-02" });
  expect((await t.call("GET", "/api/stats?from=2026-10-01&to=2026-10-02")).body).toMatchObject({ total: 1450, unconverted: 1 });
  await t.call("PUT", "/api/settings", { baseCurrency: "JPY" });
  expect((await t.call("GET", "/api/transactions")).body.every((r: any) => r.baseAmount === null)).toBe(true);
  await t.call("PUT", "/api/settings", { baseCurrency: "USD" });
  expect((await t.call("GET", "/api/stats?from=2026-10-01&to=2026-10-02")).body).toMatchObject({ total: 1450, unconverted: 1 });
});

test("extreme manual rates leave overflowing conversions incomplete", async () => {
  const t = setup();
  await t.call("POST", "/api/onboarding", { baseCurrency: "USD" });
  await t.call("PUT", "/api/rates", { date: "2026-10-02", currency: "EUR", rate: 1e-310 });
  await t.call("POST", "/api/transactions", { note: "Dinner", amount: "10", currency: "EUR", date: "2026-10-02" });
  expect((await t.call("GET", "/api/transactions")).body[0].baseAmount).toBeNull();
  expect((await t.call("GET", "/api/stats?from=2026-10-02&to=2026-10-02")).body).toMatchObject({ total: 0, unconverted: 1 });
});

test("denominator overflow cannot silently turn a conversion into zero", async () => {
  const t = setup();
  await t.call("POST", "/api/onboarding", { baseCurrency: "GBP" });
  for (const [currency, rate] of [["EUR", 2e306], ["GBP", 1.5e303]]) {
    expect((await t.call("PUT", "/api/rates", { date: "2026-10-02", currency, rate })).status).toBe(200);
  }
  await t.call("POST", "/api/transactions", { note: "Dinner", amount: "10", currency: "EUR", date: "2026-10-02" });
  expect((await t.call("GET", "/api/transactions")).body[0].baseAmount).toBeNull();
  expect((await t.call("GET", "/api/stats?from=2026-10-02&to=2026-10-02")).body).toMatchObject({ total: 0, unconverted: 1 });
});
