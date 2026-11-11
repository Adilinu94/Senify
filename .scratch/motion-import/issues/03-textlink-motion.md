# Motion und Inline-Auszeichnung auf Textlinks

Status: resolved
Label: resolved

## Befund

Ein Textlink wird als `link`-Primitiv mit `label` abgebildet; seine Kinder werden nicht gemappt. Dadurch gingen Inline-Auszeichnung, Wort-Einblendungen und ein Motion-Sample auf dem Link-Kind verloren. Bei Mischtext war der Verlust still: `<a>Hallo <strong>x</strong> Welt</a>` ergab `label = "x"`.

## Ergebnis 10.11.2026

- Der Volltext kommt aus `innerHtml`; `<a>Hallo <strong>Welt</strong> fertig</a>` ergibt `label = "Hallo Welt fertig"`.
- Das Link-Primitiv hat ein sicheres `html`-Feld. Katalog, Markup und Sanitizer rendern die Inline-Auszeichnung im gebackenen HTML.
- Motion-Samples auf gefalteten Link-Kindern werden über `nearestMappedNodeByIrKey` dem Link-Knoten zugeordnet. Die IR-ID-Zuordnung bleibt unverändert.
- Tests: zwei Mapper-Fälle (Mischtext, einfacher Link), ein Bake-Test mit `<strong>Welt</strong>` im HTML, ein Markup-Test für die Sanitisierung und ein Owner-Test für gefaltete Kinder. Vollständige Suiten: 572 Framer-Import-Tests (2 übersprungen), 456 Widget-Engine-Tests; Fixture-Ratchet grün.

Belege: `packages/framer-import/src/mapper.ts`, `import.ts`, `motion-owner.ts`, `packages/widget-engine/src/catalog.ts`, `markup.ts`, `packages/framer-import/test/mapper.test.ts`, `textlink-content.test.ts`, `motion-owner.test.ts`, `packages/widget-engine/test/prop-boundary.test.ts`.

## Live-Sample 11.11.2026

Gemessen am gebackenen Relay6-Build, Desktop 1440 px, Link `fi-8a5eda-756` (Blog-Karte mit gemessener Einblendung). Der Link trägt die eigene Animation `senify-appear-derived-931-default`; ihre Deckkraft steigt über 50 / 250 / 600 / 1000 / 1600 ms von 0,071 auf 0,773 auf 1,0 und bleibt bei 1,0. Nach dem Scrollen in den Sichtbereich ist der Link sichtbar, die Animation steht auf `currentTime = 600` (Ende), und 13 Kinder haben eine sichtbare Box.

Beleg: `.scratch/framer-live-2026-11-09/visual-settle2-2026-11-10/result.json` (`linkSample.desktop`), Bild `start/desktop/link-sample.png`.

## Editor-Abnahme 11.11.2026

`packages/app/test/framer-import-browser.test.ts` importiert `<a href="/ziel">Hallo <strong>Welt</strong> fertig</a>` über den Mirror-Pfad, schließt den Importdialog und klickt den Link im Canvas. Der Inspector zeigt das Feld `label` mit „Hallo Welt fertig“ und das Feld `html` mit `<strong>Welt</strong>`; die Datei ist 4/4 grün (der neue Fall und die drei bestehenden).

## Rest

Ein Hover-Sample ist nicht möglich: der Build enthält keine `:hover`-Regel, und der Import übernimmt keine Hover-Interaktionen. Ein Link ohne Motion bleibt unverändert.
