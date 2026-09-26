// Framer import IR (plan.md S1.1): the intermediate representation between the
// capture (HTML, plugin dump, browser probes) and the mapper. One shape for
// all three sources, so the mapper never knows where a value came from.
//
// The parser is tolerant in the same way `parseStyleRule` is: a broken entry
// drops, it never throws. A capture that survives a partial Framer export must
// still produce a report — dropping one node is a finding, losing the whole
// import is a failure.

import { Type } from "@sinclair/typebox";

const OPEN = {};

export const IR_VERSION = 1 as const;

export type IrSourceKind = "plugin" | "html" | "browser";

export type IrSource = {
  kind: IrSourceKind;
  url: string | null;
  projectId: string | null;
  capturedAt: string;
  // Idempotency: the same source hashes to the same value, so a second import
  // run can detect "nothing changed" (plan S2.5).
  contentHash: string;
};

export type IrBreakpoint = {
  id: string;
  minWidth: number;
  maxWidth: number | null;
  name: string | null;
};

// The three Framer text devices mapped onto Senify's devices. Framer's
// breakpoint hashes (B2) arrive per site; the mapper needs the *range*, not
// the hash, to decide which Senify device a variant belongs to.
export type IrDevice = "desktop" | "tablet" | "mobile";

export type IrDeviceValueMap = Record<string, string>;

export type IrColorToken = {
  id: string;
  name: string | null;
  value: string;
};

export type IrTextPreset = {
  id: string;
  name: string | null;
  // The declarations the preset carries, already resolved to Senify style
  // property names (`fontSize`, `lineHeight`, …) with literal CSS values.
  values: IrDeviceValueMap;
  breakpoints: { breakpointId: string; values: IrDeviceValueMap }[];
};

export type IrFontFace = {
  family: string;
  weight: number | null;
  style: string | null;
  src: string[];
  unicodeRange: string | null;
};

export type IrAssetKind = "image" | "video" | "font" | "svg";

export type IrAsset = {
  url: string;
  kind: IrAssetKind;
  hash: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
  localUrl?: string | null;
  assetId?: string | null;
};

// One measured animation sample. The static appear channel (B1) and the
// browser probes (B8) both land here — the mapper reads only `trigger` and
// `params`, the report keeps `raw` as evidence.
export type IrMotionSample = {
  nodeKey: string | null;
  library: "gsap" | "scrolltrigger" | "waapi" | "css" | "lenis" | "framer" | "unknown";
  trigger: "appear" | "scroll" | "hover" | "click" | "time" | "inview";
  // Endless loops (ticker marquee, befund §4) carry `loop: true` and the
  // duration; appear entries carry start/end/transition.
  params: Record<string, string | number | boolean>;
  raw: string;
};

export const IR_FINDING_KINDS = [
  "code-component",
  "shader",
  "cms",
  "locale",
  "breakpoint-collapse",
  "unsupported-declaration",
  "unknown-node",
  "asset-blocked",
  "page-transition",
  // Import-specific kinds (plan S1.4/S1.6, decisions 23.09.):
  // dna-adjustment — the normalizer changed the original to satisfy the DNA.
  // smooth-scroll — Lenis/SmoothScroll detected; profile concern, not dropped.
  // loop-animation — an endless CSS/WAAPI loop the presets cannot express 1:1.
  // font-subset — a `@font-face` subset the DSGVO task (S2.3b) will rewrite.
  "dna-adjustment",
  "smooth-scroll",
  "loop-animation",
  "font-subset",
] as const;

export type IrFindingKind = (typeof IR_FINDING_KINDS)[number];

export type IrFinding = {
  kind: IrFindingKind;
  nodeKey: string | null;
  message: string;
  // The Belegstelle: selector, class name, attribute — the report shows it.
  evidence: string;
  severity: "block" | "warn" | "info";
  suggestion: string;
};

export type IrNodeKind =
  | "frame"
  | "text"
  | "rich-text"
  | "svg"
  | "image"
  | "video"
  | "link"
  | "list"
  | "component-instance"
  | "component-definition"
  | "embed"
  | "placeholder"
  | "unknown";

export type IrLayout = {
  mode: "absolute" | "stack" | "grid" | "flow";
  direction?: "horizontal" | "vertical";
  reverse?: boolean;
  gap?: string;
  padding?: Partial<Record<"top" | "right" | "bottom" | "left", string>>;
  align?: string;
  justify?: string;
  wrap?: boolean;
  columns?: string;
  rows?: string;
};

export type IrBox = {
  width?: string;
  height?: string;
  minWidth?: string;
  maxWidth?: string;
  minHeight?: string;
  maxHeight?: string;
  aspectRatio?: string;
  position?: string;
  inset?: Partial<Record<"top" | "right" | "bottom" | "left", string>>;
  zIndex?: string;
};

export type IrVisual = Partial<Record<string, string>>;

export type IrTextContent = {
  content: string;
  // The `data-styles-preset` id when the element carries one (B3).
  presetId: string | null;
  // Inline `--framer-*` declarations resolved to Senify style property names.
  inline: IrDeviceValueMap;
  tag: string;
};

export type IrLink = {
  href: string;
  newTab: boolean;
};

export type IrState = {
  device: IrDevice;
  // Which Framer breakpoint hashes hide this variant (the `ssr-variant`
  // wrapper's `hidden-*` classes). Empty = the base variant.
  hiddenAt: string[];
  // The `framer-v-<hash>` variant class, when the element carries one.
  variantHash: string | null;
  visual: IrVisual;
  layout: IrLayout | null;
  box: IrBox | null;
  text: IrTextContent | null;
};

// One logical element. Per-device differences (B2/§4 point 5) arrive as
// `states[]` entries — the mapper's device merge folds them into one node
// with `_tablet`/`_mobile` values (plan S1.5).
export type IrCodeModule = {
  path: string;
  kind: "module" | "webgl-scene";
  license: { id: string; note: string | null };
  posterUrl: string | null;
  adapter: "mount-export" | "wave-background";
};

export type IrNode = {
  key: string;
  kind: IrNodeKind;
  name: string | null;
  componentType: string | null;
  codeModule?: IrCodeModule | null;
  // The intersection of the base class tokens across variants — the merge
  // anchor that proves two SSR variants are the same element (befund §4/5).
  baseClasses: string[];
  tag: string;
  href: string | null;
  assetUrl?: string | null;
  assetId?: string | null;
  states: IrState[];
  children: IrNode[];
  appearId: string | null;
  stylesPresetId: string | null;
  svg: string | null;
};

export type IrPage = {
  path: string;
  title: string | null;
  root: IrNode;
};

export type FramerIrDocument = {
  ir: typeof IR_VERSION;
  source: IrSource;
  breakpoints: IrBreakpoint[];
  pages: IrPage[];
  styles: {
    colors: IrColorToken[];
    textPresets: IrTextPreset[];
    fonts: IrFontFace[];
  };
  assets: IrAsset[];
  motion: IrMotionSample[];
  findings: IrFinding[];
};

/* ------------------------------------------------------------------ schema */

const IrSourceSchema = Type.Object(
  {
    kind: Type.Union([
      Type.Literal("plugin"),
      Type.Literal("html"),
      Type.Literal("browser"),
    ]),
    url: Type.Union([Type.String(), Type.Null()]),
    projectId: Type.Union([Type.String(), Type.Null()]),
    capturedAt: Type.String(),
    contentHash: Type.String({ minLength: 1 }),
  },
  OPEN,
);

const IrBreakpointSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    minWidth: Type.Number(),
    maxWidth: Type.Union([Type.Number(), Type.Null()]),
    name: Type.Union([Type.String(), Type.Null()]),
  },
  OPEN,
);

const IrFindingSchema = Type.Object(
  {
    kind: Type.String(),
    nodeKey: Type.Union([Type.String(), Type.Null()]),
    message: Type.String(),
    evidence: Type.String(),
    severity: Type.Union([
      Type.Literal("block"),
      Type.Literal("warn"),
      Type.Literal("info"),
    ]),
    suggestion: Type.String(),
  },
  OPEN,
);

const IrMotionSampleSchema = Type.Object(
  {
    nodeKey: Type.Union([Type.String(), Type.Null()]),
    library: Type.String(),
    trigger: Type.String(),
    params: Type.Record(Type.String(), Type.Unknown()),
    raw: Type.String(),
  },
  OPEN,
);

const IrAssetSchema = Type.Object(
  {
    url: Type.String({ minLength: 1 }),
    kind: Type.String(),
    hash: Type.Union([Type.String(), Type.Null()]),
    alt: Type.Union([Type.String(), Type.Null()]),
    width: Type.Union([Type.Number(), Type.Null()]),
    height: Type.Union([Type.Number(), Type.Null()]),
    localUrl: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    assetId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  },
  OPEN,
);

const IrFontFaceSchema = Type.Object(
  {
    family: Type.String({ minLength: 1 }),
    weight: Type.Union([Type.Number(), Type.Null()]),
    style: Type.Union([Type.String(), Type.Null()]),
    src: Type.Array(Type.String()),
    unicodeRange: Type.Union([Type.String(), Type.Null()]),
  },
  OPEN,
);

const IrColorTokenSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    name: Type.Union([Type.String(), Type.Null()]),
    value: Type.String({ minLength: 1 }),
  },
  OPEN,
);

const IrTextPresetSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    name: Type.Union([Type.String(), Type.Null()]),
    values: Type.Record(Type.String(), Type.String()),
    breakpoints: Type.Array(
      Type.Object(
        { breakpointId: Type.String(), values: Type.Record(Type.String(), Type.String()) },
        OPEN,
      ),
    ),
  },
  OPEN,
);

export const FramerIrSchema = Type.Object(
  {
    ir: Type.Literal(1),
    source: IrSourceSchema,
    breakpoints: Type.Array(IrBreakpointSchema),
    pages: Type.Array(Type.Unknown()),
    styles: Type.Object(
      {
        colors: Type.Array(IrColorTokenSchema),
        textPresets: Type.Array(IrTextPresetSchema),
        fonts: Type.Array(IrFontFaceSchema),
      },
      OPEN,
    ),
    assets: Type.Array(IrAssetSchema),
    motion: Type.Array(IrMotionSampleSchema),
    findings: Type.Array(IrFindingSchema),
  },
  OPEN,
);

/* ----------------------------------------------------------------- parser */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asIrVisual(value: unknown): IrVisual {
  if (!isRecord(value)) return {};
  const out: IrVisual = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}

function asIrLayout(value: unknown): IrLayout | null {
  if (!isRecord(value)) return null;
  const mode = asString(value.mode);
  if (mode !== "absolute" && mode !== "stack" && mode !== "grid" && mode !== "flow") {
    return null;
  }
  const out: IrLayout = { mode };
  const direction = asString(value.direction);
  if (direction === "horizontal" || direction === "vertical") out.direction = direction;
  if (value.reverse === true) out.reverse = true;
  const gap = asString(value.gap);
  if (gap !== undefined) out.gap = gap;
  if (isRecord(value.padding)) {
    const padding: IrLayout["padding"] = {};
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const entry = asString(value.padding[side]);
      if (entry !== undefined) padding[side] = entry;
    }
    if (Object.keys(padding).length > 0) out.padding = padding;
  }
  for (const key of ["align", "justify", "columns", "rows"] as const) {
    const entry = asString(value[key]);
    if (entry !== undefined) out[key] = entry;
  }
  if (value.wrap === true) out.wrap = true;
  return out;
}

function asIrBox(value: unknown): IrBox | null {
  if (!isRecord(value)) return null;
  const out: IrBox = {};
  for (const key of [
    "width",
    "height",
    "minWidth",
    "maxWidth",
    "minHeight",
    "maxHeight",
    "aspectRatio",
    "position",
    "zIndex",
  ] as const) {
    const entry = asString(value[key]);
    if (entry !== undefined) out[key] = entry;
  }
  if (isRecord(value.inset)) {
    const inset: IrBox["inset"] = {};
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const entry = asString(value.inset[side]);
      if (entry !== undefined) inset[side] = entry;
    }
    if (Object.keys(inset).length > 0) out.inset = inset;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function asIrText(value: unknown): IrTextContent | null {
  if (!isRecord(value)) return null;
  const content = asString(value.content);
  if (content === undefined) return null;
  const tag = asString(value.tag) ?? "p";
  const inline: IrDeviceValueMap = {};
  if (isRecord(value.inline)) {
    for (const [key, entry] of Object.entries(value.inline)) {
      if (typeof entry === "string") inline[key] = entry;
    }
  }
  return {
    content,
    presetId: asString(value.presetId) ?? null,
    inline,
    tag,
  };
}

function asIrState(value: unknown): IrState | undefined {
  if (!isRecord(value)) return undefined;
  const device = asString(value.device);
  if (device !== "desktop" && device !== "tablet" && device !== "mobile") return undefined;
  const hiddenAt = Array.isArray(value.hiddenAt)
    ? value.hiddenAt.filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    device,
    hiddenAt,
    variantHash: asString(value.variantHash) ?? null,
    visual: asIrVisual(value.visual),
    layout: asIrLayout(value.layout),
    box: asIrBox(value.box),
    text: asIrText(value.text),
  };
}

const IR_NODE_KINDS: readonly IrNodeKind[] = [
  "frame",
  "text",
  "rich-text",
  "svg",
  "image",
  "video",
  "link",
  "list",
  "component-instance",
  "component-definition",
  "embed",
  "placeholder",
  "unknown",
];

function asIrNode(value: unknown): IrNode | undefined {
  if (!isRecord(value)) return undefined;
  const key = asString(value.key);
  if (key === undefined || key === "") return undefined;
  const kind = asString(value.kind);
  if (kind === undefined || !IR_NODE_KINDS.includes(kind as IrNodeKind)) return undefined;
  const baseClasses = Array.isArray(value.baseClasses)
    ? value.baseClasses.filter((entry): entry is string => typeof entry === "string")
    : [];
  const states = Array.isArray(value.states)
    ? value.states
        .map(asIrState)
        .filter((entry): entry is IrState => entry !== undefined)
    : [];
  const children = Array.isArray(value.children)
    ? value.children
        .map(asIrNode)
        .filter((entry): entry is IrNode => entry !== undefined)
    : [];
  return {
    key,
    kind: kind as IrNodeKind,
    name: asString(value.name) ?? null,
    componentType: asString(value.componentType) ?? null,
    baseClasses,
    tag: asString(value.tag) ?? "div",
    href: asString(value.href) ?? null,
    ...(asString(value.assetUrl) === undefined ? {} : { assetUrl: asString(value.assetUrl) ?? null }),
    ...(asString(value.assetId) === undefined ? {} : { assetId: asString(value.assetId) ?? null }),
    ...(isRecord(value.codeModule) && asString(value.codeModule.path) !== undefined
      ? {
          codeModule: {
            path: asString(value.codeModule.path) ?? "",
            kind: asString(value.codeModule.kind) === "webgl-scene" ? "webgl-scene" as const : "module" as const,
            license: {
              id: asString(isRecord(value.codeModule.license) ? value.codeModule.license.id : undefined) ?? "unknown",
              note: asString(isRecord(value.codeModule.license) ? value.codeModule.license.note : undefined) ?? null,
            },
            posterUrl: asString(value.codeModule.posterUrl) ?? null,
            adapter: asString(value.codeModule.adapter) === "wave-background" ? "wave-background" as const : "mount-export" as const,
          },
        }
      : {}),
    states,
    children,
    appearId: asString(value.appearId) ?? null,
    stylesPresetId: asString(value.stylesPresetId) ?? null,
    svg: asString(value.svg) ?? null,
  };
}

function asIrBreakpoint(value: unknown): IrBreakpoint | undefined {
  if (!isRecord(value)) return undefined;
  const id = asString(value.id);
  const minWidth = asNumber(value.minWidth);
  if (id === undefined || minWidth === undefined) return undefined;
  return {
    id,
    minWidth,
    maxWidth: asNumber(value.maxWidth) ?? null,
    name: asString(value.name) ?? null,
  };
}

function asIrFinding(value: unknown): IrFinding | undefined {
  if (!isRecord(value)) return undefined;
  const message = asString(value.message);
  if (message === undefined) return undefined;
  const kind = asString(value.kind);
  const severity = asString(value.severity);
  return {
    kind: (IR_FINDING_KINDS as readonly string[]).includes(kind ?? "")
      ? (kind as IrFindingKind)
      : "unknown-node",
    nodeKey: asString(value.nodeKey) ?? null,
    message,
    evidence: asString(value.evidence) ?? "",
    severity:
      severity === "block" || severity === "warn" || severity === "info" ? severity : "warn",
    suggestion: asString(value.suggestion) ?? "",
  };
}

function asIrMotionSample(value: unknown): IrMotionSample | undefined {
  if (!isRecord(value)) return undefined;
  const trigger = asString(value.trigger);
  if (trigger === undefined) return undefined;
  const params: Record<string, string | number | boolean> = {};
  if (isRecord(value.params)) {
    for (const [key, entry] of Object.entries(value.params)) {
      if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
        params[key] = entry;
      }
    }
  }
  const library = asString(value.library);
  return {
    nodeKey: asString(value.nodeKey) ?? null,
    library:
      library === "gsap" ||
      library === "scrolltrigger" ||
      library === "waapi" ||
      library === "css" ||
      library === "lenis" ||
      library === "framer"
        ? library
        : "unknown",
    trigger: trigger as IrMotionSample["trigger"],
    params,
    raw: asString(value.raw) ?? "",
  };
}

function asIrAsset(value: unknown): IrAsset | undefined {
  if (!isRecord(value)) return undefined;
  const url = asString(value.url);
  if (url === undefined || url === "") return undefined;
  return {
    url,
    kind: asString(value.kind) === "video" ? "video" : asString(value.kind) === "font" ? "font" : asString(value.kind) === "svg" ? "svg" : "image",
    hash: asString(value.hash) ?? null,
    alt: asString(value.alt) ?? null,
    width: asNumber(value.width) ?? null,
    height: asNumber(value.height) ?? null,
    ...(asString(value.localUrl) === undefined ? {} : { localUrl: asString(value.localUrl) ?? null }),
    ...(asString(value.assetId) === undefined ? {} : { assetId: asString(value.assetId) ?? null }),
  };
}

function asIrFontFace(value: unknown): IrFontFace | undefined {
  if (!isRecord(value)) return undefined;
  const family = asString(value.family);
  if (family === undefined || family === "") return undefined;
  return {
    family,
    weight: asNumber(value.weight) ?? null,
    style: asString(value.style) ?? null,
    src: Array.isArray(value.src)
      ? value.src.filter((entry): entry is string => typeof entry === "string")
      : [],
    unicodeRange: asString(value.unicodeRange) ?? null,
  };
}

function asIrColorToken(value: unknown): IrColorToken | undefined {
  if (!isRecord(value)) return undefined;
  const id = asString(value.id);
  const color = asString(value.value);
  if (id === undefined || color === undefined) return undefined;
  return { id, name: asString(value.name) ?? null, value: color };
}

function asIrTextPreset(value: unknown): IrTextPreset | undefined {
  if (!isRecord(value)) return undefined;
  const id = asString(value.id);
  if (id === undefined) return undefined;
  const values: IrDeviceValueMap = {};
  if (isRecord(value.values)) {
    for (const [key, entry] of Object.entries(value.values)) {
      if (typeof entry === "string") values[key] = entry;
    }
  }
  const breakpoints: IrTextPreset["breakpoints"] = [];
  if (Array.isArray(value.breakpoints)) {
    for (const entry of value.breakpoints) {
      if (!isRecord(entry)) continue;
      const breakpointId = asString(entry.breakpointId);
      if (breakpointId === undefined) continue;
      const bpValues: IrDeviceValueMap = {};
      if (isRecord(entry.values)) {
        for (const [key, inner] of Object.entries(entry.values)) {
          if (typeof inner === "string") bpValues[key] = inner;
        }
      }
      breakpoints.push({ breakpointId, values: bpValues });
    }
  }
  return { id, name: asString(value.name) ?? null, values, breakpoints };
}

// Tolerant: an IR that fails the top-level shape returns `undefined` with the
// reason, a partially broken document keeps every readable entry and drops the
// rest — one finding per drop would be noise, the counts in the report say it.
export function parseIr(raw: unknown):
  | { ok: true; document: FramerIrDocument }
  | { ok: false; reason: string } {
  if (!isRecord(raw)) return { ok: false, reason: "IR is not an object" };
  if (raw.ir !== IR_VERSION) {
    return { ok: false, reason: `IR version must be ${IR_VERSION}, got ${String(raw.ir)}` };
  }
  const source = isRecord(raw.source) ? raw.source : undefined;
  const contentHash = source === undefined ? undefined : asString(source.contentHash);
  const capturedAt = source === undefined ? undefined : asString(source.capturedAt);
  const kind = source === undefined ? undefined : asString(source.kind);
  if (contentHash === undefined || contentHash === "" || capturedAt === undefined) {
    return { ok: false, reason: "IR source is missing contentHash or capturedAt" };
  }
  const breakpoints = Array.isArray(raw.breakpoints)
    ? raw.breakpoints
        .map(asIrBreakpoint)
        .filter((entry): entry is IrBreakpoint => entry !== undefined)
    : [];
  const pages: IrPage[] = [];
  if (Array.isArray(raw.pages)) {
    for (const entry of raw.pages) {
      if (!isRecord(entry)) continue;
      const root = asIrNode(entry.root);
      if (root === undefined) continue;
      pages.push({
        path: asString(entry.path) ?? "/",
        title: asString(entry.title) ?? null,
        root,
      });
    }
  }
  const styles = isRecord(raw.styles) ? raw.styles : {};
  const colors = Array.isArray(styles.colors)
    ? styles.colors.map(asIrColorToken).filter((entry): entry is IrColorToken => entry !== undefined)
    : [];
  const textPresets = Array.isArray(styles.textPresets)
    ? styles.textPresets
        .map(asIrTextPreset)
        .filter((entry): entry is IrTextPreset => entry !== undefined)
    : [];
  const fonts = Array.isArray(styles.fonts)
    ? styles.fonts.map(asIrFontFace).filter((entry): entry is IrFontFace => entry !== undefined)
    : [];
  const assets = Array.isArray(raw.assets)
    ? raw.assets.map(asIrAsset).filter((entry): entry is IrAsset => entry !== undefined)
    : [];
  const motion = Array.isArray(raw.motion)
    ? raw.motion.map(asIrMotionSample).filter((entry): entry is IrMotionSample => entry !== undefined)
    : [];
  const findings = Array.isArray(raw.findings)
    ? raw.findings.map(asIrFinding).filter((entry): entry is IrFinding => entry !== undefined)
    : [];
  return {
    ok: true,
    document: {
      ir: IR_VERSION,
      source: {
        kind:
          kind === "plugin" || kind === "browser" ? kind : ("html" as IrSourceKind),
        url: source === undefined ? null : (asString(source.url) ?? null),
        projectId: source === undefined ? null : (asString(source.projectId) ?? null),
        capturedAt,
        contentHash,
      },
      breakpoints,
      pages,
      styles: { colors, textPresets, fonts },
      assets,
      motion,
      findings,
    },
  };
}
