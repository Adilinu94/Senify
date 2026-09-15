# 05: Renderer & Bake (Astro)

**What to build:** Der Renderer der generierten Sites: Astro-7-SSG-Bake aus Draft/NodeTree + Theme → statische Artefakte (HTML/CSS/JS). Sektionen als React-Komponenten aus dem Section-SDK mit zentralem Dispatcher für Hydration (markup-first, 0-KB-JS-Baseline; nur echte Interaktion/3D hydratisieren), deklarative Motion-Auswertung von `node.motion` im Page-Script-Layer (GSAP/Lenis) für die Basis-Presets (Kategorien A–C), sowie das AEO-Minimum als Build-Output (semantisches HTML, `.md`-Versionen, `llms.txt`, Sitemap, Robots). Bake-Test-Harness an Prüfstelle 2 mit Golden-Fixtures.

**Blocked by:** 02 (Site & Pages + Mutations), 03 (Section-Library), 04 (Theme & Tokens).

**Status:** ready-for-agent

- [ ] Fixture-Release (Golden-Sektionen + Theme) baut als statische Site; Produktions-Bake enthält keine Draft-Daten
- [ ] Semantisches HTML (Section-Tags, Heading-Hierarchie) + `node.motion`-Konfiguration wird deterministisch in Page-Script-/CSS-Output übersetzt (A–C-Presets)
- [ ] AEO-Minimum pro Site: `.md` je Seite, `llms.txt`, Sitemap, Robots (abschaltbar)
- [ ] Hydration-Dispatcher entscheidet pro Node über Islands; Basis-Site bleibt bei 0 KB JS ohne Interaktion
- [ ] Bake-Harness (Prüfstelle 2) prüft Artefakte: HTML-Struktur, Routen, AEO-Dateien, Motion-Config

Quellen: `artifacts/02`, `artifacts/03` (Presets A–C), `artifacts/13` (AEO-Set), Spec „Modul-Landkarte: renderer".
