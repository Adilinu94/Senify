import type { SectionDefinition } from "@senify/section-sdk";
import { headingPart, introProp, sectionStyleProps, sectionTitleProp, thumbs } from "../shared.ts";

export const contentSection: SectionDefinition = {
  type: "content",
  version: 1,
  title: "Text Content",
  description:
    "Rich-text editorial section for prose, statements and highlighted passages. Use for about texts, imprint-style pages and long-form copy. Variant 'columns' splits the body in two, 'highlight' stages a single statement.",
  category: "content",
  props: [
    sectionTitleProp(),
    introProp(),
    { key: "body", control: "richtext", label: "Body", group: "Content" },
  ],
  variants: {
    prose: { label: "Prose", preset: {} },
    columns: { label: "Columns", preset: {} },
    highlight: { label: "Highlight", preset: {} },
  },
  styleProps: [...sectionStyleProps(), ...headingPart()],
  allowedChildren: "none",
  motionPresets: ["fade-up", "scroll-reveal"],
  golden: {
    tree: {
      type: "content",
      variant: "prose",
      props: {
        title: "Unser Anspruch",
        intro: "Seit 2012 bauen wir Websites, die verkaufen.",
        body: "Wir glauben an **weniger, aber besser**: klare Botschaften, schnelles Handwerk und ein Design, das Vertrauen schafft. Jede Seite entsteht im direkten Austausch — ohne Baukasten-Kompromisse.",
      },
    },
    thumbnails: thumbs("content", "prose"),
    variantThumbnails: {
      columns: thumbs("content", "columns"),
      highlight: thumbs("content", "highlight"),
    },
  },
};
