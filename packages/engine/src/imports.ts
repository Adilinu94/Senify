import { createHash } from "node:crypto";
import { SenifyError } from "@senify/core";
import {
  PAGE_ROOT_TYPE,
  type Author,
  type NodeId,
  type NodeTree,
  type PropValue,
} from "@senify/section-sdk";
import type { EditorNode } from "@senify/editor/state";
import {
  marqueeCandidates,
  runImport as runFramerImport,
  type ImportSource as FramerImportSource,
  type ImportRun,
} from "@senify/framer-import";
import { newEntityId } from "./ids.ts";
import {
  createUploadTicket,
  commitUpload,
  purgeAsset,
  type MediaContext,
} from "./media.ts";
import { prepareCodePayload } from "./code-payloads.ts";
import type { CodePayloadLicense, CodePayloadProvenance } from "./types.ts";
import type { PreparedCodePayload, Store } from "./store.ts";
import type { AuthorInput } from "./mutations/contract.ts";
import type {
  CreateImportBody,
  ImportReport,
} from "./imports-contract.ts";

// Framer import (plan S3.1/S3.3): the engine owns the rules *around* the run —
// one revision per write (persistBatch), the site-wide style registry, the
// theme patch and the import job protocol. The import itself is the
// framer-import pipeline (capture → normalize → map → report); CLI, MCP and
// the editor dialog all land here, so they cannot drift.

const MAX_ATTEMPTS = 3;

export type ImportRunResult = {
  report: ImportReport;
  // Present when `write: true`: the page the document was written into.
  pageId: string | null;
  newDraftVersion: number | null;
};

/* ------------------------------------------------- document → node tree */

const TABLET_SUFFIX = "_tablet";
const MOBILE_SUFFIX = "_mobile";

// The v2 → v1 direction of `migrateV1ToV2` (editor/state/migration.ts): the
// page draft stays a section NodeTree, the root primitive maps onto
// PAGE_ROOT_TYPE and the `_tablet`/`_mobile` prop suffixes become overrides.
export function editorDocumentToNodeTree(document: {
  rootNodeId: string;
  nodes: Record<string, EditorNode>;
}): NodeTree {
  const nodes: NodeTree["nodes"] = {};
  for (const [id, node] of Object.entries(document.nodes)) {
    const props: Record<string, PropValue> = {};
    const tablet: Record<string, PropValue> = {};
    const mobile: Record<string, PropValue> = {};
    for (const [key, value] of Object.entries(node.props)) {
      if (key.endsWith(TABLET_SUFFIX)) {
        tablet[key.slice(0, -TABLET_SUFFIX.length)] = value;
      } else if (key.endsWith(MOBILE_SUFFIX)) {
        mobile[key.slice(0, -MOBILE_SUFFIX.length)] = value;
      } else {
        props[key] = value;
      }
    }
    const overrides: NodeTree["nodes"][NodeId]["overrides"] = {};
    if (Object.keys(tablet).length > 0 || node.hiddenDevices?.includes("tablet") === true) {
      overrides.tablet = {
        ...(Object.keys(tablet).length > 0 ? { props: tablet } : {}),
        ...(node.hiddenDevices?.includes("tablet") === true ? { hidden: true } : {}),
      };
    }
    if (Object.keys(mobile).length > 0 || node.hiddenDevices?.includes("mobile") === true) {
      overrides.mobile = {
        ...(Object.keys(mobile).length > 0 ? { props: mobile } : {}),
        ...(node.hiddenDevices?.includes("mobile") === true ? { hidden: true } : {}),
      };
    }
    const isRoot = id === document.rootNodeId;
    nodes[id] = {
      id,
      type: isRoot ? PAGE_ROOT_TYPE : node.primitive,
      props: props as NodeTree["nodes"][NodeId]["props"],
      ...(node.variant !== undefined ? { variant: node.variant } : {}),
      ...(node.classes !== undefined ? { classes: [...node.classes] } : {}),
      ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
      ...(node.children !== undefined ? { children: [...node.children] } : {}),
      ...(node.slots !== undefined
        ? { slots: Object.fromEntries(Object.entries(node.slots).map(([slot, ids]) => [slot, [...ids]])) }
        : {}),
      ...(node.motion !== undefined ? { motion: node.motion } : {}),
      ...(node.locked === true ? { locked: true } : {}),
      ...(node.hidden === true ? { hidden: true } : {}),
    };
  }
  return { rootNodeId: document.rootNodeId, nodes };
}

/* ------------------------------------------------------------ helpers */

function authorOf(auth: AuthorInput): Author {
  return { kind: auth.kind, id: auth.id, label: auth.label };
}

function sourceOf(body: CreateImportBody, pagePath: string): FramerImportSource {
  const source = body.source;
  const hasUrl = typeof source.url === "string" && source.url !== "";
  const hasRootDir = typeof source.rootDir === "string" && source.rootDir !== "";
  const hasHtml = typeof source.html === "string" && source.html !== "";
  const count = [hasUrl, hasRootDir, hasHtml].filter((entry) => entry).length;
  if (count === 0) {
    throw new SenifyError("validation", "Die Import-Quelle ist leer", {
      field: "source",
      suggestion: "url (live), rootDir (Mirror-Ordner) oder html (Markup) angeben.",
    });
  }
  if (count > 1) {
    throw new SenifyError(
      "validation",
      "Nur eine Import-Quelle angeben (url, rootDir oder html)",
      { field: "source" },
    );
  }
  if (hasUrl) {
    return { kind: "url", url: source.url ?? "" };
  }
  if (hasRootDir) {
    return { kind: "mirror", rootDir: source.rootDir ?? "", pagePath };
  }
  return {
    kind: "html",
    html: source.html ?? "",
    ...(source.url === undefined ? {} : { url: source.url }),
  };
}

export function framerImportKeys(input: {
  irHash: string;
  pageId?: string;
  pagePath: string;
  assets: "upload" | "skip";
  fonts: "rewrite" | "skip";
  applyTheme: boolean;
  options?: Record<string, unknown>;
}): { contentKey: string; requestFingerprint: string } {
  const target = input.pageId === undefined
    ? { kind: "path", path: normalizeImportPath(input.pagePath) }
    : { kind: "page", pageId: input.pageId };
  const options = input.options === undefined ? {} : input.options;
  const contentMaterial = stableJson({
    target,
    assets: input.assets,
    fonts: input.fonts,
    applyTheme: input.applyTheme,
    options,
  });
  const contentKey = createHash("sha256")
    .update(`${input.irHash}\n${contentMaterial}`)
    .digest("hex");
  const requestFingerprint = createHash("sha256")
    .update(contentMaterial)
    .digest("hex");
  return { contentKey, requestFingerprint };
}

function normalizeImportPath(path: string): string {
  const trimmed = path.trim();
  if (trimmed === "") return "/";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const collapsed = withSlash.replace(/\/{2,}/g, "/");
  if (collapsed.length > 1 && collapsed.endsWith("/")) return collapsed.slice(0, -1);
  return collapsed;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/* ------------------------------------------------------------ main run */

export async function runFramerImportJob(
  store: Store,
  input: {
    siteId: string;
    jobId: string;
    body: CreateImportBody;
    author: AuthorInput;
    media?: MediaContext;
  },
): Promise<ImportRunResult> {
  const dryRun = input.body.write !== true;
  const pagePath = input.body.pagePath ?? "/";
  const source = sourceOf(input.body, pagePath);
  const includeAssets = !dryRun && input.body.assets !== "skip";
  const includeFonts = !dryRun && input.body.fonts !== "skip";
  const media = dryRun ? undefined : input.media;
  if (!dryRun && (includeAssets || includeFonts) && media === undefined) {
    throw new SenifyError("validation", "Für den Asset-Import fehlt der Media-Kontext", {
      field: "assets",
      suggestion: "assets=skip oder eine Engine-Import-Route verwenden.",
    });
  }
  const createdAssetIds: string[] = [];
  const uploader = media === undefined
    ? undefined
    : async ({ filename, mime, data, alt }: {
        filename: string;
        mime: string;
        data: Buffer;
        alt: string | null;
      }): Promise<{ assetId: string; url: string; deduped: boolean }> => {
        const { ticket } = await createUploadTicket(media, {
          siteId: input.siteId,
          body: { filename, mime, byteSize: data.length, altText: alt ?? undefined },
        });
        const commit = await commitUpload(media, { ticket, data });
        if (!commit.deduped) createdAssetIds.push(commit.asset.id);
        return {
          assetId: commit.asset.id,
          url: `/assets/${commit.asset.id}/${commit.asset.filename}`,
          deduped: commit.deduped,
        };
      };

  let run: ImportRun;
  try {
    run = await runFramerImport({
      source,
      ...(uploader !== undefined ? { uploader } : {}),
      ...(input.body.source.baseUrl !== undefined ? { baseUrl: input.body.source.baseUrl } : {}),
      includeAssets,
      includeFonts,
    });
  } catch (error) {
    if (media !== undefined) {
      for (const assetId of [...new Set(createdAssetIds)]) {
        await purgeAsset(media, { siteId: input.siteId, assetId }).catch(() => undefined);
      }
    }
    throw error;
  }

  const preparedPayloads: PreparedCodePayload[] = [];
  if (!dryRun && run.payloads.length > 0) {
    for (const payload of run.payloads) {
      const provenance: CodePayloadProvenance = {
        kind: "framer-import",
        sourceUrl: run.document.source.url ?? "offline://framer-import",
        pagePath,
        irHash: run.irHash,
        capturedAt: run.document.source.capturedAt,
      };
      const license: CodePayloadLicense = {
        id: payload.license.id,
        note: payload.license.note,
        assertedBy: "framer-import",
      };
      preparedPayloads.push(prepareCodePayload({
        id: newEntityId(),
        name: payload.name,
        kind: payload.kind,
        bundle: payload.bundle,
        provenance,
        license,
      }));
    }
    const byKey = new Map(run.payloads.map((payload, index) => [payload.integrity, preparedPayloads[index]?.id]));
    for (const node of Object.values(run.mapped.document.nodes)) {
      if (node.primitive !== "payload") continue;
      const key = node.props["framerPayloadKey"];
      const id = typeof key === "string" ? byKey.get(key) : undefined;
      if (id !== undefined) node.props["payloadId"] = id;
      delete node.props["framerPayloadKey"];
    }
  }

  const marquee = marqueeCandidates(run.document);
  const reportBase: Omit<
    ImportReport,
    "pageId" | "newDraftVersion" | "receiptId" | "replayed"
  > = {
    jobId: input.jobId,
    dryRun,
    irHash: run.irHash,
    score: run.report.score,
    counts: {
      nodes: run.report.counts.nodes,
      mapped: run.report.counts.mapped,
      placeholders: run.report.counts.placeholders,
    },
    declarations: {
      total: run.report.declarations.total,
      carried: run.report.declarations.carried,
      dropped: run.report.declarations.dropped,
    },
    assets: {
      downloaded: run.assets?.downloads.length ?? 0,
      deduped: run.assets?.deduped ?? 0,
      failed: run.assets?.failed ?? 0,
      fonts: run.assets?.fonts.length ?? 0,
    },
    motion: run.report.motion,
    findings: run.report.findings.map((finding) => ({
      kind: finding.kind,
      nodeKey: finding.nodeKey,
      message: finding.message,
      evidence: finding.evidence,
      severity: finding.severity,
      suggestion: finding.suggestion,
    })),
    marqueeCandidates: marquee.map((candidate) => ({
      nodeKey: candidate.nodeKey,
      preset: candidate.preset,
      reason: candidate.reason,
      params: candidate.params,
    })),
    candidates: run.report.candidates,
    resolutions: run.report.resolutions,
    payloads: run.payloads.map((payload, index) => ({
      nodeKey: payload.nodeKey,
      name: payload.name,
      kind: payload.kind,
      bytes: payload.bytes,
      integrity: payload.integrity,
      sourcePath: payload.sourcePath,
      license: payload.license,
      ...(preparedPayloads[index]?.id === undefined
        ? {}
        : { payloadId: preparedPayloads[index]?.id as string }),
    })),
    steps: run.report.steps,
  };

  if (dryRun) {
    const report: ImportReport = {
      ...reportBase,
      pageId: null,
      newDraftVersion: null,
      receiptId: null,
      replayed: false,
    };
    return { report, pageId: null, newDraftVersion: null };
  }

  const keys = framerImportKeys({
    irHash: run.irHash,
    ...(input.body.pageId === undefined ? {} : { pageId: input.body.pageId }),
    pagePath,
    assets: input.body.assets ?? "upload",
    fonts: input.body.fonts ?? "rewrite",
    applyTheme: input.body.applyTheme === true,
  });
  const existingTarget =
    input.body.pageId === undefined
      ? (await store.listPageDrafts(input.siteId)).find((page) => page.path === pagePath)
      : undefined;
  const target =
    input.body.pageId !== undefined
      ? (() => {
          if (input.body.baseDraftVersion === undefined) {
            throw new SenifyError("validation", "Für eine bestehende Zielseite ist baseDraftVersion erforderlich", {
              field: "baseDraftVersion",
              suggestion: "Lade die Seite neu und sende ihre aktuelle Draft-Version.",
            });
          }
          return {
            kind: "page",
            pageId: input.body.pageId,
            baseDraftVersion: input.body.baseDraftVersion,
          } as const;
        })()
      : existingTarget !== undefined
        ? ({ kind: "page", pageId: existingTarget.id, baseDraftVersion: existingTarget.draftVersion } as const)
        : ({ kind: "new", path: pagePath, title: run.document.pages[0]?.title ?? "Importierte Seite" } as const);

  try {
    const committed = await store.commitFramerImportPlan({
      siteId: input.siteId,
      jobId: input.jobId,
      contentKey: keys.contentKey,
      requestFingerprint: keys.requestFingerprint,
      author: authorOf(input.author),
      target,
      draft: editorDocumentToNodeTree(run.mapped.document),
      payloads: preparedPayloads,
      styleRules: run.mapped.rules,
      themePatch:
        input.body.applyTheme === true && run.mapped.themePatch.fonts !== undefined
          ? run.mapped.themePatch
          : null,
      report: reportBase,
    });
    return {
      report: committed.report,
      pageId: committed.report.pageId,
      newDraftVersion: committed.report.newDraftVersion,
    };
  } catch (error) {
    if (media !== undefined) {
      for (const assetId of [...new Set(createdAssetIds)]) {
        await purgeAsset(media, { siteId: input.siteId, assetId }).catch(() => undefined);
      }
    }
    throw error;
  }
}

export { MAX_ATTEMPTS as IMPORT_MAX_ATTEMPTS };
