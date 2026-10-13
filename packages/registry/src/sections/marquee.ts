import { Type } from "@sinclair/typebox";
import { AssetRefValueSchema, type SectionDefinition } from "@senify/section-sdk";
import { mediaPart, sectionStyleProps, thumbs } from "../shared.ts";

export const marqueeSection: SectionDefinition = {
  type: "marquee",
  version: 1,
  title: "Marquee",
  description:
    "Endless ticker for logos, claims or images. Use once per page at most — motion that never stops must earn its place. Pauses automatically for reduced motion.",
  category: "media",
  props: [
    {
      key: "items",
      control: "list",
      label: "Items",
      group: "Content",
      schema: Type.Array(
        Type.Union([
          Type.Object({
            text: Type.String({ minLength: 1 }),
            asset: Type.Optional(AssetRefValueSchema),
          }),
          Type.Object({
            asset: AssetRefValueSchema,
            text: Type.Optional(Type.String()),
          }),
        ]),
      ),
    },
    {
      key: "speed",
      control: "number",
      label: "Speed",
      group: "Settings",
      min: 1,
      max: 10,
      step: 1,
      schema: Type.Number({ minimum: 1, maximum: 10 }),
    },
    {
      key: "direction",
      control: "enum",
      label: "Direction",
      group: "Settings",
      options: [
        { value: "left", label: "Left" },
        { value: "right", label: "Right" },
      ],
    },
  ],
  variants: {
    text: { label: "Text", preset: { speed: 4, direction: "left" } },
    logos: { label: "Logos", preset: { speed: 5, direction: "left" } },
    images: { label: "Bilder", preset: { speed: 5, direction: "right" } },
  },
  styleProps: [...sectionStyleProps(), ...mediaPart()],
  allowedChildren: "none",
  motionPresets: ["marquee"],
  golden: {
    tree: {
      type: "marquee",
      variant: "text",
      props: {
        items: [
          { text: "Festpreis-Garantie" },
          { text: "Go-live in Wochen" },
          { text: "Hosting in der EU" },
          { text: "Persönlicher Ansprechpartner" },
        ],
        speed: 4,
        direction: "left",
      },
    },
    thumbnails: thumbs("marquee", "text"),
    variantThumbnails: {
      logos: thumbs("marquee", "logos"),
      images: thumbs("marquee", "images"),
    },
  },
};
