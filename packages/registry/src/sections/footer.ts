import { Type } from "@sinclair/typebox";
import { LinkValueSchema, type SectionDefinition } from "@senify/section-sdk";
import { linkPart, linkProp, sectionStyleProps, textProp, thumbs } from "../shared.ts";

export const footerSection: SectionDefinition = {
  type: "footer",
  version: 1,
  title: "Footer",
  description:
    "Site footer with link columns, legal note and social links. Use once at the bottom of every page. Variant 'multi-column' for sitemaps, 'cta-bar' adds a call-to-action strip above the footer.",
  category: "structure",
  props: [
    {
      key: "columns",
      control: "list",
      label: "Columns",
      group: "Content",
      schema: Type.Array(
        Type.Object({
          heading: Type.String({ minLength: 1 }),
          links: Type.Array(
            Type.Object({
              label: Type.String({ minLength: 1 }),
              link: LinkValueSchema,
            }),
          ),
        }),
      ),
    },
    textProp("legal", "Legal note", "Content"),
    textProp("ctaHeadline", "CTA strip: headline", "Actions"),
    textProp("ctaLabel", "CTA strip: button label", "Actions"),
    linkProp("ctaLink", "CTA strip: button link", "Actions"),
    {
      key: "social",
      control: "list",
      label: "Social links",
      group: "Content",
      schema: Type.Array(
        Type.Object({
          label: Type.String({ minLength: 1 }),
          link: LinkValueSchema,
        }),
      ),
    },
  ],
  variants: {
    "multi-column": { label: "Mehrspaltig", preset: {} },
    minimal: { label: "Minimal", preset: {} },
    "cta-bar": { label: "Mit CTA-Leiste", preset: {} },
  },
  styleProps: [...sectionStyleProps(), ...linkPart()],
  allowedChildren: "none",
  motionPresets: ["fade-up", "grain"],
  golden: {
    tree: {
      type: "footer",
      variant: "multi-column",
      props: {
        columns: [
          {
            heading: "Studio",
            links: [
              { label: "Über uns", link: { url: "/ueber-uns" } },
              { label: "Kontakt", link: { url: "/kontakt" } },
            ],
          },
          {
            heading: "Rechtliches",
            links: [
              { label: "Impressum", link: { url: "/impressum" } },
              { label: "Datenschutz", link: { url: "/datenschutz" } },
            ],
          },
        ],
        legal: "© 2026 Musterstudio. Alle Rechte vorbehalten.",
        ctaHeadline: "Bereit für Ihr nächstes Projekt?",
        ctaLabel: "Gespräch vereinbaren",
        ctaLink: { url: "/kontakt" },
        social: [
          { label: "Instagram", link: { url: "https://instagram.com/musterstudio" } },
          { label: "LinkedIn", link: { url: "https://linkedin.com/company/musterstudio" } },
        ],
      },
    },
    thumbnails: thumbs("footer", "multi-column"),
    variantThumbnails: {
      minimal: thumbs("footer", "minimal"),
      "cta-bar": thumbs("footer", "cta-bar"),
    },
  },
};
