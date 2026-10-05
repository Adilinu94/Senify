import { describe, expect, it } from "vitest";
import { captureHtml, mapFramerMotion } from "../src/index.ts";

const entry = (from: Record<string, number>, transition: Record<string, unknown>) =>
  ({ default: { initial: { opacity: 0.001, scale: 1, x: 0, y: 0, ...from }, animate: { opacity: 1, scale: 1, x: 0, y: 0, transition } } });

function page(appear: Record<string, unknown>, body: string): string {
  return (
    `<html><head><title>t</title><script type="application/json" id="__framer__appearAnimationsContent">${JSON.stringify(appear)}</script></head>` +
    `<body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`
  );
}

describe("Framer appear effects", () => {
  const spring = { type: "spring", stiffness: 160, damping: 30, mass: 1, delay: 0.3 };
  const html = page(
    {
      up: entry({ y: 40 }, spring),
      fade: entry({}, spring),
      side: entry({ x: 150 }, spring),
      top: entry({ y: -50 }, spring),
      grow: entry({ scale: 0.5 }, spring),
      none: { default: null },
    },
    '<div data-framer-appear-id="up" style="opacity:0.001;transform:translateY(40px)">Hoch</div>' +
      '<div data-framer-appear-id="fade" style="opacity:0.001">Blende</div>' +
      '<div data-framer-appear-id="side" style="opacity:0.001;transform:translateX(150px)">Seite</div>' +
      '<div data-framer-appear-id="top" style="opacity:0.001;transform:translateY(-50px)">Oben</div>' +
      '<div data-framer-appear-id="grow" style="opacity:0.001;transform:scale(0.5)">Wachsen</div>' +
      '<div data-framer-appear-id="none">Nichts</div>',
  );

  it("reads one sample per element that has an effect, with the delay in seconds", () => {
    const document = captureHtml({ html });
    expect(document.motion).toHaveLength(5);
    const up = document.motion[0];
    expect(up?.library).toBe("framer");
    expect(up?.trigger).toBe("appear");
    expect(up?.params["fromY"]).toBe(40);
    expect(up?.params["delay"]).toBe(0.3);
  });

  it("settles a spring from its stiffness, damping and mass", () => {
    const document = captureHtml({ html });
    // ω0 = √160 ≈ 12.65, ζ = 30 / (2·√160) ≈ 1.19: 4 / (ζ·ω0) ≈ 0.27 s
    expect(document.motion[0]?.params["duration"]).toBeGreaterThan(0.24);
    expect(document.motion[0]?.params["duration"]).toBeLessThan(0.3);
  });

  it("maps a rise from below and a plain fade to fade-up, with the offset as intensity", () => {
    const result = mapFramerMotion(captureHtml({ html }));
    const specs = result.mappings.map((mapping) => mapping.spec);
    expect(specs).toHaveLength(2);
    expect(specs.every((spec) => spec.preset === "fade-up" && spec.trigger === "load")).toBe(true);
    expect(specs[0]?.intensity).toBe(4);
    // Seconds, as the runtime reads it (GSAP): 0.3 s, not 300.
    expect(specs[0]?.delay).toBe(0.3);
    expect(specs[1]?.intensity).toBe(1);
  });

  it("documents what no preset can play instead of playing something else", () => {
    const result = mapFramerMotion(captureHtml({ html }));
    expect(result.documented).toBe(3);
    const reasons = result.findings.map((finding) => finding.reason).join("\n");
    expect(reasons).toContain("x 150");
    expect(reasons).toContain("y -50");
    expect(reasons).toContain("Skalierung 0.5");
  });

  it("leaves a page without an appear block with no motion", () => {
    expect(captureHtml({ html: page({}, "<p>x</p>").replace(/<script[\s\S]*?<\/script>/, "") }).motion).toEqual([]);
  });
});

describe("fidelity report", () => {
  it("does not hand out the motion points when the page has no motion", async () => {
    const { normalize, mapDocument, buildFidelityReport } = await import("../src/index.ts");
    const document = captureHtml({ html: page({}, "<p>x</p>").replace(/<script[\s\S]*?<\/script>/, "") });
    const normalized = normalize(document, { mode: "fidelity" });
    const mapped = mapDocument(document, normalized.rules);
    const report = buildFidelityReport(document, normalized, mapped, mapFramerMotion(document));
    expect(report.motion.measured).toBe(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.steps.join("\n")).toContain("Originaltreue-Modus");
    expect(report.steps.join("\n")).not.toContain("DNA-Konformität erzwungen");
  });
});
