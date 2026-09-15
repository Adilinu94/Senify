import type { SectionDefinition } from "@senify/section-sdk";
import { buttonPart, linkProp, sectionStyleProps, textProp, thumbs } from "../shared.ts";

export const cookieNoteSection: SectionDefinition = {
  type: "cookie-note",
  version: 1,
  title: "Cookie Note",
  description:
    "Local consent notice without third-party scripts. The choice is stored in localStorage only — no tracking, no external calls. Link the privacy page via the policy link.",
  category: "utility",
  props: [
    textProp("text", "Text", "Content", 1),
    textProp("acceptLabel", "Accept label", "Actions", 1),
    textProp("declineLabel", "Decline label", "Actions"),
    linkProp("policyLink", "Privacy policy link"),
  ],
  variants: {
    bar: { label: "Bar", preset: {} },
    card: { label: "Card", preset: {} },
  },
  styleProps: [...sectionStyleProps(), ...buttonPart()],
  allowedChildren: "none",
  motionPresets: ["fade-up"],
  golden: {
    tree: {
      type: "cookie-note",
      variant: "bar",
      props: {
        text: "Wir nutzen nur technisch notwendige Cookies — versprochen.",
        acceptLabel: "Verstanden",
        declineLabel: "Nur notwendige",
        policyLink: { url: "/datenschutz" },
      },
    },
    thumbnails: thumbs("cookie-note", "bar"),
    variantThumbnails: {
      card: thumbs("cookie-note", "card"),
    },
  },
};
