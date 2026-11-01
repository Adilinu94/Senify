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
  type CmsFieldPlan,
  type CmsFinding,
} from "@senify/framer-import";
import { BUILTIN_TITLE_FIELD } from "./content.ts";
import { newEntityId } from "./ids.ts";
import { SUPPORTS_FLAGS, type FieldDef } from "./types.ts";

export type CmsImportFinding = CmsFinding | {
  kind: "cms-reference-missing" | "cms-select-empty";
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
  return { report, findings, collections };
}
