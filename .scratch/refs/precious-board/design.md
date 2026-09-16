# Precious Board Design System — Token Reference

> Always read this file first. For component specs see [design-components.md](design-components.md). For accessibility and do's/don'ts see [design-guidelines.md](design-guidelines.md).

Erzeugt aus der lebenden Referenz `https://precious-board-067119.framer.app/` (Framer, Aufnahme 16.09.2026). Grundlage sind die gemessenen Werte der Seite (1440 px), nicht Schätzungen. Wo ein Wert nur abgeleitet ist, steht "(inferred)".

## Colors

### Brand — Deep Water
| Role | Hex | Usage |
|------|-----|-------|
| brand-900 | `#01283c` | dunkelster Grund, Headline-Platten |
| brand-800 | `#083247` | Flächen hinter Glas |
| brand-700 | `#024364` | Hauptfläche der Marke (17 gemessene Verwendungen) |
| brand-600 | `#006092` | Akzent, Links, Icons |
| brand-300 | `#9ac9e2` | helle Flächen, Füllungen |

### Accent — Lime
| Role | Hex | Usage |
|------|-----|-------|
| accent | `#cbff97` | Signal, ein Element je Abschnitt |

### Surface & Neutral
| Role | Value | Usage |
|------|-------|-------|
| surface | `#ffffff` | Grundfläche (416 Verwendungen) |
| surface-soft | `#fafafa` / `#f7f7f7` / `#f2f2f2` | gestapelte Karten |
| glass | `rgba(255,255,255,0.1)` | Glasflächen über Bild (24) |
| scrim | `rgba(0,0,0,0.2)` | Verdunkelung hinter Glas |
| ink | `#000000` / `rgb(26,26,26)` | Text (155 + 42) |
| ink-muted | `#8c8c8c` | Nebentexte |

## Typography

Familien: Display `"Inter Display", "Inter Display Placeholder", sans-serif` (198), Text `Inter, "Inter Placeholder", sans-serif` (177). Serif nur als Zitat (`"Times New Roman"`, 27).

| Style | Size | Weight | Line Height | Uses |
|-------|------|--------|-------------|------|
| Body | 14px | 500 | 18.2px | 84 |
| Body | 14px | 500 | 19.6px | 6 |
| Body | 14px | 400 | 18.2px | 12 |
| Label | 12px | 500 | 14.4px | 17 |
| Caption | 12px | 400 | 14.4px | 8 |
| Micro | 11px | 400 | 14.3px | 3 |
| Micro | 10px | 500 | 14px | 7 |
| Display | Framer-Skala (`--font-size`) | — | `--line-height` | 11 |

## Shape

| Token | Radius | Components |
|-------|--------|------------|
| None | 0px | Grundraster (2249 Verwendungen, die Regel der Seite) |
| XS | 4px / 5px / 6px | Marken, kleine Etiketten |
| S | 8px / 10px | Felder, Chips |
| M | 12px | Karten |
| L | 16px / 20px | Bildplatten, Panels (146) |
| Full | 99px | Pillen, runde Buttons |

## Elevation

| Level | CSS Shadow | Usage |
|-------|-----------|-------|
| 1 | `rgba(0,0,0,0.04) 0 4px 4px` | Karten (20) |
| 2 | `rgba(0,0,0,0.08) 0 4px 16px` | schwebende Platten (16) |
| 3 | `rgba(0,0,0,0.08) 0 2px 8px` | kleine Elemente (11) |
| Hairline | `rgb(237,237,237) 0 0 0 1px inset` | feine Lichtkante (14) |
| Light edge | `rgb(255,255,255) 0 0 0 2px inset` | Kante auf Bild (8) |
| Glass | `blur(10px)` + `rgba(255,255,255,0.1)` | Glaskörper |

## Interaction States

| State | Value |
|-------|-------|
| Hover | Fläche hebt sich um eine Stufe, Kante wird heller |
| Focus | 2px Ring `#cbff97` auf dunklem Grund, sonst `#006092` (inferred) |
| Pressed | Fläche auf 90 % Helligkeit (inferred) |
| Disabled | Deckkraft 38 %, keine Kante (inferred) |

## Layout

| Class | Width | Panes | Navigation |
|-------|-------|-------|------------|
| Compact | < 760px | 1 | Kopfleiste, Umschalter |
| Medium | 760–1199px | 1–2 | Kopfleiste |
| Expanded | ≥ 1200px | 2 | Kopfleiste mit vollem Menü |

Seitenrand 40px, Abstände 4/6/8/10/12/16/24px, Grundtakt 4px.

## Motion

| Token | Value | Usage |
|-------|-------|-------|
| Duration | 1200ms | Seiten- und Bildwechsel (WAAPI, `linear`) |
| Easing | `linear` für Dauerläufe, sonst Standard-Kurve (inferred) | — |
| Trigger | `load` | Einblenden beim Laden |

## Icons

Strichsymbole im 24px-Raster, 1.5 bis 2px Strich (inferred), dazu farbige Marken-SVGs der Kundenlogos (nicht übernehmen).

## Design Tokens

Die Seite nutzt gehashte Framer-Token (`--token-…`), zum Beispiel `--token-7c1608a6…: #024364`. Für eigene Projekte werden sie als sprechende Namen geführt: `brand.700`, `accent.lime`, `surface.glass`.
