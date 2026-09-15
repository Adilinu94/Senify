import { Type } from "@sinclair/typebox";
import type { SectionDefinition } from "@senify/section-sdk";
import { cardPart, gapProp, headingPart, sectionStyleProps, sectionTitleProp, thumbs } from "../shared.ts";

export const faqSection: SectionDefinition = {
  type: "faq",
  version: 1,
  title: "FAQ",
  description:
    "Frequently asked questions as an accordion. Use to remove purchase doubts right before the CTA. Keep answers to two or three sentences.",
  category: "content",
  props: [
    sectionTitleProp(),
    {
      key: "items",
      control: "list",
      label: "Questions",
      group: "Content",
      schema: Type.Array(
        Type.Object({
          q: Type.String({ minLength: 1 }),
          a: Type.String({ minLength: 1 }),
        }),
      ),
    },
  ],
  variants: {
    accordion: { label: "Accordion", preset: {} },
    "two-col": { label: "Two columns", preset: {} },
    "sticky-heading": { label: "Sticky heading", preset: {} },
  },
  styleProps: [
    ...sectionStyleProps(),
    gapProp(),
    ...headingPart(),
    ...cardPart(),
  ],
  allowedChildren: "none",
  motionPresets: ["fade-up"],
  golden: {
    tree: {
      type: "faq",
      variant: "accordion",
      props: {
        title: "Häufige Fragen",
        items: [
          {
            q: "Wie lange dauert ein Projekt?",
            a: "Ein Onepager geht in zwei Wochen live, eine mittlere Site in vier bis sechs Wochen — vorausgesetzt, Inhalte kommen zügig.",
          },
          {
            q: "Was kostet eine Website?",
            a: "Unsere Pakete starten bei 490 € einmalig. Nach einem kurzen Gespräch erhalten Sie ein Festpreis-Angebot.",
          },
          {
            q: "Pflegen Sie die Seite danach?",
            a: "Ja — im Plus-Paket übernehmen wir Updates, Backups und kleine Änderungen laufend.",
          },
        ],
      },
    },
    thumbnails: thumbs("faq", "accordion"),
    variantThumbnails: {
      "two-col": thumbs("faq", "two-col"),
      "sticky-heading": thumbs("faq", "sticky-heading"),
    },
  },
};
