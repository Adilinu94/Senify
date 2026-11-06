// Framer import (plan.md S1): the IR, the HTML capture, the normalizer, the
// mapper and the fidelity report. Slices S2+ (browser capture, assets, engine
// routes) build on these exports.

export {
  IR_VERSION,
  FramerIrSchema,
  parseIr,
  IR_FINDING_KINDS,
  type FramerIrDocument,
  type IrAsset,
  type IrAssetKind,
  type IrBreakpoint,
  type IrColorToken,
  type IrDevice,
  type IrDeviceValueMap,
  type IrFinding,
  type IrFindingKind,
  type IrFontFace,
  type IrLayout,
  type IrBox,
  type IrCodeModule,
  type IrMotionSample,
  type IrNode,
  type IrNodeKind,
  type IrPage,
  type IrSource,
  type IrSourceKind,
  type IrState,
  type IrTextContent,
  type IrTextPreset,
  type IrVisual,
} from "./ir.ts";

export { captureHtml, captureFixture, type CaptureHtmlInput } from "./capture-html.ts";

export {
  normalize,
  ruleScopeOf,
  RULE_ID_PATTERN,
  type NormalizeMode,
  type NormalizeOptions,
  type NormalizeResult,
  type NormalizedStyleRule,
} from "./normalize.ts";

export {
  mapDocument,
  fontFamilyName,
  themePatchOf,
  type ImportDeviceVisibility,
  type MapperResult,
  type ThemePatch,
} from "./mapper.ts";

export { buildFidelityReport, type FidelityReport } from "./fidelity.ts";

export { sectionCandidatesOf } from "./section-candidates.ts";
export { brandColorOf } from "./brand-color.ts";
export { neutralBaseOf, typeBaseOf } from "./theme-scales.ts";
export { discoverPagePaths, pagePathOf, resolveHref, rewriteLinks } from "./link-paths.ts";
export { pageFileOf } from "./capture-html.ts";

export {
  candidatesOf,
  fingerprintOf,
  resolutionsOf,
  type ImportCandidate,
  type ImportResolution,
} from "./library.ts";

export { siteBreakpointsOf } from "./site-breakpoints.ts";

export { mapFramerMotion } from "./motion-mapping.ts";
export type { MotionMapping, MotionMappingResult } from "./motion-mapping.ts";

// Framer's own spring solver, ported from the page bundle: the exact duration
// and `linear()` curve of an appear effect instead of a settle approximation.
export {
  springFromDuration,
  springGenerator,
  springFrames,
  springDurationMs,
  springEasing,
  springTimingCss,
  type SpringTransition,
} from "./spring.ts";

export {
  extractPayloads,
  type ExtractedPayload,
  type ExtractPayloadsInput,
} from "./payloads.ts";

export {
  createCmsMediaImporter,
  importAssets,
  readMirrorFile,
  sourceAssetDeliveries,
  type AssetDownload,
  type AssetDownloadInput,
  type AssetReport,
  type AssetResult,
  type AssetUploader,
  type CmsMediaImporter,
  type ImportAssetsInput,
} from "./assets.ts";

export {
  captureBrowser,
  type BrowserCaptureResult,
  type CaptureBrowserInput,
} from "./capture-browser.ts";

export {
  UNFRAMER_READ_TOOLS,
  createUnframerClient,
  type UnframerClient,
  type UnframerClientInput,
  type UnframerReadTool,
  type UnframerRequest,
  type UnframerTransport,
  type UnframerUsage,
} from "./unframer-client.ts";

export {
  mapUnframerProject,
  parseUnframerXml,
  type UnframerElement,
  type UnframerPageXml,
  type UnframerProjectInput,
} from "./unframer-ir.ts";

export {
  readCmsCollections,
  readCmsItems,
  type CmsCollectionPlan,
  type CmsFieldPlan,
  type CmsFieldType,
  type CmsFinding,
  type CmsItemCell,
  type CmsItemPlan,
  type CmsItemsPlan,
  type CmsPlan,
} from "./cms.ts";

export {
  compareRuns,
  irHashOf,
  marqueeCandidates,
  runImport,
  type ImportRun,
  type ImportSource,
  type RunImportInput,
} from "./import.ts";

export {
  compareSummaries,
  summaryOf,
  type RunSummary,
} from "./idempotency.ts";

// Aus dem C-Zweig uebernommen (Merge 06.11.2026): Tween-Wiedergabe, Mirror-Vorbereitung, Sitemap-Routen.
export { readAppearTween, type AppearTween, type AppearTweenResult, type AppearTweenState } from "./appear-tween.ts";
export { listMirrorPages, prepareMirrorSite, type PreparedMirrorSite } from "./prepare-site.ts";
export { fetchSitemapRoutes, importRoutes, parseSitemap, type ImportRoute, type SitemapRoute } from "./route-manifest.ts";
