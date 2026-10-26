// ECHTER Messlauf gegen eine FREMDEL veroeffentlichte Framer-Seite.
//
// Warum als Vitest-Datei und nicht als Skript: das Repo bringt fuer diesen Weg
// nur `preview.ts` (Backen + Ausliefern) mit, aber keinen Pixelvergleich. Die
// Zahlen im Fahrplan wurden ad hoc erhoben und sind damit nicht reproduzierbar.
// Dieser Lauf macht den Weg nachvollziehbar: Original fotografieren -> Import ->
// Backen -> Ausliefern -> drei Breiten fotografieren -> Pixel-Differenz.
//
// Aufruf:
//   $env:SENIFY_ALLOW_PRIVATE_URLS="1"; $env:SENIFY_REQUIRE_BROWSER="1"
//   $env:SENIFY_IMPORT_LIVE_TARGET="https://<site>.framer.app/"
//   pnpm exec vitest run packages/framer-import/test/import-live-probe.test.ts
//
// Er laeuft NICHT in der normalen Suite: ohne SENIFY_IMPORT_LIVE_TARGET
// ueberspringt er sich selbst.
import { listenReachable } from "@senify/core/net";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { captureScreenshots, diffScreenshots, VISUAL_VIEWPORTS, type Breakpoint } from "@senify/analysis-worker";
import { editorDocumentToNodeTree, fontFilesOf } from "@senify/engine";
import { runImport } from "@senify/framer-import";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, mergeThemePatch, resolveTheme } from "@senify/tokens";

const TARGET = process.env["SENIFY_IMPORT_LIVE_TARGET"];
const KEEP = process.env["SENIFY_IMPORT_KEEP_ARTIFACTS"] === "1";
const BREAKPOINTS: readonly Breakpoint[] = ["desktop", "tablet", "mobile"];

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ico": "image/x-icon",
};

function serveDir(root: string): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer((request, response) => {
    let pathname = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    const file = resolve(root, `.${pathname}`);
    if (!file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      response.writeHead(200, {
        "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(readFileSync(file));
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  return new Promise((ok) => {
    void listenReachable(server, 0, "127.0.0.1").then(() => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      ok({ url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((done) => server.close(() => done())) });
    });
  });
}

describe.skipIf(TARGET === undefined || TARGET === "")("live import probe", () => {
  it("imports a published Framer page and measures the pixel difference", async () => {
    const temp = mkdtempSync(join(tmpdir(), "senify-live-probe-"));
    const outDir = join(temp, "site");
    mkdirSync(outDir, { recursive: true });

    // --- Teil 0: das ORIGINAL zuerst fotografieren ------------------------
    // Reihenfolge ist Teil der Messung, nicht Bequemlichkeit. Im ersten
    // Fassungslauf kam das Original NACH einem siebenminuetigen Import und lief
    // in einen `page.goto`-Timeout (30 s): die Maschine war mit dem Import
    // beschaeftigt. Erst fotografieren, dann rechnen.
    //
    // Und mit Wiederholung: eine fremde Seite ueber das Netz ist nicht
    // verlaesslich, ein einzelner Timeout darf die Messung nicht verwerfen.
    const original = await (async () => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          return await captureScreenshots({
            url: TARGET as string,
            outDir: join(temp, "original"),
            breakpoints: BREAKPOINTS,
            motion: "live",
            settleMs: 500,
          });
        } catch (error) {
          lastError = error;
          console.log(`Original-Lauf ${attempt} fehlgeschlagen, neuer Versuch …`);
        }
      }
      throw lastError;
    })();

    // Die Assets laufen ueber einen Doppel-Uploader in den Speicher: der Lauf
    // soll nichts in eine echte Datenbank schreiben.
    let counter = 0;
    const uploads: { assetId: string; filename: string; data: Buffer }[] = [];
    const uploader = async ({ filename, data }: { filename: string; mime: string; data: Buffer; alt: string | null }) => {
      counter += 1;
      const assetId = `up-${counter}`;
      uploads.push({ assetId, filename, data });
      return { assetId, url: `/assets/${assetId}/${filename}`, deduped: false };
    };

    // --- Teil 1: der Import ----------------------------------------------
    const started = Date.now();
    const run = await runImport({
      source: { kind: "url", url: TARGET as string },
      mode: "fidelity",
      uploader,
    });
    const importMs = Date.now() - started;

    // --- Teil 2: derselbe Import ein zweites Mal --------------------------
    // Der Idempotenz-Vertrag (S2.5): gleiche Quelle = gleicher Hash. Er ist die
    // Grundlage dafuer, dass ein zweiter Import "nichts geaendert" melden kann,
    // statt eine neue Revision anzulegen.
    const secondStarted = Date.now();
    const second = await runImport({
      source: { kind: "url", url: TARGET as string },
      mode: "fidelity",
      uploader,
    });
    const secondMs = Date.now() - secondStarted;

    // --- Teil 3: derselbe Import mit Browser-Capture ----------------------
    // `capture: "browser"` laedt die Seite erst in Chromium. Das ist der Weg
    // fuer Inhalte, die ein Skript zur Laufzeit baut (Sternchen, Slider).
    let browserRun: Awaited<ReturnType<typeof runImport>> | null = null;
    let browserMs = 0;
    let browserError: string | null = null;
    try {
      const t = Date.now();
      browserRun = await runImport({
        source: { kind: "url", url: TARGET as string },
        mode: "fidelity",
        capture: "browser",
        uploader,
      });
      browserMs = Date.now() - t;
    } catch (error) {
      browserError = error instanceof Error ? error.message : String(error);
    }

    const document = structuredClone(run.mapped.document);
    const payloads: Record<string, { code: string; integrity: string; bytes: number }> = {};
    for (const [index, payload] of run.payloads.entries()) {
      const id = `rel-payload-${index + 1}`;
      payloads[id] = { code: payload.bundle, integrity: payload.integrity, bytes: payload.bytes };
      for (const node of Object.values(document.nodes)) {
        if (node.primitive !== "payload" || node.props?.["framerPayloadKey"] !== payload.integrity) continue;
        node.props["payloadId"] = id;
        delete node.props["framerPayloadKey"];
      }
    }

    const fontPatch = fontFilesOf(run.mapped.themePatch, run.assets?.fonts ?? []);
    const resolved = resolveTheme(mergeThemePatch(defaultTheme(), fontPatch));
    const assets = Object.fromEntries(
      uploads.map((u) => [u.assetId, { src: `/assets/${u.assetId}/${u.filename}`, width: null, height: null }]),
    );

    await bakeSite(
      {
        siteName: "live-probe",
        baseUrl: "http://127.0.0.1",
        ...(run.breakpoints === null ? {} : { breakpoints: run.breakpoints }),
        pages: [
          {
            id: "p",
            path: "/",
            title: "Live-Probe",
            tree: editorDocumentToNodeTree(document),
          },
        ],
        themeCss: emitCss(resolved),
        styleRules: run.mapped.rules,
        assets,
        payloads,
        motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
        aeo: false,
      },
      { outDir, selfContained: false },
    );
    for (const upload of uploads) {
      const dir = join(outDir, "assets", upload.assetId);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, upload.filename), upload.data);
    }

    const server = await serveDir(outDir);
    try {
      // AUFWAERMEN, dann messen. Der erste Fassungslauf dieses Skripts
      // fotografierte Desktop direkt nach einem siebenminuetigen Import und mass
      // 34,50 % - Tablet 1,32 %, Mobil 0,98 % bei EXAKT gleicher Hoehe. Der
      // zweite Lauf derselben gebackenen Seite (ohne Import davor) ergab 1,35 %.
      // Die Zahl war ein Artefakt der Maschinenlast, kein Layoutfehler. Deshalb:
      // ein Schuss, der weggeworfen wird, damit der gemessene Lauf nicht den
      // Kaltstart zahlt.
      await captureScreenshots({
        url: `${server.url}/`,
        outDir: join(temp, "warmup"),
        breakpoints: ["desktop"],
        motion: "off",
        settleMs: 500,
      });

      // Zweimal messen: streuen die Laeufe, ist die Zahl nicht belastbar, und
      // das soll man am Bericht sehen, nicht raten muessen.
      const senify = await captureScreenshots({
        url: `${server.url}/`,
        outDir: join(temp, "senify"),
        breakpoints: BREAKPOINTS,
        motion: "off",
        settleMs: 500,
      });
      const senifyAgain = await captureScreenshots({
        url: `${server.url}/`,
        outDir: join(temp, "senify-2"),
        breakpoints: BREAKPOINTS,
        motion: "off",
        settleMs: 500,
      });

      const table: {
        breakpoint: string;
        viewport: number;
        originalHeight: number;
        senifyHeight: number;
        changed: number;
        ratio: number;
        ratioSecondRun: number;
      }[] = [];
      for (const breakpoint of BREAKPOINTS) {
        const before = original.find((e) => e.breakpoint === breakpoint);
        const after = senify.find((e) => e.breakpoint === breakpoint);
        const afterAgain = senifyAgain.find((e) => e.breakpoint === breakpoint);
        expect(before).toBeDefined();
        expect(after).toBeDefined();
        expect(afterAgain).toBeDefined();
        const diff = await diffScreenshots({
          before: before!.path,
          after: after!.path,
          outDir: join(temp, "diffs"),
          name: `probe-${breakpoint}`,
          threshold: 24,
        });
        const diffAgain = await diffScreenshots({
          before: before!.path,
          after: afterAgain!.path,
          outDir: join(temp, "diffs"),
          name: `probe-${breakpoint}-2`,
          threshold: 24,
        });
        table.push({
          breakpoint,
          viewport: VISUAL_VIEWPORTS[breakpoint].width,
          originalHeight: before!.height,
          senifyHeight: after!.height,
          changed: diff.changedPixels,
          ratio: diff.ratio,
          ratioSecondRun: diffAgain.ratio,
        });
      }

      // Der Bericht ist der Zweck dieses Laufs: er soll lesbar sein, nicht nur
      // gruen. Deshalb zusaetzlich als Datei, damit man die Zahlen teilen kann.
      const report = {
        target: TARGET,
        // Teil 1: der Import selbst.
        import: {
          durationMs: importMs,
          nodes: run.report.counts.nodes,
          score: run.report.score,
          findings: run.report.findings.length,
          findingKinds: Object.entries(
            run.report.findings.reduce<Record<string, number>>((acc, f) => {
              acc[f.kind] = (acc[f.kind] ?? 0) + 1;
              return acc;
            }, {}),
          )
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10),
          payloads: run.payloads.length,
          breakpoints: run.breakpoints,
          discoveredPages: run.discoveredPages.length,
          assets:
            run.assets === null
              ? null
              : {
                  downloads: run.assets.downloads.length,
                  fonts: run.assets.fonts.length,
                  deduped: run.assets.deduped,
                  failed: run.assets.failed,
                },
        },
        // Teil 2: Idempotenz. Gleiche Quelle muss denselben Hash ergeben.
        idempotency: {
          secondDurationMs: secondMs,
          firstHash: run.irHash,
          secondHash: second.irHash,
          identical: run.irHash === second.irHash,
          sameNodeCount: run.report.counts.nodes === second.report.counts.nodes,
        },
        // Teil 3: der Browser-Capture-Weg.
        browserCapture: {
          durationMs: browserMs,
          error: browserError,
          nodes: browserRun?.report.counts.nodes ?? null,
          score: browserRun?.report.score ?? null,
          payloads: browserRun?.payloads.length ?? null,
        },
        pixel: table,
      };
      writeFileSync(join(temp, "probe-report.json"), JSON.stringify(report, null, 2), "utf8");
      console.log("\n=== LIVE-PROBE ===");
      console.log(JSON.stringify(report, null, 2));
      console.log("Artifakte:", temp, "| behalten:", KEEP);

      // Der Lauf MISST; das Tor fuer Fixtures ist
      // `import-visual-gate-browser.test.ts` mit 2 %. Geprueft wird hier nur,
      // dass die Erhebung selbst vollstaendig ist - sonst waere ein leeres
      // Ergebnis stillschweigend "gruen".
      expect(table.length).toBe(3);
      for (const row of table) {
        expect(row.originalHeight).toBeGreaterThan(0);
        expect(row.senifyHeight).toBeGreaterThan(0);
        expect(row.ratio).toBeGreaterThanOrEqual(0);
      }
    } finally {
      await server.close();
      if (!KEEP) rmSync(temp, { recursive: true, force: true });
    }
  }, 1_800_000);
});
