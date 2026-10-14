import { Type } from "@sinclair/typebox";
import { AssetRefValueSchema, type SectionDefinition } from "@senify/section-sdk";
import { cardPart, columnsProp, gapProp, headingPart, mediaPart, sectionStyleProps, sectionTitleProp, thumbs } from "../shared.ts";

export const testimonialsSection: SectionDefinition = {
  type: "testimonials",
  version: 1,
  title: "Testimonials",
  description:
    "Customer quotes with author and role. Use real names and photos — anonymous praise converts poorly. Variant 'slider' rotates quotes, 'spotlight' stages a single long quote.",
  category: "content",
  props: [
    sectionTitleProp(),
    {
      key: "items",
      control: "list",
      label: "Testimonials",
      group: "Content",
      schema: Type.Array(
        Type.Object({
          quote: Type.String({ minLength: 1 }),
          author: Type.String({ minLength: 1 }),
          role: Type.Optional(Type.String()),
          avatar: Type.Optional(AssetRefValueSchema),
        }),
      ),
    },
  ],
  variants: {
    cards: { label: "Karten", preset: {} },
    slider: { label: "Schieber", preset: {} },
    spotlight: { label: "Im Fokus", preset: {} },
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
  motionPresets: ["scroll-reveal", "fade-up", "hover-lift"],
  golden: {
    tree: {
      type: "testimonials",
      variant: "cards",
      props: {
        title: "Stimmen unserer Kunden",
        items: [
          {
            quote: "Die neue Seite hat unsere Anfragen verdreifacht — und sie sieht auch noch fantastisch aus.",
            author: "Mareike Thomsen",
            role: "Geschäftsführerin, Kaffeekantine",
          },
          {
            quote: "Schnell, zuverlässig, mitdenkend. Die Zusammenarbeit war vom ersten Call an klar strukturiert.",
            author: "Jonas Peters",
            role: "Marketing-Leiter, Nordwind",
          },
        ],
      },
    },
    thumbnails: thumbs("testimonials", "cards"),
    variantThumbnails: {
      slider: thumbs("testimonials", "slider"),
      spotlight: thumbs("testimonials", "spotlight"),
    },
  },
};
