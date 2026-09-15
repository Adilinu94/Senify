import { Type } from "@sinclair/typebox";
import { LinkValueSchema, type SectionDefinition } from "@senify/section-sdk";
import { introProp, sectionTitleProp, thumbs } from "../shared.ts";

export const pricingSection: SectionDefinition = {
  type: "pricing",
  version: 1,
  title: "Pricing",
  description:
    "Price plans with feature lists and CTA. Keep plans comparable: same feature rows, one highlighted plan. The billing toggle switches monthly and yearly prices.",
  category: "commerce",
  props: [
    sectionTitleProp(),
    introProp(),
    {
      key: "billingToggle",
      control: "boolean",
      label: "Billing toggle",
      group: "Content",
    },
    {
      key: "billingNote",
      control: "text",
      label: "Billing note",
      group: "Content",
      hidden: { prop: "billingToggle", notEquals: true },
    },
    {
      key: "plans",
      control: "list",
      label: "Plans",
      group: "Content",
      schema: Type.Array(
        Type.Object({
          name: Type.String({ minLength: 1 }),
          price: Type.String({ minLength: 1 }),
          period: Type.Optional(Type.String()),
          features: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
          ctaLabel: Type.String({ minLength: 1 }),
          ctaLink: LinkValueSchema,
          highlighted: Type.Optional(Type.Boolean()),
        }),
      ),
    },
  ],
  variants: {
    "plans-3": { label: "Three plans", preset: { billingToggle: true } },
    comparison: { label: "Comparison", preset: { billingToggle: true } },
    simple: { label: "Simple", preset: { billingToggle: false } },
  },
  allowedChildren: "none",
  motionPresets: ["fade-up", "hover-lift"],
  golden: {
    tree: {
      type: "pricing",
      variant: "plans-3",
      props: {
        title: "Pakete",
        intro: "Transparent, ohne Überraschungen. Monatlich kündbar.",
        billingToggle: true,
        billingNote: "Jahreszahlung spart zwei Monate.",
        plans: [
          {
            name: "Start",
            price: "490 €",
            period: "einmalig",
            features: ["Onepager", "Texthilfe", "Go-live in 2 Wochen"],
            ctaLabel: "Anfragen",
            ctaLink: { url: "/kontakt" },
          },
          {
            name: "Studio",
            price: "1.900 €",
            period: "einmalig",
            features: ["Bis 8 Seiten", "Blog & Referenzen", "SEO-Grundlagen"],
            ctaLabel: "Anfragen",
            ctaLink: { url: "/kontakt" },
            highlighted: true,
          },
          {
            name: "Plus",
            price: "290 €",
            period: "pro Monat",
            features: ["Betreuung", "Updates", "Prioritäts-Support"],
            ctaLabel: "Gespräch buchen",
            ctaLink: { url: "/kontakt" },
          },
        ],
      },
    },
    thumbnails: thumbs("pricing", "plans-3"),
    variantThumbnails: {
      comparison: thumbs("pricing", "comparison"),
      simple: thumbs("pricing", "simple"),
    },
  },
};
