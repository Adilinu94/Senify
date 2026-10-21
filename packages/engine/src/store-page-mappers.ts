// Zeilentypen und Mapper der Seite (P3-2): gemeinsam genutzt von `Store` und
// `PagesRepository`.
//
// Die Mapper mussten hier heraus, weil die Seite zwei Besitzer hat: das
// Seiten-Modul liest und schreibt sie im Alltag, und die beiden
// fachuebergreifenden Transaktionen (`duplicateSiteWithPlan`,
// `commitFramerImportPlan`) legen Seiten innerhalb einer fremden Transaktion an
// (ADR-0019, Punkt 4). Eine zweite Kopie von `mapPage` waere beim ersten neuen
// Feld gedriftet - und `assertDraftShape` haette nur eine der beiden Kopien
// geschuetzt.
//
// `PAGE_WRITE_COLUMNS` steht hier, weil die Duplizier-Transaktion sie braucht;
// `PAGE_COLUMNS` und `PAGE_SUMMARY_COLUMNS` gehoeren zum Lesepfad des Moduls und
// liegen trotzdem daneben: drei Spaltenlisten einer Tabelle an zwei Orten zu
// pflegen ist genau die Art von Naeht, die beim naechsten Feld bricht.
import type { Page, PageMeta, PageSummary, PageTemplate } from "./types.ts";
import { assertDraftShape, toFiniteNumber, toIso, toJson } from "./store-row-utils.ts";

export type PageRow = {
  id: string;
  site_id: string;
  path: string;
  title: string;
  meta: unknown;
  draft: unknown;
  draft_version: unknown;
  created_at: unknown;
  updated_at: unknown;
  template_kind?: unknown;
  collection_ids?: unknown;
  priority?: unknown;
  layout_id?: unknown;
};

export type PageSummaryRow = Omit<PageRow, "draft">;

// Die Template-Spalten kommen aus der additiven Tabelle `page_templates` per
// LEFT JOIN; eine Seite ohne Zeile ist eine normale Seite.
export const PAGE_COLUMNS =
  "p.id, p.site_id, p.path, p.title, p.meta, p.draft, p.draft_version, p.created_at, p.updated_at, pt.kind AS template_kind, pt.collection_ids, pt.priority, pt.layout_id";
export const PAGE_SUMMARY_COLUMNS =
  "p.id, p.site_id, p.path, p.title, p.meta, p.draft_version, p.created_at, p.updated_at, pt.kind AS template_kind, pt.collection_ids, pt.priority, pt.layout_id";
export const PAGE_WRITE_COLUMNS =
  "id, site_id, path, title, meta, draft, draft_version, created_at, updated_at";

export function mapPageTemplate(row: {
  title?: string;
  template_kind?: unknown;
  collection_ids?: unknown;
  priority?: unknown;
}): PageTemplate | null {
  if (row.template_kind === "layout") {
    return { kind: "layout", label: row.title ?? "" };
  }
  if (row.template_kind === "collection") {
    return {
      kind: "collection",
      collectionIds: toJson<string[]>(row.collection_ids),
      priority: toFiniteNumber(row.priority ?? 0, "priority"),
    };
  }
  return null;
}

export function mapPage(row: PageRow): Page {
  const draft = toJson<unknown>(row.draft);
  assertDraftShape(draft);
  return {
    id: row.id,
    siteId: row.site_id,
    path: row.path,
    title: row.title,
    meta: toJson<PageMeta>(row.meta),
    draft,
    draftVersion: toFiniteNumber(row.draft_version, "draft_version"),
    template: mapPageTemplate(row),
    layoutId: typeof row.layout_id === "string" ? row.layout_id : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function toSummary(row: PageSummaryRow): PageSummary {
  return {
    id: row.id,
    siteId: row.site_id,
    path: row.path,
    title: row.title,
    meta: toJson<PageMeta>(row.meta),
    draftVersion: toFiniteNumber(row.draft_version, "draft_version"),
    template: mapPageTemplate(row),
    layoutId: typeof row.layout_id === "string" ? row.layout_id : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}
