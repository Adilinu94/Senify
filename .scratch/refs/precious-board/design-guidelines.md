# Precious Board Guidelines — Accessibility & Do's/Don'ts

> See [design.md](design.md) for token values. See [design-components.md](design-components.md) for component specs.

Grundlage: gemessene Kontraste und Regeln der Referenz `https://precious-board-067119.framer.app/`. Die Seite ist eine Design-Inspiration: Gestaltung übernehmen, Inhalte, Logos und Fotos nie.

## Accessibility

### Contrast Requirements

| Requirement | Ratio |
|-------------|-------|
| Text auf Fläche | 4.5:1 |
| Große Überschriften (≥ 24px) | 3:1 |
| Icon und Kante | 3:1 |

| Component | 3:1 Against |
|-----------|-------------|
| Glasfläche über Bild | darunterliegendes Bild (Scrim `rgba(0,0,0,0.2)` je nach Bild nachziehen) |
| Lime `#cbff97` auf Weiß | 1.4:1, daher nur auf `#024364` oder dunklerem Grund verwenden |
| `#9ac9e2` als Text auf Weiß | 2.1:1, als Text unzulässig, nur als Fläche |

### Touch Targets

- Mindestens 44 × 44px auf dem Tablet, 48 × 48px auf dem Telefon (inferred).
- Abstand zwischen zwei Zielen mindestens 8px.
- Pillen-Buttons bleiben mindestens 40px hoch, auch wenn die Schrift 12px ist.

### Keyboard Navigation

| Key | Action |
|-----|--------|
| `Tab` / `Shift+Tab` | durch alle Bedienelemente, sichtbarer Ring |
| `Enter` / `Space` | Aktion auslösen |
| `Escape` | Dialog oder Menü schließen |
| `←` / `→` | in Bildfolgen blättern |

### Assistive Technology

- Jede Bildplatte trägt einen Alternativtext; rein dekorative Glasflächen `aria-hidden`.
- Der Umschalter der Kopfleiste meldet seinen Zustand (`aria-expanded`).
- Bilder tragen feste Maße, damit die Seite beim Laden nicht springt.

## Gestures

| Gesture | Use |
|---------|-----|
| Tap | Aktion, Karte öffnen |
| Double tap | in Bildfolgen zoomen (inferred) |
| Scroll | lange Seiten, Stapel mit Glas |
| Swipe | zwischen Bildern auf dem Telefon (inferred) |
| Pinch | Bilder vergrößern (inferred) |

## Content Design

- Überschriften in Satzschreibung, kurz, ohne Punkt.
- Ein Aussagesatz je Abschnitt, danach Raum.
- Zahlen und Marken klein und gesperrt (`letter-spacing: 0.04em`).
- Fließtext auf 60 bis 75 Zeichen je Zeile begrenzen.

## Do's and Don'ts

### Color
- **Do** die Tiefwasser-Palette als Grund nehmen und Lime genau einmal je Abschnitt setzen.
- **Don't** Lime als Text auf Weiß verwenden.

### Shape
- **Do** das harte Raster (Radius 0) als Regel behalten und runde Formen gezielt brechen lassen.
- **Don't** Radius 12px und 20px in derselben Gruppe mischen.

### Elevation
- **Do** die feine Lichtkante (`inset 0 0 0 1px`) als Hauptmittel für Ebenen nutzen.
- **Don't** große weiche Schatten stapeln; die Seite arbeitet mit Licht, nicht mit Tiefe.

### Interaction
- **Do** Zustände über Fläche und Kante zeigen.
- **Don't** Bewegung über 1200ms hinaus verlängern.

### Layout
- **Do** den 4px-Takt und den 40px Seitenrand einhalten.
- **Don't** die Umbruchpunkte 760/1199px verändern.

### Typography
- **Do** Inter Display für Überschriften und Inter für Text verwenden.
- **Don't** Serif für Fließtext einsetzen; sie gehört zum Zitat.

### Motion
- **Do** Einblenden beim Laden, 1200ms, `linear`.
- **Don't** dauerhaft laufende Animationen ohne Pause; `prefers-reduced-motion` beachten.

### Components
- **Do** Glas nur über Bild setzen.
- **Don't** Glas auf Fließtext legen.
