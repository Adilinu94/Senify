import { Type } from "@sinclair/typebox";
import type { SectionDefinition } from "@senify/section-sdk";
import { buttonPart, headingPart, introProp, linkProp, sectionStyleProps, sectionTitleProp, textProp, thumbs } from "../shared.ts";

const FORM_FIELD_KINDS = [
  "text",
  "email",
  "phone",
  "textarea",
  "select",
  "radios",
  "checkbox",
  "date",
  "number",
] as const;

const formFieldSchema = Type.Object({
  kind: Type.Union(FORM_FIELD_KINDS.map((kind) => Type.Literal(kind))),
  key: Type.Optional(Type.String({ pattern: "^[a-z0-9-]+$", maxLength: 48 })),
  label: Type.String({ minLength: 1 }),
  required: Type.Optional(Type.Boolean()),
  placeholder: Type.Optional(Type.String()),
  options: Type.Optional(
    Type.Array(
      Type.Object({
        value: Type.String({ minLength: 1 }),
        label: Type.String({ minLength: 1 }),
      }),
    ),
  ),
  validation: Type.Optional(
    Type.Object({
      pattern: Type.Optional(Type.String()),
      min: Type.Optional(Type.Number()),
      max: Type.Optional(Type.Number()),
    }),
  ),
});

export const contactSection: SectionDefinition = {
  type: "contact",
  version: 1,
  title: "Contact",
  description:
    "Contact block with direct channels and a native form (field list, consent block, thank-you page). The bake stamps a signed token; submissions become entries of the target collection. Variant 'split' puts info beside the form.",
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
      schema: Type.Array(formFieldSchema),
    },
    textProp("targetCollectionId", "Submission collection", "Form"),
    textProp("consentText", "Consent text", "Form"),
    linkProp("consentPage", "Privacy page", "Form"),
    textProp("successMessage", "Inline success message", "Form"),
    linkProp("successPage", "Thank-you page", "Form"),
    textProp("honeypotKey", "Honeypot field", "Settings"),
    textProp("notifyEmail", "Notification recipient", "Settings"),
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
          { kind: "text", key: "name", label: "Name", required: true },
          { kind: "email", key: "email", label: "E-Mail", required: true },
          {
            kind: "textarea",
            key: "nachricht",
            label: "Ihre Nachricht",
            required: true,
          },
        ],
        consentText:
          "Mit dem Absenden stimmen Sie unserer Datenschutzerklärung zu.",
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
