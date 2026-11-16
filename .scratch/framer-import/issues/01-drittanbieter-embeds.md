# Drittanbieter-Embeds werden still entfernt

Status: resolved 10.11.2026
Label: ready-for-agent

## Befund

Die Quelle `/contact` enthält genau ein iframe mit einem Calendly-Inline-Widget im `srcdoc`. Der Relay-Build enthielt 0 iframes und 0 Calendly-Verweise. Der Importbericht nannte dafür keinen eigenen Befund. Die rechte Spalte blieb im Build leer, der erste Bildschirm wich auf Desktop um 3.520 Prozent ab; die linke Spalte stimmte.

**Ursache (am Code reproduziert):** `kindFor` in `capture-html.ts` kannte `<iframe>` nicht und fiel auf `frame` zurück. Das Element blieb als leerer Rahmen stehen; `src`, `title` und `srcdoc` wurden nie gelesen, und es gab keinen Befund. Das `embed`-Primitive existierte bereits, wurde aber vom HTML-Capture nie erzeugt.

## Umsetzung

- `<iframe>` wird jetzt IR-Kind `embed`. Der Capture liest `src` und `title` (`embedFieldsOf`).
- Nur ein **https**-Ziel wird übernommen; der Mapper schreibt `url` und `title` in das `embed`-Primitive. Im Bake rendert die Registry-Sektion `embed` mit Consent-Gate: ohne Zustimmung ein Platzhalter mit Link, nie ein fremder Abruf.
- `srcdoc`, ein fremdes Schema und eine fehlende Adresse ergeben den Befund `embed-blocked` (warn) mit Quelle und Grund. Der Knoten bleibt als sichtbarer Platzhalter stehen.
- Kein stiller Drop mehr.

## Abnahme

- `packages/framer-import/test/embed.test.ts` (5 Fälle): https-Frame mit Adresse und Titel, `srcdoc`-Befund, http-Befund, fehlende Adresse, gewöhnlicher Frame ohne Befund. Gegenprobe: ohne `return "embed"` sind 4 von 5 rot.
- Relay4-Lauf (`structure-relay4-2026-11-10`, 10.11.2026, `https://gracious-balance-599544.framer.app`): `/contact` meldet genau 1 `embed-blocked`; der Build enthält 0 iframes und die Meldung „Embed blockiert“ an der Stelle.
- Framer-Import-Suite 577 bestanden, 2 übersprungen; Typecheck und ESLint grün.

## Grenze

Der Calendly-Rahmen selbst wird nicht geladen, weil sein Inhalt in `srcdoc` steht (ein eigenes Dokument). Die Stelle ist jetzt benannt und sichtbar; ein echter Embed braucht ein https-Ziel oder eine manuelle Ersetzung im Editor.