# Research 31: Framer-Import → Senify (v2-Konzept)

> Erstellt am 15.09.2026 · Anlass: Frage „Könnte man den Framer-Export (`loud-alternative-352151-framer-app-optimized`) direkt ins Programm importieren und im Editor/Agent bearbeiten?"
> Grundlage: Analyse des `unified-elementor-converter` (Desktop-Repo, Stand Sep 2026) — Architektur, Visual IR, Framer-Extraktoren, Targets, QA.
> Status: **v2-Konzept** — v1 bleibt unangetastet (Importe sind bewusst erster v2-Kandidat, Map „Out of scope").
> Verwandt: `research/22-framer-analyse.md`, `research/29-site-clone-learnings.md`, `artifacts/07` (Token/Theme), `artifacts/23` (Templates/Loops), `artifacts/26` (Forms).

## 1. Ausgangslage

Der User besitzt bereits ein ausgereiftes Produktions-Repo: **`unified-elementor-converter`** (Monorepo, 7 Workspaces, `elconv`-CLI) — es rebuilds Framer-Exporte, Live-URLs und statisches HTML als **editierbare Elementor-Seiten** (V3 + V4 Atomic) auf WordPress via Novamira-MCP.

**Der Framer-Export `loud-alternative-*` ist genau ein Fall, den der Converter schon verarbeitet:** statischer Framer-Site-Export (client-gerendertes Bundle; Unterseiten about/blogs/contact/pricing/projects/services; lokale Assets inkl. Fonts). Die `FramerSites/`-Sammlung liegt bereits im Converter-Repo; Extraction-Mode `local-export` existiert im IR.

**Kernaussage:** Die kritische Hälfte (Framer extrahieren → strukturierte, evidenzbasierte Repräsentation) ist gebaut und getestet. Für Senify fehlt genau **ein neues Target** in der bewährten Architektur: `target-senify` (IR → Senify-NodeTree). Danach ist das Ergebnis ein normaler Senify-Draft — vollständig bearbeitbar mit **Puck-Editor + KI-Agent (MCP)**.

## 2. Was der Converter liefert (Andock-Inventar)

| Baustein | Wo | Relevanz für Senify |
|---|---|---|
| **Visual IR** (schemaVersion 1.0, target-neutral) | `packages/core/src/contracts/visual-ir.contract.ts` | **Der Andockpunkt.** Enthält: `viewportProfiles`, `tokens {colors, fonts, textStyles, spacing}`, `sections[]` (role, layoutArchetype, sourceName, bbox je Viewport, styles, background, `nodes[]`), `assets[]` (inkl. `focalPoint`), `animations[]` (kind, `motionClass: entrance\|scroll-linked\|indeterminate`, `effects[]` mit **from/to/range-Messungen**), `evidence` überall |
| **Source Adapters** | `packages/extractors/src/` | `local-export` (unser Fall!), `live-dom` (Playwright), `unframer` (Framer-XML/React), `hybrid`, `screenshot-only` — formalisiert über `matches(subject, ctx)` + `SourceAdapter`-Interface |
| **Framer-Extraktoren** | `packages/extractors/src/framer/*` | components, **css-tokens** (CSS-Variablen, Fonts+Sources, Breakpoints, TextStyles), styles, **interactions**, **forms**, dark-mode, responsive-style-diff, `section-root-alignment`, `hybrid-ir-merge`, `unframer-bridge` |
| **Analyzer** | `packages/core/src/analyzer/*` | design-token-extractor, color/font/spacing-Extraktion, OKLCH-Konverter, token-resolver/mapping, theme-detector |
| **Section-Detector** | `packages/extractors/src/browser/section-detector.ts` | Sektions-Segmentierung der Seite — Basismaß für unser Sektionen-Mapping |
| **AI-Layer** | `packages/core/src/ai/*` | Router + Tasks: `section-classify`, `component-detect`, `token-semantics`, `vision-qa`, `repair-block` (mit Kosten-Tracker) — genau die Tasks, die ein Mapping absichern |
| **QA** | `packages/qa/src/*` | pixelmatch/SSIM, Geometry-Probe, Healing-Loops, Design-Critic — bleibt der Qualitäts-Gürtel um den Import |
| **Contracts/Guards** | `packages/core/src/contracts/*`, `guards.ts`, `contamination.ts` | Vorbild für ein Senify-seitiges Import-Contract (Validierung + Provenance) |

**Beachte:** Das IR ist bereits **tief genug für unser Mapping** — es kennt Sektions-Rollen, Text-Styles als benannte Referenzen (`textStylePath`), Focal-Points, Animations-Amplituden und Evidenz. Es gibt sogar einen Kommentar im Contract, der exakt unser Problem benennt: `motionClass` fehlt → Target soll eine Lücke MELDEN statt zu raten. Diese „nie hochstufen"-Haltung deckt sich mit unserer Evidenz-Regel (`research/29`).

## 3. Zielarchitektur: `target-senify`

```
Framer-Export / URL / HTML
   │
   ▼
elconv: Source-Adapters → VisualPageIR (+ Evidence)
   │
   ├─ target-v3 / target-v4   (bestehend → Elementor)
   └─ target-senify            (NEU → Senify)
          │
          ▼
      Senify-Import-Paket
      ├─ theme.json          → Senify Theme-Draft (Skalen-Engine, artifacts/07)
      ├─ pages[] (NodeTree)  → Draft-Pages via kanonische Mutations (artifacts/01)
      ├─ media[]             → Senify-Medi­athek (assets mit focalPoint, artifacts/15)
      └─ report.json         → Mapping-Bericht (was gemappt, was geschätzt, was offen)
```

### 3.1 Theme-Mapping (leicht — Tokens existieren)

- `tokens.colors` → Theme-Primitives + semantische Rollen (Body-Bg/Text/Accent-Erkennung wie im Converter-`token-mapping`); OKLCH-Konverter vorhanden.
- `tokens.textStyles` (benannte Styles!) → Senify-Typo-Rollen (Heading XL–6, Body) — `textStylePath` erhält die Autoren-Absicht.
- `tokens.fonts` (mit `sourceUrl`) → Senify-Font-Kuratorium + Self-Hosting (Lizenz-Check! `research/29`-Regel: Lizenz-Fonts → metrik-kompatible Open-Paare).
- `tokens.spacing` → Spacing-Skala.
- `evidence` → Profil-Provenance (URL/Export-Hash, Datum).

### 3.2 Struktur-Mapping (das eigentliche Arbeitspaket)

Zweistufig, agentengestützt:

1. **Deterministisch:** `sections[]` → Sektions-Match auf unsere 28 (`role`/`layoutArchetype`/`sourceName` + Node-Signaturen): hero→`hero`, pricing→`pricing`, faq→`faq`, logo-cloud→`logo-cloud`, blogs-Liste→`collection-list`+`card`, etc. Nodes → Props (heading→`text`, image→`assetRef`, button→`link`).
2. **Agent-Normalisierung:** Nicht gematchte/unsichere Sektionen gehen als Aufgabe an den Senify-Agenten (MCP): „Ordne Sektion X auf Katalog-Sektionen zu oder baue sie aus Bausteinen nach" — mit dem IR als Kontext (Texte, Assets, Styles). Nutzt den bestehenden `section-classify`-Task als Vorstufe.

**Ehrliche Grenze:** Senify kennt nur kuratierte Sektionen + Props — ein **1:1-DOM-Klon ist im Senify-Modell nicht möglich** (und nicht gewollt). Der Import ist „normalisiert": Design-Sprache + Inhalte bleiben, das Markup wird Senify-nativ. Sektionen ohne Entsprechung werden im Bericht ausgewiesen (inkl. Screenshot) — nichts wird still verschluckt.

### 3.3 Motion-Mapping (Tabelle existiert bereits)

`animations[]` ist reich genug für deterministisches Mapping auf unseren Preset-Katalog (03):

| IR-Signal | Senify |
|---|---|
| `motionClass: entrance` + `effects` (opacity/translateY, range) | `fade-up` / `fade-up-deblur` / `scroll-reveal` (Intensity aus range abgeleitet) |
| `motionClass: scroll-linked`, monotonic, großer range | `scrub-pin` / `parallax-subtle` / `scroll-progress` (Guardrails greifen: Pin ×1!) |
| kind `hover` | `hover-lift` / `tilt-card` / `magnetic-button` |
| Sticky-Signaturen | `sticky-stack` |
| `motionClass: indeterminate` oder fehlend | **melden, nicht raten** (Landing im Bericht; manuell/Agent entscheidet) |

Der Framer→Elementor-Converter hat dieselbe Denkweise schon implementiert (Amplitude → Speed nie erfinden) — wir übernehmen die Haltung 1:1.

### 3.4 CMS/Listing-Mapping (späterer Ausbau)

Framer-CMS-Listen (blogs, projects) → Senify `Collection` + `collection-list` + Detail-Template (23). Erste Stufe: Inhalte als statische Sektionen importieren (sichere Basis); zweite Stufe: automatische Collection-Anlage + Entry-Import (Texte, Bilder, Slugs) + Entry-Template-Match. Der Export liefert die Seiten einzeln (im Gegensatz zur Live-CMS-API) — daher „Erststruktur statisch, Normalisierung durch Agent" als Default.

### 3.5 Forms-Mapping

Framer-Form-Definitionen (`framer/forms.ts` existiert) → Senify `contact`/`newsletter`-Sektionen + Ziel-Collection. Endpoint/Spam-Policy übernimmt Senify (26).

## 4. Import-Flow (UX, v2)

1. **Senify: „Projekt importieren"** → Quelle: Framer-Export-Ordner, URL oder vorhandener `elconv`-Output (IR/XML).
2. **Job:** elconv-Pipeline läuft (Extraktion → IR → `target-senify` → Import-Paket). Fortschritt sichtbar (der Converter hat Progress/ETA + Streaming).
3. **Import:** Package → neues Projekt: Theme-Draft + Seiten-Drafts via kanonische Mutations (audit-fähig, `author: agent/import`).
4. **Ergebnis:** Projekt öffnet im Editor; **alles normal bearbeitbar** (Puck, MCP-Tools, Review-Flow). Der Mapping-Bericht liegt als „Prüfen"-Eintrag bei (Sektionen-Match, geschätzte Werte, offene Punkte).
5. **Qualitäts-Gürtel:** `elconv qa` (Screenshot-Vergleich Original vs. Senify-Bake) bleibt verfügbar — Feedback, das in die Normalisierung zurückfließt.

**Kopplung:** Empfehlung **lose Kopplung über CLI + JSON** (`elconv convert --target senify --source <export> --out <paket>`), nicht Codenähe: Beide Repos bleiben unabhängig versionierbar; der Import-Paketvertrag (`nodeTree`, `theme`, `media`, `report`) ist zugleich die stabile Schnittstelle.

## 5. Aufwand & Bausteine (v2-Projekt, grob)

| Baustein | Charakter | Größe |
|---|---|---|
| 1. Import-Paket-Contract (NodeTree/Theme/Media/Report + Validierung) | Senify-Seite | S–M |
| 2. `target-senify`: Theme-Mapping (Tokens → Skalen-Engine) | Converter-Seite | M |
| 3. `target-senify`: Sektionen-Mapper (deterministisch + Agent-Normalisierung) | Converter-Seite | **L** (der Kern) |
| 4. Motion-Mapper (IR → Preset-Katalog + Guardrails) | geteilt | M |
| 5. Assets/Migration (focalPoint, Alt-Texte, Ladder) | geteilt | S–M |
| 6. Senify-Import-UX (Quelle wählen → Job → Draft-Projekt → Bericht) | Senify-Seite | M |
| 7. QA-Schleife (elconv qa gegen Senify-Bake, Report) | geteilt | M |

**Reihenfolge (Vorschlag):** Contract → Theme-Import (schneller Wert: „im Framer-Stil bauen") → Sektionen-Mapper MVP (hero/footer/cta/content/features) → Motion/Assets → Import-UX → QA-Schleife → CMS/Forms-Ausbau.

## 6. Offene Entscheidungen (v2-Grilling nötig)

1. **Fidelity-Ziel:** „normalisiert auf Katalog-Sektionen" (Empfehlung) vs. Hybrid (zusätzliche „Freeform"-Sektion für Sonderfälle)?
2. **Mapping-Grenze:** Wie viele Katalog-Sektionen muss der Mapper sicher beherrschen, bevor der Rest an den Agenten geht?
3. **CMS:** Blogs/Projects sofort als Collections+Entries (mit Detail-Templates) oder erst statisch und später normalisieren?
4. **Review-Pflicht:** Import immer als Draft mit Review-Item (06) — vermutlich ja (Standard-Policy).
5. **Reverse:** Export-Beziehung zum Elementor-Flow erklären (gleiche IR; „ein Katalog, mehrere Targets").

## 7. Antwort auf die Ausgangsfrage (für die Session)

- **Möglich? Ja** — und deutlich näher als gedacht: Der bestehende Converter liefert die Extraktion, das IR und die QA; es fehlt ein Target-Package + Import-UX.
- **„Direkt bearbeiten mit Editor/Agent?" Nach dem Import: voll ja** — Import erzeugt einen normalen Senify-Draft (NodeTree); Puck-Editor und MCP-Agent arbeiten darauf wie auf jeder anderen Seite.
- **Was mit dem vorliegenden Export geht:** `loud-alternative` ist ein regulärer `local-export`-Fall. Der Theme-/Token-Pfad könnte als **erster Quick-Win** auch schon vor dem vollen Import stehen (Design-Profil/Theme aus dem Export).
- **v1 bleibt unangetastet:** Import ist v2; dieses Dokument ist der konkretisierte v2-Kandidat Nr. 1.

## 8. Anschlüsse

| Ort | Ergänzung |
|---|---|
| `map.md` „Out of scope" | Import-Zeile um `target-senify`-Pfad + dieses Dokument präzisieren |
| `research/29` | Gemeinsame Muster (Evidence, Amplitude- statt Ratewerte, Lorem-Vermeidung) — Synergie dokumentieren |
| v2-Backlog | Dieses Dokument als Startpunkt; Bausteine 1–7 als Kandidaten-Tickets |
| Converter-Repo | Bei tatsächlichem v2-Start: `REPOSITORY-CHARTA` + `AGENTS.md` dort beachten (eigene Arbeitsregeln, V3/V4-Isolation, Ability-Registry) |
