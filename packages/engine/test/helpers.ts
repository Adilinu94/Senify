import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "@sinclair/typebox";
import { createApiHarness, createTestDb, type ApiHarness } from "@senify/core/testing";
import { createRegistry } from "@senify/registry";
import { type NodeTree, type Registry, type SectionDefinition } from "@senify/section-sdk";
import {
  createEngine,
  createPgDb,
  ensureSchema,
  type Db,
  type DbResult,
  type Engine,
  type EngineServer,
  type MailSender,
  type Mutation,
  type RateLimitConfig,
  type ReferenceDiffDeps,
  type ReviewVisualDriver,
  type Row,
} from "@senify/engine";

export const containerSection: SectionDefinition = {
  type: "container",
  version: 1,
  title: "Container",
  description: "Test-only container with children and a named slot.",
  category: "content",
  props: [{ key: "eyebrow", control: "text", label: "Eyebrow" }],
  variants: {
    boxed: { label: "Boxed", preset: { eyebrow: "Boxed default" } },
    full: { label: "Full width", preset: {} },
  },
  slots: {
    side: { max: 2, allowedTypes: ["block"] },
  },
  allowedChildren: ["hero", "container", "block"],
  motionPresets: ["fade-up"],
  golden: {
    tree: {
      type: "container",
      variant: "boxed",
      props: {},
      children: [
        {
          type: "block",
          props: {
            headline: "Golden child",
            count: 1,
            flag: false,
            tone: "soft",
            accent: { $token: "color.accent" },
            target: { url: "https://example.test" },
          },
        },
      ],
    },
    thumbnails: {},
  },
};

export const blockSection: SectionDefinition = {
  type: "block",
  version: 1,
  title: "Block",
  description: "Test-only leaf section covering every fallback prop type.",
  category: "content",
  props: [
    {
      key: "headline",
      control: "text",
      label: "Headline",
      schema: Type.String({ minLength: 1 }),
    },
    { key: "count", control: "number", label: "Count" },
    { key: "flag", control: "boolean", label: "Flag" },
    {
      key: "tone",
      control: "enum",
      label: "Tone",
      options: [
        { value: "soft", label: "Soft" },
        { value: "loud", label: "Loud" },
      ],
    },
    { key: "accent", control: "color", label: "Accent" },
    {
      key: "paddingY",
      control: "scale",
      label: "Vertical padding",
      group: "Styling",
      tokenGroup: "space",
    },
    {
      key: "cardBackground",
      control: "color",
      label: "Card: background",
      group: "Styling",
      part: "card",
      tokenGroup: "color",
    },
    { key: "target", control: "link", label: "Target" },
    { key: "cover", control: "asset", label: "Cover" },
    { key: "body", control: "richtext", label: "Body" },
  ],
  allowedChildren: "none",
  golden: {
    tree: {
      type: "block",
      props: {
        headline: "Golden block",
        count: 2,
        flag: true,
        tone: "soft",
        accent: { $token: "color.accent" },
        target: { url: "https://example.test" },
      },
    },
    thumbnails: {},
  },
};

export const pinnedSection: SectionDefinition = {
  type: "pinned",
  version: 1,
  title: "Pinned",
  description: "Test-only section that allows pin motion presets.",
  category: "content",
  props: [{ key: "headline", control: "text", label: "Headline" }],
  allowedChildren: "none",
  motionPresets: ["scrub-pin", "fade-up"],
  golden: {
    tree: { type: "pinned", props: { headline: "Pinned" } },
    thumbnails: {},
  },
};

export function createTestRegistry(): Registry {
  const registry = createRegistry();
  registry.register(blockSection);
  registry.register(containerSection);
  registry.register(pinnedSection);
  return registry;
}

export type TestDatabase = {
  db: Db;
  close(): Promise<void>;
};

export async function createTestDatabase(): Promise<TestDatabase> {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (connectionString && connectionString.length > 0) {
    const admin = createPgDb(connectionString);
    const schemaName = `senify_test_${Date.now().toString(36)}${Math.floor(Math.random() * 0xffff).toString(36)}`;
    await admin.query(`CREATE SCHEMA "${schemaName}"`);
    const testUrl = new URL(connectionString);
    testUrl.searchParams.set("options", `-c search_path=${schemaName}`);
    const scoped = createPgDb(testUrl.toString());
    // The disposable schema starts empty: run the same migration the engine
    // runs at boot (`createEngine`) so every table/index lives inside the
    // scoped `search_path`. Without this the schema is missing `sites` et al.
    // and a bare `new Store(db)` fails with "relation ... does not exist".
    try {
      await ensureSchema(scoped);
    } catch (error) {
      // Never leave a half-migrated schema (or its tables) behind.
      await scoped.close().catch(() => undefined);
      await admin.query(`DROP SCHEMA "${schemaName}" CASCADE`).catch(() => undefined);
      await admin.close().catch(() => undefined);
      throw error;
    }
    let closed = false;
    return {
      db: scoped,
      async close() {
        if (closed) return;
        closed = true;
        await scoped.close();
        await admin.query(`DROP SCHEMA "${schemaName}" CASCADE`);
        await admin.close();
      },
    };
  }
  console.warn(
    "[engine tests] TEST_DATABASE_URL is not set — running against pg-mem (in-memory). Set TEST_DATABASE_URL to run Prüfstelle 1 against real Postgres.",
  );
  const memory = createTestDb();
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  const db: Db = {
    query: async <R extends Row>(
      text: string,
      params?: readonly unknown[],
    ): Promise<DbResult<R>> => {
      const result = await pool.query(text, params as unknown[] | undefined);
      return { rows: result.rows as R[] };
    },
    // Test double: pg-mem ignores ROLLBACK, so this is sequential rather
    // than atomic. Fidelity tests that need real transactions are
    // gated on TEST_DATABASE_URL (see transactions.test.ts).
    async withTransaction(task) {
      return task(db);
    },
  };
  return {
    db,
    async close() {
      await pool.end();
    },
  };
}

export type BootEnv = {
  engine: Engine;
  server: EngineServer;
  api: ApiHarness;
  // A second token of kind "human": the style-rule fence (ticket 18, slice 3)
  // distinguishes agent and editor writes, so tests need both identities.
  humanApi: ApiHarness;
  registry: Registry;
  // Direct database access for tests that must inspect or seed rows the HTTP
  // surface does not expose (e.g. a stale idempotency claim).
  db: Db;
  token: string;
  close(): Promise<void>;
};

export async function bootEngine(
  options: {
    rateLimits?: RateLimitConfig;
    maxUploadBytes?: number;
    mailSender?: MailSender;
    reviewVisuals?: ReviewVisualDriver;
    referenceDiffs?: ReferenceDiffDeps;
  } = {},
): Promise<BootEnv> {
  const database = await createTestDatabase();
  const registry = createTestRegistry();
  const dataDir = mkdtempSync(join(tmpdir(), "senify-engine-"));
  const engine = await createEngine({
    db: database.db,
    registry,
    dataDir,
    ...(options.maxUploadBytes === undefined
      ? {}
      : { maxUploadBytes: options.maxUploadBytes }),
    ...(options.mailSender === undefined
      ? {}
      : { mailSender: options.mailSender }),
    ...(options.reviewVisuals === undefined
      ? {}
      : { reviewVisuals: options.reviewVisuals }),
    ...(options.referenceDiffs === undefined
      ? {}
      : { referenceDiffs: options.referenceDiffs }),
    // Suites fire hundreds of calls per token; rate-limit behaviour is
    // covered by auth.test.ts with explicit tight limits.
    rateLimits:
      options.rateLimits ?? {
        perMinute: 10_000,
        burst: 10_000,
        destructivePerMinute: 10_000,
      },
  });
  const server = await engine.listen({ port: 0 });
  // Tokens are the only way in: the suite seeds both identities through the
  // Store, because HTTP token management is reserved for human operators.
  const created = await engine.store.createToken({
    name: "engine-tests",
    kind: "agent",
    scopes: ["read", "write", "publish"],
    expiresAt: null,
  });
  const humanCreated = await engine.store.createToken({
    name: "engine-human",
    kind: "human",
    scopes: ["read", "write", "publish"],
    expiresAt: null,
  });
  const api = createApiHarness(server.origin, { token: created.secret });
  const humanApi = createApiHarness(server.origin, { token: humanCreated.secret });
  return {
    engine,
    server,
    api,
    humanApi,
    registry,
    db: database.db,
    token: created.secret,
    async close() {
      await server.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

// The body author stays a suggestion since ticket 18: the engine derives the
// audited author from the bearer token. TEST_AUTHOR is what tests send;
// TOKEN_AUTHOR is what the engine records (the harness token's identity).
export const TEST_AUTHOR = {
  kind: "agent",
  id: "agent-test-1",
  label: "Test Agent",
} as const;

export const TOKEN_AUTHOR = {
  kind: "agent",
  id: "engine-tests",
  label: "engine-tests",
} as const;

// The human identity of the harness: ambient rules and rawCss are a human
// capability (ticket 18, slice 3), so store-level tests need both kinds.
export const HUMAN_AUTHOR = {
  kind: "human",
  id: "engine-human",
  label: "engine-human",
} as const;

export type SiteResponse = {
  id: string;
  name: string;
  slug: string;
  profile: string;
  themeId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PageResponse = {
  id: string;
  siteId: string;
  path: string;
  title: string;
  meta: Record<string, unknown>;
  draft: { rootNodeId: string; nodes: Record<string, Record<string, unknown>> };
  draftVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type MutationsResponse = {
  newDraftVersion: number;
  undoBatchId: string | null;
  warnings: { opIndex?: number; field?: string; message: string; suggestion?: string }[];
  results: { opIndex: number; op: string; undoPatch: Record<string, unknown>[] }[];
};

export type AuditResponse = {
  entries: {
    id: string;
    siteId: string;
    pageId: string;
    batchId: string;
    opIndex: number;
    mutation: string;
    params: Record<string, unknown>;
    author: { kind: string; id: string; label: string };
    undoPatch: Record<string, unknown>[];
    draftVersionAfter: number;
    createdAt: string;
  }[];
};

export type ErrorResponse = {
  error: {
    category: string;
    message: string;
    opIndex?: number;
    field?: string;
    suggestion?: string;
  };
};

export async function createTestSite(
  api: ApiHarness,
  name = "Test Site",
): Promise<SiteResponse> {
  const response = await api.request<SiteResponse>({
    method: "POST",
    path: "/api/sites",
    body: { name },
  });
  if (response.status !== 201) {
    throw new Error(`Site setup failed: ${JSON.stringify(response.body)}`);
  }
  return response.body;
}

export async function createTestPage(
  api: ApiHarness,
  siteId: string,
  body: { title?: string; path?: string } = {},
): Promise<PageResponse> {
  const response = await api.request<PageResponse>({
    method: "POST",
    path: `/api/sites/${siteId}/pages`,
    body,
  });
  if (response.status !== 201) {
    throw new Error(`Page setup failed: ${JSON.stringify(response.body)}`);
  }
  return response.body;
}

export async function applyMutationsRequest(  api: ApiHarness,
  page: PageResponse,
  mutations: Mutation[],
  overrides: {
    baseDraftVersion?: number;
    author?: unknown;
    dry_run?: boolean;
  } = {},
): Promise<{ status: number; body: MutationsResponse & ErrorResponse }> {
  const response = await api.request<MutationsResponse & ErrorResponse>({
    method: "POST",
    path: `/api/pages/${page.id}/mutations`,
    body: {
      baseDraftVersion: overrides.baseDraftVersion ?? page.draftVersion,
      author: "author" in overrides ? overrides.author : TEST_AUTHOR,
      ...(overrides.dry_run === undefined ? {} : { dry_run: overrides.dry_run }),
      mutations,
    },
  });
  return response;
}

export function treeOf(page: PageResponse): NodeTree {
  // Single honest cast at the JSON boundary: HTTP delivers plain JSON,
  // the engine guarantees the NodeTree shape for stored drafts.
  return page.draft as unknown as NodeTree;
}
