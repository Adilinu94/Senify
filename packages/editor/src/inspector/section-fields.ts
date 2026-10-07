import type { Choice, PropValue } from "@senify/widget-engine";
import { isPropHidden, type PropSpec, type SectionDefinition } from "@senify/section-sdk";
import type { EditorNode } from "../state/document.ts";
import type { InspectorField, InspectorFieldKind, InspectorGroup } from "./model.ts";

// The Content tab of a section node (hero, features, faq, …).
//
// A section's props are described by the section registry: a key, a control, a
// label and a TypeBox schema. This module turns that description into inspector
// fields, the same way the primitive catalog's controls become fields. Section
// content is not responsive: it is written at the desktop level and carries no
// device dots.
//
// What is covered: text, long text, number, switch, choice, colour, link, a
// list of strings (one per line) and a list of objects (the repeater). What is
// not (yet): images (`asset`), token scales, slots and free JSON — those props
// keep their value, they just have no field.

type Json = {
  type?: string;
  items?: Json;
  properties?: Record<string, Json>;
  required?: string[];
  anyOf?: Json[];
  const?: unknown;
};

// The registry labels are English; the editor speaks German. Known keys get
// their German name, anything else keeps the registry label.
const PROP_LABELS: Record<string, string> = {
  headline: "Überschrift",
  title: "Titel",
  sub: "Unterzeile",
  subline: "Unterzeile",
  subtitle: "Unterzeile",
  intro: "Einleitung",
  eyebrow: "Dachzeile",
  body: "Text",
  text: "Text",
  buttons: "Buttons",
  items: "Einträge",
  label: "Beschriftung",
  link: "Link",
  icon: "Icon",
  name: "Name",
  role: "Rolle",
  quote: "Zitat",
  author: "Autor",
  q: "Frage",
  a: "Antwort",
  question: "Frage",
  answer: "Antwort",
  price: "Preis",
  period: "Zeitraum",
  priceYearly: "Preis pro Jahr",
  features: "Leistungen",
  ctaLabel: "Button-Text",
  ctaLink: "Button-Link",
  highlighted: "Hervorgehoben",
  description: "Beschreibung",
  value: "Wert",
  url: "Adresse",
  email: "E-Mail",
  consentText: "Einwilligungstext",
  columns: "Spalten",
  alt: "Alternativtext",
  caption: "Bildunterschrift",
  year: "Jahr",
  date: "Datum",
  step: "Schritt",
  number: "Zahl",
  suffix: "Zusatz",
  prefix: "Vorsatz",
  fields: "Formularfelder",
  placeholder: "Platzhalter",
  key: "Schlüssel",
  kind: "Art",
};

const GROUP_LABELS: Record<string, string> = {
  Content: "Inhalt",
  Actions: "Aktionen",
  Layout: "Layout",
  Styling: "Gestaltung",
  Settings: "Einstellungen",
  Form: "Formular",
};

// Strings that hold sentences, not a word: they get a multi-line field.
const LONG_TEXT_KEYS = new Set([
  "text",
  "body",
  "a",
  "answer",
  "quote",
  "description",
  "consentText",
  "intro",
]);

export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced === "" ? key : `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`;
}

export function labelForKey(key: string, fallback?: string): string {
  return PROP_LABELS[key] ?? (fallback !== undefined && fallback !== "" ? fallback : humanizeKey(key));
}

// ------------------------------------------------------- value <-> text

function isRecord(value: unknown): value is Record<string, PropValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// A link value as the text a person types: the address, or a marker for a link
// to another page of the site.
export function linkToText(value: PropValue | undefined): string {
  if (!isRecord(value)) return "";
  if (typeof value["url"] === "string") return value["url"];
  if (typeof value["pageId"] === "string") return `seite:${value["pageId"]}`;
  return "";
}

// The text back as a link value. `seite:<id>` stays a page link; everything
// else is an address. An existing "in neuem Tab" flag survives an edit.
export function textToLink(text: string, previous: PropValue | undefined): PropValue {
  const trimmed = text.trim();
  if (trimmed.startsWith("seite:") && trimmed.length > "seite:".length) {
    return { pageId: trimmed.slice("seite:".length) };
  }
  const link: Record<string, PropValue> = { url: trimmed };
  if (isRecord(previous) && previous["newTab"] === true) link["newTab"] = true;
  return link;
}

export function linesToText(value: PropValue | undefined): string {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string").join("\n") : "";
}

export function textToLines(text: string): PropValue {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

// ---------------------------------------------------------------- schemas

function asJson(schema: unknown): Json | undefined {
  return schema !== null && typeof schema === "object" ? (schema as Json) : undefined;
}

function isLinkSchema(schema: Json): boolean {
  if (schema.anyOf === undefined) return false;
  const keys = schema.anyOf.flatMap((branch) => Object.keys(branch.properties ?? {}));
  return keys.includes("url") || keys.includes("pageId");
}

function literalOptions(schema: Json): Choice[] | undefined {
  if (schema.anyOf === undefined || schema.anyOf.length === 0) return undefined;
  const values: string[] = [];
  for (const branch of schema.anyOf) {
    if (typeof branch.const !== "string") return undefined;
    values.push(branch.const);
  }
  return values.map((value) => ({ value, label: humanizeKey(value) }));
}

function blankField(
  key: string,
  label: string,
  kind: InspectorFieldKind,
  value: PropValue | undefined,
): InspectorField {
  return {
    key,
    label,
    kind,
    commit: { kind: "prop" },
    value,
    base: value,
    overridden: false,
    overrideDevices: [],
    responsive: false,
    hidden: false,
    min: undefined,
    max: undefined,
    step: undefined,
    units: undefined,
    options: undefined,
    alpha: false,
    linkable: false,
    fields: undefined,
    minItems: undefined,
    maxItems: undefined,
    tokenOptions: undefined,
    tokenRef: null,
    literalWarning: undefined,
    source: "control",
    styleGroup: undefined,
  };
}

// One property of a list entry as a field. Anything the editor has no control
// for (an image, a nested list) is skipped: the entry keeps that value.
function itemField(key: string, schema: Json, required: boolean): InspectorField | undefined {
  const label = labelForKey(key);
  let field: InspectorField | undefined;
  if (schema.type === "string") {
    field = blankField(key, label, LONG_TEXT_KEYS.has(key) ? "textarea" : "text", undefined);
    field.defaultValue = label;
  } else if (schema.type === "boolean") {
    field = blankField(key, label, "switcher", undefined);
    field.defaultValue = false;
  } else if (schema.type === "number" || schema.type === "integer") {
    field = blankField(key, label, "number", undefined);
    field.defaultValue = 0;
  } else if (isLinkSchema(schema)) {
    field = blankField(key, label, "url", undefined);
    field.shape = "link";
    field.defaultValue = { url: "/" };
  } else {
    const options = literalOptions(schema);
    if (options !== undefined) {
      field = blankField(key, label, "select", undefined);
      field.options = options;
      field.defaultValue = options[0]?.value ?? "";
    }
  }
  if (field !== undefined) field.required = required;
  return field;
}

function itemFields(schema: Json): InspectorField[] | undefined {
  const items = schema.items;
  if (items === undefined || items.type !== "object" || items.properties === undefined) {
    return undefined;
  }
  const required = new Set(items.required ?? []);
  const fields: InspectorField[] = [];
  for (const [key, property] of Object.entries(items.properties)) {
    const field = itemField(key, property, required.has(key));
    if (field !== undefined) fields.push(field);
  }
  return fields.length === 0 ? undefined : fields;
}

// A new list entry: every required field with a value that passes the schema
// (the label as placeholder text, `false`, the first choice, "/" for a link).
export function newRepeaterItem(fields: readonly InspectorField[]): Record<string, PropValue> {
  const item: Record<string, PropValue> = {};
  for (const field of fields) {
    if (field.required !== true) continue;
    if (field.defaultValue !== undefined) item[field.key] = field.defaultValue;
  }
  return item;
}

// -------------------------------------------------------------- the fields

function fieldFor(spec: PropSpec, node: EditorNode): InspectorField | undefined {
  const value = node.props[spec.key];
  const label = labelForKey(spec.key, spec.label);
  const schema = asJson(spec.schema);
  let field: InspectorField | undefined;
  switch (spec.control) {
    case "text":
      field = blankField(
        spec.key,
        label,
        LONG_TEXT_KEYS.has(spec.key) ? "textarea" : "text",
        value,
      );
      break;
    case "richtext":
      field = blankField(spec.key, label, "textarea", value);
      break;
    case "number":
      field = blankField(spec.key, label, "number", value);
      field.min = spec.min;
      field.max = spec.max;
      field.step = spec.step;
      break;
    case "boolean":
      field = blankField(spec.key, label, "switcher", value);
      break;
    case "enum":
      field = blankField(spec.key, label, "select", value);
      field.options = spec.options?.map((option) => ({ value: option.value, label: option.label }));
      break;
    case "color":
      field = blankField(spec.key, label, "color", value);
      break;
    case "link":
      field = blankField(spec.key, label, "url", value);
      field.shape = "link";
      break;
    case "list": {
      if (schema === undefined) break;
      const children = itemFields(schema);
      if (children !== undefined) {
        field = blankField(spec.key, label, "repeater", value);
        field.fields = children;
        break;
      }
      if (schema.items?.type === "string") {
        field = blankField(spec.key, label, "textarea", value);
        field.shape = "lines";
      }
      break;
    }
    default:
      break;
  }
  if (field === undefined) return undefined;
  field.hidden = isPropHidden(spec.hidden, node.props as Record<string, PropValue>);
  return field;
}

// The groups of the Content tab: the registry's own grouping (Content, Actions,
// Layout, …) in the order the section declares it. The first group carries the
// section's name like the primitives' main group does.
export function sectionContentGroups(
  section: SectionDefinition,
  node: EditorNode,
  title: string,
  attach: (field: InspectorField) => void,
): InspectorGroup[] {
  const groups = new Map<string, InspectorGroup>();
  for (const spec of section.props) {
    const field = fieldFor(spec, node);
    if (field === undefined) continue;
    attach(field);
    const name = spec.group ?? "Content";
    let group = groups.get(name);
    if (group === undefined) {
      const first = groups.size === 0;
      group = {
        id: first ? "content/main" : `content/${name.toLowerCase()}`,
        label: first ? title : (GROUP_LABELS[name] ?? name),
        fields: [],
      };
      groups.set(name, group);
    }
    group.fields.push(field);
  }
  return [...groups.values()];
}
