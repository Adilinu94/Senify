export {
  bakeSite,
  inlineBakedAssets,
  jsonForHtml,
  motionVendorFiles,
  selfContainedHtml,
  type BakeInput,
  type BakeOptions,
  type BakedPayload,
  type BakePageInput,
  type BakeResult,
  type BakeWarning,
  type PayloadDelivery,
} from "./bake.ts";
// The renderer version the release manifest stamps (E2).
export { RENDERER_VERSION } from "./version.ts";
// The theme's webfont files (Sora, Inter). The bake copies them into every
// build; the local program serves them for the editor frames.
export { FONT_ASSETS_DIR } from "./bake.ts";
// The delivered-asset shape the bake hands to the image components.
export type { AssetDelivery } from "@senify/registry/components";
export {
  buildLlmsTxt,
  buildRobots,
  buildSitemap,
  collectJsonLd,
  mdUrlFor,
  pageToMarkdown,
  renderJsonLdScript,
  type AeoPageInput,
} from "./aeo.ts";
export {
  getHydration,
  islandsForNode,
  islandsForTree,
  type Hydration,
  type IslandKind,
} from "./islands.ts";
export {
  motionConfigsForTree,
  motionDataFor,
  motionEffectCss,
  pageEffectsForTree,
  pageTransitionCss,
  parseDurationMs,
  PIN_PRESETS,
  PAGE_SCRIPT_PRESETS,
  renderIslandsScript,
  renderPageScript,
  WEBGL_VENDOR_NAME,
  WEBGL_VENDOR_URL,
  type MotionConfig,
  type MotionData,
  type MotionTokens,
  type MotionWarning,
  type PageEffects,
  type PageTransition,
} from "./motion.ts";
// The lazy 3D island asset (M6): bundled from the installed three version at
// bake time (no minified three build exists upstream, and the module build
// pulls a second file). Node-only — the browser paths never import it.
export { threeVersion, webglVendorCode } from "./webgl-vendor.ts";
export {
  BREAKPOINTS,
  overridesCss,
  styleRulesCss,
  styleRulesReport,
  type StyleCssPage,
} from "./style-css.ts";
export {
  bindingError,
  expandPageTree,
  resolveNodeProps,
  type BindingEntry,
  type BindingField,
  type BindingIssue,
  type BindingSource,
  type ListPrefetch,
  type PageContext,
} from "./bindings.ts";
export {
  DEFAULT_HONEYPOT_KEY,
  FORM_FIELD_KINDS,
  FORM_SCRIPT_PATH,
  FORM_SECTION_TYPES,
  formRenderData,
  formSnapshotFromNode,
  isFormSection,
  renderFormsScript,
  stampFormsInTree,
  treeHasForms,
  type FormConsent,
  type FormField,
  type FormFieldKind,
  type FormFieldOption,
  type FormFieldValidation,
  type FormMode,
  type FormRenderData,
  type FormSectionType,
  type FormSnapshot,
  type FormSnapshotContext,
  type FormStamp,
} from "./forms.ts";
