import { Type, type Static, type TSchema } from "@sinclair/typebox";
import type { PropValue } from "./types.ts";

export const PropControlSchema = Type.Union([
  Type.Literal("text"),
  Type.Literal("richtext"),
  Type.Literal("number"),
  Type.Literal("boolean"),
  Type.Literal("enum"),
  Type.Literal("color"),
  Type.Literal("scale"),
  Type.Literal("asset"),
  Type.Literal("link"),
  Type.Literal("list"),
  Type.Literal("slot"),
  // A free-form JSON bag (the override map of a component instance): the
  // section model does not describe its inner shape, so nothing is validated.
  Type.Literal("json"),
]);
export type PropControl = Static<typeof PropControlSchema>;

export const PropOptionSchema = Type.Object({
  value: Type.String(),
  label: Type.String(),
});
export type PropOption = Static<typeof PropOptionSchema>;

export const HiddenConditionSchema = Type.Object({
  prop: Type.String({ minLength: 1 }),
  equals: Type.Optional(Type.Unsafe<PropValue>(Type.Any())),
  notEquals: Type.Optional(Type.Unsafe<PropValue>(Type.Any())),
});
export type HiddenCondition = Static<typeof HiddenConditionSchema>;

export function isPropHidden(
  hidden: boolean | HiddenCondition | undefined,
  props: Record<string, PropValue>,
): boolean {
  if (hidden === undefined) return false;
  if (typeof hidden === "boolean") return hidden;
  if (hidden.equals !== undefined) return props[hidden.prop] === hidden.equals;
  if (hidden.notEquals !== undefined) {
    return props[hidden.prop] !== hidden.notEquals;
  }
  return false;
}

export const TokenGroupSchema = Type.Union([
  Type.Literal("color"),
  Type.Literal("space"),
  Type.Literal("radius"),
  Type.Literal("shadow"),
  Type.Literal("type"),
  Type.Literal("font"),
  Type.Literal("ease"),
  Type.Literal("duration"),
]);
export type TokenGroup = Static<typeof TokenGroupSchema>;

export const PropSpecSchema = Type.Object({
  key: Type.String({ minLength: 1 }),
  schema: Type.Optional(Type.Unsafe<TSchema>(Type.Any())),
  control: PropControlSchema,
  label: Type.String({ minLength: 1 }),
  group: Type.Optional(Type.String()),
  tokenGroup: Type.Optional(TokenGroupSchema),
  part: Type.Optional(Type.String({ minLength: 1 })),
  min: Type.Optional(Type.Number()),
  max: Type.Optional(Type.Number()),
  step: Type.Optional(Type.Number()),
  options: Type.Optional(Type.Array(PropOptionSchema)),
  hidden: Type.Optional(
    Type.Union([Type.Boolean(), HiddenConditionSchema]),
  ),
});
export type PropSpec = Static<typeof PropSpecSchema>;

export const TokenRefSchema = Type.Object({
  $token: Type.String({ minLength: 1 }),
});
export type TokenRef = Static<typeof TokenRefSchema>;

// Style values (color, spacing, radius, shadow, type sizes …) accept a theme
// token reference or a free CSS value by design (artifacts/29).
export const TokenOrLiteralSchema = Type.Union([
  TokenRefSchema,
  Type.String({ minLength: 1 }),
]);
export type TokenOrLiteral = Static<typeof TokenOrLiteralSchema>;

export const ColorValueSchema = TokenOrLiteralSchema;
export type ColorValue = Static<typeof ColorValueSchema>;

export const LinkValueSchema = Type.Union([
  Type.Object({ pageId: Type.String({ minLength: 1 }) }),
  Type.Object({
    url: Type.String({ minLength: 1 }),
    newTab: Type.Optional(Type.Boolean()),
  }),
]);
export type LinkValue = Static<typeof LinkValueSchema>;

export const AssetRefValueSchema = Type.Object({
  assetId: Type.String({ minLength: 1 }),
  focal: Type.Optional(
    Type.Object({ x: Type.Number(), y: Type.Number() }),
  ),
});
export type AssetRefValue = Static<typeof AssetRefValueSchema>;

export const RichTextValueSchema = Type.String();

export const MotionTriggerSchema = Type.Union([
  Type.Literal("load"),
  Type.Literal("scroll"),
  Type.Literal("viewport"),
  Type.Literal("hover"),
]);
export type MotionTrigger = Static<typeof MotionTriggerSchema>;

export const MotionTokensSchema = Type.Object({
  ease: Type.Optional(Type.String()),
  durationScale: Type.Optional(Type.Number()),
  stagger: Type.Optional(Type.Number()),
});
export type MotionTokens = Static<typeof MotionTokensSchema>;

// Motion spec v2 (ticket 19): the reduced-motion policy travels with the spec
// (`static` is the WCAG default), `enabled` is the editor switch that keeps a
// spec without playing it. Both fields are additive to the v1 shape.
export const MotionReducedPolicySchema = Type.Union([
  Type.Literal("static"),
  Type.Literal("fade"),
  Type.Literal("off"),
]);
export type MotionReducedPolicy = Static<typeof MotionReducedPolicySchema>;

export const MotionSpecSchema = Type.Object({
  preset: Type.String({ minLength: 1 }),
  intensity: Type.Optional(Type.Number({ minimum: 1, maximum: 10 })),
  tokens: Type.Optional(MotionTokensSchema),
  trigger: Type.Optional(MotionTriggerSchema),
  delay: Type.Optional(Type.Number({ minimum: 0 })),
  reducedMotion: Type.Optional(MotionReducedPolicySchema),
  enabled: Type.Optional(Type.Boolean()),
});
export type MotionSpec = Static<typeof MotionSpecSchema>;

export const NodeOverrideSchema = Type.Object({
  props: Type.Optional(
    Type.Record(Type.String(), Type.Unsafe<PropValue>(Type.Any())),
  ),
  hidden: Type.Optional(Type.Boolean()),
});
export type NodeOverrideValue = Static<typeof NodeOverrideSchema>;

const CONTROL_FALLBACKS: Record<PropControl, TSchema | undefined> = {
  text: Type.String(),
  richtext: RichTextValueSchema,
  number: Type.Number(),
  boolean: Type.Boolean(),
  enum: Type.String(),
  color: ColorValueSchema,
  scale: TokenOrLiteralSchema,
  asset: AssetRefValueSchema,
  link: LinkValueSchema,
  list: Type.Array(Type.Any()),
  slot: undefined,
  json: undefined,
};

export function resolvePropSchema(spec: PropSpec): TSchema | undefined {
  if (spec.schema) return spec.schema;
  if (spec.control === "enum" && spec.options && spec.options.length > 0) {
    return Type.Union(
      spec.options.map((option) => Type.Literal(option.value)),
    );
  }
  return CONTROL_FALLBACKS[spec.control];
}

export const SectionCategorySchema = Type.Union([
  Type.Literal("structure"),
  Type.Literal("content"),
  Type.Literal("commerce"),
  Type.Literal("media"),
  Type.Literal("utility"),
]);
export type SectionCategory = Static<typeof SectionCategorySchema>;

export const SectionVariantSchema = Type.Object({
  label: Type.String(),
  preset: Type.Record(Type.String(), Type.Unknown()),
});
export type SectionVariant = Static<typeof SectionVariantSchema>;

export const SlotSpecSchema = Type.Object({
  allowedTypes: Type.Optional(Type.Array(Type.String())),
  max: Type.Optional(Type.Number({ minimum: 0 })),
});
export type SlotSpec = Static<typeof SlotSpecSchema>;

export const GoldenNodeSchema = Type.Recursive((Self) =>
  Type.Object({
    type: Type.String({ minLength: 1 }),
    variant: Type.Optional(Type.String()),
    props: Type.Record(Type.String(), Type.Unsafe<PropValue>(Type.Any())),
    children: Type.Optional(Type.Array(Self)),
  }),
);

export const GoldenSchema = Type.Object({
  tree: GoldenNodeSchema,
  thumbnails: Type.Object({
    desktop: Type.Optional(Type.String()),
    tablet: Type.Optional(Type.String()),
    mobile: Type.Optional(Type.String()),
  }),
  variantThumbnails: Type.Optional(
    Type.Record(
      Type.String(),
      Type.Object({
        desktop: Type.Optional(Type.String()),
        tablet: Type.Optional(Type.String()),
        mobile: Type.Optional(Type.String()),
      }),
    ),
  ),
});
export type Golden = Static<typeof GoldenSchema>;

export const SectionDefinitionSchema = Type.Object({
  type: Type.String({ minLength: 1 }),
  version: Type.Integer({ minimum: 1 }),
  title: Type.String({ minLength: 1 }),
  description: Type.String(),
  category: SectionCategorySchema,
  props: Type.Array(PropSpecSchema),
  variants: Type.Optional(Type.Record(Type.String(), SectionVariantSchema)),
  styleProps: Type.Optional(Type.Array(PropSpecSchema)),
  slots: Type.Optional(Type.Record(Type.String(), SlotSpecSchema)),
  allowedChildren: Type.Optional(
    // `"any"` is the open container: it accepts every registered type (and,
    // for structural nodes, every slot name) without a fixed list. The widget
    // catalog has carried the same rule since Phase 0 (`ChildRule`).
    Type.Union([Type.Literal("none"), Type.Literal("any"), Type.Array(Type.String())]),
  ),
  motionPresets: Type.Optional(Type.Array(Type.String())),
  golden: GoldenSchema,
  deprecated: Type.Optional(Type.Boolean()),
});
export type SectionDefinition = Static<typeof SectionDefinitionSchema>;
