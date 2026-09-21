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
- Wiederkehrende Bausteine als Komponente: `list_components` → `get_component` (Parts, Slots, Instanzen) → `set_component_override` ändert nur die eine Instanz. Versionen: `bump_component_version` hebt die Definition an, `update_component_instances` zieht abweichende Instanzen in einem Batch nach (Drift zeigt `get_component.drift`).

## 5. Styling und Layout

- Sektions-Styles (`background`, `textColor`, `paddingY`, `contentWidth`, `align`), Innenteile (`card*`, `button*`, `heading*`, `media*`, `link*`) und Layout-Regler (`columns`, `gap`, `reverse`, `aspect`).
- Tablet/Mobil über `setBreakpointOverride` feinjustieren.
- Rohwerte nur als bewusste Ausnahme (Warnung beachten).

## 6. Inhalt und Qualität

- Texte konkret und kurz; keine Floskeln, keine Platzhalter auf der Zielseite.
- Bilder: Beschaffungs-Flow in `assets.md`; Alt-Texte sind Pflicht (dekorativ = leer, bewusst).
- Motion sparsam: Presets statt Effektfeuerwerk, Intensität passend zum Site-Profil.
- Struktur prüfen: Heading-Hierarchie, Link-Ziele, keine leeren Listen.

## 7. Prüfen, Review, Veröffentlichen

- Zwischenstand ansehen: `create_preview` liefert eine signierte URL (30 Tage) — echte Draft-Builds, keine Simulation.
- Einreichen: `submit_for_review` prüft hart (Guardrails, Links, Alt-Texte, Kontrast). Ein Verstoß kommt als Guardrail-Fehler zurück, kein Review-Item.
- Feedback lesen: `get_review_feedback` zeigt Status und den Notiz-Thread. „Request changes" heißt: nachbessern und erneut einreichen.
- Live schalten und zurückrollen: `publish_release` / `rollback_release` (publish-Scope, beim Betreiber). Alte Seitenstände holt `restore_revision` als neuen Draft zurück.

## 8. Übergabe

- Zusammenfassung: was gebaut, welche Entscheidungen, was offen.
- Änderungen sind im Audit sichtbar; nach jeder Freigabe entsteht ein Release mit Revisionen aller Seiten und Theme-Snapshot.
