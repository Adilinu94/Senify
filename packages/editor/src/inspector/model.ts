// Inspector model (ticket 02, slice 1): the panel as plain data.
//
// The rebuild inspector is generated, never hand-built: the Content tab comes
// from the primitive's catalog controls, the Style tab from the style property
// table of the widget engine (`STYLE_PROPERTIES`, filtered by the primitive's
// `styleGroups`), the Interactions tab from the motion preset registry, and the
// Advanced tab from the structural node flags. This module owns the model only
// (no DOM), so the field family, the device overrides and the token/literal
// rule are unit-testable without a browser; `inspector.ts` renders it.
//
// The value semantics follow `widget-engine/device.ts`: a value lives in the
// base key (`padding`) and an override in the suffixed key (`padding_tablet`).
// The model reports the effective value for the active device, the base value
// behind an override, and every device that carries one — the device dots.

import {
  DEVICES,
  getPrimitive,
  hasDeviceOverride,
  isControlVisible,
  resolveDeviceValue,
  STYLE_PROPERTIES,
  stylePropertyFor,
  type Choice,
  type Control,
  type Device,
  type PrimitiveDefinition,
  type PropValue,
  type StyleGroup,
  type Unit,
} from "@senify/widget-engine";
import {
  MOTION_PROFILE_RULES,
  MOTION_PRESETS,
  type MotionProfile,
  type MotionSpec,
} from "@senify/section-sdk";
import type { Theme } from "@senify/tokens";
import { tokenOptionsFor, type TokenOption } from "../panels.ts";
import type { EditorDocument, EditorNode } from "../state/document.ts";
import type { EditorTabId } from "../state/ui-state.ts";

// The tab vocabulary lives in the session state (`state/ui-state.ts`) so the
// shell can persist and restore it; the inspector is one projection of it.
export type InspectorTabId = EditorTabId;

// The field family of the preview (`ui-plan.md` 5.1-5.5): number with stepper,
// slider with unit, switch, select and colour picker; text/textarea and the
// structured bags (four-fold, pair) round it out, media/repeater/icon follow in
// slice 2 and render as their raw value for now.
export type InspectorFieldKind =
  | "text"
  | "textarea"
  | "url"
  | "number"
  | "slider"
  | "switcher"
  | "select"
  | "color"
  | "dimensions"
  | "gaps"
  | "media"
  | "icon"
  | "repeater";

// Where a committed value goes: node props (device-aware), the motion spec, or
// the structural flags of the node.
export type InspectorCommit =
  | { kind: "prop" }
  | { kind: "motion" }
  | { kind: "hidden"; device: "tablet" | "mobile" }
  | { kind: "locked" };

export type InspectorField = {
  key: string;
  label: string;
  kind: InspectorFieldKind;
  commit: InspectorCommit;
  // Effective value for the active device, and the desktop value behind it.
  value: PropValue | undefined;
  base: PropValue | undefined;
  // True when the active device carries an explicit override (tablet/mobile).
  overridden: boolean;
  // Every device that carries an explicit override of this key.
  overrideDevices: Device[];
  responsive: boolean;
  hidden: boolean;
  // Catalog control metadata (drives the control family).
  min: number | undefined;
  max: number | undefined;
  step: number | undefined;
  units: Unit[] | undefined;
  options: Choice[] | undefined;
  alpha: boolean;
  linkable: boolean;
  fields: InspectorField[] | undefined;
  minItems: number | undefined;
  maxItems: number | undefined;
  // Colour fields: the theme tokens and the literal rule.
  tokenOptions: TokenOption[] | undefined;
  tokenRef: string | null;
  literalWarning: string | undefined;
  // The source of a Style-tab field: the primitive's own control or the style
  // property table. The style group orders the panel.
  source: "control" | "style";
  styleGroup: StyleGroup | undefined;
};

export type InspectorGroup = {
  id: string;
  label: string;
  fields: InspectorField[];
};

export type InspectorMotion = {
  preset: string | null;
  fields: InspectorField[];
  profile: MotionProfile;
  intensityCap: number;
  allowedPresets: readonly string[] | "all";
  presets: string[];
};

export type InspectorTab = {
  id: InspectorTabId;
  label: string;
  groups: InspectorGroup[];
};

export type InspectorModel = {
  nodeId: string;
  title: string;
  tabs: InspectorTab[];
  motion: InspectorMotion;
};

export type BuildInspectorInput = {
  document: EditorDocument;
  nodeId: string;
  breakpoint: Device;
  theme?: Theme;
  profile?: MotionProfile;
};

export const INSPECTOR_TABS: readonly { id: InspectorTabId; label: string }[] = [
  { id: "content", label: "Content" },
  { id: "style", label: "Style" },
  { id: "interactions", label: "Interactions" },
  { id: "advanced", label: "Advanced" },
];

const STYLE_GROUP_LABELS: Record<StyleGroup, string> = {
  layout: "Layout",
  spacing: "Abstand",
  size: "Größe",
  typography: "Typografie",
  color: "Farbe",
  border: "Rahmen",
  effects: "Effekte",
};

// The select options of the keyword style properties (ui surface description,
// ADR-0005). A keyword without an entry stays a free text field.
const KEYWORD_OPTIONS: Record<string, string[]> = {
  position: ["static", "relative", "absolute", "fixed", "sticky"],
  overflow: ["visible", "hidden", "clip", "auto", "scroll"],
  overflowX: ["visible", "hidden", "clip", "auto", "scroll"],
  overflowY: ["visible", "hidden", "clip", "auto", "scroll"],
  flexDirection: ["row", "row-reverse", "column", "column-reverse"],
  flexWrap: ["nowrap", "wrap", "wrap-reverse"],
  justifyContent: [
    "flex-start",
    "flex-end",
    "center",
    "space-between",
    "space-around",
    "space-evenly",
  ],
  alignItems: ["stretch", "flex-start", "flex-end", "center", "baseline"],
  alignContent: [
    "stretch",
    "flex-start",
    "flex-end",
    "center",
    "space-between",
    "space-around",
  ],
  placeItems: ["stretch", "start", "end", "center"],
  gridAutoFlow: ["row", "column", "row dense", "column dense"],
  textAlign: ["start", "center", "end", "justify"],
  textDecoration: ["none", "underline", "line-through", "underline line-through"],
  textTransform: ["none", "uppercase", "lowercase", "capitalize"],
  fontStyle: ["normal", "italic", "oblique"],
  borderStyle: ["none", "solid", "dashed", "dotted", "double"],
  mixBlendMode: [
    "normal",
    "multiply",
    "screen",
    "overlay",
    "darken",
    "lighten",
    "color-dodge",
    "difference",
    "exclusion",
    "luminosity",
  ],
  aspectRatio: ["auto", "16 / 9", "4 / 3", "1 / 1", "3 / 4"],
};

const COLOR_KINDS = new Set(["color"]);

function isRecord(value: PropValue | undefined): value is { [key: string]: PropValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function tokenRefOf(value: PropValue | undefined): string | null {
  if (!isRecord(value)) return null;
  const ref = value["$token"];
  return typeof ref === "string" && ref !== "" ? ref : null;
}

function canonical(key: string): string {
  return stylePropertyFor(key)?.prop ?? key;
}

// The unit a value is shown with: a string brings its own unit, a number takes
// the first unit of its control or property.
export function unitOfValue(
  value: PropValue | undefined,
  units: readonly Unit[] | undefined,
): Unit | undefined {
  if (typeof value === "string") {
    const match = /([a-z%]+)$/i.exec(value.trim());
    if (match && match[1] !== undefined) {
      const unit = match[1] as Unit;
      if (units === undefined || units.includes(unit)) return unit;
    }
  }
  return units?.[0];
}

// The numeric part of a length value, for the slider and the number field.
export function numberPart(value: PropValue | undefined): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function styleFieldsFor(
  definition: PrimitiveDefinition | undefined,
  node: EditorNode,
  breakpoint: Device,
  theme: Theme | undefined,
  controlKeys: Set<string>,
): InspectorGroup[] {
  // A real catalog primitive narrows the style groups it offers; an unknown or
  // legacy type keeps the whole table (ADR-0005: the groups are an order, not a
  // gate).
  const groups =
    definition !== undefined && definition.legacy !== true
      ? new Set<StyleGroup>(definition.styleGroups)
      : undefined;
  const values = node.props;
  const collected = new Map<StyleGroup, InspectorField[]>();
  for (const spec of STYLE_PROPERTIES) {
    if (groups !== undefined && !groups.has(spec.group)) continue;
    // A property the primitive's own control owns stays in the Content tab.
    if (controlKeys.has(canonical(spec.prop))) continue;
    const value = resolveDeviceValue(values, spec.prop, breakpoint);
    const base = resolveDeviceValue(values, spec.prop, "desktop");
    const keywordOptions = KEYWORD_OPTIONS[spec.prop];
    const field: InspectorField = {
      key: spec.prop,
      label: labelForStyleProp(spec.prop),
      kind: fieldKindForStyle(spec.kind),
      commit: { kind: "prop" },
      value,
      base,
      // Desktop carries the base value; only the narrower devices can be an
      // override (`hasDeviceOverride` would report the base key itself).
      overridden: breakpoint !== "desktop" && hasDeviceOverride(values, spec.prop, breakpoint),
      overrideDevices: DEVICES.filter(
        (device) => device !== "desktop" && hasDeviceOverride(values, spec.prop, device),
      ),
      responsive: true,
      hidden: false,
      min: undefined,
      max: undefined,
      step: undefined,
      units: spec.units === undefined ? undefined : [...spec.units],
      options:
        spec.kind === "keyword" && keywordOptions !== undefined
          ? keywordOptions.map((option) => ({ value: option, label: option }))
          : undefined,
      alpha: COLOR_KINDS.has(spec.kind),
      linkable: spec.kind === "spacing" || spec.kind === "gaps",
      fields: undefined,
      minItems: undefined,
      maxItems: undefined,
      tokenOptions: undefined,
      tokenRef: null,
      literalWarning: undefined,
      source: "style",
      styleGroup: spec.group,
    };
    attachColorTokens(field, theme);
    const list = collected.get(spec.group) ?? [];
    list.push(field);
    collected.set(spec.group, list);
  }
  return [...collected.entries()].map(([group, fields]) => ({
    id: `style/${group}`,
    label: STYLE_GROUP_LABELS[group],
    fields,
  }));
}

function fieldKindForStyle(kind: string): InspectorFieldKind {
  switch (kind) {
    case "length":
    case "unitless":
    case "radius":
    case "columns":
      return "number";
    case "color":
      return "color";
    case "keyword":
      return "select";
    case "spacing":
      return "dimensions";
    case "gaps":
      return "gaps";
    default:
      return "text";
  }
}

// Human labels for the style property table. The keys are the canonical camel
// case names; a missing entry falls back to the raw key.
const STYLE_PROP_LABELS: Record<string, string> = {
  position: "Position",
  inset: "Innenabstand (alle Seiten)",
  top: "Oben",
  right: "Rechts",
  bottom: "Unten",
  left: "Links",
  zIndex: "Z-Index",
  overflow: "Überlauf",
  overflowX: "Überlauf X",
  overflowY: "Überlauf Y",
  flexDirection: "Flex-Richtung",
  flexWrap: "Umbruch",
  justifyContent: "Verteilung",
  alignItems: "Ausrichtung",
  alignContent: "Zeilen-Ausrichtung",
  placeItems: "Zellen-Ausrichtung",
  flexGrow: "Wachsen",
  flexShrink: "Schrumpfen",
  flexBasis: "Basisbreite",
  order: "Reihenfolge",
  gridTemplateColumns: "Spalten",
  gridTemplateRows: "Zeilen",
  gridColumn: "Spaltenbereich",
  gridRow: "Zeilenbereich",
  gridAutoFlow: "Rasterfluss",
  padding: "Innenabstand",
  margin: "Außenabstand",
  gap: "Abstand",
  width: "Breite",
  height: "Höhe",
  minWidth: "Mindestbreite",
  maxWidth: "Höchstbreite",
  minHeight: "Mindesthöhe",
  maxHeight: "Höchsthöhe",
  aspectRatio: "Seitenverhältnis",
  fontFamily: "Schriftfamilie",
  fontSize: "Schriftgröße",
  fontWeight: "Schriftstärke",
  lineHeight: "Zeilenhöhe",
  letterSpacing: "Laufweite",
  textAlign: "Textausrichtung",
  textDecoration: "Textdekoration",
  textTransform: "Schreibung",
  fontStyle: "Schriftschnitt",
  color: "Textfarbe",
  background: "Hintergrund",
  backgroundImage: "Hintergrundbild",
  borderWidth: "Rahmenbreite",
  borderStyle: "Rahmenstil",
  borderColor: "Rahmenfarbe",
  borderRadius: "Eckenradius",
  boxShadow: "Schatten",
  opacity: "Deckkraft",
  filter: "Filter",
  backdropFilter: "Hintergrundfilter",
  mixBlendMode: "Mischmodus",
  transition: "Übergang",
  transform: "Transformation",
};

function labelForStyleProp(prop: string): string {
  return STYLE_PROP_LABELS[prop] ?? prop;
}

function attachColorTokens(field: InspectorField, theme: Theme | undefined): void {
  if (field.kind !== "color") return;
  if (theme === undefined) return;
  field.tokenOptions = tokenOptionsFor("color", theme);
  field.tokenRef = tokenRefOf(field.value);
  if (
    field.tokenRef === null &&
    typeof field.value === "string" &&
    field.tokenOptions.length > 0
  ) {
    field.literalWarning = `Literal "${field.value}" umgeht die Theme-Tokens`;
  }
}

function controlToField(
  control: Control,
  node: EditorNode,
  breakpoint: Device,
  theme: Theme | undefined,
): InspectorField {
  const value = resolveDeviceValue(node.props, control.key, breakpoint);
  const base = resolveDeviceValue(node.props, control.key, "desktop");
  const responsive = control.responsive !== false;
  const field: InspectorField = {
    key: control.key,
    label: control.label,
    kind: kindForControl(control),
    commit: { kind: "prop" },
    value,
    base,
    overridden:
      responsive && breakpoint !== "desktop" && hasDeviceOverride(node.props, control.key, breakpoint),
    overrideDevices: responsive
      ? DEVICES.filter(
          (device) => device !== "desktop" && hasDeviceOverride(node.props, control.key, device),
        )
      : [],
    responsive,
    hidden: !isControlVisible(control, node.props),
    min: control.min,
    max: control.max,
    step: control.step,
    units: control.units === undefined ? undefined : [...control.units],
    options: control.options,
    alpha: control.alpha === true,
    linkable: control.linkable === true,
    fields: control.fields?.map((nested) =>
      controlToField(nested, node, breakpoint, theme),
    ),
    minItems: control.minItems,
    maxItems: control.maxItems,
    tokenOptions: undefined,
    tokenRef: null,
    literalWarning: undefined,
    source: "control",
    styleGroup: undefined,
  };
  attachColorTokens(field, theme);
  return field;
}

function kindForControl(control: Control): InspectorFieldKind {
  switch (control.kind) {
    case "text":
    case "textarea":
    case "url":
    case "media":
    case "icon":
    case "repeater":
    case "dimensions":
    case "gaps":
    case "color":
    case "switcher":
    case "slider":
    case "number":
      return control.kind;
    case "choose":
    case "select":
      return "select";
    default:
      return "text";
  }
}

function motionFields(
  node: EditorNode,
  theme: Theme | undefined,
  profile: MotionProfile,
): InspectorMotion {
  const rules = MOTION_PROFILE_RULES[profile];
  const presets = MOTION_PRESETS.map((preset) => preset.id);
  const spec = node.motion;
  const cap = rules.intensityCap;
  const fields: InspectorField[] = [];
  const push = (field: InspectorField): void => {
    fields.push(field);
  };
  // The preset select is the way in: the other fields only make sense on an
  // existing spec (same rule as the running editor).
  push({
    key: "preset",
    label: "Preset",
    kind: "select",
    commit: { kind: "motion" },
    value: spec?.preset ?? presets[0] ?? null,
    base: undefined,
    overridden: false,
    overrideDevices: [],
    responsive: false,
    hidden: false,
    min: undefined,
    max: undefined,
    step: undefined,
    units: undefined,
    options: presets.map((preset) => ({
      value: preset,
      label:
        rules.presets === "all" || rules.presets.includes(preset)
          ? preset
          : `${preset} · gesperrt`,
    })),
    alpha: false,
    linkable: false,
    fields: undefined,
    minItems: undefined,
    maxItems: undefined,
    tokenOptions: undefined,
    tokenRef: null,
    literalWarning:
      spec !== undefined && rules.presets !== "all" && !rules.presets.includes(spec.preset)
        ? `„${spec.preset}“ ist im Profil ${profile} nicht erlaubt`
        : undefined,
    source: "control",
    styleGroup: undefined,
  });
  push({
    key: "intensity",
    label: "Intensität",
    kind: "slider",
    commit: { kind: "motion" },
    value: spec?.intensity ?? 5,
    base: undefined,
    overridden: false,
    overrideDevices: [],
    responsive: false,
    hidden: false,
    min: 1,
    max: cap,
    step: 1,
    units: undefined,
    options: undefined,
    alpha: false,
    linkable: false,
    fields: undefined,
    minItems: undefined,
    maxItems: undefined,
    tokenOptions: undefined,
    tokenRef: null,
    literalWarning: undefined,
    source: "control",
    styleGroup: undefined,
  });
  push({
    key: "trigger",
    label: "Auslöser",
    kind: "select",
    commit: { kind: "motion" },
    value: spec?.trigger ?? "viewport",
    base: undefined,
    overridden: false,
    overrideDevices: [],
    responsive: false,
    hidden: false,
    min: undefined,
    max: undefined,
    step: undefined,
    units: undefined,
    options: ["viewport", "load", "scroll", "hover"].map((value) => ({ value, label: value })),
    alpha: false,
    linkable: false,
    fields: undefined,
    minItems: undefined,
    maxItems: undefined,
    tokenOptions: undefined,
    tokenRef: null,
    literalWarning: undefined,
    source: "control",
    styleGroup: undefined,
  });
  push({
    key: "delay",
    label: "Verzögerung",
    kind: "number",
    commit: { kind: "motion" },
    value: spec?.delay ?? 0,
    base: undefined,
    overridden: false,
    overrideDevices: [],
    responsive: false,
    hidden: false,
    min: 0,
    max: undefined,
    step: 10,
    units: undefined,
    options: undefined,
    alpha: false,
    linkable: false,
    fields: undefined,
    minItems: undefined,
    maxItems: undefined,
    tokenOptions: undefined,
    tokenRef: null,
    literalWarning: undefined,
    source: "control",
    styleGroup: undefined,
  });
  const easeNames = Object.keys(theme?.motion.ease ?? {});
  push({
    key: "ease",
    label: "Easing",
    kind: "select",
    commit: { kind: "motion" },
    value: spec?.tokens?.ease ?? "",
    base: undefined,
    overridden: false,
    overrideDevices: [],
    responsive: false,
    hidden: false,
    min: undefined,
    max: undefined,
    step: undefined,
    units: undefined,
    options: [{ value: "", label: "Standard" }, ...easeNames.map((name) => ({ value: name, label: name }))],
    alpha: false,
    linkable: false,
    fields: undefined,
    minItems: undefined,
    maxItems: undefined,
    tokenOptions: undefined,
    tokenRef: null,
    literalWarning: undefined,
    source: "control",
    styleGroup: undefined,
  });
  push({
    key: "durationScale",
    label: "Dauer-Faktor",
    kind: "number",
    commit: { kind: "motion" },
    value: spec?.tokens?.durationScale ?? 1,
    base: undefined,
    overridden: false,
    overrideDevices: [],
    responsive: false,
    hidden: false,
    min: 0.1,
    max: undefined,
    step: 0.05,
    units: undefined,
    options: undefined,
    alpha: false,
    linkable: false,
    fields: undefined,
    minItems: undefined,
    maxItems: undefined,
    tokenOptions: undefined,
    tokenRef: null,
    literalWarning: undefined,
    source: "control",
    styleGroup: undefined,
  });
  push({
    key: "stagger",
    label: "Stagger-Faktor",
    kind: "number",
    commit: { kind: "motion" },
    value: spec?.tokens?.stagger ?? 1,
    base: undefined,
    overridden: false,
    overrideDevices: [],
    responsive: false,
    hidden: false,
    min: 0,
    max: undefined,
    step: 0.05,
    units: undefined,
    options: undefined,
    alpha: false,
    linkable: false,
    fields: undefined,
    minItems: undefined,
    maxItems: undefined,
    tokenOptions: undefined,
    tokenRef: null,
    literalWarning: undefined,
    source: "control",
    styleGroup: undefined,
  });
  push({
    key: "reducedMotion",
    label: "Reduced Motion",
    kind: "select",
    commit: { kind: "motion" },
    value: spec?.reducedMotion ?? "static",
    base: undefined,
    overridden: false,
    overrideDevices: [],
    responsive: false,
    hidden: false,
    min: undefined,
    max: undefined,
    step: undefined,
    units: undefined,
    options: ["static", "fade", "off"].map((value) => ({ value, label: value })),
    alpha: false,
    linkable: false,
    fields: undefined,
    minItems: undefined,
    maxItems: undefined,
    tokenOptions: undefined,
    tokenRef: null,
    literalWarning: undefined,
    source: "control",
    styleGroup: undefined,
  });
  push({
    key: "enabled",
    label: "Aktiv",
    kind: "switcher",
    commit: { kind: "motion" },
    value: spec?.enabled !== false,
    base: undefined,
    overridden: false,
    overrideDevices: [],
    responsive: false,
    hidden: false,
    min: undefined,
    max: undefined,
    step: undefined,
    units: undefined,
    options: undefined,
    alpha: false,
    linkable: false,
    fields: undefined,
    minItems: undefined,
    maxItems: undefined,
    tokenOptions: undefined,
    tokenRef: null,
    literalWarning: undefined,
    source: "control",
    styleGroup: undefined,
  });
  return {
    preset: spec?.preset ?? null,
    fields,
    profile,
    intensityCap: cap,
    allowedPresets: rules.presets,
    presets,
  };
}

function advancedGroups(node: EditorNode): InspectorGroup[] {
  const visibility: InspectorField[] = [];
  const flag = (device: "tablet" | "mobile"): InspectorField => ({
    key: `hidden_${device}`,
    label: `Auf ${device === "tablet" ? "Tablet" : "Mobil"} ausblenden`,
    kind: "switcher",
    commit: { kind: "hidden", device },
    value: node.hiddenDevices?.includes(device) ?? false,
    base: undefined,
    overridden: false,
    overrideDevices: [],
    responsive: false,
    hidden: false,
    min: undefined,
    max: undefined,
    step: undefined,
    units: undefined,
    options: undefined,
    alpha: false,
    linkable: false,
    fields: undefined,
    minItems: undefined,
    maxItems: undefined,
    tokenOptions: undefined,
    tokenRef: null,
    literalWarning: undefined,
    source: "control",
    styleGroup: undefined,
  });
  visibility.push(flag("tablet"), flag("mobile"));
  visibility.push({
    key: "locked",
    label: "Gesperrt",
    kind: "switcher",
    commit: { kind: "locked" },
    value: node.locked === true,
    base: undefined,
    overridden: false,
    overrideDevices: [],
    responsive: false,
    hidden: false,
    min: undefined,
    max: undefined,
    step: undefined,
    units: undefined,
    options: undefined,
    alpha: false,
    linkable: false,
    fields: undefined,
    minItems: undefined,
    maxItems: undefined,
    tokenOptions: undefined,
    tokenRef: null,
    literalWarning: undefined,
    source: "control",
    styleGroup: undefined,
  });
  const info: InspectorField[] = [
    {
      key: "id",
      label: "Knoten-ID",
      kind: "text",
      commit: { kind: "prop" },
      value: node.id,
      base: undefined,
      overridden: false,
      overrideDevices: [],
      responsive: false,
      hidden: false,
      min: undefined,
      max: undefined,
      step: undefined,
      units: undefined,
      options: undefined,
      alpha: false,
      linkable: false,
      fields: undefined,
      minItems: undefined,
      maxItems: undefined,
      tokenOptions: undefined,
      tokenRef: null,
      literalWarning: undefined,
      source: "control",
      styleGroup: undefined,
    },
  ];
  return [
    { id: "advanced/visibility", label: "Sichtbarkeit", fields: visibility },
    { id: "advanced/info", label: "Info", fields: info },
  ];
}

// The panel for one node. Returns `null` when the node does not exist.
export function buildInspector(input: BuildInspectorInput): InspectorModel | null {
  const node = input.document.nodes[input.nodeId];
  if (node === undefined) return null;
  const definition = getPrimitive(node.primitive);
  const breakpoint = input.breakpoint;
  const controls = definition?.controls ?? [];
  const contentFields = controls.map((control) =>
    controlToField(control, node, breakpoint, input.theme),
  );
  const controlKeys = new Set(controls.map((control) => canonical(control.key)));
  const styleGroups = styleFieldsFor(definition, node, breakpoint, input.theme, controlKeys);
  const profile = input.profile ?? "standard";
  const motion = motionFields(node, input.theme, profile);
  const content: InspectorGroup[] = [
    { id: "content/main", label: definition?.name ?? node.primitive, fields: contentFields },
  ];
  const groupsFor = (id: InspectorTabId): InspectorGroup[] => {
    switch (id) {
      case "content":
        return content;
      case "style":
        return styleGroups;
      case "interactions":
        return [{ id: "interactions/motion", label: "Motion", fields: motion.fields }];
      case "advanced":
        return advancedGroups(node);
    }
  };
  return {
    nodeId: node.id,
    title: definition?.name ?? node.primitive,
    tabs: INSPECTOR_TABS.map((tab) => ({
      id: tab.id,
      label: tab.label,
      groups: groupsFor(tab.id),
    })),
    motion,
  };
}

// A motion spec from the field values (the DOM builds it after a change).
export function motionSpecFrom(
  preset: string,
  values: Record<string, PropValue>,
  current: MotionSpec | undefined,
): MotionSpec {
  const intensity = numberPart(values["intensity"]) ?? current?.intensity ?? 5;
  const delay = numberPart(values["delay"]) ?? current?.delay ?? 0;
  const durationScale = numberPart(values["durationScale"]) ?? current?.tokens?.durationScale ?? 1;
  const stagger = numberPart(values["stagger"]) ?? current?.tokens?.stagger ?? 1;
  const ease = typeof values["ease"] === "string" ? values["ease"] : (current?.tokens?.ease ?? "");
  const trigger = typeof values["trigger"] === "string" ? values["trigger"] : (current?.trigger ?? "viewport");
  const reducedMotion =
    typeof values["reducedMotion"] === "string"
      ? (values["reducedMotion"] as MotionSpec["reducedMotion"])
      : (current?.reducedMotion ?? "static");
  const enabled = values["enabled"] !== false;
  return {
    preset,
    intensity,
    trigger: trigger as MotionSpec["trigger"],
    delay,
    tokens: {
      ...(ease === "" ? {} : { ease }),
      durationScale,
      stagger,
    },
    reducedMotion,
    enabled,
  };
}
