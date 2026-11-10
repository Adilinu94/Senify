# Drittanbieter-Embeds werden still entfernt

Status: needs-triage
Label: needs-triage

## Befund

Die Quelle `/contact` enthält genau ein iframe mit einem Calendly-Inline-Widget im `srcdoc`. Der Relay-Build enthält 0 iframes und 0 Calendly-Verweise. Der Importbericht nennt dafür keinen eigenen Befund. Die rechte Spalte bleibt im Build leer, der erste Bildschirm weicht auf Desktop um 3.520 Prozent ab; die linke Spalte stimmt.

## Nächster Schritt

1. Die Iframe-Stelle im Capture und Mapper lokalisieren. Wird das Element verworfen, gefaltet oder als leerer Rahmen gemappt?
2. Eine Produktentscheidung treffen: sandboxed iframe erhalten, durch einen sicheren Link oder Platzhalter ersetzen, oder bewusst verwerfen und melden.
3. Kein stiller Drop: mindestens ein Befund mit Quelle, Ziel und Grund.

## Abnahme

Ein kontrolliertes iframe erzeugt entweder eine sichtbare, sichere Einbettung oder einen erklärten Befund und Platzhalter. Ein Test deckt den Fall ab; der Relay-Vergleich zeigt keine leere rechte Spalte mehr oder benennt sie ausdrücklich.
