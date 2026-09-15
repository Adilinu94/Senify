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
