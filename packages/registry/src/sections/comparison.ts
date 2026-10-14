import { Type } from "@sinclair/typebox";
import type { SectionDefinition } from "@senify/section-sdk";
import { headingPart, sectionStyleProps, sectionTitleProp, thumbs } from "../shared.ts";

export const comparisonSection: SectionDefinition = {
  type: "comparison",
  version: 1,
  title: "Comparison",
  description:
    "Feature comparison across columns, as a table or as cards on mobile. Use for plan or product comparisons. Keep rows short and scannable.",
  category: "content",
  props: [
    sectionTitleProp(),
    {
      key: "columns",
      control: "list",
      label: "Columns",
      group: "Content",
      schema: Type.Array(
        Type.Object({ header: Type.String({ minLength: 1 }) }),
      ),
    },
    {
      key: "rows",
      control: "list",
      label: "Rows",
      group: "Content",
      schema: Type.Array(
        Type.Object({
          label: Type.String({ minLength: 1 }),
          values: Type.Array(Type.String({ minLength: 1 })),
        }),
      ),
    },
  ],
  variants: {
    table: { label: "Tabelle", preset: {} },
    cards: { label: "Karten", preset: {} },
  },
  styleProps: [...sectionStyleProps(), ...headingPart()],
  allowedChildren: "none",
  motionPresets: ["fade-up"],
  golden: {
    tree: {
      type: "comparison",
      variant: "table",
      props: {
        title: "Pakete im Vergleich",
        columns: [{ header: "Start" }, { header: "Studio" }, { header: "Plus" }],
        rows: [
          { label: "Seiten", values: ["1", "bis 8", "unbegrenzt"] },
          { label: "Blog", values: ["—", "ja", "ja"] },
          { label: "Betreuung", values: ["—", "—", "laufend"] },
        ],
      },
    },
    thumbnails: thumbs("comparison", "table"),
    variantThumbnails: {
      cards: thumbs("comparison", "cards"),
    },
  },
};
