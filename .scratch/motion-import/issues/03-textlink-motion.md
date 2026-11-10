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

## Rest

Ein Live-Hover- oder Scroll-Sample auf einem Link ist nicht gemessen. Der Editor zeigt Beschriftung und Inhalt nebeneinander; diese Oberfläche ist nicht visuell abgenommen. Ein Link ohne Motion bleibt unverändert.
