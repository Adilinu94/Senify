import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { delimiter, isAbsolute, relative, resolve, sep } from "node:path";
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
  type AssetReport,
  fontFamilyName,
  type ImportSource as FramerImportSource,
  type ImportDeviceVisibility,
  type ImportRun,
  type ThemePatch,
} from "@senify/framer-import";
import { newEntityId } from "./ids.ts";
import { resolveTheme } from "@senify/tokens";
import { parseDurationMs } from "@senify/renderer";
import {
  createUploadTicket,
  commitUpload,
  purgeAsset,
  type MediaContext,
} from "./media.ts";
import { applyPayloadIds, prepareCodePayload } from "./code-payloads.ts";
import { planImportBreakpoints, type ImportBreakpointsPlan } from "./site-breakpoints.ts";
import { DEFAULT_BREAKPOINTS } from "@senify/widget-engine/breakpoints";
import type { CodePayloadLicense, CodePayloadProvenance, PageMeta } from "./types.ts";
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
// The SEO head of the imported page. Only what the source states and the page
// can hold: a description (the meta description, else the share description)
// and a share image. An image that is not an absolute http(s) URL or a rooted
// path is dropped rather than stored as a reference that resolves nowhere.
export function pageMetaOf(page: { description?: string; meta?: { ogDescription?: string; ogImage?: string } } | undefined): PageMeta {
  if (page === undefined) return {};
  const description = (page.description ?? page.meta?.ogDescription ?? "").trim();
  const image = (page.meta?.ogImage ?? "").trim();
  return {
    ...(description === "" ? {} : { description: description.slice(0, 500) }),
    ...(/^(https?:\/\/|\/)/.test(image) ? { ogImage: image.slice(0, 2000) } : {}),
  };
}

export function editorDocumentToNodeTree(document: {
  rootNodeId: string;
  nodes: Record<string, EditorNode & ImportDeviceVisibility>;
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
    // `hidden` per device: true = hidden there, false = shown there although the
    // node is hidden by default (a copy that exists only on tablet/mobile).
    const hiddenOn = (device: "tablet" | "mobile"): boolean | undefined => {
      if (node.hiddenDevices?.includes(device) === true) return true;
      if (node.visibleDevices === undefined) return undefined;
      // An explicit `false` marks the node as having its own visibility per
      // device, which the bake writes as exact width ranges.
      return !node.visibleDevices.includes(device);
    };
    const tabletHidden = hiddenOn("tablet");
    const mobileHidden = hiddenOn("mobile");
    if (Object.keys(tablet).length > 0 || tabletHidden !== undefined) {
      overrides.tablet = {
        ...(Object.keys(tablet).length > 0 ? { props: tablet } : {}),
        ...(tabletHidden !== undefined ? { hidden: tabletHidden } : {}),
      };
    }
    if (Object.keys(mobile).length > 0 || mobileHidden !== undefined) {
      overrides.mobile = {
        ...(Object.keys(mobile).length > 0 ? { props: mobile } : {}),
        ...(mobileHidden !== undefined ? { hidden: mobileHidden } : {}),
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

function realPathOrResolved(path: string): string {
  try {
    return realpathSync(resolve(path));
  } catch {
    return resolve(path);
  }
}

// ADR-0016: `SENIFY_IMPORT_ROOTS` is the operator's optional allowlist for the
// mirror folder an agent may import from (`rootDir`). Unset or empty keeps the
// folder open; otherwise it lists absolute folders separated by the platform
// path delimiter and `rootDir` must be one of them or lie below one. Symlinks
// are resolved on both sides, so a link inside a root cannot lead out of it.
export function assertImportRootAllowed(rootDir: string): void {
  const roots = (process.env.SENIFY_IMPORT_ROOTS ?? "")
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  if (roots.length === 0) return;
  const target = realPathOrResolved(rootDir);
  const allowed = roots.some((root) => {
    const rel = relative(realPathOrResolved(root), target);
    return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
  });
  if (!allowed) {
    throw new SenifyError("validation", "Der Import-Ordner liegt außerhalb der erlaubten Wurzeln", {
      field: "source.rootDir",
      suggestion:
        "Einen Ordner unterhalb von SENIFY_IMPORT_ROOTS angeben. Der Betreiber ergänzt die Wurzel beim Start des Programms.",
    });
  }
}

export function sourceOf(body: CreateImportBody): FramerImportSource {
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
    assertImportRootAllowed(source.rootDir ?? "");
    return { kind: "mirror", rootDir: source.rootDir ?? "", pagePath: source.page ?? "/" };
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

/* ---------------------------------------------------------- theme fonts */

// The theme patch names the fonts of the source. The files come from the
// import's asset report: without them the theme keeps its old files under the
// new name, and the page would ask for "Manrope" and get Sora's shapes.
type PatchFont = {
  family: string;
  fallback: string[];
  weights: number[];
  files?: Record<string, string>;
};

export function fontFilesOf(patch: ThemePatch, fonts: AssetReport["fonts"]): ThemePatch {
  if (patch.fonts === undefined) return patch;
  const withFiles = (role: PatchFont): PatchFont => {
    const files: Record<string, string> = {};
    for (const weight of role.weights) {
      const file = fontFileFor(fonts, role.family, weight);
      if (file !== undefined) files[String(weight)] = file;
    }
    return Object.keys(files).length === 0 ? role : { ...role, files };
  };
  const display = patch.fonts.display;
  const body = patch.fonts.body;
  return {
    ...patch,
    fonts: {
      ...(display === undefined ? {} : { display: withFiles(display) }),
      ...(body === undefined ? {} : { body: withFiles(body) }),
    },
  };
}

// The file of a weight: the subset that carries the basic latin text. The
// source serves its fonts in subsets (six files per weight for Manrope), and
// the theme names one file per weight — the one with the latin glyphs is the
// one that counts.
function fontFileFor(
  fonts: AssetReport["fonts"],
  family: string,
  weight: number,
): string | undefined {
  const wanted = fontFamilyName(family);
  const faces = fonts.filter(
    (font) => fontFamilyName(font.family) === wanted && font.weight === weight,
  );
  if (faces.length === 0) return undefined;
  const latin = faces.find(
    (font) => font.unicodeRange !== null && font.unicodeRange.includes("U+0000-00FF"),
  );
  const chosen = latin ?? faces.find((font) => font.unicodeRange === null) ?? faces[0];
  return chosen?.files[0];
}

/* ------------------------------------------------------ breakpoints */

// The report line for what the import did with the source's breakpoints.
function breakpointsFinding(plan: ImportBreakpointsPlan, site: { tablet: number; mobile: number }): ImportReport["findings"][number] {
  const { tablet, mobile } = plan.derived;
  const source = `Tablet unter ${tablet}, Handy unter ${mobile} Pixel`;
  const base = { kind: "breakpoints", nodeKey: null, evidence: "__framer__breakpoints" } as const;
  if (plan.outcome === "set") {
    return {
      ...base,
      severity: "info",
      message: `Die Umbruchpunkte der Quelle (${source}) gelten jetzt für die ganze Website.`,
      suggestion: "Ändern oder zurücksetzen kannst du sie in den Projekt-Einstellungen unter „Umbruchpunkte“.",
    };
  }
  if (plan.outcome === "unchanged") {
    return {
      ...base,
      severity: "info",
      message: `Die Quelle bricht bei denselben Umbruchpunkten um wie die Website (${source}).`,
      suggestion: "Nichts zu tun.",
    };
  }
  const own = `Tablet unter ${site.tablet}, Handy unter ${site.mobile} Pixel`;
  return plan.reason === "other-pages"
    ? {
        ...base,
        severity: "warn",
        message: `Die Quelle bricht bei ${source} um. Die Website hat schon andere Seiten, die für ${own} gebaut sind, und bleibt dabei. Die importierte Seite wechselt ihr Layout deshalb an anderen Breiten als das Original.`,
        suggestion: "Wenn die ganze Website der Quelle folgen soll: Umbruchpunkte in den Projekt-Einstellungen angleichen und die anderen Seiten prüfen.",
      }
    : {
        ...base,
        severity: "warn",
        message: `Die Quelle bricht bei ${source} um, die Website bei ${own}. Die importierte Seite wechselt ihr Layout deshalb an anderen Breiten als das Original.`,
        suggestion: "Wenn die ganze Website der Quelle folgen soll: Umbruchpunkte in den Projekt-Einstellungen angleichen.",
      };
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
  const source = sourceOf(input.body);
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
  // The theme the page lands in: `durationScale` of every imported motion spec
  // is relative to its base duration. Reading it here keeps the written page and
  // the preview on the same number — the preview route resolves the same theme.
  const siteTheme = await store.getTheme(input.siteId);
  const resolvedTheme = resolveTheme(siteTheme.theme);
  const baseDuration = resolvedTheme.motion.duration.base;
  const baseDurationMs = baseDuration === undefined ? 300 : parseDurationMs(baseDuration);
  try {
    run = await runFramerImport({
      source,
      ...(uploader !== undefined ? { uploader } : {}),
      ...(input.body.source.baseUrl !== undefined ? { baseUrl: input.body.source.baseUrl } : {}),
      includeAssets,
      includeFonts,
      pagePath,
      mode: input.body.mode ?? "dna",
      baseDurationMs,
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
    // The carriers point at the ids the store gave the payloads.
    applyPayloadIds(
      run.mapped.document,
      run.payloads.map((payload, index) => ({
        integrity: payload.integrity,
        id: preparedPayloads[index]?.id ?? "",
      })),
    );
  }
  // The pages the site holds, once: the plan for the breakpoints and the target
  // of this write both read them.
  const sitePages = await store.listPageDrafts(input.siteId);
  const site = await store.getSite(input.siteId);
  const breakpointsPlan = planImportBreakpoints({
    derived: run.breakpoints,
    site: site.breakpoints,
    otherPages: sitePages.some((page) =>
      input.body.pageId === undefined ? page.path !== pagePath : page.id !== input.body.pageId,
    ),
  });

  const marquee = marqueeCandidates(run.document);
  const reportBase: Omit<
    ImportReport,
    "pageId" | "newDraftVersion" | "receiptId" | "replayed"
  > = {
    jobId: input.jobId,
    dryRun,
    irHash: run.irHash,
    ...(run.discoveredPages.length > 0 ? { discoveredPages: run.discoveredPages } : {}),
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
    ...(breakpointsPlan === null
      ? {}
      : {
          breakpoints: {
            tablet: breakpointsPlan.derived.tablet,
            mobile: breakpointsPlan.derived.mobile,
            outcome: breakpointsPlan.outcome,
            reason: breakpointsPlan.reason,
          },
        }),
    findings: [
      ...run.report.findings.map((finding) => ({
        kind: finding.kind,
        nodeKey: finding.nodeKey,
        message: finding.message,
        evidence: finding.evidence,
        severity: finding.severity,
        suggestion: finding.suggestion,
      })),
      ...(breakpointsPlan === null
        ? []
        : [breakpointsFinding(breakpointsPlan, site.breakpoints ?? DEFAULT_BREAKPOINTS)]),
    ],
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

  // The page this path already holds (an import by path replaces its draft).
  const existingTarget =
    input.body.pageId === undefined
      ? sitePages.find((page) => page.path === pagePath)
      : undefined;

  if (dryRun) {
    const report: ImportReport = {
      ...reportBase,
      ...(existingTarget === undefined
        ? {}
        : {
            existingPage: {
              pageId: existingTarget.id,
              draftVersion: existingTarget.draftVersion,
              title: existingTarget.title,
            },
          }),
      pageId: null,
      newDraftVersion: null,
      receiptId: null,
      replayed: false,
    };
    return { report, pageId: null, newDraftVersion: null };
  }

  if (input.body.expectedIrHash !== undefined && input.body.expectedIrHash !== run.irHash) {
    throw new SenifyError("conflict", "Die Quelle hat sich seit der Analyse geändert", {
      field: "expectedIrHash",
      suggestion: "Analysiere die Seite erneut und prüfe den neuen Bericht, bevor du übernimmst.",
    });
  }
  if (
    existingTarget !== undefined &&
    input.body.baseDraftVersion !== undefined &&
    input.body.baseDraftVersion !== existingTarget.draftVersion
  ) {
    throw new SenifyError("conflict", "Die Zielseite wurde seit der Analyse im Editor geändert", {
      field: "baseDraftVersion",
      suggestion: "Analysiere erneut: der Import würde sonst die neueren Änderungen überschreiben.",
    });
  }

  const keys = framerImportKeys({
    irHash: run.irHash,
    ...(input.body.pageId === undefined ? {} : { pageId: input.body.pageId }),
    pagePath,
    assets: input.body.assets ?? "upload",
    fonts: input.body.fonts ?? "rewrite",
    applyTheme: input.body.applyTheme === true,
  });
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
      pageMeta: pageMetaOf(run.document.pages[0]),
      payloads: preparedPayloads,
      styleRules: run.mapped.rules,
      themePatch:
        input.body.applyTheme === true &&
        (run.mapped.themePatch.fonts !== undefined || run.mapped.themePatch.scales !== undefined)
          ? fontFilesOf(run.mapped.themePatch, run.assets?.fonts ?? [])
          : null,
      // The source's breakpoints are taken over only where nothing else was laid
      // out for the default (`planImportBreakpoints`); the commit writes them in
      // the same transaction as the page, so a failed import sets nothing.
      breakpoints: breakpointsPlan?.outcome === "set" ? breakpointsPlan.derived : null,
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
