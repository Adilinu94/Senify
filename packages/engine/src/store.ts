import { createHash, randomBytes } from "node:crypto";
import { SenifyError } from "@senify/core";
import { publishSecretFile, readSecretFile } from "./secrets.ts";
import type { Breakpoints } from "@senify/widget-engine/breakpoints";
import { RULE_ID_PATTERN } from "@senify/framer-import";
import {
  type Author,
  type NodeTree,
} from "@senify/section-sdk";
import type { DesignRecord } from "./design-report.ts";
import type { SiteFileRef } from "./storage.ts";
import type { ReleaseAssetSnapshot } from "./types.ts";
import {
  mergeThemePatch,
  ThemeSchema,
  validateTheme,
  type Theme,
} from "@senify/tokens";
import {
  normalizeRuleOrder,
  parseStyleRuleRegistry,
  type StyleRule,
} from "@senify/widget-engine";
import type { Db, DbClient, Row } from "./db.ts";
import type { ImportReport } from "./imports-contract.ts";
import { jsonColumns, tableNames } from "./db.ts";
import type { RedesignProposal } from "./redesign-proposal-contract.ts";
import { buildAuditInsert, type NewAuditEntry } from "./store-audit.ts";
import {
  StyleRuleStore,
  assertWritableRule,
  type CreateStyleRuleInput,
  type StyleRuleRow,
  type StyleRuleUpdatePatch,
} from "./store-style-rules.ts";
import { newEntityId, newNodeId } from "./ids.ts";
import {
  assetStorageRef,
  historyStorageRef,
  storedFileName,
  variantStorageRef,
} from "./storage.ts";
import { validateShape } from "./mutations/contract.ts";
import { assertPagePathFormat, draftConflictError } from "./paths.ts";
import type { GeneratedVariant } from "./variants.ts";
import {
  type ApiToken,
  type Asset,
  type AssetFolder,
  type AssetHistoryEntry,
  type AssetStatus,
  type AssetUpdate,
  type AssetUsage,
  type AuditEntry,
  type CodePayload,
  type CodePayloadKind,
  type CodePayloadLicense,
  type CodePayloadProvenance,
  type Collection,
  type ImportJob,
  type ImportReceipt,
  type Deployment,
  type DeploySettings,
  type EngineSettings,
  type Entry,
  type EntryRedirect,
  type EntryVersion,
  type FormSnapshotRecord,
  type ImageJob,
  type ImageSettings,
  type McpAuditEntry,
  type NewsletterToken,
  type NotificationMessage,
  type Page,
  type PageMeta,
  type PageRevision,
  type PageSummary,
  type PageTemplate,
  type Preview,
  type ProviderCooldown,
  type ReleaseManifest,
  type Reference,
  type ReferenceAssignment,
  type BakeJob,
  type ReferenceCollection,
  type ReferenceCollectionKind,
  type ReferenceJob,
  type ReferenceListSort,
  type ReferenceProfileRevision,
  type ReferenceSettings,
  type ReferenceSummary,
  type Release,
  type ReviewItem,
  type RevisionSummary,
  type DesignContract,
  type LibraryAuditEntry,
  type LibraryComponent,
  type LibraryInstall,
  type Site,
  type SiteTheme,
  type SmtpSettingsRecord,
  type TokenKind,
  type TokenRecord,
} from "./types.ts";

import {
  ASSET_COLUMNS,
  mapAsset,
  type AssetRow,
} from "./store-record-mappers.ts";
import { PagesRepository, type CreatePageInput } from "./store-pages.ts";
import { TokensRepository, type CreateTokenInput } from "./store-tokens.ts";
import { ThemesRepository, type SiteThemeRow } from "./store-themes.ts";
import {
  SitesRepository,
  type CreateSiteInput,
} from "./store-sites.ts";
import {
  PAGE_WRITE_COLUMNS,
  type PageRow,
  mapPage,
} from "./store-page-mappers.ts";
import {
  slugify,
  toFiniteNumber,
  toIso,
  toJson,
  toJsonParam,
} from "./store-row-utils.ts";
import {
  LibraryRepository,
  type LibraryCreateInput,
  type LibraryInstallInput,
  type LibraryPatchInput,
} from "./store-library.ts";
import {
  BakeJobsRepository,
  type ClaimBakeJobInput,
  type EnqueueBakeJobInput,
  type FailBakeJobInput,
} from "./store-bake-jobs.ts";
import { CodePayloadsRepository, type CreateCodePayloadInput } from "./store-code-payloads.ts";
import {
  type CollectionUpdate,
  CollectionsRepository,
  type CreateCollectionInput,
  type ListCollectionsOptions,
} from "./store-collections.ts";
import {
  type CreateDesignRecordInput,
  DesignRecordsRepository,
  type ListDesignRecordsOptions,
} from "./store-design-records.ts";
import { FormsRepository, type SaveFormSnapshotInput } from "./store-forms.ts";
import {
  type CreateImportJobInput,
  ImportJobsRepository,
  type UpdateImportJobInput,
} from "./store-import-jobs.ts";
import {
  AssetFoldersRepository,
  type CreateAssetFolderInput,
  type CreateAssetHistoryInput,
} from "./store-asset-folders.ts";
import { AssetsRepository, type CreateAssetInput } from "./store-assets.ts";
import {
  IdempotencyRepository,
  type ClaimIdempotencyKeyInput,
  type CompleteIdempotencyKeyInput,
  type IdempotencyClaim,
  type IdempotencySlotInput,
} from "./store-idempotency.ts";
import {
  type ClaimImageJobInput,
  type EnqueueImageJobInput,
  type FailImageJobInput,
  type ImageJobResult,
  ImageJobsRepository,
  type ListImageJobsOptions,
  type SetImageJobProviderInput,
  type SetProviderCooldownInput,
} from "./store-image-jobs.ts";
import {
  type CreatePreviewInput,
  type CreateReviewItemInput,
  type ListReviewItemsOptions,
  type ReviewItemPatch,
  ReviewsRepository,
} from "./store-reviews.ts";
import {
  type CreateDeploymentInput,
  DeployRepository,
  type DeploySettingsPatch,
  type FinishDeploymentInput,
} from "./store-deploy.ts";
import {
  type CreateEntryInput,
  type CreateEntryRedirectInput,
  type CreateEntryVersionInput,
  EntriesRepository,
  type ListEntriesFilter,
  type UpdateEntryRowInput,
} from "./store-entries.ts";
import { type AppendMcpAuditInput, McpAuditRepository } from "./store-mcp-audit.ts";
import {
  type ClaimRedesignProposalInput,
  type ClaimRedesignProposalResult,
  type CreateRedesignProposalInput,
  type FinalizeRedesignProposalInput,
  type ListRedesignProposalsOptions,
  type RecordMediaNeedResolutionsInput,
  RedesignProposalsRepository,
} from "./store-redesign-proposals.ts";
import { type CreateRevisionInput, RevisionsRepository } from "./store-revisions.ts";
import {
  type CreateReferenceCollectionInput,
  ReferenceLibraryRepository,
  type ReferenceCollectionPatch,
} from "./store-reference-library.ts";
import {
  ReferencesRepository,
  type CreateReferenceInput,
  type CreateReferenceJobInput,
  type CreateReferenceProfileRevisionInput,
  type DeleteReferenceAssignmentInput,
  type ReferenceDuplicate,
  type ReferencePatch,
  type ReferenceSearchHit,
  type UpdateReferenceJobInput,
  type UpsertReferenceAssignmentInput,
} from "./store-references.ts";
import {
  type CreateNewsletterTokenInput,
  type EnqueueNotificationInput,
  type MarkNotificationResultInput,
  NotificationsRepository,
} from "./store-notifications.ts";
import {
  type ActivateReleaseInput,
  type CreateReleaseInput,
  type FinalizeReleaseInput,
  ReleasesRepository,
} from "./store-releases.ts";
import {
  SettingsRepository,
  type EngineSettingsPatch,
  type ImageSettingsPatch,
  type ReferenceSettingsPatch,
  type SmtpSettingsPatch,
} from "./store-settings.ts";
import {
  IMPORT_JOB_COLUMNS,
  type ImportJobRow,
  type ImportReceiptRow,
  mapImportJob,
  mapImportReceipt,
} from "./store-job-mappers.ts";



// `CreatePageInput` stand bis P3-2 Schritt 30 hier. Es beschreibt den Aufruf
// von `createPage`, also gehoert es zum Seiten-Modul; der Export bleibt an
// dieser Stelle, damit `index.ts` und jeder Aufrufer seine Import-Quelle
// behalten (ADR-0019, Punkt 8).
export type { CreatePageInput } from "./store-pages.ts";

// `CreateSiteInput` und `mapSite` standen bis P3-2 Schritt 34 hier. Sie
// beschreiben den Aufruf von `createSite` und seine Zeile, gehoeren also zum
// Site-Modul; die Exporte bleiben an dieser Stelle, damit `index.ts` und jeder
// Aufrufer ihre Import-Quelle behalten (ADR-0019, Punkt 8).
export { mapSite } from "./store-sites.ts";
export type { CreateSiteInput, SiteRow } from "./store-sites.ts";

// The audit entry shape and its INSERT builder moved to `store-audit.ts`
// (P3-2): the style-rule registry writes into the same log, and a second
// copy of the INSERT would drift the moment a column is added.
export type { NewAuditEntry } from "./store-audit.ts";

export type PreparedCodePayload = {
  id: string;
  name: string;
  kind: CodePayloadKind;
  bundle: string;
  provenance: CodePayloadProvenance;
  license: CodePayloadLicense;
};

export type FramerImportCommitPlan = {
  siteId: string;
  jobId: string;
  contentKey: string;
  requestFingerprint: string;
  author: Author;
  target:
    | { kind: "new"; path: string; title: string }
    | { kind: "page"; pageId: string; baseDraftVersion: number };
  draft: NodeTree;
  // The SEO head the source stated; merged over the page's own meta.
  pageMeta?: PageMeta;
  payloads: readonly PreparedCodePayload[];
  styleRules: readonly StyleRule[];
  themePatch: Record<string, unknown> | null;
  // The breakpoint pair of the source (ADR-0020) when the import is to set it
  // for the site; `null` leaves the site's pair as it is.
  breakpoints?: Breakpoints | null;
  report: Omit<
    ImportReport,
    "pageId" | "newDraftVersion" | "receiptId" | "replayed"
  >;
};

export type FramerImportCommitResult = {
  receipt: ImportReceipt;
  job: ImportJob;
  report: ImportReport;
  replayed: boolean;
};

export type { EngineSettingsPatch, ImageSettingsPatch, SmtpSettingsPatch } from "./store-settings.ts";

// `slugify` stand bis P3-2 Schritt 28 in dieser Datei. Es gehoert zu den
// Zeilen-Helfern (es bildet einen Namen auf einen lesbaren Handle ab) und wird
// jetzt auch vom Library-Modul gebraucht; der Export bleibt hier, damit die
// fuenf Aufrufer im Engine-Paket ihre Import-Quelle behalten.
export { slugify } from "./store-row-utils.ts";

export class Store {
  readonly #db: Db;

  // The style-rule registry (P3-2 extraction). It reads the theme through the
  // Store, because the site theme row belongs to the Store; everything else
  // the registry does, it does with its own handle on the database.
  readonly #styleRules: StyleRuleStore;
  readonly #forms: FormsRepository;
  readonly #settings: SettingsRepository;
  readonly #releases: ReleasesRepository;
  readonly #deploy: DeployRepository;
  readonly #notifications: NotificationsRepository;
  readonly #referenceLibrary: ReferenceLibraryRepository;
  readonly #entries: EntriesRepository;
  readonly #bakeJobs: BakeJobsRepository;
  readonly #reviews: ReviewsRepository;
  readonly #imageJobs: ImageJobsRepository;
  readonly #collections: CollectionsRepository;
  readonly #codePayloads: CodePayloadsRepository;
  readonly #idempotency: IdempotencyRepository;
  readonly #designRecords: DesignRecordsRepository;
  readonly #mcpAudit: McpAuditRepository;
  readonly #revisions: RevisionsRepository;
  readonly #redesignProposals: RedesignProposalsRepository;
  readonly #importJobs: ImportJobsRepository;
  readonly #assetFolders: AssetFoldersRepository;
  readonly #assets: AssetsRepository;
  readonly #library: LibraryRepository;
  readonly #pages: PagesRepository;
  readonly #tokens: TokensRepository;
  readonly #sites: SitesRepository;
  readonly #themes: ThemesRepository;
  readonly #references: ReferencesRepository;

  // Where the encryption key lives. Without it (a bare Store in a test) the key
  // stays in the database, as before.
  readonly #secretFile: string | undefined;
  #engineSecret: Promise<string> | undefined;

  constructor(db: Db, options: { secretFile?: string } = {}) {
    this.#db = db;
    this.#styleRules = new StyleRuleStore(db, (siteId) => this.getTheme(siteId));
    this.#forms = new FormsRepository(db);
    this.#settings = new SettingsRepository(db);
    this.#releases = new ReleasesRepository(db);
    this.#deploy = new DeployRepository(db, (siteId) => this.getSite(siteId));
    this.#notifications = new NotificationsRepository(db);
    this.#referenceLibrary = new ReferenceLibraryRepository(db);
    this.#references = new ReferencesRepository(db, this.#referenceLibrary);
    this.#entries = new EntriesRepository(db);
    this.#bakeJobs = new BakeJobsRepository(db);
    this.#reviews = new ReviewsRepository(db);
    this.#imageJobs = new ImageJobsRepository(db);
    this.#collections = new CollectionsRepository(db, (siteId) => this.getSite(siteId));
    this.#codePayloads = new CodePayloadsRepository(db, (siteId) => this.getSite(siteId));
    this.#idempotency = new IdempotencyRepository(db);
    this.#designRecords = new DesignRecordsRepository(db);
    this.#mcpAudit = new McpAuditRepository(db);
    this.#revisions = new RevisionsRepository(db);
    this.#redesignProposals = new RedesignProposalsRepository(db);
    this.#importJobs = new ImportJobsRepository(db, (siteId) => this.getSite(siteId));
    this.#assetFolders = new AssetFoldersRepository(
      db,
      (siteId) => this.getSite(siteId),
      (assetId) => this.getAsset(assetId),
    );
    this.#assets = new AssetsRepository(db, (siteId) => this.getSite(siteId));
    this.#tokens = new TokensRepository(db);
    this.#themes = new ThemesRepository(db, {
      getSite: (siteId) => this.getSite(siteId),
    });
    this.#sites = new SitesRepository(db, {
      getEngineSettings: () => this.getEngineSettings(),
      ensureSiteTheme: (siteId) => this.#themes.ensureSiteTheme(siteId),
      listPagePaths: (siteId) => this.#pages.listPagePaths(siteId),
    });
    this.#pages = new PagesRepository(db, {
      getSite: (siteId) => this.getSite(siteId),
    });
    this.#library = new LibraryRepository(db, {
      getSite: (siteId) => this.getSite(siteId),
      getPage: (pageId) => this.#pages.getPage(pageId),
      listPages: (siteId) => this.#pages.listPages(siteId),
      persistBatch: (input) => this.#pages.persistBatch(input),
      appendAudit: (entries) => this.#pages.appendAudit(entries),
    });
    this.#secretFile = options.secretFile;
  }

  // Die Sites liegen in `store-sites.ts` (P3-2, Schritt 34): die Tabelle, der
  // Papierkorb, der Design-Contract und die Basis-URL. Zwei Naht-Funktionen
  // reichen hinein (Engine-Einstellungen, Theme-Anlage), weil beides eigene
  // Fachgebiete sind, die noch am Store liegen.
  createSite(input: CreateSiteInput): Promise<Site> {
    return this.#sites.createSite(input);
  }

  listSites(): Promise<Site[]> {
    return this.#sites.listSites();
  }

  getSite(id: string): Promise<Site> {
    return this.#sites.getSite(id);
  }

  updateSiteBreakpoints(id: string, raw: unknown): Promise<Site> {
    return this.#sites.updateSiteBreakpoints(id, raw);
  }

  updateSiteBaseUrl(id: string, raw: string | null): Promise<Site> {
    return this.#sites.updateSiteBaseUrl(id, raw);
  }

  getDesignContract(siteId: string): Promise<DesignContract | null> {
    return this.#sites.getDesignContract(siteId);
  }

  updateDesignContract(
    siteId: string,
    contract: {
      constants: string[];
      never: string[];
      vocabulary: string[];
    } | null,
  ): Promise<DesignContract | null> {
    return this.#sites.updateDesignContract(siteId, contract);
  }

  refreshDesignContractFromReferences(
    siteId: string,
    profiles: readonly {
      constants: readonly string[];
      never: readonly string[];
      vocabulary: readonly string[];
    }[],
  ): Promise<DesignContract | null> {
    return this.#sites.refreshDesignContractFromReferences(siteId, profiles);
  }

  deleteSite(id: string): Promise<{ fileRefs: SiteFileRef[] }> {
    return this.#sites.deleteSite(id);
  }

  renameSite(id: string, name: string): Promise<Site> {
    return this.#sites.renameSite(id, name);
  }

  updateSiteProfile(id: string, profile: Site["profile"]): Promise<Site> {
    return this.#sites.updateSiteProfile(id, profile);
  }

  trashSite(id: string): Promise<Site> {
    return this.#sites.trashSite(id);
  }

  restoreSite(id: string): Promise<Site> {
    return this.#sites.restoreSite(id);
  }

  listTrashedSites(): Promise<(Site & { trashedAt: string })[]> {
    return this.#sites.listTrashedSites();
  }

  listSiteSlugs(): Promise<string[]> {
    return this.#sites.listSiteSlugs();
  }

  listPagePaths(siteId: string): Promise<string[]> {
    return this.#pages.listPagePaths(siteId);
  }


  async applyRedesignPlan(
    plan: {
      targetSite: { id: string; name: string; slug: string; profile: string; withContent: boolean };
      // The duplicate's own theme row, created from the source definition and
      // then patched by `themeWrite`.
      themeId: string;
      startPage: { id: string; title: string; path: string } | null;
      copiedPages: {
        sourcePageId: string;
        targetPageId: string;
        path: string;
        title: string;
        meta: unknown;
        draft: unknown;
        draftVersion: number;
      }[];
      themeWrite: { themeId: string; expectedVersion: number; patch: Record<string, unknown> } | null;
      pageWrites: {
        pageId: string;
        expectedVersion: number;
        draft: unknown;
        title: string;
        path: string;
      }[];
      auditEntries: NewAuditEntry[];
    },
    input: {
      now: string;
      author: Author;
      sourceSite: Site;
      themeDefinition: unknown;
      proposalClaim: { proposalId: string; directionId: string; decision: unknown } | null;
      proposalFinalize: { proposalId: string; applyResult: unknown } | null;
    },
  ): Promise<void> {
    await this.#db.withTransaction(async (tx) => {
      // The decision is claimed inside the same transaction as its effects, so
      // a rollback removes both together.
      if (input.proposalClaim !== null) {
        const locked = await tx.query<{ status: string; expires_at: unknown }>(
          `SELECT status, expires_at FROM redesign_proposals WHERE id = $1 FOR UPDATE`,
          [input.proposalClaim.proposalId],
        );
        const row = locked.rows[0];
        if (row === undefined) {
          throw new SenifyError("not_found", "The redesign proposal does not exist", {
            field: "proposalId",
          });
        }
        if (row.status === "expired") {
          // Aged out (P2-3, R2). Its own message, because "already decided"
          // would be a lie: nobody decided this one, it simply ran out of time.
          throw new SenifyError(
            "conflict",
            "This direction expired before anyone decided it",
            {
              field: "proposalId",
              suggestion:
                "Create a new proposal for the page. The source page may have changed since this one was derived.",
            },
          );
        }
        if (row.status !== "proposed") {
          throw new SenifyError("conflict", "The direction was already decided", {
            field: "proposalId",
          });
        }
        // The deadline is checked here, inside the claim, not only in the list
        // sweep: a confirm that arrives between two sweeps must still lose
        // against its own expiry rather than write a plan nobody can take back.
        if (row.expires_at !== null && row.expires_at !== undefined) {
          const expiresAt = toIso(row.expires_at);
          if (Date.parse(expiresAt) <= Date.parse(input.now)) {
            // The row is still `proposed`, so move it to its end state in this
            // transaction; the rollback removes it again if the apply fails.
            await tx.query(
              `UPDATE redesign_proposals SET status = 'expired' WHERE id = $1`,
              [input.proposalClaim.proposalId],
            );
            throw new SenifyError(
              "conflict",
              "This direction expired before anyone decided it",
              {
                field: "proposalId",
                suggestion:
                  "Create a new proposal for the page. The source page may have changed since this one was derived.",
              },
            );
          }
        }
        await tx.query(
          `UPDATE redesign_proposals SET status = 'applying', decision = $2 WHERE id = $1`,
          [input.proposalClaim.proposalId, toJsonParam(input.proposalClaim.decision)],
        );
      }

      const target = plan.targetSite;
      await tx.query(
        `INSERT INTO sites (id, name, slug, profile, theme_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NULL, $5, $5)`,
        [target.id, target.name, target.slug, target.profile, input.now],
      );
      // The copy's theme row. Its id comes from the plan so the theme write
      // below targets this row and not the source site's theme.
      await tx.query(
        `INSERT INTO themes (id, site_id, name, definition, version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 1, $5, $5)`,
        [
          plan.themeId,
          target.id,
          input.sourceSite.name,
          toJsonParam(input.themeDefinition),
          input.now,
        ],
      );
      await tx.query(`UPDATE sites SET theme_id = $2 WHERE id = $1`, [target.id, plan.themeId]);

      if (plan.startPage !== null) {
        const rootId = newNodeId();
        await tx.query(
          `INSERT INTO pages (id, site_id, path, title, meta, draft, draft_version, created_at, updated_at)
           VALUES ($1, $2, $3, $4, '{}'::jsonb, $5, 1, $6, $6)`,
          [
            plan.startPage.id,
            target.id,
            plan.startPage.path,
            plan.startPage.title,
            toJsonParam({ rootNodeId: rootId, nodes: { [rootId]: { id: rootId, type: "page", props: {} } } }),
            input.now,
          ],
        );
      }

      // The copy's own page rows come first, so the seeded draft writes below
      // land in the target site and never touch the source.
      for (const page of plan.copiedPages) {
        await tx.query(
          `INSERT INTO pages (id, site_id, path, title, meta, draft, draft_version, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
          [
            page.targetPageId,
            target.id,
            page.path,
            page.title,
            toJsonParam(page.meta),
            toJsonParam(page.draft),
            page.draftVersion,
            input.now,
          ],
        );
      }

      for (const page of plan.pageWrites) {
        const updated = await tx.query<{ draft_version: unknown }>(
          `UPDATE pages SET draft = $4, title = $5, path = $6,
             draft_version = draft_version + 1, updated_at = $3
           WHERE id = $1 AND site_id = $2 AND draft_version = $7
           RETURNING draft_version`,
          [
            page.pageId,
            target.id,
            input.now,
            toJsonParam(page.draft),
            page.title,
            page.path,
            page.expectedVersion,
          ],
        );
        if (updated.rows.length === 0) {
          throw draftConflictError(page.expectedVersion, page.expectedVersion + 1);
        }
      }

      if (plan.themeWrite !== null) {
        // Same merge and validation as `updateTheme`, so a prepared plan cannot
        // write a theme the direct path would have refused.
        const currentDefinition = toJson<Theme>(input.themeDefinition);
        const merged = mergeThemePatch(currentDefinition, plan.themeWrite.patch);
        merged.id = plan.themeWrite.themeId;
        validateShape(ThemeSchema, merged, "theme");
        const issues = validateTheme(merged);
        const first = issues[0];
        if (first !== undefined) {
          throw new SenifyError(
            "validation",
            `Theme ist ungültig: ${first.message}`,
            { field: "theme", suggestion: first.suggestion },
          );
        }
        const updated = await tx.query<{ version: unknown }>(
          `UPDATE themes SET definition = $3, version = version + 1, updated_at = $4
           WHERE id = $1 AND version = $2 RETURNING version`,
          [
            plan.themeWrite.themeId,
            plan.themeWrite.expectedVersion,
            toJsonParam(merged),
            input.now,
          ],
        );
        if (updated.rows.length === 0) {
          throw new SenifyError("conflict", "The theme changed while the redesign was prepared", {
            field: "theme",
            suggestion: "Confirm the direction again.",
          });
        }
      }

      if (plan.auditEntries.length > 0) {
        const insert = buildAuditInsert(
          plan.auditEntries.map((entry) => ({ ...entry, author: input.author })),
        );
        await tx.query(insert.text, insert.params);
      }

      if (input.proposalFinalize !== null) {
        const finalized = await tx.query(
          `UPDATE redesign_proposals
             SET status = 'applied', apply_result = $2
           WHERE id = $1 RETURNING id`,
          [
            input.proposalFinalize.proposalId,
            toJsonParam(input.proposalFinalize.applyResult),
          ],
        );
        if (finalized.rows.length === 0) {
          throw new SenifyError("conflict", "The redesign proposal is not in the applying state", {
            field: "proposalId",
          });
        }
      }
    });
  }

  // Writes a page's draft without going through the mutation pipeline. Only
  // the site duplicate uses it, to point the copied drafts at the copied media
  // (ADR-0014); every normal edit still goes through `applyMutations`.
  async replacePageDraft(pageId: string, draft: NodeTree): Promise<number> {
    const result = await this.#db.query<{ draft_version: unknown }>(
      `UPDATE pages SET draft = $2, draft_version = draft_version + 1, updated_at = $3
       WHERE id = $1 RETURNING draft_version`,
      [pageId, toJsonParam(draft), new Date().toISOString()],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new SenifyError("not_found", `Page "${pageId}" does not exist`, {
        field: "pageId",
      });
    }
    return toFiniteNumber(row.draft_version, "draft_version");
  }

  // Undoes a record copy whose files could not be written (ADR-0014). A file
  // copy can fail after the rows committed, and rows without files would bake
  // into silently broken images.
  async deleteCopiedAssetRecords(
    targetSiteId: string,
    idMap: ReadonlyMap<string, string>,
  ): Promise<void> {
    const ids = [...idMap.values()];
    if (ids.length === 0) return;
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
    await this.#db.withTransaction(async (tx) => {
      await tx.query(
        `DELETE FROM asset_history WHERE asset_id IN (${placeholders})`,
        ids,
      );
      await tx.query(
        `DELETE FROM asset_variants WHERE asset_id IN (${placeholders})`,
        ids,
      );
      await tx.query(
        `DELETE FROM asset_blurhash WHERE asset_id IN (${placeholders})`,
        ids,
      );
      await tx.query(
        `DELETE FROM assets WHERE site_id = $1 AND id IN (${placeholders})`,
        [targetSiteId, ...ids],
      );
    });
  }

  // A copy is a fresh project: pages, theme and collection schemas come
  // along; entries are copied as drafts (no publish state carries over). The
  // media the pages use are copied as well (ADR-0014) — see `copySiteAssets`
  // in media.ts, which owns the files and calls `duplicateAssetRecords` here.
  async duplicateSite(
    sourceId: string,
    options: { withContent: boolean; author: Author; targetSiteId?: string },
  ): Promise<Site> {
    return (await this.duplicateSiteWithPlan(sourceId, options)).site;
  }

  // Same as `duplicateSite`, but it also hands back the source-to-target page
  // and collection id maps. The media copy needs them to rewrite the copied
  // drafts' asset references (ADR-0014).
  async duplicateSiteWithPlan(
    sourceId: string,
    options: { withContent: boolean; author: Author; targetSiteId?: string },
  ): Promise<{ site: Site; pageIds: Map<string, string>; collectionIds: Map<string, string> }> {
    const source = await this.getSite(sourceId);
    const now = new Date().toISOString();
    const name = `${source.name} (Kopie)`;
    const taken = new Set(
      (
        await this.#db.query<{ slug: string }>(`SELECT slug FROM sites`)
      ).rows.map((row) => row.slug),
    );
    const base = slugify(name);
    let slug = base;
    for (let attempt = 2; taken.has(slug) && attempt < 100; attempt += 1) {
      slug = `${base}-${attempt}`;
    }
    if (taken.has(slug)) {
      throw new SenifyError("conflict", `Site slug "${base}" is already in use`, {
        field: "slug",
        suggestion: "Rename the source site or free the slug.",
      });
    }

    const themeRow = (
      await this.#db.query<{
        name: string;
        definition: unknown;
        version: unknown;
      }>(`SELECT name, definition, version FROM themes WHERE site_id = $1`, [
        sourceId,
      ])
    ).rows[0];
    const pageRows = (
      await this.#db.query<{
        id: string;
        path: string;
        title: string;
        meta: unknown;
        draft: unknown;
        draft_version: unknown;
      }>(
        `SELECT id, path, title, meta, draft, draft_version FROM pages WHERE site_id = $1 ORDER BY created_at ASC, id ASC`,
        [sourceId],
      )
    ).rows;
    const collectionRows = (
      await this.#db.query<{
        id: string;
        name: string;
        slug: string;
        fields: unknown;
        title_field: string;
        date_field: string | null;
        url_pattern: string | null;
        supports: unknown;
        list_columns: unknown;
        description: string | null;
        deprecated_at: unknown;
      }>(
        `SELECT id, name, slug, fields, title_field, date_field, url_pattern, supports, list_columns, description, deprecated_at
         FROM collections WHERE site_id = $1 ORDER BY created_at ASC, id ASC`,
        [sourceId],
      )
    ).rows;
    const entryRows = options.withContent
      ? (
          await this.#db.query<{
            collection_id: string;
            slug: string;
            cells: unknown;
            search_text: string;
          }>(
            `SELECT collection_id, slug, cells, search_text FROM entries
             WHERE site_id = $1 AND deleted_at IS NULL
             ORDER BY created_at ASC, id ASC`,
            [sourceId],
          )
        ).rows
      : [];

    const siteId = options.targetSiteId ?? newEntityId();
    const pageIds = new Map<string, string>();
    const collectionIds = new Map<string, string>();
    await this.#db.withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO sites (id, name, slug, profile, theme_id, breakpoints_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NULL, $5, $6, $6)`,
        [
          siteId,
          name,
          slug,
          source.profile,
          // The copy keeps the pair: its pages were laid out for these numbers.
          source.breakpoints === undefined ? null : toJsonParam(source.breakpoints),
          now,
        ],
      );
      if (themeRow) {
        const themeId = newEntityId();
        await tx.query(
          `INSERT INTO themes (id, site_id, name, definition, version, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $6)`,
          [
            themeId,
            siteId,
            themeRow.name,
            toJsonParam(themeRow.definition),
            themeRow.version,
            now,
          ],
        );
        await tx.query(`UPDATE sites SET theme_id = $2 WHERE id = $1`, [
          siteId,
          themeId,
        ]);
      }
      for (const page of pageRows) {
        const newPageId = newEntityId();
        pageIds.set(page.id, newPageId);
        await tx.query(
          `INSERT INTO pages (id, site_id, path, title, meta, draft, draft_version, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
          [
            newPageId,
            siteId,
            page.path,
            page.title,
            toJsonParam(page.meta),
            toJsonParam(page.draft),
            page.draft_version,
            now,
          ],
        );
      }
      for (const collection of collectionRows) {
        const newId = newEntityId();
        collectionIds.set(collection.id, newId);
        await tx.query(
          `INSERT INTO collections (id, site_id, name, slug, fields, title_field, date_field, url_pattern, supports, list_columns, description, deprecated_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
          [
            newId,
            siteId,
            collection.name,
            collection.slug,
            toJsonParam(collection.fields),
            collection.title_field,
            collection.date_field,
            collection.url_pattern,
            toJsonParam(collection.supports),
            toJsonParam(collection.list_columns),
            collection.description,
            collection.deprecated_at,
            now,
          ],
        );
      }
      for (const entry of entryRows) {
        const collectionId = collectionIds.get(entry.collection_id);
        if (!collectionId) continue;
        await tx.query(
          `INSERT INTO entries (id, site_id, collection_id, slug, status, cells, active_version_id, version, author, search_text, published_at, scheduled_at, deleted_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'draft', $5, NULL, 1, $6, $7, NULL, NULL, NULL, $8, $8)`,
          [
            newEntityId(),
            siteId,
            collectionId,
            entry.slug,
            toJsonParam(entry.cells),
            toJsonParam(options.author),
            entry.search_text,
            now,
          ],
        );
      }
    });
    await this.recordSiteEvent({
      siteId,
      mutation: "duplicate_site",
      params: {
        sourceSiteId: sourceId,
        withContent: options.withContent,
        pages: pageRows.length,
        entries: entryRows.length,
      },
      author: options.author,
    });
    return { site: await this.getSite(siteId), pageIds, collectionIds };
  }

  // Copies the media records of one site into another (ADR-0014). Every target
  // id and every storage ref is new, so the two sites share no file: a purge on
  // one side cannot take the other down. Files live in media.ts; this method
  // only writes rows and returns the id map the caller needs.
  async duplicateAssetRecords(input: {
    sourceSiteId: string;
    targetSiteId: string;
    assetIds: ReadonlySet<string>;
    now: string;
  }): Promise<{
    idMap: Map<string, string>;
    // source asset id → source history id → new history id, so the caller can
    // place the history files on exactly the ids the copied rows carry.
    historyIds: Map<string, Map<string, string>>;
    folders: number;
    assets: number;
  }> {
    const idMap = new Map<string, string>();
    const historyIds = new Map<string, Map<string, string>>();
    const folderMap = new Map<string, string>();
    return this.#db.withTransaction(async (tx) => {
      const folders = (
        await tx.query<{ id: string; name: string; parent_id: string | null }>(
          `SELECT id, name, parent_id FROM asset_folders WHERE site_id = $1
           ORDER BY created_at ASC, id ASC`,
          [input.sourceSiteId],
        )
      ).rows;
      for (const folder of folders) {
        const newId = newEntityId();
        folderMap.set(folder.id, newId);
        await tx.query(
          `INSERT INTO asset_folders (id, site_id, name, parent_id, created_at)
           VALUES ($1, $2, $3, NULL, $4)`,
          [newId, input.targetSiteId, folder.name, input.now],
        );
      }
      for (const folder of folders) {
        const parent = folder.parent_id === null ? null : folderMap.get(folder.parent_id) ?? null;
        await tx.query(`UPDATE asset_folders SET parent_id = $2 WHERE id = $1`, [
          folderMap.get(folder.id),
          parent,
        ]);
      }

      if (input.assetIds.size === 0) {
        return { idMap, historyIds, folders: folders.length, assets: 0 };
      }
      const wanted = [...input.assetIds];
      const placeholders = wanted.map((_, index) => `$${index + 2}`).join(", ");
      const assets = (
        await tx.query<AssetRow>(
          `SELECT ${ASSET_COLUMNS} FROM assets
           WHERE site_id = $1 AND id IN (${placeholders})
           ORDER BY created_at ASC, id ASC`,
          [input.sourceSiteId, ...wanted],
        )
      ).rows;
      for (const row of assets) {
        const source = mapAsset(row);
        const newId = newEntityId();
        idMap.set(source.id, newId);
        const storageRef = assetStorageRef(
          input.targetSiteId,
          newId,
          source.filename,
        );
        const folderId =
          source.folderId === null ? null : folderMap.get(source.folderId) ?? null;
        await tx.query(
          `INSERT INTO assets (id, site_id, filename, mime, kind, byte_size, width, height,
             hash, alt_text, decorative, folder_id, tags, storage_ref, status,
             replaced_at, trashed_at, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18)`,
          [
            newId,
            input.targetSiteId,
            source.filename,
            source.mime,
            source.kind,
            source.byteSize,
            source.width,
            source.height,
            source.hash,
            source.altText,
            source.decorative,
            folderId,
            toJsonParam(source.tags),
            storageRef,
            source.status,
            source.replacedAt,
            source.trashedAt,
            input.now,
          ],
        );

        const variants = (
          await tx.query<{ id: string; width: number; format: string; byte_size: number }>(
            `SELECT id, width, format, byte_size FROM asset_variants WHERE asset_id = $1`,
            [source.id],
          )
        ).rows;
        for (const variant of variants) {
          await tx.query(
            `INSERT INTO asset_variants (id, asset_id, width, format, storage_ref, byte_size, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [
              newEntityId(),
              newId,
              variant.width,
              variant.format,
              variantStorageRef(
                input.targetSiteId,
                newId,
                variant.width,
                variant.format,
              ),
              variant.byte_size,
              input.now,
            ],
          );
        }

        const blurhash = (
          await tx.query<{ value: string }>(
            `SELECT value FROM asset_blurhash WHERE asset_id = $1`,
            [source.id],
          )
        ).rows[0];
        if (blurhash !== undefined) {
          await tx.query(
            `INSERT INTO asset_blurhash (asset_id, value, created_at) VALUES ($1,$2,$3)`,
            [newId, blurhash.value, input.now],
          );
        }

        const history = (
          await tx.query<{ id: string; mime: string; byte_size: number; storage_ref: string }>(
            `SELECT id, mime, byte_size, storage_ref FROM asset_history WHERE asset_id = $1`,
            [source.id],
          )
        ).rows;
        for (const entry of history) {
          const newHistoryId = newEntityId();
          const name = storedFileName(entry.storage_ref) || source.filename;
          const perAsset = historyIds.get(source.id) ?? new Map<string, string>();
          perAsset.set(entry.id, newHistoryId);
          historyIds.set(source.id, perAsset);
          await tx.query(
            `INSERT INTO asset_history (id, asset_id, storage_ref, mime, byte_size, created_at)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              newHistoryId,
              newId,
              historyStorageRef(input.targetSiteId, newId, newHistoryId, name),
              entry.mime,
              entry.byte_size,
              input.now,
            ],
          );
        }
      }
      return { idMap, historyIds, folders: folders.length, assets: assets.length };
    });
  }

  // Theme und Ereignisprotokoll liegen in `store-themes.ts` (P3-2, Schritt 34).
  // `updateTheme` schreibt Theme-Zeile und Audit in einer Transaktion; die
  // Site-Pruefung kommt als Naht herein.
  recordSiteEvent(input: {
    siteId: string;
    mutation: string;
    params: Record<string, unknown>;
    author: Author;
  }): Promise<void> {
    return this.#themes.recordSiteEvent(input);
  }

  ensureSiteTheme(siteId: string): Promise<SiteThemeRow> {
    return this.#themes.ensureSiteTheme(siteId);
  }

  getTheme(siteId: string): Promise<SiteTheme> {
    return this.#themes.getTheme(siteId);
  }

  updateTheme(
    siteId: string,
    patch: Record<string, unknown>,
    author: Author,
  ): Promise<SiteTheme> {
    return this.#themes.updateTheme(siteId, patch, author);
  }


  // ------------------------------------------------- style rules (Phase 2)
  //
  // The registry lives in `store-style-rules.ts` (P3-2): 540 lines of a
  // site-wide resource with its own optimistic lock and audit log, kept as
  // one unit behind the `Store` facade below. `Store` stays the single
  // entry point for callers (http routes, lifecycle, mutations, MCP tools).

  async getStyleRegistry(siteId: string): Promise<{ version: number; rules: StyleRule[] }> {
    return this.#styleRules.getRegistry(siteId);
  }

  async listStyleRules(siteId: string): Promise<StyleRule[]> {
    return (await this.getStyleRegistry(siteId)).rules;
  }

  async getStyleRule(siteId: string, ruleId: string): Promise<StyleRule> {
    return this.#styleRules.getRule(siteId, ruleId);
  }

  async replaceStyleRules(
    siteId: string,
    rules: readonly StyleRule[],
    author: Author,
    baseVersion?: number,
  ): Promise<StyleRule[]> {
    return this.#styleRules.replaceStyleRules(siteId, rules, author, baseVersion);
  }

  async appendImportedStyleRules(
    siteId: string,
    rules: readonly StyleRule[],
    author: Author,
    baseVersion?: number,
  ): Promise<StyleRule[]> {
    return this.#styleRules.appendImportedStyleRules(siteId, rules, author, baseVersion);
  }

  async createStyleRule(
    siteId: string,
    input: CreateStyleRuleInput,
    author: Author,
  ): Promise<StyleRule> {
    return this.#styleRules.createStyleRule(siteId, input, author);
  }

  async updateStyleRule(
    siteId: string,
    ruleId: string,
    patch: StyleRuleUpdatePatch,
    author: Author,
  ): Promise<StyleRule> {
    return this.#styleRules.updateStyleRule(siteId, ruleId, patch, author);
  }

  async deleteStyleRule(
    siteId: string,
    ruleId: string,
    author: Author,
    baseVersion?: number,
  ): Promise<void> {
    return this.#styleRules.deleteStyleRule(siteId, ruleId, author, baseVersion);
  }

  async reorderStyleRule(
    siteId: string,
    ruleId: string,
    toIndex: number,
    author: Author,
    baseVersion?: number,
  ): Promise<StyleRule[]> {
    return this.#styleRules.reorderStyleRule(siteId, ruleId, toIndex, author, baseVersion);
  }

  // Die Bibliothek liegt in `store-library.ts` (P3-2): geteilte Bausteine und
  // ihre Installationen. `Store` delegiert; die Seite, in die installiert wird,
  // bleibt bei ihm, weil dort der Draft geschrieben wird.
  async listLibraryComponents(): Promise<LibraryComponent[]> {
    return this.#library.listLibraryComponents();
  }

  async getLibraryComponent(id: string): Promise<LibraryComponent> {
    return this.#library.getLibraryComponent(id);
  }

  async createLibraryComponent(input: LibraryCreateInput): Promise<LibraryComponent> {
    return this.#library.createLibraryComponent(input);
  }

  async updateLibraryComponent(input: LibraryPatchInput): Promise<LibraryComponent> {
    return this.#library.updateLibraryComponent(input);
  }

  async deleteLibraryComponent(id: string): Promise<LibraryComponent> {
    return this.#library.deleteLibraryComponent(id);
  }

  async listLibraryInstalls(siteId: string): Promise<LibraryInstall[]> {
    return this.#library.listLibraryInstalls(siteId);
  }

  async installLibraryComponent(input: LibraryInstallInput): Promise<LibraryInstall> {
    return this.#library.installLibraryComponent(input);
  }

  async updateLibraryInstall(id: string, author: Author): Promise<LibraryInstall> {
    return this.#library.updateLibraryInstall(id, author);
  }

  async deleteLibraryInstall(id: string, author: Author): Promise<LibraryInstall> {
    return this.#library.deleteLibraryInstall(id, author);
  }

  async listLibraryAudit(): Promise<LibraryAuditEntry[]> {
    return this.#library.listLibraryAudit();
  }

  // Die Seiten liegen in `store-pages.ts` (P3-2): die Tabelle, die Entwuerfe,
  // der Schreibpfad `persistBatch` und das Audit-Log der Seite. `Store`
  // delegiert; die Site bleibt bei ihm, weil das Modul sie nur prueft.
  async listPages(siteId: string): Promise<PageSummary[]> {
    return this.#pages.listPages(siteId);
  }

  async listPageDrafts(siteId: string): Promise<Page[]> {
    return this.#pages.listPageDrafts(siteId);
  }

  async getPage(id: string): Promise<Page> {
    return this.#pages.getPage(id);
  }

  async createPage(siteId: string, input: CreatePageInput): Promise<Page> {
    return this.#pages.createPage(siteId, input);
  }

  async setPageTemplate(input: {
    pageId: string;
    template: PageTemplate | null;
    layoutId: string | null;
  }): Promise<Page> {
    return this.#pages.setPageTemplate(input);
  }

  async deletePage(id: string): Promise<void> {
    return this.#pages.deletePage(id);
  }

  async updatePage(
    id: string,
    expectedVersion: number,
    changes: { draft: NodeTree; title: string; path: string },
  ): Promise<number> {
    return this.#pages.updatePage(id, expectedVersion, changes);
  }

  async assertPathFree(
    siteId: string,
    pageId: string,
    path: string,
  ): Promise<void> {
    return this.#pages.assertPathFree(siteId, pageId, path);
  }

  async persistBatch(input: {
    pageId: string;
    expectedVersion: number;
    draft: NodeTree;
    title: string;
    path: string;
    entries: NewAuditEntry[];
  }): Promise<number> {
    return this.#pages.persistBatch(input);
  }

  async appendAudit(entries: NewAuditEntry[]): Promise<void> {
    return this.#pages.appendAudit(entries);
  }

  async listAudit(pageId: string, limit = 50): Promise<AuditEntry[]> {
    return this.#pages.listAudit(pageId, limit);
  }

  async listSiteAudit(siteId: string, limit = 50): Promise<AuditEntry[]> {
    return this.#pages.listSiteAudit(siteId, limit);
  }

  // Die API-Tokens liegen in `store-tokens.ts` (P3-2). Sie haben keine Naht:
  // die Tabelle gehoert dem Modul allein, es braucht nur die Datenbank.
  createToken(input: CreateTokenInput): Promise<{ token: ApiToken; secret: string }> {
    return this.#tokens.createToken(input);
  }

  getToken(id: string): Promise<ApiToken> {
    return this.#tokens.getToken(id);
  }

  listTokens(): Promise<ApiToken[]> {
    return this.#tokens.listTokens();
  }

  findTokenByHash(tokenHash: string): Promise<TokenRecord | undefined> {
    return this.#tokens.findTokenByHash(tokenHash);
  }

  revokeToken(id: string): Promise<void> {
    return this.#tokens.revokeToken(id);
  }

  touchToken(id: string): Promise<void> {
    return this.#tokens.touchToken(id);
  }

  updateTokenKind(id: string, kind: TokenKind): Promise<void> {
    return this.#tokens.updateTokenKind(id, kind);
  }


  // ------------------------------------------------------- idempotency keys

  claimIdempotencyKey(input: ClaimIdempotencyKeyInput): Promise<IdempotencyClaim> {
    return this.#idempotency.claimIdempotencyKey(input);
  }

  completeIdempotencyKey(input: CompleteIdempotencyKeyInput): Promise<void> {
    return this.#idempotency.completeIdempotencyKey(input);
  }

  markIdempotencyCommitted(input: IdempotencySlotInput): Promise<void> {
    return this.#idempotency.markIdempotencyCommitted(input);
  }

  releaseIdempotencyKey(input: IdempotencySlotInput): Promise<void> {
    return this.#idempotency.releaseIdempotencyKey(input);
  }

  createDesignRecord(input: CreateDesignRecordInput): Promise<DesignRecord> {
    return this.#designRecords.createDesignRecord(input);
  }

  listDesignRecords(
    siteId: string,
    options: ListDesignRecordsOptions = {},
  ): Promise<DesignRecord[]> {
    return this.#designRecords.listDesignRecords(siteId, options);
  }

  recordMediaNeedResolutions(input: RecordMediaNeedResolutionsInput): Promise<RedesignProposal> {
    return this.#redesignProposals.recordMediaNeedResolutions(input);
  }

  getDesignRecord(id: string): Promise<DesignRecord> {
    return this.#designRecords.getDesignRecord(id);
  }

  appendMcpAudit(input: AppendMcpAuditInput): Promise<McpAuditEntry> {
    return this.#mcpAudit.appendMcpAudit(input);
  }

  listMcpAudit(limit = 50): Promise<McpAuditEntry[]> {
    return this.#mcpAudit.listMcpAudit(limit);
  }

  createRevision(input: CreateRevisionInput): Promise<PageRevision> {
    return this.#revisions.createRevision(input);
  }

  getRevision(id: string): Promise<PageRevision> {
    return this.#revisions.getRevision(id);
  }

  listRevisions(pageId: string, limit = 50): Promise<RevisionSummary[]> {
    return this.#revisions.listRevisions(pageId, limit);
  }

  createRelease(input: CreateReleaseInput): Promise<Release> {
    return this.#releases.createRelease(input);
  }

  activateRelease(input: ActivateReleaseInput): Promise<void> {
    return this.#releases.activateRelease(input);
  }

  finalizeRelease(input: FinalizeReleaseInput): Promise<void> {
    return this.#releases.finalizeRelease(input);
  }

  updateReleaseManifest(id: string, manifest: ReleaseManifest): Promise<void> {
    return this.#releases.updateReleaseManifest(id, manifest);
  }

  getRelease(id: string): Promise<Release> {
    return this.#releases.getRelease(id);
  }

  listReleases(siteId: string, limit = 50): Promise<Release[]> {
    return this.#releases.listReleases(siteId, limit);
  }

  getActiveReleaseId(siteId: string): Promise<string | null> {
    return this.#releases.getActiveReleaseId(siteId);
  }

  attachReleaseBuild(id: string, buildRef: string): Promise<void> {
    return this.#releases.attachReleaseBuild(id, buildRef);
  }

  // ------------------------------------------------------- deployments (E14)

  createDeployment(input: CreateDeploymentInput): Promise<Deployment> {
    return this.#deploy.createDeployment(input);
  }

  finishDeployment(input: FinishDeploymentInput): Promise<Deployment> {
    return this.#deploy.finishDeployment(input);
  }

  getDeployment(id: string): Promise<Deployment> {
    return this.#deploy.getDeployment(id);
  }

  listDeployments(siteId: string, limit = 20): Promise<Deployment[]> {
    return this.#deploy.listDeployments(siteId, limit);
  }

  getDeploySettings(siteId: string): Promise<DeploySettings> {
    return this.#deploy.getDeploySettings(siteId);
  }

  updateDeploySettings(siteId: string, patch: DeploySettingsPatch): Promise<DeploySettings> {
    return this.#deploy.updateDeploySettings(siteId, patch);
  }

  getNetlifyTokenEncrypted(siteId: string): Promise<string | null> {
    return this.#deploy.getNetlifyTokenEncrypted(siteId);
  }

  getVercelTokenEncrypted(siteId: string): Promise<string | null> {
    return this.#deploy.getVercelTokenEncrypted(siteId);
  }

  updateDeploymentTarget(id: string, target: string): Promise<void> {
    return this.#deploy.updateDeploymentTarget(id, target);
  }

  // --------------------------------------------------------- re-bake jobs (E12)

  enqueueBakeJob(input: EnqueueBakeJobInput): Promise<BakeJob> {
    return this.#bakeJobs.enqueueBakeJob(input);
  }

  claimBakeJob(input: ClaimBakeJobInput): Promise<BakeJob | null> {
    return this.#bakeJobs.claimBakeJob(input);
  }

  completeBakeJob(id: string, now?: string): Promise<BakeJob> {
    return this.#bakeJobs.completeBakeJob(id, now);
  }

  failBakeJob(input: FailBakeJobInput): Promise<BakeJob> {
    return this.#bakeJobs.failBakeJob(input);
  }

  expireBakeLeases(now: string): Promise<number> {
    return this.#bakeJobs.expireBakeLeases(now);
  }

  getBakeJob(id: string): Promise<BakeJob> {
    return this.#bakeJobs.getBakeJob(id);
  }

  listBakeJobs(siteId: string, limit?: number): Promise<BakeJob[]> {
    return this.#bakeJobs.listBakeJobs(siteId, limit);
  }

  createPreview(input: CreatePreviewInput): Promise<Preview> {
    return this.#reviews.createPreview(input);
  }

  getPreview(id: string): Promise<Preview> {
    return this.#reviews.getPreview(id);
  }

  listPreviews(siteId: string, limit?: number): Promise<Preview[]> {
    return this.#reviews.listPreviews(siteId, limit);
  }

  markPreviewExpired(id: string): Promise<void> {
    return this.#reviews.markPreviewExpired(id);
  }

  createReviewItem(input: CreateReviewItemInput): Promise<ReviewItem> {
    return this.#reviews.createReviewItem(input);
  }

  getReviewItem(id: string): Promise<ReviewItem> {
    return this.#reviews.getReviewItem(id);
  }

  listReviewItems(siteId: string, options?: ListReviewItemsOptions): Promise<ReviewItem[]> {
    return this.#reviews.listReviewItems(siteId, options);
  }

  updateReviewItem(id: string, patch: ReviewItemPatch): Promise<ReviewItem> {
    return this.#reviews.updateReviewItem(id, patch);
  }

  // -------------------------------------------------- redesign proposals (ADR-0012)
  createRedesignProposal(input: CreateRedesignProposalInput): Promise<RedesignProposal> {
    return this.#redesignProposals.createRedesignProposal(input);
  }

  getRedesignProposal(id: string): Promise<RedesignProposal> {
    return this.#redesignProposals.getRedesignProposal(id);
  }

  listRedesignProposals(
    sourcePageId: string,
    options: ListRedesignProposalsOptions = {},
  ): Promise<RedesignProposal[]> {
    return this.#redesignProposals.listRedesignProposals(sourcePageId, options);
  }

  expireStaleRedesignProposals(now?: string): Promise<string[]> {
    return this.#redesignProposals.expireStaleRedesignProposals(now);
  }

  claimRedesignProposal(input: ClaimRedesignProposalInput): Promise<ClaimRedesignProposalResult> {
    return this.#redesignProposals.claimRedesignProposal(input);
  }

  finalizeRedesignProposal(input: FinalizeRedesignProposalInput): Promise<RedesignProposal> {
    return this.#redesignProposals.finalizeRedesignProposal(input);
  }

  replaceAssetFromSnapshot(snapshot: ReleaseAssetSnapshot): Promise<Asset> {
    return this.#assets.replaceAssetFromSnapshot(snapshot);
  }

  createAsset(input: CreateAssetInput): Promise<Asset> {
    return this.#assets.createAsset(input);
  }

  getAsset(id: string): Promise<Asset> {
    return this.#assets.getAsset(id);
  }

  async #getAssetFolderInSite(folderId: string, siteId: string): Promise<AssetFolder> {
    const folder = await this.getAssetFolder(folderId);
    if (folder.siteId !== siteId) {
      throw new SenifyError(
        "validation",
        `Folder "${folderId}" belongs to another site`,
        { field: "folderId", suggestion: "Use a folder of this site." },
      );
    }
    return folder;
  }

  // Public, site-scoped entry points for the access paths (ADR-0014).
  getAssetOfSite(assetId: string, siteId: string): Promise<Asset> {
    return this.#assets.getAssetOfSite(assetId, siteId);
  }

  async getAssetFolderOfSite(folderId: string, siteId: string): Promise<AssetFolder> {
    return this.#getAssetFolderInSite(folderId, siteId);
  }

  findAssetByHash(siteId: string, hash: string): Promise<Asset | undefined> {
    return this.#assets.findAssetByHash(siteId, hash);
  }

  listAssets(siteId: string, options?: { status?: AssetStatus | "all" }): Promise<Asset[]> {
    return this.#assets.listAssets(siteId, options);
  }

  updateAsset(id: string, patch: AssetUpdate): Promise<Asset> {
    return this.#assets.updateAsset(id, patch);
  }

  deleteAssetRecord(id: string): Promise<void> {
    return this.#assets.deleteAssetRecord(id);
  }

  replaceAssetDerivatives(
    assetId: string,
    variants: readonly GeneratedVariant[],
    blurhash: string | null,
  ): Promise<void> {
    return this.#assets.replaceAssetDerivatives(assetId, variants, blurhash);
  }

  deleteAssetDerivatives(assetId: string): Promise<void> {
    return this.#assets.deleteAssetDerivatives(assetId);
  }

  assetUsageMap(siteId: string): Promise<Map<string, AssetUsage>> {
    return this.#assets.assetUsageMap(siteId);
  }

  // --- imported foreign code (ADR-0010) -----------------------------------

  createCodePayload(input: CreateCodePayloadInput): Promise<CodePayload> {
    return this.#codePayloads.createCodePayload(input);
  }

  listCodePayloads(siteId: string): Promise<CodePayload[]> {
    return this.#codePayloads.listCodePayloads(siteId);
  }

  getCodePayload(id: string): Promise<CodePayload> {
    return this.#codePayloads.getCodePayload(id);
  }

  getCodePayloadBundle(id: string): Promise<{ payload: CodePayload; bundle: string }> {
    return this.#codePayloads.getCodePayloadBundle(id);
  }

  deleteCodePayload(id: string): Promise<CodePayload> {
    return this.#codePayloads.deleteCodePayload(id);
  }

  createAssetFolder(input: CreateAssetFolderInput): Promise<AssetFolder> {
    return this.#assetFolders.createAssetFolder(input);
  }

  getAssetFolder(id: string): Promise<AssetFolder> {
    return this.#assetFolders.getAssetFolder(id);
  }

  listAssetFolders(siteId: string): Promise<AssetFolder[]> {
    return this.#assetFolders.listAssetFolders(siteId);
  }

  deleteAssetFolder(id: string): Promise<void> {
    return this.#assetFolders.deleteAssetFolder(id);
  }

  createAssetHistory(input: CreateAssetHistoryInput): Promise<AssetHistoryEntry> {
    return this.#assetFolders.createAssetHistory(input);
  }

  getAssetHistory(id: string): Promise<AssetHistoryEntry> {
    return this.#assetFolders.getAssetHistory(id);
  }

  listAssetHistory(assetId: string): Promise<AssetHistoryEntry[]> {
    return this.#assetFolders.listAssetHistory(assetId);
  }

  deleteAssetHistory(assetId: string): Promise<void> {
    return this.#assetFolders.deleteAssetHistory(assetId);
  }

  // -------------------------------------------------------- collections (T09)

  listCollections(siteId: string, options?: ListCollectionsOptions): Promise<Collection[]> {
    return this.#collections.listCollections(siteId, options);
  }

  getCollection(id: string): Promise<Collection> {
    return this.#collections.getCollection(id);
  }

  findCollectionBySlug(siteId: string, slug: string): Promise<Collection | undefined> {
    return this.#collections.findCollectionBySlug(siteId, slug);
  }

  createCollection(input: CreateCollectionInput): Promise<Collection> {
    return this.#collections.createCollection(input);
  }

  updateCollection(id: string, next: CollectionUpdate): Promise<Collection> {
    return this.#collections.updateCollection(id, next);
  }

  // ------------------------------------------------------------ entries (T09)

  listEntries(filter: ListEntriesFilter): Promise<Entry[]> {
    return this.#entries.listEntries(filter);
  }

  getEntry(id: string): Promise<Entry> {
    return this.#entries.getEntry(id);
  }

  findLiveEntryBySlug(
    collectionId: string,
    slug: string,
    exceptId?: string,
  ): Promise<Entry | undefined> {
    return this.#entries.findLiveEntryBySlug(collectionId, slug, exceptId);
  }

  findPublishedEntryBySlug(collectionId: string, slug: string): Promise<Entry | undefined> {
    return this.#entries.findPublishedEntryBySlug(collectionId, slug);
  }

  createEntry(input: CreateEntryInput): Promise<Entry> {
    return this.#entries.createEntry(input);
  }

  updateEntryRow(input: UpdateEntryRowInput): Promise<number> {
    return this.#entries.updateEntryRow(input);
  }

  setEntryDeleted(id: string, deletedAt: string | null): Promise<Entry> {
    return this.#entries.setEntryDeleted(id, deletedAt);
  }

  createEntryVersion(input: CreateEntryVersionInput): Promise<EntryVersion> {
    return this.#entries.createEntryVersion(input);
  }

  getEntryVersion(id: string): Promise<EntryVersion> {
    return this.#entries.getEntryVersion(id);
  }

  listEntryVersions(entryId: string, limit?: number): Promise<EntryVersion[]> {
    return this.#entries.listEntryVersions(entryId, limit);
  }

  maxEntryVersionNumber(entryId: string): Promise<number> {
    return this.#entries.maxEntryVersionNumber(entryId);
  }

  deleteEntryVersions(ids: readonly string[]): Promise<void> {
    return this.#entries.deleteEntryVersions(ids);
  }

  deleteEntryRecord(id: string): Promise<void> {
    return this.#entries.deleteEntryRecord(id);
  }

  createEntryRedirect(input: CreateEntryRedirectInput): Promise<EntryRedirect> {
    return this.#entries.createEntryRedirect(input);
  }

  findEntryRedirect(siteId: string, fromPath: string): Promise<EntryRedirect | undefined> {
    return this.#entries.findEntryRedirect(siteId, fromPath);
  }

  deleteEntryRedirect(siteId: string, fromPath: string): Promise<void> {
    return this.#entries.deleteEntryRedirect(siteId, fromPath);
  }

  listEntryRedirects(siteId: string): Promise<EntryRedirect[]> {
    return this.#entries.listEntryRedirects(siteId);
  }

  // ------------------------------------------------------------ forms (T11)

  getOrCreateFormSecret(): Promise<string> {
    return this.#forms.getOrCreateFormSecret();
  }

  resolveFormId(input: { siteId: string; pageId: string; nodeId: string }): Promise<string> {
    return this.#forms.resolveFormId(input);
  }

  saveFormSnapshot(input: SaveFormSnapshotInput): Promise<FormSnapshotRecord> {
    return this.#forms.saveFormSnapshot(input);
  }

  getFormSnapshot(id: string): Promise<FormSnapshotRecord> {
    return this.#forms.getFormSnapshot(id);
  }

  getFormSnapshotForForm(formId: string): Promise<FormSnapshotRecord | undefined> {
    return this.#forms.getFormSnapshotForForm(formId);
  }

  listFormSnapshots(siteId: string): Promise<FormSnapshotRecord[]> {
    return this.#forms.listFormSnapshots(siteId);
  }

  enqueueNotification(input: EnqueueNotificationInput): Promise<NotificationMessage> {
    return this.#notifications.enqueueNotification(input);
  }

  getNotification(id: string): Promise<NotificationMessage> {
    return this.#notifications.getNotification(id);
  }

  listNotifications(siteId: string, limit = 50): Promise<NotificationMessage[]> {
    return this.#notifications.listNotifications(siteId, limit);
  }

  listDueNotifications(now: string, limit = 50): Promise<NotificationMessage[]> {
    return this.#notifications.listDueNotifications(now, limit);
  }

  markNotificationResult(input: MarkNotificationResultInput): Promise<NotificationMessage> {
    return this.#notifications.markNotificationResult(input);
  }

  createNewsletterToken(input: CreateNewsletterTokenInput): Promise<NewsletterToken> {
    return this.#notifications.createNewsletterToken(input);
  }

  getNewsletterToken(token: string): Promise<NewsletterToken | undefined> {
    return this.#notifications.getNewsletterToken(token);
  }

  markNewsletterTokenUsed(token: string, status: string): Promise<NewsletterToken> {
    return this.#notifications.markNewsletterTokenUsed(token, status);
  }

  // ------------------------------------------------------- references (T14)

  createReference(input: CreateReferenceInput): Promise<Reference> {
    return this.#references.createReference(input);
  }

  getReference(id: string): Promise<Reference> {
    return this.#references.getReference(id);
  }

  listReferences(options?: { sort?: ReferenceListSort }): Promise<ReferenceSummary[]> {
    return this.#references.listReferences(options);
  }

  listReferenceIdsByCollection(collectionId: string): Promise<string[]> {
    return this.#references.listReferenceIdsByCollection(collectionId);
  }

  searchReferences(searchTokens: readonly string[]): Promise<ReferenceSearchHit[]> {
    return this.#references.searchReferences(searchTokens);
  }

  findDuplicateReferences(): Promise<ReferenceDuplicate[]> {
    return this.#references.findDuplicateReferences();
  }

  updateReference(id: string, patch: ReferencePatch): Promise<Reference> {
    return this.#references.updateReference(id, patch);
  }

  deleteReference(id: string): Promise<void> {
    return this.#references.deleteReference(id);
  }

  createReferenceProfileRevision(
    input: CreateReferenceProfileRevisionInput,
  ): Promise<ReferenceProfileRevision> {
    return this.#references.createReferenceProfileRevision(input);
  }

  getLatestReferenceProfile(referenceId: string): Promise<ReferenceProfileRevision | null> {
    return this.#references.getLatestReferenceProfile(referenceId);
  }

  listReferenceProfileRevisions(referenceId: string): Promise<ReferenceProfileRevision[]> {
    return this.#references.listReferenceProfileRevisions(referenceId);
  }

  createReferenceJob(input: CreateReferenceJobInput): Promise<ReferenceJob> {
    return this.#references.createReferenceJob(input);
  }

  getReferenceJobPayload(id: string): Promise<Record<string, unknown> | null> {
    return this.#references.getReferenceJobPayload(id);
  }

  getReferenceJob(id: string): Promise<ReferenceJob> {
    return this.#references.getReferenceJob(id);
  }

  listDueReferenceJobs(now: string, limit?: number): Promise<ReferenceJob[]> {
    return this.#references.listDueReferenceJobs(now, limit);
  }

  updateReferenceJob(input: UpdateReferenceJobInput): Promise<ReferenceJob> {
    return this.#references.updateReferenceJob(input);
  }

  // ------------------------------------------------- import jobs (plan S3.2)

  createImportJob(input: CreateImportJobInput): Promise<ImportJob> {
    return this.#importJobs.createImportJob(input);
  }

  getImportJob(id: string): Promise<ImportJob> {
    return this.#importJobs.getImportJob(id);
  }

  getImportJobPayload(id: string): Promise<Record<string, unknown> | null> {
    return this.#importJobs.getImportJobPayload(id);
  }

  listDueImportJobs(now: string, limit = 20): Promise<ImportJob[]> {
    return this.#importJobs.listDueImportJobs(now, limit);
  }

  listImportJobsForSite(siteId: string, limit = 50): Promise<ImportJob[]> {
    return this.#importJobs.listImportJobsForSite(siteId, limit);
  }

  updateImportJob(input: UpdateImportJobInput): Promise<ImportJob> {
    return this.#importJobs.updateImportJob(input);
  }

  getImportJobResult(id: string): Promise<Record<string, unknown> | null> {
    return this.#importJobs.getImportJobResult(id);
  }

  setImportJobResult(id: string, result: Record<string, unknown>): Promise<void> {
    return this.#importJobs.setImportJobResult(id, result);
  }

  async commitFramerImportPlan(plan: FramerImportCommitPlan): Promise<FramerImportCommitResult> {
    if (plan.target.kind === "new") assertPagePathFormat(plan.target.path);
    plan.payloads.forEach((payload, index) => {
      if (payload.id.trim() === "") {
        throw new SenifyError("validation", `Prepared payload ${index} has no id`, {
          field: "payloadId",
        });
      }
    });

    return this.#db.withTransaction(async (tx) => {
      let replacedRevisionId: string | null = null;
      const receiptRows = await tx.query<ImportReceiptRow>(
        `SELECT id, site_id, job_id, content_key, request_fingerprint,
                page_id, draft_version, result, created_at
           FROM import_receipts
          WHERE site_id = $1 AND content_key = $2 AND request_fingerprint = $3`,
        [plan.siteId, plan.contentKey, plan.requestFingerprint],
      );
      const receiptRow = receiptRows.rows[0];
      if (receiptRow !== undefined) {
        const receipt = mapImportReceipt(receiptRow);
        const job = await this.#importJobWithClient(tx, receipt.jobId);
        if (job === null) {
          throw new SenifyError("conflict", "Der Import-Receipt verweist auf einen fehlenden Job", {
            field: "receiptId",
          });
        }
        const stored = receipt.result as unknown as ImportReport;
        const report: ImportReport = {
          ...stored,
          receiptId: receipt.id,
          replayed: true,
        };
        const completed = await tx.query<ImportJobRow>(
          `UPDATE import_jobs
              SET status = 'succeeded', stage = 'done', progress = 100,
                  attempts = attempts + 1, last_error = NULL,
                  finished_at = $2, updated_at = $2, result = $3
            WHERE id = $1
            RETURNING ${IMPORT_JOB_COLUMNS}`,
          [plan.jobId, new Date().toISOString(), toJsonParam(report)],
        );
        const completedRow = completed.rows[0];
        if (completedRow === undefined) {
          throw new SenifyError("not_found", `Import job "${plan.jobId}" does not exist`, {
            field: "jobId",
          });
        }
        return {
          receipt,
          job: mapImportJob(completedRow),
          report,
          replayed: true,
        };
      }

      const site = await tx.query<{ id: string }>(
        `SELECT id FROM sites WHERE id = $1 FOR UPDATE`,
        [plan.siteId],
      );
      if (site.rows.length === 0) {
        throw new SenifyError("not_found", `Site "${plan.siteId}" does not exist`, {
          field: "siteId",
        });
      }
      const job = await this.#importJobWithClient(tx, plan.jobId);
      if (job === null || job.siteId !== plan.siteId || job.dryRun) {
        throw new SenifyError("validation", "Der Import-Job ist kein gültiges Write-Ziel", {
          field: "jobId",
        });
      }

      const now = new Date().toISOString();
      const batchId = newEntityId();
      let page: Page;
      if (plan.target.kind === "new") {
        const existingTarget = await tx.query<PageRow>(
          `SELECT ${PAGE_WRITE_COLUMNS} FROM pages WHERE site_id = $1 AND path = $2 FOR UPDATE`,
          [plan.siteId, plan.target.path],
        );
        if (existingTarget.rows[0] !== undefined) {
          throw new SenifyError("conflict", `Page path "${plan.target.path}" is already in use on this site`, {
            field: "path",
            suggestion: "Use the existing pageId with its current baseDraftVersion, or choose another path.",
          });
        }
        const pageId = newEntityId();
        const inserted = await tx.query<PageRow>(
          `INSERT INTO pages (id, site_id, path, title, meta, draft, draft_version, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 2, $7, $7)
           RETURNING ${PAGE_WRITE_COLUMNS}`,
          [
            pageId,
            plan.siteId,
            plan.target.path,
            plan.target.title,
            toJsonParam(plan.pageMeta ?? {}),
            toJsonParam(plan.draft),
            now,
          ],
        );
        const insertedPage = inserted.rows[0];
        if (insertedPage === undefined) throw new Error("Imported page insert returned no row");
        page = mapPage(insertedPage);
      } else {
        const locked = await tx.query<PageRow>(
          `SELECT ${PAGE_WRITE_COLUMNS} FROM pages WHERE id = $1 FOR UPDATE`,
          [plan.target.pageId],
        );
        const current = locked.rows[0];
        if (current === undefined) {
          throw new SenifyError("not_found", `Page "${plan.target.pageId}" does not exist`, {
            field: "pageId",
          });
        }
        if (current.site_id !== plan.siteId) {
          throw new SenifyError("validation", "Die Zielseite gehört zu einem anderen Projekt", {
            field: "pageId",
          });
        }
        const currentVersion = toFiniteNumber(current.draft_version, "draft_version");
        if (currentVersion !== plan.target.baseDraftVersion) {
          throw draftConflictError(plan.target.baseDraftVersion, currentVersion);
        }
        // The import replaces the whole draft, so the draft it replaces is kept
        // as a revision first: "Vorherige Version wiederherstellen" (the existing
        // revision restore) is the way back.
        replacedRevisionId = newEntityId();
        await tx.query(
          `INSERT INTO page_revisions
            (id, page_id, site_id, tree, title, path, author, note, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            replacedRevisionId,
            current.id,
            current.site_id,
            toJsonParam(toJson<NodeTree>(current.draft)),
            current.title,
            current.path,
            toJsonParam(plan.author),
            "Vor dem Framer-Import",
            now,
          ],
        );
        const mergedMeta = { ...toJson<PageMeta>(current.meta ?? {}), ...(plan.pageMeta ?? {}) };
        const updated = await tx.query<PageRow>(
          `UPDATE pages
              SET draft = $2, meta = $5, draft_version = draft_version + 1, updated_at = $3
            WHERE id = $1 AND draft_version = $4
            RETURNING ${PAGE_WRITE_COLUMNS}`,
          [
            plan.target.pageId,
            toJsonParam(plan.draft),
            now,
            plan.target.baseDraftVersion,
            toJsonParam(mergedMeta),
          ],
        );
        const updatedPage = updated.rows[0];
        if (updatedPage === undefined) {
          throw draftConflictError(plan.target.baseDraftVersion, currentVersion);
        }
        page = mapPage(updatedPage);
      }

      for (const payload of plan.payloads) {
        const bytes = Buffer.byteLength(payload.bundle, "utf8");
        await tx.query(
          `INSERT INTO site_code_payloads
             (id, site_id, name, kind, bundle, bytes, integrity, version, provenance, license, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9, $10, $10)`,
          [
            payload.id,
            plan.siteId,
            payload.name,
            payload.kind,
            payload.bundle,
            bytes,
            createHash("sha256").update(payload.bundle, "utf8").digest("hex"),
            toJsonParam(payload.provenance),
            toJsonParam(payload.license),
            now,
          ],
        );
      }

      const styleSite = await tx.query<StyleRuleRow>(
        `SELECT style_rules_json, style_rules_version FROM sites WHERE id = $1 FOR UPDATE`,
        [plan.siteId],
      );
      const styleRow = styleSite.rows[0];
      if (styleRow === undefined) {
        throw new SenifyError("not_found", `Site "${plan.siteId}" does not exist`, {
          field: "siteId",
        });
      }
      const storedRules =
        styleRow.style_rules_json === null || styleRow.style_rules_json === undefined
          ? []
          : parseStyleRuleRegistry(toJson<unknown>(styleRow.style_rules_json));
      // The rules of the page being imported again are replaced, never stacked:
      // their ids carry the page scope (`fi-<scope>-<n>`), so a second import of
      // the same page swaps its own rules and leaves every other page's alone.
      // Stacking them would leave the registry holding the first version (it
      // keeps the first rule per id), so a change made in Framer never arrived.
      const importedScopes = new Set(
        plan.styleRules
          .map((rule) => RULE_ID_PATTERN.exec(rule.id)?.[1])
          .filter((scope): scope is string => scope !== undefined),
      );
      const currentRules = storedRules.filter((rule) => {
        const scope = RULE_ID_PATTERN.exec(rule.id)?.[1];
        return scope === undefined || !importedScopes.has(scope);
      });
      const importedRules = plan.styleRules.map((rule, index) => {
        const ordered: StyleRule = { ...rule, order: currentRules.length + index };
        assertWritableRule(ordered, `styleRules[${index}]`);
        return ordered;
      });
      const nextRules = normalizeRuleOrder([...currentRules, ...importedRules]);
      const nextStyleVersion =
        toFiniteNumber(styleRow.style_rules_version ?? 0, "style_rules_version") + 1;
      if (importedRules.length > 0) {
        await tx.query(
          `UPDATE sites
              SET style_rules_json = $2, style_rules_version = $3, updated_at = $4
            WHERE id = $1`,
          [plan.siteId, toJsonParam(nextRules), nextStyleVersion, now],
        );
      }

      if (plan.breakpoints !== undefined && plan.breakpoints !== null) {
        await tx.query(`UPDATE sites SET breakpoints_json = $2, updated_at = $3 WHERE id = $1`, [
          plan.siteId,
          toJsonParam(plan.breakpoints),
          now,
        ]);
      }

      if (plan.themePatch !== null) {
        const themeRows = await tx.query<SiteThemeRow>(
          `SELECT id, site_id, name, definition, version, created_at, updated_at
             FROM themes WHERE site_id = $1 FOR UPDATE`,
          [plan.siteId],
        );
        const themeRow = themeRows.rows[0];
        if (themeRow === undefined) {
          throw new SenifyError("not_found", `Theme for site "${plan.siteId}" does not exist`, {
            field: "theme",
          });
        }
        const currentDefinition = toJson<Theme>(themeRow.definition);
        const merged = mergeThemePatch(currentDefinition, plan.themePatch);
        merged.id = themeRow.id;
        validateShape(ThemeSchema, merged, "theme");
        const issues = validateTheme(merged);
        const firstIssue = issues[0];
        if (firstIssue !== undefined) {
          throw new SenifyError(
            "validation",
            `Invalid theme: ${firstIssue.message}`,
            { field: firstIssue.path, suggestion: firstIssue.suggestion },
          );
        }
        const newThemeVersion =
          toFiniteNumber(themeRow.version, "version") + 1;
        await tx.query(
          `UPDATE themes
              SET definition = $2, name = $3, version = $4, updated_at = $5
            WHERE id = $1`,
          [themeRow.id, toJsonParam(merged), merged.name, newThemeVersion, now],
        );
      }

      const auditEntries: NewAuditEntry[] = [
        {
          siteId: plan.siteId,
          pageId: page.id,
          batchId,
          opIndex: 0,
          mutation: "importFramer",
          params: {
            sourceUrl: plan.report.payloads?.[0]?.sourcePath ?? null,
            pagePath: page.path,
            irHash: plan.report.irHash,
            score: plan.report.score,
            receiptKey: plan.contentKey,
            requestFingerprint: plan.requestFingerprint,
          },
          author: plan.author,
          undoPatch: [],
          draftVersionAfter: page.draftVersion,
        },
      ];
      if (importedRules.length > 0) {
        auditEntries.push({
          siteId: plan.siteId,
          pageId: null,
          batchId,
          opIndex: 1,
          mutation: "importFramerStyleRules",
          params: {
            count: importedRules.length,
            styleRegistryVersion: nextStyleVersion,
            receiptKey: plan.contentKey,
          },
          author: plan.author,
          undoPatch: [],
          draftVersionAfter: nextStyleVersion,
        });
      }
      if (plan.themePatch !== null) {
        auditEntries.push({
          siteId: plan.siteId,
          pageId: null,
          batchId,
          opIndex: auditEntries.length,
          mutation: "update_theme",
          params: { patch: plan.themePatch, import: true },
          author: plan.author,
          undoPatch: [],
          draftVersionAfter: 0,
        });
      }
      if (plan.breakpoints !== undefined && plan.breakpoints !== null) {
        auditEntries.push({
          siteId: plan.siteId,
          pageId: null,
          batchId,
          opIndex: auditEntries.length,
          mutation: "update_site_breakpoints",
          params: { breakpoints: plan.breakpoints, source: "framer-import" },
          author: plan.author,
          undoPatch: [],
          draftVersionAfter: 0,
        });
      }
      const audit = buildAuditInsert(auditEntries);
      await tx.query(audit.text, audit.params);

      const receiptId = newEntityId();
      const report: ImportReport = {
        ...plan.report,
        pageId: page.id,
        newDraftVersion: page.draftVersion,
        receiptId,
        replayed: false,
        // The revision that holds the draft this import replaced: the way back.
        ...(replacedRevisionId === null ? {} : { replacedRevisionId }),
      };
      const updatedJob = await tx.query<ImportJobRow>(
        `UPDATE import_jobs
            SET status = 'succeeded', stage = 'done', progress = 100,
                attempts = attempts + 1, last_error = NULL,
                finished_at = $2, updated_at = $2, result = $3
          WHERE id = $1
          RETURNING ${IMPORT_JOB_COLUMNS}`,
        [plan.jobId, now, toJsonParam(report)],
      );
      const jobRow = updatedJob.rows[0];
      if (jobRow === undefined) {
        throw new SenifyError("not_found", `Import job "${plan.jobId}" does not exist`, {
          field: "jobId",
        });
      }
      const insertedReceipt = await tx.query<ImportReceiptRow>(
        `INSERT INTO import_receipts
           (id, site_id, job_id, content_key, request_fingerprint,
            page_id, draft_version, result, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, site_id, job_id, content_key, request_fingerprint,
                   page_id, draft_version, result, created_at`,
        [
          receiptId,
          plan.siteId,
          plan.jobId,
          plan.contentKey,
          plan.requestFingerprint,
          page.id,
          page.draftVersion,
          toJsonParam(report),
          now,
        ],
      );
      const receipt = mapImportReceipt(insertedReceipt.rows[0]!);
      return {
        receipt,
        job: mapImportJob(jobRow),
        report,
        replayed: false,
      };
    });
  }

  async #importJobWithClient(
    client: DbClient,
    id: string,
  ): Promise<ImportJob | null> {
    const result = await client.query<ImportJobRow>(
      `SELECT ${IMPORT_JOB_COLUMNS} FROM import_jobs WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapImportJob(row);
  }

  upsertReferenceAssignment(input: UpsertReferenceAssignmentInput): Promise<ReferenceAssignment> {
    return this.#references.upsertReferenceAssignment(input);
  }

  listReferenceAssignments(siteId: string): Promise<ReferenceAssignment[]> {
    return this.#references.listReferenceAssignments(siteId);
  }

  deleteReferenceAssignment(input: DeleteReferenceAssignmentInput): Promise<boolean> {
    return this.#references.deleteReferenceAssignment(input);
  }

  countReferenceAssignments(referenceId: string): Promise<number> {
    return this.#references.countReferenceAssignments(referenceId);
  }

  // ------------------------------------------------ reference library (T14)

  createReferenceCollection(input: CreateReferenceCollectionInput): Promise<ReferenceCollection> {
    return this.#referenceLibrary.createReferenceCollection(input);
  }

  getReferenceCollection(id: string): Promise<ReferenceCollection> {
    return this.#referenceLibrary.getReferenceCollection(id);
  }

  listReferenceCollections(
    options: { kind?: ReferenceCollectionKind } = {},
  ): Promise<ReferenceCollection[]> {
    return this.#referenceLibrary.listReferenceCollections(options);
  }

  updateReferenceCollection(id: string, patch: ReferenceCollectionPatch): Promise<ReferenceCollection> {
    return this.#referenceLibrary.updateReferenceCollection(id, patch);
  }

  deleteReferenceCollection(id: string): Promise<number> {
    return this.#referenceLibrary.deleteReferenceCollection(id);
  }

  // ---------------------------------------------------------- settings (T12)

  getSmtpSettings(): Promise<SmtpSettingsRecord> {
    return this.#settings.getSmtpSettings();
  }

  updateSmtpSettings(patch: SmtpSettingsPatch): Promise<SmtpSettingsRecord> {
    return this.#settings.updateSmtpSettings(patch);
  }

  getEngineSettings(): Promise<EngineSettings> {
    return this.#settings.getEngineSettings();
  }

  updateEngineSettings(patch: EngineSettingsPatch): Promise<EngineSettings> {
    return this.#settings.updateEngineSettings(patch);
  }

  getImageSettings(): Promise<ImageSettings> {
    return this.#settings.getImageSettings();
  }

  updateImageSettings(patch: ImageSettingsPatch): Promise<ImageSettings> {
    return this.#settings.updateImageSettings(patch);
  }

  // ------------------------------------------------------ image jobs (S2)

  enqueueImageJob(input: EnqueueImageJobInput): Promise<ImageJob> {
    return this.#imageJobs.enqueueImageJob(input);
  }

  claimImageJob(input: ClaimImageJobInput): Promise<ImageJob | null> {
    return this.#imageJobs.claimImageJob(input);
  }

  setImageJobProvider(input: SetImageJobProviderInput): Promise<ImageJob> {
    return this.#imageJobs.setImageJobProvider(input);
  }

  completeImageJob(id: string, result: ImageJobResult, now?: string): Promise<ImageJob> {
    return this.#imageJobs.completeImageJob(id, result, now);
  }

  failImageJob(input: FailImageJobInput): Promise<ImageJob> {
    return this.#imageJobs.failImageJob(input);
  }

  cancelImageJob(id: string, now?: string): Promise<ImageJob> {
    return this.#imageJobs.cancelImageJob(id, now);
  }

  expireImageLeases(now: string): Promise<number> {
    return this.#imageJobs.expireImageLeases(now);
  }

  getImageJob(id: string): Promise<ImageJob> {
    return this.#imageJobs.getImageJob(id);
  }

  listImageJobs(siteId: string, options?: ListImageJobsOptions): Promise<ImageJob[]> {
    return this.#imageJobs.listImageJobs(siteId, options);
  }

  listProviderCooldowns(now: string): Promise<ProviderCooldown[]> {
    return this.#imageJobs.listProviderCooldowns(now);
  }

  setProviderCooldown(input: SetProviderCooldownInput): Promise<void> {
    return this.#imageJobs.setProviderCooldown(input);
  }

  getReferenceSettings(): Promise<ReferenceSettings> {
    return this.#settings.getReferenceSettings();
  }

  updateReferenceSettings(patch: ReferenceSettingsPatch): Promise<ReferenceSettings> {
    return this.#settings.updateReferenceSettings(patch);
  }

  // Persisted secret for encryption at rest. It lives in a file outside the
  // database (ADR-0017): the backup exports every table, and a key stored next
  // to the ciphertext it protects would make the backup plaintext.
  getOrCreateEngineSecret(): Promise<string> {
    // One resolution per Store: the settings and the image worker ask at once.
    this.#engineSecret ??= this.#resolveEngineSecret().catch((error: unknown) => {
      this.#engineSecret = undefined;
      throw error;
    });
    return this.#engineSecret;
  }

  async #resolveEngineSecret(): Promise<string> {
    const file = this.#secretFile;
    const existing = await this.#db.query<{ secret: string }>(
      `SELECT secret FROM engine_secrets WHERE name = 'settings' LIMIT 1`,
    );
    const row = existing.rows[0];
    if (file === undefined) {
      if (row) return row.secret;
      const secret = randomBytes(32).toString("base64url");
      await this.#db.query(
        `INSERT INTO engine_secrets (id, name, secret, created_at) VALUES ($1, 'settings', $2, $3)`,
        [newEntityId(), secret, new Date().toISOString()],
      );
      return secret;
    }
    const stored = readSecretFile(file);
    if (stored !== undefined) {
      // A row that differs is another key (an old backup on another machine):
      // it stays, it is the only copy of what that backup's ciphertext needs.
      if (row?.secret === stored) await this.#dropLegacySecret();
      return stored;
    }
    // No file yet: an older install keeps its key in the database and moves it
    // unchanged (its ciphertext stays readable); a fresh one issues a new key.
    publishSecretFile(file, row?.secret ?? randomBytes(32).toString("base64url"));
    const published = readSecretFile(file);
    if (published === undefined) {
      throw new SenifyError("conflict", `Die Schlüsseldatei ${file} ist nicht lesbar`, {
        suggestion: "Rechte des Datenordners prüfen.",
      });
    }
    // Only after the file reads back: the row is the only other copy.
    if (row?.secret === published) await this.#dropLegacySecret();
    return published;
  }

  async #dropLegacySecret(): Promise<void> {
    await this.#db.query(`DELETE FROM engine_secrets WHERE name = 'settings'`);
  }

  // Raw table dump for backups; names come from the schema, never from input.
  async dumpTable(name: string): Promise<Row[]> {
    if (!tableNames().includes(name)) {
      throw new SenifyError("validation", `Unbekannte Tabelle "${name}"`, {
        field: "table",
      });
    }
    const result = await this.#db.query(`SELECT * FROM ${name}`);
    return result.rows;
  }

  // Writes a dump back (restore): the listed tables are cleared and refilled in
  // one transaction, so a restored state is either fully there or not at all.
  // `order` names parents before children: clearing walks it backwards and
  // refilling forwards, which keeps foreign keys satisfied.
  async replaceTables(input: {
    order: readonly string[];
    rows: Record<string, Row[]>;
  }): Promise<Record<string, number>> {
    const known = tableNames();
    for (const name of input.order) {
      if (!known.includes(name)) {
        throw new SenifyError("validation", `Unbekannte Tabelle "${name}"`, {
          field: "table",
        });
      }
    }
    return this.#db.withTransaction(async (tx) => {
      for (const name of [...input.order].reverse()) {
        await tx.query(`DELETE FROM ${name}`);
      }
      const counts: Record<string, number> = {};
      for (const name of input.order) {
        const rows = input.rows[name] ?? [];
        counts[name] = rows.length;
        await insertDumpRows(tx, name, rows);
      }
      return counts;
    });
  }
}

// Rows of a dump still carry parsed JSON and Date objects: JSONB columns need
// their text form back (accepted twice, as object and as JSON text), every
// other value goes in as the driver returned it.
function dumpParam(value: unknown, json: boolean): unknown {
  if (value === null || value === undefined) return null;
  if (!json) return value;
  if (typeof value === "string") {
    try {
      JSON.parse(value);
      return value;
    } catch {
      // Not JSON text: the column holds a plain string, quote it below.
    }
  }
  return JSON.stringify(value);
}

const INSERT_DUMP_BATCH = 100;

async function insertDumpRows(
  client: DbClient,
  name: string,
  rows: Row[],
): Promise<void> {
  if (rows.length === 0) return;
  const json = jsonColumns(name);
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  for (let start = 0; start < rows.length; start += INSERT_DUMP_BATCH) {
    const batch = rows.slice(start, start + INSERT_DUMP_BATCH);
    const params: unknown[] = [];
    const tuples = batch.map((row) => {
      const refs = columns.map((column) => {
        params.push(dumpParam(row[column], json.has(column)));
        return `$${params.length}`;
      });
      return `(${refs.join(", ")})`;
    });
    await client.query(
      `INSERT INTO ${name} (${columns.join(", ")}) VALUES ${tuples.join(", ")}`,
      params,
    );
  }
}
