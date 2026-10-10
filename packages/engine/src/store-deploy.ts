// Deployments and deploy settings of the Store (ADR 0019): deploy records of a release and the per-site hosted-provider target. `Store` delegates here.
import { SenifyError } from "@senify/core";
import type { Author } from "@senify/section-sdk";
import type { Db } from "./db.ts";
import { newEntityId } from "./ids.ts";
import { toIso, toJson, toJsonParam } from "./store-row-utils.ts";
import type { Deployment, DeploymentStatus, DeployProvider, DeploySettings } from "./types.ts";

export type CreateDeploymentInput = {
  siteId: string;
  releaseId: string;
  provider: DeployProvider;
  target: string;
  author: Author;
};

export type FinishDeploymentInput = {
  id: string;
  status: "succeeded" | "failed";
  fileCount?: number;
  byteSize?: number;
  error?: string;
};

export type DeploySettingsPatch = {
  provider?: DeployProvider;
  netlifySiteId?: string | null;
  netlifyTokenEncrypted?: string | null;
  vercelProjectId?: string | null;
  vercelTokenEncrypted?: string | null;
};

type DeploymentRow = {
  id: string;
  site_id: string;
  release_id: string;
  provider: string;
  status: string;
  target: string;
  file_count: unknown;
  byte_size: unknown;
  error: unknown;
  author: unknown;
  created_at: unknown;
  finished_at: unknown;
};

type DeploySettingsRow = {
  provider: string;
  netlify_site_id: unknown;
  netlify_token_encrypted: unknown;
  vercel_project_id: unknown;
  vercel_token_encrypted: unknown;
  updated_at: unknown;
};

function mapDeployment(row: DeploymentRow): Deployment {
  const status: DeploymentStatus =
    row.status === "succeeded"
      ? "succeeded"
      : row.status === "failed"
        ? "failed"
        : "running";
  return {
    id: row.id,
    siteId: row.site_id,
    releaseId: row.release_id,
    // One provider today; the seam widens when hosted adapters arrive.
    provider: "static",
    status,
    target: row.target,
    fileCount: Number(row.file_count ?? 0),
    byteSize: Number(row.byte_size ?? 0),
    error: typeof row.error === "string" ? row.error : null,
    author: toJson<Author>(row.author),
    createdAt: toIso(row.created_at),
    finishedAt:
      row.finished_at === null || row.finished_at === undefined
        ? null
        : toIso(row.finished_at),
  };
}

export class DeployRepository {
  readonly #db: Db;
  // The one thing this module needs from outside: the site existence check (a not_found error for an unknown site).
  readonly #getSite: (siteId: string) => Promise<unknown>;

  constructor(db: Db, getSite: (siteId: string) => Promise<unknown>) {
    this.#db = db;
    this.#getSite = getSite;
  }

  async createDeployment(input: CreateDeploymentInput): Promise<Deployment> {
    const id = newEntityId();
    const createdAt = new Date().toISOString();
    await this.#db.query(
      `INSERT INTO deployments
        (id, site_id, release_id, provider, status, target, file_count, byte_size, error, author, created_at, finished_at)
       VALUES ($1, $2, $3, $4, 'running', $5, 0, 0, NULL, $6, $7, NULL)`,
      [
        id,
        input.siteId,
        input.releaseId,
        input.provider,
        input.target,
        toJsonParam(input.author),
        createdAt,
      ],
    );
    return this.getDeployment(id);
  }

  async finishDeployment(input: FinishDeploymentInput): Promise<Deployment> {
    const finishedAt = new Date().toISOString();
    const updated = await this.#db.query<{ id: string }>(
      `UPDATE deployments
       SET status = $2, file_count = $3, byte_size = $4, error = $5, finished_at = $6
       WHERE id = $1 RETURNING id`,
      [
        input.id,
        input.status,
        input.fileCount ?? 0,
        input.byteSize ?? 0,
        input.error ?? null,
        finishedAt,
      ],
    );
    if (updated.rows.length === 0) {
      throw new SenifyError(
        "not_found",
        `Deployment "${input.id}" does not exist`,
        { field: "deploymentId" },
      );
    }
    return this.getDeployment(input.id);
  }

  async getDeployment(id: string): Promise<Deployment> {    const result = await this.#db.query<DeploymentRow>(
      `SELECT id, site_id, release_id, provider, status, target, file_count, byte_size, error, author, created_at, finished_at
       FROM deployments WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Deployment "${id}" does not exist`, {
        field: "deploymentId",
      });
    }
    return mapDeployment(row);
  }

  async listDeployments(siteId: string, limit = 20): Promise<Deployment[]> {
    const result = await this.#db.query<DeploymentRow>(
      `SELECT id, site_id, release_id, provider, status, target, file_count, byte_size, error, author, created_at, finished_at
       FROM deployments WHERE site_id = $1
       ORDER BY created_at DESC, id DESC LIMIT $2`,
      [siteId, Math.max(1, Math.min(100, limit))],
    );
    return result.rows.map(mapDeployment);
  }

  // ------------------------------------------------------- deploy settings (E14)

  // The settings of a site, or the static defaults when nothing was stored.
  async getDeploySettings(siteId: string): Promise<DeploySettings> {
    await this.#getSite(siteId);
    const result = await this.#db.query<DeploySettingsRow>(
      `SELECT provider, netlify_site_id, netlify_token_encrypted,
              vercel_project_id, vercel_token_encrypted, updated_at
       FROM deploy_settings WHERE site_id = $1`,
      [siteId],
    );
    const row = result.rows[0];
    if (!row) {
      return {
        provider: "static",
        netlifySiteId: null,
        hasNetlifyToken: false,
        vercelProjectId: null,
        hasVercelToken: false,
        updatedAt: "",
      };
    }
    return {
      provider: row.provider as DeployProvider,
      netlifySiteId: typeof row.netlify_site_id === "string" ? row.netlify_site_id : null,
      hasNetlifyToken: typeof row.netlify_token_encrypted === "string",
      vercelProjectId: typeof row.vercel_project_id === "string" ? row.vercel_project_id : null,
      hasVercelToken: typeof row.vercel_token_encrypted === "string",
      updatedAt: toIso(row.updated_at),
    };
  }

  // Writes the hosted-provider target. A new token is encrypted; null clears
  // it; omitting keeps it. The plaintext never persists and never returns.
  async updateDeploySettings(siteId: string, patch: DeploySettingsPatch): Promise<DeploySettings> {
    await this.#getSite(siteId);
    const now = new Date().toISOString();
    const current = await this.getDeploySettings(siteId);
    const row = (
      await this.#db.query<DeploySettingsRow>(
        `SELECT netlify_token_encrypted, vercel_token_encrypted FROM deploy_settings WHERE site_id = $1`,
        [siteId],
      )
    ).rows[0];
    const existingNetlifyToken =
      typeof row?.netlify_token_encrypted === "string" ? row.netlify_token_encrypted : null;
    const nextNetlifyToken =
      patch.netlifyTokenEncrypted === undefined
        ? existingNetlifyToken
        : patch.netlifyTokenEncrypted;
    const existingVercelToken =
      typeof row?.vercel_token_encrypted === "string" ? row.vercel_token_encrypted : null;
    const nextVercelToken =
      patch.vercelTokenEncrypted === undefined
        ? existingVercelToken
        : patch.vercelTokenEncrypted;
    const provider = patch.provider ?? current.provider;
    const netlifySiteId =
      patch.netlifySiteId === undefined ? current.netlifySiteId : patch.netlifySiteId;
    const vercelProjectId =
      patch.vercelProjectId === undefined ? current.vercelProjectId : patch.vercelProjectId;
    if (provider === "netlify" && (netlifySiteId === null || nextNetlifyToken === null)) {
      throw new SenifyError(
        "validation",
        'Netlify braucht eine site id und einen token (deploy settings)',
        {
          field: "netlifySiteId",
          suggestion:
            "PUT /api/sites/:siteId/deploy-settings mit provider netlify, netlifySiteId und netlifyToken setzen.",
        },
      );
    }
    if (provider === "vercel" && (vercelProjectId === null || nextVercelToken === null)) {
      throw new SenifyError(
        "validation",
        "Vercel braucht eine project id und einen token (deploy settings)",
        {
          field: "vercelProjectId",
          suggestion:
            "PUT /api/sites/:siteId/deploy-settings mit provider vercel, vercelProjectId und vercelToken setzen.",
        },
      );
    }
    await this.#db.query(
      `INSERT INTO deploy_settings (site_id, provider, netlify_site_id, netlify_token_encrypted, vercel_project_id, vercel_token_encrypted, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (site_id) DO UPDATE SET
         provider = $2, netlify_site_id = $3, netlify_token_encrypted = $4, vercel_project_id = $5, vercel_token_encrypted = $6, updated_at = $7`,
      [siteId, provider, netlifySiteId, nextNetlifyToken, vercelProjectId, nextVercelToken, now],
    );
    return this.getDeploySettings(siteId);
  }

  // The encrypted token for the deploy itself; decryption happens in the
  // settings layer (resolveNetlifyToken / resolveVercelToken), never in the store.
  async getNetlifyTokenEncrypted(siteId: string): Promise<string | null> {
    const row = (
      await this.#db.query<DeploySettingsRow>(
        `SELECT netlify_token_encrypted FROM deploy_settings WHERE site_id = $1`,
        [siteId],
      )
    ).rows[0];
    const stored =
      typeof row?.netlify_token_encrypted === "string" ? row.netlify_token_encrypted : null;
    return stored;
  }

  async getVercelTokenEncrypted(siteId: string): Promise<string | null> {
    const row = (
      await this.#db.query<DeploySettingsRow>(
        `SELECT vercel_token_encrypted FROM deploy_settings WHERE site_id = $1`,
        [siteId],
      )
    ).rows[0];
    const stored =
      typeof row?.vercel_token_encrypted === "string" ? row.vercel_token_encrypted : null;
    return stored;
  }

  // Carries the live URL of a hosted deploy into the record's target field
  // (static keeps its directory, netlify gets its deploy URL).
  async updateDeploymentTarget(id: string, target: string): Promise<void> {
    await this.#db.query(`UPDATE deployments SET target = $2 WHERE id = $1`, [
      id,
      target,
    ]);
  }
}
