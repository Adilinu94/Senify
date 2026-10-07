import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// A source-level contract, not a behaviour test: dashboard/app.js is a large
// browser script that cannot be imported here. The behaviour belongs in a
// Playwright check; this keeps the accessibility wiring from being dropped by
// an edit that nobody sees in a screenshot.

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../public/${name}`, import.meta.url)), "utf8");

describe("dashboard toasts reach assistive technology", () => {
  const indexHtml = read("index.html");
  const appJs = read("app.js");
  const start = appJs.indexOf("function toast(");
  const toast = appJs.slice(start, appJs.indexOf("function friendlyError"));

  it("has a live region that exists before the first message", () => {
    expect(indexHtml).toMatch(/<div id="toasts"[^>]*\baria-live="polite"/);
  });

  it("announces an error at once and keeps it until it is closed", () => {
    expect(start).toBeGreaterThan(-1);
    expect(toast).toContain('"role", "alert"');
    // The close button has a name; the only timer belongs to the other kinds.
    expect(toast).toContain('"aria-label": "Meldung schließen"');
    expect(toast.match(/setTimeout/g)).toHaveLength(1);
    expect(toast.indexOf("setTimeout")).toBeGreaterThan(toast.indexOf('kind === "error"'));
    expect(toast).not.toMatch(/7000/);
  });

  it("does not stack the same error again and again", () => {
    expect(toast).toMatch(/classList\.contains\("error"\)/);
  });
});
