# Die Fachmodule

> **Erzeugt.** `pnpm module:render` schreibt diese Datei aus `packages/engine/src` und
> `packages/app/public`; `pnpm module:check` lässt den Lauf rot werden, wenn Dokument und
> Code auseinanderlaufen. Nicht von Hand editieren.
>
> Warum generiert: diese Übersicht stand bis zum 23.10.2026 als eine 7 046 Zeichen
> lange Zelle in `docs/current/stand.md` und wurde bei jedem Schritt von Hand nachgezogen.
> Zwei Routenzahlen waren falsch, vier Mapper-Module fehlten - und niemand sah es beim Lesen.

## Engine: Store-Fachmodule

**38 Dateien**, davon **27** mit eigener Repository-Klasse.

| Modul | Repository | Zeilen | Zweck | Test |
|---|---|---|---|---|
| `store-asset-folders.ts` | `AssetFoldersRepository` | 151 | Asset folders and the file history of an asset (ADR 0019, P3-2). `Store` delegates here; the site and asset existence checks come in as functions, because sites and assets stay on the Store. | - |
| `store-assets.ts` | `AssetsRepository` | 370 | Asset records of a site (ADR 0019, P3-2): the rows, their encoded derivatives (ladder and blur hash), the usage map of the check pipeline and the restore from a release snapshot. `Store` delegates here. The site existence check comes in as a function, because sites stay on the Store. The folder guard (`getAssetFolderOfSite`) and the cross-domain copy (`duplicateAssetRecords`) stay on the Store too. | - |
| `store-audit.ts` | - | 57 | One entry in the append-only audit log that every write path feeds — page mutations, theme writes, style-rule writes, settings. `pageId: null` marks a site-wide change (a style rule is site-wide, so it logs here with null). | - |
| `store-bake-jobs.ts` | `BakeJobsRepository` | 197 | Re-bake job queue of the Store (ADR 0019, E12): enqueue with per-site dedup, lease-based claim, retry/backoff and crash recovery. `Store` delegates here. | - |
| `store-code-payloads.ts` | `CodePayloadsRepository` | 107 | Imported foreign code of the Store (ADR 0019, ADR 0010): create, list, read, read with bundle and delete a site's code payloads. `Store` delegates here. | - |
| `store-collections.ts` | `CollectionsRepository` | 153 | Collection schemas of the Store (ADR 0019, T09): list, read, find by slug, create and update the field definitions of a site's collections. `Store` delegates here. | - |
| `store-deploy.ts` | `DeployRepository` | 290 | Deployments and deploy settings of the Store (ADR 0019): deploy records of a release and the per-site hosted-provider target. `Store` delegates here. | - |
| `store-design-records.ts` | `DesignRecordsRepository` | 115 | Design records of the Store (ADR 0019, Fahrplan P2-4, R4): the frozen design reports of a site, written once per measurement. `Store` delegates here. | - |
| `store-entries.ts` | `EntriesRepository` | 390 | Entries of the Store (ADR 0019): the entries of a collection with their version snapshots and slug redirects. `Store` delegates here. | - |
| `store-form-mappers.ts` | - | 107 | Row types and mappers for form snapshots, notifications and newsletter tokens (P3-2, moved out of store.ts). | - |
| `store-forms.ts` | `FormsRepository` | 122 | Form operations of the Store (ADR 0019): the signing secret and the per-bake form snapshots. `Store` delegates here. | - |
| `store-idempotency.ts` | `IdempotencyRepository` | 208 | Idempotency slots of the Store (ADR 0019, ticket 18, R6): claim a key before the operation runs, store its response, mark a committed write whose response was lost, release a failed attempt. `Store` delegates here. | - |
| `store-image-jobs.ts` | `ImageJobsRepository` | 263 | Image generation queue of the Store (ADR 0019, S2): per-site lease claim, provider handle for crash resume, final states and provider cooldowns. `Store` delegates here. | - |
| `store-import-jobs.ts` | `ImportJobsRepository` | 163 | Import-job queue of the Store (ADR 0019, plan S3.2): jobs of a site import, their retry state, request payload and the report of a finished run. `Store` delegates here; `commitFramerImportPlan` is a cross-domain transaction and stays on the Store. | - |
| `store-job-mappers.ts` | - | 177 | Row types and mappers for the background jobs: import, bake and image jobs (P3-2, moved out of store.ts). | - |
| `store-library-definition.ts` | - | 226 | Die Definition einer Bibliotheks-Installation in den Draft einer Site uebernehmen. | - |
| `store-library-similarity.ts` | - | 108 | Aehnlichkeit zweier Baustein-Definitionen. | - |
| `store-library.ts` | `LibraryRepository` | 671 | Library of the Store (ADR 0019): the shared component library and the installations that link a component into a site. `Store` delegates here. | - |
| `store-mcp-audit.ts` | `McpAuditRepository` | 81 | MCP audit log of the Store (ADR 0019): one row per tool call an MCP client made. `Store` delegates here. | - |
| `store-notifications.ts` | `NotificationsRepository` | 199 | Notification outbox and newsletter tokens of the Store (ADR 0019): queued mails with their delivery result and the single-use confirm/unsubscribe tokens. `Store` delegates here. | - |
| `store-page-mappers.ts` | - | 96 | Zeilentypen und Mapper der Seite (P3-2): gemeinsam genutzt von `Store` und `PagesRepository`. | - |
| `store-pages.ts` | `PagesRepository` | 439 | Die Seiten des Stores (ADR-0019): anlegen, lesen, aendern, loeschen, ihre Vorlage setzen und ihren Entwurf schreiben. `Store` delegiert hier. | - |
| `store-record-mappers.ts` | - | 359 | Metadata only: the bundle is code and is read explicitly through `getCodePayloadBundle`, so a list never drags every payload into memory. | - |
| `store-redesign-proposals.ts` | `RedesignProposalsRepository` | 311 | Redesign proposals of the Store (ADR 0019, ADR-0012): the offered directions of a source page, the one human decision (claim) and the apply result. `Store` delegates here. | - |
| `store-reference-library.ts` | `ReferenceLibraryRepository` | 196 | Reference library of the Store (ADR 0019): the collections (and style collections) that group design references. `Store` delegates here. | - |
| `store-reference-mappers.ts` | - | 303 | Row types and mappers for the reference library: references, collections, settings, profiles, jobs and assignments (P3-2, moved out of store.ts). | - |
| `store-references.ts` | `ReferencesRepository` | 607 | Design references (T14) of the Store (ADR 0019, P3-2): the reference rows, their profile revisions, the analysis jobs and the site assignments. `Store` delegates here. The collection of a card comes from the reference library module, which the constructor receives; the module never sees the `Store`. | - |
| `store-releases.ts` | `ReleasesRepository` | 215 | Release operations of the Store (ADR 0019): create, activate, finalize and read releases and the active-release pointer. `Store` delegates here. | - |
| `store-reviews.ts` | `ReviewsRepository` | 302 | Previews and review items of the Store (ADR 0019): signed preview records and the review queue with its comment thread. `Store` delegates here. | - |
| `store-revisions.ts` | `RevisionsRepository` | 115 | Page revisions of the Store (ADR 0019): immutable snapshots of a page's tree, title and path. `Store` delegates here. | - |
| `store-row-utils.ts` | - | 75 | A readable handle from a name: German umlauts spelled out, everything else folded to ASCII, no leading or trailing dash. `Store` uses it for site and page slugs, the library module for component slugs - one rule, not two. | - |
| `store-settings-mappers.ts` | - | 179 | Row types, defaults and mappers for the engine settings: SMTP, engine and image provider settings (P3-2, moved out of store.ts). | - |
| `store-settings.ts` | `SettingsRepository` | 359 | Settings operations of the Store (ADR 0019): the four single-row settings tables (SMTP, engine, image, references). `Store` delegates here. | - |
| `store-sites.ts` | `SitesRepository` | 500 | Die Sites des Stores (ADR-0019): anlegen, lesen, umbenennen, das Profil, der Papierkorb, die Basis-URL, die Breakpoints und der Design-Contract. `Store` delegiert hier. | - |
| `store-style-rules.ts` | `StyleRuleStore` | 760 | The style-rule registry, extracted from `Store` (P3-2). The registry is site-wide: a reusable class (`hero-button`) applies to every page, so it belongs to the site and not to a page draft. Reads are tolerant (a corrupt entry drops, it never blocks the registry), writes are hard (the shape either matches `StyleRuleSchema` or the write fails with the offending field). | - |
| `store-themes.ts` | `ThemesRepository` | 216 | Das Theme und das Ereignisprotokoll der Sites (ADR-0019). `Store` delegiert hier. | - |
| `store-token-mappers.ts` | - | 45 | Zeilentypen und Mapper der API-Tokens (P3-2): nur vom Token-Modul gebraucht, aber getrennt wie bei den anderen Fachgebieten - die Zeilentypen gehoeren zum Speicherformat, die Operationen zum Verhalten. | - |
| `store-tokens.ts` | `TokensRepository` | 148 | Die API-Tokens des Stores (ticket 18, ADR-0019): anlegen, lesen, widerrufen, ihre letzte Benutzung festhalten und die Art heilen. `Store` delegiert hier. | - |

## Engine: HTTP-Routen-Module

**12 Dateien** mit zusammen **176 Routen**.

| Modul | Routen | Zeilen | Zweck |
|---|---|---|---|
| `http-build-files.ts` | - | 290 | Serving files out of a bake (P3-2 extraction from `http.ts`). |
| `http-contract.ts` | - | 118 | Der Vertrag der HTTP-Schicht: der Kontext, den eine Route bekommt, die Form einer Route und die Form ihrer Antwort. Die Routen liegen in `http-routes-*.ts`, der Dispatcher in `http.ts`; dieses Modul ist, was beide sprechen (ADR-0019). |
| `http-response.ts` | - | 231 | The response primitives of the HTTP surface (P3-2 extraction from `http.ts`). Everything that writes bytes to the socket lives here, so the two rules that must hold for EVERY answer are written once: |
| `http-route-support.ts` | - | 712 | Die Helfer der HTTP-Schicht: was die Routen und der Dispatcher gemeinsam brauchen - Body lesen, Idempotenz, die Kontexte der Fach-Module, die Mutation auf einer Seite (ADR-0019). |
| `http-routes-assets.ts` | 11 | 219 | Die Asset-Routen einer Site (P3-2, Schritt 53): Upload-Adresse, Liste, Lesen, Aendern, Papierkorb, Wiederherstellen, Verlauf, Massenoperation und die Asset-Ordner. |
| `http-routes-content.ts` | 17 | 498 | Die Routen des Bereichs api/reviews, api/forms, api/redesign-proposals, api/collections, api/code-payloads, api/imports. Die Tabelle des Dispatchers in `http.ts` nimmt sie unveraendert auf (ADR-0019). |
| `http-routes-formular.ts` | 3 | 88 | Die Formular-Routen einer Site (P3-2, Schritt 54): die Einsendungen eines Formulars, der Plan fuer eine Sammlung aus einem Formular und ihre Anlage. |
| `http-routes-media.ts` | 16 | 357 | Die Routen des Bereichs assets/:assetId, assets/:filename, _astro/:filename, api/assets, api/images, api/library-components, api/motion-vendor. Die Tabelle des Dispatchers in `http.ts` nimmt sie unveraendert auf (ADR-0019). |
| `http-routes-ops.ts` | 17 | 495 | Die Routen des Bereichs api/settings, api/backups, api/tokens, api/mcp, api/events, api/whoami, api/notifications, api/newsletter, api/health. Die Tabelle des Dispatchers in `http.ts` nimmt sie unveraendert auf (ADR-0019). |
| `http-routes-pages.ts` | 27 | 601 | Die Routen des Bereichs api/pages, api/entries, api/page-starters, api/releases, api/revisions. Die Tabelle des Dispatchers in `http.ts` nimmt sie unveraendert auf (ADR-0019). |
| `http-routes-references.ts` | 23 | 710 | Die Routen des Bereichs api/references, api/reference-collections. Die Tabelle des Dispatchers in `http.ts` nimmt sie unveraendert auf (ADR-0019). |
| `http-routes-sites.ts` | 62 | 1689 | Die Routen der Sites: Seiten, Bausteine, Themes, Breakpoints, Assets und Ereignisse einer Site. Die Tabelle des Dispatchers in `http.ts` nimmt sie unveraendert auf (ADR-0019). |
| **Summe** | **176** | | |

## Oberfläche: ES-Module

**24 Dateien.**

| Modul | Zeilen | Zweck |
|---|---|---|
| `app-articles.js` | 389 | Der Artikel-Workspace: die Liste der Artikel, ihr Editor, die Feldsteuerung und das Lesen der Zellen. Die Bloecke standen in `app.js`, dann in `app-projects.js` und sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt ESLint. |
| `app-core.js` | 445 | Die Grundlagen der Oberflaeche. Die Bloecke standen in `app.js` und sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt ESLint. |
| `app-editor.js` | 1208 | Der Seiten-Editor und die Buehne. Die Bloecke standen in `app.js` und sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt ESLint. |
| `app-framer-import.js` | 489 | Der Import aus Framer (P3-2, Schritt 45): der Bericht nach der Analyse und der Dialog, der die Adresse abfragt, analysiert und den Write ausloest. `app-import.js` importiert die zwei Einstiegspunkte. |
| `app-import.js` | 484 | Der Import aus Framer und die Redesign-Dialoge. Die Bloecke standen in `app.js` und sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt ESLint. |
| `app-library.js` | 280 | Die Bausteinbibliothek und der Papierkorb (P3-2, Schritt 42). Beide Views standen in `app-projects.js`; sie teilen sich nichts mit den Projekten - keine Modulvariable, keinen Zustand, nur die Kern-Helfer. |
| `app-markdown.js` | 158 | Das Markdown der importierten Referenzen (design.md, Guidelines, Komponenten). |
| `app-projects.js` | 197 | Die Projekte, die Seiten und die Einstellungen. Die Bloecke standen in `app.js` und sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt ESLint. |
| `app-references.js` | 771 | Die Referenzbibliothek. Die Bloecke standen in `app.js` und sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt ESLint. |
| `app-refs-add.js` | 304 | Der Dialog zum Hinzufuegen einer Referenz (P3-2, Schritt 40): Datei oder Adresse waehlen, Vorschau, Metadaten, Sammlung. `app-references.js` importiert den Einstiegspunkt. |
| `app-refs-collections.js` | 310 | Die Sammlungen der Referenzen (P3-2, Schritt 39): anlegen, bearbeiten, loeschen, den Brief kopieren und die Auswahl beim Zuordnen. `app-references.js` importiert die Einstiegspunkte. |
| `app-refs-dialog.js` | 105 | Die Rueckmeldungen der Referenzen-Seite: der Toast, das Kopieren mit Rueckfall und das Schliessen per Hintergrund-Klick. `app-references.js` importiert sie. |
| `app-refs-icons.js` | 46 | Die Symbole der Referenzen-Seite (P3-2, Schritt 37): `refsIcon` erzeugt aus einem Pfad ein eingebettetes SVG mit `currentColor` und fester Groesse. |
| `app-refs-inspector.js` | 534 | Der Inspector der Referenzen (P3-2, Schritt 41): die Detailansicht mit Bildbuehne, Zoom, Schritten, Aktionen und dem Loeschen. `app-references.js` importiert die zwei Einstiegspunkte. |
| `app-refs-settings.js` | 90 | Der Referenz-Block der Einstellungen (P3-2, Schritt 36): die Auswahl der Bibliothek, die Bildqualitaet, das Ziel der Analyse und der Schalter fuer die automatische Uebernahme. `app-projects.js` haengt ihn in die Einstellungen. |
| `app-refs-shell.js` | 263 | Die Huelle der Referenzen-Seite (P3-2, Schritt 52): Kopfzeile, Seitenleiste, Suche, Sortierung, Galerie und Fusszeile. |
| `app-refs-state.js` | 116 | Zustand, Adresse und Auswahl der Referenzen-Seite (P3-2, Schritt 38). |
| `app-review.js` | 257 | Die Reviews und ihre Belege. Die Bloecke standen in `app.js` und sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt ESLint. |
| `app-settings.js` | 602 | Die Einstellungen eines Projekts (P3-2, Schritt 43): Profil, Modus, Engine, Bilder, Referenzen, Formulare und der Papierkorb der Backups. `app-projects.js` importiert die View. |
| `app-workspace-lists.js` | 133 | Die Listen-Tabs des Projekt-Workspace: Seiten, Pruefen und Aktivitaet (P3-2, Schritt 49). |
| `app-workspace-settings.js` | 232 | Der Workspace-Tab „Einstellungen": die Projekteinstellungen (Kurzname, Niveau, öffentliche Adresse), die Breakpoints, die hinterlegten Referenzen und der Deploy (P3-2, Schritt 48). |
| `app-workspace-submissions.js` | 191 | Der Workspace-Tab „Einsendungen": die Formulare einer Site, ihre Einsendungen und die Benachrichtigungs-Jobs dazu (P3-2, Schritt 47). |
| `app-workspace-templates.js` | 202 | Der Workspace-Tab „Vorlagen": Layout- und Entry-Vorlagen einer Site samt der Zuordnung, welche Seite welche Vorlage traegt (P3-2, Schritt 47). |
| `app-workspace.js` | 270 | Der Projekt-Workspace (P3-2, Schritt 44): die Ansicht eines Projekts mit seinen Tabs, der Tab-Leiste, dem Dialog fuer eine neue Seite und der Breakpoint-Steuerung. `app-projects.js` importiert die View. |

## Was noch nicht geteilt ist

Die Aufteilung folgt ADR-0019: `Store` und der HTTP-Dispatcher bleiben die Fassade, die
Fachmodule tragen die Tabellen. Diese Dateien stehen bewusst noch als Ganzes; die
Zeilenzahl wird beim Erzeugen gemessen, der Grund ist eine Entscheidung.

| Datei | Zeilen | Warum sie bleibt |
|---|---|---|
| `packages/mcp/src/tools.ts` | 3473 | die Werkzeug-Definitionen; der Manifest-Generator liest diese Datei als Text |
| `packages/engine/src/store.ts` | 2662 | vier fachübergreifende Transaktionen (`applyRedesignPlan`, `duplicateSiteWithPlan`, `duplicateAssetRecords`, `commitFramerImportPlan`), `replaceTables` und die Fassade; der Rest sind Delegaten |
| `packages/framer-import/src/capture-html.ts` | 2225 | der HTML-Capture des Imports |
| `packages/editor/src/inspector/inspector.ts` | 1750 | eine Closure (`createInspector`), die DOM und Zustand gemeinsam hält |
| `packages/engine/src/content.ts` | 1703 | Sammlungen, Einträge und ihre Suche in einem Fachgebiet |
| `packages/editor/src/inspector/model.ts` | 1490 | das Modell des Inspektors |
| `packages/engine/src/types.ts` | 1479 | die öffentlichen Typen der Engine; keine Logik |
| `packages/editor/src/canvas/canvas.ts` | 1336 | die Bühne des Editors |
| `packages/framer-import/src/mapper.ts` | 1326 | die Abbildung Framer nach NodeTree |
| `packages/engine/src/forms.ts` | 1313 | Formulare, Einsendungen und der CSV-Export |
| `packages/app/public/app-editor.js` | 1208 | `mountCanvasView` haelt Canvas, Zustand und Ereignisse in einer Closure |
| `packages/engine/src/media.ts` | 1107 | Assets, Ableitungen und Ordner |
| `packages/app/public/app-references.js` | 771 | die Referenzen-Seite; Rest nach Schritt 52 |
| `packages/engine/src/http.ts` | 241 | Dispatcher und Routentabelle; fertig |
| `packages/app/public/app.js` | 219 | Router und Kommandoleiste; fertig |
