import { listenReachable } from "@senify/core/net";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { captureBrowser } from "@senify/framer-import";

// Zwei belegte Fehler des Browser-Captures, die erst mit einem live gerenderten
// Dokument sichtbar werden (gemessen am 22.10.2026 an den drei Fixtures und an
// einer Seite mit JS-erzeugtem Inhalt):
//
//   1. `document.motion = samples` ERSETZT die Motion, die `captureHtml` aus dem
//      Appear-JSON gelesen hat. Das SSR liefert 2 / 5 / 23 Samples, der Browser
//      24 / 29 / 66 - aber die WAAPI-Ziele tragen `data-framer-appear-id`, das
//      sind DIESELBEN Effekte, nur als opacity- und transform-Animation doppelt
//      gezählt. Nach dem Ersetzen stand jeder Effekt doppelt und ohne
//      `fromX/fromY/fromScale` im Bericht; `appearPreset` konnte ihn deshalb
//      nicht mehr auf `fade-up` abbilden.
//
//   2. Der Scroll-Sensor schlüsselt Elemente über `data-framer-name` oder die
//      erste Klasse. Der IR kennt nur `n<ordinal>`. Kein einziges Sample traf
//      je einen Knoten (0 von 24 / 29 / 66), also konnte keine Scroll-Animation
//      je auf einem Element landen.

const playwright = await import("playwright").catch(() => undefined);
const browserAvailable = (() => {
  if (playwright === undefined) return false;
  try {
    return existsSync(playwright.chromium.executablePath());
  } catch {
    return false;
  }
})();

// Eine Seite mit einem Framer-Appear-Effekt im SSR-JSON UND einem Element, das
// sich beim Scrollen anders bewegt als die Seite (der Sensor-Fall).
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Appear und Scroll</title>
<script type="application/json" id="__framer__appearAnimationsContent">${JSON.stringify({
  up: { default: { initial: { opacity: 0.001, y: 40 }, animate: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 160, damping: 30, mass: 1, delay: 0.2 } } } },
})}</script>
<style>.spacer { height: 2400px; } .stickyish { transform: translateY(0); }</style>
</head><body><div id="main" data-framer-hydrate-v2>
  <div data-framer-appear-id="up" style="opacity:0.001;transform:translateY(40px)"><p>Wirkung</p></div>
  <div class="spacer"></div>
  <div class="stickyish" id="mover"><p>Bewegt</p></div>
  <div><span id="word">Wort</span></div>
</div>
<script>
  // Ein Element, das sich beim Scrollen GEGEN die Seite bewegt: genau die Form,
  // die der Sensor als scroll-getriebene Transformation melden soll.
  window.addEventListener("scroll", function () {
    var el = document.getElementById("mover");
    if (el) el.style.transform = "translateY(" + Math.round(window.scrollY * 0.5) + "px)";
  });
  // Eine Einblendung, die NUR die laufende Seite kennt: Framer ruft dafür
  // element.animate() auf, im statischen HTML steht kein Startzustand. Genau
  // diese Form war unsichtbar, weil die Sonde erst nach dem Abklingen fragte.
  window.addEventListener("load", function () {
    var word = document.getElementById("word");
    if (word) {
      word.animate(
        { opacity: [0.001, 1], transform: ["translateY(28px)", "none"] },
        { duration: 900, delay: 200, easing: "linear(0, 0.5, 1)", fill: "both" },
      );
    }
  });
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

describe.skipIf(!browserAvailable)("captureBrowser erhält die Motion des SSR", () => {
  it("behält den Appear-Effekt aus dem SSR-JSON und verdoppelt ihn nicht über WAAPI", async () => {
    const { server, origin } = await startServer();
    try {
      const result = await captureBrowser({ url: `${origin}/`, settleMs: 300, motion: "live" });
      const appear = result.document.motion.filter((sample) => sample.library === "framer" && sample.trigger === "appear");
      // Genau der eine Effekt, den das Appear-JSON beschreibt - nicht zwei
      // (WAAPI meldet opacity und transform als getrennte Animationen).
      expect(appear).toHaveLength(1);
      // Und er trägt weiter seine Startwerte: ohne sie kann der Mapper ihn
      // nicht auf ein Preset abbilden.
      expect(appear[0]?.params["fromY"]).toBe(40);
      expect(appear[0]?.nodeKey).not.toBeNull();
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  }, 120_000);

  it("ordnet ein Scroll-Sample einem IR-Knoten zu", async () => {
    const { server, origin } = await startServer();
    try {
      const result = await captureBrowser({ url: `${origin}/`, settleMs: 300, motion: "live" });
      const scroll = result.document.motion.filter((sample) => sample.trigger === "scroll");
      expect(scroll.length).toBeGreaterThan(0);
      // Der Sensor-Schlüssel muss ein Knotenschlüssel des IR sein, sonst kann
      // keine Scroll-Animation je auf einem Element landen.
      const keys = new Set<string>();
      type IrShape = { key: string; children: IrShape[] };
      const visit = (node: IrShape): void => {
        keys.add(node.key);
        for (const child of node.children) visit(child);
      };
      visit(result.document.pages[0]?.root as unknown as IrShape);
      expect(scroll.every((sample) => sample.nodeKey !== null && keys.has(sample.nodeKey))).toBe(true);
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  }, 120_000);

  // The runtime channel. Framer reveals its words one by one through
  // `element.animate()` — those calls exist only while the page runs, so the
  // static JSON never names them. Two measurements on a real page (`rare-works`)
  // shaped this test:
  //
  //   1. Asking `document.getAnimations()` AFTER settling returns 0: the reveals
  //      are over and a finished animation leaves the list. The probe therefore
  //      records the calls and reads them afterwards — that is 376 of 376.
  //   2. The IR keys must be on the elements BEFORE the reveals are read. Stamped
  //      right after `load`, the page holds 3 elements; half a second later it
  //      holds 3072. With the stamp too early, every recorded call loses its
  //      target (376 recorded, 0 mapped).
  it("holt die Wort-Einblendungen, die nur die laufende Seite kennt", async () => {
    const { server, origin } = await startServer();
    try {
      const result = await captureBrowser({ url: `${origin}/`, settleMs: 300, motion: "live" });
      // The measured reveals arrive as appear specs, not only as findings: that
      // is what the mapper turns into `@keyframes`.
      const measured = (result.document.appear ?? []).filter((spec) => /^n\d+$/.test(spec.appearId));
      expect(measured.length).toBeGreaterThan(0);
      const first = measured[0];
      const variant = first?.variants["default"];
      if (variant === null || variant === undefined) throw new Error("keine Variante");
      // A real start state with numbers, not a paraphrased preset.
      expect(typeof variant.initial?.opacity).toBe("number");
      // And the timing the browser used, as a CSS timing function.
      expect(typeof variant.animate?.transition?.duration).toBe("number");
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  }, 120_000);
});
