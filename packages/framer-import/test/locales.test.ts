import { describe, expect, it } from "vitest";
import { captureHtml, runImport } from "../src/index.ts";

// The head of a localized Framer page, measured on https://www.framer.com/ja/
// (02.11.2026): every language version carries the whole set of alternates as
// absolute URLs on the source origin, tagged `data-framer-generated-hreflang`.
const HEAD = `<link rel="alternate" href="https://www.framer.com/" hreflang="en" data-framer-generated-hreflang>
<link rel="alternate" href="https://www.framer.com/ja/" hreflang="ja-JP" data-framer-generated-hreflang>
<link rel="alternate" href="https://www.framer.com/" hreflang="x-default" data-framer-generated-hreflang>`;

const page = (head: string, body = "<p>Seite</p>"): string =>
  `<html lang="ja-JP"><head><title>Seite</title>${head}</head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`;

describe("lokalisierte Seiten", () => {
  it("liest die hreflang-Alternates des Kopfs als Pfade dieser Site", () => {
    const document = captureHtml({
      html: page(HEAD),
      url: "https://www.framer.com/ja/",
      pagePath: "/ja",
    });
    expect(document.pages[0]?.alternates).toEqual([
      { lang: "en", path: "/" },
      { lang: "ja-JP", path: "/ja" },
      { lang: "x-default", path: "/" },
    ]);
  });

  it("nimmt auch wurzelrelative Verweise auf, wenn die Quelle keine Adresse hat", () => {
    const document = captureHtml({
      html: page('<link rel="alternate" href="/en/" hreflang="en">'),
      pagePath: "/",
    });
    expect(document.pages[0]?.alternates).toEqual([{ lang: "en", path: "/en" }]);
  });

  it("verwirft einen Verweis auf eine andere Site und nennt ihn im Befund", () => {
    const document = captureHtml({
      html: page('<link rel="alternate" href="https://andere.example/fr/" hreflang="fr">'),
      url: "https://www.framer.com/ja/",
      pagePath: "/ja",
    });
    expect(document.pages[0]?.alternates).toBeUndefined();
    const finding = document.findings.find((entry) => entry.kind === "locale");
    expect(finding?.message).toContain("andere.example");
    expect(finding?.severity).toBe("info");
  });

  it("bietet die Sprachfassungen als Seiten an, auch ohne sichtbaren Verweis", async () => {
    const run = await runImport({
      source: { kind: "html", html: page(HEAD), url: "https://www.framer.com/ja/" },
      pagePath: "/ja",
      mode: "fidelity",
    });
    expect(run.discoveredPages).toEqual(["/"]);
    expect(run.report.steps.some((step) => step.startsWith("Lokalisierung:"))).toBe(true);
  });
});
