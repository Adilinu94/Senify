# Editor v2: Oberflaeche und Gestaltung (ui-design.md)

Status: Entwurf zur Umsetzung, Runde 80
Geltung: die Oberflaeche des Editors selbst (Werkzeug-Haut). Nicht die ausgelieferten Seiten.
Grundlage (verbindlich, nicht neu erfunden):
- `.scratch/refs/precious-board/design.md`, `design-guidelines.md`, `design-components.md` (Designsprache des Auftraggebers)
- `.scratch/refs/nick/tools/design-rules.css` (laufende Redesign-Seite "Nick Webdesign", gleiche Palette)
- `.scratch/editor-v2-rebuild/map.md`, `issues/03-editor-chrome.md` (Leistungsumfang)
- Bestand: `packages/app/public/app.css`, `packages/editor/src/canvas/*`, `packages/tokens`, `packages/registry`
- Tokens als Code: `packages/editor/src/ui/tokens.ts`

## 0. Lesung und Regler

**Lesung:** Werkzeug fuer Fachanwender (Seitenbauer), dunkler Tiefwasser-Anzug, damit der Inhalt im Canvas die hellste Flaeche bleibt, mit Lime als einzigem Signal. Kein Marketing-Auftritt, keine Karte, keine Pille als Dekoration.

**Regler** (nach `design-taste-frontend`, Abschnitt 1.B, Preset "Public-sector service" auf Werkzeuge uebertragen):
- `DESIGN_VARIANCE: 4` (ruhig, keine Asymmetrie als Selbstzweck; Werkzeuge brauchen Wiedererkennbarkeit)
- `MOTION_INTENSITY: 4` (nur funktionale Bewegung, nichts Dauerlaufendes)
- `VISUAL_DENSITY: 7` (Werkzeug-Dichte; Abstand traegt Hierarchie statt Rahmen)

**Wichtige Abgrenzung:** Die Fliessskala des Themes (`buildTypeScale`, `clamp()`-Werte in `packages/tokens/src/scales.ts`) gilt fuer den **Inhalt**. Der Editor benutzt **feste px-Werte**. Grund: ein Werkzeug darf seine eigenen Beschriftungen nicht mit der Fensterbreite umbrechen lassen, sonst springt die Oberflaeche beim Ziehen am Fensterrand.

## 1. Gestaltungsgrundsaetze (zehn Saetze, jeder pruefbar)

1. Der Editor traegt einen dunklen Tiefwasser-Anzug (`#01283c`, `#083247`, `#024364`), damit der Inhalt im Canvas die hellste Flaeche bleibt.
2. Lime (`#cbff97`) erscheint je Bildschirm hoechstens zweimal: als Fokusring und als die eine Hauptaktion; Zustandsflaechen tragen Tiefwasser 300 (`#9ac9e2`).
3. Ebenen entstehen durch eine feine Lichtkante (`inset 0 0 0 1px`) und Flaechenstufen, nie durch gestapelte weiche Schatten.
4. Radius 0 ist die Regel; 4px kennzeichnet Koernung (Chip, kbd, Farbfeld), 8px nur schwebende Platten, 9999px nur Segmentumschalter und Spotlight-Zeile.
5. Alle Masse liegen auf dem 4px-Takt, und jede Zeile und jeder Knopf hat eine feste Hoehe aus Abschnitt 3.
6. Werkzeugbewegung dauert hoechstens 240ms; die 1200ms der Designsprache gelten nur fuer das Erscheinen der Seite im Canvas und den Wechsel Design/Live.
7. Tastatur ausgeloeste Vorgaenge (Spotlight, Umschalten, Menue) oeffnen ohne Uebergang.
8. Jede Farbe hat genau eine Aufgabe, und jeder Text erreicht gegen seine Flaeche 4,5:1, jeder Nicht-Text 3:1 (Nachweise in Abschnitt 9).
9. Beschriftungen benennen die Handlung im Muster Verb plus Substantiv und enthalten keine Werbesprache.
10. Kein Zustand ist nur farbig: jeder Zustand aendert zusaetzlich Flaeche, Kante oder Form.

## 2. Tokens

Alle Werte stehen als Code in `packages/editor/src/ui/tokens.ts` (CSS-Variablen und TypeScript-Ausgabe aus derselben Quelle). Hier die Uebersicht mit Herkunft.

### 2.1 Farben, Flaechen in Stufen

| Token | Wert | Herkunft | Aufgabe |
|---|---|---|---|
| `--ed-brand-900` | `#01283c` | Tiefwasser 900 | dunkelster Grund |
| `--ed-brand-800` | `#083247` | Tiefwasser 800 | Flaechen hinter Glas |
| `--ed-brand-700` | `#024364` | Tiefwasser 700 | Hauptflaeche der Marke |
| `--ed-brand-600` | `#006092` | Tiefwasser 600 | Akzent, Links, Symbole |
| `--ed-brand-300` | `#9ac9e2` | Tiefwasser 300 | helle Flaechen, Fuellungen |
| `--ed-lime` | `#cbff97` | Signal | ein Signal je Abschnitt |
| `--ed-surface-canvas` | `#01283c` | Tiefwasser 900 | Buehne um die Frames |
| `--ed-surface-panel` | `#083247` | Tiefwasser 800 | Explorer, Inspektor, Statusleiste |
| `--ed-surface-raised` | `#024364` | Tiefwasser 700 | Kopfleiste, Werkzeugleiste, Menue, Dialog |
| `--ed-surface-inset` | `#042c40` | mix Tiefwasser 900 60 mit 800 40 | Feld-Innenraum |

### 2.2 Farben, Textstufen

| Token | Wert | Herkunft | Aufgabe |
|---|---|---|---|
| `--ed-ink-strong` | `#ffffff` | Designsprache (416 Verwendungen) | Ueberschrift, aktive Ebene, Feldwert |
| `--ed-ink-base` | `#f3f9fc` | mix Weiss 88 mit Tiefwasser 300 12 | Grundtext |
| `--ed-ink-muted` | `#9ac9e2` | Tiefwasser 300 | Nebentext, Feld-Label, Kuerzel |
| `--ed-ink-faint` | `#58859c` | mix Tiefwasser 300 55 mit 800 45 | **nur Nicht-Text** (Symbol, Trenner) |
| `--ed-ink-on-lime` | `#01283c` | Tiefwasser 900 | Text auf Lime |

### 2.3 Farben, Raender und Kanten

| Token | Wert | Herkunft | Aufgabe |
|---|---|---|---|
| `--ed-line-hairline` | `#2b4f61` | mix Weiss 14 mit Tiefwasser 800 86 | dekorative Trennung (1,54:1) |
| `--ed-line-control` | `#6390a7` | mix Tiefwasser 300 62 mit 800 38 | Feldkante, die das Feld kennzeichnet (ab 3,05:1) |
| `--ed-line-strong` | `#9ac9e2` | Tiefwasser 300 | Zustandskante: Auswahl, Fokus, Aktiv |
| `--ed-edge-hairline` | `inset 0 0 0 1px rgb(255 255 255 / 0.14)` | Precious-Board Elevation | Lichtkante der Ebene |
| `--ed-edge-top` | `inset 0 1px 0 rgb(255 255 255 / 0.1)` | Precious-Board Elevation | Licht von oben auf Platten |

### 2.4 Farben, Signale und Zustaende

| Token | Wert | Herkunft | Aufgabe |
|---|---|---|---|
| `--ed-signal-accent` | `#cbff97` | Lime | Hauptaktion, Fokusring, Momentanzeige beim Ziehen |
| `--ed-signal-select` | `#9ac9e2` | Tiefwasser 300 | Auswahl (Rahmen, Griffrand, aktive Zeile) |
| `--ed-fill-hover` | `rgb(255 255 255 / 0.06)` | abgeleitet | Flaeche hebt sich |
| `--ed-fill-select` | `rgb(154 201 226 / 0.14)` | abgeleitet | Auswahlflaeche |
| `--ed-fill-accent-hover` | `#cfff9f` | mix Lime 92 mit Weiss 8 | Lime hebt sich um eine Stufe |
| `--ed-signal-danger` | `#f87171` | Theme `danger-vivid` | Loeschstrich, Fehlerkante |
| `--ed-signal-danger-ink` | `#fca5a5` | aufgehelltes Theme-Rot | Loeschtext, Fehlertext |
| `--ed-signal-success` | `#4ade80` | Theme `success-vivid` | Erfolg |
| `--ed-signal-warning` | `#fbbf24` | Theme `warning-vivid` | Hinweis |
| `--ed-focus` | `#cbff97` | Designsprache | Fokusring auf dunklem Grund |
| `--ed-focus-on-accent` | `#01283c` | Tiefwasser 900 | Fokusring auf Lime |

Begruendung der Abweichung: Precious-Board nennt Lime als Fokusring auf dunklem Grund, aber keinen Auswahlwert. Waere auch die Auswahl Lime, haetten Fokus und Auswahl dieselbe Farbe und waeren nebeneinander nicht unterscheidbar. Deshalb traegt die Auswahl Tiefwasser 300, und Lime bleibt dem Fokus, der einen Hauptaktion und Momentanzeigen vorbehalten.

### 2.5 Typografie

| Token | Wert |
|---|---|
| `--ed-font-display` | `"Inter Display", "Inter", system-ui, sans-serif` |
| `--ed-font-body` | `"Inter", system-ui, sans-serif` |
| `--ed-font-mono` | `ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace` |
| Groessen | `10px`, `11px`, `12px`, `13px`, `15px`, `17px` |
| Zeilenhoehen | 14, 15, 16, 18, 20, 22px (rund 1,3) |
| Laufweiten | `0.06em` fuer gesperrte Mikro-Beschriftungen, `-0.01em` fuer Inter-Display-Titel, sonst 0 |
| Gewichte | 400 (Text), 500 (Bedienelement, Label, Menue), 600 (Titel, aktive Ebene) |

Zuordnung: 10px nur Linealmarken und Status; 11px gesperrte Abschnittstitel, Kuerzel, Abzeichen; 12px Zeilenname, Feldwert, Feld-Label, Knopf; 13px Menuezeile, Toast, Fliesstext im Panel; 15px Dialogtitel und Panel-Ueberschrift (Inter Display 600); 17px Spotlight-Eingabe.
Zahlen immer mit `font-variant-numeric: tabular-nums`, Werte und Kennungen in `--ed-font-mono`.
Begruendung: Inter Display und Inter sind die Schrift der Designsprache; Linear benutzt dieselbe Trennung (Inter Display fuer Ueberschriften, Inter fuer den Rest, siehe Abschnitt 10). Keine Standardschrift ohne Absicht, kein Serif.

### 2.6 Abstaende (4px-Takt aus dem Theme)

`--ed-space-0: 0`, `-1: 4px`, `-2: 8px`, `-3: 12px`, `-4: 16px`, `-5: 20px`, `-6: 24px`, `-8: 32px`, `-10: 40px`, `-12: 48px`.
Das sind genau die Stufen, die `buildSpacing(4)` in `packages/tokens/src/scales.ts` erzeugt (Multiplikatoren 0 bis 12). Keine Zwischenwerte.
Verbrauch: Innenabstand einer Zeile 8px waagerecht, Panel-Rand 12px, Gruppenabstand 16px, Panel-Trennung 12px, Abschnitt im Panel 24px.

### 2.7 Radien

`--ed-radius-0: 0`, `-sm: 4px`, `-md: 8px`, `-full: 9999px`.
Regel: Zeilen, Felder, Knoepfe, Panels, Buehnenrahmen = 0 (hartes Raster der Designsprache, und die Praxis von IBM Carbon, das Werkzeugflaechen grundsaetzlich mit Radius 0 baut). Chip, `kbd`, Farbfeld, Abzeichen = 4px. Nur schwebende Platten (Menue, Dialog, Toast, Popover) = 8px. Nur Segmentumschalter und Spotlight-Zeile = 9999px.
Die Theme-Werte `radius-lg` (16px) und `radius-xl` (24px) bleiben dem Inhalt vorbehalten. Damit gibt es in jeder Gruppe nur einen Radius, wie es `design-guidelines.md` fordert.

### 2.8 Schatten, Lichtkanten, Weichzeichnung

| Token | Wert | Aufgabe |
|---|---|---|
| `--ed-edge-hairline` | `inset 0 0 0 1px rgb(255 255 255 / 0.14)` | Ebenenkante, das Hauptmittel |
| `--ed-edge-top` | `inset 0 1px 0 rgb(255 255 255 / 0.1)` | Licht von oben auf schwebenden Platten |
| `--ed-edge-select` | `inset 0 0 0 1px rgb(154 201 226 / 0.55)` | Auswahlkante |
| `--ed-shadow-float` | `0 18px 44px -18px rgb(1 18 27 / 0.72), 0 2px 6px -2px rgb(1 18 27 / 0.5)` | Menue, Popover, Toast |
| `--ed-shadow-dialog` | `0 28px 72px -24px rgb(1 18 27 / 0.8)` | Dialog |
| `--ed-scrim` | `rgb(23 32 55 / 0.48)` | Abdunklung (Wert aus dem Bestand, `app.css` `.refs-dialog::backdrop` `#1720377a`) |
| `--ed-blur-glass` | `10px` | Designsprache, genau eine Stelle (Spotlight) |
| `--ed-blur-scrim` | `4px` | Dialog und Spotlight hinter der Abdunklung |

Der Schatten ist auf Tiefwasser eingefaerbt (`rgb(1 18 27 ...)`), nicht schwarz. Nur zwei Schattenstufen, keine Stapel (Verbot aus `design-guidelines.md`).
**Glas genau einmal:** `backdrop-filter: blur(10px)` gibt es nur an einer Stelle, der Spotlight-Flaeche ueber dem Canvas, mit Abdunklung darunter. Menue, Dialog und Toast sind **undurchsichtige** Platten mit Lichtkante. Damit ist der ueberladene Glaseffekt ausgeschlossen.

### 2.9 Bewegung

| Token | Wert | Aufgabe |
|---|---|---|
| `--ed-t-0` | `0ms` | Spotlight, Umschalter, Menue, alle Tastaturvorgaenge |
| `--ed-t-1` | `120ms` | Farb-, Kanten- und Flaechenwechsel (Ueberfahren) |
| `--ed-t-2` | `160ms` | Druckrueckmeldung |
| `--ed-t-3` | `200ms` | Popover, Tooltip, Toast ein |
| `--ed-t-4` | `240ms` | Panel andocken, Blatt schieben; auch der Uebergang der Designsprache |
| `--ed-t-brand` | `1200ms` | **nur** Erscheinen der Seite im Canvas und Uebergang Design/Live |
| `--ed-ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Ein- und Austritte |
| `--ed-ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Bewegung auf dem Schirm |
| `--ed-ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | Blatt und Panel schieben |
| `--ed-ease-standard` | `cubic-bezier(0.16, 1, 0.3, 1)` | Zustandswechsel; derselbe Wert wie in `design-rules.css` |
| `--ed-ease-linear` | `linear` | Laufbalken und Lade-Schimmer (1200ms) |

Regeln:
- Es bewegen sich nur `transform` und `opacity`. Nie `top`, `left`, `width`, `height`, `padding`, `margin`.
- Kein Uebergang auf Tastatur ausgeloesten Vorgaengen (Spotlight, Menue oeffnen, Umschalten, Zoom). Grund: bei hundertfacher Nutzung am Tag wirkt jede Bewegung als Verzoegerung, genau die Begruendung, mit der Raycast seine Befehlspalette ohne Oeffnungsanimation baut.
- Kein Eintritt aus `scale(0)`. Kleinster Startwert `scale(0.96)` mit `opacity: 0`.
- Popover wachsen aus ihrem Ausloeser (`transform-origin` am Zeigerpunkt), Dialoge bleiben mittig.
- `prefers-reduced-motion: reduce` setzt Dauern auf `0.001ms` und entfernt Positionsbewegungen; Opazitaet bleibt, weil sie beim Verstehen hilft.

## 3. Komponenten-Inventar mit Maßen

Gemeinsam: Radius 0, Hoehen aus der Tabelle, Innenabstand auf dem 4px-Takt, Kanten als Lichtkante.

### 3.1 Kopfleiste (topbar)

Hoehe 48px. Innenabstand 12px waagerecht, 8px Abstand zwischen Gruppen. Aufbau von links: Marke (Zeichen 20px, Radius 4px, Lime-Grund, Zeichen in Tiefwasser 900; Wortmarke "Senify" 13px Inter Display 600, Laufweite -0.01em), Dokumenttitel 13px/500 mit Ellenbogen-Truncation, Speicherzustand 11px in `--ed-ink-muted`, Segmentumschalter **Design | Live** (Hoehe 28px, Radius 9999px, Grund `--ed-surface-inset`, aktives Feld `--ed-surface-raised` mit Lichtkante), dann rechts: Rueckgaengig und Wiederholen als Symbolknoepfe 28 x 28px, Trennlinie 1px in `--ed-line-hairline`, Zoom-Anzeige als Textknopf (12px, tabellarische Zahlen), und die eine Hauptaktion "Veroeffentlichen" (Hoehe 32px, Radius 9999px, Lime, Text `--ed-ink-on-lime`, 12px/500).

### 3.2 Werkzeugleiste (toolbar)

Hoehe 40px, Rand 12px, Gruppen durch 1px-Linien (16px hoch) getrennt, Gruppenabstand 8px. Knoepfe 28 x 28px Symbol oder 28px hoch mit Text. Symbole 18px im 24px-Raster, Strich 1.5, `stroke-linecap: round`. Gruppen: Einfuegen (Katalog-Auswahl 28px hoch, 160px breit; "Danach", "Hinein"), Ausrichten, Geraet (Desktop | Tablet | Mobil als Segment 32px), Zoom (- | 100% | + | Einpassen), Ansicht (Lineale, Hilfslinien, Gliederung, Entwurf).

### 3.3 Ebenenliste (Explorer)

Breite 264px, verstellbar 200 bis 360px. Kopfzeile 36px: Titel 11px/500 gesperrt 0.06em in `--ed-ink-muted`, Zaehler als Abzeichen (Hoehe 16px, Radius 4px, Grund `--ed-surface-inset`, 10px tabellarisch). Darunter Dokument-Tabs als Zeile 36px: Seiten, Vorlagen, Komponenten, Medien (12px/500, aktiv mit 2px Lime-Unterkante).
Baum: Zeilenhoehe 28px, Einzug 16px je Stufe, ab Stufe 8 wird nicht weiter eingerueckt und stattdessen die Tiefe als 10px-Abzeichen gezeigt. Bestandteile einer Zeile: Ausklapp-Dreieck 12px (nur bei Kindern), Typ-Symbol 14px, Name 12px/500 (`--ed-ink-base`, aktive Zeile `--ed-ink-strong`), rechts Zustandssymbole 14px (versteckt, gesperrt). Zeile = Griff, kein eigenes Griffssymbol.
Ziehen: Einfuegelinie 2px Lime ueber die volle Breite; unzulaessiges Ziel zeigt eine 2px Linie in `--ed-signal-danger` und keine Einfuegelinie.
Mehrfachauswahl: Klick = einzeln, Shift-Klick = Bereich, Strg/Cmd-Klick = hinzufuegen, Esc = leeren. Mehr als eine Auswahl setzt vor jeden Namen ein Kontrollkaestchen 14px (Ruhezustand leer mit 1px `--ed-line-control`, gewaehlt mit Lime-Haken auf `--ed-ink-on-lime`).
Viele Ebenen: der Baum rendert nur die sichtbaren Zeilen (Fenster-Rendern ueber Hoehe geteilt durch 28px plus 6 Zeilen Vorrat). Bei 560px Panelhoehe sind das rund 20 Zeilen. Filterfeld 28px in der Kopfzeile, Treffer werden im Baum nicht aufgeloest, sondern als Klapp-Pfad gezeigt.

### 3.4 Eigenschaften-Panel (Inspektor)

Breite 320px, verstellbar 260 bis 420px. Tab-Zeile 36px mit drei Tabs: Inhalt, Stil, Erweitert (12px/500; Ruhe `--ed-ink-muted`, aktiv `--ed-ink-strong` und 2px Lime-Unterkante; Fokusring 2px Lime).
Inhalt: Abschnittskopf 32px (11px/500 gesperrt, Dreieck rechts), Eigenschaftenzeile 32px: Label 88px (12px/500 `--ed-ink-muted`), Steuerung 1fr. Bei Mehrfachauswahl zeigen gemischte Werte den Platzhalter "gemischt" (11px, `--ed-ink-muted`, kursive Ziffernstellung aus), und jede Aenderung wirkt auf alle ausgewaehlten Knoten.

### 3.5 Felder

Alle Felder: Hoehe 28px, Grund `--ed-surface-inset`, Kante `inset 0 0 0 1px --ed-line-control`, Innenabstand 0 8px, Text 12px/400, tabellarische Zahlen. Fokussiert: Kante 2px `--ed-focus` (als Schattenring, damit die Groesse nicht springt). Fehler: Kante 2px `--ed-signal-danger-ink`, Meldung 12px in `--ed-signal-danger-ink` mit 12px-Symbol darunter.

1. **Zahl** (`Zahl`): Feld 28px, rechts ein Schrittgeber aus zwei Knoepfen je 14px hoch und 20px breit, Symbol 10px. Auf- und Abwaerts-Tasten aendern um `step`, Shift um 10 `step`.
2. **Schieberegler mit Einheit**: Spur 4px hoch, Radius 0, Grund `rgb(154 201 226 / 0.22)`, Fuellung `--ed-signal-select`; Griff 12 x 12px, Radius 0, Grund `--ed-ink-strong`, 1px Kante `--ed-line-control`; Trefferflaeche 24px hoch (WCAG 2.5.8). Rechts ein Zahlenfeld mit Einheit (Auswahl px, %, em, rem, vw) als 24px breiter Anhang. Tastatur: Pfeile um `step`, Bild auf und ab um 10 `step`, Home und End an die Grenzen. Momentwert als 11px Blase in `--ed-surface-raised` mit Lichtkante, erscheint ohne Uebergang.
3. **Farbwaehler mit Deckkraft und Palette**: Feld als 28px Zeile mit Farbfeld 20 x 20px (Radius 4px, 1px `--ed-line-control`), Hex-Text 12px in Mono, rechts Deckkraft in Prozent (11px). Geoeffnet: Platte 240px breit, Radius 8px, `--ed-surface-raised`, `--ed-shadow-float`, Innenabstand 12px. Inhalt: Farbflaeche 160px hoch (Schachbrett fuer Deckkraft darunter), Farbtonstreifen 12px, Deckkraftstreifen 12px mit Schachbrett, darunter Hex-Feld 28px und Deckkraft-Zahlenfeld mit `%`. Dann die Palette: alle Themensignale als Felder 20 x 20px mit Namen in 11px (Lime, Tiefwasser 700, Tiefwasser 600, Tiefwasser 300, Weiss, Fehlerrot, Erfolgsgruen, Hinweisgelb), darunter "Zuletzt" mit vier Feldern. Klick auf ein Feld setzt den Wert, Alt-Klick setzt `{ $token: ... }` (Senify-DNS bleibt).
4. **Umschalter**: 32 x 18px, Radius 9999px, Bahn aus `rgb(154 201 226 / 0.26)`, eingeschaltet Lime; Knopf 14px rund, Weiss, Lichtkante; Beschriftung links 12px/500. Fokus: 2px Ring Lime mit 1px Abstand. Ein reiner Umschalter, kein Kaestchen mit Beschriftung im Innern.
5. **Auswahl**: Ausloeser 28px hoch wie ein Feld, rechts Dreieck 12px. Menue wie 3.10, Zeilen 32px, gewaehlte Zeile mit 14% Tiefwasser-300-Flaeche und Haken 14px. Tastatur: Pfeile, Buchstabensprung, Home und End, Enter waehlt, Esc schliesst ohne Aenderung.
6. **Vierfach-Werte** (oben, rechts, unten, links): eine Zeile 32px mit vier Feldern 1fr, Abstand 4px. Jedes Feld traegt links ein Rand-Symbol 12px (Quadrat mit betonter Kante, Strich 1.5) und keine Textbeschriftung. Davor ein Kettensymbol-Knopf 24px: verkettet schreibt eine Eingabe in alle vier, geloest schreibt nur in das eine. Tastatur: Pfeil rechts und links springen zwischen den Feldern.
7. **Wiederholfeld**: Liste von Zeilen je 32px, jede mit Greifflaechen-Symbol 12px, Inhalt, Entfernen-Symbol 14px; Abstand 4px. Unten ein Geister-Knopf "Element hinzufuegen" 28px; rechts der Zaehler "3 von 8" in 11px `--ed-ink-muted`. Zeilen sind per Ziehen umsortierbar, die Einfuegelinie ist 2px Lime.
8. **Bedingung**: Zeile 32px aus Auswahl (Bedingung: sichtbar wenn, Klasse, Geraet), Token-Feld 1fr und Signal-Chip 16px. Darunter ein Segment **UND | ODER** 28px (Radius 9999px). Eine leere Bedingung zeigt den Chip in `--ed-ink-faint` und nie allein als Farbunterschied.

### 3.6 Tabs

Zwei Bauarten, beide Radius 0:
- Panel-Tabs (Inspektor): Zeile 36px, Unterkante 2px, Ruhe `--ed-line-hairline`, aktiv Lime, Ueberfahren Flaeche plus 6% Weiss.
- Dokument-Tabs (Explorer): Zeile 36px, aktiv `--ed-surface-inset` mit 2px Lime-Unterkante. Da der Explorer schmaler ist als der Inspektor, steht der Abstand hier auf 12px statt 16px, damit die vier Beschriftungen (Seiten, Vorlagen, Komponenten, Medien) in einer Zeile bleiben.
Tastatur: Pfeile wechseln den Tab sofort (kein Uebergang), Home und End springen an den Rand.

### 3.7 Kontextmenue

Breite 200 bis 320px, Innenabstand 4px, Radius 8px, `--ed-surface-raised`, `--ed-shadow-float`, Lichtkante oben. Zeilen 32px, Innenabstand 8px waagerecht, Symbol 16px, Beschriftung 13px/500, Kuerzel rechts 11px in `--ed-ink-muted` (Mono), Untermenue-Dreieck 12px rechts. Trennlinie 1px `--ed-line-hairline`, eingerueckt um 8px. Loeschen: Text `--ed-signal-danger-ink`, Symbol `--ed-signal-danger`; Ueberfahren legt `--ed-fill-danger` (14% Fehlerrot) unter.
Eintritt 200ms mit `--ed-ease-out` aus dem Zeigerpunkt (`transform-origin` auf die Klickstelle gesetzt, Startwert `scale(0.96)` mit `opacity: 0`). Tastatur: Pfeile, Enter, Esc; das Menue faengt den Fokus und gibt ihn beim Schliessen an den Ausloeser zurueck.

### 3.8 Spotlight (Befehlspalette)

Abdunklung `--ed-scrim` mit `blur(4px)`, darueber die eine Glasflaeche: Breite 640px, oben bei 12vh mittig, Radius 8px, Grund `rgb(8 50 71 / 0.72)` mit `backdrop-filter: blur(10px)`, Lichtkante oben und `--ed-shadow-dialog`.
Aufbau: Eingabezeile 48px (17px Text, Symbol 18px, rechts ein `Esc`-Kuersel, 11px in Mono), darunter Ergebnisliste: Gruppenkopf 28px (11px/500 gesperrt), Zeile 36px (Symbol 16px, Titel 13px/500, rechts Kuerzel 11px Mono), hoechste Trefferzeile mit 14% Tiefwasser-300-Flaeche und 2px Lime-Rand links. Fusszeile 28px mit den vier wichtigsten Kuerzeln. Ergebnisliste fenstert nur die sichtbaren Zeilen.
**Kein Oeffnungs- und Schliessuebergang** (`--ed-t-0`). Grund: hunderte Aufrufe am Tag.

### 3.9 Auswahlrahmen und Griffe

Rahmen: doppelte 1px-Linie, aussen `rgb(1 40 60 / 0.55)`, innen `--ed-signal-select`. Der Doppelstrich sichert die 3:1-Kante sowohl auf hellem als auch auf dunklem Inhalt, ohne die Farbe zu wechseln.
Beschriftung: Plaetzchen 18px hoch am linken oberen Eck, 11px/500, Grund `--ed-signal-select`, Text `--ed-ink-on-lime`.
Griffe: vier Quadrate 8 x 8px, Radius 0, Grund `--ed-ink-strong`, 1px Kante `--ed-signal-select`; Trefferflaeche auf 24 x 24px aufgefuellt. Ueberfahren vergroessert auf 10px ohne Uebergang. Kantengriffe 6 x 8px fuer Breite und Hoehe.
Weitere Marken: Randabstand als orange-freie Anzeige (`12` in 11px auf `--ed-surface-raised`), Groesse als Paar `w x h` in 11px Mono, Einfuegelinie beim Ziehen in Lime 2px.

### 3.10 Lineal und Hilfslinien

Lineal: 24px breit, Grund `--ed-surface-panel`, Skala 10px/500 `--ed-ink-muted`, Hauptstriche 8px, Nebenstriche 4px in `--ed-line-hairline`. Marken in Pixel der Buehne und in Prozent der Frame-Breite (Umschalter im Rechtsklick auf das Lineal). Nullpunkt wird beim Verschieben des Frames mitgezogen.
Hilfslinien: 1px gestrichelt (3 3) in `--ed-signal-select` bei 60% Deckkraft; gewaehlte Linie 1px durchgehend in Lime mit Wertplaetzchen (11px, `--ed-surface-raised`). Ziehen aus dem Lineal heraus, Doppelklick entfernt, Alt-Klick sperrt. Trefferflaeche 24px, sichtbare Linie 1px.
Ausserhalb der Buehne: die Flaeche unter dem Inhalt bleibt bei 8% Deckkraft des Tiefwasser-900 abgedunkelt, damit der Frame als Blatt lesbar ist.

### 3.11 Toasts

Breite 280 bis 360px, Innenabstand 10px 12px, Radius 8px, Grund `--ed-surface-raised` (wie `design-components.md`: Flaeche `#024364`, Text weiss 12px), Lichtkante oben und `--ed-shadow-float`. Aufbau: Symbol 16px, Text 12px/500, optionale Aktion als Geister-Knopf 24px, Schliessen-Symbol 24px.
Stapel unten mittig, Abstand 8px, Einblenden 150ms (`design-components.md`), Ausblenden 100ms. Dauer 5s, angehalten bei Ueberfahren und bei verborgenem Tab. Hoechstens drei gleichzeitig, sonst Zusammenfassung "3 weitere".
Arten: Erfolg (`--ed-signal-success`), Hinweis (`--ed-signal-warning`), Fehler (`--ed-signal-danger-ink`) mit Wiederholen-Aktion. Farbe nie allein: jede Art traegt ein eigenes Symbol.

### 3.12 Dialoge

Abdunklung `--ed-scrim` mit `blur(4px)` (Tiefwasser, Wert aus dem Bestand). Platte Breite `min(560px, calc(100vw - 32px))`, Radius 8px, `--ed-surface-raised`, `--ed-shadow-dialog`, Lichtkante oben. Kopfzeile 48px (Titel 15px Inter Display 600, Schliessen 28px, Unterkante 1px). Inhalt 16px Innenabstand. Fusszeile 56px, rechts ausgerichtet: Geister-Knopf "Abbrechen" 32px, Hauptaktion 32px Lime (nur bei Bestaetigung, nie zwei Lime-Knoepfe).
Eintritt 200ms `--ed-ease-in-out` aus `scale(0.98)`; Austritt 120ms. Esc schliesst, Fokusfalle im Dialog, Fokus kehrt zum Ausloeser zurueck.

### 3.13 Leerer Zustand

Mittig, Innenabstand 24px, Symbol 40px Strich 1.5 in `--ed-ink-muted`, Aussage 13px/500 `--ed-ink-strong`, ein Satz 12px `--ed-ink-muted` bis 36 Zeichen Breite, ein Geister-Knopf 28px. Kein Bild, kein Emoji. Drei Faelle: leere Seite ("Noch keine Ebenen"), leere Suche ("Kein Treffer fuer ...", mit dem Suchbegriff), leere Medien ("Keine Bilder").

### 3.14 Ladezustand

Geruest statt Kreisel (Carbon: bei erwarteter Wartezeit Geruestzeilen, kein Spinner): Zeilen 28px in der Form der spaeteren Zeilen, Grund `rgb(154 201 226 / 0.12)`, Schimmer 1200ms `--ed-ease-linear` von links nach rechts. Ueber dem Werkzeugleistenstreifen eine Laufanzeige 2px (wie `design-components.md`: duenne Linie 2px), Fuellung `--ed-signal-select`. Textmasken bleiben stehen (Rahmen bekannt, Text leer). Bei Nachladen im Baum: die vorhandenen Zeilen bleiben mit 45% Deckkraft stehen, darueber das Geruest.

### 3.15 Fehlerzustand

Feld: Kante 2px `--ed-signal-danger-ink`, Symbol 12px, Meldung 12px darunter. Panel: oben eine Leiste mit 2px linker Kante `--ed-signal-danger`, Text 12px, Aktion "Erneut versuchen" als Geister-Knopf 24px. Buehne: Karte 16px Innenabstand mit Aussage 13px/500, der fehlgeschlagenen Adresse in 11px Mono und einem Geister-Knopf 28px; der Rest des Editors bleibt bedienbar. Fehler stehen nie nur als Toast.

## 4. Zustandsmatrix

Legende: F = Flaeche, K = Kante, T = Text, B = Bewegung.
Feste Regeln je Zustand: Ueberfahren: F plus 6% Weiss, K heller (120ms). Aktiv: Inhalt `scale(0.97)` (160ms) bei Knoepfen, Zeilen ohne Skalieren. Fokus: 2px Ring Lime mit 1px Abstand; auf einer Lime-Flaeche ein doppelter Ring, innen 2px `#01283c` und aussen 2px Lime, damit die Kennzeichnung gegen die Flaeche (13,35:1) und gegen die Umgebung (11,74:1) gleichzeitig erreicht. Deaktiviert: Deckkraft 38%, keine Kante, `cursor: default`, kein Fokusziel, `aria-disabled`. Ausgewaehlt: K 1px `--ed-signal-select` plus F 14% Tiefwasser-300.

| Komponente | Ruhe | Ueberfahren | Aktiv | Fokus | Deaktiviert | Ausgewaehlt |
|---|---|---|---|---|---|---|
| Kopfleiste Hauptaktion "Veroeffentlichen" | F Lime, T Tiefwasser 900, Radius 9999 | F Lime plus 4% Weiss | Inhalt 0.97 | 2px Ring `#01283c`, 2px Abstand | Deckkraft 38%, keine Kante | nicht vorgesehen |
| Symbolknopf (Rueckgaengig) | F leer, Symbol `--ed-ink-base` | F plus 6% Weiss | Inhalt 0.97 | 2px Ring Lime, 1px Abstand | Symbol `--ed-ink-faint`, kein Fokus | F 14% Tiefwasser 300 |
| Segmentumschalter | F `--ed-surface-inset`, Radius 9999 | Feld F plus 6% Weiss | Feld 0.97 | Ring Lime um das Feld | Felder Deckkraft 38% | aktives Feld `--ed-surface-raised` plus Lichtkante |
| Werkzeugleisten-Knopf | F leer, Symbol `--ed-ink-base` | F plus 6% Weiss | Inhalt 0.97 | Ring Lime | Symbol `--ed-ink-faint` | F 14%, K 2px Lime unten |
| Ebenenzeile | F panel, T `--ed-ink-base` | F plus 6% Weiss | F bleibt, keine Skalierung | Ring Lime im Zeilenrand | T `--ed-ink-faint` (nur Symbol), kein Ziehen | F 14%, T `--ed-ink-strong`, K 2px Lime links |
| Kontrollkaestchen (Mehrfachauswahl) | K 1px `--ed-line-control` | F plus 6% Weiss | Inhalt 0.97 | Ring Lime | Deckkraft 38% | F Lime, Haken `#01283c` |
| Panel-Tab | T `--ed-ink-muted`, K 1px hairline | T `--ed-ink-base`, F plus 6% | T bleibt | Ring Lime | T `--ed-ink-faint` | T `--ed-ink-strong`, K 2px Lime |
| Eigenschaftenzeile | Label `--ed-ink-muted`, Steuerung 0 | Label `--ed-ink-base`, unbedingt die Zusatzschritte sichtbar | Steuerung wie sonst | Ring um die Steuerung | Label und Steuerung 38% | K 2px Lime links bei geerbter Setzung am Geraetepunkt |
| Zahlfeld | F inset, K 1px control | K `--ed-line-strong` | T bleibt | K 2px Lime | F inset, T faint | T `--ed-ink-strong` bei Geraete-Override plus 8px Punkt aus `--ed-signal-select` |
| Schieberegler | Spur 22% Tiefwasser 300, Griff weiss | Spur 30%, Griff 14px | Griff 0.97 | Ring Lime um den Griff | Spur 12%, Griff faint | Fuellung Tiefwasser 300 bis zum Griff |
| Farbfeld | 20px, K 1px control | K `--ed-line-strong` | 0.97 | Ring Lime | Deckkraft 38% | K 2px Lime (gewaehltes Feld der Palette) |
| Farbwaehler-Platte | F raised, Radius 8, Schatten | Zeilen und Streifen wie Regeln | 0.97 | Ring Lime innen | nicht vorgesehen | gewaehltes Feld mit 2px Lime |
| Umschalter | Bahn 26% Tiefwasser 300 | Bahn 32% | Knopf 0.97 | Ring Lime, 1px Abstand | Bahn 12%, Knopf 38% | eingeschaltet: Bahn Lime, Knopf `#01283c` ausgerichtet rechts |
| Auswahlfeld (Dropdown) | wie Zahlfeld, Dreieck `--ed-ink-muted` | K strong, Dreieck `--ed-ink-base` | 0.97 | Ring Lime | 38% | Wert in `--ed-ink-strong`, kein Platzhalter |
| Vierfach-Feld | vier Felder 1fr, Symbol `--ed-ink-muted` | K strong am ueberfahrenen Feld | 0.97 | Ring Lime am fokussierten Feld | 38% | gesetztes Feld T strong, K control durchgehend |
| Wiederholfeld-Zeile | F inset, Hoehe 32 | F plus 6%, Griffe sichtbar | 0.97 beim Entfernen | Ring Lime | Zeile 38%, Griffe gesperrt | F 14%, K 2px Lime links |
| Bedingung | Chip `--ed-ink-faint`, Segment inset | Segment F plus 6% | 0.97 | Ring Lime | Chip 38%, Segment inert | zutreffender Zweig im Segment Lime-Unterkante |
| Kontextmenue-Zeile | F raised, T base | F plus 6% Weiss | F bleibt, T bleibt | F plus 8% Weiss plus 2px Lime links | T faint, kein Fokus | nicht vorgesehen (Auswahl ueber Fokus) |
| Kontextmenue-Zeile loeschen | T `--ed-signal-danger-ink` | F 14% Fehlerrot | T bleibt | wie oben, Ring Lime | T 38% | nicht vorgesehen |
| Spotlight-Zeile | F leer, T base | F plus 6% | ohne Uebergang | F 14%, K 2px Lime links | T faint | wie Fokus, Kuerzel bleibt sichtbar |
| Auswahlrahmen | innen Tiefwasser 300 | Rahmen bleibt, Griffe 10px | Griff 0.97 | Rahmen bleibt (Fokus liegt in der Kopfleiste) | nicht vorgesehen | Grundzustand der Komponente |
| Griff | 8px, F weiss, K Tiefwasser 300 | 10px, Zeiger passend zur Kante | 0.97 | nicht fokussierbar (Zeigerbedienung) | nicht vorgesehen | wie Ruhe |
| Hilfslinie | 1px 60% Tiefwasser 300, gestrichelt | Trefferflaeche 24px, Zeiger greifen | F bleibt | waagerecht/abwaerts-Pfeile bewegen um 1px | gesperrt zeigt Schloss-Symbol 12px | gewaehlt: 1px Lime plus Wertplaetzchen |
| Toast | F raised, K left 2px Signalsymbol | Dauer angehalten, Schliessen sichtbar | Aktion 0.97 | Ring Lime um Aktion und Schliessen | nicht vorgesehen | nicht vorgesehen |
| Dialog | F raised, K oben, Schatten | Zeile wie Knopfregeln | Knopf 0.97 | Falle im Dialog, erster Knopf mit Ring | Knoepfe 38% | nicht vorgesehen |
| Leerer Zustand | Symbol `--ed-ink-muted`, Aussage strong | Aussage und Satz unveraendert | Knopf 0.97 | Ring Lime am Knopf | nicht vorgesehen | nicht vorgesehen |
| Ladezustand | Zeilen 12% Tiefwasser 300, Schimmer 1200ms | nicht bedienbar | nicht vorgesehen | nicht vorgesehen | nicht vorgesehen | nicht vorgesehen |
| Fehlerzustand | K 2px Fehlerrot, Meldung Fehlertext | Meldung bleibt, Aktion F plus 6% | Aktion 0.97 | Ring Lime an der Aktion | Aktion 38% (z. B. waehrend neuer Versuch) | nicht vorgesehen |

## 5. Tastatur und Fokus

**Sprungreihenfolge** (Tab): Kopfleiste, Werkzeugleiste, Explorer (Tab-Zeile, Filterfeld, Baum), Canvas-Umschalter, Inspektor (Tab-Zeile, Inhalt), Statusleiste. Von links nach rechts, oben nach unten.
Feinregeln:
- Baum und Menues mit wanderndem `tabindex` (genau eine Zeile ist per Tab erreichbar, Pfeile bewegen innerhalb).
- Im Canvas ist die Tab-Taste gesperrt (sie wuerde im Inhalt landen); erreichbar ist die Buehne als Ganzes, dann die Kopfleiste der Frame-Auswahl.
- Dialog und Blatt fangen den Fokus; Esc schliesst die oberste Ebene und gibt den Fokus zurueck.
- Der Fokusring ist immer sichtbar (`:focus-visible`), 2px Lime mit 1px Abstand; auf einer Lime-Flaeche ein doppelter Ring (innen 2px `#01283c`, aussen 2px Lime).

**Kuersel** (Auswahl, in Klammern die Windows-Taste): Spotlight `Cmd+K`, Rueckgaengig `Cmd+Z`, Wiederholen `Shift+Cmd+Z`, Duplizieren `Cmd+D`, Loeschen `Delete`, Rueckgaengig im Tippfluss `Esc`, Kopieren und Einfuegen `Cmd+C` / `Cmd+V`, Zoom zuruecksetzen `Cmd+0`, Zoom einpassen `Shift+1`, Geraet umschalten `Shift+2/3/4`, Inspektor ein und aus `Cmd+Alt+I`, Explorer `Cmd+Alt+E`, Auswahl eine Ebene hoeher `Esc`, tiefere Ebene `Enter`, Pruefen beim Ueberfahren `Alt` festhalten, Lineale `Shift+R`, Hilfslinien `Shift+G`, Raster `Cmd+Shift+D` (Webflow-Konvention).

**Anzeige:** Jede Menuezeile und jede Spotlight-Trefferzeile druckt ihr Kuerzel rechts aus, 11px in Mono und `--ed-ink-muted`, in einer festen Spalte mit `min-width: 56px`. In der Spotlight-Fusszeile stehen die vier wichtigsten Kuersel als Paare aus Beschriftung und Taste. Auf der Taste steht nie Text wie "Strg", sondern das Zeichen (`Cmd`, `Shift`, `Alt`, `Esc`, `Delete`).

## 6. Anti-KI-Look-Regeln (verboten, mit Begruendung)

1. **Keine violetten oder blauen Standardverlaeufe.** Verboten: jeder Farbverlauf in der Oberflaeche, besonders Lila-Blau als Hintergrund oder als Knopfflaeche. Grund: das ist der erste KI-Erkennungspunkt, und die Designsprache hat genau eine Akzentfarbe. Erlaubt ist allein ein Verlauf auf der Bildflaeche im Canvas (Inhalt), nie auf der Werkzeugflaeche.
2. **Kein ueberladener Glaseffekt.** Verboten: `backdrop-filter` auf mehr als einer Flaeche, Glas auf Text, Glas als Standard fuer Karten oder Menues. Grund: `design-guidelines.md` sagt "Glas nur ueber Bild" und "Don't: Glas auf Fliesstext legen". Der Editor setzt genau eine Glasflaeche (Spotlight), alles andere ist undurchsichtig mit Lichtkante.
3. **Keine Emoji als Symbole.** Verboten: Emoji, Zeichen wie `+` als Symbol, gezeichnete Klecksgrafiken. Grund: Emoji wechseln je Betriebssystem die Form und tragen keine Bedeutungsschicht. Symbole kommen als Strichsatz im 24px-Raster, Strich 1.5 (Figma zeichnet fuer UI3 200 Symbole von Hand und vereinheitlicht Strichbreite, genau deshalb).
4. **Keine immergleichen Karten mit grossem Radius.** Verboten: jede Flaeche mit 12, 16 oder 24px Radius und weichem Schatten als Standardbehaelter. Grund: der Kartenstapel ist die Standardform von KI-Oberflaechen, und die Designsprache setzt Radius 0 als Regel mit gezielten Bruechen. Der Editor hat deshalb genau drei Radien mit klarer Aufgabe.
5. **Keine Platzhalterbilder.** Verboten: zufaellige Stockfotos, graue Kacheln mit Bildsymbol, Blindtext. Grund: der Editor zeigt echte Inhalte. In der Vorschau steht deshalb ein echter Ausschnitt der Redesign-Seite, und Bilder kommen als eingebettete lokale Zeichnung, nie als Netzabruf.
6. **Keine sprechenden Werbetexte.** Verboten: "Supercharge", "Elevate", "Seamless", "Next-Gen", Ausrufesaetze, Gedankenstriche als Stilmittel. Grund: Beschriftungen benennen Handlungen (Verb plus Substantiv, Satzschreibung, kein Punkt), alles andere raubt Platz und Vertrauen.
7. **Keine Standardschrift ohne Absicht.** Verboten: Schriftmischungen, Serif in der Werkzeugflaeche, Systemschrift als Endzustand. Grund: Inter Display fuer Titel und Inter fuer Text ist die Designsprache, und Linear belegt die Wirkung (Inter Display fuer Ueberschriften, Inter fuer den Rest).
8. **Keine Leuchtraender und Aussen-Glows.** Verboten: `box-shadow` mit Farbe als Glanzrand, `filter: drop-shadow` als Akzent. Grund: Ebenen entstehen durch die Lichtkante von innen, nicht durch Licht von aussen.
9. **Keine Dauerbewegung.** Verboten: pulsierende Punkte, endlose Schleifen, Karussells, Federanimationen ohne Anlass. Grund: Dauerbewegung lenkt von der Arbeit ab und kostet Bildrate. Ausnahme: der Ladeschimmer und der Laufbalken, beide 1200ms linear und nur waehrend des Ladens.
10. **Keine Zierrat-Elemente.** Verboten: farbige Zustandspunkte ohne Bedeutung, Zaehlzeilen wie "01 / 4", Versionsstempel, Winkeltext, Trennlinien als Dekoration. Grund: sie erzeugen den Eindruck von Gestaltung ohne Information. Ein Punkt erscheint nur bei echter Bedeutung (Geraetepunkt, ungespeichert, fehlgeschlagen) und dann hoechstens einer je Zeile.
11. **Keine Farbe als einziger Traeger.** Verboten: Zustand nur ueber Farbton (rot gegen gruen, aus gegen an). Grund: WCAG 1.4.1 und Farbfehlsichtigkeit. Jeder Zustand aendert zusaetzlich Flaeche, Kante oder Form (Haken, Ausrichtung, Symbol).
12. **Keine zweite Palette.** Verboten: eine zweite Akzentfarbe neben Lime, kalte Grautoene neben dem Tiefwasser, reines Schwarz (`#000000`) als Grund. Grund: eine Palette je Projekt; das Tiefwasser ist der Grund, Lime das Signal, und der Schatten ist eingefaerbt.

## 7. Layout und Anpassung

| Breite | Explorer | Buehne | Inspektor |
|---|---|---|---|
| ab 1600px | 264px angedockt | Rest, Frames nebeneinander | 320px angedockt |
| 1280 bis 1599px | 240px angedockt | Rest, Frames nebeneinander, Zoom startet bei 0.4 | 300px angedockt |
| 1024 bis 1279px | 240px angedockt | Rest, nur ein Frame sichtbar per Geraeteumschalter | 300px angedockt |
| unter 1024px | 48px Schiene, ausklappbar als Blatt | Rest | Blatt von rechts, geschoben 240ms |
| unter 760px | Schiene | ein Frame | Blatt im Vollbild mit Zurueck-Knopf |

Panels bleiben **angedockt** und in Grenzen verstellbar (Explorer 200 bis 360px, Inspektor 260 bis 420px, im Doppelklick auf die Trennkante zurueck auf die Standardbreite). Grund: Figma hat schwimmende Panels nach der offenen Beta wieder auf feste, verstellbare Panels zurueckgefuehrt, weil sie auf kleinen Bildschirmen die Buehne beengten und langsamer machten. Der Editor folgt der Lehre, nicht dem Zwischenstand.
Kein waagerechtes Ueberlaufen: die Buehne scrollt, die Panels nie. Statusleiste 28px traegt Zoom, Frame-Breite, Ebene (Pfad in 11px Mono) und Meldungen.

## 8. Kontrast-Nachweise

Rechnung nach WCAG 2.2 (relative Luminanz in sRGB, Verhaeltnis ohne Runden). Grenzen: Text 4,5:1 (SC 1.4.3), grosser Text (ab 24px oder 18,5px fett) 3:1, Nicht-Text und Zustand 3:1 (SC 1.4.11). Flaechenluminanzen: Buehne 0,0185; Panel 0,0279; gehoben 0,0495; eingelassen 0,0220.

### 8.1 Text gegen Flaechen

| Vordergrund | Buehne `#01283c` | Panel `#083247` | Gehoben `#024364` | Eingelassen `#042c40` | Grenze |
|---|---|---|---|---|---|
| Weiss `#ffffff` (L 1,0000) | 15,33:1 | 13,48:1 | 10,56:1 | 14,59:1 | 4,5 |
| Grundtext `#f3f9fc` (0,9383) | 14,43:1 | 12,69:1 | 9,94:1 | 13,73:1 | 4,5 |
| Nebentext `#9ac9e2` (0,5413) | 8,63:1 | 7,59:1 | 5,94:1 | 8,22:1 | 4,5 |
| Schwach `#58859c` (0,2125) | 3,83:1 | 3,37:1 | 2,64:1 | 3,65:1 | nur Nicht-Text |
| Fehlertext `#fca5a5` (0,5032) | 8,08:1 | 7,10:1 | 5,56:1 | nicht gesetzt | 4,5 |
| Erfolg `#4ade80` (0,5526) | 8,80:1 | 7,74:1 | 6,06:1 | nicht gesetzt | 4,5 |
| Hinweis `#fbbf24` (0,5790) | 9,18:1 | 8,08:1 | 6,32:1 | nicht gesetzt | 4,5 |
| Text auf Lime `#01283c` auf Lime `#cbff97` (0,8645) | 13,35:1 (ein Paar, nicht je Flaeche) | | | | 4,5 |

Alle Textwerte liegen ueber 4,5:1. Der einzige Wert darunter ist `--ed-ink-faint` (2,64 bis 3,83:1). Er ist deshalb ausdruecklich **kein Textwert** und wird nur fuer Symbole und Trenner benutzt, und auch dort nie als alleinige Kennzeichnung eines Bedienelements.

### 8.2 Nicht-Text gegen Flaechen (Grenze 3:1)

| Element | Wert | Buehne | Panel | Gehoben | Eingelassen | Grenze |
|---|---|---|---|---|---|---|
| Feldkante `--ed-line-control` (0,2539) | `#6390a7` | 4,44:1 | 3,90:1 | 3,06:1 | 4,22:1 | 3,0 |
| Zustandskante `--ed-line-strong` | `#9ac9e2` | 8,63:1 | 7,59:1 | 5,94:1 | 8,22:1 | 3,0 |
| Fokusring Lime | `#cbff97` | 13,35:1 | 11,74:1 | 9,19:1 | 12,71:1 | 3,0 |
| Loeschstrich | `#f87171` (0,3296) | 5,54:1 | 4,87:1 | 3,82:1 | nicht gesetzt | 3,0 |
| Trennlinie `--ed-line-hairline` | `#2b4f61` (0,0697) | nicht gesetzt | 1,54:1 | nicht gesetzt | nicht gesetzt | nur Trennung, keine Kennzeichnung |

`--ed-line-hairline` liegt unter 3:1 und ist deshalb ausdruecklich dekorativ. Eine Zeile ist auch ohne sie erkennbar (Text und Symbol kennzeichnen die Zeile, so wie WCAG es erlaubt). Wo die Kante **allein** ein Feld kennzeichnet, steht `--ed-line-control` mit mindestens 3,06:1.
Der Fokusring auf Lime ist dasselbe Paar wie Text auf Lime: `#01283c` auf `#cbff97` mit 13,35:1.

### 8.3 Flaechen gegen Flaechen (Unterscheidbarkeit von Zustaenden)

| Paar | Wert |
|---|---|
| Panel gegen Buehne | 1,14:1 (deshalb zusaetzlich 1px Lichtkante) |
| Gehoben gegen Panel | 1,28:1 (deshalb zusaetzlich Lichtkante und Schatten) |
| Auswahlflaeche `#1c475d` gegen Panel | 1,35:1 (deshalb zusaetzlich 1px Kante `--ed-signal-select`, 7,59:1) |
| Auswahlflaeche `#175676` gegen Gehoben | 1,32:1 (deshalb zusaetzlich die Kante) |
| Weiss gegen Auswahlflaeche (Text) | 9,96:1 |
| Nebentext `#9ac9e2` gegen Auswahlflaeche auf Panel | 5,61:1 |
| Nebentext `#9ac9e2` gegen Auswahlflaeche auf gehobener Flaeche | 4,50:1 (Grenzfall, deshalb Regel: auf Auswahlflaechen traegt Nebentext `--ed-ink-base` mit 7,52:1) |
| Nebentext `#9ac9e2` gegen Ueberfahrflaeche auf gehobener Flaeche | 5,07:1 |

Aus Abschnitt 8.3 folgt die einzige Regel, die sich aus einem Grenzwert ergibt: **auf einer Auswahlflaeche wird kein `--ed-ink-muted` gesetzt.** Dort stehen `--ed-ink-base` oder `--ed-ink-strong`.

## 9. Belege aus der Recherche

Nur Werte, die in einer oeffentlichen Quelle stehen. Wo ich nichts Nachpruefbares gefunden habe, steht das ausdruecklich.

| Erkenntnis | Konkreter Wert oder Regel | Quelle | Uebernommen als |
|---|---|---|---|
| Abstandsraster in Werkzeugen | Skala 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 160px; "multiples of two, four, and eight" | IBM Carbon, Spacing, https://carbondesignsystem.com/elements/spacing/overview/ | Abschnitt 2.6 (4px-Takt, benannte Stufen bis 48px) |
| Feldhoehen | klein 32px, mittel 40px (Standard), gross 48px; eine Feldhoehe je Formular | IBM Carbon, Text input, https://carbondesignsystem.com/components/text-input/usage/ | Werkzeugdichte 28px als eigene Stufe, Knopfhoehen 28/32/40 |
| Feldkante | Feld muss 3:1 gegen die Nachbarflaeche erreichen | IBM Carbon, Text input (Anatomy, Punkt 3) | `--ed-line-control` mit 3,05:1 als schwaechster Fall |
| Feldzustaende | enabled, active, focus, error, warning, disabled, skeleton, read-only; deaktivierten Zustaenden wird der Kontrastnachweis erlassen | IBM Carbon, Text input, States | Zustandsmatrix mit Deaktiviert = Deckkraft 38% ohne Kontrastpflicht |
| Fehlerdarstellung | rote Kante plus Fehlersymbol plus Meldung, drei Kennzeichen | IBM Carbon, Text input, Validation | Fehlerzustand: Kante, Symbol, Meldung, nie nur Farbe |
| Kein Platzhalter als Label | "should not be used as a replacement for a persistent label"; kein Doppelpunkt hinter dem Label | IBM Carbon, Text input, Content | Feld-Label steht links, Platzhalter nur als Beispielwert |
| Zeilenhoehen | fuenf Zeilenhoehen; Kopfzeile der Tabelle muss der Zeilenhoehe entsprechen; Ueberfahren der Zeile immer an | IBM Carbon, Data table, Sizing und Hover | Ebenenzeile 28px, Ueberfahren immer aktiv |
| Viele Ebenen | Zeilen-Ueberlaufmenue dauerhaft oder nur bei Ueberfahren; Geruest statt Kreisel bei erwarteter Wartezeit; Mehrfachauswahl ueber Kaestchen mit Drei-Zustands-Kopf | IBM Carbon, Data table | Baumzeile mit Zustandssymbolen, Geruest im Ladezustand, Mehrfachauswahl per Kaestchen |
| Knopfhoehen und Symbolgroesse | kleine Knoepfe paaren sich mit 32px-Feldern, mittlere mit 40px; Symbol 16px im Knopf, 20px im grossen; Symbol rechts, 8px Abstand; ein Hauptknopf je Bildschirm; mindestens 3:1 zwischen zwei anliegenden Knoepfen | IBM Carbon, Button, https://carbondesignsystem.com/components/button/usage/ | Knopf 28/32/40px, Symbol 16px im Knopf, 8px Abstand, eine Lime-Aktion je Flaeche |
| Nur-Symbol-Knoepfe | immer mit Tooltip; ein Symbol nur, wenn allgemein verstaendlich; Loeschknopf nie als Nur-Symbol | IBM Carbon, Button | Werkzeugleiste mit Tooltip-Pflicht, Loeschen im Menue mit Text |
| Werkzeugflaechen ohne Radius | das Carbon-System baut Bedienelemente grundsaetzlich mit Radius 0 | IBM Carbon, Button und Text input (Form) | Radius 0 als Regel der Werkzeugflaeche |
| Panels andocken oder schweben | UI3 startete mit schwebenden Panels und kehrte nach der offenen Beta zu festen, verstellbaren Panels zurueck: schwebende Panels beengten die Buehne auf kleinen Bildschirmen und "slowed people down" | Figma, Our approach to designing UI3, https://www.figma.com/blog/our-approach-to-designing-ui3/ | Panels angedockt und verstellbar, Blatt erst unter 1024px |
| Bedienelemente sichtbar machen | UI3 gibt Feldern einen Grund, Menues eine Kante, Flaechen einen kleinen Radius; 200 Symbole von Hand, vereinheitlichte Strichbreite; wahlweise sichtbare Labels, deren Text mit dem `aria-label` uebereinstimmt | Figma, Inside the redesigned Figma, https://www.figma.com/blog/behind-our-redesign-ui3/ | Feld mit Grund und Kante, Symbole aus einem Satz mit einer Strichbreite, sichtbares Label gleich `aria-label` |
| Werkzeugleiste | schmale Werkzeugleiste am unteren Rand der Buehne, Panels reduzieren oder ausblenden, Kuerzel `Shift+R` fuer Lineale, `Shift+G` fuer Hilfslinien, `Cmd+Shift+D` fuer Abstandsanzeige, `Cmd+Shift+X` fuer den Graustufenblick; Lineal mit Fadenkreuz; Fuehrungslinien als Linie oder gefuellt; "Show element edges" beim Ueberfahren | Webflow, Canvas settings, https://help.webflow.com/hc/en-us/articles/33961230930579-Canvas-settings | Statusleiste unten, Kuerzelbelegung in Abschnitt 5, Lineal und Hilfslinien in 3.10, Kantenanzeige beim Ueberfahren |
| Schriftwechsel | Inter Display fuer Ueberschriften, Inter fuer den Rest; Farbtoene in LCH, Ebenen als Flaechen (background, foreground, panels, dialogs, modals) mit einer Kontrastschraube | Linear, How we redesigned the Linear UI, https://linear.app/now/how-we-redesigned-the-linear-ui | `--ed-font-display` und `--ed-font-body`, vier Flaechenstufen |
| Tastaturfuehrung | jede Handlung per Tastatur; `Cmd+K` oeffnet die Aktionsleiste, `Enter` primaer, `Cmd+Enter` sekundaer, `Alt+Enter` tertiaer; Pfeile in Listen, `Alt+Pfeil` seitenweise, `Cmd+Pfeil` abschnittsweise; Eintippen filtert die Aktionsleiste; `Esc` schliesst oder geht zurueck; `Cmd+Z` und `Shift+Cmd+Z` | Raycast Manual, Keyboard Shortcuts, https://manual.raycast.com/keyboard-shortcuts | Sprung- und Kuerzelplan in Abschnitt 5, Kuerselanzeige rechts in Menue und Spotlight |
| Befehlspalette ohne Animation | Raycast animiert das Oeffnen nicht; bei hunderten Aufrufen am Tag ist das Verhalten ohne Uebergang das beste | Emil Kowalski (emil-design-eng), "Never animate keyboard-initiated actions", Regeltabelle Frequenz | `--ed-t-0` fuer Spotlight, Umschalter und Menues |
| Bewegung, Dauer und Kurve | UI-Bewegung unter 300ms; Druckrueckmeldung 100 bis 160ms; Popover 125 bis 200ms; Menue 150 bis 250ms; Dialog 200 bis 500ms; Kurven `cubic-bezier(0.23, 1, 0.32, 1)` (aus) und `cubic-bezier(0.77, 0, 0.175, 1)` (in-out); Popover aus dem Ausloeser, Dialog mittig; Start nie `scale(0)` | Emil Kowalski (emil-design-eng) | Abschnitt 2.9 |
| Flaeche statt Schatten | Ebenen ueber `inset 0 0 0 1px`; keine gestapelten weichen Schatten; Radius 0 als Regel mit gezielten Bruechen; Hover hebt die Flaeche um eine Stufe; Deaktiviert 38% | `.scratch/refs/precious-board/design-guidelines.md` | Abschnitte 2.3, 2.4, 2.8 |
| 1200ms und Glas 10px | Einblenden 1200ms `linear`; Glaskoerper `blur(10px)` mit `rgba(255,255,255,0.1)`; Glas nur ueber Bild | `.scratch/refs/precious-board/design.md`, `design-components.md` | `--ed-t-brand` und `--ed-blur-glass` an je genau einer Stelle |
| Fokusring, Lime-Grenze, Ziele | Fokus 2px `#cbff97` auf dunklem Grund; Lime nur auf `#024364` oder dunkler; Ziele mindestens 48 x 48px (Telefon) und 44 x 44px (Tablet); Abstand zwischen Zielen mindestens 8px | `.scratch/refs/precious-board/design.md`, `design-guidelines.md` | Fokusring, Lime ausschliesslich auf Tiefwasser, Zielgroessen |
| Zustandsdauer im Bestand | 240ms `cubic-bezier(0.16, 1, 0.3, 1)` fuer Farbe und Kante | `.scratch/refs/nick/tools/design-rules.css` | `--ed-ease-standard` mit demselben Wert |
| Textkontrast | 4,5:1 normal, 3:1 gross (ab 18pt, 14pt fett, das sind rund 24px und 18,5px); Formel (L1+0,05)/(L2+0,05); nicht runden, 4,499 ist kein Treffer; Platzhalter, Ueberfahr- und Fokustext zaehlen mit | W3C, WCAG 2.2, Understanding SC 1.4.3, https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html | Grenzen der Tabellen in Abschnitt 8 |
| Nicht-Textkontrast | 3:1 fuer Bedienelementgrenzen, Zustaende und bedeutungstragende Grafik; deaktivierte Elemente ausgenommen; Ueberfahreffekte muessen nicht 3:1 erreichen; der Fokusring muss gegen die Nachbarflaeche erreichen; eine Kante ist nur noetig, wenn es keinen anderen sichtbaren Hinweis gibt | W3C, WCAG 2.2, Understanding SC 1.4.11, https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html | Abschnitt 8.2 und die Begruendung, warum `--ed-line-hairline` dekorativ bleiben darf |
| Feldbezogene Bedienelemente im Seitenbau | Inspektor mit den Abschnitten Layout, Abstand, Typografie, Rand, Hintergrund; Umschreiben von Werten an einzelnen Geraetepunkten; Farbwaehler; Werte als Variablen und Klassen; Wiederholfelder in Elementen wie Repeater und Tabs | Elementor, Editor V4 Hilfe, https://elementor.com/help/build-with-the-editor/v4-editor/ (u. a. Style tab - Spacing, Style tab - Border, Responsive editing, Use the color picker, Variables, Classes) | Umfang der Felder in Abschnitt 3.5 und die Geraetepunkte |
| Schieberegler | Slider musste in mehreren Umgebungen bestehen: Zahlenwert sichtbar beim Durchfahren, Kerben bei variablen Schriften, Farbton- und Deckkraftvorschau beim Farbeinstellen | Figma, Our approach to designing UI3 | Slider mit Wertblase, Einheit und Deckkraft im Farbwaehler |

**Nicht nachpruefbar in diesem Lauf:** Fuer Framer, Webflow (Zahlenwerte), Notion, Craft und Arc habe ich keine oeffentliche, seitenweise Belegtafel mit Massen gefunden; Framer und Webflow liefern nur Bedienkonventionen (Panel-Aufbau, Canvas-Werkzeuge), keine Pixelwerte. Die betroffenen Masse in Abschnitt 3 sind deshalb als eigene Festlegung auf dem 4px-Takt und den Carbon-Stufen begruendet, nicht als Messung. Das ist als offener Punkt in Abschnitt 11 gefuehrt.

## 10. Was der Editor koennen muss (Abgleich mit dem Ticket)

Aus `issues/03-editor-chrome.md`, hier nur die Zuordnung zur Oberflaeche:
Explorer mit Umbenennen, Sperren und Verstecken je Geraetepunkt, Ziehen mit Zyklusschutz, Tabs Seiten/Vorlagen/Komponenten/Medien: Abschnitt 3.3. Kontextmenue mit Duplizieren, Kopieren, Einfuegen, Einwickeln, Navigator-Sprung, Loeschen: 3.7. Spotlight `Cmd+K`: 3.8. Inline-Bearbeitung mit Zusammenfassen zu einem Rueckgaengig-Schritt: Auswahlrahmen 3.9, Schreibfluss ohne neuen Zustand (nur der Auswahlrahmen bleibt, Textcursor im Element). Verlauf mit Zeit und Aktion: Dialog 3.12 als Blatt, Liste mit Zeilen 28px. Design/Live-Umschalter, Zoom-Fusszeile 0,25 bis 2,0 mit `Cmd+0`: 3.1 und 7. Tastatur: Abschnitt 5. Kein Overlay fuer Text: 3.9 und Grundsatz 3.

## 11. Offene Punkte

Stand nach der Schlussrunde: Die Punkte 1 bis 4 und 8 sind geschlossen; 5 bis 7 bleiben offen.

1. ~~Bildschirmpruefer fehlt~~ **erledigt.** `packages/editor/test/ui/plan-tokens.test.ts` prueft die
   Editor-Tokens Wert fuer Wert gegen diesen Plan (inklusive der acht neuen Tokens aus `ui-plan.md`
   Abschnitt 0) und die Verbotsregeln; `packages/editor/test/ui/contrast.test.ts` rechnet alle Paare
   aus Abschnitt 8 mit Luminanz nach, inklusive der Ausnahme, dass `--ed-ink-faint` nur Nicht-Text ist.
2. ~~Paritaet Vorschau zu Tokens~~ **erledigt.** `packages/editor/test/ui/vorschau-paritaet.test.ts`
   vergleicht die einkopierten Tokens, die `@font-face`-Liste und den Symbolblock der Vorschau gegen
   `packages/editor/src/ui/tokens.ts`, `fonts.ts` und `icons.ts`.
3. ~~Schriftschnitt~~ **erledigt.** Inter und Inter Display liegen lokal unter
   `packages/editor/assets/fonts/` (SIL OFL 1.1, `LICENSE.txt`), eingebunden mit `font-display: swap`
   in den Editor (`styles.ts` + `fonts.ts`, Route `/editor-fonts/*`) und in die Vorschau; im Browser
   gemessen ohne Layout-Sprung (CLS 0).
4. ~~Symbolbezug~~ **erledigt.** Phosphor Icons, Regular (MIT), lokal unter
   `packages/editor/assets/icons/` (Herkunft in `SOURCE.md`). Regular zeichnet im 256er-Raster mit 16
   Einheiten Strich, das sind bei 24px genau 1.5px.
5. **Andocken:** die Regeln fuer Breiten und Ziehen sind festgelegt, aber die Mindestbreite der Buehne
   und das Verhalten bei drei Frames nebeneinander sind noch nicht gemessen (Aufgabe 29).
6. **Papierkorb und Mehrfachauswahl** ueber mehrere Tabs sind beschrieben, aber im Zustandsraum nicht
   vollstaendig belegt.
7. **Fuer Framer, Notion, Craft und Arc fehlen belegte Pixelwerte** (siehe Abschnitt 9, letzter Absatz).
8. ~~Zwei Paletten im Haus~~ **erledigt.** `packages/tokens/src/default-theme.ts` traegt jetzt die
   Tiefwasser-Palette: Marke `brand-700` `#024364`, Akzent `brand-600` `#006092` (Werte aus
   `.scratch/refs/precious-board/design.md`, dieselben Anker wie `tokens.ts`). Der alte Indigo
   `#4f46e5` steht als `LEGACY_INDIGO` bereit; gespeicherte Sites behalten ihren eigenen Theme-Schnappschuss,
   die Umstellung ist ein reiner Werttausch.
