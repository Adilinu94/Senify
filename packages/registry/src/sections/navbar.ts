import { Type } from "@sinclair/typebox";
import { LinkValueSchema, type SectionDefinition } from "@senify/section-sdk";
import { backgroundStyleProp, linkProp, textProp, thumbs } from "../shared.ts";

export const navbarSection: SectionDefinition = {
  type: "navbar",
  version: 1,
  title: "Navigation",
  description:
    "Site header with logo, link list, optional CTA button and integrated mobile menu. Use once at the top of every page. Variant 'transparent' overlays the hero, 'centered' centers logo and links.",
  category: "structure",
  props: [
    textProp("logo", "Logo text", "Content", 1),
    {
      key: "links",
      control: "list",
      label: "Links",
      group: "Content",
      schema: Type.Array(
        Type.Object({
          label: Type.String({ minLength: 1 }),
          link: LinkValueSchema,
        }),
      ),
    },
    textProp("ctaLabel", "CTA label", "Actions"),
    linkProp("ctaLink", "CTA link", "Actions"),
    {
      key: "sticky",
      control: "boolean",
      label: "Sticky",
      group: "Layout",
    },
  ],
  variants: {
    default: { label: "Default", preset: { sticky: true } },
    transparent: { label: "Transparent", preset: { sticky: true } },
    centered: { label: "Centered", preset: { sticky: false } },
  },
  styleProps: [backgroundStyleProp()],
  allowedChildren: "none",
  motionPresets: ["fade-up"],
  golden: {
    tree: {
      type: "navbar",
      variant: "default",
      props: {
        logo: "Musterstudio",
        links: [
          { label: "Start", link: { url: "/" } },
          { label: "Leistungen", link: { url: "/leistungen" } },
          { label: "Kontakt", link: { url: "/kontakt" } },
        ],
        ctaLabel: "Anfrage",
        ctaLink: { url: "/kontakt" },
        sticky: true,
      },
    },
    thumbnails: thumbs("navbar", "default"),
    variantThumbnails: {
      transparent: thumbs("navbar", "transparent"),
      centered: thumbs("navbar", "centered"),
    },
  },
};
