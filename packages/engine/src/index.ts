import { createServer } from "node:http";
import type { Registry } from "@senify/section-sdk";
import { ensureSchema, type Db } from "./db.ts";
import { createRequestHandler } from "./http.ts";
import { PageLocks } from "./locks.ts";
import { Store } from "./store.ts";

export { ensureSchema, SCHEMA_STATEMENTS, type Db, type DbClient, type DbResult, type Row } from "./db.ts";
export { createPgDb, type PgDb } from "./pg-db.ts";
export { createId, newEntityId, newNodeId } from "./ids.ts";
export { PageLocks } from "./locks.ts";
export { assertPagePathFormat, draftConflictError, PAGE_PATH_PATTERN } from "./paths.ts";
export { Store, slugify, type CreatePageInput, type CreateSiteInput, type NewAuditEntry } from "./store.ts";
export {
  type AuditEntry,
  type Page,
  type PageMeta,
  type PageSummary,
  type Site,
  type SiteProfile,
  type SiteTheme,
  SITE_PROFILES,
} from "./types.ts";
export {
  MUTATION_OPS,
  parseApplyMutationsBody,
  parseBody,
  validateShape,
  type ApplyMutationsBody,
  type AuthorInput,
  type Mutation,
  type MutationOp,
  type NodeSpec,
  type OverrideBreakpoint,
  type ParentRef,
  type PatchOp,
  type UpdateThemeBody,
} from "./mutations/contract.ts";
export {
  applyMutations,
  applyUndoBatch,
  type ApplyMutationsOptions,
  type ApplyMutationsOutcome,
  type MutationResult,
  type MutationWarning,
  type UndoBatchInput,
} from "./mutations/apply.ts";
export { applyPatchOp, applyTreePatches } from "./mutations/patches.ts";
export { validateTreeIntegrity, type TreeIntegrityIssue } from "./mutations/integrity.ts";
export {
  buildThemeReport,
  type ThemeReport,
  type ThemeReportBrokenRef,
  type ThemeReportContrast,
  type ThemeReportLiteral,
} from "./theme-report.ts";
export { goldenTreeToMutations, type GoldenPlacement } from "./golden.ts";

export type EngineOptions = {
  db: Db;
  registry: Registry;
};

export type EngineServer = {
  origin: string;
  port: number;
  close(): Promise<void>;
};

export type Engine = {
  registry: Registry;
  store: Store;
  locks: PageLocks;
  listen(options?: { port?: number; host?: string }): Promise<EngineServer>;
};

export async function createEngine(options: EngineOptions): Promise<Engine> {
  await ensureSchema(options.db);
  const store = new Store(options.db);
  const locks = new PageLocks();
  const handler = createRequestHandler({
    store,
    registry: options.registry,
    locks,
  });
  return {
    registry: options.registry,
    store,
    locks,
    async listen(listenOptions?: { port?: number; host?: string }): Promise<EngineServer> {
      const server = createServer(handler);
      const host = listenOptions?.host ?? "127.0.0.1";
      const port = listenOptions?.port ?? 0;
      await new Promise<void>((resolve, reject) => {
        const onError = (error: unknown): void => reject(error);
        server.once("error", onError);
        server.listen(port, host, () => {
          server.removeListener("error", onError);
          resolve();
        });
      });
      const address = server.address();
      const actualPort =
        typeof address === "object" && address !== null ? address.port : port;
      const originHost = host === "0.0.0.0" ? "127.0.0.1" : host;
      return {
        origin: `http://${originHost}:${actualPort}`,
        port: actualPort,
        close: () =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) reject(error);
              else resolve();
            });
          }),
      };
    },
  };
}
