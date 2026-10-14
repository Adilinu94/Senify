import type { SectionDefinition } from "@senify/section-sdk";
import { buttonPart, headingPart, linkProp, sectionStyleProps, textProp, thumbs } from "../shared.ts";

export const newsletterSection: SectionDefinition = {
  type: "newsletter",
  version: 1,
  title: "Newsletter",
  description:
    "Email signup with a native double-opt-in flow: submitting creates a pending entry, the confirmation mail carries a signed token, the confirm link flips it to confirmed and the unsubscribe link to unsubscribed. The 'endpoint' prop is the legacy external fallback.",
  category: "commerce",
  props: [
    textProp("headline", "Headline", "Content", 1),
    textProp("sub", "Subline"),
    textProp("buttonLabel", "Button label", "Actions", 1),
    textProp("note", "Privacy note", "Content"),
    textProp("targetCollectionId", "Subscription collection", "Form"),
    textProp("consentText", "Consent text", "Form"),
    linkProp("consentPage", "Privacy page", "Form"),
    textProp("successMessage", "Inline success message", "Form"),
    linkProp("successPage", "Thank-you page", "Form"),
    textProp("honeypotKey", "Honeypot field", "Settings"),
    textProp("notifyEmail", "Notification recipient", "Settings"),
    textProp("endpoint", "External endpoint URL", "Settings", 1),
  ],
  variants: {
    boxed: { label: "Umrahmt", preset: {} },
    inline: { label: "In einer Zeile", preset: {} },
    split: { label: "Geteilt", preset: {} },
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
        consentText:
          "Mit der Anmeldung stimmen Sie unserer Datenschutzerklärung zu.",
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
