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
  baseKeyOf,
  COMPONENT_INSTANCE_PRIMITIVE,
  DEVICES,
  deviceKey,
  getPrimitive,
  hasDeviceOverride,
  isControlVisible,
  resolveDeviceValue,
  sectionTwinControls,
  STYLE_PROPERTIES,
  stylePropertyFor,
  type Choice,
  type Control,
  type Device,
  type DeviceValueMap,
  type PrimitiveDefinition,
  type PropValue,
  type StateName,
  type StyleGroup,
  type Unit,
} from "@senify/widget-engine";
import {
  MOTION_PROFILE_RULES,
  MOTION_PRESETS,
  type MotionProfile,
  type MotionSpec,
  type TokenGroup,
} from "@senify/section-sdk";
import type { Theme } from "@senify/tokens";
import { tokenOptionsFor, type TokenOption } from "../panels.ts";
import { componentParts, editorOverrides } from "../state/components.ts";
import type { EditorDocument, EditorNode, StyleRule } from "../state/document.ts";
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

// Where a committed value goes: node props (device-aware), the motion spec, the
// structural flags of the node, the pseudo-state bag of the node's scoped rule
// (ticket 02 point 5), or the override bag of a component instance (ticket 04).
export type InspectorCommit =
  | { kind: "prop" }
  | { kind: "motion" }
  | { kind: "hidden"; device: "tablet" | "mobile" }
  | { kind: "locked" }
  | { kind: "state"; state: StateName }
  | { kind: "override"; partId: string };

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
  // Style fields: the theme tokens for this property (colour, spacing, radius,
  // shadow, type) and the literal rule (ticket 02 point 6).
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
  // The pseudo state the Style tab edits: `null` is the base state; a state
  // reads and writes the node's scoped style rule (ticket 02 point 5).
  state: StateName | null;
};

export type BuildInspectorInput = {
  document: EditorDocument;
  nodeId: string;
  breakpoint: Device;
  theme?: Theme;
  profile?: MotionProfile;
  state?: StateName | null;
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
  document: EditorDocument,
  definition: PrimitiveDefinition | undefined,
  node: EditorNode,
  breakpoint: Device,
  theme: Theme | undefined,
  controlKeys: Set<string>,
  state: StateName | null,
): InspectorGroup[] {
  // A real catalog primitive narrows the style groups it offers; an unknown or
  // legacy type keeps the whole table (ADR-0005: the groups are an order, not a
  // gate).
  const groups =
    definition !== undefined && definition.legacy !== true
      ? new Set<StyleGroup>(definition.styleGroups)
      : undefined;
  // The base state reads the node props; a pseudo state reads the state bag of
  // the node's scoped rule (ticket 02 point 5) — same device grammar, same
  // control family.
  const scoped = state === null ? undefined : scopedRuleFor(document, node.id);
  const values: DeviceValueMap =
    state === null ? node.props : (scoped?.states?.[state] ?? {});
  const commit: InspectorCommit = state === null ? { kind: "prop" } : { kind: "state", state };
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
      commit,
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
    attachTokenOptions(
      field,
      theme,
      field.kind === "color" ? "color" : tokenGroupForStyleProp(spec.prop),
    );
    const list = collected.get(spec.group) ?? [];
    list.push(field);
    collected.set(spec.group, list);
  }
  // The open property space (O13/ADR-0005): every value the node carries that
  // neither a catalog control nor the style table owns stays editable — the
  // "Custom CSS" surface of ticket 02 point 3.
  const custom: InspectorField[] = [];
  const known = new Set(STYLE_PROPERTIES.map((spec) => canonical(spec.prop)));
  for (const key of Object.keys(values)) {
    const base = canonical(baseKeyOf(key));
    if (known.has(base) || controlKeys.has(base)) continue;
    custom.push({
      key: base,
      label: base,
      kind: "text",
      commit,
      value: resolveDeviceValue(values, base, breakpoint),
      base: resolveDeviceValue(values, base, "desktop"),
      overridden: breakpoint !== "desktop" && hasDeviceOverride(values, base, breakpoint),
      overrideDevices: DEVICES.filter(
        (device) => device !== "desktop" && hasDeviceOverride(values, base, device),
      ),
      responsive: true,
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
      source: "style",
      styleGroup: undefined,
    });
  }
  const groupsOut = [...collected.entries()].map(([group, fields]) => ({
    id: `style/${group}`,
    label: STYLE_GROUP_LABELS[group],
    fields,
  }));
  if (custom.length > 0) {
    groupsOut.push({ id: "style/custom", label: "Eigene Properties", fields: custom });
  }
  return groupsOut;
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

// Which theme token family belongs to a style property (ticket 02 point 6:
// the token picker next to the free text, `{ $token: … }` stays the DNA).
// Colours resolve through the field kind; these are the non-colour families.
const TOKEN_GROUP_BY_PROP: Record<string, TokenGroup> = {
  padding: "space",
  margin: "space",
  gap: "space",
  inset: "space",
  top: "space",
  right: "space",
  bottom: "space",
  left: "space",
  width: "space",
  height: "space",
  minWidth: "space",
  maxWidth: "space",
  minHeight: "space",
  maxHeight: "space",
  borderRadius: "radius",
  boxShadow: "shadow",
  fontFamily: "type",
  fontSize: "type",
};

export function tokenGroupForStyleProp(prop: string): TokenGroup | undefined {
  return TOKEN_GROUP_BY_PROP[prop];
}

// The scoped style rule of a node — the carrier of the pseudo-state values
// (ticket 02 point 5). A node owns at most one (consistency rule).
export function scopedRuleFor(
  document: EditorDocument,
  nodeId: string,
): StyleRule | undefined {
  return (document.styleRules ?? []).find(
    (rule) => rule.kind === "scoped" && rule.scope?.nodeId === nodeId,
  );
}

function attachTokenOptions(
  field: InspectorField,
  theme: Theme | undefined,
  group: TokenGroup | undefined,
): void {
  if (group === undefined || theme === undefined) return;
  field.tokenOptions = tokenOptionsFor(group, theme);
  field.tokenRef = tokenRefOf(field.value);
  if (
    field.kind === "color" &&
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
  attachTokenOptions(field, theme, field.kind === "color" ? "color" : undefined);
  return field;
}

// The override groups of a component instance (ticket 04): one group per part
// of the definition, its fields committed into the instance's override bag.
// The value shown is the effective one (override wins, definition as fallback);
// clearing a field removes the override, never the definition's value.
function overrideGroups(
  document: EditorDocument,
  node: EditorNode,
  breakpoint: Device,
  theme: Theme | undefined,
): InspectorGroup[] {
  const componentId = node.props["componentId"];
  if (typeof componentId !== "string") return [];
  const overrides = editorOverrides(node);
  const groups: InspectorGroup[] = [];
  const seen = new Map<string, number>();
  for (const part of componentParts(document, componentId)) {
    const definition = getPrimitive(part.primitive);
    const controls = definition?.controls ?? [];
    if (controls.length === 0) continue;
    const partOverrides = overrides[part.id] ?? {};
    const merged: EditorNode = {
      id: part.id,
      primitive: part.primitive,
      props: { ...part.props, ...partOverrides },
    };
    const fields = controls.map((control) => {
      const field = controlToField(control, merged, breakpoint, theme);
      return markOverride(field, part.id, partOverrides, part.props, breakpoint);
    });
    const name = definition?.name ?? part.primitive;
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    groups.push({
      id: `content/override:${part.id}`,
      label: count === 1 ? name : `${name} ${count}`,
      fields,
    });
  }
  return groups;
}

// Marks a field tree as an override: the commit names the part, `base` keeps
// the definition's own value (the reset target) and `overridden` tells whether
// this instance changed it for the active device. The override bag carries
// device levels through the same suffix keys as every other prop
// (`headline_tablet`), so the dots work exactly like on a plain node.
function markOverride(
  field: InspectorField,
  partId: string,
  overrides: DeviceValueMap,
  definitionProps: DeviceValueMap,
  breakpoint: Device,
): InspectorField {
  const overridden = overrides[deviceKey(field.key, breakpoint)] !== undefined;
  const next: InspectorField = {
    ...field,
    commit: { kind: "override", partId },
    base: resolveDeviceValue(definitionProps, field.key, breakpoint),
    overridden,
    overrideDevices: DEVICES.filter(
      (device) =>
        device !== "desktop" && overrides[deviceKey(field.key, device)] !== undefined,
    ),
    fields: field.fields?.map((nested) =>
      markOverride(nested, partId, overrides, definitionProps, breakpoint),
    ),
  };
  return next;
}

function kindForControl(control: Control): InspectorFieldKind {  switch (control.kind) {
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
  // A twin name (divider/embed) is rendered by the running section until the
  // parity gate: its controls must write the section's props, not the
  // primitive's (`sectionTwinControls`, widget-engine).
  const controls = sectionTwinControls(node.primitive) ?? definition?.controls ?? [];
  const contentFields = controls.map((control) =>
    controlToField(control, node, breakpoint, input.theme),
  );
  const controlKeys = new Set(controls.map((control) => canonical(control.key)));
  const state = input.state ?? null;
  const styleGroups = styleFieldsFor(
    input.document,
    definition,
    node,
    breakpoint,
    input.theme,
    controlKeys,
    state,
  );
  const profile = input.profile ?? "standard";
  const motion = motionFields(node, input.theme, profile);
  const content: InspectorGroup[] = [
    { id: "content/main", label: definition?.name ?? node.primitive, fields: contentFields },
    // A component instance has no controls of its own; its Content tab shows
    // the parts of the definition and writes the instance's overrides.
    ...(node.primitive === COMPONENT_INSTANCE_PRIMITIVE
      ? overrideGroups(input.document, node, breakpoint, input.theme)
      : []),
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
    state,
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
