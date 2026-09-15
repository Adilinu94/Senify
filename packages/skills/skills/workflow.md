# Master Flow — Site aus Brief

Follow the stages in order. Stop after each stage and check the result with a read tool.

## 1. Brief verstehen

- Ziel, Zielgruppe, Tonalität, Pflichtinhalte und Seitenliste aus dem Brief ziehen.
- Offene Punkte notieren statt erfinden (Preise, Namen, Rechtstexte kommen vom Kunden).

## 2. Projekt und Seiten anlegen

- `list_sites` prüfen; ohne Site: Site anlegen (Programm/CLI), dann `create_page` je Seite.
- Startseite zuerst, Unterseiten mit sprechenden Pfaden (`/leistungen`, `/kontakt`).

## 3. Theme setzen

- `get_theme` lesen, dann `update_theme` mit den Markenwerten (Brand-Farbe, Neutral, Typo, Radius, Motion).
- Danach Sektionen **nur mit semantischen Rollen** stylen (`accent`, `bg.muted`, `fg.inverted`, `space.16` …).

## 4. Seiten bauen

- Sektionsfolge planen: Gerüst (navbar, hero, content, cta, footer) → Überzeugung → Vertrauen.
- Pro Sektion: `get_section` (Props, Varianten, Golden), dann `insertNode` mit Golden-Props als Startpunkt, danach Inhalte über `updateNodeProps`.
- Bündeln: mehrere Mutationen in einem `apply_mutations`-Batch (atomar, ein Undo).
- Nach jedem Batch: `get_page` für den neuen `draftVersion`, Warnings lesen.

## 5. Styling und Layout

- Sektions-Styles (`background`, `textColor`, `paddingY`, `contentWidth`, `align`), Innenteile (`card*`, `button*`, `heading*`, `media*`, `link*`) und Layout-Regler (`columns`, `gap`, `reverse`, `aspect`).
- Tablet/Mobil über `setBreakpointOverride` feinjustieren.
- Rohwerte nur als bewusste Ausnahme (Warnung beachten).

## 6. Inhalt und Qualität

- Texte konkret und kurz; keine Floskeln, keine Platzhalter auf der Zielseite.
- Bilder: Beschaffungs-Flow in `assets.md`; Alt-Texte sind Pflicht (dekorativ = leer, bewusst).
- Motion sparsam: Presets statt Effektfeuerwerk, Intensität passend zum Site-Profil.
- Struktur prüfen: Heading-Hierarchie, Link-Ziele, keine leeren Listen.

## 7. Übergabe

- Zusammenfassung: was gebaut, welche Entscheidungen, was offen.
- Änderungen sind im Audit sichtbar; Review/Publish folgen mit den Lifecycle-Tickets (`submit_for_review`, `publish_release`).
