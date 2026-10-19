import { expect, test } from "bun:test";
import { confident, parse } from "../shared/parse";

test("parses amount, currency, tags and note", () => {
  const p = parse("coffee 3,50 eur #work 2", ["EUR", "GBP"]);
  expect([p.amount, p.currency, p.unit, p.tags, p.note]).toEqual(["3.50", "EUR", null, ["work"], "coffee 2"]);
  expect(parse("tip 5000 sats", [])).toMatchObject({ amount: "5000", currency: "BTC", unit: "sats" });
});

test("any known code parses in capitals; lower case only for recent ones", () => {
  expect(parse("taxi 300 THB", ["GBP"])).toMatchObject({ currency: "THB", note: "taxi" });
  expect(parse("pen 3", ["GBP"])).toMatchObject({ currency: null, note: "pen" });
  expect(parse("pen 3", ["PEN"])).toMatchObject({ currency: "PEN", note: "" });
});

test("confident needs an amount and a guessed category", () => {
  expect(confident(parse("coffee 3", []), 1)).toBe(true);
  expect(confident(parse("coffee 3", []), null)).toBe(false);
  expect(confident(parse("coffee", []), 1)).toBe(false);
});
