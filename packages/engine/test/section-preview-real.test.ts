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
// gemessen 6-13 Sekunden je Bild. In `section-preview-route.test.ts` stehen
// die Vertragstests, die mit einem Doppel in Millisekunden laufen. Beides in
// einer Datei hiess: die langen Bakes blockieren die modulweite Warteschlange,
// und ein spaeterer Test wartete auf fremde Arbeit - im Volllauf wurde daraus
// ein Timeout, einzeln war alles gruen.
//
// Getrennt ist beides ehrlich: hier steht "der Weg im Betrieb funktioniert",
// dort steht "die Route antwortet richtig". Die Trennung ist auch der Grund,
// warum diese Datei 120-Sekunden-Grenzen hat und die andere keine braucht.

describe("Sektions-Vorschau: der echte Bake", () => {
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
