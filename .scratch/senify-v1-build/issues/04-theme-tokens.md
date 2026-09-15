# 04: Theme & Design-Tokens

**What to build:** Das Token-System: zwei Ebenen (Primitive → Semantik) über 6 Skalen (Farbe, Typo, Spacing, Radius, Shadow, Motion), Skalen-Engine (Shade-Scale, fluide Typo-Skala, Springs als `linear()` + JS-Spring) mit einzeln überschreibbaren Werten, Light/Dark strukturell, DTCG-nahes JSON als Quelle → CSS-Variablen + Tailwind-v4-Theme, kuratierte Fonts self-hosted (woff2, preload, `font-display: swap`). Theme-Operationen (get/update_theme) laufen kanonisch, agententauglich und landen im Audit; ein „Theme-Draft" ist vorführbar im Bake.

**Blocked by:** 03 (Section-Library).

**Status:** ready-for-agent

- [ ] Theme-JSON (primitives/semantic/modes/fonts/motion) ist Gesamtquelle; Build erzeugt CSS-Variablen und Tailwind-Mapping 1:1
- [ ] Skalen-Engine generiert Farbskalen/fluide Typo/Spacing-Stufen aus wenigen Eingaben; Overrides gewinnen einzeln
- [ ] Light/Dark über semantische Rollen + `data-theme` schaltbar (Site kann Light-only bleiben)
- [ ] Sektionen referenzieren nur semantische Rollen (Gate: keine Roh-Hex-Werte in Props) — Verstöße werden im Report gelistet
- [ ] `get_theme`/`update_theme` funktionieren über die Engine-API mit Audit; Fonts sind self-hosted im Build
- [ ] Kontrast-Checks gegen Token-Paare sind ableitbar (Grundlage für die Check-Pipeline)

Quellen: `artifacts/07`, Spec „Token- & Theme-System".
