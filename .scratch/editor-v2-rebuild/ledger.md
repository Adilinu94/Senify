# Zustandsbuch Editor-Umbau (Phase 1-3)

**Ziel:** Die 23 Grundbausteine aus `packages/widget-engine` werden zu echten Widgets (echtes Markup, echte Grundstile), der senkrechte Durchstich Bearbeiten -> Speichern -> Veroeffentlichen steht mit tolerantem Bildvergleich, danach Phase 2 (Style-Engine/Inspektor) und Phase 3 (Chrome).

**Kern:** (1) Ein Markup-Beschreiber in `widget-engine/src/markup.ts` ist die *einzige* Quelle fuer Tag, Klassen, Attribute und Grund-CSS der 23 Bausteine; Registry-Renderer (Canvas **und** Bake, beide nutzen `SectionTree`) malen daraus. (2) Derselbe Compiler-Ausdruck liegt auf beiden Seiten an: Canvas-Frame und ausgelieferte Seite tragen Grund-CSS + `@layer user-authored`. (3) Wo beide Vokabulare denselben Namen tragen (`divider`, `embed`), bleibt die *laufende* Section-Registry zustaendig; der Katalog-Beschreiber greift nur, wo es keine Section-Komponente gibt (Strangler, E2 in `map.md`).

**Geprueft:**
- Runde 1: `pnpm test` Baseline **905 gruen / 2 uebersprungen / 114 Dateien**.
- Schritt 1: `packages/widget-engine/src/markup.ts` (Markup-Beschreiber + Grund-CSS) und `packages/widget-engine/test/markup.test.ts` **9/9 gruen**. Compiler um `selectorFor` erweitert (`compile.ts`), damit dasselbe Compiler-Ergebnis auch unter Klassen-Selektoren gilt.
- Schritt 2: **SectionTree-Weitergabe fertiggestellt und geprueft.**
  - `packages/registry/src/components/map.tsx`: die Verzweigung fragt jetzt *zuerst* die laufende Section-Registry (`SECTION_COMPONENTS`), *danach* den Katalog-Beschreiber, sonst den Unbekannt-Platzhalter. Die vorige Fassung fragte den Beschreiber zuerst und riss damit die Namensdublette `divider`/`embed` an sich (dieselben zwei Namen in `widget-engine/src/legacy.ts` und `packages/registry/src/index.ts`).
  - `packages/registry/src/components/primitives.tsx`: `key` wird direkt an das Element gegeben, nicht mehr per Spread; React warnte sonst (Konsolenfehler). Gefunden erst durch den Browser-Test.
  - **Beleg Unit:** 3 neue Faelle in `packages/registry/test/components.test.ts` (Katalog-Primitiv aus dem Beschreiber, Kinder im Container, Namensdublette bleibt bei der Section); Datei **14 gruen**.
  - **Beleg Browser:** `packages/app/test/canvas-browser.test.ts` traegt zusaetzlich einen `heading`-Baustein; `[data-widget="heading"]` mit `class="w-heading"` in allen drei Geraeten, `[data-widget="divider"]` 0 Treffer. Null Konsolenfehler. Screenshot `canvas-bausteine-1600.png`.
  - Zahlen damals: `pnpm test` **917 gruen / 2 uebersprungen / 115 Dateien / 0 rot**; `pnpm typecheck` 0; `pnpm lint` 0.
- Schritt 3 (diese Runde): **Grund-CSS in beide Renderpfade eingespeist.**
  - `packages/widget-engine/src/markup.ts`: `PRIMITIVE_RESET.grid = ["display: grid;"]`. Ohne das liegt `grid-template-columns` auf einer Blockbox und die Spaltenzahl bleibt wirkungslos; kein Designwert, sondern nur das Nehmen eines Browser-Standards (wie `display:flex` bei `input`).
  - Canvas-Frame: `packages/editor/src/canvas/rules.ts` traegt jetzt `base` (= `PRIMITIVE_BASE_CSS`) zwischen Chrome und dem Compiler-Ausdruck; `FrameRules` gibt `base` mit aus. Reihenfolge **chrome (unlayered) -> base -> authored**: base und Knotenregeln teilen `@layer user-authored`, die Knotenregel gewinnt per Quellreihenfolge — dieselbe schwach-nach-stark-Ordnung wie im Release.
  - Release: `packages/renderer/astro-template/src/components/Section.astro` inlinet `PRIMITIVE_BASE_CSS` genau dann, wenn der Baum einen Katalog-Baustein enthaelt (`isCatalogPrimitive`), und zwar **vor** dem Section-Markup, damit `@layer user-authored` nach Tailwinds Layern registriert wird und gewinnt; eine Seite ohne Katalog-Baustein traegt nichts. Neue Abhaengigkeit `@senify/widget-engine` in `packages/renderer/package.json`.
  - `packages/renderer/src/bake.ts`: `assertBakeable` akzeptiert beide Vokabulare — Section-Komponente **oder** Katalog-Beschreiber (`describePrimitive`); `children-unrendered` entfaellt fuer Katalog-Container mit `childrenSlot`.
  - `pnpm-lock.yaml` nachgezogen (nur Abhaengigkeits-Links): renderer -> widget-engine neu; dabei zwei schon vorher bestehende Abweichungen mitkorrigiert (registry fuehrte widget-engine im Paket, aber nicht im Lock; widget-engine fuehrte renderer nur im Lock, nicht mehr im Paket).
  - **Beleg Unit:** `packages/editor/test/canvas/rules.test.ts` +1 (base im Frame, Reihenfolge chrome < base < authored), `packages/renderer/test/widget-bake.test.ts` +2 (Grund-CSS byte-gleich im Release **vor** dem Markup; Seite ohne Katalog-Baustein unveraendert) — gruen.
- Schritt 4 (diese Runde): **senkrechter Durchstich mit tolerantem Bildvergleich steht.**
  - `packages/app/test/widget-slice-browser.test.ts` (neu; fluechtige `startProgram`-Instanz mit `enginePort: 0`/`appPort: 0`, die Dienste 4321/4322 **nicht** gestartet): eine Sektion wird ueber den Store aufgebaut (Bearbeiten), im echten Canvas (`/editor.js`, `mountCanvas`, `/theme.css` + `/editor-frame.css`) gerendert, ueber `bakeSite` veroeffentlicht und als Release ausgeliefert; jedes Mass wird auf beiden Seiten gelesen und verglichen.
  - Zahlen dieses Laufs: Bildvergleich Canvas vs. Release 1120x48, **3 abweichende Bildpunkte, Verhaeltnis 0,000056** (Toleranz 0,01); jedes Mass identisch (maxWidth 1120px; grid-template-columns `362.656px 362.672px 362.656px`; columnGap 16px; margin 0px). **Ueberlauf 0 px** im Rahmen-Dokument und im Release. **Null Konsolenfehler / Fehlanfragen.**
  - **Gegenprobe (Schaerfe):** dieselbe Release-Seite ohne `PRIMITIVE_BASE_CSS` -> Verhaeltnis **0,485**, `maxWidth: none` — die Toleranz ist eng genug fuer ihren Zweck.
  - **Belegbilder** in `.scratch/refs/nick/ui/`: `phase1-durchstich-canvas-voll.png` (1500x1000, ganze Arbeitsflaeche) und `phase1-durchstich-release-1440.png` (1440x1000, fullPage); dazu die Ausschnitte `phase1-durchstich-canvas.png`/`-release.png` und die Diffs `phase1-durchstich.png`/`phase1-durchstich-gegenprobe.png`.
- Gesamtlauf dieser Runde: `pnpm test` **921 gruen / 2 uebersprungen / 117 Dateien / 0 rot** (923 gesamt; die zwei uebersprungenen sind die bekannten Postgres-Faelle `persistBatch transactions (real Postgres)`, `TEST_DATABASE_URL` nicht gesetzt). `pnpm typecheck` Exit 0, `pnpm lint` Exit 0. Kein Test geloescht, keiner ohne Grund uebersprungen; **rot war nichts, es musste nichts repariert werden.**
- **Bekannt flaky (nicht angefasst):** ein erster Gesamtlauf ging rot aus, allein wegen `packages/engine/test/theme.test.ts` — `fetch failed` / `Caused by: bad port` beim Token-Bootstrap. Ursache ist der Ephemeral-Port aus `engine.listen({ port: 0 })` in `packages/engine/test/helpers.ts`; undici-Fetch verweigert bestimmte Ports. In Isolation **6/6 gruen**, im Wiederholungslauf **117/117 Dateien gruen** — Inhaltfehler ist ausgeschlossen, der Test blieb unveraendert.

**Offen:**
- **Veroeffentlichen/Speichern mit Katalog-Namen:** der Durchstich veroeffentlicht ueber `bakeSite` (dieselbe Funktion, die `bakePages` der Engine ruft) und noch nicht ueber `POST /api/releases`; das Speichern ueber die echte Route ist mit einer *Section* belegt (`canvas-view-browser.test.ts`), die Katalog-Namen sind noch nicht in der Mutations-API der Engine registriert (Strangler, E2). Faellt mit dem Cutover in Phase 4.
- **Dublette `divider`/`embed`:** bleibt bis zum Paritaets-Tor bei der Section (Katalog-Beschreiber fuer diese zwei ungenutzt); Aufloesung faellt mit dem Cutover in Phase 4 oder einer eigenen Namensentscheidung.
- **Ziehen und Ablegen (DnD), Plus-Punkte, Einfuegelinie** (Ticket 01 Punkt 7): bewusst noch nicht gebaut (`packages/editor/src/canvas/insert.ts`, Zeile 9: Einfuegen nur per Katalog-Klick). Selektionsring und vier Handles gibt es bereits; DnD/Werkzeugkasten liegen bei Phase 3 (Chrome).
- Danach **Phase 2** (Style-Engine/Inspektor/MCP) und **Phase 3** (Chrome), siehe `issues/02-style-engine-inspector.md` und `issues/03-editor-chrome.md`.

**Entscheidungen getroffen (17.09., Nutzer):** O10 drei Geraetestationen (ui-plan 5.13 + ui-aufgaben 34 angepasst), O11 disabled als vierter State (Option A), O12 PG-only als ADR-0004 (`docs/adr/0004-postgres-only-bis-phase-5.md`). Tickets 08/09/15 sind damit entschieden; Rest in 15: Gate-Test + HANDOFF-Eintrag.

**Entscheidung getroffen (18.09., Nutzer): O13 — offenes CSS statt Whitelist** (ADR-0005,
`docs/adr/0005-offenes-css-statt-whitelist.md`).

*Anlass:* Die Produktfrage war „bekomme ich spaeter Baukasten-Seiten oder individuelle Seiten?".
Die Code-Pruefung ergab drei echte Deckel, die nichts mit dem Style-Rule-Modell zu tun hatten:
(1) `STYLE_PROPERTIES` (`widget-engine/src/css/properties.ts`) fuehrt **30** Properties und
`assertStyleProp` (`editor/src/state/operations.ts`) lehnt jede andere im Schreibpfad ab — nicht
setzbar waren u. a. `position`, `inset`, `overflow`, `zIndex`, Flex-Einzelwerte, `gridTemplate*`,
`clipPath`, `maskImage`, `textShadow`, `cursor`, `outline`, `containerType`, `scrollSnap*`, sowie
Pseudo-Elemente, Keyframes und Animationen ueberhaupt nicht; (2) `styleGroups` (`catalog.ts`) sperrt
zusaetzlich pro Baustein (`heading` ohne `border`/`size`, `image` ohne Typografie); (3) es gab kein
Freiheits-Ventil (keine freien Selektoren, kein rohes CSS, keine eigenen Bedingungen).
Die Vergleichsbasis (`Repos/instatic/docs/reference/css-class-registry.md`) hat all das:
`styles` als offenes CSS-Bag, `ambient`-Selektoren, `rawCss`, `contextStyles`, `stylePriorities`,
18 Pseudo-Zustaende.

*Entscheidung:* Die Property-Tabelle beschreibt ab jetzt die **Oberflaeche** (welches Bedienelement
eine Property bekommt), nicht die Erlaubnis. `assertStyleProp` faellt weg, `styleGroups` wird
Sortierung, drei Freiheits-Ventile gehoeren ins Modell. Die Grenze ist Sicherheit/Struktur
(`assertSafeDeclaration`), nicht Geschmack.

**Vorgefunden am 18.09. (uncommittet im Working Tree, nicht von dieser Runde):** die Site-weite
Style-Rule-Registry ist serverseitig **fertig** — kanonisches `StyleRule`-Modell
(`widget-engine/src/css/style-rule.ts`: `id`, `name`, `kind class|ambient|scoped`, freier
`selector`, `order`, `styles`, `stylePriorities`, `contextStyles`, `rawCss`, `scope`, `origin`),
`sites.style_rules_json`, Store-CRUD mit Audit, Routen `/api/sites/:siteId/style-rules` (+ `reorder`),
`editor-bridge.ts` verweist Regel-Ops dorthin, Tests `engine/test/style-rules.test.ts` und
`widget-engine/test/style-rule.test.ts`. Damit ist **Ticket 02 Punkt 1 erledigt** und
**Ticket 13 zur Haelfte** (Editor-Anbindung fehlt).

**Folgen fuer die Tickets (alle drei Dateien sind neu gefasst):**
- **07** baut auf dem kanonischen Modell auf (nicht auf dem engeren B1-Entwurf mit `props`/`position`/
  `origin: user|agent|preset`, der weder `id` noch `selector`/`rawCss`/`contextStyles` hatte und den
  Deckel ins Datenmodell eingebaut haette). Ergaenzt wird das kanonische Modell nur um `states`
  (O11) und `statePriorities`. `DOCUMENT_VERSION` bleibt **2**: additives Feld, und das
  Editor-Dokument wird nirgends als Ganzes persistiert (`serializeDocument` lebt nur in Tests).
- **10** schafft das Schreibtor ab, statt die Liste zu verlaengern; Layout-Eintraege kommen als
  Bedienelement-Beschreibung dazu; persistiert werden echte CSS-Namen (`border-radius`), Kunstnamen
  bleiben Eingangs-Alias.
- **13** ist auf den realen Stand korrigiert (Server fertig, Editor-Anbindung + Bake offen).
- **14** bekommt ein neues Argument: `ambient`-Regeln koennen keinen Knotenanker haben, globale
  Emission ist fuer sie Pflicht.

**Neuer offener Punkt O14:** **Templates + Outlet fehlen im editor-v2-Bauplan.** Die
Vergleichsanalyse nennt sie als *erste* Stufe der Wiederverwendung (vor Loops, vor Visual
Components). **Praezisierung 18.09.:** Der v1-Kern hat sie bereits (`page_templates`,
`templates.ts` mit `findFirstOutlet`/`spliceOutlet`/`composePageTree`/`findLayout`/
`findEntryTemplate`/`putPageTemplate`, plus MCP-Tools); die Luecke ist editor-v2-seitig und bei
den VC-Ebenen-Templates (Phase 4). Zu entscheiden: eigene Phase vor/mit Phase 4, ob die
v1-Mechanik im Editor sichtbar wird, und ob Loops mitkommen.

**Analyse 19.09. (Verbesserungsplan erstellt):** Sechs unabhaengige Audits (Technik, Editor-UX,
KI/MCP, Produktreife, Framer/Webflow-Benchmark, UI-Qualitaet) gegen den Arbeitsbaum; die
Kernbehauptungen wurden stichprobenartig am Code verifiziert (49 MCP-Tools in `tools.ts`,
`triggerRebake`-Stub `rebake.ts:22-39`, Editor-Doppelpfad `app.js:4582-4596`, Legacy-Farben
`styles.ts:22-31`, `hidden`-Migrationsluecke `migration.ts:56-92`, Marker-Fremdfarben
`canvas/rules.ts:62-73`). Ergebnis: **`docs/verbesserungsplan.md`** — Zielbild Framer/Webflow-Niveau,
Luecken L1–L33 (P0–P3), 16 Epics E1–E16 mit Akzeptanzkriterien, Roadmap Phase A–D, Gates und die
naechsten 10 Arbeitspakete. Kein Produktcode geaendert; Teststand unveraendert 1176/2/132.

**Haertung 19.09. (Verbesserungsplan, zweite Runde):** Drei Härtungs-Pruefungen (MCP-Best-Practices,
Editor-Architektur-Best-Practices, Red-Team) plus lokaler Test von drei Agenten-Vorbildern
(OpenResearch, hyperresearch, Agent-Reach; Details in `docs/verbesserungsplan.md` §10.3 —
hyperresearch-CLI praktisch getestet, Agent-Reach-Testsuite **589 gruen / 3 umgebungsbedingt rot**,
OpenResearch quellcodeseitig). Eingearbeitet: korrigierte Paritaetszahl, L12a (MCP-Vertragshygiene,
verifiziert: falsche Tool-Annotations `server.ts:112-115`), L34–L44, Epics E17–E23, neue
Abschnitte §8 (KPIs, Risiko-Register, Betrieb, DSGVO, Kosten, Abhaengigkeitsgraph, Cutover),
Zielwerte/Test-Matrix, Glossar. Weiterhin kein Produktcode geaendert.

**Quellcode-Studien 19.09. (Verbesserungsplan, dritte Runde):** Webstudio, Payload CMS und Plasmic
flach geklont und gezielt gelesen; 15 Muster als „Uebernommene Muster"-Absaetze in die Epics
E1–E23 eingearbeitet (u. a. `@layer presets`/Atomic-Emit fuer E20, Claim/Lease/Heartbeat fuer E12,
Autosave in-place fuer E13, Confirmation-Token fuer E21, Definition/Instanz-Trennung fuer E11,
Split-Modell fuer E23) plus Uebersicht §16.6. Eine **Korrektur am eigenen Plan:** Selection/Zoom
gehoeren bewusst **nicht** in die Undo-History (Webstudio-Muster). Hinweis: `docs/verbesserungsplan.md`
wurde parallel um „Teil II" (§10–§16: Referenz-Transfer, Anti-Slop, Editor-Tiefe) erweitert —
beide Teile koexistieren; nichts ueberschrieben. Kein Produktcode geaendert.

**Ticket 19 M6 kleine Presets (22.09., umgesetzt): Hover, Ambient, Preloader, Modal.**
Entscheidung (Nutzer): alle 8 offenen D/E/F-Presets umsetzen, die **freie Timeline
streichen**, 3D spaeter mit **three.js direkt** (self-hosted, kein React). Drei Wege:
`hover-lift`, `ambient-float`, `grain` als Head-CSS (`document`-Runtime,
`pageEffectsForTree`/`motionEffectCss`, Hook `data-motion`, RM- und `(hover: none)`-
Gates, Intensity skaliert Hub/Travel/Opacity); `magnetic-button`, `tilt-card`,
`cursor-glow` im page.js (quickTo, canHover, Touch skip, ein Glow-Layer pro Seite);
`preloader-light` als Markup-Curtain (load/2,5-s-Cap/RM sofort, noscript versteckt);
`modal` als Island-Medien-Lightbox (`<dialog>`, Preset = Opt-in). RM-Gate prueft jetzt
`off` statt `ignore` (Policy lief nie). Editor: Live/Play injizieren den Head-CSS-Block,
Design bleibt ruhig. Sections-`motionPresets` erweitert, Bundle-Budget 160 KB. Tests:
section-sdk +1, Renderer +6, Islands +1, Registry +1, Panel-Listen nachgezogen, Bake
erweitert. Zahlen: gesamt **1427 gruen / 2 uebersprungen / 154 Dateien, EXIT 0**
(`.scratch/testlauf-22-09-m6presets-5.log`; Laeufe 2-4: bekannte Flakes, in Isolation
gruen), typecheck 0, lint 0. M6-Rest: 3D.

**Ticket 19 M6 Page Transitions (22.09., umgesetzt): `page-fade` als Seiten-Preset.**
Neuer Runtime-Wert `document` in der Registry: `page-fade` liegt wie jede Spec an einem
Knoten, wirkt aber auf die ganze Seite. Der Bake sammelt sie pro Seite
(`pageTransitionForTree`, erster Knoten gewinnt, Duplikat -> Warnung `document-excess`) und
schreibt einmal Head-CSS (`pageTransitionCss`): `@view-transition { navigation: auto; }`,
Dauer 0,3–0,5 s nach Intensity, RM-Gate (`static` -> `animation: none !important`, `fade`
-> Cross-Fade 0,2 s, `off` -> ohne Gate). `motionConfigsForTree` ueberspringt `document`
ohne Warnung; `Page.astro` rendert das Block-CSS als Inline-`<style>` nur auf Seiten mit
Preset. Beide Seiten brauchen das Opt-in (sonst kein Cross-Document-View-Transition),
ohne Support degradiert es still. Tests: section-sdk (Runtime-Liste, `page-fade` =
`document`, kein Pending), Renderer +3 (Sammeln/Skip, Duplikat/disabled, CSS-Gates), Bake
+1 (Head-CSS ohne `motion-data`/`page.js`). Zahlen: gesamt **1418 gruen / 2 uebersprungen /
154 Dateien, EXIT 0** (`.scratch/testlauf-22-09-pagetransitions.log`; die Differenz zum
Vorlauf enthaelt Fremdstrang-Tests der Bildgenerierung, eigene +4), typecheck 0, lint 0.
M6-Rest: freie Timeline, 3D.

**Motion an VCs (22.09., umgesetzt): Motion an Komponenten ueberlebt das Inlining.**
Die Motion der Instanz ist die Entscheidung der Instanz und landet auf der Wurzel-Kopie;
ohne sie gilt der Default der Definition (erst das Wurzel-Teil, dann der Definitions-Knoten).
`inlineComponents` (`section-sdk/src/components.ts`) uebertraegt sie zusammen mit den Klassen;
`detachComponent` gibt dieselbe Spec an die Wurzel des abgeloesten Baums weiter; das
Vorlagen-Splice reicht Knoten samt Motion durch (Test). Damit emittieren Canvas und Bake die
Animation fuer die Kopie-Id, die das DOM traegt, und Guardrails (Draft) und Bake (inline)
zaehlen dieselben Pins. Tests: section-sdk +4, Editor +2, Engine +2. Zahlen: gesamt **1408
gruen / 2 uebersprungen / 153 Dateien, EXIT 0** (`.scratch/testlauf-22-09-motion-vcs-2.log`;
der erste Lauf hatte den bekannten `canvas-view-browser`-Flake, in Isolation gruen),
typecheck 0, lint 0. M6-Rest: freie Timeline, Page Transitions, 3D.

**Varianten im Editor (21.09., umgesetzt): extrahieren, umbenennen, loeschen.** Entscheidung
(Nutzer): Anlegen aus Instanz-Overrides (Kontextmenue „Als Variante speichern", Name per
Dialog), Verwaltung im Inspektor der Komponente (Register mit Umbenennen und Loeschen) —
kein leerer Deklarationsmodus. Ops (`editor/src/state/components.ts`):
`createVariantFromOverrides` (der Override-Beutel wandert als benanntes Overlay in die
Definition, die Instanz verliert die Overrides und aktiviert die Variante), `renameVariant`
(Overlay behaelt seinen Platz, Instanzlisten folgen), `deleteVariant` (Overlay weg, aktive
Listen bereinigt), `suggestVariantName`; je ein `applyBatch` (ein Undo), unbekannte/leere/
doppelte Namen abgewiesen. Explorer: Menueeintrag nur mit eigenen Werten, `prompt` mit
Default; Inspektor: Register an der Definition (`content/variant-register`, Textfeld = Name
ohne Token-Parsing, × = loeschen). Tests: Editor +5, Menue erweitert, Browser-Rundlauf
(Screenshot `15-komponente-variante-anlegen.png`). Zahlen: gesamt **1399 gruen / 2
uebersprungen / 153 Dateien, EXIT 0** (`.scratch/testlauf-21-09-varianten-editor.log`; die
Differenz zum Vorlauf enthaelt Fremdstrang-Tests der Bildgenerierung), typecheck 0, lint 0.
Grenze: kuratierte Sections tragen ihre Props nicht im Widget-Katalog — dort kommen
Overrides (und damit die Extraktion) weiter ueber `apply_mutations`/MCP.

**Entscheidung (21.09.): Sections-Migration vertagt.** Nutzerentscheidung: Die Migration der
27 kuratierten Sections zu Visual Components samt E2-Cutover (Plan: 2-3 Wochen) wird vertagt
und als eigenes Projekt geplant. Stand bleibt der Parallelbetrieb: VC-Mechanik vollstaendig
(Kern, Overrides, Versionen, Varianten, Styles je Instanz, MCP), kuratierte Sections rendern
weiter ihre React-Komponenten, die Widget-Primitive bleiben der zweite bakebare Pfad. Bewusst
offen: Sections als VCs, Multi-Widget-VCs, M6-Rest.

**Ticket 19 M6 Scrub (21.09., umgesetzt): Scrub-Regler im Live-Modus.** Der Live-Modus zeigt
die echte Seite mit der Release-Runtime; ein Regler im Fuss (`input[data-action="scrub"]`)
faehrt ihre Scroll-Position an (ScrollTrigger reagiert auf das Scroll-Event), manuelles
Scrollen fuehrt ihn zurueck; im Design ist er aus. Mathematik pur in
`editor/src/canvas/scrub.ts` (`scrubOffset`/`scrubProgress`), Scroll-Listener je Frame in
`bindFrame`, `dom.ts` kennt `documentElement`/`scrollHeight`/`clientHeight` (optional). Tests:
`scrub.test.ts` +2, Browser-Rundlauf (100 % -> scrollTop > 0, Rueckweg, Design disabled).
Zahlen: gesamt **1386 gruen / 2 uebersprungen / 152 Dateien, EXIT 0**
(`.scratch/testlauf-21-09-m6scrub.log`), typecheck 0, lint 0. M6-Rest (freie Timeline,
Page Transitions, 3D, Motion an VCs) bleibt bewusst offen.

**Varianten (21.09., umgesetzt): kombinierbare Property-Sets.** Entscheidung (Nutzer): die
Definition erklaert benannte Varianten (je ein Props-Overlay auf ihre Teile), die Instanz
aktiviert beliebig viele gleichzeitig — keine Achsen-Matrix. Modell (`section-sdk`):
`definitionVariants`/`instanceVariants`/`activeVariantProps`/`unknownVariants`,
`ComponentDefinition.variants`; der Inliner merged die aktiven Overlays vor den
Instanz-Overrides (Variant-Swap behaelt sie, Part-Id-Adressierung; Patch auf verschachtelter
Instanz = Swap). Canvas: Patch in der Copy-CssNode. Inspektor: Gruppe „Varianten" mit Switches
(`setComponentVariants`, Definition-Reihenfolge, unbekannte Namen abgelehnt). MCP:
`list_components`/`get_component` zeigen Varianten, neues Tool `set_component_variant`;
Registry `structural.ts` kennt `variants`; Skills aktualisiert. Tests: section-sdk +5,
Editor +3, Engine +1, MCP-Workflow erweitert, Browser-Rundlauf (Screenshot
`14-komponente-variante.png`). Zahlen: gesamt **1384 gruen / 2 uebersprungen / 151 Dateien,
EXIT 0** (`.scratch/testlauf-21-09-varianten.log`), typecheck 0, lint 0. Grenze: Varianten
anlegen laeuft ueber `apply_mutations` (Agenten-Weg), der Editor aktiviert nur.

**Publish-Versionen site-weit (21.09., umgesetzt): Drift blockiert das Release.** Entscheidung
(Nutzer): Der Pin wird ein Vertrag — der Release-Publish bricht ab, solange eine Instanz eine
aeltere Definitionsversion pinnt (site-weit ueber alle Seiten); kein stiller Fallback auf die
neuere Definition. `checkComponentDrift(pages, severity)` (`engine/src/checks.ts`) laeuft ueber
`componentDrift` (section-sdk): publish hart (422 `guardrail`, Meldung mit Instanz/Pin/Version
und dem Weg `update_component_instances`), submit weich. `rebakeActiveRelease` bleibt bewusst
unberuehrt (Content-Pfad). Tests: `guardrails.test.ts` +1, `lifecycle.test.ts` +1 (422 → Update
→ 201). Zahlen: gesamt **1375 gruen / 2 uebersprungen / 151 Dateien, EXIT 0**
(`.scratch/testlauf-21-09-t04publish.log`), typecheck 0, lint 0.

**Ticket 04 Scheibe 3 (21.09., umgesetzt): Styles je Instanz + Geraetestufen fuer Overrides.**
Der Override der Instanz ist jetzt ein echter Stil-Schreibvorgang: eine scoped Rule auf der
Instanz folgt ihrer Root-Kopie, und Override-Props tragen Geraetestufen.

- **Inliner (`section-sdk/src/components.ts`):** `nodeIdMap.set(instance.id, copyId)` +
  `copies.set(instance.id, [copyId])`; die Klassen der Instanz wandern auf die Root-Kopie
  (sonst matcht keine Klassenregel am gerenderten Element).
- **Canvas (`editor/canvas/rules.ts` `withComponentCopies`):** Override-Beutel wird in die
  Copy-CssNode gemergt (`editorOverrides` + `origins`), scoped Rules je Kopie mit neuem
  Namen/Selektor dupliziert (`scopeNameFor`/`scopeSelectorFor`), Original entfaellt bei
  Kopien — dieselbe Ersetzung wie das Bake-Remap.
- **Geraetestufen (`editor/inspector/model.ts` + `inspector.ts`):** `markOverride` geraete-
  bewusst (`deviceKey`, `resolveDeviceValue` je Breakpoint, `overrideDevices` aus Suffix-Keys);
  Commit/Clear via `deviceKey(key, breakpoint)`; Geraetepunkte auch fuer Override-Felder.
- **Compiler:** `STRUCTURAL_PROP_KEYS` in `widget-engine/legacy.ts`, vom offenen CSS-Pass
  ausgeschlossen (kein `component-id:` im Stylesheet); Store nutzt dieselbe Liste.
- **Tests:** section-sdk +1 (Instanz→Root-Kopie + Klassen), Engine +1 (idMap-Eintrag),
  Editor-Rules +1 (Rule + Tablet-Override auf der Kopie), Inspector +1 (Geraetestufen).
  **Zahlen:** fokussiert 399/28, gesamt 1372 gruen / 2 uebersprungen / 151 Dateien (ein
  bekannter Ephemeral-Port-Flake in `editor-browser`, in Isolation gruen), typecheck 0, lint 0.

**Ticket 05 Scheibe 1 (21.09., umgesetzt): SSE-Kanal, Live-Mitverfolgung, Bau-Protokoll.**

- **Engine (`engine/src/events.ts`):** Prozess-Bus `EngineEvents` (`publish`/`subscribe`),
  `openStream(res, siteId)` (Site-Filter, `retry: 3000`, 15-s-Heartbeat, Cleanup bei
  `res`-`close`); `RouteResult.stream` + Dispatcher hält die Verbindung offen; Route
  `GET /api/events?site=…` (read; unbekannte Site = 404). Publish-Punkte: `draft.changed`
  (nach erfolgreichem Persist, mit Knoten-Ids/Aktion/Akteur), `page.created`, `asset.uploaded`,
  `release.published`; `Engine.events` liegt am Engine-Objekt.
- **Programm (`app/public/app.js`):** EventSource in der Canvas-Ansicht; fremde Änderungen laden
  die Seite per Store-Patch nach (`session.replaceDocument`), blitzen die Knoten auf und
  schreiben ins Bau-Protokoll (Akteur, Aktion, Uhrzeit); eigene Schreibvorgänge (Programm-Token)
  werden ignoriert, offene lokale Änderungen blockieren mit Hinweis; `pagehide` schließt.
- **Editor:** `markers.flash` (Ringe wie die Auswahl, Pool je Blatt, späte Nachzeichnung nach dem
  React-Commit), `canvas.flashNodes` löst Instanz-/Part-Ids über die Copy-Map in alle sichtbaren
  Kopien auf; Styles `senify-flash` (1200 ms).
- **Proxy (`app/src/server.ts`):** Upstream wird beendet, wenn der Client geht (sonst halten
  SSE-Verbindung und Shutdown ewig).
- **Tests:** `engine/test/events.test.ts` +3; `canvas-browser.test.ts` (Blitz direkt),
  `canvas-view-browser.test.ts` (Rundlauf mit Agenten-Token, Protokoll, Ringe; Screenshot
  `11-live-follow.png`).
- **Zahlen:** `pnpm test` **1362 grün / 2 übersprungen / 151 Dateien** (Log
  `.scratch/testlauf-21-09-t05s1.log`; ein Lauf zuvor hatte 4 Parallel-Flakes, in Isolation grün),
  typecheck 0, lint in den eigenen Bereichen 0.
- **Offen (Ticket 05 Rest):** Vorschau-Follow, Agent-Preview-Modus, Performance-Budget.

**Dublette `divider`/`embed` aufgeloest (21.09., Cutover-Vorbereitung).** Die zwei Namen
leben bewusst in beiden Vokabularen (laufende Section + Katalog-Primitive). Die Auflösung
ist die Zwillings-Bruecke: `SECTION_PRIMITIVE_TWINS`/`isSectionPrimitiveTwin` (`legacy.ts`)
pinnen die Liste, `sectionTwinControls` (`catalog.ts`) gibt Editor und MCP die
**Section-Props** als Bedienoberflaeche (divider: `spacing`-Enum; embed: `url`/`aspect`/
`title`), `sectionToPrimitiveProps` (`mapping.ts`) ist die Cutover-Migration (Enum → px,
Variante → style/provider; Test pinnt jeden Wert). Der Store validiert Zwillinge gegen die
Section-Flaeche (`requirePrimitive` in `operations.ts`), der Inspektor zeigt die
Section-Controls, MCP `list_widgets`/`get_widget` tragen `sectionTwin` + die Section-Controls.
Damit ist die Section bis zum Paritaets-Tor die Wahrheit und der Cutover ein
namensgleicher, migrationsgesicherter Wechsel. Tests: `mapping.test.ts` +4, Editor-Inspektor
+1. Zahlen: 1163 gruen / 2 uebersprungen / 106 Dateien (nur die betroffenen Pakete),
typecheck 0.

**Paritaets-Tor als CI-Blocker scharf geschaltet (21.09.).** `pnpm verify:parity`
(`scripts/verify-parity.mjs`) fuehrt den Release-Cutover-Test mit
`SENIFY_REQUIRE_BROWSER=1` aus: fehlt der Browser, faellt das Tor rot statt zu
ueberspringen (`browserSkip` in `packages/app/test/support.ts`, klare Meldung im
Test). Der Lauf startet ueber `pnpm exec vitest`, weil der Astro-Bake
`tailwindcss` nur mit den pnpm-Modulpfaden aus dem Stage-Verzeichnis aufloest
(ein direkter `node vitest.mjs`-Start war rot — Fund dieser Runde). CI:
`.github/workflows/verify.yml` (install, chromium, `pnpm verify`,
`pnpm verify:parity`). README + HANDOFF §7. Beleg: Gate-Lauf gruen (26,6 s,
Kopf-Diff 0, Sektion 0,00088), Fehlpfad rot mit klarer Meldung (4,8 s,
`PLAYWRIGHT_BROWSERS_PATH` leer).

**Ticket 05 Scheibe 2 (21.09., umgesetzt): Vorschau-Follow, Agent-Vorschau, Leistungsbudget.**

- **Punkt 4 (Vorschau-Follow):** Live-Modus baut bei Store-Wechsel die Frames neu
  (`rebuildFrames` statt Patch) — echte Seite + frische Runtime; `pendingFlash` wartet auf den
  frischen Frame; Marker-Paint auch live (Viewport aus echter Frame-Groesse, Auswahl aus).
  Browser-Test beweist den Reload per Dokument-Marker + Banner + Ring
  (`12-live-vorschau-follow.png`).
- **Punkt 5 (Agent-Vorschau):** Schalter `canvas-follow` (Default an, `localStorage`);
  seitenuebergreifendes Folgen bei `draft.changed`, `page.created` zieht die Seitenliste nach und
  oeffnet die Seite (ohne offene Aenderungen); eigene Seitenwahl schaltet ab; SSE-Kanal wird beim
  Routenwechsel geschlossen (`activeLiveStream`). Test `13-agent-vorschau.png`.
- **Punkt 7 (Leistungsbudget):** `pruef-t05-performance.mjs` (echtes Canvas + Harness, CDP-Layout,
  rAF-Beobachter) und `pruef-t05-breakdown.mjs` (CPU-Profil). Fixes: Regeln einmal je Refresh,
  Annotationen in einem DOM-Durchlauf, `flushNextFrame()` (rAF-Split), React-Element-Cache,
  Nebenschienen einen Frame spaeter. **Ergebnis:** Paint 620-850 ms, Insert-Median 12-13 ms,
  p95 21-25 ms, ~2,3 Layouts je Insert, keine Konsolenfehler
  (`.scratch/refs/nick/perf/t05-performance.json`).

**Ticket 04 Scheibe 2 Teil 3 (21.09., umgesetzt): Versionen und Slot-Regeln -
Definition/Instanz-Drift, Regeln aus dem Baum, Editor-/MCP-Oberfläche.**

- **Modell (`section-sdk/src/components.ts`):** `ComponentSlotSpec` (`allowedTypes`, leer = alles;
  `max`, null = unbegrenzt) über `readSlotSpec` (malformed wird ignoriert);
  `ComponentDefinition.version` (`props.version`, Default 1); `instanceVersion` (`props.
  componentVersion`, Default 1) als **Pin** - kein Lookup-Schlüssel, alte Versionen werden nicht
  gespeichert (der Release-Snapshot friert die Seite); `componentDrift(tree)` listet abweichende
  Instanzen; `collectSlots` liefert die Specs.
- **Registry (`registry/src/sections/structural.ts`):** Definition `version`, Instanz
  `componentVersion`, Slot `allowedTypes` (list) + `max` (number).
- **Engine (`engine/src/mutations/apply.ts`):** `slotRulesFor`/`componentSlotSpecs` lesen die
  Regeln aus dem Baum (WorkingTree, kein `componentDefinition`-Lookup), `requireSlotRules`
  ersetzt `requireSlotSpec`; `assertSlotPlacement`, `applySetSlotContent` und
  `applyCreateCollectionEntry` lehnen unbekannten Slot, nicht erlaubten Typ und Überfüllung ab.
  `engine/test/components.test.ts` +1 (leeren → Regeln setzen → füllen → max/divider/unbekannter
  Slot), 7 grün.
- **Editor:** `editorSlotSpecs` (`state/document.ts`) ist die einzige Auflösung (Instanz →
  Definitions-Slots, sonst Katalog); `operations.ts` (`targetList`, `applySetSlotContent`,
  `STRUCTURAL_PROPS`, `assertKnownProp`-Ausnahme), `canvas/insert.ts` (dokumentbasierte
  Slot-Ablehnung, Instanz als Slot-Container), `canvas/dnd.ts` (`takesChildren`),
  `state/consistency.ts` (slot-unknown/-not-allowed/-full; fehlende Definition toleriert).
  Neue Ops in `state/components.ts`: `definitionVersionOf`, `instanceVersionOf`,
  `componentDriftOf`/`componentDriftIn`, `bumpComponentVersion`, `updateComponentInstances`
  (ein Batch = ein Undo); `createComponent` setzt v1/Pin v1, `instantiateComponent` pinnt die
  aktuelle Version, `insertSlot` nimmt `allowedTypes`/`max` entgegen.
- **UI:** Drift-Badge `v1` am Instanz-Knoten (`data-role="drift"`, title nennt beide Versionen),
  Menü an der Definition um `Version erhöhen` (v1 → v2) und - nur bei Drift -
  `Instanzen aktualisieren` erweitert; der Komponenten-Tab zeigt `v2 · 2 Instanzen · 1 alt`.
  Browser-Rundlauf erweitert (bump → Badge sichtbar → update → Badge weg), Screenshot
  `10-komponente-version.png`.
- **MCP:** `list_components` + `version`/`outdated`, `get_component` + `version`/`drift` und je
  Instanz `componentVersion`/`outdated`; zwei neue Tools `bump_component_version` und
  `update_component_instances` (ohne Drift `updated: 0` ohne Schreibzugriff); SERVER_INSTRUCTIONS
  und Skills nennen den Weg.
- **Tests:** section-sdk 15, engine components 7, editor components 10, explorer 14, mcp 18,
  Browser-Rundlauf grün.
- **Zahlen:** `pnpm test` **1352 grün / 2 übersprungen / 149 Dateien** (Log
  `.scratch/testlauf-21-09-m4s2t4.log`), typecheck 0, lint in den eigenen Bereichen 0.
- **Offen (Scheibe 2 Rest):** Publish-Versionen site-weit, Varianten, Styles je Instanz,
  Geräteebenen für Overrides, Sections-Migration.


- **Drei Tools in `mcp/src/tools.ts`** (rein lesend bzw. über den bestehenden Mutations-Pfad):
  `list_components(pageId)` (Definitionen mit Name, Part-Anzahl, Slot-Namen, Instanz-Zähler und
  Instanz-Ids), `get_component(pageId, componentId)` (Parts mit Id/Typ/aktuellen Props als
  Override-Schlüssel, Slot-Platzhalter, Instanzen mit Beuteln), `set_component_override(...)`
  (merged wie die Editor-Op, `value: null` löscht, leerer Beutel wird entfernt, Definition
  bleibt unberührt). Helfer `walkComponent`/`readOverrideBag`/`componentInstanceList` spiegeln
  die Editor-Logik (`componentParts`/`editorOverrides`), ohne die Editor-Pakete zu importieren.
- **Guardrails:** unbekannte Instanz/Definition/Part (Vorschlag listet die gültigen Part-Ids),
  fehlender `value`; der Engine-Vertrag (`updateNodeProps`, `overrides` als `json`-Control)
  bleibt die Prüfinstanz.
- **Skills/Leitlinie:** `packages/skills/skills/router.md` + `workflow.md` nennen den
  Komponenten-Weg, `SERVER_INSTRUCTIONS` eine Zeile dazu.
- **Tests:** `mcp/test/workflow.test.ts` +1 (Aufbau über `apply_mutations` mit expliziten Ids,
  list/get, Override setzen/löschen, `get_nodes` belegt den entfernten Beutel, drei
  Guardrail-Fälle); Katalog-Test um die drei Namen erweitert.
- **Zahlen:** `pnpm test` **1326 grün / 2 übersprungen / 147 Dateien** (Log
  `.scratch/testlauf-21-09-m4s2t3.log`, ohne Flake), typecheck 0, lint in den eigenen Bereichen 0.

**Ticket 04 Scheibe 2 Teil 2 (21.09., umgesetzt): Komponenten im Editor bedienbar -
Komponenten-Tab, Kontextmenü, Namen im Baum.**

- **Modelle rein (`editor/src/explorer.ts`):** `editorNodeLabel` löst die reservierten Typen auf
  (Definition `Komponente · name`, Instanz liest den Namen der Definition - Fallback ist die
  `componentId`, Slot `Slot · name`); `buildComponentList` liefert Definitionen mit
  Instanz-Zähler; `editorMenuItems` liefert das Menü je Knotenart mit aufgelösten
  Zustandslabels (`Ausblenden`/`Einblenden`) plus `component-create` (gewöhnlicher Knoten),
  `component-detach` (Instanz), `component-insert` (Definition) - Wurzel und Slot ohne.
- **Panel (`explorer/panel.ts`):** das Menü kommt aus dem Modell; die drei Aktionen laufen über
  `createComponent`/`detachComponent`/`instantiateComponent`, Fehler werden als Statusmeldung
  berichtet statt still verloren. Nach dem Anlegen ist die **Definition** ausgewählt (F2
  benennt sie um), nach Auflösen/Einfügen der neue Knoten. `textKeyOf` kennt `name` bei
  Definition und Slot; eine Instanz meldet, dass sie den Namen ihrer Komponente trägt.
- **Shell (`packages/app/public/app.js`):** vierter Explorer-Tab `Komponenten` (Liste mit
  Instanz-Zähler); ein Klick fügt eine Instanz hinter der Auswahl ein und wählt sie.
- **Tests:** `editor/test/explorer.test.ts` +3 (Labels inkl. Stale-Fallback, Liste/Zähler,
  Menü je Knotenart + Zustandslabels); `app/test/canvas-view-browser.test.ts` erweitert:
  Kontextmenü legt die Definition an (Hero bleibt 1x im Canvas), F2 benennt sie in `karte` um,
  der Tab listet `1 Instanz`, der Klick fügt die zweite Instanz ein (Hero 2x), das Kontextmenü
  löst sie wieder in einen echten Teilbaum auf (Definition bleibt mit einer Instanz).
  Screenshots `08-komponente-angelegt.png` / `09-komponenten-tab.png`.
- **Zahlen:** `pnpm test` **1325 grün / 2 übersprungen / 147 Dateien** (Log
  `.scratch/testlauf-21-09-m4s2t2.log`, diesmal ohne Flake), typecheck 0, lint in den eigenen
  Bereichen 0.
- **Offen (Scheibe 2 Rest):** Publish-Versionen, Slot-Restriktionen, Varianten, Styles je
  Instanz, Geräteebenen für Overrides, MCP-Fassade, Sections-Migration.

**Ticket 04 Scheibe 2 Teil 1 (20.09., umgesetzt): Komponenten speicherbar, Bake-Rekey,
Multi-Instanz-Remap, Overrides (Modell/Editor/Inspektor/Canvas).**

- **Fund vor dem Bau (die Scheibe 1 war nicht speicherbar):** Die Engine kannte die
  reservierten Typen nicht — `createComponent` + Speichern endete in
  `Unknown section type "__component"`. Dazu verlor der Bake jede Definition, die im
  gespleißten Baum lag (`componentId` zeigt auf die Draft-Id, der Splice rekeyt nur Knoten).
- **Engine-Aufnahme:** `Registry.registerStructural` (bekannt für `has`/`get`, nicht in
  `list()`), `allowedChildren: "any"` + `PropControl: "json"` in der section-sdk,
  `registry/src/sections/structural.ts` (drei Definitionen), `apply.ts`: strukturelle Kinder
  überall (außer im Slot), offene Container in Kind- und Slot-Prüfung, Wrap behandelt `"any"`.
- **Bake:** `remapComponentRefs` (copy-on-write) schreibt `componentId` vor dem Inlining;
  `composePageTree`-`idMap` trägt **Listen** (`Map<NodeId, NodeId[]>`), Kopien werden
  expandiert; `bake.ts`/`renderer` reichen `Record<string, string[]>` durch,
  `remapScopedRules` emittiert je Kopie einen Selektor.
- **Overrides:** Instanz-Prop `overrides` (`{ partId: { key: Wert } }`, Part = Knoten-Id der
  Definition); `inlineComponents` mischt in die Kopie (auch verschachtelte Instanzen,
  Instanz-Swap über `componentId`), `componentParts`/`staleOverrides` als Register/Prüfung.
  Editor: `setComponentOverride` (Prune leerer Beutel), `detachComponent` materialisiert
  Overrides (zwei Batches, ein Coalesce-Key = ein Undo), `componentPartsIn`/`overridesOf`.
  Inspektor: Gruppen je Teil mit `commit.kind: "override"` (Basis = Definitionswert, keine
  Gerätepunkte); Canvas: `origins` (Kopie → Instanz) macht den Klick in eine Instanz zur
  Instanz-Auswahl.
- **Tests:** section-sdk 13 (+5 Overrides/Swap/Parts/stale) + Registry +2,
  engine/test/components.test.ts (6, neu: HTTP-Speicherpfad, Splice-Rekey, zwei Instanzen,
  Overrides), renderer +1 (Kopie-Selektoren), editor 8 + Inspektor 16 + Canvas 8.
- **Zahlen:** `pnpm test` **1322 grün / 2 übersprungen / 147 Dateien** (Log `.scratch/testlauf-20-09-m4s2t1.log`; ein roter Lauf = bekannter Browser-Flake, in Isolation grün), typecheck 0,
  lint (eigene Bereiche) 0. Code committet als `7f7ccd6`, Doku als `2c64aaf`.
- **Offen (Scheibe 2 Rest):** Publish-Versionen, Slot-Restriktionen, Varianten, Styles je
  Instanz, Geräteebenen für Overrides, Komponenten-Tab/Kontextmenü, MCP-Fassade,
  Sections-Migration.

**Ticket 04 Scheibe 1 (20.09., umgesetzt): Component-Kern — Definition,
Instanz, Slots, Zyklus-Schutz, Inlining für Canvas und Bake, Editor-Ops.**

- **Modell rein (`section-sdk/src/components.ts`):** Komponenten leben im Baum
  (reservierte Typen `__component`, `__component_slot`, `__component_instance`),
  `inlineComponents` als eine Ableitung für beide Renderpfade (deterministische Ids,
  `nodeIdMap`/`copies`, Stub statt Absturz, `wouldCreateCycle`/`unfilledSlots`).
- **Canvas:** Adapter inlined vor dem Rendern; die Frame-Regeln emittieren die
  Knotenregeln der Definition je Kopie (kein Styling-Verlust, keine Drift zum Bake).
- **Bake:** `composePageTree` inlined nach der Komposition und **blockiert mit Fehler**
  bei Problemen; die Kopien wandern in die Draft→komponiert-Map (Ticket 22).
- **Editor-Ops:** `createComponent`/`insertSlot`/`instantiateComponent`/`detachComponent`
  als `applyBatch` (ein Undo, bestehender Speicherpfad).
- **Zahlen:** `pnpm test` **1301 grün / 2 übersprungen / 146 Dateien** (Log
  `.scratch/testlauf-20-09-runde3-1.log`; der eine rote Lauf war der bekannte
  Ephemeral-Port-Flake in `engine/test/style-rules.test.ts`, in Isolation 11/11 grün),
  typecheck 0, build 0, lint (eigene Bereiche) 0.
- **Offen (Scheibe 2):** Overrides/Varianten/Publish-Versionen, Multi-Instanz-Remap,
  Slot-Restriktionen, Editor-UI (Komponenten-Tab), MCP/Skills, Sections-Migration.

**Runde 2 (20.09., umgesetzt): Tickets 16, 02 Punkte 3–7, 03 Punkte
1/2/4/5/7, 06/ADR-0007 — alle offenen Punkte aus §9 in einem Durchgang.**

- **Ticket 16 — Marker-Overlay im Portal.** `canvas/overlay.ts` (neu) mit reiner Geometrie
  (`overlayRect`, `intersectsViewport`, `isOccluded`, `badgeTop`, 20-ms-Drossel) und
  Controller; Layer je Blatt über der Bühne, Verdeckungsprobe, Alt-Hover-Ladder
  (`parent`); `CANVAS_CHROME_CSS` nur noch Cursor; neuer Token `--ed-selection-edge`
  (Doppelkante) in Tokens/Skin/Tests/Vorschau. Tests: `overlay.test.ts` (neu),
  `rules.test.ts`, Browser-Test.
- **Ticket 02 P4–P7.** Gerätepunkte an jedem Control (an/aus/Reset); Zustandszeile mit
  Werten in der scoped Rule + erzwungener Canvas-Vorschau; Token-Picker für
  spacing/radius/shadow/type (ein Panel zur Zeit — vorher öffnete ein gemeinsames Flag
  alle); eigene Property-Zeile + „Eigene Properties" (offene Fläche, E2-Grenze auf
  Sektionen); MCP `list_widgets`/`get_widget`/`set_styles`/`create_style_rule` mit
  Style-Tabelle als Guardrail und der Engine-Token-Fence. **Transport-Fund:**
  `transportRule` schickte die `scope` nicht — Create will `nodeId`, PATCH behält den
  Scope; behoben, Test in `persist.test.ts`.
- **Ticket 03 P1/P2/P4/P5/P7.** Inline-Text (contenteditable plaintext-only,
  Coalesce-Burst, Escape verbraucht den Eintrag; Plus-Punkte kurzer Knoten lagen über dem
  Text — jetzt außerhalb); Verlauf (`restoreTo`, Blatt mit Zeit/Label/Future, Redo-Future
  fällt bei neuem Apply); Keyboard (`shortcut()`-Schicht, Tab-Block, Alt-Ladder,
  `defaultPrevented`-Vertrag); `applyBatch` + Clipboard (Copy/Paste inkl. Scoped-Rules,
  Wrap als Batch); Explorer-Drag mit Zyklus-Schutz + Site-/Media-Tabs (`options.tabs`,
  `insert` mit `props`); Vorlagen/Komponenten bleiben O14.
- **Ticket 06 — ADR-0007 (Puck-Abschied).** `adapter.ts`/`puck.ts` + Puck-Tests +
  optionale Peer-Dependency entfernt (Lockfile aktualisiert); keine Laufzeit-Importe
  existierten.
- **Zahlen:** `pnpm test` **1289 grün / 2 übersprungen / 144 Dateien**, typecheck 0,
  build 0, lint (eigene Bereiche) 0; erster Gesamtlauf mit zwei Browser-Flakes
  (`submissions-browser.test.ts`, fremder Strang), Wiederholungslauf vollständig grün.
  Logs `.scratch/testlauf-20-09-runde2-*.log`.

**M4 Stufe 1 + Ticket 03 Punkt 6 (20.09., umgesetzt): Live-Modus zeigt die echte Seite;
Design/Live-Toggle, Zoom-Footer, Frame-Labels, Dimming.** Code committet als `a4ec1c4`,
Doku als `ab0abdc`.

- **Ein Injektionsmodul für beide Editorpfade:** `editor/src/motion-inject.ts` (neu) baut
  den Runtime-Vertrag (`motion-data` v2, self-hosted Vendor, `renderPageScript`, Lenis nach
  Site-Profil) — `mount.ts` (v1) und `canvas.ts` (Umbau) rufen dieselbe Quelle; der
  Marker-Guard (`script[data-senify-motion], #motion-data`) verhindert Doppel-Injektion.
  Der v1-Editor verliert dadurch ~60 Zeilen eigene Injektionslogik, das Verhalten bleibt.
- **Live-Spec im Canvas:** `canvas/device.ts` — `canvasFrames(zoom, { mode, breakpoint })`
  liefert im Live-Modus **einen** Frame (aktiver Breakpoint, `width/height null`, `scale 1`,
  `mediaMaxWidth` des Geräts, Label „Live"); Design bleibt die drei Blätter.
  `CanvasFrameSpec` trägt `mode` und nullable Maße.
- **Chrome aus im Live:** `canvas/rules.ts` — `chrome: false` lässt Marker, Zeiger-Cursor
  und Forced-State weg; Base + `@layer user-authored` bleiben (die echte Seite).
- **Canvas-Chrome (Ticket 03 Punkt 6):** Mode-Gruppe Design/Live in der Topbar (aria-pressed),
  Zoom + Meldung in einen **Footer** verschoben, Zoom-Label ist der Reset auf 100 %,
  Strg/Cmd+0 resettet ebenfalls; Frame-Labels (Name + Breite, im skalierten Blatt
  gegenskaliert); inaktive Blätter dimmen (`data-active`, Tooltip „Zum Bearbeiten
  aktivieren"), ein Klick in ein Blatt aktiviert seinen Breakpoint (Session-`device` folgt).
  Live: `rebuildFrames()` (frischer Frame), Full-Stage-Layout, nativer Scroll, Klicks
  behalten ihr Seitenverhalten, `setMode`/`setBreakpoint` in der Instanz-API,
  `CanvasState` + `mode`/`breakpoint`.
- **View-State:** `state/ui-state.ts` + `state/session.ts` — `mode` (design/live) wird
  persistiert und restauriert; `app.js` verdrahtet `mode`/`breakpoint`/`profile` und die
  Session als eine Quelle (Inspektor-Gerät ⇄ Canvas-Breakpoint); der Spotlight-Befehl
  `set-mode` ruft jetzt `canvas.setMode` statt des Platzhalters.
- **Zwei Funde:** (1) Der Disabled-Selektor in der Skin war als Komma-Selektor nur zur
  Hälfte gescoped (`canvas-skin.test.ts` fing es — jetzt zwei Einzelregeln). (2) Der
  Paper-Regex des Skin-Tests matchte `__frame-label` als Blatt; Regex auf Wortgrenze
  präzisiert. (3) Browser-Test: Der Koordinaten-Klick über die iframe-Grenze in das
  Tablet-Blatt kommt nicht an (bekannte Playwright-Falle, HANDOFF §8) — der Test klickt
  programmatisch und prüft denselben Handler.
- **Tests:** `canvas/device.test.ts` (+2 Live), `canvas/rules.test.ts` (+1 Live-Chrome),
  `state/session.test.ts` (+1 mode, 2 angepasst), `ui/canvas-skin.test.ts` (Regex),
  `app/test/canvas-view-browser.test.ts` erweitert (Labels/Dimming + Tablet-Aktivierung,
  Zoom-Reset per Strg+0, Live: ein Frame, `window.gsap` + `motion-data` + Runtime im Frame,
  zurück zu drei Blättern).
- **Zahlen:** `pnpm test` **1292 grün / 2 übersprungen / 144 Dateien** (Log
  `.scratch/testlauf-20-09-m4s1-2.log`), typecheck 0, build 0. **Lint:** meine Bereiche 0
  (`eslint packages/editor packages/app packages/tokens`), im Gesamtlauf ein fremder
  Ein-Zeilen-Fehler (`packages/engine/test/redesign-package.test.ts`: `plainId` unbenutzt)
  aus dem parallelen Strang, der im selben Baum an Referenz-Bibliothek/Redesign arbeitet.
  Erster Gesamtlauf zusätzlich mit docs-portal-Build-Kollision (`dist`), in Isolation 4/4
  grün — Umgebungs-Race des Parallelstrangs, kein Inhaltsfehler.

**Welle 1, Teil 4 (20.09., umgesetzt): Die Pakete #5–#10 aus §9 — Inspektor, EditorSession,
Chrome, DnD, Release-Cutover, E16 P0 + E12 Scheibe 1.** Code committet als `55593f1`.

- **#5 Ticket 02 Scheibe 1 — Inspektor-Grundstock.** `editor/src/inspector/model.ts`
  (`buildInspector`, `INSPECTOR_TABS` Content/Style/Interactions/Advanced, Feld-Familie
  Zahl/Slider/Switch/Select/Farbe/Dimensions/Gaps, Token↔Literal mit Warnung, Motion-Felder,
  Advanced-Gruppen, Helfer `numberPart`/`unitOfValue`/`tokenRefOf`/`motionSpecFrom`),
  `inspector.ts` (`createInspector`, Rendering je Feld-Familie, `tab()/setTab()`,
  `breakpoint()`, `onTabChange/onBreakpointChange`), `inspector/styles.ts`; Host in der
  Canvas-Ansicht (app.js). Tests `editor/test/inspector.test.ts` (12) + Browser-Test
  (Tabs + `background` setzen → Canvas und Save-Route). Zwei Funde: ein Override entsteht
  nur auf Tablet/Mobile (Desktop ist der Basiswert), und Katalog-Primitives sind über die
  v1-Bridge nicht speicherbar (E2-Grenze).
- **#6 E5 Scheibe 1 — EditorSession.** `state/session.ts` (EditorSession = Store +
  Save-Pipeline + UI-State), `state/ui-state.ts` (Tab/Gerät/Zoom über localStorage,
  `EDITOR_TAB_IDS`, `SessionStorage`); die Canvas-Ansicht läuft komplett über die Session,
  Auswahl wird über die Store-Subscription persistiert; `canvas.ts` mit `onState/stateOf`;
  `?view=editor` bleibt Deep-Link (Strangler), Default ist die Canvas-Ansicht; Shell-Cmd+K
  weicht auf der Editor-Seite. Tests `session.test.ts` (7).
- **#7 Ticket 03 Scheibe 1 — Explorer + Spotlight.** `explorer.ts` (Layer-Liste, Label/
  Snippet), `explorer/panel.ts` (Roving-Tabindex, Pfeile/Home/End/Enter, F2-Rename über die
  Text-Prop, Delete, Shift+F10-Kontextmenü Duplizieren/Verschieben/Hide/Lock/Delete,
  Fokus-Rückgabe, ensureVisible), `explorer/styles.ts`; `spotlight.ts` +
  `spotlight/dialog.ts` (role=dialog/listbox, aria-activedescendant, Fokus-Rückgabe,
  Kommando `insert-primitive`), Ctrl+K in app.js; `dom.ts` um `activeElement`/
  `scrollIntoView`; `browser-entry.ts` exportiert `getPrimitive`/`primitiveTypes`. Tests
  `explorer.test.ts` (10) + Browser-Test. Fixes: NodeList→`Array.from`, Menü-Escape über
  einen Document-Listener, Plus-Punkte nur bei sichtbarem Overlay.
- **#8 Ticket 12 — DnD, Plus-Punkte, Einfügelinie.** `canvas/dnd.ts` (pur:
  `dropPositionFor`, `resolveInsertDrop`, `resolveMoveDrop`, `resolveDrop`, `isContainer`),
  `canvas/dnd-dom.ts` (`createDropController`: Katalog-Chips, Drop-Linie in `--ed-snap-line`
  bzw. Danger, Plus-Punkte, Knoten-Umsortierung mit `dragCoalesceKey` — ein Zug = ein
  Undo-Eintrag), `insert.ts` mit Position `before|after|into`. **Fund + Fix:** `moveNode`
  in derselben Liste indiziert nach dem Entfernen — der Editor normalisiert
  (`raw > located.index ? raw - 1 : raw`), Regressionstest. Tests `canvas/dnd.test.ts` (12)
  + Browser-Test (Plus-Punkt-Einfügen, Umsortieren `divider, divider, hero`).
- **#9 Ticket 17 — Releases-Cutover.** `engine/src/release-checks.ts` (O9-Vorhang auf dem
  echten Bake: lokale Verweise, Stylesheet, Heading-Ordnung), `publishRelease` umgebaut
  (Preflight-Bake ins Temp-Verzeichnis → Checks → Revisionen/Release → ein `rename` →
  aktivieren; Rollback stellt Theme + Drafts vor dem Bake zurück). Publish-Button
  `[data-action="canvas-publish"]` ruft die echte Route. **Funde + Fixes:** (1) `variant`
  fehlte im v2-`EditorNode` (jetzt durch alle Schichten gereicht); (2) Releases lieferten
  **keine Schriften** aus (Theme-`@font-face` ohne Dateien) — `renderer/assets/fonts/*.woff2`
  + `files`-Maps im Default-Theme + Font-Kopie im Bake + App-Route. Tests:
  `release-checks.test.ts` (9), `release-cutover-browser.test.ts` (Route-Publish,
  Revisionen, aktives Release, Release-Auslieferung, Paritäts-Tor Kopf 0 / Sektion 0,00088,
  zweiter Publish, Rollback). Das Tor läuft gegen das Release und ist über `pnpm test` Teil
  von `pnpm verify`; `widget-slice` bleibt auf `bakeSite` (Katalog-Primitives passen nicht
  durch die v1-Bridge, E2-Grenze), der Route-Pfad ist mit registrierten Sektionen belegt.
- **#10 E16 P0 + E12 Scheibe 1.** E16: `editor/src/ui/base.ts` (`editorBaseCss`:
  `color-scheme: dark`, Auswahl, Scrollbars, Antialiasing, `:active`, disabled 38 %,
  Reduced-Motion) in alle Editor-Wurzeln eingespeist, Focus-visible-Regeln ergänzt,
  Hex-Fallbacks entfernt; Test `ui/fremdfarben.test.ts` (5) + angepasste Token-Tests.
  E12: Tabelle `bake_jobs` (Claim/Lease 60 s, Dedup je Site mit Pfad-Merge, Backoff
  1→2→4 s, max. 3 Versuche, Lease-Ablauf = Crash-Recovery), `bake-worker.ts`
  (`runBakeJobOnce`, `startBakeWorker`), `rebakeActiveRelease` (Bake nach `.next`, Swap),
  Trigger in content/templates, Route `GET /api/sites/:siteId/bake-jobs`, Worker-Start/-Stop
  in `startProgram`. Tests `engine/test/bake-jobs.test.ts` (8, inkl. Integration).
- **Nachzug aus dem Gesamtlauf (3 rote Dateien, 13 Tests):** (1) Der O9-Hard-Check „erste
  Überschrift ist h1" blockierte `forms`/`submissions` (nur die Hero-Sektion rendert h1) —
  „Start unter h1" ist jetzt **soft** (`release-heading-start`), der Stufensprung bleibt
  hard. (2) Der Katalog-Streifen war 32,78 px hoch und schob den Canvas-Rahmen auf
  y=81,78 — halbe Pixel: Screenshot 1 px größer, Glyphen-Rasterisierung driftet; Chips
  28 px + 5 px Fuß (ganzzahlig), `widget-slice` wieder 0,57 % (309 px) gegen 48,8 %
  Gegenprobe. (3) `enqueueBakeJob` stempelte die echte Uhr, die Tests claimten mit festem
  `NOW` — Zeitbombe (seit 10:00Z rot): `now` ist jetzt injizierbar, der Reihenfolge-Test
  trennt die Sites um 500 ms (Tie-Break war die Zufalls-ID).
- **Zahlen:** `pnpm test` **1270 grün / 2 übersprungen / 141 Dateien**, typecheck 0, lint 0,
  build 0 (Log `.scratch/testlauf-20-09-welle1rest-4.log`; die Zwischenläufe -2/-3 mit 4 bzw.
  1 roten Dateien bleiben als Belege der Funde). Code committet als `55593f1`, die Doku
  folgt mit dem Doku-Commit.

**Welle 1, Teil 3 (19.09., umgesetzt): Ticket 18 Scheiben 2+3 — Idempotency-Keys und `authoredBy`-Fence.**

- **Scheibe 2 (Idempotency-Keys):** optionales Body-Feld `idempotencyKey` (1–200 Zeichen,
  `IdempotencyKeySchema` in `mutations/contract.ts`) auf `create_page`, `create_entry`,
  `upload-url` und `create_reference_collection`; neue Tabelle `idempotency_keys`
  (PK `(token_id, route, idempotency_key)`, `fingerprint`, `status`, `response jsonb`,
  `created_at`) in `db.ts`. Store: **Claim-first** — `claimIdempotencyKey` (INSERT, bei
  Unique-Verletzung lesen: fertig → Replay, frisch pending → `in_progress`, älter als 2 min →
  Übernahme, Fingerprint-Mismatch bei fertigem Eintrag → `mismatch`), `completeIdempotencyKey`,
  `releaseIdempotencyKey` (Fehlversuch verbrennt den Key nicht); TTL 24 h, Aufräumen beim Claim.
  `http.ts`: `withIdempotency(...)` mit SHA-256-Fingerprint über die kanonisierte Body-JSON
  (Schlüssel sortiert, Key-Feld ausgenommen); Replay trägt Header `idempotency-replayed: true`,
  Konflikte sind `conflict` mit `field: "idempotencyKey"`. MCP: `idempotencyKey` als Argument
  der vier Tools durchgereicht; `idempotentHint` bleibt `false` (ohne Key ist der Aufruf nicht
  idempotent — Annotation = Client-Versprechen, Key = Server-Garantie).
- **Scheibe 3 (`authoredBy`-Fence):** neues Modul `engine/src/style-fence.ts`
  (`themeColorTokens` = Rückwärtsindex der Theme-Farben, semantische Rollen vor Primitiven;
  `agentStyleViolations`; `rawCssViolations`; `styleRuleBags`). Store: `authoredBy` wird **aus
  dem Token abgeleitet** (agent → `agent`, sonst `user`), Body-Werte werden ignoriert; Updates
  **erhalten** die Provenienz (Agent-Umbau einer user-Regel erzeugt keine agent-Regel), der
  Audit-Eintrag trägt den echten Akteur. Agenten: Token-Zwang für Farb-Literale **nur wenn ein
  passendes Token existiert** (Vorschlag `{ $token: … }`), keine `ambient`-Regeln, kein `rawCss`,
  keine Selektor-Patches; Fence prüft nur die Patch-Bags, damit Alt-Werte einen unrelated Edit
  nicht blockieren. `rawCss`-Grenzen für alle Schreiber: max. 2.000 Zeichen, kein
  `url()`-Fremdhost (`@import`/Markup waren schon durch `isSafeRawCss` gesperrt); Scoped-Selektor
  ist strukturell der eigene Knoten-Anker (Test). `reorderStyleRule` markiert fremde Provenienz
  im Audit (`params.foreignAuthoredBy`).
- **Tests:** `engine/test/idempotency.test.ts` (12: Replay je Route, anderer Key/kein Key,
  Body-Mismatch, Token-/Routen-Scope, Release nach Fehler, in-progress + Stale-Übernahme,
  kanonisierte Schlüsselreihenfolge, Key-Form); `engine/test/agent-style-gate.test.ts` (9: Ablehnung + Durchlass je Regel,
  Provenienz aus Token, Patch-Fence, Audit-Marker, rawCss-Grenzen, Scoped-Anker);
  `mcp/test/workflow.test.ts` +1 (Durchreiche, gleiche Seite, Schema-Feld) und
  `engine/test/db-schema.test.ts` +1 (`jsonColumns` sieht `response`);
  `helpers.ts` mit `humanApi` (kind human) + `HUMAN_AUTHOR`; bestehende Tests auf die
  Token-Semantik gezogen (bake.test ambient → human, save-pipeline `authoredBy` → `user`).
- **Zahlen:** `pnpm test` **1210 grün / 2 übersprungen / 134 Dateien**, typecheck 0, lint 0
  (Log `.scratch/testlauf-19-09-ticket18s23.log`). Ticket 18 damit **vollständig**,
  committet als `824b9ba` (Welle-1-Teile 2+3).

**Welle 1, Teil 2 (19.09., umgesetzt): Ticket 18 Scheibe 1 — Author-Resolver.** Der Audit-Autor
kommt jetzt **immer** aus dem Token, nie aus dem Body (E3-Akzeptanz: „Ein direkter API-Call kann
kein `kind: human` auditieren"):

- **Token-`kind` (additiv):** `TokenKind = "human" | "agent"` in `types.ts`; DB-Spalte `kind` nur
  additiv per `ALTER TABLE … ADD COLUMN IF NOT EXISTS` mit Fail-closed-Default `'agent'`
  (Haus-Konvention wie `style_rules_json`); `ApiToken.kind`; `mapToken` validiert das Feld;
  `createToken({ kind })` mit Default `agent`; `updateTokenKind` (Selbstheilung); `whoami`
  liefert `kind`.
- **`resolveAuthor(auth)`** (`http.ts`): Identitaet (`id`/`label`) **immer** `auth.tokenName`, `kind`
  aus dem Token; **einmal pro Batch** aufgeloest (nicht pro Audit-Eintrag). **30** Aufrufstellen
  umgestellt (Mutations-Batch, Editor-Mutations-Bridge, Site-Update/Trash/Restore/Duplikat, Theme,
  4× Style-Rules, Release/Revision/Preview/Review-Aktionen, Entry-Trash/Restore/Purge/Publish/
  Unpublish/Version-Restore, Referenz-Analyze/Manual/Profil-Revision/Apply). `authenticate` reicht
  `record.kind` in `AuthInfo`.
- **Body-`author` ist Vorschlag:** alle 24 `author: AuthorSchema` in den Vertragsdateien
  (content/lifecycle/mutations/editor/references/site/templates) → `Type.Optional(AuthorSchema)`.
  Ein mitgeschickter Author wird weiter validiert (Closed Shape), aber nie auditiert.
- **Rollen:** `senify setup` erzeugt `kind: "agent"`; `senify tokens create` hat `--kind
  human|agent` (Default agent); der Programm-Token (Dashboard) ist `human` — `start.ts` heilt
  Bestandstoken **in-place** ueber `whoami.kind` + `store.updateTokenKind` (gleiches Secret, keine
  zweite „Programm"-Zeile); `tokens list` zeigt `kind=…`.
- **Tests:** `auth.test.ts` +2 (explizit `human`/ungueltiges `kind`; Audit-Kind aus Token trotz
  `agent`-Body) und whoami-Assertion; `mutations.test.ts` Test „derives the audit author from the
  token, never from the body" (gefaelschte `human`-Identitaet landet nicht im Audit; fehlender
  Body-Author bleibt 200); `server.test.ts` +1 (Selbstheilung eines `agent`-Programm-Tokens:
  whoami `human`, genau eine „Programm"-Zeile, gleiche id; dafuer `createReentrantTestDb` in
  `@senify/core/testing`, weil pg-mem ein wiederholtes `CREATE TABLE IF NOT EXISTS` ablehnt);
  Pflichtfeld-Tests (Theme, Manual-Reference) auf optionale Semantik umgestellt;
  `TOKEN_AUTHOR`-Konstante in `helpers.ts` (Token-Identitaet vs. `TEST_AUTHOR`).
  Verifiziert: `pnpm test` **1187/2/132**, typecheck 0, lint 0 (Log
  `.scratch/testlauf-19-09-ticket18s1.log`). Offen: Scheiben 2 (Idempotency-Keys) und 3
  (`authoredBy`-Fence). Bekannte Grenze: Token-Routen bleiben public (Loopback-Vertrauen, L26/E21).

**Welle 1, Teil 1 (19.09., umgesetzt):** Drei Fundament-Pakete aus §9 des Verbesserungsplans:
(1) **Ticket 11** — `hiddenDevices` im Editor-Modell, v1-Lift ohne Datenverlust (Migration +
Roundtrip-Test), Renderer-Mapping über `isHiddenAt` (Adapter), neue Editor-Mutation
`setNodeHiddenDevices` (Bridge schreibt beide Devices idempotent), `NodeSpec.overrides` fuer
Duplikat/Undo; dazu der **property-weise Reset (L2):** `clearBreakpointOverride` mit optionalen
`props`/`hidden` statt „ganzer Breakpoint weg" (inkl. korrektem Undo-Patch). (2) **E17 Scheibe 1** —
`applyUndoBatch` laeuft durch `validateTreeIntegrity` und meldet stale Undos als Warnung statt
stiller Korruption. (3) **E4 Scheibe 0** — MCP-Annotations-Matrix (destruktiv nur
Delete/Rollback/Restore, openWorld nur `analyze_reference`, idempotent je Semantik) plus
Server-Instructions. Verifiziert: `pnpm test` **1183/2/132**, typecheck 0, lint 0 (Log
`.scratch/testlauf-19-09-welle1.log`). Offen aus Welle 1: Ticket 18 (Author aus Token,
Idempotency-Keys, Fence) — Scheiben-Plan im Ticket dokumentiert.

**Baseline 19.09. (committet):** Drei Commits sichern den bis dahin uncommitteten Stand:
`d434ffc` (Produktcode: Motion M0–M5, Style-Pipeline, Live-Modus, Transport — 111 Dateien),
`49bacbd` (Planung: Tickets 07–22, ADRs 0004–0006, Verbesserungsplan, HANDOFF), `e62fe1f`
(Planung: Motion-Papierpaket + Ticket 18 senify-v1-build). Vorheriger HEAD: `e2783da`.
Untracked bleiben nur bewusst lokale Artefakte: Test-Logs (`.scratch/testlauf*.log`,
`vitest-browser.*`), Screenshots (`FireShot-*.jpg`, `refs/nick/`, `refs/aufnahmen/`),
`.backup-18-09/`, Debug-Dateien in `.scratch/refs/` (`*-mine.*`, `debug-*.ts`,
`commit-msg.txt`, `tsconfig-ohne-fremd.json`). Offen: `TEST_DATABASE_URL`-Lauf (Port 5433
geschlossen, Docker nicht installiert) — vor Release-Themen nachholen.

**Konsolidierung 19.09. (Verbesserungsplan, vierte Runde):** Teil I und Teil II (paralleler Strang:
Referenz-Transfer/Anti-Slop/UI, Epics E24–E27, Luecken R1–R14) vollstaendig gegengelesen und
zusammengefuehrt. Fuenf Inkonsistenzen aus der Parallelarbeit gefixt: Epic-ID-Bereich in §16.2
(E1–E27), Quellen-Verweis auf §16.6 statt §10.6, Risiko-Register auf 27 Epics, Querverweis
§9 ↔ §15.2 (Reihenfolge der beiden Arbeitspaket-Listen), L-/R-Abgrenzung in §10.4. Ergaenzt:
KPI „Design-Score" (§8.1). Inhaltliche Widersprueche wurden **nicht** gefunden (E23/E25-Verhaeltnis
in §10.3 explizit geklaert; E4 S0, L42/E13-Vault und E15→E26-Abhaengigkeiten konsistent referenziert).
Dokument jetzt konsistent ueber beide Teile.

**Umsetzung 19.09. (Ticket 14: Klassen-Emission gemessen und auf global umgestellt):**

- **Messung (Ticket-Kriterium):** `pruef-klassen-emission.mjs` baut die drei Dokumente des
  Tickets und misst beide Strategien ueber `compileCssReport`. Ergebnis (regional / global):
  a (30 Knoten, 1 Klasse, 20 Deklarationen) **16.295 B / 1.987 B = 8,2x**; b (120/6/15)
  **54.867 B / 8.356 B = 6,57x**; c (Hero 15/3/40) **15.185 B / 3.590 B = 4,23x**.
  Korrektheitsprobe je Dokument gruen (gleiche Deklarationen je Traeger in beiden Strategien).
  Bericht `.scratch/refs/klassen-emission.md` + `.json`.
- **Entscheidung:** Kriterium „bei (b) mehr als ~2x regional -> global" deutlich erfuellt ->
  **global umgestellt** (O15 in `map.md`).
- **Umsetzung:** `CompileOptions.classEmission` (`"global"` Default, `"regional"` als Option und
  Rueckweg); `globalClassSelector` in `cascade.ts` (exportiert); die Klassen-Emission folgt der
  Regel-Reihenfolge des Dokuments (`order`, Ticket 07) statt der Knoten-Reihenfolge. Knoten-eigene
  Zustaende bleiben verankert (`[data-node-id].cls:hover`), weil `.cls` (0,1,0) gegen
  `[data-node-id]:hover` (0,2,0) sonst verloere (O1); Regel-Zustaende ohne Knoten-Zustand sind
  global (`.cls:hover`). Neue Testdatei `css-class-emission.test.ts` (6 Faelle).
- **Nachgezogene Erwartungen (Form, Semantik erhalten):** `css-cascade`, `css-combinations`
  (Golden), `css-injection`, `css-rule-kinds`, `roundtrip`, `theme` (widget-engine);
  `editor/test/state/compiler.test.ts`; `renderer/test/style-rules-css.test.ts` (inkl.
  Gegenprobe „nicht mehr am Knoten verankert"); `engine/test/bake.test.ts` (globale Regel +
  Traeger-Element mit Klasse und `data-node-id`).
- **Nebenbefund (gleicher Lauf):** `editor-browser.test.ts` klickte im Live-Modus auf die erste
  Section — nach dem DnD das Banner mit `/kontakt`-Link; der Frame navigierte weg, der
  Fehler-Tracker meldete den 404. Klick geht jetzt auf den linkfreien Divider. Kein
  Produktfehler; per Stash-Gegenprobe belegt, dass es nicht an dieser Runde lag.
- **Zahlen:** `pnpm test` **1176 gruen / 2 uebersprungen / 132 Dateien**, typecheck 0, lint 0.
  Kein Commit. Log `.scratch/testlauf-19-09-ticket14.log`.
- **Naechster Schritt:** M4 Stufe 1 mit Ticket 03; parallel 12/18.

**Verifikation 19.09. (Slot-/Collection-Transport abgeschlossen + paralleler Strang):**

- **Vorgefunden:** Ein paralleler Strang hat am 18.09. um 22:04 — nach dem letzten gruenen
  Gesamtlauf — `contract.ts`, `apply.ts`, `editor-bridge.ts`, `persist.ts` und
  `persist.test.ts` geaendert: die drei v2-Ops `setSlotContent`/`createCollectionEntry`/
  `updateCollectionEntry` sind jetzt durchgaengig (Section-Contract + Apply + Undo-Patches,
  Bridge-Uebersetzung, Save-Pipeline-Transport). Die Doku nannte sie noch offen.
- **Dabei gefunden und behoben:** (1) `editor-mutations.test.ts` erwartete noch die alte
  Ablehnung („refuses ops without a section equivalent") — ersetzt durch einen Mapping-Test
  ueber alle drei Ops. (2) `editor-bridge.ts` `default`-Zweig war durch die vollstaendige
  Fallabdeckung `never` → Typfehler; jetzt expliziter Laufzeit-Guard fuer unbekannte Ops.
- **Abdeckung ergaenzt (Engine):** neuer Describe in `mutations.test.ts` — Slot-Regeln
  (`max 1`, `allowedTypes ["card"]`, unbekannter Slot), Entry anlegen/patchen (Index-Fehler,
  voller Slot, unbekanntes Prop) plus Undo-Roundtrip (`setSlotContent`, `create+update`) ueber
  `applyUndoBatch`.
- **Benannte Grenze:** Editor adressiert Katalog-`collection`, die Engine die Section
  `collection-list`; die UI-Nutzung der Slot-Ops faellt mit dem E2-Cutover (Phase 4). Der
  Transport selbst ist fertig.
- **Zahlen:** `pnpm test` **1168 gruen / 2 uebersprungen / 131 Dateien** (Log
  `.scratch/testlauf-19-09.log`), typecheck 0, lint 0. Kein Commit.
- **Naechster Schritt:** M4 Stufe 1 mit Ticket 03; parallel 12/14/18.

**Umsetzung 18.09. (Tickets 21/22: Klassen am DOM + scoped-Rekey im Bake):**

- **Echter Fund (Ticket 21):** `node.classes` und die generierte Scope-Klasse erreichten nie
  das DOM. Der Compiler ankert `class`-Regeln als `[data-node-id].name` und scoped-Regeln als
  `[data-node-id].__senify_scope_<id>` — beide Selektorformen waren damit tote Regeln (Canvas
  und Bake nutzen dieselben Komponenten). `SectionShell`, `PrimitiveNode` und der
  Unbekannt-Platzhalter tragen jetzt User-Klassen + deterministische Scope-Klasse
  (`nodeRootClasses`, `shared.tsx`); die Scope-Klasse ist aus der Knoten-ID ableitbar, deshalb
  braucht der Renderer keine Regel-Registry (die Referenz loest es ueber classIds-Referenzen).
- **Ticket 22 (benannter Rest aus 13):** `composePageTree` fuellt eine
  Draft→komponiert-ID-Map (`rekeyChildren`/`spliceOutlet`); `buildBakeInput` haengt sie pro
  Route als `nodeIdMap` an die `BakePageInput`s; `styleRulesCss` remappt scoped-Regeln
  kanonisch auf die komponierten Knoten (dedupliziert je Regel+Ziel, eine Kopie pro
  Auspraegung). Pagination-Varianten teilen die Map.
- **Tests:** Registry +2, Templates +3, Renderer +2, Engine-Bake +1 plus die
  Klassen-Assertion im bestehenden Regel-Test; bestehende exakte `class="w-..."`-Erwartungen
  angepasst (registry/components, renderer/widget-bake, app/canvas-browser).
- **Zahlen:** `pnpm test` **1165 gruen / 2 uebersprungen / 131 Dateien**, typecheck 0, lint 0.
  Kein Commit.
- **Naechster Schritt:** Slot-/Collection-Transport (letzter Rest aus 13), dann 12/14/18 bzw.
  M4 Stufe 1 mit Ticket 03.

**Umsetzung 18.09. (Ticket 15: PG-Dialekt-Gate):**

- `packages/engine/test/dialect-gate.test.ts`: scannt `packages/engine/src/**/*.ts` (ohne
  `db.ts`) auf `::`-Casts, `now()` in DML, `DISTINCT ON` und
  `ADD COLUMN IF NOT EXISTS`; Gegenprobe (Sample muss alle vier Muster treffen) inklusive.
  Keine Verstoesse im Bestand (nur `forms.ts` hat ein IPv6-Literal `"::1"`, das bewusst
  nicht als Cast gilt).
- **Zahlen:** +1 Datei / +2 Tests (Gesamtlauf danach 1157/2/131). Kein Commit.

**Umsetzung 18.09. (Ticket 20 + Motion M3-M5: Profil-Kanal, Inspektor, Play-Preview, Gates):**

- **Ticket 20 (F6/F7):** `PATCH /api/sites/:siteId` traegt jetzt `name` und/oder `profile`
  (`UpdateSiteBodySchema`, Audit `update_site_profile`); `Store.updateSiteProfile`;
  `SiteProfile`/`SITE_PROFILES` kommen aus section-sdk (eine Definition). Editor:
  Topbar-Select + Cap-Hinweis, Wechsel gegen das Dokument validiert (`profileIssues`,
  nichts aendert sich still), App laedt das Profil in `pageView` und schickt den PATCH.
- **M3:** Motion-Panel vollstaendig (Profil-Cap als `max` + Hinweis, Easing, Dauer-/Stagger-
  Faktor, RM-Variante, Aktiv-Schalter, „gesperrt"-Markierung, Engine-Warnungen inline),
  Explorer-Badge, MCP `set_motion`/`clear_motion`, Skill `motion.md` + Portal-Guide.
- **M4 Stufe 2:** `GET /api/motion-vendor/:name` (self-hosted Runtime fuer den Editor);
  Topbar-Schalter „Motion" injiziert `motion-data` + per-Preset-Vendor + Runtime in den
  aktiven Frame (Lenis aus), Stoppen setzt die Frames zurueck. Stufe 1 (Live mit echter
  Seite) bleibt Ticket 03.
- **M5:** `hardGuardrailsForTree(tree, profile)` + `runChecks`/Schreibpfad lesen das Profil
  (Cap, Klassen, Pins, 3D); weicher `reveal-too-long`-Hinweis im Bake; Freeze-Baseline +
  Gegenprobe bleiben das Paritaets-Tor.
- **Tests:** Engine +5 (sites, motion-vendor, guardrails), section-sdk +2, Editor +3
  (consistency, panels), Renderer +1, MCP/Skills/Guides angepasst, Browser (Profil-Select
  + Play → `window.gsap` im Frame).
- **Zahlen:** `pnpm test` **1155 gruen / 2 uebersprungen / 130 Dateien**, typecheck 0,
  lint 0. Kein Commit.
- **Naechster Schritt:** M4 Stufe 1 mit Ticket 03; danach die kleineren Tickets
  (15 Dialekt-Gate, scoped-Rekey, Slot-/Collection-Transport, 12/14/18).

**Umsetzung 18.09. (Ticket 19 M2: self-hosted Runtime + Bake, Site-Profile entschieden):**

- **Entschieden (Nutzer):** F6 Profile 1:1 aus v1 (`clean`/`standard`/`showcase`,
  Default `standard`, Caps 3/7/10, Lenis aus/an/an, Pin 0/1/1, 3D nein/nein/ja);
  F7 Durchsetzung gestaffelt (M2 Lenis, M5 harte Gates, Profil im Editor erst mit
  Site-Settings-Ticket vor M3). Eingearbeitet in ADR-0006, `plan.md` §8, Ticket 19.
- **Vendor:** `gsap@3.15.0` + `lenis@1.3.26` als Renderer-Dependencies; der Bake
  kopiert `assets/vendor/{gsap,ScrollTrigger,SplitText,lenis}.min.js` und verlinkt
  pro Seite nur die Skripte, die die Preset-`needs` verlangen. Kein CDN mehr.
- **Payload v2:** `motionDataFor` → `{ v: 2, breakpoints, entries }` mit
  `hides`/`needs`/`reducedMotion`; Breakpoints aus `mediaMaxWidth` (eine Quelle);
  Leser akzeptiert weiter die v1-Liste. `enabled: false` erzeugt keinen Eintrag.
- **FOUC:** `motionPends` (section-sdk) + `data-motion-pending` an
  `SectionShell`/`PrimitiveNode`; `Page.astro` mit Pending-CSS, `<noscript>`-Override
  und 1,6-s-Failsafe; die Runtime gibt frei, sobald sie uebernimmt.
- **Reduced Motion** pro Eintrag (`static`/`fade`/`off`); Lenis nur ohne RM.
- **Freeze:** Kill-Switch `__SENIFY_MOTION__ = "off"`; `visual.ts` mit
  `motion: "off" | "live"`, `scroll-behavior: auto`, 2 rAF; Browser-Gegenprobe.
- **Tests:** Renderer-Motion (+6), section-sdk (+1), Bake (+2, inkl. Budget
  ≤ 150 KB), Visual (+1). **Zahlen:** `pnpm test` **1144 gruen / 2 uebersprungen /
  129 Dateien**, typecheck 0, lint 0. Kein Commit.
- **Naechster Schritt:** M3 (Inspektor) bzw. Site-Settings-Ticket (Profil) davor.

**Umsetzung 18.09. (Ticket 19 M0 + M1: Motion-Modell):**

- **M0:** ADR-0006 angenommen (`docs/adr/0006-motion-authoring.md`); Entscheidungen F1–F5
  (Start nach Ticket-13-Rest, Presets + Intensity, Live + Play, Ticket 19, self-hosted).
- **M1 Modell/Datenpfad:** Preset-Registry in `section-sdk/src/motion.ts` (24 Eintraege mit
  Flags, GSAP-Bedarf, Coverage); `MotionSpec` um `reducedMotion`/`enabled` erweitert;
  `EditorNode.motion`; Patch `setNodeMotion` (`null` loescht); Ops `setMotion`/`clearMotion`
  mit `assertMotionSpec`; Transport (`persist.ts`, `PAGE_OPS`, `patchesToPending`); v2-Ops im
  Editor-Contract; Bridge 1:1 auf die v1-Ops `setMotion`/`clearMotion`; `NodeSpecSchema` +
  `buildNode` tragen Motion (Undo restauriert Subtrees inkl. Motion); Consistency
  (`motion-preset-unknown`, `motion-pin-excess`); Migration traegt Motion (der irrefuehrende
  Kommentar ist korrigiert); Canvas-Adapter reicht sie durch.
- **Tests:** `section-sdk/test/motion.test.ts`, `renderer/test/motion-presets.test.ts`
  (Drift-Guard Registry <-> `PAGE_SCRIPT_PRESETS`/`PIN_PRESETS`), Editor-Operations/
  Consistency/Persist/Migration, Engine-Bridge + Route-Roundtrip.
- **Zahlen:** `pnpm test` **1135 gruen / 2 uebersprungen / 129 Dateien**, typecheck 0,
  lint 0. Kein Commit.
- **Naechster Schritt:** M2 (Runtime/Bake: self-hosted GSAP 3.15, `motion-data` v2,
  FOUC-Guard, Freeze-Protokoll); vorher Site-Profile entscheiden.

**Umsetzung 18.09. (Ticket 13 Rest: Bake-Renderpfad + Klassen-Transport):**

- **Klassen-Transport geschlossen:** der v1-Knoten traegt `classes`
  (`section-sdk/src/types.ts`); `updateNodeMeta` kann die ganze Liste setzen (`classes`),
  ergaenzen (`addClasses`), entfernen (`removeClasses`); `null` loescht `hidden`/`locked`
  (undo-faehig). Neue Editor-Mutation `setNodeMeta`; die Bridge uebersetzt sie 1:1,
  `assignClass`/`removeClass` ueber die Diff-Form. Die Save-Pipeline sendet die
  `setNodeFields`-Patches als `setNodeMeta` — Klassen-Zuweisung ist damit keine
  `unsupported`-Luecke mehr (Slots/Sammlungen bleiben es, benannt).
- **Bake-Renderpfad:** `bakePages` liest `store.listStyleRules(siteId)` und reicht die
  Registry an `bakeSite`; `styleRulesCss` (`renderer/src/style-css.ts`) kompiliert sie —
  class-Regeln am tragenden Knoten, `ambient` verbatim, `scoped` am Knoten, `rawCss`
  (@keyframes) — nach `assets/style-rules.css`, in `@layer user-authored` und **nach** der
  Widget-Basis gelinkt (Reihenfolge wie im Canvas-Frame). Eine Quelle: die Registry.
- **`styleRuleToClassRule`** (widget-engine) ist jetzt die eine Abbildung
  Registry -> Compiler fuer alle drei Kinds; Editor (`classRules`) und Bake nutzen sie.
- **Echter Fund:** der Layout-Splice rekeyt die Page-Knoten (`templates.ts`
  `rekeyChildren`) — class-Regeln wandern am Knoten mit und bleiben korrekt, eine
  `scoped`-Regel verliert ihre Draft-ID im Release. Benannt (Code-Kommentar + Testnotiz);
  die Loesung braucht die ID-Map pro Seite im Bake-Pfad (eigenes Ticket).
- **Tests:** `style-rules-css.test.ts` (4, inkl. echtem Bake), Engine-Bake-Test mit
  Registry-Regel, Bridge-/Transport-Tests (`mutations.test.ts`, `editor-mutations.test.ts`),
  `save-pipeline.test.ts` mit Klassen-Roundtrip inkl. Undo.
- **Zahlen:** `pnpm test` **1121 gruen / 2 uebersprungen / 127 Dateien**, typecheck 0,
  lint 0. Kein Commit.

**Umsetzung 18.09. spaet (Ticket 13 Save-Pipeline):**

- **Entscheidungen des Nutzers:** Autosave gebuendelt (400 ms), Konflikt-Hinweis mit
  „Neu laden" / „Erneut versuchen".
- **`createSavePipeline`** (`editor/src/state/persist.ts`): Batcht Store-Aktionen, routet
  Struktur-Ops an `POST /api/pages/:pageId/editor-mutations` und Regel-Ops an die
  Site-Routen, fuehrt die Version, pausiert bei `409`, persistiert Undo/Redo ueber die
  History-Patches. `unsupported`-Liste statt stillem Verwerfen.
- **Shell verdrahtet** (`packages/app/public/app.js`): Autosave im Canvas, Knopf als
  manueller Flush, Konflikt-Knoepfe. Ein echter Fund dabei: der `apply`-Pfad sendete die
  rohe Mutation (ohne generierte Node-Id) — jetzt werden einheitlich die Patches uebersetzt.
- **Tests:** `persist.test.ts` (9), `save-pipeline.test.ts` gegen die echte Engine,
  Browser-Test auf Autosave umgestellt.
- **Zahlen:** `pnpm test` **1112 gruen / 2 uebersprungen / 126 Dateien**, typecheck 0,
  lint 0. Kein Commit.
- **Offen:** Bake-Renderpfad der Registry; Transport fuer Klassen-Zuweisung/hidden/locked.

**Umsetzung 18.09. abends (Ticket 07 Stufen 1-6 + Ticket 13 Transport):**

- **Kanonisches Modell** um `states`, `statePriorities`, `authoredBy` erweitert;
  `canonicalStyleRule` garantiert eine byte-stabile Serialisierung.
- **Editor-Dokument** fuehrt `styleRules: StyleRule[]` (Array = Kaskadenordnung) statt
  des Wert-Bag-Records; Patches/Ops adressieren per stabiler `id`
  (`upsertStyleRule`/`deleteStyleRule`/`reorderStyleRule`/`renameStyleRule`).
- **Compiler** emittiert Klassen-States, `ambient` (verbatim), `scoped` (am Knoten),
  `contextStyles` (verschachtelte Bedingung) und `rawCss` (nur gepruefte `@keyframes`).
- **Migration** liftet alte `classes`-Bags additiv; `DOCUMENT_VERSION` bleibt 2.
- **Site-Routen** tragen `states`/Prioritaeten/`rawCss`/`authoredBy`;
  `#assertWritableRule` prueft `rawCss`.
- **Zahlen:** `pnpm test` **1102 gruen / 2 uebersprungen / 124 Dateien**, typecheck 0,
  lint 0. Kein Commit.
- **Offen (Ticket 13):** Save-Pipeline im Editor (Struktur -> Seiten-Route, Regeln ->
  Site-Routen; Takt/Konflikt-UX zu entscheiden) und der Bake-Renderpfad der Registry.

**Umsetzung 18.09. (Wert-Grammatik, Schreibtor, vierter State):**

- **Ticket 09 erledigt:** `disabled` als vierter State in `cascade.ts` (nach `active`) und
  `canvas.ts` (`PREVIEW_STATES`); Tests in `css-cascade.test.ts`.
- **Ticket 07 Stufe 0 erledigt (das Gate):** `widget-engine/src/css/value-grammar.ts` —
  Normalisierung (Escapes, Kommentare, Schreibweisen) + Allowlist-Parser; 94 Tests mit 23
  Umgehungs- und 50+ Durchlassfaellen. Im Compiler verdrahtet (Text-Werte geprueft,
  unsichere verworfen — `css-injection.test.ts`, 9 Tests). Im Editor-Schreibpfad:
  `assertStyleProp` entfernt, `assertSafeValue` wirft `SenifyError` (Knoten-Props **und**
  Stilregeln).
- **Ticket 10 umgesetzt (bis auf die Inspektor-Anzeige):** unbekannte Properties werden
  durchgereicht (sortiert, baseline-faehig), `styleGroups` entsperrt, `canonicalStyleKey`
  loest `borderRadius`/`border-radius` auf dieselbe Deklaration, `layout`-Gruppe + 25
  Layout-Eintraege als Bedienelement-Beschreibung. `css-open-space.test.ts` (10 Tests).
- **Zwei echte Funde:** (1) Der Compiler emittierte Text-Werte bisher **ungeprueft**
  (`boxShadow: "red; } body {"` war eine lebende CSS-Injektion) — geschlossen.
  (2) Katalog-Controls (`text`, `level`, `striped`) sind Verhaltens-Props, kein CSS — der
  offene Pfad schliesst sie aus, sonst stuende `text: Hallo` im Stylesheet.
- **Zahlen:** `pnpm test` **1073 gruen / 2 uebersprungen / 123 Dateien**, typecheck 0,
  lint 0. Kein Commit.

**Naechster Schritt (Stand 18.09. abends):**

Die Reihenfolge hat sich geaendert, weil ADR-0005 eine **Vorbedingung** eingefuehrt hat: die
Wert-Grammatik ist die Sicherheitsgrenze, die die Whitelist ersetzt. Solange sie nicht steht, darf
`assertStyleProp` nicht fallen — sonst ist die Oeffnung ein Sicherheitsrueckschritt (es gibt im Repo
keinen CSS-Sanitizer; `sanitize-html` wirkt nur in `registry/src/md.ts` auf HTML).

1. ~~Ticket 09~~ **erledigt.**
2. ~~Wert-Grammatik + `assertSafeDeclaration`~~ **erledigt** (Stufe 0, `value-grammar.ts`).
   Allowlist auf Wert-Formen, Normalisierung von CSS-Escapes/Kommentaren **vor** der Pruefung,
   Umgehungs-Tests (`url(jav\61 script:...)`, `u\72 l(...)`, `expr/**/ession(...)`, Schreibweisen).
   **Gate:** erst wenn diese Tests gruen sind, geht es weiter.
3. ~~Ticket 10~~ **erledigt** bis auf die Inspektor-Anzeige. Ursprungsauftrag: `assertStyleProp` faellt, `styleGroups` entsperrt,
   unbekannte Properties werden durchgereicht, CSS-Namen + Alias, Layout-Eintraege als
   Bedienelement-Beschreibung. **Nur `assertStyleProp`** (2 Aufrufstellen) — `assertKnownProp`
   (4 Aufrufstellen, prueft Knoten-Props gegen den Katalog) **bleibt**.
4. **Ticket 07** (Editor-Dokument auf `styleRules[]`, kanonisches Modell + `states`/`statePriorities`
   + `authoredBy`, Patches/Ops per `id`, Konsistenz, Migration, Compiler-Emission fuer
   states/ambient/scoped/contextStyles/rawCss).
5. ~~Ticket 13~~ **erledigt** (Server, Transport, Save-Pipeline, Bake-Renderpfad).
   Offen bleiben zwei benannte Luecken: die scoped-Rekey-Luecke im Bake (Layout-Splice
   vergibt Knoten-IDs neu) und der Transport fuer Slot-/Collection-Ops.
6. Parallel moeglich: **12 (DnD)**, **14 (Klassen-Emission messen)**, **18 (Agent-Style-Gate =
   Wert-Ebene-Fence fuer `authoredBy: "agent"`)**.
7. Ende Phase 2/Anfang Phase 3: **16 (Marker-Overlay)**, **17 (Releases-Cutover, Paritaets-Tor als
   CI-Blocker)**.
8. Vor dem Cutover (04/06): **11 (per-Breakpoint `hidden` retten)**. Jederzeit: **15 (Gate-Test
   fuer den PG-Dialekt)**.

**Ticket 08 ist erfuellt (korrigiert 18.09.):** `ui-plan.md` Z116 nennt „drei Stationen", 5.13
traegt die O10-Entscheidung samt „Kein Acht-Stationen-Pfad"; `ui-aufgaben.md` Aufgabe 37 ebenso.
Die Abnahme des Tickets („Kein Plan-Dokument referenziert mehr Stationen als das Modell kennt")
ist damit erfuellt. Eine fruehere Notiz hier behauptete das Gegenteil, weil sie vor der
ui-plan-Korrektur geschrieben wurde.

**Ticket 02 Punkt 1 ist erledigt** (Registry im Engine-Store); was uebrig ist, steht in Ticket 13.
