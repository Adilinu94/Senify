# 14: Referenzen-Tab (Analyse → Design-Profil)

**What to build:** Vollautomatische Website-Analyse für Design-Referenzen. Pipeline im `analysis-worker`: ① Governance/Provenance (URL, Datum, Hash) → ② Capture (Playwright headless: Desktop 1440 / Tablet 810 / Mobile 390, Full-Page- + Sektions-Screenshots, DOM-Dump, Asset-Liste, Motion-Sampling; Job mit Fortschritt; Fallback: Screenshot-Upload bei blockierter Seite) → ③ deterministische Extraktion → ④ KI-Analyse (Familien-Klassifikation, Vokabular, Komponenten-Inventar, Motion-Rezepte, Kompositionsregeln, Evidenz + Konfidenz, keine erfundenen Werte) → ⑤ Design-Profil (JSONB) mit Stil-Blatt, sofort nutzbar. **Umsetzungsbasis `research/29` (site-clone, MIT):** die Probe-Scripts tokens/motion/surface werden adaptiert (Frequenz-Prinzip + Belegstellen, GPU-/Video-/SVG-Routing, Lazy-GPU-Warnung); Evidenz-Stufen `confirmed | observed | inferred` mit „never upgrade"-Regel; Motion-Reveals mappen auf den Preset-Katalog (03). Tab-UI: Karten (Vorschaubild, Familien, „verwendet in N Projekten"), Detailansicht (Token-Swatches, Typo-Skala, Komponenten, Motion, Snapshots, Provenance, Nachbearbeitung → neue Profil-Revision). Wiederverwendung: Projekt-Zuordnung mit Skalen-Zuordnung je Skala (Farben/Typo/Motion/Rest; Default eine Referenz für alles), Theme-Ableitung Profil → Senify-Theme (Verifikation: Anwenden ändert nichts). MCP-Tools `analyze_reference`, `list_references`, `get_reference`, `apply_reference`. Schutzregeln „Inspiration, kein Klon" (Logos/Marken/Originaltexte/Fotos/1:1 nie übernehmen; Lizenz-Font-Hinweis; Nähe-Warnung weich).

**Blocked by:** 04 (Theme & Tokens — Theme-Ableitung), 07 (Lifecycle, Review & Checks — QA-Adhärenz weich), 12 (Programm-Shell — Tab).

**Status:** ready-for-agent

- [ ] URL → Analyse-Job → Profil mit Status analyzing/ready/failed; Fortschritt sichtbar; Ergebnis ist sofort in Projekten nutzbar
- [ ] Token-Extraktion frequenz-gerankt mit Belegstellen (uses + where); Typo/Spacing/Radii/Shadows/Breakpoints je Breakpoint; `:root`-Vokabular der Referenz als Mapping-Hinweis erkannt
- [ ] Motion-Sampling liefert Reveal-/Effekt-Inventar mit exakten Runtime-Params und mappt auf die Presets (03); GPU-Flächen (webgl-scene-Hinweise) erkannt; Lazy-GPU-Warnung, wenn Plattform ohne lebende Canvas
- [ ] Evidenz: jede Aussage `confirmed | observed | inferred` + Quelle; nichts wird hochgestuft; Widersprüche markiert
- [ ] KI-Analyse: Familien (18er-Taxonomie), Vokabular (5–8 prompt-fähige Begriffe), Komponenten, Regeln (constants/never), Stil-Blatt (maschinenlesbar)
- [ ] Tab-UI: Karten + Detail (Swatches, Typo, Motion, Snapshots, Provenance) + Nachbearbeitung erzeugt Profil-Revision; Löschen mit Nutzungs-Hinweis
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