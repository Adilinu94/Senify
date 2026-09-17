# Editor v2: Umsetzungsaufgaben zur Oberflaeche (ui-aufgaben.md)

Reihenfolge zum Abarbeiten. Jede Aufgabe ist klein geschnitten und hat ein Pruefkriterium.
Grundlage: `.scratch/editor-v2-rebuild/ui-plan.md` (verbindlicher Plan je Baustein mit Maszen, Zustaenden,
Tastatur, Bewegung, Kontrast und Pruefkriterium), `.scratch/editor-v2-rebuild/ui-elementor.md`
(Bauplanauswertung mit Dateibelegen, je Erkenntnis uebernehmen, abwandeln oder verwerfen),
`.scratch/editor-v2-rebuild/ui-design.md` (Werte, Regeln, Nachweise),
`packages/editor/src/ui/tokens.ts` (Tokens als Code),
`.scratch/editor-v2-rebuild/ui-preview/index.html` (Sollbild aller Komponenten und Zustaende).
Kein Schritt aendert `packages/app/public/app.css` oder `app.js` (laufende Oberflaeche bleibt unberuehrt).
Die Aufgaben 1 bis 31 sind der Bestand, die Aufgaben 32 bis 47 setzen `ui-plan.md` um.

## Stand der Schlussrunde (Runde 80)

Abgeschlossen in dieser Runde (mit Pruefmittel und Ort):

- **2 Paritaetstest Tokens gegen Palette** – `packages/editor/test/ui/plan-tokens.test.ts` prueft jeden
  Editor-Token Wert fuer Wert gegen `ui-plan.md`/`ui-design.md` und die Palette aus
  `.scratch/refs/precious-board/design.md`; jede Farbabweichung wird rot.
- **6 Symbolbezug festlegen** – Phosphor Icons, Regular (MIT), lokal unter
  `packages/editor/assets/icons/` (Herkunft und Zuordnung in `SOURCE.md`), Regeln in
  `packages/editor/src/ui/icons.ts`. Regular zeichnet 24px-Raster mit 16/256 Strich = 1.5px; eine
  Autoritaetspruefung verhindert handgezeichnete Pfade in `src/ui`.
- **27 Kontrastrechner als Test** – `packages/editor/test/ui/contrast.test.ts` rechnet alle Paare aus
  `ui-design.md` Abschnitt 8 nach, inklusive der Ausnahme `--ed-ink-faint` = nur Nicht-Text.
- **30 Vorschau-Paritaet** – `packages/editor/test/ui/vorschau-paritaet.test.ts` vergleicht Tokens,
  `@font-face`-Liste und Symbolblock der Vorschau gegen `tokens.ts`, `fonts.ts`, `icons.ts`.
- **31 Belegpflicht im Bau** – `pruef-vorschau.mjs`, `pruef-vorschau-schrift-symbole.mjs`,
  `pruef-vorschau-funktionen.mjs`, `pruef-editor.mjs`; Null Konsolenfehler, null fehlgeschlagene
  Anfragen, 41 von 41 Kontrastzeilen, kein Ueberlauf bei 1280/1440/1920/schmal; Screenshots unter
  `.scratch/refs/nick/ui/`.
- **32 Tokens ergaenzen** – die acht Tokens aus `ui-plan.md` Abschnitt 0 stehen in `tokens.ts`
  (`EDITOR_METRIC.deviceBar/keys`, `EDITOR_CANVAS`) und in der Vorschau.
- **1 Tokens in den Editor bringen** – teilweise: die `@font-face`-Regeln und die Editor-Schrift haengen
  am Editor-Host (`styles.ts` + `ui/fonts.ts`, Route `/editor-fonts/*`). Die `--ed-*`-Variablen der
  neuen Editor-Haut einzuspeisen bleibt offen (siehe unten).

Erfuellt aus den sieben Auftragspunkten dieser Runde:

- **Theme-Standard** – `packages/tokens/src/default-theme.ts`: `brand` `#024364`, `accent` `#006092`,
  Schattenton `#01121b` statt Indigo; `LEGACY_INDIGO` als Ruecknahme. `pnpm test` mit den angepassten
  Erwartungswerten (tokens, widget-engine) gruen.
- **Schrift** – Inter/Inter Display lokal unter `packages/editor/assets/fonts/` (SIL OFL 1.1),
  `font-display: swap`, eingebunden in Editor und Vorschau; im Browser ohne Layout-Sprung (CLS 0).

**Nachpruefung (Auftragsrunde 60) – Belege neu gefahren, kein Commit.** Alles Gepruefte neu gemessen
statt aus dem Vorlauf uebernommen:

- `pnpm test` 877 gruen, 2 uebersprungen (879 in 109 Dateien); `pnpm typecheck` und `pnpm lint` gruen.
- Vorschau im echten Browser: `document.fonts.check` fuer Inter 400 und Inter Display 600 je wahr, sechs
  Schnitte geladen, berechnete Familien `Inter, system-ui, sans-serif` (Text) und
  `"Inter Display", Inter, system-ui, sans-serif` (Titel). 195 von 199 Symbolen zeichnen (data-URI-Maske,
  18x18 px); die vier uebrigen liegen im bewusst eingeklappten "Weitere"-Block der Typografie-Gruppe
  (Elternbreite 0) und sind kein Fehler. Null Konsolenfehler, null fehlgeschlagene Anfragen, null
  Fremdanfragen, CLS 0, kein Ueberlauf bei 1280/1440/1920/480, 41 von 41 Kontrastzeilen. Neues Skript
  `pruef-schrift-symbole-messung.mjs`, Ergebnis `.scratch/refs/nick/ui/nachweis-schrift-symbole.json`.
- Aufraeumen: die leere Datei `$null` und die drei leeren Verzeichnisse `-la`, `-p`, `ls` (Reste eines
  PowerShell-Aufrufs) sind entfernt. Weitere Artefakte ausserhalb von `.scratch/`: keine.
  `.commandcode/taste/taste.md` (0 Byte) bleibt liegen, weil es zum Werkzeug gehoert, nicht zum Baum.

Neu offen und ehrlich:

- **Aufgabe 1 (Rest):** `editorTokensCss()` beim Editor-Host einspeisen und `data-senify-editor` setzen,
  damit die neue Editor-Haut (dunkles Tiefwasser) tatsaechlich greift. Der laufende Elementor-nahe
  Editor (T17) bleibt unberuehrt; die Umstellung der Haut ist eine eigene Runde.
- **Aufgabe 31 (Editor-Teil) – offen.** Zur Pruefzeit lief kein Dienst: `http://127.0.0.1:4322`
  (Programm) und `http://127.0.0.1:4321` (Engine) antworteten mit `ECONNREFUSED`, ebenso die Route
  `/editor-fonts/*`. Nach Auflage wurden die Dienste **nicht** selbst gestartet. Damit ist die
  Einbindung von Schrift und Symbolen in der **laufenden** Editor-Oberflaeche in dieser Runde nicht
  neu belegt; der Nachweis gilt nur fuer die Vorschau. Letzter eigener Belegstand:
  `.scratch/refs/nick/ui/pruefung-editor.json` (Oberflaeche montiert, 8 Inter-Flaechen bekannt,
  Schrift geladen, 0 Fehler).
- **Aufgabe 26/28/29:** Zustandsprobe (96 Zellen) und Panel-Andocken der neuen Haut sind noch nicht als
  Messung verankert. Die Layoutprobe je Breite ist fuer die **Vorschau** verankert (kein Ueberlauf bei
  1280/1440/1920/480, `pruef-vorschau.mjs`); fuer die **neue Editor-Haut** nicht, weil sie im Editor
  noch nicht greift (Aufgabe 1).
- **Font-Umfang:** die Laufschrift des Inhalts (`defaultTheme().fonts`) bleibt Sora/Inter ohne
  `files`; Inter/Inter Display sind bisher nur die Werkzeugschrift. Eine Inhalts-Auslieferung braucht
  eigene `files` je Schnitt.

## A. Fundament

**1 Tokens in den Editor bringen.**
`packages/editor/src/ui/tokens.ts` ist angelegt. Aufgabe: `editorTokensCss()` beim Aufbau des Editor-Hosts in ein `style`-Element schreiben und `data-senify-editor` auf den Wurzelknoten setzen.
Abhaengig von: nichts.
Pruef: Im Browser traegt der Editor-Wurzelknoten alle `--ed-*`-Variablen; `pnpm typecheck` und `pnpm lint` gruen.

**2 Paritaetstest Tokens gegen Palette.**
Neuer Test `packages/editor/test/ui/tokens.test.ts`: jeder Farbwert ist entweder ein Anker der Designsprache oder eine im Kommentar dokumentierte Mischung genau zweier Anker. Dazu die 22 Nachweispaare aus `EDITOR_CONTRAST_PROOF` mit der Luminanzfunktion aus `packages/tokens` nachrechnen (Toleranz 0,02).
Abhaengig von: 1.
Pruef: Test gruen; wird ein Hexwert von Hand veraendert, wird er rot.

**3 Flaechen und Lichtkanten als Primitiven.**
`Surface`, `Plate`, `PanelHead`, `Divider` in `src/ui`. Vier Flaechenstufen, Ebenen ueber `inset 0 0 0 1px`.
Abhaengig von: 1.
Pruef: In `src/ui` gibt es ausser `--ed-shadow-float` und `--ed-shadow-dialog` keinen `box-shadow`; jede Platte traegt `--ed-edge-hairline`.

**4 Typo-Primitiven.**
`Text` (12px), `Micro` (11px gesperrt), `Label` (12px, Nebentext), `MonoNum` (tabellarisch). Feste px-Werte, keine Fluid-Groesse.
Abhaengig von: 1.
Pruef: In `src/ui` kommt kein `clamp(`, `vw` oder `rem`-Schriftwert vor; jeder Titel nutzt `--ed-font-display`.

**5 Bewegungs-Hilfe.**
`motion.ts` mit den sechs Dauern und vier Kurven, Umschaltung auf `prefers-reduced-motion: reduce`.
Abhaengig von: 1.
Pruef: Keine Transition ueber 240ms in `src/ui` ausser dem Ladeschimmer und dem Laufbalken (beide 1200ms linear); unter reduzierter Bewegung bleibt nur Opazitaet.

**6 Symbolbezug festlegen.**
Einen Strichsatz einbinden (Vorschlag Phosphor Regular, Alternative Tabler), Strich 1.5, 24px-Raster, ein Gewicht global.
Abhaengig von: nichts.
Pruef: Keine handgezeichneten SVG-Pfade in `src/ui`; alle Symbole kommen aus der Bibliothek und tragen `aria-label` oder sichtbaren Text.

## B. Komponenten

**7 Knopffamilie.**
Rand, Geist, Loeschen, Haupt in Lime, Nur-Symbol. Sechs Zustaende.
Abhaengig von: 3, 4, 5.
Pruef: Der Fokusring auf Lime ist doppelt (innen 2px `#01283c`, aussen 2px Lime); Druckrueckmeldung 160ms; Deaktiviert 38% ohne Kante.

**8 Felder.**
Zahlfeld mit Schrittgeber (14px Knoepfe, Schritt 1, Shift 10), Einheit als Anhang, Fehlerzustand mit Meldung.
Abhaengig von: 4.
Pruef: Feldhoehe 28px; Kante `--ed-line-control` erreicht 3,06:1 auch auf `--ed-surface-raised`; Fehler erscheint als Kante plus Symbol plus Text.

**9 Schieberegler.**
Spur 4px, Griff 12px ohne Radius, Trefferflaeche 24px, Wertblase, Einheitenauswahl px, %, em, rem, vw.
Abhaengig von: 8.
Pruef: Tastatur vollstaendig (Pfeile mit Schritt, Bild auf und ab mit zehn Schritt, Home und End an die Grenzen); Wertblase erscheint ohne Uebergang.

**10 Farbwaehler.**
Feld 28px mit Farbfeld 20px, Hex in Mono, Deckkraft in Prozent. Platte 240px: Farbflaeche, Farbtonstreifen, Deckkraftstreifen ueber Schachbrett, Hex, Deckkraft, acht Themensignale, "Zuletzt".
Abhaengig von: 8.
Pruef: Deckkraft ist auf dem Schachbrett ablesbar; Alt-Klick setzt `{ $token: ... }`; Escape schliesst ohne Aenderung.

**11 Umschalter, Kontrollkaestchen, Segment.**
Reiner Umschalter 32x18px, Kaestchen 14px, Segment als Pille.
Abhaengig von: 7.
Pruef: Kein Text im Innern des Umschalters; jeder Zustand aendert neben der Farbe auch Form oder Ausrichtung.

**12 Vierfach-Werte.**
Vier Felder je 1fr mit Kantenzeichen 12px, Kettenknopf 24px.
Abhaengig von: 8.
Pruef: Verkettet schreibt eine Eingabe in alle vier, geloest nur in eines; Pfeil rechts und links springen zwischen den Feldern.

**13 Wiederholfeld.**
Zeilen 32px mit Greifen, Inhalt, Entfernen; Knopf "Element hinzufuegen"; Zaehler tabellarisch.
Abhaengig von: 8.
Pruef: Umsortieren per Ziehen mit 2px Lime-Einfuegelinie; Zaehler in `tabular-nums`.

**14 Bedingung.**
Zeile aus Auswahl, Token-Feld und Chip; Segment UND und ODER.
Abhaengig von: 11.
Pruef: Eine leere Bedingung steht in `--ed-ink-faint` und ist zusaetzlich an der Beschriftung erkennbar, nie nur an der Farbe.

**15 Tabs.**
Panel-Tabs mit Lime-Unterkante, Dokument-Tabs im Explorer mit 12px Abstand.
Abhaengig von: 3.
Pruef: Vier Beschriftungen passen bei 264px Panelbreite in eine Zeile ohne Beschnitt; Pfeiltasten wechseln ohne Uebergang.

**16 Ebenenzeile und Baum.**
Zeile 28px, Einzug 16px, ab Stufe 8 Tiefenabzeichen, Zustandssymbole rechts, Ziehen, Mehrfachauswahl, Fensterung.
Abhaengig von: 3, 4.
Pruef: Bei 1000 Ebenen stehen nur die sichtbaren Zeilen plus sechs im DOM (Messung); Shift-Klick waehlt den Bereich, Strg oder Cmd ergaenzt, Escape leert.

**17 Kontextmenue.**
Breite 200 bis 320px, Zeilen 32px, Gruppen mit Trenner, Kuerzelspalte 56px, Untermenue, Loeschen in `--ed-signal-danger-ink`.
Abhaengig von: 3, 5.
Pruef: Eintritt 200ms aus dem Zeigerpunkt (Startwert 0.96); Escape schliesst und gibt den Fokus an den Ausloeser zurueck.

**18 Spotlight.**
Eingabe 48px, Gruppen 28px, Treffer 36px, Fusszeile 28px, Genau eine Glasflaeche mit 10px, Abdunklung 4px.
Abhaengig von: 5.
Pruef: Oeffnet ohne Uebergang (0ms); Escape schliesst; Ergebnisliste fenstert.

**19 Auswahlrahmen, Griffe, Groessenanzeige.**
Doppelter Rahmen, Plaetzchen 18px, vier Eckgriffe 8px mit 24px Trefferflaeche, Kantengriff.
Abhaengig von: nichts.
Pruef: Rahmen auf hellem und dunklem Inhalt sichtbar (eine der beiden Linien erreicht 3:1); Ueberfahren vergroessert auf 10px ohne Uebergang.

**20 Lineal und Hilfslinien.**
Lineal 24px mit Marken, Nullpunkt mit dem Frame verschoben, Ziehen, Doppelklick entfernt, Alt-Klick sperrt, Wertplaetzchen.
Abhaengig von: 19.
Pruef: `Shift+R` schaltet das Lineal, `Shift+G` die Hilfslinien (Webflow-Konvention); gewaehlte Linie 1px Lime mit Wert.

**21 Toasts.**
Vier Arten, Stapel unten mittig, Anhalten bei Ueberfahren und verborgenem Tab, Zusammenfassung ab vier.
Abhaengig von: 3, 5.
Pruef: Einblenden 150ms, Ausblenden 100ms; hoechstens drei sichtbar; jede Art traegt ein eigenes Symbol (nie nur Farbe).

**22 Dialog.**
Breite bis 560px, Kopf 48px, Fuss 56px, Abdunklung mit 4px, Fokusfalle, Escape.
Abhaengig von: 7.
Pruef: Genau eine Lime-Aktion je Dialog; Fokus kehrt zum Ausloeser zurueck; `Escape` schliesst.

**23 Leerer, Lade- und Fehlerzustand.**
Leer mit Zeichen 40px und einer Handlung; Laden als Geruest in Zeilenform mit 1200ms Schimmer und 2px Laufbalken; Fehler als Feld, Panel und Buehne.
Abhaengig von: 3, 4, 5.
Pruef: Kein Kreisel im Editor; Fehler erscheint zusaetzlich inline und nie nur als Toast.

## C. Verhalten und Pruefung

**24 Sprungreihenfolge und Fokusring.**
Reihenfolge Kopfleiste, Werkzeugleiste, Explorer, Canvas, Inspektor, Statusleiste; wanderndes `tabindex` in Baum und Menues; Canvas sperrt Tab.
Abhaengig von: 16, 17, 18.
Pruef: Jede Handlung des Editors ist ohne Zeiger erreichbar; der Fokusring ist in jedem Zustand sichtbar und erreicht 3:1.

**25 Kuerzelverzeichnis und Anzeige.**
Kuerselverzeichnis als eine Quelle; Anzeige rechts in jeder Menuezeile und Trefferzeile, 11px Mono, Mindestbreite 56px.
Abhaengig von: 17, 18.
Pruef: Kein Kuerselkonflikt; jede Zeile mit Kuersel druckt es aus; Windows-Schreibweise ueber Umschaltung.

**26 Zustandsprobe je Komponente.**
16 Komponenten in sechs Zustaenden als pruefbares Sollbild (Vorschau-Snapshot oder Storybook).
Abhaengig von: 7 bis 23.
Pruef: 96 Zellen vorhanden; keine Zelle ohne sichtbaren Unterschied zur Ruhe ausser dort, wo der Zustand nicht vorgesehen ist.

**27 Kontrastrechner als Test.**
`packages/editor/test/ui/contrast.test.ts` rechnet die Paare aus Abschnitt 8 des Dokuments nach, inklusive der Regel "auf Auswahlflaechen kein `--ed-ink-muted`".
Abhaengig von: 2.
Pruef: Test rot, sobald ein Textwert unter 4,5:1 faellt oder eine Nicht-Textkante unter 3:1.

**28 Layoutprobe.**
1280, 1440, 1920 und schmales Fenster; Panels angedockt, Blatt erst unter 1024px.
Abhaengig von: 3.
Pruef: Kein waagerechter Ueberlauf (`document.documentElement.scrollWidth === clientWidth`); Statusleiste sichtbar; Buehne scrollt allein.

**29 Panelbreiten und Ziehen.**
Explorer 200 bis 360px, Inspektor 260 bis 420px, Doppelklick auf der Trennkante setzt den Standard.
Abhaengig von: 28.
Pruef: Breite bleibt nach Neuladen erhalten; Ziehen erzeugt keinen Sprung und keinen waagerechten Ueberlauf.

**30 Vorschau-Paritaet.**
Kleines Pruefskript, das die in der Vorschau einkopierten Tokens gegen `packages/editor/src/ui/tokens.ts` vergleicht.
Abhaengig von: 2.
Pruef: Eine Abweichung laesst das Skript mit Fehler enden; ohne Abweichung endet es mit 0.

**31 Belegpflicht im Bau.**
Playwright oeffnet die Vorschau und prueft Konsolenfehler, fehlgeschlagene Anfragen, Kontrastzeilen und Ueberlauf; Screenshots nach `.scratch/refs/nick/ui/`.
Abhaengig von: 28, 30.
Pruef: Null Konsolenfehler, null fehlgeschlagene Anfragen, 41 von 41 Kontrastzeilen ohne Abweichung, Screenshots je Breite vorhanden. Die Vorschau umfasst dabei auch die Zusatzabschnitte 6 und 7 (Aufgaben 33 bis 43), also 1280, 1440, 1920 und schmal, je ohne Ueberlauf.

## D. Zusatzbausteine aus dem UI-Plan

**32 Tokens ergaenzen.**
Die acht neuen Tokens aus `ui-plan.md` Abschnitt 0 in `packages/editor/src/ui/tokens.ts` aufnehmen (Geraetezeile 28px, Kuerselspalte 56px, Rasterschritt 4px, Rasterhilfe, Einrastlinie, Auswahlrechteck, Aussen- und Innenband).
Abhaengig von: 1.
Pruef: `editorTokensCss()` gibt alle acht aus; die Vorschau (Aufgabe 30) findet keinen Unterschied zwischen `tokens.ts` und der einkopierten Liste; `pnpm typecheck` und `pnpm lint` gruen.

**33 Medienwahl.**
Flaeche mit Seitenverhaeltnis 21 zu 9 auf Schachbrett 16px, Entfernen 24px Trefferflaeche, stehender Werkzeugstreifen 28px mit Ersetzen und Zuschneiden, Bildgroessen-Auswahl, Leerzustand mit einer Handlung, Warnzeile bei fehlendem Alternativtext.
Abhaengig von: 8.
Pruef: Seitenverhaeltnis bleibt in jeder Breite 21 zu 9 (Messung); der Werkzeugstreifen ist ohne Zeiger erreichbar (Tab erreicht "Ersetzen"); die Warnzeile erscheint bei fehlendem Alternativtext und nicht bei vorhandenem.

**34 Typografie-Gruppe.**
Abschnitt mit Zaehler der gesetzten Werte, offene haeufige Felder, seltene hinter "Weitere", ein Zuruecksetzen fuer die ganze Gruppe, alle Felder geraeteabhaengig.
Abhaengig von: 4, 9.
Pruef: Zaehler stimmt mit den gesetzten Werten ueberein (Test mit zwei Setzungen); das Gruppen-Zuruecksetzen verschwindet, wenn alles auf der Vorgabe steht; "Weitere" merkt sich seinen Zustand nicht ueber einen Elementwechsel hinweg.

**35 Bedingung ausbauen.**
Zeile aus Auswahl, Token-Feld und Chip, Segment UND und ODER (Standard UND), Einzug und Klammerlinie fuer verschachtelte Bedingungen, sichtbar leerer Zustand mit Beschriftung, Reset des abhaengigen Werts beim Kappen.
Abhaengig von: 11.
Pruef: Eine leere Bedingung ist an der Beschriftung erkennbar, nicht nur an der Farbe; wird eine Bedingung auf "nie erfuellt" gesetzt, ist der abhaengige Wert danach leer (Test); UND ist der Standard.

**36 Zuruecksetzen als Feldwerkzeug.**
Eine Aktion "Zuruecksetzen" im Zeilenkontextmenue am Feld, Kuerzel `Cmd+Shift+Backspace`, sichtbar nur, wenn der Wert von der Vorgabe abweicht und die Eigenschaft nicht gesperrt ist, gruppenweites Ziel im Abschnittskopf.
Abhaengig von: 8, 17.
Pruef: Steht der Wert auf der Vorgabe, ist die Aktion `aria-disabled` (Messung); ein Zuruecksetzen erzeugt genau einen Verlaufseintrag mit dem Feldnamen; kein Rot (nicht als Loeschhandlung gestaltet).

**37 Geraetestationen in der Werkzeugleiste und Geraetezeile.**
Acht Stationen als Segment 32px (bei knapper Breite auf drei gekuerzt), darunter eine Zeile 28px mit Name, Breite und Groessenfeld 60x18px, Zustand "Breite angepasst".
Abhaengig von: 7, 28.
Pruef: Ein Geraetewechsel erzeugt keinen Verlaufseintrag (keine Datenänderung); bei 1024px bleiben drei Stationen sichtbar; bei "Breite angepasst" ersetzt der Text die Breitenangabe.

**38 Geraeteumschaltung im Panel.**
Zeile 28px mit drei Stationen und einem Textknopf "Alle anzeigen", Punkt 8px fuer hier gesetzte Werte, hohler Punkt fuer geerbte, `aria-label` je Station mit Breitenangabe.
Abhaengig von: 9, 37.
Pruef: Eine Setzung am Tablet zeigt den Punkt nur am Tablet (Messung); "Alle anzeigen" zeigt genau drei Spalten; Pfeiltasten wechseln die Station ohne Uebergang.

**39 Kontextmenue am Element.**
Breite 200 bis 320px, Zeilen 32px, Gruppen mit Trenner, Kuerselspalte 56px in Mono, Untermenue, Loeschen in Rot mit unterlegter Flaeche; Rechtsklick auf ein Element ausserhalb der Auswahl setzt zuerst die Auswahl; Zeigepunkt als Ursprung.
Abhaengig von: 3, 5, 17.
Pruef: Eintritt 200ms aus dem Zeigerpunkt (Messung `transform-origin`); Escape schliesst und der Fokus liegt auf dem Ausloeser (Messung `document.activeElement`); das Oeffnen per Tastatur hat 0ms Uebergang; Ziehen im Canvas ist waehrend des offenen Menues gesperrt.

**40 Abstandsregler am Rahmen.**
Vier Aussen- und vier Innenbaender als Flaechen mit Zahlenwert auf einer Platte, Greifen an der Bandkante, Schreiben in dasselbe Feld wie das Vierfach-Feld, Shift setzt alle vier, ein Rueckgaengig-Schritt je Zug.
Abhaengig von: 12, 19.
Pruef: Ein Zug an der Oberkante ergibt denselben Wert wie die Eingabe ins Feld (Test); der ganze Zug ergibt genau einen Verlaufseintrag; die Baender erscheinen nur am ausgewaehlten Element.

**41 Raster und Einrasten.**
SVG-Hilfe 1px gestrichelt (2 2) mit `vector-effect: non-scaling-stroke`, Schritt 4px, Linien in `--ed-grid-help`, Einrastlinie in Lime mit Wert, Ausblenden der Hilfe waehrend eines Ziehvorgangs, Alt hebt das Einrasten auf.
Abhaengig von: 19.
Pruef: Jede Ziehbewegung ergibt ein Vielfaches von 4px (fuenf Ziehungen messen); bei Zoom 0,5 traegt die Linie `vector-effect: non-scaling-stroke` und bleibt 1 Bildpunkt dick; Zahlen mit der Hand rasten nie ein.

**42 Mehrfachauswahl ausbauen.**
Kaestchen 14px vor jedem Namen, fuehrendes Element mit gefuellten Griffen und die uebrigen mit leerem Quadrat, Zaehler im Panel, gemischte Werte als "gemischt", Sammel-Rueckmeldung mit Rueckgaengig, Bereichsauswahl mit Shift.
Abhaengig von: 16.
Pruef: Drei ausgewaehlte Ebenen erhalten eine Aenderung (Test an der Datenstruktur); ein gemischtes Feld zeigt "gemischt" und nicht den Wert der ersten Ebene; Escape leert und die Kaestchen verschwinden ohne Uebergang.

**43 Stile kopieren und einfuegen.**
"Stil kopieren" `Cmd+Alt+C`, "Stil einfuegen" `Cmd+Shift+V`, "Stil zuruecksetzen" `Cmd+Shift+Backspace`; erst die Klassen ohne den lokalen Stil, dann der lokale Stil, entdoppelt; Rueckmeldung in der Statusleiste bei einem Ziel, Toast mit Zahl bei mehreren; genau ein Verlaufseintrag.
Abhaengig von: 9, 10, 17.
Pruef: Nach dem Einfuegen stimmen die Klassensaetze (ohne lokalen Stil) plus lokaler Stil mit der Quelle ueberein; eine zweite Einfuegung erzeugt keine doppelten Klassen; genau ein Verlaufseintrag "Stil eingefuegt".

**44 Fokus- und Escape-Vertrag.**
`Escape` in einem bearbeitbaren Feld gibt den Fokus an die umgebende Zeile zurueck (nicht an den Anfang des Panels), die `keyup`-Phase desselben Tastendrucks wird geschluckt, Overlays behalten `Escape`, im Canvas ist Tab gesperrt.
Abhaengig von: 24.
Pruef: Nach `Escape` aus dem dritten Feld einer Gruppe liegt der Fokus auf der Zeile und der naechste Tab verlaesst sie nach unten (Test); ein Dialog reagiert auf einen Tastendruck nur einmal.

**45 Vorlesbarkeit.**
Reine Dekoration traegt `role="presentation"` oder `aria-hidden` (Auswahlrahmen, Rasterhilfe, Fuehrungslinie, Zustandspunkte); jedes Nur-Symbol-Ziel traegt `aria-label` mit demselben Wortlaut wie sein Tooltip; Gruppen tragen `aria-label`; Ladebereiche tragen `aria-busy` und `aria-live`.
Abhaengig von: 6, 24.
Pruef: Kein Nur-Symbol-Ziel ohne vorlesbaren Namen (Suche ueber Symbolknoepfe ohne `aria-label`); der Auswahlrahmen ist nicht fokussierbar und nicht vorlesbar; jede Gruppe hat ein `aria-label`.

**46 Bewegung durchsetzen.**
Keine Transition ueber 240ms ausser Ladeschimmer und Erscheinen der Seite (1200ms), keine Transition auf `top`, `left`, `width`, `height`, `padding`, `margin`, kein Eintritt aus `scale(0)`, keine Dauerbewegung ausser Schimmer und Laufbalken.
Abhaengig von: 5.
Pruef: Messung der berechneten `transition-property`-Werte in `src/ui` zeigt nur `transform`, `opacity`, `background-color`, `box-shadow`; unter `prefers-reduced-motion: reduce` bleiben nur Deckkraftwechsel; die einzigen `infinite`-Animationen sind Schimmer und Laufbalken.

**47 Reihenfolge als Gate.**
Die Runden 1 bis 10 aus `ui-plan.md` Abschnitt 19 als Reihenfolge einhalten; der kritische Pfad 1, 2, 3, 4 und die Abschlussrunde 10 sind nicht verschiebbar, die Canvas-Runden 6 und 7 und die Chrome-Runde 8 laufen parallel.
Abhaengig von: 32 bis 46.
Pruef: Jede Runde endet mit `pnpm test`, `pnpm typecheck` und `pnpm lint` gruen und mit einer Vorschaumessung ohne Ueberlauf; Aufgabe 28 und 31 sind nach jeder Runde erfuellt.
