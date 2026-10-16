// SCRATCH, nie mergen: wo entsteht die Hoehenluecke (3-5 %) bei fluffy-rectangle?
// Vergleicht Original und Import (wie im Gate) pro Abschnitt und bei den Bildern,
// jeweils vor und nach dem Durchscrollen (loading="lazy"). Ergebnis nach PROBE_OUT.
// PROBE_DRY=1 stoppt nach der Vorbereitung (ohne Browser).
import { listenReachable } from "@senify/core/net";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { VISUAL_VIEWPORTS, type Breakpoint } from "@senify/analysis-worker";
import { editorDocumentToNodeTree } from "@senify/engine";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { chromium } from "playwright";
import { runImport } from "../src/index.ts";
import { SCROLL, SNAP } from "./scratch-layout-snap.ts";

const FIXTURE = "framer-fluffy-rectangle-418998";
const FIXTURES = resolve(import.meta.dirname, "fixtures");
const BREAKPOINTS: Breakpoint[] = ["desktop", "tablet", "mobile"];
const WIDTHS: Partial<Record<Breakpoint, number>> = { tablet: 900 };
const widthOf = (bp: Breakpoint): number => WIDTHS[bp] ?? VISUAL_VIEWPORTS[bp].width;
const OUT = process.env["PROBE_OUT"] ?? join(tmpdir(), "fluffy-layout-probe.txt");
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

type Sec = { i: number; label: string; text: string; top: number; h: number; imgs: number };
type Img = { src: string; lazy: string; ok: boolean; nw: number; nh: number; w: number; h: number };
type Snap = { total: number; raw: string[]; path: string; boxH: number; gap: number; sections: Sec[]; imgSummary: Record<string, number>; topImgs: Img[]; media: Record<string, number> };
type Browser = Awaited<ReturnType<typeof chromium.launch>>;

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

async function capture(browser: Browser, url: string, bp: Breakpoint): Promise<{ pre: Snap; post: Snap }> {
  const page = await browser.newPage({ viewport: { width: widthOf(bp), height: VISUAL_VIEWPORTS[bp].height } });
  try {
    await page.goto(url);
    await page.waitForTimeout(2500); // wie im Gate
    const pre = JSON.parse((await page.evaluate(SNAP)) as string) as Snap;
    await page.evaluate(SCROLL);
    await page.waitForTimeout(1500);
    const post = JSON.parse((await page.evaluate(SNAP)) as string) as Snap;
    return { pre, post };
  } finally {
    await page.close();
  }
}

const sec = (s: Sec | undefined): string => (s ? `${s.label} «${s.text}» sichtbareBilder${s.imgs}` : "-");
const imgLine = (x: Img): string => `h${x.h} (${x.w}x${x.h}, natuerlich ${x.nw}x${x.nh}, ${x.ok ? "geladen" : "LEER"}${x.lazy ? ", " + x.lazy : ""}) …${x.src}`;

function report(bp: Breakpoint, o: { pre: Snap; post: Snap }, i: { pre: Snap; post: Snap }, lines: string[]): void {
  lines.push(``, `== ${bp} (${widthOf(bp)} px)`);
  lines.push(`Gesamthoehe vor/nach Scrollen: Original ${o.pre.total}/${o.post.total}; Import ${i.pre.total}/${i.post.total}`);
  lines.push(`Container Original: ${o.pre.path} (h ${o.pre.boxH}, Luecke ${o.pre.gap}); Import: ${i.pre.path} (h ${i.pre.boxH}, Luecke ${i.pre.gap})`);
  lines.push(`Kinder des Containers (roh) Original: ${o.pre.raw.join(" ; ")}`, `Kinder des Containers (roh) Import: ${i.pre.raw.join(" ; ")}`);
  lines.push(`Abschnitte vor Scrollen (Index | h Original | h Import | Differenz | Original | Import):`);
  const n = Math.max(o.pre.sections.length, i.pre.sections.length);
  for (let k = 0; k < n; k++) {
    const a = o.pre.sections[k];
    const b = i.pre.sections[k];
    lines.push(`${k} | ${a?.h ?? "-"} | ${b?.h ?? "-"} | ${a && b ? b.h - a.h : ""} | ${sec(a)} | ${sec(b)}`);
  }
  const changed = (name: string, x: { pre: Snap; post: Snap }): string => {
    const diffs = x.pre.sections.map((s, k) => ({ k, s, p: x.post.sections[k] })).filter((d) => d.p && d.p.h !== d.s.h).map((d) => `${d.k}:${d.s.h}→${d.p!.h}`);
    return `Abschnitte mit geaenderter Hoehe nach Scrollen, ${name}: ${diffs.length ? diffs.join(", ") : "keine"}`;
  };
  lines.push(changed("Original", o), changed("Import", i));
  lines.push(`Bilder Original vor/nach Scrollen: ${JSON.stringify(o.pre.imgSummary)} / ${JSON.stringify(o.post.imgSummary)}`);
  lines.push(`Bilder Import vor/nach Scrollen:   ${JSON.stringify(i.pre.imgSummary)} / ${JSON.stringify(i.post.imgSummary)}`);
  lines.push(`Medien Original ${JSON.stringify(o.pre.media)}; Import ${JSON.stringify(i.pre.media)}`);
  lines.push(`Groesste Bilder Original (nach Scrollen):`, ...o.post.topImgs.slice(0, 4).map((x) => `   ${imgLine(x)}`));
  lines.push(`Groesste Bilder Import (nach Scrollen):`, ...i.post.topImgs.slice(0, 4).map((x) => `   ${imgLine(x)}`));
}

describe("fluffy-rectangle: Layout-Messlauf (scratch)", () => {
  it("vergleicht Abschnittshoehen und Bilder von Original und Import", async () => {
    const work = mkdtempSync(join(tmpdir(), "fluffy-layout-"));
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
        expect(() => new Function(`return ${SNAP}`)).not.toThrow();
        expect(() => new Function(`return ${SCROLL}`)).not.toThrow();
        lines.push("TROCKENLAUF: Vorbereitung ok, Skripte kompilieren, Browser nicht gestartet");
        return;
      }

      const [sO, sI] = await Promise.all([serve(original), serve(imported)]);
      servers.push(sO, sI);
      const browser = await chromium.launch();
      try {
        lines.push(`Chromium ${browser.version()}`);
        for (const bp of BREAKPOINTS) {
          const o = await capture(browser, `${sO.url}/index.html`, bp);
          const i = await capture(browser, `${sI.url}/index.html`, bp);
          report(bp, o, i, lines);
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
  }, 280_000);
});
