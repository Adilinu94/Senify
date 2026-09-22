import type { SectionDefinition } from "@senify/section-sdk";
import {
  assetProp,
  cardPart,
  headingPart,
  linkPart,
  linkProp,
  mediaPart,
  sectionStyleProps,
  textProp,
  thumbs,
} from "../shared.ts";

// The card lives in the `item` slot of a collection-list; every content prop
// carries bindings (`{ "$entry": "title" }` or `"Neues von {entry.title}"`).
export const cardSection: SectionDefinition = {
  type: "card",
  version: 1,
  title: "Card",
  description:
    "Karten-Baustein im Item-Slot einer Sammlung: Bild oben, horizontal oder nur Text. Die Props tragen Bindings auf Entry-Felder (Whole-Prop oder Text-Mix) und werden pro Listeneintrag aufgelöst.",
  category: "content",
  props: [
    textProp("tag", "Label"),
    textProp("title", "Titel"),
    textProp("text", "Text"),
    assetProp("cover", "Bild"),
    linkProp("link", "Link"),
  ],
  variants: {
    "image-top": { label: "Bild oben", preset: {} },
    horizontal: { label: "Horizontal", preset: {} },
    text: { label: "Nur Text", preset: {} },
  },
  styleProps: [
    ...sectionStyleProps(),
    ...headingPart(),
    ...cardPart(),
    ...mediaPart(),
    ...linkPart(),
  ],
  slots: {},
  allowedChildren: "none",
  motionPresets: ["fade-up", "hover-lift", "tilt-card"],
  golden: {
    tree: {
      type: "card",
      variant: "image-top",
      props: {
        tag: "Technik",
        title: "Kartentitel",
        text: "Kurzer Anrisstext, gebunden an ein Entry-Feld.",
      },
    },
    thumbnails: thumbs("card", "image-top"),
    variantThumbnails: {
      horizontal: thumbs("card", "horizontal"),
      text: thumbs("card", "text"),
    },
  },
};
