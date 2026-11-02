// CMS-Sammlungen und -Eintraege des Unframer-MCP in ein Senify-taugliches
// Abbild (ADR-0028, Block 4). Gelesen werden die Antworten von
// `getCMSCollections` und `getCMSItems`. Die Feld-Typen sind die des MCP
// (string, number, boolean, color, date, image, link, formattedText, file,
// enum, collectionReference, multiCollectionReference).
//
// Gemessen am 02.11.2026 gegen ein echtes Projekt (MCP 1.8.0):
// - getCMSCollections stellt seinem JSON einen Markdown-Vorspann voran; der
//   Parser nimmt das letzte vollstaendige JSON der Antwort.
// - getCMSItems liefert reines JSON ({ message, pagination, items }). Jeder
//   Eintrag traegt `fieldData` als Objekt von Feld-Id auf { type, value }, und
//   die Antwort nennt die Sammlung nur im Text, nicht als Id. Der Parser ordnet
//   einen Eintrag ueber seine Feld-Ids genau einer Sammlung des Abzugs zu.
// - getCMSCollections nennt keine Zahl der Eintraege; `sourceItems` bleibt
//   dann 0, und der Bericht kann das Zuruecklassen nicht beziffern.

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
  // The field id of the source, kept for matching entry values: an item names
  // its fields by the Framer id, the key or the label.
  framerId: string | null;
};

export type CmsCollectionPlan = {
  framerId: string | null;
  name: string;
  slug: string;
  fields: CmsFieldPlan[];
  // Fields the parser already refused (a type Senify does not know). They are
  // not part of `fields`, but the engine's report counts them as dropped.
  dropped: number;
  // How many entries the collections answer says the collection holds. The
  // parser does not read them; the engine uses the number to say when a run
  // leaves them behind (no getCMSItems answer supplied).
  sourceItems: number;
};

export type CmsFinding = {
  kind:
    | "cms-field-type"
    | "cms-items-not-imported"
    | "cms-item-collection-unknown"
    | "cms-item-field-unknown"
    | "cms-item-value";
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

// The MCP answers are text blocks, not always bare documents: the measured
// getCMSCollections answer starts with a usage note and ends with its JSON. The
// payload is the last JSON value of the text: scan back from its closing
// bracket to the matching opening one (braces inside strings do not count) and
// parse that slice. A search over every line-start brace would retry the whole
// answer per nested object; this stays linear.
function jsonFromText(
  text: string,
  error: (evidence: string) => SenifyError,
): unknown {
  const tryParse = (candidate: string): { ok: true; value: unknown } | { ok: false } => {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      return { ok: false };
    }
  };
  const direct = tryParse(text);
  if (direct.ok) return direct.value;

  let end = -1;
  for (let index = text.length - 1; index >= 0; index -= 1) {
    const char = text.charAt(index);
    if (char === "}" || char === "]") {
      end = index;
      break;
    }
  }
  if (end >= 0) {
    let depth = 0;
    let inString = false;
    for (let index = end; index >= 0; index -= 1) {
      const char = text.charAt(index);
      if (inString) {
        if (char === '"' && !isEscaped(text, index)) inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === "}" || char === "]") {
        depth += 1;
        continue;
      }
      if (char !== "{" && char !== "[") continue;
      depth -= 1;
      if (depth !== 0) continue;
      const parsed = tryParse(text.slice(index, end + 1));
      if (parsed.ok) return parsed.value;
      break;
    }
  }
  throw error(text.slice(0, 120));
}

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text.charAt(cursor) === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

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
      framerId: field.id,
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
    const parsed = jsonFromText(trimmed, (evidence) =>
      cmsError(
        "Die CMS-Antwort ist weder XML noch JSON",
        evidence,
        "Die Antwort unveraendert liefern; ein gekuerzter Abzug ist nicht lesbar.",
      ),
    );
    raw = collectionsFromJson(parsed).map((value, index) =>
      rawCollectionOf(value, `collections[${index}]`),
    );
  }

  const findings: CmsFinding[] = [];
  const slugs = new Set<string>();
  const collections: CmsCollectionPlan[] = [];
  for (const collection of raw) {
    const planned = planFields(collection, findings);
    collections.push({
      framerId: collection.id,
      name: collection.name,
      slug: unique(slugOf(collection.name, "sammlung"), slugs),
      fields: planned.fields,
      dropped: planned.dropped,
      sourceItems: collection.items,
    });
  }
  return { collections, findings };
}

/* ------------------------------------------------------------------ items */

// The entries of one answer, per field. The value kinds are the semantic ones
// the engine maps to Senify cells: it alone knows the field type the site
// actually holds, and "text" may become a date, a URL or a select there.
export type CmsItemCell =
  | { kind: "text"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "select"; value: string }
  | { kind: "media"; url: string; alt: string | null }
  | { kind: "mediaList"; items: { url: string; alt: string | null }[] }
  | { kind: "relation"; target: string }
  | { kind: "relationList"; targets: string[] };

export type CmsItemPlan = {
  collectionSlug: string;
  // The item id of the source: a relation names its target by it, and the
  // engine resolves it to the id the entry gets in this run.
  framerId: string | null;
  // An explicit slug, or null: without one the engine derives it from the
  // title - the same rule `createEntry` follows.
  slug: string | null;
  // Keyed by the field KEY of the collection plan.
  cells: Record<string, CmsItemCell>;
  dropped: number;
};

export type CmsItemsPlan = {
  items: CmsItemPlan[];
  findings: CmsFinding[];
};

type RawItem = {
  id: string | null;
  // Named on the item itself (a hand-written answer may do so).
  collection: string | null;
  // Named once for the whole answer ("… items from collection \"Articles\"").
  answerCollection: string | null;
  slug: string | null;
  // [name, value] pairs in source order. A repeated name is a list.
  fields: [string, unknown][];
};

function itemsError(message: string, evidence: string, suggestion: string): SenifyError {
  return new SenifyError(
    "validation",
    evidence === "" ? message : `${message}: ${evidence}`,
    { field: "source.project.cms.items", suggestion },
  );
}

// getCMSItems wraps every value as { type: "image", value: "https://…" }: the
// type repeats the schema, the value is what counts. A plain value passes
// through, so the documented upsert shape and hand-written answers both read.
function unwrapTyped(value: unknown): unknown {
  if (isRecord(value) && typeof value.type === "string" && "value" in value) {
    return value.value;
  }
  return value;
}

function pairsOf(value: Record<string, unknown>): [string, unknown][] {
  const source =
    value.fieldData ?? value.fields ?? value.cells ?? value.values ?? value.fieldValues;
  if (Array.isArray(source)) {
    const pairs: [string, unknown][] = [];
    for (const entry of source) {
      if (!isRecord(entry)) continue;
      const name =
        textOf(entry.field) ?? textOf(entry.fieldId) ?? textOf(entry.name) ?? textOf(entry.id);
      if (name === null) continue;
      pairs.push([name, unwrapTyped(entry.value)]);
    }
    return pairs;
  }
  if (isRecord(source)) {
    return Object.entries(source).map(([name, entry]) => [name, unwrapTyped(entry)]);
  }
  // No field container is an item without content, not a broken document: the
  // report counts it, the run keeps going.
  return [];
}

function rawItemOf(
  value: unknown,
  where: string,
  answerCollection: string | null,
): RawItem {
  if (!isRecord(value)) {
    throw itemsError(
      "Ein Eintrag ist kein Objekt",
      where,
      "Den Abzug erneut aus dem Unframer-MCP lesen (getCMSItems).",
    );
  }
  return {
    id: textOf(value.id),
    collection:
      textOf(value.collectionId) ??
      textOf(value.collection) ??
      textOf(value.collectionSlug) ??
      textOf(value.collectionName),
    answerCollection,
    slug: textOf(value.slug) ?? textOf(value.path),
    fields: pairsOf(value),
  };
}

// The answer names the requested collection in its message ("Retrieved 7 of 7
// item(s) from collection \"Articles\""), but not its id. The hint only serves
// items whose field ids match no schema; normally the ids decide.
function answerCollectionOf(value: Record<string, unknown>): string | null {
  const named =
    textOf(value.collectionId) ??
    textOf(value.collection) ??
    textOf(value.collectionSlug) ??
    textOf(value.collectionName);
  if (named !== null) return named;
  const match = /collection\s+"([^"]+)"/i.exec(textOf(value.message) ?? "");
  return match?.[1] ?? null;
}

function itemsFromJson(value: unknown): { list: unknown[]; collection: string | null } {
  if (Array.isArray(value)) return { list: value, collection: null };
  if (isRecord(value)) {
    for (const key of ["items", "entries", "records"]) {
      const list = value[key];
      if (Array.isArray(list)) {
        return { list, collection: answerCollectionOf(value) };
      }
    }
    const lists = Object.values(value).filter((entry) => Array.isArray(entry));
    if (lists.length === 1) {
      return { list: lists[0] as unknown[], collection: answerCollectionOf(value) };
    }
  }
  throw itemsError(
    "Die Eintrags-Antwort traegt keine Liste",
    JSON.stringify(value).slice(0, 200),
    "Erwartet wird eine Liste oder ein Objekt mit einer Liste von Eintraegen.",
  );
}

// A repeated <Field name="…"> is a list: Framer reads a gallery as several
// fields of the same name in some tools, as several <Value> children in
// others. Both forms become the same array.
function xmlFieldValue(field: UnframerElement): unknown {
  if (field.attrs.value !== undefined) return field.attrs.value;
  const values = field.children.filter((child) => child.name.toLowerCase() === "value");
  if (values.length > 0) {
    const read = values.map((value) => ({
      ...value.attrs,
      text: value.text.trim() === "" ? undefined : value.text.trim(),
    }));
    return read.length === 1 ? read[0] : read;
  }
  const relations = field.children.filter((child) => child.name.toLowerCase() === "relation");
  if (relations.length > 0) {
    const read = relations.map((relation) => ({ ...relation.attrs }));
    return read.length === 1 ? read[0] : read;
  }
  const text = field.text.trim();
  return text === "" ? undefined : text;
}

function rawItemsFromXml(root: UnframerElement): RawItem[] {
  const name = root.name.toLowerCase();
  if (name !== "items" && name !== "cmsitems") {
    throw itemsError(
      `Das XML beginnt mit <${root.name}>, nicht mit <Items>`,
      `<${root.name}>`,
      "Die Antwort von getCMSItems liefern, nicht die eines anderen Werkzeugs.",
    );
  }
  return root.children
    .filter((child) => child.name.toLowerCase() === "item")
    .map((child) => {
      const fields: [string, unknown][] = [];
      for (const field of child.children) {
        if (field.name.toLowerCase() !== "field") continue;
        const fieldName =
          field.attrs.name ?? field.attrs.key ?? field.attrs.fieldId ?? field.attrs.id;
        if (fieldName === undefined || fieldName.trim() === "") continue;
        const value = xmlFieldValue(field);
        if (value === undefined) continue;
        fields.push([fieldName, value]);
      }
      return {
        id: child.attrs.id ?? null,
        collection:
          child.attrs.collectionId ??
          child.attrs.collection ??
          child.attrs.collectionSlug ??
          child.attrs.collectionName ??
          null,
        answerCollection: null,
        slug: child.attrs.slug ?? null,
        fields,
      };
    });
}

/* ----------------------------------------------------------------- mapping */

function collectionOf(
  collections: readonly CmsCollectionPlan[],
  reference: string,
): CmsCollectionPlan | undefined {
  const byId = collections.find(
    (collection) => collection.framerId !== null && collection.framerId === reference,
  );
  if (byId !== undefined) return byId;
  const slug = slugOf(reference, "sammlung");
  return collections.find(
    (collection) =>
      collection.slug === slug || slugOf(collection.name, "sammlung") === slug,
  );
}

// An item of the measured getCMSItems answer names no collection: the answer is
// per collection. Its field ids are project-wide unique, so the schema that
// knows them is the collection the item belongs to. The name the answer's
// message mentions is the fallback for an item without readable fields.
function collectionOfItem(
  item: RawItem,
  collections: readonly CmsCollectionPlan[],
): CmsCollectionPlan | undefined {
  if (item.collection !== null) return collectionOf(collections, item.collection);
  let best: CmsCollectionPlan | undefined;
  let bestScore = 0;
  for (const collection of collections) {
    const ids = new Set(
      collection.fields
        .map((field) => field.framerId)
        .filter((id): id is string => id !== null),
    );
    const score = item.fields.filter(([name]) => ids.has(name)).length;
    if (score > bestScore) {
      best = collection;
      bestScore = score;
    }
  }
  if (bestScore > 0) return best;
  return item.answerCollection === null
    ? undefined
    : collectionOf(collections, item.answerCollection);
}

function fieldOf(
  collection: CmsCollectionPlan,
  name: string,
): CmsFieldPlan | undefined {
  return collection.fields.find(
    (field) =>
      field.framerId === name ||
      field.key === name ||
      field.key === slugOf(name, "feld") ||
      field.label === name,
  );
}

function textValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function urlValue(value: unknown): { url: string; alt: string | null } | null {
  if (typeof value === "string") {
    return value.trim() === "" ? null : { url: value.trim(), alt: null };
  }
  if (isRecord(value)) {
    const url = textOf(value.url) ?? textOf(value.src) ?? textOf(value.image);
    if (url === null) return null;
    return { url, alt: textOf(value.alt) ?? textOf(value.altText) };
  }
  return null;
}

function targetValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() === "" ? null : value.trim();
  if (isRecord(value)) return textOf(value.id) ?? textOf(value.slug) ?? textOf(value.entryId);
  return null;
}

function optionValue(field: CmsFieldPlan, value: unknown): string | null {
  const text = textValue(value);
  if (text === null) return null;
  const option = (field.options ?? []).find(
    (candidate) => candidate.value === text || candidate.label === text,
  );
  return option?.value ?? null;
}

function itemCellOf(
  field: CmsFieldPlan,
  value: unknown,
  collection: CmsCollectionPlan,
  findings: CmsFinding[],
): CmsItemCell | null {
  const refuse = (reason: string): null => {
    findings.push({
      kind: "cms-item-value",
      message: `Wert von "${field.label}" in "${collection.name}" faellt weg: ${reason}`,
      evidence: `${collection.name}/${field.key}: ${JSON.stringify(value)?.slice(0, 160) ?? "null"}`,
      severity: "warn",
      suggestion:
        "Den Wert in Framer auf die Feldart bringen oder den Eintrag in Senify von Hand anlegen.",
    });
    return null;
  };

  if (field.type === "media") {
    if (Array.isArray(value)) {
      const items: { url: string; alt: string | null }[] = [];
      for (const entry of value) {
        const media = urlValue(entry);
        if (media === null) return refuse("eine Adresse in der Liste ist keine Adresse");
        items.push(media);
      }
      return items.length === 0 ? refuse("die Liste ist leer") : { kind: "mediaList", items };
    }
    const media = urlValue(value);
    return media === null ? refuse("das ist keine Bild- oder Dateiadresse") : { kind: "media", ...media };
  }
  if (field.type === "relation" || field.type === "relationMulti") {
    if (Array.isArray(value)) {
      const targets: string[] = [];
      for (const entry of value) {
        const target = targetValue(entry);
        if (target === null) return refuse("ein Verweis in der Liste nennt kein Ziel");
        targets.push(target);
      }
      return targets.length === 0 ? refuse("die Verweisliste ist leer") : { kind: "relationList", targets };
    }
    const target = targetValue(value);
    if (target === null) return refuse("das ist kein Verweisziel");
    return field.type === "relation"
      ? { kind: "relation", target }
      : { kind: "relationList", targets: [target] };
  }
  if (field.type === "select") {
    const option = optionValue(field, value);
    return option === null ? refuse("der Wert ist keine Option des Felds") : { kind: "select", value: option };
  }
  if (field.type === "number") {
    const number = typeof value === "number" ? value : Number(textValue(value));
    return Number.isFinite(number) ? { kind: "number", value: number } : refuse("das ist keine Zahl");
  }
  if (field.type === "boolean") {
    if (typeof value === "boolean") return { kind: "boolean", value };
    const text = textValue(value)?.toLowerCase();
    if (text === "true" || text === "false") return { kind: "boolean", value: text === "true" };
    return refuse("das ist kein Wahrheitswert");
  }
  const text = textValue(value);
  return text === null ? refuse("das ist kein Text") : { kind: "text", value: text };
}

// Reads the answer of `getCMSItems` (JSON or XML) and maps it against the
// collection plan. Throws when the text is neither, or when the XML root is
// the wrong document; everything else is a finding - an item of an unknown
// collection, a field Senify does not have, a value that does not fit.
export function readCmsItems(
  text: string,
  collections: readonly CmsCollectionPlan[],
): CmsItemsPlan {
  const trimmed = text.trim();
  if (trimmed === "") {
    throw itemsError(
      "Die Eintrags-Antwort ist leer",
      "",
      "getCMSItems im Unframer-MCP aufrufen und die Antwort liefern.",
    );
  }
  let raw: RawItem[];
  if (trimmed.startsWith("<")) {
    raw = rawItemsFromXml(parseUnframerXml(trimmed, "getCMSItems"));
  } else {
    const parsed = jsonFromText(trimmed, (evidence) =>
      itemsError(
        "Die Eintrags-Antwort ist weder XML noch JSON",
        evidence,
        "Die Antwort unveraendert liefern; ein gekuerzter Abzug ist nicht lesbar.",
      ),
    );
    const answer = itemsFromJson(parsed);
    raw = answer.list.map((value, index) =>
      rawItemOf(value, `items[${index}]`, answer.collection),
    );
  }

  const findings: CmsFinding[] = [];
  const items: CmsItemPlan[] = [];
  for (const item of raw) {
    const collection = collectionOfItem(item, collections);
    if (collection === undefined) {
      findings.push({
        kind: "cms-item-collection-unknown",
        message:
          item.collection === null
            ? `Eintrag "${item.id ?? "ohne Id"}" laesst sich keiner Sammlung des Abzugs zuordnen; der Eintrag faellt weg`
            : `Eintrag nennt die Sammlung "${item.collection}", die nicht im Abzug steht; der Eintrag faellt weg`,
        evidence: `${item.id ?? "ohne Id"}: collection=${item.collection ?? "fehlt"}`,
        severity: "warn",
        suggestion:
          "Die Sammlungen aller Eintraege mit in den Abzug nehmen (getCMSCollections) und den Lauf wiederholen.",
      });
      continue;
    }
    const cells: Record<string, CmsItemCell> = {};
    let dropped = 0;
    for (const [name, value] of item.fields) {
      const field = fieldOf(collection, name);
      if (field === undefined) {
        dropped += 1;
        findings.push({
          kind: "cms-item-field-unknown",
          message: `Feld "${name}" gibt es in "${collection.name}" nicht; der Wert faellt weg`,
          evidence: `${collection.name}/${name}`,
          severity: "warn",
          suggestion:
            "Die Sammlung mit ihrem aktuellen Schema erneut lesen (getCMSCollections) und importieren.",
        });
        continue;
      }
      if (cells[field.key] !== undefined) {
        dropped += 1;
        findings.push({
          kind: "cms-item-value",
          message: `Feld "${field.label}" in "${collection.name}" ist im Eintrag doppelt gesetzt; der zweite Wert faellt weg`,
          evidence: `${collection.name}/${field.key}`,
          severity: "warn",
          suggestion: "Je Feld einen Wert im Abzug fuehren.",
        });
        continue;
      }
      const cell = itemCellOf(field, value, collection, findings);
      if (cell === null) {
        dropped += 1;
        continue;
      }
      cells[field.key] = cell;
    }
    items.push({
      collectionSlug: collection.slug,
      framerId: item.id,
      slug: item.slug,
      cells,
      dropped,
    });
  }
  return { items, findings };
}
