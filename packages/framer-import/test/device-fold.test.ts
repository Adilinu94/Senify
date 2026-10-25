import { describe, expect, it } from "vitest";
import { captureHtml, normalize, mapDocument } from "../src/index.ts";

// U1 (docs/fahrplan-framer-import.md): the per-breakpoint duplicates stacked
// instead of folding. Measured on last-studio — 9354 px source, 17378 px import
// (+8024), last-studio's own card stack written as two `ssr-variant` copies.
//
// Three things had to be right together, and each alone was not enough:
//
//  1. The page must know its breakpoints. last-studio ships NO
//     `__framer__breakpoints`; its hashes and ranges stand in the
//     `data-framer-breakpoint-css` style block. Donutshop writes the same rule
//     under a component ancestor (`.framer-BsqgT .hidden-72rtr7`) and with
//     600/1200 instead of 810/1200.
//  2. `hidden-<hash>` belongs to the ONE element its wrapper dissolves into,
//     not to the subtree. Passing it down made every child inherit its
//     parent's device (refined: tablet 2.4 → 16.9 %).
//  3. A copy is hidden on the devices its own hashes name and visible on the
//     rest — the rest being the devices the PAGE declares, not just the ones
//     this sibling list mentions.

const page = (body: string, head = ""): string =>
  `<html lang="de"><head><title>t</title>${head}</head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`;

const BREAKPOINT_CSS = `<style data-framer-breakpoint-css>@media(min-width: 1200px){.hidden-desk{display:none!important}}@media(min-width: 810px) and (max-width: 1199.98px){.hidden-tab{display:none!important}}@media(max-width: 809.98px){.hidden-mob{display:none!important}}</style>`;

describe("U1: the breakpoints of a page without the channel", () => {
  it("reads the hash ranges from the page's own breakpoint style block", () => {
    const document = captureHtml({ html: page("<div>Text</div>", BREAKPOINT_CSS) });
    expect(document.breakpoints.map((entry) => entry.id).sort()).toEqual(["desk", "mob", "tab"]);
    const tab = document.breakpoints.find((entry) => entry.id === "tab");
    expect(tab?.minWidth).toBe(810);
    expect(tab?.maxWidth).toBe(1199.98);
    const mob = document.breakpoints.find((entry) => entry.id === "mob");
    expect(mob?.minWidth).toBe(0);
    expect(mob?.maxWidth).toBe(809.98);
  });

  it("reads a rule that sits under a component ancestor (donutshop's shape)", () => {
    const css =
      `<style data-framer-breakpoint-css>` +
      `@media (min-width: 1200px){.framer-BsqgT .hidden-desk{display:none!important}}` +
      `@media (min-width: 600px) and (max-width: 1199px){.framer-BsqgT .hidden-tab{display:none!important}}` +
      `@media (max-width: 599px){.framer-BsqgT .hidden-mob{display:none!important}}` +
      `</style>`;
    const document = captureHtml({ html: page("<div>Text</div>", css) });
    expect(document.breakpoints.map((entry) => entry.id).sort()).toEqual(["desk", "mob", "tab"]);
    // Donutshop's pair is 600/1200, not the 810/1200 of other templates.
    expect(document.breakpoints.find((entry) => entry.id === "tab")?.minWidth).toBe(600);
  });

  it("prefers the channel when the page has one", () => {
    const channel = `<script type="application/json" id="__framer__breakpoints">${JSON.stringify([
      { hash: "fromchannel", mediaQuery: "(max-width: 700px)" },
    ])}</script>`;
    const document = captureHtml({ html: page("<div>Text</div>", `${channel}${BREAKPOINT_CSS}`) });
    expect(document.breakpoints.map((entry) => entry.id)).toEqual(["fromchannel"]);
  });
});

describe("U1: the copies fold instead of stacking", () => {
  // The three copies of one element, each wrapped on its own — the shape that
  // made last-studio 8024 px too tall.
  const body =
    `<div class="ssr-variant hidden-tab hidden-mob"><section class="framer-1a">Desktop</section></div>` +
    `<div class="ssr-variant hidden-desk hidden-mob"><section class="framer-1a">Tablet</section></div>` +
    `<div class="ssr-variant hidden-desk hidden-tab"><section class="framer-1a">Mobil</section></div>`;

  it("keeps three copies when their text differs, each on its own device", () => {
    const document = captureHtml({ html: page(body, BREAKPOINT_CSS) });
    const normalized = normalize(document, { mode: "fidelity" });
    const mapped = mapDocument(document, normalized.rules);
    // Different text means a different element per device: folding would lose
    // content, so three nodes stay — but each is shown on exactly ONE device,
    // never on all three and never on none.
    const rootChildren = mapped.document.nodes["root"]?.children ?? [];
    expect(rootChildren).toHaveLength(3);
    const visibilities = rootChildren
      .map((id) => ((mapped.document.nodes[id] as { visibleDevices?: string[] }).visibleDevices ?? []).slice().sort())
      .sort();
    expect(visibilities).toEqual([["desktop"], ["mobile"], ["tablet"]]);
  });

  it("folds identical copies into one node with all three devices", () => {
    const same =
      `<div class="ssr-variant hidden-tab hidden-mob"><section class="framer-1a"><p>Gleich</p></section></div>` +
      `<div class="ssr-variant hidden-desk hidden-mob"><section class="framer-1a"><p>Gleich</p></section></div>` +
      `<div class="ssr-variant hidden-desk hidden-tab"><section class="framer-1a"><p>Gleich</p></section></div>`;
    const document = captureHtml({ html: page(same, BREAKPOINT_CSS) });
    const normalized = normalize(document, { mode: "fidelity" });
    const mapped = mapDocument(document, normalized.rules);
    // One section on the root, and the fold counted its two merges.
    expect(mapped.document.nodes["root"]?.children ?? []).toHaveLength(1);
    expect(mapped.stats.mergedVariants).toBeGreaterThanOrEqual(2);
    // The folded node states all three devices, so no device is blank.
    const section = Object.values(mapped.document.nodes).find((node) => node.primitive !== "root" && node.primitive !== "text");
    expect(section).toBeDefined();
    const visible = (section as { visibleDevices?: string[] }).visibleDevices;
    // Either no restriction (all three) or an explicit list that covers them.
    if (visible !== undefined) expect(visible.sort()).toEqual(["desktop", "mobile", "tablet"]);
  });

  it("never leaves a node visible on no device (the 397-node failure)", () => {
    // Nested one level apart: the wrapper names the devices, the inner element
    // names none. Before the page-wide universe this produced an empty
    // visibility list and the node vanished from every device.
    const nested =
      `<div class="ssr-variant hidden-tab hidden-mob"><div class="framer-1b"><p>A</p></div></div>` +
      `<div class="ssr-variant hidden-desk hidden-mob"><div class="framer-1b"><p>B</p></div></div>` +
      `<div class="ssr-variant hidden-desk hidden-tab"><div class="framer-1b"><p>C</p></div></div>`;
    const document = captureHtml({ html: page(nested, BREAKPOINT_CSS) });
    const normalized = normalize(document, { mode: "fidelity" });
    const mapped = mapDocument(document, normalized.rules);
    const empty = Object.values(mapped.document.nodes).filter(
      (node) => Array.isArray((node as { visibleDevices?: string[] }).visibleDevices) &&
        ((node as { visibleDevices?: string[] }).visibleDevices ?? []).length === 0,
    );
    expect(empty).toEqual([]);
  });

  it("does not pass the wrapper's hidden class down to its children", () => {
    // A wrapper hides ONE element per device. Its children belong to that
    // element and inherit nothing: otherwise a tablet-hidden parent makes every
    // child tablet-hidden too (refined: tablet 2.4 → 16.9 %).
    const html = page(
      `<div class="ssr-variant hidden-tab"><div class="framer-1c"><span class="framer-1d">Kind</span></div></div>`,
      BREAKPOINT_CSS,
    );
    const document = captureHtml({ html });
    const findInner = (node: { children: unknown[]; baseClasses: string[]; states: unknown[] }): unknown => {
      if (node.baseClasses.includes("framer-1d")) return node;
      for (const child of node.children) {
        const found = findInner(child as typeof node);
        if (found !== undefined) return found;
      }
      return undefined;
    };
    const inner = findInner(document.pages[0]?.root as never) as { states: { hiddenAt: string[] }[] } | undefined;
    expect(inner).toBeDefined();
    expect(inner?.states[0]?.hiddenAt).toEqual([]);
  });
});
