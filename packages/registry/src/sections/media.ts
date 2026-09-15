import type { SectionDefinition } from "@senify/section-sdk";
import { assetProp, mediaPart, sectionStyleProps, textProp, thumbs } from "../shared.ts";

export const mediaSection: SectionDefinition = {
  type: "media",
  version: 1,
  title: "Media",
  description:
    "Single image, video or 3D scene with optional caption. Use for full-width visuals, product shots and showpieces. Variant '3d-scene' renders the configured webgl scene instead of a flat asset.",
  category: "media",
  props: [
    assetProp("asset", "Image"),
    textProp("videoUrl", "Video URL"),
    textProp("caption", "Caption"),
    {
      key: "aspect",
      control: "enum",
      label: "Aspect ratio",
      group: "Layout",
      options: [
        { value: "16/9", label: "16:9" },
        { value: "4/3", label: "4:3" },
        { value: "1/1", label: "1:1" },
        { value: "21/9", label: "21:9" },
      ],
    },
    textProp("scene", "3D scene preset"),
  ],
  variants: {
    image: { label: "Image", preset: { aspect: "16/9" } },
    video: { label: "Video", preset: { aspect: "16/9" } },
    "3d-scene": { label: "3D scene", preset: { aspect: "21/9" } },
  },
  styleProps: [...sectionStyleProps(), ...mediaPart()],
  allowedChildren: "none",
  motionPresets: ["fade-up", "parallax-subtle"],
  golden: {
    tree: {
      type: "media",
      variant: "image",
      props: {
        asset: { assetId: "demo-werkstatt", focal: { x: 0.5, y: 0.4 } },
        caption: "Blick in unsere Werkstatt in Hamburg.",
        aspect: "16/9",
      },
    },
    thumbnails: thumbs("media", "image"),
    variantThumbnails: {
      video: thumbs("media", "video"),
      "3d-scene": thumbs("media", "3d-scene"),
    },
  },
};
