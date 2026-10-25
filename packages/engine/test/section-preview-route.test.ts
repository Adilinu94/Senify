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
  setSectionPreviewRenderer,
  setSectionPreviewShooter,
} from "../src/http-routes-section-preview.ts";
import { previewFileName } from "../src/section-previews.ts";
import { bootEngine, createTestSite, type BootEnv } from "./helpers.ts";

// Die Route der Site-Vorschaubilder - der VERTRAG, ohne Browser.
//
//   GET  antwortet SOFORT - mit dem Bild (200) oder mit "entsteht gerade"
//        (202, Bau laeuft im Hintergrund). Ein Bake braucht gemessen
//        Sekunden; ein Panel, das so lange wartet, ist schlechter als das
//        alte Bild.
//   POST wartet und liefert das fertige Bild (201). Diesen Weg nehmen das
//        Generator-Skript und die Tests.
//
// Hier laeuft KEIN echter Bake: der Fotograf ist ein Doppel, jeder Fall
// antwortet in Millisekunden. Der echte Weg steht in
// `section-preview-real.test.ts` - getrennt, weil ein Browserstart die
// modulweite Warteschlange blockiert und die Vertragstests dann im Volllauf
// auf fremde Arbeit warten (genau das war am 25.10.2026 ein Timeout).
//
// Der Test wartet NICHT auf die Uhr, sondern auf `sectionPreviewsIdle()`: die
// Warteschlange ist der echte Aufhaengepunkt, eine Zeitgrenze waere geraten.
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
    // Kein echter Seitenbuild je Fall: der Bake kostet gemessen 6-18 s, auch
    // wenn der Fotograf ein Doppel ist - er laeuft ja wirklich. Hier steht der
    // Vertrag der Route, nicht das Backen. Den echten Weg faehrt
    // `section-preview-real.test.ts`.
    //
    // Die Naht liegt VOR dem Fotografen: `shoot` wird weiterhin gerufen, also
    // zaehlen die Tests unten, wie oft gebaut wird. Nur der Seitenbuild faellt
    // weg.
    setSectionPreviewRenderer(async () => {});
  });

  afterAll(async () => {
    await sectionPreviewsIdle();
    setSectionPreviewShooter(undefined);
    setSectionPreviewRenderer(undefined);
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

  it("antwortet auch im GET-Weg mit 404 statt mit 'entsteht gerade'", async () => {
    // Der Fund vom 25.10.2026: der GET-Weg pruefte die Variante NICHT. Er
    // antwortete `202 warming` und startete einen Bake, der zwangslaeufig
    // scheiterte - der Aufrufer bekam "gleich fertig" auf etwas, das nie
    // kommt, und die Kachel blieb fuer immer auf dem Standardbild.
    const siteId = await neueSite();
    setSectionPreviewShooter(async () => ({ png: PNG }));
    await expect(call(get, { siteId, type: "hero", file: "gibtsnicht.png" })).rejects.toMatchObject({
      category: "not_found",
      field: "variant",
    });
  });

  it("weist eine gesperrte Sektion auch im GET-Weg zurueck", async () => {
    // `outlet`, `collection-list` und `card` brauchen einen Zusammenhang und
    // sind nicht einfuegbar - fuer sie gibt es kein Bild, auf keinem Weg.
    const siteId = await neueSite();
    setSectionPreviewShooter(async () => ({ png: PNG }));
    await expect(call(get, { siteId, type: "outlet", file: "default.png" })).rejects.toMatchObject({
      category: "not_found",
      field: "variant",
    });
  });

  it("meldet den Grund, wenn die Fehlersuche eingeschaltet ist", async () => {
    // Der Hintergrundlauf schluckt Fehler absichtlich. Fuer die Fehlersuche
    // gibt es einen Schalter - ohne Test waere unklar, ob er ueberhaupt noch
    // wirkt, und beim naechsten Umbau fiele er still weg.
    const siteId = await neueSite();
    setSectionPreviewShooter(async () => {
      throw new Error("Browser weg");
    });
    const gemeldet: unknown[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => gemeldet.push(args[0]);
    const vorher = process.env["SENIFY_SECTION_PREVIEW_DEBUG"];
    process.env["SENIFY_SECTION_PREVIEW_DEBUG"] = "1";
    try {
      await call(get, { siteId, type: "hero", file: "split.png" });
      await sectionPreviewsIdle();
    } finally {
      console.warn = original;
      if (vorher === undefined) delete process.env["SENIFY_SECTION_PREVIEW_DEBUG"];
      else process.env["SENIFY_SECTION_PREVIEW_DEBUG"] = vorher;
    }
    expect(gemeldet).toContain("[section-preview]");
  });

  it("schweigt im Hintergrundlauf, wenn das Bauen scheitert", async () => {
    // Der Vertrag: ein Fehlschlag im Hintergrund darf den Aufrufer nicht
    // treffen - er hat schon 202. Die naechste Anfrage versucht es erneut.
    //
    // UND: die Warteschlange darf durch einen Fehlschlag nicht anhalten. Die
    // beiden `() => undefined`-Zweige in `oneAtATime` sind genau dafuer da;
    // ohne diesen Fall waeren sie nur "da".
    const siteId = await neueSite();
    setSectionPreviewShooter(async () => {
      throw new Error("Browser weg");
    });
    const result = await call(get, { siteId, type: "hero", file: "split.png" });
    expect(result.status).toBe(202);
    await sectionPreviewsIdle();

    // Ein ZWEITES Bild nach dem Fehlschlag muss wieder gebaut werden koennen.
    // Haengte die Kette, waere sie hier still stehengeblieben.
    let gebaut = 0;
    setSectionPreviewShooter(async () => {
      gebaut += 1;
      return { png: PNG };
    });
    await call(get, { siteId, type: "hero", file: "split.png" });
    await sectionPreviewsIdle();

    const zweit = await call(get, { siteId, type: "hero", file: "split.png" });
    expect(zweit.status).toBe(200);
    expect(gebaut).toBe(1);
  });
});
