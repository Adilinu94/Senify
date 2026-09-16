// Browser entry of the editor bundle: the local program serves this module as
// `/editor.js` (bundled on demand by @senify/app) and the page view mounts it.
export * from "./index.ts";
export { createRegistry } from "@senify/registry";
export { defaultTheme, resolveTheme } from "@senify/tokens";
