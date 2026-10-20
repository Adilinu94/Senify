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

export {
  extractPayloads,
  type ExtractedPayload,
  type ExtractPayloadsInput,
} from "./payloads.ts";

export {
  importAssets,
  readMirrorFile,
  sourceAssetDeliveries,
  type AssetDownload,
  type AssetReport,
  type AssetResult,
  type AssetUploader,
  type ImportAssetsInput,
} from "./assets.ts";

export {
  captureBrowser,
  type BrowserCaptureResult,
  type CaptureBrowserInput,
} from "./capture-browser.ts";

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
