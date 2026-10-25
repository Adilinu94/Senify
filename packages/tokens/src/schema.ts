import { Type, type Static } from "@sinclair/typebox";

export const SemanticRefSchema = Type.Object({
  $ref: Type.String({ minLength: 1 }),
  alpha: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
});
export type SemanticRef = Static<typeof SemanticRefSchema>;

export const SpringSpecSchema = Type.Object({
  type: Type.Literal("spring"),
  stiffness: Type.Number({ exclusiveMinimum: 0 }),
  damping: Type.Number({ exclusiveMinimum: 0 }),
  mass: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
});
export type SpringSpec = Static<typeof SpringSpecSchema>;

export const FontRefSchema = Type.Object({
  family: Type.String({ minLength: 1 }),
  fallback: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  weights: Type.Array(Type.Integer({ minimum: 100, maximum: 900 })),
  files: Type.Optional(Type.Record(Type.String(), Type.String({ minLength: 1 }))),
});
export type FontRef = Static<typeof FontRefSchema>;

export const ScaleInputsSchema = Type.Object({
  brand: Type.String({ minLength: 1 }),
  neutralBase: Type.Optional(Type.String({ minLength: 1 })),
  typeBase: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  typeRatio: Type.Optional(Type.Number({ exclusiveMinimum: 1 })),
  spacingBase: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  radiusBase: Type.Optional(Type.String({ minLength: 1 })),
  shadowTint: Type.Optional(Type.String({ minLength: 1 })),
});
export type ScaleInputs = Static<typeof ScaleInputsSchema>;

export const ThemeSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  name: Type.String({ minLength: 1 }),
  scales: ScaleInputsSchema,
  tokens: Type.Object({
    primitive: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    semantic: Type.Record(Type.String(), SemanticRefSchema),
    modes: Type.Object({
      light: Type.Record(Type.String(), SemanticRefSchema),
      dark: Type.Optional(Type.Record(Type.String(), SemanticRefSchema)),
    }),
  }),
  fonts: Type.Object({
    display: FontRefSchema,
    body: FontRefSchema,
    mono: Type.Optional(FontRefSchema),
    // Further families of an imported page (a Framer site can use seven). The
    // three slots above name the roles; this map carries every other family the
    // page asks for, so `@font-face` exists for it and no text falls back to a
    // system font. Key = the CSS-safe name, emitted as `--font-<key>`.
    extra: Type.Optional(Type.Record(Type.String(), FontRefSchema)),
  }),
  motion: Type.Object({
    ease: Type.Record(
      Type.String(),
      Type.Union([Type.String({ minLength: 1 }), SpringSpecSchema]),
    ),
    duration: Type.Record(Type.String(), Type.String({ minLength: 1 })),
    stagger: Type.Optional(
      Type.Record(Type.String(), Type.String({ minLength: 1 })),
    ),
  }),
});
export type Theme = Static<typeof ThemeSchema>;
