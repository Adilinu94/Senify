# 14: Referenzen-Tab (Analyse → Design-Profil)

**What to build:** Vollautomatische Website-Analyse für Design-Referenzen. Pipeline im `analysis-worker`: ① Governance/Provenance (URL, Datum, Hash) → ② Capture (Playwright headless: Desktop 1440 / Tablet 810 / Mobile 390, Full-Page- + Sektions-Screenshots, DOM-Dump, Asset-Liste, Motion-Sampling; Job mit Fortschritt; Fallback: Screenshot-Upload bei blockierter Seite) → ③ deterministische Extraktion → ④ KI-Analyse (Familien-Klassifikation, Vokabular, Komponenten-Inventar, Motion-Rezepte, Kompositionsregeln, Evidenz + Konfidenz, keine erfundenen Werte) → ⑤ Design-Profil (JSONB) mit Stil-Blatt, sofort nutzbar. **Umsetzungsbasis `research/29` (site-clone, MIT):** die Probe-Scripts tokens/motion/surface werden adaptiert (Frequenz-Prinzip + Belegstellen, GPU-/Video-/SVG-Routing, Lazy-GPU-Warnung); Evidenz-Stufen `confirmed | observed | inferred` mit „never upgrade"-Regel; Motion-Reveals mappen auf den Preset-Katalog (03). Tab-UI: Karten (Vorschaubild, Familien, „verwendet in N Projekten"), Detailansicht (Token-Swatches, Typo-Skala, Komponenten, Motion, Snapshots, Provenance, Nachbearbeitung → neue Profil-Revision). Wiederverwendung: Projekt-Zuordnung mit Skalen-Zuordnung je Skala (Farben/Typo/Motion/Rest; Default eine Referenz für alles), Theme-Ableitung Profil → Senify-Theme (Verifikation: Anwenden ändert nichts). MCP-Tools `analyze_reference`, `list_references`, `get_reference`, `apply_reference`. Schutzregeln „Inspiration, kein Klon" (Logos/Marken/Originaltexte/Fotos/1:1 nie übernehmen; Lizenz-Font-Hinweis; Nähe-Warnung weich).

**Blocked by:** 04 (Theme & Tokens — Theme-Ableitung), 07 (Lifecycle, Review & Checks — QA-Adhärenz weich), 12 (Programm-Shell — Tab).

**Status:** umgesetzt (`pnpm verify` grün; Analyse-Pipeline mit echter Live-Aufnahme (Playwright/Chromium) und Snapshot-Fallback, Theme-Ableitung, MCP-Workflow, Referenzen-Tab mit Karten, Detailansicht, Snapshot-Bildern und Breakpoint-Slider, Projekt-Zuordnung mit Round-Trip) — offen: Motion-Videos, sobald die Pipeline solche Artefakte erzeugt

- [ ] URL → Analyse-Job → Profil mit Status analyzing/ready/failed; Fortschritt sichtbar; Ergebnis ist sofort in Projekten nutzbar
- [ ] Token-Extraktion frequenz-gerankt mit Belegstellen (uses + where); Typo/Spacing/Radii/Shadows/Breakpoints je Breakpoint; `:root`-Vokabular der Referenz als Mapping-Hinweis erkannt
- [ ] Motion-Sampling liefert Reveal-/Effekt-Inventar mit exakten Runtime-Params und mappt auf die Presets (03); GPU-Flächen (webgl-scene-Hinweise) erkannt; Lazy-GPU-Warnung, wenn Plattform ohne lebende Canvas
- [ ] Evidenz: jede Aussage `confirmed | observed | inferred` + Quelle; nichts wird hochgestuft; Widersprüche markiert
- [ ] KI-Analyse: Familien (18er-Taxonomie), Vokabular (5–8 prompt-fähige Begriffe), Komponenten, Regeln (constants/never), Stil-Blatt (maschinenlesbar)
- [x] Tab-UI: Karten + Detail (Swatches, Typo, Motion, Snapshots, Provenance) + Nachbearbeitung erzeugt Profil-Revision; Löschen mit Nutzungs-Hinweis
- [ ] Skalen-Zuordnung: Referenz(en) im Projekt wirken als Theme-Draft (Skalen-Engine 04); Anwenden ändert den Bake nachweislich nicht (Round-Trip-Verifikation)
- [ ] MCP-Tools `analyze_reference`/`list_references`/`get_reference`/`apply_reference` funktionieren (Prüfstelle 3: „Referenz → Theme → Build"-Workflow)
- [ ] Schutzregeln in UI + Skill-Material; weicher Adhärenz-Hinweis im Review; blockierte Seite → Fallback-Upload mit reduziertem Profil

Quellen: `artifacts/28`, `research/29-site-clone-learnings.md` (Umsetzungsbasis), `research/27` (taste-vault), `artifacts/07` (Theme-Ableitung), Spec „Referenzen-Pipeline (Verträge)".

## Handoff (Stand 15.09.2026)

**Auftrag:** T14 umsetzen, **Backend zuerst** (die Tab-UI hängt an T12 und wird zuletzt angefasst, soweit T12 schon steht). Am Ende, nur bei grünem `pnpm verify`, selbst committen.

**Zusammenarbeit:** Parallel arbeitet eine andere Session an `packages/app`, `packages/mcp` (cli/config/package.json), `eslint.config.mjs`, `pnpm-lock.yaml` — NICHT anfassen, kein `git add -A`. Stagen nur: `packages/engine packages/tokens packages/mcp/src/tools.ts packages/mcp/test/workflow.test.ts .scratch`. Commit: Zeile 1 `T14: Referenzen (Analyse-Pipeline) - <kurz>`, Leerzeile, `Co-authored-by: CommandCodeBot <noreply@commandcode.ai>`.

**Anlaufpunkte:** `artifacts/28`, `research/29-site-clone-learnings.md` (Probe-Scripts tokens/motion/surface, Frequenz-Prinzip, Evidenz-Stufen), `artifacts/07` (Theme-Ableitung), `research/27`, Spec „Referenzen-Pipeline (Verträge)". Code-Muster: `packages/engine/src/{store,db,http,types}.ts`, `packages/engine/src/lifecycle.ts` (Job-Muster mit Retry), `packages/tokens/src/*` (Skalen-Engine, Theme-Ableitung), `packages/mcp/src/tools.ts`.

**Ist-Stand:** T01–T11, T15, T16 sind committet; `pnpm verify` grün (314+ Tests). Vorhanden: Theme-/Skalen-Engine, Lifecycle-Jobs, Medien-Pipeline, Content-Kern, MCP-Tools, Renderer/Bake.

**Priorität (Backend zuerst, halb Fertiges melden):**
1. **Governance + Job-Modell:** additive Tabellen für Referenzen (`references`: URL, Datum, Hash, Status `analyzing|ready|failed`, Fortschritt, Fehlerursache) und Profil-**Revisionen** (`reference_profiles`: JSONB, Revisionsnummer, Provenance); Job über den Lifecycle-Mechanismus mit Fortschritt und Retry.
2. **Capture:** Playwright headless (Desktop 1440 / Tablet 810 / Mobile 390) für Full-Page- und Sektions-Screenshots, DOM-Dump, Asset-Listen; als eigenes Modul kapseln und **im Test injizierbar** machen (Fixture-HTML statt Netz), damit CI ohne Browser läuft; blockierte Seite → Job schlägt mit klarer Ursache fehl, Screenshot-Upload-Fallback steht bereit.
3. **Deterministische Extraktion:** Tokens frequenz-gerankt **mit Belegstellen** (`uses`, `where`) je Kategorie (Farben, Typo-Skala, Spacing, Radii, Shadows, Breakpoints) und je Breakpoint; `:root`-Vokabular als Mapping-Hinweis; Motion-Reveals mit Runtime-Params über den Preset-Katalog (03) zuordnen; GPU-Flächen erkennen und Lazy-GPU-Warnung setzen.
4. **KI-Analyse-Schicht:** Familien-Klassifikation, Vokabular (5–8 Begriffe), Komponenten-Inventar, Kompositionsregeln (constants/never), Stil-Blatt; **jede Aussage mit Evidenzstufe `confirmed|observed|inferred`** und Quelle, nichts wird hochgestuft, Widersprüche markiert, keine erfundenen Werte; als injizierbaren Analyzer bauen (Test mit festem Fake, kein Netzaufruf), Modellwahl über die bestehende LLM-Konfiguration.
5. **MCP-Tools:** `analyze_reference`, `list_references`, `get_reference`, `apply_reference` mit Scopes (Schreiben nur mit `write`), Tool-Liste im Test nachziehen; Workflow-Test „Referenz → Profil → Theme-Draft".
6. **Theme-Ableitung:** Profil → Senify-Theme über die Skalen-Engine, Projekt-Zuordnung mit Skalen-Zuordnung je Skala (Default: eine Referenz für alles) und Round-Trip-Verifikation („Anwenden ändert den bestehenden Bake nicht").
7. **Schutzregeln + Adhärenz:** „Inspiration, kein Klon" als Prüfungen im Profil (Logos/Marken/Originaltexte/Fotos/1:1 markieren, Lizenz-Font-Hinweis, Nähe-Warnung weich), weicher Adhärenz-Hinweis im Review.
8. **Tab-UI (zuletzt, nur wenn T12 steht):** Karten + Detailansicht (Swatches, Typo, Motion, Snapshots, Provenance), Nachbearbeitung → neue Profil-Revision, Löschen mit Nutzungshinweis.
9. **Tests:** Extraktion (Frequenz-Ranking, Belegstellen, Breakpoints, Evidenzstufen, keine Hochstufung), Motion-Mapping, GPU-Erkennung + Warnung, Job-Retry/Fortschritt, Theme-Ableitung inklusive Round-Trip, MCP-Workflow, blockierte Seite → Fehler mit Ursache + Fallback-Pfad.

**Randbedingungen:** Deutsch mit englischen Fachbegriffen; TypeScript strict/ESM; additive Tabellen (kein ALTER); keine ungenutzten Exporte; Kommentare sparsam; **keine Netzaufrufe in Tests** (Playwright/LLM injizierbar oder mit Fixtures); `pnpm verify` muss grün sein.

## Auftrag Teil 2 (für die ausführende Session)

Teil 1 liegt im Arbeitsbaum (nicht committet): `references-contract.ts`, `references.ts`, `references-extract.ts`, `references-evidence.ts`, `references-analyze.ts`, `references-lifecycle.ts`, `references-theme.ts` und `test/references.test.ts` (12 Tests, **7 grün / 5 rot**, Fehler in der Theme-Ableitung, u. a. `draft.scales.typeBase` weicht von der Erwartung ab). Ein Typecheck-Fehler (`TYPE_ANCHOR_ROLES` undefiniert) wurde bereits behoben.

**Auftrag:** Teil 1 fertigstellen und committen, in dieser Reihenfolge:
1. **Rot machen grün:** Die 5 fehlenden Tests entweder über die Implementierung erfüllen oder, wo die Erwartung falsch ist, die Erwartung mit Begründung im Ticket korrigieren. Keine Testabschwächung: die geprüften Zusagen (Skalen-Zuordnung, Round-Trip „Anwenden ändert den Bake nicht", Evidenzstufen) müssen inhaltlich gelten.
2. **MCP-Tools prüfen/ergänzen:** `analyze_reference`, `list_references`, `get_reference`, `apply_reference` mit Scopes, Tool-Liste im Workflow-Test nachziehen, Workflow-Fall „Referenz → Profil → Theme-Draft".
3. **Publish-/Review-Anbindung:** weicher Adhärenz-Hinweis im Review, Schutzregeln „Inspiration, kein Klon" als Profil-Prüfungen.
4. **Tests ausbauen**, soweit Budget: Extraktion (Frequenz-Ranking, Belegstellen, Breakpoints, Evidenzstufen ohne Hochstufung), Motion-Mapping, GPU-Erkennung + Lazy-Warnung, Job-Fortschritt/Retry, blockierte Seite → klare Fehlerursache + Fallback-Pfad.
5. **Tab-UI nur, wenn `packages/app` inzwischen steht** (sonst überspringen und melden).

**Commit-Regel (wie Teil 1):** nur bei grünem `pnpm verify`, Betreff `T14: Referenzen (Analyse-Pipeline) - <kurz>`, Leerzeile, `Co-authored-by: CommandCodeBot <noreply@commandcode.ai>`; NICHT `packages/app`, `packages/mcp` (cli/config/package.json), `eslint.config.mjs`, `pnpm-lock.yaml` anfassen; kein `git add -A`.

## Teil 2 — Erledigung (ausführende Session)

- **Rot → Grün:** die 5 roten Tests sind über die Implementierung gelöst, **eine** Erwartung wurde sachlich korrigiert:
  - `profiles the fixture …`: die Zusage war `tokens.color[0] === "#7c5cff"`. Das widerspricht dem Ticket-Kriterium „frequenz-gerankt" (Zeile 10): die am häufigsten gemessene Farbe (Neutral-BG `#0b0b0f`, drei Breakpoints + Markup = 5 Belege) führt die Palette an, der Akzent folgt. Statt die Rangfolge zu verbiegen, prüft der Test jetzt die absteigende Frequenz-Reihenfolge **und** dass der Akzent in der Palette bleibt; dass `#7c5cff` als Brand abgeleitet wird, sichert weiterhin `draft.scales.brand`. Keine der genannten Zusagen (Skalen-Zuordnung, Round-Trip „Anwenden ändert den Bake nicht", Evidenzstufen) wurde abgeschwächt.
  - Zusätzlich zwei Testfehler korrigiert: `create_preview` antwortet `{ preview, url }` (Build über `body.preview.buildRef`), und die gebackenen Tokens liegen in `assets/theme.css` (die HTML verlinkt die Datei nur).
- **Implementierung vervollständigt:** Typo-Skala je Selektor **+ Media-Context** (`body` 17px vs. `body@1024` 18px), Heading-/Body-Anker bleiben auch bei einfacher Häufigkeit in der Skala, Fontnamen behalten ihre Schreibweise (`Inter`, `Sora`), Motion-Reveals ohne Katalog-Preset werden annotiert („ausserhalb des v1-Katalogs"), `pickDuration` gewichtet nach gemessener Häufigkeit.
- **MCP/Workflow:** Tool-Liste im Workflow-Test um `analyze_reference`/`list_references`/`get_reference`/`apply_reference` nachgezogen; neuer Workflow-Fall „Referenz → Profil → Theme-Draft" inkl. Scope-Prüfung (Lesen ohne `write` erlaubt, Analyse/Apply nur mit `write`).
- **Tests ausgebaut:** Breakpoint-Parsing (px/em + explizit), `:root`-Rollen-Vokabular, Snapshot bleibt `observed` (nie `confirmed`), Canvas-/GPU-Erkennung ohne Lazy-Warnung, Einmal-Transitions werden verworfen. Review-Adhärenz und Schutzregeln waren bereits verdrahtet und werden weiterhin geprüft.
- Punkt 5 (Tab-UI) **übersprungen**: `packages/app` ist der parallelen Session vorbehalten (steht noch nicht).

## Tab-UI (parallele Session, 16.09.2026)

- **Referenzen-Tab** (`packages/app/public/app.js`): Karten mit Statuspunkt, Host, Methode (Live/Snapshot), Familien und Projekt-Nutzung; „Neue Referenz" (Live-Analyse via `POST /api/references` mit `wait: true`, Fehlerursache im Toast) und **Snapshot-Fallback** „Aus Quelltext" (Dialog mit URL + HTML → reduziertes Profil).
- **Detailansicht:** Provenienz + Stil-Blatt, Farb-Swatches mit Evidenz/`uses`/Where-Tooltips, Typografie-Tabelle, Skalen (Familien/Abstände/Radien/Schatten), Motion-Tabelle (Preset-Zuordnung), Design-Sprache (Vokabular, Konstanten, Nie-Regeln), Schutzregeln mit Severity, Snapshot-Metadaten; **Nachbearbeitung** (Vokabular/Familien/Notiz) erzeugt eine Profil-Revision; **Löschen** mit Nutzungs-Hinweis (force erst nach Bestätigung).
- **Projekt-Zuordnung:** Zuordnen mit Skalen-Auswahl (Default alle vier), Entfernen in den Projekt-Einstellungen; dort auch die Round-Trip-Verifikation aus `GET /api/sites/:id/references` („Anwenden ändert den Bake nicht ✓").
- **Test:** Integrationstest über den Dashboard-Proxy mit Snapshot-Analyse (offline), Liste/Detail, Zuordnung und Entfernen (`packages/app/test/server.test.ts`).

## Engine-Stufe: Sammlungen und Briefe (16.09.2026)

- **Sammlungen** (`reference_collections`, additiv): anlegen, ändern, löschen; Löschen setzt `collection_id` der betroffenen Referenzen auf null und meldet deren Zahl. Zähler je Sammlung, `kind` (`collection`/`style`), `external_id` und `position` für den Stil-Katalog.
- **Referenzfelder** (additiv, nullbar): `collection_id`, `note`, `image_recipe`, `hero_usage`, `family`, `origin`; `PATCH /api/references/:id` pflegt sie.
- **Bibliothek** `GET /api/references`: Karten, Sammlungen mit Zählern, Fußzeile ("n references in view"), Stil-Katalog-Kopf; Filter nach Sammlung (id oder `none`), Familie, Status, Textsuche über Titel/Familie/Notiz/Vokabular/Sammlungsname; Sortierung `newest` und `name`.
- **Manuelle Referenz** `POST /api/references/manual`: Bild als Base64 (PNG/JPEG/WebP, bis 20 MB), Status `ready` ohne Analyseprofil, Snapshot mit Vorschau; Fehler im Klartext (Typ, Größe, fehlende Pflichtfelder).
- **Briefe** in der Engine (`references-brief.ts`), wortgleich zum Vorbild (`app.js:81-85`): Einzelbrief, Sammelbrief, Sammlungs- und Stilbrief, Bild-Prompt, Vorlieben-Block. Haus-DNA und Projekt-Notizen liegen in den Einstellungen (T12: `reference_dna`, `reference_preferences`), der Vorlieben-Block erscheint nur bei gesetztem Schalter.
- **Stilfamilien:** die 18 Familien aus `Repos/taste-vault/data/styles.json` (MIT, Taste Vault von cth9191) als Startkatalog; Seed idempotent (nur anlegen, nie überschreiben), Quelle und Lizenz im Antwortkopf.
- **MCP:** `list_reference_collections` (read), `create_reference_collection` (write), `assign_reference_to_collection` (write), `get_reference_brief` (read, Einzelbrief/Sammelbrief/Sammlungs- und Stilbrief); `list_references` um `collection`, `sort` und Textsuche erweitert; Tool-Liste im Katalog-Test nachgezogen.
- **Tests:** `packages/engine/test/references-library.test.ts` (CRUD, Zähler, Löschen ohne Referenzverlust, Filter, Suche, Sortierung, Fußzeilentext, Seed-Idempotenz, manuelle Referenz mit Grenzfällen, Brief-Bausteine, DNA-Schalter) und der MCP-Workflow "Sammlung → Zuordnung → Brief". `pnpm verify` grün: 64 Testdateien, 460 Tests grün, 2 übersprungen.

## Umsetzungs-Notiz (Oberflächen-Stufe, Vorbild Taste Vault)

- **Grundlage:** Vorbild-Quelle unter `Repos/taste-vault` (MIT, nicht committet) plus eigene Aufnahmen der laufenden Seite in `.scratch/refs/aufnahmen/taste-*.png`; unsere Ansichten daneben als `unser-*.png`.
- **Aufbau:** Im Referenzen-Tab ein zweispaltiges Layout mit linker Leiste (Bibliothek mit "Alle Referenzen" und "Stil-Guide" samt Zählern, Sammlungen mit Farbpunkt und Zähler, Fußzeile mit Summen) und Hauptbereich (Überschrift mit Zähler-Pille, Unterzeile je Ansicht, "Über diese Sammlung", Werkzeugleiste mit Suche und `/`-Tastenkürzel, Sortierung, Karten-Grid, Leerzustände mit "Filter zurücksetzen", Fußzeile "n Referenzen in Ansicht").
- **Karten und Vergleich:** Karten mit Aufnahme, Titel, Farbpunkt mit Sammlungsname und Pfeil, beim Überfahren "Referenz öffnen ↗" und `+`/`✓`; Vergleich bis drei mit Leiste am unteren Rand ("n / 3 ausgewählt") und Dialog samt "Brief zusammen kopieren".
- **Detailseite** `#/references/:id`: links die Aufnahme mit Zoom und Breakpoint-Slider, rechts die Brief-Spalte (Sammlung, Titel, Familie, "Die Idee zum Mitnehmen", Vokabular-Chips, "Aufbau & Platzierung", aufklappbares Bildrezept), Aktionen "Design-Brief kopieren", "Bild-Prompt kopieren", "Zum Vergleich", "Projekt zuordnen" und Bearbeiten der Bibliotheksfelder; Pfeiltasten blättern, Chips filtern die Liste, Revisions-Historie und Evidenz sind aufklappbar.
- **Dialoge:** "Referenz hinzufügen" mit Upload (PNG/JPEG/WebP, 20 MB, Vorschau, Name aus Dateiname) und dem bestehenden URL-Weg, "Über diese Sammlung" mit den zwei Kopier-Aktionen, Vergleich, sowie im Einstellungen-Bereich "Referenzen" mit Haus-DNA, No-Gos und Projekt-Notizen.
- **Stil-Guide:** Karten je Stilfamilie mit Vorschau, Erkennungsmerkmalen, Vokabular, Warnung, Beispielseiten und "Brief kopieren"/"Vokabular kopieren"; ein leerer Katalog lässt sich direkt aus der Ansicht einspielen.
- **Zustand und Bedienung:** `?q=`, `?collection=`, `?sort=` in der Adresse, Hintergrund-Klick schließt Dialoge, Toast-Meldungen, Kopieren mit Fallback-Dialog.
- **Tests:** `packages/app/test/references-browser.test.ts` (Leiste, Karten, Vergleich, Detail, Adresszustand im echten Chromium) und erweiterte Proxy-/Payload-Tests in `packages/app/test/server.test.ts`; alle App-Tests grün (12 Tests in 5 Dateien).

## Design-Prüfung (Nacharbeit, gemessen gegen das Vorbild)

- **Messung** bei 1440, 1024, 900 und 375 px in beiden Oberflächen mit Chromium: Raster und Typografie stimmen (drei Spalten à 367 px, Abstand 32/24 px, H1 56 px mit -2,3 px Laufweite, Suche 480x44 px mit Radius 9, Kartenrand 10 px, Vergleichsauswahl 25x25 px, Leisten-Eintrag 12 px).
- **Behoben:**
  - Waagerechter Überlauf bei 375 px (580 statt 375, Ursache war die Kopfleiste der Shell): kompakte Tab-Leiste, Tastenhinweis ausgeblendet, Knöpfe enger. Jetzt 375/375 ohne Überlauf.
  - Unter 1000 px war die linke Leiste ausgeblendet und die Sammlung damit nicht erreichbar: Auswahlfeld wie im Vorbild (führt `collection`/`view` in die Adresse, Umschalten geprüft).
  - Fehlende Fokusringe auf Leisten-Einträgen, Knöpfen, Chips, Auswahl und Auswahlfeldern ergänzt.
  - Bewegungsreduktion (`prefers-reduced-motion`) ergänzt, wie im Vorbild.
  - Trefferfläche der Vergleichsauswahl vergrößert (sichtbar 25 px bleibt, Treffer 45 px, mit Klick außerhalb der Fläche belegt).
  - Kontrast der Hinweiszeilen und Zähler von 2,26 bis 3,01 auf 5,24 angehoben.
  - Das aktive Leisten-Symbol nimmt jetzt die Farbe des Eintrags an (im Vorbild 6,57 statt vorher 2,67).
  - Suchfeld wird unter 700 px nicht mehr gequetscht (Werkzeugleiste stapelt, Feld 325 statt etwa 110 px), Raster unter 480 px einspaltig.
- **Bewusste Abweichungen:** Zähler und Hinweiszeilen etwas dunkler als das Vorbild (Kontrast), Tab-Leiste scrollt unter 700 px, Karten bleiben über 480 px zweispaltig wie im Vorbild.

## Feinschliff: SVG-Symbole und Ladeplatzhalter (16.09.2026)

- **Symbole als SVG:** die Zeichen `▦` (Bibliothek), `◈` (Stil-Guide), `＋` (Sammlung anlegen, Referenz hinzufügen, Bildrezept, Upload-Fläche), `↗` (Leiste, Kartenrand, Karten-Hinweis, Vergleichsknopf, Beispielseiten), `✕` (Dialoge), `←`/`→` (Blättern, Zurück-Knopf), `⌕` (Leerer Zustand) sowie `+`/`✓` der Vergleichsauswahl sind durch eingebettete SVG-Symbole ersetzt: 24x24, `stroke: currentColor`, `fill: none`, `stroke-width` 1.7, `aria-hidden="true"`. Ein Satz Konstanten (`REFS_ICON_*`, Muster `REFS_SEARCH_ICON`) mit fester Größe je Einbauort: 15 px in Leiste und Karten, 17 px in den Icon-Knöpfen, 25 px in der Vergleichsauswahl (Knopf bleibt 25x25).
- **Ladeplatzhalter beim Wechsel:** Ansicht, Sammlung, Suche und Sortierung setzen `refs-loading`; die bisherigen Karten bleiben mit 0.45 Deckkraft stehen, darunter läuft ein schmaler Fortschrittsbalken unter der Werkzeugleiste. Seine Höhe ist immer reserviert, das Layout springt nicht; bei `prefers-reduced-motion: reduce` steht der Balken still (volle Breite, keine Animation).
- **Messung vorher/nachher** (Chromium, gleicher Datenbestand): kein waagerechter Überlauf (1440/1024/900/375 px alle gleich der Fensterbreite), Raster unverändert (1440: 3 Spalten à 367 px, 1024/900: 2 à 374/413 px, 375: 1 à 325 px; Abstand 32/24 px), Leisten-Eintrag 38,59 px (min-height 37 px), Vergleichsauswahl 25x25 px, H1 56 px/-2,3 px (unter 700 px 37 px/-1,5 px). Zusätzlich: 25 SVG-Symbole statt 16 typografischer Zeichen.
- **Tests:** `pnpm build` und `pnpm exec eslint packages/app` grün. Zwei neue Prüfungen in `packages/app/test/references-browser.test.ts` (Leiste, Kartenrand und Vergleichsauswahl tragen SVG-Symbole; während eines Ansichtswechsels erscheint der Ladezustand, während die Karten stehen bleiben). `pnpm vitest run packages/app`: 11 von 12 grün, der rote Bestand liegt allein in `editor-browser.test.ts` (Rail-Drag, fremde Arbeit im Baum: derselbe Fehler tritt ohne die Änderungen dieser Stufe auf).
- **Aufnahmen:** `.scratch/refs/aufnahmen/unser-final-*.png` (1440/1024/900/375, overview, styleguide, detail, compare, laden, laden-reduziert) mit `messung-unser-final.json`, davor `vorher-*.png` und `messung-vorher.json`.
- **Nicht angefasst:** `packages/engine`, `packages/mcp`, `packages/editor`, `packages/app/editor`, `packages/app/test/editor-browser.test.ts`, Datei 17, `eslint.config.mjs`, `pnpm-lock.yaml`; der unformatierte Fremd-Hunk in `packages/app/public/app.js` (`pageView`) bleibt uncommittet im Arbeitsbaum.

## 18.09.2026 (Nachtrag): Motion-Video-Harness fuer Referenzen

- Die Live-Aufnahme der Referenzen (Standbilder) kann jetzt um ein kurzes Motion-Video ergaenzen: ecordMotion im @senify/analysis-worker zeichnet eine Scrollfahrt als .webm auf, diffScreenshots liefert Vorher/Nachher-Diffs mit Bounding-Box. Details in Ticket 07.
- **Offen:** Die Referenz-Pipeline (eferences-lifecycle) muesste das Video beim Live-Capture optional mitziehen und im Snapshot ablegen; die UI zeigt es dann im Detail.
