// Die Vorschaubilder der Sektions-Varianten im Theme einer Site.
//
// DIE ROUTE: `GET /api/sites/:siteId/section-preview/:type/:variant.png`
// liefert dasselbe Motiv wie `pnpm thumbnails:generate` - aber gebacken mit
// dem Theme DIESER Site.
//
// DIE ZEIT IST DER ENTWURF, nicht ein Detail: ein Bake mit Browser braucht
// gemessen 6-13 Sekunden (ein ganzer Seitenbuild je Bild). Ein Bild, das beim
// Blaettern so lange auf sich warten laesst, ist schlechter als das falsche
// Bild. Also gilt:
//
//   1. Liegt das Bild, antwortet die Route SOFORT (21 ms aus der Platte).
//   2. Fehlt es, antwortet sie mit `202 Accepted` und startet genau EINEN
//      Bake im Hintergrund. Die naechste Anfrage bekommt das Bild.
//   3. Das Panel faellt fuer ein fehlendes Bild auf das Standardbild zurueck
//      (`onerror`), sodass nie eine leere Kachel steht.
//
// `POST` ist der ausdrueckliche Weg: er wartet und liefert das fertige Bild.
// Ihn nehmen das Generator-Skript und die Tests.

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Route } from "./http-contract.ts";
import { requireParam } from "./http-route-support.ts";
import { SenifyError } from "@senify/core";
import {
  createSectionPreviewShooter,
  previewFileName,
  previewPathOf,
  sectionPreview,
  type SectionPreviewShooter,
} from "./section-previews.ts";

/** Der Fotograf, den die Engine benutzt. Tests setzen ein Doppel ein. */
let shooter: SectionPreviewShooter | undefined;

/**
 * Ein Bake auf einmal. Die Sektionen-Auswahl fragt viele Bilder kurz
 * hintereinander an; ohne diese Sperre startete die Engine mehrere Chromium-
 * Instanzen gleichzeitig.
 */
let queue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

// Welche Bilder gerade gebaut werden: ein zweiter Aufruf fuer dasselbe Bild
// startet keinen zweiten Bake.
const building = new Set<string>();

/** Nur fuer Tests: den Fotografen ersetzen. */
export function setSectionPreviewShooter(next: SectionPreviewShooter | undefined): void {
  shooter = next;
}

/** Nur fuer Tests: Warteschlange und Merkliste leeren. */
export function resetSectionPreviewState(): void {
  queue = Promise.resolve();
  building.clear();
}

function cacheDirOf(dataDir: string, siteId: string): string {
  return join(dataDir, "section-previews", siteId);
}

/**
 * Baut ein fehlendes Bild im Hintergrund. Der Aufrufer wartet NICHT - die
 * Route hat schon mit 202 geantwortet. Ein Fehler wird geschluckt: der
 * naechste Aufruf versucht es erneut, und das Panel zeigt solange das
 * Standardbild.
 */
function warmInBackground(input: {
  dataDir: string;
  siteId: string;
  themeCss: string;
  themeVersion: number;
  type: string;
  variant: string;
}): void {
  const key = `${input.siteId}/${previewFileName(input.type, input.variant, input.themeVersion)}`;
  if (building.has(key)) return;
  building.add(key);
  void oneAtATime(async () => {
    try {
      await sectionPreview(
        {
          themeCss: input.themeCss,
          themeVersion: input.themeVersion,
          cacheDir: cacheDirOf(input.dataDir, input.siteId),
          shoot: shooter ?? createSectionPreviewShooter(),
        },
        { type: input.type, variant: input.variant },
      );
    } catch (error) {
      // Fuer den Nutzer still (der Hintergrundlauf ist eine Verbesserung,
      // kein Vertrag); fuer die Fehlersuche auf Wunsch sichtbar.
      if (process.env["SENIFY_SECTION_PREVIEW_DEBUG"] === "1") {
        console.warn("[section-preview]", error);
      }
    } finally {
      building.delete(key);
    }
  });
}

/** Prueft die Dateiendung und gibt die Variante zurueck. */
function variantOf(file: string): string {
  if (!file.endsWith(".png")) {
    throw new SenifyError("not_found", "Nur .png wird ausgeliefert", { field: "file" });
  }
  return file.slice(0, -".png".length);
}

export const sectionPreviewRoutes: Route[] = [
  {
    // `method` und `segments` muessen benachbart bleiben: der Route-Matrix-
    // Generator liest sie mit einem Muster, das keinen Kommentar dazwischen
    // kennt.
    method: "GET",
    segments: ["api", "sites", ":siteId", "section-preview", ":type", ":file"],
    scope: "read",
    // Ein Bild kostet einen Browserstart und soll nicht in die Drosselung
    // laufen: das Panel laedt leicht ein Dutzend beim Blaettern.
    rateLimit: false,
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      const type = requireParam(params, "type");
      const variant = variantOf(requireParam(params, "file"));
      const stored = await context.store.getTheme(siteId);
      const cacheDir = cacheDirOf(context.dataDir, siteId);
      const path = previewPathOf(cacheDir, type, variant, stored.version);

      if (existsSync(path)) {
        return {
          status: 200,
          file: {
            path,
            contentType: "image/png",
            headers: {
              // Der Name traegt die Theme-Version: unter derselben Adresse
              // aendert sich das Bild nicht mehr.
              "cache-control": "public, max-age=31536000, immutable",
              "x-senify-preview": "cached",
            },
          },
        };
      }

      // Fehlt es: sofort antworten, im Hintergrund bauen. Das Panel faellt
      // derweil auf das Standardbild zurueck.
      warmInBackground({
        dataDir: context.dataDir,
        siteId,
        themeCss: stored.css,
        themeVersion: stored.version,
        type,
        variant,
      });
      return {
        status: 202,
        body: {
          status: "warming",
          message: "Das Vorschaubild im Theme der Site entsteht gerade.",
        },
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "section-preview", ":type", ":file"],
    scope: "write",
    rateLimit: false,
    // Der ausdrueckliche Weg: warten, bis das Bild da ist.
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      const type = requireParam(params, "type");
      const variant = variantOf(requireParam(params, "file"));
      const stored = await context.store.getTheme(siteId);
      const shot = await oneAtATime(() =>
        sectionPreview(
          {
            themeCss: stored.css,
            themeVersion: stored.version,
            cacheDir: cacheDirOf(context.dataDir, siteId),
            shoot: shooter ?? createSectionPreviewShooter(),
          },
          { type, variant },
        ),
      );
      return {
        status: 201,
        body: {
          path: previewFileName(type, variant, stored.version),
          bytes: shot.png.byteLength,
          fresh: shot.fresh,
        },
      };
    },
  },
];
