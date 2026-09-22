export {
  bakeSite,
  inlineBakedAssets,
  jsonForHtml,
  motionVendorFiles,
  selfContainedHtml,
  type BakeInput,
  type BakeOptions,
  type BakePageInput,
  type BakeResult,
  type BakeWarning,
} from "./bake.ts";
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
  pageTransitionCss,
  pageTransitionForTree,
  parseDurationMs,
  PIN_PRESETS,
  PAGE_SCRIPT_PRESETS,
  renderIslandsScript,
  renderPageScript,
  type MotionConfig,
  type MotionData,
  type MotionTokens,
  type MotionWarning,
  type PageTransition,
} from "./motion.ts";
export {
  BREAKPOINTS,
  overridesCss,
  styleRulesCss,
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
