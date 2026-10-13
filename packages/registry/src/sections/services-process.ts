import { Type } from "@sinclair/typebox";
import type { SectionDefinition } from "@senify/section-sdk";
import { cardPart, columnsProp, gapProp, headingPart, introProp, sectionStyleProps, sectionTitleProp, thumbs } from "../shared.ts";

export const servicesProcessSection: SectionDefinition = {
  type: "services-process",
  version: 1,
  title: "Services & Process",
  description:
    "Numbered steps showing how you work, from first call to delivery. Use on service pages to build trust. Variant 'timeline' connects the steps with a line.",
  category: "content",
  props: [
    sectionTitleProp(),
    introProp(),
    {
      key: "steps",
      control: "list",
      label: "Steps",
      group: "Content",
      schema: Type.Array(
        Type.Object({
          nr: Type.Optional(Type.String()),
          title: Type.String({ minLength: 1 }),
          text: Type.String({ minLength: 1 }),
        }),
      ),
    },
  ],
  variants: {
    steps: { label: "Schritte", preset: {} },
    cards: { label: "Karten", preset: {} },
    timeline: { label: "Zeitstrahl", preset: {} },
  },
  styleProps: [
    ...sectionStyleProps(),
    columnsProp(),
    gapProp(),
    ...headingPart(),
    ...cardPart(),
  ],
  allowedChildren: "none",
  motionPresets: ["scroll-reveal", "stagger-cascade"],
  golden: {
    tree: {
      type: "services-process",
      variant: "steps",
      props: {
        title: "So arbeiten wir",
        steps: [
          {
            nr: "01",
            title: "Kennenlernen",
            text: "In 30 Minuten verstehen wir Ihr Ziel und Ihren Zeitplan.",
          },
          {
            nr: "02",
            title: "Entwurf",
            text: "Sie erhalten einen klickbaren Entwurf innerhalb einer Woche.",
          },
          {
            nr: "03",
            title: "Go-live",
            text: "Nach zwei Feedback-Runden geht Ihre Seite live.",
          },
        ],
      },
    },
    thumbnails: thumbs("services-process", "steps"),
    variantThumbnails: {
      cards: thumbs("services-process", "cards"),
      timeline: thumbs("services-process", "timeline"),
    },
  },
};
