import { Type } from "@sinclair/typebox";
import {
  AssetRefValueSchema,
  LinkValueSchema,
  type SectionDefinition,
} from "@senify/section-sdk";
import { cardPart, columnsProp, gapProp, headingPart, introProp, mediaPart, sectionStyleProps, sectionTitleProp, thumbs } from "../shared.ts";

export const projectsSection: SectionDefinition = {
  type: "projects",
  version: 1,
  title: "Projects",
  description:
    "Selected work with cover image, tag and link. Use on the homepage and as a teaser for a work overview. CMS binding arrives in v2 — until then entries are manual.",
  category: "content",
  props: [
    sectionTitleProp(),
    introProp(),
    {
      key: "items",
      control: "list",
      label: "Projects",
      group: "Content",
      schema: Type.Array(
        Type.Object({
          cover: AssetRefValueSchema,
          tag: Type.Optional(Type.String()),
          title: Type.String({ minLength: 1 }),
          text: Type.Optional(Type.String()),
          link: Type.Optional(LinkValueSchema),
        }),
      ),
    },
  ],
  variants: {
    cards: { label: "Cards", preset: {} },
    list: { label: "List", preset: {} },
    showcase: { label: "Showcase", preset: {} },
  },
  styleProps: [
    ...sectionStyleProps(),
    columnsProp(),
    gapProp(),
    ...headingPart(),
    ...cardPart(),
    ...mediaPart(),
  ],
  allowedChildren: "none",
  motionPresets: ["scroll-reveal"],
  golden: {
    tree: {
      type: "projects",
      variant: "cards",
      props: {
        title: "Ausgewählte Arbeiten",
        items: [
          {
            cover: { assetId: "projekt-kaffeekantine" },
            tag: "E-Commerce",
            title: "Kaffeekantine",
            text: "Online-Shop mit Abo-Modell in sechs Wochen.",
            link: { url: "/projekte/kaffeekantine" },
          },
          {
            cover: { assetId: "projekt-nordwind" },
            tag: "Corporate",
            title: "Nordwind Logistics",
            text: "Mehrsprachiger Auftritt mit 40+ Seiten.",
            link: { url: "/projekte/nordwind" },
          },
        ],
      },
    },
    thumbnails: thumbs("projects", "cards"),
    variantThumbnails: {
      list: thumbs("projects", "list"),
      showcase: thumbs("projects", "showcase"),
    },
  },
};
