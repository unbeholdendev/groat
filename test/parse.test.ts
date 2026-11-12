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

test("an amount can be a sum", () => {
  expect(parse("ramen 12+3,5 eur", ["EUR"])).toMatchObject({ amount: "12+3.5", currency: "EUR", note: "ramen" });
  expect(parse("ramen 12+3.5", []).parts).toContainEqual(["12+3.5", "amount"]);
  expect(parse("t-shirt 20", [])).toMatchObject({ amount: "20", note: "t-shirt" });
  expect(parse("a/c 30", [])).toMatchObject({ amount: "30", note: "a/c" });
});

test("a plain number wins over a sum, so dates stay in the note", () => {
  expect(parse("2026-11-08 lunch 15", [])).toMatchObject({ amount: "15", note: "2026-11-08 lunch" });
  expect(parse("gym 24/7 30", []).parts).toEqual([
    ["gym", ""],
    [" ", ""],
    ["24/7", ""],
    [" ", ""],
    ["30", "amount"],
  ]);
  expect(parse("lunch 12/3", [])).toMatchObject({ amount: "12/3", note: "lunch" });
});

test("confident needs an amount and a guessed category", () => {
  expect(confident(parse("coffee 3", []), 1)).toBe(true);
  expect(confident(parse("coffee 3", []), null)).toBe(false);
  expect(confident(parse("coffee", []), 1)).toBe(false);
});
