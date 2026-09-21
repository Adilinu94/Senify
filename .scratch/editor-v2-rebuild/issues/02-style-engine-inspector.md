# Editor v2 - Style-Engine und Inspektor (Phase 2)

Status: **erledigt (20.09.)** — Punkt 1 erledigt (18.09.), Scheibe 1 (20.09.), Punkte 3–7 erledigt (20.09., „Ergebnis Runde 2").
Abhaengig von: 01-widget-engine-canvas, 07-style-rule-modell (Dokument-Modell), 10 (Schreibtor)
Entscheidungen: O13/ADR-0005 (offenes CSS), O10 (drei Stationen), O11 (vier Pseudo-States)

## Ziel

Der kritische Pfad fuer "Framer like": jede Widget-Instanz ist komplett individuell stylbar.
Phase 2 des Umbauplans.

**Praezisierung 18.09. (O13/ADR-0005):** „komplett individuell stylbar" heisst ab jetzt
buchstaeblich — der Property-Raum ist offen, nicht auf eine Liste beschraenkt. Der Inspektor zeigt
gute Bedienelemente fuer die bekannten Properties und erlaubt daneben jede weitere CSS-Property;
`STYLE_PROPERTIES` ist Oberflaechen-Beschreibung, kein Tor.

## Umfang

1. ~~Style-Rule-Registry im Engine-Store: sites.style_rules_json (Migration additiv).
   kind class|ambient|scoped, contextStyles, origin, Kaskaden-Reihenfolge.~~
   **ERLEDIGT** (18.09. im Arbeitsbaum vorgefunden, uncommittet): kanonisches Modell in
   `widget-engine/src/css/style-rule.ts`, Spalte `sites.style_rules_json`, Store-CRUD mit Audit,
   Routen `/api/sites/:siteId/style-rules` (+ `reorder`), Tests `engine/test/style-rules.test.ts`.
   Was von Punkt 1 uebrig ist, steht in **Ticket 13** (Editor-Anbindung, Bake, `states` im
   Transport). **Achtung:** `origin` ist im kanonischen Modell die *Import-Herkunft*; die
   Autor-Herkunft heisst `authoredBy` (Ticket 07/18).
   **1a.** Die Ops des Editors adressieren Regeln per `ruleId`, nicht per Name (Ticket 07/13).
2. Inspektor mit drei Tabs (Content / Style / Advanced), Controls generiert aus
   Widget-Definition - nie handgebaut (Registry -> UI bleibt Senify-Philosophie).
3. Style-Tab mit vollen CSS-Faehigkeiten pro Widget:
   - Layout: display, flex-direction/justify/align/gap/wrap, grid-template,
     width/height/min/max, position (static/relative/absolute/sticky), overflow, z-index
   - Box-Model: margin/padding mit verbundenen Feldern + Link-Symbol,
     Einheiten px/%/em/rem/vw, Radius pro Ecke
   - Typografie: font, size, weight, line-height, letter-spacing, align, decoration,
     transform, color
   - Farbe/Hintergrund: Solid, Gradient-Editor, Bild-Fills (asset-ref)
   - Border/Shadow: Border pro Seite, mehrschichtiger Box-Shadow (Layer-Editor)
   - Effekte: Opacity, Blur, Backdrop-Filter, Blend-Mode, Transition
   - Transform: rotate/scale/translate
   - Custom CSS: pro Widget (scoped Rule)
4. Breakpoint-Override-UX: Geraetepunkte an jedem Control (Klick -> Override an/aus,
   Signal bei bestehendem Override, Reset je Breakpoint) - konsistent fuer jede Style-Gruppe.
5. Pseudo-States (:hover / :focus / :active / :disabled) pro Regel mit Forced-State-Preview
   im Canvas (verdoppelter data-node-id-Selektor, Instatic-Muster).
6. Token-Picker neben Freitext in jedem Style-Control ({ $token: accent } bleibt Senify-DNA).
7. MCP-Erweiterung: get_widget, list_widgets, set_styles, create_style_rule.
   Agent bekommt dieselben Style-Faehigkeiten wie der Editor; Guardrails bleiben
   (registrierte Widgets + Schema + Tokens, kein freier CSS-Code vom Agenten).

## Abnahme

- Ein Container wird komplett per Inspektor umgestylt (Farbe, Radius, Shadow, Hover-State,
  Mobil-Override) ohne eine Zeile Section-Code
- Publizierter Output zeigt identisches Ergebnis (Pixel-Diff Canvas vs Bake = 0)
- Geraetepunkt-Signal erscheint bei Override, Reset raeumt auf

## Ergebnis Scheibe 1 (20.09., umgesetzt) — Inspektor-Grundstock

**Modell (`editor/src/inspector/model.ts`):** `buildInspector(...)` liefert je Tab die
Feldliste — Content (Primitive-Props aus dem Katalog), Style (CSS-Gruppen aus der
Wert-Grammatik, Token↔Literal mit Warnung), Interactions (Motion-Spec aus der
Preset-Registry) und Advanced (Verhalten/Sichtbarkeit). Feld-Familien: Zahl/Slider/Switch/
Select/Farbe/Dimensions/Gaps; `numberPart`/`unitOfValue`/`tokenRefOf`/`motionSpecFrom` als
reine Helfer, `INSPECTOR_TABS` als eine Quelle der Tab-IDs.

**UI (`inspector/inspector.ts`, `inspector/styles.ts`):** `createInspector` rendert die Tabs
und je Feld-Familie das passende Control; `tab()/setTab()`, `breakpoint()`,
`onTabChange`/`onBreakpointChange`; `ensureInspectorStyles` liefert die Grundhaut. In der
Canvas-Ansicht hängt der Inspektor als rechte Spalte (`app.js`).

**Funde:** (1) Ein Override entsteht nur auf Tablet/Mobile — Desktop ist der Basiswert, kein
Override; die Anzeige war zuerst falsch. (2) Style-Gruppen müssen je Primitive gefiltert
werden, sonst zeigt der Inspektor Gruppen, die der Baustein nicht kennt.

**Tests:** `packages/editor/test/inspector.test.ts` (12) + Browser-Test (Tabs +
`background` setzen → Canvas und Save-Route). Gesamtlauf siehe Ledger, Welle 1 Teil 4.

**Offen (Rest von Ticket 02):** Breakpoint-Override-UX an jedem Control (Punkt 4),
Forced-State-Preview für Pseudo-States (Punkt 5), Token-Picker an allen Controls (Punkt 6),
die volle CSS-Fläche inkl. Gradient-/Shadow-Layer-Editor (Punkt 3) und die MCP-Tools
(Punkt 7). Bewusste Grenze: Katalog-Primitives sind über die v1-Bridge nicht speicherbar
(E2-Strangler) — der Browser-Test speichert über registrierte Sektionen.

## Ergebnis Runde 2 (20.09., umgesetzt) — Punkte 3 bis 7

**Punkt 4 — Breakpoint-Override-UX:** Jedes responsive Style-Control zeigt drei
Gerätepunkte (`data-dot`, `data-active`, `data-override`). Klick auf ein anderes Gerät
wechselt die Ansicht (Session folgt), Klick auf den **aktiven** Punkt schaltet den Override
an (materialisiert den effektiven Wert) oder aus; Desktop bleibt der Basiswert ohne
Override. Der Reset-Knopf räumt den Override des aktiven Geräts auf (unverändert). Der
frühere „nur bei bestehendem Override"-Filter ist weg — die Punkte sind an jedem Control.

**Punkt 5 — Pseudo-States:** Der Style-Tab hat eine Zustandszeile (Basis + `:hover`,
`:focus`, `:active`, `:disabled`, O11/`STATE_ORDER`). Ein Pseudo-Zustand liest und schreibt
die **scoped Style-Rule** des Knotens (`scopedRuleFor`, `createScopedRule`, `upsertStyleRule`
mit `deviceKey`-Suffixen; leere Regeln werden per `deleteStyleRule` entfernt). Der Chip
erzwingt die Vorschau im Canvas (`onStateChange` → `canvas.setPreviewState`,
`data-preview-state`), die Regel wird als `[data-node-id].__senify_scope_<id>:hover`
kompiliert (die Scope-Klasse trägt jeder Knoten, Ticket 21) — Canvas **und** Bake lesen
dieselbe Regel. **Transport-Fund:** `transportRule` (persist.ts) schickte die `scope` nicht
mit; die Create-Route will `nodeId` (der Patch behält den Scope serverseitig). Behoben und
im `persist.test.ts` verankert.

**Punkt 6 — Token-Picker:** `attachTokenOptions` versorgt jetzt auch Nicht-Farb-Felder
(`TOKEN_GROUP_BY_PROP`: spacing/radius/shadow/type); der Picker (`renderTokenPanel`) listet
Label + Wert, Klick schreibt `{ $token: ref }`, „Literal" löst zurück. Zahlen-/Textfelder
zeigen die Referenz als `{ref}` (das Zahlenfeld wechselt dafür auf `type="text"`) und
parsen sie beim Commit. **Fund:** das frühere gemeinsame `paletteOpen`-Flag öffnete das
Panel unter **jedem** Farbfeld; Paletten und Token-Panels sind jetzt per Feld-Key adressiert
(ein Panel zur Zeit).

**Punkt 3 — Volle CSS-Fläche:** Die eigene Property-Zeile im Style-Tab
(`data-role="add-prop"`, Name + Wert) schreibt jede sichere CSS-Property
(`setNodeProp`/State-Bag, das Schreibtor prüft die Wertform); eigene Properties erscheinen
in der Gruppe „Eigene Properties" (`style/custom`) mit Entfernen-Knopf. Die bekannten
Gruppen (Layout/Typografie/Rahmen/Effekte inkl. `backgroundImage` und `boxShadow`) bleiben
die kuratierten Controls; die Gradient-/Shadow-**Layer**-Editoren bleiben bewusst der
Feinschliff obendrauf (der Wert ist frei editierbar). E2-Grenze: eigene Properties sind auf
registrierten Sektionen nicht speicherbar (v1-Bridge) — der Browser-Test belegt die Zeile
mit einer Sektions-Property (`textColor`), der Modelltest den freien Fall.

**Punkt 7 — MCP-Tools:** `list_widgets`, `get_widget` (Controls + Style-Fläche je Gruppe),
`set_styles` (schreibt die scoped Rule des Knotens, mit `device` und `state`, merge statt
Clash) und `create_style_rule` (class oder scoped, mit `states`). Guardrails: Agents bleiben
auf der Style-Tabelle (unbekannte Property → validation mit Verweis), die Engine-Token-Fence
bleibt in Kraft (roher Token-Farbwert → Fehler mit `$token`-Vorschlag), ambient/rawCss
bleiben menschlich. Der Widget-Katalog kommt über einen Re-Export aus `@senify/registry`
(kein neues Paket im MCP).

**Tests:** `inspector.test.ts` (+3: Tokens, States, Custom-Gruppe), `persist.test.ts`
(+1 Scoped-Transport), `workflow.test.ts` (+1 Tool-Workflow, Tool-Liste erweitert),
`canvas-view-browser.test.ts` (Gerätepunkte, Override an/aus, Token-Panel, Zustands-Chip
mit `:hover` im Frame, eigene Property). Zahlen im Ledger (Runde 2, 20.09.).
