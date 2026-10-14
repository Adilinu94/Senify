import { Type } from "@sinclair/typebox";
import type { SectionDefinition } from "@senify/section-sdk";
import { columnsProp, gapProp, sectionStyleProps, sectionTitleProp, thumbs } from "../shared.ts";

export const statsSection: SectionDefinition = {
  type: "stats",
  version: 1,
  title: "Stats",
  description:
    "Key figures with animated counters. Use sparingly — three to four numbers with proof. The 'counter' variant animates from zero on scroll.",
  category: "content",
  props: [
    sectionTitleProp(),
    {
      key: "items",
      control: "list",
      label: "Stats",
      group: "Content",
      schema: Type.Array(
        Type.Object({
          value: Type.String({ minLength: 1 }),
          label: Type.String({ minLength: 1 }),
          prefix: Type.Optional(Type.String()),
          suffix: Type.Optional(Type.String()),
        }),
      ),
    },
  ],
  variants: {
    row: { label: "Reihe", preset: {} },
    grid: { label: "Raster", preset: {} },
    counter: { label: "Zähler", preset: {} },
  },
  styleProps: [
    ...sectionStyleProps(),
    columnsProp(),
    gapProp(),
  ],
  allowedChildren: "none",
  motionPresets: ["counter", "fade-up"],
  golden: {
    tree: {
      type: "stats",
      variant: "row",
      props: {
        items: [
          { value: "240", suffix: "+", label: "Projekte live" },
          { value: "12", label: "Jahre Erfahrung" },
          { value: "98", suffix: "%", label: "Weiterempfehlung" },
        ],
      },
    },
    thumbnails: thumbs("stats", "row"),
    variantThumbnails: {
      grid: thumbs("stats", "grid"),
      counter: thumbs("stats", "counter"),
    },
  },
};
