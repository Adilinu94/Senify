import { Type } from "@sinclair/typebox";
import { AssetRefValueSchema, type SectionDefinition } from "@senify/section-sdk";
import { sectionTitleProp, thumbs } from "../shared.ts";

export const teamSection: SectionDefinition = {
  type: "team",
  version: 1,
  title: "Team",
  description:
    "Team members with photo, name and role. Use on the about page to make the studio tangible. Real photos only — no stock portraits.",
  category: "content",
  props: [
    sectionTitleProp(),
    {
      key: "members",
      control: "list",
      label: "Members",
      group: "Content",
      schema: Type.Array(
        Type.Object({
          photo: Type.Optional(AssetRefValueSchema),
          name: Type.String({ minLength: 1 }),
          role: Type.Optional(Type.String()),
        }),
      ),
    },
  ],
  variants: {
    grid: { label: "Grid", preset: {} },
    cards: { label: "Cards", preset: {} },
    compact: { label: "Compact", preset: {} },
  },
  allowedChildren: "none",
  motionPresets: ["scroll-reveal", "fade-up"],
  golden: {
    tree: {
      type: "team",
      variant: "grid",
      props: {
        title: "Die Köpfe dahinter",
        members: [
          {
            photo: { assetId: "team-adrian" },
            name: "Adrian Nick",
            role: "Design & Strategie",
          },
          { name: "Dennis Krüger", role: "Entwicklung" },
          { name: "Katja Mohr", role: "Text & Content" },
        ],
      },
    },
    thumbnails: thumbs("team", "grid"),
    variantThumbnails: {
      cards: thumbs("team", "cards"),
      compact: thumbs("team", "compact"),
    },
  },
};
