# Research 22 — Framer-Referenzprojekt (via Unframer MCP)

> Stand 14.09.2026. Quelle: verbundenes Framer-Projekt, gelesen über Unframer MCP (`getProjectXml`, `getNodeXml`, `getCMSCollections`, `readCodeFile`). Live: https://innocent-labeling-877706.framer.app (Agentur-Portfolio „Facio").
> Zweck: „Seiten wie bei Framer" — konkrete Muster für Senifys Section-Library, Tokens, Varianten/Props und Agenten-Schnittstellen.

## 1. Projekt-Inventar

- **6 Seiten**: `/`, `/404`, `/about`, `/contact`, `/projects`, `/projects/:slug` (CMS-Detailroute)
- **~50 Komponenten** — de facto eine Section-Library: Navbar/Header Nav/Footer, Hero-Blöcke (Client/Projects/Experience), Features Block 1/2, Stats 1/2, Service Blocks, Pricing (+Wrapper), Faq (+Holder, According Tab), Client Feedback (+Slider Wrapper, Mobile-Variante), Process (+Wrapper), CEO Quote, team-card, project-card, Small-project-card, project-stats, info-card, Box-info, Buttons (primary/contact/circuler), highlighter-tag, Social Icon(+Group), Partner Logo, Logo, Skill tag …
- **1 Code-Component**: `Counter.tsx` (framer-motion-Springs, `useInView`, `addPropertyControls`)
- **10 Color Styles**, gruppiert nach `/Brand/*`, `/BG/*`, `/UI/*` (inkl. Alpha-Variante „UI/Yellow 40%")
- **16 Text Styles**: Skala `/Heading/Heading XL (84px)` → `Heading 6 (24px)` + `/Body/*` + `/Paragrapgh/*`; je mit fontSize/lineHeight/letterSpacing/paragraphSpacing und **`tag` (h1–h6/p)**; Font: Satoshi (Framer-gehostet, „FS;"-Präfix)
- **1 CMS-Collection** `Project-single` mit ~60 Feldern (Strings, formattedText/Markdown, Images 1–7, Numbers für Stats, Farbfelder **akzeptieren Style-Paths**, „Icon"-Felder opak, Divider als Struktur-Marker)

## 2. Seiten-/Section-Anatomie (Homepage, Desktop 1200px)

Sektionsfolge: Hero → About → Services → Projects → Client Feedback → Partners → Video → Work Process → Pricing → Why Choose Us → FAQ.

Beobachtungen:

- **Sektionen = benannte Frames** (`SectionHero`, `SectionAboutUs`, …) direkt auf der Seite; wiederverwendbare Teile = Komponenten-Instanzen mit Props. → Deckt sich mit Senifys Modell (Section = Registry-Typ, Node = Instanz mit Props).
- **Rhythmus-System**: Sektionen mit `padding="… 20px 200px 20px"`, Container `maxWidth="1300px"`, Gap-Skala 10/20/50/80/100 px.
- **Responsive als Variant-Roots**: Desktop (1200px) / Tablet (810px) / Phone (390px) — auf Seiten UND Komponenten; Navbar zusätzlich `MobileOpen`/`MobileClose` = **State-Varianten**.
- **Layout-Vokabular**: stack (direction/distribution/alignment/wrap), gap, padding, grid (`gridColumns="2"`, Bento mit `gridColumns="5"` + Breiten 1fr/2fr/1.7fr/0.9fr + feste 450px-Höhen), borderRadius, opacity, `position="sticky" top="150px"` (FAQ-Heading), `link="/projects/:slug"` auf ganzen Karten.
- **Token-Referenzen im Markup**: `backgroundColor="/BG/White"`, `inlineTextStyle="/Heading/Heading XL"`; realer Trick: Brand-Farbe mit `opacity="0.07"` als Divider.
- **SmoothScroll-Node** mit `intensity="20"` — Smooth Scroll ist einstellbarer Parameter pro Seite.
- **Video-Sektion**: natives Video-Node (mp4, loop, muted, poster, cover).

## 3. Komponenten-, Varianten- & Props-Modell

- Instanzen tragen `componentId` + `variant="<ID>"` + **Props als hash-benannte Attribute** mit echten Werten (z. B. ServiceBlocks: Nummer, Titel, Beschreibung, Akzentfarbe `rgb(255,211,101)`, Textfarbe, Radius 30px …).
- → Genau Senifys `SectionDefinition`-Konzept (Props-Schema + Variant). **Validierung** unseres Datenmodells aus Artefakt 01.
- Buttons existieren als **3 getrennte Komponenten** (primary/contact/circuler) statt eines Typs mit Varianten → Lektion: Senify baut **einen** `button`-Typ mit Variants (weniger Registry-Rauschen).
- `Counter.tsx` zeigt das **Control-Modell**: `ControlType.Boolean/Number(min,max,step)/Enum/Color/font`, `defaultProps`, **`hidden(props)`** (bedingte Sichtbarkeit) + Spring-Parameter (stiffness/damping) + `Intl.NumberFormat`.
- → Anforderung an Ticket 08/09: Prop-Schemas brauchen **Editor-Metadaten** (Titel, Control-Typ, min/max/step, Optionen, hidden-Bedingungen) zusätzlich zur Validierung.

## 4. Design-Token-System (real)

- Farben **semantisch gruppiert** (`/Brand`, `/BG`, `/UI`) inkl. Alpha-Varianten — Primitives + Sinnschichten wie geplant.
- Text-Skala als **Rollen** (Heading XL–6, Body/Paragraph S/M) mit HTML-Tag-Mapping (SEO/Semantik) und Typo-Feinheiten (letterSpacing −0.03em).
- Fonts**gehostet** — Font-Strategie (self-hosted vs. Google) gehört in Ticket 07.

## 5. CMS-Modell (Kontext für v2)

- 60 Felder für eine Detailseite, chaotisch benannt (`Title-1..7`, `Image-1..7`) — Lektion: Senifys Schema-System (additive, sprechend, gruppiert) verhindert diesen Wildwuchs.
- Feldtypen: string, formattedText, number, image, color (Style-Paths!), enum, collectionReference; Icons opak (Tool-Limit); Divider als Marker.

## 6. Was Senify konkret übernimmt

| Learning | → Ticket |
|---|---|
| Section-Rhythmus (200 px, max 1300 px, Gap-Skala), Bento-Grids, Sticky-Heading, Section-Benennung | 08 |
| Props + Varianten als Kern; ein `button`-Typ statt drei Komponenten | 08 |
| Prop-Metadaten fürs Editor-UI (Control-Typen, min/max, hidden) | 08/09 |
| Token-Organisation `/Brand`·`/BG`·`/UI` + Alpha; Text-Skala mit HTML-Tags; Font-Strategie | 07 |
| Pfad-Referenzen in Markup (`/BG/White`) | 07 (bestätigt 01) |
| State-Varianten (Mobile Open/Close) + Breakpoint-Varianten | 08/09 (bestätigt Overrides-Modell) |
| SmoothScroll als Parameter (`intensity`) | 21 |
| Counter = deckungsgleich mit `counter`-Preset + Motion-Spec | 03 (bestätigt) |
| Video-Sektion (mp4 loop muted poster) | 15 |
| „Framer-Niveau" ist **ohne 3D** erreichbar (Stacks/Grids + Tokens + Komponenten + Mini-Code) | bestätigt Qualitätsmodell (Map) |

## 7. MCP-Notizen

- `getNodeXml` schlägt bei einigen Komponenten reproduzierbar fehl („Node is not a text node": Pricing, Footer, According Tab, Hero-Blöcke, Header Nav, Highlighter Tag); funktioniert bei Navbar, Social Icon, Homepage. Workaround: über Seiten-XML navigieren.
- Instanz-Props erscheinen nur als Hash-Attribute — Komponenten-XML + Instanz-Vergleich nötig, um Prop-Bedeutungen zu kartieren.
