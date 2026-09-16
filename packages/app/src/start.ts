import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SenifyError } from "@senify/core";
import { createEngine, createPgDb, createReviewVisualDriver, type Db } from "@senify/engine";
import type { RateLimitConfig, ReferenceDeps, ReviewVisualDriver } from "@senify/engine";
import { createRegistry } from "@senify/registry";
import { openBrowser } from "./browser.ts";
import { createAppServer } from "./server.ts";

export const DEFAULT_ENGINE_PORT = 4321;
export const DEFAULT_APP_PORT = 4322;

export type StartProgramOptions = {
  // Tests inject a database; the CLI passes a connection string.
  db?: Db;
  databaseUrl?: string;
  enginePort?: number;
  appPort?: number;
  dataDir?: string;
  programTokenFile?: string;
  openBrowser?: boolean;
  // The engine's token buckets. Browser tests that burst edits raise them;
  // production keeps the defaults.
  rateLimits?: RateLimitConfig;
  // Visual review artifacts (T07): Playwright capture of the review submit.
  // On by default; `false` switches it off for headless runs.
  reviewVisuals?: ReviewVisualDriver | false;
  // Reference analysis (T14): capture/analyzer seam for tests; without it the
  // live Playwright capture and the heuristic analyzer run.
  referenceDeps?: ReferenceDeps;
};

export type RunningProgram = {
  engineOrigin: string;
  dashboardUrl: string;
  enginePort: number;
  appPort: number;
  close(): Promise<void>;
};

function programTokenPath(): string {
  return join(homedir(), ".senify", "program-token.json");
}

// The dashboard is the local operator surface. It reuses one persisted token
// (name "Programm") and heals itself when the token was revoked or expired.
async function ensureOperatorToken(
  engineOrigin: string,
  path: string,
): Promise<string> {
  try {
    const saved = JSON.parse(readFileSync(path, "utf8")) as {
      secret?: string;
    };
    if (typeof saved.secret === "string" && saved.secret !== "") {
      const check = await fetch(`${engineOrigin}/api/whoami`, {
        headers: { authorization: `Bearer ${saved.secret}` },
      });
      if (check.ok) return saved.secret;
    }
  } catch {
    // No usable saved token: create one below.
  }
  const created = await fetch(`${engineOrigin}/api/tokens`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Programm",
      scopes: ["read", "write", "publish"],
    }),
  });
  if (!created.ok) {
    throw new SenifyError(
      "auth",
      `Der Programm-Zugang konnte nicht angelegt werden (HTTP ${created.status})`,
      { suggestion: "Prüfe, ob die Engine läuft, und starte das Programm erneut." },
    );
  }
  const payload = (await created.json()) as {
    token: { id: string };
    secret: string;
  };
  try {
    mkdirSync(join(homedir(), ".senify"), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ id: payload.token.id, secret: payload.secret }, null, 2)}\n`);
  } catch {
    // Without the file the token lives only for this run.
  }
  return payload.secret;
}

function connectDatabase(url: string): ReturnType<typeof createPgDb> {
  return createPgDb(url);
}

// `senify start`: engine up, dashboard up, browser open.
export async function startProgram(
  options: StartProgramOptions = {},
): Promise<RunningProgram> {
  let db = options.db;
  let closeDb: (() => Promise<void>) | undefined;
  if (!db) {
    const url = options.databaseUrl;
    if (!url) {
      throw new SenifyError("validation", "Keine Datenbank konfiguriert", {
        field: "databaseUrl",
        suggestion:
          "Setze SENIFY_DATABASE_URL oder DATABASE_URL (z. B. postgres://postgres@127.0.0.1:5432/senify).",
      });
    }
    const pg = connectDatabase(url);
    db = pg;
    closeDb = () => pg.close();
  }

  let engine;
  try {
    engine = await createEngine({
      db,
      registry: createRegistry(),
      ...(options.dataDir === undefined ? {} : { dataDir: options.dataDir }),
      ...(options.rateLimits === undefined ? {} : { rateLimits: options.rateLimits }),
      ...(options.reviewVisuals === false
        ? {}
        : { reviewVisuals: options.reviewVisuals ?? createReviewVisualDriver() }),
      ...(options.referenceDeps === undefined
        ? {}
        : { referenceDeps: options.referenceDeps }),
    });
  } catch (error) {
    await closeDb?.();
    throw new SenifyError(
      "conflict",
      `Die Engine konnte nicht starten: ${error instanceof Error ? error.message : "unbekannter Fehler"}`,
      {
        suggestion:
          "Läuft PostgreSQL? Prüfe DATABASE_URL und versuche es erneut.",
      },
    );
  }

  const engineServer = await engine.listen({
    port: options.enginePort ?? DEFAULT_ENGINE_PORT,
  });
  let appServer;
  try {
    const operatorToken = await ensureOperatorToken(
      engineServer.origin,
      options.programTokenFile ?? programTokenPath(),
    );
    appServer = await createAppServer({
      engineOrigin: engineServer.origin,
      operatorToken,
      port: options.appPort ?? DEFAULT_APP_PORT,
    });
  } catch (error) {
    await engineServer.close();
    await closeDb?.();
    throw error;
  }

  const dashboardUrl = appServer.origin;
  // Autostart (settings, default off): open the browser automatically unless
  // the caller decided explicitly (openBrowser) — `--no-open` wins.
  const settings = await engine.store.getEngineSettings();
  if (options.openBrowser ?? settings.autostart) openBrowser(dashboardUrl);
  return {
    engineOrigin: engineServer.origin,
    dashboardUrl,
    enginePort: engineServer.port,
    appPort: appServer.port,
    close: async () => {
      await appServer.close();
      await engineServer.close();
      await closeDb?.();
    },
  };
}
