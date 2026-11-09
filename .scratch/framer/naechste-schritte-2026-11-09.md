# Senify: Nächste Schritte nach der Chocolate-Abnahme

**Stand:** 09.11.2026 · **Zweck:** Ausführbarer Arbeitsvorschlag für die Weiterentwicklung von Framer-Import und Editor. Er ergänzt `docs/fahrplan.md` und `docs/framer-roadmap.md`; maßgeblich für Ist-Stand, Entscheidungen, Prioritäten und Testzahlen bleiben `docs/current/stand.md`, `docs/adr/`, `docs/fahrplan.md` und `docs/current/qualitaet.md`. Änderungen an verbindlichen Entscheidungen benötigen den dort vorgesehenen Prozess.

## 1. Was wir aktuell wissen

- Die Integrationsarbeit ist auf Branch `integration/c-auf-g-2026-11-08` zusammengeführt. Die Integrations-Gates sind für den dokumentierten Stand gelaufen; ihre genauen Ergebnisse und Grenzen stehen in `docs/current/qualitaet.md`.
- Die neue Chocolate-Abnahme wurde auf `90fddba` mit einer isolierten Engine und pg-mem durchgeführt. Der Unframer-Snapshot wurde gelesen und vorbereitet, aber im Vergleichslauf **nicht** als Projektquelle in Senify geschrieben. Der Engine-Lauf verwendete die veröffentlichten URLs der Startseite und von `/about` mit Browser-Capture im Fidelity-Modus.
- Beide Seiten wurden importiert und gemeinsam gebaut. Beide Ausgaben binden eine seitenweite Framer-Runtime-Payload ein. Der Bericht der Startseite meldete für die ausgegebene Seite `editableShare` 0 % editierbar. Der Editorbaum existiert, ist jedoch nicht die ausgegebene Seite, solange der Seiten-Payload sie ersetzt. Das ist keine Aussage über jeden anderen Importweg.
- Der Export umfasst die Startseite und weitere flach abgelegte HTML-Dateien. Die Vorbereitung ordnete die Unterseiten nicht als reguläre statische Seiten zu. Ihre Dateien sind vorhanden; eine vollständige Verarbeitung aller Routen und CMS-Inhalte ist damit noch nicht belegt.
- Awwwards MCP lieferte Struktur- und Motion-Vergleiche für die beiden Desktop-Seiten. Seine positiven Bewertungen entstanden trotz Framer-Runtime. Sie sind weder Pixelgenauigkeit noch ein Beweis für Runtime-Freiheit, Editierbarkeit oder vollständige Interaktionen.
- Einzelheiten, Messbedingungen und Artefakte: `.scratch/framer/acceptance-chocolate-2026-11-09.md`. Frühere Abnahmen gelten nur für ihre jeweiligen Stände.

## 2. Ziel und Abgrenzung

Senify soll für einen definierten Projektumfang aus Framer-URL und passendem Projektzugang eine lokal lauffähige Site erzeugen, deren Inhalte und Verhalten strukturiert bearbeitbar sind. Ein erfolgreiches Ergebnis muss auch ohne Framer-Site, Framer-CDN und eingebettete Framer-Site-Runtime funktionieren. Eigene lokale Runtime oder freigegebene Bibliotheken können zulässig sein. Untersuchte Seiten, Gerätebreiten und Zustände müssen benannt werden; unbekannte Fälle sind sichtbar als ungeprüft oder teilweise auszuweisen.

Der existierende Original-Code-/Payload-Pfad ist ein belegter bestehender Vertrag. Er kann als gesondert gekennzeichnete Ausgabe nützlich sein. Er erfüllt jedoch das Ziel einer vollständig strukturierten und runtimefreien Ausgabe nicht. Vor einer Änderung des Standards, vorhandener Projekte oder von ADRs muss die gewünschte Kompatibilität fachlich entschieden und dokumentiert werden. Frühere Aussagen in `docs/fahrplan-framer-1zu1.md` zu einem anderen Zielbild sind in diesem Zusammenhang historischer Planungsstand, keine stillschweigende Aufhebung des heutigen Dokumentationsvertrags.

## 3. Vor jedem Umsetzungspaket

1. `git status`, Branch, letzte Commits und konkurrierende Bearbeitung prüfen. Bei Erstellung dieses Plans liegen bereits Dokumentationsänderungen und unversionierte Abnahme-/Installationsartefakte im Arbeitsbaum. Erst fachlich zuordnen und sicher aufbewahren; keinen Inhalt pauschal löschen oder zurücksetzen. Die saubere Ausgangsbasis für neue Schritte nach `docs/fahrplan.md` herstellen.
2. Projektzugang und Quellen nur temporär verwenden. Keine Zugangsdaten in Dokumente, Kommandoausgaben, Fixtures, Git oder Screenshots schreiben. Die vorhandenen lokalen Snapshot-, Mirror- und Build-Artefakte können Projektinhalte enthalten und sind nicht automatisch für einen Commit geeignet.
3. Für die jeweilige Scheibe Schnittstellen, betroffene Dateien, reproduzierbaren Ausgangsfehler oder ausdrücklich benannte Testlücke sowie Gate festlegen. Erst nach ausgeführtem Gate dokumentieren und den passenden Schritt sichern.
4. Große Datenbank- und Browser-Gates risikobezogen auf einem unveränderten, bekannten Stand ausführen; vorhandene bestandene Läufe nicht ohne neue Änderung oder Zweifel pauschal wiederholen. Nur isolierte Testdatenbanken verwenden.

## 4. Reihenfolge der Arbeiten

### Paket 1 – Belegbare Ausgangsbasis herstellen

**Ziel:** Den tatsächlichen Unterschied zwischen bearbeitetem Editorbaum und gebauter Ausgabe reproduzierbar sichtbar machen.

**Arbeiten:**

- Chocolate-Startseite und `/about` erneut mit festgehaltenen Quell-, Build- und Werkzeugversionen aufnehmen. Viewport, Browser, Farbschema, Schriftverfügbarkeit, Scrollposition und Animationszustand dokumentieren. Eine kleine kontrollierte Fixture ergänzt die echte Site, damit die Prüfung auch ohne Zugang wiederholbar ist.
- Für beide Seiten getrennt erfassen: verwendeter Importpfad, Payload-Typ, Bearbeitbarkeitsmeldung, ausgegebene Assets, ausgeführte Skripte und Netzwerkanfragen. Quell-Snapshot und Mirror bleiben Eingaben, kein Nachweis einer runtimefreien Ausgabe.
- Mindestens einen Text im Editorbaum ändern, speichern und neu bauen; prüfen, ob diese Änderung tatsächlich in der ausgelieferten Seite erscheint. Für den aktuellen Payload-Modus das vorhandene Verhalten als Ausgangslage festhalten; keinen Erfolg der strukturierten Bearbeitung annehmen.
- Die vorhandenen lokalen Artefakte auf Vollständigkeit und Wiederverwendbarkeit prüfen, sensible Inhalte getrennt von versionierbaren kleinen Fixtures halten. Zugang kann ablaufen; ein nicht verfügbarer Zugang ist ein Blocker der Echtabnahme, kein erfolgreicher Test.

**Gate:** Wiederholbarer Vorher-/Nachher-Beleg für eine konkrete Änderung und getrennte Kennzeichnung des tatsächlich ausgelieferten Seiteninhalts. Ergebnis nennt Importmodus, Projektstand und ungeprüfte Fälle. Referenz: `packages/framer-import/src/import.ts`, `packages/renderer/src/`, `.scratch/framer/acceptance-chocolate-2026-11-09.md`.

### Paket 2 – Ausgabearten und Kompatibilität entscheiden

**Ziel:** Für Nutzer und API eindeutig machen, welche Ausgabe gewählt wurde und was sie leisten kann.

**Arbeiten:**

- Den bestehenden Payload-Vertrag und ADR-0010 prüfen. Eine additive Ausgabeart für strukturierte, runtimefreie Konvertierung entwerfen; Namen, Standardverhalten und Migration sind noch zu entscheiden. Original-Code-Ausgabe nur mit ausdrücklicher Kennzeichnung ihrer Einschränkungen betrachten.
- Vertrag für Import, Vorschau, Bericht und Build festlegen: gewählter Modus, Payload-Herkunft, sichtbare Bearbeitbarkeit, erkannte bzw. nicht geprüfte Abhängigkeiten und Gründe für Blocker. CLI, MCP und Oberfläche sollen denselben Zustand darstellen.
- Vorhandene Projekte, Reimport, Rollback und alte Antworten rückwärtskompatibel behandeln. Eine Modusänderung darf keine gespeicherten Seiten still umwandeln. Falls bestehende ADRs betroffen sind, neue Entscheidung bzw. Nachtrag vor Implementierung dokumentieren.
- Sonderkomponenten und nicht unterstützte Funktionen als konkrete Teil-Ergebnisse oder Blocker melden. Kein undurchsichtiges Original-Bundle als strukturierte Bearbeitung ausgeben.

**Gate:** Vertrags- und Migrationstests für beide Ausgabearten, alte Projekte und widersprüchliche Zustände; im UI und in MCP nachvollziehbarer Status. Ein absichtlich vorhandener Framer-Payload verhindert die Einstufung als runtimefrei.

### Paket 3 – Erste runtimefreie, bearbeitbare Seite

**Ziel:** Eine kleine echte Seite oder ein eindeutig abgegrenzter Seitenabschnitt wird aus Senify-Daten gerendert und bleibt nach einer Bearbeitung sichtbar geändert.

**Arbeiten:**

- Zunächst `/about` als Kandidat prüfen; falls die Seite für eine kleine Scheibe ungeeignet ist, eine nachweisbar einfachere Route oder Fixture wählen. Den relevanten Capture-/Mapper-/Rendererpfad für URL und Mirror getrennt analysieren.
- Strukturierten Ausgabepfad implementieren, ohne im Zielmodus einen seitenweiten Framer-Runtime-Träger einzuschleusen. Bestehende Payload-Ausgabe unverändert abdecken, bis eine Entscheidung etwas anderes festlegt.
- Text, ein Bild oder Asset, einen Link und mindestens eine Layout-/Responsive-Eigenschaft über den Editor ändern; speichern, Seite neu laden, erneut bauen und ausgelieferte Werte im Browser prüfen. Undo/Redo für die konkret getestete Änderung aufnehmen.
- Unbekannte oder nicht übersetzte Komponenten, fehlende Assets, nicht unterstützte Selektoren und Motion im Bericht benennen; Fehlendes darf kein vollständiges Ergebnis ergeben.

**Gate:** Engine-/Mapper-/Renderer- und echter Browserablauf Import → Bearbeiten → Speichern → Reload → Build mit sichtbarer Änderung; Test auf unveränderte Payload-Ausgabe und alte Projekte. Für alle noch nicht geprüften Teile bleibt der Status teilweise.

### Paket 4 – Runtime-Freiheit und Offenlegung prüfen

**Ziel:** Eine reproduzierbare Prüfung verhindert falsche Erfolgsmeldungen.

**Arbeiten:**

- Eine Herkunfts-/Abhängigkeitsprüfung für Bundles, Payloads, statische und dynamische Imports, Skripte, CSS, Assets und Workers konzipieren. Sie muss auch lokal gebündelte Framer-Site-Runtime berücksichtigen, nicht bloß entfernte Framer-Domains zählen.
- Browserlauf mit blockierten Framer-Diensten und protokollierten Anforderungen ergänzen. Navigation und getestete Zustände müssen lokal funktionieren. Nachweise für unabhängige Ausführung, Netzverkehr und Herkunft jeweils getrennt ausweisen.
- Nicht erkannte oder nicht zuverlässig klassifizierbare Bundles als unbekannt behandeln. Erkennung anhand von Namen oder Signaturen allein ist nicht vollständig; negative und verschleierte Gegenbeispiele sowie Fehlalarme gezielt prüfen.
- Status `bestanden`, `teilweise`, `blockiert` und `unbekannt` pro Route und geprüftem Zustand definieren. Ein bewusst eingeschleuster Framer-Runtime-Payload muss den runtimefreien Erfolg verhindern.

**Gate:** Positive und negative Fixtures, echte Browserausführung und geprüftes Ergebnis auf beiden Chocolate-Seiten. Keine pauschale Garantie für unbekannten Fremdcode oder ungeprüfte Zustände.

### Paket 5 – Mehrseiten, Reimport und CMS

**Ziel:** Eine zusammengehörige Site statt isolierter Einzelimporte verarbeiten.

**Arbeiten:**

- Seiteninventar aus Snapshot, Mirror, Sitemap und internen Links nachvollziehbar zusammenführen. Bei flachen Exportdateien bestehende Erkennungs- und Browser-Fallback-Pfade im Mehrseitenkoordinator prüfen; berichtete fehlende statische Seiten von tatsächlich fehlenden Routen unterscheiden.
- Startseite, `/about`, Blog-Index, mindestens einen Blog-Detailpfad und `/404` in einem isolierten Projekt importieren. Navigationslinks, Assets, Fonts, Slugs und Fehlerrouten im gebauten Ergebnis prüfen.
- Den bereitgestellten Unframer-Snapshot separat als Projektquelle durch den vorgesehenen Pfad prüfen: Seitendaten, Komponenten und CMS-Schema/Einträge samt Referenzen. Lizenz- und Nutzungsgrenzen in ADR-0028 beachten; nicht annehmen, dass Snapshot-Vorbereitung bereits CMS-Import bedeutet.
- Reimport für zwei Seiten mit gleichen Token-Namen und verschiedenen Werten sowie Altseiten testen: eine Seite erneut importieren, die andere und dortige lokale Änderungen vergleichen. Änderungen niemals still überschreiben; Konflikte und den tatsächlichen Schutzumfang ausweisen.
- Unterbrechung und Wiederaufnahme sowie `createOnly`, vorhandenes Ziel und parallele Schreibvorgänge prüfen. Für Transaktions- und Konkurrenzbehauptungen echtes isoliertes PostgreSQL zusätzlich zu speicherbasierten Tests verwenden.

**Gate:** Inventar gegen erzeugte Routen und CMS-Einträge abgleichen, kritische Links im Build ausführen, Reimport-/Bestandsschutz und PostgreSQL-Konkurrenz belegen. Nicht vorhandene Quellen oder nicht erfasste Daten bleiben sichtbar offen.

### Paket 6 – Darstellung, Geräte und Motion verbessern

**Ziel:** Die runtimefreie Ausgabe anhand gemessener Abweichungen schrittweise näher an die Quelle bringen.

**Arbeiten:**

- Desktop, Tablet, Mobil und eine Zwischenbreite auf Original und Build mit gleicher Umgebung und gleichem Zustand vergleichen. Fehlende Elemente, Assets, Fonts, Höhe, Position und Bilder getrennt erfassen; referenzierte ältere Pixelwerte nicht als aktuelle Messung verwenden.
- Aus dem neuen Vergleich konkrete Fehler priorisieren. Als bekannte Kandidaten gelten dekorative Pseudo-Elemente, Hintergrundbilder, Font-Metriken, SVG-Bearbeitbarkeit und Farbschema; zuerst am neuen Stand reproduzieren.
- Appear-, Hover- und Scroll-Verhalten in Start-, Zwischen- und Endzuständen mit Zeit/Scrollposition vergleichen. Reduced Motion und wiederholtes Auslösen prüfen. Motion-Erweiterungen nur nach der in der Roadmap geforderten Entscheidung zu ADR-0006, Guardrails und Migration implementieren.
- Jede Korrektur mit einem minimalen Regressionstest und einer erneuten Messung der betroffenen Route verbinden. Eine visuelle Annäherung ohne editierbare Parameter nicht als vollständig bearbeitbar deklarieren.

**Gate:** Versionierte Vergleichsbedingungen und dokumentierte Schwellen; wichtige fehlende Elemente und Funktionen blockieren unabhängig von einem Gesamtdurchschnitt. Responsive- und Motion-Abnahme nennt stets die tatsächlich getesteten Fälle.

### Paket 7 – Awwwards sinnvoll einbinden

**Ziel:** Zusätzliche Diagnosen nutzbar machen, ohne die Freigabe davon abhängig zu machen.

**Arbeiten:**

- Awwwards auf die runtimefreie Ausgabe erneut anwenden: Struktur, erfasste Motion, Hover-Stichproben und Desktop/Mobil als ergänzende Belege neben Screenshots und Senifys eigenen Prüfungen.
- Bei unbenannten Bereichen, Zuordnung über Hintergrundfarben, abgeschnittenen Resultaten und nur nach Vorhandensein geprüften Hover-Stichproben die Aussagekraft ausdrücklich begrenzen. Gemeldeten Overflow gegen Clipping und den sichtbaren Bereich verifizieren.
- A/B-Gegenproben: sichtbaren Abschnitt verändern, Bewegung entfernen, absichtlich Framer-Runtime einschleusen und Editierbarkeit zerstören. Festhalten, welche Änderungen Awwwards erkennt und welche Senifys eigene Gates erkennen müssen.
- Keine generelle Installationspflicht oder produktive Integration voraussetzen. Erst nach Praxisvergleich Nutzen, Laufzeit, lokale Abhängigkeiten und Reproduzierbarkeit bewerten. Keine vertraulichen Projektzugänge an das Tool übergeben.

**Gate:** Dokumentierter Vergleich mit mindestens einer gezielt verschlechterten Ausgabe; Gesamtergebnis unterscheidet Awwwards-Score, visuelle Evidenz, Runtime-Freiheit und Editierbarkeit.

### Paket 8 – Editor-Parität und Abschluss

**Ziel:** Die im importierten Projekt benötigten Editorabläufe und den Elementor-Vergleich belegen.

**Arbeiten:**

- Zuerst die für die Abnahme benötigten Abläufe absichern: Text/Medien, responsive Werte, Klassen und Variablen, Navigation, History und Konfliktmeldungen. Für neue Variablenfamilien Rename/Delete/Undo/Reload sowie Auswirkung auf den Build prüfen, soweit noch nicht durch Tests belegt.
- Danach Elementor-Referenzinventar und Senify-Oberfläche kontrolliert vergleichen: Elementkatalog, Inspector, Struktur, Zustände, Tastaturbedienung und Accessibility. Core, installierte Erweiterungen und offizielles Pro getrennt bewerten; das vorhandene Referenzsystem belegt kein offizielles Pro.
- Gemeinsame History als schrittweise Navigation dokumentieren; bei Abbruch oder Konflikt müssen Cursor, bestätigter Serverstand und lokale Eingaben konsistent bleiben. Vollständige atomare Gesamtsprünge nicht behaupten.
- Abschluss: Risiko-/Statusdokumente anhand tatsächlicher Belege aktualisieren; Dokumentationsdrift bereinigen. Eine Gesamtfreigabe erfordert alle vereinbarten fachlichen und technischen Gates auf dem tatsächlich getesteten Stand.

## 5. Konkreter nächster Arbeitsauftrag

1. Bestehende uncommittete Änderungen und unversionierte Artefakte inventarisieren und bewahren; saubere Definition of Ready nach Fahrplan herstellen.
2. Paket 1 mit einer kleinen reproduzierbaren Fixture und einer echten Chocolate-Seite durchführen: Editoränderung → Speichern → Build → sichtbare Gegenprobe. Das bestehende Payload-Verhalten als Ausgangsfall belegen.
3. Daraus die Entscheidungsvorlage für Paket 2 erstellen: getrennte Ausgabearten, Kompatibilität, Kennzeichnung und offene Architekturentscheidungen. Erst danach den ersten strukturierten Zielpfad aus Paket 3 umsetzen.
4. Nach der ersten erfolgreichen Scheibe Runtime-Prüfung, Mehrseiten-/CMS-Abnahme und visuelle Verbesserung in der obigen Reihenfolge vertiefen. Awwwards begleitet den Vergleich als Hilfsmittel.

**Definition des Gesamtabschlusses:** Für den vereinbarten Benchmark sind inventarisierte Routen, CMS, Assets, Bearbeitung, Reimport und gewählte Interaktionen geprüft; das Ergebnis läuft nachweisbar ohne Framer-Site-Runtime und ohne Framer-Dienste, und unbekannte Bereiche sind ausgewiesen. Ein einzelner grüner Test, ein hoher Awwwards-Score oder ein originalgetreuer Payload-Build genügt dafür nicht.
