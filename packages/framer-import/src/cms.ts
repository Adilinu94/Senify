// CMS-Sammlungen des Unframer-MCP in ein Senify-taugliches Abbild (ADR-0028,
// Block 4). Gelesen wird die Antwort von `getCMSCollections`: Sammlungen mit
// Namen und Felddefinitionen. Die Feld-Typen sind die des MCP (laut seiner
// Format-Doku: string, number, boolean, color, date, image, link,
// formattedText, file, enum, collectionReference, multiCollectionReference).
//
// Ehrliche Grenze: Ein Abzug aus einem Projekt MIT Sammlungen wurde nicht
// gemessen - die beiden Messprojekte hatten keine, das MCP antwortete nur mit
// der Format-Doku. Der Parser nimmt deshalb beide Formen an, die das MCP
// liefern kann (JSON wie die Werkzeug-Beispiele, XML wie die Node-Werkzeuge)
// und macht aus allem anderen einen Fehler, keine stille Leere. Der erste
// echte Lauf ist die Abnahme; die Fixtures folgen der dokumentierten Form.

import { SenifyError } from "@senify/core";
import { parseUnframerXml, type UnframerElement } from "./unframer-ir.ts";

/* ------------------------------------------------------------------ types */

// The Senify field types this mapping can produce. The engine owns the full
// list (`FIELD_TYPES`); a test there asserts every name here exists there.
export type CmsFieldType =
  | "text"
  | "longText"
  | "richtext"
  | "number"
  | "boolean"
  | "date"
  | "select"
  | "url"
  | "media"
  | "relation"
  | "relationMulti";

export type CmsFieldPlan = {
  // Senify needs a stable id and a key per field; the MCP id is kept when it
  // has one, otherwise the key becomes the id.
  id: string;
  key: string;
  label: string;
  type: CmsFieldType;
  required: boolean;
  options?: { value: string; label: string }[];
  // References name the Framer collection; the engine resolves it to the
  // Senify id it assigns in the same import (or drops the field with a fund).
  targetFramerCollectionId?: string;
  mediaKind?: "image" | "video" | "any";
};

export type CmsCollectionPlan = {
  framerId: string | null;
  name: string;
  slug: string;
  fields: CmsFieldPlan[];
  // Fields the parser already refused (a type Senify does not know). They are
  // not part of `fields`, but the engine's report counts them as dropped.
  dropped: number;
};

export type CmsFinding = {
  kind: "cms-field-type" | "cms-items-not-imported";
  message: string;
  evidence: string;
  severity: "warn" | "info";
  suggestion: string;
};

export type CmsPlan = {
  collections: CmsCollectionPlan[];
  findings: CmsFinding[];
};

type RawField = {
  id: string | null;
  name: string;
  type: string;
  required: boolean;
  multiline: boolean;
  collectionId: string | null;
  cases: { value: string; label: string }[];
};

type RawCollection = {
  id: string | null;
  name: string;
  fields: RawField[];
  items: number;
};

/* ------------------------------------------------------------------ helpers */

function cmsError(message: string, evidence: string, suggestion: string): SenifyError {
  return new SenifyError(
    "validation",
    evidence === "" ? message : `${message}: ${evidence}`,
    { field: "source.project.cms.collections", suggestion },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function slugOf(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug === "" ? fallback : slug;
}

function unique(value: string, taken: Set<string>): string {
  if (!taken.has(value)) {
    taken.add(value);
    return value;
  }
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${value}-${suffix}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

function optionsOf(value: unknown): { value: string; label: string }[] {
  if (!Array.isArray(value)) return [];
  const options: { value: string; label: string }[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim() !== "") {
      options.push({ value: slugOf(entry, "option"), label: entry.trim() });
    } else if (isRecord(entry)) {
      const label = textOf(entry.name) ?? textOf(entry.label) ?? textOf(entry.value);
      if (label === null) continue;
      const id = textOf(entry.id) ?? textOf(entry.value) ?? slugOf(label, "option");
      options.push({ value: id, label });
    }
  }
  return options;
}

function rawFieldOf(value: unknown, where: string): RawField | null {
  if (!isRecord(value)) {
    throw cmsError(
      "Ein Feld ist kein Objekt",
      where,
      "Den Abzug erneut aus dem Unframer-MCP lesen (getCMSCollections).",
    );
  }
  const name = textOf(value.name) ?? textOf(value.label);
  const type = textOf(value.type);
  if (name === null || type === null) {
    throw cmsError(
      `Feld ohne Namen oder Typ (${where})`,
      JSON.stringify(value).slice(0, 200),
      "Den Abzug erneut lesen; ein Feld ohne Typ ist nicht abbildbar.",
    );
  }
  const cases = optionsOf(value.cases ?? value.options);
  return {
    id: textOf(value.id),
    name,
    type,
    required: value.required === true,
    multiline: value.multiline === true,
    collectionId:
      textOf(value.collectionId) ?? textOf(value.collection) ?? textOf(value.targetCollectionId),
    cases,
  };
}

function rawCollectionOf(value: unknown, where: string): RawCollection {
  if (!isRecord(value)) {
    throw cmsError(
      "Eine Sammlung ist kein Objekt",
      where,
      "Den Abzug erneut aus dem Unframer-MCP lesen (getCMSCollections).",
    );
  }
  const name = textOf(value.name);
  if (name === null) {
    throw cmsError(
      "Sammlung ohne Namen",
      where,
      "Der Name ist der Anker der Abbildung; ohne ihn wird nichts angelegt.",
    );
  }
  const fieldValue = value.fields;
  if (fieldValue !== undefined && !Array.isArray(fieldValue)) {
    throw cmsError(
      `Die Felder von "${name}" sind keine Liste`,
      where,
      "Den Abzug erneut aus dem Unframer-MCP lesen (getCMSCollections).",
    );
  }
  const fields = (Array.isArray(fieldValue) ? fieldValue : []).map((field, index) =>
    rawFieldOf(field, `${name}/fields[${index}]`),
  );
  const itemValue = value.items ?? value.entries ?? value.records;
  return {
    id: textOf(value.id),
    name,
    fields: fields.filter((field): field is RawField => field !== null),
    items: Array.isArray(itemValue) ? itemValue.length : 0,
  };
}

/* ------------------------------------------------------------------- parser */

function collectionsFromJson(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.collections)) return value.collections;
  // Tolerant gegen einen Umschlag: genau eine Listen-Eigenschaft ist die
  // Sammlungsliste. Alles andere bleibt ein Fehler, keine stille Leere.
  if (isRecord(value)) {
    const lists = Object.values(value).filter((entry) => Array.isArray(entry));
    if (lists.length === 1) return lists[0] as unknown[];
  }
  throw cmsError(
    "Die CMS-Antwort traegt keine Sammlungsliste",
    JSON.stringify(value).slice(0, 200),
    "Erwartet wird eine Liste oder ein Objekt mit einer Liste von Sammlungen.",
  );
}

function collectionsFromXml(root: UnframerElement): unknown[] {
  const name = root.name.toLowerCase();
  if (name !== "collections" && name !== "cmscollections") {
    throw cmsError(
      `Das XML beginnt mit <${root.name}>, nicht mit <Collections>`,
      `<${root.name}>`,
      "Die Antwort von getCMSCollections liefern, nicht die eines anderen Werkzeugs.",
    );
  }
  return root.children
    .filter((child) => child.name.toLowerCase() === "collection")
    .map((child) => {
      const fields = child.children
        .filter((grandchild) => grandchild.name.toLowerCase() === "fields")
        .flatMap((group) => group.children);
      const direct = child.children.filter((grandchild) => grandchild.name.toLowerCase() === "field");
      const itemGroups = child.children.filter(
        (grandchild) => grandchild.name.toLowerCase() === "items",
      );
      const casesOf = (field: UnframerElement) =>
        field.children
          .filter((grandchild) => grandchild.name.toLowerCase() === "cases")
          .flatMap((group) =>
            group.children
              .filter((entry) => entry.name.toLowerCase() === "case")
              .map((entry) => ({ id: entry.attrs.id, name: entry.attrs.name ?? entry.text })),
          );
      return {
        id: child.attrs.id ?? null,
        name: child.attrs.name ?? child.attrs.title ?? "",
        fields: [...fields, ...direct].map((field) => ({
          id: field.attrs.id ?? null,
          name: field.attrs.name ?? field.attrs.label ?? field.text,
          type: field.attrs.type ?? "",
          required: field.attrs.required === "true",
          multiline: field.attrs.multiline === "true",
          collectionId:
            field.attrs.collectionId ?? field.attrs.collection ?? field.attrs.targetCollectionId,
          cases: casesOf(field),
        })),
        items: itemGroups.reduce(
          (sum, group) =>
            sum + group.children.filter((entry) => entry.name.toLowerCase() === "item").length,
          0,
        ),
      };
    });
}

/* ------------------------------------------------------------------ mapping */

const TYPE_MAP: Record<
  string,
  { type: CmsFieldType; mediaKind?: "image" | "video" | "any" }
> = {
  string: { type: "text" },
  text: { type: "text" },
  number: { type: "number" },
  boolean: { type: "boolean" },
  date: { type: "date" },
  color: { type: "text" },
  link: { type: "url" },
  url: { type: "url" },
  formattedtext: { type: "richtext" },
  richtext: { type: "richtext" },
  image: { type: "media", mediaKind: "image" },
  file: { type: "media", mediaKind: "any" },
  enum: { type: "select" },
  collectionreference: { type: "relation" },
  multicollectionreference: { type: "relationMulti" },
};

function planFields(
  collection: RawCollection,
  findings: CmsFinding[],
): { fields: CmsFieldPlan[]; dropped: number } {
  // "title" gehoert dem eingebauten Titelfeld, das jede Senify-Sammlung traegt.
  const taken = new Set<string>(["title"]);
  const ids = new Set<string>(["title"]);
  const fields: CmsFieldPlan[] = [];
  let dropped = 0;
  for (const field of collection.fields) {
    const mapped = TYPE_MAP[field.type.toLowerCase()];
    if (mapped === undefined) {
      dropped += 1;
      findings.push({
        kind: "cms-field-type",
        message: `Feld "${field.name}" hat den Typ "${field.type}", den Senify nicht kennt; das Feld faellt weg`,
        evidence: `${collection.name}/${field.name}: type=${field.type}`,
        severity: "warn",
        suggestion:
          "Das Feld in Framer auf einen dokumentierten Typ aendern oder in Senify von Hand anlegen.",
      });
      continue;
    }
    const key = unique(slugOf(field.name, "feld"), taken);
    const id = unique(field.id ?? key, ids);
    const type = field.type.toLowerCase() === "string" && field.multiline ? "longText" : mapped.type;
    const isEnum = field.type.toLowerCase() === "enum";
    fields.push({
      id,
      key,
      label: field.name,
      type,
      required: field.required,
      ...(isEnum && field.cases.length > 0 ? { options: field.cases } : {}),
      ...(mapped.mediaKind === undefined ? {} : { mediaKind: mapped.mediaKind }),
      ...(field.collectionId === null
        ? {}
        : { targetFramerCollectionId: field.collectionId }),
    });
  }
  return { fields, dropped };
}

// Reads the MCP answer (JSON or XML) and maps it. Throws when the text is
// neither, when a collection has no name, or when the XML root is the wrong
// document - a half-read CMS is worse than a refused one.
export function readCmsCollections(text: string): CmsPlan {
  const trimmed = text.trim();
  if (trimmed === "") {
    throw cmsError(
      "Die CMS-Antwort ist leer",
      "",
      "getCMSCollections im Unframer-MCP aufrufen und die Antwort liefern.",
    );
  }
  let raw: RawCollection[];
  if (trimmed.startsWith("<")) {
    raw = collectionsFromXml(parseUnframerXml(trimmed, "getCMSCollections")).map((value, index) =>
      rawCollectionOf(value, `collections[${index}]`),
    );
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw cmsError(
        "Die CMS-Antwort ist weder XML noch JSON",
        trimmed.slice(0, 120),
        "Die Antwort unveraendert liefern; ein gekuerzter Abzug ist nicht lesbar.",
      );
    }
    raw = collectionsFromJson(parsed).map((value, index) =>
      rawCollectionOf(value, `collections[${index}]`),
    );
  }

  const findings: CmsFinding[] = [];
  const slugs = new Set<string>();
  const collections: CmsCollectionPlan[] = [];
  for (const collection of raw) {
    if (collection.items > 0) {
      findings.push({
        kind: "cms-items-not-imported",
        message: `"${collection.name}" traegt ${collection.items} Eintraege; Eintraege werden in diesem Schritt nicht uebernommen`,
        evidence: `${collection.name}: items=${collection.items}`,
        severity: "info",
        suggestion:
          "Nur die Sammlung samt Feldern anlegen; Eintraege kommen mit getCMSItems in einem eigenen Schritt.",
      });
    }
    const planned = planFields(collection, findings);
    collections.push({
      framerId: collection.id,
      name: collection.name,
      slug: unique(slugOf(collection.name, "sammlung"), slugs),
      fields: planned.fields,
      dropped: planned.dropped,
    });
  }
  return { collections, findings };
}
