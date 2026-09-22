import { Type } from "@sinclair/typebox";
import { AssetRefValueSchema, type SectionDefinition } from "@senify/section-sdk";
import { aspectProp, columnsProp, gapProp, headingPart, mediaPart, sectionStyleProps, sectionTitleProp, thumbs } from "../shared.ts";

export const gallerySection: SectionDefinition = {
  type: "gallery",
  version: 1,
  title: "Gallery",
  description:
    "Image collection with optional captions. Use for work impressions, event photos or before/after stories. Keep galleries focused — eight to twelve images per gallery is plenty.",
  category: "media",
  props: [
    sectionTitleProp(),
    {
      key: "items",
      control: "list",
      label: "Images",
      group: "Content",
      schema: Type.Array(
        Type.Object({
          asset: AssetRefValueSchema,
          caption: Type.Optional(Type.String()),
        }),
      ),
    },
  ],
  variants: {
    grid: { label: "Grid", preset: {} },
    masonry: { label: "Masonry", preset: {} },
    carousel: { label: "Carousel", preset: {} },
  },
  styleProps: [
    ...sectionStyleProps(),
    columnsProp(),
    gapProp(),
    aspectProp(),
    ...headingPart(),
    ...mediaPart(),
  ],
  allowedChildren: "none",
  motionPresets: ["scroll-reveal", "hover-lift", "tilt-card", "modal"],
  golden: {
    tree: {
      type: "gallery",
      variant: "grid",
      props: {
        title: "Einblicke",
        items: [
          { asset: { assetId: "galerie-atelier-1" }, caption: "Atelier am Morgen" },
          { asset: { assetId: "galerie-atelier-2" }, caption: "Materialbibliothek" },
          { asset: { assetId: "galerie-atelier-3" } },
        ],
      },
    },
    thumbnails: thumbs("gallery", "grid"),
    variantThumbnails: {
      masonry: thumbs("gallery", "masonry"),
      carousel: thumbs("gallery", "carousel"),
    },
  },
};
