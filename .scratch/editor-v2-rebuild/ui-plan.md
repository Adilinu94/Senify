# Editor v2: verbindlicher UI-Plan (ui-plan.md)

Status: Fassung Runde 80 (Schlussrunde), verbindlich fuer die Umsetzung von Ticket 03 (Editor-Chrome)
Modus: **Operate** (der Nutzer erledigt eine Aufgabe; Scanbarkeit, Erwartbarkeit und eingeuebte
Bedienung stehen ueber Ausdruck, die Marke lebt in den Details)
Sprache: Deutsch, Beschriftungen im Muster Verb plus Substantiv, Satzschreibung, kein Punkt
Geltung: die Oberflaeche des Editors selbst. **Nicht** die ausgelieferten Seiten.
Vorgaenger und Grundlage (nicht ersetzt, sondern ausgefuehrt):
`ui-design.md` (Werte, Regeln, Kontrastnachweise), `packages/editor/src/ui/tokens.ts` (Tokens als Code),
`ui-elementor.md` (Bauplanauswertung mit Dateibelegen), `ui-aufgaben.md` (Aufgabenliste),
`ui-preview/index.html` (Sollbild ohne Buildschritt), `map.md` und `issues/03-editor-chrome.md` (Umfang).

## 0. Was dieser Plan festlegt

Dieser Plan ist **ausfuehrend**, nicht neu erfindend. Er legt fuer jeden Baustein neun Dinge fest:
Zweck, Aufbau, genaue Masse und Tokens, alle Zustaende, Verhalten, Tastatur, Bewegung mit Dauer und
Kurve, Kontrastanforderung und ein Pruefkriterium. Jede Zahl stammt aus `tokens.ts`, aus
`ui-design.md` oder aus `ui-elementor.md` mit Dateibeleg. Wo eine Zahl neu ist, steht die Herleitung
im Text. Der Plan aendert **keinen** Bestand ausserhalb der in `ui-aufgaben.md` genannten Dateien;
die laufende Oberflaeche (`packages/app/public/app.css`, `app.js`) bleibt unberuehrt.

Neue Token-Beduerfnisse aus diesem Plan (in `tokens.ts` zu ergaenzen, Aufgabe 32):

| Token | Wert | Herkunft |
|---|---|---|
| `--ed-h-devicebar` | `28px` | Zeile der Geraetestationen unter dem Rahmen |
| `--ed-w-keys` | `56px` | Kuerselspalte in Menue und Spotlight |
| `--ed-grid-step` | `4px` | Raster und Einrastschritt |
| `--ed-grid-help` | `rgb(154 201 226 / 0.35)` | Rasterhilfe, abgeleitet aus `--ed-signal-select` |
| `--ed-snap-line` | `#cbff97` | Einrastlinie, gleich `--ed-signal-accent` |
| `--ed-marquee` | `rgb(154 201 226 / 0.16)` | Auswahlrechteck beim Aufziehen |
| `--ed-band-margin` | `rgb(248 113 113 / 0.12)` | Aussenband am Rahmen |
| `--ed-band-padding` | `rgb(74 222 128 / 0.12)` | Innenband am Rahmen |

Diese acht Tokens stehen jetzt in `packages/editor/src/ui/tokens.ts` (`EDITOR_METRIC`, `EDITOR_CANVAS`)
und in der Vorschau; `packages/editor/test/ui/plan-tokens.test.ts` prueft sie Wert fuer Wert.

**Stand der Schlussrunde (Runde 80).** Datei, Symbole und Tests sind geerdet:

- **Eine Paletten-Wahrheit.** `packages/tokens/src/default-theme.ts` (`defaultTheme()`) traegt jetzt die
  Tiefwasser-Marke (`brand` `#024364`, `accent` `#006092`, Schattenton `#01121b`) statt Indigo `#4f46e5`.
  Die Editor-Haut (`tokens.ts`) und die Site-Theme-Ausgabe teilen damit dieselben Anker. Alt-Indigo steht
  als `LEGACY_INDIGO` fuer die Ruecknahme.
- **Schrift.** Inter und Inter Display liegen lokal unter `packages/editor/assets/fonts/` (SIL OFL 1.1,
  `LICENSE.txt`) und werden ueber `packages/editor/src/ui/fonts.ts` mit `font-display: swap` in Editor
  und Vorschau eingebunden.
- **Symbole.** Phosphor Icons, Regular, lokal unter `packages/editor/assets/icons/` (MIT, `SOURCE.md`);
  Regular zeichnet im 256er-Raster mit 16 Einheiten Strich = 1.5px bei 24px.
- **Tests.** `packages/editor/test/ui/` prueft Tokens gegen diesen Plan, die Kontraste aus `ui-design.md`
  Abschnitt 8, die Verbotsregeln und die Paritaet der Vorschau.
- **Nachweis (Nachpruefung, Auftragsrunde 60).** Vorschau erneut im echten Browser belegt: berechnete
  Familien Inter (Text) und Inter Display (Titel), sechs geladene Schnitte, 195 von 199 Symbolen gezeichnet
  (die vier uebrigen im eingeklappten "Weitere"-Block, kein Fehler), CLS 0, kein Ueberlauf bei
  1280/1440/1920/480, 41 von 41 Kontrastzeilen, null Konsolenfehler und Fremdanfragen
  (`pruef-schrift-symbole-messung.mjs`, `.scratch/refs/nick/ui/nachweis-schrift-symbole.json`). Die
  **laufende** Editor-Oberflaeche (4322) und die Engine (4321) waren nicht erreichbar (`ECONNREFUSED`)
  und wurden auf Auflage nicht selbst gestartet; dieser Teil des Belegs bleibt offen.

---

## 1. Kopfleiste (topbar)

**Zweck.** Dokument und Modus benennen, die zwei haeufigsten Verluste (Rueckgaengig, Wiederholen)
ohne Zeiger erreichbar halten und **eine** Hauptaktion tragen.

**Aufbau.** Hoehe `--ed-h-topbar` (48px), Innenabstand `--ed-space-3` (12px) waagerecht, Gruppenabstand
`--ed-space-2` (8px). Von links: Marke (Zeichen 20px mit Radius `--ed-radius-sm`, Grund
`--ed-signal-accent`, Zeichen in `--ed-ink-on-lime`; Wortmarke "Senify" `--ed-text-13`
`--ed-font-display` Gewicht 600, Laufweite `--ed-track-display`), Dokumenttitel 13px Gewicht 500 mit
Ellenbogen-Abschnitt, Speicherzustand `--ed-text-11` in `--ed-ink-muted`, Segmentumschalter
**Design | Live** (Hoehe 28px, Radius `--ed-radius-full`, Grund `--ed-surface-inset`, aktives Feld
`--ed-surface-raised` mit `--ed-edge-hairline`). Rechts: Symbolknoepfe 28x28px fuer Rueckgaengig und
Wiederholen, Trennlinie 1px in `--ed-line-hairline`, Zoom-Textknopf (12px, tabellarisch), Hauptaktion
"Veroeffentlichen" (Hoehe `--ed-h-btn-md` 32px, Radius `--ed-radius-full`, Grund `--ed-signal-accent`,
Text `--ed-ink-on-lime`, 12px Gewicht 500). Grund `--ed-surface-raised`, `--ed-edge-top`.

**Zustaende.** Je Knopf: Ruhe, Ueberfahren (`--ed-fill-hover`, 120ms), Aktiv (Inhalt `scale(0.97)`,
160ms), Fokus (2px Ring Lime, 1px Abstand; auf Lime innen 2px `--ed-focus-on-accent` und aussen 2px
Lime), Deaktiviert (Deckkraft 38%, keine Kante, `aria-disabled`, kein Fokusziel). Der
Speicherzustand kennt drei Werte: "Gespeichert 14:26" (`--ed-ink-muted`), "Speichert" mit
Laufbalken 2px in `--ed-signal-select`, "Nicht gespeichert" mit einem 6px Punkt in
`--ed-signal-warning` plus Text (nie nur der Punkt).

**Verhalten.** Der Dokumenttitel ist ein Textknopf und oeffnet das Umbenennen an Ort und Stelle
(`contenteditable`, wie der Ebenentitel in `navigator.scss`), Abschluss mit Enter, Abbruch mit Escape.
Der Modusumschalter zeigt genau einen aktiven Wert; der Wechsel Design/Live bewegt den Inhalt des
Rahmens mit `--ed-t-brand` (1200ms) als Ueberblendung, alles andere mit `--ed-t-4` (240ms).

**Tastatur.** Sprungziele in Reihenfolge: Marke (nur Fokus, keine Handlung), Titel, Modusumschalter,
Rueckgaengig, Wiederholen, Zoom, Veroeffentlichen. `Cmd+Z` / `Shift+Cmd+Z` auch ausserhalb des Fokus.
`Shift+2/3/4` schaltet das Geraet, `Cmd+0` setzt den Zoom zurueck.

**Bewegung.** Ueberfahren und Druck wie in der Zustandsmatrix. Zoomwechsel 200ms
`--ed-ease-standard`. Kein Uebergang beim Setzen des Fokus.

**Kontrast.** Text auf `--ed-surface-raised` mindestens 4,5:1 (weiss 10,56:1, Grundtext 9,94:1,
Nebentext 5,94:1). Fokusring gegen Platte 3:1 (9,19:1). Text auf Lime 13,35:1.

**Pruefkriterium.** Bei 1280px Breite stehen alle sechs Elementgruppen ohne Umbruch in einer Zeile,
`document.documentElement.scrollWidth === clientWidth`. Der veroeffentlichen-Knopf ist der einzige
limefarbene Flaechenknopf auf dem Bild (Messung: genau eine Flaeche mit `#cbff97` und
`background-color` statt `outline`).

---

## 2. Werkzeugleiste (toolbar)

**Zweck.** Die Handlungen, die eine Auswahl betreffen, in Griffweite bringen, ohne das Eigenschaften-Panel
zu belasten.

**Aufbau.** Hoehe `--ed-h-toolbar` (40px), Rand 12px, Gruppen durch 1px Linien (16px hoch,
`--ed-line-hairline`) getrennt, Gruppenabstand `--ed-space-2`. Grund `--ed-surface-panel`,
`inset 0 -1px 0 var(--ed-line-hairline)`. Knoepfe 28x28px als Symbol oder 28px hoch mit Text; Symbole
18px im 24px-Raster, Strich 1.5, `stroke-linecap: round`. Gruppen in dieser Reihenfolge:
Einfuegen (Katalogauswahl 28px hoch, 160px breit; "Danach", "Hinein"), Umformen ("Ebene hoeher",
"Umbenennen", "Duplizieren", "Loeschen"), Zustand ("Verstecken", "Sperren"), Gerät (acht Stationen
als Segment 32px, siehe 5.13), Ansicht (Lineale, Fuehrungslinien, Raster, Gliederung, Entwurf),
Zoom (kleiner, Wert, groesser, einpassen).

**Zustaende.** Wie Abschnitt 1, dazu "aktiv" fuer Ansichts-Schalter als Zustandsflaeche
`--ed-fill-select` mit 2px Lime-Unterkante (nie nur ein Farbwechsel).

**Verhalten.** Eine Handlung ohne Ziel ist deaktiviert, nicht versteckt (Beleg: Elementor
`disabled: isBlocked` in `history/hooks/use-action-props.ts`). Werkzeuge, die eine Auswahl brauchen,
zeigen bei fehlender Auswahl `aria-disabled="true"` und erklären im Tooltip, was fehlt
("Erst eine Ebene waehlen"). Ueber den Ansichtsschaltern steht ein Zaehler, wie viele Hilfen an sind.

**Tastatur.** Tab erreicht jede Gruppe; innerhalb einer Gruppe wandert der Fokus mit den Pfeilen
(wanderndes `tabindex`, ein Ziel je Gruppe per Tab; Beleg `keyboard-nav.js :: rovingTabindex` mit
`orientation: 'horizontal'`, `wrap: true`, `homeEnd: true`). Enter oder Leertaste loesen aus.

**Bewegung.** Ueberfahren 120ms `--ed-ease-standard`, Druck 160ms `--ed-ease-out`. Kein Uebergang
bei Umschaltern und Ansichtsschaltern (Tastaturvorgang, `--ed-t-0`).

**Kontrast.** Symbol `--ed-ink-base` auf Panel 12,69:1. Aktive Unterkante Lime gegen Panel 11,74:1
(groesser als 3:1). Deaktivierte Symbole in `--ed-ink-faint` (2,64 bis 3,83:1), deshalb sind sie
ausdruecklich kein Text und werden nie allein zur Kennzeichnung benutzt.

**Pruefkriterium.** Bei 1280px bleibt die Gerätegruppe sichtbar und die Zoomgruppe ganz; keine
Gruppe bricht um. Jeder Nur-Symbol-Knopf hat `aria-label` mit demselben Wortlaut wie sein Tooltip.

---

## 3. Ebenenliste (Explorer)

**Zweck.** Die Seite als Baum zeigen, damit man eine Ebene findet, ohne im Canvas zu zielen
(die Grundlage von allem, was ohne Zeiger funktioniert).

**Aufbau.** Breite `--ed-w-explorer` (264px), verstellbar 200 bis 360px. Grund `--ed-surface-panel`,
`inset -1px 0 0 var(--ed-line-hairline)`. Kopfzeile 36px: Titel `--ed-micro` (11px, gesperrt 0.06em,
`--ed-ink-muted`), Zaehler als Abzeichen (Hoehe 16px, Radius `--ed-radius-sm`, Grund
`--ed-surface-inset`, 10px tabellarisch). Darunter Dokumenttabs als Zeile 36px: Seiten, Vorlagen,
Komponenten, Medien (12px Gewicht 500, aktives Feld mit 2px Lime-Unterkante; Abstand
`--ed-space-3` statt `--ed-space-4`, weil der Explorer schmaler ist). Filterfeld 28px.
Baum: Zeilenhoehe `--ed-h-row` (28px), Einzug `--ed-indent` (16px) je Stufe, ab Stufe 8 kein weiterer
Einzug und stattdessen Tiefenabzeichen 10px. Zeilenbestandteile: Ausklapp-Dreieck 12px (nur bei
Kindern, dreht 90 Grad), Typsymbol 14px, Name 12px Gewicht 500 (`--ed-ink-base`, aktiv
`--ed-ink-strong`), rechts Zustandssymbole 14px (versteckt, gesperrt, geerbt). Die Zeile ist der Griff;
es gibt kein eigenes Griffssymbol.

**Zustaende.** Ruhe, Ueberfahren (F +6% Weiss, 120ms), Aktiv (Flaeche bleibt, **kein** Skalieren),
Fokus (2px Lime innerhalb des Zeilenrandes, `outline-offset: -2px`), Ausgewaehlt (F 14% Tiefwasser 300
plus 2px Lime links, Name `--ed-ink-strong`), Deaktiviert (nur Symbol in `--ed-ink-faint`, kein Ziehen),
gesperrt (`cursor: not-allowed`, Symbol Schloss), versteckt (Deckkraft 50% auf Name und Zustandssymbol,
Beleg `navigator.scss`), geerbt (Zustandssymbol "Kette" 14px).

**Verhalten.** Ziehen erzeugt eine 2px Lime-Einfuegemarke ueber die volle Breite; ein unzulaessiges Ziel
zeigt 2px in `--ed-signal-danger` und **keine** Marke. Waehrend des Ziehens wird der Ausklappzustand
nicht geaendert. Umbenennen: Doppelklick auf den Namen (auch F2); der Name wird schreibbar, ein
Klick ausserhalb uebernimmt, Escape verwirft. Bei mehr als einer Auswahl steht vor jedem Namen ein
Kaestchen 14px (Ruhe: 1px `--ed-line-control`; gewaehlt: Lime mit Haken in `--ed-ink-on-lime`).
Der Baum rendert nur die sichtbaren Zeilen plus sechs Vorrat (Fensterrendern,
`ceil(panelhoehe / 28) + 6`). Das Filterfeld loest Treffer nicht im Baum auf, sondern klappt den Pfad
auf und hebt die Trefferzeilen mit `--ed-fill-select` hervor.

**Tastatur.** Pfeil hoch/runter bewegt die Auswahl, Pfeil rechts/links klappt auf und zu,
Home/End an die Raender des sichtbaren Bereichs (Beleg: `rovingTabindex` mit `orientation: 'vertical'`,
`wrap: false` fuer den Baum, weil Umlaufen am Ende den Orientierungssinn zerstoert). `Enter` springt in
den Canvas, `F2` benennt um, `Delete` loescht, `Escape` leert die Auswahl. Klick mit Shift waehlt den
Bereich, Strg/Cmd ergaenzt. Der Fokus liegt auf der Zeile und zeigt keinen Ring am Kaestchen.

**Bewegung.** Ueberfahren 120ms. Kein Uebergang fuer Aufklappen und Zeilenwechsel (Liste, hunderte
Bewegungen am Tag). Die Zustandsspalte steht still (Abweichung von Elementor, Begruendung in
`ui-elementor.md` Abschnitt 26).

**Kontrast.** Name `--ed-ink-base` auf Panel 12,69:1, aktiv weiss 13,48:1. Zustandssymbole
`--ed-ink-faint` (Nicht-Text). Auf der Auswahlflaeche steht **kein** `--ed-ink-muted` (Regel aus
`ui-design.md` 8.3); dort gilt `--ed-ink-base` oder `--ed-ink-strong`.

**Pruefkriterium.** Bei 1000 Ebenen stehen hoechstens `ceil(560/28) + 6 = 26` Zeilen im DOM (Messung).
Shift-Klick waehlt den Bereich, Strg/Cmd ergaenzt, Escape leert. Ein Zyklus wird als unzulaessiges
Ziel abgelehnt (2px rot, keine Marke).

---

## 4. Eigenschaften-Panel (Inspektor)

**Zweck.** Den Wert der ausgewaehlten Ebene an einer Stelle setzen, mit sichtbarem Bezug auf
Gerätepunkt und Zustand.

**Aufbau.** Breite `--ed-w-inspector` (320px), verstellbar 260 bis 420px. Grund `--ed-surface-panel`,
`inset 1px 0 0 var(--ed-line-hairline)`. Tabzeile 36px mit drei Tabs: Inhalt, Stil, Erweitert
(12px Gewicht 500; Ruhe `--ed-ink-muted`, aktiv `--ed-ink-strong` und 2px Lime-Unterkante).
Darunter bei Bedarf die Zustandszeile 28px (normal, hover, focus, active; Beleg
`pseudo-states.ts :: DEFAULT_PSEUDO_STATES`) und die Gerätezeile 28px. Inhalt: Abschnittskopf 32px
(`--ed-micro`, Dreieck rechts, ganzflaechiger Knopf, `aria-expanded`), Eigenschaftenzeile
`--ed-h-prop` (32px): Label 88px (12px Gewicht 500, `--ed-ink-muted`), Steuerung `1fr`. Grundtext
`--ed-ink-base`.

**Zustaende.** Panel: Ruhe, Laden (Geruest, Abschnitt 15), Fehler (Leiste mit 2px linker Kante
`--ed-signal-danger`). Abschnitt: auf, zu, gemerkt je Sitzung (`useDefaultPanelSettings` als Beleg fuer
"gemerkt"). Zeile: Ruhe, Label hervorgehoben bei Ueberfahren, Steuerung deaktiviert wenn `read-only`,
geerbt (2px Lime links statt Flaeche, weil eine Flaeche hier mit der Auswahlflaeche der Zeile
verwechselt wuerde), "gemischt" bei Mehrfachauswahl (Platzhaltertext 11px `--ed-ink-muted`, kursive
Ziffernstellung aus).

**Verhalten.** Bei Mehrfachauswahl wirkt jede Aenderung auf alle ausgewaehlten Knoten; gemischte Werte
zeigen "gemischt". Ein Wert, der nur am aktuellen Gerätepunkt gesetzt ist, traegt einen Punkt 8px in
`--ed-signal-select` am Feld und im Abschnittskopf einen Zaehler der gesetzten Werte (Beleg
`styles-inheritance-section-indicators.tsx`). Ein Wert, der von einem Vorfahren geerbt ist, steht in
`--ed-ink-muted` und traegt "geerbt"; ein Klick setzt ihn lokal.

**Tastatur.** Sprungreihenfolge: Tabzeile, Zustandszeile, Geraetezeile, dann je Abschnitt der
Abschnittskopf, dann die Steuerungen von oben nach unten. In der Tabzeile wechseln Pfeile den Tab,
Home/End springen an die Raender. `Escape` in einem bearbeitbaren Feld gibt den Fokus an die
**umgebende Zeile** zurueck und **nicht** an den Anfang des Panels (Beleg
`keyboard-nav.js :: escapeFromPanelField` und `parkFocusOnAnchor`); ein zweites Escape verlaesst das
Feldregime.

**Bewegung.** Abschnitt auf/zu 200ms `--ed-ease-in-out` ueber `transform` und `opacity` der Inhaltsgruppe
(kein Uebergang auf `height`). Tabwechsel ohne Uebergang (`--ed-t-0`). Wertewechsel im Feld ohne
Uebergang, weil der Wert selbst die Rueckmeldung ist.

**Kontrast.** Label `--ed-ink-muted` auf Panel 7,59:1; Grundtext 12,69:1; Platzhalter "gemischt" 7,59:1.
Feldkante `--ed-line-control` gegen Panel 3,90:1, gegen gehobene Flaeche 3,06:1.

**Pruefkriterium.** Bei 320px Panelbreite passt "Schriftgroesse" (88px Label) plus Feld plus Einheit in
eine Zeile ohne Beschnitt. Nimmt man einen Wert weg, verschwindet der Gerätepunkt. Wird ein Feld per
Bedingung versteckt und dann der Wert gekappt, ist der Wert danach leer (Beleg: `conditional-field.tsx`
ruft `resetValue()`).

---

## 5. Felder

Gemeinsam: Hoehe `--ed-h-field` (28px), Radius 0, Grund `--ed-surface-inset`,
Kante `inset 0 0 0 1px var(--ed-line-control)`, Innenabstand `0 8px`, Text 12px Gewicht 400,
Zahlen tabellarisch, Uebergaenge 120ms. Fokussiert: 2px Ring in `--ed-focus` **als Schattenring**,
damit die Groesse nicht springt. Fehler: 2px `--ed-signal-danger-ink` plus Symbol 12px plus Meldung
12px darunter (drei Kennzeichen, nie nur Farbe; Beleg `media.scss`/Carbon-Regel in `ui-design.md`).
Alle Felder tragen eine Handlung "Zuruecksetzen" im Zeilenkontextmenue (Abschnitt 5.11).

### 5.1 Zahlfeld mit Schrittgeber
**Zweck.** Genaue Werte setzen, ohne zu ziehen. **Aufbau.** Feld 28px; rechts ein Schrittgeber aus zwei
Knoepfen je 14px hoch und 20px breit mit Symbol 10px; optional Einheit als Anhang 24px breit.
**Zustaende.** Ruhe, Ueberfahren (Kante `--ed-line-strong`), Fokus (Ring), Fehler, Deaktiviert,
"Ausserhalb des Bereichs" (Kante Fehlerrot plus Meldung). **Verhalten.** Pfeil hoch/runter aendert um
`step`, mit Shift um `10 * step`; Eingabe wird erst beim Verlassen uebernommen; ungueltige Eingabe
(`e`, `E`, `+`, bei `min >= 0` auch `-`) wird abgewiesen, und bei ungueltigem Wert stellt das Feld den
letzten gueltigen Wert wieder her (Beleg `number-input.tsx`). **Tastatur.** Pfeile, Shift-Pfeile,
Home/End an die Grenzen, Enter uebernimmt, Escape verwirft. **Bewegung.** Keine (Tastaturvorgang).
**Kontrast.** Wert `--ed-ink-strong` 14,59:1 im Feld; Kante 4,22:1. **Pruefkriterium.** Feldhoehe 28px;
Shift-Pfeil aendert um zehn Schritte; die Eingabe "9-" springt sichtbar zurueck.

### 5.2 Schieberegler mit Einheit
**Zweck.** Grobe Werte schnell, genaue Werte im Feld daneben (ein Regler, zwei Wege).
**Aufbau.** Spur 4px hoch, Radius 0, Grund `rgb(154 201 226 / 0.22)`, Fuellung `--ed-signal-select`;
Griff 12x12px, Radius 0, Grund `--ed-ink-strong`, 1px Kante `--ed-line-control`; Trefferflaeche 24px
hoch (`--ed-hit-min`). Rechts ein Zahlfeld 76px mit Einheitenauswahl (px, %, em, rem, vw, dazu `auto`
und `fx` fuer eigene Werte; Beleg `size-control.tsx`). Optional Kerben in 4px und Bezeichner 9px
unten (`_slider.scss`). **Zustaende.** Ruhe, Ueberfahren (Spur 30%, Griff 14px), Fokus (Ring um den
Griff), Deaktiviert (Spur 12%), "Wert ausserhalb" (Griff am Rand mit Fehlerkante am Feld).
**Verhalten.** Momentwert als Blase 11px in `--ed-surface-raised` mit `--ed-edge-hairline` ueber dem
Griff, ohne Uebergang. Wechsel der Einheit rechnet den Wert nicht um, sondern setzt ihn neu; `auto`
sperrt das Zahlenfeld. **Tastatur.** Pfeile um `step`, Bild auf/ab um `10 * step`, Home/End an die
Grenzen, Tab verlaesst den Griff. **Bewegung.** Ziehen ohne Uebergang (der Finger ist die Bewegung);
Ueberfahren 120ms. **Kontrast.** Spur gegen Panel 1,5:1, deshalb ist der Griff (weiss mit Kante) die
Kennzeichnung und nicht die Spur. Griffkante 3,90 bis 4,44:1. **Pruefkriterium.** Bei 320px laufen Spur
und Feld in einer Zeile, das Feld hat `min-width: 54px` (Beleg `_slider.scss`) und der Wert springt bei
"100 %" und "9,5 %" nicht.

### 5.3 Farbwaehler mit Deckkraft und Palette
**Zweck.** Farbe inklusive Deckkraft setzen und dabei die Themensignale als Palette anbieten.
**Aufbau.** Feld 28px: Farbfeld 20x20px (Radius `--ed-radius-sm`, 1px `--ed-line-control`), Hex in Mono,
rechts Deckkraft in Prozent 11px. Geoeffnet: Platte 240px, Radius `--ed-radius-md`, `--ed-surface-raised`,
`--ed-shadow-float`, Innenabstand 12px. Inhalt: Farbflaeche 160px hoch, Farbtonstreifen 12px,
Deckkraftstreifen 12px ueber Schachbrett (8px), darunter Hex-Feld 28px und Deckkraft-Zahlenfeld mit
"%", dann die acht Themensignale als Felder 20x20px mit Namen in 11px und "Zuletzt" mit vier Feldern
(Beleg `get-recently-used-styles.ts`). **Zustaende.** Ruhe, Ueberfahren, Fokus, Deaktiviert,
"kein Wert" (Schraegstrich-Zeichnung wie `.e-control-color--no-value`), gewaehltes Palettenfeld
(2px Lime). **Verhalten.** Klick setzt den Wert; Alt-Klick setzt `{ $token: ... }` (der
Senify-Tokenbezug bleibt); Escape schliesst ohne Aenderung; das Farbfeld uebernimmt Deckkraft aus dem
Streifen und zeigt sie im Feld. **Tastatur.** Der Ausloeser ist ein Knopf, die Platte faengt den Fokus,
Pfeile bewegen den Farbpunkt um 1, mit Shift um 10, Escape schliesst und gibt den Fokus zurueck.
**Bewegung.** Platte 200ms `--ed-ease-out` aus `scale(0.96)` mit Deckkraft 0, Ursprung am Feld.
**Kontrast.** Hex auf eingelassener Flaeche 13,73:1; Feldkante 4,22:1. Die Deckkraft ist am Schachbrett
ablesbar und nicht nur an einer Zahl. **Pruefkriterium.** Deckkraft ist auf dem Schachbrett sichtbar;
Alt-Klick erzeugt einen Tokenwert; Escape aendert nichts (Vergleich Wert vor und nach).

### 5.4 Umschalter
**Zweck.** Einen zweiwertigen Zustand ohne Text im Innern setzen.
**Aufbau.** 32x18px, Radius `--ed-radius-full`, Bahn `rgb(154 201 226 / 0.26)`, eingeschaltet
`--ed-signal-accent`; Knopf 14px rund, weiss, Kante `rgb(1 40 60 / 0.35)`; Beschriftung links 12px
Gewicht 500. **Zustaende.** Ruhe, Ueberfahren (Bahn 34%), Fokus (Ring 2px Lime mit 1px Abstand),
Deaktiviert (Bahn 12%, Knopf 38%), ein, aus. **Verhalten.** Klick oder Leertaste wechselt; der Zustand
aendert zusaetzlich zur Farbe die Knopfseite (Form, WCAG 1.4.1). **Tastatur.** Leertaste wechselt,
Pfeil links/rechts setzt "aus"/"ein". **Bewegung.** Knopf 160ms `--ed-ease-standard` ueber `translateX`.
**Kontrast.** Bahn gegen Panel 1,6:1, aber die Knopfstellung ist die Kennzeichnung; eingeschaltet ist
Lime gegen Panel 11,74:1. **Pruefkriterium.** Kein Text im Innern; jeder Zustand aendert neben der Farbe
die Form (Messung: `transform` unterscheidet sich, nicht nur `background-color`).

### 5.5 Auswahlfeld
**Zweck.** Aus einer festen Liste waehlen, gruppiert.
**Aufbau.** Ausloeser 28px hoch wie ein Feld, rechts Dreieck 12px. Menue wie Abschnitt 6 (Breite an
den Ausloeser gebunden, 200 bis 320px), Zeilen 32px, Gruppenkoepfe `--ed-micro`, gewaehlte Zeile mit
14% Tiefwasser 300 und Haken 14px. **Zustaende.** Ruhe, Ueberfahren, Fokus, Deaktiviert, offen,
gewaehlt, "leer" (Platzhaltertext `--ed-ink-muted`, keine Kante in Fehlerfarbe). **Verhalten.**
Eintippen springt zum ersten passenden Eintrag; Escape schliesst ohne Aenderung. **Tastatur.** Pfeile,
Buchstabensprung, Home/End, Enter uebernimmt, Escape schliesst und gibt den Fokus zurueck.
**Bewegung.** Kein Uebergang beim Oeffnen (Tastaturvorgang), 200ms nur beim Klick auf den Ausloeser.
**Kontrast.** Gewaehlter Text `--ed-ink-strong` auf Auswahlflaeche 9,96:1. **Pruefkriterium.** Vier
Beschriftungen "Seiten, Vorlagen, Komponenten, Medien" passen bei 264px Explorerbreite in eine Zeile;
der gewaehlte Eintrag ist an Flaeche und Haken erkennbar.

### 5.6 Vierfach-Werte
**Zweck.** Vier Kanten mit einem Griff setzen oder getrennt.
**Aufbau.** Eine Zeile 32px mit vier Feldern `1fr`, Abstand `--ed-space-1`. Jedes Feld traegt links ein
Kantensymbol 12px (Strich 1.5) und keine Textbeschriftung; `aria-label` ist "Margin oben" und so weiter
(Beleg `linked-dimensions-control.tsx`). Davor ein Kettenknopf 24px (`LinkIcon` gegen `DetachIcon`).
**Zustaende.** Ruhe, Ueberfahren (Kante am ueberfahrenen Feld), Fokus (Ring am fokussierten Feld),
Deaktiviert, verkettet, geloest, gesetzt (Kante `--ed-line-control` durchgehend), leer (Platzhalter aus
dem geerbten Wert). **Verhalten.** Verkettet schreibt eine Eingabe in alle vier; geloest schreibt nur in
das eine. Verkettet zeigt nur **ein** Feld mit dem Kantensymbol "alle vier" (wie v4: verkettet ist ein
einzelner Wert), geloest vier. Einzelne Kanten koennen gesperrt sein und zeigen dann Deaktiviert.
**Tastatur.** Pfeil rechts/links springen zwischen den Feldern, Home/End an die Grenzen der Zeile.
**Bewegung.** Keine. **Kontrast.** Symbole `--ed-ink-muted` (Nicht-Text 7,59:1 gegen Panel).
**Pruefkriterium.** Verkettet schreibt eine Eingabe in alle vier Werte (Messung an der Datenstruktur);
geloest nur in eines; Pfeil rechts verlaesst das Feld nicht in die naechste Gruppe.

### 5.7 Wiederholfeld
**Zweck.** Eine Liste gleichartiger Eintraege erzeugen, sortieren, einzeln bearbeiten.
**Aufbau.** Zeilen je 32px mit Greifen (12px), Titel, Wert, Entfernen (14px), Abstand `--ed-space-1`.
Unten ein Geisterknopf "Element hinzufuegen" 28px und rechts der Zaehler "3 von 8" in 11px
tabellarisch. Der Inhalt eines Eintrags wird in einer schwebenden Platte bearbeitet, nicht in der Zeile
(Beleg `repeatable-control.tsx :: EditItemPopover`). **Zustaende.** Ruhe, Ueberfahren (Griffe sichtbar),
Fokus, Deaktiviert, "Mindestzahl erreicht" (Entfernen gesperrt), "Hoechstzahl erreicht" (Hinzufuegen und
Duplizieren gesperrt; Beleg `_repeater.scss`), Ziehen. **Verhalten.** Umsortieren per Ziehen mit 2px
Lime-Einfuegelinie; die ganze Sortierung ist **ein** Rueckgaengig-Schritt. Ein leerer Eintrag zeigt den
Platzhalter aus dem Muster (`patternLabel` mit `${...}`), nicht ein leeres Kaestchen.
**Tastatur.** Tab erreicht Greifen, Titel, Entfernen je Zeile; Alt+Pfeil hoch/runter verschiebt eine
Zeile; Entf entfernt die fokussierte Zeile. **Bewegung.** Zeilenbewegung 200ms `--ed-ease-in-out` ueber
`transform`; kein Uebergang beim Einfuegen und Entfernen (die Zahl aendert sich sichtbar im Zaehler).
**Kontrast.** Zaehler `--ed-ink-muted` 7,59:1; Zeilenkante optional 1px `--ed-line-hairline`
(nur Trennung, 1,54:1, deshalb traegt der Zaehler die Information). **Pruefkriterium.** Bei Erreichen
der Hoechstzahl verschwindet der Hinzufuegen-Knopf (nicht nur deaktiviert); der Zaehler steht in
`tabular-nums`; eine Sortierung erzeugt genau einen Verlaufseintrag.

### 5.8 Medienwahl
**Zweck.** Bild, Video, SVG oder Datei waehlen, ersetzen, entfernen und Groesse bestimmen.
**Aufbau.** Flaeche mit festem Seitenverhaeltnis 21/9 (Beleg `_media.scss`), Schachbrett 16px als
Hintergrund fuer Transparenz, 1px `--ed-line-border`-Entsprechung `--ed-line-control`. Oben rechts
Entfernen 24px Trefferflaeche (Symbol Papierkorb 14px). Unten ein **stehender** Werkzeugstreifen 28px
mit "Ersetzen" und "Zuschneiden" (bei Elementor faehrt der Streifen aus, was wir verwerfen).
Darunter optional die Bildgroessen-Auswahl 28px und ein Hinweis "Ohne Alternativtext" als
Warnzeile 12px in `--ed-signal-warning` mit Symbol. Leerzustand: Zeichen 24px, Aussage "Kein Bild",
Knopf "Bild waehlen". **Zustaende.** Leer, Ruhe, Ueberfahren (Flaeche um 6% Weiss, Werkzeuge sichtbar),
Fokus, Deaktiviert, Laden (Geruest ueber der Flaeche), Fehler (Bildadresse nicht erreichbar). Bilder
kommen in der Vorschau als lokale Zeichnung; im Editor als echte Datei, **nie** als Netzabruf im
Vorschauwerkzeug.

**Verhalten.** Klick auf die Flaeche waehlt, wenn leer, und ersetzt, wenn gefuellt. "Ersetzen" behaelt
das Seitenverhaeltnis bei. Entfernen fragt nicht nach (Rueckgaengig genuegt) und setzt die Flaeche
zurueck in den Leerzustand. Fehlt der Alternativtext, erscheint die Warnzeile (Beleg: die
Alt-Text-Warnung steht in `media.php` als auskommentierter Block; wir aktivieren sie).
**Tastatur.** Die Flaeche ist ein Knopf; Enter oeffnet die Dateiauswahl, Escape schliesst sie.
Entfernen und Ersetzen haben je ein eigenes Fokusziel. **Bewegung.** Ueberfahren 120ms; Laden als
Geruest mit 1200ms Schimmer (`--ed-t-brand`, `--ed-ease-linear`). **Kontrast.** Aussage
`--ed-ink-strong` 12,69:1; Warnzeile `--ed-signal-warning` 8,08:1 gegen Panel.
**Pruefkriterium.** Der Werkzeugstreifen ist ohne Zeiger erreichbar (Tab erreicht "Ersetzen");
das Seitenverhaeltnis bleibt 21/9 in jeder Breite; die Warnzeile erscheint bei fehlendem Alternativtext
und nicht bei vorhandenem (zwei Faelle pruefen).

### 5.9 Typografie-Gruppe
**Zweck.** Acht zusammengehoerige Felder als **eine** Einheit setzen, samt einem Reset fuer die ganze
Gruppe.
**Aufbau.** Ein Abschnittskopf 32px "Typografie" mit Zaehler der gesetzten Werte und einem
Zuruecksetzen-Ziel rechts. Darunter die haeufigen Felder offen (Schriftgroesse als Regler mit Feldeinheit,
Schriftstaerke als Auswahl mit Stufen in Hunderterschritten, Zeilenhoehe als Regler mit Einheiten
px/em/rem, Laufweite), die seltenen hinter "Weitere" (Schriftfamilie, Groesse, Transformation, Stil,
Dekoration, Wortabstand). Alle Felder sind geräteabhaengig (`responsive: true` im Beleg
`typography.php`), also tragen sie bei einer Setzung am Geraetepunkt den Punkt aus Abschnitt 4.
**Zustaende.** Wie die Einzelfelder, dazu "gemischt" (Mehrfachauswahl) und "geerbt".
**Verhalten.** Das Zuruecksetzen der Gruppe setzt nur die Felder zurueck, die wirklich von der Vorgabe
abweichen (Beleg `reset-style-props.tsx`: sichtbar nur bei `!isEqual(value, initial_value)`). Die
Schriftfamilie steuert, ob "Schriftstaerke" als Auswahl oder als Regler erscheint (variable Schriften;
Beleg `add_font_variables_fields()` mit `condition`).
**Tastatur.** Pfeile innerhalb einer Auswahl, Tab zwischen den Feldern, Escape gibt den Fokus an die
Gruppe zurueck.
**Bewegung.** "Weitere" auf/zu 200ms; sonst keine.
**Kontrast.** Zaehler und Gruppenbeschriftung `--ed-ink-muted` (7,59:1), Werte `--ed-ink-strong`.
**Pruefkriterium.** Setzt man Schriftgroesse und Zeilenhoehe, zaehlt der Kopf "2 gesetzt" und das
Zuruecksetzen erscheint; nach dem Zuruecksetzen verschwindet es wieder.

### 5.10 Bedingung
**Zweck.** Ein Feld nur unter Bedingungen zeigen und **sichtbar machen, dass eine Bedingung gesetzt ist**.
**Aufbau.** Zeile 32px aus Auswahl ("sichtbar wenn", "Klasse", "Geraet", "Zustand"), Token-Feld `1fr`
und Signal-Chip 24px. Darunter ein Segment **UND | ODER** 28px (Radius 0, `--ed-seg--plain`), aber nur,
wenn mehr als eine Zeile existiert. Eine leere Bedingung steht in `--ed-ink-faint` **und** traegt die
Beschriftung "Keine Bedingung" (nie nur der Farbunterschied). Verschachtelte Bedingungen haben einen
Einzug 16px und eine Klammer als Linie 1px links.
**Zustaende.** Leer, gefuellt, erfuellt (Chip normal), nicht erfuellt (Chip mit `--ed-line-control`
gestrichelt, nicht rot: eine nicht erfuellte Bedingung ist nicht falsch, sondern nur nicht zutreffend),
Fehler (Token existiert nicht), Deaktiviert.
**Verhalten.** Wird eine Bedingung gekappt, leert sich der abhaengige Wert (Beleg
`conditional-field.tsx`: `resetValue()` beim Kappen). Die Verknuepfung `und` ist Standard (Beleg
`conditions.php`: `$condition_succeed = ! $is_or_condition`). Erlaubte Vergleiche sind die elf aus
`conditions.php`, in der Oberflaeche als Worte: ist, ist nicht, enthaelt, enthaelt nicht, groesser als,
kleiner als, in der Liste, nicht in der Liste.
**Tastatur.** Pfeile im Auswahlfeld, Home/End im Tokenfeld, das Segment wechselt mit Pfeil links/rechts.
**Bewegung.** Keine. Die Zeile erscheint und verschwindet ohne Uebergang, weil eine Bedingung ein
Datenentscheid ist, keine Bewegung.
**Kontrast.** Beschriftung "Keine Bedingung" `--ed-ink-faint` (3,65:1 gegen eingelassene Flaeche),
deshalb steht daneben immer Text und nie nur die Farbe. Erfuellte Chips in `--ed-signal-accent` mit
Text `--ed-ink-on-lime` 13,35:1.
**Pruefkriterium.** Eine leere Bedingung ist an der Beschriftung erkennbar (Test mit
Farbfehlsichtigkeitssimulation). Wird eine Bedingung auf "nie erfuellt" gesetzt, verschwindet das
abhaengige Feld und sein Wert ist danach leer.

### 5.11 Zuruecksetzen
**Zweck.** Einen Wert auf die Vorgabe zuruecknehmen, ohne ihn zu kennen.
**Aufbau.** Eine Zeile im Zeilenkontextmenue am Feld (Abschnitt 6, `Cmd+Shift+Backspace`), dazu ein
gruppenweites Ziel im Abschnittskopf (Abschnitt 5.9) und eines je Panelzustand (Abschnitt 12).
Symbol: Pinsel 16px. **Zustaende.** Verfuegbar, nicht verfuegbar (Wert ist die Vorgabe, Eigenschaft
gesperrt, oder ein Token existiert nicht mehr; Beleg `reset-style-props.tsx`).
**Verhalten.** Zuruecksetzen erzeugt **einen** Rueckgaengig-Schritt und stellt den geerbten oder
vorgegebenen Wert wieder her, nicht "leer". Bei Mehrfachauswahl setzt es alle Ziele zurueck, wenn
mindestens eines abweicht. **Tastatur.** Erreichbar im Zeilenmenue; `Cmd+Shift+Backspace` wirkt auf das
fokussierte Feld. **Bewegung.** Keine. **Kontrast.** Kein Rot: Zuruecksetzen ist keine Loeschhandlung,
sondern eine Ruecknahme. Text `--ed-ink-base` 9,94:1.
**Pruefkriterium.** Steht der Wert auf der Vorgabe, ist das Ziel nicht verfuegbar (Messung ueber
`aria-disabled`); ein Zuruecksetzen erzeugt genau einen Verlaufseintrag mit dem Feldnamen.

### 5.12 Geräteumschaltung (am Panel)
**Zweck.** Einen Wert nur fuer ein Gerät setzen und sehen, wo er gesetzt ist.
**Aufbau.** Zeile 28px mit drei Stationen als Segment (Desktop, Tablet, Telefon), je mit Symbol 14px
und Breite in der Beschriftung, `aria-label` je Station "Telefon, bis 767px" (Muster aus
`labelsMap` in `breakpoints-switcher.tsx`). Rechts ein Textknopf "Alle anzeigen" 24px.
**Zustaende.** Ruhe, Ueberfahren, Fokus, Deaktiviert (kein Override vorhanden und Station nicht aktiv),
aktiv, "hier gesetzt" (Punkt 8px in `--ed-signal-select`), "geerbt" (Punkt hohl).
**Verhalten.** Wechsel der Station aendert **nicht** die Werte, sondern zeigt die Werte dieser Station;
gesetzte Werte erscheinen bei "Alle anzeigen" als vier Spalten. Ein Wert, der nur hier steht, laesst sich
per Zuruecksetzen (5.11) wieder an die groessere Station binden.
**Tastatur.** Pfeil links/rechts wechselt die Station, Home/End an die Raender.
**Bewegung.** Kein Uebergang (Tastaturvorgang).
**Kontrast.** Aktive Unterkante 2px `--ed-signal-select` gegen Panel 7,59:1; Punkte
`--ed-signal-select` (Nicht-Text 7,59:1).
**Pruefkriterium.** Setzt man eine Schriftgroesse am Tablet, zeigt die Station Tablet einen Punkt und
Desktop bleibt ohne; "Alle anzeigen" zeigt genau die Spalten Desktop, Tablet, Telefon.

### 5.13 Gerätestationen der Werkzeugleiste
**Zweck.** Die Arbeitsbreite umschalten, ohne den Wert zu aendern.
**Aufbau.** Segment 32px in der Werkzeugleiste mit acht Stationen (`widescreen`, `desktop`, `laptop`,
`tablet_extra`, `tablet`, `mobile_extra`, `mobile`; Beleg `iconsMap`), beim Kuerzen auf die drei
wichtigsten (1440, 1024, 390) reduziert, wenn die Breite nicht reicht. Unter dem Rahmen eine Zeile 28px
mit dem Namen, der Breite in px und einem Groessenfeld 60x18px (Beleg `_responsive-bar.scss`).
**Zustaende.** Ruhe, aktiv, "Breite angepasst" (breiter als der Fensterinhalt), Deaktiviert.
**Verhalten.** Umschalten aendert nur die Breite des Rahmens und die Skalierungsvariable; es setzt oder
loescht keinen Stilwert. Passt die Breite nicht, ist die Station "Breite angepasst" aktiv und die
Breitenangabe wird durch "Breite angepasst" ersetzt.
**Tastatur.** Pfeile wechseln, `Shift+2/3/4` springen auf Desktop, Tablet, Telefon.
**Bewegung.** Breitenwechsel 240ms `--ed-ease-drawer` (Rahmen bewegt sich, Inhalt nicht).
**Kontrast.** Aktive Station `--ed-surface-raised` mit `--ed-edge-hairline` auf `--ed-surface-inset`
(1,28:1 Flaechenunterschied), deshalb zusaetzlich Symbol und Unterkante.
**Pruefkriterium.** Bei 1024px Breite bleiben drei Stationen; bei 1280px erscheinen alle acht ohne
Umbruch; ein Gerätewechsel erzeugt **keinen** Verlaufseintrag (keine Datenänderung).

---

## 6. Kontextmenue am Element

**Zweck.** Alles, was eine Ebene betrifft, an der Stelle anbieten, an der die Ebene liegt.
**Aufbau.** Breite 200 bis 320px (Vorgabe 256px), Innenabstand `--ed-space-1`, Radius
`--ed-radius-md`, Grund `--ed-surface-raised`, `--ed-shadow-float` plus `--ed-edge-top` und
`--ed-edge-hairline`. Zeilen 32px, Innenabstand 8px, Symbol 16px, Beschriftung 13px Gewicht 500,
Kuersel rechts `--ed-text-11` in Mono mit `min-width: var(--ed-w-keys)` (56px), Untermenue-Dreieck 12px.
Gruppen: Umformen (Umbenennen, Duplizieren, Kopieren, In Zwischenablage), Aussehen (Stil kopieren,
Stil einfuegen, Stil zuruecksetzen), Sichtbarkeit (Verstecken, Sperren), Werkzeuge (Im Navigator zeigen,
Mit Fuehrungslinie ausrichten), Loeschen. Trenner 1px `--ed-line-hairline`, um 8px eingerueckt.
Loeschen traegt Text `--ed-signal-danger-ink` und Symbol `--ed-signal-danger`; Ueberfahren legt
`--ed-fill-danger` unter.
**Zustaende.** Ruhe, Ueberfahren (F +6% Weiss), Fokus (F +8% Weiss plus 2px Lime links), Deaktiviert
(Text `--ed-ink-faint`, kein Fokusziel), Loeschen (rot, auch im Fokus rot), Untermenue offen.
**Verhalten.** Rechtsklick auf ein Element ausserhalb der Auswahl setzt die Auswahl zuerst auf dieses
Element (Beleg: `context-menu.js` ruft `document/elements/deselect-all`). Waehrend das Menue offen ist,
ist das Ziehen im Canvas gesperrt (Beleg: `toggleSortMode(false)`). Hoechstens ein Menue gleichzeitig;
ein Klick daneben schliesst. Abbrechende Eintraege sind deaktiviert, nicht versteckt, und nennen im
Tooltip, was fehlt.
**Tastatur.** Oeffnen mit Shift+F10 oder der Menue-Taste am fokussierten Element. Pfeile bewegen,
Home/End an die Raender, Pfeil rechts oeffnet das Untermenue, Pfeil links schliesst es, Enter loest aus,
Escape schliesst und gibt den Fokus an den Ausloeser zurueck. Der Fokus bleibt im Menue (Fokusfalle).
**Bewegung.** Eintritt 200ms `--ed-ease-out` aus `scale(0.96)` mit Deckkraft 0, `transform-origin` am
Zeigerpunkt. Kein Uebergang beim Oeffnen per Tastatur.
**Kontrast.** Beschriftung `--ed-ink-base` auf gehobener Flaeche 9,94:1. Kuersel `--ed-ink-muted`
5,94:1. Loeschen `--ed-signal-danger-ink` 5,56:1 und Strich 3,82:1. Trennlinie 1,54:1, damit
ausdruecklich nur Trennung, nie Kennzeichnung.
**Pruefkriterium.** Eintritt startet am Zeigerpunkt (Messung `transform-origin`); Escape gibt den Fokus
an das Element zurueck, aus dem geoeffnet wurde; das Loeschen-Ziel ist auch ohne Farbe erkennbar
(Text "Loeschen" plus Symbol).

---

## 7. Spotlight (Befehlspalette)

**Zweck.** Jede Handlung per Tastatur erreichen, ohne die Lage der Schaltflaeche zu kennen.
**Aufbau.** Abdunklung `--ed-scrim` mit `blur(var(--ed-blur-scrim))` (4px). Darueber die **eine**
Glasflaeche: Breite `--ed-w-spotlight` (640px), oben bei 12vh mittig, Radius `--ed-radius-md`, Grund
`rgb(8 50 71 / 0.72)` mit `backdrop-filter: blur(var(--ed-blur-glass))` (10px), `--ed-edge-top`,
`--ed-edge-hairline`, `--ed-shadow-dialog`. Eingabezeile 48px (17px Text, Symbol 18px, rechts `Esc` als
`kbd`). Ergebnisliste mit Gruppenkoepfen 28px (`--ed-micro`) und Zeilen 36px (Symbol 16px, Titel 13px
Gewicht 500, Kuersel rechts 11px Mono). Hoechste Trefferzeile mit 14% Tiefwasser-300-Flaeche und 2px
Lime links. Fusszeile 28px mit den vier wichtigsten Kuerzeln. Die Liste fenstert (nur sichtbare Zeilen
im DOM).
**Zustaende.** Ruhe, Eingabe leer (zeigt "Zuletzt" und die Befehle), Treffer, kein Treffer (Leerzustand:
Symbol Lupe 40px, Aussage "Kein Treffer fuer <Begriff>", Satz, Geisterknopf), Deaktivierter Treffer mit
Grund, erster Treffer markiert.
**Verhalten.** Tippen filtert ueber Befehlsnamen **und** Ebenennamen. Die Kuerselspalte kommt aus dem
Kuerselverzeichnis (Aufgabe 25), es gibt genau eine Quelle. Enter loest aus und schliesst, Shift+Enter
laesst offen, Escape schliesst. Der Fokus faellt in die Eingabe und kehrt danach an die vorige Stelle
zurueck.
**Tastatur.** `Cmd+K` oeffnet und schliesst. Pfeile durch die Treffer (Gruppen werden uebersprungen),
Home/End an die Raender, Bild auf/ab seitenweise, Tab wechselt zwischen Eingabe und Liste.
**Bewegung.** Kein Oeffnungs- und Schliessuebergang (`--ed-t-0`). Der Grund steht in `ui-design.md`:
hunderte Aufrufe am Tag, jede Bewegung wirkt als Verzoegerung.
**Kontrast.** Text `--ed-ink-strong` auf der Glasflaeche: die Flaeche ist `rgb(8 50 71 / 0.72)` ueber
dunklem Canvas, gemessen als Panel (13,48:1). Kuersel `--ed-ink-muted` 7,59:1. Fokuszeile
`--ed-fill-select` mit `--ed-ink-strong` 9,96:1.
**Pruefkriterium.** Kein Uebergang beim Oeffnen (Messung: `transition-duration` an der Flaeche ist 0ms).
Bei 500 Treffern stehen nur sichtbare Zeilen im DOM. Escape schliesst und der Fokus liegt wieder auf
dem Element, von dem aus geoeffnet wurde.

---

## 8. Auswahl und Griffe

**Zweck.** Sehen, was ausgewaehlt ist, und es in der Groesse aendern.
**Aufbau.** Doppelter Rahmen: aussen 1px `rgb(1 40 60 / 0.55)`, innen 1px `--ed-signal-select`
(Abweichung von Elementors Themenfarbe, Begruendung in `ui-elementor.md` Abschnitt 20). Das Overlay
liegt in einem Portal ueber dem Canvas, `pointer-events: none`, `role="presentation"`. Plaetzchen 18px
hoch am linken oberen Eck: 11px Gewicht 500, Grund `--ed-signal-select`, Text `--ed-ink-on-lime`.
Vier Eckgriffe 8x8px, Radius 0, Grund `--ed-ink-strong`, 1px Kante `--ed-signal-select`, Trefferflaeche
auf 24x24px aufgefuellt. Kantengriffe 6x8px fuer Breite und Hoehe. Groesse als Paar `w x h` in 11px
Mono, Abstand als Zahlenpaar ohne Farbe.
**Zustaende.** Ruhe (1px, keine Griffe), Ueberfahren (1px, Plaetzchen mit Name), ausgewaehlt (2px,
4 Griffe), Ziehen (Plaetzchen zeigt die Groesse live), Deaktiviert (gesperrte Ebene: kein Ziehen,
Rahmen in `--ed-line-hairline`), Mehrfach (jedes Element eigener Rahmen, das fuehrende mit gefuellten
Griffen und die uebrigen mit leerem 12px Quadrat an gleicher Stelle).
**Verhalten.** Ein Klick waehlt, ein Klick daneben leert, ein Shift-Klick (Auswahl ist leer) waehlt die
Eltern. Liegt das Ziel hinter einem anderen, wird kein Rahmen gezeichnet, sondern die Auswahl im
Navigator gezeigt (Beleg `useHasOverlapping`). Messungen werden gedrosselt (20ms) gerechnet, nicht bei
jedem Ereignis (Beleg `use-element-rect.ts`).
**Tastatur.** Der Rahmen selbst ist nicht fokussierbar (Zeigerbedienung). Alles, was der Rahmen kann,
ist per Navigator und Panel erreichbar (Groessenfelder). `Escape` geht eine Ebene hoeher, `Enter` eine
Ebene tiefer.
**Bewegung.** Kein Uebergang beim Auswaehlen. Ueberfahren vergroessert die Griffe auf 10px ohne
Uebergang. Aufziehen der Rahmenlinie (Auswahlrechteck) mit `--ed-marquee`.
**Kontrast.** Der Doppelstrich sichert 3:1 auf hellem und dunklem Inhalt: die dunkle Linie traegt auf
hell, die helle auf dunkel. Plaetzchen `--ed-signal-select` gegen Inhalt 7,59:1 und Text darauf
13,35:1.
**Pruefkriterium.** Der Rahmen ist auf weissem Inhalt und auf dunklem Bild sichtbar (zwei Aufnahmen,
je eine Linie erreicht 3:1). Griffe 8px sichtbar, 24x24px Trefferflaeche (Messung
`getBoundingClientRect` des Trefferbereichs).

---

## 9. Lineal und Fuehrungslinien

**Zweck.** Mehrere Elemente an derselben Kante ausrichten, ohne zu raten. Keine Elementor-Erkenntnis
(kein Beleg, siehe `ui-elementor.md` Abschnitt 22); die Werte sind eigene Festlegung.
**Aufbau.** Zwei Lineale, oben und links, je 24px breit. Grund `--ed-surface-panel`, Skala 10px
Gewicht 500 in `--ed-ink-muted`, Hauptstriche 8px, Nebenstriche 4px in `--ed-line-hairline`, Marken
alle 80px mit der Pixelzahl der Buehne, umschaltbar auf Prozent der Rahmenbreite (Rechtsklick auf das
Lineal). Der Nullpunkt wird beim Verschieben des Rahmens mitgezogen. Fuehrungslinien: 1px gestrichelt
(3 3) in `--ed-signal-select` bei 60% Deckkraft; gewaehlte Linie 1px durchgehend in Lime mit
Wertplaetzchen (11px, `--ed-surface-raised`). Fuehrungslinie ziehen aus dem Lineal heraus; Doppelklick
entfernt; Alt-Klick sperrt und zeigt ein Schloss 12px. Ausserhalb der Buehne liegt eine Abdunklung von
8% Tiefwasser 900, damit der Rahmen als Blatt lesbar ist.
**Zustaende.** Lineal aus, an, Ecke (Umschalter px/Prozent), Fuehrungslinie gezogen, gewaehlt, gesperrt,
geloescht. **Verhalten.** Die Fuehrungslinie zeigt ihre Zahl waehrend des Ziehens und beim Ueberfahren
mit der Maus. Hilfslinien werden nicht gespeichert (sie sind eine Ansichtssache); gespeicherte
Ausrichtungen macht man ueber Abstände.
**Tastatur.** `Shift+R` schaltet das Lineal, `Shift+G` die Fuehrungslinien. Waagerechte Fuehrungslinie
mit Pfeil hoch/runter um 1px verschieben, mit Shift um 10px; Entf entfernt sie; Tab erreicht die
gewaehlte Linie ueber die Statusleiste.
**Bewegung.** Keine. Ausnahmen: das Wertplaetzchen erscheint ohne Uebergang, und die Abdunklung
ausserhalb der Buehne blendet mit 240ms.
**Kontrast.** Skala `--ed-ink-muted` gegen Panel 7,59:1. Nicht gewaehlte Fuehrungslinie bei 60%
Deckkraft erreicht **nicht** 3:1, deshalb ist sie nie alleinige Kennzeichnung ihrer Position: die
gewaehlte Linie ist Lime (11,74:1) und traegt eine Zahl.
**Pruefkriterium.** `Shift+R` und `Shift+G` schalten sichtbar; der Nullpunkt wandert mit dem Rahmen
(Messung: Marke "0" liegt auf der Rahmenkante). Doppelklick entfernt eine Linie; Alt-Klick sperrt sie
und die Pfeiltasten bewegen sie dann nicht.

---

## 10. Raster und Einrasten

**Zweck.** Groessen und Positionen auf dem 4px-Takt halten, ohne Zahlen zu tippen.
**Aufbau.** Rasterhilfe als SVG ueber dem Rahmen, `pointer-events: none`, Linien 1px in
`--ed-grid-help` (`rgb(154 201 226 / 0.35)`), Abstand `--ed-grid-step` (4px), mit
`stroke-dasharray: 2 2` und `vectorEffect="non-scaling-stroke"` (Beleg `grid-outline/line.tsx`), damit
die Linie bei jedem Zoom 1 Bildpunkt dick bleibt. Dazu die Rasterlinien des Inhalts aus `use-grid-tracks`
fuer Gitter-Container. Beim Ziehen erscheint eine Einrastlinie 1px in `--ed-snap-line` und das
Wertplaetzchen mit dem eingerasteten Wert.
**Zustaende.** Raster aus, an, feines Raster (1px Hilfslinien, Schritt 4px), grobes Raster
(Marken alle 80px), Einrasten aus, Einrasten an, Einrasten gefangen (Linie und Plaetzchen sichtbar).
**Verhalten.** Beim Ziehen von Rahmen, Griffen, Fuehrungslinien und Ebenen wird der Wert auf
`--ed-grid-step` gerundet (Beleg: `snapToHalfPixel` in `grid-outline-utils.ts` als Vorbild fuer
"erst runden, dann zeichnen"). Alt beim Ziehen hebt das Einrasten auf. Waehrend eines Ziehvorgangs im
Inhalt wird die Rasterhilfe ausgeblendet (Beleg `isDragActiveFromDom`), damit sie nicht mit dem
Einfuegeort um Aufmerksamkeit streitet. Eingabe von Zahlen rastet nie ein (wer tippt, meint es genau).
**Tastatur.** `Cmd+Shift+D` schaltet Raster und Einrasten gemeinsam, `Cmd+Shift+Alt+D` nur das Raster.
**Bewegung.** Keine. Beim Ziehen folgt die Einrastlinie ohne Uebergang, damit man die Rasterung sieht.
**Kontrast.** Rasterhilfe 1,9:1, also ausdruecklich nur Hilfe, nie Kennzeichnung. Die Einrastlinie ist
Lime (11,74:1) und traegt zusaetzlich einen Wert.
**Pruefkriterium.** Mit Raster und Einrasten ergibt jede Ziehbewegung ein Vielfaches von 4px (Messung
ueber fuenf Ziehungen). Bei Zoom 0,5 bleibt die Rasterlinie 1 Bildpunkt dick
(`vector-effect: non-scaling-stroke` im gerenderten Attribut).

---

## 11. Abstandsregler durch Ziehen am Rahmen

**Zweck.** Aussen- und Innenabstand am Objekt setzen, wo man das Ergebnis sieht.
**Aufbau.** Bei ausgewaehltem Element und aktivem Schalter "Abstaende" liegen vier Zonen zwischen
Rahmen und Inhalt (Aussenband) und vier Zonen innerhalb (Innenband). Die Baender sind Flaechen:
Aussenband `--ed-band-margin`, Innenband `--ed-band-padding`, je mit Zahlenwert in 11px Mono an der
Mitte der Kante. Gegriffen wird an der Bandkante (Trefferflaeche 12px, Zeiger `ns-resize`/`ew-resize`).
**Zustaende.** Baender aus, an, Ueberfahren einer Kante (Band voll gesaettigt, Wert sichtbar),
Ziehen (Wert live, Einrasten nach Abschnitt 10), Wert nicht gesetzt (Baender der anderen Elemente
bleiben sichtbar als duenne 1px Linie), Deaktiviert (gesperrtes Element).
**Verhalten.** Ziehen schreibt in dasselbe Feld wie Abschnitt 5.6 (eine Wahrheit, zwei Wege) und
setzt das Feld auf `$token`-Anzeige, wenn es die Vorgabe trifft. Shift beim Ziehen setzt alle vier
Kanten gleich (Verkettung). Der ganze Ziehvorgang ist **ein** Rueckgaengig-Schritt (Beleg: das
Zusammenfassen ist unser `coalesceKey`; Elementor erzeugt je Zwischenwert einen Schritt, was wir
verwerfen).
**Tastatur.** Der Abstand ist ohne Zeiger ueber die Vierfach-Felder (5.6) erreichbar; `Alt+F` legt den
Fokus auf das erste Abstandsfeld der Gruppe; die Baender sind reine Zeigerhilfen und nicht fokussierbar.
**Bewegung.** Keine. Werte folgen ohne Uebergang, weil ein nachlaufender Wert ein falsches Bild gibt.
**Kontrast.** Baender sind Flaechen bei 12% Deckkraft und damit unter 3:1; deshalb traegt der Zahlenwert
(`--ed-ink-base` 12,69:1 auf Panel, auf dem Inhalt als 11px auf `--ed-surface-raised`) die Information.
**Pruefkriterium.** Ein Zug an der Oberkante landet auf demselben Wert wie die Eingabe ins Feld (zwei
Wege, ein Wert). Der ganze Zug ergibt genau einen Verlaufseintrag. Die Baender erscheinen nur am
ausgewaehlten Element.

---

## 12. Mehrfachauswahl

**Zweck.** Mehrere Ebenen gleichzeitig aendern, ohne den Zustand zu verlieren.
**Aufbau.** Bei mehr als einer Auswahl: Kaestchen 14px vor jedem Ebenennamen (Abschnitt 3), das
fuehrende Element mit gefuellten Griffen, die uebrigen mit einem leeren 12px Quadrat. Im Panel steht
ueber jeder Gruppe ein Zaehler "3 Ebenen" (11px, `--ed-ink-muted`); im Kopfleistenbereich der
Statusleiste steht "3 ausgewaehlt" mit einem Zuruecksetzen der Auswahl (Textknopf 24px).
**Zustaende.** Einzeln, mehrere, alle in einer Gruppe, gemischt (Werte unterschiedlich), leer.
**Verhalten.** Klick = einzeln, Shift-Klick = Bereich, Strg/Cmd-Klick = ergaenzen oder entfernen,
Escape = leeren, `Cmd+A` = alle Geschwister. Jede Aenderung wirkt auf alle ausgewaehlten Knoten, auch
wenn ein Knoten den Wert nicht kennt (dann wird er beim Ziel nicht gesetzt und im Panel als "nicht
zutreffend" gezaehlt). Loeschen zeigt in der Rueckmeldung die Zahl: "3 Ebenen geloescht" mit
"Rueckgaengig". Verschieben mehrerer Ebenen ist erlaubt, wenn alle dasselbe Ziel haben; sonst ist Ziel
deaktiviert mit Grund im Tooltip.
**Tastatur.** Im Navigator Shift+Pfeile erweitert, Strg/Cmd+Pfeile ergaenzt, Space schaltet das
Kaestchen, `Cmd+A` alle Geschwister.
**Bewegung.** Keine. Das Erscheinen der Kaestchen ist sofort (sonst verschiebt sich der Name).
**Kontrast.** Zaehler `--ed-ink-muted` 7,59:1. Kaestchen gewaehlt Lime mit Haken in `--ed-ink-on-lime`
13,35:1. Auf Auswahlflaechen kein `--ed-ink-muted` (Regel aus `ui-design.md` 8.3).
**Pruefkriterium.** Bei drei ausgewaehlten Ebenen schreibt ein Wert in alle drei (Messung an der
Datenstruktur). Ein gemischtes Feld zeigt "gemischt" und nicht den Wert der ersten Ebene. Escape leert
die Auswahl und die Kaestchen verschwinden sofort (kein Uebergang).

---

## 13. Kopieren und Einfuegen von Stilen

**Zweck.** Ein Aussehen auf ein anderes Element uebertragen, ohne Klassen von Hand zu setzen.
**Aufbau.** Drei Handlungen: "Stil kopieren" (`Cmd+Alt+C`), "Stil einfuegen" (`Cmd+Shift+V`),
"Stil zuruecksetzen" (`Cmd+Shift+Backspace`). Kein eigener Behaelter in der Kopfleiste; im
Kontextmenue am Element und in der Spotlight-Liste. Wenn ein Stil in der Zwischenablage liegt, steht in
der Statusleiste "Stil kopiert von hero / ueberschrift" mit einem Textknopf "Verwerfen".
**Zustaende.** Nichts kopiert (Einfuegen deaktiviert mit Grund), kopiert, eingefuegt (kurze Rueckmeldung
in der Statusleiste, kein Toast bei einem Element), eingefuegt auf mehrere (Toast mit Zahl und
"Rueckgaengig"), Fehler (Quell-Klasse existiert nicht mehr).
**Verhalten.** Uebertragen werden zuerst die **Klassen ohne den lokalen Stil**, dann der lokale Stil,
und die Klassen werden entdoppelt (Beleg `paste-style.ts`: `getClassesWithoutLocalStyle()` und
`Array.from(new Set([...classes, ...currentClasses]))`). Steht das Ziel in einer anderen Vorlage,
wird der Stil als lokaler Stil eingefuegt und nicht als Klasse (Klasse nur bei gleicher Vorlage).
Der ganze Vorgang ist ein Rueckgaengig-Schritt.
**Tastatur.** `Cmd+Alt+C` kopiert, `Cmd+Shift+V` fuegt ein, `Cmd+Shift+Backspace` setzt zurueck; alle
drei stehen im Kuerselverzeichnis.
**Bewegung.** Keine. Die Rueckmeldung in der Statusleiste bleibt 3s stehen und wechselt nur den Text
(kein Ein- und Ausblenden, damit die Statusleiste nicht flackert).
**Kontrast.** Statusmeldung `--ed-ink-base` 9,94:1 gegen Kopfleistenflaeche. Ein Fehlerfall steht
zusaetzlich inline am Ziel (`--ed-signal-danger-ink` 5,56:1), nie nur als Toast.
**Pruefkriterium.** Nach "Stil einfuegen" hat das Ziel dieselben Klassen wie die Quelle ohne den lokalen
Stil und zusaetzlich den lokalen Stil (Vergleich der Klassensätze). Eine erneute Einfuegung erzeugt
keine doppelten Klassen. Es entsteht genau ein Verlaufseintrag ("Stil eingefuegt").

---

## 14. Dialoge

**Zweck.** Einen Vorgang abfragen, der eine Entscheidung braucht (veroeffentlichen, loeschen, importieren).
**Aufbau.** Abdunklung `--ed-scrim` mit `blur(var(--ed-blur-scrim))`. Platte Breite
`min(var(--ed-w-dialog), calc(100vw - 32px))` (560px), Radius `--ed-radius-md`, `--ed-surface-raised`,
`--ed-shadow-dialog`, `--ed-edge-top`. Kopfzeile 48px (Titel 15px `--ed-font-display` Gewicht 600,
Schliessen 28px, Unterkante 1px). Inhalt 16px Innenabstand. Fusszeile 56px, rechts ausgerichtet:
Geisterknopf "Abbrechen" 32px, Hauptaktion 32px in Lime.
**Zustaende.** Ruhe, Laden (Hauptaktion zeigt "Wird ausgeliefert", Rumpf gesperrt), Fehler (Meldung im
Rumpf, Hauptaktion wird zu "Erneut versuchen"), Erfolg (Dialog schliesst, Toast). Nie zwei Lime-Knoepfe.
**Verhalten.** Modals sind die Ausnahme, nicht das erste Mittel (Werkzeuggrundsatz). Vor dem
Veroeffentlichen ist die automatische Browserpruefung Pflicht (E4 in `map.md`); der Dialog nennt ihr
Ergebnis vor dem Bestaetigen. Escape schliesst nur, wenn nichts laeuft, sonst fragt der Dialog
"Vorgang abbrechen?". Fokusfalle im Dialog, Fokus kehrt zum Ausloeser zurueck.
**Tastatur.** Erster Knopf traegt den Fokus (bei Gefahr der Abbrechen-Knopf), Tab bleibt im Dialog,
Enter bestaetigt, Escape schliesst, `Cmd+Enter` bestaetigt immer (Beleg Raycast-Muster in
`ui-design.md`).
**Bewegung.** Eintritt 200ms `--ed-ease-in-out` aus `scale(0.98)`, Austritt 120ms. Kein Uebergang,
wenn der Dialog per Tastatur geoeffnet wurde.
**Kontrast.** Titel weiss auf gehobener Flaeche 10,56:1; Meldung im Rumpf `--ed-ink-base` 9,94:1;
Fehlermeldung `--ed-signal-danger-ink` 5,56:1.
**Pruefkriterium.** Genau eine Lime-Handlung je Dialog; Fokus kehrt zum Ausloeser zurueck (Messung
`document.activeElement`); Escape waehrend eines Laufs bricht nicht ab.

---

## 15. Zustandsflaechen: leer, laden, fehler

**Zweck.** Bei jeder Wartezeit und jedem Fehler sagen, was los ist und was zu tun ist.
**Aufbau.** Leer: mittig, Symbol 40px Strich 1.5 in `--ed-ink-muted`, Aussage 13px Gewicht 500
`--ed-ink-strong`, ein Satz 12px `--ed-ink-muted` bis 36 Zeichen Breite, ein Geisterknopf 28px.
Laden: Geruestzeilen 28px in der Form der spaeteren Zeilen, Grund `rgb(154 201 226 / 0.12)`, Schimmer
1200ms `--ed-ease-linear` von links nach rechts, darueber ein Laufbalken 2px in `--ed-signal-select`;
bei Nachladen bleiben die vorhandenen Zeilen mit 45% Deckkraft stehen. Fehler: Feld (Kante, Symbol,
Meldung), Panel (Leiste mit 2px linker Kante `--ed-signal-danger`, Aktion "Erneut versuchen"),
Buehne (Karte 16px Innenabstand, Aussage, fehlgeschlagene Adresse in 11px Mono, Geisterknopf).
**Zustaende.** Die drei genannten, dazu "leer wegen Filter" (nennt den Suchbegriff) und "leer wegen
Rechten" (nennt die fehlende Berechtigung).
**Verhalten.** Kein Kreisel im Editor (Beleg: Carbon-Regel "Geruest statt Spinner bei erwarteter
Wartezeit" in `ui-design.md` Abschnitt 9). Ein Fehler steht **zusaetzlich** inline und nie nur als
Toast. Die Buehne bleibt auch im Fehlerfall bedienbar: Kopfleiste, Panels und Speichern funktionieren.
**Tastatur.** Der Leerzustand hat genau ein Fokusziel (die Handlung). Die Fehlerleiste hat genau ein
Fokusziel. Der Ladezustand ist nicht fokussierbar und meldet `aria-busy="true"` am gesperrten Bereich
mit `aria-live="polite"`, damit ein Vorleser die Aenderung mitbekommt.
**Bewegung.** Schimmer und Laufbalken sind die **einzigen** Dauerbewegungen (1200ms linear, nur
waehrend des Ladens). Unter `prefers-reduced-motion: reduce` steht nur die Deckkraft (kein Schimmer,
kein Lauf).
**Kontrast.** Aussage `--ed-ink-strong` 12,69:1, Satz `--ed-ink-muted` 7,59:1, Fehlertext
`--ed-signal-danger-ink` 7,10:1. Geruestzeilen bei 12% Deckkraft sind unter 3:1 und damit ausdruecklich
nur Platzhalter, keine Information.
**Pruefkriterium.** Kein Kreisel irgendwo im Editor (Suche nach `animation: ... spin`).
Ladeansagen ueberstehen einen Vorleser-Test (`aria-live`). Ein Buehnenfehler laesst Speichern zu
(zwei Klicks: Fehler ausloesen, dann Speichern).

---

## 16. Bewegung: eine Tabelle

Alle Dauern und Kurven aus `tokens.ts`. Es bewegen sich nur `transform` und `opacity` (Regel aus
`ui-design.md` 2.9); die einzige Ausnahme ist die Rahmenbreite beim Gerätewechsel.

| Anlass | Dauer | Kurve | Eigenschaft | Anmerkung |
|---|---|---|---|---|
| Ueberfahren (Flaeche, Kante) | 120ms (`--ed-t-1`) | `--ed-ease-standard` | `background-color`, `box-shadow` | die haeufigste Bewegung, deshalb die kuerzeste |
| Druckrueckmeldung | 160ms (`--ed-t-2`) | `--ed-ease-out` | `transform: scale(0.97)` | nur Knoepfe und Griffe, keine Zeilen |
| Popover, Menue, Toast ein | 200ms (`--ed-t-3`) | `--ed-ease-out` | `transform`, `opacity` | Startwert `scale(0.96)`, Ursprung am Ausloeser |
| Toast aus | 100ms | `--ed-ease-out` | `opacity` | Beleg `design-components.md` |
| Panel andocken, Blatt, Gerätewechsel | 240ms (`--ed-t-4`) | `--ed-ease-drawer` | `transform` | Gerätewechsel: Rahmenbreite |
| Dialog ein / aus | 200 / 120ms | `--ed-ease-in-out` | `transform`, `opacity` | Startwert `scale(0.98)` |
| Erscheinen der Seite im Rahmen, Design/Live | 1200ms (`--ed-t-brand`) | `--ed-ease-linear` | `opacity` | die einzige lange Bewegung |
| Ladeschimmer, Laufbalken | 1200ms (`--ed-t-brand`) | `--ed-ease-linear` | `background-position`, `transform` | nur waehrend des Ladens |
| Einrastlinie, Rasterhilfe | 0ms | keine | keine | die Rasterung muss man sehen |
| Spotlight, Umschalter, Ansichtsschalter, Tabwechsel | 0ms (`--ed-t-0`) | keine | keine | Tastaturvorgaenge animieren nie |

Canvasbewegung im Inhalt: Dauer 600ms als Standard, Verzoegerung 0, Ausgangskurve `Ease In out`, sofern
der Nutzer nichts anderes setzt (Beleg `interaction-details.tsx :: DEFAULT_VALUES`). Einheiten `ms` und
`s`, Vorgabe `ms` (Beleg `time-constants.ts`). Wiederholung nur bei Ausloesern ausserhalb von "Beim
Laden" (Beleg `TRIGGERS_WITHOUT_REPLAY`).

**Pruefkriterium.** Keine Transition ueber 240ms in `src/ui` ausser dem Ladeschimmer und dem Erscheinen
der Seite. Keine Transition auf `top`, `left`, `width`, `height`, `padding`, `margin` (Messung ueber die
berechneten `transition-property`-Werte).

---

## 17. Barrierefreiheit und Tastatur

**Sprungreihenfolge (Tab).** Kopfleiste, Werkzeugleiste, Explorer (Tabzeile, Filterfeld, Baum), Canvas
als Ganzes (Umschalter "Design/Live" und Geraetestationen, **nicht** der Inhalt), Inspektor (Tabzeile,
Zustandszeile, Geraetezeile, dann die Felder von oben nach unten), Statusleiste. Innerhalb von Baum,
Menues, Tabzeilen, Segmenten und Fuehrungslinien wandert der Fokus mit den Pfeilen (wanderndes
`tabindex`; Beleg `keyboard-nav.js :: rovingTabindex`).

**Fokusregeln.** Der Fokusring ist immer sichtbar (`:focus-visible`), 2px Lime mit 1px Abstand. Auf
einer Lime-Flaeche: innen 2px `--ed-focus-on-accent`, aussen 2px Lime (doppelt), weil ein einzelner
Ring gegen Lime unter 3:1 faellt. Der Fokus geht nie in den Canvas-Inhalt (Tab wird dort gesperrt).
Escape in einem bearbeitbaren Feld gibt den Fokus an die umgebende Zeile zurueck und nicht an den
Anfang des Panels (Beleg `escapeFromPanelField` und `parkFocusOnAnchor`); die `keyup`-Phase desselben
Tastendrucks wird geschluckt (Beleg `suppressEscapeKeyUp`), damit ein Dialog nicht zweimal reagiert.
Overlays (Dialog, Popover, Auswahl) behalten Escape fuer sich.

**Kuerzel (Auswahl, Windows in Klammern).** Spotlight `Cmd+K` (`Ctrl+K`), Rueckgaengig `Cmd+Z`,
Wiederholen `Shift+Cmd+Z`, Duplizieren `Cmd+D`, Loeschen `Delete`, Kopieren `Cmd+C`, Einfuegen `Cmd+V`,
Stil kopieren `Cmd+Alt+C`, Stil einfuegen `Cmd+Shift+V`, Stil zuruecksetzen `Cmd+Shift+Backspace`,
Zoom zuruecksetzen `Cmd+0`, Zoom einpassen `Shift+1`, Geraet `Shift+2/3/4`, Inspektor `Cmd+Alt+I`,
Explorer `Cmd+Alt+E`, Lineale `Shift+R`, Fuehrungslinien `Shift+G`, Raster `Cmd+Shift+D`,
Kuerzelverzeichnis `Shift+?`, Kuerzelliste im Spotlight `Cmd+/`. Anzeige: jede Menuezeile und jede
Trefferzeile druckt ihr Kuerzel rechts aus, 11px Mono, `min-width: var(--ed-w-keys)`; auf der Taste
steht das Zeichen (`Cmd`, `Shift`, `Alt`, `Esc`, `Delete`), nie das Wort "Strg".

**Bedienung ohne Maus.** Jede Handlung ist ohne Zeiger erreichbar. Was im Canvas nur am Rahmen geht
(Groesse, Abstand, Position), hat ein Feld im Panel. Was nur per Tastatur erreichbar ist, wird
zusaetzlich im Kuerzelverzeichnis gefuehrt (eine Quelle, Aufgabe 25).

**Vorlesbarkeit.** Reine Dekoration traegt `role="presentation"` beziehungsweise `aria-hidden`
(Auswahlrahmen, Rasterhilfe, Fuehrungslinie, Zustandspunkte). Jedes Nur-Symbol-Ziel traegt `aria-label`
mit demselben Wortlaut wie sein Tooltip (Beleg: `dimensions.php`, `choose.php`, `breakpoints-switcher.tsx`).
Gruppen tragen `aria-label` ("Modus", "Gerät", "Verknuepfung"). Ladebereiche tragen `aria-busy` und
`aria-live="polite"`.

**Pruefkriterium.** Jede Handlung des Editors ist in hoechstens 12 Tabulatorschritten erreichbar
(Messung je Bereich). Kein Kuerzelkonflikt (Test ueber das Kuerzelverzeichnis). Der Fokusring erreicht
in jedem Zustand 3:1 (Nachweis ueber die Tokens). Ein Vorleser nennt jedes Nur-Symbol-Ziel mit Namen.

---

## 18. Kontrastanforderung je Baustein

Grenzen: Text 4,5:1 (WCAG 2.2, 1.4.3), grosser Text ab 24px oder 18,5px fett 3:1, Nicht-Text und
Zustandskennzeichnung 3:1 (1.4.11). Alle Zahlen aus `ui-design.md` Abschnitt 8, im Browser nachgerechnet.

| Baustein | Anforderung | schwaechster Fall | Ergebnis |
|---|---|---|---|
| Kopfleiste | Text 4,5:1, Fokusring 3:1 | Nebentext auf gehobener Flaeche | 5,94:1 |
| Werkzeugleiste | Symbol 3:1, aktive Unterkante 3:1 | Symbol auf Panel | 12,69:1 |
| Ebenenliste | Name 4,5:1, Auswahlkennzeichnung 3:1 | Name auf Panel | 12,69:1 |
| Inspektor | Label 4,5:1, Feldkante 3:1 | Feldkante auf gehobener Flaeche | 3,06:1 |
| Zahlfeld | Wert 4,5:1, Kante 3:1 | Kante im Feld | 4,22:1 |
| Schieberegler | Griffkennzeichnung 3:1 | Kante des Griffs | 3,90:1 |
| Farbwaehler | Hex 4,5:1, Feldkante 3:1 | Kante im Feld | 4,22:1 |
| Umschalter | Stellung als Form, eingeschaltet 3:1 | Bahn aus (nicht alleinige Kennzeichnung) | Knopfstellung traegt |
| Auswahlfeld | gewaehlter Text 4,5:1 | auf Auswahlflaeche | 9,96:1 |
| Vierfach-Werte | Symbole 3:1 | `--ed-ink-muted` auf Panel | 7,59:1 |
| Wiederholfeld | Zaehler 4,5:1 | auf Panel | 7,59:1 |
| Medienwahl | Warnzeile 4,5:1 | Hinweisgelb auf Panel | 8,08:1 |
| Typografie-Gruppe | Werte 4,5:1 | auf eingelassener Flaeche | 13,73:1 |
| Bedingung | Text in jeder Lage 4,5:1 | leere Bedingung | Text vorhanden (3,65:1 nur mit Text) |
| Geraetestationen | aktive Kennzeichnung 3:1 | Unterkante gegen Panel | 7,59:1 |
| Kontextmenue | Beschriftung 4,5:1, Loeschen 4,5:1 | Loeschtext auf gehoben | 5,56:1 |
| Spotlight | Text 4,5:1 | Kuersel | 7,59:1 |
| Auswahl und Griffe | Rahmen 3:1 auf beiden Inhalten | eine der zwei Linien | je Inhalt erfuellt |
| Lineal, Fuehrung | Skala 4,5:1 | auf Panel | 7,59:1 |
| Raster, Einrasten | Hilfe ohne Anforderung, Einrastlinie 3:1 | Lime gegen Panel | 11,74:1 |
| Abstandsbaender | Zahlenwert 4,5:1 | auf Panel | 12,69:1 |
| Dialoge | Titel und Meldung 4,5:1 | Fehlermeldung | 5,56:1 |
| Statusflaechen | Aussage 4,5:1, Gerueste ohne Anforderung | Satz auf Panel | 7,59:1 |

**Regel, die aus einem Grenzwert folgt:** Auf einer Auswahlflaeche wird **kein** `--ed-ink-muted`
gesetzt (4,50:1 ist Grenzfall). Dort stehen `--ed-ink-base` (7,52:1) oder `--ed-ink-strong`.

**Pruefkriterium.** `packages/editor/test/ui/contrast.test.ts` rechnet alle Paare nach, inklusive dieser
Regel, und wird rot, sobald ein Textwert unter 4,5:1 oder eine Nicht-Textkante unter 3:1 faellt.

---

## 19. Umsetzungsreihenfolge mit Abhaengigkeiten

Runde 1 legt das Fundament, jede spaetere Runde setzt genau auf der vorigen auf. Innerhalb einer Runde
ist die Reihenfolge frei.

| Runde | Bausteine | Abhaengig von | Fertig, wenn |
|---|---|---|---|
| 1 Fundament | Tokens und neue Tokens (0), Flaechen, Typo, Bewegung, Symbole | nichts | `tokens.ts` erweitert, `pnpm test` und `typecheck` gruen, Vorschau-Tokenvergleich (Aufgabe 30) stimmt |
| 2 Felder, Grundstock | Zahlfeld (5.1), Schieberegler (5.2), Umschalter (5.4), Auswahlfeld (5.5), Kontrollkaestchen | Runde 1 | vier Felder in allen sechs Zustaenden, Vorschau zeigt sie |
| 3 Felder, Ausbau | Farbwaehler (5.3), Vierfach (5.6), Wiederholfeld (5.7), Zuruecksetzen (5.11), Bedienzeile mit Kontextmenue (6) | Runde 2 | Bedingung kann Felder verstecken, Zuruecksetzen erscheint nur bei Abweichung |
| 4 Panel | Inspektor (4), Typografie-Gruppe (5.9), Geräteumschaltung im Panel (5.12), Mehrfachauswahl im Panel (12) | Runde 3 | gemischte Werte, Erben und Geraetepunkte sichtbar |
| 5 Medien und Bedingungen | Medienwahl (5.8), Bedingung (5.10) | Runde 3 | Alt-Text-Warnung, Bedingungsketten mit UND/ODER |
| 6 Canvas | Auswahl und Griffe (8), Kontextmenue am Element (6), Abstandsregler (11) | Runde 2 | Rahmen, Griffe, Baender, ein Rueckgaengig-Schritt je Zug |
| 7 Canvas-Hilfen | Raster und Einrasten (10), Lineal und Fuehrungen (9), Zoom (2.24), Geraetestationen (5.13) | Runde 6 | Einrasten auf 4px, `non-scaling-stroke` belegt |
| 8 Chrome | Ebene (3), Kopfleiste (1), Werkzeugleiste (2), Statusleiste, Spotlight (7) | Runde 1, Runde 6 | Baum gefenstert, Spotlight ohne Uebergang, Kuerzel aus einer Quelle |
| 9 Stile | Kopieren und Einfuegen von Stilen (13), Zuruecksetzen auf Gruppen | Runde 4, Runde 8 | Klassen entdoppelt, ein Verlaufseintrag je Vorgang |
| 10 Ruhe und Abschluss | Dialoge (14), Zustandsflaechen (15), Bewegungstabelle durchsetzen (16), Tastatur (17), Kontrast (18) | Runden 1 bis 9 | Kontrastrechner gruen, 96 Zustandszellen, keine Bewegung ueber 240ms |

**Kritischer Pfad.** Runde 1 -> 2 -> 3 -> 4 -> (5, 9). Die Canvas-Runden 6 und 7 koennen parallel zu
4 und 5 laufen, weil sie nur Runde 2 brauchen. Runde 8 braucht nur Runde 1 und 6 und kann deshalb
zusammen mit 3 bis 7 laufen. Runde 10 schliesst ab und ist nicht kuerzbar.

**Nicht in diesem Plan.** Rollen und Rechte, Mehrsprachigkeit, Hosting, gleichzeitiges Bearbeiten
(E3 in `map.md`). Favoriten fuer Bausteine: ohne Beleg und deshalb nicht gefordert
(`ui-elementor.md` Abschnitt 14).
