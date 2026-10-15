# Breakpoints je Site einstellbar machen

Status: proposed · 14.10.2026 (Entwurf, nicht entschieden; es gibt keinen Code und keine Schema-Änderung dazu)
Bezug: offener Punkt „Breakpoints pro Site“ aus `docs/current/stand.md`.

Dieser Text ist eine Entscheidungsvorlage. Er hält fest, was heute gilt, welche Wege es gibt und was jeder Weg
kostet. Angenommen ist erst, was Adi unten bei „Zu entscheiden“ bestätigt. Bis dahin gilt der Ist-Zustand.

**Ist-Zustand (belegt im Code).**

- Es gibt genau eine Definition: `BREAKPOINTS = { tablet: 1024, mobile: 640 }` in
  `packages/widget-engine/src/breakpoints.ts`. `@senify/renderer/breakpoints` und `@senify/editor/frames` lesen
  sie von dort.
- Der CSS-Compiler schreibt daraus die Media-Queries: `@media (max-width: <Wert − 0,02>px)` je Gerät
  (`packages/widget-engine/src/css/cascade.ts`, `packages/renderer/src/style-css.ts`). Für „nur auf Tablet
  ausgeblendet“ entstehen eigene Breitenbereiche (`DEVICE_RANGES`).
- Der Editor zeigt drei Blätter: Desktop 1440, Tablet 1024, Mobile 390 (`DESIGN_FRAMES` in
  `packages/editor/src/frames.ts`). Die Rahmen richten sich über `mediaMaxWidthFor` nach denselben Zahlen wie
  die gebackene Seite.
- Ein Breakpoint-Override hängt am Knoten unter dem festen Schlüssel `tablet` oder `mobile`
  (`Node.overrides` in `packages/section-sdk/src/types.ts`). Der Schlüssel nennt das Gerät, nicht die Breite.
- Mit den festen Zahlen rechnen außerdem die Visual-Gates (`REVIEW_VISUAL_BREAKPOINTS`), der Import-Gate
  (misst bei 1024) und die Referenz-Aufnahmen (`REFERENCE_BREAKPOINTS`: 1440, 810, 390). Die beiden letzten
  Listen sind Messbreiten, keine Seitenbreakpoints; sie müssten nur dann mit, wenn Gates „die Breakpoints der
  Site“ prüfen sollen.

**Problem.** Die Zahlen 1024 und 640 passen nicht zu jedem Entwurf. Ein Kundendesign mit Umbruch bei 900 oder
768 Pixeln lässt sich heute nur annähern: Entweder bricht die Seite zu früh oder zu spät um, oder der Autor
baut Ausnahmen über freie Style-Regeln. Gewünscht ist, die beiden Schwellen je Site festzulegen.

**Gewählter Weg (Vorschlag, nicht verbindlich): zwei Zahlen je Site.**

1. `Site` bekommt ein optionales Feld `breakpoints` mit `{ tablet: number, mobile: number }`. Ohne Eintrag
   gelten 1024 und 640; bestehende Projekte ändern sich nicht.
2. Die Zahlen werden geprüft: ganze Pixel, `mobile < tablet`, Mindestabstand (Vorschlag 120 px), Bereich
   (Vorschlag mobil 320–767, Tablet 641–1439). Die Grenzen sind eine Bremse gegen Tippfehler, keine
   Designregel.
3. Es gibt einen Auflöser `resolveBreakpoints(site)` mit den Standardwerten als Rückfall. Er ersetzt den
   direkten Import von `BREAKPOINTS` im Compiler, im Renderer-Bau und im Editor. `BREAKPOINTS` bleibt als
   Standard bestehen; die Zahlen existieren weiter genau einmal, nur nicht mehr als einzige Wahrheit.
4. Die Overrides behalten ihre Schlüssel `tablet` und `mobile`. Wer die Schwelle verschiebt, ändert, ab wann
   ein Override greift, nicht was in ihm steht. Es entsteht keine Datenmigration der Knoten.
5. Der Editor zeigt die Blätter in der Breite der Site-Schwellen (Tablet-Blatt = Tablet-Schwelle, Mobile-Blatt
   = Mobile-Schwelle bleibt ein Telefon-Maß, Vorschlag 390 oder die Schwelle, wenn sie kleiner ist). Die
   Wahl der Blattgröße ist ein eigener kleiner Punkt unten.
6. Gesetzt wird es im Dashboard unter Projekt-Einstellungen und über `PATCH /api/sites/:siteId`, in der
   Projekt-Aktivität als eigener Eintrag. Agenten lesen die Werte in `get_site`; ändern ist Sache des Betreibers
   (wie bei ADR-0018).

**Folgen.**

- Jeder Bau einer Site muss ihre Werte kennen: Compiler, Preview, Release, Redesign-Apply und Export. Ein Pfad, der
  weiter das feste `BREAKPOINTS` liest, backt andere Media-Queries als der Editor zeigt. Das ist der Hauptfehler,
  den ein Test abdecken muss (Preview und Bake mit abweichenden Werten, gleiche Breiten im Frame).
- Eine Änderung der Schwellen macht alle gebackenen Seiten der Site ungültig. Die Seiten werden neu gebacken;
  eine veröffentlichte Seite ändert sich erst mit dem nächsten Release.
- Die Visual-Baselines und `verify:parity` prüfen weiter mit den Standardwerten. Eine Site mit eigenen
  Schwellen hat keine eigene Baseline; das ist gewollt, weil die Gates das Produkt prüfen, nicht eine Site.
- Das Widget-Laufzeit-Skript im Browser (`packages/renderer/src/browser-entry.ts`) darf keine festen Zahlen
  mehr voraussetzen, sobald es Breakpoints kennt. Heute liest es sie nicht; das ist vor der Umsetzung zu prüfen.
- Datenbank: eine neue nullable Spalte, additiv wie `sites.base_url` in ADR-0018. Die Schema-Seite gehört zum
  Datenbank-Strang und wird dort entschieden; dieser Entwurf legt sie nicht an.

**Verworfen (Vorschlag).**

- Eine freie Liste benannter Breakpoints (mehr als drei Geräte). Die Overrides tragen feste Schlüssel, das Canvas
  drei feste Blätter; das Modell, der Compiler, die Kaskade nach unten und der Editor müssten mit. Für zwei
  einstellbare Schwellen ist das zu viel Umbau.
- Breakpoints je Seite statt je Site. Eine Site mit Seiten, die an verschiedenen Stellen umbrechen, hat in der
  Regel ein Navigations- und Footer-Problem: gemeinsame Sektionen müssten bei jeder Breite stimmen.
- Container-Queries statt Media-Queries. Das wäre ein anderer, größerer Weg (Sektion reagiert auf ihren
  Platz, nicht auf das Fenster) und gehört in eine eigene Entscheidung.
- Pixelwerte in den Overrides statt Gerätenamen. Das bricht jede bestehende Seite.

**Zu entscheiden (Adi).**

1. Wird das gebraucht, und wenn ja, von wem: ein konkretes Kundenprojekt, oder ein „könnte nützlich sein“?
   Ohne konkreten Anlass bleibt der Status quo (feste Zahlen) die einfachere Wahl.
2. Je Site (dieser Vorschlag) oder je Seite?
3. Standardwerte und Grenzen aus Punkt 2 des Vorschlags: passen 120 px Mindestabstand und die genannten
   Bereiche?
4. Blattgröße im Editor: Tablet-Blatt in Breite der Tablet-Schwelle, Mobile-Blatt als 390-Pixel-Telefon?

**Offen.** Ein Test, der alle Pfade findet, die `BREAKPOINTS` noch direkt lesen, bevor umgestellt wird. Ob die
Gates (`REVIEW_VISUAL_BREAKPOINTS`) die Schwellen der Site übernehmen sollen oder bei den Standardmaßen bleiben.
