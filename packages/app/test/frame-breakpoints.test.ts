// Das Stylesheet des Editor-Frames folgt dem Paar der Site (ADR-0020).
//
// Der Canvas und das Release muessen dasselbe zeigen: der Canvas laedt
// `/editor-frame.css`, das Release backt sein eigenes CSS. Beide uebersetzen
// die Utilities der Sektionen (`md:grid-cols-3`) ueber Tailwinds
// Breakpoint-Variablen - ohne die Schwellen der Site zeigte der Canvas ein
// anderes Raster als das Release, und genau daran misst das Paritaets-Tor.
//
// Der Test prueft beide Seiten des Wegs: der Server kompiliert je Paar, und
// der Browser fragt die Schwellen als Query-Parameter ab.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAppServer } from "../src/server.ts";

let server: Awaited<ReturnType<typeof createAppServer>>;
let port: string;

beforeAll(async () => {
  server = await createAppServer({
    engineOrigin: "http://127.0.0.1:1",
    port: 0,
  });
  port = new URL(server.origin).port;
});

afterAll(async () => {
  await server.close();
});

async function frameCss(query: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`http://127.0.0.1:${port}/editor-frame.css${query}`);
  return { status: res.status, body: await res.text() };
}

describe("das Stylesheet des Editor-Frames", () => {
  it("nutzt die Tailwind-Standards, wenn die Site kein Paar hat", async () => {
    const antwort = await frameCss("");
    expect(antwort.status).toBe(200);
    // Ohne Paar: die Standards (40 / 48 / 64 rem). So baut eine Site ohne
    // eigenes Paar byte-gleich wie vorher.
    expect(antwort.body).toContain("(width >= 40rem)");
    expect(antwort.body).toContain("(width >= 48rem)");
    expect(antwort.body).toContain("(width >= 64rem)");
  }, 120_000);

  it("nutzt die Schwellen der Site, wenn sie ein Paar hat", async () => {
    const antwort = await frameCss("?bp=1200-810");
    expect(antwort.status).toBe(200);
    // Das Paar (1200 / 810) ergibt die Stufen 810 / 940 / 1200 px.
    expect(antwort.body).toContain("(width >= 50.625rem)");
    expect(antwort.body).toContain("(width >= 58.75rem)");
    expect(antwort.body).toContain("(width >= 75rem)");
    // Die Standards sind raus - sonst zeigte der Canvas das alte Raster.
    expect(antwort.body).not.toContain("(width >= 48rem)");
    expect(antwort.body).not.toContain("(width >= 64rem)");
  }, 120_000);

  it("faellt bei einem unbrauchbaren Wert auf den Standard zurueck", async () => {
    // Ein Tippfehler darf nicht dazu fuehren, dass der Canvas ein anderes
    // Raster zeigt als das Release. Der Standard ist in beiden Faellen
    // derselbe.
    for (const query of ["?bp=unsinn", "?bp=1200", "?bp=1200-0", "?bp=1200-810-900"]) {
      const antwort = await frameCss(query);
      expect(antwort.status, query).toBe(200);
      expect(antwort.body, query).toContain("(width >= 40rem)");
      expect(antwort.body, query).toContain("(width >= 48rem)");
      expect(antwort.body, query).toContain("(width >= 64rem)");
    }
  }, 120_000);
});
