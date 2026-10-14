// Erzeugt die Vorschaubilder der Sektions-Varianten fuer den Reiter „Sektionen“
// im Elemente-Panel und fuer die Spotlight.
//
// Aufruf: `pnpm thumbnails:generate` (alle) oder
// `pnpm thumbnails:generate hero pricing` (nur diese Sektionen).
//
// Je einfuegbare Sektion und Variante wird eine Seite mit genau diesem Knoten
// gebacken (derselbe Knoten, den das Einfuegen setzt: Golden-Tree plus Preset der
// Variante, Standard-Theme, kein Motion) und mit Chromium bei 1440 CSS-Pixeln
// Breite fotografiert: der Bereich der Sektion mit etwas Rand, mindestens 240 und
// hoechstens 810 Pixel hoch. Das Bild wird auf ein Drittel verkleinert (480 Pixel
// breit), das reicht fuer die Kachel in doppelter Pixeldichte und haelt das Repo
// klein.
//
// Die Bilder sind Illustration, kein Gate: sie zeigen, wie die Variante mit dem
// Beispielinhalt aussieht. Ein Test (`section-thumbnails.test.ts`) stellt sicher,
// dass es zu jeder Variante eine Datei gibt; die Pixel prueft niemand.

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { bundledSections } from "@senify/registry";
import type { Node, NodeTree } from "@senify/section-sdk";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { sectionThumbnailFile } from "../src/explorer/sections-model.ts";
import { SECTION_NOT_INSERTABLE, sectionInsertSpec } from "../src/state/sections.ts";

const OUT_DIR = fileURLToPath(new URL("../assets/section-thumbnails", import.meta.url));
const VIEWPORT = { width: 1440, height: 810 };
const MARGIN = 24;
const MIN_HEIGHT = 240;
const SCALE = 1 / 3;

// Props, die absichtlich nicht im Golden-Tree stehen (der Autor ergaenzt sie),
// aber ohne die die Variante nichts zeigt: die Adresse des Films.
const EXTRA_PROPS: Record<string, Record<string, unknown>> = {
  media: { videoUrl: "https://cdn.example.test/film.mp4" },
};

function treeFor(type: string, variant: string): NodeTree {
  const spec = sectionInsertSpec(type, variant);
  if (spec === undefined) throw new Error(`Keine Einfüge-Daten für ${type}/${variant}`);
  const nodes: Record<string, Node> = {
    root: { id: "root", type: "page", props: {}, children: ["section"] },
    section: {
      id: "section",
      type,
      variant: spec.variant,
      props: { ...spec.props, ...(EXTRA_PROPS[type] ?? {}) } as Node["props"],
    },
  };
  return { rootNodeId: "root", nodes };
}

async function main(): Promise<void> {
  const only = new Set(process.argv.slice(2));
  const targets = bundledSections
    .filter((section) => !SECTION_NOT_INSERTABLE.has(section.type))
    .filter((section) => only.size === 0 || only.has(section.type))
    .flatMap((section) =>
      Object.keys(section.variants ?? {}).map((variant) => ({ type: section.type, variant })),
    );
  if (targets.length === 0) {
    console.error("Keine passende Sektion gefunden.");
    process.exitCode = 1;
    return;
  }

  const resolved = resolveTheme(defaultTheme());
  const work = mkdtempSync(join(tmpdir(), "senify-thumbnails-"));
  try {
    const baked = await bakeSite(
      {
        siteName: "Vorschau",
        baseUrl: "https://vorschau.example.test",
        pages: targets.map(({ type, variant }) => ({
          id: `${type}-${variant}`,
          path: `/${type}-${variant}`,
          title: `${type} ${variant}`,
          tree: treeFor(type, variant),
        })),
        themeCss: emitCss(resolved),
        motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
        profile: "clean",
      },
      { outDir: join(work, "dist"), selfContained: true },
    );

    mkdirSync(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: SCALE,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      for (const { type, variant } of targets) {
        const entry = baked.pages.find((candidate) => candidate.path === `/${type}-${variant}`);
        if (entry === undefined) throw new Error(`Seite ${type}/${variant} fehlt im Bake`);
        await page.goto(pathToFileURL(join(baked.outDir, entry.file)).href, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const file = join(OUT_DIR, sectionThumbnailFile(type, variant));
        // Der Bereich der Sektion; eine feste Leiste (Cookie-Hinweis) steht am
        // Rand des Fensters, deshalb wird der Ausschnitt an dessen Grenzen gekappt.
        const box = await page.locator('[data-node-id="section"]').first().boundingBox();
        const top = Math.max(0, Math.floor((box?.y ?? 0) - MARGIN));
        const wanted = Math.max(MIN_HEIGHT, Math.ceil((box?.height ?? VIEWPORT.height) + 2 * MARGIN));
        const height = Math.max(1, Math.min(wanted, VIEWPORT.height - top));
        await page.screenshot({
          path: file,
          type: "png",
          clip: { x: 0, y: top, width: VIEWPORT.width, height },
        });
        console.log(`${type}/${variant} -> ${sectionThumbnailFile(type, variant)}`);
      }
    } finally {
      await browser.close();
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

await main();
