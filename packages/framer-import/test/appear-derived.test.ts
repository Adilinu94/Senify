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
