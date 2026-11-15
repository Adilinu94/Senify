import { describe, expect, it } from "vitest";
import { captureFixture, captureHtml, fontFamilyName, normalize, mapDocument, ruleScopeOf } from "@senify/framer-import";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = join(fileURLToPath(new URL("./fixtures", import.meta.url)));

// The mapper (plan S1.3/S1.5): IR → EditorDocument with the device merge.
// The merge anchor is the measured S0 finding: Framer duplicates elements per
// breakpoint with a shared base-class signature and one framer-v-<hash> each.

describe("mapDocument", () => {
  it("produces a valid EditorDocument shape (version 2, root, styleRules)", () => {
    const document = captureFixture(join(FIXTURES, "framer-stupendous-football-158496"));
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    expect(mapped.document.version).toBe(2);
    expect(mapped.document.rootNodeId).toBe("root");
    expect(mapped.document.nodes["root"]).toBeDefined();
    expect(mapped.document.styleRules.length).toBeGreaterThan(0);
    // Every rule carries the import provenance.
    for (const rule of mapped.document.styleRules) {
      expect(rule.origin?.source).toBe("framer-import");
      // An HTML capture repeats its base declarations in the node props, so
      // the bake may drop them from the rule. Only the project path needs the
      // keepBase marker.
      expect(rule.origin?.keepBase).toBeUndefined();
    }
  });

  it("scopes node ids per page so the site-wide CSS cannot collide", () => {
    const document = captureFixture(join(FIXTURES, "framer-stupendous-football-158496"));
    const normalized = normalize(document);
    const first = mapDocument(document, normalized.rules, { nodeIdPrefix: "fi-aaaaaa-" });
    const second = mapDocument(document, normalized.rules, { nodeIdPrefix: "fi-bbbbbb-" });
    const firstIds = Object.keys(first.document.nodes).filter((id) => id !== "root");
    const secondIds = new Set(Object.keys(second.document.nodes).filter((id) => id !== "root"));
    expect(firstIds.length).toBeGreaterThan(0);
    expect(firstIds.every((id) => id.startsWith("fi-aaaaaa-"))).toBe(true);
    expect(firstIds.some((id) => secondIds.has(id))).toBe(false);
  });

  it("keeps structurally different header variants, each visible on its own device only", () => {
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    // The S0 measurement: three <header> elements (desktop/tablet/phone) in
    // ssr-variant wrappers. Their markup differs per breakpoint (the phone
    // header has another menu structure), so they cannot fold into one node
    // without losing content. Each copy states where it is shown instead, so
    // exactly one header is visible on every device.
    type Shown = { visibleDevices?: string[]; hiddenDevices?: string[]; children?: string[] };
    const nodes = mapped.document.nodes as Record<string, Shown & { primitive: string; props: Record<string, unknown> }>;
    const shownOn = (node: Shown, device: string): boolean =>
      (node.visibleDevices === undefined || node.visibleDevices.includes(device)) &&
      node.hiddenDevices?.includes(device) !== true;
    // A copy can be hidden by the container that wraps it, so visibility is the
    // node's own flag AND every ancestor's.
    const visibleHeaders = (device: string): number => {
      let count = 0;
      const walk = (id: string, visible: boolean): void => {
        const node = nodes[id];
        if (node === undefined) return;
        const here = visible && shownOn(node, device);
        if (here && node.primitive === "frame" && node.props["semantic"] === "header") count += 1;
        for (const child of node.children ?? []) walk(child, here);
      };
      walk(mapped.document.rootNodeId, true);
      return count;
    };
    const all = Object.values(nodes).filter((node) => node.primitive === "frame" && node.props["semantic"] === "header");
    expect(all).toHaveLength(3);
    for (const device of ["desktop", "tablet", "mobile"]) expect(visibleHeaders(device)).toBe(1);
    // Identical copies elsewhere in the document do fold.
    expect(mapped.stats.mergedVariants).toBeGreaterThan(0);
  });

  it("maps headings to the heading primitive with a level", () => {
    const document = captureFixture(join(FIXTURES, "framer-stupendous-football-158496"));
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    const headings = Object.values(mapped.document.nodes).filter(
      (node) => node.primitive === "heading",
    );
    expect(headings.length).toBeGreaterThan(0);
    for (const heading of headings) {
      const level = heading.props["level"];
      expect(["h1", "h2", "h3", "h4", "h5", "h6"]).toContain(level);
    }
  });

  it("carries links with their href — as link nodes or inside body html", () => {
    const document = captureFixture(join(FIXTURES, "framer-stupendous-football-158496"));
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    const links = Object.values(mapped.document.nodes).filter(
      (node) => node.primitive === "link",
    );
    const bodies = Object.values(mapped.document.nodes).filter(
      (node) => node.primitive === "body",
    );
    const htmlWithHref = bodies.some((body) =>
      String(body.props["html"] ?? "").includes('href="'),
    );
    // Framer's navigation is a rich-text container with <a> children — those
    // ride in the body html. Standalone text links become link nodes. At
    // least one of the two forms must exist, never neither.
    expect(links.length > 0 || htmlWithHref).toBe(true);
    const withUrl = links.find((link) => {
      const target = link.props["link"];
      return typeof target === "object" && target !== null && "url" in target;
    });
    if (links.length > 0) expect(withUrl).toBeDefined();
  });

  it("keeps the full mixed text and inline markup of a text link", () => {
    const document = captureHtml({
      html:
        `<html lang="de"><head><title>t</title></head><body>` +
        `<div id="main" data-framer-hydrate-v2><div>` +
        `<a href="/x">Hallo <strong>Welt</strong> fertig</a>` +
        `</div></div></body></html>`,
      pagePath: "/",
    });
    const mapped = mapDocument(document, normalize(document).rules);
    const link = Object.values(mapped.document.nodes).find((node) => node.primitive === "link");
    expect(link?.props["label"]).toBe("Hallo Welt fertig");
    expect(String(link?.props["html"] ?? "")).toContain("<strong");
    expect(String(link?.props["html"] ?? "")).toContain("Hallo");
    expect(String(link?.props["html"] ?? "")).toContain("fertig");
  });

  it("keeps a plain link without an html prop", () => {
    const document = captureHtml({
      html:
        `<html lang="de"><head><title>t</title></head><body>` +
        `<div id="main" data-framer-hydrate-v2><div>` +
        `<a href="/y">Direkt</a>` +
        `</div></div></body></html>`,
      pagePath: "/",
    });
    const mapped = mapDocument(document, normalize(document).rules);
    const link = Object.values(mapped.document.nodes).find((node) => node.primitive === "link");
    expect(link?.props["label"]).toBe("Direkt");
    expect(link?.props["html"]).toBeUndefined();
  });

  it("derives a theme patch from the font faces", () => {
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    // The fixture ships Inter (measured in S0) — the patch must name it.
    expect(mapped.themePatch.fonts).toBeDefined();
    expect(mapped.themePatch.fonts?.body?.family).toBe("Inter");
    expect(mapped.themePatch.fonts?.body?.weights.length).toBeGreaterThan(0);
  });

  it("names a font family the way the CSS writes it", () => {
    // `'Manrope'` and `Manrope` are the same family — the quotes belong to
    // the CSS. A patch that treats them as two families loses the weights of
    // the quoted one, and the theme would write a family with a quote in it,
    // which no font matches.
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    const families = [mapped.themePatch.fonts?.body?.family, mapped.themePatch.fonts?.display?.family]
      .filter((family): family is string => family !== undefined);
    for (const family of families) {
      expect(family).not.toMatch(/['"]/);
      expect(family.trim()).toBe(family);
    }
  });

  it("gives the display font every weight of its family", () => {
    // The theme writes one `@font-face` per weight. A display font with only
    // the heaviest weight would answer a heading at 700 with the 800 face,
    // and the browser would synthesise the rest.
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    const display = mapped.themePatch.fonts?.display;
    if (display === undefined) return;
    const weights = new Set<number>();
    for (const font of document.styles.fonts) {
      if (font.src.length === 0 || font.weight === null) continue;
      if (fontFamilyName(font.family) !== display.family) continue;
      weights.add(font.weight);
    }
    if (weights.size === 0) return;
    expect([...display.weights].sort((a, b) => a - b)).toEqual([...weights].sort((a, b) => a - b));
  });

  it("reports smooth-scroll findings through (S1.6)", () => {
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    expect(mapped.findings.some((finding) => finding.kind === "smooth-scroll")).toBe(true);
  });

  it("points the source's families at the theme's font slots", () => {
    // A page must not name a family the site does not have: without a
    // `@font-face` the browser falls back to the system font, and every text
    // of the imported page looks different from the source. The families point
    // at the theme's slots instead; the theme patch puts the source's own
    // fonts into them.
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    const werte = new Set<string>();
    for (const node of Object.values(mapped.document.nodes)) {
      for (const [schluessel, wert] of Object.entries(node.props)) {
        if (!schluessel.startsWith("fontFamily")) continue;
        werte.add(String(wert));
      }
    }
    for (const regel of mapped.rules) {
      const wert = regel.styles["fontFamily"];
      if (wert !== undefined) werte.add(String(wert));
    }
    expect(werte.size).toBeGreaterThan(0);
    for (const wert of werte) {
      // Either a theme slot or a family that exists everywhere (a generic
      // one) — but never a family of the source that the site does not have.
      if (wert.startsWith("var(--font-")) continue;
      expect(wert).not.toMatch(/Inter|Manrope|Figtree/);
    }
    expect([...werte].some((wert) => wert === "var(--font-body)")).toBe(true);
  });

  it("keeps a monospace family on the theme's mono slot", () => {
    // The normalize already reports a monospace family as one that is mapped
    // to the theme's font. The mapping has to be true, not just reported.
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    const slots = new Set<string>();
    for (const node of Object.values(mapped.document.nodes)) {
      for (const [schluessel, wert] of Object.entries(node.props)) {
        if (!schluessel.startsWith("fontFamily")) continue;
        if (/mono|code|courier/i.test(String(wert))) slots.add(String(wert));
      }
    }
    // The fixture has no monospace text — then there is nothing to map. If it
    // has one, it must land on the mono slot.
    for (const slot of slots) expect(slot).toBe("var(--font-mono)");
  });

  it("keeps the text of an inline tag inline", () => {
    // The `text` primitive renders a `<p>` — a block. The source's text often
    // sits in a `<span>`, and as a paragraph it breaks the line where the
    // source did not: the testimonial of the Earn template is three inline
    // spans in one paragraph, and as three paragraphs it takes five lines
    // instead of four (the whole page grew by the height of the block).
    const html =
      `<html lang="en"><head><title>t</title></head><body><div id="main" data-framer-hydrate-v2>` +
      `<div style="white-space:pre-wrap"><span>Ein </span><span>Absatz</span></div>` +
      `</div></body></html>`;
    const document = captureHtml({ html });
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    const texte = Object.values(mapped.document.nodes).filter(
      (node) => node.primitive === "text" && typeof node.props["text"] === "string",
    );
    expect(texte.length).toBe(2);
    for (const node of texte) expect(node.props["display"]).toBe("inline");
  });

  it("keeps the display of the source when it names one", () => {
    // The source's own cascade decides — only the browser's default for the
    // tag is filled in.
    const html =
      `<html lang="en"><head><title>t</title></head><body><div id="main" data-framer-hydrate-v2>` +
      `<div><span style="display:block">Ein Absatz</span></div>` +
      `</div></body></html>`;
    const document = captureHtml({ html });
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    const text = Object.values(mapped.document.nodes).find((node) => node.primitive === "text");
    expect(text?.props["display"]).toBe("block");
  });

  it("keeps the source's families in the fidelity mode", () => {
    // "Originalgetreu" keeps the page the source's page: its fonts stay
    // named. The theme patch ("Theme-Fonts übernehmen") then supplies exactly
    // those files. In the DNA mode the page joins the site's typography
    // instead (the slots).
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    const normalized = normalize(document, { mode: "fidelity" });
    const mapped = mapDocument(document, normalized.rules, { mode: "fidelity" });
    const werte = new Set<string>();
    for (const node of Object.values(mapped.document.nodes)) {
      for (const [schluessel, wert] of Object.entries(node.props)) {
        if (!schluessel.startsWith("fontFamily")) continue;
        werte.add(String(wert));
      }
    }
    for (const regel of mapped.rules) {
      const wert = regel.styles["fontFamily"];
      if (wert !== undefined) werte.add(String(wert));
    }
    expect([...werte].some((wert) => wert.startsWith("var(--font-"))).toBe(false);
    // The finding belongs to the DNA mode only — in fidelity mode nothing was
    // mapped.
    expect(mapped.findings.some((finding) => finding.kind === "font-mapping")).toBe(false);
  });

  it("reports the font mapping as a finding", () => {
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    const befund = mapped.findings.find((finding) => finding.kind === "font-mapping");
    expect(befund).toBeDefined();
    expect(befund?.severity).toBe("info");
  });

  it("keeps every node id unique and children consistent", () => {
    const document = captureFixture(join(FIXTURES, "framer-easier-train-154753"));
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    const ids = Object.keys(mapped.document.nodes);
    expect(new Set(ids).size).toBe(ids.length);
    for (const node of Object.values(mapped.document.nodes)) {
      for (const child of node.children ?? []) {
        expect(mapped.document.nodes[child]).toBeDefined();
      }
    }
  });

  it("isoliert gleiche Farbtoken-IDs auf verschiedenen Seiten", () => {
    const token = "11111111-1111-1111-1111-111111111111";
    const page = (color: string, path: string): string =>
      `<html lang="de"><head><title>${path}</title><style>:root{--token-${token}:${color}}.x{color:var(--token-${token}, ${color})}</style></head><body><div id="main" data-framer-hydrate-v2><div class="x" style="color:var(--token-${token}, ${color})">Text</div><svg viewBox="0 0 10 10"><path d="M0 0h10v10z" fill="var(--token-${token}, ${color})"/></svg></div></body></html>`;
    const pathA = "/seite-a";
    const pathB = "/seite-b";
    const docA = captureHtml({ html: page("rgb(1, 1, 1)", pathA), pagePath: pathA });
    const docB = captureHtml({ html: page("rgb(2, 2, 2)", pathB), pagePath: pathB });
    const scopeA = ruleScopeOf(pathA);
    const scopeB = ruleScopeOf(pathB);
    const mappedA = mapDocument(docA, normalize(docA).rules, { nodeIdPrefix: `fi-${scopeA}-` });
    const mappedB = mapDocument(docB, normalize(docB).rules, { nodeIdPrefix: `fi-${scopeB}-` });

    const allRules = [...mappedA.document.styleRules, ...mappedB.document.styleRules];
    const tokenRules = allRules.filter((rule) => rule.kind === "ambient" && Object.keys(rule.styles).some((name) => name.includes(`--token-`)));
    expect(tokenRules).toHaveLength(2);
    expect(new Set(tokenRules.map((rule) => rule.id)).size).toBe(2);
    const tokenValues = tokenRules.flatMap((rule) => Object.entries(rule.styles).filter(([name]) => name.includes("--token-")).map(([, value]) => value));
    expect(tokenValues).toContain("rgb(1, 1, 1)");
    expect(tokenValues).toContain("rgb(2, 2, 2)");

    const vars = (mapped: typeof mappedA): string[] => {
      const values: string[] = [];
      for (const rule of mapped.document.styleRules) {
        for (const value of Object.values(rule.styles)) values.push(String(value));
      }
      for (const node of Object.values(mapped.document.nodes)) {
        for (const value of Object.values(node.props)) values.push(String(value));
      }
      return values.filter((value) => value.includes(`--token-`));
    };
    expect(vars(mappedA).every((value) => value.includes(scopeA))).toBe(true);
    expect(vars(mappedB).every((value) => value.includes(scopeB))).toBe(true);
  });
});

describe("Überschriften-Hierarchie (Release-Tor)", () => {
  // Das Release-Tor verbietet Ebenen-Sprünge (h1 → h4, hart) und empfiehlt h1
  // als erste Überschrift (weich). Framer-Seiten tragen die Ebenen der Quelle:
  // der Held ist eine h3, Abschnitte springen h2 → h4 (gemessen an Chocolate,
  // 12.11.2026: 20 harte Sprung-Funde über 7 Seiten). Der Import normalisiert
  // die Folge — erste Überschrift h1, kein Aufstieg um mehr als eine Stufe.
  // Die Optik bleibt: die Typografie sitzt auf den Attribut-Selektoren der
  // Knoten, nicht auf dem Tag (der einzige h1–h6-Tag-Selektor im Build ist der
  // Preflight-Reset).
  const page = (body: string): string =>
    `<html lang="en"><head><title>t</title></head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`;

  const mapped = (body: string) => {
    const document = captureHtml({ html: page(body) });
    return mapDocument(document, normalize(document).rules);
  };

  type Node = { primitive: string; props: Record<string, unknown>; children?: string[] };
  const inOrder = (result: ReturnType<typeof mapped>): Node[] => {
    const nodes = result.document.nodes as Record<string, Node>;
    const out: Node[] = [];
    const walk = (id: string): void => {
      const node = nodes[id];
      if (node === undefined) return;
      out.push(node);
      for (const child of node.children ?? []) walk(child);
    };
    walk(result.document.rootNodeId);
    return out;
  };

  it("korrigiert Sprünge und startet mit h1", () => {
    const result = mapped(`<h3>Hero</h3><h4>Sprung</h4><h2>Abschnitt</h2>`);
    const levels = inOrder(result)
      .filter((node) => node.primitive === "heading")
      .map((node) => node.props["level"]);
    expect(levels).toEqual(["h1", "h2", "h2"]);
  });

  it("korrigiert Überschriften im Inline-Markup eines Body", () => {
    const result = mapped(
      `<h1>Titel</h1><div data-framer-component-type="RichTextContainer"><h4>Rich</h4><p>Text</p></div>`,
    );
    const nodes = inOrder(result);
    const heading = nodes.find((node) => node.primitive === "heading");
    expect(heading?.props["level"]).toBe("h1");
    const body = nodes.find((node) => node.primitive === "body");
    expect(String(body?.props["html"] ?? "")).toContain("<h2>Rich</h2>");
    expect(String(body?.props["html"] ?? "")).not.toContain("<h4");
  });

  it("lässt eine saubere Hierarchie unverändert", () => {
    const result = mapped(`<h1>Titel</h1><h2>Abschnitt</h2><h3>Fein</h3>`);
    const levels = inOrder(result)
      .filter((node) => node.primitive === "heading")
      .map((node) => node.props["level"]);
    expect(levels).toEqual(["h1", "h2", "h3"]);
    expect(result.findings.some((finding) => finding.kind === "heading-levels")).toBe(false);
  });

  it("nennt die Korrektur als Fund", () => {
    const result = mapped(`<h3>Hero</h3><h4>Sprung</h4>`);
    const finding = result.findings.find((entry) => entry.kind === "heading-levels");
    expect(finding?.severity).toBe("info");
  });
});
