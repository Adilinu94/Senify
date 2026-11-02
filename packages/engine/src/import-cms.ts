// CMS-Sammlungen aus dem Unframer-Abzug in den Senify-Plan (ADR-0028,
// Block 4). Der Parser liegt im framer-import-Paket (er kennt das MCP-Format);
// hier bekommt der Plan, was nur die Engine weiß: Senify-Ids, das eingebaute
// Titelfeld, die Auflösung von Verweisen auf andere Sammlungen und den
// Abgleich mit dem, was auf der Site schon liegt.
//
// Die Grenze bleibt dieselbe wie beim Parser: Einträge werden nicht
// übernommen (der Bericht sagt es je Sammlung), und ein Feld, das Senify nicht
// abbilden kann, fällt mit einem Fund weg statt den Import zu brechen.

import {
  readCmsCollections,
  readCmsItems,
  type CmsCollectionPlan,
  type CmsFieldPlan,
  type CmsFinding,
  type CmsItemCell,
} from "@senify/framer-import";
import { BUILTIN_TITLE_FIELD, buildSearchText, entrySlugValue } from "./content.ts";
import { newEntityId } from "./ids.ts";
import { SUPPORTS_FLAGS, type CellValue, type FieldDef, type MediaRef } from "./types.ts";

export type CmsImportFinding = CmsFinding | {
  kind:
    | "cms-reference-missing"
    | "cms-select-empty"
    | "cms-item-field-missing"
    | "cms-item-value"
    | "cms-item-relation-missing"
    | "cms-item-media-failed"
    | "cms-item-media-skipped";
  message: string;
  evidence: string;
  severity: "warn";
  suggestion: string;
};

export type PreparedCmsCollection = {
  id: string;
  name: string;
  slug: string;
  // Includes the builtin title field: the row is written as-is.
  fields: FieldDef[];
  titleField: string;
  supports: typeof SUPPORTS_FLAGS[number][];
  listColumns: string[];
};

export type CmsImportReport = {
  collections: {
    name: string;
    slug: string;
    fields: number;
    // `create` writes the collection in this run; `existing` leaves the
    // collection the site already has under this slug untouched.
    outcome: "create" | "existing";
  }[];
  // The mapping result over the whole answer: how many fields Senify can
  // carry, and how many it cannot (a schema gap, not lost data).
  fields: { mapped: number; dropped: number };
};

export type CmsImportPlan = {
  report: CmsImportReport;
  findings: CmsImportFinding[];
  collections: PreparedCmsCollection[];
  // The parsed answer the plan came from: the entry mapper reads the source
  // field order and the Framer ids from it.
  source: readonly CmsCollectionPlan[];
};

function dropField(
  findings: CmsImportFinding[],
  kind: "cms-reference-missing" | "cms-select-empty",
  collection: string,
  field: CmsFieldPlan,
  reason: string,
  suggestion: string,
): void {
  findings.push({
    kind,
    message: `Feld "${field.label}" in "${collection}" faellt weg: ${reason}`,
    evidence: `${collection}/${field.key}: ${field.targetFramerCollectionId ?? "ohne Ziel"}`,
    severity: "warn",
    suggestion,
  });
}

// One field def, or a fund when Senify cannot hold it. "Dropping with a
// finding" is the same rule the type mapper follows: an import that silently
// thins out a schema is worse than one that says what it left behind.
function fieldOf(
  plan: CmsFieldPlan,
  collectionName: string,
  targets: ReadonlyMap<string, string>,
  findings: CmsImportFinding[],
): FieldDef | null {
  if (plan.type === "select" && (plan.options === undefined || plan.options.length === 0)) {
    dropField(
      findings,
      "cms-select-empty",
      collectionName,
      plan,
      "eine Auswahl ohne Optionen laesst sich nicht anlegen",
      "In Framer mindestens eine Option am Enum-Feld pflegen und erneut importieren.",
    );
    return null;
  }
  let targetCollections: string[] | undefined;
  if (plan.type === "relation" || plan.type === "relationMulti") {
    const framerTarget = plan.targetFramerCollectionId;
    const target = framerTarget === undefined ? undefined : targets.get(framerTarget);
    if (target === undefined) {
      dropField(
        findings,
        "cms-reference-missing",
        collectionName,
        plan,
        framerTarget === undefined
          ? "das Feld nennt keine Zielsammlung"
          : "die Zielsammlung ist nicht Teil des Abzugs",
        "Die Zielsammlung mit in den Abzug nehmen (getCMSCollections liefert alle Sammlungen).",
      );
      return null;
    }
    targetCollections = [target];
  }
  return {
    id: plan.id,
    key: plan.key,
    label: plan.label,
    type: plan.type,
    description: "Aus dem Framer-Projekt übernommen.",
    required: plan.required,
    ...(plan.options === undefined ? {} : { options: plan.options }),
    ...(targetCollections === undefined ? {} : { targetCollections }),
    ...(plan.mediaKind === undefined ? {} : { mediaKind: plan.mediaKind }),
  };
}

export function prepareCmsImport(input: {
  text: string;
  // The site's collections as they are: `createCollection` would reject a
  // duplicate slug, and a re-import must not stack a second copy.
  existing: readonly { id: string; slug: string }[];
}): CmsImportPlan {
  const parsed = readCmsCollections(input.text);
  const findings: CmsImportFinding[] = [...parsed.findings];
  const existingBySlug = new Map(input.existing.map((collection) => [collection.slug, collection.id]));

  // Every collection first, because a relation may point forward.
  const resolved = parsed.collections.map((collection) => {
    const existingId = existingBySlug.get(collection.slug);
    return {
      plan: collection,
      id: existingId ?? newEntityId(),
      outcome: existingId === undefined ? ("create" as const) : ("existing" as const),
    };
  });
  const byFramerId = new Map<string, string>();
  for (const entry of resolved) {
    if (entry.plan.framerId !== null) byFramerId.set(entry.plan.framerId, entry.id);
  }

  const collections: PreparedCmsCollection[] = [];
  const report: CmsImportReport = { collections: [], fields: { mapped: 0, dropped: 0 } };
  for (const entry of resolved) {
    // Mapped for every collection, written only for the new ones: the report
    // stays a statement about the source schema, and an existing collection
    // keeps whatever it already holds.
    const mapped: FieldDef[] = [];
    for (const field of entry.plan.fields) {
      const mappedField = fieldOf(field, entry.plan.name, byFramerId, findings);
      if (mappedField !== null) mapped.push(mappedField);
    }
    report.collections.push({
      name: entry.plan.name,
      slug: entry.plan.slug,
      fields: mapped.length,
      outcome: entry.outcome,
    });
    report.fields.mapped += mapped.length;
    // What this stage drops plus what the parser already refused (an unknown
    // type never reaches this map): the report is a statement about the source.
    report.fields.dropped += entry.plan.dropped + (entry.plan.fields.length - mapped.length);
    if (entry.outcome === "existing") continue;
    collections.push({
      id: entry.id,
      name: entry.plan.name,
      slug: entry.plan.slug,
      fields: [BUILTIN_TITLE_FIELD, ...mapped],
      titleField: BUILTIN_TITLE_FIELD.id,
      supports: [...SUPPORTS_FLAGS],
      listColumns: [],
    });
  }
  return { report, findings, collections, source: parsed.collections };
}

/* -------------------------------------------------------------- entries */

export type CmsEntryTarget = {
  id: string;
  slug: string;
  fields: FieldDef[];
  titleField: string;
};

export type PreparedCmsEntry = {
  id: string;
  collectionId: string;
  slug: string;
  cells: Record<string, CellValue>;
  searchText: string;
};

export type CmsEntryReport = {
  // Items of the answer after the parser (a collection it could not resolve is
  // counted in `dropped`).
  planned: number;
  // Written by this run. 0 in a dry run: the report says what would happen.
  imported: number;
  // Left alone because the collection already holds an entry with this slug.
  existing: number;
  // Source items that never became an entry (unknown collection).
  dropped: number;
};

export type CmsMediaReport = {
  // Media values in the answer.
  planned: number;
  downloaded: number;
  failed: number;
  // Values left out because the request skipped assets.
  skipped: number;
};

// How the run treats the media of an entry: `plan` counts only (dry run),
// `skip` writes the entry without its media, `upload` carries the bytes
// through the media pipeline.
export type CmsEntryMedia =
  | { mode: "plan" }
  | { mode: "skip" }
  | {
      mode: "upload";
      import: (media: { url: string; alt: string | null }) => Promise<{ assetId: string } | null>;
    };

export type CmsEntriesPlan = {
  report: CmsEntryReport;
  media: CmsMediaReport;
  findings: CmsImportFinding[];
  entries: PreparedCmsEntry[];
};

const TEXTUAL_FIELD_TYPES = new Set<FieldDef["type"]>([
  "text",
  "longText",
  "richtext",
  "date",
  "dateTime",
  "url",
  "email",
]);

// Derives the entry slug the way `createEntry` does: an explicit source slug
// wins, otherwise the title, and without either the id keeps it unique.
function slugFor(item: { slug: string | null }, title: string, id: string): string {
  if (item.slug !== null) return entrySlugValue(item.slug);
  return entrySlugValue(title.trim() === "" ? id : title);
}

// Reads the answer of `getCMSItems` and maps it against what the site will
// hold after the commit. Unlike the collection schema, an entry is content:
// a value Senify cannot hold falls away with a finding, but it never refuses
// the import. A slug the target collection already has stays untouched - the
// duplicate rule of the collections repeats per entry.
export async function prepareCmsEntries(input: {
  // One getCMSItems answer per collection: the MCP is asked per collection and
  // the answers together are one content picture (a relation may point into
  // the answer of another collection).
  texts: readonly string[];
  // The collections answer the items answers belong to.
  source: readonly CmsCollectionPlan[];
  // The target collections: new ones of this run and the site's existing ones.
  targets: readonly CmsEntryTarget[];
  // The slugs the target collections already hold.
  existingEntries: readonly { id: string; collectionId: string; slug: string }[];
  media: CmsEntryMedia;
}): Promise<CmsEntriesPlan> {
  const answers = input.texts.map((text) => readCmsItems(text, input.source));
  const parsedItems = answers.flatMap((answer) => answer.items);
  const parsedFindings = answers.flatMap((answer) => answer.findings);
  const findings: CmsImportFinding[] = [...parsedFindings];
  const report: CmsEntryReport = {
    planned: parsedItems.length,
    imported: 0,
    existing: 0,
    dropped: parsedFindings.filter((finding) => finding.kind === "cms-item-collection-unknown").length,
  };
  const mediaReport: CmsMediaReport = { planned: 0, downloaded: 0, failed: 0, skipped: 0 };

  const targetBySlug = new Map(input.targets.map((target) => [target.slug, target]));
  const sourceBySlug = new Map(input.source.map((collection) => [collection.slug, collection]));

  // Every target and source collection first: an entry may refer forward.
  const entryIds = new Map(parsedItems.map((item) => [item, newEntityId()]));
  const answerById = new Map<string, { id: string; collectionId: string }>();
  const answerBySlug = new Map<string, { id: string; collectionId: string }[]>();
  for (const item of parsedItems) {
    const target = targetBySlug.get(item.collectionSlug);
    if (target === undefined) continue;
    const entry = { id: entryIds.get(item) as string, collectionId: target.id };
    if (item.framerId !== null) answerById.set(item.framerId, entry);
    if (item.slug !== null) {
      const list = answerBySlug.get(item.slug) ?? [];
      list.push(entry);
      answerBySlug.set(item.slug, list);
    }
  }
  const existingBySlug = new Map<string, { id: string; collectionId: string }[]>();
  for (const entry of input.existingEntries) {
    const list = existingBySlug.get(entry.slug) ?? [];
    list.push({ id: entry.id, collectionId: entry.collectionId });
    existingBySlug.set(entry.slug, list);
  }
  const existingKeys = new Set(
    input.existingEntries.map((entry) => `${entry.collectionId}/${entry.slug}`),
  );
  const taken: string[] = [...existingKeys];

  function resolveTarget(
    target: string,
    allowed: ReadonlySet<string>,
  ): { id: string; collectionId: string } | null {
    const fromAnswer = answerById.get(target);
    if (fromAnswer !== undefined) {
      return allowed.has(fromAnswer.collectionId) ? fromAnswer : null;
    }
    for (const candidate of answerBySlug.get(target) ?? []) {
      if (allowed.has(candidate.collectionId)) return candidate;
    }
    for (const candidate of existingBySlug.get(target) ?? []) {
      if (allowed.has(candidate.collectionId)) return candidate;
    }
    return null;
  }

  const entries: PreparedCmsEntry[] = [];
  for (const item of parsedItems) {
    const target = targetBySlug.get(item.collectionSlug);
    const collection = sourceBySlug.get(item.collectionSlug);
    if (target === undefined || collection === undefined) {
      report.dropped += 1;
      findings.push({
        kind: "cms-item-collection-unknown",
        message: `Eintrag "${item.framerId ?? item.slug ?? "ohne Id"}" nennt die Sammlung "${item.collectionSlug}", die in diesem Lauf nicht angelegt wird; der Eintrag faellt weg`,
        evidence: `${item.collectionSlug}: ${item.framerId ?? "ohne Id"}`,
        severity: "warn",
        suggestion: "Die Sammlung mit in den Abzug nehmen und erneut importieren.",
      });
      continue;
    }
    const id = entryIds.get(item) as string;
    const fieldsByKey = new Map(target.fields.map((field) => [field.key, field]));
    const cells: Record<string, CellValue> = {};

    const refuse = (
      kind: "cms-item-value" | "cms-item-relation-missing" | "cms-item-media-failed" | "cms-item-media-skipped",
      field: FieldDef,
      reason: string,
      suggestion: string,
    ): null => {
      findings.push({
        kind,
        message: `Wert von "${field.label}" in "${collection.name}" (${item.slug ?? item.framerId ?? "ohne Slug"}) faellt weg: ${reason}`,
        evidence: `${collection.name}/${field.key}`,
        severity: "warn",
        suggestion,
      });
      return null;
    };

    // Media goes through the caller's importer so download failures and a
    // skipped asset run stay visible instead of leaving a silent gap.
    async function mediaRefOf(media: { url: string; alt: string | null }): Promise<
      { kind: "mapped"; ref: MediaRef } | { kind: "planned" } | { kind: "failed" } | { kind: "skipped" }
    > {
      if (input.media.mode === "plan") return { kind: "planned" };
      if (input.media.mode === "skip") {
        mediaReport.skipped += 1;
        return { kind: "skipped" };
      }
      const result = await input.media.import(media);
      if (result === null) {
        mediaReport.failed += 1;
        return { kind: "failed" };
      }
      mediaReport.downloaded += 1;
      return { kind: "mapped", ref: { assetId: result.assetId } };
    }

    async function valueOf(field: FieldDef, cell: CmsItemCell): Promise<CellValue | null> {
      switch (field.type) {
        case "text":
        case "longText":
        case "richtext":
        case "url":
        case "email": {
          if (cell.kind === "text") return cell.value;
          if (cell.kind === "number") return String(cell.value);
          return refuse(
            "cms-item-value",
            field,
            `die Feldart "${field.type}" braucht Text`,
            "Den Wert in Framer auf Text stellen oder den Eintrag von Hand anlegen.",
          );
        }
        case "date": {
          if (cell.kind !== "text") {
            return refuse(
              "cms-item-value",
              field,
              "die Feldart \"date\" braucht ein Datum",
              "Den Wert in Framer auf ein Datum stellen.",
            );
          }
          // Framer sends full ISO timestamps for a date field; Senify's date
          // cell is the day only (the pattern lives in content.ts).
          const date = /^(\d{4}-\d{2}-\d{2})/.exec(cell.value.trim())?.[1];
          return date ?? refuse(
            "cms-item-value",
            field,
            `"${cell.value}" ist kein Datum (JJJJ-MM-TT)`,
            "Den Wert in Framer auf ein Datum stellen.",
          );
        }
        case "dateTime": {
          if (cell.kind !== "text") {
            return refuse(
              "cms-item-value",
              field,
              "die Feldart \"dateTime\" braucht einen Zeitpunkt",
              "Den Wert in Framer auf einen Zeitpunkt stellen.",
            );
          }
          const value = cell.value.trim();
          return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)
            ? value
            : refuse(
                "cms-item-value",
                field,
                `"${value}" ist kein Zeitpunkt (JJJJ-MM-TTTHH:MM)`,
                "Den Wert in Framer auf einen Zeitpunkt stellen.",
              );
        }
        case "number": {
          if (cell.kind === "number") return cell.value;
          if (cell.kind === "text" && Number.isFinite(Number(cell.value))) return Number(cell.value);
          return refuse(
            "cms-item-value",
            field,
            "die Feldart \"number\" braucht eine Zahl",
            "Den Wert in Framer auf eine Zahl stellen.",
          );
        }
        case "boolean": {
          if (cell.kind === "boolean") return cell.value;
          if (cell.kind === "text" && (cell.value === "true" || cell.value === "false")) {
            return cell.value === "true";
          }
          return refuse(
            "cms-item-value",
            field,
            "die Feldart \"boolean\" braucht wahr oder falsch",
            "Den Wert in Framer auf einen Wahrheitswert stellen.",
          );
        }
        case "select": {
          if (cell.kind !== "select") {
            return refuse(
              "cms-item-value",
              field,
              "die Feldart \"select\" braucht einen Optionswert",
              "Den Wert in Framer auf eine Option stellen.",
            );
          }
          const allowed = (field.options ?? []).map((option) => option.value);
          if (!allowed.includes(cell.value)) {
            return refuse(
              "cms-item-value",
              field,
              `"${cell.value}" ist in Senify keine Option des Felds`,
              "Die Option in Senify ergaenzen oder den Wert in Framer angleichen.",
            );
          }
          return cell.value;
        }
        case "multiSelect": {
          if (cell.kind !== "select") {
            return refuse(
              "cms-item-value",
              field,
              "die Feldart \"multiSelect\" braucht einen Optionswert",
              "Den Wert in Framer auf eine Option stellen.",
            );
          }
          const allowed = (field.options ?? []).map((option) => option.value);
          if (!allowed.includes(cell.value)) {
            return refuse(
              "cms-item-value",
              field,
              `"${cell.value}" ist in Senify keine Option des Felds`,
              "Die Option in Senify ergaenzen oder den Wert in Framer angleichen.",
            );
          }
          return [cell.value];
        }
        case "media":
        case "mediaMulti": {
          const list =
            cell.kind === "mediaList"
              ? cell.items
              : cell.kind === "media"
                ? [{ url: cell.url, alt: cell.alt }]
                : null;
          if (list === null) {
            return refuse(
              "cms-item-value",
              field,
              "die Feldart erwartet eine Bild- oder Dateiadresse",
              "Den Wert in Framer auf ein Bild stellen.",
            );
          }
          if (field.type === "media" && list.length !== 1) {
            return refuse(
              "cms-item-value",
              field,
              "das Feld traegt in Senify genau ein Bild",
              "In Senify ein Mehrfach-Feld anlegen oder die Liste in Framer auf ein Bild kuerzen.",
            );
          }
          const refs: MediaRef[] = [];
          for (const media of list) {
            const outcome = await mediaRefOf(media);
            if (outcome.kind === "planned") return null;
            if (outcome.kind === "skipped") {
              return refuse(
                "cms-item-media-skipped",
                field,
                `das Bild "${media.url}" wurde wegen assets=skip nicht uebernommen`,
                "Den Import mit assets=upload wiederholen, wenn die Bilder mit sollen.",
              );
            }
            if (outcome.kind === "failed") {
              return refuse(
                "cms-item-media-failed",
                field,
                `das Bild "${media.url}" liess sich nicht laden`,
                "Die Adresse pruefen oder das Bild in Senify von Hand hinzufuegen.",
              );
            }
            refs.push(outcome.ref);
          }
          return field.type === "media" ? (refs[0] as MediaRef) : refs;
        }
        case "relation":
        case "relationMulti": {
          const rawTargets =
            cell.kind === "relation"
              ? [cell.target]
              : cell.kind === "relationList"
                ? cell.targets
                : null;
          if (rawTargets === null) {
            return refuse(
              "cms-item-value",
              field,
              "die Feldart erwartet einen Verweis",
              "Den Wert in Framer auf einen Verweis stellen.",
            );
          }
          if (field.type === "relation" && rawTargets.length !== 1) {
            return refuse(
              "cms-item-value",
              field,
              "das Feld traegt in Senify genau einen Verweis",
              "In Senify ein Mehrfach-Verweisfeld anlegen oder die Liste kuerzen.",
            );
          }
          const allowed = new Set(field.targetCollections ?? []);
          if (allowed.size === 0) {
            return refuse(
              "cms-item-value",
              field,
              "das Feld nennt in Senify keine erlaubten Sammlungen",
              "Die Zielsammlung am Feld in Senify pflegen.",
            );
          }
          const resolved: string[] = [];
          for (const rawTarget of rawTargets) {
            const hit = resolveTarget(rawTarget, allowed);
            if (hit === null) {
              return refuse(
                "cms-item-relation-missing",
                field,
                `das Verweisziel "${rawTarget}" ist weder im Abzug noch in der Site`,
                "Die Zielsammlung samt Eintraegen mit importieren oder den Verweis in Senify von Hand setzen.",
              );
            }
            resolved.push(hit.id);
          }
          return field.type === "relation" ? (resolved[0] as string) : resolved;
        }
        case "repeater":
          return refuse(
            "cms-item-value",
            field,
            "Repeater lassen sich nicht aus einem CMS-Abzug fuellen",
            "Den Eintrag in Senify von Hand ergaenzen.",
          );
      }
    }

    for (const sourceField of collection.fields) {
      const cell = item.cells[sourceField.key];
      if (cell === undefined) continue;
      if (cell.kind === "media" || cell.kind === "mediaList") {
        mediaReport.planned += cell.kind === "media" ? 1 : cell.items.length;
      }
      const field = fieldsByKey.get(sourceField.key);
      if (field === undefined) {
        findings.push({
          kind: "cms-item-field-missing",
          message: `Feld "${sourceField.label}" fehlt in der Senify-Sammlung "${target.slug}"; der Wert faellt weg`,
          evidence: `${collection.name}/${sourceField.key}`,
          severity: "warn",
          suggestion:
            "Das Feld in Senify anlegen oder die Sammlung neu importieren, damit das Schema wieder passt.",
        });
        continue;
      }
      const value = await valueOf(field, cell);
      if (value === null) continue;
      cells[field.id] = value;
    }

    // The builtin title is what lists and slugs read. A source collection
    // rarely names its field "title" (that key is reserved), so the first
    // textual value in source field order fills it when it stays empty.
    if (cells[target.titleField] === undefined) {
      for (const sourceField of collection.fields) {
        const field = fieldsByKey.get(sourceField.key);
        if (field === undefined || !TEXTUAL_FIELD_TYPES.has(field.type)) continue;
        const value = cells[field.id];
        if (typeof value === "string" && value.trim() !== "") {
          cells[target.titleField] = value;
          break;
        }
      }
    }
    const title =
      typeof cells[target.titleField] === "string" ? (cells[target.titleField] as string) : "";

    const slug = slugFor(item, title, id);
    if (existingKeys.has(`${target.id}/${slug}`)) {
      report.existing += 1;
      continue;
    }
    let unique = slug;
    for (
      let suffix = 2;
      taken.includes(`${target.id}/${unique}`);
      suffix += 1
    ) {
      unique = `${slug}-${suffix}`;
    }
    taken.push(`${target.id}/${unique}`);

    if (input.media.mode === "plan") continue;
    report.imported += 1;
    entries.push({
      id,
      collectionId: target.id,
      slug: unique,
      cells,
      searchText: buildSearchText(
        { titleField: target.titleField, fields: target.fields },
        { cells, slug: unique },
      ),
    });
  }
  return { report, media: mediaReport, findings, entries };
}
