import type { SectionDefinition } from "@senify/section-sdk";
import { sectionStyleProps, textProp, thumbs } from "../shared.ts";

export const outletSection: SectionDefinition = {
  type: "outlet",
  version: 1,
  title: "Outlet",
  description:
    "Platzhalter für den eingesetzten Inhalt: im Layout die Seite, im Entry-Template der Artikel. Der Bake füllt genau den ersten Outlet; alle weiteren bleiben leer. Templates ohne Outlet gelten als unfertig und werden ignoriert.",
  category: "structure",
  props: [
    textProp("hint", "Hinweis im Editor"),
  ],
  variants: {
    inline: { label: "Im Fluss", preset: {} },
    boxed: { label: "Boxed", preset: {} },
  },
  styleProps: sectionStyleProps(),
  allowedChildren: "none",
  motionPresets: [],
  golden: {
    tree: { type: "outlet", variant: "inline", props: { hint: "Inhalt hier" } },
    thumbnails: thumbs("outlet", "inline"),
    variantThumbnails: { boxed: thumbs("outlet", "boxed") },
  },
};
