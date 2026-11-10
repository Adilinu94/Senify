# Eigene Skripte bleiben im Struktur-Build

Status: needs-triage
Label: needs-triage

## Befund

Der Relay-Build `/` enthält ein Inline-Ladeskript, `assets/page.js` (15.298 Bytes) und `assets/vendor/lenis.min.js` (18.722 Bytes). Die Laufzeitprüfung bleibt deshalb bei `unknown`; es gibt keine Framer-Anfragen und keine Framer-Globals. `/contact` enthält keine Skripte und wird widerlegt. Die Strukturausgabe ist damit nicht in jedem Fall frei von ausführbarem Code.

## Nächster Schritt

1. Die Skripte klassifizieren: eigener Seitencode, Drittanbieter (Lenis) oder Framer-Runtime.
2. Entscheiden, ob die Strukturausgabe eigenen Code behalten soll, weil er Scroll- und Motion-Effekte trägt, oder ob er entfernt und als Befund gemeldet wird.
3. Die Laufzeitprüfung um den Fall „eigener Code lädt weiteren Code dynamisch" ergänzen, damit `unknown` erklärt ist.

## Abnahme

Der Bericht nennt jede verbleibende Skriptquelle und ihren Grund. Die Laufzeitprüfung unterscheidet Framer-Runtime, eigenen Code und Drittanbieter. Ein Test deckt den dynamischen Lader ab.
