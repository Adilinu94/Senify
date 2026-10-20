import { describe, expect, it } from "vitest";
import {
  CASCADE_LAYER,
  PRIMITIVE_BASE_CSS,
  PRIMITIVES,
  PRIMITIVE_RESET,
  cssDefaultValuesOf,
  describePrimitive,
  isCatalogPrimitive,
  primitiveClass,
  primitiveDefinitions,
  primitiveRootClasses,
  type ElementSpec,
  type PropValue,
} from "@senify/widget-engine";

// The markup description is the one source for what a primitive renders
// (Phase 1). These cases hold it to that: every catalog entry has a
// description, the descriptions differ where the catalog differs, the widget
// defaults come from the catalog (not from a second list) and nothing in the
// content stylesheet touches the editor skin.

function spec(type: string, props: Record<string, PropValue> = {}): ElementSpec {
  const described = describePrimitive(type, props);
  expect(described, `no description for "${type}"`).toBeDefined();
  return described as ElementSpec;
}

function flatten(node: ElementSpec): ElementSpec[] {
  return [node, ...(node.children ?? []).flatMap(flatten)];
}

describe("widget markup", () => {
  it("describes every catalog primitive, and nothing else", () => {
    for (const definition of primitiveDefinitions()) {
      const described = describePrimitive(definition.type, {});
      expect(described, definition.type).toBeDefined();
      expect(described?.root).toBe(true);
      expect(described?.tag).toMatch(/^[a-z][a-z0-9]*$/);
      expect(primitiveRootClasses(described as ElementSpec)).toContain(
        primitiveClass(definition.type),
      );
    }
    // 24 foundation stones, and a legacy section type stays with the section
    // render path instead of growing a second description.
    expect(primitiveDefinitions().length).toBe(24);
    expect(describePrimitive("hero")).toBeUndefined();
    expect(isCatalogPrimitive("hero")).toBe(false);
    expect(isCatalogPrimitive("frame")).toBe(true);
  });

  it("takes the element from the catalog value, not from a fixed tag", () => {
    expect(spec("heading", { level: "h1" }).tag).toBe("h1");
    expect(spec("heading", { level: "h4" }).tag).toBe("h4");
    expect(spec("heading", { level: "h9" }).tag).toBe("h2");
    expect(spec("frame", { semantic: "nav" }).tag).toBe("nav");
    expect(spec("frame", { semantic: "script" }).tag).toBe("div");
    expect(spec("list", { ordered: true }).tag).toBe("ol");
    expect(spec("list", {}).tag).toBe("ul");
    expect(spec("input", { inputType: "textarea" }).children?.[1]?.tag).toBe("textarea");
    expect(spec("input", { inputType: "email" }).children?.[1]?.attrs?.type).toBe("email");
  });

  it("carries the catalog choice into a modifier class", () => {
    expect(spec("button", {}).classes).toEqual(["w-button", "w-button--solid", "w-button--md"]);
    expect(spec("button", { variant: "ghost", size: "lg" }).classes).toEqual([
      "w-button",
      "w-button--ghost",
      "w-button--lg",
    ]);
    expect(spec("section", { contentWidth: "full", align: "center" }).classes).toEqual([
      "w-section",
      "w-section--full",
      "w-section--center",
    ]);
  });

  it("keeps the reading order of heading, eyebrow and text", () => {
    const heading = spec("heading", { text: "Kopf", eyebrow: "Neu", level: "h2" });
    expect(heading.text).toBe("Kopf");
    expect(heading.children?.[0]?.classes).toEqual(["w-heading--eyebrow"]);
    expect(heading.children?.[0]?.text).toBe("Neu");
    // Without a kicker the first child is the text itself — no empty span.
    expect(spec("heading", { text: "Kopf" }).children).toEqual([]);
  });

  it("puts the node's children where the primitive wants them", () => {
    expect(spec("grid", {}).childrenSlot).toBe("children");
    expect(spec("collection", {}).childrenSlot).toBe("item");
    const accordion = spec("accordion", { summary: "Frage" });
    expect(accordion.tag).toBe("details");
    // Fixed part first, then the children: the summary never swallows content.
    expect(accordion.children?.[0]?.tag).toBe("summary");
    expect(accordion.children?.[0]?.text).toBe("Frage");
    expect(accordion.childrenSlot).toBe("children");
    // A primitive without children has no slot: the insert rules (`insert.ts`)
    // already refuse a child there, and the markup offers no place for one.
    expect(spec("image", {}).childrenSlot).toBeUndefined();
  });

  it("builds the repeating parts of table, select and icon from their values", () => {
    const table = flatten(
      spec("table", {
        columns: [{ header: "A" }, { header: "B" }],
        rows: [{ label: "Z1", values: "1, 2" }],
      }),
    );
    expect(table.map((node) => node.tag)).toEqual([
      "table",
      "thead",
      "tr",
      "th",
      "th",
      "tbody",
      "tr",
      "th",
      "td",
      "td",
    ]);
    const selectOptions = spec("select", {
      options: [{ value: "a", label: "A" }],
    }).children?.[1]?.children;
    expect(selectOptions?.[0]?.attrs?.value).toBe("a");
    expect(selectOptions?.[0]?.text).toBe("A");
    const icon = spec("icon", { name: "circle", size: 32, strokeWidth: 2 });
    expect(icon.attrs?.width).toBe(32);
    expect(icon.attrs?.strokeWidth).toBe(2);
    expect(icon.attrs?.["data-name"]).toBe("circle");
    expect(icon.attrs?.["aria-hidden"]).toBe("true");
  });

  it("keeps the media and embed addresses on the element", () => {
    expect(spec("image", { asset: "img1", alt: "Haus" }).attrs).toMatchObject({
      src: "/assets/img1",
      alt: "Haus",
      "data-asset": "img1",
    });
    expect(spec("image", {}).attrs?.src).toBe("");
    expect(spec("video", { url: "https://x/y.mp4", muted: true }).tag).toBe("video");
    expect(spec("video", { provider: "youtube", url: "https://y/x" }).tag).toBe("iframe");
    expect(spec("embed", { url: "https://e/x", title: "Karte" }).tag).toBe("iframe");
  });

  it("reads an asset that names itself by its id", () => {
    // The asset prop has two forms and both name the same picture: the plain
    // id (the media library of the editor writes it) and the shared
    // `{ assetId }` form (imports and the section components write it). The
    // catalog allows both. Without the second form an imported picture
    // arrived without a source: `data-asset` never appeared, so the delivery
    // lookup never ran and the image stayed empty.
    expect(spec("image", { asset: { assetId: "img1" }, alt: "Haus" }).attrs).toMatchObject({
      src: "/assets/img1",
      alt: "Haus",
      "data-asset": "img1",
    });
    expect(spec("image", { asset: { assetId: "img1" } }).attrs?.src).toBe("/assets/img1");
  });

  it("reads the poster of a payload, which is an asset too", () => {
    const payload = spec("payload", { payloadId: "p1", poster: { assetId: "bild1" } });
    const poster = payload.children?.find((child) => child.tag === "img");
    expect(poster?.attrs?.["data-asset"]).toBe("bild1");
  });

  it("spells the fullscreen permission of frames the way React knows it", () => {
    // `allowFullscreen` (small s) is no DOM property to React: it warns in the
    // canvas and drops the attribute. The one spelling React accepts is
    // `allowFullScreen`.
    const frames = [
      spec("embed", { url: "https://e/x" }),
      spec("video", { provider: "youtube", url: "https://y/x" }),
    ];
    for (const frame of frames) {
      expect(frame.attrs?.allowFullScreen).toBe(true);
      expect(frame.attrs).not.toHaveProperty("allowFullscreen");
    }
  });

  it("takes the widget defaults out of the catalog, and only the ones that reach CSS", () => {
    const grid = cssDefaultValuesOf("grid");
    expect(grid.columns).toBe(3);
    expect(grid.gap).toBeDefined();
    // `semantic` decides the tag, `level` the element: they are not style.
    expect(cssDefaultValuesOf("frame")).not.toHaveProperty("semantic");
    expect(cssDefaultValuesOf("heading")).not.toHaveProperty("level");
    expect(cssDefaultValuesOf("heading")).not.toHaveProperty("text");
    expect(cssDefaultValuesOf("hero")).toEqual({});
  });

  it("compiles the widget defaults into the authored layer, one rule per primitive", () => {
    expect(PRIMITIVE_BASE_CSS).toContain(`@layer ${CASCADE_LAYER}`);
    // Every foundation stone except the document root has its own base rule:
    // the reset carries the look a widget needs to be a widget, and the
    // compiled catalog defaults follow.
    for (const definition of PRIMITIVES) {
      if (definition.type === "root") continue;
      expect(PRIMITIVE_BASE_CSS, definition.type).toContain(`.${primitiveClass(definition.type)} {`);
    }
    expect(Object.keys(PRIMITIVE_RESET).sort()).toEqual(
      PRIMITIVES.filter((definition) => definition.type !== "root")
        .map((definition) => definition.type)
        .sort(),
    );
    // The defaults are the catalog's: a grid without values is a three-column
    // grid, a section without values has the regular content width.
    expect(PRIMITIVE_BASE_CSS).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
    expect(PRIMITIVE_BASE_CSS).toContain("max-width: 1120px;");
    // One layer, and it is the authored one: the editor chrome stays unlayered
    // and therefore wins, exactly as the cascade decision (O1) prescribes.
    expect(PRIMITIVE_BASE_CSS.match(/@layer/g)?.length).toBe(2);
    // The content stays neutral: no editor token in the widget stylesheet.
    expect(PRIMITIVE_BASE_CSS).not.toMatch(/--ed-[a-z-]+/);
    // The reset invents no colour of its own: it takes the page's.
    expect(PRIMITIVE_BASE_CSS).toContain("border: 1px solid currentColor;");
  });
});
