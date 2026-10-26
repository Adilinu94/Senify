import { listenReachable } from "@senify/core/net";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { captureBrowser } from "@senify/framer-import";

// U5c (Live-Messung 26.10.2026): Die Seite hat 10 WAAPI-Animationen, alle
// 400–1050 ms lang. Gemessen ueber die Zeit:
//
//     0 ms: 11 laufend / 11 gesamt
//   450 ms:  2 laufend /  2 gesamt
//  1500 ms:  0 laufend /  0 gesamt   <- hier misst der Capture
//
// Framer RAeumt seine Animationen nach dem Lauf weg (`getAnimations()` ist
// danach leer). Der Capture wartet aber erst den Settle-Pass ab und misst dann.
// Ergebnis: `motion: 0`, obwohl die Seite sich bewegt.
//
// Der Fix nimmt das WAAPI-Inventar unmittelbar nach `load` auf — solange die
// Animationen laufen — und ordnet die Ziele spaeter den IR-Knoten zu, wenn die
// Knotenschluessel gestempelt sind.
//
// Diese Seite bildet das nach: eine JS-Animation, die sich nach dem Lauf selbst
// entfernt (genau das Verhalten, das die Messung zeigt).

const playwright = await import("playwright").catch(() => undefined);
const browserAvailable = (() => {
  if (playwright === undefined) return false;
  try {
    return existsSync(playwright.chromium.executablePath());
  } catch {
    return false;
  }
})();

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Kurze Animation</title>
</head><body><div id="main" data-framer-hydrate-v2>
  <div id="mover" data-framer-name="Mover"><p>Bewegt sich kurz</p></div>
</div>
<script>
  // 400 ms, danach entfernt: das Verhalten, das Framer auf der Live-Seite zeigt.
  (function () {
    var el = document.getElementById("mover");
    var a = el.animate(
      [{ opacity: 0, transform: "translateY(40px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 400, easing: "ease-out", fill: "none" },
    );
    a.onfinish = function () { a.cancel(); };
  })();
</script></body></html>`;

function startServer(): Promise<{ server: import("node:http").Server; origin: string }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(PAGE);
  });
  return new Promise((done) => {
    listenReachable(server, 0, "127.0.0.1").then(() => {
      const address = server.address();
      done({ server, origin: `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}` });
    });
  });
}

describe.skipIf(!browserAvailable)("U5c: kurzlebige Animationen", () => {
  it("findet eine Animation, die vor dem Settle-Pass schon vorbei ist", async () => {
    const { server, origin } = await startServer();
    try {
      // Settle bewusst lang: der Effekt ist nach 400 ms vorbei, der Capture
      // wartet 1500 ms. Nur die fruehe Aufnahme kann ihn noch sehen.
      const result = await captureBrowser({ url: `${origin}/`, settleMs: 1500, motion: "live" });
      const waapi = result.document.motion.filter((sample) => sample.library === "waapi");
      expect(waapi.length).toBeGreaterThan(0);
      // Und sie traegt ihre Dauer in Millisekunden (WAAPI-Einheit).
      expect(waapi[0]?.params["duration"]).toBe(400);
      // Und einen Knotenbezug, sonst kann der Mapper sie nirgends anhaengen.
      expect(waapi[0]?.nodeKey).not.toBeNull();
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  }, 120_000);
});
