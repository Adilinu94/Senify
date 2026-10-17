// SCRATCH, nie mergen: Lauf 4 zur Hoehenluecke bei fluffy-rectangle.
// (a) vier Varianten: Original / Import, je wie im Gate und mit gleichem Ersatzbild;
// (b) Abstieg in <main> (Kinder und Enkel der drei hoechsten Kinder);
// (c) CSS-Kette der 541-px-Bildcontainer. Ergebnis nach PROBE_OUT.
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
import { CHAIN, SCROLL, SNAP, drillScript, replaceScript } from "./scratch-layout-snap.ts";

const FIXTURE = "framer-fluffy-rectangle-418998";
const FIXTURES = resolve(import.meta.dirname, "fixtures");
const BREAKPOINTS: Breakpoint[] = ["desktop", "tablet", "mobile"];
const WIDTHS: Partial<Record<Breakpoint, number>> = { tablet: 900 };
const widthOf = (bp: Breakpoint): number => WIDTHS[bp] ?? VISUAL_VIEWPORTS[bp].width;
const OUT = process.env["PROBE_OUT"] ?? join(tmpdir(), "fluffy-layout2-probe.txt");
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const DATA_URI = `data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='1469' height='819' viewBox='0 0 1469 819'><rect width='1469' height='819' fill='#888'/></svg>")}`;

type Sec = { label: string; text: string; h: number; imgs: number };
type Snap = { total: number; sections: Sec[] };
type Row = { label: string; text: string; h: number; kids: number };
type Drill = { err?: string; mainH: number; l1: Row[]; tall: number[]; l2: Record<string, Row[]> };
type Browser = Awaited<ReturnType<typeof chromium.launch>>;
type Variant = "O" | "I" | "OE" | "IE";
const VARIANTS: Variant[] = ["O", "I", "OE", "IE"];
const NAME: Record<Variant, string> = { O: "Original", I: "Import", OE: "Original+Ersatzbild", IE: "Import+Ersatzbild" };

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

describe("fluffy-rectangle: Layout-Messlauf 4 (scratch)", () => {
  it("vergleicht vier Varianten, steigt in main ab und liest die Bildcontainer aus", async () => {
    const work = mkdtempSync(join(tmpdir(), "fluffy-layout2-"));
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
        for (const script of [SNAP, SCROLL, CHAIN, drillScript(null), drillScript([1, 2]), replaceScript(DATA_URI)]) expect(() => new Function(`return ${script}`)).not.toThrow();
        lines.push("TROCKENLAUF: Vorbereitung ok, Skripte kompilieren, Browser nicht gestartet");
        return;
      }

      const [sO, sI] = await Promise.all([serve(original), serve(imported)]);
      servers.push(sO, sI);
      const urlOf = (v: Variant): string => `${v.startsWith("O") ? sO.url : sI.url}/index.html`;
      const browser: Browser = await chromium.launch();
      try {
        lines.push(`Chromium ${browser.version()}`);
        const snaps: Record<string, Record<Variant, Snap>> = {};
        let drills: Record<Variant, Drill> | undefined;
        let chains: Record<"O" | "I", string[][]> | undefined;
        for (const bp of BREAKPOINTS) {
          snaps[bp] = {} as Record<Variant, Snap>;
          const tallFrom: { value: number[] | null } = { value: null };
          const d = {} as Record<Variant, Drill>;
          for (const v of VARIANTS) {
            const page = await browser.newPage({ viewport: { width: widthOf(bp), height: VISUAL_VIEWPORTS[bp].height } });
            try {
              await page.goto(urlOf(v));
              await page.waitForTimeout(2500); // wie im Gate
              if (v.endsWith("E")) await page.evaluate(replaceScript(DATA_URI));
              await page.evaluate(SCROLL);
              await page.waitForTimeout(1200);
              snaps[bp]![v] = parse<Snap>(await page.evaluate(SNAP));
              if (bp === "desktop") {
                d[v] = parse<Drill>(await page.evaluate(drillScript(tallFrom.value)));
                if (v === "O" && tallFrom.value === null) tallFrom.value = d[v].tall;
                if ((v === "O" || v === "I") && !chains) chains = { O: [], I: [] };
                if (v === "O" || v === "I") chains![v] = parse<string[][]>(await page.evaluate(CHAIN));
              }
            } catch (error) {
              lines.push(`FEHLER ${bp} ${v}: ${String(error).slice(0, 200)}`);
            } finally {
              await page.close();
            }
          }
          if (bp === "desktop") drills = d;
        }

        lines.push(``, `== Gesamthoehe nach Scrollen (px, in Klammern Abstand zum Original)`);
        for (const bp of BREAKPOINTS) {
          const o = snaps[bp]!["O"]?.total ?? 0;
          const cell = (v: Variant): string => {
            const t = snaps[bp]![v]?.total;
            return t === undefined ? "?" : `${t} (${(((t / (o || 1)) - 1) * 100).toFixed(1)} %)`;
          };
          lines.push(`${bp} ${widthOf(bp)} px: ${VARIANTS.map((v) => `${NAME[v]} ${cell(v)}`).join(" | ")}`);
        }

        lines.push(``, `== Desktop: Abschnitte des Seitencontainers (h: Original | Import | Original+Ersatz | Import+Ersatz)`);
        const secs = VARIANTS.map((v) => snaps["desktop"]![v]?.sections ?? []);
        for (let k = 0; k < Math.max(...secs.map((s) => s.length)); k++) {
          lines.push(`${k} | ${secs.map((s) => s[k]?.h ?? "-").join(" | ")} | ${cut(secs[0]![k]?.label ?? "-", 26)} «${cut(secs[0]![k]?.text ?? "", 14)}»`);
        }

        if (drills && VARIANTS.every((v) => drills![v] && !drills![v]!.err)) {
          const dr = drills;
          lines.push(``, `== Desktop: Kinder von <main> (h: O | I | O+E | I+E) | Original-Label «Text» | Import-Label`);
          lines.push(`main-Hoehe: ${VARIANTS.map((v) => dr[v].mainH).join(" | ")}`);
          for (let k = 0; k < Math.max(...VARIANTS.map((v) => dr[v].l1.length)); k++) {
            lines.push(`${k} | ${VARIANTS.map((v) => dr[v].l1[k]?.h ?? "-").join(" | ")} | ${cut(dr["O"].l1[k]?.label ?? "-", 24)} «${cut(dr["O"].l1[k]?.text ?? "", 14)}» k${dr["O"].l1[k]?.kids ?? ""} | ${cut(dr["I"].l1[k]?.label ?? "-", 24)} k${dr["I"].l1[k]?.kids ?? ""}`);
          }
          for (const i of dr["O"].tall) {
            lines.push(``, `-- Enkel von main-Kind ${i} (h: O | I | O+E | I+E)`);
            for (let j = 0; j < Math.max(...VARIANTS.map((v) => dr[v].l2[String(i)]?.length ?? 0)); j++) {
              lines.push(`${i}.${j} | ${VARIANTS.map((v) => dr[v].l2[String(i)]?.[j]?.h ?? "-").join(" | ")} | ${cut(dr["O"].l2[String(i)]?.[j]?.label ?? "-", 24)} «${cut(dr["O"].l2[String(i)]?.[j]?.text ?? "", 12)}» | ${cut(dr["I"].l2[String(i)]?.[j]?.label ?? "-", 24)}`);
            }
          }
        } else if (drills) {
          lines.push(`Abstieg in main fehlgeschlagen: ${VARIANTS.map((v) => drills![v]?.err ?? "ok").join(", ")}`);
        }

        if (chains) {
          for (const side of ["O", "I"] as const) {
            chains[side].forEach((chain, n) => {
              lines.push(``, `== Bildcontainer ${side === "O" ? "Original" : "Import"}, Bild ${n + 1} (541 px breit), von img nach oben`);
              chain.forEach((row) => lines.push(`  ${row}`));
            });
          }
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
