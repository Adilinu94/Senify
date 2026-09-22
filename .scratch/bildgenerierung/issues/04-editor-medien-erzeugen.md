# Bildgenerierung 04 — Editor: Erzeugen im Medien-Fenster (S4)

Status: resolved (22.09.2026)
Quelle: `.scratch/bildgenerierung/spec.md` (Scheibe S4).
Blocked by: 02
Hinweis: Das Medien-Fenster (Spotlight-Aktion `open-media`) hat noch keinen Handler. Falls es zum
Start dieses Tickets nicht existiert: zuerst Handler + Fenster bauen (eigene kleine Scheibe), dann
den Erzeugen-Bereich ergänzen. Der Erzeugen-Bereich nutzt ausschließlich die S2-Routen.

## Kontext

Der Operator soll Bilder ohne Agent erzeugen können — im Medien-Fenster des Editors, mit demselben
Job-Modell und derselben Asset-Pipeline wie der Agent.

## Aufgabe

1. Medien-Fenster: Bereich „Erzeugen" mit Prompt, Größe (Breite/Höhe, Default 1024²), optional
   Referenz-Auswahl (`referenceId`), Alt-Text, Tags, Ordner.
2. Absenden → `POST /api/sites/:siteId/images/jobs`; Job-Karte mit Status
   (queued/running/succeeded/failed) und genutztem Provider (`providerUsed`) per Polling; nach
   Erfolg erscheint das Asset in der Liste und ist einsetzbar.
3. Cancel (`DELETE`) für `queued`-Jobs; lesbare Fehlerzustände (Provider off, ComfyUI offline,
   OOM → Hinweis auf kleinere Auflösung).
4. Health-Hinweis im Dialog, wenn der Provider nicht konfiguriert ist (Verweis auf Einstellungen).

## Akzeptanz

- Ein im Editor erzeugtes Bild erscheint nach Erfolg in der Bibliothek und ist in einer Sektion
  einsetzbar.
- Cancel funktioniert für `queued`; Fehler sind lesbar und actionable.
- `pnpm verify` grün (inkl. Browser-Test nach vorhandenem Editor-Testmuster).

## Referenzen

- `.scratch/bildgenerierung/spec.md` (User Stories 8-11, S4)
- `packages/editor/src/spotlight.ts` (`open-media`), `packages/editor/src/panels.ts`,
  `packages/app/src/start.ts`

## Comments

- **22.09.2026 — erledigt.** Der `open-media`-Spotlight-Befehl öffnete den Medien-Tab schon
  (`app.js`: `editorInstance.openTab("media")`); der Tab selbst hatte nur Suche + Liste. Neu:
  - `packages/editor/src/media-generate.ts` (headless Modell): Formular-Defaults (1024², Größen-
    Presets in 32er-Schritten), `validateImageGenerateForm`, `imageGenerateRequest` (leere
    Optionalfelder fallen raus, Tags werden gesplittet), Job-Karten-Texte
    (`imageJobStatusLabel`, `imageJobErrorText` inkl. OOM-Hinweis „kleinere Auflösung wählen"),
    `imageHealthHint` (deaktiviert / Provider nicht bereit) und der Bridge-Typ
    `ImageGenerationBridge`.
  - `packages/editor/src/mount.ts`: Der Medien-Tab rendert über der Liste den Bereich
    „Bild erzeugen" (Prompt, Größe, Referenz-Select, Ordner-Select, Alt-Text, Tags, Absenden),
    die Job-Karte (Status · Provider, Fehlertext, „Abbrechen" für `queued`) und den
    Health-Hinweis. Während eines Laufs ist das Formular gesperrt. Die Shell behält die Hoheit
    über HTTP + Polling (`options.imageGeneration`).
  - `packages/app/public/app.js`: Bridge der Shell — `start` (POST `/api/sites/:id/images/jobs`),
    `status`-Polling alle 3 s (`GET /api/images/jobs/:id`), `cancel` (DELETE), Health und
    Referenzliste (GET `/api/images/health`, `/api/references`), Medien-Refresh nach Erfolg
    (`refreshMedia` aus dem bisherigen Inline-Ladevorgang extrahiert).
  - Styles für den Bereich (`__generate`, `__generate-field`, `__job`, `__job-status`) im
    Deep-Water-Skin.
  - Tests: `packages/editor/test/media-generate.test.ts` (6 Tests: Validierung, Request-Bau,
    Job-Labels/Fehler, Health-Hinweis, Tags) und der bestehende Browser-Test
    (`packages/app/test/editor-browser.test.ts`) prüft den Bereich im echten Editor: Media-Tab
    öffnen, „deaktiviert"-Hinweis bei `provider: off`, Formular ausfüllen, Absenden → lesbarer
    Fehler (der absichtliche 400er ist aus der Konsolen-Fehlerliste ausgenommen).
- **Bewusste Grenzen:** (1) Der Browser-Test fährt den Erfolgspfad nicht (die Engine-Tests
  injizieren Provider, der Live-Erfolg ist über den Custom-Smoke bewiesen); (2) die
  Ordner-Auswahl nutzt die `folderId` als Beschriftung (die Ordner-Namen liefert der Medien-Cache
  noch nicht); (3) der Canvas-Pfad (Standardansicht) behandelt `open-media` weiterhin nicht —
  der Medien-Tab lebt im vollen Editor (`?view=editor`).
