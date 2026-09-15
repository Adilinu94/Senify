import { Type } from "@sinclair/typebox";
import type { SectionDefinition } from "@senify/section-sdk";

export function heroDefinition(): SectionDefinition {
  return {
    type: "hero",
    version: 1,
    title: "Hero",
    description: "Top-of-page hero.",
    category: "structure",
    props: [
      { key: "headline", control: "text", label: "Headline", schema: Type.String() },
      { key: "columns", control: "number", label: "Columns", schema: Type.Number() },
    ],
    variants: {
      centered: { label: "Centered", preset: { align: "center" } },
    },
    allowedChildren: "none",
    motionPresets: ["masked-headline", "fade-up"],
    golden: {
      tree: { type: "hero", props: { headline: "Welcome", columns: 2 } },
      thumbnails: { desktop: "tbd" },
    },
  };
}

export function cardDefinition(): SectionDefinition {
  return {
    type: "card",
    version: 1,
    title: "Card",
    description: "Simple card.",
    category: "content",
    props: [{ key: "title", control: "text", label: "Title", schema: Type.String() }],
    golden: { tree: { type: "card", props: { title: "Card" } }, thumbnails: {} },
  };
}