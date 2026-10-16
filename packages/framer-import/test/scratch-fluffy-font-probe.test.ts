// SCRATCH, nie mergen: misst, ob die fehlende Manrope-Schrift im Import die
// Seitenhoehe von fluffy-rectangle erklaert (Fahrplan 15.10., "3-5 % zu kurz").
// Ergebnis geht als Textdatei nach PROBE_OUT; der Workflow macht daraus eine
// Annotation. PROBE_DRY=1 stoppt nach der Vorbereitung (ohne Browser).
import { listenReachable } from "@senify/core/net";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const FIXTURE = "framer-fluffy-rectangle-418998";
const FIXTURES = resolve(import.meta.dirname, "fixtures");
const BREAKPOINTS: Breakpoint[] = ["desktop", "tablet", "mobile"];
const WIDTHS: Partial<Record<Breakpoint, number>> = { tablet: 900 };
const widthOf = (bp: Breakpoint): number => WIDTHS[bp] ?? VISUAL_VIEWPORTS[bp].width;
const OUT = process.env["PROBE_OUT"] ?? join(tmpdir(), "fluffy-font-probe.txt");
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

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

type Browser = Awaited<ReturnType<typeof chromium.launch>>;

async function measure(browser: Browser, url: string, bp: Breakpoint): Promise<{ early: number; late: number; fonts: string }> {
  const page = await browser.newPage({ viewport: { width: widthOf(bp), height: VISUAL_VIEWPORTS[bp].height } });
  try {
    await page.goto(url);
    await page.waitForTimeout(2500); // wie im Gate
    const early = (await page.evaluate("document.documentElement.scrollHeight")) as number;
    await page.evaluate("document.fonts.ready.then(() => 1)");
    await page.waitForTimeout(1500);
    const late = (await page.evaluate("document.documentElement.scrollHeight")) as number;
    const fonts = (await page.evaluate(
      `[...new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/["']/g, "")))].sort().join(",")`,
    )) as string;
    return { early, late, fonts };
  } finally {
    await page.close();
  }
}

async function platformFont(browser: Browser, url: string): Promise<string> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(url);
    await page.waitForTimeout(2500);
    const found = (await page.evaluate(
      `(() => { const el = [...document.querySelectorAll("body *")].find((e) => e.children.length === 0 && (e.textContent || "").trim().length > 20 && /Manrope/.test(getComputedStyle(e).fontFamily)); if (el) el.setAttribute("data-probe", "1"); return !!el; })()`,
    )) as boolean;
    if (!found) return "kein Textknoten mit Manrope gefunden";
    const client: any = await page.context().newCDPSession(page);
    await client.send("DOM.enable");
    await client.send("CSS.enable");
    const doc = await client.send("DOM.getDocument", { depth: 0 });
    const hit = await client.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: '[data-probe="1"]' });
    const res = await client.send("CSS.getPlatformFontsForNode", { nodeId: hit.nodeId });
    return (res.fonts as any[]).map((f) => `${f.familyName}${f.isCustomFont ? " (Webfont)" : " (System)"} x${f.glyphCount}`).join("; ");
  } catch (error) {
    return `Fehler: ${String(error).slice(0, 160)}`;
  } finally {
    await page.close();
  }
}

describe("fluffy-rectangle: Schrift-Messlauf (scratch)", () => {
  it("misst Hoehen mit und ohne die Original-@font-face", async () => {
    const work = mkdtempSync(join(tmpdir(), "fluffy-probe-"));
    const servers: { close(): Promise<void> }[] = [];
    const lines: string[] = [];
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

      // Alle @font-face-Bloecke des Originals (index.html plus Stylesheets).
      const cssDir = join(fixtureDir, "styles");
      const sources = [readFileSync(join(fixtureDir, "index.html"), "utf8"), ...readdirSync(cssDir).filter((n) => n.endsWith(".css")).map((n) => readFileSync(join(cssDir, n), "utf8"))].join("\n");
      const faces = [...new Set(sources.match(/@font-face\s*\{[^}]*\}/g) ?? [])];
      const manrope = faces.filter((f) => /font-family:\s*["']?Manrope/.test(f));
      lines.push(`Plattform ${process.platform}; @font-face im Original: ${faces.length}, davon Manrope: ${manrope.length}`);

      const variant = (name: string, blocks: string[]): string => {
        const dir = join(work, name);
        cpSync(imported, dir, { recursive: true });
        const file = join(dir, "index.html");
        const page = readFileSync(file, "utf8");
        expect(page.includes("</head>")).toBe(true);
        writeFileSync(file, page.replace("</head>", `<style>${blocks.join("\n")}</style></head>`));
        return dir;
      };
      const importedAll = variant("imported-all", faces);
      const importedManrope = variant("imported-manrope", manrope);
      expect(manrope.length).toBeGreaterThan(0);

      if (process.env["PROBE_DRY"] === "1") {
        lines.push("TROCKENLAUF: Vorbereitung ok, Browser nicht gestartet");
        return;
      }

      const [sOriginal, sImport, sAll, sManrope] = await Promise.all([serve(original), serve(imported), serve(importedAll), serve(importedManrope)]);
      servers.push(sOriginal, sImport, sAll, sManrope);
      const targets: [string, string][] = [
        ["Original", sOriginal.url],
        ["Import (wie im Gate)", sImport.url],
        ["Import + alle Original-@font-face", sAll.url],
        ["Import + nur Manrope", sManrope.url],
      ];
      const browser = await chromium.launch();
      try {
        lines.push(`Chromium ${browser.version()}`);
        const table: Record<string, Record<string, { early: number; late: number; fonts: string }>> = {};
        for (const [name, url] of targets) {
          table[name] = {};
          for (const bp of BREAKPOINTS) table[name]![bp] = await measure(browser, `${url}/index.html`, bp);
        }
        for (const bp of BREAKPOINTS) {
          const base = table["Original"]![bp]!;
          lines.push(`-- ${bp} (${widthOf(bp)} px), Original ${base.early}/${base.late} px (nach 2,5 s / nach fonts.ready+1,5 s)`);
          for (const [name] of targets.slice(1)) {
            const m = table[name]![bp]!;
            const pct = (h: number): string => `${((h / base.late - 1) * 100).toFixed(1)} %`;
            lines.push(`   ${name}: ${m.early}/${m.late} px  (${pct(m.early)} / ${pct(m.late)} gegen Original spaet)`);
          }
        }
        lines.push("-- geladene Webfont-Familien (Desktop)");
        for (const [name] of targets) lines.push(`   ${name}: ${table[name]!["desktop"]!.fonts || "(keine)"}`);
        lines.push("-- tatsaechlich gerenderte Schrift fuer einen Manrope-Text (Desktop, CDP)");
        for (const [name, url] of targets) lines.push(`   ${name}: ${await platformFont(browser, `${url}/index.html`)}`);
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
