// Browser entry of the editor bundle: the local program serves this module as
// `/editor.js` (bundled on demand by @senify/app) and the page view mounts it.
export * from "./index.ts";
export { createReactRenderer, type ReactRendererOptions } from "./react-renderer.tsx";
// The rebuild's editor state and canvas. Both are browser-safe: the engine is
// reached only through `@senify/engine/browser` (no Node builtins) and the
// breakpoints through `@senify/renderer/breakpoints`.
export * from "./state/index.ts";
export * from "./canvas/index.ts";
export { createRegistry } from "@senify/registry";
export { defaultTheme, resolveTheme } from "@senify/tokens";
// The widget catalog (ticket 03: the spotlight indexes the primitives; the
// shell needs the list, the editor core stays renderer-agnostic).
export { getPrimitive, primitiveTypes } from "@senify/widget-engine";
