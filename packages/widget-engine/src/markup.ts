// Widget markup: the one description of what a primitive renders (Phase 1).
//
// The catalog (`catalog.ts`) says which primitives exist and which controls
// they carry; the compiler (`css/`) says what their values mean in CSS. What
// was missing until now is the third leg: the *markup*. This module is it —
// and it is the only one.
//
// Both render paths read the same description: the editor canvas mounts the
// registry's `SectionTree` (React) into the frame, the bake mounts the very
// same `SectionTree` through `Section.astro`. The registry's primitive
// components turn an `ElementSpec` into React elements; nothing else knows a
// tag name. A primitive is therefore never a special case in a component —
// it is a catalog entry plus this description.
//
// The description is plain data (no DOM, no React), so it is unit-testable,
// and it stays neutral: no `--ed-*` token, no editor skin. The skin lives on
// the editor chrome, never on the content (see the design rule in `ui-plan.md`).

import { PROP_MAPPINGS, STYLE_PROPERTIES } from "./css/properties.ts";
import { compileCss } from "./css/compile.ts";
import type { CssNode } from "./css/compile.ts";
import { PRIMITIVES, getPrimitive } from "./catalog.ts";
import { CASCADE_LAYER } from "./css/cascade.ts";
import type { Control, PrimitiveDefinition, PropValue } from "./types.ts";
import { isSafeHref, sanitizeInlineHtml } from "./inline-html.ts";
import { sanitizeSvgMarkup } from "./svg-markup.ts";

// ---------------------------------------------------------------------------
// Element description
// ---------------------------------------------------------------------------

// Attribute names are written the way React wants them (`strokeWidth`,
// `playsInline`): React is the one renderer of both paths, so a second casing
// would only create a second truth. `data-*` attributes are spelled as in HTML.
export type MarkupAttrs = Record<string, string | number | boolean | undefined>;

export type ElementSpec = {
  tag: string;
  classes?: readonly string[];
  attrs?: MarkupAttrs;
  // Fixed children, rendered first.
  children?: readonly ElementSpec[];
  // Where the node's own children (or the named slot) go: after `children`,
  // before `text`.
  childrenSlot?: "children" | string;
  // Rendered last (after `children` and the slot content).
  text?: string;
  // Sanitized inline markup that is the element's whole content (`body`). The
  // string has already passed `sanitizeInlineHtml`; a renderer sets it as the
  // element's inner HTML and renders nothing else into the element.
  html?: string;
  // The element that carries `data-node-id` / `data-widget` for this node.
  root?: boolean;
};

const CLASS_PREFIX = "w-";

export function primitiveClass(primitive: string): string {
  return `${CLASS_PREFIX}${primitive}`;
}

function modifier(primitive: string, value: string): string {
  return `${primitiveClass(primitive)}--${value}`;
}

// ---------------------------------------------------------------------------
// Value access
// ---------------------------------------------------------------------------

function value(props: Record<string, PropValue>, key: string): PropValue | undefined {
  const found = props[key];
  return found === undefined || found === null ? undefined : found;
}

function text(props: Record<string, PropValue>, key: string): string {
  const found = value(props, key);
  return typeof found === "string" ? found : typeof found === "number" ? String(found) : "";
}

// A link control holds a plain URL string (catalog controls) or the shared
// `{ url, newTab }` link value (what imports and sections write). Both mean the
// same; a `{ pageId }` link is resolved elsewhere and has no URL here.
// An asset prop carries either the plain id (what the editor's media library
// writes) or the shared `{ assetId }` form (what imports and the section
// components write — the catalog allows both, `controls.ts` `matchesValueType`).
// Both name the same asset, and `resolveAsset` reads the object form, so the
// markup has to know both. Without this an imported image rendered without a
// `src`: `text()` returns "" for an object, so `data-asset` never appeared and
// the delivery lookup never ran.
function assetOf(props: Record<string, PropValue>, key: string): string {
  const found = value(props, key);
  if (typeof found === "string") return found;
  if (typeof found === "object" && found !== null && !Array.isArray(found)) {
    const assetId = (found as Record<string, PropValue>)["assetId"];
    if (typeof assetId === "string") return assetId;
  }
  return "";
}

function linkOf(props: Record<string, PropValue>, key: string): { href: string; newTab: boolean } {
  const found = value(props, key);
  if (typeof found === "string") return { href: found.trim(), newTab: false };
  if (typeof found === "object" && found !== null && !Array.isArray(found)) {
    const record = found as Record<string, PropValue>;
    return {
      href: typeof record["url"] === "string" ? record["url"].trim() : "",
      newTab: record["newTab"] === true,
    };
  }
  return { href: "", newTab: false };
}

function flag(props: Record<string, PropValue>, key: string, fallback = false): boolean {
  const found = value(props, key);
  return typeof found === "boolean" ? found : fallback;
}

function choice(
  props: Record<string, PropValue>,
  key: string,
  fallback: string,
): string {
  const found = value(props, key);
  return typeof found === "string" && found !== "" ? found : fallback;
}

function list(props: Record<string, PropValue>, key: string): Record<string, PropValue>[] {
  const found = value(props, key);
  if (!Array.isArray(found)) return [];
  return found.filter(
    (entry): entry is Record<string, PropValue> =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
}

// ---------------------------------------------------------------------------
// Per-primitive markup
// ---------------------------------------------------------------------------

const HEADING_LEVELS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

const FRAME_TAGS = new Set([
  "div",
  "section",
  "nav",
  "header",
  "footer",
  "main",
  "aside",
]);

const INPUT_TAGS: Record<string, string> = {
  text: "text",
  email: "email",
  tel: "tel",
  number: "number",
  date: "date",
  password: "password",
};

function root(tag: string, classes: readonly string[], attrs?: MarkupAttrs): ElementSpec {
  return { tag, classes, attrs, root: true };
}

function containerRoot(
  tag: string,
  classes: readonly string[],
  attrs?: MarkupAttrs,
  children?: readonly ElementSpec[],
): ElementSpec {
  return { tag, classes, attrs, children, childrenSlot: "children", root: true };
}

function describeOne(primitive: string, props: Record<string, PropValue>): ElementSpec {
  switch (primitive) {
    // Layout ----------------------------------------------------------------
    case "root":
      return containerRoot("div", [primitiveClass("root")]);

    case "frame": {
      const semantic = choice(props, "semantic", "div");
      const tag = FRAME_TAGS.has(semantic) ? semantic : "div";
      const display = choice(props, "display", "block");
      const classes = [primitiveClass("frame"), modifier("frame", display)];
      // A linked frame is an anchor: the Framer card/logo wrapper shape. An
      // unsafe target is not rendered as a link at all.
      const target = linkOf(props, "link");
      if (target.href !== "" && isSafeHref(target.href)) {
        const newTab = flag(props, "newTab") || target.newTab;
        return containerRoot("a", classes, {
          href: target.href,
          ...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {}),
        });
      }
      return containerRoot(tag, classes);
    }

    case "section":
      return containerRoot("section", [
        primitiveClass("section"),
        modifier("section", choice(props, "contentWidth", "regular")),
        modifier("section", choice(props, "align", "left")),
      ]);

    case "grid":
      return containerRoot("div", [primitiveClass("grid")]);

    case "column":
      return containerRoot("div", [primitiveClass("column")]);

    // Basis -----------------------------------------------------------------
    case "heading": {
      const level = choice(props, "level", "h2");
      const tag = HEADING_LEVELS.has(level) ? level : "h2";
      const eyebrow = text(props, "eyebrow");
      const children: ElementSpec[] =
        eyebrow === "" ? [] : [{ tag: "span", classes: [modifier("heading", "eyebrow")], text: eyebrow }];
      return { tag, classes: [primitiveClass("heading")], children, text: text(props, "text"), root: true };
    }

    case "text":
      return { tag: "p", classes: [primitiveClass("text")], text: text(props, "text"), root: true };

    case "body": {
      // The author's inline markup is rendered through the allow-list
      // sanitizer (`inline-html.ts`); plain text passes through unchanged.
      const dropCap = flag(props, "dropCap");
      return {
        tag: "div",
        classes: [primitiveClass("body"), ...(dropCap ? [modifier("body", "drop-cap")] : [])],
        html: sanitizeInlineHtml(text(props, "html")),
        root: true,
      };
    }

    case "button": {
      const target = linkOf(props, "link");
      return {
        tag: "a",
        classes: [
          primitiveClass("button"),
          modifier("button", choice(props, "variant", "solid")),
          modifier("button", choice(props, "size", "md")),
        ],
        attrs: {
          href: target.href !== "" && isSafeHref(target.href) ? target.href : "#",
          ...(target.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {}),
        },
        text: text(props, "label"),
        root: true,
      };
    }

    case "link": {
      const target = linkOf(props, "link");
      const newTab = flag(props, "newTab") || target.newTab;
      return {
        tag: "a",
        classes: [primitiveClass("link")],
        attrs: {
          href: target.href !== "" && isSafeHref(target.href) ? target.href : "#",
          ...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {}),
        },
        text: text(props, "label"),
        root: true,
      };
    }

    case "list": {
      const ordered = flag(props, "ordered");
      return containerRoot(ordered ? "ol" : "ul", [
        primitiveClass("list"),
        modifier("list", choice(props, "marker", ordered ? "decimal" : "disc")),
      ]);
    }

    // Media -----------------------------------------------------------------
    case "image": {
      const asset = assetOf(props, "asset");
      const alt = text(props, "alt");
      return root("img", [primitiveClass("image")], {
        src: asset === "" ? "" : `/assets/${asset}`,
        alt,
        "data-asset": asset === "" ? undefined : asset,
      });
    }

    case "video": {
      const url = text(props, "url");
      const provider = choice(props, "provider", "file");
      if (provider !== "file") {
        return root("iframe", [primitiveClass("video"), modifier("video", provider)], {
          src: url,
          title: "Video",
          allowFullScreen: true,
        });
      }
      const poster = text(props, "poster");
      return root("video", [primitiveClass("video")], {
        src: url,
        controls: flag(props, "showControls", true),
        autoplay: flag(props, "autoplay"),
        loop: flag(props, "loop"),
        muted: flag(props, "muted", true),
        playsInline: true,
        poster: poster === "" ? undefined : poster,
      });
    }

    case "icon": {
      const size = typeof value(props, "size") === "number" ? (value(props, "size") as number) : 24;
      const stroke =
        typeof value(props, "strokeWidth") === "number"
          ? (value(props, "strokeWidth") as number)
          : 1.5;
      // A graphic of its own (an import's logo, a pasted pictogram) is drawn as
      // it brings its fills and strokes: the line defaults below would put a
      // stroke around a filled shape. The markup passes the allow-list
      // sanitizer (`svg-markup.ts`) before it reaches the element.
      const graphic = sanitizeSvgMarkup(text(props, "svg"));
      if (graphic !== undefined) {
        return {
          tag: "svg",
          classes: [primitiveClass("icon")],
          attrs: {
            ...graphic.attrs,
            width: size,
            height: size,
            "data-name": text(props, "name") || "symbol",
            "aria-hidden": "true",
          },
          html: graphic.html,
          root: true,
        };
      }
      return {
        tag: "svg",
        classes: [primitiveClass("icon")],
        attrs: {
          viewBox: "0 0 24 24",
          width: size,
          height: size,
          fill: "none",
          stroke: "currentColor",
          strokeWidth: stroke,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "data-name": text(props, "name") || "symbol",
          "aria-hidden": "true",
        },
        children: [{ tag: "circle", attrs: { cx: 12, cy: 12, r: 9 } }],
        root: true,
      };
    }

    // Formular --------------------------------------------------------------
    case "input": {
      const inputType = choice(props, "inputType", "text");
      const name = text(props, "name");
      const label = text(props, "label");
      const required = flag(props, "required");
      const common = { name, required, "data-input-type": inputType };
      const control: ElementSpec =
        inputType === "textarea"
          ? { tag: "textarea", classes: [modifier("input", "control")], attrs: { ...common, placeholder: text(props, "placeholder") || undefined } }
          : {
              tag: "input",
              classes: [modifier("input", "control")],
              attrs: {
                ...common,
                type: INPUT_TAGS[inputType] ?? "text",
                placeholder: text(props, "placeholder") || undefined,
              },
            };
      return {
        tag: "label",
        classes: [primitiveClass("input"), "w-field"],
        children: [
          { tag: "span", classes: ["w-field__label"], text: label },
          control,
        ],
        root: true,
      };
    }

    case "select": {
      const options = list(props, "options");
      const optionSpecs: ElementSpec[] = options.map((option) => ({
        tag: "option",
        attrs: { value: typeof option.value === "string" ? option.value : "" },
        text: typeof option.label === "string" ? option.label : "",
      }));
      return {
        tag: "label",
        classes: [primitiveClass("select"), "w-field"],
        children: [
          { tag: "span", classes: ["w-field__label"], text: text(props, "label") },
          {
            tag: "select",
            classes: [modifier("select", "control")],
            attrs: { name: text(props, "name"), required: flag(props, "required") },
            children: optionSpecs,
          },
        ],
        root: true,
      };
    }

    case "checkbox":
      return {
        tag: "label",
        classes: [primitiveClass("checkbox")],
        children: [
          {
            tag: "input",
            attrs: {
              type: "checkbox",
              name: text(props, "name"),
              checked: flag(props, "checked"),
              required: flag(props, "required"),
            },
          },
          { tag: "span", classes: ["w-checkbox__label"], text: text(props, "label") },
        ],
        root: true,
      };

    case "submit":
      return {
        tag: "button",
        classes: [
          primitiveClass("submit"),
          modifier("submit", choice(props, "variant", "solid")),
          modifier("submit", choice(props, "size", "md")),
        ],
        attrs: { type: "submit" },
        text: text(props, "label"),
        root: true,
      };

    // Erweitert -------------------------------------------------------------
    case "table": {
      const columns = list(props, "columns");
      const rows = list(props, "rows");
      const head: ElementSpec = {
        tag: "thead",
        children: [
          {
            tag: "tr",
            children: columns.map((column) => ({
              tag: "th",
              text: typeof column.header === "string" ? column.header : "",
            })),
          },
        ],
      };
      const body: ElementSpec = {
        tag: "tbody",
        children: rows.map((row) => {
          const cells = (typeof row.values === "string" ? row.values : "")
            .split(",")
            .map((cell) => cell.trim());
          const label = typeof row.label === "string" ? row.label : "";
          const rowCells: ElementSpec[] = cells.map((cell) => ({ tag: "td", text: cell }));
          if (label !== "") {
            rowCells.unshift({ tag: "th", classes: ["w-table__row-label"], text: label });
          }
          return { tag: "tr", children: rowCells };
        }),
      };
      return {
        tag: "table",
        classes: [
          primitiveClass("table"),
          ...(flag(props, "striped", true) ? [modifier("table", "striped")] : []),
          ...(flag(props, "bordered", true) ? [modifier("table", "bordered")] : []),
        ],
        children: [head, body],
        root: true,
      };
    }

    case "accordion":
      return {
        tag: "details",
        classes: [primitiveClass("accordion")],
        attrs: { open: flag(props, "open") },
        children: [
          {
            tag: "summary",
            classes: [modifier("accordion", "summary")],
            text: text(props, "summary"),
          },
        ],
        childrenSlot: "children",
        root: true,
      };

    case "divider": {
      const style = choice(props, "style", "line");
      if (style === "space") {
        return root("div", [primitiveClass("divider"), modifier("divider", "space")], {
          "aria-hidden": "true",
        });
      }
      return root("hr", [primitiveClass("divider"), modifier("divider", style)]);
    }

    case "embed":
      return root(
        "iframe",
        [primitiveClass("embed"), modifier("embed", choice(props, "provider", "iframe"))],
        {
          src: text(props, "url"),
          title: text(props, "title") || "Einbettung",
          loading: "lazy",
          allowFullScreen: true,
        },
      );

    case "collection":
      return {
        tag: "div",
        classes: [primitiveClass("collection")],
        childrenSlot: "item",
        root: true,
      };

    // Imported foreign code (ADR-0010): the carrier renders its poster, the
    // mount stage and the plate. The island script of the bake replaces the
    // stage's content and flips `data-payload-state`; in the editor nothing
    // loads (never any foreign code in the canvas), so poster or plate stands.
    case "payload": {
      const payloadId = text(props, "payloadId");
      // The poster is an asset, not an address: it carries the same
      // `{ assetId }` form an imported image carries.
      const poster = assetOf(props, "poster");
      const label = text(props, "label");
      const alt = text(props, "alt");
      const hasPayload = payloadId !== "";
      const hasPoster = poster !== "";
      // A carrier that stands for the whole page (the Framer runtime): the
      // release renders it instead of the structure.
      const coversPage = props["coversPage"] === true;
      return {
        tag: "div",
        classes: [primitiveClass("payload")],
        attrs: {
          "data-island": hasPayload ? "payload" : undefined,
          "data-payload-id": hasPayload ? payloadId : undefined,
          "data-payload-poster": hasPoster ? "1" : "0",
          "data-payload-covers-page": coversPage ? "1" : undefined,
          // Without a payload the plate *is* the rendering (nothing to fall
          // back from). With one the stage waits for the module: the poster
          // stands until it mounted, the plate only if the load failed.
          "data-payload-state": hasPayload ? "pending" : "plate",
          role: "group",
          "aria-label": label !== "" ? label : alt !== "" ? alt : "Fremd-Code",
        },
        children: [
          // The poster is the first fallback of ADR-0010 §7 — for EVERY
          // carrier, the page-level one included. It stands until the module
          // mounted and stays when the module fails, so a failed payload never
          // leaves a blank page. (A page-level carrier whose payload this build
          // does not deliver is removed from the release tree by the bake; the
          // structure stands alone then, with no poster and no plate.)
          ...(hasPoster
            ? [
                {
                  tag: "img",
                  classes: [modifier("payload", "poster")],
                  attrs: { "data-asset": poster, alt: alt !== "" ? alt : label },
                },
              ]
            : []),
          {
            tag: "div",
            classes: [modifier("payload", "stage")],
            attrs: { "data-payload-stage": "" },
          },
          {
            tag: "div",
            classes: [modifier("payload", "plate")],
            text: hasPayload
              ? label !== ""
                ? `${label} — der Fremd-Code ließ sich nicht laden`
                : "Fremd-Code ließ sich nicht laden"
              : "Kein Payload hinterlegt — die Stelle bleibt leer",
          },
        ],
        root: true,
      };
    }

    default:
      // Unknown or legacy section type: not part of the catalog. The caller
      // falls back to the section components.
      return { tag: "div", classes: [], root: true };
  }
}

// `describePrimitive` returns `undefined` for a node the catalog does not know
// (an existing section type of the running registry). Callers then take the
// section render path, so a migrated v1 tree keeps rendering.
export function describePrimitive(
  primitive: string,
  props: Record<string, PropValue> = {},
): ElementSpec | undefined {
  const definition = getPrimitive(primitive);
  if (definition === undefined || definition.legacy === true) return undefined;
  const spec = describeOne(primitive, props);
  // An anchor id (`#kontakt`) on the root element of any primitive.
  const anchor = text(props, "anchorId");
  return /^[A-Za-z][A-Za-z0-9_:.-]{0,127}$/.test(anchor)
    ? { ...spec, attrs: { ...spec.attrs, id: anchor } }
    : spec;
}

export function isCatalogPrimitive(primitive: string): boolean {
  const definition = getPrimitive(primitive);
  return definition !== undefined && definition.legacy !== true;
}

// ---------------------------------------------------------------------------
// Widget defaults (the weakest stage of the cascade)
// ---------------------------------------------------------------------------

// The values a fresh node carries: every control default that reaches CSS.
// A control without a default, or with an empty one, contributes nothing.
export function defaultValuesOf(primitive: string): Record<string, PropValue> {
  const definition = getPrimitive(primitive);
  if (definition === undefined || definition.legacy === true) return {};
  const values: Record<string, PropValue> = {};
  for (const control of definition.controls) {
    const fallback = control.default;
    if (fallback === undefined || fallback === null || fallback === "") continue;
    values[control.key] = fallback;
  }
  return values;
}

// The properties a control default can reach, so a default that is not a style
// value (a tag name, a level, a label) never enters the defaults bag.
function reachesCss(primitive: string, control: Control): boolean {
  const mapping = PROP_MAPPINGS.find(
    (entry) => entry.prop === control.key && entry.onlyPrimitives?.includes(primitive) === true,
  );
  if (mapping !== undefined) return true;
  if (PROP_MAPPINGS.some((entry) => entry.prop === control.key && entry.onlyPrimitives !== undefined)) {
    return false;
  }
  return STYLE_PROPERTIES.some((entry) => entry.prop === control.key);
}

export function cssDefaultValuesOf(primitive: string): Record<string, PropValue> {
  const definition = getPrimitive(primitive);
  if (definition === undefined) return {};
  const all = defaultValuesOf(primitive);
  const values: Record<string, PropValue> = {};
  for (const control of definition.controls) {
    if (!reachesCss(primitive, control)) continue;
    const fallback = all[control.key];
    if (fallback === undefined) continue;
    values[control.key] = fallback;
  }
  return values;
}

// The neutral reset of element defaults (user-agent styles, not design values).
// The catalog cannot express "no margin" or "no pointer cursor": that is not a
// design decision, it is the removal of a browser default. Everything here
// inherits from the page (`currentColor`, `font: inherit`), so no colour or
// type value is invented and no second palette comes into being. Order matters:
// the compiled defaults of the catalog follow and win on equal specificity.
export const PRIMITIVE_RESET: Readonly<Record<string, readonly string[]>> = {
  frame: [],
  section: [],
  // A container whose whole catalogue value is "how many columns, how wide the
  // gap" has to lay out as a grid: without it `grid-template-columns` would sit
  // on a block box and the columns value would be inert. Not a design value —
  // the removal of a browser default, like the `display: flex` of `input`.
  grid: ["display: grid;"],
  column: [],
  heading: ["margin: 0;", "font: inherit;"],
  text: ["margin: 0;"],
  body: ["margin: 0;", "white-space: pre-line;"],
  button: [
    "display: inline-flex;",
    "align-items: center;",
    "justify-content: center;",
    "gap: 0.5rem;",
    "border: 1px solid currentColor;",
    "background: transparent;",
    "color: inherit;",
    "font: inherit;",
    "padding: 0.55rem 1.1rem;",
    "text-decoration: none;",
    "cursor: pointer;",
  ],
  link: ["color: inherit;"],
  list: ["margin: 0;", "padding-inline-start: 1.25rem;"],
  image: ["display: block;", "max-width: 100%;"],
  video: ["display: block;", "max-width: 100%;"],
  icon: ["display: block;", "flex: none;"],
  input: ["display: flex;", "flex-direction: column;", "gap: 0.35rem;"],
  select: ["display: flex;", "flex-direction: column;", "gap: 0.35rem;"],
  checkbox: ["display: inline-flex;", "align-items: center;", "gap: 0.4rem;"],
  submit: [
    "display: inline-flex;",
    "align-items: center;",
    "justify-content: center;",
    "border: 1px solid currentColor;",
    "background: transparent;",
    "color: inherit;",
    "font: inherit;",
    "padding: 0.55rem 1.1rem;",
    "cursor: pointer;",
  ],
  table: ["width: 100%;", "border-collapse: collapse;"],
  accordion: ["display: block;"],
  divider: ["border-width: 0;"],
  embed: ["display: block;", "max-width: 100%;", "border: 0;"],
  collection: ["display: grid;", "gap: 1rem;"],
  payload: ["display: block;", "position: relative;"],
};

// The elements a primitive builds itself, spelled as the markup writes them.
// The key is the full selector, so a part can reach into a modifier.
const PART_RESET: Readonly<Record<string, readonly string[]>> = {
  // The payload carrier (ADR-0010): the poster stands until the module
  // mounted, the plate only when there is nothing to mount. The stage is the
  // mount target and carries the content the module puts there.
  ".w-payload--poster": ["display: block;", "width: 100%;", "height: auto;"],
  '.w-payload[data-payload-state="mounted"] .w-payload--poster': ["display: none;"],
  '.w-payload[data-payload-state="plate"] .w-payload--poster': ["display: none;"],
  ".w-payload--stage": ["display: block;"],
  ".w-payload--plate": ["display: none;"],
  '.w-payload[data-payload-state="plate"] .w-payload--plate': ["display: block;"],
  ".w-field__label": ["font-weight: 600;"],
  ".w-input--control, .w-select--control": [
    "border: 1px solid currentColor;",
    "background: transparent;",
    "color: inherit;",
    "font: inherit;",
    "padding: 0.5rem 0.65rem;",
  ],
  ".w-table--striped tbody tr:nth-child(even)": [
    "background: var(--table-stripe-color, transparent);",
  ],
  ".w-table--bordered th, .w-table--bordered td": [
    "border: 1px solid currentColor;",
    "padding: 0.4rem 0.6rem;",
    "text-align: left;",
  ],
  ".w-accordion--summary": ["cursor: pointer;"],
};

export function primitiveResetCss(): string {
  const blocks: string[] = [];
  for (const [primitive, declarations] of Object.entries(PRIMITIVE_RESET)) {
    if (declarations.length === 0) continue;
    blocks.push(
      `.${primitiveClass(primitive)} {\n${declarations.map((line) => `  ${line}`).join("\n")}\n}`,
    );
  }
  for (const [selector, declarations] of Object.entries(PART_RESET)) {
    blocks.push(`${selector} {\n${declarations.map((line) => `  ${line}`).join("\n")}\n}`);
  }
  return blocks.join("\n\n");
}

function baseCssNodes(): CssNode[] {
  return PRIMITIVES.filter((definition) => definition.type !== "root").map((definition) => ({
    id: primitiveClass(definition.type),
    primitive: definition.type,
    props: cssDefaultValuesOf(definition.type),
  }));
}

function indentBlock(text: string): string {
  return text
    .split("\n")
    .map((line) => (line === "" ? line : `  ${line}`))
    .join("\n");
}

function buildPrimitiveBaseCss(): string {
  const compiled = compileCss(
    { nodes: baseCssNodes() },
    {
      layer: CASCADE_LAYER,
      includeDefaults: true,
      selectorFor: (id) => `.${id}`,
    },
  );
  // One authored layer, the reset first, then the catalog defaults: the
  // weakest stage of the cascade decision (O1) and the same string on both
  // sides (canvas frame and baked page).
  const reset = `@layer ${CASCADE_LAYER} {\n${indentBlock(primitiveResetCss())}\n}`;
  return `${reset}\n\n${compiled}`.trim();
}

// The stylesheet every page with catalog primitives carries: the widget
// defaults, in the authored layer, before the node rules. Computed once.
export const PRIMITIVE_BASE_CSS = buildPrimitiveBaseCss();

// The class the markup puts on the root element of a primitive node.
export function primitiveRootClasses(spec: ElementSpec): string[] {
  return [...(spec.classes ?? [])];
}

export function primitiveDefinitions(): readonly PrimitiveDefinition[] {
  return PRIMITIVES;
}
