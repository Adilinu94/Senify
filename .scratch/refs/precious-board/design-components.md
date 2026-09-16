# Precious Board Components

> Full specifications for the components detectable from `https://precious-board-067119.framer.app/`.
> For tokens see [design.md](design.md). For rules & accessibility see [design-guidelines.md](design-guidelines.md).

Erkannt aus Aufnahme und Quelltext (`components`: navigation, button, form, gallery, testimonial, pricing, footer) und aus den Messwerten ergänzt. Maße in px bei 1440 Breite.

## Actions

### Button

**Types:** Pill (primär) > Kante (sekundär) > Text.
Höhe 40px, Innenabstand 10px 20px, Radius 99px (Pille) oder 8px, Label 12px/500, Satzschreibung.

| Property | Value |
|---|---|
| Contrast | 4.5:1 Text |
| States | Ruhe, Hover (Fläche +1), Fokus (2px Ring), Gedrückt, Aus |
| Touch target | 48 × 48px mindestens |

**Do:** Lime nur für die eine Hauptaktion.
**Don't:** Zwei Pillen-Buttons nebeneinander in derselben Gruppe.

### Link

Unterstrichen erst beim Überfahren, Farbe `#006092`, Übergang 120ms.

---

## Input

### Form

Felder mit Radius 8px, Innenabstand 10px 12px, Grund `#fafafa`, Kante `rgb(237,237,237) 0 0 0 1px inset`, Label 11px/400 in `#8c8c8c`.

| Property | Value |
|---|---|
| States | Ruhe, Fokus (Ring `#006092`), Fehler (Rand `#b3261e`), Aus |
| Höhe | 44px |

**Don't:** Platzhalter als Label missbrauchen.

---

## Navigation

### Header Bar

Höhe 56px, Innenabstand 0 40px, Grund weiß mit feiner Unterkante, Marke links, Menü rechts, 12px/500.

### Tabs / Segment

Pillen-Gruppe mit Radius 99px, Grund `#f2f2f2`, aktives Element weiß mit Kante `rgb(237,237,237) 0 0 0 1px inset`.

### Image Carousel

Bildplatten mit Radius 16 bis 20px, Abstand 24px, Pfeile 34 × 34px, Wischen auf dem Telefon.

---

## Containment

### Card

**Types:** Fläche (weiß, Kante innen) > Glas (`rgba(255,255,255,0.1)` + `blur(10px)`) > Bild.
Radius 12 bis 20px, Innenabstand 20 bis 24px, Schatten `rgba(0,0,0,0.04) 0 4px 4px`.

| Property | Value |
|---|---|
| States | Ruhe, Hover (Fläche hebt sich), Fokus |
| Contrast | Text 4.5:1 |

**Do:** Glas nur über Bild legen.
**Don't:** Leere Standardkarten als Füllmaterial.

### Dialog

Zentriert, Radius 16px, Backdrop `rgba(0,0,0,0.2)`, `Escape` schließt.

### Accordion / Divider

Trennlinie 1px `rgb(237,237,237)`, Zeilenkopf 14px/500 mit Plus-Symbol rechts.

---

## Data Display

### Gallery

Raster aus Bildplatten, Radius 16px, Abstand 10 bis 24px, gemischte Hoch- und Querformate, Überlagerungen mit Glas erlaubt.

### Tag / Chip

Höhe 24px, Radius 99px, Innenabstand 4px 10px, 10px/500, Fläche `#f2f2f2`.

### Avatar

Rund, 32px, mit 2px weißem Ring (`inset 0 0 0 2px #fff`).

### Image

Feste Maße gegen Springen, `object-fit: cover`, Radius wie die Karte, Alt-Text Pflicht.

---

## Feedback

### Toast

Unten mittig, Radius 8px, Grund `#024364`, Text weiß 12px, Einblenden 150ms.

### Progress

Dünne Linie 2px in `#9ac9e2`, Füllung `#006092`.

---

## Sections der Vorlage

Hero mit Bildplatte und Glasüberlagerung, Kundenleiste, Leistungs-Galerie, Testimonial (Serif-Zitat), Preistafel, Formular, Fußzeile. Diese Abschnittsfolge ist der eigentliche Wert der Referenz; Inhalte, Marken und Fotos werden nicht übernommen.
