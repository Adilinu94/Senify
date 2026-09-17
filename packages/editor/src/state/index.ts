// Editor document store (rebuild Phase 0, third slice).
//
// The editor state as plain data: the document (`document.ts`), the writes
// (`patches.ts`, `operations.ts`), the selection (`selection.ts`), persistence
// and migration (`migration.ts`), the consistency check (`consistency.ts`) and
// the single write gate that ties them together (`store.ts`).

export * from "./document.ts";
export * from "./patches.ts";
export * from "./operations.ts";
export * from "./selection.ts";
export * from "./consistency.ts";
export * from "./migration.ts";
export * from "./ids.ts";
export * from "./store.ts";
