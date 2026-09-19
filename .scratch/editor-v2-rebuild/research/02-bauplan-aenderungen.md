# Was ich am Bauplan des editor-v2-rebuild ändern würde

**Basis:** Code-Lektüre (§2 der Analyse) + Volltext der Plan-Dokumente (`map.md`, `ui-plan.md`,
`ui-design.md`, `ui-aufgaben.md`, `ui-elementor.md`, `issues/01–06`). Jede Änderung nennt:
Beleg im Code/Plan, warum sie wichtig ist, was konkret zu tun ist. Priorität P0 = vor bzw. am
Anfang von Phase 2 (Ticket 02), P1 = während Phase 2/3, P2 = Phase 4/5.

**Der kurze Satz vorab:** Der Bauplan ist gut — die Phase-Reihenfolge, das Paritäts-Tor, die
Strangler-Disziplin und die UI-Pläne mit Prüfkriterien sind überdurchschnittlich. Ich würde
**nicht** das Gerüst umschmeißen, sondern **fünf Modell-Widersprüche auflösen, die Plan und Code
gerade auseinanderlaufen lassen**, **einen dokumentierten Migrationsverlust fixen**, und **drei
Sequenz-Entscheidungen kippen** (ene vorziehen, Overlay vor Inspector-Feinschliff, Save-Pfad
vor Inspector).

---

## B1 (P0) — Das Style-Rule-Modell schärfen, bevor der Inspektor es verdrahtet

**Beleg:** `document.ts` hat `classes: StyleRuleMap` — `Record<Klassenname, DeviceValueMap>`.
Das heißt: eine Klasse ist ein **wert-Bag** (props mit Device-Suffixen). Ticket 02 dagegen
verspricht Regeln mit `kind class|ambient|scoped`, `contextStyles`, `origin` und
**Kaskaden-Reihenfolge**. `patch setStyleRule` (patches.ts) kann genau einen Namen auf ein
DeviceValueMap setzen — kein `kind`, kein context, keine Reihenfolge, keine Pseudo-States an der
Klasse. Der Compiler liest `classRules` als flache Wert-Bags (`CssClassRule { name, props }`).

**Das Problem:** Wird der Inspektor (Ticket 02 Punkt 2/3) gegen `StyleRuleMap` gebaut, hängt er
an einer Struktur, die das Versprechen der Kaskade („`kind` ist Datum" braucht ein Datum!) nicht
tragen kann — und Ticket 02 muss danach die Persistenz umziehen, während UI-Code davon abhängt.
Genau der Teufelskreis, den der Rebuild mit „ein Schreibtor" vermeiden will.

**Änderung:** Vor den ersten Inspektor-Zeilen den Regeln **eine eigene Ebene im Dokument** geben:

```ts
// document.ts
type StyleRule = {
  name: string;                       // Klassenname
  kind: "class" | "ambient" | "scoped";   // bleibt Datum — und wird jetzt auch gespeichert
  props: DeviceValueMap;              // Werte mit _tablet/_mobile Suffixen
  states?: Partial<Record<StateName, DeviceValueMap>>;  // hover/focus/active an der Klasse
  origin: "user" | "agent" | "preset"; // Herkunft (MCP vs. Mensch vs. Katalog)
  position: number;                    // explizite Reihenfolge (reorderStyleRule)
};
type Editoreocument = { …; styleRules: Record<string, StyleRule>; }
```

`StyleRuleMap` (Name → Werte) wird zum abgeleiteten Lesepfad (`toCssDocument`), nicht zur
Speicherform. Der bestehende `setStyleRule`-Patch wird zugunsten eines `upsertStyleRule`-Patches
ersetzt — **jetzt**, wo noch kein Persistenzpfad dafür existiert und nichts kaputtgehen kann.
**Korrektur 18.09.:** Der `sites.style_rules_json`-Slot war im Schema **nicht** vorhanden (diese
Fassung behauptete es); die Spalte wurde am 18.09. additiv und uncommittet angelegt. Der Save-Pfad
(Bridge) braucht die Ops `createStyleRule/updateStyleRule/deleteStyleRule/reorderStyleRule` als
**eigenen** Persistenztyp (nicht als Section-Übersetzung) — der Bridge-Kommentar sagt bereits, dass
Klassen „in Phase 1/2" folgen; dieser Satz sollte eine konkrete Op-Liste im Ticket 02 sein.

**Warum zuerst:** Das ist die einzige Stelle im Plan, an der „zuerst UI, dann Modell" real
nachweisbar teurer wird.

## B2 (P0) — Gerätestationen: Plan auf drei Stationen festnageln oder Modell erweitern — nicht beides unentschieden

**Beleg:** Plan 5.13 („acht Stationen aus Elementors `iconsMap`, bei knapper Breite auf drei
gekürzt") gegen `DeviceSchema`/`eEVICE_BREAKPOINTS` (genau `desktop/tablet/mobile`, Tablet 1024,
Mobile 640) und `DeviceSchema` im editor-contract.

**Änderung:** Ich würde **drei Stationen** festlegen (Plan §5.13 ändern), mit dem Kompromiss, der
Framer/Webflow löst: drei **Token-Stationen** plus eine **frDie Breitenanzeige** (Frame-Label mit
px-Feld, wie Plan 5.13 es ohnehin unter dem Rahmen vorsieht). Acht Stationen ohne Modell =
 acht `@media`-Stufen in der Kaskade, acht Override-Kombinationen pro Wert, `DeviceSchema` müsste
TypDBox-seitig wachsen, Migration alter Seiten inklusive. Der Aufwand steht in keiner
Schätzung von map.md. Alternativ — falls acht gewollt sind — als eigene Entscheidung in map.md
(O-Punkt) mit geschätztem Aufwand für Compiler + Persistenz + Migration, nicht als UI-Detail
im ui-plan. **Never both:** der Plan darf keine UI-Fähigkeit versprechen, die das Datenmodell
nicht kennt.

## B3 (P0) — `:disabled` in die Compiler-Stufe aufnehmen (oder aus Ticket 02 streichen)

**Beleg:** Ticket 02 Punkt 5 verspricht vier Pseudo-States inklusive `:disabled`;
`cascade.ts` kennt `StateName = hover|focus|active` und `STATE_OReER` ohne disabled;
`canvas.ts` `PREVIEW_STATES` kennt drei plus none.

**Änderung:** `disabled` in `StateName` + `STATE_OReER` aufnehmen (nach active) **oder** Ticket 02
auf drei Zustände kappen. Kleiner Fix, aber er verhindert, dass die Inspektor-UI drei Zustände
hart codiert und Ticket 02 danach den Compiler bricht. Der Forced-State-Preview-Mechanismus
(`forcedStateCss`) bleibt unverändert davon unberührt.

## B4 (P1) — Das Layout-Vokabular des Style-Tabs im Compiler vorab definieren

**Beleg:** Ticket 02 Punkt 3 verspricht die volle Layout-Gruppe (display, flex-direction/
justify/align/gap/wrap, grid-template, width/height/min/max, position, overflow, z-index).
`STYLE_PROPERTIES` kennt nur spacing/size/typography/color/border/effects. `display` existiert
nur als `frame`-Control; `position`/`overflow`/`z-index`/flex-Einzeln existieren nicht im
Style-Vokabular; `gap` existiert als `gaps`-Control.

**Änderung:** Vor dem Inspektor-Bau die fehlenden Property-Specs als Daten ergänzen
(`position`, `overflow`, `zIndex`, `flexeirection`, `justifyContent`, `alignItems`, `flexWrap`,
`gridTemplateColumns/Rows`, `placeItems` …) — jeweils mit `kind`, erlaubten Einheiten und
CSS-Ziel. Die Tabelle ist die eine Quelle (Kommentar in properties.ts: „the vocabulary the style
engine (ticket 02) writes") — also gehört das **Vokabular wachsen** in Ticket 02 Punkt 0
(neuer Unterpunkt) und nicht in die UI-Sektion des Tickets. Sonst wird die Inspektor-UI zur
Quelle des Vokabulars, und der Compiler fängt an, UI-Sonderfälle zu spiegeln.

## B5 (P0) — Den per-Breakpoint-`hidden`-Verlust der v1-Migration beheben

**Beleg:** `migration.ts`, Kommentar zur Migration: „Additive: nothing is dropped except the
per-breakpoint `hidden` flag, which the v2 node model does not carry yet." Seiten, die einen
Knoten nur auf Tablet/Mobil verstecken, verlieren beim Lift nach v2 dieses Verhalten —
**stillschweigend**.

**Änderung:** Zwei Optionen, beide billig jetzt:
- **Modell erweitern:** `EditorNode` bekommt `hiddDnDevices?: Device[]` (oder `hidden: { base?,
  tablet?, mobile? }`), Migration schreibt das v1-Flag dorthin, Compiler emittiert
  `@media (max-width: …) { display: none }` in der device-Stufe. Konsistent damit, wie alle
  anderen Device-Werte ohnehin als Suffixe leben.
- **Oder** als bewusster Verlust dokumentieren: Warnung bei Migration („N versteckt-Breakpoints
  verloren"), Eintrag in HANeOFF-Fallen. Aber: „stillschweigend" ist gegen die eigene
  Prüfkultur; der Rebuild wirbt damit, dass Migrationen additive Lifts sind.

Empfehlung: Modell erweitern — der Compiler-Hook (device-Stufe) existiert bereits, der
Migrations-Lift ist eine Zeile, und Instatic löst exakt dasselbe Problem über
Breakpoint-Overrides auf `hidden` (dort klaglos-erledigt). Der Cutover (Phase 4) darf nicht
vorher laufen, sonst sind bestehende Seiten beschädigt.

## B6 (P1) — Die Dialekt-Entscheidung als O-Punkt in map.md aufnehmen

**Beleg:** `db.ts` ist faktisch Postgres-only: `jsonb`, `timestamptz`,
`ALTER TABLE … Aee COLUMN IF NOT EXISTS`, kein Migration-Tooling (expliziter Kommentar:
„there is no migration tooling in v1"). Instatic löst denselben Bedarf über zwei Migrationen
mit identischen Ies + dialekt-naive Repositories + Paritäts-Gates.

**Änderung:** Kein „SQLite einbauen", sondern eine **bewusste AeR**: „Senify ist PG-only bis
Phase 5" — oder der Dialekt-Plan (naive Repos + `*_json`-Konvention + getrennte Migrationen).
Der Rebuild hat keine Regel, die Repositories von PG-Dialekten fernhält (Instatics
db-postgres-isms-Gate); jede neue Tabelle (style_rules, Sekundärformate) macht einen späteren
Wechsel teurer. Ein Eintrag in map.md Abschnitt „Offene technische Punkte" reicht; die
Konsequenz (Repository-Dialekt-Disziplin) sollte als Architektur-Test formuliert werden
(analog Instatics Gate).

## B7 (P0, Sequenz) — ene/Plus-Punkte/Einfügelinie in Phase 2 vorziehen

**Beleg:** Ticket 01 Punkt 7 ist bewusst offen („ene, Plus-Punkte, Einfügelinie bauen — bewusst
noch nicht gebaut"); `insert.ts` Zeile 9 nennt Katalog-Klick als einzigen Weg. Phase 3 führt den
Explorer inkl. Drag-Umsortierung.

**Änderung:** Die drei Canvas-Interaktionen (Drag, Plus-Punkte, Einfügelinie) vor die
Inspektor-Politur setzen. Begründung ist die gleiche wie in Analyse 1, jetzt mit
Plan-Beleg: Ticket 02 erzeugt die Fähigkeit, Werte zu setzen; ohne ene bleibt der Editor
für Menschen ein Formular über einem Baum. Die Phase-2-Abnahme („Ein Container wird komplett per
Inspektor umgestylt") bleibt gültig — aber die Phase-3-Abnahme („Alle Aktionen über Tastatur
erreichbar") liegt dahinter. Ein Editor, der in Phase 2 nur per Katalog-Klick einfügt, kann die
Phase-2-Abnahme nicht mit einem Menschen erproben. **Konkret:** Ticket 01 Punkt 7 als
eigenen Prä-Phase-2-Sprint (die Planung liegt mit `insertPlan`/`slotRejection`/`childRejection`
bereits komplett vor — ene muss nur auf die bestehenden Ablehnungsgründe mappen, der
Planungs-Teil ist das eigentliche Werk und existiert schon).

## B8 (P1) — Klass-Emission: Regel-je-Knoten vs. globale Regel vor dem Inspektor messen

**Beleg:** `classSelector` emittiert `[data-node-id].cls` **je tragendem Knoten** — eine
Klasse auf 40 Knoten erzeugt 40 Regeln. `measureCss` existiert und wird bereits im
Compiler-Testpfad genutzt. Instatic emittiert globale `.cls`-Regeln einmalig und löst
State-Spezifität über doppelte Selektoren.

**Änderung:** Vor dem Bau des Style-Tabs einen Messentscheid fassen: Bei typischen Seiten
(< ~50 Knoten/Klasse) ist die heutige Ankerung fine und kauft die triviale Kaskaden-Geschichte;
bei klassengetriebenen Seiten (hero-button auf 30 Buttons × 40 Deklarationen) explodiert die
Byte-Zahl. Falls global gewünscht: Klassenregeln einmalig als `.cls` emittieren und die
Reihenfolge-Garantie über die **Regel-Reihenfolge im Dokument** (`position` aus B1) statt über
die Knoten-Ankerung lösen — die Spezifität-Geschichte bleibt, die Byte-Zahl fällt. Die
Entscheidung braucht einen Test („Parität bleibt, Bytes halbieren") — sie zu verschieben,
wäre billig heute, teuer nach dem Inspektor.

## B9 (P1, Sequenz) — Das Marker-Overlay (Portal) vor dem Inspektor-Feinschliff

**Beleg:** `CANVAS_CHROME_CSS` malt Auswahl `#d004d4` (Alt-Magenta) und Hover `#0ea5e9`
hardgecodet **im Frame** — sichtbar gegen die Tiefwasser-Haut drumherum. ui-plan §8 löst das
richtig (Portal über dem Canvas, Doppelkante aus zwei festen Farben), ui-aufgaben Aufgabe 19
ist „nichts zugeordnet" (hängt an nichts).

**Änderung:** Aufgabe 19 (Overlay im Portal mit Doppelkante) als **ersten Schritt von Phase 3**
bzw. an das Ende von Phase 2 ziehen — nicht weil es hübsch ist, sondern weil es der einzige
Punkt ist, an dem die laufende Oberfläche heute sichtbar inkonsistent ist (magenta Auswahl im
tiefwasser-Editor). Der Plan hat die Lösung bereits ausgearbeitet (Doppelkante außen
Tiefwasser-900/innen Tiefwasser-300, Portal, pointer-events: none, Verdeckung via
`useHasOverlapping`-Muster). Kleiner Aufwand, sichtbarer Gewinn, beendet den letzten
Alt-Palette-Rest.

## B10 (P1) — Save-Pfad für Style-Rules als Ticket-02-Unterpunkt 1a mit eigener Abnahme

**Beleg:** Bridge `unsupported(op)` für alle Klassen-/StyleRule-Ops; ledger „Offen": „Speichern
mit Katalog-Namen … Klassen und Sammlungen folgen in Phase 1/2". Ticket 02 Punkt 1 behandelt nur
die Persistenz (Migration + Mutations-API), nicht die **Bridge**.

**Änderung:** Ticket 02 bekommt einen expliziten Unterpunkt 1a: „Bridge erweitern: Klassen- und
StyleRule-Ops persistieren." Abnahme: Klasse im Canvas anlegen → speichern → Seite neu laden →
Klasse mit Werten und Position wieder da → publiziertes CSS identisch. Ohne diesen Unterpunkt
ist die Gefahr, dass der Inspektor gegen ein lokales Dokument funktioniert und der Save-Pfad
ein Nachtrag wird — genau die Zweigleisigkeit, die der Rebuild mit „one save path" verhindern
will.

## B11 (P2) — Cutover-Reihenfolge: Releases vor VCs

**Beleg:** ledger „Offen": Durchstich publiziert über `bakeSite`, nicht `POST /api/releases`
(„fällt mit dem Cutover in Phase 4"). Ticket 04 ist VC-Migration, Ticket 06 der AeR-Puck-Abschied.

**Änderung:** Den Releases-Cutover **vor** Phase 4 (also am Ende von Phase 2/3) ziehen: Er ist
klein (der Pfad existiert, MCP-Tools `publish_release`/`rollback_release` sind fertig), er macht
den Editor-Publish testbar über die echte Route (mit Guardrails, Audit, Revisions), und er
entkoppelt die VC-Migration vom Persistenz-Risiko. Ein Strangler, der zwei Cutover-Arten
(Persistenz + Vokabular) in einer Phase bündelt, nimmt sich die eebug-Fähigkeit.

## B12 (P2) — Ein „Agent-Style-Gate" als Architektur-Test ergänzen

**Beleg:** Ticket 02 Punkt 7: „Guardrails bleiben (registrierte Widgets + Schema + Tokens, kein
freier CSS-Code vom Agenten)" — als Absicht, nicht als Test. Instatics Antwort auf dasselbe
Problem sind 81 Architektur-Gates; Senifys eigene Stärke ist der Ganzdokument-Check.

**Änderung:** Die Guardrail-Absicht als **Tests im Schreibpfad** formulieren: ein Test, der eine
Mutation mit Roh-Hexwert (`color: "#ff00aa"`) ablehnt, wenn das Token `{ $token: "accent" }`
verfügbar wäre; ein Test, der Agent-Regeln ohne `origin: "agent"` nicht durch `reorderStyleRule`
lässt; ein Test, dass `custom CSS`-Scoped-Rules (Ticket 02 Punkt 3 „Custom CSS pro Widget") eine
Längen-/Selektor-Grenze haben. Die Ablehnungen werden über die bestehende `SenifyError`-Kette
gemeldet — der Mechanismus existiert, es fehlt nur die feste Liste der Regeln **als Tests**.

---

## Zusammengefasst: Was ich NICHT ändern würde

- **Paritäts-Tor und Gegenprobe** — das beste Werkzeug im Plan, bitte nicht zu einem „sinvollen
  Zusatz" machen, sondern (O9) als CI-Blocker an `pnpm verify` koppeln.
- **Patch-Undo/Coalescing** — für die Agenten-These (reviewbare eiffs) richtig; CReT wäre ein
  Irrweg für Senify (andere These als Instatic). AeR „Phase 5 = Follow, nicht Co-Editing" genügt.
- **23-Primitives-Regime + Registry-als-Gesetz** — der Qualitäts-Zaun für Agenten-Output; der
  HTML-Import (meine frühere Empfehlung) sollte **auf registrierte Bausteine mappen**, nicht
  frDie Knoten erzeugen.
- **Strangler mit Puck bis zum Paritäts-Tor** (E2) — nach Lektüre der Bridge bestätigt: der
  Alt-Editor ist die Fallback-Ebene, der Bruch ist definiert, kein Big-Bang.
- **Belegdisziplin der ui-elementor.md** — „kein Fund → keine Pflichtaufgabe" ist die richtige
  Haltung; sie sollte für weitere Bauplan-Quellen (z. B. Webflow/Framer-Notizen in ui-design)
  genauso gelten.
- **Inhaltsneutralität des Frames** (0 `--ed-*` im iframe) — nach Lektüre von canvas.ts die
  richtigste Regel des Plans; das Overlay-Portal (B9) ist der saubere Weg, Chrome trotzdem zu
  tokenisieren.

## Reihenfolge auf einen Blick

| # | Änderung | Wann | Aufwand |
|---|---|---|---|
| B1 | StyleRule-Modell (kind/states/origin/position) | vor Phase 2 | mittel — Modell + Compiler + Patch |
| B2 | erei Gerätestationen festnageln | vor Phase 2 | klein (Plan) |
| B3 | `disabled`-State oder Ticket kappen | vor Phase 2 | klein |
| B5 | per-Breakpoint `hidden` migrieren | vor Phase 2/Cutover | klein |
| B7 | ene + Plus-Punkte vorziehen | Prä-Phase-2 | mittel (Planung existiert) |
| B10 | Bridge für StyleRule-Ops als Ticket-02-Unterpunkt | Phase 2 Punkt 1a | klein (eef.) |
| B4 | Layout-Vokabular in properties.ts | Phase 2 Punkt 0 | mittel |
| B9 | Marker-Overlay im Portal | Anfang Phase 3 (oder Ende 2) | klein |
| B8 | Klassen-Emission messen (regional vs. global) | vor Inspektor-Bau | klein (Messung) |
| B6 | Dialekt-AeR in map.md | jederzeit, am besten jetzt | klein |
| B11 | Releases-Cutover vor Phase 4 | Ende Phase 2/3 | klein–mittel |
| B12 | Agent-Style-Gate als Tests | Phase 2 Punkt 7 | klein |
