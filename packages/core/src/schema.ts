import { Type, type Static, type TSchema } from "@sinclair/typebox";
import type { PropValue } from "./types.ts";

export const PropControlSchema = Type.Union([
  Type.Literal("text"),
  Type.Literal("richtext"),
  Type.Literal("number"),
  Type.Literal("boolean"),
  Type.Literal("enum"),
  Type.Literal("color"),
  Type.Literal("asset"),
  Type.Literal("link"),
  Type.Literal("list"),
  Type.Literal("slot"),
]);
export type PropControl = Static<typeof PropControlSchema>;

export const PropOptionSchema = Type.Object({
  value: Type.String(),
  label: Type.String(),
});
export type PropOption = Static<typeof PropOptionSchema>;

export const PropSpecSchema = Type.Object({
  key: Type.String({ minLength: 1 }),
  schema: Type.Optional(Type.Unsafe<TSchema>(Type.Any())),
  control: PropControlSchema,
  label: Type.String({ minLength: 1 }),
  group: Type.Optional(Type.String()),
  min: Type.Optional(Type.Number()),
  max: Type.Optional(Type.Number()),
  step: Type.Optional(Type.Number()),
  options: Type.Optional(Type.Array(PropOptionSchema)),
  hidden: Type.Optional(Type.Boolean()),
});
export type PropSpec = Static<typeof PropSpecSchema>;

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
    Type.Union([Type.Literal("none"), Type.Array(Type.String())]),
  ),
  motionPresets: Type.Optional(Type.Array(Type.String())),
  golden: GoldenSchema,
  deprecated: Type.Optional(Type.Boolean()),
});
export type SectionDefinition = Static<typeof SectionDefinitionSchema>;
