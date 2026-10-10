import { Type } from "@sinclair/typebox";
import type { SectionDefinition } from "@senify/section-sdk";
import {
  buttonPart,
  buttonsProp,
  headingPart,
  sectionStyleProps,
  textProp,
  thumbs,
} from "../shared.ts";

export const ctaSection: SectionDefinition = {
  type: "cta",
  version: 1,
  title: "Call to Action",
  description:
    "Conversion block with headline and buttons that closes a page or section. Use once per page near the end. Variant 'split' puts text beside the buttons, 'banner-cta' sets the call in a bordered panel tinted with the accent color.",
  category: "content",
  props: [
    {
      key: "headline",
      control: "text",
      label: "Headline",
      group: "Content",
      schema: Type.String({ minLength: 1 }),
    },
    textProp("sub", "Subline"),
    buttonsProp(),
  ],
  variants: {
    simple: { label: "Simple", preset: {} },
    split: { label: "Split", preset: {} },
    "banner-cta": { label: "Banner", preset: {} },
  },
  styleProps: [
    ...sectionStyleProps(),
    ...headingPart(),
    ...buttonPart(),
  ],
  allowedChildren: "none",
  motionPresets: ["fade-up", "magnetic-button", "cursor-glow"],
  golden: {
    tree: {
      type: "cta",
      variant: "simple",
      props: {
        headline: "Bereit für den nächsten Schritt?",
        sub: "Erzählen Sie uns von Ihrem Projekt — wir melden uns innerhalb von 24 Stunden.",
        buttons: [
          { label: "Projekt anfragen", link: { url: "/kontakt" } },
          { label: "Referenzen ansehen", link: { url: "/projekte" } },
        ],
      },
    },
    thumbnails: thumbs("cta", "simple"),
    variantThumbnails: {
      split: thumbs("cta", "split"),
      "banner-cta": thumbs("cta", "banner-cta"),
    },
  },
};
