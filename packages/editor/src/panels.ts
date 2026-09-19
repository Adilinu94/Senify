import { resolveTheme, type Theme } from "@senify/tokens";
import {
  MOTION_PROFILE_RULES,
  isPropHidden,
  type MotionProfile,
  type Node,
  type NodeTree,
  type PropControl,
  type PropSpec,
  type PropValue,
  type SectionDefinition,
  type TokenGroup,
} from "@senify/section-sdk";
import { SenifyError } from "@senify/core";
import { isOverrideBreakpoint, type FrameBreakpoint, type OverrideBreakpoint } from "./types.ts";
import { effectiveProps } from "./frames.ts";

// Panels are generated, never hand-built (artifacts/09 „Registry → UI"):
// controls, groups, conditional visibility and token pickers all come from
// the PropSpecs of the section plus the theme.

export type PanelUiKind =
  | PropControl
  | "token";

export type TokenOption = {
  ref: string;
  label: string;
  value: string;
};

export type PanelField = {
  key: string;
  label: string;
  control: PropControl;
  ui: PanelUiKind;
  group: string;
  part: string | undefined;
  value: PropValue | undefined;
  // The base value behind a breakpoint override — the panel shows both.
  inherited: PropValue | undefined;
  target: FrameBreakpoint;
  overridden: boolean;
  // Every breakpoint that carries an override of this key — the device dots
  // next to the control (Elementor's responsive indicators).
  overrideBreakpoints: OverrideBreakpoint[];
  resettable: boolean;
  hidden: boolean;
  tokenGroup: TokenGroup | undefined;
  tokenOptions: TokenOption[] | undefined;
  literalWarning: string | undefined;
  options: { value: string; label: string }[] | undefined;
  min: number | undefined;
  max: number | undefined;
  step: number | undefined;
};

export type PanelGroup = {
  id: string;
  label: string;
  fields: PanelField[];
};

export type MotionPanel = {
  nodeId: string;
  preset: string | null;
  intensity: number;
  trigger: string;
  delay: number;
  tokens: { ease: string; durationScale: number; stagger: number };
  reducedMotion: "static" | "fade" | "off";
  enabled: boolean;
  presets: string[];
  presetsDisabled: boolean;
  // The site profile narrows the section's presets and caps the dial (ticket
  // 20/21). The panel shows the cap; the publish gate enforces it.
  profile: MotionProfile;
  intensityCap: number;
  allowedPresets: readonly string[] | "all";
};

export type BuildPanelsInput = {
  definition: SectionDefinition;
  nodeId: string;
  tree: NodeTree;
  breakpoint: FrameBreakpoint;
  theme?: Theme;
};

// The registry fixes the group taxonomy (packages/registry/src/shared.ts);
// the editor only translates it for the German panel chrome.
const GROUP_LABELS: Record<string, string> = {
  Content: "Content",
  Actions: "Aktionen",
  Styling: "Styling",
  Layout: "Layout",
  Settings: "Einstellungen",
  Form: "Form",
};

function groupLabel(id: string): string {
  const [base = id, part] = id.split("/");
  const translated = GROUP_LABELS[base] ?? base;
  return part ? `${translated} · ${part}` : translated;
}

function groupIdFor(spec: PropSpec, isStyle: boolean): string {
  const base = spec.group ?? (isStyle ? "Styling" : "Content");
  return spec.part ? `${base}/${spec.part}` : base;
}

function tokenRefOf(value: PropValue | undefined): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const ref = (value as Record<string, unknown>).$token;
  return typeof ref === "string" ? ref : null;
}

function groupEntries(
  resolved: Record<string, Record<string, unknown>>,
  group: string,
): TokenOption[] {
  const entries = resolved[group];
  if (!entries) return [];
  return Object.entries(entries)
    .filter(([, value]) => typeof value === "string")
    .map(([name, value]) => ({
      ref: `${group}.${name}`,
      label: name,
      value: value as string,
    }));
}

export function tokenOptionsFor(group: TokenGroup, theme: Theme): TokenOption[] {
  const resolved = resolveTheme(theme);
  const primitive = resolved.primitive as Record<string, Record<string, unknown>>;
  switch (group) {
    case "color": {
      const semantic = Object.entries(theme.tokens.semantic).map(([role]) => ({
        ref: role,
        label: role,
        value: resolved.semantic[role] ?? resolved.modes.light[role] ?? "",
      }));
      return [...semantic, ...groupEntries(primitive, "color")];
    }
    case "space":
      return groupEntries(primitive, "spacing");
    case "radius":
      return groupEntries(primitive, "radius");
    case "shadow":
      return groupEntries(primitive, "shadow");
    case "type": {
      const type = primitive.type ?? {};
      return Object.entries(type)
        .filter(([, role]) => {
          const size = (role as { size?: unknown }).size;
          return typeof size === "string";
        })
        .map(([name, role]) => ({
          ref: `type.${name}`,
          label: name,
          value: (role as { size: string }).size,
        }));
    }
    case "font":
      return [
        { ref: "font.display", label: "display", value: theme.fonts.display.family },
        { ref: "font.body", label: "body", value: theme.fonts.body.family },
        ...(theme.fonts.mono
          ? [{ ref: "font.mono", label: "mono", value: theme.fonts.mono.family }]
          : []),
      ];
    case "ease":
      return Object.entries(resolved.motion.ease).map(([name, value]) => ({
        ref: `ease.${name}`,
        label: name,
        value,
      }));
    case "duration":
      return Object.entries(resolved.motion.duration).map(([name, value]) => ({
        ref: `duration.${name}`,
        label: name,
        value,
      }));
  }
}

function uiFor(spec: PropSpec): PanelUiKind {
  if (spec.control === "color" || spec.control === "scale") return spec.control;
  if (spec.tokenGroup) return "token";
  return spec.control;
}

function fieldFor(
  spec: PropSpec,
  options: {
    isStyle: boolean;
    props: Record<string, PropValue>;
    base: Record<string, PropValue>;
    breakpoint: FrameBreakpoint;
    overriddenKeys: Set<string>;
    overrides: Node["overrides"] | undefined;
    theme: Theme | undefined;
  },
): PanelField {
  const group = groupIdFor(spec, options.isStyle);
  const overridden =
    isOverrideBreakpoint(options.breakpoint) && options.overriddenKeys.has(spec.key);
  const value = options.props[spec.key];
  const tokenRef = tokenRefOf(value);
  const tokenGroup = spec.tokenGroup ?? (spec.control === "color" || spec.control === "scale" ? "color" : undefined);
  const literalWarning =
    tokenGroup !== undefined &&
    typeof value === "string" &&
    tokenRef === null
      ? `Literal "${value}" umgeht die Theme-Tokens`
      : undefined;
  return {
    key: spec.key,
    label: spec.label,
    control: spec.control,
    ui: uiFor(spec),
    group,
    part: spec.part,
    value,
    inherited: overridden ? options.base[spec.key] : undefined,
    target: options.breakpoint,
    overridden,
    overrideBreakpoints: (["tablet", "mobile"] as const).filter((bp) =>
      Object.hasOwn(options.overrides?.[bp]?.props ?? {}, spec.key),
    ),
    resettable: overridden,
    hidden: isPropHidden(spec.hidden, options.props),
    tokenGroup,
    tokenOptions:
      tokenGroup && options.theme ? tokenOptionsFor(tokenGroup, options.theme) : undefined,
    literalWarning,
    options: spec.options?.map((option) => ({
      value: option.value,
      label: option.label,
    })),
    min: spec.min,
    max: spec.max,
    step: spec.step,
  };
}

function nodeOf(tree: NodeTree, nodeId: string): Node {
  const node = tree.nodes[nodeId];
  if (!node) {
    throw new SenifyError("not_found", `Node "${nodeId}" does not exist`, {
      field: "nodeId",
    });
  }
  return node;
}

export function buildPanels(input: BuildPanelsInput): PanelGroup[] {
  const node = nodeOf(input.tree, input.nodeId);
  const base = node.props;
  const props = effectiveProps(input.tree, input.nodeId, input.breakpoint);
  const overriddenKeys = new Set(
    Object.keys(
      isOverrideBreakpoint(input.breakpoint)
        ? (node.overrides?.[input.breakpoint]?.props ?? {})
        : {},
    ),
  );
  const shared = {
    props,
    base,
    breakpoint: input.breakpoint,
    overriddenKeys,
    overrides: node.overrides,
    theme: input.theme,
  };
  const groups = new Map<string, PanelGroup>();
  const push = (field: PanelField): void => {
    let group = groups.get(field.group);
    if (!group) {
      group = { id: field.group, label: groupLabel(field.group), fields: [] };
      groups.set(field.group, group);
    }
    group.fields.push(field);
  };
  for (const spec of input.definition.props) {
    push(fieldFor(spec, { ...shared, isStyle: false }));
  }
  for (const spec of input.definition.styleProps ?? []) {
    push(fieldFor(spec, { ...shared, isStyle: true }));
  }
  return [...groups.values()];
}

export function buildMotionPanel(input: {
  definition: SectionDefinition;
  nodeId: string;
  tree: NodeTree;
  profile?: MotionProfile;
}): MotionPanel {
  const node = nodeOf(input.tree, input.nodeId);
  const presets = input.definition.motionPresets ?? [];
  const profile = input.profile ?? "standard";
  const rules = MOTION_PROFILE_RULES[profile];
  return {
    nodeId: input.nodeId,
    preset: node.motion?.preset ?? null,
    intensity: node.motion?.intensity ?? 5,
    trigger: node.motion?.trigger ?? "viewport",
    delay: node.motion?.delay ?? 0,
    tokens: {
      ease: node.motion?.tokens?.ease ?? "",
      durationScale: node.motion?.tokens?.durationScale ?? 1,
      stagger: node.motion?.tokens?.stagger ?? 1,
    },
    reducedMotion: node.motion?.reducedMotion ?? "static",
    enabled: node.motion?.enabled !== false,
    presets,
    presetsDisabled: presets.length === 0,
    profile,
    intensityCap: rules.intensityCap,
    allowedPresets: rules.presets,
  };
}
