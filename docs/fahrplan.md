# Fahrplan

> **Dokumenttyp:** fortlaufender Umsetzungsplan mit Gates. Dieses Dokument begleitet die Umsetzung und wird bei jedem abgeschlossenen Schritt aktualisiert.
> **Stand:** 05.11.2026 · Der aktuelle Ist-Abgleich steht in `docs/current/stand.md`, `docs/current/architektur.md` und `docs/current/qualitaet.md`. Die nachfolgenden Produktprioritäten und offenen Gates bleiben maßgeblich; historische Abschnitte sind Verlauf und nicht automatisch der heutige Status.
> **Nicht verbindlich hier:** Testzahlen (gehören nach `docs/current/qualitaet.md`), Fachbegriffe (`CONTEXT.md`), angenommene Entscheidungen (`docs/adr/`).
> **Ersetzt:** `docs/history/umbauplan.md` (siehe `docs/README.md` für Vorrangregeln).

## Wie dieses Dokument arbeitet

- **P0 → P3** ist die priorisierte Reihenfolge; erledigte Schritte werden nicht erneut gestartet.
- Jeder offene Schritt hat Ready, Umsetzung, Gate und Done. Ohne grünen Gate kein nächster Umsetzungsschritt.
- `R1`–`R13` sind zwischen Fahrplan, Stand und Architektur synchron zu halten.
- Fertig heißt: Gate ausgeführt, Code/Testbeleg notiert, Risiko aktualisiert und – falls Zahlen betroffen sind – `qualitaet.md` ausschließlich mit Messdaten aktualisiert.
- Der historische P0-1-Commit hat einen damals sauberen Baum gesichert. Er ersetzt nicht die DoR-Bedingung, wenn danach erneut ein Folge-Diff entstanden ist.

## Produktpriorität: Framer-Import

Das vorrangige Produktziel ist der lokale Import einer Framer-Site über Framer- und Unframer-Zugang: Das Ergebnis soll ohne Framer Runtime laufen, visuell und in der Bewegung möglichst exakt entsprechen und für den Agenten vollständig bearbeitbar sein. Dieses Ziel ist noch nicht erreicht. Die technischen P0–P3-Gates bleiben für betroffene Änderungen gültig; weitere reine Aufräumarbeiten stehen hinter dem Importziel zurück.

Die detaillierte Planung für dieses Produktziel steht in der [Framer-Roadmap](framer-roadmap.md). Ihre Phasen F0–F8 konkretisieren die nachfolgenden Arbeitspakete. Erste vertikale Scheibe: F0 → F1 → F2 in kleinem Umfang → F3 für die Beispielseite → F4 für deren Appear-Effekte → F7; danach breitere Abdeckung von Seiten, CMS und Interaktionen. Architekturänderungen setzen die jeweils genannten ADR-Entscheidungen voraus.

**Neue Produktanforderung Editor:** Oberfläche und Bedienung sollen sich eng an Elementor V4 orientieren, einschließlich Klassen und Variablen. Die Recherche und vorgeschlagenen Schritte stehen in [Elementor-V4-Editor](research/elementor-v4-editor.md). Zuerst Referenzzustände und offene Funktionslücken aufnehmen; Umstellung und Migration dürfen bestehende Framer-Projekte nicht verlieren. Die Entscheidung, vorhandenen Elementor-Code direkt zu übernehmen, ist nicht getroffen. Der Core-Editor ist am 06.11.2026 interaktiv aufgenommen: Topbar, Atomic Elements, Design System mit Defaults/Variables/Classes, atomares Heading mit Content/Style/Advanced und Normal/Hover, Structure, History, Page Settings sowie Tablet/Mobil; ein Heading wurde veröffentlicht und persistent bestätigt. Eine Color-Variable wurde angelegt, gespeichert und nach dem Neuladen bestätigt. Die globale Klassenverwaltung ist in der installierten Core-Version nicht exponiert (Classes-Liste leer, keine Classes-Zeile, lokale CSS-Klasse erscheint nicht global). Belege: `docs/research/elementor-v4-acceptance-2026-11-06.md`; vertiefte Live-Analyse mit Inventar und möglichen nächsten Arbeiten: `docs/research/elementor-hcm-live-analyse-2026-11-06.md`. Farbwert-Picker, Font-/Size-Variablen (Size Pro), Klassenabläufe, Pro-Parität und der Live-Vergleich mit Senify bleiben offen. Die hcm.local/Tännig-Apotheke (Elementor 4.2.3, `pro-elements`, kein offizielles Pro) exponiert die Klassenverwaltung dagegen live mit 6 echten Klassen (`leistungheading`, `leistungabsart`, `leistung`, `absatz`, `headinghero`, `Subheading`) und 3 Variablen (`accent` #103F92, `ueberschrift` #2a2a2a, `hell` #DEE3ED); die echten Inhalte blieben unverändert. Testklasse/-variable, Aufräumen von Testseite 1331 und temporärem Admin sowie der Live-Vergleich mit Senify bleiben offen.

**History-Schutz:** Eingabegruppen werden nach History-Navigation getrennt; Inline-Texte verwenden für jede Bearbeitung eine eigene Gruppe und Abbrechen erhält frühere Schritte. Laufende und unklare Variablenanfragen sperren Navigation, auch nach Reload, Retry-Konflikten, nicht übernehmbarer Bestätigung, Dokumentwechsel und Storage-Fehler beim Retry. Eindeutige Erst-Ablehnung, konsistente Bestätigung und ausdrücklich bestätigte Recovery lösen die Sperre auf. History-Sprünge laufen schrittweise: lokale Schritte über den Patch-Gate, externe erst nach registriertem Runner und sauberem Flush; neue Eingaben, ein geänderter Pfad oder ein fehlender Runner stoppen vor dem nächsten unbestätigten Schritt. Der Dialog nutzt dieselbe Session wie Toolbar und Shortcuts. Store-, History-, Session-, Controller- und Browser-Tests prüfen die Fälle (`packages/editor/src/history.ts`, `packages/editor/src/state/store.ts`, `packages/editor/src/state/external-history.ts`, `packages/editor/src/state/session.ts`, `packages/editor/src/history/dialog.ts`, `packages/editor/src/canvas/canvas.ts`, `packages/editor/test/state/store.test.ts`, `packages/editor/test/history.test.ts`, `packages/editor/test/state/session.test.ts`, `packages/editor/test/state/external-history.test.ts`, `packages/app/test/variables-editor-browser.test.ts`, `packages/app/test/canvas-browser.test.ts`).

**Geprüfte History-Checkpoints:** Die Library exportiert ausschließlich bestätigte, saubere History und Cursor; ein Import setzt eine leere Session sowie gleiche Site, Page, Dokumentinhalte und geladene Versionen voraus. Vollständige Patch-/Node-Struktur, eigene Referenzen und bidirektionales Replay werden vor Übernahme geprüft (`packages/editor/src/state/history-checkpoint.ts`, `packages/editor/test/state/history-checkpoint.test.ts`). Der History-/State-/Canvas-/Variablen-Gate ist ausgeführt. App-Persistenz, Belege, Runner und Unknown-Recovery sind über die Issues 02–07 abgenommen; der Checkpoint allein bestätigt keinen unklaren Servervorgang.

**Serverbestätigte History – Library und Canvas:** Die Session bietet additives Async Undo/Redo für explizit registrierte externe Runner. Eine Navigationslease hält Eintrag und Richtung fest; Cursor, Dokument und Versionen werden erst nach konsistenter Bestätigung übernommen. Retry bewahrt Request-Basis und Runner; ungültige Antworten und konkurrierende Eingaben verhindern die Übernahme. Synchrone lokale Navigation bleibt unverändert (`packages/editor/src/state/external-history.ts`, `session.ts`, `persist.ts`, `store.ts`, `packages/editor/test/state/external-history.test.ts`). Canvas verwendet dieselbe Session für Toolbar und beide Shortcut-Ebenen; additive Async-Methoden, Runner-/Pipeline-Sperren, Status und Cleanup sind im echten Browser geprüft (`packages/app/test/canvas-history-browser.test.ts`, `canvas-browser.test.ts`). Der Backend-Delete/Restore-Vertrag ist getrennt mit Inhaltsgleichheit, exakter Request-Bindung, Migration/Backup und PostgreSQL-Konkurrenz abgenommen (`packages/engine/test/theme-variable-deletion.test.ts`, `backup-restore.test.ts`). Die App-Anbindung für Delete/Restore mit gemischter History, persistierten Belegen, Reload, Retry und ausdrücklicher Recovery ist abgenommen; dabei gleicht der Editor nach Reorder und Delete/Restore die serverseitig normalisierte Registry-Reihenfolge mit der lokalen Seiten-Teilmenge ab, ohne ausgeblendete Scoped-Regeln fremder Seiten zu benötigen (`packages/app/public/variable-history.js`, `packages/editor/src/state/store.ts`, `persist.ts`). Die rückwärtsverträglichen Registry-Inhaltsbelege für Rename sind mit Issue 08 abgenommen (`packages/engine/test/theme-variable-rename.test.ts`, `backup-restore.test.ts`). Die History-Migration nach einer Umbenennung ist als 09a umgesetzt: strukturierte `$token`/`$ref`-Verweise werden in Forward- und Undo-Patches migriert, CSS-Textverweise führen bewusst zum Verwerfen (`packages/editor/src/history.ts`, `packages/editor/src/state/store.ts`, `packages/app/public/app.js`, `packages/app/test/variable-history-browser.test.ts`, `docs/adr/0016-historische-tokenmigration-bei-umbenennung.md`). Die Umbenennung ist als gemeinsamer externer History-Eintrag mit Undo/Redo (`undoOf`), Reload, Retry und atomarer Registry-Recovery umgesetzt (`packages/app/public/variable-history.js`, `packages/app/public/app.js`, `packages/editor/src/state/persist.ts`, `packages/editor/test/state/history-checkpoint.test.ts`, `packages/app/test/variables-editor-browser.test.ts`, `variable-history-browser.test.ts`). Atomare History-Sprünge sind mit 09c schrittweise umgesetzt: lokale Schritte laufen sofort, externe nur über registrierte Runner; vor jedem externen Schritt wird die Save-Pipeline geflusht und der Pfad erneut geprüft. Ablehnung, Unknown, fehlender Runner oder eine geänderte Route stoppen am letzten bestätigten Schritt (`packages/editor/src/state/external-history.ts`, `packages/editor/test/state/external-history.test.ts`). Der History-Dialog nutzt die Session-API; bei laufender Lease oder unklarem Vorgang bleiben Zeilen gesperrt (`packages/editor/src/history/dialog.ts`, `packages/editor/src/canvas/canvas.ts`). Kein Bestandteil davon ersetzt den vollständigen Visual-, Import-, Parity- oder PostgreSQL-Lane-Gate.

**Undo bei Variablenumbenennung:** Neue Belege erlauben Undo nach vollständig zurückgenommenen Zwischenänderungen, wenn Theme, Klassen und alle Seiten einschließlich Metadaten inhaltlich wieder übereinstimmen. Ältere Belege bleiben versionsgebunden; abweichende Inhalte und Seitenlisten blockieren. PostgreSQL-, Migrations- und Backup-Tests prüfen den Schutz (`packages/engine/src/store.ts`, `packages/engine/test/theme-variable-rename.test.ts`, `packages/engine/test/backup-restore.test.ts`).

**Unklare Variablenvorgänge auflösen:** Ein nicht mehr bestätigbarer Lösch-, Wiederherstellungs- oder Umbenennungsvorgang kann nach ausdrücklicher Warnung beendet und der aktuelle Editorstand geladen werden. Laufende oder nicht speicherbare Editoränderungen verhindern das Ersetzen; Eingaben während des Ladevorgangs bleiben erhalten. Nicht gespeicherte Werte für inzwischen fehlende Variablen bleiben während der Sitzung sichtbar (`packages/app/public/app.js`, `packages/app/test/variables-editor-browser.test.ts`). Beim bewussten Beenden können Zuordnung zum Rückgängig und Editor-History verloren gehen.

**Konflikt-Neuladen absichern:** Der Serverstand wird beim Konflikt-Neuladen nicht übernommen, während ein Speichervorgang läuft oder wenn sich das Dokument beziehungsweise der Theme-Stand während des Abrufs verändert. Browser-Tests prüfen beide Fälle und dass neue Eingaben erhalten bleiben (`packages/app/public/app.js`, `packages/app/test/save-conflict-browser.test.ts`, `packages/app/test/variables-editor-browser.test.ts`).

**Persistenzschutz für Editoraktionen:** Direkt gesetzte Geräte-Sichtbarkeit wird gespeichert. Nicht speicherbare Editoraktionen verhindern die Übernahme externer Versionsstände; beim ausdrücklichen Verwerfen werden sie und ein vorheriger Speicherfehler aus dem offenen Zustand entfernt (`packages/editor/src/state/persist.ts`, `packages/editor/test/state/persist.test.ts`).

**Variablen umbenennen – erste Scheibe:** Eigene primitive Farben, Abstände, Radien und Schatten samt erkannten direkten Verweisen in Theme, Klassen und Seitenentwürfen können transaktional umbenannt werden. Wiederholungsbelege bleiben im Backup erhalten; Browser-, Build- und PostgreSQL-Gates prüfen Ausgabe, Konkurrenz, Antwortverlust und Rollback (`packages/engine/test/theme-variable-rename.test.ts`, `packages/engine/test/backup-restore.test.ts`, `packages/app/test/variables-editor-browser.test.ts`). Unklare CSS-Texte, erkannte Wiederherstellungsbelege und installierte Bibliotheken sperren die Änderung. Dynamische oder externe Referenzen bleiben unvollständig erfasst. Ein separates Undo/Redo der letzten Variablenaktion bleibt im selben Tab nach Neuladen erreichbar und prüft Theme-, Klassen- und Seitenstände; die Umbenennung ist inzwischen zusätzlich als gemeinsamer externer History-Eintrag umgesetzt.

**Ungenutzte Variablen löschen und wiederherstellen:** Eigene Farben, Abstände, Radien und Schatten können nach Prüfung gespeicherter Verweise gelöscht werden. Die separate Wiederherstellung nutzt einen dauerhaften Beleg und verweigert abweichende Theme-, Klassen- oder Seitenstände. Neue Inhaltsbelege erlauben vollständig zurückgenommene Zwischenänderungen; sie vergleichen rohe Registry und vollständige Pages, nur Regel-`updatedAt` bleibt ausgenommen. Aktuelle Request-Versionen bleiben Pflicht. Delete bindet Wiederholung an die ursprüngliche Page-Basis; Restore speichert tatsächliche Basis und Ergebnis atomar. Ältere unvollständige Belege behalten den strengen Schutz. Generierte Basiswerte, installierte Bibliotheken und erkannte Belegverweise bleiben geschützt (`packages/app/test/variables-editor-browser.test.ts`, `packages/engine/test/theme-variable-deletion.test.ts`, `packages/engine/test/backup-restore.test.ts`). Ein unklarer Lösch- oder Wiederherstellungsvorgang lässt sich im selben Browser-Tab auch nach Neuladen prüfen; die separate Wiederherstellung der letzten Variablenaktion bleibt auch nach Neuladen desselben Tabs direkt erreichbar. Dynamische/externe Verweise bleiben offen; Delete/Restore und Rename nutzen die gemeinsame History.

**Theme-Versionsschutz für Editor-Writes:** Der Editor sendet die Theme-Version für Seitenwrites, Klassen-Anlage und -Änderung sowie Klassenwiederherstellung; die Engine prüft sie auch unter Datenbanksperre. Konfliktbehandlung, ausstehende Änderungen und konkurrierende Writes sind in Browser-, Pipeline- und PostgreSQL-Tests geprüft (`packages/app/test/save-conflict-browser.test.ts`, `packages/editor/test/state/persist.test.ts`, `packages/engine/test/editor-mutations.test.ts`, `packages/engine/test/style-rules.test.ts`). Weitere Schreibpfade und Clients ohne Versionsangabe benötigen für sicheres Umbenennen und Löschen weiterhin eigenen Schutz.

**Verwendung globaler Variablen:** Erkennbare direkte Verweise in gespeicherten Seitenentwürfen, Stilregeln und Theme-Aliasen sind abrufbar und werden im Editor angezeigt (`packages/engine/test/theme.test.ts`, `packages/app/test/variables-editor-browser.test.ts`). Nicht erfasste indirekte oder externe Verweise, ungespeicherte Änderungen und die historische Tokenmigration bleiben offen.

**Rückwärtsverträgliche Registry-Inhaltsbelege für Rename:** Neue Rename-Belege kennzeichnen ihren Hash-Vertrag (`raw-registry-updatedAt-excluded`); sie vergleichen die rohe Registry einschließlich Identität und aller Zusatzfelder und nehmen ausschließlich Regel-`updatedAt` aus. Belege ohne Kennzeichnung behalten den bisherigen vollständigen Hash, unbekannte Verträge verweigern die Inhaltsausnahme. Theme, alle Pages und die aktuellen Request-Versionen bleiben vollständig gebunden; Kennzeichnung und Hash überstehen Backup/Restore (`packages/engine/src/store.ts`, `packages/engine/test/theme-variable-rename.test.ts`, `packages/engine/test/backup-restore.test.ts`). Die historische Tokenmigration bleibt eine eigene offene Scheibe.

**Agentenzugriff auf Variablenverwendung:** Das lesende MCP-Tool `get_variable_usage` stellt denselben begrenzten Stand bereit; der MCP-Gate prüft Aufruf und fehlende Variable (`packages/mcp/test/workflow.test.ts`).

**Variablensuche:** Farben, Abstände, Radien und Schatten lassen sich in der Variablenansicht nach Namen filtern; ungespeicherte Eingaben und die Suchanfrage bleiben beim Speichern erhalten. Der Browser-Gate prüft Treffer, leere Ergebnisse und Entwurfserhalt (`packages/app/test/variables-editor-browser.test.ts`).

**Varianten-CSS im Framer-Import:** Variantenklassen werden beim CSS-Abgleich für Elemente und Nachfahren berücksichtigt, ohne die Zusammenführung der SSR-Varianten zu verändern. Der gezielte Capture-Test und der Browser-Vergleich der drei Export-Fixtures sind ausgeführt (`packages/framer-import/test/capture.test.ts`, `packages/framer-import/test/import-fixture-gate-browser.test.ts`). Die Grenzwerte sind unverändert; mobile Text- und Darstellungsabweichungen bleiben offen.

**Klassenwerte zurücksetzen:** Reset von Desktop-Klassenwerten und Zuständen ist bedienbar; entfernte responsive und Hover-Werte bleiben nach erneutem Laden entfernt. Der gezielte Browser- und Engine-Gate einschließlich separatem PostgreSQL ist ausgeführt (`packages/app/test/class-editor-browser.test.ts`, `packages/engine/test/style-rules.test.ts`).

**Robuster Editorstart:** Ein Ausfall der Komponentenbibliothek blendet geladene Klassen nicht mehr aus. Kann die Klassenliste selbst nicht geladen werden, wird die Bearbeitung mit Hinweis und Wiederholungsmöglichkeit angehalten (`packages/app/public/app.js`, `packages/app/test/class-editor-browser.test.ts`).

**Vorbereitung Variablenverwaltung:** Der Theme-Schreibpfad unterstützt `baseVersion` und schützt konkurrierende Aktualisierungen über einen bedingten Datenbank-Write; veraltete Änderungen erzeugen einen Konflikt. Der Engine-Gate umfasst parallele PostgreSQL-Schreibversuche (`packages/engine/src/store.ts`, `packages/engine/test/theme.test.ts`).

**Variablenverwaltung – erste Scheibe:** Primitive globale Farben können im Editor angelegt und bearbeitet werden; Canvas und Inspector erhalten nach dem Speichern das neue Theme. Bei Konflikten kann der aktuelle Stand ohne Seitenneuladen geladen werden, während Eingaben erhalten bleiben. Der Browser-Gate prüft Live-Ausgabe, Reload und Konfliktbehandlung (`packages/app/test/variables-editor-browser.test.ts`). Offen: weitere Variablentypen, die oben genannten Grenzen beim Umbenennen und Löschen sowie Elementor-Gleichheit.

**Typografie-Tokens:** Die Auswahl für Schriftfamilien und Schriftgrößen führt zu ausgebbarem CSS; ältere Größenreferenzen bleiben lesbar. Gezielte Inspector-, Compiler- und CSS-Injection-Tests sichern den Pfad (`packages/editor/test/inspector.test.ts`, `packages/widget-engine/test/theme.test.ts`, `packages/widget-engine/test/css-injection.test.ts`).

**Abstandsvariablen:** Benannte Abstände können angelegt und geändert und Dimensions- und Gap-Controls zugewiesen werden; der Editor aktualisiert referenzierte Werte im Canvas. Die Engine prüft Namen, CSS-Werte und Tokenreferenzen; Browser- und PostgreSQL-Gates sind ausgeführt (`packages/app/test/variables-editor-browser.test.ts`, `packages/engine/test/theme.test.ts`, `packages/engine/test/mutations.test.ts`). Radien, Schatten, Schriftgrößen und Schriftfamilien sind als weitere primitive Familien angelegt, gespeichert, umbenennbar und in der Verwendungssuche erfasst; Schriftgrößen und Schriftfamilien erscheinen zusätzlich in den jeweiligen Inspector-Controls neben der generierten Typo-Skala beziehungsweise den drei Font-Rollen. Semantische Variablentypen und Elementor-Parität bleiben offen.

**Einheiten in Abstandsreglern:** Dimensions- und Gap-Controls zeigen die verfügbaren Einheiten und speichern deren Auswahl; ein Browser-Gate prüft die Padding-Umschaltung (`packages/editor/src/inspector/inspector.ts`, `packages/app/test/variables-editor-browser.test.ts`). Eine physikalische Umrechnung erfolgt nicht.

**Einheiten in Schiebereglern:** Controls mit mehreren Einheiten bieten eine Auswahl und speichern nur zugelassene Einheiten. Der Browser-Gate prüft die Symbolgröße nach Neuladen, der Engine-Gate eine ungültige Einheit (`packages/app/test/variables-editor-browser.test.ts`, `packages/engine/test/mutations.test.ts`).

**Konflikte globaler Klassen:** Bei einem Registry-Konflikt lädt die explizite Serverstand-Aktion Seite, Klassen und Registry-Version neu; die offenen lokalen Änderungen werden dabei verworfen. Ein Browser-Gate mit zwei Editorfenstern und der bestehende Seitenkonflikt-Gate sind ausgeführt (`packages/editor/src/state/persist.ts`, `packages/app/test/class-editor-browser.test.ts`, `packages/app/test/save-conflict-browser.test.ts`). Offen: konfliktfreies Zusammenführen und Live-Synchronisierung.

**Klassenstand beim Seitenspeichern:** Der Editor übermittelt seine Registry-Version auch bei Seitenänderungen; Engine und Datenbank prüfen sie vor dem Write, sodass ein veralteter Editor nach einer Klassenänderung nicht unbemerkt weiterschreibt (`packages/engine/src/store.ts`, `packages/editor/src/state/persist.ts`). Der Browser-Gate prüft den Konfliktdialog, der PostgreSQL-Gate die Sperre gegen einen parallelen Registry-Write (`packages/app/test/save-conflict-browser.test.ts`, `packages/engine/test/editor-mutations.test.ts`). Die Prüfung ist auf Anfragen mit dieser Versionsangabe begrenzt; unnötige Konflikte bei reinen Stiländerungen und verlustfreies Zusammenführen bleiben offen.

**Klassenverwendung:** Der Inspector kann die gespeicherten Verwendungen einer Klasse in Seitenentwürfen abfragen; ein Browser-Gate prüft die Übersicht über zwei Seiten (`packages/engine/src/http.ts`, `packages/app/test/class-editor-browser.test.ts`). Nicht erfasst sind veröffentlichte Revisionen und externe Bibliotheken.

**Klassensuche:** Die Auswahl verfügbarer Klassen lässt sich im Inspector filtern; leere Treffer und Zuweisung sind im Browser-Gate geprüft (`packages/editor/src/inspector/inspector.ts`, `packages/app/test/class-editor-browser.test.ts`).

**Klassen duplizieren:** Der Inspector erstellt eine unabhängig bearbeitbare Kopie und weist sie dem ausgewählten Element zu. Browser-Gate: Übernahme der Stil-, Breakpoint- und Zustandswerte, getrennte Bearbeitung und erneutes Laden (`packages/editor/src/inspector/inspector.ts`, `packages/app/test/class-editor-browser.test.ts`).

**Klassen umbenennen:** Der Inspector benennt nicht aus Framer importierte Klassen über alle Seitenentwürfe hinweg um; die Registry und Entwürfe werden transaktional geändert und alle Seitenversionen erhöht. Browser-Gate mit Undo/Redo und PostgreSQL-Gate mit Rollback und parallelen Registry-Writes sind ausgeführt (`packages/editor/src/inspector/inspector.ts`, `packages/engine/src/store.ts`, `packages/app/test/class-editor-browser.test.ts`, `packages/engine/test/style-rules.test.ts`). Framer-Importklassen sind bis zur Reimport-Migration gesperrt; freie Selektoren mit erkannten Verweisen blockieren die Umbenennung. Externe Bibliotheken, Code-Payloads und weitere indirekte Selektorreferenzen sind nicht migriert.

**Löschschutz:** Die bisherige Delete-API verweigert das Entfernen einer globalen Klasse, solange ein Seitenentwurf sie zuweist. Site- und Seitensperren sowie Versionsanhebungen schützen auch gegen konkurrierende und veraltete Seitenschreibvorgänge; ein PostgreSQL-Test prüft die parallele Zuweisung (`packages/engine/src/store.ts`, `packages/engine/test/style-rules.test.ts`). Der Browser-Gate prüft das fortbestehende Undo/Redo beim Anlegen (`packages/app/test/class-editor-browser.test.ts`). Externe Bibliotheken und indirekte Selektoren sind vom Schutz nicht vollständig erfasst.

**Globales Klassenlöschen:** Nach Nutzungswarnung entfernt ein eigener Schreibpfad Klasse und Seitenzuweisungen atomar; Undo/Redo nutzt einen versionierten Wiederherstellungsbeleg. Browser-, PostgreSQL- und Backup-Gates prüfen Mehrseitenablauf, Rollback, Konflikte, Wiederholung nach Antwortverlust und Beleg im Backup (`packages/editor/src/inspector/inspector.ts`, `packages/engine/src/store.ts`, `packages/app/test/class-editor-browser.test.ts`, `packages/engine/test/style-rules.test.ts`, `packages/engine/test/backup-restore.test.ts`). Undo scheitert bei zwischenzeitlich geänderten Seiten oder Klassen; Framer-Importklassen und erkannte freie Selektoren sind gesperrt. Externe Bibliotheken, Code-Payloads und weitere indirekte Referenzen bleiben offen.

**Klassenpriorität:** Globale Klassen lassen sich mit der stärksten Klasse oben verschieben; die Engine berechnet die Position anhand aller globalen Klassen, auch wenn Scoped-Regeln anderer Seiten im Editor ausgeblendet sind. Browser-Gate mit Undo/Redo und PostgreSQL-Gate sind ausgeführt (`packages/editor/src/state/persist.ts`, `packages/engine/test/style-rules.test.ts`, `packages/app/test/class-editor-browser.test.ts`). Der Elementor-konforme Vorrang lokaler Werte ist seit 06.11.2026 über ADR-0017 entschieden und im Compiler umgesetzt: Bedingung vor Herkunft, lokal vor global bei gleicher Bedingung. Die Matrix und ihre Grenzen stehen in `docs/adr/0017-lokale-stile-vor-globalen-klassen.md`; Charakterisierungstests, Widget-Engine-, Renderer-, Editor-, Framer-Import- und Browser-Visual-Gates sind ausgeführt (`packages/widget-engine/test/css-cascade.test.ts`, `css-combinations.test.ts`, `css-class-emission.test.ts`, `css-rule-kinds.test.ts`, `packages/app/test/visual-snapshot-browser.test.ts`, `class-editor-browser.test.ts`, `framer-import-browser.test.ts`). Ambient-Regeln mit frei gewählten Selektoren behalten ihre Spezifität; diese Grenze bleibt offen.

**Klassenziel im Inspector:** Das Klassenfeld und die Farbmarkierung für lokale beziehungsweise globale Ziele orientieren sich an Elementors veröffentlichter Oberfläche und den Farben des installierten Core. Der gezielte Browser-Gate prüft die Zustandsfarben (`packages/editor/src/inspector/styles.ts`, `packages/app/test/class-editor-browser.test.ts`). Der Core-Editor wurde am 06.11.2026 interaktiv inventarisiert (`docs/research/elementor-v4-acceptance-2026-11-06.md`); zusätzlich wurde die hcm.local/Tännig-Site mit tatsächlich exponiertem Klassen-Manager (6 echte globale Klassen, 3 Variablen) live aufgenommen. Prioritäts-/Umbenenn-/Löschabläufe an einer Testklasse, ein gesamter visueller Vergleich und der Live-Abgleich mit Senify bleiben offen.

**Erste Editor-Scheibe:** Linke Werkzeugleiste und eine umschaltbare Geräteansicht sind im Seiteneditor angebunden (`packages/app/public/app.js`, `app.css`, `packages/editor/src/canvas/canvas.ts`); der Browserablauf und der Importtest liegen unter `packages/app/test/`. Offen: tatsächlicher visueller Vergleich gegen Elementor, umfassender Elementkatalog, Klassen- und Variablenmanager, Interaktionen und feingranulare Bedienparität. Die alte Drei-Frame-Darstellung bleibt als Option des Canvas-Moduls erhalten; die App verwendet den einzelnen Frame.

**Elementkatalog:** Katalogeinträge sind gruppiert und durchsuchbar, auch ohne Vorauswahl einfügbar und für Grundelemente über den validierten Engine-Pfad speicherbar (`packages/editor/src/canvas/dnd-dom.ts`, `packages/engine/src/mutations/apply.ts`, `packages/app/test/imported-editor-browser.test.ts`, `packages/engine/test/mutations.test.ts`). Offen: alle Einträge und Kombinationen durchgängig prüfen, sämtliche Controls und Interaktionen ergänzen sowie Elementor-Zustände visuell vermessen. Der Katalog allein belegt keine vollständige Elementor-Gleichheit.

**Klassenspeicher:** Die Editor-Pipeline erkennt geladene Regeln als bestehend und entfernt gelöschte Regeln aus ihrer internen ID-Liste, sodass erneutes Anlegen nach Undo möglich ist (`packages/editor/src/state/persist.ts`, `packages/editor/test/state/persist.test.ts`). Offen bleiben der vollständige UI-Ablauf und das Zusammenspiel von Site-Regeln und Seitenzuweisungen bei Fehlern.

**Speicherreihenfolge:** Site- und Seitenänderungen werden in Eingabereihenfolge übertragen; fehlgeschlagene und noch nicht gesendete Schritte bleiben vorgemerkt, Eingaben während laufender Anfragen werden erneut eingeplant (`packages/editor/src/state/persist.ts`, `packages/editor/test/state/persist.test.ts`). Site und Seite sind weiterhin getrennte Ressourcen ohne gemeinsame Transaktion; Konflikt- und Wiederherstellungsverhalten im späteren Klassen-UI muss gesondert geprüft werden.

**Klassenbearbeitung:** Der Style-Inspector bietet lokale oder zugewiesene Klassen als Stilziel, legt Klassen an und verwaltet die Zuweisung zum Knoten. Breakpoint- und Zustandswerte nutzen denselben Regelbestand wie Canvas und Build (`packages/editor/src/inspector/`, `packages/editor/src/canvas/adapter.ts`, `packages/widget-engine/src/css/state-preview.ts`). Der Browserablauf prüft zwei Seiten mit gemeinsamem Stil sowie die Build-Ausgabe (`packages/app/test/class-editor-browser.test.ts`). Offen: die verbleibenden Grenzen der Verwendungsliste und Konfliktbehandlung sowie der genaue visuelle/semantische Elementor-Abgleich.

Nächste Arbeitspakete in Reihenfolge:

1. Exportzugang prüfen und einen echten Export als reproduzierbare Eingabe sichern. CLI und MCP können FramerExport starten und vorhandene Ordner anschließend als Mirror einlesen; MCP kann auch Projektdaten über Unframer lokal sichern (`packages/mcp/src/framer-export.ts`, `packages/mcp/src/unframer.ts`, `packages/framer-import/src/import.ts`). Der direkte kombinierte Ablauf und die Übernahme des Unframer-Snapshots in den NodeTree bleiben offen.
2. Einen vollständigen Durchlauf für eine echte Site schaffen: Seiten, Struktur, Schriften und Medien lokal übernehmen; Framer-Abhängigkeiten im Ergebnis sichtbar erfassen und ersetzen.
3. Layout und Breakpoints mit Original und lokalem Ergebnis im Browser vergleichen; Abweichungen schrittweise beseitigen und Bearbeitbarkeit durch konkrete Änderungen und erneuten Build prüfen.
4. Animationen und Interaktionen einschließlich Scroll, Hover, Zuständen und Timing erfassen und ohne Framer Runtime nachbilden. Nicht unterstützte Effekte müssen im Bericht sichtbar bleiben (`packages/framer-import/src/motion-mapping.ts`).
5. Mehrseiten-Navigation, CMS und Sonderkomponenten anhand der tatsächlich benötigten Site ergänzen und den gesamten Weg über Editor und MCP prüfen.

**Erste echte Framer-Abnahme, 06.11.2026 (teilweise):** Die bereitgestellte Relay-Site wurde vollständig inventarisiert und gespiegelt; sechs gespiegelte Routen liegen als Senify-Seiten vor. Die Startseite läuft statisch, die client-gerenderten Unterseiten über den neuen `--browser`-Import (Contact 334 Knoten, Blog-Index 324, drei Beiträge 232/208/204; 0 Assetfehler). Das Sitemap-Manifest erkennt alle 10 veröffentlichten Routen und erfasst `/404` sowie die drei im Mirror fehlenden CMS-Routen im Browser (186/208/206/217 Knoten, 0 Blocker). Offene Pflichtpunkte: Schreiblauf dieser vier Routen auf einer funktionsfähigen Datenbank (der lokale PostgreSQL-Cluster fällt mit `0xC0000142`/Shared-Memory-Fehler 487 aus), Fonts/Motion vervollständigen, `runtimeFreeVerified` nachweisen und einen vollständigen visuellen sowie zeitlichen Original-gegen-Build-Vergleich ausführen. Pseudo-Zustände sind für die vier Engine-Zustände umgesetzt (6 auf Contact ausgewertet, 1 angewendet; offen bleiben Pseudo-Elemente, strukturelle Selektorlisten, Attribut-/Vorfahrenzustände, die Link-Knoten-Zuordnung und Gerätevarianten). Beleg: `.scratch/framer/acceptance-gracious-2026-11-06.md`.

**Erster Import-Schritt:** Lokale Bild- und Font-Dateien aus einem vorhandenen Mirror werden in die Asset-Pipeline übernommen; Tests für Dateiübernahme und Pfadbegrenzung stehen in `packages/framer-import/test/assets.test.ts` und `import.test.ts`. Der direkte kombinierte Export- und Importablauf und die weiteren Produktziele bleiben offen.

**Bilddarstellung:** Strukturierte Bild- und Poster-Referenzen sowie sichere `inset`-Shorthands werden im gemeinsamen Renderpfad verarbeitet (`packages/widget-engine/src/markup.ts`, `packages/widget-engine/src/css/properties.ts`). Die Beispielseite zeigt das Hintergrundbild; originalgetreue Farben, Layout und Animationen sind weiterhin offen.

**Farb- und Textimport:** Farbvariablen erhalten vorhandene Quellwerte als CSS-Fallback; Selektoren mit nicht auswertbarem Attribut-Vorfahren werden nicht global angewendet und Varianten-Vorfahren müssen alle geforderten Klassen tragen. Verschachtelte Textblöcke behalten ihre Typografie; alleinstehende Verläufe werden als Hintergrundbilder ausgegeben (`packages/framer-import/src/capture-html.ts`, `mapper.ts`, `import-fidelity.test.ts`). Vollständige Selektorunterstützung und Bildtreue bleiben offen.

**Motion-Korrektur:** Der Import überträgt Delay in Sekunden und erhält Tween-Dauern; der vertikale Startabstand wird auf die bestehende Preset-Skala angenähert (`packages/framer-import/src/motion-mapping.ts`, `capture-html.ts`, `motion-mapping.test.ts`, `motion-appear.test.ts`). Exakte Kurven, nicht unterstützte Effekte und ein Bewegungsvergleich bleiben offen.

**Motion-Evidenz:** Beim Erfassen von Appear-Effekten bleiben zusätzlich alle vom Export gelieferten Breakpoint-Varianten als Rohdaten erhalten. Effekte ausschließlich für einzelne Breakpoints und Effekte mit Rotation oder Schrägstellung werden nicht als geräteübergreifendes Fade-up ausgegeben (`packages/framer-import/src/capture-html.ts`, `packages/framer-import/src/motion-mapping.ts`, `packages/framer-import/test/motion-appear.test.ts`). Die Wiedergabe gerätespezifischer Effekte und exakte Spring-Parameter bleiben offen.

**Tween-Quelldaten:** `readAppearTween` liest begrenzte, deklarative Framer-Tweens mit Originalzuständen, Zeit und Bézier-Kurve; abweichende Breakpoint-Varianten, unbekannte Eigenschaften und Springs werden abgelehnt (`packages/framer-import/src/appear-tween.ts`, `packages/framer-import/test/appear-tween.test.ts`). Die Quelldaten des Beispielprojekts wurden damit geprüft.

**Tween-Wiedergabe:** ADR-0015 ergänzt ADR-0006 für einen begrenzten deklarativen Framer-Importtyp und browserseitige WAAPI. Unterstützte Tweens werden mit Originalwerten in der Motion-Spec gespeichert, im Editor angeboten und von Canvas und Build über den gemeinsamen Renderer abgespielt (`packages/framer-import/src/motion-mapping.ts`, `packages/section-sdk/src/schema.ts`, `packages/editor/src/inspector/model.ts`, `packages/renderer/src/motion.ts`). Der PostgreSQL-Test prüft die Änderung eines importierten Effekts; ein Browser-Test vergleicht kontrollierte Zeitpunkte (`packages/engine/test/imports.test.ts`, `packages/renderer/test/imported-appear-browser.test.ts`). Zusätzlich wurde eine echte Appear-Animation der Beispielseite im Browser gegen den isolierten neuen Runner gemessen. Ein lückenloser Vergleich aller Seiten, Startzeitpunkte, Breakpoints und Interaktionen steht aus; Springs, unterschiedliche Breakpoint-Tweens und weitere Eigenschaften sind noch nicht gleichwertig übernommen.

**Scroll-Evidenz:** Anfangs versteckte Elemente ohne `data-framer-appear-id` werden als möglicher nicht übernommener Scroll- oder Interaktionszustand im Importbericht zusammengefasst (`packages/framer-import/src/capture-html.ts`, `packages/framer-import/test/capture.test.ts`). Die Warnung beweist keinen konkreten Trigger und ersetzt keine Messung der Scrollbewegung.

**Scroll-Sensor:** Der optionale Browser-Capture misst Positionsabweichungen zwischen zwei Scrollpositionen anhand stabiler Elementidentitäten; fixierte und sticky Bereiche werden ausgespart. Die Beobachtungen bleiben Befunde und erzeugen keine Animation (`packages/framer-import/src/capture-browser.ts`, `motion-mapping.ts`, `packages/framer-import/test/capture-browser.test.ts`). Offen bleiben mehr Scrollpositionen und Viewports, die Zuordnung zum exportierten Knoten, Zeit- und Triggeranalyse sowie die Integration in den regulären Import. Layoutverschiebungen oder zeitabhängige Animationen können weiterhin ähnliche Messwerte verursachen.

**SVG- und Navigationsgrenze:** Ein Framer-Plus mit nachgewiesener 24×24-Geometrie, lokaler Vorlage, Farb- und Strichvariablen wird als editierbares Icon abgebildet; unbekannte SVG-Geometrien werden gemeldet (`packages/framer-import/src/mapper.ts`, `packages/widget-engine/src/markup.ts`). Einfache Rich-Text-Links übernehmen ihre Linkfarbe und den aktuellen Zustand. Generische SVGs sowie Hover-, Menü- und weitere Interaktionszustände bleiben offen.

**Bearbeitbarkeit:** Property-Änderungen an importierten Primitives nutzen dieselbe Validierung wie der Editor (`packages/widget-engine/src/validation.ts`, `packages/engine/src/mutations/apply.ts`, `packages/engine/test/imports.test.ts`). Für die Beispielseite ist eine gespeicherte Textänderung mit PostgreSQL im Profil `showcase` geprüft. Offen: Profilkonflikte zwischen importierter Motion und `standard`, Struktur- und Breakpoint-Änderungen sowie der vollständige Editor-Ablauf.

**PullPage-HTML:** Der Import erkennt den Seitenbaum auch bei anderer Reihenfolge der Attribute am `main`-Element; Kommentare und Script-Inhalte werden bei der Suche übersprungen (`packages/framer-import/src/capture-html.ts`, `packages/framer-import/test/capture.test.ts`). Die Startseite des bereitgestellten Exports wurde zusätzlich lokal eingelesen. Unterseiten, lokale Assets und unveränderte Animationen sind dadurch noch nicht vollständig importiert.

**Unterseiten als Quelle:** Einzelne Routen können über `sourcePagePath` aus strukturierten Exportordnern oder FramerExports `subpages` gelesen und unabhängig unter einem Zielpfad importiert werden (`packages/framer-import/src/capture-html.ts`, `packages/framer-import/src/import.ts`, `packages/engine/src/imports-contract.ts`, `packages/mcp/src/tools.ts`). Die Auswahl ist in CLI und MCP verfügbar; Pfadbegrenzung sowie Engine- und Parser-Durchlauf sind gezielt geprüft (`packages/framer-import/test/import.test.ts`, `packages/engine/test/imports.test.ts`).

**Lokale Medien:** Dateien im lokalen Asset-Ausgabeordner erhalten einen Inhaltshash im Namen; unterschiedliche Dateien mit gleichem Namen überschreiben sich nicht. Fehlgeschlagene Bild- und Mediendownloads erscheinen als Befund (`packages/framer-import/src/assets.ts`, `packages/framer-import/test/assets.test.ts`). Die Medien und Fonts der Startseite des bereitgestellten Exports wurden zusätzlich lokal heruntergeladen. Ein vollständig offline ausführbares Gesamtprojekt ist damit noch nicht nachgewiesen.

**Mehrseiten-Vorbereitung:** `senify prepare framer <quelle> <neues-ziel>` und MCP `prepare_framer_export` erfassen strukturierte Exportordner samt Seiten und Medien in `site-ir.json` und einem Asset-Ordner (`packages/framer-import/src/prepare-site.ts`, `packages/mcp/src/cli.ts`, `packages/mcp/src/tools.ts`). Nicht erkannte Seiten, fehlende Dateien und flache `subpages` werden ausgewiesen; externe Downloads sind auf Framer-Asset-Hosts beschränkt. Das Ergebnis ist eine Importgrundlage, kein Senify-Projekt und kein Nachweis für Runtime-Freiheit. Der bereitgestellte PullPage-Export wurde damit lokal vorbereitet; CMS-Bindung und Motion-Abnahme bleiben offen (`packages/framer-import/test/prepare-site.test.ts`, `packages/mcp/test/framer-export.test.ts`).

**Mehrseiten-Import:** `senify import framer-site` und MCP `import_framer_site` analysieren strukturierte HTML-Exporte und legen bei `--write` Seiten nacheinander in Senify an. Vorhandene Seiten werden durch `createOnly` nicht überschrieben; bei Fehlern wird der Teilstand gemeldet (`packages/mcp/src/framer-site-import.ts`, `packages/engine/src/imports.ts`, `packages/mcp/test/framer-site-import.test.ts`, `packages/engine/test/imports.test.ts`). Der Ablauf ist nicht atomar, nicht wiederaufnahmefähig und liest Seiten aus den ursprünglichen Exportquellen statt aus dem vorbereiteten IR. Ein vollständiger Produktionsnachweis für die Beispielseite und der Runtime-Check bleiben offen.

**Vorbereitete Assets wiederverwenden:** Ein Asset-Manifest verknüpft die exakten Quell-URLs mit lokal gesicherten Dateien und deren SHA-256; `--asset-cache-dir` beziehungsweise `assetCacheDir` führt diese Dateien beim Mehrseiten-Import durch die bestehende Upload-Pipeline. Der Cache-Modus greift nicht auf das Netzwerk zurück und meldet fehlende oder veränderte Dateien (`packages/framer-import/src/assets.ts`, `packages/framer-import/src/prepare-site.ts`, `packages/framer-import/test/prepare-site.test.ts`). Startseite und ein Blogartikel des Beispiel-Exports wurden zusätzlich lokal mit diesem Cache verarbeitet.

**Textlinks:** Einfache Textlinks übernehmen den Text in das Link-Primitiv, ohne nicht darstellbare Kindknoten zu erzeugen. Links mit mehreren separaten Textelementen bleiben verlinkte Container (`packages/framer-import/src/mapper.ts`, `packages/framer-import/test/import-fidelity.test.ts`).

**Importberichte:** Für als verlinkten Frame erhaltene Link-Wrapper wird keine irreführende Verlustwarnung mehr erzeugt. Der Mehrseitenbericht kennzeichnet Animationen weiterhin als nicht vollständig geprüft, ohne alle übernommenen Tweens pauschal als angenähert zu bezeichnen (`packages/framer-import/src/mapper.ts`, `packages/mcp/src/framer-site-import.ts`).

**Seitentitel:** HTML-Entities im `<title>` werden beim Import dekodiert, damit beispielsweise `&amp;` nicht als sichtbarer Text im Editor und Build landet (`packages/framer-import/src/capture-html.ts`, `packages/framer-import/test/capture.test.ts`). Bereits importierte Seiten ändern sich dadurch nicht automatisch.

**Unframer-Daten bündeln:** Optional legt die Mehrseiten-Vorbereitung einen bestehenden Unframer-Snapshot neben dem Seiten-IR ab und gleicht anhand der Canonical-Origin die Quelle sowie statische Seitenpfade ab (`packages/framer-import/src/prepare-site.ts`, `packages/framer-import/test/prepare-site.test.ts`). Die XML-Struktur, Komponenten und CMS-Daten sind damit gemeinsam gesichert, aber noch nicht in Senify-Strukturen übersetzt.

## Teststrategie für schnelle Entwicklung

**Editor-Gate für Framer-Importe:** Medien-Pagination und gerätespezifische Sichtbarkeit sind im echten Canvas zu prüfen; eine fehlerfreie statische Build-Vorschau reicht hierfür nicht aus (`packages/app/test/imported-editor-browser.test.ts`). Die vollständige visuelle und funktionale Prüfung weiterer importierter Seiten bleibt offen.

- Bei einer Änderung zuerst die direkt betroffenen Tests ausführen, zum Beispiel `pnpm exec vitest run <testdatei>`. Die Tests gezielt nach Vertrag auswählen; automatische Abhängigkeitsauswahl kann bei stark vernetzten Modulen große Teile der Suite starten.
- Pro Arbeitsschritt ein zum Risiko passendes Gate festlegen und ausführen. Reine Dokumentationsänderungen: `git diff --check` und bei Änderungen am Dokumentationsvertrag zusätzlich `pnpm quality:check`. Ein ausdrücklich für einen Schritt festgelegtes Gate bleibt verbindlich.
- Vollsuite, Coverage, Browser-, Import-, Paritäts- und PostgreSQL-Gates passend zu den betroffenen Schnittstellen vor Abschluss des größeren Änderungspakets oder in CI ausführen. Einen bereits bestandenen unveränderten Lauf nicht bei jedem Zwischenschritt wiederholen.
- CI-Gates und ihre Fehlerschwellen bleiben unverändert; gezielte Tests ersetzen keinen erforderlichen Integrationsnachweis.

---

## Aktueller DoR-Blocker

Historische Folge-Diffs einschließlich der Store-Mapper-Auslagerung sind gesichert. Die aktuelle Arbeit betrifft den Editor-Umbau aus `.scratch/editor-umbau/HANDOFF-2026-11-05.md`; die Arbeitsübersicht steht in `.scratch/editor-umbau/map.md`. Jede aktive Scheibe endet mit ihrem ausgeführten Gate und Schritt-Commit, bevor eine neue Umsetzung beginnt. Frühere App-/DB-Gates und aktuelle Zahlen stehen ausschließlich in `docs/current/qualitaet.md`.

---

## Priorität 0 — Grundlage sichern und ehrlich machen

### P0-1 · Arbeitsbaum in fachlichen Commits sichern — ursprünglicher Bestand historisch erledigt; Folge-Diff gesichert 29.09.2026

Zehn fachliche Commits (`1e4645a…67a2862`) sicherten den ursprünglichen Bestand. Der spätere geprüfte Folge-Diff ist ebenfalls gesichert (`2a0afde`, `aad9550`). Der neue uncommittete Store-Mapper-Schritt gehört zu P3-2 und muss dessen Gate und Commit durchlaufen, bevor ein weiterer Schritt beginnt.

Der lokale Runtime-Store `data/`, `full.log` sowie Graphify-Ausgaben sind ignoriert und werden nicht übernommen. Die Graphify-Semantik-Auswertung ist unvollständig; daraus wird kein Vollständigkeitsbeleg abgeleitet.

**Gate:** Für den gesicherten Folge-Diff liefen `pnpm verify`, `pnpm test:visual`, `pnpm verify:parity`, `pnpm verify:import`, `pnpm test:postgres`, `pnpm test:coverage` und `pnpm quality:check` am 28.09.2026 grün. Aktuelle P3-2-Gates sind unter P3-2 und in `docs/current/qualitaet.md` dokumentiert.

### P0-2 · Lintfehler der Postgres-Testdatei — historisch erledigt 25.09.2026

Der alte `ensureSchema`-Import in `redesign-transaction.test.ts` wurde entfernt. P0-2 ist historisch abgeschlossen; der aktuelle `pnpm lint`-Lauf ist grün.

### P0-3 · Idempotency-Completion-Fehler schließen (R6) — erledigt 26.09.2026 (`d233971`)

Die Completion prüft `UPDATE ... RETURNING`; Fehler aus `run()` geben den Key frei, Completion-Fehler behalten/markieren ihn, Retry bei `committed_unknown` antwortet mit 409. Umsetzung über additive Tabelle `idempotency_committed`. Belege: `packages/engine/src/http.ts`, `idempotency.test.ts`, `error-paths.test.ts`.

Der ursprüngliche Plan mit `committed_response_unknown`/`ALTER TABLE` ist überholt; die implementierte Lösung ist additiv. Gate für künftige Änderungen: Idempotency-, Schema-, Backup- und Transaktionstests.

### P0-4 · Build-Echtheit einführen (R1) — Implementierung abgeschlossen 27.09.2026

`packages/app/build.mjs` baut App-Artefakte; `pnpm build` führt `typecheck` plus Workspace-Builds aus. `scripts/verify-dist.mjs` hängt an `pnpm verify` und ist eigener CI-Schritt. Der Negativfall ohne `dist/` endet mit Exit 1. **R1 ist implementierungsseitig geschlossen.** Der aktuelle Folge-Diff hat Build und Artefaktprüfung im `pnpm verify`-Lauf dieser Runde bestanden; die weiteren App-Gates müssen noch ausgeführt werden.

Kein Minify/Tree-Shake/Sourcemaps in diesem Schritt. ESM-Aufteilung und Dateigrößen-Budgets gehören, falls priorisiert, in P3-2.

---

## Priorität 1 — CI muss beweisen, was der Code behauptet

### P1-1 · PostgreSQL-Lane in CI (R11, Teil 1) — erledigt 28.09.2026

`.github/workflows/verify.yml` führt einen eigenen `postgres-tests`-Job mit Postgres 16 und `TEST_DATABASE_URL`. `pnpm test:postgres` wird rot, wenn ein Fall übersprungen wird oder keiner läuft. Der aktuelle Folge-Diff bestand die Lane lokal mit sechs Fällen gegen PostgreSQL 18.6, null übersprungen. Test-Fixture erstellt und entfernt ein eigenes Schema.

### P1-2 · Coverage-Schwellen (R11, Teil 2) — erledigt 28.09.2026

`vitest.config.ts` nutzt v8 und `perFile: true`; `pnpm test:coverage` prüft geschützte Pfade aus engine, editor und mcp. Gezielte Fehlerpfade: `error-paths.test.ts` (Idempotency-Release, Completion ohne Slot, Rollback), `auth.test.ts` (`operatorOnly`), `mutations.test.ts` (`baseVersion`-409) und `imports.test.ts` (Asset-Kompensation). Coverage bleibt ein Messwert der ausgeführten Tests und kein Vollständigkeitsbeweis. Zahlen ausschließlich in `docs/current/qualitaet.md`; das aktuelle Coverage-Gate ist grün.

### P1-3 · Lint-Ziel erweitern — erledigt 26.09.2026, Root-Config offen

`pnpm lint` führt `eslint packages scripts` aus; `pnpm check:patch` hängt in `verify`. `eslint.config.mjs` selbst ist noch nicht im Lint-Ziel. Der aktuelle Lint-Lauf ist grün; Root-Config-Linting bleibt für P3-6 offen.

**Gate P1:** Workflow enthält `verify`, `test:visual`, `verify:parity`, `verify:import`, `postgres-tests` und `coverage`. Der aktuelle Gesamt-Diff hat diese Lanes bestanden.

---

## Priorität 2 — Redesign zu Ende bringen — erledigt

Der ursprüngliche Produktblock P2-1 bis P2-4 ist mit Code-/Testbelegen abgeschlossen. Nicht erledigt ist automatische Bild-/Medienbeschaffung; sie ist kein Teil der bereits erledigten operativen Need-Auflösung.

### P2-1 · Sektions-Plan im Executor (R3) — erledigt 27.09.2026

`compileRedesign()` leitet Writes aus der bestätigten Card ab, `rebuildPageTree()` baut Zielknoten, der Commit schreibt sie in derselben Transaktion wie Theme und Claim. `sectionPlanApplied` ist nur bei tatsächlich geschriebenem Plan ohne offene Needs wahr. Belege: `apply-redesign.ts`, `redesign-section-apply.ts`, `redesign-proposals.test.ts`, `redesign-transaction.test.ts`.

### P2-2 · Medienbedarfe operativ machen — erledigt 28.09.2026, Gate erfüllt

Bedarfe sind adressierbare Arbeitspakete mit Zielknoten und Prop-Pfad und werden über `POST /api/redesign-proposals/:id/media-needs` mit den kanonischen Mutationen aufgelöst. Die Ownership-Prüfung läuft **vor** dem Write; `avoid` bleibt absichtlich leer und ist **kein** Bedarf.

**Das Gate ist erfüllt:** `packages/app/test/media-needs-browser.test.ts` führt im echten Browser von der Quellseite über Bestätigen, Medienbedarf-Panel, `generate`-Job und `manual` bis zur eingereichten Review. Der Lauf benutzt die **echte** Provider-Kette (`custom` gegen einen lokalen Test-Endpunkt), keinen injizierten Stub — ein Stub ließe den Lauf grün, während die Kette kaputt ist, und genau die ist es, worauf ein `generate` sich stützt.

**Was der Bau am Produkt geändert hat, nicht nur am Test:** `rebuildPageTree` trug den **kaputten Asset-Verweis** aus der Quelle in den neu gebauten Knoten. Die Folge war ein 422 beim Review-Submit Stunden nach dem Apply — der Publish-Guard sah ein Asset, das nicht existiert. Jetzt wird ein Prop, dessen Slot der Plan als offenen Bedarf benannt hat, **nicht** übernommen. „Inhalt erhalten" heißt Inhalt erhalten; ein Verweis auf ein gelöschtes Asset ist kein Inhalt, sondern ein Loch, das der Plan schon benannt hat. Der Slot ist leer, der Mensch füllt ihn, und der Guard hat nichts zu beanstanden.

**Drei weitere Befunde aus dem Lauf, festgehalten weil sie wiederkehrten:** (1) Die Bildgenerierung ist ein **Job**; der Dialog wartet auf `succeeded`, nicht auf eine fertige Datei. (2) Der Status heißt `succeeded`/`canceled`, nicht `done`/`cancelled` — mit den falschen Namen wartete der Dialog endlos auf einen Zustand, den es nicht gibt. (3) Die Referenz braucht ein **gespeichertes Bild als Snapshot mit `previewPath`**, nicht nur eine `storageRef`; die Engine verweigert eine Richtung aus einer Referenz ohne Aufnahme, zu Recht — eine Richtungskarte ist ein Screenshot.

**Weiterhin nicht automatisch beschafft:** `select`/`upload`/`generate` benennen und bedienen, aber der Lauf beschafft nicht von allein. Das ist der bewusst offene Rest — die Bedienung steht, der Einkauf nicht.

### P2-3 · Proposal-TTL und Aufräumen (R2) — erledigt 27.09.2026

Sieben Tage `expires_at`, Sweep zu `expired`, Prüfung im Claim; abgelaufene Anwendung scheitert mit `conflict`. Beleg: `packages/engine/test/redesign-proposal-ttl.test.ts`.

### P2-4 · Design-Record (R4) — erledigt 27.09.2026

Versionierte Records werden bei Review und Publish gespeichert; Manifest und Re-Bake verweisen auf denselben Record. Beleg: `packages/engine/test/design-record.test.ts`.

**Gate P2:** Die genannten Engine- und Postgres-Tests sind im aktuellen Gesamt-Gate grün; Details stehen in `docs/current/qualitaet.md`.

---

## Priorität 3 — Reduktion, Verträge, Vollständigkeit

### P3-1 · Legacy-Editor ablösen (R5) — erledigt 28.09.2026

`packages/editor/src/mount.ts`, `legacy-editor.html` und Legacy-Browser-Tests sind entfernt. Der Canvas-Redirect und Bundle-Ausschluss sind getestet; `FrameRenderer` liegt in `frame-renderer.ts`. Historische Umsetzungsschritte unten sind abgeschlossen, keine offene Löschaufgabe.

### P3-2 · God-Files aufteilen (R12) — in Arbeit, erster Store-Schritt

**Ready:** vorheriger Folge-Diff ist gesichert; Scope dieses Schritts ist auf die privaten Row-Typen, Mapper und Parser-Helfer des `Store` begrenzt. Keine öffentliche Store-API wird verändert.

**Umsetzung:** Asset-, Code-Payload-, Collection- und Entry-Row-Mapping liegt in `packages/engine/src/store-record-mappers.ts`; gemeinsam genutzte DB-Zeilen-Konvertierungen liegen in `store-row-utils.ts`. Der Store-Operationscode bleibt noch groß und wird in separaten Schritten behandelt.

**Reihenfolge:** `store.ts`, `http.ts`, `mcp/tools.ts`, `app.js`; `mount.ts` entfällt mit P3-1. Nicht mehrere große Module gleichzeitig aufteilen.

**Gate dieses Schritts:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:coverage`, `pnpm quality:render`, `pnpm quality:check` und `git diff --check` am 29.09.2026 grün; vorhandene Assertions unverändert. Vor einem weiteren Schritt: Änderungen fachlich committen und `git status --short` leer prüfen. Bei Browser-/Build-Pfaden zusätzlich die passenden App-Gates.

### P3-3 · MCP-Schema-first (R8) — Punkte 1 bis 5 erledigt 28.09.2026

**Punkt 1 — `outputSchema` für die lesenden Werkzeuge.** `outputSchema` auf `ToolDefinition`, Schemata für `list_sites`, `get_site`, `list_pages`, `get_page`, `list_assets`, `list_references`. `structuredFor` im Server sendet `structuredContent` nur, wenn das Werkzeug ein Schema deklariert **und** der Wert es erfüllt; ein nicht passender Wert wird protokolliert und **ohne** Struktur geschickt, damit der Textblock die Wahrheit bleibt. Beim Bauen fiel ein Fehler auf, den der Server korrekt fand: das erste Listenschema sah `{ items: [...] }` vor, die Routen liefern aber `{ sites: … }` mit eigenem Schlüssel. Ein Schema, das der Code nicht hält, ist schlimmer als keines.

**Punkt 2 — ein Fehlerobjekt mit `retryable`.** Die Tabelle steht im Code, weil sie eine **Entscheidung** ist: von den fünf Engine-Kategorien ist nur `conflict` wiederholbar, denn dort liefert die Engine den aktuellen Zustand mit, den man erneut schicken kann. `validation`, `guardrail`, `not_found` und `auth` sind es nicht — bei `auth` ist das der wichtigste Fall, weil ein Agent, der 401 in einer Schleife wiederholt, wie ein Angriff aussieht. `attempt` zählt je (Werkzeug, Argumente), begrenzt auf 200 Einträge.

**Punkt 3 — Pagination.** `packages/engine/src/paging.ts`: `limit` mit Standard 50 und Kappe 200, `offset` validiert statt geklemmt. Eingespeist in Sites, Seiten, Assets, Einträge, Referenzzuweisungen, Releases, Bake-Jobs und Image-Jobs. Drei Entscheidungen: (1) **Kein Parameter heißt eine begrenzte Seite**, nicht die ganze Liste — sonst bleibt das Unbegrenzte der Normalfall. (2) Die Kappe wird **abgelehnt, nicht gekürzt**; eine stille Kürzung beantwortet eine andere Frage als die gestellte, und der Aufrufer merkt es nicht. (3) `total` und `hasMore` beschreiben die **gefilterte** Liste; ein `total` über den ganzen Bestand ließe einen Aufrufer aufhören, obwohl er die Auswahl nicht gesehen hat. Der aktive Release bleibt außerhalb des Blocks — er ist ein Zeiger, kein Listeneintrag, und wer Seite 3 der Historie liest, muss wissen, was live ist. Offset statt Cursor, bewusst: diese Listen werden von Menschen bearbeitet, und ein eingeschobener Datensatz ist heilbar; bei einem Nur-Anhängen-Log wäre er es nicht.

**Punkt 4 — das Manifest aus einem neutralen Paket.** `@senify/manifest`. `tools.ts` ist **generiert** (`pnpm manifest:render` liest `mcp/src/tools.ts` und schreibt 106 Werkzeuge), `types.ts` hält die Typen, `tools-index.ts` die Logik, `index.ts` den Join. Warum generiert und nicht handgeschrieben: drei Stellen lesen das Manifest, und eine Handkopie von 106 Werkzeugen ist eine Kopie, die beim ersten Rename driftet. **Die Grenze des Pakets steht im Code:** Schemas und Handler bleiben in `@senify/mcp`. Die Fakten über ein Werkzeug sind Daten; ein TypeBox-Schema ist ein lebendes Objekt, das der Engine-Vertrag gehört, und eine Kopie davon im Manifest wäre eine zweite Stelle zum Ändern. Was das Manifest trägt: Name, Scope, Titel, Beschreibung, Route, Gruppe, `writes` und die Parameter als Namen/Typ/Pflicht.

**Punkt 5 — der Zyklus ist aufgelöst.** `docs-portal` importierte `@senify/mcp/tools`, um die Werkzeuge zu dokumentieren, und zog damit den ganzen Server in den Doku-Build. Der Fahrplan nannte den Lazy-Import dafür „kaschiert"; er war kaschiert. Jetzt: `@senify/manifest`, ohne Server, ohne Zyklus. Dass `@senify/mcp` in den Abhängigkeiten des Doku-Portals **nicht** mehr steht, ist der Beweis.

**Was beim Bauen auffiel und festgehalten gehört:** Der erste Manifest-Aufbau ließ die generierte Datei ihre eigenen Helfer re-exportieren — ein Zyklus, der **erst im gebauten Bundle** als `Cannot read properties of undefined (reading 'map')` auftauch und keinen der beiden Module nannte. Ein Zyklus, der sich erst im Bundle zeigt, ist der Grund, warum der Join in einer dritten Datei liegt. Und: 15 der 106 Werkzeuge haben **keine** HTTP-Route, weil sie direkt am Store arbeiten. Das ist eine Eigenschaft des Werkzeugs, kein Extraktionsfehler — `manifest.test.ts` prüft es ausdrücklich, weil `null` („keine Route") und `null` („nicht gefunden") zwei verschiedene Behauptungen sind.

**Tests:** `paging.test.ts` (9 Fälle), `manifest.test.ts` (6), zwei in `mcp/test/workflow.test.ts`, `docs-portal` vollständig grün ohne MCP-Server.

**Erledigt 06.11.2026:** Paginierte MCP-Listen (`list_sites`, `list_pages`, `list_releases`, `list_bake_jobs`, `list_assets`, `list_entries`, `list_image_jobs`) führen `limit`/`offset` und liefern `page`/`total`/`exactTotal`/`hasMore` als strukturierte Ausgabe. Relevante Schreibwerkzeuge (`create_site`, `create_page`, `apply_mutations`, `update_theme`, `publish_release`, `delete_page`, `upload_asset`, `create_style_rule`, `set_styles`, `update_asset`, `delete_asset`, `restore_asset`, `create_entry`, `update_entry`, `undo_batch`) deklarieren ein `outputSchema`; `structuredContent` wird nur bei passender Form gesendet. Die Routenmatrix liest ihre Werkzeug-Routen aus dem generierten `@senify/manifest`, und `packages/mcp/test/manifest-drift.test.ts` hält Server, Manifest und Generator zusammen. Der Einträge-Pfad paginiert jetzt korrekt mit Offset, statt die Liste vorher auf `limit` zu kürzen. Belege: `packages/mcp/test/workflow.test.ts`, `packages/engine/test/paging.test.ts`, `packages/manifest/test/manifest.test.ts`, `packages/engine/test/route-matrix.test.ts`.

### P3-4 · Release-Manifest (R7) — erledigt 28.09.2026

Snapshot-Werte für Assets, Components, Payloads und Entries sind enthalten. Asset-Zeilen und verfügbare Bytes können aus dem Basis-Release wiederhergestellt werden; wenn Zeile und Datei fehlen, wird mit 422 verweigert. Belege: `lifecycle.ts`, `release-manifest.test.ts`.

### P3-5 · Import-Asset-Kompensation (R10) — erledigt 27.09.2026

Neu erzeugte Uploads werden nach fehlgeschlagenem DB-Commit kompensiert; negativer Fehlerpfad in `packages/engine/test/imports.test.ts`. Datei und DB sind keine gemeinsame Transaktion; dies bleibt eine dokumentierte Grenze.

### P3-6 · Doku-Prozesse und `.scratch/`-Hygiene — teilweise erledigt

- Coverage-Zahlenblock in `qualitaet.md` wird von `scripts/render-quality.mjs` erzeugt; CI führt `pnpm quality:check` aus.
- Historische Dokumente liegen unter `docs/history/`.
- `.scratch/`-Regel: Absicht und Werkzeuge bleiben getrackt; erzeugte Logs, Bilder und Messergebnisse werden ignoriert (`.gitignore`).
- Offen: Docs-Portal-Build als eigener sichtbarer CI-Schritt (aktuell in rekursivem Build enthalten) und Linting von `eslint.config.mjs`.

---

## Risiko-Register

| Nr. | Risiko | Status | Schritt |
|---|---|---|---|
| R1 | Kein Produktionsbuild | **Implementierung und aktuelle Build-/Artefakt-Gates geschlossen** (`pnpm verify`, 28.09.2026) | P0-4 |
| R2 | Keine Proposal-TTL / kein Aufräumen | **geschlossen** | P2-3 |
| R3 | Sektions-Plan nicht ausgeführt | **geschlossen** | P2-1 |
| R4 | Kein Design-Record | **geschlossen** | P2-4 |
| R5 | Legacy-Editor im Bundle | **geschlossen** | P3-1 |
| R6 | Idempotency-Completion-Fehler | **geschlossen** | P0-3 |
| R7 | Manifest ohne Snapshots | **geschlossen** | P3-4 |
| R8 | MCP-Schemas, Pagination und Manifest-Konsumenten nicht durchgängig | **geschlossen 06.11.2026**: paginierte Listen mit Eingabe und Metadaten, `outputSchema` für relevante Schreibwerkzeuge, Routenmatrix aus dem Manifest, Server↔Manifest-Drift-Test | P3-3 |
| R9 | Style-Registry-Klassen-Rename ohne Test | **geschlossen** | P3 (Mini-Schritt) |
| R10 | Import-Asset-Kompensation unbelegt | **Kompensationsvertrag geschlossen**; eine gemeinsame Datei-/DB-Tx besteht nicht | P3-5 |
| R11 | Kein PG-Service/Coverage/Fehlerpfade in CI | **Implementierung und aktuelle lokale Gates geschlossen**; CI-Jobs vorhanden | P1-1, P1-2 |
| R12 | God-Files | **offen** | P3-2 |
| R13 | Ursprünglicher Arbeitsbaum ungesichert | **Historische Folge-Diffs gesichert**; jede aktive Editor-Scheibe bleibt bis Gate und Schritt-Commit offen | P0-1 / Editor-Umbau |

## Definition of Ready für neue Schritte

1. Der vorherige Prioritäts-Gate ist ausgeführt und grün.
2. `git status --short` ist sauber; ein historischer sauberer Commit reicht nicht, wenn ein neuer Folge-Diff entstanden ist.
3. Kein anderer Strang schreibt dieselben Dateien.
4. Zieldateien und betroffene Schnittstellen sind benannt.
5. Ein Test belegt den Ausgangsfehler, oder die Testlücke ist ausdrücklich benannt.

## Definition of Done

1. Gate ausgeführt und grün.
2. Jede Statusaussage in `stand.md` hat Code-/Testbeleg.
3. Risiko und offene Liste aktualisiert.
4. Neue Messzahlen nur in `docs/current/qualitaet.md`.
5. Es wird nichts committet, was nicht zum Schritt gehört.

## Arbeitsstand dieses Dokuments

| Datum | Änderung |
|---|---|
| 29.09.2026 | P0-1-Folge-Diff in `2a0afde`/`aad9550` gesichert. P3-2 begann mit einer reinen Store-Mapper-Auslagerung; Typprüfung, Lint, Volltest und Coverage bestanden. P3-2 bleibt offen, bis auch die weiteren Module zerlegt sind. |
| 28.09.2026 | Folge-Diff fachlich geprüft und alle P0-Gates grün ausgeführt. A11y-Browser-Test gegen Debounce/Ladeablauf synchronisiert; vollständiges `pnpm verify`, Visual, Parity, Import, Coverage, PostgreSQL und `quality:check` bestanden. PostgreSQL lief isoliert lokal gegen 18.6, ohne den bestehenden Dienst anzutasten. `data/` und leeres `full.log` als lokale Laufzeit-/Testausgaben klassifiziert und ignoriert. Folge-Diff ist noch zu sichern; P3-2 startet erst nach sauberem Status. |
