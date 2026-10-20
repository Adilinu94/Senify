// The test helpers (`@senify/core/testing`).
//
// Why a separate subpath: these helpers pull in `pg-mem` (the in-memory
// PostgreSQL) and the Playwright harness. The engine does not need any of
// that at runtime, so `pg-mem` is a DEV dependency of this package - as a
// production dependency it would be pulled into every installation of the
// engine, which needs it for nothing.
//
// The subpath exists so the production bundle never pulls it in: the engine
// imports `@senify/core`, not `@senify/core/testing`.
export * from "./api-harness.ts";
export * from "./bake-harness.ts";
export * from "./mcp-harness.ts";
export * from "./test-db.ts";
