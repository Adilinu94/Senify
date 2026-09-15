# Section-Library v1 & Registry

Type: grilling
Status: resolved
Blocked by: 01, 03, 07

Input: research/20-referenzprojekte.md
Input: research/22-framer-analyse.md
Input: artifacts/01-datenmodell.md
Input: artifacts/02-renderer.md
Input: artifacts/03-motion-3d.md
Input: artifacts/07-tokens.md
Input: prototypes/scroll-3d/README.md
Input: issues/21-site-profile-und-intensitaet.md

## Question

Welche Sektionen umfasst v1 (Auswahl + Umfang, z. B. Hero, Features, Logo-Cloud, Testimonial, Pricing, FAQ, CTA, Footer …), welche Props/Varianten/Motion-Presets hat jede, und wie ist der Registry-Eintrag formal aufgebaut (Schema, Defaults, erlaubte Kinder, Preview)?

Ergebnis: spezifizierter Katalog, auf dem Renderer, Editor und Agenten arbeiten.

## Answer

Section-Katalog entschieden (6/6 Wizard; Katalog bewusst erweitert). Artefakt: [artifacts/08-section-library.md](../artifacts/08-section-library.md).

- **25 Sektionen** (Kern 18 + Zusatz: newsletter, divider, embed, timeline, comparison, cookie-note, marquee) × **2–3 Varianten** (~55–60 gesamt).
- **Self-contained + sparsame Slots** (`hero.visual` als Pilotfall); Registry-Regeln streng.
- **Style-Props frei** — Werte bevorzugt als Token-Referenzen; Hard-Guardrails (03) + Review (06) fangen Drift.
- **Registry-Format:** TypeBox-Validierung + UI-Metadaten in EINEM Schema (Control, min/max/step, Optionen, `hidden`) → Editor-UI wird generiert.
- **Golden-Beispiel + Thumbnail** je Sektion/Variante (Agenten-Interface + Eval-Basis).
- **Bau-Reihenfolge in 4 Wellen:** Gerüst → Überzeugung → Konversion → Zusatz.

Inputs verdrahtet: 09, 10, 11, 13, 21.
