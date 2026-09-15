import { Type } from "@sinclair/typebox";
import {
  AssetRefValueSchema,
  LinkValueSchema,
  type PropSpec,
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

export function backgroundStyleProp(): PropSpec {
  return {
    key: "background",
    control: "color",
    label: "Background",
    group: "Styling",
  };
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
