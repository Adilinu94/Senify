import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  mapDocument,
  mapUnframerProject,
  normalize,
  parseUnframerXml,
  type FramerIrDocument,
  type IrNode,
} from "@senify/framer-import";
import { SenifyError } from "@senify/core";

// Das Projekt-/Seiten-XML des Unframer-MCP im Import-IR (ADR-0028, Schritt 2).
//
// Die Fixtures tragen die gemessenen Attributnamen (14.09./21.10.2026), keine
// Rohdatei. Was hier bewiesen wird und warum es zaehlt:
// - Namen, Stapel und Tokens kommen an: eine Sektion behaelt ihr Layout, eine
//   Text-Ebene ihren Stil, ein Farbstil-Pfad seinen Wert.
// - Ein Link an einer Karte bleibt ein Link - als Frame-Kind wuerde das Ziel
//   still verschwinden.
// - Was das XML nicht hat (Zeitsteuerung), sagt der Bericht als Fund; was
//   kaputt ist, wirft statt ein halbes Dokument zu liefern.
// - Der Weg endet nicht im IR: Normalisierer und Mapper nehmen die Abbildung
//   unveraendert an (die Laufzeitwirkung bleibt beim Capture, ADR-0027).

const FIXTURES = join(fileURLToPath(new URL("./fixtures/unframer", import.meta.url)));
const PROJECT_XML = readFileSync(join(FIXTURES, "project.xml"), "utf8");
const PAGE_XML = readFileSync(join(FIXTURES, "page-home.xml"), "utf8");
const CAPTURED = "2026-11-01T09:00:00.000Z";

const MINI_PROJECT = `<Project name="Mini"><Pages><Page nodeId="page-mini" path="/" /></Pages></Project>`;

function irOf(pages: { path: string; xml: string }[] = [{ path: "/", xml: PAGE_XML }]): FramerIrDocument {
  return mapUnframerProject({ projectXml: PROJECT_XML, pages, capturedAt: CAPTURED });
}

function findNode(node: IrNode, key: string): IrNode | null {
  if (node.key === key) return node;
  for (const child of node.children) {
    const hit = findNode(child, key);
    if (hit !== null) return hit;
  }
  return null;
}

function nodeOf(document: FramerIrDocument, key: string): IrNode {
  const root = document.pages[0]?.root;
  const found = root === undefined ? null : findNode(root, key);
  if (found === null) throw new Error(`IR-Knoten ${key} fehlt`);
  return found;
}

function ablehnung(fn: () => unknown): SenifyError {
  try {
    fn();
  } catch (error) {
    if (!(error instanceof SenifyError)) throw error;
    return error;
  }
  throw new Error("Erwartet wurde ein Fehler, der Aufruf war gruen.");
}

describe("Unframer-IR: Projekt-XML", () => {
  it("liest Quelle, Seiten, Text- und Farbstile", () => {
    const document = irOf();
    expect(document.ir).toBe(1);
    expect(document.source.kind).toBe("plugin");
    expect(document.source.url).toBeNull();
    expect(document.source.projectId).toBe("Facio");
    expect(document.source.capturedAt).toBe(CAPTURED);
    expect(document.source.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(document.pages.map((page) => page.path)).toEqual(["/"]);

    expect(document.styles.colors).toContainEqual({
      id: "/Blue/Dark Blue",
      name: "/Blue/Dark Blue",
      value: "#0a2540",
    });
    const heading = document.styles.textPresets.find(
      (preset) => preset.id === "/Heading/Heading XL (84px)",
    );
    expect(heading?.values).toMatchObject({
      fontFamily: "Neue Montreal Medium",
      fontWeight: "500",
      fontSize: "84px",
      lineHeight: "1.05",
      letterSpacing: "-0.03em",
    });
    expect(document.styles.fonts).toContainEqual(
      expect.objectContaining({ family: "Neue Montreal Medium", weight: 500 }),
    );
    // The XML is structure only: no motion samples, no breakpoints.
    expect(document.motion).toEqual([]);
    expect(document.breakpoints).toEqual([]);
  });

  it("hasht denselben Abzug gleich und einen geaenderten anders", () => {
    const first = irOf();
    const second = irOf();
    expect(second.source.contentHash).toBe(first.source.contentHash);
    const changed = irOf([{ path: "/", xml: PAGE_XML.replace("Senify", "Senify Zwei") }]);
    expect(changed.source.contentHash).not.toBe(first.source.contentHash);
  });
});

describe("Unframer-IR: Seitenstruktur", () => {
  it("bildet Stapel, Box und Textstil der Sektion ab", () => {
    const document = irOf();
    const hero = nodeOf(document, "/#RPkptGUwn");
    expect(hero.kind).toBe("frame");
    expect(hero.tag).toBe("section");
    const state = hero.states[0];
    expect(state?.layout).toMatchObject({
      mode: "flow",
      direction: "horizontal",
      justify: "center",
    });
    expect(state?.layout?.padding).toEqual({
      top: "168px",
      right: "30px",
      bottom: "54px",
      left: "30px",
    });
    expect(state?.box).toMatchObject({ width: "1fr", height: "100vh" });

    const title = nodeOf(document, "/#hero-title");
    expect(title.kind).toBe("text");
    expect(title.tag).toBe("h1");
    expect(title.states[0]?.text).toMatchObject({
      content: "Senify",
      presetId: "/Heading/Heading XL (84px)",
      tag: "h1",
    });
    expect(title.states[0]?.text?.inline).toMatchObject({
      fontSize: "84px",
      lineHeight: "1.05",
      letterSpacing: "-0.03em",
    });

    const body = nodeOf(document, "/#hero-body");
    expect(body.tag).toBe("p");
    expect(body.states[0]?.text?.content).toBe("Agentur fuer digitale Produkte");
    expect(body.states[0]?.text?.inline["fontSize"]).toBe("16px");
    // The container of the text carries no typography of its own.
    expect(nodeOf(document, "/#hero-content").states[0]?.text).toBeNull();
  });

  it("uebernimmt Komponentenname, Link und Farbstil-Pfad", () => {
    const document = irOf();
    const card = nodeOf(document, "/#hero-card");
    // A link target keeps the element a link; the component name travels
    // separately, so neither is dropped.
    expect(card.kind).toBe("link");
    expect(card.componentType).toBe("Services Card");
    expect(card.href).toBe("/services");
    expect(card.states[0]?.visual["background-color"]).toBe("#0a2540");
    expect(card.states[0]?.layout).toMatchObject({
      mode: "flow",
      direction: "vertical",
      gap: "12px",
      padding: { top: "24px", right: "24px", bottom: "24px", left: "24px" },
    });
    expect(card.states[0]?.box).toMatchObject({ width: "320px" });
    expect(card.children.map((child) => child.key)).toEqual(["/#hero-card-title"]);

    const cardTitle = nodeOf(document, "/#hero-card-title");
    expect(cardTitle.states[0]?.text?.content).toBe("Services");
    expect(cardTitle.states[0]?.text?.inline["color"]).toBe("#ffffff");
  });

  it("sammelt Bilder als Assets mit ihrer URL", () => {
    const document = irOf();
    const image = nodeOf(document, "/#hero-bg");
    expect(image.kind).toBe("image");
    expect(image.tag).toBe("img");
    expect(image.assetUrl).toBe("https://framerusercontent.com/images/hero.jpg");
    expect(document.assets).toContainEqual(
      expect.objectContaining({
        url: "https://framerusercontent.com/images/hero.jpg",
        kind: "image",
      }),
    );
  });

  it("meldet fehlende Zeitsteuerung statt sie zu verschweigen", () => {
    const document = irOf();
    const finding = document.findings.find((entry) => entry.kind === "motion-absent");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("info");
    expect(finding?.evidence).toMatch(/21\.10\.2026/);
    expect(finding?.suggestion).toMatch(/ADR-0027/);
  });

  it("bildet ein Raster ueber gridColumns ab", () => {
    const document = mapUnframerProject({
      projectXml: MINI_PROJECT,
      pages: [
        {
          path: "/",
          xml: '<Page path="/"><Stats nodeId="stats" layout="grid" gridColumns="3" gap="20px" /></Page>',
        },
      ],
      capturedAt: CAPTURED,
    });
    const stats = nodeOf(document, "/#stats");
    expect(stats.states[0]?.layout).toEqual({
      mode: "grid",
      columns: "repeat(3, minmax(0, 1fr))",
      gap: "20px",
    });
  });
});

describe("Unframer-IR: der Parser", () => {
  it("liest Kommentare, Deklaration, Entities und CDATA", () => {
    const root = parseUnframerXml(
      `<!-- vor -->\n<?xml version="1.0"?>\n<A text="Tom &amp; Jerry &#x2713;" note="a &gt; b">Hallo <![CDATA[<welt>]]></A>`,
      "test",
    );
    expect(root.name).toBe("A");
    expect(root.attrs["text"]).toBe("Tom & Jerry \u2713");
    expect(root.attrs["note"]).toBe("a > b");
    expect(root.text).toContain("<welt>");
  });

  it("wirft bei kaputtem XML statt halb zu lesen", () => {
    const unclosed = ablehnung(() => parseUnframerXml("<Project>", "test"));
    expect(unclosed.category).toBe("validation");
    const mismatch = ablehnung(() => parseUnframerXml("<A></B>", "test"));
    expect(mismatch.category).toBe("validation");
    const mehrere = ablehnung(() => parseUnframerXml("<A/><B/>", "test"));
    expect(mehrere.category).toBe("validation");
    const leer = ablehnung(() => parseUnframerXml("   ", "test"));
    expect(leer.category).toBe("validation");
  });
});

describe("Unframer-IR: sichtbares Scheitern", () => {
  it("verlangt ein Projekt-XML als Wurzel", () => {
    const error = ablehnung(() =>
      mapUnframerProject({ projectXml: "<Something />", pages: [{ path: "/", xml: PAGE_XML }] }),
    );
    expect(error.category).toBe("validation");
    expect(error.field).toBe("projectXml");
  });

  it("verlangt mindestens eine Seite", () => {
    const error = ablehnung(() => mapUnframerProject({ projectXml: PROJECT_XML, pages: [] }));
    expect(error.category).toBe("validation");
    expect(error.field).toBe("pages");
  });

  it("verwirft einen widerspruechlichen Seitenpfad", () => {
    const error = ablehnung(() =>
      mapUnframerProject({ projectXml: PROJECT_XML, pages: [{ path: "/about", xml: PAGE_XML }] }),
    );
    expect(error.category).toBe("validation");
    expect(error.field).toBe("pages");
  });

  it("wirft bei kaputtem Seiten-XML", () => {
    const error = ablehnung(() =>
      mapUnframerProject({
        projectXml: MINI_PROJECT,
        pages: [{ path: "/", xml: '<Page path="/"><X></Page>' }],
      }),
    );
    expect(error.category).toBe("validation");
  });
});

describe("Unframer-IR: durch Normalisierer und Mapper", () => {
  it("erzeugt aus dem Projekt-XML eine Seite mit Klassen und Zielen", () => {
    const document = irOf();
    const normalized = normalize(document);
    expect(normalized.rules.length).toBeGreaterThan(0);
    const mapped = mapDocument(document, normalized.rules);
    type EditorNode = { primitive: string; props: Record<string, unknown>; classes?: string[] };
    const nodes = mapped.document.nodes as Record<string, EditorNode>;

    const titleId = mapped.nodeIdByIrKey["/#hero-title"];
    expect(titleId).toBeDefined();
    const title = nodes[titleId as string];
    expect(title?.primitive).toBe("heading");
    expect(title?.props["text"]).toBe("Senify");
    expect(title?.props["level"]).toBe("h1");
    const titleRule = mapped.document.styleRules.find((rule) => rule.name === title?.classes?.[0]);
    expect(titleRule?.styles["fontSize"]).toBe("84px");
    expect(titleRule?.styles["lineHeight"]).toBe("1.05");

    const heroId = mapped.nodeIdByIrKey["/#RPkptGUwn"];
    const hero = nodes[heroId as string];
    expect(hero?.props["display"]).toBe("flex");
    expect(hero?.props["flexDirection"]).toBe("row");
    expect(hero?.props["padding"]).toEqual({
      top: "168px",
      right: "30px",
      bottom: "54px",
      left: "30px",
    });
    expect(hero?.props["width"]).toBe("1fr");
    expect(hero?.props["height"]).toBe("100vh");
    const heroRule = mapped.document.styleRules.find((rule) => rule.name === hero?.classes?.[0]);
    expect(heroRule?.styles["justifyContent"]).toBe("center");

    const cardId = mapped.nodeIdByIrKey["/#hero-card"];
    const card = nodes[cardId as string];
    // A card whose children are text only becomes a link with a label; the
    // target survives (a frame kind would have dropped it silently).
    expect(card?.primitive).toBe("link");
    expect(card?.props["link"]).toEqual({ url: "/services", newTab: false });
    expect(card?.props["label"]).toBe("Services");
    const cardRule = mapped.document.styleRules.find((rule) => rule.name === card?.classes?.[0]);
    expect(cardRule?.styles["backgroundColor"]).toBe("#0a2540");

    const imageId = mapped.nodeIdByIrKey["/#hero-bg"];
    const image = nodes[imageId as string];
    expect(image?.primitive).toBe("image");
    expect(image?.props["asset"]).toEqual({
      assetId: "https://framerusercontent.com/images/hero.jpg",
    });
  });
});
