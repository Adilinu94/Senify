import { describe, expect, it } from "vitest";
import { captureHtml, normalize, mapDocument } from "../src/index.ts";

// Step 5, point 1 of the 1:1 plan: a page can carry `data-framer-appear-id`
// without the appear channel. Measured on donutshop (live): 51 marked elements,
// no channel — but 39 of them still carry their start state inline
// (`opacity:0.001; transform:scale(1.2) rotate(10deg)`).
//
// Before this, those elements had no sample, no spec and no finding: the page
// was static where the source moved, silently. The start state is half the
// effect (the other half is the element at rest), so a reveal is derived from
// it. The duration is NOT in the page — it is an assumption, and the finding
// says so instead of presenting it as measured.

function page(body: string, channel?: Record<string, unknown>): string {
  const script =
    channel === undefined
      ? ""
      : `<script type="application/json" id="__framer__appearAnimationsContent">${JSON.stringify(channel)}</script>`;
  return `<html lang="de"><head><title>t</title>${script}</head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`;
}

const START = "opacity:0.001;transform:perspective(1200px) translateX(0px) translateY(0px) scale(1.2) rotate(10deg)";

describe("a page without an appear channel", () => {
  it("derives the reveal from the inline start state", () => {
    const document = captureHtml({
      html: page(
        `<div data-framer-appear-id="hero" style="${START}">Held</div>` +
          `<div data-framer-appear-id="plain" style="opacity:0.001;transform:translateY(40px)">Text</div>`,
      ),
    });
    expect(document.appear).toHaveLength(2);
    const hero = document.appear?.find((spec) => spec.appearId === "hero");
    const initial = hero?.variants["default"]?.initial;
    expect(initial?.opacity).toBe(0.001);
    expect(initial?.scale).toBe(1.2);
    expect(initial?.rotate).toBe(10);
    expect(initial?.transformPerspective).toBe(1200);
    // The effect ends at rest: the element's own layout, no offset, no tilt.
    const animate = hero?.variants["default"]?.animate;
    expect(animate?.opacity).toBe(1);
    expect(animate?.scale).toBe(1);
    expect(animate?.rotate).toBe(0);
  });

  it("names the assumed duration instead of passing it off as measured", () => {
    const document = captureHtml({
      html: page(`<div data-framer-appear-id="hero" style="${START}">Held</div>`),
    });
    const finding = document.findings.find((entry) => entry.message.includes("Appear-id"));
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("info");
    expect(finding?.message).toContain("Annahme");
    expect(finding?.message).toContain("0.6");
    // The movement is derived, the timing is not — the suggestion sends the
    // human to the duration, not to the whole effect.
    expect(finding?.suggestion).toContain("Dauer");
  });

  it("warns when there is neither a channel nor a readable start state", () => {
    const document = captureHtml({
      html: page(`<div data-framer-appear-id="hero">Held</div>`),
    });
    expect(document.appear).toEqual([]);
    const finding = document.findings.find((entry) => entry.message.includes("Appear-id"));
    expect(finding?.severity).toBe("warn");
    expect(finding?.message).toContain("weder einen Appear-Kanal noch einen lesbaren Startzustand");
  });

  it("leaves a plain opacity:0 alone (a designed hidden state, not a reveal)", () => {
    // The closed phone menu. The capture already keeps it as the look; it must
    // not become an animation that fades it in.
    const document = captureHtml({
      html: page(`<div data-framer-appear-id="menu" style="opacity:0">Menü</div>`),
    });
    expect(document.appear).toEqual([]);
  });

  it("does not derive anything when the channel is present", () => {
    // With a channel its values are the truth — deriving from the inline style
    // would be a second, worse source for the same element.
    const document = captureHtml({
      html: page(
        `<div data-framer-appear-id="hero" style="${START}">Held</div>`,
        {
          hero: {
            default: {
              initial: { opacity: 0.001, y: 40, scale: 1, x: 0 },
              animate: { opacity: 1, y: 0, scale: 1, x: 0, transition: { type: "duration", duration: 0.3 } },
            },
          },
        },
      ),
    });
    expect(document.appear).toHaveLength(1);
    // The channel's value (y 40), not the inline one (scale 1.2 / rotate 10).
    expect(document.appear?.[0]?.variants["default"]?.initial?.y).toBe(40);
    expect(document.appear?.[0]?.variants["default"]?.initial?.scale).toBe(1);
    expect(document.findings.some((entry) => entry.message.includes("Appear-id"))).toBe(false);
  });

  it("turns the derived reveal into keyframes in the mapped document", () => {
    const document = captureHtml({
      html: page(`<div data-framer-appear-id="hero" style="${START}">Held</div>`),
    });
    const normalized = normalize(document, { mode: "fidelity" });
    const mapped = mapDocument(document, normalized.rules);
    const rules = mapped.rules.filter((rule) => rule.rawCss !== undefined);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.rawCss).toContain("@keyframes");
    expect(rules[0]?.rawCss).toContain("scale(1.2)");
    expect(rules[0]?.rawCss).toContain("rotate(10deg)");
    expect(rules[0]?.styles["animation"]).toContain("0.6s");
  });
});

// The bigger half of the same gap, measured on `rare-works` (25.10.2026): the
// page carries an appear channel for 8 elements, but 328 FURTHER elements have a
// start state and no `data-framer-appear-id` at all — every word of every
// headline (`blur(12px)` + `translateY(28px)`), the cards that slide in. The
// derivation used to run only when the whole channel was missing, so those 328
// elements stayed frozen at `opacity:0.001` for good.
describe("a start state without an appear id", () => {
  const WORD =
    "display:inline-block;opacity:0.001;filter:blur(12px);transform:translateX(0px) translateY(28px) scale(1) rotate(0deg)";

  it("derives a reveal for an element the source never marked", () => {
    const document = captureHtml({
      html: page(`<h1><span style="${WORD}">Run</span></h1>`),
    });
    expect(document.appear).toHaveLength(1);
    const spec = document.appear?.[0];
    // The synthetic id is recognisable as ours, never a Framer hash.
    expect(spec?.appearId.startsWith("derived-")).toBe(true);
    const initial = spec?.variants["default"]?.initial;
    expect(initial?.opacity).toBe(0.001);
    expect(initial?.y).toBe(28);
    // The deblur is half of a word reveal; without it the word fades in sharp.
    expect(initial?.blur).toBe(12);
  });

  it("keeps the channel's timing for the ids it names and derives the rest", () => {
    const document = captureHtml({
      html: page(
        `<div data-framer-appear-id="hero" style="opacity:0.001;transform:translateY(40px)">Held</div>` +
          `<span style="${WORD}">Wort</span>`,
        {
          hero: {
            default: {
              initial: { opacity: 0.001, y: 40 },
              animate: { opacity: 1, y: 0, transition: { type: "duration", duration: 1.2 } },
            },
          },
        },
      ),
    });
    // Two effects, not one: the channel's and the derived one.
    expect(document.appear).toHaveLength(2);
    const hero = document.appear?.find((spec) => spec.appearId === "hero");
    expect(hero?.variants["default"]?.animate?.transition?.duration).toBe(1.2);
    const derived = document.appear?.find((spec) => spec.appearId.startsWith("derived-"));
    expect(derived).toBeDefined();
    // The derived one states its assumed timing.
    expect(derived?.variants["default"]?.animate?.transition?.duration).toBe(0.6);
  });

  it("does not derive a second effect for an id the channel already names", () => {
    // The channel is the truth for its ids: a derivation on top would be a
    // second, worse source for the same element.
    const document = captureHtml({
      html: page(`<div data-framer-appear-id="hero" style="opacity:0.001;transform:translateY(40px)">Held</div>`, {
        hero: {
          default: {
            initial: { opacity: 0.001, y: 40 },
            animate: { opacity: 1, y: 0, transition: { type: "duration", duration: 0.3 } },
          },
        },
      }),
    });
    expect(document.appear).toHaveLength(1);
    expect(document.appear?.[0]?.appearId).toBe("hero");
  });

  it("staggers siblings of one headline instead of starting them together", () => {
    // Framer writes the words as siblings with the same start state. Measured on
    // the running page: 50 ms apart. Without the stagger every word arrives at
    // once and the effect reads as a single fade.
    const document = captureHtml({
      html: page(
        `<h1><span style="${WORD}">Run</span><span style="${WORD}">Your</span><span style="${WORD}">Money</span></h1>`,
      ),
    });
    expect(document.appear).toHaveLength(3);
    const delays = (document.appear ?? []).map(
      (spec) => spec.variants["default"]?.animate?.transition?.delay ?? 0,
    );
    expect(delays).toEqual([0, 0.05, 0.1]);
  });

  it("writes the deblur into the keyframes, both frames", () => {
    const document = captureHtml({ html: page(`<h1><span style="${WORD}">Run</span></h1>`) });
    const normalized = normalize(document, { mode: "fidelity" });
    const mapped = mapDocument(document, normalized.rules);
    const rules = mapped.rules.filter((rule) => rule.rawCss?.includes("@keyframes"));
    expect(rules).toHaveLength(1);
    const css = rules[0]?.rawCss ?? "";
    expect(css).toContain("blur(12px)");
    // The end frame names the zero explicitly: `blur(12px)` to `none` is not the
    // same interpolation pair in every engine.
    expect(css).toContain("blur(0px)");
  });

  it("leaves a designed hidden state alone even without an id", () => {
    // The closed phone menu carries `opacity:0` and no movement: a reveal would
    // fade it open on every load.
    const document = captureHtml({ html: page(`<div style="opacity:0">Menü</div>`) });
    expect(document.appear).toEqual([]);
  });
});
