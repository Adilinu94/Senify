# Elementor-V4-Abnahme, 06.11.2026

Status: **Interaktive Referenzaufnahme des Core-Editors abgeschlossen, Senify-Parität offen.** Kein Paritätsnachweis, keine Pro-Abnahme. Die Aufnahme ergänzt die Recherche in `elementor-v4-editor.md` um tatsächlich ausgeführte Zustände und eine bestätigte Speicherung.

## Umgebung

- Lokale, getrennte Referenz unter `data/elementor-v4-reference/` (gitignoriert): WordPress 7.1.4, Elementor Core 4.3.6, MariaDB 10.4.27, PHP 8.2.0.
- Start über `data/elementor-v4-reference/start.ps1`; HTTP `http://127.0.0.1:43318/`, Datenbank `127.0.0.1:43317`.
- Testseite `Editor Referenz`, ID 5, anfangs ohne Inhalte. Zugangsdaten liegen nur in der ignorierten lokalen `credentials.json`.
- Aufnahme am 06.11.2026 mit Chromium (headless), fester Viewport 1440 × 900. Die Seite wurde für die Abnahme um ein atomares Heading ergänzt und veröffentlicht; danach wurde nichts weiter verändert.

## Live bestätigte Oberfläche

**Topbar:** Elementor-Logo, `+` (Add Element), Angie (KI), History, Design System, Page Settings, Dokumenttitel, Desktop/Tablet/Mobile, What's New, Finder, Structure, Preview, Publish und Save Options.

**Linkes Panel:** `Elements` mit `Widgets | Components | Globals`, Suche und der Gruppe `Atomic Elements`: Div block, Flexbox, Grid, Tabs, Accordion (New), Heading, Image, Paragraph, SVG, Button, YouTube, Divider, Video, Background Video (New), Loop. Zusätzlich `Atomic Form` (Upgrade), `Custom Widget` (Try for free) und die Pro-Widget-Gruppen (Upgrade) sowie klassische Layout-/Basic-/General-Gruppen. Fußzeile: „Access all Pro widgets. Upgrade Now“.

**Leere Seite:** Theme-Kopf und -Fuß von Twenty Twenty-Five, Seitentitel, gestrichelte Drop-Zone mit Plus, Vorlagen-Ordner, KI-Symbol und „Drag widget here“. Die Structure-Leiste zeigt beim leeren Zustand die Einführung „Easy Navigation is Here!“.

**Design System:** eigenes Panel mit den Tabs `Defaults | Variables | Classes`.
- Defaults: Tag-Auswahl `h1`, Layout, Spacing, Size, Position, Typography, Background, Border, Effects, Custom CSS (Pro-Krone), `Save changes` zunächst deaktiviert.
- Variables: Suche, Plus und „Create your first variable“; im ausgelieferten Zustand keine Variablen.
- Classes: „There are no global classes yet“, Suche, Filter, Zähler 0. Die Class-Manager-Einführung erklärt Priorität, Umbenennen und Löschen; Änderungen an einer Klasse gelten für alle Elemente dieser Klasse.

**Atomares Heading:** Das per Drag-and-drop eingefügte Element öffnet den Bearbeitungsmodus mit den Tabs **Content | Style | Advanced**.
- Content: Heading/Title mit „Write with AI“, Link, HTML-Tag (H1–H6, div, span, p), Hinweis „Accessible structure matters“ mit Ally-Installationsangebot, Need Help.
- Style: Alignment, Typography (mit Token-Symbol und Stift), Text Stroke, Text Shadow, Blend Mode, **Normal/Hover-Umschalter**, Text Color (Token und Farbfeld).
- Advanced: Layout (Margin, Padding, Width, Align Self, Order, Size), Position, Z-Index, CSS ID, **CSS Classes**, Cache Settings.

**Weitere Zustände:** Structure-Baum `Container > Heading`; History mit `Actions | Revisions` und den Einträgen „Heading Added“ und „Editing Started“; Page Settings mit `Settings | Style | Advanced` (Titel, Status Published, Featured Image, Order, Kommentare, Hide Title, Page Layout); Tablet- und Mobil-Vorschau über die Topbar.

## Verifizierter Ablauf

1. Editor geöffnet, leere Seite und Drop-Zone geprüft.
2. Design System geöffnet; Defaults, Variables und Classes aufgenommen; die Class-Manager-Einführung gelesen.
3. Atomares Heading per Drag-and-drop eingefügt und ausgewählt.
4. Content, Style (inklusive Normal/Hover) und Advanced aufgenommen.
5. Structure, History, Page Settings sowie Tablet und Mobile geprüft.
6. Über den Topbar-Button `Publish` gespeichert. Der Button zeigt während des Speicherns einen Spinner, keinen separaten Dialog.
7. Nach dem Neuladen des Editors ist das Heading weiterhin vorhanden; auf `/?page_id=5` erscheint es ebenfalls. Die Persistenz ist damit für diesen Ablauf bestätigt.

## Wichtige Versionskorrekturen

- Das **atomare Heading** verwendet live `Content | Style | Advanced`; die früheren Referenzbilder mit `General | Style` zeigen nicht dieses atomare Element (klassisches Widget oder ältere Aufnahme).
- Das Design System hat live **Defaults, Variables und Classes**; die ältere Referenzabbildung zeigt nur Variables und Classes.
- Der Zustand im Heading-Style ist ein **Normal/Hover-Umschalter** innerhalb der Gruppe, kein separater Zustands-Tab.
- Die Klassenverwaltung ist im ausgelieferten Zustand leer; die Einführung zeigt lediglich Beispielnamen (`btn-accent`, `primary-headline`, `secondary-headline`, `primary-text`).

## Abgleich mit Senify

Der Live-Vergleich mit dem Senify-Editor war in dieser Umgebung nicht möglich, weil die lokale Datenbank für den Editor nicht startfähig ist. Die folgende Zuordnung ist daher ein Code-/Architekturabgleich, kein visueller Paritätsnachweis.

| Elementor-V4-Oberfläche | Senify-Grundlage | Offen |
| --- | --- | --- |
| Topbar mit Add Element, Angie, History, Design System, Page Settings, Finder, Structure, Preview, Publish/Save Options | Senify-Topbar, Explorer, Canvas und Inspector vorhanden | Einheitliche Design-System-Leiste, Finder, Structure, History und Publish-/Save-Optionen angleichen |
| Atomic Elements und klassische Widgets nebeneinander | Senify-Katalog und Atomic-Dokumentmodell | Atomic-Bibliothek, Drag-Ziel, leere Drop-Zone und Classic-/Atomic-Mischbetrieb abgleichen |
| Content/Style/Advanced am atomaren Element | Senify-Inspector mit Feldern, Tokens und Zuständen | Tabstruktur, Normal/Hover-Umschalter, Token-Symbole und CSS-Classes-Feld prüfen |
| Design System Defaults/Variables/Classes | Style-Registry mit globalen/scoped Regeln, Zuständen und Kontexten; Variablen-Panel | Einheitliches Design-System-Panel, Klassenpriorität, Umbenennen/Löschen/Verwendung und Defaults |
| History Actions/Revisions | Undo/Redo, History-Dialog und serverseitige History | Revisionsliste und Aktionsbezeichnungen vergleichen |
| Page Settings Settings/Style/Advanced | Seitenmetadaten und Inspector | Felder und Speicherorte feldweise prüfen |
| Tablet/Mobile über Topbar | Drei Geräte-Frames | Umschaltung, Breiten und Zustandsdarstellung vergleichen |
| Pro-Markierungen an Atomic Form, Custom Widget, Pro-Widgets und Custom CSS | keine Pro-Funktionen | Pro-Referenz und Entscheidung nötig; mit Core nicht prüfbar |

Die Klassenpriorität bleibt wie in der Recherche beschrieben: lokal vor global; in der globalen Liste steht oben die stärkere Klasse. Senify speichert stärkere Regeln weiterhin am Ende; der Compiler weicht bei der Reihenfolge von lokalen und Klassenwerten ab. Das ist keine Parität und braucht eine eigene Migrations- und Kaskadenabnahme.

## Grenzen

- Nur Elementor Core 4.3.6; Atomic Form, Custom Widget, Pro-Widgets und Custom CSS sind Upgrade-/Pro-Flächen und wurden nicht ausgeführt.
- Die **Anlege-, Such-, Umbenenn- und Löschabläufe** für Variablen und Klassen wurden nicht ausgeführt; aufgenommen sind die leeren Zustände und die Class-Manager-Einführung.
- Die klassischen Widgets mit `General/Style` wurden nicht separat live geöffnet; die früheren Referenzbilder decken diese Oberfläche nur als Dokumentation ab.
- Die KI-Aktionen (Angie, Write with AI) und die Ally-Installation wurden nicht ausgeführt.
- Der Senify-Live-Vergleich und die Pixel-/Interaktionsparität sind offen (lokale Datenbank nicht startfähig).

## Belege

Alle Aufnahmen liegen unter `docs/research/elementor-captures-2026-11-06/` und wurden mit dem festen Viewport 1440 × 900 erstellt.

- [Editor, leer](elementor-captures-2026-11-06/40-editor-empty.png)
- [Design System, Defaults](elementor-captures-2026-11-06/41-design-defaults.png)
- [Design System, Variables](elementor-captures-2026-11-06/42-design-variables.png)
- [Class-Manager-Einführung](elementor-captures-2026-11-06/43-design-classes-intro.png)
- [Design System, Classes leer](elementor-captures-2026-11-06/44-design-classes-empty.png)
- [Structure mit Container und Heading](elementor-captures-2026-11-06/49-structure.png)
- [Tablet-Vorschau](elementor-captures-2026-11-06/50-tablet.png)
- [Mobil-Vorschau](elementor-captures-2026-11-06/51-mobile.png)
- [History](elementor-captures-2026-11-06/52-history.png)
- [Page Settings](elementor-captures-2026-11-06/53-page-settings.png)
- [Heading, Content](elementor-captures-2026-11-06/71-heading-general.png)
- [Heading, Style mit Normal/Hover](elementor-captures-2026-11-06/72-heading-style.png)
- [Heading, Advanced](elementor-captures-2026-11-06/73-heading-advanced.png)
- [Editor nach dem Neuladen](elementor-captures-2026-11-06/76-after-reload.png)
- [Veröffentlichte Frontend-Seite](elementor-captures-2026-11-06/77-frontend-published.png)

## Reproduktion

```powershell
& .\data\elementor-v4-reference\start.ps1
# Login mit der lokalen credentials.json (nicht versioniert)
# Editor: http://127.0.0.1:43318/wp-admin/post.php?post=5&action=elementor
# Öffentlich: http://127.0.0.1:43318/?page_id=5
```

Die Aufnahme verwendete Playwright/Chromium aus dem Projekt. Die Referenzdienste wurden nach der Aufnahme gestoppt; `start.ps1` startet sie erneut.
