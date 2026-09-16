# 10: Templates, Bindings & Loops

**What to build:** Kunden-Sites mit Blog/Artikeln ohne Code: Seiten als Vorlagen (`template.kind = layout | collection` + Ziel-Collection + Priorität; Vorlagen-Pages ohne eigene Route), Layout-Auswahl je Seite, `outlet`-Baustein (kontextuell gefüllt: im Layout die Seite, im Entry-Template den Artikel), Resolve-Kette Layout → Entry-Template → Inhalt (Splice an Outlets, ID-Rekeying; Templates ohne Outlet = unfertig/ignoriert). Bindings in zwei Formen (Whole-Prop `{ "$entry": … }` + Text-Mix `„Neues von {entry.title}"`) mit Quellen `entry.*` (dotted), `parentEntry.*`, `site.*`, `route.query.*`, Typ-Kompatibilitätsprüfung, Markdown→HTML sanitisiert; ein Resolver für Build + Vorschau. Sektionen `collection-list` (geschlossenes Filter-Set, Sortierung, Limit, `excludeCurrent`, `?seite=N`, Varianten cards/grid/list) + `card`-Bausteine im Item-Slot. Detailrouten aus `urlPattern` (404/301), Re-Bake nur betroffener Seiten (Abhängigkeits-Index), Live-Vorschau im Entry-Editor (Server-Render, debounced, read-only).

**Blocked by:** 05 (Renderer & Bake), 09 (Content-Kern).

**Status:** umgesetzt (`pnpm verify` grün; Vorlagen ohne eigene Route, Bindings und Loops, `?seite=N`-Variante, Preview-Endpoint mit Draft-Pfad, Re-Bake-Pfade, Blog-Bake-Tests; Live-Vorschau im Artikel-Editor mit debounced unsaved-Eingaben) — bewusste Vereinfachung: das Vorschau-Dokument ist selbsttragend (Bake-CSS inline, Skripte entfernt), Inseln/Motion laufen darin nicht

- [ ] Blog-Fixture läuft: Layout + Sammelseite mit `collection-list` + Detailseite über Entry-Template; Blättern `?seite=N` ohne JS; leere Liste/Out-of-range sauber
- [ ] Bindings füllen Props und Text-Mix korrekt; Typ-Mismatch und unbekannte Felder sind Validierungsfehler; Markdown-Body ist XSS-sicher
- [ ] `excludeCurrent` („Weitere Artikel") + Filter funktionieren; Karten-Slot rendert genau einen `card`-Baustein
- [ ] Re-Bake-Index: Entry-Publish/Unpublish/Delete und Layout-/Template-Änderungen backen nur betroffene Routen/Listen neu
- [ ] Detailrouten in Sitemap/`.md`/JSON-LD; nicht-published → 404; alte Slugs → 301
- [ ] Live-Vorschau aktualisiert beim Tippen (read-only) und nutzt denselben Renderer/Resolver wie der Build (Parität)
- [ ] Bake-Tests (Prüfstelle 2): Bindings, Listen, Routen, 404/301, keine Draft-Leaks

Quellen: `artifacts/23`, Spec „Templates, Bindings & Loops", `research/26` (Instatic-Delta).

## Handoff (Stand 15.09.2026)

**Auftrag:** T10 vollständig umsetzen. Am Ende, **nur wenn `pnpm verify` grün ist**, selbst committen (dein Commit, dein Bericht). Ist etwas rot, NICHT committen, sondern genau melden.

**Wichtig zur Zusammenarbeit:** Im Arbeitsbaum arbeitet parallel eine andere Session an `packages/app` und `pnpm-lock.yaml` — diese Pfade NICHT anfassen, NICHT `git add -A` verwenden. Nur die von dir geänderten Pfade stagen (`git add packages/engine packages/registry packages/renderer .scratch`). Commit-Format: Zeile 1 `T10: Templates, Bindings & Loops - <kurz>`, dann Leerzeile und `Co-authored-by: CommandCodeBot <noreply@commandcode.ai>`.

**Anlaufpunkte:** `artifacts/23` (Resolve-Kette, Bindings-Grammatik, `collection-list`-Props, Re-Bake-Index), Spec „Templates, Bindings & Loops", `research/26`. Code: `packages/engine/src/{content,lifecycle,bake,store,http,types}.ts`, `packages/renderer/src/{bake,aeo,motion}.ts`, `packages/registry/src/{index,shared}.ts` + `components/` (Muster `Features.tsx`, `map.tsx`, `shared.tsx`), `packages/registry/src/md.ts` (renderMarkdown), Tests in `packages/engine/test/{content,lifecycle}.test.ts` und `packages/renderer/test/bake.test.ts`.

**Ist-Stand:** T01–T09, T15, T16 sind committet, `pnpm verify` grün (273 Tests + 2 skipped). Der Bake läuft über `bakePages` (Engine) → `bakeSite` (Renderer, Astro + Komponenten), Assets werden als `AssetDelivery` ausgeliefert, Inhalte (Collections/Entries) stehen samt Versionen, Redirects, FTS, MCP-Tools.

**Priorität (bei knappem Budget in dieser Reihenfolge, halb Fertiges melden):**
1. **Sektionen `outlet`, `collection-list`, `card`** (Registry + Komponenten + Katalog-/Komponenten-Tests; `EXPECTED_SECTION_TYPES` ist abgeleitet, Katalog-Test prüft Standard-Style-Set → neue Sektionen brauchen das Set ebenfalls).
   - `outlet`: leerer Platzhalter, der beim Splice gefüllt wird (im Bake: Layout-Outlet = Seiteninhalt, Entry-Template-Outlet = Artikelinhalt).
   - `collection-list`: geschlossenes Filter-Set (`is|isNot|isTrue|isFalse|isSet|isEmpty`), `orderBy` (Default dateField desc), `limit` (Default 6), `excludeCurrent`, `pagination: none|pages` mit `?seite=N` (ohne JS: die Sammelseite wird pro Seite vorgebacken), `emptyText`, Varianten `cards|grid|list`; Item-Slot mit genau einem `card`.
   - `card`: Varianten `image-top|horizontal|text`, Bindings-fähige Props.
2. **Bindings-Resolver** (Renderer oder section-sdk, ein Resolver für Build + Vorschau): Whole-Prop `{ "$entry": "cover" }` (dotted erlaubt) und Text-Mix `„Neues von {entry.title}"`; Quellen `entry.*`, `parentEntry.*`, `site.*`, `route.query.*`; Typ-Kompatibilität gegen das Prop-Schema (Mismatch = Validierungsfehler mit Feldpfad), unbekannte Felder = Fehler; Markdown-Body → HTML über `renderMarkdown` (XSS-sicher, keine rohen HTML-Durchreichen).
3. **Templates + Resolve-Kette:** additive Tabelle `page_templates (page_id text PRIMARY KEY, kind text, collection_ids jsonb, priority integer, layout_id text, updated_at timestamptz)`; Route `PUT /api/pages/:pageId/template` (write) + Template-/Layout-Infos in den Page-Antworten; Vorlagen-Pages bekommen keine eigene Route (nicht in Sitemap/Navigation); Resolve-Kette Layout → Entry-Template → Seiteninhalt mit Splice an Outlets, **ID-Rekeying** (Node-IDs beim Splice eindeutig machen) und `reindexNodeParents`-Äquivalent; Templates ohne Outlet gelten als unfertig und werden ignoriert.
4. **Detailrouten:** aus `collection.urlPattern`; nicht veröffentlichte Entries → 404, alte Slugs → 301 (aus `entry_redirects`); Routen erscheinen in Sitemap, `.md`-Export und JSON-LD.
5. **Re-Bake-Abhängigkeitsindex:** Modul im Engine-Paket, das aus Entry-/Collection-/Layout-/Template-Änderungen die betroffenen Pfade ableitet (Entry→Seiten mit Bindings, Collection→Listenseiten, Layout/Template→Nutzerseiten); `triggerRebake`-Stub um `affectedPaths` erweitern und in Publish/Unpublish/Delete/Template-Routen füttern.
6. **Live-Vorschau (Parität):** Engine-Route `GET /api/entries/:entryId/preview` (read), die den aufgelösten Zustand über denselben Bake-Pfad rendert und das HTML des Entry-Pfads zurückgibt (Temp-Verzeichnis, danach aufräumen). Debounce/Bedienung bleibt T12.
7. **Tests (Prüfstelle 2 + 1):** Bake-Fixture „Blog": Layout-Page + Sammelseite mit `collection-list` + Entry-Template; prüfen: Liste mit `?seite=N` (auch leere Liste und Out-of-range), `excludeCurrent`, Bindings (Whole-Prop, Text-Mix, Typ-Mismatch als Fehler), 404 für Drafts, 301 nach Slug-Wechsel, AEO-Dateien der Detailrouten, keine Draft-Daten im Produktions-Bake; Engine-Tests für Abhängigkeitsindex und Template-Routen.

**Randbedingungen:** Deutsch mit englischen Fachbegriffen; TypeScript strict/ESM; additive Tabellen (kein ALTER); keine ungenutzten Exporte; Kommentare sparsam; `pnpm verify` muss grün sein, inklusive aller bestehenden Tests.

## Umsetzungs-Notiz (Teil 1: Engine, Registry, Renderer)

- **Registry:** neue Sektionen `outlet` (Platzhalter, wird beim Splice gefüllt), `collection-list` (geschlossenes Filter-Set, `orderBy`, `limit`, `excludeCurrent`, `pagination: none|pages`, `emptyText`, Varianten `cards|grid|list`, Item-Slot) und `card` (`image-top|horizontal|text`); Katalog- und Komponenten-Tests erweitert.
- **Renderer:** `bindings.ts` löst Whole-Prop-Bindings (`{ "$entry": "cover" }`), Text-Mix (`{entry.title}`, `{parentEntry.*}`, `{site.*}`, `{route.query.*}`) und die `collection-list`-Expansion auf; Typen werden gegen das Prop-Schema geprüft (Mismatch/unbekanntes Feld = Validierungsfehler mit Feldpfad), Markdown-Bodies laufen über `renderMarkdown`.
- **Engine:** additive Tabelle `page_templates` (kind, collectionIds, priority, layoutId) mit Store-Anbindung, `PUT /api/pages/:pageId/template`, Vorlagen-Pages ohne eigene Route; Resolve-Kette mit Splice an Outlets und ID-Rekeying (`templates.ts`); Listen-Prefetch (`lists.ts`) inklusive statischer Bake-Varianten für `?seite=N`; Re-Bake-Abhängigkeitsindex (`rebake.ts`) mit `affectedPaths` und Anbindung an `triggerRebake`.
- **Fix aus dem Review:** Entwürfe ohne Titel bekommen jetzt einen Slug aus der Entry-ID (Titel-Pflicht greift beim Publish) — vorher schlug das Anlegen eines titellosen Entries mit 400 fehl.
- **Portal-Fix:** `@senify/registry/components` (exakt, vor dem Präfix-Eintrag) und `@senify/mcp` (nur `tools.ts`) sind im Portal-Build explizit aliast; der Präfix-Alias hatte den Unterpfad zu `index.ts/components` verbogen, sobald die CLI den App-Shell-Import in den Portal-Graph zog.

**Offen (Teil 2):**
- Preview-Endpoint für den Entry-Editor (`GET /api/entries/:entryId/preview`, gleicher Bake-Pfad).
- Engine-Tests für `templates.ts` (Resolve-Kette, ID-Rekeying, Templates ohne Outlet), `lists.ts` (Filter/Sortierung/Limit/`excludeCurrent`, Out-of-range) und `rebake.ts` (Abhängigkeitsindex).
- Ende-zu-Ende-Bake-Test „Blog" (Layout + Sammelseite + Entry-Template, `?seite=N` mit leerer Liste, 404 für Drafts, 301 nach Slug-Wechsel, keine Draft-Leaks).

### Auftrag Teil 2 (für die ausführende Session)

1. **Preview-Endpoint:** `GET /api/entries/:entryId/preview` (Scope `read`) rendert den aufgelösten Zustand über **denselben** Bake-Pfad (`bakePages` + `bakeSite` in ein Temp-Verzeichnis) und liefert `{ path, html, status }` des Entry-Pfads zurück; Temp-Verzeichnis danach aufräumen; nicht auflösbare Entries → strukturierter 404 (`not_found`); Entry muss der Site des Tokens gehören (sonst 404, kein Site-Leak).
2. **Engine-Tests** (`packages/engine/test/templates.test.ts` oder in `content.test.ts`): Resolve-Kette Layout → Entry-Template → Seiteninhalt (Splice am Outlet, IDs eindeutig nach dem Splice, Outlet im Template bleibt leer, Template ohne Outlet wird ignoriert), `lists.ts` (Filter-Operatoren, Sortierung, Limit, `excludeCurrent`, leere Liste, Out-of-range), `rebake.ts` (`affectedPaths` bei Entry-Publish, Entry-Delete, Layout-Änderung, Collection-Änderung).
3. **Blog-Bake-Test** (`packages/renderer/test/bake.test.ts` oder `packages/engine/test/bake.test.ts`): Layout-Page + Sammelseite mit `collection-list` + Entry-Template; prüfen: Liste mit `?seite=N` (inkl. leerer Liste und Out-of-range), `excludeCurrent`, Whole-Prop- und Text-Mix-Bindings im gebackenen HTML, Draft-Entry nicht in der Liste und nicht als Route (keine Draft-Leaks), 404-Datei für unveröffentlichte Detailroute, 301 nach Slug-Wechsel, AEO-Dateien der Detailrouten.
4. **Wichtig:** Im Arbeitsbaum arbeitet parallel eine andere Session an `packages/app`, `packages/mcp` (cli/config/package.json), `eslint.config.mjs` und `pnpm-lock.yaml` — diese Pfade NICHT anfassen und NICHT `git add -A` verwenden (nur `packages/engine packages/renderer .scratch` stagen). Commit nur bei grünem `pnpm verify`, Betreff `T10 (Teil 2): Preview-Endpoint und Tests - <kurz>`, dann Leerzeile und `Co-authored-by: CommandCodeBot <noreply@commandcode.ai>`.

### Umsetzungs-Notiz (Teil 3: Draft-Pfad und Live-Vorschau)

- **Draft-Pfad im Bake:** `buildBakeInput`/`bakePages` kennen jetzt genau einen `previewEntry` (Entry + Collection). Er bekommt seine Detailroute und seinen Binding-Eintrag auch als Entwurf — alle übrigen Routen und Listen bleiben published-only, der Entwurf leakt nicht in andere Seiten. Veröffentlichte Entries werden nicht dupliziert.
- **Vorschau-Endpoint:** `renderEntryPreview` rendert den aktuellen (oder übergebenen) Stand; neuer `POST /api/entries/:entryId/preview` (Scope `read`, Body `{ cells?, slug? }` aus `EntryPreviewBodySchema`) überlagert ungespeicherte Formularwerte auf die gespeicherte Zeile, ohne etwas zu schreiben. Die Antwort ist ein selbsttragendes Dokument: Bake-Stylesheets (`/assets/theme.css`, `/assets/sections.css`, `_astro/*.css`) werden inline ersetzt, `<script src>` entfällt — kein Dateiserver für die eigene Build-Ausgabe nötig (bewusste Vereinfachung, read-only).
- **Artikel-Editor:** „Vorschau"-Schalter mit sandboxed iframe (`srcdoc`), debounced 1,2 s beim Tippen, koaleszierende Requests (kein Stau), Pfad-Anzeige und „Aktualisieren"; der offene Zustand überlebt Re-Renders.
- **Tests:** `bake.test.ts` prüft den Draft-Pfad (Entwurf rendert durch Layout + Entry-Template + Artikel, veröffentlichter Preview bleibt draft-frei) und den Zellen-Overlay (`POST` mit `cells`); `packages/app/test/entry-preview-browser.test.ts` fährt mit Chromium: Entwurf anlegen, Vorschau öffnen, Inhalt sehen, tippen, neuen Zwischenstand in der Vorschau erwarten — ohne 4xx-Ressourcen und Konsolenfehler.