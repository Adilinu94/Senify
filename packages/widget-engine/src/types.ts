// Widget catalog — shared types (Phase 0).
//
// The catalog replaces ready-made sections with primitive foundation stones:
// a small, well-described set of building blocks that an editor composes
// freely. Every value can be overridden per device (see `device.ts`).

export type PrimitiveCategory =
  | "layout"
  | "basic"
  | "media"
  | "form"
  | "advanced";

export type StyleGroup =
  | "spacing"
  | "typography"
  | "color"
  | "border"
  | "size"
  | "effects";

export type Unit =
  | "px"
  | "rem"
  | "em"
  | "%"
  | "vw"
  | "vh"
  | "deg"
  | "s"
  | "ms"
  | "fr";

export type ValueType =
  | "string"
  | "number"
  | "boolean"
  | "color"
  | "enum"
  | "spacing"
  | "gaps"
  | "list"
  | "asset"
  | "link";

// Control kinds follow the Elementor control vocabulary that
// `Repos/elementor-main/includes/controls/` establishes: slider, color,
// switcher, choose/select, dimensions, gaps and repeater, plus the plain
// value controls needed by the primitives.
export type ControlKind =
  | "text"
  | "textarea"
  | "number"
  | "slider"
  | "color"
  | "switcher"
  | "choose"
  | "select"
  | "dimensions"
  | "gaps"
  | "repeater"
  | "url"
  | "media"
  | "icon";

export type PropValue =
  | string
  | number
  | boolean
  | null
  | PropValue[]
  | { [key: string]: PropValue };

export type Choice = {
  value: string;
  label: string;
};

// Visibility condition: a control shows up only when another property of the
// same primitive holds a given value (`equals` or `notEquals`).
export type Condition = {
  prop: string;
  equals?: PropValue;
  notEquals?: PropValue;
};

// Four-fold values (Elementor `dimensions`): top / right / bottom / left.
export type SpacingValue = {
  top: string;
  right: string;
  bottom: string;
  left: string;
  isLinked: boolean;
  unit: Unit;
};

// Two-fold values (Elementor `gaps`): row / column.
export type GapsValue = {
  row: string;
  column: string;
  isLinked: boolean;
  unit: Unit;
};

export type Control = {
  key: string;
  label: string;
  kind: ControlKind;
  valueType: ValueType;
  default: PropValue;
  units?: Unit[];
  min?: number;
  max?: number;
  step?: number;
  options?: Choice[];
  alpha?: boolean;
  palette?: string[];
  linkable?: boolean;
  fields?: Control[];
  minItems?: number;
  maxItems?: number;
  condition?: Condition;
  responsive?: boolean;
};

export type SlotSpec = {
  allowedTypes?: string[];
  max?: number;
};

// Container rule: no children, any primitive, or an explicit whitelist.
export type ChildRule = "none" | "any" | string[];

export type PrimitiveDefinition = {
  type: string;
  name: string;
  category: PrimitiveCategory;
  description: string;
  container: boolean;
  allowedChildren: ChildRule;
  slots: Record<string, SlotSpec>;
  controls: Control[];
  styleGroups: StyleGroup[];
};

export type CategoryDefinition = {
  id: PrimitiveCategory;
  name: string;
  order: number;
};

export type StyleGroupDefinition = {
  id: StyleGroup;
  name: string;
};
