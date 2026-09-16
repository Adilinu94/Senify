# 16: Voll-Individualisierung (Style-Props, Innenteile, Layout)

**What to build:** Jede der 25 Sektionen wird vollständig einstellbar: Standard-Style-Set (Hintergrund, Textfarbe, Abstand, Inhaltsbreite, Ausrichtung), benannte Innenteile (Karten, Buttons, Überschriften, Medien, Links) und Layout-Regler (Spalten, Abstände, Anordnung, Seitenverhältnis). Werte sind Token-Referenzen oder freie Werte (Warnung statt Block). Basiswerte rendern inline als CSS-Variablen, Breakpoint-Overrides als gebackenes CSS mit Media-Queries.

**Blocked by:** 03 (Section-Library), 04 (Theme & Tokens), 05 (Renderer & Bake).

**Status:** umgesetzt (voller `pnpm verify` grün; Individualisierung über Theme, Vorlagen und Referenz-Profile in allen Oberflächen verfügbar)

- [x] section-sdk: Control `scale` (Token-Ref oder freier Wert), `tokenGroup` und `part` an PropSpec; Validierung unverändert (flache Keys)
- [x] Alle 25 Sektionen deklarieren das Standard-Set; passende Innenteile (card/button/heading/media/link); Layout-Regler je Sektionsgruppe
- [x] Komponenten rendern Sektions-, Part- und Layout-Werte mit Fallback-Ketten (`var(--card-radius, var(--radius-lg))`); ohne Props unverändertes Markup
- [x] Breakpoint-Overrides: `assets/sections.css` mit `[data-node-id]`-Selektoren + Media-Queries (Tablet < 1024px, Mobil < 640px), Link im Template; Basiswerte inline
- [x] Engine: Warnung für Literal-Werte bei allen Token-fähigen Props (color/scale), kein Block; Tests angepasst
- [x] Tests: Katalog (Standard-Set/Parts/Layout), Komponenten (Sektion + Parts + Layout), Renderer (Override-CSS), Bake-Smoke; `pnpm verify` grün

## Entscheidungen bei der Verdrahtung

- `paddingY` wirkt als vertikaler Block-Abstand am Section-Wrapper (`--section-pad-y`, per Breakpoint über die Override-CSS überschreibbar); die Innenteile behalten ihre Standard-Abstände.
- `reverse` (Anordnung) ist in `hero` verdrahtet (Order-Tausch Text/Visual).
- `aspect` ist in `gallery` (Bilder) und `projects` (Cover) verdrahtet; `media` und `embed` behalten ihre eigenen `aspect`-Props.
- Regler ohne passendes Element wurden aus der Deklaration entfernt statt leer mitgeführt: `card` in stats/timeline/comparison, `columns` in logo-cloud, `gap` in marquee, `button` in banner/footer, `reverse` in contact/newsletter.

Quellen: `artifacts/29` (neu), `artifacts/07`, `artifacts/08`, `artifacts/09`, Spec „Baustein-Styling & Layout" (Stories 115–120).
