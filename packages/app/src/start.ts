import { SenifyError } from "@senify/core";
import {
  createEngine,
  createPgDb,
  createReviewVisualDriver,
  defaultImageProviders,
  startBakeWorker,
  startImageWorker,
  type Db,
} from "@senify/engine";
import { setSectionPreviewRenderer, setSectionPreviewShooter } from "@senify/engine";
import type { RateLimitConfig, ReferenceDeps, ReviewVisualDriver, SectionPreviewBake, SectionPreviewShooter } from "@senify/engine";
import { createRegistry } from "@senify/registry";
import { openBrowser } from "./browser.ts";
import { createAppServer } from "./server.ts";
import { ensureOperatorToken, programTokenPath } from "./operator-token.ts";

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
  /**
   * Section previews (Produktpunkt): the photographer that bakes a variant with
   * the site's theme. Default: the real Playwright shooter.
   *
   * Why this seam exists: opening the "Sektionen" tab asks for 73 images, and
   * every miss starts a real browser bake INSIDE the dashboard process. A
   * browser test that opens the tab queued 73 bakes and slowed the whole suite
   * (measured 25.10.2026: `elements-panel-browser` took 33 s in CI, 15 s
   * locally, and the save click timed out because the button stayed disabled).
   * Tests pass a double; production keeps the real shooter.
   */
  sectionPreviewShooter?: SectionPreviewShooter;
  /**
   * The page build behind a preview. A bake costs measured 6-19 s PER IMAGE
   * (a whole page build with a browser), so a test that opens the
   * "Sektionen" tab queues 73 of them. The double writes nothing; the
   * photographer seam above still runs, so tests keep counting how often an
   * image is made.
   */
  sectionPreviewBake?: SectionPreviewBake;
};

export type RunningProgram = {
  engineOrigin: string;
  dashboardUrl: string;
  enginePort: number;
  appPort: number;
  close(): Promise<void>;
};

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
  // Section previews: the photographer for the "Sektionen" images. Set AFTER
  // listen, because the module-level switch belongs to the route module and a
  // second `startProgram` in the same process would otherwise inherit the
  // previous test's double. Production passes nothing and gets the real
  // Playwright shooter.
  if (options.sectionPreviewShooter !== undefined) {
    setSectionPreviewShooter(options.sectionPreviewShooter);
  }
  if (options.sectionPreviewBake !== undefined) {
    setSectionPreviewRenderer(options.sectionPreviewBake);
  }
  // The re-bake worker (E12 slice 1): content changes enqueue durable jobs,
  // this loop claims and runs them against the active release's build.
  const bakeWorker = startBakeWorker({
    context: {
      store: engine.store,
      dataDir: engine.dataDir,
      formSigner: engine.formSigner,
      ...(engine.formBaseUrl === undefined ? {} : { formBaseUrl: engine.formBaseUrl }),
    },
    events: engine.events,
  });
  // The image worker (S2): durable generation jobs over the provider chain
  // (custom endpoint → image-use → ComfyUI, configurable in the settings).
  const imageWorker = startImageWorker({
    context: {
      store: engine.store,
      dataDir: engine.dataDir,
      maxUploadBytes: engine.maxUploadBytes,
      providers: (settings) => defaultImageProviders(settings, engine.store),
    },
  });
  let appServer;
  try {
    const operatorToken = await ensureOperatorToken({
      store: engine.store,
      path: options.programTokenFile ?? programTokenPath(),
    });
    appServer = await createAppServer({
      engineOrigin: engineServer.origin,
      operatorToken,
      port: options.appPort ?? DEFAULT_APP_PORT,
    });
  } catch (error) {
    imageWorker.stop();
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
      bakeWorker.stop();
      imageWorker.stop();
      await appServer.close();
      await engineServer.close();
      await closeDb?.();
    },
  };
}
