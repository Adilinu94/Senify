import type { SectionDefinition } from "@senify/section-sdk";
import { textProp, thumbs } from "../shared.ts";

export const embedSection: SectionDefinition = {
  type: "embed",
  version: 1,
  title: "Embed",
  description:
    "External content by URL: iframe, map or social post. URLs are sanitized at bake time — only https embeds from allowlisted providers render. Always set a title for accessibility.",
  category: "media",
  props: [
    textProp("url", "Embed URL", "Content", 1),
    {
      key: "aspect",
      control: "enum",
      label: "Aspect ratio",
      group: "Layout",
      options: [
        { value: "16/9", label: "16:9" },
        { value: "4/3", label: "4:3" },
        { value: "1/1", label: "1:1" },
      ],
    },
    textProp("title", "Title"),
  ],
  variants: {
    map: { label: "Map", preset: { aspect: "4/3" } },
    iframe: { label: "Iframe", preset: { aspect: "16/9" } },
    social: { label: "Social", preset: { aspect: "1/1" } },
  },
  allowedChildren: "none",
  motionPresets: ["fade-up"],
  golden: {
    tree: {
      type: "embed",
      variant: "map",
      props: {
        url: "https://www.openstreetmap.org/export/embed.html?bbox=9.9%2C53.5%2C10.0%2C53.6",
        aspect: "4/3",
        title: "Karte: Unser Studio in Hamburg",
      },
    },
    thumbnails: thumbs("embed", "map"),
    variantThumbnails: {
      iframe: thumbs("embed", "iframe"),
      social: thumbs("embed", "social"),
    },
  },
};
