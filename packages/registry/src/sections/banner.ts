import type { SectionDefinition } from "@senify/section-sdk";
import { linkProp, sectionStyleProps, textProp, thumbs } from "../shared.ts";

export const bannerSection: SectionDefinition = {
  type: "banner",
  version: 1,
  title: "Banner",
  description:
    "Slim announcement strip for news, events or offers. Use at most one per page and retire it after the occasion. Dismissible banners remember the choice locally.",
  category: "utility",
  props: [
    textProp("text", "Text", "Content", 1),
    linkProp("link", "Link"),
    {
      key: "dismissible",
      control: "boolean",
      label: "Dismissible",
      group: "Content",
    },
  ],
  variants: {
    bar: { label: "Bar", preset: { dismissible: true } },
    ribbon: { label: "Ribbon", preset: { dismissible: false } },
    announcement: { label: "Announcement", preset: { dismissible: true } },
  },
  styleProps: [...sectionStyleProps()],
  allowedChildren: "none",
  motionPresets: ["fade-up"],
  golden: {
    tree: {
      type: "banner",
      variant: "bar",
      props: {
        text: "Neu: Websites mit Festpreis-Garantie — jetzt anfragen.",
        link: { url: "/kontakt" },
        dismissible: true,
      },
    },
    thumbnails: thumbs("banner", "bar"),
    variantThumbnails: {
      ribbon: thumbs("banner", "ribbon"),
      announcement: thumbs("banner", "announcement"),
    },
  },
};
