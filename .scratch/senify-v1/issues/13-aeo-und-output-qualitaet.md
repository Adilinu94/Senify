# AEO & Output-Qualität

Type: grilling
Status: resolved
Blocked by: 02

Input: artifacts/02-renderer.md
Input: artifacts/03-motion-3d.md
Input: artifacts/06-approval.md
Input: artifacts/07-tokens.md
Input: artifacts/08-section-library.md

## Question

Wie wird jede generierte Site agenten- und sucherfreundlich: llms.txt + `.md`-Varianten, Structured Data, semantisches HTML?

Und welche automatischen Qualitäts-Gates laufen vor Publish (a11y, Kontrast, Performance-Budget, Responsive-Screenshots)? Ergebnis: Check-Katalog + wo er im Lifecycle greift.

## Answer

AEO & Checks entschieden (4/4 Wizard). Artefakt: [artifacts/13-aeo-quality.md](../artifacts/13-aeo-quality.md).

- **AEO-Set Standard:** llms.txt + `.md` je Seite + Structured Data + semantisches HTML + Sitemap/Robots (pro Site abschaltbar) — „agent-ready by default".
- **Structured Data:** Basis automatisch + Sektions-Beiträge (z. B. FAQ → FAQPage), validiert.
- **Check-Härte:** HART = interne Links, Alt-Texte, Kontrast AA, Titel/Meta, JSON-LD, Motion-Guardrails; WEICH = Lighthouse/CWV, Bundles, externe Links; INFO = Screenshot-Abweichungen.
- **Timing:** dreistufig — Schreiben → Submit → Publish (Defense-in-Depth).
- **Datenmodell-Erweiterung:** `Page.meta {title?, description?, ogImage?}` — Artefakt 01 wird ergänzt.

Inputs verdrahtet: 14.
