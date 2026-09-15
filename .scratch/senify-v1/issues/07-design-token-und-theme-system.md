# Design-Token- & Theme-System

Type: grilling
Status: resolved
Blocked by: 01

Input: research/20-referenzprojekte.md
Input: research/22-framer-analyse.md
Input: artifacts/01-datenmodell.md
Input: artifacts/03-motion-3d.md

## Question

Welche Token-Ebenen (Primitives → Semantik) und Skalen (Farbe, Typo, Spacing, Radius, Shadow, Motion) definieren wir, wie wird pro Site ein Theme gebunden (hell/dunkel?), und wie nutzen Sektionen und Editor die Tokens?

Format: CSS-Variablen, JSON oder beides?

## Answer

Token-System entschieden (6/6 Wizard). Artefakt: [artifacts/07-tokens.md](../artifacts/07-tokens.md).

- **Zwei Ebenen** (Primitives → Semantik) über **6 Skalen**: Farbe, Typo, Spacing, Radius, Shadow, Motion.
- **Skalen-Engine:** ein Brand-Token → Shade-Scale; Basis + Ratio → fluide Typo-/Spacing-Skalen; Einzelwerte überschreibbar (Core-Framework-Muster).
- **Light/Dark strukturell** von Anfang an (semantische Rollen mappen pro Modus).
- **Format:** JSON (DTCG-nah; Springs als eigener Typ, löst Research-18-Frage) → Build erzeugt CSS-Variablen + **Tailwind-v4-Theme**.
- **Fonts:** kuratierte Auswahl, im Build self-hosted.
- **Regel:** Sektionen und Agenten referenzieren nur semantische Rollen — keine Rohwerte (Gate).

Inputs verdrahtet: 08, 09, 10, 13.
