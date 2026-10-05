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
import { sanitizeInlineHtml, type StyleRule } from "@senify/widget-engine";
import { devicesContaining } from "./devices.ts";
import type {
  FramerIrDocument,
  IrDevice,
  IrFinding,
  IrNode,
  IrState,
} from "./ir.ts";
import type { NormalizedStyleRule } from "./normalize.ts";

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
  scales?: { brand?: string };
  fonts?: {
    display?: { family: string; fallback: string[]; weights: number[] };
    body?: { family: string; fallback: string[]; weights: number[] };
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
      // The `icon` primitive takes a registry name, not free SVG markup. A
      // bare SVG maps to `icon` with a finding (S2 loads the markup as an
      // asset); an SVG wrapped in layout blocks degrades to a frame.
      return siblings.length > 0 ? "frame" : "icon";
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

// The devices a Framer duplicate is visible on. `hiddenAt` names the breakpoints
// that hide the copy; the breakpoints its siblings mention (`universe`) are the
// ones in play, so a copy is visible wherever one of those is NOT hidden. A hash
// that is not a known breakpoint is ignored.
function visibleDevicesOf(
  hiddenAt: readonly string[],
  universe: ReadonlySet<string>,
  breakpoints: IrBreakpointMap,
): IrDevice[] {
  const visible = new Set<IrDevice>();
  for (const hash of universe) {
    if (hiddenAt.includes(hash)) continue;
    const range = breakpoints.get(hash);
    if (range === undefined) continue;
    for (const device of devicesContaining(range)) visible.add(device);
  }
  return ALL_DEVICES.filter((device) => visible.has(device));
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
    // frame — the `link` primitive accepts no children. The URL loss is a
    // finding, never a silent drop.
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
        message: `Link-Wrapper (${node.href ?? "ohne Ziel"}) als Frame abgebildet — das link-Primitiv nimmt keine Kinder.`,
        evidence: `<a href="${node.href ?? ""}"> mit ${siblings.length} Kind-Elementen`,
        severity: "warn",
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
  const baseVisual = cssToStyle(merged.base.visual);
  for (const [property, value] of Object.entries(baseVisual)) props[property] = value;
  normalizeSpacingProps(props);
  if (merged.tablet !== null) {
    const diff = diffValues(baseVisual, cssToStyle(merged.tablet.visual));
    for (const [property, value] of Object.entries(diff)) {
      if (value !== undefined) props[`${property}_tablet`] = value;
    }
    if (Object.keys(diff).length > 0) context.stats.mergedVariants += 1;
  }
  if (merged.mobile !== null) {
    const diff = diffValues(baseVisual, cssToStyle(merged.mobile.visual));
    for (const [property, value] of Object.entries(diff)) {
      if (value !== undefined) props[`${property}_mobile`] = value;
    }
    if (Object.keys(diff).length > 0) context.stats.mergedVariants += 1;
  }

  // A node whose text lives in a descendant (`<div RichTextContainer><h1>…`,
  // a link around a paragraph) flattens that descendant into itself. The
  // typography Framer put on the descendant (92 px, white) is what the page
  // shows; the container only carries the 16 px / black defaults. Without this
  // the lifted heading renders in the container's defaults.
  const ownText = node.states[0]?.text?.content ?? "";
  if (
    (primitive === "heading" || primitive === "link" || primitive === "body" || primitive === "text") &&
    ownText === "" &&
    node.children.length > 0
  ) {
    const source = firstTextNode(node);
    if (source !== null) {
      const typography = mergeStates(source.states);
      const sourceBase = cssToStyle(typographyOf(typography.base.visual));
      Object.assign(props, sourceBase);
      for (const [device, state] of [["tablet", typography.tablet], ["mobile", typography.mobile]] as const) {
        if (state === null) continue;
        for (const [property, value] of Object.entries(diffValues(sourceBase, cssToStyle(typographyOf(state.visual))))) {
          props[`${property}_${device}`] = value;
        }
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
    if (layout.gap !== undefined) props["gap"] = layout.gap;
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

function normalizeSpacingProps(props: Record<string, unknown>): void {
  for (const key of ["gap", "gap_tablet", "gap_mobile"]) {
    const value = props[key];
    if (typeof value !== "string") continue;
    const parts = value.trim().split(/\s+/);
    const row = parts[0] ?? "0px";
    const column = parts.length === 1 ? row : (parts[1] ?? row);
    props[key] = { row, column };
  }
  for (const key of ["padding", "margin", "padding_tablet", "margin_tablet", "padding_mobile", "margin_mobile"]) {
    const value = props[key];
    if (typeof value !== "string") continue;
    const parts = value.trim().split(/\s+/);
    const top = parts[0] ?? "0px";
    const right = parts.length === 1 ? top : (parts[1] ?? top);
    const bottom = parts.length === 1 ? top : (parts[2] ?? top);
    const left = parts.length === 1 ? right : (parts[3] ?? right);
    props[key] = { top, right, bottom, left };
  }
}

function cssToStyle(visual: { [key: string]: string | undefined }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, entry] of Object.entries(visual)) {
    if (entry === undefined) continue;
    const mapped = cssName(name);
    if (mapped !== undefined && entry !== "") out[mapped] = entry;
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

// One element as inline markup. Recursive and returning its HTML: an empty own
// text (`<p><a>Tel</a></p>`: the paragraph has no text of its own) must fall
// through to the children, never count as "has text", or the link inside the
// paragraph is dropped together with its label.
function inlineOf(child: IrNode): string {
  if (child.innerHtml !== undefined && child.innerHtml !== null) {
    const inner = sanitizeInlineHtml(child.innerHtml);
    return HEADING_TAGS.has(child.tag) || child.tag === "p" ? `<${child.tag}>${inner}</${child.tag}>` : inner;
  }
  const own = child.states[0]?.text?.content ?? "";
  const inner = own !== "" ? escapeHtml(own) : child.children.map(inlineOf).join("");
  if (child.tag === "a" && child.href !== null) {
    const newTab = child.target === "_blank" ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a href="${escapeHtmlAttr(child.href)}"${newTab}>${inner}</a>`;
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
// The first descendant that carries its own text.
function firstTextNode(node: IrNode): IrNode | null {
  for (const child of node.children) {
    if ((child.states[0]?.text?.content ?? "") !== "") return child;
    const inner = firstTextNode(child);
    if (inner !== null) return inner;
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

export function themePatchOf(document: FramerIrDocument): ThemePatch {
  // The dominant font family of the `@font-face` list becomes the body font;
  // the heaviest weight family becomes the display font. This is a *patch* —
  // update_theme merges it over the current theme.
  const families = new Map<string, Set<number>>();
  for (const font of document.styles.fonts) {
    if (font.src.length === 0) continue;
    const weights = families.get(font.family) ?? new Set<number>();
    if (font.weight !== null) weights.add(font.weight);
    families.set(font.family, weights);
  }
  let bodyFamily: string | null = null;
  let bodyWeights: number[] = [];
  let displayFamily: string | null = null;
  let displayMax = 0;
  for (const [family, weights] of families) {
    const sorted = [...weights].sort((a, b) => a - b);
    if (sorted.length === 0) continue;
    if (bodyFamily === null || sorted.length > bodyWeights.length) {
      bodyFamily = family;
      bodyWeights = sorted;
    }
    const max = sorted[sorted.length - 1] ?? 0;
    if (max > displayMax) {
      displayMax = max;
      displayFamily = family;
    }
  }
  const patch: ThemePatch = {};
  if (bodyFamily !== null) {
    patch.fonts = {
      body: { family: bodyFamily, fallback: ["system-ui", "sans-serif"], weights: bodyWeights },
      ...(displayFamily !== null && displayFamily !== bodyFamily
        ? {
            display: {
              family: displayFamily,
              fallback: ["system-ui", "sans-serif"],
              weights: [displayMax],
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
    Object.entries(declarations).map(([name, value]) => {
      const mapped = cssName(name);
      return [mapped ?? name, value];
    }),
  );

function styleRulesOf(normalized: NormalizedStyleRule[]): StyleRule[] {
  return normalized.map((rule, index) => ({
    id: rule.id,
    name: rule.name,
    kind: "class" as const,
    selector: `.${rule.name}`,
    order: index,
    styles: camelStyles(rule.declarations),
    // The element's `:hover` / `:focus` / `:active` / `:disabled` rules become the
    // rule's own states, which the compiler writes after the base declarations.
    ...(rule.states === undefined
      ? {}
      : {
          states: Object.fromEntries(
            Object.entries(rule.states).map(([name, declarations]) => [name, camelStyles(declarations)]),
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
): MapperResult {
  const context: MapContext = {
    ids: { next: 0 },
    nodes: {},
    classByNode: new Map(normalized.flatMap((rule) => rule.device === "desktop" ? rule.nodeKeys.map((key) => [key, rule.name] as const) : [])),
    breakpoints: new Map(
      document.breakpoints.map((entry) => [entry.id, { minWidth: entry.minWidth, maxWidth: entry.maxWidth }]),
    ),
    stats: { nodes: 0, mergedVariants: 0, placeholders: 0 },
    nodeIdByIrKey: {},
    findings: [...document.findings],
  };

  const page = document.pages[0];
  const root: EditorNode = {
    id: "root",
    primitive: "root",
    props: {
      title: page?.title ?? "Importierte Seite",
      lang: page?.lang ?? "de",
      ...(page === undefined
        ? {}
        : cssToStyle(page.root.states[0]?.visual ?? {})),
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

  return {
    document: {
      version: 2,
      rootNodeId: "root",
      nodes: context.nodes,
      styleRules: styleRulesOf(normalized),
    },
    rules: styleRulesOf(normalized),
    themePatch: themePatchOf(document),
    findings: context.findings,
    stats: context.stats,
    nodeIdByIrKey: { ...context.nodeIdByIrKey },
  };
}
