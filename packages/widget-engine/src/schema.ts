// Catalog schemas on TypeBox (Phase 0, point 5).
//
// The rest of the project expresses its contracts as TypeBox schemas and checks
// them with `TypeCompiler` / `Value` (`@senify/section-sdk`, `@senify/tokens`,
// the mutation contract). The catalog used to hand-roll its validation; this
// module gives it the same shape, the same check and the same issue form
// (`path` + `message`, optional `suggestion`) as `section-sdk`'s
// `validateDefinition`, so schemas, validation and error messages behave the
// same across the project.
//
// The schema is the structural truth; the semantic rules that TypeBox cannot
// express (a slider's range, an option default, a repeater's fields) live in
// `controls.ts` and return the same `ValidationIssue`.

import { Type, type TSchema } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";

export type ValidationIssue = {
  path: string;
  message: string;
  suggestion?: string;
};

// The vocabulary of the catalog, in one place. The TypeScript unions in
// `types.ts` are the compile-time mirror; these arrays drive the runtime schema.
export const PRIMITIVE_CATEGORIES = [
  "layout",
  "basic",
  "media",
  "form",
  "advanced",
] as const;

export const STYLE_GROUP_IDS = [
  "layout",
  "spacing",
  "typography",
  "color",
  "border",
  "size",
  "effects",
] as const;

export const UNITS = [
  "px",
  "rem",
  "em",
  "%",
  "vw",
  "vh",
  "deg",
  "s",
  "ms",
  "fr",
] as const;

export const VALUE_TYPES = [
  "string",
  "number",
  "boolean",
  "color",
  "enum",
  "spacing",
  "gaps",
  "list",
  "asset",
  "link",
] as const;

export const CONTROL_KINDS = [
  "text",
  "textarea",
  "number",
  "slider",
  "color",
  "switcher",
  "choose",
  "select",
  "dimensions",
  "gaps",
  "repeater",
  "url",
  "media",
  "icon",
] as const;

function literalUnion(values: readonly string[]): TSchema {
  return Type.Union(values.map((value) => Type.Literal(value)));
}

export const PrimitiveCategorySchema = literalUnion(PRIMITIVE_CATEGORIES);
export const StyleGroupSchema = literalUnion(STYLE_GROUP_IDS);
export const UnitSchema = literalUnion(UNITS);
export const ValueTypeSchema = literalUnion(VALUE_TYPES);
export const ControlKindSchema = literalUnion(CONTROL_KINDS);

export const ChoiceSchema = Type.Object({
  value: Type.String(),
  label: Type.String(),
});

export const ConditionSchema = Type.Object({
  prop: Type.String({ minLength: 1 }),
  equals: Type.Optional(Type.Unsafe<unknown>(Type.Any())),
  notEquals: Type.Optional(Type.Unsafe<unknown>(Type.Any())),
});

// Values stay open by design: the catalog stores strings, numbers, booleans,
// four-fold and pair objects and lists.
const PropValueSchema = Type.Unsafe<unknown>(Type.Any());

export const ControlSchema: TSchema = Type.Recursive((Self) =>
  Type.Object({
    key: Type.String({ minLength: 1 }),
    label: Type.String({ minLength: 1 }),
    kind: ControlKindSchema,
    valueType: ValueTypeSchema,
    default: PropValueSchema,
    units: Type.Optional(Type.Array(UnitSchema)),
    min: Type.Optional(Type.Number()),
    max: Type.Optional(Type.Number()),
    step: Type.Optional(Type.Number()),
    options: Type.Optional(Type.Array(ChoiceSchema)),
    alpha: Type.Optional(Type.Boolean()),
    palette: Type.Optional(Type.Array(Type.String())),
    linkable: Type.Optional(Type.Boolean()),
    fields: Type.Optional(Type.Array(Self)),
    minItems: Type.Optional(Type.Number()),
    maxItems: Type.Optional(Type.Number()),
    condition: Type.Optional(ConditionSchema),
    responsive: Type.Optional(Type.Boolean()),
  }),
);

export const SlotSpecSchema = Type.Object({
  allowedTypes: Type.Optional(Type.Array(Type.String())),
  max: Type.Optional(Type.Number()),
});

export const ChildRuleSchema = Type.Union([
  Type.Literal("none"),
  Type.Literal("any"),
  Type.Array(Type.String()),
]);

export const PrimitiveDefinitionSchema: TSchema = Type.Object({
  type: Type.String({ minLength: 1 }),
  name: Type.String({ minLength: 1 }),
  category: PrimitiveCategorySchema,
  description: Type.String(),
  container: Type.Boolean(),
  allowedChildren: ChildRuleSchema,
  slots: Type.Record(Type.String(), SlotSpecSchema),
  controls: Type.Array(ControlSchema),
  styleGroups: Type.Array(StyleGroupSchema),
});

export const CategoryDefinitionSchema = Type.Object({
  id: PrimitiveCategorySchema,
  name: Type.String({ minLength: 1 }),
  order: Type.Number(),
});

export const StyleGroupDefinitionSchema = Type.Object({
  id: StyleGroupSchema,
  name: Type.String({ minLength: 1 }),
});

const controlCompiler = TypeCompiler.Compile(ControlSchema);
const primitiveCompiler = TypeCompiler.Compile(PrimitiveDefinitionSchema);
const categoryCompiler = TypeCompiler.Compile(CategoryDefinitionSchema);
const styleGroupCompiler = TypeCompiler.Compile(StyleGroupDefinitionSchema);

function issuesFrom(
  compiler: { Errors: (value: unknown) => Iterable<{ path: string; message: string }> },
  value: unknown,
  path: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const error of compiler.Errors(value)) {
    issues.push({ path: `${path}${error.path}`, message: error.message });
  }
  return issues;
}

export function controlShapeIssues(control: unknown, path: string): ValidationIssue[] {
  return controlCompiler.Check(control) ? [] : issuesFrom(controlCompiler, control, path);
}

export function primitiveShapeIssues(primitive: unknown, path: string): ValidationIssue[] {
  return primitiveCompiler.Check(primitive)
    ? []
    : issuesFrom(primitiveCompiler, primitive, path);
}

export function categoryShapeIssues(category: unknown, path: string): ValidationIssue[] {
  return categoryCompiler.Check(category) ? [] : issuesFrom(categoryCompiler, category, path);
}

export function styleGroupShapeIssues(entry: unknown, path: string): ValidationIssue[] {
  return styleGroupCompiler.Check(entry) ? [] : issuesFrom(styleGroupCompiler, entry, path);
}
