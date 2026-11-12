# Icon-Farbe und Icon-Maske gehen beim Import verloren

Status: offen — Ursache belegt (12.11.2026), Korrektur nicht umgesetzt
Label: ready-for-agent (Scheibe 01a), needs-info (Scheibe 01b)
Type: task

## Befund

Die Check-/Feature-Icons der Chocolate-Quelle rendern im Original hellgrau
(computed `fill: rgb(156,156,156)`), im Build schwarz (`rgb(0,0,0)`). Betrifft
alle Seiten und Breiten; sichtbarer Anteil an den ersten Bildschirmen
(`/price` Desktop 5,636 %, Tablet/Mobil-Ausreißer auf `/`).

Zwei Mechanismen sind betroffen:

1. **Symbol-Icons (`<use>`):** Framer zeichnet Icons als
   `<svg><use href="#svg-…">`; die sichtbare Farbe erbt der Symbol-`<path>`
   aus dem `svg-templates`-Container.
2. **Masken-Icons:** Der Bake enthält `mask: var(--framer-icon-mask)` an
   24×24-Knoten (z. B. `fi-8a5eda-65`), aber die Variable ist im Build
   **nirgends definiert**: 0 Definitionen, 166 Verwendungen allein im
   `/price`-Build. Framer setzt sie zur Laufzeit inline.

## Ursache (belegt)

- Der Capture inline’t das Symbol (`withSymbols`,
  `packages/framer-import/src/capture-html.ts:929`, `symbolsOf` :909). Beim
  Inlinen geht die Fill-Vererbung aus dem `svg-templates`-Container verloren;
  der Build-Pfad hat weder fill-Attribut noch fill-Regel → Schwarz.
- Die computed `fill` wird nie erfasst: der Browser-Capture liest
  Computed-Styles ausschließlich für den Scroll-Sensor
  (`packages/framer-import/src/capture-browser.ts:265`).
- Die Custom-Property `--framer-icon-mask` wird nicht mitgeführt (Laufzeit-
  Wert, kein Stylesheet-Wert).

## Belege (Messläufe 12.11.2026, lokal unter `.scratch/`)

- `.scratch/choc-original-fill.mts` → `.json`: Original-Symbol-Pfad computed
  `fill rgb(156,156,156)`.
- `.scratch/choc-icon-color.mts` → `.json`: Build-Pfad `fill rgb(0,0,0)`.
- `.scratch/choc-original-icons.mts` → `.json`, `.scratch/choc-icon-check.mjs`:
  Icon-Inventar Original gegen Build.
- `.scratch/choc-icon-mask.mjs`: 0 Definitionen / 166 Verwendungen von
  `--framer-icon-mask` im Bake `H-OXzxq_XvLirh` (`/price`).
- Bildpaare `.scratch/choc-visual-2026-11-12/price/desktop/*-abschnitt-1.png`.

## Korrekturskizze

- **01a (ready-for-agent):** Computed `fill` der Icon-Knoten im Browser-Capture
  messen und als Stil am IR-Knoten mitführen (oder beim Inlinen die geerbte
  Farbe des Containers auf den Pfad kopieren). Roter Test zuerst: Fixture mit
  `<use>`-Icon und gefärbtem Container, Assert auf die Farbe im Bake.
- **01b (needs-info):** Erst messen, was die fehlende Maske sichtbar anrichtet
  (unmaskierte Farbfläche vs. unsichtbar), dann entscheiden, ob
  `--framer-icon-mask` als Knoten-Stil mitgeführt wird. Ohne Sichtbeleg nicht
  bauen.

## Grenzen

- Die Messung belegt eine Quelle (Chocolate). Wie häufig beide Mechanismen
  bei anderen Framer-Seiten sind, ist nicht gemessen.
- Korrektur erfordert Re-Import + visuellen Wiederholungslauf; der Bericht
  `.scratch/chocolate-importtest/bericht.md` (Befund 7) nennt diesen Befund
  als bewusst nicht in diesem Schritt behoben.
## Korrektur und Umsetzung 01a (12.11.2026)

Die Ursachenangabe oben ("Fill-Vererbung geht beim Inlinen verloren") ist
widerlegt. Das Symbol im Original traegt den Fill selbst:
`fill="var(--token-a284..., rgb(156, 156, 156)) /* {"name":"background-inverse"} */"`.
Der Sanitizer `paintValue` (`packages/widget-engine/src/svg-markup.ts`) lehnte
die Zeichen des angehaengten Framer-Namenskommentars ab und verwarf den ganzen
Fill. Korrektur: ein abschliessender `/* ... */`-Kommentar wird vor der Pruefung
abgeschnitten. Tests: `packages/widget-engine/test/svg-markup.test.ts` (zwei
neue Faelle; der erste war vor der Korrektur rot).

Beleg Re-Import `/price` und Vorschau-Build: alle 21 Check-Pfade tragen wieder
`fill="var(--token-a284..., rgb(156, 156, 156))"`. Der Sichtvergleich
`/price` Desktop aenderte sich dadurch nicht messbar (Abschnitts-Median 2,52 %
vorher, 2,66 % nachher); der Rest der Abweichung hat eine andere Ursache.
01b (`--framer-icon-mask`) bleibt offen.
## 01b gemessen (12.11.2026): keine sichtbare Wirkung, wontfix

`mask: var(--framer-icon-mask)` ohne Definition löst im Original wie im Build zu
`none` auf: Original 37 von 37 Icon-Hosts `mask: none`, Build 50 von 50
(`.scratch/choc-icon-color.json`, Feld `hostMask`). Die Quelle definiert die Variable
in den gemessenen Fällen ebenfalls nicht; mitführen würde nichts ändern. Label 01b:
`wontfix`. Grenze: gemessen auf `/price` bei 1440 px.