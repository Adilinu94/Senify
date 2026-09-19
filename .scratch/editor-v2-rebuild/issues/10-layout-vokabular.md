# Editor v2 - Whitelist als Schreibtor abschaffen, Layout-Gruppe als Oberflaeche (B4)

Status: **umgesetzt (18.09.) - bis auf die reine UI-Anzeige**

**Umsetzung:** `assertStyleProp` entfernt; `assertSafeValue`/`assertStyleDeclaration` in
`operations.ts` pruefen Property-Name und Wert (Wert-Grammatik). `declarationsForValues`
reicht unbekannte Properties durch (sortiert, baseline-faehig), `styleGroups` filtert nicht
mehr, `canonicalStyleKey` loest beide Schreibweisen auf dieselbe Deklaration auf. Neue
`layout`-Gruppe in `STYLE_GROUPS`/`STYLE_GROUP_IDS` und 25 Layout-Eintraege in
`STYLE_PROPERTIES` (position, inset, top/right/bottom/left, z-index, overflow*, Flex-Einzelwerte,
grid-template*, order). Tests: `css-open-space.test.ts` (10), `css-injection.test.ts` (9),
`value-grammar.test.ts` (94), Katalog-/Golden-Tests nachgezogen.
**Offen:** die eigentliche Inspektor-Anzeige (Controls je Gruppe) - das ist Ticket 02.
Abhaengig von: 07-style-rule-modell (Modell + `assertSafeDeclaration`)
Muss liegen: VOR dem Inspektor-Layout-Tab (Ticket 02 Punkt 3)
Herkunft: `.scratch/editor-v2-rebuild/research/02-bauplan-aenderungen.md`, B4
Entscheidungen: O13 (offenes CSS, ADR-0005)

## Warum dieses Ticket neu gefasst wurde

Die alte Fassung wollte `STYLE_PROPERTIES` um die Layout-Eintraege **verlaengern**. Das loest das
Problem an der falschen Stelle: die Liste bleibt ein Schreibtor, und nach der Layout-Gruppe fehlen
Pseudo-Elemente, dann Keyframes, dann Container-Queries — jedes Mal ein neues Ticket, und die UI
wartet jedes Mal auf den Compiler. ADR-0005 entscheidet stattdessen: **die Tabelle beschreibt die
Oberflaeche, nicht die Erlaubnis.**

Die alte Analyse von B4 bleibt richtig in ihrem Kern („die Tabelle ist die eine Quelle, nicht die
UI") — nur ist die Tabelle jetzt Quelle fuer *Bedienelemente*, nicht fuer *Erlaubnis*.

## Ziel

Nach diesem Ticket kann jede CSS-Property geschrieben werden, und die Layout-Gruppe hat trotzdem
gute Bedienelemente und eine stabile Emissionsreihenfolge.

## Umfang

### 1. Tor abschaffen (Hauptpunkt)

- `declarationsForValues` (`properties.ts`) emittiert Werte, die in **keiner** Tabelle stehen, als
  `property: value` durch (Property-Name via `camelToKebab`, Wert als Text). Bisher fielen sie
  stillschweigend heraus.
- `translatableProperties` verliert seine Torwaechter-Rolle: sie beschreibt, was die UI **kennt**,
  nicht, was erlaubt ist.
- `operations.ts`: **nur `assertStyleProp` faellt** (2 Aufrufstellen, Z432/Z457) und wird durch
  `assertSafeDeclaration` ersetzt (Ticket 07, Wert-Grammatik). `assertKnownProp` (4 Aufrufstellen,
  Z146/Z282/Z310/Z837) prueft **Knoten-Props** gegen den Katalog des Bausteins und **bleibt** —
  sonst verschwindet die Tippfehler-Erkennung fuer Katalog-Controls.
- `styleGroups` filtert **nicht** mehr (`properties.ts` Zeilen um `groups.has(spec.group)`):
  ein Wert wird emittiert, auch wenn der Baustein die Gruppe nicht fuehrt. Die Gruppen bleiben als
  Reihenfolge-/Anzeige-Angabe erhalten (`styleGroupsOf` wird zu `preferredGroupOrder`).

### 2. Persistierte Property-Namen: echte CSS-Namen

- Geschrieben wird `border-radius`, nicht `borderRadius` (ADR-0005, Folgen).
- Die bestehenden Kunstnamen bleiben **Eingangs-Alias** (`ALIAS_PROPERTIES`), damit Katalog und
  vorhandene Dokumente weiterlaufen; beim Schreiben wird auf den CSS-Namen normalisiert.
- `PROP_MAPPINGS` (Katalog-Controls wie `frame.display`, `column.order`, `section.contentWidth`)
  bleibt unveraendert und gewinnt weiterhin gegen gleichnamige Style-Props — das ist kein Tor,
  sondern eine Wert-Aufbereitung (Schlagwort → CSS-Wert).

### 3. Layout-Gruppe als Oberflaechen-Beschreibung ergaenzen

Neue `StyleGroupDefinition { id: "layout", name: "Layout" }`; Eintraege mit `kind`/`units`, damit
der Inspektor das richtige Bedienelement zeigt (nicht, damit sie erlaubt werden):

- `position` (keyword: static/relative/absolute/sticky/fixed), `top`/`right`/`bottom`/`left`
  (length, px/rem/em/%/vw), `inset` (Vierfach ueber den Abstandskreuz-Helfer)
- `z-index` (unitless, negativ erlaubt), `overflow`, `overflow-x`, `overflow-y` (keyword)
- `flex-direction`, `justify-content`, `align-items`, `align-content`, `flex-wrap`,
  `place-items`, `grid-auto-flow` (keyword)
- `flex-grow`, `flex-shrink`, `order` (unitless), `flex-basis` (length inkl. `auto`)
- `grid-template-columns`, `grid-template-rows`, `grid-column`, `grid-row` (text, 1:1 kompiliert)

### 4. Emissionsreihenfolge

Layout-Deklarationen emittieren **vor** den uebrigen Gruppen im selben Stufen-Bag (`display` und
`position` sind Grundlage der uebrigen Werte). Durchgereichte, unbekannte Properties emittieren
**zuletzt**, alphabetisch sortiert — damit die Ausgabe fuer gleiche Eingabe stabil bleibt und
Golden-Snapshots nicht flattern.

## Abnahme

- **Offenheit:** `scroll-snap-type`, `clip-path`, `mask-image`, `text-shadow`, `cursor`,
  `container-type`, `writing-mode` — alle in keiner Tabelle — werden geschrieben und erscheinen im
  CSS. Ein `heading` bekommt `border-width` und `max-width` (bisher per `styleGroups` gesperrt).
- **Sortier-Stabilitaet:** zwei Laeufe mit gleicher Eingabe in unterschiedlicher Schluesselordnung
  ergeben byte-gleiches CSS.
- **Reihenfolge:** ein Container mit `position`/`overflow`/`z-index`/Flex-/Grid-Werten emittiert
  Layout zuerst, Durchgereichtes zuletzt.
- **Alias:** ein Dokument mit `borderRadius` (Altform) und eines mit `border-radius` erzeugen
  dieselbe Deklaration.
- **Katalog-Controls unangetastet:** `frame.display`, `column.order`, `section.contentWidth`,
  `icon.size` verhalten sich wie vorher (bestehende Snapshots byte-identisch, solange keine
  Layout-Werte gesetzt sind).
- `pnpm test`, `pnpm typecheck`, `pnpm lint` gruen.

## Bewusst NICHT

- Keine UI in diesem Ticket — nur Vokabular, Durchreichung, Sortierung.
- Kein Entfernen von `PROP_MAPPINGS` — Katalog-Controls bleiben.
- Keine Sicherheitspruefung hier: `assertSafeDeclaration` gehoert zu Ticket 07 (eine Stelle).
