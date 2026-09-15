import type { SectionDefinition } from "@senify/section-sdk";
import { buttonPart, headingPart, sectionStyleProps, textProp, thumbs } from "../shared.ts";

export const newsletterSection: SectionDefinition = {
  type: "newsletter",
  version: 1,
  title: "Newsletter",
  description:
    "Email signup with button and privacy note. Submissions post to an external endpoint in v1 — configure the endpoint prop with your provider URL.",
  category: "commerce",
  props: [
    textProp("headline", "Headline", "Content", 1),
    textProp("sub", "Subline"),
    textProp("buttonLabel", "Button label", "Actions", 1),
    textProp("note", "Privacy note", "Content"),
    textProp("endpoint", "Endpoint URL", "Settings", 1),
  ],
  variants: {
    boxed: { label: "Boxed", preset: {} },
    inline: { label: "Inline", preset: {} },
    split: { label: "Split", preset: {} },
  },
  styleProps: [
    ...sectionStyleProps(),
    ...headingPart(),
    ...buttonPart(),
  ],
  allowedChildren: "none",
  motionPresets: ["fade-up"],
  golden: {
    tree: {
      type: "newsletter",
      variant: "boxed",
      props: {
        headline: "Einmal im Monat: Neues aus dem Studio",
        sub: "Referenzen, Tipps und Termine — kein Spam, jederzeit kündbar.",
        buttonLabel: "Anmelden",
        note: "Mit der Anmeldung stimmen Sie unserer Datenschutzerklärung zu.",
      },
    },
    thumbnails: thumbs("newsletter", "boxed"),
    variantThumbnails: {
      inline: thumbs("newsletter", "inline"),
      split: thumbs("newsletter", "split"),
    },
  },
};
