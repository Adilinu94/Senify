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
import { sanitizeInlineHtml, sanitizeSvgMarkup, type DeviceValueMap, type StyleRule } from "@senify/widget-engine";
import { brandColorOf } from "./brand-color.ts";
import { neutralBaseOf, typeBaseOf } from "./theme-scales.ts";
import { devicesContaining } from "./devices.ts";
import { parseDeclaration, splitDeclarations } from "./css-util.ts";
import { compileAppearRules, type CompileAppearResult, type CompiledAppearRule } from "./appear-css.ts";
import { ruleScopeOf, type NormalizedStyleRule, type NormalizeMode } from "./normalize.ts";
import type {
  FramerIrDocument,
  IrDevice,
  IrFinding,
  IrNode,
  IrState,
} from "./ir.ts";

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
    // Every further family the page names (a Framer site can use seven, the
    // theme has three slots). Key = the CSS-safe family name; the theme emits
    // one `@font-face` set per entry, so no text falls back to a system font.
    extra?: Record<string, { family: string; fallback: string[]; weights: number[]; files?: Record<string, string> }>;
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
    case "fit-text":
      // A "fit text" is text: the words the visitor reads, only scaled by the
      // box they sit in. As an icon it would be a picture the editor cannot
      // reach, as a body it keeps its text and its typography.
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
  // The copy hides on the devices it names. Every device it does not name is
  // one it shows on — but only devices the page actually HAS count, and which
  // those are comes from the whole page, not from this sibling list.
  //
  // Measured both ways: a sibling-only universe made last-studio's nested
  // copies visible on no device at all (397 of 824 nodes, page 3995 px too
  // short on mobile). A "not named = not hidden" rule instead made refined's
  // four copies all claim desktop (1473 px too short on tablet). This version
  // keeps both correct: `verfuegbar` is every device the page's breakpoints
  // cover, `versteckt` is what the copy's own hashes name.
  const eigene = [...hiddenAt].filter((hash) => breakpoints.has(hash));
  const verfuegbar = new Set<IrDevice>();
  for (const range of breakpoints.values()) {
    for (const device of devicesContaining(range)) verfuegbar.add(device);
  }
  // A page whose breakpoints cover only some devices (a source without a
  // phone layout) must still count the others: a copy naming no breakpoint is
  // visible there. Framer always writes a full set, so this is a guard, not a
  // rule.
  for (const device of ALL_DEVICES) {
    if (![...breakpoints.values()].some((range) => devicesContaining(range).includes(device))) {
      verfuegbar.add(device);
    }
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
  // The mode decides the fonts of the page (see `mapDocument`).
  mode: NormalizeMode;
  stats: { nodes: number; mergedVariants: number; placeholders: number };
  findings: IrFinding[];
};

function mapNode(node: IrNode, context: MapContext, parent: IrNode | null = null): EditorNode | null {
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
      props["html"] = framerVarsAsCss(withTextTypography(node, sanitizeInlineHtml(node.innerHtml)), lineHeightFactorOf(node) ?? (parent === null ? null : lineHeightFactorOf(parent)));
    } else if (hasElementChildren) {
      // A text element with element children (the RichText shape: <p><a>…</a></p>)
      // becomes a body with inline HTML — `text` accepts no children.
      primitive = "body";
      props["html"] = framerVarsAsCss(inlineHtmlOf(node, merged.base.text?.content ?? "", context));
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
      props["html"] = framerVarsAsCss(inlineHtmlOf(node, baseText?.content ?? "", context), lineHeightFactorOf(node));
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
      liftTypographyOf(path, props, context);
    }
  }
  // The fit text of Framer — after the lift on purpose: the box measures the
  // words (`font-size: 0`, `line-height: 0`) while the lift hands the words
  // their own typography, which is the measuring zero. The values of the
  // WORDS own the box; otherwise the text stays invisible (measured: the
  // heading "Writing" on `notes.framer.website` had a height of 0 in the
  // import while the source showed 22 px).
  if (isFitTextMarker(merged.base.visual) && node.children.length > 0) {
    const typography = textTypographyOf(node);
    if (typography !== null) {
      props["fontSize"] = typography.size;
      props["fontSize_tablet"] = typography.size;
      props["fontSize_mobile"] = typography.size;
      if (typography.lineHeight !== null) {
        props["lineHeight"] = typography.lineHeight;
        props["lineHeight_tablet"] = typography.lineHeight;
        props["lineHeight_mobile"] = typography.lineHeight;
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
    // `margin` sits in the same side table as `padding` so the shorthand and
    // its longhands keep the source's ORDER (`margin:0; margin-top:20px`).
    // Written as the same four-side object the style table reads.
    if (layout.margin !== undefined) {
      props["margin"] = {
        top: layout.margin.top ?? "0px",
        right: layout.margin.right ?? "0px",
        bottom: layout.margin.bottom ?? "0px",
        left: layout.margin.left ?? "0px",
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
      const mapped = mapNode(child, context, node);
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

// Framer writes the typography of a text component into variables: the class
// carries them (`--framer-font-size: 18px`), the inner text reads them
// (`font-size: var(--framer-font-size)`). The import drops the variables (they
// are not style properties) — so the typography has to be read from them
// before they are gone, or every text of the page falls back to the default.
//
// The same map names the Senify style property of each variable.
const FRAMER_TEXT_PROPS: Readonly<Record<string, string>> = {
  "--framer-font-family": "fontFamily",
  "--framer-font-size": "fontSize",
  "--framer-font-weight": "fontWeight",
  "--framer-letter-spacing": "letterSpacing",
  "--framer-line-height": "lineHeight",
  "--framer-text-alignment": "textAlign",
  "--framer-text-color": "color",
  "--framer-text-decoration": "textDecoration",
  "--framer-text-transform": "textTransform",
  "--framer-font-style": "fontStyle",
};

// The "fit text" of Framer: the box measures the words (`font-size: 0`), the
// words take their size from the class's variable. A literal `font-size: 0`
// next to a `--framer-font-size` is that marker, never the size of the text —
// taking it as the size would make the text invisible (measured: the heading
// "Writing" on `notes.framer.website` had a height of 0 in the import).
function isFitTextMarker(visual: { [key: string]: string | undefined }): boolean {
  const own = (visual["font-size"] ?? "").trim();
  return own === "0" || own === "0px";
}

// The typography of the words of a text component: the size and the line
// height the source gives them.
//
// Framer's "fit text": the box measures the words (`font-size: 0`,
// `line-height: 0`), the words themselves take their size from the class — a
// rule of the source (`[data-framer-component-type=Text] span span { font-size:
// var(--framer-font-size) }`) that the capture resolves on the WORD, not on
// the box. The box keeps its 0.
//
// The import has to take the values from the word: without them the words
// stay invisible (measured: the heading "Writing" on `notes.framer.website`
// had a height of 0 in the import while the source showed 22 px).
function textTypographyOf(node: IrNode): { size: string; lineHeight: string | null } | null {
  for (const child of node.children) {
    const visual = child.states[0]?.visual ?? {};
    const size = visual["font-size"];
    if (typeof size === "string" && size !== "" && size !== "0" && size !== "0px") {
      const lineHeight = visual["line-height"];
      return {
        size,
        lineHeight:
          typeof lineHeight === "string" && lineHeight !== "" && lineHeight !== "0" && lineHeight !== "0px"
            ? lineHeight
            : null,
      };
    }
    // The span around the words carries the measuring zero — the words are
    // deeper (the source writes them in a span in a span).
    const deeper = textTypographyOf(child);
    if (deeper !== null) return deeper;
  }
  return null;
}

// The inner markup of a text component carries the fit text marker
// (`font-size: 0`, `line-height: 0`) on the spans around the words: the box
// measures them, the words take their size from the class. With the real
// values in place the marker has to go — it would keep the words invisible.
function withTextTypography(node: IrNode, html: string): string {
  if (!isFitTextMarker(node.states[0]?.visual ?? {})) return html;
  const typography = textTypographyOf(node);
  if (typography === null) return html;
  let out = html.replace(/font-size:\s*0(px)?/g, `font-size:${typography.size}`);
  if (typography.lineHeight !== null) {
    out = out.replace(/line-height:\s*0(px)?/g, `line-height:${typography.lineHeight}`);
  }
  return out;
}

// Framer writes the typography of a marked word into `--framer-*` VARIABLES
// (`<span style="--framer-font-size:32px">$5000</span>`), and its own stylesheet
// turns them into `font-size: var(--framer-font-size)`. The import drops the
// variables — they are not style properties — so the word keeps the size of its
// paragraph: measured on `refined`, "$5000" stands 48 px tall in the source and
// 30 px in the structure, the price card 69 → 51 px, the page 18 px short.
//
// The inline markup is the only place the variable still exists, so it is
// rewritten here into the declaration it stands for. Only the style attribute of
// a tag is touched, and only `--framer-*` names that have a Senify counterpart.
const INLINE_FRAMER_VARS: Readonly<Record<string, string>> = {
  "--framer-font-size": "font-size",
  "--framer-font-family": "font-family",
  "--framer-font-weight": "font-weight",
  "--framer-font-style": "font-style",
  "--framer-letter-spacing": "letter-spacing",
  "--framer-line-height": "line-height",
  "--framer-text-alignment": "text-align",
  "--framer-text-color": "color",
  "--framer-text-decoration": "text-decoration",
  "--framer-text-transform": "text-transform",
};

// The line height of an element as a FACTOR, when the source wrote one. Only a
// factor (`1.5em`, `150%`, `1.5`) can be repeated on a child that changes its own
// font size — a computed `px` value belongs to the parent's size and would freeze
// the child's line.
function lineHeightFactorOf(node: IrNode): string | null {
  for (const state of node.states) {
    const raw = (state.visual["line-height"] ?? "").trim();
    if (raw === "") continue;
    const em = /^([\d.]+)em$/.exec(raw);
    if (em !== null) return em[1] ?? null;
    const percent = /^([\d.]+)%$/.exec(raw);
    if (percent !== null) return String(Number.parseFloat(percent[1] ?? "") / 100);
    if (/^[\d.]+$/.test(raw)) return raw;
  }
  return null;
}

function framerVarsAsCss(html: string, parentLineHeight: string | null = null): string {
  if (!html.includes("--framer-")) return html;
  return html.replace(
    /(<[a-zA-Z][\w:-]*\b[^>]*?\bstyle\s*=\s*)(["'])([\s\S]*?)\2/g,
    (whole, head: string, quote: string, value: string) => {
      const pairs = value.split(";").map((part) => part.trim()).filter((part) => part !== "");
      const declared = new Set<string>();
      const added: string[] = [];
      for (const pair of pairs) {
        const colon = pair.indexOf(":");
        if (colon <= 0) continue;
        const name = pair.slice(0, colon).trim();
        const css = INLINE_FRAMER_VARS[name];
        if (css === undefined) continue;
        declared.add(css);
        added.push(`${css}:${pair.slice(colon + 1).trim()}`);
      }
      // A bigger `font-size` on the word needs the line height that follows it.
      // The source writes `line-height: 1.5em` on the PARAGRAPH: the browser
      // inherits the FACTOR, so the 32 px word is laid out in 48 px, not in the
      // paragraph's computed 30 px. Measured on `refined`: without it the
      // `$5000` line is 34 px instead of 48, the price card 55 instead of 69.
      //
      // Only an `em`/factor value of the parent is repeatable on the child — a
      // parent's computed `px` line height belongs to the parent's size.
      if (declared.has("font-size") && !declared.has("line-height") && parentLineHeight !== null) {
        added.push(`line-height:${parentLineHeight}`);
      }
      if (added.length === 0) return whole;
      // A declaration the author wrote themselves wins over the variable — the
      // cascade of the source says the same (an inline `font-size` beats the
      // class rule that reads `var(--framer-font-size)`).
      const kept = pairs.filter((pair) => {
        const colon = pair.indexOf(":");
        return colon <= 0 || !declared.has(pair.slice(0, colon).trim());
      });
      const own = added.filter((entry) => {
        const name = entry.slice(0, entry.indexOf(":"));
        return !kept.some((pair) => pair.slice(0, pair.indexOf(":" )).trim() === name);
      });
      return `${head}${quote}${[...kept, ...own].join(";")}${quote}`;
    },
  );
}

// The typography of a text that lives in a descendant, written into the props
// of the node that carries it — with the device variants of the source.
//
// Two cases use it: a node whose own text is empty (the text lives deeper in
// the tree) and the fit text of Framer (the box measures the words, the words
// carry the typography).
function liftTypographyOf(
  path: IrNode[],
  props: Record<string, unknown>,
  context: MapContext,
): void {
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

function cssToStyle(visual: { [key: string]: string | undefined }): Record<string, string> {
  const out: Record<string, string> = {};
  // The typography of the variables first: an inline declaration wins over
  // them (the cascade of the source says so), except the fit text marker.
  for (const [name, entry] of Object.entries(visual)) {
    if (entry === undefined || entry === "") continue;
    const mapped = FRAMER_TEXT_PROPS[name];
    if (mapped !== undefined) out[mapped] = entry;
  }
  for (const [name, entry] of Object.entries(visual)) {
    if (entry === undefined || isBackgroundReset(name, entry)) continue;
    if (name.startsWith("--")) continue;
    if (name === "font-size" && isFitTextMarker(visual) && out["fontSize"] !== undefined) continue;
    const mapped = name === "background" && BACKGROUND_IMAGE.test(entry) ? "backgroundImage" : cssName(name);
    if (mapped !== undefined && entry !== "") out[mapped] = mapped === "backgroundImage" ? escapedDataUrlMarkup(entry) : entry;
  }
  return out;
}

// Inline HTML for a text element with element children: the children render
// back as inline markup (the RichText shape `<p><a>Home</a></p>` →
// `<a href="./">Home</a>`). Only the inline tags the body primitive accepts
// are generated; deeper structures flatten to their text.
function inlineHtmlOf(node: IrNode, fallback: string, context: MapContext, parentLineHeight: string | null = null): string {
  const html = node.children.map((child) => inlineOf(child, context, true, parentLineHeight ?? lineHeightFactorOf(node))).join("");
  return html !== "" ? html : escapeHtml(fallback);
}

// One element as inline markup. Recursive and returning its HTML: `text.content`
// is only the element's OWN text (the capture stores "" or whitespace for an
// element that just holds children, e.g. `<p><a>Tel</a></p>`). So the children
// always render into the element, in document order, and the own text goes
// first — an either/or would drop the children whenever the element carries
// whitespace of its own (regression: navigation and mail links vanished).
function inlineOf(child: IrNode, context: MapContext, mitTypografie: boolean, parentLineHeight: string | null = null): string {
  if (child.innerHtml !== undefined && child.innerHtml !== null) {
    const inner = framerVarsAsCss(withTextTypography(child, sanitizeInlineHtml(child.innerHtml)), parentLineHeight ?? lineHeightFactorOf(child));
    return HEADING_TAGS.has(child.tag) || child.tag === "p" ? `<${child.tag}>${inner}</${child.tag}>` : inner;
  }
  // A line break is the whole content of the blank line between two paragraphs.
  if (child.tag === "br") return "<br>";
  const inner =
    escapeHtml(child.states[0]?.text?.content ?? "") +
    child.children.map((c) => inlineOf(c, context, false)).join("");
  const stil = styleAttributeOf(child, context, mitTypografie);
  if (child.tag === "a" && child.href !== null) {
    const newTab = child.target === "_blank" ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a href="${escapeHtmlAttr(child.href.trim())}"${newTab}${stil}>${inner}</a>`;
  }
  if (
    HEADING_TAGS.has(child.tag) ||
    child.tag === "p" ||
    child.tag === "span" ||
    child.tag === "strong" ||
    child.tag === "em"
  ) {
    return `<${child.tag}${stil}>${inner}</${child.tag}>`;
  }
  return inner;
}

// The properties that carry the typography of a text. They belong to the props
// of the page: those know the device variants and the resolved colors of the
// source. An inline declaration would be a stiff value that the device rules
// of the page could no longer correct.
const TYPOGRAFIE: ReadonlySet<string> = new Set([
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-variant",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-indent",
  "text-transform",
  "text-decoration",
  "color",
]);

// The measures of the text — the ones that have no home in the props of the
// page when the text sits inside a rich text body (the heading of the footer
// of the Earn template). The family and the color stay with the props: they
// carry the theme's slots and the resolved colors of the source, and an
// inline `var(--token-…)` would name the theme's color, not the source's.
const MESSWERT: ReadonlySet<string> = new Set([
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
]);

// The look of an inline element travels with it — but only where the props of
// the page cannot carry it: a child of a rich text body (the heading of the
// footer of the Earn template lives there). Everywhere else the props own the
// look, and they know the device variants and the resolved colors of the
// source; an inline declaration would be a stiff value that the device rules
// of the page could no longer correct.
//
// Two kinds of declarations travel:
//  - the source's own declarations of the `style` attribute. The properties a
//    `transition` names are left out: Framer writes the state BEFORE an effect
//    into the inline style (the same convention as the appear start state), the
//    resting look comes from the class rules.
//  - the typography of the element — but only where every device says the same
//    (otherwise the device rules of the page own it).
function styleAttributeOf(child: IrNode, context: MapContext, mitTypografie: boolean): string {
  const parsed = (typeof child.inlineStyle === "string" ? splitDeclarations(child.inlineStyle) : [])
    .map((declaration) => parseDeclaration(declaration))
    .filter((pair): pair is [string, string] => pair !== null);
  const uebergangen = transitionPropertiesOf(parsed);
  // The start state of an appear effect is no look: the capture took it out of
  // the visual (`appearInitial`), and it must not come back through the door
  // of the inline style — the element would stay invisible for good.
  const startzustand = Object.keys(child.appearInitial ?? {});
  const teile: string[] = [];
  for (const [name, wert] of parsed) {
    // The `--framer-*` variables carry the typography — they travel below, in
    // the text's own inline styles, and not as raw variables.
    if (name.startsWith("--")) continue;
    if (name === "transition") continue;
    if (uebergangen.has(name.toLowerCase())) continue;
    if (startzustand.includes(name.toLowerCase())) continue;
    if (TYPOGRAFIE.has(name.toLowerCase())) continue;
    teile.push(`${name}:${wert}`);
  }
  if (mitTypografie && context.mode === "fidelity" && typografieGleich(child)) {
    const inline = child.states[0]?.text?.inline ?? {};
    for (const [name, wert] of Object.entries(inline)) {
      if (typeof wert !== "string" || wert === "") continue;
      const css = cssPropertyNameOf(name);
      if (css === undefined || !MESSWERT.has(css)) continue;
      teile.push(`${css}:${wert}`);
    }
  }
  if (teile.length === 0) return "";
  return ` style="${escapeHtmlAttr(teile.join(";"))}"`;
}

// The typography of the element, and whether every device says the same. A
// value that differs per device belongs to the device rules of the page.
function typografieGleich(child: IrNode): boolean {
  const base = child.states[0]?.text?.inline ?? {};
  return child.states.every((state) => {
    const inline = state.text?.inline ?? {};
    const namen = new Set([...Object.keys(base), ...Object.keys(inline)]);
    for (const name of namen) {
      if ((base[name] ?? "") !== (inline[name] ?? "")) return false;
    }
    return true;
  });
}

// The properties a transition names: `background-size 2s ease, color .4s`.
function transitionPropertiesOf(parsed: [string, string][]): Set<string> {
  const namen = new Set<string>();
  for (const [name, wert] of parsed) {
    if (name !== "transition") continue;
    for (const teil of wert.split(",")) {
      const eigenschaft = (teil.trim().split(/\s+/)[0] ?? "").toLowerCase();
      if (eigenschaft !== "") namen.add(eigenschaft);
    }
  }
  return namen;
}

// The style name of the capture (`fontSize`) as a CSS property (`font-size`).
// The vendor prefixes keep their leading dash (`WebkitTextFillColor` ->
// `-webkit-text-fill-color`).
function cssPropertyNameOf(name: string): string | undefined {
  if (/^[A-Z]/.test(name)) {
    const prefix = name.slice(0, 1).toLowerCase();
    const rest = name.slice(1).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    return `-${prefix}${rest}`;
  }
  if (!/^[a-z][a-zA-Z0-9]*$/.test(name)) return undefined;
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
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

// A family name as a CSS variable key: `PP Nikkei Pacific Ultrabold` becomes
// `pp-nikkei-pacific-ultrabold`, so `--font-pp-nikkei-pacific-ultrabold` is a
// valid custom property. Two families that differ only in punctuation would
// collide; the theme is written per page, so the second one keeps its slot.
export function fontSlotKey(family: string): string {
  return fontFamilyName(family)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extraSlotOf(family: string): string {
  return `var(--font-${fontSlotKey(family)})`;
}

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
    // A further family: the theme has a slot for it (`fonts.extra`), so the
    // page points at that variable instead of falling back to a system font.
    slots.set(name, extraSlotOf(family));
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

// The families the page uses that neither the body nor the display slot
// names — each of them becomes a `@font-face` of its own. Placeholder families
// (`"Anton Placeholder"`) carry no weight and are skipped: they stand in for
// the real family while it loads.
function extraFontsOf(
  document: FramerIrDocument,
  bodyFamily: string | null,
  displayFamily: string | null,
  source?: ReadonlyMap<string, number[]>,
): Record<string, { family: string; fallback: string[]; weights: number[] }> | null {
  const families = source ?? usedFamiliesOf(document);
  const out: Record<string, { family: string; fallback: string[]; weights: number[] }> = {};
  for (const [family, weights] of families) {
    const name = fontFamilyName(family);
    if (name === "") continue;
    if (name === bodyFamily || name === displayFamily) continue;
    if (isMonoFamily(name)) continue;
    if (/placeholder$/i.test(name)) continue;
    const sorted = [...new Set(weights)].sort((a, b) => a - b);
    if (sorted.length === 0) continue;
    const key = fontSlotKey(name);
    if (key === "" || out[key] !== undefined) continue;
    out[key] = { family: name, fallback: ["system-ui", "sans-serif"], weights: sorted };
  }
  return Object.keys(out).length === 0 ? null : out;
}

// Every family the page's rules and nodes name, with the weights they use.
// The families of the `@font-face` list alone are not enough: a page can name
// a family the list does not declare (a Google Fonts link), and that text is
// exactly the one that falls back.
function usedFamiliesOf(document: FramerIrDocument): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const note = (family: unknown, weight: unknown): void => {
    if (typeof family !== "string") return;
    const first = family.split(",")[0]?.trim() ?? "";
    if (first === "") return;
    const name = fontFamilyName(first);
    if (name === "" || /^(inherit|initial|unset|revert)$/i.test(name)) return;
    if (name.startsWith("var(")) return;
    const number = typeof weight === "string" ? Number.parseInt(weight, 10) : typeof weight === "number" ? weight : NaN;
    const weights = out.get(name) ?? [];
    if (Number.isFinite(number) && !weights.includes(number)) weights.push(number);
    out.set(name, weights);
  };
  const visit = (node: IrNode): void => {
    for (const state of node.states) {
      note(state.visual["font-family"], state.visual["font-weight"]);
    }
    for (const child of node.children) visit(child);
  };
  for (const page of document.pages) visit(page.root);
  for (const face of document.styles.fonts) {
    const name = fontFamilyName(face.family);
    if (name === "" || face.weight === null) continue;
    const weights = out.get(name) ?? [];
    if (!weights.includes(face.weight)) weights.push(face.weight);
    out.set(name, weights);
  }
  return out;
}

// Merge two family maps: the union of families, with the union of weights.
function mergedFamilies(
  first: ReadonlyMap<string, number[]>,
  second: ReadonlyMap<string, number[]> | undefined,
): Map<string, number[]> {
  if (second === undefined) return new Map(first);
  const out = new Map(first);
  for (const [family, weights] of second) {
    const current = out.get(family) ?? [];
    const merged = [...current];
    for (const weight of weights) if (!merged.includes(weight)) merged.push(weight);
    out.set(family, merged);
  }
  return out;
}

export function themePatchOf(
  document: FramerIrDocument,
  ruleFamilies?: ReadonlyMap<string, number[]>,
): ThemePatch {
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
  // Every further family of the page. The three slots name the roles a theme
  // styles (display, body, mono); a Framer page can name seven families, and
  // each of them needs a `@font-face` — otherwise the text falls back to the
  // system font and wraps elsewhere (measured on `unifiersofjapan`: the word
  // "strategy" in Anton took two lines instead of one, +260 px per card).
  const extra = extraFontsOf(document, bodyFamily, displayFamily, mergedFamilies(usedFamiliesOf(document), ruleFamilies));
  if (extra !== null) {
    patch.fonts = { ...(patch.fonts ?? {}), extra };
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
    mode: options.mode ?? "dna",
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
      const mapped = mapNode(child, context, page.root);
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
  // The appear channel compiled to keyframes (step 4b). It runs after the nodes
  // exist because a rule needs the mapped node id, and it appends to the page's
  // rules so the bake compiles it through the ordinary style path.
  const appearRun = appearRulesOf(document, context);
  const appearStyleRules: StyleRule[] = [];
  for (const rule of appearRun.rules) {
    const appearId = rule.appearIds[0];
    if (appearId === undefined) continue;
    // The same map the compiler used: it knows which ancestor stands in for a
    // folded element. Asking the IR again would lose exactly the reveals this
    // fix is about.
    const nodeId = appearRun.nodeIdByAppearId.get(appearId);
    if (nodeId === undefined) continue;
    const node = context.nodes[nodeId];
    if (node === undefined) continue;
    const built = appearStyleRulesOf(rule, rules.length + appearStyleRules.length, context.fontSlots);
    appearStyleRules.push(...built);
    node.classes = [...(node.classes ?? []), ...built.map((entry) => entry.name)];
  }
  if (appearStyleRules.length > 0) {
    context.findings.push({
      kind: "unsupported-declaration",
      nodeKey: null,
      message: `Der Appear-Kanal ist als CSS-Animation abgebildet (${appearRun.compiled} Effekte, ${appearStyleRules.length} Regeln).`,
      evidence: appearRun.rules.map((rule) => rule.name).join(", "),
      severity: "info",
      suggestion: "Diese Effekte laufen ohne Framer-Runtime; Bewegung und Dauer stammen aus dem Kanal.",
    });
  }
  for (const finding of appearRun.findings) {
    context.findings.push({
      kind: "unsupported-declaration",
      nodeKey: null,
      message: finding.reason,
      evidence: finding.appearId,
      severity: "warn",
      suggestion: "Ohne Endzustand im Kanal bleibt nur der Startzustand — der Effekt wird nicht nachgebaut.",
    });
  }
  return {
    document: {
      version: 2,
      rootNodeId: "root",
      nodes: context.nodes,
      styleRules: [...rules, ...appearStyleRules],
    },
    rules: [...rules, ...appearStyleRules],
    themePatch: themePatchOf(document, ruleFamilyWeights(normalized)),
    findings: context.findings,
    stats: context.stats,
    nodeIdByIrKey: { ...context.nodeIdByIrKey },
  };
}

// The families the compiled class rules name, with their weights. The rules
// carry most of a page's typography (Framer writes the font on the class), so
// a family only the rules name would otherwise get no `@font-face` and fall
// back to the system font.
function ruleFamilyWeights(rules: readonly NormalizedStyleRule[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const note = (declarations: Record<string, string> | undefined): void => {
    if (declarations === undefined) return;
    const family = declarations["font-family"];
    if (typeof family !== "string") return;
    const first = family.split(",")[0]?.trim() ?? "";
    if (first === "") return;
    const name = fontFamilyName(first);
    if (name === "" || name.startsWith("var(")) return;
    const weight = Number.parseInt(declarations["font-weight"] ?? "", 10);
    const weights = out.get(name) ?? [];
    if (Number.isFinite(weight) && !weights.includes(weight)) weights.push(weight);
    out.set(name, weights);
  };
  for (const rule of rules) {
    note(rule.declarations);
    for (const state of Object.values(rule.states ?? {})) note(state);
  }
  return out;
}

// The appear id → mapped node id is resolved in `appearRulesOf`, in one walk
// that carries the nearest mapped ancestor: a reveal whose element was folded
// into inline markup (`<h1><span>Run</span>…`) plays on that ancestor. A second
// lookup here would lose exactly those ids, so there is none on purpose.

// Compile the appear channel for the page it belongs to. The returned map is the
// one the attach loop must use: a reveal whose element was folded away resolves
// to its nearest mapped ancestor, and only this map knows that.
function appearRulesOf(
  document: FramerIrDocument,
  context: MapContext,
): CompileAppearResult & { nodeIdByAppearId: ReadonlyMap<string, string> } {
  const specs = document.appear ?? [];
  const nodeIdByAppearId = new Map<string, string>();
  if (specs.length === 0) {
    return { rules: [], findings: [], compiled: 0, nodeIdByAppearId };
  }
  // A reveal whose element was FOLDED AWAY still has a place to play: the text
  // model of an import turns a heading's word spans into inline markup, so the
  // `<h1>` carries the words and the spans are no nodes. Measured on
  // `rare-works`: 102 word reveals, none of their spans mapped, and the whole
  // headline would have stayed static. The reveal is attached to the nearest
  // mapped ancestor instead — the motion stays on the page, one level up.
  //
  // `nearestMapped` is carried down the walk so the lookup costs nothing.
  const index = (node: IrNode | undefined, nearestMapped: string | undefined): void => {
    if (node === undefined) return;
    const own = context.nodeIdByIrKey[node.key];
    const mapped = own ?? nearestMapped;
    for (const id of [node.appearId, node.derivedAppearId ?? null]) {
      if (id === null || id === "") continue;
      if (mapped !== undefined && !nodeIdByAppearId.has(id)) nodeIdByAppearId.set(id, mapped);
    }
    for (const child of node.children) index(child, mapped);
  };
  index(document.pages[0]?.root, undefined);
  const compiled = compileAppearRules({
    specs,
    breakpoints: document.breakpoints,
    nodeIdByAppearId,
    scope: ruleScopeOf(document.pages[0]?.path ?? "/"),
  });
  // Several reveals can now name the SAME node (a headline's words all resolve
  // to their `<h1>`). Two animations on one element do not add up — the second
  // `animation` declaration replaces the first. The first reveal of a node wins
  // (it is the one without stagger delay, i.e. the start of the cascade) and
  // the others are reported instead of silently dropped.
  const seen = new Set<string>();
  const rules: CompiledAppearRule[] = [];
  const findings = [...compiled.findings];
  let counted = 0;
  for (const rule of compiled.rules) {
    const target = nodeIdByAppearId.get(rule.appearIds[0] ?? "");
    if (target === undefined) continue;
    if (seen.has(target)) continue;
    seen.add(target);
    rules.push(rule);
    counted += rule.appearIds.length;
  }
  const merged = compiled.rules.length - rules.length;
  if (merged > 0) {
    findings.push({
      appearId: rules.map((rule) => rule.appearIds[0] ?? "").find((id) => id !== "") ?? "appear",
      reason: `${merged} Einblendung(en) teilen sich mit einer anderen ein Zielelement (die Wörter einer Überschrift liegen im selben Knoten) — die erste gilt, die Bewegung bleibt am Element erhalten.`,
    });
  }
  return { rules, findings, compiled: counted, nodeIdByAppearId };
}

// One compiled appear rule as style rules the bake understands. `rawCss` may
// carry exactly ONE `@keyframes` block (`isSafeRawCss`), so a rule with several
// breakpoint variants becomes several style rules: the first carries the base
// declaration (and its keyframes), each further one carries one context and its
// own keyframes. All of them are assigned to the same node.
function appearStyleRulesOf(
  rule: CompiledAppearRule,
  startOrder: number,
  slots: ReadonlyMap<string, string>,
): StyleRule[] {
  const out: StyleRule[] = [];
  const contexts = Object.entries(rule.contexts);
  const total = 1 + contexts.length;
  for (let index = 0; index < total; index += 1) {
    const isBase = index === 0;
    const contextEntry = contexts[index - 1];
    const name = isBase ? rule.name : `${rule.name}-${index}`;
    const keyframes = rule.keyframes[index] ?? rule.keyframes[0];
    // The base rule carries the default declaration; every further rule carries
    // exactly one breakpoint's declaration as its context.
    const declarations: Record<string, string> = isBase
      ? rule.animation
      : (contextEntry?.[1] ?? {});
    const styles = slotStyles(isBase ? declarations : {}, slots);
    const contextStyles: Record<string, DeviceValueMap> = {};
    if (!isBase && contextEntry !== undefined) {
      contextStyles[contextEntry[0]] = slotStyles(contextEntry[1], slots);
    }
    const built: StyleRule = {
      id: isBase ? rule.id : `${rule.id}-${index}`,
      name,
      kind: "class",
      selector: `.${name}`,
      order: startOrder + index,
      styles,
      contextStyles,
      origin: { source: "framer-import", ordinal: startOrder + index },
      authoredBy: "preset",
    };
    if (keyframes !== undefined) built.rawCss = keyframes;
    out.push(built);
  }
  return out;
}
