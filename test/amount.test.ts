import { expect, test } from "bun:test";
import { parseAmount } from "../shared/amount";

test("plain amounts keep the currency's minor unit", () => {
  expect(parseAmount(" 3.50 ", "GBP")).toBe(350);
  expect(parseAmount("3.505", "GBP")).toBeNull();
  expect(parseAmount("1200", "JPY")).toBe(1200);
  expect(parseAmount("20999999.99999999", "BTC", "BTC")).toBe(2099999999999999);
  expect(parseAmount("5000", "BTC", "sats")).toBe(5000);
});

test("arithmetic follows precedence and rounds to the minor unit", () => {
  expect(parseAmount("12.50+3.20", "GBP")).toBe(1570);
  expect(parseAmount("3*4.5", "GBP")).toBe(1350);
  expect(parseAmount("100/3", "GBP")).toBe(3333);
  expect(parseAmount("2/3", "GBP")).toBe(67);
  expect(parseAmount("10 - 2 × 3 ÷ 4", "EUR")).toBe(850);
  expect(parseAmount("(2+3)*4", "GBP")).toBe(2000);
  expect(parseAmount("0.1+0.2", "GBP")).toBe(30);
  expect(parseAmount("1000/3", "BTC", "sats")).toBe(333);
  expect(parseAmount("1/3", "BTC", "BTC")).toBe(33333333);
  expect(parseAmount("0.57/100*50", "GBP")).toBe(29);
});

test("bad, zero or negative results are not amounts", () => {
  for (const text of ["", "x", "1 2", "3+", "+3", "-3", "3--1", "(3", "3)", "1.2.3", "3.", "3,50", "3-5", "5-5", "1/0", "0/0", "1/(1/0)+1", "1/(2-2)", "1/1000", "1.001+1"])
    expect([text, parseAmount(text, "GBP")]).toEqual([text, null]);
});
