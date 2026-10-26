import { listenReachable } from "@senify/core/net";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { captureBrowser } from "@senify/framer-import";

// U5d (Live-Messung 26.10.2026): Die Aufzeichnung von `Element.animate` liefert
// **14 Aufrufe**, aber `startValuesOf` las keinen einzigen Startwert.
//
// Der Grund ist die FORM der Keyframes. Die Web Animations API kennt zwei:
//
//   a) Frame-Liste:  [{ opacity: 0.001 }, { opacity: 1 }]
//   b) Eigenschafts-Index (shorthand): { opacity: [0.001, 1] }
//
// Framer benutzt ausschliesslich (b) — gemessen auf
// `concerned-circumstances-187935`:
//
//   { opacity: [0.001, 1] }   mit 400 ms, cubic-bezier(0.44, 0, 0.56, 1)
//
// `startValuesOf` pruefte `Array.isArray(keyframes)`. Bei (b) ist das Objekt
// selbst kein Array, also kam `{}` zurueck — jeder Effekt verlor seinen
// Startwert und der Mapper konnte ihn auf kein Preset mehr legen.
//
// Die Probe bildet beide Formen nach und verlangt, dass BEIDE denselben
// Startwert ergeben.

const playwright = await import("playwright").catch(() => undefined);
const browserAvailable = (() => {
  if (playwright === undefined) return false;
  try {
    return existsSync(playwright.chromium.executablePath());
  } catch {
    return false;
  }
})();

// Form (b): die Shorthand-Form, die Framer schreibt — UND der Aufzeichnungspfad.
// Die Animation entfernt sich nach dem Lauf selbst (wie Framer es tut), also
// steht sie beim Auslesen nicht mehr in `getAnimations()`. Damit kommt der
// Startwert ausschliesslich aus der Aufzeichnung von `Element.animate`, und das
// ist genau die Form, die dort ankommt: ein Eigenschafts-Index, keine Frame-Liste.
const PAGE_SHORTHAND = `<!doctype html><html><head><meta charset="utf-8"><title>Shorthand</title>
</head><body><div id="main" data-framer-hydrate-v2>
  <div id="mover" data-framer-name="Mover"><p>Bewegt sich</p></div>
</div>
<script>
  (function () {
    var el = document.getElementById("mover");
    var a = el.animate(
      { opacity: [0.001, 1], transform: ["translateY(28px)", "translateY(0px)"] },
      { duration: 400, delay: 50, easing: "cubic-bezier(0.44, 0, 0.56, 1)", fill: "both" },
    );
    a.onfinish = function () { a.cancel(); };
  })();
</script></body></html>`;

// Form (a): die Frame-Liste. Muss weiter funktionieren (Cookbook-Form).
const PAGE_FRAMES = `<!doctype html><html><head><meta charset="utf-8"><title>Frames</title>
</head><body><div id="main" data-framer-hydrate-v2>
  <div id="mover" data-framer-name="Mover"><p>Bewegt sich</p></div>
</div>
<script>
  (function () {
    var el = document.getElementById("mover");
    el.animate(
      [{ opacity: 0.001, transform: "translateY(28px)" }, { opacity: 1, transform: "translateY(0px)" }],
      { duration: 400, delay: 50, easing: "ease-out", fill: "both" },
    );
  })();
</script></body></html>`;

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

const waapiOf = async (html: string): Promise<Record<string, unknown>[]> => {
  const { server, origin } = await startServer(html);
  try {
    // Settle laenger als die Animation (400 ms + 50 ms delay): der Effekt ist
    // dann vorbei und steht NICHT mehr in `getAnimations()`. Der Startwert kann
    // also nur aus der Aufzeichnung kommen - genau der Pfad, den die Sonde fuer
    // Framer braucht.
    const result = await captureBrowser({ url: `${origin}/`, settleMs: 1_200, motion: "live" });
    return result.document.motion
      .filter((sample) => sample.library === "waapi")
      .map((sample) => sample.params);
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
  }
};

describe.skipIf(!browserAvailable)("U5d: beide Keyframe-Formen tragen Startwerte", () => {
  it("liest die Shorthand-Form (Eigenschafts-Index), die Framer schreibt", async () => {
    const params = await waapiOf(PAGE_SHORTHAND);
    expect(params.length).toBeGreaterThan(0);
    const first = params[0] ?? {};
    // Vor dem Fix: undefined — `Array.isArray(keyframes)` war falsch.
    expect(first["fromOpacity"]).toBe(0.001);
    expect(first["toOpacity"]).toBe(1);
    expect(first["fromY"]).toBe(28);
    expect(first["toY"]).toBe(0);
    // Und das Timing kommt unveraendert mit.
    expect(first["duration"]).toBe(400);
    expect(first["delay"]).toBe(50);
  }, 120_000);

  it("liest die Frame-Liste weiter, wie bisher", async () => {
    const params = await waapiOf(PAGE_FRAMES);
    expect(params.length).toBeGreaterThan(0);
    const first = params[0] ?? {};
    expect(first["fromOpacity"]).toBe(0.001);
    expect(first["toOpacity"]).toBe(1);
    expect(first["fromY"]).toBe(28);
    expect(first["duration"]).toBe(400);
  }, 120_000);
});
