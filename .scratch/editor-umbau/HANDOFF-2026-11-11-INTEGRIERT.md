# Handoff: Senify-Editor, Elementor-Abgleich, Astryx und Framer-Import

- **Bestandsaufnahme:** 11.11.2026, nach Integration des Editor-Fixes.
- **Maßgeblicher Hauptordner:** `C:\Users\adini\projects\Senify`
- **Branch und geprüfter HEAD:** `integration/c-auf-g-2026-11-08` / `1a5c443`.
- **Charakter:** Übergabe und Momentaufnahme, kein Ersatz für die verbindlichen Projektdokumente. Bei Wiederaufnahme HEAD, Arbeitsbaum und laufende Sitzungen erneut prüfen.

## 1. Sofort verständlich: Wo stehen wir?

Der Editor hat bereits eine umfangreiche eigene Grundlage für visuelle Bearbeitung, responsive Ansichten, Klassen, Variablen sowie lokale und serverbestätigte History. Er ist **nicht als Elementor-V4-gleich abgenommen**. Es gibt eine Elementor-Referenzaufnahme und einen ersten begrenzten Vergleich, aber keine vollständige Gegenüberstellung derselben Abläufe und Daten. Eine Prozentangabe zur Parität wäre spekulativ.

Beim praktischen Editorvergleich wurde ein Fehler nach dem Anlegen einer globalen Klasse gefunden und behoben: Nach Speichern und Neuladen konnte die History gesperrt sein. Der Fix und sein Browser-Regressionstest sind im Hauptordner integriert. Der jüngste Framer-Stand und der Editor-Fix wurden gemeinsam geprüft und in `1a5c443` zusammengeführt.

Der Framer-Import kann bereits ausgewählte reale Seiten als bearbeitbare Struktur übernehmen und in einzelnen Fällen bis zum Build und Browser nachweisen. **Vollständige Darstellungstreue, Motion, Interaktionen, CMS-/Mehrseitenabdeckung und Runtime-Freiheit sind damit nicht allgemein bewiesen.** Laut aktuellem Fahrplan hat dieses Produktziel weiterhin Vorrang.

Astryx wurde isoliert als Dialog und Eingabefeld ausprobiert, jedoch nicht in Senify integriert. Die Probe ist ein Erkenntnisgewinn, keine Architekturentscheidung. Der Prototyp liegt außerhalb des Repositories und ist nicht durch den Git-Stand gesichert.

**Empfohlener erster Editor-Schritt:** Gleiche Testinhalte für Elementor und Senify vorbereiten und Heading mit Link sowie Container vollständig vergleichen. Jede Abweichung mit Referenz, Senify-Stand, Auswirkung und reproduzierbarem Ablauf dokumentieren; belegte Fehler anschließend einzeln beheben. Parallel zur Reihenfolge des Projektfahrplans die offenen Framer-Fälle verfolgen.

## 2. Quellen, Verbindlichkeit und Dokumentationsregeln

1. `AGENTS.md` und `CONTEXT.md`: Arbeitsregeln, Begriffe und Domäneninvarianten.
2. `docs/adr/`: angenommene Entscheidungen, insbesondere `0031-lokale-stile-vor-globalen-klassen.md`, `0032-ausgabeart-framer-import.md` und `0030-historische-tokenmigration-bei-umbenennung.md`.
3. `docs/fahrplan.md`: priorisierte Arbeit, Risiken, Definition of Ready und Gates. `docs/framer-roadmap.md` konkretisiert das Framer-Ziel.
4. `docs/current/stand.md`: aktueller Umsetzungsstand. `docs/current/qualitaet.md`: Test- und Gate-Ergebnisse mit Messzahlen und jeweiligem Stand. Testzahlen nicht in weitere Dokumente kopieren.
5. `.scratch/editor-umbau/elementor-abgleich-2026-11-11.md`, `astryx-probe-2026-11-11.md` und `issues/10-klassen-history-nach-reload.md`: konkrete Beobachtungen dieser Arbeit.
6. `docs/research/elementor-v4-acceptance-2026-11-06.md` und `docs/research/elementor-hcm-live-analyse-2026-11-06.md`: Elementor-Referenzen und Grenzen.
7. `.scratch/framer-import/map.md`, `.scratch/motion-import/map.md` und die jeweils verlinkten Issues: Arbeitsmaterial zu konkreten Importfällen. Ihre Statusangaben gegen die aktuellen Projektdokumente prüfen.

`HANDOFF-2026-11-11.md` im selben Ordner bleibt als ältere, unversionierte Übergabe erhalten. Sein Ausgangs-HEAD ist `821d2bd`; Angaben zu damals noch ausstehender Integration, zur Astryx-Probe und zu responsiven Bildgrößen sind durch die spätere Arbeit überholt. Auch `.scratch/editor-umbau/map.md` enthält ein älteres Arbeitsprotokoll: Insbesondere sind strukturierte Tokenmigration, Rename-History und schrittweise History-Sprünge gemäß späteren Einträgen und `docs/fahrplan.md` bereits teilweise beziehungsweise im beschriebenen Umfang umgesetzt. Alte Pläne und Statuszeilen nicht ungeprüft als aktuellen Iststand verwenden.

## 3. Arbeitsstand und Übergang in den Hauptordner

- `48adec1`: Korrektur der Klassen-History und Browserregression, erster Elementor-Abgleich und Astryx-Bericht im separaten Arbeitszweig.
- `0922add`: Abgleich des Editorzweigs mit dem damaligen Framer-Hauptstand.
- `4d56e2d`: späterer Framer-Fix für Punktzentrierung und seitenspezifische Keyframe-Namen.
- `1a5c443`: beide Linien zusammengeführt und anschließend per Fast-forward in den Hauptbranch übernommen. Der Dokumentationskonflikt in `docs/current/qualitaet.md` wurde durch Erhalt beider Testnachweise gelöst. Eine überflüssige Leerzeile in einem übernommenen Framer-Prüfskript wurde entfernt.

Das alte unversionierte Handoff wurde für die Übernahme kurz außerhalb des Hauptordners aufbewahrt, anschließend zurückgelegt und anhand seiner Prüfsumme als unverändert bestätigt. Beim letzten Statuscheck lag es weiterhin unversioniert vor. Dieses neue Handoff ist eine weitere Dokumentdatei; aus ihrem Vorhandensein folgt kein Commit.

Vor neuer Arbeit `git status --short --branch`, HEAD und gegebenenfalls `git worktree list` prüfen. Nichts aus fremden Arbeitsständen ohne Zuordnung überschreiben. Projektregel: Jede neue Entwicklungsscheibe beginnt mit der Definition of Ready aus `docs/fahrplan.md`, einschließlich sauberer Arbeitsbasis und keiner gleichzeitigen Bearbeitung derselben Dateien, und endet mit passendem ausgeführten Gate und gesichertem Ergebnis. Unversionierte Dokumente sind bewusst zu erhalten; ihre bloße Existenz nicht durch Stash, Reset oder Löschung verstecken.

## 4. Belegter Editor-Stand und Grenzen

| Bereich | Im beschriebenen Umfang belegt | Offen oder begrenzt |
| --- | --- | --- |
| Editor, Canvas und Geräte | Werkzeugleiste, Elementkatalog, Struktur, Inspector und Geräteansichten sind vorhanden; ein Heading wurde interaktiv geändert, gespeichert und nach Reload per Undo/Redo geprüft. | Bedienung und Darstellung nicht für alle Zustände mit Elementor verglichen. Die App nutzt einen Geräte-Frame; das Canvas-Modul kennt weitere Ansichtsoptionen. |
| Elemente und Inspector | Elemente können eingefügt und bearbeitet werden; lokales/globales Stilziel, Geräte, Zustände, Werte und Einheiten sind in dokumentierten Teilbereichen vorhanden. | Vollständigkeit des Katalogs, Controls, Einfügeziele, Verschachtelung, Reset und Bedienlogik gegenüber Elementor sind noch zu inventarisieren. |
| Globale Klassen | Anlegen, Zuweisen, Suchen, Duplizieren, Umbenennen, Priorisieren und geschütztes Löschen/Wiederherstellen sind für dokumentierte Fälle abgedeckt. | Verwendungsprüfung erfasst nicht sämtliche veröffentlichten, externen oder indirekten Referenzen; Importklassen und erkannte problematische Selektoren können absichtlich geschützt sein. Konfliktfreies Zusammenführen und Live-Synchronisierung konkurrierender Änderungen bleiben offen. |
| Variablen | Primitive Familien einschließlich Farbe, Abstand, Radius, Schatten, Schriftgröße und Schriftfamilie sind gemäß Fahrplan in bestimmten Verwaltungs- und Verwendungswegen vorhanden. Rename/Delete/Restore verfügen über Schutzmechanismen. | Semantische Typen, vollständige Übereinstimmung mit Elementor und durchgängiges Verhalten über Editor, MCP und Build gesondert prüfen. Externe, dynamische, indirekte und ungespeicherte Verweise sind nicht vollständig erfasst. |
| Kaskade | ADR-0031 entscheidet: engere Bedingung vor Herkunft, bei gleicher Bedingung lokal vor global; Inline bleibt eine eigene stärkere Stufe. Der Compiler und Tests belegen die Matrix. | Frei gewählte Ambient-Selektoren behalten ihre Spezifität. Ein Ausbau darf vorhandene Projekte und Framer-Importe nicht unbeabsichtigt verändern. |
| History | Lokale Schritte und bestätigte externe Klassen-/Variablenvorgänge nutzen eine gemeinsame History mit Retry-, Reload-, Konflikt- und Recovery-Schutz. Strukturierte Tokenverweise werden beim dokumentierten Rename-Fall migriert. | History-Sprünge sind schrittweise, nicht eine atomare Gesamttransaktion. Historische CSS-Textverweise können zum Verwerfen alter History führen. Unklare Vorgänge dürfen nicht still als bestätigt gelten. |
| Darstellung und Accessibility | Eigene Editor-Tokens, Hell-/Dunkelmodus und visuelle Browser-Baselines sind vorhanden. | Senify-Baselines sind keine Elementor-Paritätsbelege. Tastatur, Fokus, Kontrast, Screenreader und kleine Viewports für reale Abläufe gesondert prüfen. |
| Import im Editor | Ein kontrollierter Strukturimport deckt Bearbeitung, Speichern, Reload, Undo/Redo und Build ab. Ein Link-Inhalt ist im Inspector anhand eines konkreten Importfalls nachgewiesen. | Das ist keine vollständige Echtseiten-Abnahme aller Medien, Gerätestufen, Komponenten, Interaktionen oder Ausgabemodi. |

Einstiegspunkte: `packages/editor/src/inspector/inspector.ts`, `packages/editor/src/canvas/canvas.ts`, `packages/editor/src/state/`, `packages/app/public/app.js`, `packages/widget-engine/src/css/`, `packages/app/test/class-editor-browser.test.ts`, `packages/app/test/variable-history-browser.test.ts` und `packages/app/test/framer-import-browser.test.ts`. Funktionsbehauptungen beim nächsten Schritt mit passendem Code- oder Testbeleg verbinden.

### Zuletzt behobene Klassen-History

- **Symptom:** Eine neu angelegte und gespeicherte globale Klasse führte nach Reload zu einer Recovery-Warnung und blockiertem Undo.
- **Ursache:** Die Engine ergänzte für die angelegte Regel `authoredBy: user`; die lokal im Inspector erzeugte Regel im History-Checkpoint hatte dieses Feld zunächst nicht. Der strenge Inhaltsvergleich erkannte korrekt eine Abweichung.
- **Korrektur:** Der Inspector setzt denselben Urheberwert bereits bei der lokalen Erstellung. Der Checkpoint-Vergleich bleibt streng.
- **Beleg:** `packages/app/test/class-history-reload-browser.test.ts` war vor der Korrektur rot und prüft anschließend Speichern, Reload, fehlende Recovery-Warnung, Undo und Redo. Der Fall verwendet eine isolierte In-memory-Datenbank; er belegt weder PostgreSQL-Konkurrenz noch automatische Reparatur alter abweichender Checkpoints. Weitere Details: `.scratch/editor-umbau/issues/10-klassen-history-nach-reload.md`.

## 5. Elementor-Referenz: was bekannt ist und was fehlt

Die dokumentierte Core-Referenz zeigt unter anderem Topbar, Atomic Elements, Design System, Heading mit `Content` / `Style` / `Advanced`, Zustände, Structure, History und Geräteansichten. Ein Heading und eine Farbvariable wurden in dokumentierten Abläufen angelegt und nach Speichern beziehungsweise Reload betrachtet. Die weitere lokale Referenz zeigte reale globale Klassen und Variablen, verwendet aber `pro-elements` und Add-ons; sie ist **kein Nachweis für offizielles Elementor Pro**.

Im begrenzten Senify-Vergleich wurden eigene Tabs `Allgemein`, `Stil`, `Interaktionen` beobachtet; die Elementor-Aufnahme zeigt andere Gruppierungen. Die Elementor-Aufnahme enthielt ein Link-Feld beim Heading, das im beobachteten Senify-Zustand nicht sichtbar war. Daraus folgt nicht, dass Senify keine Links unterstützt: Ein eigener Link-Inhalt-Browsertest existiert. Die Struktur war im Referenzbild als überlagerte Ansicht, in der untersuchten Senify-Ansicht als feste Spalte sichtbar. Andere Daten, Versionen und Aufnahmezeitpunkte verhindern daraus abgeleitete Paritätsurteile.

Der vollständige Elementor-Lebenszyklus für Testklasse und Testvariable ist in einer stabilen Referenzumgebung weiterhin zu prüfen. Laut späterem Nachtrag in `docs/research/elementor-hcm-live-analyse-2026-11-06.md` wurden damalige Testklasse, Testseite und temporäre Administratoren nach den dokumentierten Läufen entfernt; ältere gegenteilige Abschnitte sind historisch. Der gegenwärtige Livezustand wurde für dieses Handoff nicht erneut geprüft. Reale Seiten, Klassen und Variablen bei weiteren Versuchen erhalten und nur klar gekennzeichnete Testobjekte verwenden.

### Konkrete Vergleichsmatrix

Für Elementor und Senify möglichst dieselbe kleine Seite und identische Inhalte anlegen. Elementor-Version, aktive Experimente und Erweiterungen, Senify-Commit, Testdatum, Browser, Viewport, Ausgangsdaten und Speicherstatus je Vergleich vermerken. Core, Add-ons und offizielles Pro getrennt ausweisen.

| Ablauf | Was zu prüfen ist | Ergebnisform |
| --- | --- | --- |
| Heading mit Text und Link | Einfügen, Inhalt, Ziel/Linkoptionen, Stil, Speichern, Reload, sichtbare Ausgabe, Undo/Redo. Unterschied zwischen Heading-Link und separatem Link-Element beachten. | Screenshot und tatsächlicher UI-/Build-Beleg; `nicht geprüft`, wenn ein Schritt nicht zugänglich ist. |
| Container und Struktur | Verschachteln, auswählen, Reihenfolge ändern, Strukturansicht öffnen/schließen, Element wiederfinden, speichern und erneut laden. | Gleiche Ausgangshierarchie und beobachtete Bedienwege beider Seiten. |
| Geräte und Zustände | Basis, Tablet/Mobil sowie verfügbare Hover-/Fokuszustände; Vererbung, Reset und erkennbare Herkunft vergleichen. | Vorher-/Nachherwerte und sichtbare Ausgabe je Bedingung. |
| Globale Klasse | Anlegen, zuweisen, ändern, Priorität prüfen, Verwendung ansehen, speichern, Reload, Undo/Redo; erforderlichenfalls auf einer zweiten Testseite prüfen. | Klasse, Knoten und Registry prüfen; Sicherheits- und Nutzungsschranken dokumentieren. |
| Variable | Typ anlegen, zuweisen, ändern, Verwendung, Rename/Delete sofern unterstützt, Speichern/Reload und Ausgabe. | Typ, Gültigkeit, Schutzverhalten und Referenzen getrennt notieren. |
| Bedienbarkeit | Tastaturweg, Fokuswechsel und -rückkehr, verständliche Beschriftung, lange Texte, schmaler Viewport und Screenreader. | Beobachtung und verwendete Prüfmethode; fehlende Prüfung nicht als bestanden markieren. |

Jeden Unterschied als **bestätigten Fehler**, **bewusste Produktabweichung**, **unterschiedliche Referenzumgebung** oder **ungeprüfte Frage** einordnen. Erst nach reproduziertem Befund Code ändern. Abschluss der ersten Scheibe: Ein vollständiger Heading-/Link- und ein Containerablauf sind anhand gleicher Testdaten nachvollziehbar dokumentiert; nicht verfügbare Schritte sind ausdrücklich als ungeprüft markiert.

## 6. Astryx: Ergebnis, Grenzen und Entscheidungspfad

Die isolierte Probe verwendet `@astryxdesign/core` und `@astryxdesign/theme-neutral` sowie React. Ein Eingabefeld bearbeitet einen Testnamen; ein Dialog fragt eine Löschung ab. Manuell geprüft wurden Eingabe, Öffnen, Abbrechen, Bestätigen, Escape, Fokus innerhalb des Dialogs und Rückkehr zum Auslöser, Dark Mode und ein schmaler Viewport. Das belegt nur diesen Prototypzustand.

Der Prototyp liegt unter `C:\Users\adini\.codex\visualizations\2026\11\04\01a1a6ea-a65c-7161-89e3-b25fdcb81c75\astryx-probe`. Dort enthält `src/main.jsx` die Oberfläche; `node serve.mjs` startet die lokale Probe. Dieses Verzeichnis ist **nicht Teil des Senify-Commits**. Vor einer späteren Nutzung Verfügbarkeit und Reproduzierbarkeit prüfen; falls die Probe dauerhaft benötigt wird, gezielt sichern.

Integrationsfragen:

1. Senifys Inspector ist wesentlich DOM-basiert; klären, wie React-Komponenten eingehängt und beim Panelwechsel sowie Editorende zuverlässig entfernt werden.
2. Echte Store-, Save-, Undo-/Redo- und Konfliktpfade erhalten und testen; ein Testfeld mit lokalen Daten beweist diese Integration nicht.
3. Theme-Attribute, CSS-Reset, Selektoren, Portale und Variablen auf Wechselwirkungen mit Editorhülle, Canvas und Website-Ausgabe prüfen.
4. Zusätzliche Produktions-Bundlegröße im echten Senify-Build messen. Die Größe des eigenständigen Prototyps enthält React und Theme und ist kein Zusatzkostenwert für Senify.
5. Tastatur, Fokus, Screenreader, Kontrast, Übersetzung, Fehlermeldungen, lange deutsche Texte und unterschiedliche Bildschirmgrößen abnehmen.
6. Versionierung, Beta-Reife, Wartung und Lizenz-/Copyright-Hinweise einschließlich tatsächlicher Abhängigkeiten vor Übernahme prüfen.

Erst ein konkretes bestehendes Control oder einen Dialog aus der Vergleichsmatrix wählen und mit der Senify-Variante unter denselben Zuständen vergleichen. Ergebnisoffen zwischen punktueller Nutzung, Inspiration und Verzicht entscheiden. Ein kompletter Wechsel des Editors ist derzeit weder beschlossen noch durch die Probe belegt.

## 7. Framer-Import: belegte Fortschritte und offene Aufgaben

### Ausgabe und Editierbarkeit

ADR-0032 unterscheidet Original-Ausgabe und strukturierte Ausgabe. Der aktive Original-Payload kann die Framer-Runtime enthalten und den Editorbaum als Ausgabeträger überdecken. Die Struktur-Ausgabe verwendet den Senify-Baum und darf nicht allein aufgrund der Moduswahl als vollständig runtimefrei oder originalgetreu bezeichnet werden. Bestehende Projekte, Versionsschutz, explizite Wechsel, Reimport und Restore beim Weiterbau beachten.

Ein kontrollierter Browserfall deckt Import, Textänderung im Editor, Speichern, Reload, Undo/Redo und Build ab. Auf realen Beispielseiten wurden Strukturimporte und weitere Ausgabeeigenschaften dokumentiert. Diese einzelnen Nachweise nicht auf sämtliche Seiten, Funktionen und externen Abhängigkeiten verallgemeinern.

### Konkrete Restfälle

- **Hover:** Für das dokumentierte Textlink-Beispiel fehlt im Build eine Hover-Regel. Quelle und Ziel bei Hover, Fokus und Touch reproduzierbar vergleichen, Erfassung und Wiedergabe getrennt eingrenzen und einen echten negativen sowie positiven Test anlegen. Die bereits nachgewiesene Link-Beschriftung und Inline-Auszeichnung nicht als offen wiedereröffnen.
- **Puls:** Der Punkt vor „200+ Firms already enrolled“ wird nach dem Fix korrekt zentriert und der gemessene Fade erhalten. Der JavaScript-Skalierungspuls der Quelle wird nicht nachgebildet. Quelle und Ziel über einen zeitlichen Verlauf erfassen; zuerst klären, ob und wie der Effekt zuverlässig ablesbar und darstellbar ist. Nicht behaupten, der Puls selbst sei bereits behoben. Siehe `.scratch/motion-import/issues/07-punkt-puls.md`.
- **Calendly / srcdoc:** Der Import meldet einen blockierten `srcdoc`-Embed und zeigt einen Platzhalter; ein gewöhnliches HTTPS-Ziel hat einen eigenen begrenzten Pfad mit Consent-Gate. Für den konkreten Fall echte Zieladresse oder manuelle Ersetzung klären und als Produktverhalten abnehmen. Kein unbelegtes automatisches Ausführen fremder Dokumente voraussetzen.
- **Responsive und visuelle Restabweichungen:** Die früher falsch skalierten Bilder sind im dokumentierten Fall korrigiert; nicht erneut als aktueller offener Fehler melden. Restabweichungen wie bewegte Marquee-Positionen, Badge-Abnahme und fehlende Zustände anhand eingefrorener Referenzbedingungen einzeln messen. Ein Durchschnittswert darf fehlende kritische Elemente nicht verdecken.
- **Mehrseiten, CMS, Assets und Links:** Inventar, zugängliche Routen, Sammlungen, Medien, Fonts, Anker und interne Links in einem repräsentativen Projekt vollständig gegen die Quelle prüfen. Fehlendes oder nicht erfassbares Material als unvollständig ausweisen.
- **Fremdcode und Runtime:** Herkunft und tatsächliche Abhängigkeiten im Build und im ausgeführten Browser getrennt prüfen. Lokal mitgelieferte Framer-Runtime ist weiterhin Framer-Runtime; unklare Skripte bleiben ungeklärt, bis sie untersucht sind.
- **Änderungen und Reimport:** Importierte Texte, Medien, Layout, Gerätewerte und ausgewählte Interaktionen im echten Editor ändern, speichern, neu laden, rückgängig machen und erneut bauen. Reimport/Restore dürfen lokale Nutzeränderungen nicht still überschreiben.
- **Breiteres Motion-Modell:** Wiederholungen, Scrollfortschritt, Trigger, Varianten und Interaktionen sind nicht durch die erfolgreiche Appear-Teillösung insgesamt abgeschlossen. `docs/framer-roadmap.md` beschreibt die darüber hinausgehenden Phasen und Gates.

Die erste vertikale Produktstrecke und Abhängigkeiten stehen in `docs/framer-roadmap.md`: belastbare Referenz und Benchmark, nachvollziehbarer Auftrag, begrenzter Mehrseiten-/CMS-Umfang, Darstellung, tatsächliche Motion-Fälle und automatisierter Nachweis. Frühzeitig eine anders aufgebaute zweite Quelle einbeziehen; keine Sonderlösung anhand nur einer Seite als allgemeine Konvertierung verkaufen.

## 8. Empfohlene Reihenfolge und konkrete Arbeitspakete

### Paket A — Ausgangsbasis vor der nächsten Änderung

1. Haupt-HEAD, Arbeitsbaum und aktive Sitzungen prüfen; relevante fremde Änderungen zuordnen. Die dokumentierte unversionierte Übergabe erhalten und Definition of Ready einhalten.
2. `docs/fahrplan.md`, `docs/current/stand.md`, `docs/current/qualitaet.md` und betroffene ADRs lesen. Ziel, betroffene Dateien, bekannten Fehler beziehungsweise Testlücke und Gate festlegen.
3. Für jede Referenz isolierte Testdaten und eine nachvollziehbare Version verwenden. Quellzustand und erreichbare Zugänge vorab prüfen.

**Fertig, wenn:** Arbeitsbasis und Umfang klar sind, kein anderer Strang dieselben Dateien bearbeitet und die gewählte Scheibe mit Projektpriorität und Gate vereinbar ist.

### Paket B — Elementor-Abgleich fortsetzen

1. Heading mit identischem Text und Link in beiden Editoren durchlaufen; vor allem kontrollieren, ob derselbe Elementtyp und Zustand verglichen werden.
2. Container und Struktur mit identischer Hierarchie anschließen; dann responsive Werte und Zustände prüfen.
3. Klasse und Variable über vollständigen Lebenszyklus vergleichen, soweit die jeweilige Referenz dies zulässt. Testobjekte anschließend dokumentiert bereinigen.
4. Befunde mit Screenshots, Eingaben, Ergebnis, Version und Auswirkung festhalten und nach Priorität ordnen.

**Fertig, wenn:** die ersten vorgesehenen Abläufe reproduzierbar dokumentiert sind und belegte Fehler klar von nicht zugänglichen Funktionen getrennt sind. Kein allgemeines Paritätsurteil aus wenigen Fällen ableiten.

### Paket C — Wichtigsten bestätigten Editorfehler beheben

1. Kleinen reproduzierbaren Fall und Regressionstest schreiben oder vorhandene Lücke benennen.
2. Betroffene UI-, Daten-, Speicher- und Historypfade minimal ändern; bestehende Projekte und Klassenzustände erhalten.
3. Passende Unit-/Browserfälle, Reload und Undo/Redo ausführen; bei konkurrierenden oder transaktionalen Schreibpfaden echten PostgreSQL-Nachweis nach Risiko einplanen.
4. `docs/current/stand.md`, Fahrplan und gegebenenfalls Risiko mit Code-/Testbeleg aktualisieren; Messzahlen ausschließlich in `docs/current/qualitaet.md` pflegen.

**Fertig, wenn:** der Ausgangsfall und relevante Nachbarfälle grün sind, Grenzen dokumentiert und der Schritt gesichert ist.

### Paket D — Framer-Hover und Puls als getrennte Fälle

1. Pro Effekt Referenzseite, Knoten, Browser, Gerät, Ausgangszustand und zeitlichen Verlauf erfassen. Live-Quelle kann sich ändern; stabile Referenzdaten oder klar datierte Belege verwenden.
2. Feststellen, ob Information schon im Capture fehlt, beim Mapping verloren geht oder im Build anders wiedergegeben wird.
3. Je belegter Ursache eine gezielte Regression und einen Browser-/Build-Nachweis ergänzen. Reduced Motion, Zustände und Seitenscope berücksichtigen.
4. Nicht erfassbare JavaScript-Effekte ausdrücklich als Grenze melden; keine exakte Wiedergabe behaupten, bevor sie nachgewiesen ist.

**Fertig, wenn:** jeweils reproduzierbares Quellen- und Zielverhalten sowie Grenzen dokumentiert sind; bei Codeänderung die relevanten Import-/Browser-Gates grün sind.

### Paket E — Astryx-Entscheidung und breitere Endabnahme

Ein echtes, aus Paket B abgeleitetes Control oder einen Dialog als begrenzten Integrationsversuch wählen und gegen die vorhandene Umsetzung messen. Nach belegtem Nutzen und tragbaren Wechselwirkungen eine ausdrückliche Architekturentscheidung dokumentieren. Anschließend die erforderlichen umfassenden Integrations-, Accessibility-, Visual-, Import-, Coverage- und Datenbankprüfungen auf dem dann aktuellen Stand planen und ausführen.

**Fertig, wenn:** Nutzen, Grenzen, Integrationsaufwand und Wartungsfolgen belegt und die für die jeweilige Produktfreigabe vorgeschriebenen Gates ausgeführt sind. Eine erfolgreiche Probe ersetzt keine Gesamtfreigabe.

## 9. Prüfstand und risikogerechte Gates

Der kombinierte Stand von Editor-Fix und Framer-Änderungen wurde vor Integration mit gezielten Editor-, History-, Browser-, Framer- und Dokumentationstests sowie Typecheck und Modulprüfung ausgeführt. Nach der Übernahme wurden der Klassen-History-Browserfall und die Dokumentationsprüfung direkt im Hauptprojekt erneut ausgeführt. Umfang und archivierte Messzahlen des Integrationstests stehen in `docs/current/qualitaet.md`.

**Wichtig:** Auf `1a5c443` wurde in dieser Arbeitsfolge kein neuer vollständiger `pnpm verify`, Coverage-Lauf oder PostgreSQL-Lauf durchgeführt. Ältere vollständige und gezielte Läufe gehören zu den jeweils dort genannten Ständen. Ein gezielter Browsererfolg ist keine Aussage über alle übrigen Pfade.

Auswahl bestehender Projektkommandos, vor Ausführung an Risiko und Umgebung anpassen:

```powershell
corepack pnpm typecheck
corepack pnpm module:check
corepack pnpm exec vitest run packages/app/test/class-history-reload-browser.test.ts
corepack pnpm exec vitest run packages/engine/test/doku-konsistenz.test.ts
corepack pnpm verify
corepack pnpm test:visual
corepack pnpm verify:parity
corepack pnpm verify:import
corepack pnpm test:coverage
corepack pnpm test:postgres
```

Die PostgreSQL-Lane braucht eine ausdrücklich isolierte geeignete Testdatenbank; vorhandene Nutzerdaten nicht verändern. Browsertests können erforderliche lokale Browser und passende Systemressourcen voraussetzen. `verify` ersetzt die getrennten Visual-, Parity-, Import-, Coverage- und PostgreSQL-Gates nicht. Einen fehlenden oder übersprungenen Lauf immer als solchen benennen; Baselines oder Schwellen nicht zum Verdecken ungeklärter Abweichungen ändern.

## 10. Was diese Übergabe nicht behauptet

- Keine vollständige Inventur sämtlicher historischer `.scratch/`-Issues des gesamten Produkts. Andere Teilprojekte und ältere Pläne brauchen bei Bedarf einen eigenen Abgleich gegen Code und aktuelle Planung.
- Keine vollständige Elementor-Core- oder Pro-Parität, keine Prozentzahl und keine generelle Accessibility-Abnahme.
- Keine vollständige Framer-Runtime-Freiheit, Motion-Parität oder Editierbarkeit aller importierten Sonderkomponenten.
- Kein beschlossener Astryx-Einsatz und kein belastbarer zusätzlicher Produktions-Bundlewert.
- Kein neuer vollständiger Qualitätslauf auf dem integrierten HEAD und kein Nachweis für automatisch reparierte ältere History-Checkpoints.

Zugangsdaten nicht in Dokumente, Screenshots, Logs oder Commits übernehmen. Kundenseiten und globale Bestandsdaten nur in ausdrücklich isolierten Testabläufen verändern. Bei Änderungen an `.mcp.json` oder `Codex.json` die Datei gemäß Arbeitsanweisung unmittelbar zurücklesen.
