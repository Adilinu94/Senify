// Property translation: catalog properties and style groups -> CSS
// declarations (Phase 0, second slice).
//
// Two tables drive the translation and are the single source of the mapping:
//
// 1. `PROP_MAPPINGS` maps the properties a primitive *control* owns to CSS
//    (`frame.display` -> `display`, `grid.columns` -> `grid-template-columns`).
// 2. `STYLE_PROPERTIES` maps the naming convention of the style engine to CSS
//    and tags each entry with its style group. A primitive only receives the
//    properties of the groups it declares in `catalog.ts` (`heading` has no
//    `border` group, so `borderWidth` never reaches `heading`).
//
// Emission order is the table order, never the key order of the input bag, so
// the output is stable for any input that carries the same values.

import { getPrimitive } from "../catalog.ts";
import { isConditionSatisfied } from "../controls.ts";
import type { DeviceValueMap } from "../device.ts";
import type { PrimitiveDefinition, PropValue, StyleGroup, Unit } from "../types.ts";
import {
  camelToKebab,
  deepEqualProp,
  formatColor,
  formatGaps,
  formatKeyword,
  formatLength,
  formatNumber,
  formatSpacing,
  formatText,
  formatUnitless,
  isRecord,
  type TokenResolver,
} from "./format.ts";

export type Declaration = {
  property: string;
  value: string;
};

export type ValueKind =
  | "length"
  | "unitless"
  | "color"
  | "keyword"
  | "spacing"
  | "gaps"
  | "text"
  | "radius"
  | "columns"
  | "switch";

export type StylePropertySpec = {
  prop: string;
  group: StyleGroup;
  kind: ValueKind;
  css?: string;
  units?: readonly Unit[];
};

// Properties a style group owns but the catalog does not model as controls
// yet — the vocabulary the style engine (ticket 02) writes.
export const STYLE_PROPERTIES: readonly StylePropertySpec[] = [
  { prop: "padding", group: "spacing", kind: "spacing" },
  { prop: "margin", group: "spacing", kind: "spacing" },
  { prop: "gap", group: "spacing", kind: "gaps" },

  { prop: "width", group: "size", kind: "length", units: ["px", "rem", "em", "%", "vw"] },
  { prop: "height", group: "size", kind: "length", units: ["px", "rem", "em", "%", "vh"] },
  { prop: "minWidth", group: "size", kind: "length", units: ["px", "rem", "em", "%", "vw"] },
  { prop: "maxWidth", group: "size", kind: "length", units: ["px", "rem", "em", "%", "vw"] },
  { prop: "minHeight", group: "size", kind: "length", units: ["px", "rem", "em", "vh"] },
  { prop: "maxHeight", group: "size", kind: "length", units: ["px", "rem", "em", "vh"] },
  { prop: "aspectRatio", group: "size", kind: "keyword" },

  { prop: "fontFamily", group: "typography", kind: "text" },
  { prop: "fontSize", group: "typography", kind: "length", units: ["px", "rem", "em", "%", "vw"] },
  { prop: "fontWeight", group: "typography", kind: "unitless" },
  { prop: "lineHeight", group: "typography", kind: "unitless" },
  { prop: "letterSpacing", group: "typography", kind: "length", units: ["px", "em", "rem"] },
  { prop: "textAlign", group: "typography", kind: "keyword" },
  { prop: "textDecoration", group: "typography", kind: "keyword" },
  { prop: "textTransform", group: "typography", kind: "keyword" },
  { prop: "fontStyle", group: "typography", kind: "keyword" },
  { prop: "color", group: "typography", kind: "color" },

  { prop: "background", group: "color", kind: "color", css: "background-color" },
  { prop: "backgroundImage", group: "color", kind: "text" },

  { prop: "borderWidth", group: "border", kind: "length", units: ["px", "rem"] },
  { prop: "borderStyle", group: "border", kind: "keyword" },
  { prop: "borderColor", group: "border", kind: "color" },
  { prop: "borderRadius", group: "border", kind: "radius", units: ["px", "rem", "%"] },

  { prop: "boxShadow", group: "effects", kind: "text" },
  { prop: "opacity", group: "effects", kind: "unitless" },
  { prop: "filter", group: "effects", kind: "text" },
  { prop: "backdropFilter", group: "effects", kind: "text" },
  { prop: "mixBlendMode", group: "effects", kind: "keyword" },
  { prop: "transition", group: "effects", kind: "text" },
  { prop: "transform", group: "effects", kind: "text" },
];

export type PropMapping = {
  prop: string;
  kind: ValueKind;
  css?: string | readonly string[];
  onlyPrimitives?: readonly string[];
  values?: Readonly<Record<string, string>>;
  units?: readonly Unit[];
  // For `switch`: the declaration a `true` value produces.
  literal?: string;
};

// Properties owned by one primitive control. These win over a style property
// of the same name (`root.background` keeps `background-color`).
export const PROP_MAPPINGS: readonly PropMapping[] = [
  { prop: "display", kind: "keyword", onlyPrimitives: ["frame"] },

  { prop: "order", kind: "unitless", onlyPrimitives: ["column"] },

  { prop: "columns", kind: "columns", css: "grid-template-columns", onlyPrimitives: ["grid"] },

  {
    prop: "contentWidth",
    kind: "keyword",
    css: "max-width",
    onlyPrimitives: ["section"],
    values: { narrow: "640px", regular: "1120px", wide: "1320px", full: "100%" },
  },
  {
    prop: "align",
    kind: "keyword",
    css: "margin-inline",
    onlyPrimitives: ["section"],
    values: { left: "0", center: "auto" },
  },

  { prop: "marker", kind: "keyword", css: "list-style-type", onlyPrimitives: ["list"] },
  {
    prop: "ordered",
    kind: "switch",
    css: "list-style-type",
    literal: "decimal",
    onlyPrimitives: ["list"],
  },

  {
    prop: "aspect",
    kind: "keyword",
    css: "aspect-ratio",
    onlyPrimitives: ["image", "embed"],
    values: { "16/9": "16 / 9", "4/3": "4 / 3", "1/1": "1 / 1", "3/4": "3 / 4" },
  },
  {
    prop: "fit",
    kind: "keyword",
    css: "object-fit",
    onlyPrimitives: ["image"],
    values: { cover: "cover", contain: "contain" },
  },

  {
    prop: "size",
    kind: "length",
    css: ["width", "height"],
    units: ["px", "rem"],
    onlyPrimitives: ["icon"],
  },
  {
    prop: "strokeWidth",
    kind: "length",
    css: "stroke-width",
    units: ["px"],
    onlyPrimitives: ["icon"],
  },

  {
    prop: "style",
    kind: "keyword",
    css: "border-top-style",
    onlyPrimitives: ["divider"],
    values: { line: "solid", dashed: "dashed", dotted: "dotted", space: "none" },
  },
  {
    prop: "thickness",
    kind: "length",
    css: "border-top-width",
    units: ["px"],
    onlyPrimitives: ["divider"],
  },
  {
    prop: "spacing",
    kind: "length",
    css: "margin-block",
    units: ["px", "rem"],
    onlyPrimitives: ["divider"],
  },

  { prop: "background", kind: "color", css: "background-color", onlyPrimitives: ["root"] },

  {
    prop: "stripeColor",
    kind: "color",
    css: "--table-stripe-color",
    onlyPrimitives: ["table"],
  },
  {
    prop: "dropCapLines",
    kind: "unitless",
    css: "--drop-cap-lines",
    onlyPrimitives: ["body"],
  },
];

type ResolvedSpec = {
  kind: ValueKind;
  css: string | readonly string[];
  values?: Readonly<Record<string, string>>;
  units?: readonly Unit[];
  literal?: string;
};

export function stylePropertyFor(prop: string): StylePropertySpec | undefined {
  return STYLE_PROPERTIES.find((entry) => entry.prop === prop);
}

// The style groups a definition narrows to. A legacy stand-in (widget-engine
// `legacy.ts`, an existing section type) carries no catalog shape, so it must
// not restrict anything: it behaves like a type the catalog does not know, which
// is what the compiler did before the sections were bridged. Only a real
// definition narrows the set of translatable properties.
function styleGroupsOf(definition: PrimitiveDefinition | undefined): Set<StyleGroup> | undefined {
  return definition !== undefined && definition.legacy !== true
    ? new Set<StyleGroup>(definition.styleGroups)
    : undefined;
}

export function mappingFor(prop: string, primitiveType: string | undefined): PropMapping | undefined {
  return PROP_MAPPINGS.find(
    (entry) =>
      entry.prop === prop &&
      (entry.onlyPrimitives === undefined ||
        (primitiveType !== undefined && entry.onlyPrimitives.includes(primitiveType))),
  );
}

// The property names the compiler can translate, in emission order.
export function translatableProperties(primitiveType: string | undefined): string[] {
  const definition = primitiveType === undefined ? undefined : getPrimitive(primitiveType);
  const groups = styleGroupsOf(definition);
  const props: string[] = [];
  for (const mapping of PROP_MAPPINGS) {
    if (
      mapping.onlyPrimitives !== undefined &&
      (primitiveType === undefined || !mapping.onlyPrimitives.includes(primitiveType))
    ) {
      continue;
    }
    props.push(mapping.prop);
  }
  for (const spec of STYLE_PROPERTIES) {
    if (groups !== undefined && !groups.has(spec.group)) continue;
    if (!props.includes(spec.prop)) props.push(spec.prop);
  }
  return props;
}

function translate(
  spec: ResolvedSpec,
  value: PropValue,
  options: TranslateOptions,
): Declaration[] {
  const names = typeof spec.css === "string" ? [spec.css] : [...spec.css];
  const resolveToken = options.resolveToken;

  switch (spec.kind) {
    case "length": {
      const formatted = formatLength(value, spec.units?.[0], resolveToken);
      return formatted === undefined ? [] : names.map((name) => ({ property: name, value: formatted }));
    }
    case "unitless": {
      const formatted = formatUnitless(value);
      return formatted === undefined ? [] : names.map((name) => ({ property: name, value: formatted }));
    }
    case "color": {
      const formatted = formatColor(value, resolveToken);
      return formatted === undefined ? [] : names.map((name) => ({ property: name, value: formatted }));
    }
    case "keyword": {
      const formatted = formatKeyword(value, spec.values);
      return formatted === undefined ? [] : names.map((name) => ({ property: name, value: formatted }));
    }
    case "spacing": {
      const formatted = formatSpacing(value, resolveToken);
      return formatted === undefined ? [] : names.map((name) => ({ property: name, value: formatted }));
    }
    case "gaps": {
      const formatted = formatGaps(value, resolveToken);
      return formatted === undefined ? [] : names.map((name) => ({ property: name, value: formatted }));
    }
    case "text": {
      const formatted = formatText(value);
      return formatted === undefined ? [] : names.map((name) => ({ property: name, value: formatted }));
    }
    case "radius": {
      const formatted = isRecord(value)
        ? formatSpacing(value, resolveToken)
        : formatLength(value, spec.units?.[0], resolveToken);
      return formatted === undefined ? [] : names.map((name) => ({ property: name, value: formatted }));
    }
    case "columns": {
      const count = typeof value === "number" ? value : Number(String(value));
      if (!Number.isInteger(count) || count < 1) return [];
      return [
        { property: "grid-template-columns", value: `repeat(${formatNumber(count)}, minmax(0, 1fr))` },
      ];
    }
    case "switch": {
      const literal = spec.literal;
      if (value !== true || literal === undefined) return [];
      return names.map((name) => ({ property: name, value: literal }));
    }
  }
}

export type TranslateOptions = {
  // Emit catalog default values as well. Off by default: only visible values.
  includeDefaults?: boolean;
  // The next stronger context (inherited device value). Values equal to the
  // baseline are not repeated.
  baseline?: DeviceValueMap;
  // Resolves a theme token reference (`{ $token: "color.brand" }`) to its
  // concrete CSS value. Without it the compiler keeps `var(--…)`.
  resolveToken?: TokenResolver;
};

export function declarationsForValues(
  primitiveType: string | undefined,
  values: DeviceValueMap,
  options: TranslateOptions = {},
): Declaration[] {
  const definition = primitiveType === undefined ? undefined : getPrimitive(primitiveType);
  const controls = definition?.controls ?? [];
  const groups = styleGroupsOf(definition);
  const declarations: Declaration[] = [];
  const emittedProps = new Set<string>();
  // One CSS property per rule: the first table entry that reaches it wins, so
  // `icon.size` keeps `width` and the generic `width` style property stays out.
  const emittedCss = new Set<string>();

  const emit = (prop: string, spec: ResolvedSpec): void => {
    if (emittedProps.has(prop)) return;
    const value = values[prop];
    if (value === undefined || value === null) return;

    const control = controls.find((entry) => entry.key === prop);
    if (control?.condition && !isConditionSatisfied(control.condition, values)) return;
    if (
      options.baseline !== undefined &&
      Object.prototype.hasOwnProperty.call(options.baseline, prop) &&
      deepEqualProp(value, options.baseline[prop])
    ) {
      return;
    }
    if (options.includeDefaults !== true && control && deepEqualProp(value, control.default)) return;

    // A bare number takes the unit of the control that owns it (`column.width`
    // is percent, `icon.size` is px); a string brings its own unit.
    const units =
      control?.units !== undefined && control.units.length > 0 ? control.units : spec.units;
    const translated = translate({ ...spec, units }, value, options).filter(
      (declaration) => !emittedCss.has(declaration.property),
    );
    if (translated.length === 0) return;

    emittedProps.add(prop);
    for (const declaration of translated) emittedCss.add(declaration.property);
    declarations.push(...translated);
  };

  for (const mapping of PROP_MAPPINGS) {
    if (
      mapping.onlyPrimitives !== undefined &&
      (primitiveType === undefined || !mapping.onlyPrimitives.includes(primitiveType))
    ) {
      continue;
    }
    emit(mapping.prop, {
      kind: mapping.kind,
      css: mapping.css ?? camelToKebab(mapping.prop),
      values: mapping.values,
      units: mapping.units,
      literal: mapping.literal,
    });
  }

  for (const spec of STYLE_PROPERTIES) {
    if (groups !== undefined && !groups.has(spec.group)) continue;
    emit(spec.prop, {
      kind: spec.kind,
      css: spec.css ?? camelToKebab(spec.prop),
      units: spec.units,
    });
  }

  return declarations;
}
