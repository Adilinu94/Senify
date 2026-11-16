import { describe, expect, it } from "vitest";
import { captureHtml } from "../src/capture-html.ts";
import { normalize } from "../src/normalize.ts";
import { mapDocument } from "../src/mapper.ts";
import type { IrNode } from "../src/ir.ts";

// Framer reveals a headline WORD BY WORD: every word is a `<span>` with its own
// appear state and its own delay (50 ms apart, measured on `rare-works`). The
// import folds those spans into the container's inline markup — and without a
// handle on the span, all eight words collapse onto ONE animation on the `<h1>`:
// the source reveals eight words one after another, the baked page fades a block.
//
// The fix is a class on the span itself (`senify-inline-<id>`), written into the
// same markup the source had, plus one rule per word. This holds the structure
// and the link between the two.
const START = "opacity:0.001;filter:blur(12px);transform:translateX(0px) translateY(28px)";

function page(wordCount: number): string {
  const words = Array.from({ length: wordCount }, (_, index) =>
    `<span style="display:inline-block;${START}">W${index}</span>`,
  ).join(" ");
  return `<!doctype html><html><head><title>T</title></head><body><div id="main">
    <div data-framer-name="Title"><h1>${words}</h1></div>
  </div></body></html>`;
}

function map(html: string): ReturnType<typeof mapDocument> {
  const document = captureHtml({ html, pagePath: "/" });
  return mapDocument(document, normalize(document).rules, { mode: "fidelity" });
}

function findTag(node: IrNode | undefined, tag: string): IrNode | undefined {
  if (node === undefined) return undefined;
  if (node.tag === tag) return node;
  for (const child of node.children) {
    const found = findTag(child, tag);
    if (found !== undefined) return found;
  }
  return undefined;
}

describe("Wort-Einblendungen auf ihren eigenen Spans", () => {
  it("gibt jedem Wort seine eigene Klasse im Markup", () => {
    const mapped = map(page(4));
    const holder = Object.values(mapped.document.nodes).find((node) =>
      String(node.props["html"] ?? "").includes("W0"),
    );
    expect(holder).toBeDefined();
    const html = String(holder?.props["html"] ?? "");
    // One class per word, and none of them repeated: the words are addressed
    // one by one, not by their container.
    const classes = [...html.matchAll(/class="(senify-inline-[^"]+)"/g)].map((match) => match[1]);
    expect(classes).toHaveLength(4);
    expect(new Set(classes).size).toBe(4);
    // The source's own markup survives underneath: same tags, same order.
    expect(html).toContain(">W0</span>");
    expect(html).toContain(">W3</span>");
  });

  it("baut für jedes Wort eine eigene Animation mit eigenem Versatz", () => {
    const mapped = map(page(4));
    const rules = mapped.rules.filter((rule) => rule.name.startsWith("senify-inline-"));
    expect(rules).toHaveLength(4);
    // Every word carries its own `animation` declaration — that is the stagger.
    const animations = rules.map((rule) => String((rule.styles as Record<string, string>)["animation"] ?? ""));
    expect(animations.every((entry) => entry !== "")).toBe(true);
    expect(new Set(animations).size).toBe(4);
    // And each has its own keyframes block (the start state of that word).
    for (const rule of rules) {
      expect(String(rule.rawCss ?? "")).toContain("@keyframes");
    }
  });

  it("zieht eine gemessene Wort-Einblendung auf die Inline-Klasse", () => {
    const document = captureHtml({ html: page(1), pagePath: "/" });
    const span = findTag(document.pages[0]?.root, "span");
    expect(span).toBeDefined();
    // The browser measured the word by its IR key; the static channel never
    // names a span. The measured twin must land on the same inline class, or
    // the word is reported as lost while the derived 0.6 s rule plays.
    document.appear = [
      {
        appearId: span?.key ?? "",
        variants: {
          default: {
            initial: { opacity: 0.001, y: 28 },
            animate: {
              opacity: 1,
              y: 0,
              transition: { type: "sampled", duration: 1.2, easing: "linear(0, 1)" },
            },
          },
        },
      },
    ];
    const mapped = mapDocument(document, normalize(document).rules, { mode: "fidelity" });
    const rules = mapped.rules.filter((rule) => rule.name.startsWith("senify-inline-"));
    expect(rules).toHaveLength(1);
    // The measured 1.2 s wins over the derived 0.6 s default.
    expect(String((rules[0]?.styles as Record<string, string>)["animation"] ?? "")).toContain("1.2s");
    expect(mapped.findings.some((finding) => finding.message.includes("gehört zu keinem Knoten"))).toBe(false);
  });

  it("fasst gemessene IDs ohne Ziel in einen Sammelbefund zusammen", () => {
    const document = captureHtml({ html: page(1), pagePath: "/" });
    const variant = {
      initial: { opacity: 0.001, y: 20 },
      animate: { opacity: 1, y: 0, transition: { type: "duration" as const, duration: 0.5 } },
    };
    document.appear = [
      { appearId: "n9998", variants: { default: variant } },
      { appearId: "n9999", variants: { default: variant } },
    ];
    const mapped = mapDocument(document, normalize(document).rules, { mode: "fidelity" });
    const summary = mapped.findings.filter((finding) =>
      finding.message.includes("ohne Ziel im sichtbaren Baum"),
    );
    expect(summary).toHaveLength(1);
    expect(summary[0]?.message).toContain("2 gemessene");
    expect(mapped.findings.some((finding) => finding.message.includes("gehört zu keinem Knoten"))).toBe(false);
  });

  it("lässt eine Überschrift ohne Wort-Einblendung unverändert", () => {
    const html = `<!doctype html><html><head><title>T</title></head><body><div id="main">
      <h1><span style="display:inline-block">Hallo</span> <span style="display:inline-block">Welt</span></h1>
    </div></body></html>`;
    const mapped = map(html);
    const htmlOf = Object.values(mapped.document.nodes)
      .map((node) => String(node.props["html"] ?? ""))
      .join("");
    expect(htmlOf).not.toContain("senify-inline-");
    expect(mapped.rules.some((rule) => rule.name.startsWith("senify-inline-"))).toBe(false);
  });
});
