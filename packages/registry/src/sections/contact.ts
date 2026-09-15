import { Type } from "@sinclair/typebox";
import type { SectionDefinition } from "@senify/section-sdk";
import { buttonPart, headingPart, introProp, sectionStyleProps, sectionTitleProp, textProp, thumbs } from "../shared.ts";

export const contactSection: SectionDefinition = {
  type: "contact",
  version: 1,
  title: "Contact",
  description:
    "Contact block with direct channels and an optional field list. Form submissions post to an external endpoint in v1 (see newsletter for the pattern). Variant 'split' puts info beside the form.",
  category: "content",
  props: [
    sectionTitleProp(),
    introProp(),
    textProp("email", "Email"),
    textProp("phone", "Phone"),
    textProp("address", "Address"),
    {
      key: "fields",
      control: "list",
      label: "Form fields",
      group: "Form",
      schema: Type.Array(
        Type.Object({
          kind: Type.Union([
            Type.Literal("text"),
            Type.Literal("email"),
            Type.Literal("phone"),
            Type.Literal("textarea"),
            Type.Literal("select"),
            Type.Literal("checkbox"),
          ]),
          label: Type.String({ minLength: 1 }),
          required: Type.Optional(Type.Boolean()),
        }),
      ),
    },
    textProp("note", "Privacy note", "Form"),
  ],
  variants: {
    split: { label: "Split", preset: {} },
    form: { label: "Form", preset: {} },
    info: { label: "Info", preset: {} },
  },
  styleProps: [
    ...sectionStyleProps(),
    ...headingPart(),
    ...buttonPart(),
  ],
  allowedChildren: "none",
  motionPresets: ["fade-up"],
  golden: {
    tree: {
      type: "contact",
      variant: "split",
      props: {
        title: "Kontakt",
        intro: "Schreiben Sie uns — wir antworten persönlich.",
        email: "hallo@musterstudio.de",
        phone: "+49 40 123456",
        fields: [
          { kind: "text", label: "Name", required: true },
          { kind: "email", label: "E-Mail", required: true },
          { kind: "textarea", label: "Ihre Nachricht", required: true },
        ],
        note: "Mit dem Absenden stimmen Sie unserer Datenschutzerklärung zu.",
      },
    },
    thumbnails: thumbs("contact", "split"),
    variantThumbnails: {
      form: thumbs("contact", "form"),
      info: thumbs("contact", "info"),
    },
  },
};
