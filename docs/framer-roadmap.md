# Roadmap: Framer-Sites automatisch und bearbeitbar konvertieren

Stand: 02.11.2026 · Status: **Planung, nicht abgeschlossen** · Zuständigkeit und Reihenfolge: [Fahrplan](fahrplan.md). Der aktuelle belegte Stand steht in [stand.md](current/stand.md), bestehende Entscheidungen in `docs/adr/`. Dieser Plan setzt keine ADR außer Kraft; notwendige Änderungen werden vor ihrer Umsetzung entschieden.

## 1. Ziel und Grenzen

Ein Nutzer gibt eine veröffentlichte Framer-URL und den zugehörigen Unframer-Zugang an. Senify sichert das Projekt lokal, erfasst alle Seiten und CMS-Daten, erzeugt daraus ein eigenständig ausführbares, über Senify und Code bearbeitbares Projekt und vergleicht es automatisch mit dem Original. Für unterstützte Funktionen soll keine manuelle Nacharbeit anfallen. Der Nutzer erhält Ergebnis, Vorschau und einen verständlichen Bericht; die interne Prüfung läuft automatisch.

**Runtime-frei** bedeutet: Die erzeugte Seite benötigt weder die Framer-Site, deren Server/CDN noch Framer-Site-Runtime, auch nicht indirekt über gebündelte Module. Eigene, lokal ausgelieferte JavaScript-Runtime, GSAP, WAAPI und andere freigegebene Bibliotheken sind grundsätzlich möglich. Beim Build und im laufenden Browser müssen auch indirekte Imports, dynamische Requests, Workers und CSS-Abhängigkeiten geprüft werden. Betriebssystem- und Browserfunktionen zählen nicht als Framer-Runtime.

**Bearbeitbar** bedeutet: Text, Bilder, Layout, Breakpoints, Links, Komponenten, CMS-Daten und Animationen sind strukturiert adressierbar, änderbar, speicherbar und erneut baubar. Ein Screenshot, Video, Canvas-Recording oder ein undurchsichtiges Original-Bundle erfüllt das nicht. Gesondert ausgewiesener Quellcode einer Sonderkomponente kann für einen Entwickler bearbeitbar sein, ist aber noch kein vollständig strukturierter Editor-Inhalt.

**Exakt** ist ein messbarer Anspruch für eine definierte Umgebung und Zustandsmenge: Seite, Browser-Version, Schriftdateien, Viewport, Gerätedichte, Interaktionen, Scrollposition und Zeitpunkt. Unterschiedliche Betriebssysteme, Rendering-Engines, Datenstände und zufallsabhängige oder entfernte Inhalte können das Ergebnis verändern. Ein globales Versprechen „jede beliebige Framer-Seite ohne jede Nacharbeit“ ist vor erfolgreicher Prüfung nicht seriös. Das Produktziel bleibt möglichst hohe automatische Abdeckung; unbekannte oder nicht verfügbare Funktionen müssen ausdrücklich als nicht bestanden erscheinen.

**Abnahme pro Projekt:** `automatisch bestanden` nur, wenn alle entdeckten und verpflichtend zu prüfenden Routen, Assets, Zustände, Bewegungen und Interaktionen die festgelegten Gates bestehen und keine ungeklärten Blocker oder Framer-Runtime-Abhängigkeiten existieren. `teilweise` bedeutet nutzbare, aber konkret benannte Lücken; `blockiert` bedeutet kein verlässliches Ergebnis. Ein hoher Durchschnittswert ersetzt keine Pflichtprüfung einzelner wichtiger Funktionen.

## 2. Warum der Nachbau schwierig ist

1. **Der Export ist ein Spiegel.** FramerExport sichert gerendertes HTML, CSS, Skripte und Medien; das ist eine ausgezeichnete Eingabe, aber kein fertiges, eigenständiges Editormodell. Unser echter Export meldet `html-with-runtime`. [FramerExport beschreibt seine Pipeline](https://github.com/danbenba/FramerExport#how-it-works).
2. **Struktur ist nicht Verhalten.** Der Browser zeigt nur Zustände, die er besucht. Hinter einem Menü, einer anderen Viewport-Breite, einem Hover oder einem CMS-Eintrag können weitere Struktur, CSS-Regeln und Aktionen liegen.
3. **Angaben können fehlen.** Unframer liefert Projektstruktur, Seiten, Komponenten und CMS-Daten; ob jede Animations- und Interaktionsoption im jeweiligen Zugang vollständig abrufbar ist, muss je Funktion anhand echter Projekte geprüft werden. [Unframer getNodeXml](https://unframer.co/mcp/getnodexml) verlangt zusätzlich das Auslesen referenzierter Komponenten. React-Export ist ein eigener, zugangsabhängiger Weg und muss auf Runtime-Abhängigkeiten untersucht werden; er beweist noch keine Runtime-Freiheit. [Unframer CLI](https://unframer.co/mcp/cli).
4. **Responsive Layout ist kein einzelnes Bild.** Bedingungen, Verschachtelung, veränderte Inhalte, Schriftmetriken, Bildzuschnitte und berechnete CSS-Werte beeinflussen sich. Übereinstimmung bei einer Breite beweist sie nicht bei anderen Breiten.
5. **Bewegung ist ein zeitlicher Ablauf.** Start- und Endzustand allein verraten weder Federverhalten, Unterbrechungen, Reihenfolge und Scroll-Kopplung noch die Auslösebedingungen. Derselbe visuelle Effekt kann in CSS, WAAPI, JavaScript oder WebGL implementiert sein.
6. **Backend-Funktionen sind nicht im Frontend enthalten.** Formulare, Suche, geschützte Daten, Zahlungen und externe APIs benötigen vorhandene oder neue Gegenstellen. Ein Seitenexport allein erzeugt diese Dienste nicht.
7. **Spezialkomponenten sind Programme.** Ein Shader oder ein selbstgeschriebenes Widget kann beliebige Logik enthalten. Ihre Struktur und alle Zustände lassen sich aus ein paar Bildern nicht allgemein rekonstruieren.

## 3. Aktuelle Ausgangsbasis

- `packages/mcp/src/framer-export.ts`: FramerExport kann einen neuen lokalen Mirror erstellen. `packages/mcp/src/unframer.ts` sichert Projektstruktur, Komponenten und CMS-Inhalte. Ein gemeinsamer Ein-Klick-Lauf und die Übersetzung des Snapshots in ein vollständiges Projekt fehlen.
- `packages/framer-import/src/capture-html.ts`, `capture-browser.ts`, `ir.ts`, `mapper.ts`: Erfassung und Zwischenmodell bestehen, decken aber längst nicht jeden CSS-, Komponenten-, Zustands- und Bewegungsfall ab.
- `packages/framer-import/src/motion-mapping.ts`: Bewegung wird auf vorhandene Presets abgebildet. Einlaufbewegungen mit seitlichem Versatz oder Skalierung werden beispielsweise nicht als gleichwertiges Preset übernommen; selbst ein passendes Preset beschränkt den vertikalen Abstand auf einen Intensitätsregler.
- `packages/renderer/src/motion.ts` und `docs/adr/0006-*`: die aktuelle Motion-Spec ist an eine geschlossene Preset-Registry und Intensitätsgrenzen gebunden. Für originalgetreue freie Werte ist eine Erweiterung dieses Vertrags nötig.
- `packages/engine/src/guardrails.ts`: Das Standardprofil kann aus dem Import übernommene Animationen bei späterer Bearbeitung blockieren. Der Import muss zukünftig vor dem Schreiben einen konsistenten Weg für solche Konflikte finden und melden.
- `packages/widget-engine/src/validation.ts` und `packages/engine/test/imports.test.ts`: Property-Änderungen an importierten Primitives werden validiert. Vollständige Struktur-, Breakpoint-, Komponenten-, CMS- und Motion-Bearbeitung ist nicht damit bewiesen.
- Die erste Bildschirmhöhe der Beispielseite wurde statisch mit deaktivierter Bewegung verglichen. Dieser Vergleich belegt weder die ganze Seite noch die Qualität der Animationen. Die eigentliche Produktkonfiguration ließ sich zuletzt wegen PostgreSQL-Anmeldung nicht starten; der Schreibnachweis lief mit isolierter Datenbank.

## 4. Architekturvorschlag: Quelle → Modell → Projekt → Nachweis

1. **Job-Annahme:** Framer-URL und Unframer-Zugang validieren; zugehöriges Projekt und Zugriff prüfen; Zugangsdaten nur flüchtig behandeln. Nutzer sieht einen Job, keine Folge technischer Einzelschritte.
2. **Projektinventar:** Seiten, Parameter-Routen, Sprachen, CMS-Schemata und -Einträge, Komponenten, Assets, Varianten und Verknüpfungen erfassen. Crawl-Ergebnis und Projekt-API gegeneinander abgleichen; getrennt erfassen, was entdeckt, geladen oder nicht zugänglich ist.
3. **Quelldaten:** Roh-Mirror und Unframer-Snapshot mit Herkunft, Zeitpunkt, Versionen und Prüfsummen unverändert speichern. Diese Dateien sind Beweismaterial und dürfen im Ergebnis nicht still als runtimefreier Build ausgegeben werden.
4. **Erfassung im Browser:** definierte Viewports und Interaktionen besuchen; Netzwerk, DOM, berechnete Styles, Layout, Font-Nutzung, Zustände und Motion-Evidenz aufzeichnen. Pro Beobachtung Quelle und Konfidenz speichern. Browser-Code aus der Quelle in isolierter Umgebung ausführen; Credentials und fremde Requests nicht in Berichte schreiben.
5. **Projekt-IR:** versioniertes, deklaratives Zwischenmodell für Seitenbaum, Knotenidentität, CSS und Bedingungen, Komponenten/Instanzen, CMS-Verweise, Assets, Interaktionen und Animationen. Ein Eintrag kann `direkt gelesen`, `gemessen`, `abgeleitet` oder `unbekannt` sein. Ein gemessener Effekt ist nicht automatisch exakt rekonstruiert.
6. **Übersetzung:** strukturiertes Modell in Senify-Dokumente, lokale Medien, Daten und editierbaren Motion-/Interaktionsvertrag überführen. Fehlende Features produzieren zuordenbare Blocker statt stiller Vereinfachung.
7. **Build und Betrieb:** lokal ausführbares Projekt samt Assets und zulässiger eigener Runtime bauen, ohne Netzwerkzugriff auf Framer starten, Navigation und Datenbindung prüfen. Optionaler Code für Fremdkomponenten muss getrennt inventarisiert und auf unerlaubte Abhängigkeiten geprüft werden.
8. **Differenzprüfung und Verbesserungsschleife:** Quelle und Ziel unter denselben Bedingungen aufnehmen; statische, funktionale und zeitliche Abweichungen Knoten/Route/Zustand zuordnen. Nur nachvollziehbare, überprüfbare Reparaturen automatisch übernehmen, danach betroffene Prüfungen wiederholen.
9. **Ergebnis:** lokale Vorschau, gespeichertes editierbares Projekt, exportierbarer Build, Prüfbericht und reproduzierbare Rohdaten. Abbruch und Wiederaufnahme dürfen weder vorhandene Projekte überschreiben noch Teilstände als vollständig ausgeben.

## 5. Animationsstrategie im Detail

### 5.1 Was für jeden Effekt erfasst werden muss

- **Ziel:** stabiler Knoten und ggf. Pseudo-Element, Ursprung/Koordinatensystem, Transform-Reihenfolge, Transform-Origin, Zusammenspiel mehrerer Effekte und Vererbung.
- **Eigenschaften:** Position, Rotation, Skalierung, Opacity, Filter, Farben, Clip/Masken, Maße und sonstige tatsächlich animierte Werte; Werte pro Breakpoint und Zustand.
- **Zeit:** Start, Ende, Delay, Dauer, Easing oder Spring-Parameter einschließlich Masse, Steifigkeit, Dämpfung und Anfangsgeschwindigkeit, Wiederholung, Richtung, Fill, Stagger und Abhängigkeiten zu anderen Effekten. Parameter nur dann als Original ausgeben, wenn sie wirklich aus der Quelle bekannt sind.
- **Auslöser:** Laden, Sichtbarkeitsschwelle und -richtung, Scrollfortschritt und Offset, Hover, Fokus, Klick, Touch, Zustands- und Routenwechsel; Erstlauf/Wiederholung, Zurückscrollen, schnelle Richtungswechsel und Unterbrechung.
- **Randbedingungen:** Browser-/Viewport-Abhängigkeiten, reduzierte Bewegung, visuelle Anfangs- und Endzustände, Ladeverhalten, Performance und Cleanup beim Verlassen einer Route.

### 5.2 Empfohlene Erfassung

**Erste Wahl: strukturierte Quelldaten.** Unframer-/Framer-Daten und vorhandene Exportartefakte pro Effekt systematisch auf Originalparameter prüfen. Die tatsächliche Feldabdeckung an mehreren Projekten dokumentieren; ein fehlendes Feld bleibt unbekannt. Ggf. ein Framer-Plugin als zusätzliche Quelle untersuchen, aber nur nach einem Machbarkeitsnachweis: Die [Framer Plugin API](https://www.framer.com/developers/reference) belegt nicht automatisch Zugriff auf sämtliche Effektparameter.

**Zweite Wahl: Browserinstrumentierung.** CSS-/WAAPI-Animationen über Animation-Objekte, Keyframes und Timing erfassen; tatsächlich ausgelöste Übergänge nach gezielten Interaktionen beobachten. [Element.getAnimations](https://developer.mozilla.org/en-US/docs/Web/API/Element/getAnimations), [getKeyframes](https://developer.mozilla.org/en-US/docs/Web/API/KeyframeEffect/getKeyframes) und [getTiming](https://developer.mozilla.org/en-US/docs/Web/API/AnimationEffect/getTiming) liefern dafür Daten. Diese APIs erfassen keine allgemeine JS-Logik. Der [Chrome-Animationsinspektor](https://developer.chrome.com/docs/devtools/css/animations) deckt `requestAnimationFrame` ausdrücklich nicht ab.

**Dritte Wahl: kontrollierte Messung.** Für JS-, Scroll- oder Canvas-Effekte wiederholbar Zeit, Position und Trigger variieren und gerenderte Werte bzw. Frames sampeln. Die daraus gewonnene Kurve ist eine Annäherung, keine Rückgewinnung unbekannter Originalparameter. Eine interpolierte Kurve kann zwischen gemessenen Zeitpunkten oder nach Unterbrechung falsch sein. Dynamische Effekte müssen mehrfach und über Zustandsgrenzen beobachtet werden.

### 5.3 Empfohlene Wiedergabe

Ein versioniertes, deklaratives **Motion-IR** mit mehreren Tracks pro Knoten, präzisen Werten, Timelines, Keyframes, Triggern, Breakpoint-Bedingungen und kontrollierten Zustandsübergängen einführen. Presets bleiben als bequeme Autorenschnittstelle; importierte Animationen dürfen nicht auf einen groben Intensitätsregler reduziert werden. Es gibt einen gemeinsamen kanonischen Vertrag für Editor, Engine, Undo, MCP, Preview und Bake.

Für einfache Interpolationen CSS/WAAPI prüfen, für komplexe Scroll-Timelines und Orchestrierung die bestehende lokal ausgelieferte GSAP-Infrastruktur evaluieren. Exakte Spring-Dynamik benötigt eine passende deterministische Implementierung oder exakt nachgewiesene Umrechnung; ein ähnliches Easing reicht nicht. Vor Festlegung ein Prototyp mit beiden Varianten gegen echte Quellbewegungen und Unterbrechungen. Ein bloßer Bibliothekswechsel rekonstruiert die fehlenden Daten nicht.

**Architekturentscheidung erforderlich:** ADR-0006 begrenzt Motion derzeit auf Presets. Vor Umsetzung ein neues ADR oder einen ausdrücklich angenommenen Nachtrag verfassen: Modell, Vertrauensgrenzen, Migration bestehender MotionSpecs, Guardrails, Reduced Motion und Abwärtskompatibilität. ADR-0010 erlaubt Payload-Islands mit eingeschränkter Bearbeitbarkeit; sie sind nur dann im Zielmodus zulässig, wenn ihre Abhängigkeiten die Runtime-frei-Definition erfüllen. Ein Originalmodul mit Framer-Runtime ist kein zulässiger Umweg und darf nicht als „exakt und vollständig bearbeitbar“ markiert werden.

### 5.4 Motion-Nachweis

Je Effekt Original und Ziel mit gleicher Browser-Version, Viewport, Schriften und definierten Triggern aufnehmen. Start, Zwischenzeiten, Ende, Pausen und Unterbrechungen vergleichen; zusätzlich Positions-, Größen-, Opacity- und Transform-Kurven pro relevanter Ebene auswerten. Für Scroll-Effekte nach gleicher **Scrollposition und -richtung**, für zeitabhängige Effekte nach **Zeit seit Trigger** vergleichen. Wiederholte Läufe zeigen Rauschen und Nichtdeterminismus.

Playwrights [Clock](https://playwright.dev/docs/api/class-clock) kann Timer und `requestAnimationFrame` kontrollieren. Nicht voraussetzen, dass damit jede Compositor-, CSS-, WAAPI-, Video-, WebGL- oder Netzwerkuhr synchron ist: das für jeden Effekt empirisch prüfen; sonst kontrollierte Echtzeitmessung oder geeignete Browser-Protokollfunktionen einsetzen. Tests mit `reducedMotion: reduce` belegen nur die reduzierte Variante, nicht die Originalanimation.

## 6. Umsetzungsphasen und Gates

Alle Phasen starten mit der Definition of Ready aus `docs/fahrplan.md`. Jede Phase bekommt vor Umsetzung konkrete Dateien, ein Gate und ein klares Ergebnis. Die folgenden Punkte sind **offene Arbeit**, keine behaupteten Implementierungen.

### F0 — Verlässliche Ausgangsbasis und Benchmark

**Abhängigkeit:** keine. **Arbeiten:** PostgreSQL-Konfiguration diagnostizieren, ohne bestehende Nutzerdaten zu verändern; reproduzierbare isolierte Entwicklerumgebung anbieten. Die Beispielsite vollständig inventarisieren und ihre Referenzstände mit Viewport, Browser, Assets und Zuständen sichern. Ein kleines, verschiedenartiges Korpus aus echten freigegebenen Projekten und gezielten Fixtures für Layout, CMS und Motion aufbauen. Alle heutigen Lücken und Fehler dokumentieren, einschließlich Standardprofil-Konflikt.

**Gate/Done:** Jeder Benchmark kann wiederholt gestartet werden; Rohdaten und erwartete Zustände sind versioniert bzw. sicher referenziert; keine Zugangsdaten in Logs/Fixtures. Ergebnisse zeigen unbekannt statt bestanden, wenn ein Zustand nicht erfasst wurde. Laufzeit und Fehlerraten messen, bevor quantitative Zielwerte verbindlich festgelegt werden.

### F1 — Ein Arbeitsauftrag für zwei Links

**Abhängigkeit:** F0. **Arbeiten:** CLI/MCP-Workflow für URL, Unframer-Zugang und neues Zielprojekt; Zugehörigkeit prüfen; Export, Snapshot, Import, Build und Vorschau als resumierbaren Job orchestrieren. Fortschritt, nachvollziehbare Fehler, Abbruch, Wiederaufnahme, Idempotenz, sichere Dateipfade und Secret-Redaktion. Job speichert klare Teilstände; bestehende Projekte werden nicht still überschrieben.

**Gate/Done:** Ein Aufruf verarbeitet einen definierten kleinen Projektumfang bis zur lokalen Vorschau oder endet mit einem präzisen Fehler samt fortsetzbarem Status. Getrennt prüfen: falsches Projekt, abgelaufener Zugang, Exportabbruch, Wiederholung und vorhandenes Ziel. Keine vollständige Site-Abdeckung behaupten, solange F2 fehlt.

### F2 — Alle Seiten, Assets und CMS-Inhalte

**Abhängigkeit:** F1. **Arbeiten:** Seiteninventar aus API, internen Links und Sitemap zusammenführen; fehlende/geschützte/dynamische Routen sichtbar machen. HTML-Dateien aus Unterseiten als eigenständige Seiten importieren; interne URLs und Anker zielkonform umschreiben. CMS-Schema, Feldtypen, Slugs, Referenzen, Reihenfolge, Pagination, Asset-Bezüge und Vorlagen übernehmen. Mehrsprachigkeit, dynamische Routen und referenzierte Komponenten berücksichtigen. Fonts, Varianten, Videos und Medien lokal speichern und beim Build auflösen.

**Gate/Done:** Für das festgelegte Benchmark-Projekt sind alle inventarisierten, zugänglichen Seiten und CMS-Einträge vollständig erfasst; Links und Referenzen funktionieren lokal, fehlende Objekte verhindern eine Vollständig-Meldung. Reimport verändert nicht unbeabsichtigt andere Projekte oder Nutzeränderungen.

### F3 — Statische Darstellung und Responsive-Treue

**Abhängigkeit:** F2; erster Einstieg schon nach F0 möglich. **Arbeiten:** CSS-Kaskade, komplexe Selektoren, Zustände, Pseudo-Elemente, Media-/Container-Queries, CSS-Variablen, Schriftvarianten und -metriken, Bildzuschnitte, Layout, Masken und Ebenenreihenfolge in IR und Renderer vollständig nach Bedarf abbilden. Strukturelle Identitäten aus Framer/Unframer mit DOM-Elementen abgleichen und Unsicherheit ausweisen.

**Gate/Done:** Automatischer Vergleich vollständiger Seiten bei vereinbarten Viewports und Zwischenbreiten, inklusive kritischer Zustände. Pixelabweichung, Textüberlauf, Elementposition und fehlende Assets getrennt auswerten; Schwellwerte nach F0 kalibrieren und versionieren. Kritische fehlende Elemente blockieren unabhängig vom Gesamtdurchschnitt. Maskierung nur mit dokumentiertem Grund; verdeckte Flächen bleiben als ungeprüft sichtbar.

### F4 — Originalgetreues Motion-IR und Appear-Effekte

**Abhängigkeit:** F0, ADR-Entscheidung; sinnvoll vor breiter Interaktionsunterstützung. **Arbeiten:** Datenmodell aus Abschnitt 5 implementieren, alte Presets migrieren, Import/Validierung/Undo/Editor/MCP/Renderer anschließen. Framer-Appear mit Übersetzung, Skalierung, Rotation, Transparenz, Spring, Delay und Stagger anhand echter Quelldaten oder transparent markierter Messung unterstützen. Profilkonflikte vor Speicherung erkennen und ohne stille Intensitätsänderung lösen; bestehende Schutzregeln bleiben bis zur bewussten ADR-Entscheidung gültig.

**Gate/Done:** Fixture und echte Beispielseite vergleichen Trigger, Start, Zwischenwerte, Ende, Abbruch und erneuten Start; bearbeitete Parameter überleben Speichern und Rebuild. Nicht auslesbare Parameter sind klar markiert und verhindern eine Exakt-Meldung.

### F5 — Scroll, Hover, Varianten und Interaktionen

**Abhängigkeit:** F4. **Arbeiten:** Scroll-Trigger, Scroll-Progress, Pinning, Parallax, Schleifen, Hover/Focus/Touch, Menüs, Tabs, Slider, Zustandsautomaten und Routenübergänge. Zuordnung zwischen Zielknoten und Ereignisquelle, Gerätebedingungen, Reihenfolge, Interruptions und Cleanup. Formulare samt Gegenstelle unterscheiden: UI-Übernahme ist kein Beleg für funktionierenden Versand.

**Gate/Done:** Automatisierte Szenarien prüfen beide Scrollrichtungen, erneutes Auslösen, Touch-/Tastaturbedienung und Navigation. Zustands- und Zeitkurven bestehen separat; nicht beobachtete Zustände werden nicht als funktionsfähig gezählt. Reduced Motion bekommt einen eigenen Prüflauf.

### F6 — Editierbarkeit und Sonderkomponenten

**Abhängigkeit:** F2–F5. **Arbeiten:** Texte, Assets, Komponenten-Instanzen, CMS, Layout, Breakpoints, Interaktionen und Motion über bestehende API/Editor ändern; Klassen- und globale Komponentenbezüge erhalten. Versionskonflikte, Undo, Validierung und Neu-Build prüfen. Code-Komponenten, Overrides, WebGL, eingebettete Inhalte und externe Dienste inventarisieren. Für wiederkehrende Klassen native Adapter entwickeln; übrige Fälle mit Ursachen und Handlungsmöglichkeiten ausweisen.

**Gate/Done:** In einem frisch konvertierten Benchmarkprojekt werden Änderungen an den genannten Kategorien gespeichert, erneut gebaut und im Browser nachgewiesen. Ein Payload-Poster oder eine rein visuelle Kopie zählt nicht als bearbeitbare Komponente. Framer-Abhängigkeiten in Sondercode blockieren den runtimefreien Status.

### F7 — Automatische Qualitätsprüfung und Ausgabe

**Abhängigkeit:** F3–F6. **Arbeiten:** Referenz- und Zielserver isolieren, Quell- und Zielbrowser angleichen, Vollseiten-/Zustands- und Motion-Vergleich orchestrieren. Requests zu Framer-Domains beim Ziel sperren; zusätzlich statisches Bundle- und Laufzeitinventar prüfen. Bericht je Route und Funktion mit Status, Beleg, Konfidenz, Ursache und Dateiverweis erzeugen. Bild-/Videoeffekte nicht pauschal ausblenden. Regelsystem für sichere automatische Korrekturen und kontrollierte Wiederholung.

**Gate/Done:** Erfolg, Teil-Erfolg und Fehler lassen sich durch Negativfälle nachweisen; Offline-Build und -Navigation funktionieren, eingebundene Schriften/Assets sind lokal. Ein Fehler in einer kritischen Route oder ein erkannter Framer-Runtime-Import verhindert `automatisch bestanden`. Der Bericht macht ungetestete Zustände sichtbar.

### F8 — Mehrere Sites im Alltag

**Abhängigkeit:** F1–F7. **Arbeiten:** mehrere unabhängige Jobs mit Warteschlange und begrenzter Parallelität; Projekttrennung, Wiederaufnahme, Caching nach Prüfsumme, Bereinigung eigener temporärer Daten und begrenzter Ressourcenverbrauch. Versionierte Importer/Renderer und deterministische Builds. Änderungen der Quelle über Reimport als Diff anbieten; Nutzeränderungen durch Drei-Wege-Abgleich schützen, Konflikte benennen. Wiederkehrende Muster aus dem Benchmark als wiederverwendbare Konverter verbessern.

**Gate/Done:** Mehrere unterschiedliche Projekte lassen sich unabhängig und reproduzierbar verarbeiten; ein Fehler und Retry beeinflussen andere Jobs nicht. Aktualisierung eines Projekts überschreibt keine lokalen Änderungen still. Erfolgsquote nur auf dem dokumentierten, repräsentativen Korpus angeben, nicht als Garantie für unbekannte Sites.

## 7. Prioritäten, Aufwand und Entscheidungen

**Erste vertikale Scheibe:** F0 → F1 → F2 in kleinem Umfang → F3 für die Beispielseite → F4 für deren tatsächliche Appear-Effekte → F7 für einen wiederholbaren Nachweis. Erst danach breit auf weitere Seiten, CMS-Fälle und Interaktionen ausrollen. Frühzeitig einen zweiten, anders aufgebauten Standort hinzunehmen, damit keine Einzelseiten-Sonderlösung entsteht.

**Größte Risiken:** fehlende Quellparameter; nicht deterministisches Verhalten; proprietäre oder dynamisch geladene Runtime-Abhängigkeiten; Cross-Origin- und Backend-Dienste; komplexes CSS; fehlerhafte Zuordnung von DOM-Knoten zu Projektknoten; Profilkonflikte; Verlust von Nutzeränderungen beim Reimport. Je Risiko eine konkrete Erkennungsregel, Evidenz und einen nachvollziehbaren Status vorsehen.

**Zeit:** Eine seriöse Gesamtschätzung ist vor F0 und dem Motion-Prototyp nicht möglich. Danach pro Phase eine Spanne anhand gemessener Abdeckung und wiederkehrender Fehlertypen angeben. Die Aufgabe ist ein Konvertierungsprodukt, kein einzelner Export-Schalter.

**Testgeschwindigkeit:** Bei Änderungen gezielt betroffene Unit-/Vertragstests und kurze, risikobezogene Browserfälle ausführen. Schwerere vollständige Projekt-, Motion-, Offline-, PostgreSQL- und Mehrseiten-Gates einmal pro passendem Integrationspaket bzw. in CI durchführen; bestandene unveränderte Läufe nicht wiederholen. Die großen Qualitätsprüfungen sind Bestandteil der Konvertierung selbst und werden automatisiert, damit der Nutzer sie nicht von Hand ausführen muss. Schwellen und CI-Regeln werden nicht still abgesenkt.

## 8. Belege und weiterführende Primärquellen

- [FramerExport: Aufbau und Grenzen des Mirrors](https://github.com/danbenba/FramerExport#how-it-works).
- [Unframer: Projekt-/Node-XML](https://unframer.co/mcp/getnodexml), [MCP-Übersicht](https://unframer.co/mcp/overview), [React-Export/CLI](https://unframer.co/mcp/cli).
- [Framer: Plugin-API](https://www.framer.com/developers/reference), [Appear und Scroll-Trigger](https://www.framer.com/academy/lessons/framer-animations-trigger-on-scroll).
- [MDN: Animationen erfassen](https://developer.mozilla.org/en-US/docs/Web/API/Element/getAnimations), [Keyframes](https://developer.mozilla.org/en-US/docs/Web/API/KeyframeEffect/getKeyframes), [Timing](https://developer.mozilla.org/en-US/docs/Web/API/AnimationEffect/getTiming).
- [Chrome: Animationsinspektion und Grenzen](https://developer.chrome.com/docs/devtools/css/animations), [Playwright Clock](https://playwright.dev/docs/api/class-clock).
