# GSAP + ScrollTrigger als Choreografie-Kern (Motion nur für State)

Status: accepted · 14.09.2026

Die Sites sollen Framer-Niveau als Minimum und Awwwards/3D als Ziel erreichen, mit agentisch generierten Sektionen. **Entscheidung:** Scroll-Choreografie (Pin, Scrub, Sequenzen) läuft ausschließlich über **GSAP + ScrollTrigger**; CSS + native Scroll-Timeline bilden die JS-freie Baseline; **Motion (React)** ist ausschließlich für zustandsbasierte UI-Motion erlaubt (Modals, Tabs, Accordion). Agenten wählen typisierte Motion-Specs (Preset + Intensity-Dial + Tokens) — es wird **kein freier Motion-Code generiert**.

**Betrachtete Optionen:**
- *Motion für alles* — entspricht dem React-/LLM-Bias, aber Scroll-Pinning und gescrubbte Sequenzen bleiben nachweislich GSAP-Territorium; außerdem mehr JS überall.
- *Nur GSAP/CSS ohne Motion* — ein System weniger, aber schwächere DX für UI-State-Motion.
- *Frei generierte Animations-Codeschnipsel* — Qualitäts- und Konsistenzbruch; verworfen (Kern der Preset-Philosophie).

**Konsequenzen:**
- Presets enkodieren GSAP-Konfigurationen; ein Engine-Wechsel wäre ein Rewrite aller Preset-Implementierungen (schwer umkehrbar).
- Die Guardrails (max 1 Pin-Preset/Seite, max 2 Parallax-Layer, keine Scroll-Listener) sind maschinell validierbar, weil die Engine dokumentierte, deterministische Regeln hat.
- Offizielle GSAP-Agent-Skills (frei) liefern die Guardrails als Vorlage für Senifys eigene `senify-motion`-Skills.
- Referenz: `.scratch/senify-v1/artifacts/03-motion-3d.md` (Stack, Preset-Katalog, Budgets).
