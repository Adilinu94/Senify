import { listenReachable } from "@senify/core/net";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { editorDocumentToNodeTree } from "@senify/engine";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { captureBrowser, runImport } from "@senify/framer-import";
import type { FramerIrDocument, IrNode } from "../src/ir.ts";
import { HOVER_PROPERTIES, mergeHoverMeasurements } from "../src/capture-hover.ts";

// Paket D (Issue 08): Framer schaltet Hover-Varianten in der Laufzeit um, das
// Stylesheet kennt sie nicht. Der Browser-Capture hovert deshalb Links und
// Knöpfe wirklich und legt die gemessene Differenz als `interactions.hover` ab.
// Die Seite unten verhält sich wie diese Laufzeit im Kleinen: ein Skript setzt
// inline Stile bei mouseenter/mouseleave.

const playwright = await import("playwright").catch(() => undefined);
const browserAvailable = (() => {
  if (playwright === undefined) return false;
  try {
    return existsSync(playwright.chromium.executablePath());
  } catch {
    return false;
  }
})();

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
body { margin: 0; }
#main a, #main button { display: block; width: 160px; height: 40px; margin: 8px; }
.sheet { color: rgb(10, 10, 10); }
.sheet:hover { color: rgb(1, 2, 3); }
</style></head><body><div id="main" data-framer-hydrate-v2>
<a class="runtime" href="#a" data-framer-name="Laufzeit" style="background-color: rgb(255, 255, 255); color: rgb(0, 0, 0)">Laufzeit</a>
<a class="still" href="#b" data-framer-name="Ruhig" style="background-color: rgb(255, 255, 255)">Ruhig</a>
<a class="sheet" href="#c" data-framer-name="Stylesheet">Stylesheet</a>
<a class="pulse" href="#d" data-framer-name="Puls" style="opacity: 1">Puls</a>
<div class="card" data-framer-name="Karte" style="width:160px;height:40px"><span class="kid" style="color: rgb(0, 0, 0)">Kind</span></div>
</div>
<script>
  var runtime = document.querySelector(".runtime");
  runtime.addEventListener("mouseenter", function () {
    runtime.style.backgroundColor = "rgb(17, 17, 17)";
    runtime.style.opacity = "0.8";
  });
  runtime.addEventListener("mouseleave", function () {
    runtime.style.backgroundColor = "rgb(255, 255, 255)";
    runtime.style.opacity = "1";
  });
  var sheet = document.querySelector(".sheet");
  sheet.addEventListener("mouseenter", function () { sheet.style.color = "rgb(9, 9, 9)"; sheet.style.opacity = "0.5"; });
  sheet.addEventListener("mouseleave", function () { sheet.style.color = ""; sheet.style.opacity = ""; });
  var pulse = document.querySelector(".pulse");
  setInterval(function () { pulse.style.opacity = String(0.3 + Math.random() * 0.7); }, 15);
  var card = document.querySelector(".card");
  var kid = card.querySelector(".kid");
  card.addEventListener("mouseenter", function () { kid.style.color = "rgb(200, 0, 0)"; });
  card.addEventListener("mouseleave", function () { kid.style.color = "rgb(0, 0, 0)"; });
  document.querySelector(".card").setAttribute("role", "button");
</script></body></html>`;

let server: http.Server;
let origin: string;

beforeAll(async () => {
  server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(PAGE);
  });
  await listenReachable(server, 0, "127.0.0.1");
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});

function byName(document: FramerIrDocument, name: string): IrNode {
  const walk = (node: IrNode): IrNode | undefined => {
    if (node.name === name) return node;
    for (const child of node.children) {
      const hit = walk(child);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  for (const page of document.pages) {
    const hit = walk(page.root);
    if (hit !== undefined) return hit;
  }
  throw new Error(`Knoten ${name} fehlt im IR`);
}

describe.skipIf(!browserAvailable)("captureBrowser misst Hover-Zustände", () => {
  it("legt die Laufzeit-Differenz eines Links als interactions.hover ab", async () => {
    const result = await captureBrowser({ url: `${origin}/`, settleMs: 200 });
    const hover = byName(result.document, "Laufzeit").states[0]?.interactions?.hover;
    expect(hover?.["background-color"]).toBe("rgb(17, 17, 17)");
    expect(hover?.["opacity"]).toBe("0.8");
    // Nur Eigenschaften, die sich ändern: die Textfarbe blieb gleich.
    expect(hover?.["color"]).toBeUndefined();
  }, 90_000);

  it("lässt einen Link ohne Hover-Änderung und einen selbst animierten Link unberührt", async () => {
    const result = await captureBrowser({ url: `${origin}/`, settleMs: 200 });
    expect(byName(result.document, "Ruhig").states[0]?.interactions?.hover).toBeUndefined();
    // Die Deckkraft des Pulses springt ohne Hover; das ist kein Hover-Zustand.
    expect(byName(result.document, "Puls").states[0]?.interactions?.hover?.["opacity"]).toBeUndefined();
  }, 90_000);

  it("lässt eine Stylesheet-Regel gewinnen und ergänzt nur Fehlendes", async () => {
    const result = await captureBrowser({ url: `${origin}/`, settleMs: 200 });
    const hover = byName(result.document, "Stylesheet").states[0]?.interactions?.hover;
    expect(hover?.["color"]).toBe("rgb(1, 2, 3)");
    expect(hover?.["opacity"]).toBe("0.5");
  }, 90_000);

  it("meldet Kinder, die sich beim Hover des Elternknotens ändern, als Befund", async () => {
    const result = await captureBrowser({ url: `${origin}/`, settleMs: 200 });
    expect(byName(result.document, "Karte").states[0]?.interactions?.hover).toBeUndefined();
    const finding = result.document.findings.find((entry) => entry.message.includes("Hover") && entry.nodeKey !== null);
    expect(finding?.nodeKey).toBe(byName(result.document, "Karte").key);
  }, 90_000);

  it("bringt die gemessene Hover-Differenz bis in das gebackene :hover-CSS", async () => {
    const out = mkdtempSync(join(tmpdir(), "senify-hover-measured-"));
    try {
      const run = await runImport({ source: { kind: "url", url: `${origin}/` }, mode: "fidelity", capture: "browser" });
      const resolved = resolveTheme(defaultTheme());
      await bakeSite(
        {
          siteName: "hover",
          baseUrl: "https://hover.local",
          pages: [{ id: "p", path: "/", title: "t", tree: editorDocumentToNodeTree(run.mapped.document) }],
          themeCss: emitCss(resolved),
          styleRules: run.mapped.rules,
          motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
          aeo: false,
        },
        { outDir: out, selfContained: true },
      );
      const files = [join(out, "index.html"), ...readdirSync(join(out, "assets")).filter((name) => name.endsWith(".css")).map((name) => join(out, "assets", name))];
      const css = files.map((file) => readFileSync(file, "utf8")).join("\n");
      expect(css).toMatch(/:hover\s*\{[^}]*background-color:\s*(rgb\(17, 17, 17\)|#111(111)?)/);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 120_000);

  it("misst nichts, wenn hover auf off steht", async () => {
    const result = await captureBrowser({ url: `${origin}/`, settleMs: 200, hover: "off" });
    expect(byName(result.document, "Laufzeit").states[0]?.interactions?.hover).toBeUndefined();
  }, 90_000);
});

describe("mergeHoverMeasurements", () => {
  const node = (key: string): IrNode =>
    ({
      key,
      kind: "container",
      name: null,
      componentType: null,
      baseClasses: [],
      attrs: {},
      states: [
        { device: "desktop", hiddenAt: [], variantHash: null, visual: {}, layout: null, box: null, text: null },
      ],
      children: [],
    }) as unknown as IrNode;

  it("kennt nur eine feste Liste visueller Eigenschaften", () => {
    expect(HOVER_PROPERTIES).toEqual([
      "color",
      "background-color",
      "border-color",
      "opacity",
      "transform",
      "box-shadow",
      "text-decoration-line",
      "filter",
    ]);
  });

  it("ignoriert Schlüssel, die der Baum nicht kennt, und zählt die geschriebenen Knoten", () => {
    const root = node("n1");
    root.children.push(node("n2"));
    const document = { pages: [{ root }], findings: [] } as unknown as FramerIrDocument;
    const written = mergeHoverMeasurements(document, [
      { key: "n2", values: { color: "rgb(1, 2, 3)" }, childrenChanged: false },
      { key: "n99", values: { color: "rgb(4, 5, 6)" }, childrenChanged: false },
    ]);
    expect(written).toBe(1);
    expect(root.children[0]?.states[0]?.interactions?.hover).toEqual({ color: "rgb(1, 2, 3)" });
  });
});
