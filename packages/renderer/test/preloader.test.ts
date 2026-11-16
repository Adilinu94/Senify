import { describe, expect, it } from "vitest";
import {
  PRELOADER_CSS,
  preloaderMarkup,
  preloaderScript,
  type PageLoader,
} from "../astro-template/src/lib/preloader.ts";

// The native loader follows the origin's `Preloader.tsx` (read 14.11.2026):
// two panels that part like a shutter, the wordmark, the studio place, a
// progress line and the count. The Show Once wrapper suppresses it for 15 s.
const loader: PageLoader = {
  label: "Origin®",
  place: "Brand Studio, Dubai",
  durationMs: 2_900,
  showOnceMs: 15_000,
  showOnce: true,
  counter: true,
  background: "#141414",
  color: "#f2f2f2",
  muted: "#8e8e8e",
  count: "#b8b8b8",
};

describe("the native page loader", () => {
  it("carries the wordmark, the place, the line and the count", () => {
    const markup = preloaderMarkup(loader);
    expect(markup).toContain("Origin®");
    // The label falls back to its last part when the full text does not fit.
    expect(markup).toContain("Dubai");
    expect(markup).toContain("Brand Studio, Dubai");
    expect(markup).toContain("data-preloader-counter");
    expect(markup).toContain("data-preloader-line");
    // The shutter: one panel per half.
    expect(markup).toContain("senify-preloader__panel--top");
    expect(markup).toContain("senify-preloader__panel--bottom");
  });

  it("escapes what it writes into the page", () => {
    const markup = preloaderMarkup({ ...loader, label: '<script>alert("x")</script>' });
    expect(markup).not.toContain("<script>");
    expect(markup).toContain("&lt;script&gt;");
  });

  it("locks the scroll and honors reduced motion in the stylesheet", () => {
    expect(PRELOADER_CSS).toContain("senify-preloader-open");
    expect(PRELOADER_CSS).toContain("overflow:hidden");
    expect(PRELOADER_CSS).toContain("prefers-reduced-motion");
  });

  it("writes the origin timing into the script", () => {
    const script = preloaderScript(loader, "senify-loader:/");
    expect(script).toContain("2900");
    expect(script).toContain("15000");
    // The shutter of the origin runs 950 ms after a 250 ms delay.
    expect(script).toContain("950");
    expect(script).toContain("data-phase");
    // Reduced motion skips the loader instead of animating it.
    expect(script).toContain("prefers-reduced-motion");
    // A visitor who saw it inside the window gets no curtain.
    expect(script).toContain("localStorage");
  });

  it("keeps the script self-contained", () => {
    // It is serialised into the page and runs before hydration: it must not
    // reference module scope.
    const script = preloaderScript(loader, "senify-loader:/");
    expect(script.startsWith("(function(){")).toBe(true);
    expect(script).not.toContain("import ");
    expect(script).not.toContain("=== undefined");
  });
});
