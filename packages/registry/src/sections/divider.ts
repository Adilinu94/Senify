import type { SectionDefinition } from "@senify/section-sdk";
import { sectionStyleProps, thumbs } from "../shared.ts";

export const dividerSection: SectionDefinition = {
  type: "divider",
  version: 1,
  title: "Divider",
  description:
    "Rhythm tool: visual separation or pure whitespace between sections. Use to pace long pages. Keep usage sparse — one divider per two or three sections is plenty.",
  category: "utility",
  props: [
    {
      key: "spacing",
      control: "enum",
      label: "Spacing",
      group: "Layout",
      options: [
        { value: "xs", label: "XS" },
        { value: "s", label: "S" },
        { value: "m", label: "M" },
        { value: "l", label: "L" },
        { value: "xl", label: "XL" },
      ],
    },
  ],
  variants: {
    line: { label: "Linie", preset: { spacing: "m" } },
    space: { label: "Abstand", preset: { spacing: "xl" } },
    dots: { label: "Punkte", preset: { spacing: "l" } },
  },
  styleProps: [
    ...sectionStyleProps(),
    { key: "color", control: "color", label: "Color", group: "Styling", tokenGroup: "color" },
  ],
  allowedChildren: "none",
  motionPresets: ["fade-up"],
  golden: {
    tree: {
      type: "divider",
      variant: "line",
      props: { spacing: "m" },
    },
    thumbnails: thumbs("divider", "line"),
    variantThumbnails: {
      space: thumbs("divider", "space"),
      dots: thumbs("divider", "dots"),
    },
  },
};
