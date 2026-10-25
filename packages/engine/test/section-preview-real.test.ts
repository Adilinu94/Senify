import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { RateLimiter } from "@senify/engine";
import { createUploadSigner } from "../src/media.ts";
import type { EngineContext } from "../src/http-contract.ts";
import {
  resetSectionPreviewState,
  sectionPreviewRoutes,
  sectionPreviewsIdle,
  setSectionPreviewShooter,
} from "../src/http-routes-section-preview.ts";
import { bootEngine, createTestSite, type BootEnv } from "./helpers.ts";

// Die Sektions-Vorschau mit dem ECHTEN Fotografen.
//
// Warum eine eigene Datei: der produktive Weg startet Playwright und braucht
// gemessen 6-19 Sekunden je Bild. In `section-preview-route.test.ts` stehen
// die Vertragstests, die mit einem Doppel in Millisekunden laufen. Beides in
// einer Datei hiess: die langen Bakes blockieren die modulweite Warteschlange,
// und ein spaeterer Test wartete auf fremde Arbeit - im Volllauf wurde daraus
// ein Timeout, einzeln war alles gruen.
//
// WARUM HIER EIN SKIP STEHT (25.10.2026, CI-Fund):
// Der Coverage-Job der CI installiert bewusst KEINEN Browser - er soll von der
// Sache reden und nicht von der Playwright-Last des Laufers (siehe
// `.github/workflows/verify.yml`, Job `coverage`). Ohne Skip waren beide Faelle
// dort rot: `browserType.launch: Executable doesn't exist`. Der `verify`-Job
// installiert Chromium und faehrt sie wirklich.
//
// Der Skip ist das Muster, das alle Browser-Suiten hier benutzen
// (`describe.skipIf(!browserAvailable)`); er ist NICHT still: mit
// `SENIFY_REQUIRE_BROWSER=1` und fehlendem Browser wird der Lauf rot, statt
// gruen ohne Test zu sein.

/**
 * Ist ein Chromium vorhanden, das zu dieser Playwright-Version passt?
 *
 * Absichtlich dieselbe Pruefung wie in `packages/app/test/support.ts`: die
 * Frage ist "liegt die ausfuehrbare Datei", nicht "ist das Paket da". Ein
 * installiertes Paket ohne Browser ist genau der CI-Fall.
 */
const browserAvailable = await (async (): Promise<boolean> => {
  try {
    const playwright = await import("playwright");
    const { existsSync } = await import("node:fs");
    return existsSync(playwright.chromium.executablePath());
  } catch {
    return false;
  }
})();

/**
 * Der Skip ist NICHT still: mit `SENIFY_REQUIRE_BROWSER=1` faellt der Lauf
 * durch, statt gruen ohne Test zu sein. Dieselbe Regel wie
 * `packages/app/test/support.ts` (`browserSkip`): ein gruener Lauf, in dem
 * die Browser-Tore nie gelaufen sind, ist kein Nachweis.
 *
 * Im Coverage-Job der CI ist die Variable nicht gesetzt (er installiert keinen
 * Browser) - dort ueberspringt die Datei. Im `verify`-Job ist sie gesetzt und
 * Chromium installiert - dort laufen beide Faelle wirklich.
 */
const browserRequired = process.env["SENIFY_REQUIRE_BROWSER"] === "1";
const browserSkip = !browserAvailable && !browserRequired;

describe.skipIf(browserSkip)("Sektions-Vorschau: der echte Bake", () => {
  let env: BootEnv;
  let context: EngineContext;
  const ordner: string[] = [];

  beforeAll(async () => {
    env = await bootEngine();
    const rateLimiter = new RateLimiter({
      perMinute: 1000,
      burst: 1000,
      destructivePerMinute: 1000,
    });
    const dir = mkdtempSync(join(tmpdir(), "senify-preview-real-"));
    ordner.push(dir);
    context = {
      ...env.engine,
      dataDir: dir,
      rateLimiter,
      formRateLimiter: rateLimiter,
      uploadSigner: createUploadSigner("test-secret"),
    };
  });

  afterAll(async () => {
    await sectionPreviewsIdle();
    setSectionPreviewShooter(undefined);
    resetSectionPreviewState();
    await env.close();
    for (const dir of ordner.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  const get = sectionPreviewRoutes.find((entry) => entry.method === "GET");
  const post = sectionPreviewRoutes.find((entry) => entry.method === "POST");
  if (get === undefined || post === undefined) throw new Error("Route fehlt");

  const call = (route: typeof get, params: Record<string, string>) =>
    route.handler(
      context,
      params,
      new IncomingMessage(new Socket()),
      new URL("http://localhost"),
      undefined,
    );

  // Der Zweig `shooter ?? createSectionPreviewShooter()` im POST-Weg.
  it("baut ohne eingesetztes Doppel, wenn der Worker da ist", async () => {
    const siteId = (await createTestSite(env.api)).id;
    setSectionPreviewShooter(undefined);

    const result = await call(post, { siteId, type: "hero", file: "split.png" });
    expect(result.status).toBe(201);
    const body = result.body as { bytes: number; fresh: boolean };
    // Ein echtes PNG ist gross; 100 Bytes schliessen ein leeres Versprechen aus.
    expect(body.bytes).toBeGreaterThan(100);
    expect(body.fresh).toBe(true);
  }, 120000);

  // Derselbe Zweig im GET-Weg (der Bake laeuft im Hintergrund).
  it("baut auch im Hintergrundlauf ohne eingesetztes Doppel", async () => {
    const siteId = (await createTestSite(env.api)).id;
    setSectionPreviewShooter(undefined);

    const erst = await call(get, { siteId, type: "hero", file: "split.png" });
    expect(erst.status).toBe(202);
    await sectionPreviewsIdle();

    const zweit = await call(get, { siteId, type: "hero", file: "split.png" });
    expect(zweit.status).toBe(200);
    expect(zweit.file?.contentType).toBe("image/png");
  }, 120000);
});
