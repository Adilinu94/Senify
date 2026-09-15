import type { Author, NodeTree } from "@senify/section-sdk";
import type { Theme } from "@senify/tokens";
import type { PatchOp } from "./mutations/contract.ts";

export type SiteProfile = "clean" | "standard" | "showcase";

export const SITE_PROFILES: readonly SiteProfile[] = [
  "clean",
  "standard",
  "showcase",
];

export type Site = {
  id: string;
  name: string;
  slug: string;
  profile: SiteProfile;
  themeId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PageMeta = {
  title?: string;
  description?: string;
  ogImage?: string;
};

export type Page = {
  id: string;
  siteId: string;
  path: string;
  title: string;
  meta: PageMeta;
  draft: NodeTree;
  draftVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type PageSummary = Omit<Page, "draft">;

export type SiteTheme = {
  id: string;
  siteId: string;
  name: string;
  version: number;
  theme: Theme;
  css: string;
  createdAt: string;
  updatedAt: string;
};

export type AuditEntry = {
  id: string;
  siteId: string;
  pageId: string | null;
  batchId: string;
  opIndex: number;
  mutation: string;
  params: Record<string, unknown>;
  author: Author;
  undoPatch: PatchOp[];
  draftVersionAfter: number;
  createdAt: string;
};

export type TokenScope = "read" | "write" | "publish";

export type ApiToken = {
  id: string;
  name: string;
  scopes: TokenScope[];
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type TokenRecord = ApiToken & {
  tokenHash: string;
};

export type McpAuditEntry = {
  id: string;
  tokenId: string | null;
  client: string;
  tool: string;
  args: Record<string, unknown>;
  result: "ok" | "error";
  entity: string | null;
  durationMs: number;
  createdAt: string;
};
