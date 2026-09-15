import { Type } from "@sinclair/typebox";
import { AssetRefValueSchema, type SectionDefinition } from "@senify/section-sdk";
import { gapProp, mediaPart, sectionStyleProps, textProp, thumbs } from "../shared.ts";

export const logoCloudSection: SectionDefinition = {
  type: "logo-cloud",
  version: 1,
  title: "Logo Cloud",
  description:
    "Row of customer or partner logos for social proof. Place below the hero. Variant 'marquee' scrolls the logos endlessly; prefer real SVG or image assets over text.",
  category: "media",
  props: [
    textProp("title", "Title"),
    {
      key: "logos",
      control: "list",
      label: "Logos",
      group: "Content",
      schema: Type.Array(
        Type.Object({
          asset: AssetRefValueSchema,
          alt: Type.String({ minLength: 1 }),
        }),
      ),
    },
  ],
  variants: {
    grid: { label: "Grid", preset: {} },
    wrap: { label: "Wrap", preset: {} },
    marquee: { label: "Marquee", preset: {} },
  },
  styleProps: [
    ...sectionStyleProps(),
    gapProp(),
    ...mediaPart(),
  ],
  allowedChildren: "none",
  motionPresets: ["fade-up", "marquee"],
  golden: {
    tree: {
      type: "logo-cloud",
      variant: "grid",
      props: {
        title: "Diese Unternehmen vertrauen uns",
        logos: [
          { asset: { assetId: "logo-hanseatic" }, alt: "Hanseatic" },
          { asset: { assetId: "logo-nordwind" }, alt: "Nordwind" },
          { asset: { assetId: "logo-kaffeekantine" }, alt: "Kaffeekantine" },
          { asset: { assetId: "logo-ateliergrau" }, alt: "Atelier Grau" },
        ],
      },
    },
    thumbnails: thumbs("logo-cloud", "grid"),
    variantThumbnails: {
      wrap: thumbs("logo-cloud", "wrap"),
      marquee: thumbs("logo-cloud", "marquee"),
    },
  },
};
