# ADR-0035: Native Widget-Klassen für Framer-Code-Komponenten

**Status:** Angenommen, 14.11.2026
**Betrifft:** `packages/widgets`, `packages/widget-engine`, `packages/renderer`, `packages/editor`, `packages/engine`
**Ergänzt:** ADR-0010, ADR-0026, ADR-0028

## Kontext

Framer-Code-Komponenten bestehen typischerweise aus einem framework-neutralen Kern (WebGL, Canvas, DOM)
und einer dünnen React-Hülle. Der bisherige Payload-Transport (ADR-0010) liefert fremden Code als Insel
aus. Damit läuft die Komponente, aber ihre Inneren sind nicht editierbar, und React sowie Framer-Shims
bleiben im Release.

Der Framer-Import soll die Komponente nativ, runtime-frei und über den Inspector editierbar machen.
Der Kern ist bereits ohne React formuliert; die React-Hülle trägt nur Props, Observer und Platzhalter.
Damit ist ein Port mechanisch möglich, ohne die Shader-, Geometrie- oder Animationslogik neu zu bauen.

## Entscheidung

1. **Katalog-Primitive statt Sonderweg.** Jede Komponente wird ein `PrimitiveDefinition` mit
   `Control[]` (Kategorie, Gruppen, Defaults, Bedingungen). Die Controls kommen aus dem Katalog in
   den Inspector; ein zweites Control-Schema entsteht nicht.
2. **Vanilla-Kern mit Vertrag.** Der Laufzeitkern liegt in `packages/widgets/src/<typ>.ts` und
   erfüllt `mount(host, props) -> { setProps, destroy }`. Er importiert weder React noch Framer noch
   Editor-Code. `setProps` aktualisiert Uniforms, Geometrie und Bilder ohne neuen WebGL-Kontext.
3. **Props-Kanal im Markup.** Der Host ist ein `div` mit `data-island="widget"`,
   `data-widget-type` und `data-props` (JSON aller Control-Werte). Dazu kommen Poster und Canvas.
   Media-Referenzen (`assetId`) werden vor dem JSON zu lokalen URLs aufgelöst (Bake: Asset-Store,
   Editor: Asset-Map). Der Kern erhält URLs, keine IDs.
4. **Bake bündelt je genutztem Typ.** esbuild schreibt `assets/widgets/<typ>.<hash8>.js`; ein
   Island-Script mountet die Hosts lazy per IntersectionObserver. Fehler lassen den Poster stehen.
5. **Editor mountet live.** Eine Injection lädt den Kern über `/api/widget-module?type=<typ>` und
   hält je Host einen Handle. Bei einem erhaltenen Host läuft `setProps`; ein neuer Host mountet,
   entfernte Hosts werden `destroy`t. Der Live-Modus des Canvas baut das iframe bei einer
   Store-Änderung bewusst neu auf (Release-Treue); dann mountet der Kern frisch mit den neuen Props.
6. **Bibliothek bleibt der bestehende Mechanismus.** Ein Widget ist ein gültiger `NodeTree`. Der
   Install-/Detach-/Re-Attach- und Override-Pfad aus S6 trägt es ohne neues Schema. Provenienz und
   Lizenz bleiben Pflicht; der bestehende Guard weist Framer-Importe ohne geprüfte Lizenz ab.

## Verworfene Alternativen

- **B — React-Inseln (Payload):** React und Framer-Shims mit ausliefern, Props-Kanal ergänzen.
  Schneller für „alle laufen", aber Runtime im Release, Framer-API-Shims, Bruch mit ADR-0010 §9
  und weiterhin keine editierbaren Inneren.
- **C — Hybrid:** Shader vanilla, React-lastige Komponenten als Payload. Zwei Mechanismen mit
  doppelter Pflege; die Bibliotheks-Control-Lücke bliebe für den React-Teil bestehen.

## Folgen

- Der Pilot ist runtime-frei, im Inspector editierbar und ohne Framer-CDN ladbar.
- Neue Primitive-Familie und neue Island-Art `widget`; die vorhandenen Payload- und WebGL-Pfade
  bleiben unverändert. Widgets sind keine Payloads und verletzen ADR-0010 §9 nicht.
- Es wird nur gebündelt, was eine Seite nutzt. Jede weitere Komponente kostet ein eigenes Bündel.
- **Lizenz:** Der Code stammt aus Framer University. Vor einer Weitergabe muss die Lizenz geprüft
  und im Bibliothekseintrag belegt sein. Der Pilot legt keinen Produktions-Bibliothekseintrag ohne
  Nachweis an; `library-widget.test.ts` prüft, dass der Guard unknown-Lizenzen abweist.
- **Parität:** Der Pixelvergleich wird bei festem Flow-Zeitpunkt geführt (`__RIBBON_FIXED_T`
  in der Quelle, `pin(t)` im Widget), mit denselben sechs Origin-Texturen und den echten
  Instanzwerten. Gemessen bei 203,5 × 842: Silhouette 1,0, Farbdifferenz 0,45 %. Die Live-Phase
  bleibt zeitabhängig; für Screenshots und Gates wird sie gepinnt.
- **Editor-Live-Modus:** `setProps` ist für In-Place-Renders implementiert und getestet. Der
  derzeitige Live-Modus lädt das iframe bei Store-Änderungen neu, deshalb mountet der Kern dort
  frisch. Das ist eine bekannte Grenze, kein stiller Remount im selben Dokument.
- **Rollout:** Nur `ribbon-gallery` ist portiert. Orbit, Tunnel, ThreeDGlass und die übrigen
  Komponenten folgen nach demselben Muster; DOM- und Verhaltenskomponenten werden einzeln bewertet.
  Für Framer-Komponenten ohne XML-Innenleben (Navbar, Footer, Step 2, Bewertungs-Ticker) gilt die
  DOM-Variante aus ADR-0038: derselbe Katalog, aber serverseitig gerenderter Inhalt statt Canvas.

## Belege

- Katalog und Markup: `packages/widget-engine/src/widgets.ts`,
  `packages/widget-engine/test/widgets.test.ts`, `packages/widget-engine/test/widget-markup.test.ts`
- Kern: `packages/widgets/src/ribbon-gallery.ts`,
  `packages/widgets/test/ribbon-gallery.test.ts`
- Bündelung und Island: `packages/renderer/src/widget-vendor.ts`,
  `packages/renderer/test/widget-island.test.ts`, `widget-vendor.test.ts`,
  `widget-bake-assets.test.ts`
- Browser: `packages/app/test/ribbon-widget-browser.test.ts`,
  `packages/app/test/ribbon-parity-browser.test.ts`,
  `packages/app/test/editor-widget-browser.test.ts`
- Bibliothek und Audit: `packages/engine/test/library-widget.test.ts`,
  `packages/engine/test/runtime-audit.test.ts`
