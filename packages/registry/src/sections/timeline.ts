import { Type } from "@sinclair/typebox";
import type { SectionDefinition } from "@senify/section-sdk";
import { sectionTitleProp, thumbs } from "../shared.ts";

export const timelineSection: SectionDefinition = {
  type: "timeline",
  version: 1,
  title: "Timeline",
  description:
    "Chronological events with date, title and text. Use for company history or project milestones. Keep entries short — dates carry the story.",
  category: "content",
  props: [
    sectionTitleProp(),
    {
      key: "items",
      control: "list",
      label: "Events",
      group: "Content",
      schema: Type.Array(
        Type.Object({
          date: Type.String({ minLength: 1 }),
          title: Type.String({ minLength: 1 }),
          text: Type.Optional(Type.String()),
        }),
      ),
    },
  ],
  variants: {
    vertical: { label: "Vertical", preset: {} },
    horizontal: { label: "Horizontal", preset: {} },
    cards: { label: "Cards", preset: {} },
  },
  allowedChildren: "none",
  motionPresets: ["scroll-reveal", "stagger-cascade"],
  golden: {
    tree: {
      type: "timeline",
      variant: "vertical",
      props: {
        title: "Unsere Geschichte",
        items: [
          { date: "2012", title: "Gründung", text: "Zwei Rechner, ein Schreibtisch, viele Ideen." },
          { date: "2018", title: "Eigenes Studio", text: "Umzug in die Speicherstadt mit vier Mitarbeitern." },
          { date: "2026", title: "100. Projekt", text: "Jubiläum — und kein bisschen leise." },
        ],
      },
    },
    thumbnails: thumbs("timeline", "vertical"),
    variantThumbnails: {
      horizontal: thumbs("timeline", "horizontal"),
      cards: thumbs("timeline", "cards"),
    },
  },
};
