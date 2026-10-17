// SCRATCH, nie mergen: Lauf 5 zur Hoehenluecke bei fluffy-rectangle.
// (a) erste Projektkarte Element fuer Element (berechnete Werte), Original und Import;
// (b) innerstes <main>: Kinder und Enkel. Nur Desktop (1440 px). Ergebnis nach PROBE_OUT.
// PROBE_DRY=1 stoppt nach der Vorbereitung (ohne Browser).
import { listenReachable } from "@senify/core/net";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { VISUAL_VIEWPORTS } from "@senify/analysis-worker";
import { editorDocumentToNodeTree } from "@senify/engine";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { chromium } from "playwright";
import { runImport } from "../src/index.ts";
import { CARD, MAIN2, SCROLL, SNAP } from "./scratch-layout-snap.ts";

const FIXTURE = "framer-fluffy-rectangle-418998";
const FIXTURES = resolve(import.meta.dirname, "fixtures");
const OUT = process.env["PROBE_OUT"] ?? join(tmpdir(), "fluffy-layout3-probe.txt");
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

type Row = { label: string; text: string; h: number; kids: number };
type Main = { err?: string; n: number; mainH: number; l1: Row[]; l2: Row[][] };
type Card = { err?: string; head: string; rows: string[] };
type Side = { total: number; card: Card; main: Main };

function settled(html: string): string {
  return html.replace(/style="([^"]*)"/g, (whole: string, style: string) => {
    const opacity = /(?:^|;)\s*opacity\s*:\s*([0-9.]+)/.exec(style)?.[1];
    if (opacity === undefined || Number(opacity) > 0.01) return whole;
    const next = style.replace(/(^|;)\s*opacity\s*:\s*[0-9.]+/, "$1opacity:1").replace(/(^|;)\s*transform\s*:[^;]*/, "$1");
    return `style="${next}"`;
  });
}

function serve(root: string): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer((request, response) => {
    let path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(root, `.${path}`);
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    let body: Buffer;
    try { body = readFileSync(file); } catch { response.writeHead(404).end(); return; }
    response.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" }).end(body);
  });
  return new Promise((done) =>
    listenReachable(server, 0, "127.0.0.1").then(() => {
      const port = (server.address() as { port: number }).port;
      done({ url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((end) => server.close(() => end())) });
    }),
  );
}

const parse = <T,>(value: unknown): T => JSON.parse(value as string) as T;
const cut = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + "…" : s);

describe("fluffy-rectangle: Layout-Messlauf 5 (scratch)", () => {
  it("liest die Projektkarte aus und vergleicht das innerste main", async () => {
    const work = mkdtempSync(join(tmpdir(), "fluffy-layout3-"));
    const servers: { close(): Promise<void> }[] = [];
    const lines: string[] = [`Plattform ${process.platform}`];
    try {
      const fixtureDir = join(FIXTURES, FIXTURE);
      const original = join(work, "original");
      cpSync(fixtureDir, original, { recursive: true });
      const html = settled(readFileSync(join(original, "index.html"), "utf8"))
        .replace(/<script[\s\S]*?<\/script>/g, "")
        .replace("</head>", "<style>[data-framer-appear-id],[style*='opacity:0.001'],[style*='opacity: 0.001']{opacity:1!important;transform:none!important}</style></head>");
      writeFileSync(join(original, "index.html"), html);

      const run = await runImport({ source: { kind: "mirror", rootDir: fixtureDir }, mode: "fidelity" });
      const resolved = resolveTheme(defaultTheme());
      const imported = join(work, "imported");
      await bakeSite(
        {
          siteName: FIXTURE,
          baseUrl: "https://gate.local",
          pages: [{ id: "page", path: "/", title: FIXTURE, tree: editorDocumentToNodeTree(run.mapped.document) }],
          themeCss: emitCss(resolved),
          styleRules: run.mapped.rules,
          motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
          aeo: false,
        },
        { outDir: imported, selfContained: true },
      );

      if (process.env["PROBE_DRY"] === "1") {
        for (const script of [SNAP, SCROLL, CARD, MAIN2]) expect(() => new Function(`return ${script}`)).not.toThrow();
        lines.push("TROCKENLAUF: Vorbereitung ok, Skripte kompilieren, Browser nicht gestartet");
        return;
      }

      const [sO, sI] = await Promise.all([serve(original), serve(imported)]);
      servers.push(sO, sI);
      const browser = await chromium.launch();
      try {
        lines.push(`Chromium ${browser.version()}`);
        const side = {} as Record<"O" | "I", Side>;
        for (const v of ["O", "I"] as const) {
          const page = await browser.newPage({ viewport: { width: VISUAL_VIEWPORTS.desktop.width, height: VISUAL_VIEWPORTS.desktop.height } });
          try {
            await page.goto(`${v === "O" ? sO.url : sI.url}/index.html`);
            await page.waitForTimeout(2500); // wie im Gate
            await page.evaluate(SCROLL);
            await page.waitForTimeout(1200);
            side[v] = {
              total: parse<{ total: number }>(await page.evaluate(SNAP)).total,
              card: parse<Card>(await page.evaluate(CARD)),
              main: parse<Main>(await page.evaluate(MAIN2)),
            };
          } finally {
            await page.close();
          }
        }
        const { O, I } = side;
        lines.push(`Gesamthoehe Desktop: Original ${O.total} | Import ${I.total}`);
        lines.push(``, `== Projektraster`, `Original: ${O.card.head}`, `Import:   ${I.card.head}`);
        lines.push(``, `== Erste Projektkarte, Original (h=Layouthoehe, lh=berechnete Zeilenhoehe)`, ...O.card.rows);
        lines.push(``, `== Erste Projektkarte, Import`, ...I.card.rows);
        if (!O.main.err && !I.main.err) {
          lines.push(``, `== Innerstes <main>: Anzahl main Original ${O.main.n} / Import ${I.main.n}; Hoehe ${O.main.mainH} | ${I.main.mainH}`);
          lines.push(`Kinder (Index | h Original | h Import | Differenz | Original-Label «Text» | Import-Label «Text»):`);
          for (let k = 0; k < Math.max(O.main.l1.length, I.main.l1.length); k++) {
            const a = O.main.l1[k];
            const b = I.main.l1[k];
            lines.push(`${k} | ${a?.h ?? "-"} | ${b?.h ?? "-"} | ${a && b ? b.h - a.h : ""} | ${cut(a?.label ?? "-", 24)} «${cut(a?.text ?? "", 14)}» k${a?.kids ?? ""} | ${cut(b?.label ?? "-", 24)} «${cut(b?.text ?? "", 14)}» k${b?.kids ?? ""}`);
          }
          for (let k = 0; k < Math.max(O.main.l2.length, I.main.l2.length); k++) {
            const ao = O.main.l2[k] ?? [];
            const bo = I.main.l2[k] ?? [];
            lines.push(``, `-- Kinder von Kind ${k} (Index | h Original | h Import | Differenz | Original | Import)`);
            for (let j = 0; j < Math.max(ao.length, bo.length); j++) {
              lines.push(`${k}.${j} | ${ao[j]?.h ?? "-"} | ${bo[j]?.h ?? "-"} | ${ao[j] && bo[j] ? bo[j]!.h - ao[j]!.h : ""} | ${cut(ao[j]?.label ?? "-", 22)} «${cut(ao[j]?.text ?? "", 12)}» | ${cut(bo[j]?.label ?? "-", 22)} «${cut(bo[j]?.text ?? "", 12)}»`);
            }
          }
        } else {
          lines.push(`main fehlgeschlagen: Original ${O.main.err ?? "ok"}, Import ${I.main.err ?? "ok"}`);
        }
      } finally {
        await browser.close();
      }
    } catch (error) {
      lines.push(`FEHLER: ${String(error).slice(0, 400)}`);
      throw error;
    } finally {
      writeFileSync(OUT, lines.join("\n"));
      await Promise.all(servers.map((s) => s.close()));
      rmSync(work, { recursive: true, force: true });
    }
  }, 600_000);
});
