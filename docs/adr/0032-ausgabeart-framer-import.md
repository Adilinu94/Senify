# ADR-0032: Ausgabeart beim Framer-Import

Status: angenommen · 09.11.2026
Bezug: ADR-0010, ADR-0026, `.scratch/framer/paket2-entscheidungsvorlage-2026-11-09.md`

## Kontext

Ein Seiten-Payload kann die Framer-Runtime und das Original-Markup enthalten. Ist er aktiv, zeigt der Release den Payload anstelle des Editorbaums. Der Baum kann bearbeitet werden, aber seine Änderungen sind in dieser Ausgabe nicht automatisch sichtbar. `mode: dna | fidelity` beschreibt bisher die Normalisierung und wählt keine Ausgabequelle. Die Chocolate-Abnahme vom 09.11. belegt den Unterschied für den Browser-URL-Import; der bestehende Schalter `active` ist in ADR-0026 beschrieben.

Das Produktziel der Framer-Roadmap umfasst eine eigenständig lauffähige und strukturiert bearbeitbare Ausgabe ohne Framer-Site-Runtime. Ein lokal gebündelter Framer-Payload erfüllt diese Definition nicht. Gleichzeitig müssen bestehende Payload-Projekte und deren bisherige Ausgabe erhalten bleiben.

## Entscheidung

1. **Zwei getrennte Begriffe.** Die Ausgabeart wird unabhängig vom Normalisierungsmodus modelliert. Vorgesehen ist ein eigenes Importfeld `output` mit den Werten `original` und `structure`. `mode` behält seine bisherige Bedeutung. Die endgültige Persistenz und die genaue Ausgestaltung von Wiederholungen sind Teil der Implementierung; diese ADR behauptet keine vorhandene API.
2. **Original-Ausgabe.** `original` erhält das bisherige Verhalten mit Seiten-Payload, soweit einer erfolgreich erzeugt wird. Bericht und Oberfläche müssen deutlich machen, welche Ausgabe tatsächlich geliefert wird und welche Bearbeitbarkeit dort gegeben ist. Ein importierter Framer-Runtime-Payload gilt nicht als runtimefrei, auch wenn er lokal bereitgestellt wird.
3. **Struktur-Ausgabe.** `structure` liefert den strukturierten Senify-Baum aus und darf keinen aktiven seitenweiten Framer-Runtime-Träger für die Ausgabe verwenden. Nicht übersetzte Funktionen und unklare Herkunft einzelner Abhängigkeiten werden benannt; die Auswahl der Ausgabeart allein ist kein Runtime-Freiheits- oder Vollständigkeitsnachweis. Auch Teil-Payloads und Fremdcode müssen gesondert beurteilt werden.
4. **Kompatibilität.** Für neue Aufträge ohne Ausgabeangabe bleibt das bisherige Original-Verhalten der Standard. Bestehende Seiten werden durch ein Upgrade oder einen alten Client nicht still umgeschaltet. Ein Reimport darf eine gespeicherte Struktur-Ausgabe nicht durch einen fehlenden Parameter unbemerkt auf Original ändern; bis die gespeicherte Ausgabeart eindeutig erhalten werden kann, muss der Reimport einen verständlichen Konflikt ausgeben statt zu raten. Alte Seiten ohne Metadaten bleiben bei ihrem tatsächlichen bestehenden Verhalten; ein fehlendes Feld allein belegt keine Runtime-Freiheit.
5. **Expliziter Wechsel.** Änderungen der Ausgabeart müssen ausdrücklich gewählt, auf die betroffene Seite begrenzt, versionsgeprüft und nachvollziehbar sein. Rücknahme oder Restore muss die vorherige ausgegebene Seite wiederherstellen. Das Zusammenspiel mit `active` aus ADR-0026 darf keinen widersprüchlichen Bericht und keinen unbemerkten Ausgabewechsel erzeugen.
6. **Durchgängiger Vertrag.** Engine, Importbericht, CLI, MCP, Oberfläche und Build-Auskunft müssen den gewählten und den tatsächlich ausgegebenen Zustand konsistent darstellen. Nicht unterstützte Funktionen, fehlende Assets und ungeprüfte Zustände erscheinen als Teil-Ergebnis oder Blocker. Ein als `structure` angeforderter, aber tatsächlich als Original-Payload ausgegebener Build darf nicht als erfolgreicher Strukturimport ausgegeben werden.
7. **Prüfung vor Freigabe.** Runtime-Freiheit wird separat anhand Herkunft, Build und ausgeführter Seite geprüft; unbekannte Abhängigkeiten bleiben unbekannt. Ein hoher visueller oder Motion-Score ersetzt weder diese Prüfung noch den Nachweis, dass Bearbeitung, Speichern und erneuter Build sichtbar wirken.

## Verhältnis zu bestehenden Entscheidungen

ADR-0010 bleibt für Payload-Islands und ihre Kennzeichnung gültig. ADR-0026 beschreibt weiterhin `active` und das bisherige Standardverhalten. Die vorliegende Entscheidung ergänzt diese Verträge um eine ausdrücklich gewählte Ausgabeart; sie ändert bestehende Projekte nicht nachträglich. Ein späterer Implementierungsschritt dokumentiert die konkrete Speicherung und die sichere Zuordnung von Ausgabeart und Trägerzustand.

## Anforderungen an die Umsetzung

- Tests für fehlendes, gültiges und ungültiges `output`; Dry Run und Write müssen dieselbe gewählte Ausgabe behandeln. Idempotenz und Prüfwerte dürfen Aufträge verschiedener Ausgabearten nicht verwechseln.
- Bestehende Seiten, alte Clients, explizite Wechsel, Restore, konkurrierende Schreibvorgänge und Reimport einer bereits strukturierten Seite prüfen. Keine nicht bestätigten Nutzeränderungen überschreiben.
- Im Strukturpfad Import → Bearbeiten → Speichern → Reload → Build im Browser belegen; den bisherigen Payload-Pfad mit gesonderter Regression erhalten.
- Für den Runtime-Status positive, negative und unbekannte Fälle testen, einschließlich lokal gebündelter Framer-Runtime. Kein Prüfergebnis aus einer Zeichenkettensuche allein als vollständig ausgeben.
- Vertrag, Manifest und Bedienoberfläche gemeinsam aktualisieren. Nicht implementierte Zustände bleiben dokumentiert offen.

## Folgen

Der Originalpfad bleibt kompatibel; der Strukturpfad kann eigene Grenzen bei Darstellung und Motion haben. Der zusätzliche Zustand erfordert konsistente Speicherung, verständliche Kennzeichnung und Tests für Reimport und Restore. Die Wahl einer Struktur-Ausgabe begründet keine Behauptung vollständiger Parität.
