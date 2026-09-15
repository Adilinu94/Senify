# Research: Renderer — Astro vs. Next.js vs. eigener React-Renderer

> **Ticket:** 17 (Research: Renderer) · **Verknüpft:** 02 (Renderer der generierten Sites), 14 (Hosting & Deploy), 18 (Motion/3D)
> **Stand:** 14. September 2026 · **Quellenbasis:** offizielle Docs, Release-Blogs, Benchmarks, Praxisberichte 2025/2026 (Links unten)
> **Frage:** Womit werden agent-generierte, motion-/3D-lastige Marketing-/Kundensites gerendert: Astro, Next.js oder ein eigener React-Renderer? Seiten liegen als JSON-Baum aus registrierten Sektionen vor. Qualitätsziel: Framer-Niveau als Minimum, Awwwards/3D als Ziel.

---

## Executive Summary

Der Renderer-Markt hat sich 2026 klar positioniert: **Astro ist das SSG-first-Framework für Content-Sites mit selektiver Interaktivität** (Top-Zufriedenheit im State-of-JS-2025, Cloudflare-Übernahme Januar 2026, Version 7 mit Rust-Compiler und bis zu 61 % schnelleren Builds). **Next.js 16 ist das ausgereifte Full-React-App-Framework** (RSC, Turbopack, Cache Components/PPR, DevTools-MCP), trägt aber strukturell mehr JavaScript, hat komplexere Caching-/Self-Hosting-Modelle und verliert in der Entwicklerzufriedenheit deutlich gegenüber Astro. Für Senify (Marketing-Sites aus JSON-Sektionen, hoher Motion-/3D-Anteil, Agenten als Autoren, Preview-lastiger Workflow) sprechen die stärksten Argumente für **Astro als primären Site-Renderer mit React-Sektionen**: 0-KB-JS-Baseline für statische Sektionen, Page-Level-Script-Layer für GSAP/Lenis, R3F als `client:only`-Islands, sehr schnelle Builds/Previews und exakt das Plattform-Muster, das Webflow Cloud und Wix Vibe (beide Astro auf Cloudflare) bereits produktiv fahren. Die zwei echten Gegenargumente sind (a) die statisch deklarierten Hydration-Direktiven bei JSON-getriebenen Seiten (Dispatcher-Pattern nötig) und (b) fehlende cross-island-Koordination für globale Scroll-Choreografien (Page-Scripts/Nanostores nötig). **Ein eigener React-Renderer ist für v1 nicht zu empfehlen** — Webstudio/Builder.io/Cloudflares vinext zeigen, dass es machbar ist, aber man besitzt dann selbst Routing, Hydration, Caching, Preview und Editor-Glue. Empfehlung: Astro als Renderer, Motion-Runtime und Section-Registry bewusst framework-agnostisch kapseln (Ausweg Next.js offenhalten).

---

## 1. Ausgangslage & Bewertungskriterien

Senify v1 (internes Werkzeug, laut `map.md`):

- Seite = JSON-Baum aus **registrierten Sektionen** (Props + Slots + Tokens), kein freier Code pro Site
- Qualitätslatte: **Framer-Niveau Minimum**, Awwwards/3D als Ziel → viel Motion (GSAP/ScrollTrigger/Lenis), 3D (React Three Fiber)
- Agenten erzeugen und iterieren; kurze Build-/Preview-Zyklen sind Teil des Produkts
- Draft → Preview-URL → Approval → Publish, Rollback pro Version
- TS-Stack; Hosting offen (Ticket 14)

Daraus ergeben sich die Kriterien: Build-/Preview-Zeit, Hydration-Modell für Motion/3D, SSG/ISR/Edge, dynamische Inhalte, Deploy-Modelle, Datenfluss JSON→Komponenten, Bundle/Performance, DX mit TypeScript.

## 2. Framework-Landschaft 2026 (Versionsstand)

- **Astro 7.0** (Juni 2026): `.astro`-Compiler in Rust, Markdown/MDX-Pipeline in Rust (Sätteri), queued Rendering (~2,4× schneller), Vite 8 mit Rolldown-Bundler → **Builds 15–61 % schneller**; Route Caching stabil, experimentelle CDN-Cache-Provider (Netlify/Vercel/Cloudflare); Advanced Routing (`src/fetch.ts`); explizite **Agenten-Features** (Agent-Detection, `astro dev --background` mit Lockfile und `/_astro/status`, JSON-Logs). [1]
- **Next.js 16** (Okt. 2025; 16.3.x im Aug. 2026): **Turbopack Default** (2–5× schnellere Builds, bis 10× Fast Refresh), **Cache Components** (`"use cache"` + PPR), Next.js **DevTools MCP** für Agenten, `proxy.ts` ersetzt `middleware.ts` (Node-Runtime), React 19.2, Build Adapters API (alpha). [2][3]
- **Cloudflare übernimmt das Astro-Team** (16. Jan. 2026): Astro bleibt MIT-lizenziert und offen (public roadmap/open governance); Astro 6 brachte Vite-Environments-Dev-Server, stabile **Live Content Collections** (Echtzeit-Daten ohne Rebuild), CSP, Zod 4. Wichtig: **Webflow Cloud und Wix Vibe lassen Kunden-Sites auf Astro bauen und deployen**, ebenso generiert Stainless Astro-Projekte. [4]
- **State of JS 2025:** Next.js dominiert die Nutzung, verliert aber Satisfaction — **39-Prozentpunkte-Lücke zum Spitzenreiter Astro**; Meta-Framework-Pain-Points: Komplexität, SSR, Performance, Breaking Changes, Deployment, Lock-in. [5]
- **Vite 8** (Rolldown als einheitlicher Rust-Bundler) ist die gemeinsame Tooling-Basis von Astro 7; Cloudflares **vinext** (Next.js-API-Reimplementierung auf Vite) demonstriert die Zugkraft. [1][16]

## 3. Build- und Preview-Zeiten

**Astro:**

- Offizielle Astro-7-Benchmarks (M4 Pro): `docs.astro.build` (6.313 Seiten) 114,54 s → 73,53 s; `developers.cloudflare.com` (8.431 Seiten) 386,89 s → 261,94 s; `astro.build` (308 Seiten) 62,70 s → 24,24 s. [1]
- Praxisbericht (Aug. 2026): Site mit 4.000+ Seiten, **warmer Astro-Build 16,6 s**, nach Optimierung 12,5 s (u. a. `build.concurrency`, weniger OG-Images). [6]
- Unabhängiger SSG-Benchmark (Mai 2026, 100.000 Seiten, reiner Static-Export): **Astro 22,6 s / 47 MiB Output** vs. **Next.js 264,5 s / 1,84 GiB** (RSC-Payload-Sidecars + Runtime-Tax); bei 200.000 Seiten **crasht Next.js' Static-Export** (RangeError, V8-Rekursion bei `generateStaticParams`). Einschränkung: Autor ist Autor von `@lazarv/react-server` (disclosed); Next.js' eigentliche Antwort auf große Kataloge ist ISR, nicht Static-Export. [7]
- Für Senifys Zielgröße (Marketing-Sites, typischerweise 10–100 Seiten) sind alle Kandidaten schnell; der Unterschied materialisiert sich in **Preview-Builds pro Agent-Iteration** und in der Deploy-Artefaktgröße.

**Next.js:**

- Turbopack stabil: **2–5× schnellere Produktions-Builds**, bis 10× Fast Refresh; Filesystem-Caching (Beta) für große Apps. [2]
- Static Export skaliert laut Benchmark schlechter (siehe oben) und bleibt funktional eingeschränkt (ISR, Draft Mode, Server Actions, `proxy.ts`, Cookies, Default-Image-Loader **nicht verfügbar**). [8]

**Agent-/Dev-Loop:**

- Astro 7 erkennt Coding-Agents, startet den Dev-Server im Hintergrund (idempotent, Lockfile, Health-Endpoint, JSON-Logs) — gezielt für agentische Workflows gebaut. [1]
- Next.js bietet DevTools MCP (Routing-/Caching-/Rendering-Wissen, Server- und Browser-Logs, Stacktraces) und schnellere HMR. [2]

## 4. Islands vs. Full-React: Hydration für GSAP/ScrollTrigger/R3F

**Mechanik:** Astro liefert pro Seite statisches HTML; nur explizit markierte Islands (`client:load|idle|visible|only`) hydrieren. Next.js (App Router) sendet immer den React-Runtime-Rahmen und hydriert Client-Components; RSC spart nur Server-Code aus dem Bundle. [9][10][11]

**GSAP/ScrollTrigger:**

- GSAP ist framework-agnostisch und braucht **keine** React-Hydration. In Astro wird es üblicherweise als Page-Level-/Hoisted-Script initialisiert; in Next.js via Client-Component + `useGSAP()`. [12][13]
- Bekannte Astro-Fallstricke (Praxisbericht Aug. 2026): (1) ScrollTrigger feuert nicht → Lenis↔ScrollTrigger-Sync (`lenis.on("scroll", ScrollTrigger.update)` + `gsap.ticker`), (2) Bilder faden als leere Boxen ein (Decode abwarten), (3) **Hydration-Race:** `client:visible`-Islands haben ein Fenster, in dem Klicks verloren gehen (Button bis Hydration disablen), (4) SEO/Lighthouse-Hausaufgaben. Realistische Lighthouse-Scores mit echter Motion: **80–90 statt 100**. [14]
- Astro View Transitions (ClientRouter) erfordern Cleanup/Re-Init von Lenis/ScrollTrigger (`astro:before-swap`/`astro:after-swap`); GSAP-Forum bestätigt die Ursache auf Astro-Seite. [15][12]

**React Three Fiber:**

- Astro: Canvas als React-Island mit **`client:only="react"`** (skip SSR; Three.js braucht Browser-APIs). [17]
- Next.js: Canvas als Client-Component, dynamischer Import mit **`ssr: false`**, um Hydration-Fehler zu vermeiden. [18]
- Beide Wege sind etabliert; der Unterschied liegt in der Umgebung um den Canvas: Next.js hat einen durchgehenden React-Tree (Context/State über Sektionen hinweg einfach), Astro hat unabhängige Islands (State nur über Stores wie Nanostores). [10][11]

**Kritische Einordnung (Enterprise-UI, März 2026):** „Wenn die meiste Fläche interaktiv und eng gekoppelt ist, kämpft man gegen die Islands-Architektur"; und: „Islands eliminieren JavaScript nicht — interaktive Islands kosten Bundle und Execution." Das trifft motion-/3D-lastige Seiten teils, **aber** Motion ist in der Praxis vanilla-fähig (Page-Scripts), sodass nur echte Interaktivität/3D hydriert werden muss. [11]

**JSON-Baum-Besonderheit in Astro:** `client:*`-Direktiven sind compiler-zeitlich statisch; dynamische Direktiven pro JSON-Node sind nicht nativ möglich (Roadmap-Discussion seit 2024). Workarounds: Dispatcher-Komponente (beide Varianten im Code, Auswahl per Prop), **Custom Client Directives** (seit Astro 2.6; z. B. `client:if`) oder Motion komplett in Page-Scripts. Das ist der wichtigste Implementierungs-Sonderfall für Senifys Registry-Renderer. [19][20]

## 5. SSG/ISR/Edge & dynamische Inhalte

**Astro:** Default statisch (per Route umschaltbar via SSR-Adapter). **Server Islands** mischen gecachtes HTML mit dynamischen Fragmenten; **Route Caching** (stabil in 7) mit `Astro.cache.set`, Tags und `cache.invalidate()`; CDN-Provider für Netlify/Vercel/Cloudflare (experimentell, werden künftig automatisch aktiviert); **Live Content Collections** (stabil in 6) holen Daten zur Request-Zeit ohne Rebuild. Damit ist ein ISR-ähnliches Modell ohne Next.js möglich. [1][4][21]

**Next.js:** ISR nativ, **Cache Components/PPR** kombinieren statische Shell mit gestreamten dynamischen Teilen; `revalidateTag(tag, profile)`/`updateTag()`; Draft Mode für Preview ohne Rebuild. PPR ist inzwischen über die Cache-Components-Konfiguration aktivierbar (`cacheComponents: true`); laut PPR-Platform-Guide brauchen Plattformen dafür Shell + `postponedState`-Handling (Resume-Protocol, CDN-Shell + Origin-Compute). [2][22][8]

**Static Export (beide):** Astro-Output ist reine Datei-Ausgabe (überall hostbar). Next.js' `output: "export"` verliert ISR, Draft Mode, Server Actions, Proxy, Redirects/Rewrites, Image-Optimization-Default und mehr — für Preview-Workflows relevant. [8]

## 6. Deploy-/Hosting-Modelle

- **Astro:** statisch auf jedem Webserver/CDN (S3, nginx, Cloudflare Pages, GitHub Pages); SSR über Adapter (Node, Cloudflare, Vercel, Netlify). Durch die Cloudflare-Übernahme ist die Cloudflare-Path (Workers, R2, KV/D1, Agents) besonders eng — und **genau dieses Modell fahren Webflow Cloud und Wix Vibe für ihre Kunden-Sites**. [4]
- **Next.js:** Zero-Config auf Vercel mit tiefer Integration (ISR, Image-Optimization, Preview-Deployments); Self-Hosting möglich, aber mit echter Betriebslast: Cache-Handler für Multi-Instance-Koordination, `refreshTags()` für verteilte Tag-Invalidierung, Deployment-ID/Version-Skew, Encryption-Key für Server Functions, Streaming-Anforderungen bis zum Proxy. Einzelinstanz mit persistenter Disk "funktioniert automatisch" — für ein internes Tool v1 machbar, für Skalierung aufwendig. [23]
- Drittplattformen: OpenNext-Adapter (AWS/Cloudflare/Netlify, 1.0-beta 2025, aktive Entwicklung über offizielle Adapter-API); Cloudflare empfiehlt inzwischen **vinext** als Default für Next.js auf Workers (experimentell). [24][16]

## 7. Datenfluss: JSON-Seitenbaum → registrierte Sektionen

- **Next.js (RSC):** Catch-all-Route liest JSON (Build- oder Request-Zeit), mappt Nodes → Registry-Komponenten; statische Sektionen bleiben Server Components, interaktive werden Client Components. Der JSON-Baum kann als RSC-Payload gestreamt werden; Daten und Markup liegen konsistent in einem Baum. [2][10]
- **Astro:** Route liest JSON, Registry-Map → Komponenten; statische Sektionen werden zu HTML ohne JS. Hydration-Entscheid pro Sektion über Dispatcher-Pattern/Custom Directive (siehe §4). Cross-Island-State über Nanostores; globale Choreografie über Page-Scripts. [11][19][20]
- **Eigener Renderer (Referenzen):** **Webstudio** kompiliert einen JSON-Baum per CLI in eine „scaffolded" Framework-App (Routing + CSS generiert) und deployt **einen Cloudflare-Worker pro Projekt**; Komponenten-Metadaten und TS-Typen werden fürs SDK generiert. **Puck** (Editor-Kandidat für Ticket 09) versteht den Baum als „jede Node = Props echter React-Komponenten". **Builder.io** arbeitet mit Component-Registry + Props-Schema. Damit existiert ein erprobtes Muster: Registry + JSON ist unabhängig vom Renderer, der Renderer ist austauschbar. [25][26]
- **Wilde Karte 2026:** Cloudflare hat mit **vinext** die Next.js-API-Oberfläche (94 %) auf Vite reimplementiert — 1 Woche, 1 Engineer, ~1.100 $ Tokens, 1.700+ Vitest- und 380 Playwright-Tests; Builds 4,4× schneller, Client-Bundles ~57 % kleiner als Next.js 16 im Fixture (33 Routen; Richtwert, nicht Produktion). Ihr eigenes Fazit für statische Content-Sites: „spend $10 and migrate to ... **Astro**." [16]

## 8. Bundle- & Performance-Auswirkungen (motion-/3D-lastig)

- **Baseline:** Astro-Content-Seiten ~9 KB JS vs. Next.js-Docs ~463 KB; Lighthouse 95–100 vs. ~59 (Quellen: Tech Insider/Senorit 2026, GitHub #27531 — Docs-Sites, mit Vorsicht zu lesen). Vercel räumt ein, dass Astro „weniger Client-JS" liefert und der Gap mit steigender Interaktivität schrumpft. [3][27]
- **Realistische Zusatzlast:** React 19 Runtime ~55 KB gzip [28]; GSAP-Core ~27,7 KB + ScrollTrigger ~17,6 KB gzip (Messung Aug. 2026), Lenis ~7 KB gzip [29][30][31]; Three.js ~700 KB (Tree-Shaking begrenzt), R3F +~50 KB [32][33]. Eine 3D-Hero-Seite trägt also **unabhängig vom Framework** 150–250 KB+ gzip; der Framework-Unterschied (~50–150 KB) bleibt relevant für Nicht-3D-Seiten und für die Interaktivitätszeit (Hydration-CPU), relativiert sich aber auf reinen 3D-Seiten.
- **Konsequenz fürs Qualitätsziel:** Performance-Budgets pro Sektion/Seitentyp definieren (Ticket 18/13); 3D-Szenen lazy laden (Canvas unterhalb des Folds, `client:visible`/dynamic import), OG-/Media-Pipeline (Ticket 15) einbeziehen. Realistische Motion-Sites erreichen Lighthouse 80–90 — Qualitätsgate entsprechend kalibrieren, nicht 100 erwarten. [14]

## 9. DX mit TypeScript & Agenten

- **TypeScript:** Beide First-Class. Astro: typed Routes seit 5, Content Collections mit Zod (in 6 auf Zod 4); Next.js: typed Routes/Links, RSC-Typen, React Compiler (stable in 16). [1][2][34]
- **Agenten-DX:** Astro 7 ist explizit agent-optimiert (Background-Dev-Server, JSON-Logs, Agent-Detection, Skills-Ökosystem um `astro dev`). Next.js bietet DevTools MCP und die breiteste Trainingsdaten-Basis (LLMs generieren Next.js-Idiome sehr zuverlässig — relevant, aber durch Senifys Section-Registry ohnehin stark eingeschränkt). [1][2][16]
- **Community/Zufriedenheit:** Next.js: ~39 Mio. wöchentliche Downloads, ~140k Stars (Aug. 2026); Astro: ~3,1 Mio., ~60k Stars — aber höchste Zufriedenheit der Meta-Frameworks. [3][5]

## 10. Der „eigene Renderer" — nüchtern bewertet

**Präzedenzfälle:** Webstudio (eigener SDK-Renderer, JSON→Compile→Worker pro Site), Builder.io (Registry + Schema + Visual Editor), Framer (eigene React-Rendering-Engine). Machbar, aber der Preis ist das Eigentum an: Routing, Bundling, SSR/Streaming, Island-/Hydration-Strategie, Image-Pipeline, Caching/CDN, Preview-Deployments, Editor-Brücke, Error Boundaries, Codemods.

**2026-Faktor:** vinext zeigt, dass Agenten die *Kosten* eines eigenen Runtimes drastisch senken können — aber auch, dass selbst Cloudflare als hochmotivierter Player die API eines bestehenden Frameworks reimplementierte, statt etwas Neues zu erfinden, und für statische Sites klar Astro empfiehlt. Der sinnvolle eigene Beitrag für Senify ist daher nicht ein Renderer, sondern eine **framework-agnostische Motion-Runtime + Section-SDK** (Registry, Props-Schemas, Motion-Presets), die auf Astro läuft und einen späteren Wechsel zu Next.js oder einem Custom-Runtime offen lässt. [16][25]

---

## Vergleichstabelle

| Kriterium | Astro (SSG-first, Islands) | Next.js 16 (RSC, App Router) | Eigener React-Renderer |
|---|---|---|---|
| Grundmodell | Statisches HTML by default, Hydration opt-in pro Island | React läuft immer; Client Components + RSC | Selbst gebaut (SSR/Hydration/Islands/Routing) |
| JS-Baseline (statische Seite) | ~0 KB | React-Runtime (~55 KB gzip) + ggf. RSC-Payload | selbst definiert |
| Motion (GSAP/ScrollTrigger/Lenis) | Page-Scripts ohne Hydration; Fallstricke dokumentiert (Lenis-Sync, View-Transitions-Cleanup) [14][15] | `useGSAP()` in Client-Components, ein React-Tree [13] | beides möglich, selbst verantwortet |
| 3D (R3F) | `client:only="react"`-Island [17] | `'use client'` + `dynamic(ssr:false)` [18] | selber bauen |
| JSON-Baum → Komponenten | Registry + Dispatcher/Custom Directive nötig (Direktiven sind statisch) [19][20] | natürlicher Fit (RSC-Grenzen pro Node) [10] | maximal frei, maximal Aufwand |
| Build-Zeiten | 15–61 % schneller (Astro 7); 100k Seiten 22,6 s [1][7] | Turbopack 2–5× vs. webpack; 100k Static-Export 264 s, Crash bei 200k [2][7] | selbst optimieren |
| ISR/Edge/dynamisch | Server Islands, Route Caching (stabil) + CDN-Provider (experimentell), Live Content Collections [1][4][21] | ISR nativ, PPR/Cache Components, Draft Mode [2][22] | selbst bauen |
| Static Export | trivial, voller Funktionsumfang statisch | eingeschränkt (kein ISR/Draft/Actions/Proxy …) [8] | frei |
| Self-Host | statisch trivial; SSR via Adapter | Node/Docker möglich, Multi-Instance-Caching/Skew komplex [23] | frei |
| Plattform-Präzedenz | Webflow Cloud, Wix Vibe, Stainless (alle CF/Astro) [4] | Vercel-Ökosystem, OpenNext, vinext (experimentell) [16][24] | Webstudio, Builder.io, Framer (aufwändig) [25] |
| Ökosystem/Zufriedenheit | höchste Satisfaction (SoJS 2025), kleineres Ökosystem [5] | größtes Ökosystem, Satisfaction im Sinkflug (39 pp Gap) [5][3] | keins (alles selbst) |
| Hauptrisiko | Island-Soup bei viel Interaktivität; Cross-Island-Koordination; Direktiven-Limit | Baseline-JS; Komplexität/Caching; Vercel-Gravitation; Build-/Export-Grenzen | Scope-Creep, Wartung, Testlast |

## Empfehlung + Risiken

**Primär: Astro 7 als Renderer der generierten Sites, mit React-Sektionen und bewusst gewählten Interaktionsgrenzen.**

Begründung (quellenbasiert):

1. **Use-Case-Fit:** Marketing-/Kundensites = Content-first mit selektiver Interaktivität; Astros zero-JS-Default liefert die beste Performance-Basis, die Vercel selbst einräumt. [9][27]
2. **Plattform-Präzedenz:** Webflow Cloud und Wix Vibe — exakt „Plattform generiert Kunden-Sites" — betreiben ihre Kunden-Sites auf Astro/Cloudflare. [4]
3. **Agent-Workflow:** Astro 7s Background-Dev-Server/JSON-Logs/Agent-Detection plus schnellste Builds minimieren die Iterationsschleife; Route Caching + Live Content Collections erlauben Preview/Revalidierung ohne Rebuild. [1]
4. **Deploy-Freiheit:** statisch überall, günstig, kein Lock-in; Cloudflare-Path (Ticket 14) ist first-class. [4][23]
5. **Motion/3D tragfähig:** GSAP/Lenis laufen als Page-Scripts (kein React nötig); R3F als `client:only`-Island; Muster sind dokumentiert — mit bekannten, behebbaren Fallstricken. [14][15][17]

**Fallback-Kriterien für Next.js** (in Ticket 02 zu prüfen): Wenn (a) Seiten absehbar app-artig werden (State, Auth, viele interaktive Widgets), (b) das Team bewusst *einen* React-Tree statt Island-Orchestrierung will, und/oder (c) Preview zwingend Draft-Rendering ohne Build auf Vercel-Infrastruktur braucht → Next.js 16 mit Cache Components; dann Baseline-JS akzeptieren und Budgets anpassen. [9][10][22]

**Nicht für v1: eigener Renderer.** Wiederverwendung von Astro/Next spart Monate an Infrastruktur (Caching, Streaming, Image, Preview); vinext/Webstudio zeigen Machbarkeit, aber auch den Preis. Ausweg offenhalten durch framework-agnostisches Section-SDK + Motion-Runtime. [16][25]

**Risiken & Mitigationen:**

- *Direktiven-Limit (JSON→Hydration):* Dispatcher-Pattern + Custom Client Directives, im Section-SDK kapseln (eine Stelle statt pro Sektion). [19][20]
- *Cross-Island-Choreografie/State:* Page-Level-Controller für Scroll-Szenen, Nanostores für geteilten State; früh prototypen (Ticket 18). [11]
- *View-Transitions-/Hydration-Bugs:* Feste Patterns (Sync, Cleanup, Click-Race) in die Motion-Runtime aufnehmen; Regressionstests. [14][15]
- *Island-Soup:* Sektionen als statisches HTML + deklarative Motion-Config bauen; nur echte Interaktion/3D hydrieren. [11]
- *Ecosystem/LLM-Bias Richtung React/Next:* Section-Registry limitiert Generierungsfreiheit; Astro-7-Agent-Features + interne Docs als Guardrails. [1][5]
- *Cloudflare-Übernahme:* Commitment zu MIT/open governance; Risiko gering, aber beobachten (Governance-Updates). [4]
- *Kein natives Incremental-Build für prerenderte Seiten:* bei Marketing-Site-Größen unkritisch; Preview-Builds sind schnell genug. [1][6][35]

## Offene Fragen (Input für Ticket 02 / 14)

1. Render-Modus der Sites: statisch pro Release (Build+Deploy) oder on-demand (SSR/Route-Caching) — und wie hängt das mit Preview-URLs/Rollback zusammen?
2. Sind Sektionen „React-Komponenten mit Effekten" oder „Markup + deklarative Motion-Config (Page-Script)"? Letzteres maximiert den Astro-Vorteil; ersteres verschiebt Richtung Next.js.
3. Wie oft werden Previews erzeugt (pro Agent-Iteration?) und wie groß sind Sites realistisch (Seitenzahl)?
4. 3D-Umfang: eine Szene pro Seite oder viele unabhängige Canvases? Teilen Szenen Zustand mit Scroll/Sektionen?
5. Visual Editor (Ticket 09, Puck = React): bleibt der Editor eine separate App (dann renderer-neutral) oder soll er die Site-Runtime mitbenutzen?
6. Priorität „späterer Renderer-Wechsel": lohnt das framework-agnostische Section-SDK als v1-Anforderung?
7. Zielhosting (Ticket 14): Cloudflare-first (dann spricht viel für Astro) vs. Vercel-first (dann Next.js-Gravitation)?

---

## Quellen

1. Astro 7.0 Release (Rust-Compiler, Vite 8/Rolldown, Benchmarks, Route Caching, AI/Agent-Features) — https://astro.build/blog/astro-7/
2. Next.js 16 Release (Turbopack, Cache Components/PPR, DevTools MCP, proxy.ts, React 19.2) — https://nextjs.org/blog/next-16
3. Tech Insider: Astro vs Next.js 2026 (Versionen 7.2.2 / 16.3.x, Downloads/Stars, Benchmark-Übersicht) — https://tech-insider.org/astro-vs-nextjs-2026/
4. Cloudflare Blog: Astro is joining Cloudflare (Übernahme, Astro 6, Live Content Collections, Webflow Cloud/Wix Vibe/Stainless) — https://blog.cloudflare.com/astro-joins-cloudflare/
5. State of JavaScript 2025 — Meta-Frameworks (Astro Top-Satisfaction, 39-pp-Gap zu Next.js, Pain Points) — https://2025.stateofjs.com/en-US/libraries/meta-frameworks/
6. Flaviocopes: Astro-Build-Optimierung (4.000+ Seiten, 16,6 s→12,5 s, build.concurrency) — https://flaviocopes.com/optimize-astro-build-deploy-time/
7. DEV/„Time to Yield": SSG-Benchmark 1k–500k Seiten (Astro 22,6 s/47 MiB vs Next.js 264,5 s/1,84 GiB, Crash ab 200k; Autor-Disclosure) — https://dev.to/lazarv/time-to-yield-20m8
8. Next.js Docs: Static Exports (Unsupported Features; Draft Mode/ISR/Actions/Proxy) — https://nextjs.org/docs/app/guides/static-exports
9. Vercel: Next.js vs. Astro 2026 (Architektur, Bundle, Use-Cases; Anbieter-Quelle) — https://vercel.com/i/astro-vs-next-js
10. Next.js Docs: PPR Platform Guide (Shell + postponedState, Resume-Protokoll) — https://nextjs.org/docs/app/guides/ppr-platform-guide
11. Steve Kinney: Island Architecture (Enterprise UI) — Grenzen bei interaktionsreichen Seiten, Kosten der Islands, Nanostores, RSC-Abgrenzung — https://stevekinney.com/courses/enterprise-ui/island-architecture
12. GSAP Forum: AstroJS + GSAP / View-Transitions-Kompatibilität — https://gsap.com/community/forums/topic/40950-compatibility-with-gsap-scrolltrigger-astro-view-transitiosn-api/
13. GSAP Docs: React & useGSAP — https://gsap.com/resources/React/
14. DEV: 4 Motion Design Bugs in Astro+GSAP+Lenis (Lenis-Sync, Hydration-Race, Lighthouse 80–90) — https://dev.to/keymelgaston/4-motion-design-bugs-that-break-astro-gsap-lenis-sites-in-production-31ac
15. Aidxn: Lenis + GSAP Parallax-Architektur, Astro-ViewTransitions-Cleanup, reduced-motion (Juni 2026) — https://aidxn.com/blog/lenis-smooth-scroll-gsap-parallax-pattern/
16. Cloudflare Blog: vinext (Next.js-API auf Vite, 1 Woche/$1.100, 4,4× Build, 57 % kleiner, 94 % API, Empfehlung Astro für statische Sites; Experimental) — https://blog.cloudflare.com/vinext/
17. Three.js Resources: Three.js with Astro (client:only, R3F) — https://threejsresources.com/frameworks/three-js-astro
18. Three.js Resources: Three.js with Next.js (dynamic ssr:false, 'use client') — https://threejsresources.com/frameworks/three-js-nextjs
19. Astro Roadmap-Discussion #431: Dynamische Client-Directives (Einschränkung) — https://github.com/withastro/roadmap/discussions/431
20. Astro Docs: Template/Client-Directives + Custom Client Directives; Praxisbeispiel `client:if` — https://docs.astro.build/en/reference/directives-reference/ · https://amxmln.com/blog/2024/a-client-if-directive-in-astro/
21. Astro Docs: Server Islands & Route Caching (Astro 7 Guide) — https://docs.astro.build/en/guides/server-islands/ · https://docs.astro.build/en/guides/caching/
22. Next.js Docs: Cache Components / `use cache` — https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents
23. Next.js Docs: Self-Hosting (Cache-Handler, Multi-Instance-Koordination, Version Skew, Encryption Key) — https://nextjs.org/docs/app/guides/self-hosting
24. OpenNext (Adapter AWS/Cloudflare/Netlify; Status aktive Entwicklung, offizielle Adapter-API) — https://opennext.js.org/ · https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
25. Webstudio Architektur: JSON-Baum → CLI-Compile → Framework-App, Worker pro Projekt, SDK/Typgenerierung — https://webstudio.is/blog/webstudios-architecture-an-overview
26. Puck: JSON-Tree = Props realer React-Komponenten (Editor-Grundlage) — https://github.com/puckeditor/puck · https://decoupled.io/puck/
27. Vite 8 Announcement (Rolldown/Rust-Bundler) — https://vite.dev/blog/announcing-vite8
28. React-19-Bundlemessung (core+dom ~54,9 KB gzip) — https://x.com/JLarky/status/1792276494112411977
29. GSAP-Size-Messung 2026 (core 27,7 KB + ScrollTrigger 17,6 KB gzip) — https://svg-scroll-draw.vercel.app/vs-gsap
30. PkgPulse: Framer Motion vs. GSAP (26,7 KB gzip) — https://www.pkgpulse.com/compare/framer-motion-vs-gsap
31. Aidxn: Lenis ~7 KB gzip (Motion-Architektur-Artikel) — s. Quelle 15
32. PkgPulse: Three.js vs. R3F vs. Babylon 2026 (Three ~700 KB, R3F +~50 KB) — https://www.pkgpulse.com/guides/threejs-vs-react-three-fiber-vs-babylonjs-3d-webgl-2026
33. R3F: Reducing Bundle Size (Tree-Shaking-Grenzen) — https://gracious-keller-98ef35.netlify.app/docs/recipes/reducing-bundle-size/
34. Astro 6 / Live Content Collections & Zod 4 (via Cloudflare-Blog, Quelle 4)
35. Astro Roadmap-Discussion #1096: Incremental Static Generation für prerenderte Seiten (offen) — https://github.com/withastro/roadmap/discussions/1096

*Hinweis zur Verlässlichkeit: Reddit-Threads (r/astrojs „Next.js or Astro for scroll-driven, motion-heavy websites?", r/sanity_io „Draft preview, Astro or Nextjs?") waren zum Recherchezeitpunkt per Bot-Schutz nicht vollständig abrufbar; zitiert sind nur Suchsnippets (Community-Stimmung, nicht belastbar). Vercel- und Cloudflare-Quellen sind Anbieter-Perspektiven; die Zahlen aus [7][16] sind Fixture-Benchmarks mit offengelegten Einschränkungen. Freeze des Versionsstands: 14.09.2026 (Astro 7.2.x, Next.js 16.3.x).*
