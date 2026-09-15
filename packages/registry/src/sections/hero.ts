import { Type } from "@sinclair/typebox";
import {
  ColorValueSchema,
  LinkValueSchema,
  type SectionDefinition,
} from "@senify/section-sdk";

export const heroSection: SectionDefinition = {
  type: "hero",
  version: 1,
  title: "Hero",
  description:
    "Top-of-page hero with eyebrow, headline, supporting text, calls to action and an optional visual slot. Use as the first section of a page. Variant 'centered' for centered text, 'split' for text beside a visual, 'showcase-3d' when a webgl-scene visual should carry the section.",
  category: "structure",
  props: [
    { key: "eyebrow", control: "text", label: "Eyebrow", group: "Content" },
    {
      key: "headline",
      control: "text",
      label: "Headline",
      group: "Content",
      schema: Type.String({ minLength: 1 }),
    },
    { key: "sub", control: "text", label: "Subheadline", group: "Content" },
    {
      key: "ctas",
      control: "list",
      label: "Calls to action",
      group: "Actions",
      schema: Type.Array(
        Type.Object({
          label: Type.String(),
          link: LinkValueSchema,
        }),
      ),
    },
    { key: "visual", control: "slot", label: "Visual", group: "Content" },
  ],
  variants: {
    centered: { label: "Centered", preset: {} },
    split: { label: "Split", preset: {} },
    "showcase-3d": { label: "Showcase 3D", preset: {} },
  },
  styleProps: [
    {
      key: "background",
      control: "color",
      label: "Background",
      group: "Styling",
      schema: Type.Optional(ColorValueSchema),
    },
  ],
  slots: {
    visual: { max: 1 },
  },
  allowedChildren: "none",
  motionPresets: ["masked-headline", "fade-up", "fade-up-deblur"],
  golden: {
    tree: {
      type: "hero",
      variant: "centered",
      props: {
        eyebrow: "Neu",
        headline: "Websites, gebaut von Agenten",
        sub: "Ein lokales Programm für Agentur-Arbeit mit KI-Agenten.",
        ctas: [
          { label: "Projekt starten", link: { url: "#start" } },
          { label: "Mehr erfahren", link: { url: "#mehr" } },
        ],
      },
    },
    thumbnails: {
      desktop: "thumbnails/hero-centered-1440.png",
      tablet: "thumbnails/hero-centered-810.png",
      mobile: "thumbnails/hero-centered-390.png",
    },
  },
};
