import { Type } from "@sinclair/typebox";
import { LinkValueSchema, type SectionDefinition } from "@senify/section-sdk";
import { introProp, sectionTitleProp, thumbs } from "../shared.ts";

export const featuresSection: SectionDefinition = {
  type: "features",
  version: 1,
  title: "Features",
  description:
    "Benefit list with icon, title and text per item. Use to explain what you offer. Variant 'alternating' stages large rows, 'list' is a compact single column.",
  category: "content",
  props: [
    sectionTitleProp(),
    introProp(),
    {
      key: "items",
      control: "list",
      label: "Features",
      group: "Content",
      schema: Type.Array(
        Type.Object({
          icon: Type.Optional(Type.String()),
          title: Type.String({ minLength: 1 }),
          text: Type.String({ minLength: 1 }),
          link: Type.Optional(LinkValueSchema),
        }),
      ),
    },
  ],
  variants: {
    grid: { label: "Grid", preset: {} },
    alternating: { label: "Alternating", preset: {} },
    list: { label: "List", preset: {} },
  },
  allowedChildren: "none",
  motionPresets: ["scroll-reveal", "stagger-cascade"],
  golden: {
    tree: {
      type: "features",
      variant: "grid",
      props: {
        title: "Warum wir",
        intro: "Drei Gründe, warum Kunden bei uns bleiben.",
        items: [
          {
            icon: "zap",
            title: "Schnell",
            text: "Ihre Seite lädt in unter einer Sekunde — auf jedem Gerät.",
          },
          {
            icon: "shield",
            title: "Sicher",
            text: "Hosting in der EU, Backups inklusive, DSGVO-konform.",
          },
          {
            icon: "heart",
            title: "Persönlich",
            text: "Ein Ansprechpartner von der Idee bis zum Go-live.",
          },
        ],
      },
    },
    thumbnails: thumbs("features", "grid"),
    variantThumbnails: {
      alternating: thumbs("features", "alternating"),
      list: thumbs("features", "list"),
    },
  },
};
