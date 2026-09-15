# Referenzen-Tab: Design-Analyse & Wiederverwendung

Type: grilling
Status: resolved

Input: research/27-taste-vault-learnings.md
Input: research/22-framer-analyse.md
Input: artifacts/07-tokens.md

## Question

Wie funktioniert der Referenzen-Tab: fremde Website (z. B. apple.de) → **volles Design-Profil** → Sites „im Stil von X"?

- **Analyse-Pipeline:** Playwright-Capture (3 Breakpoints: Screenshots + DOM + Computed Styles + Fonts + Farben) + Motion-Sampling (Scroll-Choreografie beobachten?) + LLM-Deutung (MCP-Skill) — welche Stufen automatisch, was macht der Agent?
- **Design-Profil-Format:** Tokens (Farbe/Typo/Spacing/Radius/Motion) → Senify-Theme (Artefakt 07) + **Stil-Guide** (Markdown: Layout-Muster, Komponenten-Anmutung, Bildsprache; Look-Pakete nach taste-vault-Muster: deployFor/risk/accent/imageStyle, House DNA + Never-Liste).
- **Wiederverwendung:** Theme + Guide als wählbare Referenz beim Site-Anlegen; „im Stil von X" im Master-Flow (Artefakt 11); Guide in die generierten Skill-Referenzen.
- **Guardrail:** „family resemblance, not clone" — keine Assets/Texte/Layouts 1:1; rechtliche Leitplanken im Produkt verankern (ToS/Marken).
- **Verwaltung:** Referenz-Karten im Tab (Thumbnail, Quelle, Datum, Nutzung), Aktualisieren/Löschen, Provenance.
- **MCP-Tools:** `analyze_reference` · `list_references` · `get_reference` · Theme-Anwendung über bestehendes `update_theme`?

Ergebnis: Referenzen-Konzept v1 (Pipeline + Profil-Format + Wiederverwendung + Guardrails).

## Answer

**Entschieden am 15.09.2026 (Wizard, 6/6) — Artefakt: [artifacts/28-referenzen-tab.md](../artifacts/28-referenzen-tab.md)**

- **Vollautomatisch:** URL eingeben → Job (Governance → Playwright-Capture 3 Größen + Motion-Sampling → deterministische Extraktion → KI-Analyse) → **Design-Profil ist sofort nutzbar**; im Tab einsehbar, Nachbearbeitung optional (jede Änderung = neue Profil-Revision). Fallback: Screenshot-Upload, falls die Seite blockt.
- **Volles Designsystem:** Tokens (DTCG-nah) + Komponenten-Inventar + Bewegung + Regeln (Do/Don't, House-DNA-Muster) + Stil-Blatt (Englisch, maschinenlesbar; UI Deutsch) + Evidenz/Konfidenz + Provenance.
- **Wiederverwendung:** im Projekt wählbar; **mehrere Referenzen kombinierbar über Skalen-Zuordnung** (Farben von A · Schriften von B · Bewegung von C; Default: eine für alles); Theme-Ableitung über die Skalen-Engine (07); `get_reference` liefert den Agenten-Brief (11); Style-Adhärenz als weicher Check (13).
- **Keine Re-Analyse** (Entscheidung 5): neue Referenz statt Update; Löschen mit Nutzungs-Hinweis.
- **Schutzregeln:** Logos, Marken-Assets, Originaltexte, Fotos und 1:1-Layouts nie übernehmen; „too close"-Repair-Hinweis; Snapshots nur intern, Herkunft dokumentiert.
- **MCP:** `analyze_reference` (write) · `list_references`/`get_reference` (read) · `apply_reference` (write).
