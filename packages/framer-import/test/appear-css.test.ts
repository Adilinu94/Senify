import { describe, expect, it } from "vitest";
import { captureHtml, normalize, mapDocument } from "../src/index.ts";
import { appearTransform, compileAppearRules, appearSettleSeconds } from "../src/appear-css.ts";

// Step 4b: the appear channel becomes CSS keyframes, not a finding. The tests
// sit at the IR (the spec survives the capture) and at the mapped document (the
// rules reach the style registry the bake compiles).

function page(appear: Record<string, unknown>, body: string): string {
  return (
    `<html lang="de"><head><title>t</title>` +
    `<style>.framer-1a{opacity:0.001;transform:translateY(40px)}</style>` +
    `<script type="application/json" id="__framer__appearAnimationsContent">${JSON.stringify(appear)}</script>` +
    `<script type="application/json" id="__framer__breakpoints">${JSON.stringify([
      { hash: "1ebocfq", mediaQuery: "(min-width: 1200px)" },
      { hash: "tq1gxe", mediaQuery: "(min-width: 810px) and (max-width: 1199.98px)" },
      { hash: "72rtr7", mediaQuery: "(max-width: 809.98px)" },
    ])}</script>` +
    `</head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`
  );
}

const variant = (initial: Record<string, number>, animate: Record<string, number>, transition: Record<string, unknown> = { type: "duration", duration: 0.6 }) =>
  ({ initial: { opacity: 0.001, x: 0, y: 0, scale: 1, ...initial }, animate: { opacity: 1, x: 0, y: 0, scale: 1, ...animate, transition } });

describe("the appear spec survives the capture", () => {
  it("keeps every breakpoint variant, not only default", () => {
    const document = captureHtml({
      html: page(
        {
          hero: {
            default: variant({ y: 40 }, {}),
            "72rtr7": variant({ x: -30 }, {}),
          },
        },
        '<div data-framer-appear-id="hero" class="framer-1a" style="opacity:0.001;transform:translateY(40px)">Held</div>',
      ),
    });
    expect(document.appear).toHaveLength(1);
    const spec = document.appear?.[0];
    expect(spec?.appearId).toBe("hero");
    expect(Object.keys(spec?.variants ?? {}).sort()).toEqual(["72rtr7", "default"]);
    expect(spec?.variants["72rtr7"]?.initial?.x).toBe(-30);
  });

  it("keeps a null variant as 'no effect here'", () => {
    const document = captureHtml({
      html: page(
        { hero: { default: variant({ y: 40 }, {}), tq1gxe: null } },
        '<div data-framer-appear-id="hero" style="opacity:0.001">Held</div>',
      ),
    });
    expect(document.appear?.[0]?.variants["tq1gxe"]).toBeNull();
  });

  it("survives a JSON round trip", () => {
    const document = captureHtml({
      html: page({ hero: { default: variant({ y: 40 }, {}, { type: "spring", stiffness: 160, damping: 30 }) } }, '<div data-framer-appear-id="hero" style="opacity:0.001">Held</div>'),
    });
    const roundTripped = JSON.parse(JSON.stringify(document)) as typeof document;
    expect(roundTripped.appear?.[0]?.variants["default"]?.animate?.transition?.stiffness).toBe(160);
  });
});

describe("the transform order follows Motion", () => {
  it("puts perspective, translate, scale, rotate, skew in that order", () => {
    // Motion's `buildTransform`. A different order makes a different matrix.
    expect(
      appearTransform({ transformPerspective: 900, y: 40, scale: 0.8, rotateX: 12, skewX: 3 }),
    ).toBe("perspective(900px) translateY(40px) scale(0.8) rotateX(12deg) skewX(3deg)");
  });

  it("emits nothing at rest", () => {
    expect(appearTransform({})).toBe("none");
    expect(appearTransform({ x: 0, y: 0, scale: 1 })).toBe("none");
  });
});

describe("a spring settles to a usable duration", () => {
  it("uses Framer's own settle time, not the 2 % formula", () => {
    // stiffness 160 / damping 30 is the standard reveal of the fixtures. The
    // old `4/(ζ·ω0)` formula said 0.27 s; Framer's solver says 1.00 s, because
    // it stops at a distance-dependent rest threshold, not at 2 % of the
    // travel. Measured against the page's `animator.spring` (see spring.test.ts).
    const settle = appearSettleSeconds({ type: "spring", stiffness: 160, damping: 30, mass: 1 });
    expect(settle).toBeCloseTo(1.0, 2);
  });

  it("takes a plain duration as written", () => {
    expect(appearSettleSeconds({ type: "duration", duration: 1.4 })).toBe(1.4);
  });

  it("clamps a nonsense duration into a range a page can use", () => {
    expect(appearSettleSeconds({ type: "duration", duration: 30 })).toBe(1.6);
    expect(appearSettleSeconds({ type: "duration", duration: 0 })).toBe(0.15);
  });
});

describe("compiling the channel to rules", () => {
  const specs = [
    {
      appearId: "hero",
      variants: {
        default: { initial: { opacity: 0.001, y: 40 }, animate: { opacity: 1, y: 0, transition: { type: "duration", duration: 1.4 } } },
      },
    },
  ];

  it("produces one keyframes block and one declaration for a single variant", () => {
    const result = compileAppearRules({
      specs,
      breakpoints: [],
      nodeIdByAppearId: new Map([["hero", "n1"]]),
      scope: "abcdef",
    });
    expect(result.compiled).toBe(1);
    expect(result.rules).toHaveLength(1);
    const rule = result.rules[0];
    expect(rule?.keyframes).toHaveLength(1);
    // The source's 1.4 s, not a fraction of it. Milliseconds, because the
    // spring path needs the exact settle time (1 400 ms for a plain duration).
    expect(rule?.animation["animation"]).toBe("senify-appear-hero-default 1400ms ease 0ms both");
    // `both`: the element holds the start state through the delay and the end
    // state afterwards. Without it a reveal at opacity 0.001 flashes.
    expect(rule?.animation["animation"]).toContain("both");
  });

  it("scopes a breakpoint variant with its media condition", () => {
    const result = compileAppearRules({
      specs: [
        {
          appearId: "hero",
          variants: {
            default: { initial: { opacity: 0.001, y: 40 }, animate: { opacity: 1, y: 0, transition: { duration: 0.6 } } },
            "72rtr7": { initial: { opacity: 0.001, x: -30 }, animate: { opacity: 1, x: 0, transition: { duration: 0.4 } } },
          },
        },
      ],
      breakpoints: [
        { id: "1ebocfq", minWidth: 1200, maxWidth: null, name: null },
        { id: "tq1gxe", minWidth: 810, maxWidth: 1199.98, name: null },
        { id: "72rtr7", minWidth: 0, maxWidth: 809.98, name: null },
      ],
      nodeIdByAppearId: new Map([["hero", "n1"]]),
      scope: "abcdef",
    });
    expect(result.rules).toHaveLength(1);
    const rule = result.rules[0];
    // The explicits carry their own condition; `default` covers what is left
    // (the widest range, since no breakpoint reaches wider than 1200).
    expect(Object.keys(rule?.contexts ?? {})).toContain("@media (max-width: 809.98px)");
    expect(rule?.keyframes.length).toBeGreaterThanOrEqual(2);
  });

  it("reports an appear id whose element was folded away", () => {
    const result = compileAppearRules({
      specs,
      breakpoints: [],
      nodeIdByAppearId: new Map(),
      scope: "abcdef",
    });
    expect(result.compiled).toBe(0);
    expect(result.findings[0]?.appearId).toBe("hero");
    expect(result.findings[0]?.reason).toContain("keinem Knoten");
  });

  it("reports an entry without an end state instead of doing nothing", () => {
    const result = compileAppearRules({
      specs: [{ appearId: "hero", variants: { default: { initial: { opacity: 0.001, y: 40 } } } }],
      breakpoints: [],
      nodeIdByAppearId: new Map([["hero", "n1"]]),
      scope: "abcdef",
    });
    expect(result.compiled).toBe(0);
    expect(result.findings[0]?.reason).toContain("keinen Endzustand");
  });
});

describe("the rules reach the mapped document", () => {
  const html = page(
    {
      hero: { default: variant({ y: 40 }, {}, { type: "duration", duration: 1.4 }) },
      side: { default: variant({ x: 150 }, {}, { type: "duration", duration: 0.5 }) },
      tilt: { default: variant({ rotateX: -25 }, {}, { type: "duration", duration: 0.8 }) },
    },
    '<div data-framer-appear-id="hero" style="opacity:0.001;transform:translateY(40px)">Held</div>' +
      '<div data-framer-appear-id="side" style="opacity:0.001;transform:translateX(150px)">Seite</div>' +
      '<div data-framer-appear-id="tilt" style="opacity:0.001">Kippt</div>',
  );

  it("adds one rule per effect, with keyframes and the class on the node", () => {
    const document = captureHtml({ html });
    const normalized = normalize(document, { mode: "fidelity" });
    const mapped = mapDocument(document, normalized.rules);
    const appearRules = mapped.rules.filter((rule) => rule.rawCss !== undefined);
    expect(appearRules).toHaveLength(3);
    const heroRule = appearRules.find((rule) => rule.name.includes("appear-1"));
    expect(heroRule?.rawCss).toContain("@keyframes");
    expect(heroRule?.rawCss).toContain("translateY(40px)");
    // The 1.4 s of the source, in the declaration the bake writes. Milliseconds
    // since the spring path landed: the settle time of a spring is not a whole
    // number of seconds.
    expect(heroRule?.styles["animation"]).toContain("1400ms");
    // Every effect that used to be a finding now has a rule — including the
    // sideways slide and the 3D tilt, which no preset can express.
    const all = appearRules.map((rule) => rule.rawCss ?? "").join("\n");
    expect(all).toContain("translateX(150px)");
    expect(all).toContain("rotateX(-25deg)");
  });

  it("assigns the rule class to the node it belongs to", () => {
    const document = captureHtml({ html });
    const normalized = normalize(document, { mode: "fidelity" });
    const mapped = mapDocument(document, normalized.rules);
    const withClass = Object.values(mapped.document.nodes).filter(
      (node) => (node.classes ?? []).some((name) => name.includes("appear")),
    );
    expect(withClass).toHaveLength(3);
  });

  it("keeps the effect that has a preset out of the duplicate path", () => {
    // The hero (a fade-up) is both a preset mapping and a keyframe rule. Both
    // must exist: the preset is what the editor shows, the keyframes are what
    // the page plays. The node is not hidden by the start state.
    const document = captureHtml({ html });
    const normalized = normalize(document, { mode: "fidelity" });
    const mapped = mapDocument(document, normalized.rules);
    const hero = Object.values(mapped.document.nodes).find(
      (node) => (node.classes ?? []).some((name) => name.includes("appear-1")),
    );
    expect(hero?.props["style"] ?? "").not.toContain("opacity: 0.001");
  });
});
