// Browser-safe subset of the renderer for the editor bundle: the shell must
// not pull the Node-side bake (child_process, fs) into the browser. The
// breakpoints come from their own module (`breakpoints.ts`) instead of
// `style-css.ts`, which imports the registry.
export { BREAKPOINTS } from "./breakpoints.ts";
