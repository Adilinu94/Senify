# Editor v2 Rebuild - Umbauplan

Status: Entscheidungen getroffen (16.09.2026), Umsetzung offen (Phase -1 bis 5)
Analysebasis: packages/editor, section-sdk, registry, engine/mutations; Repos/instatic (Blaupause),
Repos/emdash; Repos/elementor-main (Controls); Recherche Elementor 4.x / Webflow / Framer 2026.
Am 16.09.2026 durch drei Pruefungen gegen den Code abgeglichen: Diagnose korrigiert,
Nutzerentscheidungen eingetragen, technische offene Punkte benannt.

## Entscheidungen des Nutzers (16.09.2026)

- **E1 Voller Neubau wie geplant** (D1 bestaetigt). Der Umbau traegt ueber U3 und U5: keine
  Kaskade und Style-Rules, zu schmale Mutations-API. Die Auslieferungsfehler vom 16.09.
  begruenden den Neubau **nicht**; sie werden vorher behoben (Phase -1).
- **E2 Puck-Strategie: Strangler.** Puck bleibt bis zum Paritaets-Tor im Einsatz, erst danach
  wird sie entfernt. Kein Big-Bang-Ausbau (ersetzt D2).
- **E3 Bewusst ausgeklammert** (Nutzerentscheidung, bestaetigt): Rollen und Rechte,
  Mehrsprachigkeit, Hosting und Deployment, Barrierefreiheit und Tastaturbedienung,
  Sicherung und Versionierung, mehrere Bearbeiter gleichzeitig.
- **E4 Kein Freigabe-Gate.** Agenten duerfen direkt veroeffentlichen. Dafuer ist die
  automatische Browser-Pruefung vor dem Veroeffentlichen **Pflicht** (siehe O9), sonst fehlt
  jedes Netz.
- **E5 Phase -1:** Die belegten Auslieferungsfehler werden vor Phase 0 behoben.

## Diagnose (korrigiert am 16.09.2026)

- **U1 korrigiert:** `packages/editor/src/mount.ts` hat **2441** Zeilen, nicht 2330.
  "Keine Reaktivitaet" gilt nur fuer mount.ts; `editor/src/react-renderer.tsx` nutzt
  `createRoot`/`flushSync` und rendert die echten Bake-Komponenten.
- **U2 korrigiert:** Es sind **28** kuratierte Sections (`registry/src/index.ts:60-94`), nicht 27.
- **U3 korrekt:** Keine `classIds`/`inlineStyles` im Modell (0 Treffer). Praezisiert: `Node`
  kennt zusaetzlich `children`, `slots`, `locked`, `hidden` (`section-sdk/src/types.ts:28-39`).
- **U4 gestrichen:** Der Editor ist **nicht** ungleich dem Ergebnis. `react-renderer.tsx:11`
  mountet die Bake-Komponenten (SectionTree), `packages/app/editor/frame.css` importiert
  dieselbe `components.css` wie die Bake.
- **U5 korrekt:** `contract.ts:13-26` = genau 12 Ops; `ClosedNodeOverrideSchema` nur `props`
  und `hidden`. Op heisst `setBreakpointOverride`.
- **U6 korrigiert:** Patch-Undo existiert bereits (`editor/src/history.ts`, `HistoryStack`
  mit `coalesceKey`). "Kein State-Management" gilt nur fuer den Store.

Konsequenz: Der Neubau traegt ueber **U3 und U5**. U4 entfaellt als Begruendung, U1 und U6
sind nur teilweise zutreffend.

## Technische Entscheidungen

- D1 Neubau statt Renovierung: drei Schichten Widget-Engine / Style-Engine / Canvas-UI.
  `mount.ts` wird ersetzt; `history.ts` und `react-renderer.tsx` werden **migriert**, nicht
  neu gebaut.
- D2 (ersetzt durch E2) Puck-Ausbau als Strangler nach dem Paritaets-Tor.
- D3 Widget-Primitiven: Anzahl richtigstellen (gelistet sind 21, nicht 17). Fehlende
  ergaenzen: `base.table` (Vergleich), `base.accordion` (FAQ), `base.body` (Wurzel).
- D4 Sections werden Visual Components (Subtree + Parameter + Slots). Agenten-Flow bleibt.
- D5/D7 **zu einer Kaskade zusammenfuehren** (siehe O1).
- D6 Ein CSS-Compiler fuer Canvas und Publish, Pixel-Vergleich in CI (siehe O3).
- D8 Inline-Edit auf dem echten Element, `Coalesce-Key` = ein Undo-Eintrag.
- D9 Geraetepunkte, Pseudo-Zustaende, Token-Auswahl an jedem Control.
- D10 Agent und Mensch nutzen dieselben Primitiven; Registry bleibt Gesetz.
- D11 Ausgeklammert, siehe E3.
- D12 Sections-Migration parallel, beide Welten einen Release lang, dann Cutover.

## Offene technische Punkte (vor der jeweiligen Phase zu entscheiden)

- **O1** Kaskade: D5 (Reihenfolge ueber `kind`) und D7 (`@layer user-authored`) zu **einer**
  Entscheidung zusammenfuehren. Vor Phase 2.
- **O2** Persistenz- und Migrationsformat versionieren (NodeTree v2) mit Roundtrip-Test und
  Ruecknahme. Vor Phase 1.
- **O3** Pixel-Vergleich als **Toleranz** formulieren (nicht "= 0"); ansonsten bleibt das Tor
  dauerhaft rot. Vor Phase 1.
- **O4** Teststrategie abgleichen: "506 Bestandstests bleiben gruen" ist mit der
  Vollersetzung von `mount.ts` unvereinbar. Erwartung korrigieren. Vor Phase 1.
- **O5** Ticket 01 und 02 ergaenzen: Selektionsmodell, Persistenzformat, Migration und
  Ruecknahme; Controls aus Elementor: Schieberegler (min/max/step/Einheit), Farbwaehler mit
  Deckkraft und Palette, reiner Umschalter, Bedingungen, Wiederholfelder.
- **O6** Ticket 03 bis 05 ergaenzen: Fokus-Falle, Sprungreihenfolge, Kuerzel-Konflikte,
  Mehrschritt-Undo, vollstaendiges Kopieren/Einfuegen, Mehrfachauswahl, Papierkorb;
  Single-Source-of-Truth, Umschalter, Rueckfallebene, Paritaetstest, Konfliktregel bei
  beidseitiger Bearbeitung; Kanal-Haertung (Akteur, Wiederverbindung, Lastgrenzen,
  Mehrfachbetrachter, Absicherung, Lebenszeichen).
- **O7** ADR-06 vervollstaendigen: Begruendung, verworfene Alternativen, Folgen, betroffene
  Pakete, Pruefungen, Nummer, Status, Datum, Bezug zu ADR 0001 und 0002. Puck war nie als
  ADR gefasst, nur als Notiz in `.scratch/senify-v1/research/28-puck-gap.md`.
- **O8** Frueher sichtbarer Nutzen: vertikaler Durchstich (eine echte Section komplett ueber
  Bearbeiten, Stylen, Veroeffentlichen mit Paritaets-Tor) am **Anfang von Phase 1**.
- **O9** Automatische Browser-Pruefung vor dem Veroeffentlichen (wegen E4 Pflicht): Vorschau
  und Release oeffnen, keine 404, CSS und Skripte vorhanden, Bilder geladen,
  Ueberschriftengroessen, kein waagerechter Ueberlauf, Navigation sichtbar, Mobil geprueft.
  Nachtrag in Ticket 07 und in `.scratch/senify-v1-build/issues/07-lifecycle-review-checks.md`.

## Blaupausen

- `Repos/instatic`: vorhanden, umfangreich, tauglich. Belegt D7
  (`docs/features/canvas-iframe-per-frame.md`: `@layer user-authored`, unlayered Chrome,
  Zustand per doppeltem Selektor).
- `Repos/emdash`: vorhanden, aber CMS ohne Canvas-Editor. Nur bedingt tauglich.
- `Repos/elementor-main`: vorhanden. Controls als Bauplan fuer Ticket 02 nutzbar.

## Phase -1 (zuerst)

Belegte Auslieferungsfehler beheben (laufender Auftrag): Vorschau selbsttragend ausliefern
(`packages/engine/src/http.ts:3350` mit `selfContainedPreviewHtml`, `bake.ts:440`),
Wurzel-Assets ausliefern, Tailwind-Quellen in
`packages/renderer/astro-template/src/styles/global.css` korrigieren,
`packages/registry/src/components/shared.tsx:179` entschaerfen, Editor-Bildkontext
(`packages/app/public/app.js:4460`) fuellen, Editor-Layout-Ausnahme in
`packages/app/public/app.css:133`. Danach neu messen, erst dann Phase 0 binden.

## Tickets

| Ticket | Inhalt | Abhaengig von |
|---|---|---|
| 01-widget-engine-canvas | Phase 0 Fundament (widget-engine, Store, CSS-Compiler) + Phase 1 (Primitive-Widgets, Iframe-Canvas, DnD) | Phase -1 |
| 02-style-engine-inspector | Phase 2: Style-Rule-Registry, Inspektor mit vollem CSS-Spektrum, Geraetepunkte, Pseudo-Zustaende, MCP-Style-Tools | 01 |
| 03-editor-chrome | Phase 3: Explorer, Kontextmenue, Spotlight, Inline-Edit, Undo-UI, Keyboard | 02 |
| 04-visual-components | Phase 4: VC-Engine, Sections als VCs, Multi-Widgets aus Primitiven, Parallelbetrieb | 03 |
| 05-live-build-follow-polish | Phase 5: T18 SSE-Kanal, Live-Mitverfolgung, Leistungsbudget | 04 |
| 06-adr-puck-abschied | ADR: Puck wird nach dem Paritaets-Tor entfernt, Widget-Engine ist der neue Vertrag | 01 |

## Teststrategie

- Unit: Widget-Registry, CSS-Compiler (Golden-Snapshots je Widget), Kaskaden-Reihenfolge,
  `parentId`-Invariante, Patch-History.
- Architektur: "keine Panels mit lokalem Node-Kopie-State", "alle Writes durch Mutations",
  "kein Vanilla-DOM in UI-Komponenten".
- Playwright-E2E: Widget einfuegen, stylen, Breakpoint-Override, Veroeffentlichen,
  Pixel-Vergleich Canvas gegen Bake innerhalb der Toleranz.
- Paritaets-Tor: **vor** dem Flaechenausbau, in Phase 1 (O8).
- Erwartung an Bestandstests nach O4 korrigieren.

## Risiken und Gegenmassnahmen

- Zwei Renderpfade driften auseinander: ein CSS-Compiler plus Pixel-Vergleich in CI (D6, O3).
- Alt und neu parallel: Widget-Engine zuerst headless, Cutover in Phase 4.
- NodeTree-Migration bricht Seiten: additive Felder mit Standardwerten, `reindexNodeParents`
  beim Laden, Formatvertrag nach O2.
- Agenten-Bruch: Sections als VCs mit identischen Golden-Trees, MCP-Fassade bleibt.
- Scope-Creep im Style-Panel: Style-Gruppen als Daten (Control-Schema).
- Puck-Ausbau ohne Rueckweg: **vermieden durch E2** (Strangler bis zum Paritaets-Tor).
- UI erneut unbenutzbar: Designsystem vorab (Token-Glossar, CSS-Modules-Pflicht,
  Primitive-Regel).

## Aufwand

Phase 0: 1-2 Wochen | Phase 1: 2-3 | Phase 2: 3-4 (kritischer Pfad) | Phase 3: 2-3 |
Phase 4: 2-3 | Phase 5: 1-2. Gesamt ~11-18 Wochen, in Etappen mit Zwischencommits
(Sub-Agent-Rundenlimit 100 beachten, HANDOFF Abschnitt 7).
