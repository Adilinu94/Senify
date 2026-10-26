import { listenReachable } from "@senify/core/net";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { captureBrowser } from "@senify/framer-import";

// U5b (Live-Messung 26.10.2026): Die Seite `concerned-circumstances-187935`
// hatte **10 laufende WAAPI-Animationen** (400 ms, eine 447,8 ms) — und der
// Import meldete `Motion: gemessen 0`.
//
// Die Ursache ist eine Annahme, die auf den drei Export-Fixtures stimmte und
// hier bricht:
//
//   `samplesOfProbe` wirft jede WAAPI-Animation weg, die KEIN Loop und KEINE
//   scroll-getriebene Timeline ist. Begründet war das so: „der Appear-Kanal
//   beschreibt dieselben Effekte, doppelt gezählt machen sie den Mapper kaputt."
//   Gemessen stimmte das auf fluffy-rectangle, stupendous-football und
//   easier-train: 2/5/23 Appear-Einträge, 2/5/23 WAAPI-Ziele, kein Ziel ohne
//   JSON-Eintrag.
//
// Auf dieser Seite ist der Appear-Kanal **leer** (`""`, 0 Einträge). Die
// Annahme „das JSON hat es schon" ist dann falsch: Der Filter wirft ALLES weg,
// und die Bewegung, die es gibt, ist für den Import unsichtbar.
//
// Der Fix macht die Annahme prüfbar statt pauschal: Eine WAAPI-Animation wird
// nur dann als Duplikat verworfen, wenn ihr Ziel wirklich einen
// `data-framer-appear-id` trägt, den das Appear-JSON beschreibt. Trägt es keinen,
// ist der Browser die einzige Quelle — und die Animation wird übernommen.

const playwright = await import("playwright").catch(() => undefined);
const browserAvailable = (() => {
  if (playwright === undefined) return false;
  try {
    return existsSync(playwright.chromium.executablePath());
  } catch {
    return false;
  }
})();

// Eine Seite mit WAAPI-Animation OHNE Appear-Kanal: die Form der Live-Seite.
const PAGE_NO_CHANNEL = `<!doctype html><html><head><meta charset="utf-8"><title>Nur WAAPI</title>
<style>
  @keyframes rise { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
  .riser { animation: rise 400ms ease-out both; }
</style>
</head><body><div id="main" data-framer-hydrate-v2>
  <div class="riser" data-framer-name="Riser"><p>Bewegt sich</p></div>
</div></body></html>`;

// Eine Seite MIT Appear-Kanal: dieselbe Bewegung steht schon im JSON. Hier muss
// der Filter weiter greifen, sonst zählt der Effekt doppelt.
const PAGE_WITH_CHANNEL = `<!doctype html><html><head><meta charset="utf-8"><title>Appear und WAAPI</title>
<script type="application/json" id="__framer__appearAnimationsContent">${JSON.stringify({
  up: { default: { initial: { opacity: 0.001, y: 30 }, animate: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 160, damping: 30, mass: 1 } } } },
})}</script>
<style>
  @keyframes rise { from { opacity: 0.001; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
  .riser { animation: rise 400ms ease-out both; }
</style>
</head><body><div id="main" data-framer-hydrate-v2>
  <div class="riser" data-framer-appear-id="up" data-framer-name="Riser"><p>Bewegt sich</p></div>
</div></body></html>`;

function startServer(html: string): Promise<{ server: import("node:http").Server; origin: string }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
  });
  return new Promise((done) => {
    listenReachable(server, 0, "127.0.0.1").then(() => {
      const address = server.address();
      done({ server, origin: `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}` });
    });
  });
}

describe.skipIf(!browserAvailable)("U5b: WAAPI ohne Appear-Kanal", () => {
  it("übernimmt eine WAAPI-Animation, wenn das Appear-JSON nichts darüber sagt", async () => {
    const { server, origin } = await startServer(PAGE_NO_CHANNEL);
    try {
      const result = await captureBrowser({ url: `${origin}/`, settleMs: 400, motion: "live" });
      const waapi = result.document.motion.filter((sample) => sample.library === "waapi");
      // Vor dem Fix: 0 — der Filter warf die einzige vorhandene Bewegung weg.
      expect(waapi.length).toBeGreaterThan(0);
      // Und sie trägt ihre gemessenen Parameter (Millisekunden, wie WAAPI sie
      // liefert), damit der Mapper sie übersetzen kann.
      const sample = waapi[0];
      expect(sample?.params["duration"]).toBe(400);
      expect(sample?.params["durationUnit"]).toBe("ms");
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  }, 120_000);

  it("verwirft sie weiter, wenn das Appear-JSON denselben Effekt beschreibt", async () => {
    const { server, origin } = await startServer(PAGE_WITH_CHANNEL);
    try {
      const result = await captureBrowser({ url: `${origin}/`, settleMs: 400, motion: "live" });
      const appear = result.document.motion.filter((sample) => sample.library === "framer" && sample.trigger === "appear");
      const waapi = result.document.motion.filter((sample) => sample.library === "waapi");
      // Der Appear-Effekt bleibt genau einmal da — mit Startwerten.
      expect(appear).toHaveLength(1);
      expect(appear[0]?.params["fromY"]).toBe(30);
      // Und WAAPI fügt ihn nicht ein zweites Mal hinzu.
      expect(waapi).toHaveLength(0);
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  }, 120_000);
});
