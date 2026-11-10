import { describe, expect, it } from "vitest";
import { mergeDeviceVariants, restoreIdLessDeviceVariants } from "../src/import.ts";

// Framer builds ONE breakpoint variant per load. A 1440 px visit never contains
// the phone copy of a section, so the browser capture marks the phone's own
// sections "desktop only" — measured on `rare-works`: five of them, among them
// the products section and the footer, and the baked page came out 2680 px too
// short on a phone (20648 → 17968).
//
// The fix needs a second load at the phone width. Its node for a section is the
// one with BOTH states; the desktop build has one state with the phone's hash in
// `hiddenAt`, which reads as "hidden on a phone".
const node = (over: Record<string, unknown>) => ({
  key: "n1",
  tag: "section",
  htmlId: null,
  states: [{ device: "desktop", hiddenAt: [] }],
  children: [],
  ...over,
});

const document = (root: ReturnType<typeof node>) =>
  ({
    pages: [{ root }],
    breakpoints: [],
    findings: [],
  }) as never;

const navNode = (label: string) => ({
  key: `nav-${label}`,
  tag: "nav",
  kind: "element",
  htmlId: null,
  baseClasses: ["nav"],
  states: [{ device: "desktop", hiddenAt: [], text: { content: label } }],
  children: [],
});

const navWrapper = (key: string, hiddenAt: string[], label: string, htmlId: string | null = null) => ({
  key,
  tag: "div",
  kind: "element",
  htmlId,
  baseClasses: ["framer-1ivqe2h-container"],
  states: [{ device: "desktop", hiddenAt }],
  children: [navNode(label)],
});

const variantDocument = (children: unknown[]) =>
  ({
    pages: [
      {
        root: {
          key: "root",
          tag: "div",
          kind: "element",
          htmlId: null,
          baseClasses: [],
          states: [{ device: "desktop", hiddenAt: [] }],
          children,
        },
      },
    ],
    breakpoints: [
      { id: "phone", minWidth: 0, maxWidth: 809.98, name: null },
      { id: "tablet", minWidth: 810, maxWidth: 1199.98, name: null },
      { id: "desktop", minWidth: 1200, maxWidth: null, name: null },
    ],
    findings: [],
  }) as never;

type NavTestDocument = {
  pages: {
    root: {
      children: {
        visibleOn?: string[];
        children: { states: { text?: { content: string } }[] }[];
      }[];
    };
  }[];
};

describe("mergeDeviceVariants", () => {
  it("nimmt einer Sektion das fälschliche „nur Desktop“", () => {
    // Desktop load: one state, the phone's hash in hiddenAt.
    const desktop = document(node({ htmlId: "products", states: [{ device: "desktop", hiddenAt: ["1xrkzay"] }] }));
    // Phone load: the same section with both states, the phone one visible.
    const phone = document(
      node({
        key: "n202",
        htmlId: "products",
        states: [
          { device: "desktop", hiddenAt: ["1cxb88c"] },
          { device: "mobile", hiddenAt: [] },
        ],
      }),
    );
    const merged = mergeDeviceVariants(desktop, phone, "mobile") as unknown as {
      pages: { root: { visibleOn?: string[]; states: { device: string; hiddenAt: string[] }[] } }[];
    };
    const section = merged.pages[0]?.root;
    expect(section?.visibleOn).toBeUndefined();
    // And the phone's own state stands in, so the mapper cannot re-derive the
    // "hidden on mobile" from the desktop hash.
    expect(section?.states.map((state) => state.device)).toEqual(["desktop", "mobile"]);
    expect(section?.states.every((state) => state.hiddenAt.length === 0)).toBe(true);
  });

  it("lässt eine Sektion stehen, die auf dem Telefon wirklich fehlt", () => {
    const desktop = document(
      node({ htmlId: "desktop-only", visibleOn: ["desktop"], states: [{ device: "desktop", hiddenAt: [] }] }),
    );
    // A section the phone build never renders is not in its document at all —
    // that is what "missing on a phone" looks like, not a node with an empty
    // `hiddenAt` (that one is shown).
    const phone = document(node({ key: "n9", htmlId: "hero", states: [{ device: "desktop", hiddenAt: [] }] }));
    const merged = mergeDeviceVariants(desktop, phone, "mobile") as unknown as {
      pages: { root: { visibleOn?: string[]; states: { device: string }[] } }[];
    };
    // No phone counterpart: the section stays desktop-only, and no phone state
    // was invented for it.
    expect(merged.pages[0]?.root.visibleOn).toEqual(["desktop"]);
    expect(merged.pages[0]?.root.states.map((state) => state.device)).toEqual(["desktop"]);
  });

  it("hängt einen Abschnitt an, den nur der Telefon-Aufbau hat", () => {
    const desktop = document(node({ htmlId: "hero", children: [] }));
    const phone = document(
      node({
        key: "n1",
        htmlId: "hero",
        children: [
          node({ key: "n2", htmlId: "phone-only", tag: "section", states: [{ device: "mobile", hiddenAt: [] }] }),
        ],
      }),
    );
    const merged = mergeDeviceVariants(desktop, phone, "mobile") as unknown as {
      pages: { root: { children: { htmlId?: string; visibleOn?: string[]; states: { device: string }[] }[] } }[];
    };
    const extra = merged.pages[0]?.root.children.find((child) => child.htmlId === "phone-only");
    expect(extra).toBeDefined();
    // It carries a mobile state with nothing hidden: the section is shown there
    // and needs no `visibleOn` — the mapper derives the devices from the state.
    expect(extra?.states?.some((state) => state.device === "mobile")).toBe(true);
  });

  // The two loads number their nodes per document, so the same key names a
  // DIFFERENT element in each. Measured on `rare-works`: `n322` is "Badge Text"
  // (the text "1") at 1440 px and "Word" (the text "finance") at 390 px. A merge
  // that trusted the key put "finance" into the features badge — the section
  // grew from 183 to 272 px.
  it("ordnet über die HTML-id zu, nicht über den IR-Schlüssel", () => {
    const desktop = document(node({ key: "n322", htmlId: "badge", states: [{ device: "desktop", hiddenAt: [] }] }));
    const phone = document(
      node({
        key: "n322", // SAME key, different element in the phone build
        htmlId: "something-else",
        states: [{ device: "desktop", hiddenAt: [] }],
      }),
    );
    const merged = mergeDeviceVariants(desktop, phone, "mobile") as unknown as {
      pages: { root: { states: { device: string }[] } }[];
    };
    // The key matches, the id does not: nothing is merged from the phone build.
    expect(merged.pages[0]?.root.states).toHaveLength(1);
  });

  it("ergänzt id-lose Navigationsvarianten für Tablet und Telefon", () => {
    const browser = variantDocument([navWrapper("d", [], "Desktop")]);
    const statik = variantDocument([
      navWrapper("d", ["phone", "tablet"], "Desktop"),
      navWrapper("t", ["phone", "desktop"], "Tablet"),
      navWrapper("m", ["tablet", "desktop"], "Mobile"),
    ]);
    expect(restoreIdLessDeviceVariants(browser, statik)).toBe(2);
    // A second run must not duplicate the copies.
    expect(restoreIdLessDeviceVariants(browser, statik)).toBe(0);

    const root = (browser as unknown as NavTestDocument).pages[0]?.root;
    expect(root?.children.map((child) => child.children[0]?.states[0]?.text?.content)).toEqual([
      "Desktop",
      "Tablet",
      "Mobile",
    ]);
    expect(root?.children.map((child) => child.visibleOn)).toEqual([
      ["desktop"],
      ["tablet"],
      ["mobile"],
    ]);
  });

  it("ergänzt auch id-lose Überschriften- und Rich-Text-Gruppen", () => {
    const heading = (key: string, hiddenAt: string[], label: string) => ({
      ...navWrapper(key, hiddenAt, label),
      children: [{ ...navNode(label), tag: "h1", baseClasses: ["framer-text"] }],
    });
    const browser = variantDocument([heading("d", [], "Desktop")]);
    const statik = variantDocument([
      heading("d", ["phone", "tablet"], "Desktop"),
      heading("t", ["phone", "desktop"], "Tablet"),
      heading("m", ["tablet", "desktop"], "Mobile"),
    ]);
    expect(restoreIdLessDeviceVariants(browser, statik)).toBe(2);
    const root = (browser as unknown as NavTestDocument).pages[0]?.root;
    expect(root?.children.map((child) => child.children[0]?.states[0]?.text?.content)).toEqual([
      "Desktop",
      "Tablet",
      "Mobile",
    ]);
  });

  it("verdoppelt keine bereits vorhandene Gerätevariante", () => {
    const browser = variantDocument([
      navWrapper("d", [], "Desktop"),
      navWrapper("t", ["phone", "desktop"], "Tablet"),
    ]);
    const statik = variantDocument([
      navWrapper("d", ["phone", "tablet"], "Desktop"),
      navWrapper("t", ["phone", "desktop"], "Tablet"),
      navWrapper("m", ["tablet", "desktop"], "Mobile"),
    ]);
    expect(restoreIdLessDeviceVariants(browser, statik)).toBe(1);
    const root = (browser as unknown as NavTestDocument).pages[0]?.root;
    expect(root?.children).toHaveLength(3);
    expect(root?.children.map((child) => child.visibleOn)).toEqual([
      ["desktop"],
      ["tablet"],
      ["mobile"],
    ]);
  });

  it("ergänzt keine Gruppe ohne Desktop-Variante", () => {
    const browser = variantDocument([navWrapper("d", [], "Desktop")]);
    const statik = variantDocument([
      navWrapper("t", ["phone", "desktop"], "Tablet"),
      navWrapper("m", ["tablet", "desktop"], "Mobile"),
    ]);
    expect(restoreIdLessDeviceVariants(browser, statik)).toBe(0);
  });

  it("lässt id-tragende Varianten dem id-Merge", () => {
    const browser = variantDocument([navWrapper("d", [], "Desktop", "header")]);
    const statik = variantDocument([
      navWrapper("d", ["phone", "tablet"], "Desktop", "header"),
      navWrapper("t", ["phone", "desktop"], "Tablet", "header"),
      navWrapper("m", ["tablet", "desktop"], "Mobile", "header"),
    ]);
    expect(restoreIdLessDeviceVariants(browser, statik)).toBe(0);
  });
});

