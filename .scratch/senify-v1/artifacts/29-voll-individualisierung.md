# Artefakt 29: Voll-Individualisierung der Bausteine (Senify v1)

> Entschieden am 15.09.2026 (Produktentscheidung mit Nutzer-Freigabe).
> Grundlagen: `artifacts/07` (Tokens), `artifacts/08` (Section-Library), `artifacts/09` (Editor), `artifacts/02` (Renderer), `research/22-framer-analyse.md` (Framer-Regler-Modell).

## Entscheidungen (3/3)

1. **Ebene:** Baustein + Innenteile — jede Section ist voll stylbar; Karten, Buttons, Überschriften, Medien und Links sind als benannte Innenteile einheitlich pro Section einstellbar.
2. **Werte:** Theme-Token als Standard, freie Werte überall möglich (Warnung statt Block).
3. **Layout:** Ja — Layout-Regler je Section (Spalten, Abstände, Ausrichtung, Anordnung, Seitenverhältnis).

## Ziel

Keine Standard-Baukasten-Optik: Jede Section lässt sich vollständig an die Marke anpassen, vom Agenten und vom Menschen, pro Breakpoint. Individualisierung passiert über Optik und Layout, nicht über freien Code — ADR-0001 gilt unverändert: kein Code pro Site, keine Registry-Hintertür.

## Wert-Modell

- Stilwerte sind **Token-Referenz oder freier Wert**: `{ "$token": "accent" }`, `{ "$token": "space.16" }` oder z. B. `"#e11d48"`, `"96px"`, `"clamp(2rem, 5vw, 4rem)"`.
- Neue Prop-Metadaten (additiv, bestehende Sektionen bleiben gültig):
  - `control: "scale"` — Stilwert-Regler (Token-Picker mit freier Eingabe).
  - `tokenGroup: "color" | "space" | "radius" | "shadow" | "type" | "font" | "ease" | "duration"` — Quelle für den Token-Picker und Reihenfolge im Panel.
  - `part: string` — Gruppierung im Editor (Innenteil, z. B. `card`).
- Rohwerte sind erlaubt; die Engine gibt eine **Warnung** aus (`Literal value … bypasses theme tokens`) — kein Block (Entscheidung 2).
- Prop-Keys bleiben flach (`cardBackground`) → Validierung, Varianten-Presets, Breakpoint-Overrides, Undo, Audit funktionieren ohne Änderung.

## Standard-Style-Set (jede Section)

| Key | Control | tokenGroup | Gruppe | Beispiel-Token |
|---|---|---|---|---|
| `background` | color | color | Styling | `bg.muted`, `bg.inverted` |
| `textColor` | color | color | Styling | `fg.base`, `fg.inverted` |
| `paddingY` | scale | space | Styling | `space.16` |
| `contentWidth` | enum | – | Layout | `narrow · regular · wide · full` |
| `align` | enum | – | Layout | `left · center` |

Ohne gesetzte Werte bleibt die heutige Optik (Default-Render); Goldens bleiben unverändert gültig.

## Innenteile (Parts)

Namenskonvention `<part><Prop>` (z. B. `cardBackground`) plus `part`-Feld fürs Editor-Panel. Helper im Registry-Paket (`packages/registry/src/shared.ts`):

| Helper | Props | Sektionen (Auswahl) |
|---|---|---|
| `cardPart()` | background, borderColor, radius, shadow, padding | features, services-process, projects, testimonials, pricing, faq, team, gallery |
| `buttonPart()` | background, textColor, borderColor, radius | hero, cta, contact, newsletter, pricing, cookie-note, navbar |
| `headingPart()` | textColor, size (type-Skala) | alle Sektionen mit Überschrift |
| `mediaPart()` | radius, shadow | media, embed, gallery, logo-cloud, marquee, projects, team, testimonials |
| `linkPart()` | textColor | navbar, footer |

## Layout-Regler

- `columns` (enum `2|3|4`) + `gap` (scale/space) für Raster-Sektionen.
- `reverse` (boolean) + `aspect` (enum `16:9|4:3|1:1|3:4|auto`) für Split-Sektionen.
- `contentWidth` und `align` aus dem Standard-Set für alle Sektionen.
- Alle Regler sind normale Props → Varianten, Breakpoint-Overrides, Undo und Audit greifen unverändert.

## Rendering-Mapping

- **Basiswerte inline** als CSS-Variablen am Element — Section: `background` und `color` direkt, `--section-pad-y` als Variable (und Padding am Wrapper); Innenteil: `--card-bg`, `--card-border`, `--card-radius`, `--card-shadow`, `--card-pad`, `--button-bg/-fg/-border/-radius`, `--heading-fg/-size`, `--media-radius/-shadow`, `--link-fg`. Komponenten nutzen Fallback-Ketten (`var(--card-radius, var(--radius-lg))`), damit ohne Props das heutige Markup entsteht.
- **Breakpoint-Overrides** lassen sich nicht inline ausdrücken: der Bake erzeugt `assets/sections.css` mit `[data-node-id="…"]`-Selektoren und Media-Queries (Tablet < 1024px, Mobil < 640px; zentral definiert, auch vom Editor genutzt). `data-node-id` ist bereits an jeder Section.
- Token-Refs werden zu `var(--…)` aufgelöst (Token-Pfad: `.` → `-`), freie Werte unverändert durchgereicht.

## Editor- & Agenten-Nutzung

- Registry-generierte Panels: Gruppen Styling und Layout; Innenteile als Untergruppen (`part`); Token-Picker zuerst, freie Eingabe möglich; Override-Badges + Reset je Breakpoint (Framer-Modell).
- Agenten setzen dieselben Props über kanonische Mutationen; Warnungen erscheinen im `apply_mutations`-Ergebnis (bestehender `warnings[]`-Kanal).

## Anschlüsse

| Bereich | Ticket |
|---|---|
| Sektionen deklarieren Standard-Set, Parts, Layout-Regler | 16 |
| Editor: Panels, Token-Picker, Override-Badges | 13 |
| Renderer: Style-Variablen + Override-CSS im Bake | 05 (Basis), 16 |
| Checks: Kontrast- und Design-Drift-Hinweise | 07, 13 |
