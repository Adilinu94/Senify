// Vorschaubilder der Sektions-Varianten im Theme einer Site.
//
// DAS PROBLEM: Die Bilder in `packages/editor/assets/section-thumbnails/` sind
// einmal mit dem Standard-Theme gebacken. Eine Site mit eigenen Farben sieht
// in der Sektionsauswahl deshalb Bilder, die nicht ihre sind.
//
// DIE LOESUNG: Dieselbe Vorschau, nur mit dem Theme der Site gebacken. Der
// Theme-Stand steckt im Dateinamen - ein neues Theme ergibt einen neuen Namen,
// und niemand muss pruefen, ob ein Bild alt ist.
//
// WAS HIER NICHT PASSIERT: kein Schreiben in das Repo, kein Bildbearbeitungs-
// Paket (der Browser skaliert selbst), und kein Import aus `@senify/editor` -
// das Editor-Paket haengt an diesem hier. Die Einfuege-Daten werden deshalb
// aus der Registry gebaut, genau wie `sectionInsertSpec` es tut.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SenifyError } from "@senify/core";
import { bundledSections } from "@senify/registry";
import { bakeSite } from "@senify/renderer";
import type { Node, NodeTree, PropValue, SectionDefinition } from "@senify/section-sdk";
import { serveCaptureDir } from "./review-visuals.ts";

// Dieselben Maße wie das Generator-Skript, damit die Bilder im Panel
// austauschbar sind.
const VIEWPORT = { width: 1440, height: 810 };
const THUMB_WIDTH = 480;

// Dieselbe Sperrliste wie im Panel (`SECTION_NOT_INSERTABLE`): diese drei
// brauchen einen Zusammenhang (Layout, Item-Slot, Sammlung) und sind nicht
// ueber das Elemente-Panel einfuegbar - also gibt es auch kein Bild.
const NOT_INSERTABLE: ReadonlySet<string> = new Set(["outlet", "collection-list", "card"]);

const DEFINITIONS: ReadonlyMap<string, SectionDefinition> = new Map(
  bundledSections.map((section) => [section.type, section]),
);

export type SectionPreviewRequest = { type: string; variant: string };

export type SectionPreviewShooter = (input: {
  url: string;
  width: number;
  allowOrigins: string[];
}) => Promise<{ png: Buffer }>;

export type SectionPreviewOptions = {
  /** Das CSS des Site-Themes. */
  themeCss: string;
  /** Die Version des Themes - sie steht im Dateinamen. */
  themeVersion: number;
  /** Wohin die Bilder geschrieben werden (je Site ein Ordner). */
  cacheDir: string;
  /** Der Fotograf. */
  shoot: SectionPreviewShooter;
  /**
   * Backen + fotografieren. Injizierbar, weil ein echter Bake einen Browser
   * startet: die Entscheidung (Zwischenspeicher, Dateiname, Fehler) ist ohne
   * ihn pruefbar.
   */
  render?: (request: SectionPreviewRequest) => Promise<Buffer>;
};

export type SectionPreviewShot = {
  png: Buffer;
  /** Wurde das Bild gerade erzeugt (statt aus dem Zwischenspeicher gelesen)? */
  fresh: boolean;
};

// Der Knoten, den das Einfuegen setzt: Typ, Variante und das Preset der
// Variante auf den Props des Golden-Trees.
function treeFor(type: string, variant: string): NodeTree {
  const definition = DEFINITIONS.get(type);
  if (definition === undefined) {
    throw new SenifyError("not_found", `Unbekannte Sektion ${type}`, { field: "type" });
  }
  const declared = definition.variants?.[variant];
  if (declared === undefined) {
    throw new SenifyError("not_found", `Unbekannte Variante ${type}/${variant}`, {
      field: "variant",
    });
  }
  const props = structuredClone({
    ...definition.golden.tree.props,
    ...declared.preset,
  }) as Record<string, PropValue>;
  const nodes: Record<string, Node> = {
    root: { id: "root", type: "page", props: {}, children: ["section"] },
    section: { id: "section", type, variant, props },
  };
  return { rootNodeId: "root", nodes };
}

/** Ist diese Variante eine, die das Panel anbietet (und also ein Bild hat)? */
export function isPreviewable(type: string, variant: string): boolean {
  if (NOT_INSERTABLE.has(type)) return false;
  const definition = DEFINITIONS.get(type);
  if (definition === undefined) return false;
  return definition.variants?.[variant] !== undefined;
}

/** Alle Varianten, die das Panel anbietet. */
export function previewTargets(): SectionPreviewRequest[] {
  return bundledSections
    .filter((section) => !NOT_INSERTABLE.has(section.type))
    .flatMap((section) =>
      Object.keys(section.variants ?? {}).map((variant) => ({ type: section.type, variant })),
    );
}

/** Der Dateiname eines Bildes. Der Theme-Stand steckt darin. */
export function previewFileName(type: string, variant: string, themeVersion: number): string {
  return `${type}-${variant}-v${themeVersion}.png`;
}

/** Liegt das Bild schon? (Die Route fragt das, bevor sie einen Bake startet.) */
export function previewPathOf(
  cacheDir: string,
  type: string,
  variant: string,
  themeVersion: number,
): string {
  return join(cacheDir, previewFileName(type, variant, themeVersion));
}

/**
 * Das Bild einer Variante im Theme der Site - aus dem Zwischenspeicher, wenn
 * es den Stand schon gibt.
 */
export async function sectionPreview(
  options: SectionPreviewOptions,
  request: SectionPreviewRequest,
): Promise<SectionPreviewShot> {
  if (!isPreviewable(request.type, request.variant)) {
    throw new SenifyError("not_found", `Unbekannte Variante ${request.type}/${request.variant}`, {
      field: "variant",
    });
  }
  const file = previewPathOf(
    options.cacheDir,
    request.type,
    request.variant,
    options.themeVersion,
  );
  if (existsSync(file)) return { png: readFileSync(file), fresh: false };

  const png =
    options.render === undefined ? await shootOne(options, request) : await options.render(request);
  mkdirSync(options.cacheDir, { recursive: true });
  writeFileSync(file, png);
  return { png, fresh: true };
}

// Backen und fotografieren. Ein Bake fuer EIN Bild.
async function shootOne(
  options: SectionPreviewOptions,
  request: SectionPreviewRequest,
): Promise<Buffer> {
  const work = mkdtempSync(join(tmpdir(), "senify-section-preview-"));
  const closers: (() => Promise<void>)[] = [];
  try {
    const out = join(work, "baked");
    await bakeSite(
      {
        siteName: "Vorschau",
        baseUrl: "https://preview.local",
        pages: [
          {
            id: "preview",
            path: "/",
            title: `${request.type} ${request.variant}`,
            tree: treeFor(request.type, request.variant),
          },
        ],
        themeCss: options.themeCss,
        motionTokens: { ease: {}, baseDurationMs: 0, baseStaggerMs: 0 },
        aeo: false,
      },
      { outDir: out, selfContained: true },
    );
    const server = await serveCaptureDir(out);
    closers.push(server.close);
    const shot = await options.shoot({
      url: `${server.origin}/index.html`,
      width: THUMB_WIDTH,
      allowOrigins: [server.origin],
    });
    return shot.png;
  } finally {
    for (const close of closers.reverse()) await close().catch(() => undefined);
    rmSync(work, { recursive: true, force: true });
  }
}

// Der produktive Fotograf: die Thumbnail-Aufnahme des Analyse-Workers, lazy
// geladen, damit eine Engine ohne Browser weiter startet.
export function createSectionPreviewShooter(): SectionPreviewShooter {
  return async ({ url, width, allowOrigins }) => {
    const harness = await import("@senify/analysis-worker").catch(() => {
      throw new SenifyError(
        "not_found",
        "Die Sektions-Vorschau braucht @senify/analysis-worker (Playwright)",
        {
          field: "preview",
          suggestion: "Workspace-Abhängigkeiten installieren (pnpm install).",
        },
      );
    });
    const shots = await harness.captureThumbnails({
      url,
      thumbWidth: width,
      maxPageHeight: VIEWPORT.height,
      settleMs: 250,
      motion: "off",
      browser: { allowOrigins },
    });
    const desktop = shots.find((shot) => shot.breakpoint === "desktop") ?? shots[0];
    if (desktop === undefined) {
      throw new SenifyError("not_found", "Die Vorschau lieferte kein Bild", { field: "preview" });
    }
    return { png: desktop.png };
  };
}

export { THUMB_WIDTH, VIEWPORT };
