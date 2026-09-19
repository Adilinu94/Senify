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
  Entscheidung zusammenfuehren. Vor Phase 2. **Entschieden im CSS-Compiler-Happen**
  (`packages/widget-engine/src/css/cascade.ts`): *eine* Schicht `@layer user-authored` fuer
  alle erzeugten Regeln, darin die Reihenfolge allein durch die Ausgabereihenfolge der
  festen Stufen `base -> device -> state -> class -> inline` (schwach nach stark). `kind`
  (class|ambient|scoped) bleibt Datum und bestimmt die Reihenfolge **nicht** mehr. Inline
  liegt ausserhalb der Schicht (style-Attribut) und gewinnt deshalb immer; nicht geschichtetes
  Editor-Chrome schlaegt weiterhin jede erzeugte Regel (Instatic-Muster). Klassenregeln werden
  auf den Knoten verankert (`[data-node-id="x"].cls`), damit sie dieselbe Spezifitaet wie eine
  Zustandsregel haben und ueber die Quellreihenfolge gewinnen. Geprueft:
  `packages/widget-engine/test/css-cascade.test.ts`.
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
- **O10 ENTSCHEIDEN (17.09.):** Geraetestationen = **drei** (desktop/tablet/mobile) als einzige
  Override-Stufen; freie Breite ist Ansichtssache (Frame-Label mit px-Feld) und schreibt keinen
  Stilwert. ui-plan 5.13 und ui-aufgaben 34 sind entsprechend angepasst. Kein Schema-/Compiler-
  Ausbau auf acht Stationen.
- **O11 ENTSCHEIDEN (17.09.):** Pseudo-States = **vier** (hover, focus, active, disabled).
  `StateName`/`STATE_ORDER`/`PREVIEW_STATES` werden um disabled erweitert (disabled emittiert
  nach active). Ticket 02 Punkt 5 baut den Inspektor mit vier Zustands-Reitern.
- **O12 ENTSCHEIDEN (17.09.):** Senify ist **PG-only bis Phase 5**. ADR-004 in `docs/adr/`
  schreibt die Entscheidung fest; neue Repositories halten SQL ANSI-nah (keine `::casts`, kein
  `now()` in DML, JSON-Behandlung nur ueber db.ts-Helfer); ein grep-Gate-Test setzt die Regel
  durch. Dual-Dialect bleibt Ausstiegsoption, wird aber nicht vorab gebaut.
- **O13 ENTSCHEIDEN (18.09.):** **Offenes CSS statt Whitelist** — ADR-0005
  (`docs/adr/0005-offenes-css-statt-whitelist.md`). Der Stilwert-Raum ist offen: `STYLE_PROPERTIES`
  beschreibt ab jetzt die **Oberflaeche** (welches Bedienelement eine Property bekommt) und ist
  **kein Schreibtor** mehr (`assertStyleProp` faellt weg); `styleGroups` wird **Sortierung**, kein
  Verbot; drei Freiheits-Ventile gehoeren ins Modell (freie `ambient`-Selektoren inkl.
  Pseudo-Elemente, `rawCss` fuer `@keyframes`, `contextStyles` fuer eigene
  `@media`/`@container`/`@supports`-Bedingungen). Die Grenze ist Sicherheit/Struktur, nicht
  Geschmack (Allowlist auf der Wert-Grammatik, **nicht** Denylist auf Zeichenketten — siehe ADR,
  Abschnitt „Die Sicherheitsgrenze"; es gibt im Repo keinen CSS-Sanitizer, die Whitelist **war**
  die faktische Grenze, deshalb ist die Grammatik Vorbedingung der Oeffnung).
  **Anlass:** Senify konnte 33 Properties schreiben (properties.ts:62-101) und lehnte alles andere ab
  (`position`, `overflow`, `zIndex`, Flex-Einzelwerte, `gridTemplate*`, `clipPath`, `textShadow`,
  `cursor`, Pseudo-Elemente, Keyframes); `heading` hatte per `styleGroups` kein `border`/`size`.
  Das ist der Baukasten-Deckel, den das Produktziel („eindrucksvolle, individuelle Seiten")
  ausschliesst. Folgen: **Ticket 07** baut auf dem kanonischen Modell aus
  `widget-engine/src/css/style-rule.ts` (nicht auf dem engeren B1-Entwurf), **Ticket 10** wird
  umgeschrieben (Tor abschaffen statt Liste verlaengern), ein Gate-Test schreibt eine Property
  ausserhalb jeder Tabelle und erwartet sie im CSS.
- **O14 OFFEN (18.09.):** **Templates + Outlet fehlen im editor-v2-Bauplan.**
  (`Repos/instatic/research/instatic/08-content-bausteine-*.md`, „Fuer den Nachbau" nennt
  Templates als **erste** Stufe der Wiederverwendung: `page.template` + `base.outlet`, Ketten pro
  Route (`everywhere` fuer Kopf/Fuss, Entry-Templates pro Typ, `notFound`), danach Loops, danach
  Visual Components.)
  **Praezisierung 18.09.:** Der Mechanismus existiert im v1-Kern bereits — Tabelle
  `page_templates` (kind `layout`/`collection`), `packages/engine/src/templates.ts` mit
  `findFirstOutlet`, `spliceOutlet`, `composePageTree`, `findLayout`, `findEntryTemplate`,
  `putPageTemplate`, dazu die MCP-Tools. Die Luecke ist **editor-v2-seitig** (kein Ticket deckt
  Templates ab) und bei den **VC-Ebenen-Templates** (wiederverwendbare Komponenten, Phase 4).
  Ohne sie wird jedes Layout dupliziert — auch das erzeugt Baukasten-Gefuehl. Zu entscheiden:
  eigene Phase vor oder mit Phase 4, ob die vorhandene v1-Mechanik im Editor sichtbar wird, und
  ob Loops (`data.rows`) mitkommen.
- **O15 ENTSCHEIDEN (19.09.):** **Klassen-Emission global** (Ticket 14, B8). Messung
  `.scratch/refs/klassen-emission.md`: regional (Anker je Knoten) gegen global (`.cls` einmalig,
  Dedupe ueber alle Traeger) — **8,2x / 6,57x / 4,23x** Ersparnis (a/b/c), Korrektheitsprobe
  gruen (gleiche Deklarationen je Traeger). Kriterium „bei (b) mehr als ~2x regional -> global"
  deutlich erfuellt -> **umgestellt**. `compileCss`-Default ist `classEmission: "global"`; die
  regionale Form bleibt als Option (Rueckweg, Messvergleich). Die Klassen-Reihenfolge kommt jetzt
  aus der Regel-Reihenfolge des Dokuments (`order`, Ticket 07), nicht mehr aus der
  Knoten-Reihenfolge. Knoten-eigene Zustaende bleiben verankert
  (`[data-node-id].cls:hover`), weil `.cls` (0,1,0) gegen `[data-node-id]:hover` (0,2,0) sonst
  verloere (O1). Golden-Snapshots aktualisiert; Beleg-Test
  `packages/widget-engine/test/css-class-emission.test.ts`.

Herkunft der Tickets 07–18: `.scratch/editor-v2-rebuild/research/02-bauplan-aenderungen.md` (B1–B12).
Reihenfolge-Empfehlung: vor Phase 2 = 08, 09, 07; parallel zu Phase 2 = 12, 10, 13, 18; Ende Phase 2/Anfang Phase 3 = 16, 17; vor Cutover = 11; jederzeit = 15. **Erledigt:** 07 (Wert-Grammatik), 09, 10, 13, 14, 15, 21, 22.
**Korrektur 18.09. (O13):** 07 und 10 sind neu gefasst — 07 baut auf dem kanonischen StyleRule-Modell,
10 schafft das Schreibtor ab. Ticket 13 ist serverseitig bereits gebaut (Site-Registry unter
`sites.style_rules_json` mit Routen `/api/sites/:siteId/style-rules`), es fehlt die Editor-Anbindung.

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
| 07-style-rule-modell | Kanonisches StyleRule-Modell im Editor-Dokument + states/authoredBy (O13) - **Wert-Grammatik erledigt** | 01, 09, 10 erledigt, vor 02 |
| 08-geraetestationen | Drei Geraetestationen festnageln (Plan-Anpassung) - **Restarbeit: ui-plan Z116/Z464 sagen noch "acht"** | vor 02 |
| 09-pseudo-state-disabled | disabled als vierter State (O11) - **erledigt 18.09.** | - |
| 10-layout-vokabular | Schreibtor abgeschafft, Layout als Oberflaechen-Beschreibung, CSS-Namen (O13) - **erledigt 18.09.** (Inspektor-Anzeige folgt in 02) | 07-Sicherheitsteil erledigt |
| 11-hidden-devices-migration | per-Breakpoint hidden bei v1->v2 retten | vor Cutover (04) |
| 12-dnd-vorziehen | DnD/Plus-Punkte/Einfuegelinie aus 01 Punkt 7 vorziehen | parallel zu 02 |
| 13-bridge-style-rules | **erledigt** (Server, Transport, Save-Pipeline, Bake-Renderpfad, scoped-Rekey mit 22, Slot-/Collection-Transport); UI-Nutzung der Slot-Ops erst mit dem E2-Cutover | 07 |
| 14-klassen-emission-messen | Klassen-Emission regional vs. global MESSEN - **erledigt 19.09.: global umgestellt (4,2-8,2x Ersparnis), regional als Option** | 07, vor Inspektor |
| 15-dialekt-entscheidung | Dialekt-ADR (PG-only bis Phase 5?) + ANSI-Regel + Gate-Test - **erledigt 18.09.** (ADR-0004 + `dialect-gate.test.ts`) | jederzeit, am besten jetzt |
| 16-marker-overlay-portal | Marker-Overlay im Portal (Ende Alt-Palette im Canvas) | Ende 02 / Anfang 03 |
| 17-releases-cutover | Editor-Publish ueber POST /api/releases; Paritaets-Tor als CI-Blocker | 13, vor 04 |
| 18-agent-style-gate | Guardrails als harte Tests im Schreibpfad (Token-Zwang, origin-Integritaet, CSS-Grenzen) | 07+13, mit 02 Punkt 7 |
| 19-motion-authoring | Motion-Spec v2 im Editor: Modell/Bridge, Inspektor, Canvas (Play), Guardrails - **M0-M5 umgesetzt 18.09.** (self-hosted Runtime, `motion-data` v2, FOUC-Pending, Freeze, Inspektor+MCP+Skill, Play-Preview, Profil-Gates); offen: M4 Stufe 1 (Ticket 03). Plan: `.scratch/motion-v2/`, ADR-0006 | 07, 13, 02, 03 |
| 20-site-settings-profile | Site-Profil in den Editor: Kanal (`PATCH /api/sites/:id` mit `profile`), Topbar-Anzeige, Wechsel-Validierung, Profil-Gates - **umgesetzt 18.09.** (F6/F7) | 07, 19 |
| 21-klassen-am-dom | User-Klassen (`node.classes`) + deterministische Scope-Klasse am Wurzelelement; macht die Anker-Selektoren (`[data-node-id].cls`, `[data-node-id].__senify_scope_<id>`) in Canvas und Bake treffend - **umgesetzt 18.09.** (eigener Fund) | 07, 13 |
| 22-scoped-rekey-bake | Draft→komponiert-ID-Map aus `composePageTree`, pro Route an den Bake, scoped-Regeln in `styleRulesCss` remappen - **umgesetzt 18.09.** (Rest aus 13) | 13, 21 |

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
