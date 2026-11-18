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
