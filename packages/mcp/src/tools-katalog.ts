// Der Katalog (R12-Schnitt): Abschnitte und Bausteine lesen - Typen, Props,
// Steuerelemente, Stil-Gruppen, Stil-Eigenschaften.
//
// Die vier Werkzeuge standen in `tools.ts` um `get_theme` herum; das Theme hat
// ein eigenes Modul (`tools-theme.ts`), der Katalog bleibt hier. `controlInfo`
// gehoert zu `get_widget` allein - kein anderes Werkzeug liest Steuerelemente
// so. Die Reihenfolge der Spreizungen ist die Reihenfolge im Manifest.

import { SenifyError } from "@senify/core";
import {
  getPrimitive,
  isSectionPrimitiveTwin,
  PRIMITIVES,
  primitiveTypes,
  sectionTwinControls,
  STYLE_PROPERTIES,
  type Control,
  type StyleGroup,
} from "@senify/registry";
import { objectSchema, registry, requireString, sectionInfo } from "./tools-support.ts";
import type { ToolDefinition } from "./tools.ts";

// The control of a widget as the agent reads it: what it is called, which
// family it belongs to, the value type and the bounds that keep a write valid.
function controlInfo(control: Control): Record<string, unknown> {
  return {
    key: control.key,
    label: control.label,
    kind: control.kind,
    valueType: control.valueType,
    default: control.default,
    ...(control.options === undefined
      ? {}
      : { options: control.options.map((option) => option.value) }),
    ...(control.units === undefined ? {} : { units: [...control.units] }),
    ...(control.min === undefined ? {} : { min: control.min }),
    ...(control.max === undefined ? {} : { max: control.max }),
    ...(control.step === undefined ? {} : { step: control.step }),
    ...(control.responsive === false ? { responsive: false } : {}),
    ...(control.fields === undefined
      ? {}
      : { fields: control.fields.map((nested) => controlInfo(nested)) }),
  };
}

/** Die Abschnitts-Definitionen: Liste und Einzelnes. */
export const SECTION_TOOLS: ToolDefinition[] = [
  {
    name: "list_sections",
    title: "List sections",
    description:
      "Lists the section catalog (building blocks) with type, title and description. Use get_section for the full prop schema and a golden example.",
    scope: "read",
    inputSchema: objectSchema({}),
    handler: async () => ({
      sections: registry().list().map((definition) => ({
        type: definition.type,
        title: definition.title,
        description: definition.description,
        category: definition.category,
      })),
    }),
  },
  {
    name: "get_section",
    title: "Get section",
    description:
      "Returns a section definition: props with controls, style props and parts, variants, slots, motion presets and the golden example props. Use it before inserting a section.",
    scope: "read",
    inputSchema: objectSchema({ type: { type: "string" } }, ["type"]),
    entity: (args) => `section:${String(args.type ?? "")}`,
    handler: async (_context, args) => {
      const type = requireString(args, "type");
      const definition = registry().get(type);
      return {
        ...sectionInfo(definition),
        goldenProps: definition.golden.tree.props,
        goldenVariant: definition.golden.tree.variant ?? null,
      };
    },
  },
];

/** Die Baustein-Definitionen: Liste und Einzelnes samt Stil-Eigenschaften. */
export const WIDGET_TOOLS: ToolDefinition[] = [
  {
    name: "list_widgets",
    title: "List widgets",
    description:
      "Lists the widget catalog (the atomic building blocks: frame, heading, image, …) with type, name, category and the style groups each one accepts. Use get_widget for the full control schema.",
    scope: "read",
    inputSchema: objectSchema({}),
    handler: async () => ({
      widgets: PRIMITIVES.map((definition) => ({
        type: definition.type,
        name: definition.name,
        category: definition.category,
        description: definition.description,
        styleGroups: [...definition.styleGroups],
        // A twin name (divider/embed) is rendered by the running section until
        // the parity gate; its controls in get_widget are the section's.
        ...(isSectionPrimitiveTwin(definition.type) ? { sectionTwin: true } : {}),
      })),
    }),
  },
  {
    name: "get_widget",
    title: "Get widget",
    description:
      "Returns one widget's schema: controls (key, kind, value type, options, units, bounds), style groups, container rules, slots and — for the style groups it accepts — the style properties with their units. Use it before set_styles or create_style_rule.",
    scope: "read",
    inputSchema: objectSchema({ type: { type: "string" } }, ["type"]),
    entity: (args) => `widget:${String(args.type ?? "")}`,
    handler: async (_context, args) => {
      const type = requireString(args, "type");
      const definition = getPrimitive(type);
      if (definition === undefined) {
        throw new SenifyError("not_found", `Unknown widget "${type}"`, {
          field: "type",
          suggestion: `Check the type with list_widgets (${primitiveTypes().join(", ")}).`,
        });
      }
      const groups = new Set<StyleGroup>(definition.styleGroups);
      // A twin name writes the running section's props until the cutover.
      const controls = sectionTwinControls(type) ?? definition.controls;
      return {
        type: definition.type,
        name: definition.name,
        category: definition.category,
        description: definition.description,
        container: definition.container,
        allowedChildren: definition.allowedChildren,
        slots: definition.slots,
        styleGroups: [...definition.styleGroups],
        controls: controls.map(controlInfo),
        ...(isSectionPrimitiveTwin(type) ? { sectionTwin: true } : {}),
        styleProperties: STYLE_PROPERTIES.filter((spec) => groups.has(spec.group)).map(
          (spec) => ({
            property: spec.prop,
            group: spec.group,
            kind: spec.kind,
            units: spec.units === undefined ? null : [...spec.units],
          }),
        ),
      };
    },
  },
];
