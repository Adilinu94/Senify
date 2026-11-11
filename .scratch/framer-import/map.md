# Framer-Import: zweite Quelle und offene Muster

Kontext: Generalisierungstest an der zweiten Framer-Seite Relay am 10.11.2026. Der Import von `/` und `/contact` funktioniert; die Appear-Fixes greifen auch dort. Die folgenden Muster sind nicht Astra-spezifisch und nach der Häufigkeit geordnet.

## Issues

- [Drittanbieter-Embeds werden still entfernt](./issues/01-drittanbieter-embeds.md), resolved 10.11.2026; `srcdoc` bleibt ein benannter Platzhalter.
- [Eigene Skripte bleiben im Struktur-Build](./issues/02-eigene-skripte.md), resolved 10.11.2026; senifys eigener Lader ist jetzt neutral, fremde Hosts bleiben Prüfauftrag.
- [Data-URL-Grafiken als lokales Asset übernehmen](./issues/03-data-url-grafiken.md), resolved 10.11.2026; Badge-Pixelabnahme offen.
- [Responsive Bildgroessen und Sichtbarkeit](./issues/07-responsive-bildgroessen.md), resolved 11.11.2026; die Signatur paarte klassenlose Divs ueber die Dokumentreihenfolge (Portraet 190 x 70 statt 728 x 579). Mit dem naechsten klassierten Vorfahren als Kontext stimmen Portraet und Logokarte bei 1440/768/390; der Tablet-Abschnitt faellt von 25,109 auf 1,350 %.

## Belege

- `.scratch/framer-live-2026-11-09/structure-relay5-2026-11-10/result.json`
- `.scratch/framer-live-2026-11-09/structure-relay4-2026-11-10/result.json`
- `.scratch/framer-live-2026-11-09/structure-relay-2026-11-10/result.json`
- `.scratch/framer-live-2026-11-09/visual-relay-2026-11-10/result.json`
- `.scratch/motion-import/issues/02-verwaiste-appear-ids.md`
