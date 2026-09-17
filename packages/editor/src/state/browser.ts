// Narrow, browser-safe entry of the editor state (Phase 0, fourth slice).
//
// This is the surface the canvas uses. Everything here is plain data — no DOM,
// no Node builtins — so the module graph can be bundled for the browser. It
// re-exports the state modules explicitly (rather than `export *` from the
// index) so the browser contract stays visible in one place: add a module here
// only when the canvas really needs it, and a bundling test guards the promise
// that no `node:` import sneaks into the graph.
export * from "./document.ts";
export * from "./patches.ts";
export * from "./operations.ts";
export * from "./selection.ts";
export * from "./consistency.ts";
export * from "./migration.ts";
export * from "./ids.ts";
export * from "./store.ts";
