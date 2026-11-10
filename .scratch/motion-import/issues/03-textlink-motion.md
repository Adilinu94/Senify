# Motion und Inline-Auszeichnung auf Textlinks

Status: ready-for-agent
Label: ready-for-agent

## Befund

Ein Textlink wird als `link`-Primitiv mit `label` abgebildet; seine Kinder werden nicht gemappt (`packages/framer-import/src/mapper.ts`). Dadurch gehen Inline-Auszeichnung, Wort-Einblendungen und ein Motion-Sample auf dem Link-Kind verloren. Bei Mischtext ist der Verlust still: `<a>Hallo <strong>x</strong> Welt</a>` ergibt heute `label = "x"`. Der direkte Linktext ist durch `157acb7` gesichert, diese Fälle nicht.

## Nächster Schritt

1. Den Volltext des Links aus dem Inline-Markup ableiten, nicht nur den tiefsten Textknoten.
2. Inline-Markup über den bestehenden `html`-Weg erhalten; Katalog-Control und Validierung für `link` mitziehen.
3. Motion-Samples eines gefalteten Link-Kindes auf den Link-Knoten abbilden, ohne `nodeIdByIrKey` zu verfälschen.
4. Für den verbleibenden Verlust einen `info`-Befund erzeugen.

## Abnahme

Mischtext bleibt vollständig, Inline-Auszeichnung erscheint im Build, eine Einblendung auf dem Link spielt, und ein Link ohne Motion bleibt unverändert.
