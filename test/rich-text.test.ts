import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RichText } from "../web/components/rich-text";

const html = (text: string) => renderToStaticMarkup(createElement(RichText, { text }));

test("assistant replies show bold and italic instead of asterisks", () => {
  expect(html("You spent **£42.10** on *food* this week.")).toBe(
    "You spent <strong>£42.10</strong> on <em>food</em> this week.",
  );
});

test("asterisks that are not emphasis stay as written", () => {
  expect(html("* coffee\n2 * 3 = 6\n**unclosed")).toBe("* coffee\n2 * 3 = 6\n**unclosed");
});

test("internal links render as links; any other link stays as written", () => {
  expect(html("See [coffee](/?q=coffee&from=2026-03-01) and **[this one](/?edit=4)**.")).toBe(
    'See <a href="/?q=coffee&amp;from=2026-03-01" class="text-accent underline">coffee</a> and <strong><a href="/?edit=4" class="text-accent underline">this one</a></strong>.',
  );
  for (const text of [
    "[x](https://evil.test)",
    "[y](//evil.test)",
    "[z](javascript:alert(1))",
    "[w](/\\evil.test)",
    "[v](/settings)",
  ])
    expect(html(text)).toBe(text);
});
