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
| `store-library.ts` | `LibraryRepository` | 704 | Library of the Store (ADR 0019): the shared component library and the installations that link a component into a site. `Store` delegates here. | - |
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

**25 Dateien** mit zusammen **178 Routen**.

| Modul | Routen | Zeilen | Zweck |
|---|---|---|---|
| `http-build-files.ts` | - | 334 | Serving files out of a bake (P3-2 extraction from `http.ts`). |
| `http-contract.ts` | - | 118 | Der Vertrag der HTTP-Schicht: der Kontext, den eine Route bekommt, die Form einer Route und die Form ihrer Antwort. Die Routen liegen in `http-routes-*.ts`, der Dispatcher in `http.ts`; dieses Modul ist, was beide sprechen (ADR-0019). |
| `http-response.ts` | - | 231 | The response primitives of the HTTP surface (P3-2 extraction from `http.ts`). Everything that writes bytes to the socket lives here, so the two rules that must hold for EVERY answer are written once: |
| `http-route-support.ts` | - | 712 | Die Helfer der HTTP-Schicht: was die Routen und der Dispatcher gemeinsam brauchen - Body lesen, Idempotenz, die Kontexte der Fach-Module, die Mutation auf einer Seite (ADR-0019). |
| `http-routes-assets.ts` | 11 | 219 | Die Asset-Routen einer Site (P3-2, Schritt 53): Upload-Adresse, Liste, Lesen, Aendern, Papierkorb, Wiederherstellen, Verlauf, Massenoperation und die Asset-Ordner. |
| `http-routes-content.ts` | 17 | 498 | Die Routen des Bereichs api/reviews, api/forms, api/redesign-proposals, api/collections, api/code-payloads, api/imports. Die Tabelle des Dispatchers in `http.ts` nimmt sie unveraendert auf (ADR-0019). |
| `http-routes-deploy.ts` | 4 | 139 | Deploy und Deploy-Einstellungen einer Site (P3-2, Schritt 62): eine Veroeffentlichung ausliefern, die Auslieferungshistorie und die Ziele (statisch, Netlify, Vercel) samt verschluesseltem Token. |
| `http-routes-design.ts` | 2 | 68 | Der Design-Vertrag einer Site (P3-2, Schritt 64): die Konstanten, die Verbote und das Vokabular, an denen sich jeder Entwurf messen lassen muss. |
| `http-routes-formular.ts` | 3 | 88 | Die Formular-Routen einer Site (P3-2, Schritt 54): die Einsendungen eines Formulars, der Plan fuer eine Sammlung aus einem Formular und ihre Anlage. |
| `http-routes-images.ts` | 2 | 158 | Bild-Jobs einer Site (P3-2, Schritt 66): einen Auftrag starten (der Worker geht die Anbieter-Kette durch und legt das Ergebnis ueber die Medien-Pipeline ab) und die Job-Liste lesen, die ein Agent am haeufigsten abfragt. |
| `http-routes-imports.ts` | 3 | 188 | Die Framer-Import-Routen einer Site (P3-2, Schritt 61): Import anlegen (mit Idempotenz und Job-Zustand), Vorschau ohne Schreiben und der Verlauf. |
| `http-routes-library.ts` | 5 | 92 | Die Bibliotheks-Installationen einer Site (P3-2, Schritt 63): was aus der geteilten Bibliothek uebernommen wurde, ein neues Installieren, das Nachziehen einer Installation, das Wieder-Anhaengen nach einem Detach und das Loesen. |
| `http-routes-media.ts` | 16 | 357 | Die Routen des Bereichs assets/:assetId, assets/:filename, _astro/:filename, api/assets, api/images, api/library-components, api/motion-vendor. Die Tabelle des Dispatchers in `http.ts` nimmt sie unveraendert auf (ADR-0019). |
| `http-routes-ops.ts` | 17 | 495 | Die Routen des Bereichs api/settings, api/backups, api/tokens, api/mcp, api/events, api/whoami, api/notifications, api/newsletter, api/health. Die Tabelle des Dispatchers in `http.ts` nimmt sie unveraendert auf (ADR-0019). |
| `http-routes-pages.ts` | 27 | 601 | Die Routen des Bereichs api/pages, api/entries, api/page-starters, api/releases, api/revisions. Die Tabelle des Dispatchers in `http.ts` nimmt sie unveraendert auf (ADR-0019). |
| `http-routes-references.ts` | 23 | 710 | Die Routen des Bereichs api/references, api/reference-collections. Die Tabelle des Dispatchers in `http.ts` nimmt sie unveraendert auf (ADR-0019). |
| `http-routes-section-preview.ts` | 2 | 264 | Die Vorschaubilder der Sektions-Varianten im Theme einer Site. |
| `http-routes-site-assets.ts` | 2 | 86 | Die zwei Asset-Routen einer Site: eine Upload-Adresse ausstellen und den Bestand lesen. Der Zuschnitt aus `http-routes-sites.ts` (Schritt 68). |
| `http-routes-site-code-payloads.ts` | 2 | 56 | Die zwei Code-Payload-Routen einer Site: einen Payload anlegen und die vorhandenen lesen. Der Zuschnitt aus `http-routes-sites.ts` (Schritt 70). |
| `http-routes-site-content.ts` | 7 | 196 | Sammlungen und Eintraege EINER SITE (P3-2, Schritt 65): anlegen, auflisten, aus Feldern ableiten, Eintraege schreiben, lesen, suchen und einen Pfad aufloesen. |
| `http-routes-site-lifecycle.ts` | 8 | 260 | Die Routen des Site-Lebenszyklus (P3-2, Schritt 60): anlegen, listen, aendern, Papierkorb, wiederherstellen, duplizieren, lesen, loeschen. |
| `http-routes-site-references.ts` | 3 | 101 | Referenzen einer Site (P3-2, Schritt 67): die Zuordnung der Referenzprojekte samt abgeleitetem Theme-Entwurf, das Anwenden einer Referenz und das Loesen einer Zuordnung. |
| `http-routes-site-reviews.ts` | 4 | 134 | Die zwei Vorschau- und zwei Review-Routen einer Site: eine Vorschau ausstellen, die Vorschauen lesen (und dabei abgelaufene aufraeumen), einen Review einreichen und Reviews lesen. Der Zuschnitt aus `http-routes-sites.ts` (Schritt 69). |
| `http-routes-sites.ts` | 9 | 270 | Die verbleibenden Routen einer Site: Seiten, Audit, Releases, Bake-Jobs, Formulare, Benachrichtigungen und Redesign. Die Tabelle des Dispatchers in `http.ts` nimmt sie unveraendert auf (ADR-0019). |
| `http-routes-theme.ts` | 11 | 230 | Theme und Style-Regeln einer Site (P3-2, Schritt 57): das Theme lesen, als CSS ausliefern, schreiben, den Theme-Bericht, den Design-Bericht und die sechs Style-Regel-Routen (lesen, anlegen, aendern, sortieren, loeschen). |
| **Summe** | **178** | | |

## Oberfläche: ES-Module

**35 Dateien.**

| Modul | Zeilen | Zweck |
|---|---|---|
| `app-articles.js` | 389 | Der Artikel-Workspace: die Liste der Artikel, ihr Editor, die Feldsteuerung und das Lesen der Zellen. Die Bloecke standen in `app.js`, dann in `app-projects.js` und sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt ESLint. |
| `app-core.js` | 445 | Die Grundlagen der Oberflaeche. Die Bloecke standen in `app.js` und sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt ESLint. |
| `app-editor-agent-preview.js` | 65 | Die Agent-Vorschau (Ticket 05, Punkt 5) - aus `app-editor.js` (R12). |
| `app-editor-bake-status.js` | 66 | Der Re-Bake-Status am Canvas (E12) - aus `app-editor.js` (R12). |
| `app-editor-conflict-dialog.js` | 70 | Der Konflikt-Dialog des Editors (L17) - aus `app-editor.js` (R12). |
| `app-editor-live-events.js` | 40 | Die zwei Regeln am Live-Kanal (Ticket 05) - aus `app-editor.js` (R12). |
| `app-editor-live-sync.js` | 62 | Was der Editor mit einer fremden Live-Meldung tut - aus `app-editor.js` (R12). |
| `app-editor-panel-toggle.js` | 58 | Die Panel-Umschalter des Editors (E8) - aus `app-editor.js` (R12). |
| `app-editor-protocol.js` | 69 | „Was gerade passiert" - das Protokoll unter dem Canvas (aus `app-editor.js`). |
| `app-editor-redesign-inbox.js` | 94 | Die Redesign-Inbox am Canvas (ADR-0012) - aus `app-editor.js` (R12). |
| `app-editor-save-status.js` | 51 | Was die Statuszeile des Editors sagt - aus `app-editor.js` (R12). |
| `app-editor-toolbar-overflow.js` | 109 | Das Overflow-Menue der Editor-Toolbar - aus `app-editor.js` (R12). |
| `app-editor.js` | 1048 | Der Seiten-Editor und die Buehne. Die Bloecke standen in `app.js` und sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt ESLint. |
| `app-framer-import.js` | 509 | Der Import aus Framer (P3-2, Schritt 45): der Bericht nach der Analyse und der Dialog, der die Adresse abfragt, analysiert und den Write ausloest. `app-import.js` importiert die zwei Einstiegspunkte. |
| `app-import.js` | 484 | Der Import aus Framer und die Redesign-Dialoge. Die Bloecke standen in `app.js` und sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt ESLint. |
| `app-library.js` | 280 | Die Bausteinbibliothek und der Papierkorb (P3-2, Schritt 42). Beide Views standen in `app-projects.js`; sie teilen sich nichts mit den Projekten - keine Modulvariable, keinen Zustand, nur die Kern-Helfer. |
| `app-markdown.js` | 158 | Das Markdown der importierten Referenzen (design.md, Guidelines, Komponenten). |
| `app-projects.js` | 197 | Die Projekte, die Seiten und die Einstellungen. Die Bloecke standen in `app.js` und sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt ESLint. |
| `app-references.js` | 597 | Die Referenzbibliothek. Die Bloecke standen in `app.js` und sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt ESLint. |
| `app-refs-add.js` | 304 | Der Dialog zum Hinzufuegen einer Referenz (P3-2, Schritt 40): Datei oder Adresse waehlen, Vorschau, Metadaten, Sammlung. `app-references.js` importiert den Einstiegspunkt. |
| `app-refs-cards.js` | 201 | Die Karten der Referenzen-Seite (P3-2, Schritt 59): das Blockrendering mit dem Waechter, die einzelne Karte und ihr Vorschaubild. |
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

## MCP: Werkzeug-Module

**6 Dateien.** Die Werkzeuge lagen bis zum 23.10.2026 alle in `tools.ts`;
die Uebersicht nennt sie einzeln, weil die Datei sonst wie ein God-File aussieht, das sie nicht mehr ist.

| Modul | Werkzeuge | Zeilen | Zweck |
|---|---|---|---|
| `tools-bibliothek.ts` | 10 | 120 | Die Bibliotheks-Werkzeuge der MCP-Fassade (R12, Schritt 71). |
| `tools-components.ts` | - | 112 | The component view of a page draft (P3-2 extraction from `tools.ts`). |
| `tools-medien.ts` | 21 | 622 | Die Medien-Werkzeuge der MCP-Fassade (P3-2, Schritt 57): Assets lesen, hochladen, aendern, ersetzen, loeschen und wiederherstellen, Bilder erzeugen und abfragen, Sammlungen und Eintraege samt Einsendungen. |
| `tools-schemas.ts` | - | 182 | Die Ausgabeschemas der lesenden Werkzeuge (P3-3, R8). |
| `tools-support.ts` | - | 291 | The machinery every tool goes through (P3-2 extraction from `tools.ts`): the argument readers, the schema helpers, paging and the shared HTTP calls. |
| `tools.ts` | 78 | 2614 | Elicitation (E4 slice 2): ask the client for a missing or ambiguous parameter. The server wires this only when the client declared the elicitation capability; declined or unsupported resolves to undefined and the tool's own validation error stands. |
| **Summe** | **109** | | |

## Die grossen Dateien und warum sie so gross sind

Die Aufteilung folgt ADR-0019: `Store` und der HTTP-Dispatcher bleiben die Fassade, die
Fachmodule tragen die Tabellen. Diese Dateien reissen die Schwelle von 1 000 Zeilen; jede
Zeile hier nennt den Grund - eine Entscheidung, keine Messung. Die Zeilenzahl selbst wird
beim Erzeugen gemessen.

`packages/engine/test/doku-konsistenz.test.ts` prueft die Vollstaendigkeit dieser Tabelle:
er laeuft selbst durch `packages` und meldet jede Datei ueber der Schwelle, die hier fehlt.

| Datei | Zeilen | Warum sie so gross ist |
|---|---|---|
| `packages/framer-import/src/capture-html.ts` | 2726 | der HTML-Capture des Imports |
| `packages/engine/src/store.ts` | 2662 | vier fachübergreifende Transaktionen (`applyRedesignPlan`, `duplicateSiteWithPlan`, `duplicateAssetRecords`, `commitFramerImportPlan`), `replaceTables` und die Fassade; 202 von 244 Methoden sind reine Delegaten (gemessen), der Rest steht in 38 `store-*`-Modulen |
| `packages/mcp/src/tools.ts` | 2614 | die Werkzeug-Tabelle; ihre Reihenfolge ist der Vertrag (`server.ts` liest `TOOLS.map`), der Manifest-Generator folgt den `...X_TOOLS`-Spreizungen - ein weiterer Schnitt ist möglich und braucht den Manifest-Diff als Beweis |
| `packages/editor/src/inspector/inspector.ts` | 1884 | eine Closure (`createInspector`), die DOM und Zustand gemeinsam hält |
| `packages/framer-import/src/mapper.ts` | 1819 | die Abbildung Framer nach NodeTree |
| `packages/manifest/src/tools.ts` | 1796 | ERZEUGT von `scripts/render-manifest.mjs` aus `packages/mcp/src/tools.ts` (`pnpm manifest:check` haelt es). Die Zeilenzahl ist keine Entscheidung, sondern die Folge von 109 Werkzeugen mit je vier Angaben |
| `packages/engine/src/content.ts` | 1703 | Sammlungen, Einträge und ihre Suche in einem Fachgebiet |
| `packages/editor/src/inspector/model.ts` | 1490 | das Modell des Inspektors |
| `packages/engine/src/types.ts` | 1479 | die öffentlichen Typen der Engine; keine Logik |
| `packages/editor/src/canvas/canvas.ts` | 1336 | die Bühne des Editors |
| `packages/engine/src/forms.ts` | 1313 | Formulare, Einsendungen und der CSV-Export |
| `packages/editor/src/state/operations.ts` | 1240 | die Editor-Operationen: ein Dispatcher (`applyEditorMutation`) und je eine Funktion pro Operation, dazu die gemeinsamen Pruefer fuer Katalog, Props, Styles und Motion. Die Pruefer teilen den Katalog und die Fehlerform - sie zu trennen hiesse, den Katalog zweimal zu lesen. Geteilt wird ueber `applyEditorMutation`, geprueft ueber `EditorStore` (`mutations.test.ts`, `history.test.ts`, `save-pipeline.test.ts`) |
| `packages/engine/src/lifecycle.ts` | 1190 | der Release-Lebenszyklus in einem Fachgebiet: Revision, Re-Bake, Veroeffentlichung, Preview und Review gehoeren zusammen, weil ein Release ohne die anderen drei nicht entsteht; ein Schnitt muesste die gemeinsame Transaktion teilen |
| `packages/renderer/src/motion.ts` | 1149 | die Motion-Auslieferung: `renderPageScript` und `renderIslandsScript` sind die beiden Laufzeit-Skripte, die als TEXT ausgeliefert werden - der groesste Teil der Datei steht in Template-Literalen, also in ausgeliefertem Code, nicht in Quellcode. Ein Schnitt wuerde zwei Skripte mit gemeinsamem Zustand (Lenis, GSAP, ScrollTrigger) auf zwei Dateien verteilen |
| `packages/engine/src/mutations/apply.ts` | 1144 | die Mutationen der Engine: ein Dispatcher (`applyOne`) und je eine Funktion pro Operation, dazu die Platzierungspruefer (`assertChildPlacement`, `assertSlotPlacement`, `assertSlotAllowedTypes`). Allen gemeinsam ist der `ApplierState`: der Dispatcher setzt `currentOpIndex`, die Faelle lesen ihn. Ein Schnitt muesste diesen Zustand teilen. Geprueft in `mutations.test.ts`, `transactions.test.ts`, `undo-batch.test.ts` |
| `packages/engine/src/media.ts` | 1107 | Assets, Ableitungen und Ordner |
| `packages/app/public/app-editor.js` | 1048 | `mountCanvasView` haelt Canvas, Zustand und Ereignisse in einer Closure |
| `packages/engine/src/references-lifecycle.ts` | 1046 | die Referenz-Pipeline: Analyse, Job-Lauf, Snapshot, Playwright-Aufnahme und Anwendung; der Capture-Treiber allein sind 250 Zeilen, und er teilt den Zustand mit dem Job-Lauf |
| `packages/renderer/src/bake.ts` | 1021 | der Bake: `bakeSite` haelt Warnungen, Manifest-Seiten, Motion-/Lenis-/Formular-Flags, Island-Arten und benutzte Payload-Ids ueber alle Seiten - genau dieser geteilte Zustand ist der Grund, warum der Bake in einem Durchgang laeuft. Die Helfer (`stageTemplate`, `runAstroBuild`, `writeAeoFiles`, `assertBakeable`) sind bereits eigenstaendig |

## Der laufende Zuschnitt

Dateien unter der Schwelle, die trotzdem weiter geteilt werden - hier steht, was als
Naechstes passiert, nicht warum etwas bleibt.

| Datei | Zeilen | Stand |
|---|---|---|
| `packages/engine/src/http-routes-sites.ts` | 270 | 9 Site-Routen; 1 205 → 270 Zeilen über zehn Schnitte. Der Zuschnitt ist an seiner fachlichen Grenze: der Betriebs-Block (Seiten, Audit, Releases, Bake-Jobs, Formulare, Benachrichtigungen, Redesign) wurde gemessen und VERWORFEN - 2 von 6 Importen wandern mit, das ist eine Sammelgruppe |
| `packages/app/public/app-references.js` | 597 | die Referenzen-Seite selbst; Karten, Huelle, Zustand und Inspektor sind bereits eigene Module (`app-refs-cards.js`, `app-refs-shell.js`, `app-refs-state.js`, `app-refs-inspector.js`). Was bleibt, ist die Seitenfunktion `referencesView` mit ihren fuenf Naehten |
