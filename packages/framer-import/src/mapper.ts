// The mapper (plan.md S1.3/S1.5): IR → EditorDocument + Theme-Patch.
//
// The device merge is the core (S0 §4 point 5): Framer duplicates elements
// per breakpoint inside `ssr-variant` wrappers — the same element appears 2–3
// times with a shared base-class signature and one `framer-v-<hash>` variant
// class each. The mapper folds those duplicates into ONE Senify node whose
// `_tablet`/`_mobile` prop keys carry the device differences. A duplicate
// whose base classes are a subset of an already-mapped element's base classes
// is a variant, not a new node.
//
// Values land as widget-engine style property names (camelCase, `DeviceValueMap`
// with `_tablet`/`_mobile` suffixes), so the compiler can translate them
// without a second mapping layer.

import type {
  EditorDocument,
  EditorNode,
} from "@senify/editor/state";
import { sanitizeInlineHtml, sanitizeSvgMarkup, type StyleRule } from "@senify/widget-engine";
import { brandColorOf } from "./brand-color.ts";
import { neutralBaseOf, typeBaseOf } from "./theme-scales.ts";
import { devicesContaining } from "./devices.ts";
import type {
  FramerIrDocument,
  IrDevice,
  IrFinding,
  IrNode,
  IrState,
} from "./ir.ts";
import type { NormalizedStyleRule, NormalizeMode } from "./normalize.ts";

/* ------------------------------------------------------------------ types */

// A mapped node that is only visible on some devices. `EditorNode.hiddenDevices`
// can say "additionally hidden on tablet/mobile" but not "hidden on desktop,
// shown on mobile" (the Framer mobile-only copy), so the import carries the
// full visible set and the engine turns it into the node's overrides.
export type ImportDeviceVisibility = { visibleDevices?: readonly IrDevice[] };

export type MapperResult = {
  document: EditorDocument;
  rules: StyleRule[];
  themePatch: ThemePatch;
  findings: IrFinding[];
  stats: {
    nodes: number;
    mergedVariants: number;
    placeholders: number;
  };
  nodeIdByIrKey: Record<string, string>;
};

// Exactly the branches `update_theme` accepts (`packages/tokens/src/schema.ts`).
export type ThemePatch = {
  scales?: { brand?: string; neutralBase?: string; typeBase?: number };
  fonts?: {
    // `files` maps a weight to the imported font file. Without it the theme
    // keeps its old files under the new name: the page would ask for
    // "Manrope" and get Sora's shapes.
    display?: { family: string; fallback: string[]; weights: number[]; files?: Record<string, string> };
    body?: { family: string; fallback: string[]; weights: number[]; files?: Record<string, string> };
  };
};

/* --------------------------------------------------- css → senify naming */

// The element style attribute uses kebab-case; the text presets already arrive
// as Senify property names. Both collapse onto one canonical name.
const CSS_TO_STYLE: Readonly<Record<string, string>> = {
  "background-color": "backgroundColor",
  "background": "background",
  "background-image": "backgroundImage",
  color: "color",
  "font-family": "fontFamily",
  "font-size": "fontSize",
  "font-weight": "fontWeight",
  "font-style": "fontStyle",
  "letter-spacing": "letterSpacing",
  "line-height": "lineHeight",
  "text-align": "textAlign",
  "text-decoration": "textDecoration",
  "text-transform": "textTransform",
  "border-radius": "borderRadius",
  "border-color": "borderColor",
  "border-style": "borderStyle",
  "border-width": "borderWidth",
  "box-shadow": "boxShadow",
  opacity: "opacity",
  overflow: "overflow",
  transform: "transform",
  filter: "filter",
  "mix-blend-mode": "mixBlendMode",
  "aspect-ratio": "aspectRatio",
  "backdrop-filter": "backdropFilter",
  "object-fit": "objectFit",
  "object-position": "objectPosition",
  "white-space": "whiteSpace",
  "text-overflow": "textOverflow",
  cursor: "cursor",
  // The pair that cuts a text after N lines. The generic rule below skips a name
  // with a leading dash; only these two are carried, not every vendor prefix.
  "-webkit-line-clamp": "WebkitLineClamp",
  "-webkit-box-orient": "WebkitBoxOrient",
  // The vendor forms that carry the look. The generic rule below skips every
  // name with a leading dash, so without this list the colour that fills a
  // text, the stroke around it, the colour of its underline and the way its
  // background breaks at a line end would all be lost.
  "-webkit-text-fill-color": "WebkitTextFillColor",
  "-webkit-text-stroke-color": "WebkitTextStrokeColor",
  "-webkit-text-stroke-width": "WebkitTextStrokeWidth",
  "-webkit-text-decoration-line": "WebkitTextDecorationLine",
  "-webkit-text-decoration-style": "WebkitTextDecorationStyle",
  "-webkit-text-decoration-color": "WebkitTextDecorationColor",
  "-webkit-box-decoration-break": "WebkitBoxDecorationBreak",
  "-webkit-mask": "WebkitMask",
  "mask": "mask",
  "-webkit-font-smoothing": "WebkitFontSmoothing",
  "-webkit-font-feature-settings": "WebkitFontFeatureSettings",
  "-moz-font-feature-settings": "MozFontFeatureSettings",
};

function cssName(name: string): string | undefined {
  if (CSS_TO_STYLE[name] !== undefined) return CSS_TO_STYLE[name];
  if (/^[a-z]+(-[a-z]+)*$/.test(name)) {
    const camel = name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    // Unknown properties stay out: the style table owns the vocabulary and the
    // compiler drops what it does not know — carrying them would be noise.
    return camel;
  }
  return undefined;
}

/* --------------------------------------------------------------- mapping */

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function primitiveFor(node: IrNode, siblings: IrNode[]): string {
  switch (node.kind) {
    case "text":
      return HEADING_TAGS.has(node.tag) ? "heading" : "text";
    case "rich-text":
      return "body";
    case "image":
      return "image";
    case "video":
      return "video";
    case "link":
      return "link";
    case "list": {
      // The `list` primitive accepts only text/link/icon/heading/image
      // children; a list whose items carry blocks (the Framer shape
      // `<ul><li><div>…</div></li></ul>`) degrades to a frame — the items
      // keep their structure, the list semantics are a finding.
      const allowed = new Set(["text", "link", "icon", "heading", "image"]);
      const richItems = siblings.some((child) => !allowed.has(child.kind));
      return richItems ? "frame" : "list";
    }
    case "svg":
      // An `<svg>` tag is an icon, which draws the markup it carries. A layer that
      // is not one (Framer's `div` of an SVG layer, empty, with its drawing in a
      // background image) is a frame: an icon would draw its ring over the
      // picture. An SVG wrapped in layout blocks is a frame as well.
      return siblings.length > 0 || node.tag !== "svg" ? "frame" : "icon";
    case "placeholder":
      return "payload";
    case "embed":
      return "embed";
    default:
      return "frame";
  }
}

type MergedState = {
  base: IrState;
  tablet: IrState | null;
  mobile: IrState | null;
};

// The device merge: group the element's states by device. Framer's SSR gives
// the desktop variant first (no wrapper), then tablet/mobile duplicates with
// hidden-hashes. When a variant's visual/layout/box differs from the base,
// the difference becomes a device-suffixed value.
function mergeStates(states: IrState[]): MergedState {
  const base = states[0] ?? {
    device: "desktop" as const,
    hiddenAt: [],
    variantHash: null,
    visual: {},
    layout: null,
    box: null,
    text: null,
  };
  const tablet = states.find((state) => state.device === "tablet") ?? null;
  const mobile = states.find((state) => state.device === "mobile") ?? null;
  return { base, tablet, mobile };
}

/* --------------------------------------------------- sibling device merge */

const ALL_DEVICES: readonly IrDevice[] = ["desktop", "tablet", "mobile"];

type IrBreakpointMap = Map<string, { minWidth: number; maxWidth: number | null }>;

// The devices a Framer duplicate is visible on. `hiddenAt` names the
// breakpoints that hide the copy. A copy is visible on the devices that
// remain — and the device it is visible on is the one its OWN hidden list
// leaves open.
//
// The earlier reading took the universe of the siblings and asked which
// breakpoints the copy does not hide; that counted a breakpoint the copy
// never mentioned (the mobile hash of a sibling) as evidence for its
// visibility. Measured on the Earn template: the second testimonial copy
// hides itself on tablet and desktop (`1yjwnyq`, `72rtr7`) — the universe
// method called it visible on mobile AND desktop, so the desktop showed the
// quote twice and the section grew by the height of the hidden copy.
function visibleDevicesOf(
  hiddenAt: readonly string[],
  universe: ReadonlySet<string>,
  breakpoints: IrBreakpointMap,
): IrDevice[] {
  // The breakpoints in play are the ones the copy names together with the
  // ones its siblings name: between them they cover every device.
  const relevant = new Set<string>([...hiddenAt, ...universe]);
  // A device the copy hides stays hidden. Which device is left is decided by
  // the copy's own list: the breakpoint it does not hide is the one it shows
  // on. The sibling universe only names the devices that exist at all.
  const eigene = [...hiddenAt].filter((hash) => breakpoints.has(hash));
  if (eigene.length === 0) {
    // No known breakpoint in the copy's own list: fall back to the universe.
    const visible = new Set<IrDevice>();
    for (const hash of relevant) {
      if (hiddenAt.includes(hash)) continue;
      const range = breakpoints.get(hash);
      if (range === undefined) continue;
      for (const device of devicesContaining(range)) visible.add(device);
    }
    return ALL_DEVICES.filter((device) => visible.has(device));
  }
  // The copy names the devices it hides. Every device it does not hide is
  // one it shows on — the siblings' hashes tell which devices exist.
  const verfuegbar = new Set<IrDevice>();
  for (const hash of relevant) {
    const range = breakpoints.get(hash);
    if (range === undefined) continue;
    for (const device of devicesContaining(range)) verfuegbar.add(device);
  }
  const versteckt = new Set<IrDevice>();
  for (const hash of eigene) {
    const range = breakpoints.get(hash);
    if (range === undefined) continue;
    for (const device of devicesContaining(range)) versteckt.add(device);
  }
  return ALL_DEVICES.filter((device) => verfuegbar.has(device) && !versteckt.has(device));
}

// The signature that proves two SSR variants are the same element: the sorted
// base-class token list. Measured in S0 (befund §4/5): the three <header>
// variants share `framer-dttxA…framer-14hdl1s` and differ only in the
// `framer-v-<hash>` class.
function baseSignature(node: IrNode): string {
  const module = node.kind === "placeholder"
    ? `foreign:${node.componentType ?? node.tag}:${node.codeModule?.path ?? ""}:${node.codeModule?.adapter ?? ""}`
    : node.codeModule === undefined || node.codeModule === null
      ? ""
      : `module:${node.codeModule.path}:${node.codeModule.adapter}`;
  return `${module}|[${[...node.baseClasses].sort().join("|")}]`;
}

// Two device copies are the same element when the whole subtree has the same
// shape AND the same content. Framer duplicates the full subtree per
// breakpoint, but the inner nodes carry no marker of their own, so the shape
// is the only proof. A copy with different text or links is a different
// element for that device and must not be folded (its content would be lost).
function sameShape(a: IrNode, b: IrNode): boolean {
  if (a.tag !== b.tag || a.kind !== b.kind || a.children.length !== b.children.length) return false;
  if ((a.states[0]?.text?.content ?? "") !== (b.states[0]?.text?.content ?? "")) return false;
  if (a.href !== b.href || (a.assetUrl ?? null) !== (b.assetUrl ?? null)) return false;
  if ((a.alt ?? null) !== (b.alt ?? null) || (a.innerHtml ?? null) !== (b.innerHtml ?? null)) return false;
  if (a.svg !== b.svg) return false;
  return a.children.every((child, index) => {
    const other = b.children[index];
    return other !== undefined && sameShape(child, other);
  });
}

// The style a copy has on one device: its device state when the stylesheet
// gave it one, else its base state.
function stateFor(node: IrNode, device: IrDevice): IrState | undefined {
  return node.states.find((state) => state.device === device) ?? node.states[0];
}

// Fold a parallel copy into the base subtree, level by level: each device the
// copy is visible on becomes a device state of the matching base node.
function foldDevices(base: IrNode, copy: IrNode, devices: readonly IrDevice[]): void {
  for (const device of devices) {
    if (device === "desktop") continue;
    const source = stateFor(copy, device);
    if (source === undefined) continue;
    const next: IrState = { ...source, device, hiddenAt: [], variantHash: null };
    const at = base.states.findIndex((state) => state.device === device);
    if (at === -1) base.states.push(next);
    else base.states[at] = next;
  }
  base.children.forEach((child, index) => {
    const other = copy.children[index];
    if (other !== undefined) foldDevices(child, other, devices);
  });
}

function withVisibility(node: IrNode, visible: readonly IrDevice[]): IrNode {
  if (visible.length < ALL_DEVICES.length) node.visibleOn = [...visible];
  return node;
}

type VariantCopy = { node: IrNode; visible: IrDevice[] };

function resolveGroup(group: VariantCopy[], stats: { merged: number }): IrNode[] {
  if (group.length === 1) {
    const only = group[0] as VariantCopy;
    return [withVisibility(only.node, only.visible)];
  }
  const base = group.find((copy) => copy.visible.includes("desktop"));
  if (base === undefined || !group.every((copy) => copy === base || sameShape(base.node, copy.node))) {
    // Not provably the same element on every device: keep each copy and show
    // it only where Framer showed it. Nothing is dropped, nothing doubles up.
    return group.map((copy) => withVisibility(copy.node, copy.visible));
  }
  for (const copy of group) {
    if (copy === base) continue;
    foldDevices(base.node, copy.node, copy.visible);
    stats.merged += 1;
  }
  const union = ALL_DEVICES.filter((device) => group.some((copy) => copy.visible.includes(device)));
  return [withVisibility(base.node, union)];
}

// Fold the per-breakpoint duplicates among a node's children. Framer emits the
// copies of one element next to each other, each one visible on a disjoint set
// of devices. Consecutive variants with one signature and disjoint visibility
// form a group; a group folds into one node when its copies are the same
// element, else every copy stays and is shown on its own devices only.
function mergeSiblingVariants(
  children: IrNode[],
  breakpoints: IrBreakpointMap,
  stats: { merged: number },
): IrNode[] {
  const out: IrNode[] = [];
  let group: VariantCopy[] = [];
  const universe = new Set(children.flatMap((child) => child.states.flatMap((state) => state.hiddenAt)));
  const flush = (): void => {
    if (group.length === 0) return;
    out.push(...resolveGroup(group, stats));
    group = [];
  };
  for (const child of children) {
    const hiddenAt = child.states.find((state) => state.hiddenAt.length > 0)?.hiddenAt ?? [];
    if (hiddenAt.length === 0) {
      flush();
      out.push(child);
      continue;
    }
    const visible = visibleDevicesOf(hiddenAt, universe, breakpoints);
    const first = group[0];
    const fits =
      first !== undefined &&
      baseSignature(first.node) === baseSignature(child) &&
      group.every((copy) => copy.visible.every((device) => !visible.includes(device)));
    if (!fits) flush();
    group.push({ node: child, visible });
  }
  flush();
  return out;
}

// What mobile has to say beyond the base and the tablet overrides it inherits.
function mobileOverrides(
  base: Record<string, string>,
  tablet: Record<string, string>,
  mobile: Record<string, string>,
): Record<string, string> {
  const out = diffValues({ ...base, ...tablet }, mobile);
  // A property only the tablet sets, which the phone does not set either, has no
  // value to say again: `unset` takes the tablet's value back.
  for (const property of Object.keys(tablet)) {
    if (mobile[property] === undefined) out[property] = "unset";
  }
  return out;
}

// The value diff between two states: only the properties that differ become
// device overrides. Equal values inherit from the base (the device model).
function diffValues(
  base: Record<string, string>,
  variant: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [property, value] of Object.entries(variant)) {
    if (base[property] !== value) out[property] = value;
  }
  return out;
}

type Ids = { next: number };

function newId(ids: Ids): string {
  ids.next += 1;
  return `fi${ids.next}`;
}

type MapContext = {
  ids: Ids;
  nodes: Record<string, EditorNode>;
  classByNode: Map<string, string>;
  nodeIdByIrKey: Record<string, string>;
  breakpoints: IrBreakpointMap;
  // The source's families -> the theme's slots. A `font-family` that names a
  // family the site does not have falls back to the system font, so the page
  // points at the slot instead.
  fontSlots: Map<string, string>;
  stats: { nodes: number; mergedVariants: number; placeholders: number };
  findings: IrFinding[];
};

function mapNode(node: IrNode, context: MapContext): EditorNode | null {
  // The sibling device merge (S1.5): the capture keeps Framer's per-breakpoint
  // duplicates as separate nodes with `hiddenAt`; identical base signatures
  // fold into one node whose states carry the devices.
  const foldStats = { merged: 0 };
  const siblings = mergeSiblingVariants(node.children, context.breakpoints, foldStats);
  context.stats.mergedVariants += foldStats.merged;
  const merged = mergeStates(node.states);
  const id = newId(context.ids);
  // The primitive decision runs AFTER the sibling merge: the merged children
  // decide whether a `list` stays a list or degrades to a frame.
  let primitive = primitiveFor(node, siblings);
  if (node.kind === "placeholder" && (node.codeModule === undefined || node.codeModule === null)) {
    context.stats.placeholders += 1;
    context.findings.push({
      kind: "unknown-node",
      nodeKey: node.key,
      message: "Framer-Komponente ohne gebündeltes Modul als Platte übernommen.",
      evidence: node.componentType ?? node.tag,
      severity: "warn",
      suggestion: "Als Island-Payload importieren oder die Stelle manuell nachbauen.",
    });
  }
  const props: Record<string, unknown> = {};
  if (node.kind === "placeholder") {
    props["label"] = "Platte · Framer-Fremdcode";
    props["alt"] = "Importierte Framer-Komponente ohne verfügbares Modul";
    if (node.assetId !== undefined && node.assetId !== null) props["poster"] = { assetId: node.assetId };
  }
  if (node.codeModule !== undefined && node.codeModule !== null) {
    props["framerNodeKey"] = node.key;
  }

  // --- content props
  const baseText = merged.base.text;
  const hasElementChildren = siblings.length > 0;
  if (primitive === "heading" || primitive === "text") {
    if (node.innerHtml !== undefined && node.innerHtml !== null) {
      // Text mixed with inline elements (`Hallo <strong>x</strong> Welt`): the
      // capture kept the inner markup, because the element scan alone drops
      // the plain text between the children.
      primitive = "body";
      props["html"] = sanitizeInlineHtml(node.innerHtml);
    } else if (hasElementChildren) {
      // A text element with element children (the RichText shape: <p><a>…</a></p>)
      // becomes a body with inline HTML — `text` accepts no children.
      primitive = "body";
      props["html"] = inlineHtmlOf(node, merged.base.text?.content ?? "");
    } else {
      props["text"] = baseText?.content ?? "";
      if (HEADING_TAGS.has(node.tag)) props["level"] = node.tag;
    }
    // The `text` primitive renders a `<p>` — a block. The source's text often
    // sits in a `<span>` (inline), and the paragraph then breaks the line
    // where the source did not: the testimonial of the Earn template is three
    // inline spans in one paragraph, and as three paragraphs it takes five
    // lines instead of four. The source's own cascade decides — only the
    // browser's default for the tag is filled in.
    if (primitive === "text" && INLINE_TAGS.has(node.tag) && props["display"] === undefined) {
      props["display"] = "inline";
    }
  } else if (primitive === "body") {
    // A RichTextContainer with exactly one heading child is a heading, not a
    // body — the heading keeps its level and text (the common Framer shape
    // `<div RichTextContainer><h2>…</h2></div>`).
    const single = siblings.length === 1 ? siblings[0] : undefined;
    if (
      single !== undefined &&
      HEADING_TAGS.has(single.tag) &&
      single.children.length === 0
    ) {
      primitive = "heading";
      props["text"] = single.states[0]?.text?.content ?? baseText?.content ?? "";
      props["level"] = single.tag;
      // The heading inherits the container's inline text styles as fallback.
      for (const [property, value] of Object.entries(baseText?.inline ?? {})) {
        if (props[property] === undefined) props[property] = value;
      }
    } else if (hasElementChildren) {
      props["html"] = inlineHtmlOf(node, baseText?.content ?? "");
    } else {
      props["html"] = baseText?.content ?? "";
    }
  } else if (primitive === "link") {
    // An <a> whose only content is text (possibly wrapped in rich-text
    // containers) stays a link; an <a> wrapping blocks (cards, logos) is a
    // frame — the `link` primitive accepts no children. Nothing is lost (the
    // frame keeps the target and the children), so it is reported as an info.
    const label = deepTextOf(node) ?? baseText?.content ?? "";
    if (hasElementChildren && isTextOnlyLink(node)) {
      props["label"] = label;
      if (node.href !== null) props["link"] = { url: node.href, newTab: node.target === "_blank" };
    } else if (hasElementChildren) {
      // A card/logo wrapper: the frame itself becomes the anchor, so the whole
      // block stays clickable and keeps its children.
      primitive = "frame";
      props["semantic"] = "div";
      if (node.href !== null) {
        props["link"] = node.href;
        if (node.target === "_blank") props["newTab"] = true;
      }
      context.findings.push({
        kind: "unsupported-declaration",
        nodeKey: node.key,
        message: `Link-Wrapper (${node.href ?? "ohne Ziel"}) als verlinkter Frame übernommen — Ziel und Kinder bleiben erhalten.`,
        evidence: `<a href="${node.href ?? ""}"> mit ${siblings.length} Kind-Elementen`,
        severity: "info",
        suggestion: "Link-URL als Fund im Bericht behalten; bei Bedarf als eigenes link-Kind ergänzen.",
      });
    } else {
      props["label"] = label;
      if (node.href !== null) props["link"] = { url: node.href, newTab: node.target === "_blank" };
    }
  } else if (primitive === "image") {
    const assetId = node.assetId ?? node.assetUrl;
    if (assetId !== undefined && assetId !== null) props["asset"] = { assetId };
    props["alt"] = node.alt ?? "";
  } else if (primitive === "icon") {
    // The layer's own drawing. Where the capture found none (a `<use>` into a
    // container that lacks the id) the sanitizer has nothing to draw, so the icon
    // keeps its ring instead of an empty box.
    if (node.svg !== null && sanitizeSvgMarkup(node.svg) !== undefined) props["svg"] = node.svg;
  } else if (primitive === "frame") {
    props["semantic"] = node.tag === "header" || node.tag === "footer" || node.tag === "nav" || node.tag === "section" || node.tag === "main" ? node.tag : "div";
  }
  // An in-page anchor target (`#kontakt`): only the frame carries the control,
  // so a link to an anchor on any other element stays a finding-free no-op
  // rather than a broken prop.
  if (primitive === "frame" && node.htmlId !== undefined && node.htmlId !== null) {
    props["anchorId"] = node.htmlId;
  }

  if (primitive === "heading") {
    props["fontWeight"] = "700";
  } else if (primitive === "text") {
    if (node.tag === "strong") props["fontWeight"] = "700";
    if (node.tag === "em") props["fontStyle"] = "italic";
  }

  // --- style values with device merge
  // The gap an element writes in its own style attribute sits in `layout`, not in the
  // visual; it joins the style here so each device copy brings its own (the phone's
  // Ticker is 40 px apart, the desktop's 70 px).
  const styleOf = (state: IrState): Record<string, string> => {
    const style = cssToStyle(state.visual);
    if (state.layout?.gap !== undefined) style["gap"] = state.layout.gap;
    if (style["fontFamily"] !== undefined) {
      style["fontFamily"] = themeFontOf(style["fontFamily"], context.fontSlots);
    }
    return style;
  };
  const baseVisual = styleOf(merged.base);
  for (const [property, value] of Object.entries(baseVisual)) props[property] = value;
  normalizeSpacingProps(props);
  const tabletDiff = merged.tablet === null ? {} : diffValues(baseVisual, styleOf(merged.tablet));
  for (const [property, value] of Object.entries(tabletDiff)) props[`${property}_tablet`] = value;
  if (Object.keys(tabletDiff).length > 0) context.stats.mergedVariants += 1;
  // Mobile is stated against what it inherits: Senify's tablet values are
  // `max-width` rules that mobile falls under too, while Framer's tablet query
  // stops above the phone. A phone that equals desktop has no state of its own,
  // yet still has to say the desktop value again where the tablet changed it.
  const mobileDiff = mobileOverrides(baseVisual, tabletDiff, merged.mobile === null ? baseVisual : styleOf(merged.mobile));
  for (const [property, value] of Object.entries(mobileDiff)) props[`${property}_mobile`] = value;
  if (merged.mobile !== null && Object.keys(mobileDiff).length > 0) context.stats.mergedVariants += 1;

  // A node whose text lives in a descendant (`<div RichTextContainer><h1>…`,
  // a link around a paragraph) flattens that descendant into itself. The
  // typography Framer put on the descendant (92 px, white) is what the page
  // shows; the container only carries the 16 px / black defaults. Without this
  // the lifted heading renders in the container's defaults. Type properties are
  // inherited, so the text shows what the elements on the way down set: a
  // heading split into one span per letter keeps the size of its `h1`, which
  // the spans only inherit. An inline element that wraps only a part of its
  // parent's content (a word in `white-space:nowrap`) is left out: the baked
  // `html` carries no styles, so its values would reach the rest of the text.
  const ownText = node.states[0]?.text?.content ?? "";
  if (
    (primitive === "heading" || primitive === "link" || primitive === "body" || primitive === "text") &&
    ownText === "" &&
    node.children.length > 0
  ) {
    const path = firstTextPath(node);
    if (path !== null) {
      const merged = path
        .filter((member, index) => index === 0 || !INLINE_TAGS.has(member.tag) || path[index - 1]?.children.length === 1)
        .map((member) => mergeStates(member.states));
      // The lifted typography points at the theme's slots too (the family the
      // source wrote belongs to the source, the site knows the slots).
      const withSlot = (values: Record<string, string>): Record<string, string> => {
        if (values["fontFamily"] === undefined) return values;
        return { ...values, fontFamily: themeFontOf(values["fontFamily"], context.fontSlots) };
      };
      const sourceBase = withSlot(
        cssToStyle(Object.assign({}, ...merged.map((entry) => typographyOf(entry.base.visual)))),
      );
      Object.assign(props, sourceBase);
      const effectiveOn = (device: "tablet" | "mobile"): Record<string, string> =>
        withSlot(
          cssToStyle(Object.assign({}, ...merged.map((entry) => typographyOf((entry[device] ?? entry.base).visual)))),
        );
      const tabletType = diffValues(sourceBase, effectiveOn("tablet"));
      for (const [property, value] of Object.entries(tabletType)) props[`${property}_tablet`] = value;
      for (const [property, value] of Object.entries(mobileOverrides(sourceBase, tabletType, effectiveOn("mobile")))) {
        props[`${property}_mobile`] = value;
      }
    }
  }
  normalizeSpacingProps(props);
  // --- layout from the stack/grid hints
  const layout = merged.base.layout;
  if (layout !== null) {
    if (layout.mode === "grid" && layout.columns !== undefined) {
      props["display"] = "grid";
      props["columns"] = layout.columns;
    } else if (layout.direction === "horizontal" || layout.direction === "vertical") {
      props["display"] = "flex";
      props["flexDirection"] = layout.direction === "horizontal" ? "row" : "column";
    }
    if (layout.padding !== undefined) {
      props["padding"] = {
        top: layout.padding.top ?? "0px",
        right: layout.padding.right ?? "0px",
        bottom: layout.padding.bottom ?? "0px",
        left: layout.padding.left ?? "0px",
      };
    }
  }

  // --- absolute positioning
  const box = merged.base.box;
  if (box !== null) {
    if (box.width !== undefined) props["width"] = box.width;
    if (box.height !== undefined) props["height"] = box.height;
    if (box.minWidth !== undefined) props["minWidth"] = box.minWidth;
    if (box.maxWidth !== undefined) props["maxWidth"] = box.maxWidth;
    if (box.minHeight !== undefined) props["minHeight"] = box.minHeight;
    if (box.maxHeight !== undefined) props["maxHeight"] = box.maxHeight;
    if (box.aspectRatio !== undefined) props["aspectRatio"] = box.aspectRatio;
    // `fixed` and `sticky` are page-level positioning (a pinned overlay, a
    // sticky header) and map like `absolute`; `relative`/`static` are the
    // default flow and stay out of the props.
    if (box.position === "absolute" || box.position === "fixed" || box.position === "sticky") {
      props["position"] = box.position;
    }
    if (box.inset !== undefined) {
      if (box.inset.top !== undefined) props["top"] = box.inset.top;
      if (box.inset.right !== undefined) props["right"] = box.inset.right;
      if (box.inset.bottom !== undefined) props["bottom"] = box.inset.bottom;
      if (box.inset.left !== undefined) props["left"] = box.inset.left;
    }
    if (box.zIndex !== undefined) props["zIndex"] = box.zIndex;
  }

  // `body` accepts no children: a rich-text with element children bakes them
  // into the `html` prop instead of mapping child nodes. A heading lifted
  // from its rich-text container owns the container's children the same way.
  const children: string[] = [];
  if (primitive !== "body" && !(primitive === "heading" && hasElementChildren)) {
    for (const child of siblings) {
      const mapped = mapNode(child, context);
      if (mapped !== null) {
        children.push(mapped.id);
        context.nodes[mapped.id] = mapped;
      }
    }
  }

  context.stats.nodes += 1;
  context.nodeIdByIrKey[node.key] = id;
  const visible = node.visibleOn;
  const hiddenOnSmallDevices =
    visible !== undefined && visible.includes("desktop")
      ? (["tablet", "mobile"] as const).filter((device) => !visible.includes(device))
      : [];
  const editorNode: EditorNode & ImportDeviceVisibility = {
    id,
    primitive,
    props: props as EditorNode["props"],
    ...(context.classByNode.has(node.key) ? { classes: [context.classByNode.get(node.key) as string] } : {}),
    ...(children.length > 0 ? { children } : {}),
    ...(hiddenOnSmallDevices.length > 0 ? { hiddenDevices: hiddenOnSmallDevices } : {}),
    // Not visible on desktop (a mobile-only copy): hidden by default, shown
    // again on the devices it belongs to when the engine writes the overrides.
    ...(visible !== undefined && !visible.includes("desktop") ? { hidden: true } : {}),
    ...(visible !== undefined ? { visibleDevices: visible } : {}),
  };
  return editorNode;
}

// The values of a CSS shorthand, split on the spaces between them. A space inside
// a function (`clamp(16px, 4vw, 32px)`, `calc(100% - 20px)`) belongs to that value.
function splitShorthand(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value.trim()) {
    if (char === "(") depth += 1;
    else if (char === ")" && depth > 0) depth -= 1;
    if (/\s/.test(char) && depth === 0) {
      if (current !== "") parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current !== "") parts.push(current);
  return parts;
}

// `gap: 8px` or `gap: 8px 16px`: one value per axis, the way the style table reads it.
function splitGap(value: string): { row: string; column: string } {
  const parts = splitShorthand(value);
  const row = parts[0] ?? "0px";
  return { row, column: parts.length === 1 ? row : (parts[1] ?? row) };
}

function normalizeSpacingProps(props: Record<string, unknown>): void {
  for (const key of ["gap", "gap_tablet", "gap_mobile"]) {
    const value = props[key];
    if (typeof value !== "string") continue;
    props[key] = splitGap(value);
  }
  // `inset` is a spacing too: one value per side, like `padding`.
  for (const key of ["padding", "margin", "inset", "padding_tablet", "margin_tablet", "inset_tablet", "padding_mobile", "margin_mobile", "inset_mobile"]) {
    const value = props[key];
    if (typeof value !== "string") continue;
    const parts = splitShorthand(value);
    const top = parts[0] ?? "0px";
    const right = parts.length === 1 ? top : (parts[1] ?? top);
    const bottom = parts.length === 1 ? top : (parts[2] ?? top);
    const left = parts.length === 1 ? right : (parts[3] ?? right);
    props[key] = { top, right, bottom, left };
  }
}

// The style table reads `background` as a colour. A gradient or an image written in the
// shorthand (the dark overlay on a card photo) is a background image.
const BACKGROUND_IMAGE = /(?:linear|radial|conic)-gradient\(|url\(/i;

// Framer's button reset is `[data-reset=button]{background:0 0}`, the minified
// shorthand that clears the background. Senify's style table reads the prop
// `background` as a colour, so `0 0` came out as `background-color: 0 0`: an
// invalid value that replaced the button's own colour. A reset carries nothing
// to import, no background is the default.
const BACKGROUND_RESETS: ReadonlySet<string> = new Set(["0 0", "none", "initial", "0 0 transparent"]);
const isBackgroundReset = (name: string, value: string): boolean =>
  name === "background" && BACKGROUND_RESETS.has(value.trim().toLowerCase());

// An SVG layer's drawing sits in a data URL with its markup unescaped
// (`url('data:image/svg+xml,<svg …>')`). The value grammar refuses `<` and `>` in a value
// (a `<` could close the <style> element); a data URL reads `%3C` and `%3E` as the same
// characters, so the markup goes through in that spelling.
function escapedDataUrlMarkup(value: string): string {
  return value.includes("data:image/svg+xml") ? value.replace(/</g, "%3C").replace(/>/g, "%3E") : value;
}

function cssToStyle(visual: { [key: string]: string | undefined }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, entry] of Object.entries(visual)) {
    if (entry === undefined || isBackgroundReset(name, entry)) continue;
    const mapped = name === "background" && BACKGROUND_IMAGE.test(entry) ? "backgroundImage" : cssName(name);
    if (mapped !== undefined && entry !== "") out[mapped] = mapped === "backgroundImage" ? escapedDataUrlMarkup(entry) : entry;
  }
  return out;
}

// Inline HTML for a text element with element children: the children render
// back as inline markup (the RichText shape `<p><a>Home</a></p>` →
// `<a href="./">Home</a>`). Only the inline tags the body primitive accepts
// are generated; deeper structures flatten to their text.
function inlineHtmlOf(node: IrNode, fallback: string): string {
  const html = node.children.map(inlineOf).join("");
  return html !== "" ? html : escapeHtml(fallback);
}

// One element as inline markup. Recursive and returning its HTML: `text.content`
// is only the element's OWN text (the capture stores "" or whitespace for an
// element that just holds children, e.g. `<p><a>Tel</a></p>`). So the children
// always render into the element, in document order, and the own text goes
// first — an either/or would drop the children whenever the element carries
// whitespace of its own (regression: navigation and mail links vanished).
function inlineOf(child: IrNode): string {
  if (child.innerHtml !== undefined && child.innerHtml !== null) {
    const inner = sanitizeInlineHtml(child.innerHtml);
    return HEADING_TAGS.has(child.tag) || child.tag === "p" ? `<${child.tag}>${inner}</${child.tag}>` : inner;
  }
  // A line break is the whole content of the blank line between two paragraphs.
  if (child.tag === "br") return "<br>";
  const inner = escapeHtml(child.states[0]?.text?.content ?? "") + child.children.map(inlineOf).join("");
  if (child.tag === "a" && child.href !== null) {
    const newTab = child.target === "_blank" ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a href="${escapeHtmlAttr(child.href.trim())}"${newTab}>${inner}</a>`;
  }
  if (
    HEADING_TAGS.has(child.tag) ||
    child.tag === "p" ||
    child.tag === "span" ||
    child.tag === "strong" ||
    child.tag === "em"
  ) {
    return `<${child.tag}>${inner}</${child.tag}>`;
  }
  return inner;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/"/g, "&quot;");
}

// The deepest text content of a node, through rich-text wrappers: an <a> whose
// children are containers around text is still a text link.
// Elements that wrap a stretch of text inside a block. They are also the tags
// the browser lays out inline — their text must not become a paragraph, or the
// line breaks where the source did not break it.
const INLINE_TAGS = new Set([
  "a", "abbr", "b", "bdi", "bdo", "cite", "code", "data", "dfn", "em", "i", "kbd",
  "mark", "q", "rp", "rt", "ruby", "s", "samp", "small", "span", "strong", "sub",
  "sup", "time", "u", "var", "wbr",
]);

// The first descendant that carries its own text, with the elements on the way
// down to it (the child of `node` first, the text element last). A paragraph
// that mixes text with `<br>` or inline elements keeps its text as inner markup.
function firstTextPath(node: IrNode): IrNode[] | null {
  for (const child of node.children) {
    if ((child.states[0]?.text?.content ?? "") !== "" || (child.innerHtml ?? "") !== "") return [child];
    const inner = firstTextPath(child);
    if (inner !== null) return [child, ...inner];
  }
  return null;
}

// Only the type properties of a visual: the layout of a flattened descendant
// (width, margin, flex) belongs to the container, not to the text.
const TYPOGRAPHY_PROPERTY = /^(font|color$|letter-spacing|line-height|text-(align|transform|decoration|indent|shadow)|word-|white-space)/;

function typographyOf(visual: { [key: string]: string | undefined }): { [key: string]: string | undefined } {
  return Object.fromEntries(Object.entries(visual).filter(([property]) => TYPOGRAPHY_PROPERTY.test(property)));
}

function deepTextOf(node: IrNode): string | null {
  const own = node.states[0]?.text?.content ?? null;
  if (own !== null && own !== "") return own;
  for (const child of node.children) {
    const inner = deepTextOf(child);
    if (inner !== null && inner !== "") return inner;
  }
  return null;
}

// A link whose children are only text/rich-text wrappers (no blocks) keeps
// the `link` primitive with the flattened label.
function isTextOnlyLink(node: IrNode): boolean {
  return node.children.every((child) => {
    if (child.kind === "text" || child.kind === "rich-text") return true;
    if (child.kind === "link") return isTextOnlyLink(child);
    return false;
  });
}

/* ------------------------------------------------------------ theme patch */

// The name of a font family as the CSS writes it. `'Manrope'` and `Manrope`
// are the same family — the quotes belong to the CSS, not to the name. The
// theme writes the name into a `@font-face`, where a leftover quote would
// become part of the family and no font would match it.
export function fontFamilyName(family: string): string {
  return family.trim().replace(/^['"]/, "").replace(/['"]$/, "").trim();
}

// The theme's typography slots. A page must not name a font the site does not
// have: a family without a `@font-face` falls back to the system font, and
// every text of the imported page would look different from the source. The
// source's families therefore point at the theme's slots, and the theme patch
// ("Theme-Fonts übernehmen") puts the source's own fonts into those slots.
const FONT_SLOTS = {
  display: "var(--font-display)",
  body: "var(--font-body)",
  mono: "var(--font-mono)",
} as const;

function isMonoFamily(family: string): boolean {
  return /mono|courier|consolas/i.test(family);
}

// The source's own typography, read off its `@font-face` list: which family
// plays which role, and which theme slot stands for it. The family with the
// most weights is the body font, the one with the heaviest weight the display
// font — the same reading the theme patch uses, so page and theme agree.
type SourceFonts = {
  bodyFamily: string | null;
  bodyWeights: number[];
  displayFamily: string | null;
  displayWeights: number[];
  // The family (lower case) -> the theme slot it stands for.
  slots: Map<string, string>;
};

function sourceFontsOf(document: FramerIrDocument): SourceFonts {
  const families = new Map<string, Set<number>>();
  for (const font of document.styles.fonts) {
    if (font.src.length === 0) continue;
    const family = fontFamilyName(font.family);
    if (family === "") continue;
    const weights = families.get(family) ?? new Set<number>();
    if (font.weight !== null) weights.add(font.weight);
    families.set(family, weights);
  }
  let bodyFamily: string | null = null;
  let bodyWeights: number[] = [];
  let displayFamily: string | null = null;
  let displayWeights: number[] = [];
  for (const [family, weights] of families) {
    const sorted = [...weights].sort((a, b) => a - b);
    // A family without weights is Framer's metric-compatible placeholder
    // (`"Manrope Placeholder"`): it stands in for the real family while it
    // loads and never carries a text of its own.
    if (sorted.length === 0) continue;
    if (bodyFamily === null || sorted.length > bodyWeights.length) {
      bodyFamily = family;
      bodyWeights = sorted;
    }
    const max = sorted[sorted.length - 1] ?? 0;
    if (displayFamily === null || max > (displayWeights[displayWeights.length - 1] ?? 0)) {
      displayFamily = family;
      // Every weight of the display family, not only the heaviest: the theme
      // writes one `@font-face` per weight, and a page that uses the family
      // at 700 would otherwise get the 800 face (and the browser would
      // synthesise the rest).
      displayWeights = sorted;
    }
  }
  const slots = new Map<string, string>();
  for (const [family, weights] of families) {
    if (weights.size === 0) continue;
    const name = family.toLowerCase();
    if (family === bodyFamily) {
      slots.set(name, FONT_SLOTS.body);
      continue;
    }
    if (family === displayFamily) {
      slots.set(name, FONT_SLOTS.display);
      continue;
    }
    if (isMonoFamily(family)) {
      slots.set(name, FONT_SLOTS.mono);
      continue;
    }
    // A third family (the source has one): the theme knows three slots, and
    // the body font is the one a text of that family can live with.
    slots.set(name, FONT_SLOTS.body);
  }
  return { bodyFamily, bodyWeights, displayFamily, displayWeights, slots };
}

// The first family of the stack decides: Framer writes
// `"Manrope", "Manrope Placeholder", sans-serif`, where the placeholder is the
// metric-compatible stand-in and the real family stands in front of it.
function themeFontOf(value: string, slots: ReadonlyMap<string, string>): string {
  const first = value.split(",")[0]?.trim() ?? "";
  if (first === "") return value;
  const name = fontFamilyName(first).toLowerCase();
  return slots.get(name) ?? value;
}

export function themePatchOf(document: FramerIrDocument): ThemePatch {
  // The dominant font family of the `@font-face` list becomes the body font;
  // the heaviest weight family becomes the display font. This is a *patch* —
  // update_theme merges it over the current theme.
  const { bodyFamily, bodyWeights, displayFamily, displayWeights } = sourceFontsOf(document);
  const patch: ThemePatch = {};
  // The brand colour the page uses most: a proposal for the theme's one
  // brand input (the whole ramp grows from it), only applied on request. The
  // tint of its greys and its body text size are proposals for two more
  // inputs, read off the page the same way (`theme-scales.ts`).
  const brand = brandColorOf(document);
  const neutral = neutralBaseOf(document);
  const body = typeBaseOf(document);
  if (brand !== null || neutral !== null || body !== null) {
    patch.scales = {
      ...(brand === null ? {} : { brand: brand.hex }),
      ...(neutral === null ? {} : { neutralBase: neutral.hex }),
      ...(body === null ? {} : { typeBase: body.px }),
    };
  }
  if (bodyFamily !== null) {
    patch.fonts = {
      body: { family: bodyFamily, fallback: ["system-ui", "sans-serif"], weights: bodyWeights },
      ...(displayFamily !== null && displayFamily !== bodyFamily
        ? {
            display: {
              family: displayFamily,
              fallback: ["system-ui", "sans-serif"],
              weights: displayWeights,
            },
          }
        : {}),
    };
  }
  return patch;
}

/* ------------------------------------------------------------------ rules */

const camelStyles = (declarations: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(declarations)
      .filter(([name, value]) => !isBackgroundReset(name, value))
      .map(([name, value]) => {
        const mapped = cssName(name);
        return [mapped ?? name, value];
      }),
  );

// The class rules carry most of the page's typography (the source writes the
// font on the class, not on the element). They point at the theme's slots for
// the same reason the node's own props do.
function slotStyles(
  declarations: Record<string, string>,
  slots: ReadonlyMap<string, string>,
): Record<string, string> {
  const out = camelStyles(declarations);
  if (out["fontFamily"] !== undefined && slots.size > 0) {
    out["fontFamily"] = themeFontOf(out["fontFamily"], slots);
  }
  return out;
}

function styleRulesOf(
  normalized: NormalizedStyleRule[],
  slots: ReadonlyMap<string, string>,
): StyleRule[] {
  return normalized.map((rule, index) => ({
    id: rule.id,
    name: rule.name,
    kind: "class" as const,
    selector: `.${rule.name}`,
    order: index,
    styles: slotStyles(rule.declarations, slots),
    // The element's `:hover` / `:focus` / `:active` / `:disabled` rules become the
    // rule's own states, which the compiler writes after the base declarations.
    ...(rule.states === undefined
      ? {}
      : {
          states: Object.fromEntries(
            Object.entries(rule.states).map(([name, declarations]) => [name, slotStyles(declarations, slots)]),
          ),
        }),
    contextStyles: {},
    origin: { source: "framer-import", ordinal: index },
    authoredBy: "preset" as const,
  }));
}

/* ------------------------------------------------------------------- main */

export function mapDocument(
  document: FramerIrDocument,
  normalized: NormalizedStyleRule[],
  options: { mode?: NormalizeMode } = {},
): MapperResult {
  // The mode decides what the page's fonts say:
  //  - fidelity: the source's own families. The page is the source's page, and
  //    the theme patch ("Theme-Fonts übernehmen") puts the matching files into
  //    the theme — the page then draws the source's fonts.
  //  - dna: the theme's slots. The page joins the site's typography, and a
  //    family the site does not have can no longer fall back to a system
  //    font (which would draw every text differently from the source).
  const slots = (options.mode ?? "dna") === "dna" ? sourceFontsOf(document).slots : new Map<string, string>();
  const context: MapContext = {
    ids: { next: 0 },
    nodes: {},
    classByNode: new Map(normalized.flatMap((rule) => rule.device === "desktop" ? rule.nodeKeys.map((key) => [key, rule.name] as const) : [])),
    breakpoints: new Map(
      document.breakpoints.map((entry) => [entry.id, { minWidth: entry.minWidth, maxWidth: entry.maxWidth }]),
    ),
    fontSlots: slots,
    stats: { nodes: 0, mergedVariants: 0, placeholders: 0 },
    nodeIdByIrKey: {},
    findings: [...document.findings],
  };

  // In the DNA mode the page names the theme's slots, not the source's
  // families: a family the site does not have falls back to the system font,
  // and the imported page would look different from the source in every text.
  // The theme patch puts the source's own fonts into those slots ("Theme-Fonts
  // übernehmen"). In the fidelity mode the page keeps the source's families —
  // the theme patch then supplies exactly those.
  if (slots.size > 0) {
    const belegt = [...slots.entries()]
      .map(([familie, slot]) => `${familie} → ${slot}`)
      .join(", ");
    context.findings.push({
      kind: "font-mapping",
      nodeKey: null,
      message:
        "Die Schriften der Quelle zeigen auf die Theme-Slots; das Theme nimmt sie mit „Theme-Fonts übernehmen“ an.",
      evidence: belegt,
      severity: "info",
      suggestion:
        "Ohne übernommene Theme-Schriften rendert die Seite in der Systemschrift; der Import weist sie deshalb den Slots zu.",
    });
  }

  const page = document.pages[0];
  const rootProps = page === undefined ? {} : cssToStyle(page.root.states[0]?.visual ?? {});
  if (rootProps["fontFamily"] !== undefined) {
    rootProps["fontFamily"] = themeFontOf(rootProps["fontFamily"], context.fontSlots);
  }
  const root: EditorNode = {
    id: "root",
    primitive: "root",
    props: {
      title: page?.title ?? "Importierte Seite",
      lang: page?.lang ?? "de",
      ...rootProps,
    },
    children: [],
  };
  normalizeSpacingProps(root.props);
  context.nodes["root"] = root;

  if (page !== undefined) {
    const children: string[] = [];
    const topFold = { merged: 0 };
    const topLevel = mergeSiblingVariants(page.root.children, context.breakpoints, topFold);
    context.stats.mergedVariants += topFold.merged;
    for (const child of topLevel) {
      const mapped = mapNode(child, context);
      if (mapped === null) continue;
      context.nodes[mapped.id] = mapped;
      children.push(mapped.id);
    }
    root.children = children;
  }

  // Smooth-scroll and loop findings ride through (S1.6): they are profile
  // concerns, never silently dropped.
  const hasSmoothScroll = context.findings.some((finding) => finding.kind === "smooth-scroll");
  if (hasSmoothScroll) {
    context.findings.push({
      kind: "smooth-scroll",
      nodeKey: null,
      message: "Fundart smooth-scroll bestätigt: die Seite steuert das Scrollen selbst.",
      evidence: "capture",
      severity: "warn",
      suggestion: "Site-Profil entscheidet über die Scroll-Steuerung; kein stiller Drop.",
    });
  }

  const rules = styleRulesOf(normalized, context.fontSlots);
  return {
    document: {
      version: 2,
      rootNodeId: "root",
      nodes: context.nodes,
      styleRules: rules,
    },
    rules,
    themePatch: themePatchOf(document),
    findings: context.findings,
    stats: context.stats,
    nodeIdByIrKey: { ...context.nodeIdByIrKey },
  };
}
