import { Type } from "@sinclair/typebox";
import {
  AssetRefValueSchema,
  LinkValueSchema,
  type PropSpec,
  type TokenGroup,
} from "@senify/section-sdk";

// Group taxonomy for generated editor panels (T13): Content | Actions |
// Styling | Layout | Settings | Form. Groups are free strings, but new
// sections must reuse these six so panels stay consistent.

export function thumbs(
  type: string,
  variant: string,
): { desktop: string; tablet: string; mobile: string } {
  return {
    desktop: `thumbnails/${type}-${variant}-1440.png`,
    tablet: `thumbnails/${type}-${variant}-810.png`,
    mobile: `thumbnails/${type}-${variant}-390.png`,
  };
}

export function sectionTitleProp(
  key = "title",
  label = "Title",
): PropSpec {
  return {
    key,
    control: "text",
    label,
    group: "Content",
    schema: Type.String({ minLength: 1 }),
  };
}

export function introProp(): PropSpec {
  return { key: "intro", control: "text", label: "Intro", group: "Content" };
}

// Compat builder used by hero/cta/navbar/footer/divider (T03). New code
// should use sectionStyleProps() (T16 model); this stays so committed
// sections keep working unchanged.
export function backgroundStyleProp(): PropSpec {
  return {
    key: "background",
    control: "color",
    label: "Background",
    group: "Styling",
  };
}

// Style props (T16, artifacts/29): every section exposes the standard set
// below plus parts and layout knobs, so any section can be fully themed.
// Values are token refs (`{ $token: "space.16" }`) or free CSS values; the
// engine only warns on literals.

export function sectionStyleProps(): PropSpec[] {
  return [
    {
      key: "background",
      control: "color",
      label: "Background",
      group: "Styling",
      tokenGroup: "color",
    },
    {
      key: "textColor",
      control: "color",
      label: "Text color",
      group: "Styling",
      tokenGroup: "color",
    },
    {
      key: "paddingY",
      control: "scale",
      label: "Vertical padding",
      group: "Styling",
      tokenGroup: "space",
    },
    contentWidthProp(),
    alignProp(),
  ];
}

export function contentWidthProp(): PropSpec {
  return {
    key: "contentWidth",
    control: "enum",
    label: "Content width",
    group: "Layout",
    options: [
      { value: "narrow", label: "Narrow" },
      { value: "regular", label: "Regular" },
      { value: "wide", label: "Wide" },
      { value: "full", label: "Full" },
    ],
  };
}

export function alignProp(): PropSpec {
  return {
    key: "align",
    control: "enum",
    label: "Alignment",
    group: "Layout",
    options: [
      { value: "left", label: "Left" },
      { value: "center", label: "Center" },
    ],
  };
}

export function columnsProp(): PropSpec {
  return {
    key: "columns",
    control: "enum",
    label: "Columns",
    group: "Layout",
    options: [
      { value: "2", label: "2" },
      { value: "3", label: "3" },
      { value: "4", label: "4" },
    ],
  };
}

export function gapProp(): PropSpec {
  return {
    key: "gap",
    control: "scale",
    label: "Gap",
    group: "Layout",
    tokenGroup: "space",
  };
}

export function reverseProp(): PropSpec {
  return {
    key: "reverse",
    control: "boolean",
    label: "Reverse order",
    group: "Layout",
  };
}

export function aspectProp(): PropSpec {
  return {
    key: "aspect",
    control: "enum",
    label: "Aspect ratio",
    group: "Layout",
    options: ["16/9", "4/3", "1/1", "3/4"].map((value) => ({
      value,
      label: value.replace("/", ":"),
    })),
  };
}

function partStyle(
  part: string,
  key: string,
  label: string,
  control: "color" | "scale",
  tokenGroup: TokenGroup,
): PropSpec {
  return { key, control, label, group: "Styling", part, tokenGroup };
}

export function cardPart(): PropSpec[] {
  return [
    partStyle("card", "cardBackground", "Card: background", "color", "color"),
    partStyle("card", "cardBorderColor", "Card: border", "color", "color"),
    partStyle("card", "cardRadius", "Card: radius", "scale", "radius"),
    partStyle("card", "cardShadow", "Card: shadow", "scale", "shadow"),
    partStyle("card", "cardPadding", "Card: padding", "scale", "space"),
  ];
}

export function buttonPart(): PropSpec[] {
  return [
    partStyle("button", "buttonBackground", "Button: background", "color", "color"),
    partStyle("button", "buttonTextColor", "Button: text color", "color", "color"),
    partStyle("button", "buttonBorderColor", "Button: border", "color", "color"),
    partStyle("button", "buttonRadius", "Button: radius", "scale", "radius"),
  ];
}

export function headingPart(): PropSpec[] {
  return [
    partStyle("heading", "headingTextColor", "Heading: text color", "color", "color"),
    partStyle("heading", "headingSize", "Heading: size", "scale", "type"),
  ];
}

export function mediaPart(): PropSpec[] {
  return [
    partStyle("media", "mediaRadius", "Media: radius", "scale", "radius"),
    partStyle("media", "mediaShadow", "Media: shadow", "scale", "shadow"),
  ];
}

export function linkPart(): PropSpec[] {
  return [
    partStyle("link", "linkTextColor", "Link: text color", "color", "color"),
  ];
}

export function buttonsProp(
  key = "buttons",
  label = "Buttons",
): PropSpec {
  return {
    key,
    control: "list",
    label,
    group: "Actions",
    schema: Type.Array(
      Type.Object({
        label: Type.String({ minLength: 1 }),
        link: LinkValueSchema,
      }),
    ),
  };
}

export function linkProp(key: string, label: string, group = "Content"): PropSpec {
  return { key, control: "link", label, group, schema: LinkValueSchema };
}

export function assetProp(key: string, label: string, group = "Content"): PropSpec {
  return {
    key,
    control: "asset",
    label,
    group,
    schema: AssetRefValueSchema,
  };
}

export function textProp(
  key: string,
  label: string,
  group = "Content",
  minLength = 0,
): PropSpec {
  return {
    key,
    control: "text",
    label,
    group,
    schema:
      minLength > 0 ? Type.String({ minLength }) : Type.String(),
  };
}
