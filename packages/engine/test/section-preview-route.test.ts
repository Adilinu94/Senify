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
import { previewFileName } from "../src/section-previews.ts";
import { bootEngine, createTestSite, type BootEnv } from "./helpers.ts";

// Die Route der Site-Vorschaubilder. Die zwei Wege sind der Kern:
//
//   GET  antwortet SOFORT - mit dem Bild (200) oder mit "entsteht gerade"
//        (202, Bau laeuft im Hintergrund). Ein Bake braucht gemessen
//        Sekunden; ein Panel, das so lange wartet, ist schlechter als das
//        alte Bild.
//   POST wartet und liefert das fertige Bild (201). Diesen Weg nehmen das
//        Generator-Skript und dieser Test.
//
// Der Test wartet NICHT auf die Uhr, sondern auf `sectionPreviewsIdle()`:
// unter Volllast (alle Suiten gleichzeitig) braucht derselbe Bake ein
// Vielfaches, und ein Zeitfenster waere dann entweder falsch knapp oder
// falsch grosszuegig. Die Warteschlange ist der echte Aufhaengepunkt.
//
// Jeder Fall bekommt eine EIGENE Site: die Bilder liegen je Site, und ein
// Fall soll nicht davon abhaengen, was ein anderer schon gebacken hat.

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
  "hex",
);

describe("Sektions-Vorschau als Route", () => {
  let env: BootEnv;
  let context: EngineContext;
  const ordner: string[] = [];

  beforeAll(async () => {
    env = await bootEngine();
    const rateLimiter = new RateLimiter({ perMinute: 1000, burst: 1000, destructivePerMinute: 1000 });
    const dir = mkdtempSync(join(tmpdir(), "senify-preview-route-"));
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
    route.handler(context, params, new IncomingMessage(new Socket()), new URL("http://localhost"), undefined);

  const neueSite = async (): Promise<string> => (await createTestSite(env.api)).id;

  it("antwortet beim ersten Aufruf sofort mit 'entsteht gerade'", async () => {
    // Der Punkt: keine Wartezeit im Panel. Die Grenze ist gross, sie trennt
    // nur "sofort" von "ein Bake lang" - nicht Millisekunden.
    const siteId = await neueSite();
    setSectionPreviewShooter(async () => ({ png: PNG }));
    const start = Date.now();
    const result = await call(get, { siteId, type: "hero", file: "split.png" });

    expect(result.status).toBe(202);
    expect((result.body as { status: string }).status).toBe("warming");
    expect(Date.now() - start).toBeLessThan(2000);
    await sectionPreviewsIdle();
  });

  it("liefert das Bild, sobald der Hintergrundlauf fertig ist", async () => {
    const siteId = await neueSite();
    setSectionPreviewShooter(async () => ({ png: PNG }));
    await call(get, { siteId, type: "hero", file: "split.png" });
    // Kein Zeitfenster: auf die Arbeit warten, nicht auf die Uhr.
    await sectionPreviewsIdle();

    const theme = await context.store.getTheme(siteId);
    const zweit = await call(get, { siteId, type: "hero", file: "split.png" });

    expect(zweit.status).toBe(200);
    expect(zweit.file?.path).toBe(
      join(context.dataDir, "section-previews", siteId, previewFileName("hero", "split", theme.version)),
    );
    expect(zweit.file?.contentType).toBe("image/png");
    expect(zweit.file?.headers?.["x-senify-preview"]).toBe("cached");
  });

  it("startet fuer dasselbe Bild keinen zweiten Bake", async () => {
    const siteId = await neueSite();
    let bakes = 0;
    setSectionPreviewShooter(async () => {
      bakes += 1;
      return { png: PNG };
    });

    // Zehn Anfragen in kurzer Folge - so sieht das Panel aus.
    await Promise.all(
      Array.from({ length: 10 }, () => call(get, { siteId, type: "hero", file: "split.png" })),
    );
    await sectionPreviewsIdle();

    // Genau ein Bake, nicht zehn.
    expect(bakes).toBe(1);
  });

  it("POST wartet und liefert das fertige Bild", async () => {
    const siteId = await neueSite();
    setSectionPreviewShooter(async () => ({ png: PNG }));
    const result = await call(post, { siteId, type: "hero", file: "split.png" });

    const theme = await context.store.getTheme(siteId);
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      path: previewFileName("hero", "split", theme.version),
      fresh: true,
    });
  });

  it("weist eine fehlende Site-Kennung zurueck", async () => {
    await expect(call(get, { type: "hero", file: "split.png" })).rejects.toMatchObject({
      category: "validation",
      field: "siteId",
    });
  });

  it("liefert nur .png", async () => {
    const siteId = await neueSite();
    await expect(call(get, { siteId, type: "hero", file: "split.jpg" })).rejects.toMatchObject({
      category: "not_found",
      field: "file",
    });
  });

  it("weist eine unbekannte Variante zurueck, statt still zu warten", async () => {
    // Auch der Hintergrundweg prueft die Variante: sonst liefe ein Bake fuer
    // etwas, das es nicht gibt, und die Kachel bliebe fuer immer leer.
    const siteId = await neueSite();
    setSectionPreviewShooter(async () => ({ png: PNG }));
    await expect(call(post, { siteId, type: "hero", file: "gibtsnicht.png" })).rejects.toMatchObject({
      category: "not_found",
      field: "variant",
    });
  });
});
