# Artefakt 07: Design-Token- & Theme-System (Senify v1)

> Entschieden am 14.09.2026 in Ticket „Design-Token- & Theme-System".
> Grundlagen: `research/20` (Core Framework: Shade-Scale, fluide Skalen, Utility-Generator), `research/22` (Framer: `/Brand`·`/BG`·`/UI`, Alpha-Varianten, Text-Skala mit HTML-Tags, Fonts), `artifacts/01` (Tokens-first), `artifacts/03` (Motion-Tokens).

## Entscheidungen (Wizard, 6/6)

1. **Zwei Ebenen** (Primitives → Semantik) über **6 Skalen**: Farbe, Typografie, Spacing, Radius, Shadow, Motion.
2. **Skalen-Engine:** generiert + überschreibbar.
3. **Light/Dark strukturell** von Anfang an.
4. **Format:** JSON (DTCG-nah) als Quelle → Build erzeugt CSS-Variablen (+ Tailwind-Mapping).
5. **Fonts:** kuratierte Auswahl, im Build **self-hosted**.
6. **CSS-Substrat:** **Tailwind v4** mit Token-Theme + CSS-Variablen.

## Token-Modell (JSON-Quelle)

```ts
type Theme = {
  id: ThemeId
  name: string
  primitive: {
    color: Record<string, string>          // brand, neutral-*, accent-* … (Hex/OKLCH)
    scale: { ratio: number; base: string } // Typografie-Basis
    spacing: { base: number }              // 4px-Raster (fluide Option)
    radius: { base: string }
    shadow: { base: string }
  }
  semantic: Record<string, TokenRef>       // bg.base → color.neutral-0 …
  modes: { light: ModeMap; dark: ModeMap } // semantische Rollen pro Modus
  fonts: { display: FontRef; body: FontRef; mono?: FontRef }
  motion: {
    ease: Record<string, string | SpringSpec>  // snappy | smooth | bouncy | spring-*
    duration: Record<string, string>           // fast | base | slow
  }
}
```

**Beispiel (Framer-Lektion: Rolle zuerst, Alpha als Referenz-Eigenschaft):**

```json
{
  "semantic": {
    "bg.base":  { "$ref": "color.neutral-0" },
    "bg.muted": { "$ref": "color.neutral-100" },
    "fg.base":  { "$ref": "color.neutral-900" },
    "accent":   { "$ref": "color.brand" },
    "line":     { "$ref": "color.neutral-900", "alpha": 0.07 }
  }
}
```

## Skalen-Engine

- **Farbe:** Brand-Token → automatische Shade-Scale (50–900, OKLCH); Alpha-Varianten generierbar (Framers „Yellow 40 %"-Muster).
- **Typografie:** Basisgröße + Ratio → **fluide Skala** (clamp zwischen Mobile/Desktop); Rollen (Heading XL–6, Body/Paragraph) inkl. lineHeight/letterSpacing und **HTML-Tag-Mapping** (h1–h6/p).
- **Spacing:** 4px-Raster mit benannten Stufen (2…200 — deckt den Framer-Rhythmus 10/20/50/80/100/200).
- **Radius/Shadow:** kleine Stufen (sm/md/lg/xl); Shadow mit Brand-Tint.
- **Motion:** `ease` (cubicBezier + **named Springs**, die als CSS `linear()` UND als JS-Spring gespeist werden) und `duration` (fast/base/slow) — löst die offene DTCG-Spring-Frage aus Research 18.
- Alle generierten Werte **einzeln überschreibbar** (Override gewinnt).

## Ausgabe (Build)

- Erzeugt **CSS-Variablen**: `--color-accent`, `--fg-base`, `--font-display`, `--space-4`, `--radius-lg`, `--ease-snappy`, `--duration-base` …
- **Tailwind v4 Theme** mappt 1:1 auf diese Variablen → Sektionen schreiben Utilities, **keine Rohwerte** (Gate: keine Hex-Werte in Sektionen).
- **Dark Mode:** semantische Rollen mappen pro Modus; Umschaltung via `data-theme`; Sites können Light-only bleiben.
- Token-Referenzen in Props (`{ "$token": "color.accent" }`, Artefakt 01) werden im Renderer zu Variablen aufgelöst → Theme-Wechsel propagiert überall.

## Fonts

- **Kuratierte Auswahl** im Section-SDK (Display + Body kombinierbar); woff2 **self-hosted im Build** (preload, `font-display: swap`, keine Third-Party-Calls, DSGVO-freundlich).
- Custom-Font-Upload: später (Media, Ticket 15).

## Editor- & Agenten-Nutzung

- Editor zeigt **semantische Tokens zuerst** (Rolle → Wert), Theme-Panel (Brand-Farbe, Fonts, Dichte), Live-Preview beim Wechsel.
- Agenten setzen Theme-Werte über Mutationen (`update_theme`, Ticket 10) und referenzieren in Props nur **semantische Rollen** — nie Roh-Hex.

## Anschlüsse

| Bereich | Ticket |
|---|---|
| Sektionen nutzen semantische Tokens + Tailwind-Theme (Gate: keine Rohwerte) | 08 |
| Editor: Theme-/Token-Panel, Picker, Live-Preview | 09 |
| Tools: `get_theme` / `update_theme` | 10 |
| Kontrast-/A11y-Checks gegen Token-Paare | 13 |
| Motion-Tokens speisen Motion-Spec (ease/duration + Springs) | 03 (bestätigt) |
