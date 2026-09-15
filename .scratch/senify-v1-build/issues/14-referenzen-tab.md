# 14: Referenzen-Tab (Analyse → Design-Profil)

**What to build:** Vollautomatische Website-Analyse für Design-Referenzen. Pipeline im `analysis-worker`: ① Governance/Provenance (URL, Datum, Hash) → ② Capture (Playwright headless: Desktop 1440 / Tablet 810 / Mobile 390, Full-Page- + Sektions-Screenshots, DOM-Dump, Asset-Liste, Motion-Sampling; Job mit Fortschritt; Fallback: Screenshot-Upload bei blockierter Seite) → ③ deterministische Extraktion → ④ KI-Analyse (Familien-Klassifikation, Vokabular, Komponenten-Inventar, Motion-Rezepte, Kompositionsregeln, Evidenz + Konfidenz, keine erfundenen Werte) → ⑤ Design-Profil (JSONB) mit Stil-Blatt, sofort nutzbar. **Umsetzungsbasis `research/29` (site-clone, MIT):** die Probe-Scripts tokens/motion/surface werden adaptiert (Frequenz-Prinzip + Belegstellen, GPU-/Video-/SVG-Routing, Lazy-GPU-Warnung); Evidenz-Stufen `confirmed | observed | inferred` mit „never upgrade"-Regel; Motion-Reveals mappen auf den Preset-Katalog (03). Tab-UI: Karten (Vorschaubild, Familien, „verwendet in N Projekten"), Detailansicht (Token-Swatches, Typo-Skala, Komponenten, Motion, Snapshots, Provenance, Nachbearbeitung → neue Profil-Revision). Wiederverwendung: Projekt-Zuordnung mit Skalen-Zuordnung je Skala (Farben/Typo/Motion/Rest; Default eine Referenz für alles), Theme-Ableitung Profil → Senify-Theme (Verifikation: Anwenden ändert nichts). MCP-Tools `analyze_reference`, `list_references`, `get_reference`, `apply_reference`. Schutzregeln „Inspiration, kein Klon" (Logos/Marken/Originaltexte/Fotos/1:1 nie übernehmen; Lizenz-Font-Hinweis; Nähe-Warnung weich).

**Blocked by:** 04 (Theme & Tokens — Theme-Ableitung), 07 (Lifecycle, Review & Checks — QA-Adhärenz weich), 12 (Programm-Shell — Tab).

**Status:** ready-for-agent

- [ ] URL → Analyse-Job → Profil mit Status analyzing/ready/failed; Fortschritt sichtbar; Ergebnis ist sofort in Projekten nutzbar
- [ ] Token-Extraktion frequenz-gerankt mit Belegstellen (uses + where); Typo/Spacing/Radii/Shadows/Breakpoints je Breakpoint; `:root`-Vokabular der Referenz als Mapping-Hinweis erkannt
- [ ] Motion-Sampling liefert Reveal-/Effekt-Inventar mit exakten Runtime-Params und mappt auf die Presets (03); GPU-Flächen (webgl-scene-Hinweise) erkannt; Lazy-GPU-Warnung, wenn Plattform ohne lebende Canvas
- [ ] Evidenz: jede Aussage `confirmed | observed | inferred` + Quelle; nichts wird hochgestuft; Widersprüche markiert
- [ ] KI-Analyse: Familien (18er-Taxonomie), Vokabular (5–8 prompt-fähige Begriffe), Komponenten, Regeln (constants/never), Stil-Blatt (maschinenlesbar)
- [ ] Tab-UI: Karten + Detail (Swatches, Typo, Motion, Snapshots, Provenance) + Nachbearbeitung erzeugt Profil-Revision; Löschen mit Nutzungs-Hinweis
- [ ] Skalen-Zuordnung: Referenz(en) im Projekt wirken als Theme-Draft (Skalen-Engine 04); Anwenden ändert den Bake nachweislich nicht (Round-Trip-Verifikation)
- [ ] MCP-Tools `analyze_reference`/`list_references`/`get_reference`/`apply_reference` funktionieren (Prüfstelle 3: „Referenz → Theme → Build"-Workflow)
- [ ] Schutzregeln in UI + Skill-Material; weicher Adhärenz-Hinweis im Review; blockierte Seite → Fallback-Upload mit reduziertem Profil

Quellen: `artifacts/28`, `research/29-site-clone-learnings.md` (Umsetzungsbasis), `research/27` (taste-vault), `artifacts/07` (Theme-Ableitung), Spec „Referenzen-Pipeline (Verträge)".