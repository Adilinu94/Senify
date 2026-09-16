// Browser-safe subset of the renderer for the editor bundle: the shell must
// not pull the Node-side bake (child_process, fs) into the browser.
export { BREAKPOINTS } from "./style-css.ts";
