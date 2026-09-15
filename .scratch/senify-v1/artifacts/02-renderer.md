# Artefakt 02: Renderer-Architektur (Senify v1)

> Entschieden am 14.09.2026 in Ticket „Renderer der generierten Sites".
> Grundlagen: `research/17-renderer.md` (35 Quellen), `research/20-referenzprojekte.md`, `artifacts/01-datenmodell.md`.

## Entscheidungen (Wizard-Runde)

1. **Renderer-Basis:** Astro 7 (SSG-first, Islands) mit React-Sektionen.
2. **Render-Modus:** vollstatisch pro Release (Bake + atomarer Swap; keine Runtime).
3. **Sektionen:** Markup-first + deklarative Motion-Config (`node.motion`); kein Client-Effekt-Code in Sektionen.
4. **Previews:** echte Draft-Builds (Parität Preview = Publish).
5. **Editor:** separate React-App (Puck-Basis), renderer-neutral, geteiltes Section-SDK.
6. **Renderer-Wechsel-Option:** Sektionen bleiben React + agnostisches SDK; kein Astro-Code in Sektionen, keine Adapter von Tag 1.
7. **3D:** scroll-gekoppelter Shared-State (Kamera folgt Scroll) — bewusst ambitioniert; De-Risking über Prototype-Ticket 20.

## Rendering-Pipeline

```
Draft (NodeTree + Theme) → Astro-Build → statisches Artefakt (HTML/CSS/JS)
                          → Preview-URL (Draft) bzw. Publish → Release (atomarer Swap, Ticket 14)
```

- **Section-Auflösung:** Renderer mappt `node.type` → React-Komponente aus dem **Section-SDK** (Registry; Details Ticket 08). Deprecation-Regeln aus Artefakt 01 gelten auch hier.
- **Dispatcher-Pattern:** `client:*`-Direktiven sind compiler-zeitlich statisch → eine zentrale Dispatcher-Komponente (bzw. Custom Client Directive) entscheidet pro Node über Hydration. Sektionen selbst bleiben frei von Renderer-Code.
- **Tokens:** Theme → CSS-Variablen im Build (Details Ticket 07).

## Hydration & Motion

- Default: statisches HTML, **0 KB JS**; hydratisiert wird nur echte Interaktion und 3D.
- **Page-Script-Layer** (pro Seite, vanilla): GSAP + ScrollTrigger + Lenis werten `node.motion` deklarativ aus — Motion braucht **keine** React-Hydration (Preset-Katalog → Ticket 03).
- **Cross-Sektion-Koordination** (das zentrale Risiko): ein **Page-Controller** + leichter Shared-Store (z. B. Nanostores) verbindet Page-Scripts und Islands; feste Patterns für Lenis↔ScrollTrigger-Sync, View-Transitions-Cleanup, Hydration-Race-Guards.
- **3D:** **ein persistenter WebGL-Canvas pro Seite** (keine vielen Canvases — Kontext-Limits), scroll-getrieben über den Page-Controller; R3F-Island lazy (`client:only`, unterhalb des Folds); Fallbacks: `prefers-reduced-motion`, Mobile-Downgrade.
- **Performance-Realität:** Motion-Sites erreichen realistisch Lighthouse **80–90** — Budgets pro Seitentyp kalibrieren (Ticket 13), nicht 100 erwarten.

## Editor & Preview

- Editor bleibt eigene React-App und nutzt **dieselben Section-Komponenten** wie der Build (Section-SDK).
- Previews sind **echte Draft-Builds** (Iframe/URL) → was approved wird, ist der Build.
- Approval-Queue arbeitet auf Build-Screenshots (Tooling → `research/19-approval-tooling.md`).

## Build-Topologie

- **Site-Bake pro Release**; Annahme: Marketing-Site-Größen 10–100 Seiten (Builds im Sekundenbereich).
- Inkrementelle Builds: späteres Optimierungsthema (kein v1-Blocker).

## Konsequenzen für andere Tickets

- **14 (Hosting/Deploy):** Renderer liefert reine Datei-Artefakte → Hosting frei wählbar (Cloudflare-Pfad first-class); Rollback = Re-Deploy einer Revision.
- **13 (AEO/Qualität):** Budgets + Lighthouse-Kalibrierung 80–90; Screenshot-Gates auf Build-Previews.
- **03 (Motion/3D):** Presets müssen Page-Script-fähig sein; 3D-Choreografie über Prototype 20 de-risken.
- **08 (Library):** Sektionen = React + Props/Slots + Motion-Presets; keine Client-Effekte in Sektionen.
- **09 (Editor):** nutzt das Section-SDK; renderer-neutral.

## Fallback-Kriterien (Next.js) — bewusst dokumentiert

Wenn (a) Seiten absehbar app-artig werden (Auth, State, viele interaktive Widgets), (b) bewusst EIN React-Tree statt Island-Orchestrierung gewünscht ist, oder (c) Draft-Rendering ohne Build auf Vercel-Infrastruktur zwingend wird → **Next.js 16 + Cache Components**; dann Baseline-JS akzeptieren und Budgets anpassen.

## Risiken & Mitigationen

| Risiko | Mitigation |
|---|---|
| Direktiven-Limit (JSON → Hydration) | Ein zentraler Dispatcher im Section-SDK (eine Stelle statt pro Sektion) |
| Cross-Island-Choreografie & geteilter 3D-State | Page-Controller + Shared-Store; **Prototype-Ticket 20** |
| View-Transitions-/Hydration-Bugs | Feste Patterns (Sync, Cleanup, Click-Race) + Regressionstests |
| Island-Soup | Markup-first; nur echte Interaktion/3D hydratisieren |
| LLM-Bias Richtung React/Next | Registry limitiert Generierungsfreiheit; Astro-Agent-Features (JSON-Logs, Background-Dev-Server) nutzen |
