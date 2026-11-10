# Data-URL-Grafiken als lokales Asset übernehmen

Status: resolved 10.11.2026
Label: ready-for-agent

## Befund

Relay `/` meldet 48, `/contact` 16 Grafiken als Data-URL in einem Stilausdruck. Im Build fehlten dadurch sichtbare Flächen: Auf `/` wurde das Badge-Icon als schwarzer Fleck statt als Ring gezeichnet, auf `/contact` fehlten mehrere kleine Grafiken. Drei `css-value-dropped`-Warnungen betrafen `backgroundImage`.

**Ursache (am laufenden Import gemessen):** Der Weg Data-URL → lokales Asset war für Inline-Stile und Klassenregeln bereits vorhanden. Die zwei fehlenden Grafiken standen aber **nur** in den Tablet-/Telefon-Dokumenten. `mergeDeviceVariants` vereinigte Knoten, Zustände und Breakpoints, nicht aber `assets`; der Desktop-Lauf kannte die Adressen nicht. Die Werte blieben als Data-URL im Stil und wurden beim Backen verworfen.

## Umsetzung

- `mergeAssets` vereinigt die Assetlisten beider Geräte-Dokumente (URL-dedupliziert); dasselbe gilt für das SSR-Dokument nach `restoreIdLessDeviceVariants`. Ein Bild, das nur eine Breite nennt, erreicht jetzt die Asset-Pipeline.
- Der Befund heißt jetzt korrekt „werden als lokales Asset übernommen“ und ist `info` statt `warn`; ein echter Fehlschlag bleibt über Asset-Bericht und Bau-Warnung sichtbar.

## Abnahme

- `packages/framer-import/test/svg-assets.test.ts` (15 Fälle, ein neuer: Data-URL im eigenen `style`-Attribut wird hochgeladen, der Stil nennt die Asset-Adresse, kein Data-URL bleibt).
- `packages/framer-import/test/device-variants.test.ts` (neuer Fall: die Assetlisten beider Geräte-Dokumente werden vereinigt; ohne `mergeAssets` fehlt das zweite).
- Live-Gegenprobe am 10.11.2026 (`https://gracious-balance-599544.framer.app/`): vor dem Fix blieben 2 SVG-Data-URLs im Entwurf, der Build meldete 3 `css-value-dropped`. Nach dem Fix: Entwurf 0 Data-URLs, Build 0 `css-value-dropped`, `style-rules.css` nennt 67 lokale Grafiken (vorher 63), 0 Data-URLs im ausgelieferten CSS.
- Relay4-Lauf (`structure-relay4-2026-11-10`): 0 Bauwarnungen, 0 `data:image` in HTML und CSS.

## Grenze

Die Pixelabnahme des Badge-Rings im Browser steht aus; belegt ist der Asset-Weg und der verschwundene Bauverlust. Die Live-Quelle ist veränderlich, für Wiederholungen eine eingefrorene Kopie verwenden.