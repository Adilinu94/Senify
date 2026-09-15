# Research 19: Approval-Tooling (Visual-Diff + strukturierter Diff)

Stand: 2026-09-14 · Kontext: Senify v1, Ticket 19 / Input für Ticket 06 (Approval-Queue & Guardrails)
Methodik: Primärquellen (GitHub-Repos/APIs, offizielle Docs) via Websuche und Seitenextraktion, Stand der Abfragen 2026-09-14.

## Executive Summary

- **Kein Open-Source-Tool kombiniert Screenshot-Diff und strukturierten JSON-Tree-Diff in einer Review-UX.** Argos und reg-suit reviewen ausschließlich Bilder; der JSON-Diff (was der Agent am Seitenbaum geändert hat) muss als eigene Ebene daneben gebaut werden. Genau das ist für Senify aber der Kern der Approval-Queue.
- **Empfehlung: Bausteine statt fertiger Plattform.** Capture mit **Playwright** (Apache-2.0, `toHaveScreenshot` mit deterministischen Defaults), Bild-Diff mit **pixelmatch** (ISC, von Playwright selbst genutzt) oder **odiff** (MIT, deutlich schneller bei großen Full-Page-Shots), JSON-Diff mit **jsondiffpatch** (MIT, Delta + Reverse-Patch + HTML-Formatter), Review/Approval als Teil der Senify-Approval-Queue (Ticket 06) auf Postgres. So bleiben Datenmodell (Versionierung aus Ticket 05), Freigabe-Regeln und UI in einer Hand.
- **Argos (MIT, sehr aktiv) ist die stärkste fertige Option** – komplett Open Source inkl. Review-UI und Comparison-Engine, self-hostbar per Docker-Compose. Aber: **offiziell kein Support/Doku für Self-Hosting** ([Diskussion #1811](https://github.com/argos-ci/argos/discussions/1811)) und der Stack ist schwer (Postgres, RabbitMQ, Redis, DynamoDB). Als Fallback/Referenzarchitektur einplanen, nicht als Default.
- **reg-suit (MIT)** ist eine solide CI-nahe CLI mit S3/GCS-Baseline-Storage und statischem HTML-Report, aber kein interaktives Approval-System; Wartung läuft langsam (letztes Release v0.14.6, März 2026).
- **Ausgeschlossen:** **Lost Pixel** (archiviert 2026-04-22, Team zu Figma, Produkt eingestellt), **BackstopJS** (MIT, aber README: „needs a new maintainer/owner“, 579 offene Issues), SaaS wie **Chromatic/Percy** nur als Preis-Referenz (Chromatic ab 179 $/Monat für 35k Snapshots).
- **Größtes fachliches Risiko:** Senifys Qualitätsziel (Awwwards-Level Motion/3D). Animationen, GSAP-Timelines und WebGL sind ohne „Capture-Mode-Friering“ im Renderer nicht deterministisch fotografierbar. Das Tooling kann das nur unterstützen (Animations-Disable, reducedMotion, stylePath, Maskierung) – die Freeze-Hooks müssen im Renderer (Ticket 02) verankert werden.

## Tool-Vergleich

### A) Review-Plattformen / Komplettlösungen

| Tool | Typ | Lizenz | Aktivität (Stand 2026-09) | Self-Hosting | Full-Page | Approval-UI | Baseline-Storage | Struktur-Diff (JSON) | Bewertung für Senify |
|---|---|---|---|---|---|---|---|---|---|
| **Argos** | Plattform (Docker) + SDKs | MIT ([Repo](https://github.com/argos-ci/argos)) | Sehr aktiv (letzter Commit 2026-09-14, 626 ★, 5.428 Commits) | Ja, aber **ohne Support/Doku** ([#1811](https://github.com/argos-ci/argos/discussions/1811)); Stack: Postgres, RabbitMQ, Redis, DynamoDB ([docker-compose.yml](https://raw.githubusercontent.com/argos-ci/argos/main/docker-compose.yml)) | Ja (Screenshots kommen aus Playwright/Cypress/Storybook) | Ja: Approve/Reject im Web-UI, GitHub-Integration, „orphan builds“ vor erster Baseline ([Quickstart](https://argos-ci.com/docs/quickstart/playwright-quickstart)) | Eigene DB + Storage im Compose | Nein | Bester fertiger OSS-Kandidat; Integrationsskizze für JSON-Diff müsste daneben gebaut werden |
| **reg-suit** | CLI + Plugins | MIT ([Repo](https://github.com/reg-viz/reg-suit)) | Gepflegt, langsam (v0.14.6, 2026-03-16; 1,3k ★) | Ja (CLI, kein Server) | Übergebenes Bildmaterial (z. B. Puppeteer/Playwright) | Nein (statischer HTML-Report via reg-cli) | S3 oder GCS (Publisher-Plugin); Key via Git-Hash | Nein (aber `x-img-diff-js` erkennt strukturelle Verschiebungen im Bild) | Gut für CI-Report-Workflow; zu wenig für interaktive Freigabe-Queue |
| **Visual Regression Tracker** | Self-hosted Plattform (Backend/Frontend + Worker) | Apache-2.0 ([Repo](https://github.com/Visual-Regression-Tracker/Visual-Regression-Tracker)) | Aktiv (letzter Push 2026-09-01; 712 ★) | Ja, explizit als Self-Hosted gedacht (Docker) | Ja (Playwright-/Cypress-Worker) | Ja: Web-UI zum Verwalten/Akzeptieren von Abweichungen, API-basiert | Eigene DB + Storage | Nein | Zweitbeste fertige OSS-Plattform; kleinere Community, weniger prominent |
| **Vizzly** | CLI (MIT) + SaaS-Plattform | CLI MIT ([Repo](https://github.com/vizzly-testing/cli)), Plattform proprietär | CLI sehr aktiv (Push 2026-09-12, nur 34 ★) | Plattform nicht klar self-hostbar; OSS-Programm kostenlos ([vizzly.dev](https://vizzly.dev/open-source/)) | Ja (Screenshots aus echten Tests) | Ja, in SaaS (PR-Checks, Decisions); CLI liefert „agent-readable output“ | SaaS | Nein | Interessant als Agent-UX-Referenz; als Dependency zu jung |
| **Chromatic** (SaaS-Referenz) | SaaS | Proprietär | – | Nein | Ja | Ja | SaaS | Nein | Nur als Preis-/UX-Benchmark: ab 179 $/Monat für 35k Snapshots ([chromatic.com/pricing](https://www.chromatic.com/pricing), [Vergleich](https://argos-ci.com/blog/visual-testing-pricing)) |
| **BackstopJS** | CLI | MIT ([Repo](https://github.com/garris/BackstopJS)) | 7,2k ★, letzter Push 2026-09-08, aber **579 offene Issues; README: „needs a new maintainer/owner“** | Ja (lokale Ordner, Docker-Support) | Ja (Szenario-Konfiguration, `bitmaps_reference/`) | Nein (HTML-Report) | Git/Dateisystem | Nein | Nicht empfehlen: unklare Zukunft, Wartungsmodus |
| **Lost Pixel** | CLI | MIT ([Repo](https://github.com/lost-pixel/lost-pixel)) | **Archiviert am 2026-04-22** („Lost Pixel team is joining Figma“, Produkt wird eingestellt) | Historisch ja | Ja | Nur in der eingestellten SaaS-Plattform | – | Nein | Ausgeschlossen (Totentanz) |
| **Loki** | CLI | MIT ([Repo](https://github.com/oblador/loki)) | Storybook-fokussiert | Ja | Story-Komponenten, keine freien Seiten | Nein | Git | Nein | Für Senify (ganze Seiten, kein Storybook) ungeeignet |

### B) Bausteine (Capture, Bild-Diff, JSON-Diff)

| Baustein | Rolle | Lizenz | Aktivität | Kernpunkte |
|---|---|---|---|---|
| **Playwright** (`@playwright/test`) | Capture + built-in Vergleich | Apache-2.0 ([Repo](https://github.com/microsoft/playwright), 96k ★) | Sehr aktiv (Push 2026-09-14) | `toHaveScreenshot()`: wartet, bis zwei aufeinanderfolgende Screenshots identisch sind; Defaults: `animations: "disabled"` (stoppt CSS-Animationen/Transitions/Web Animations), `caret: "hide"`, `scale: "css"`, `threshold: 0.2` (YIQ); `stylePath` injiziert CSS zum Verstecken volatiler Elemente; `mask`/`maskColor`; `fullPage` (Default `false` – für Full-Page explizit setzen) |
| **pixelmatch** | Pixel-Diff | ISC ([Repo](https://github.com/mapbox/pixelmatch), 6,9k ★) | Aktiv (Push 2026-07-07) | Von Playwright intern verwendet; Anti-Aliasing-Erkennung, Perceptual-Diff (YIQ), sehr klein |
| **odiff** | Pixel-Diff (Performance) | MIT ([Repo](https://github.com/dmtrKovalenko/odiff), 3,2k ★) | Aktiv (Push 2026-08-24) | SIMD/nativ (Zig) + Node-API; deutlich schneller bei sehr großen Bildern (Full-Page, Multi-Viewport); von Lost Pixel als Engine eingesetzt |
| **jsondiffpatch** | JSON-/Tree-Diff | MIT ([Repo](https://github.com/benjamine/jsondiffpatch), 5,3k ★) | Aktiv (Push 2026-05-14) | Delta-Format + `patch`/`reverse` (Undo!), HTML-Formatter; `objectHash` (z. B. Section-ID) verhindert, dass Moves als Delete+Insert rauschen |
| **x-img-diff-js** | „Smart diff“ im Bild | MIT (Teil von reg-viz) | Teil von reg-suit | Erkennt verschobene/eingefügte Bildregionen strukturell (im reg-suit-Report) |
| **RFC 6902 / RFC 7386** | Standard-Patch-Formate | – | – | [JSON Patch](https://datatracker.ietf.org/doc/html/rfc6902) / [JSON Merge Patch](https://datatracker.ietf.org/doc/html/rfc7386) für Store- und Rollback-taugliche Diffs (Interop-Variante zu jsondiffpatch-Delta) |

## Detail-Findings

### 1) Playwright als Capture- und Vergleichsengine

- `toHaveScreenshot()` erzeugt beim ersten Lauf Referenzbilder, vergleicht danach und **wartet, bis zwei aufeinanderfolgende Screenshots identisch sind** – eine eingebaute Stabilisierung ([Visual comparisons](https://playwright.dev/docs/test-snapshots)).
- Defaults laut API-Referenz ([PageAssertions](https://playwright.dev/docs/api/class-pageassertions)): `animations: "disabled"`, `caret: "hide"`, `scale: "css"`, `threshold: 0.2` (akzeptierte Farbdifferenz im YIQ-Raum); `maxDiffPixels`/`maxDiffPixelRatio` sind **nicht** gesetzt (bewusst konfigurieren). `stylePath` ist der offizielle Hebel, um volatile Elemente (iFrames, Banner, Timestamps) auszublenden.
- **Wichtigste Warnung der Doku:** Rendering variiert nach OS, Browser-Version, Hardware, Headless-Modus; Baselines müssen in **derselben Umgebung** erzeugt werden ([Visual comparisons](https://playwright.dev/docs/test-snapshots)). Konsequenz: Capture immer im gepinnten offiziellen Docker-Image ([Playwright Docker](https://playwright.dev/docs/docker)), nie „mal lokal, mal CI“.
- Font-Determinismus ist ein bekanntes Praxisproblem (Kerning/Hinting je OS; [Playwright Issue #20203](https://github.com/microsoft/playwright/issues/20203)). Argos' eigener Playwright-Quickstart empfiehlt als Launch-Optionen **`--disable-lcd-text` und `--font-render-hinting=none`**, damit „glyphs render identically on your machine and on CI“ ([Argos Docs](https://argos-ci.com/docs/quickstart/playwright-quickstart)). Zusätzlich: Web-Fonts abwarten (`document.fonts.ready`, Fonts selbst hosten statt Google-Fonts-CDN).
- Baselines liegen als PNG (bei Bedarf `.webp`) im Repo-Ordner `*.spec.ts-snapshots/`; die Doku empfiehlt, sie zu committen ([Visual comparisons](https://playwright.dev/docs/test-snapshots)). Für Senify passt das Git-Modell nicht (Seiteninhalte leben in DB/Storage); hier eigene Baseline-Verwaltung nötig (siehe Skizze).
- `fullPage` ist bei `toHaveScreenshot` standardmäßig `false`; Full-Page-Screenshots müssen explizit angefordert werden. Vorsicht bei `position: fixed`-Elementen und Lazy-Loading (Scroll-Stitching-Artefakte) – Gegenmaßnahmen: Vor-Scrollen bis Ende, Lazy-Load-Simulation, oder pro Sektion capturen.
- Kein Review-UI, keine Multi-User-Freigabe, kein Server: Playwright ist Zustandsmaschine + CLI, die Freigabe-Logik bleibt Aufgabe der Anwendung.

### 2) Argos

- Komplettplattform: Backend, Frontend und Screenshot-Comparison-Engine in einem MIT-Repo; Marketing: „open source visual testing platform for teams and AI agents“ ([Repo](https://github.com/argos-ci/argos), [Docs](https://argos-ci.com/docs)). Der Agent-Fokus (Review des Produkts, nicht des Codes) deckt sich mit Senifys Agent-Workflow.
- Aktivität: letzter Commit am 2026-09-14 (7 h vor Abfrage), 626 ★, 5.428 Commits – eines der aktivsten Projekte im Feld.
- Self-Hosting: per Docker-Compose möglich (`docker-compose.yml` mit Postgres 18, RabbitMQ 4.2, Redis 6, DynamoDB Local + App-Services im `infra/`-Ordner), aber der Maintainer stellt klar: **„we don't provide any support or documentation for running Argos outside of our managed service“** ([Diskussion #1811](https://github.com/argos-ci/argos/discussions/1811)). Upgrade-Pfad und Betrieb sind Eigenverantwortung – bei einem schnelllebigen SaaS-kompatiblen Codebase ein reales Risiko.
- Integration (offizielle Doku): `@argos-ci/playwright`-Reporter lädt Screenshots nach dem Testlauf automatisch hoch; Freigabe/Ablehnung im Argos-UI; bis eine Baseline vom Default-Branch existiert, sind PR-Builds „orphan“ ([Quickstart](https://argos-ci.com/docs/quickstart/playwright-quickstart)). Gleiches Muster also wie bei Senify nötig: Baseline zuerst etablieren.
- Grenzen für Senify: JSON-Tree-Diff ist nicht Teil des Produkts; ein Fork zur Integration wäre erheblich (GraphQL/React-UI/Worker). Eher als lauffähige Referenz für eigene Review-UX oder als Interimslösung für rein visuelle Reviews.

### 3) reg-suit

- CLI plus Plugin-System: `reg-keygen-git-hash-plugin` (erkennt Basis-Commit im Git-Graph), `reg-publish-s3-plugin` / `-gcs-plugin` (Baselines + Report in Cloud-Storage), Notify-Plugins (GitHub/GitLab/Slack) ([README](https://github.com/reg-viz/reg-suit)).
- Reports: HTML via reg-cli; mit `core.ximgdiff` zusätzlich strukturelle Bild-Diffs (`x-img-diff-js`) – „which parts of testing image were inserted or moved“ ([README](https://github.com/reg-viz/reg-suit)).
- Schwellwerte: `thresholdRate`, `thresholdPixel`, `enableAntialias` konfigurierbar ([README](https://github.com/reg-viz/reg-suit)).
- Reifegrad: 1,3k ★, MIT, nicht archiviert, letzte Version v0.14.6 vom 2026-03-16. Kein Archivierungs- oder „Maintainer gesucht“-Signal, aber auch keine schnelle Entwicklung. Für einen reinen CI-Report-Workflow nutzbar; für interaktive Freigaben (wer sieht was, akzeptiert/verwirft, Kommentare, Historie) fehlt alles.

### 4) BackstopJS

- MIT, 7,2k ★, Puppeteer-basiert, Konfiguration per `backstop.json`, Referenzbilder in `bitmaps_reference/`, Docker-Support, `backstop approve` zum Übernehmen ([Repo](https://github.com/garris/BackstopJS)).
- Aber: letzter Push zwar 2026-09-08, doch **README-News: „BackstopJS needs a new maintainer/owner“** und 579 offene Issues. Die Argos-Analyse („project has been in maintenance mode“, [argos-ci.com/blog/backstopjs-alternative](https://argos-ci.com/blog/backstopjs-alternative), Aug 2026) deckt sich damit. Für einen neuen, langlebigen Baustein nicht empfehlenswert.

### 5) Lost Pixel

- MIT, 1,7k ★ – **Repository am 2026-04-22 archiviert**, Ankündigung „Lost Pixel is joining Figma“, Produkt wird eingestellt ([Repo](https://github.com/lost-pixel/lost-pixel)). Fällt als Option komplett weg. Relevanz: Der OSS-Kern nutzte Playwright + eigene Flakiness-Utilities (Retries, Masking, Thresholds) – als Ideengeber weiter nützlich ([Archiv-README](https://github.com/lost-pixel/lost-pixel)).

### 6) Visual Regression Tracker (Alternative)

- Apache-2.0, 712 ★, aktiv (Push 2026-09-01), explizit self-hosted: Backend + Frontend + Node-Worker (Cypress/Playwright-Worker), Web-UI zum Akzeptieren von Abweichungen, REST-API ([Repo](https://github.com/Visual-Regression-Tracker/Visual-Regression-Tracker)). Weniger populär als Argos, weniger Agent-Features, aber architektonisch genau das „Approval-Queue für Screenshots“-Muster. Als Zweitoption bzw. Bauplan-Referenz führen.

### 7) Diff-Engines im Vergleich (Bild)

- **pixelmatch** (ISC): „smallest, simplest and fastest JavaScript pixel-level image comparison library“, Anti-Aliasing-Erkennung, Perceptual-Metric; von Playwright als Standard-Engine verwendet ([Repo](https://github.com/mapbox/pixelmatch), [Playwright Docs](https://playwright.dev/docs/test-snapshots)).
- **odiff** (MIT): „very fast SIMD-first image comparison library (with nodejs API)“, nativ (Zig); Benchmarks zeigen Vorteile erst bei sehr großen Bildern (Full-Page!), pixelmatch ist bei kleinen Bildern schneller ([Repo](https://github.com/dmtrKovalenko/odiff), [Benchmark-Blog](https://vizzly.dev/blog/honeydiff-vs-odiff-pixelmatch-benchmarks/)).
- Empfehlung: **Start mit pixelmatch** (Null-Zusatzabhängigkeit, JS, gleiche Semantik wie Playwrights eigener Vergleich); **odiff als Upgrade-Pfad**, falls Full-Page-Multi-Viewport-Diffs zum Flaschenhals werden. Beide können Diff-PNG + Pixelzahl liefern → Basis für Schwellwerte und Metriken.
- Für „bewegte“/verschobene Layouts liefert x-img-diff-js zusätzliche strukturelle Erkenntnisse – interessant, aber ohne Web-UI-Integration (reg-suit-Report) als Standalone wenig nützlich.

### 8) Strukturierter JSON-Diff

- **jsondiffpatch** (MIT, TS, 5,3k ★, Push 2026-05-14): Delta-Format mit `diff`/`patch`/`reverse`; `objectHash` sorgt dafür, dass Sektionen anhand stabiler IDs (z. B. `section.id`) gematcht werden – Moves/Reorders erscheinen als Move statt Delete+Insert; HTML-Formatter für die Review-Ansicht vorhanden ([Repo](https://github.com/benjamine/jsondiffpatch), [jsondiffpatch.com](https://jsondiffpatch.com)).
- **Warum nicht nur Screenshots?** Der JSON-Diff fängt Änderungen, die visuell unsichtbar sind (Alt-Texte, Links, SEO-Metadata, Schema-Markup, z-index/Struktur), der Screenshot-Diff fängt Änderungen, die im Baum nicht sichtbar sind (CSS/Theme-Tokens, Fonts, Rendering). Erst die **Kombination** gibt dem Menschen ein vollständiges Bild – und dem Agenten ein präzises, maschinenlesbares Signal für Nachbesserungen.
- **Warum nicht nur JSON?** Ein Diff kann syntaktisch korrekt und trotzdem kaputt gerendert sein (Text-Overflow, Kontrast, Layout-Bruch). Der Screenshot bleibt die Ground Truth für die visuelle Freigabe.
- Standardisierung/Interop: Für Persistenz und Rollback kann zusätzlich ein RFC-6902-JSON-Patch abgeleitet werden ([RFC 6902](https://datatracker.ietf.org/doc/html/rfc6902)); alternativ reicht jsondiffpatch-`reverse` für Undo. RFC 7386 (Merge Patch) nur, falls externe Systeme „Merge“-Semantik erwarten ([RFC 7386](https://datatracker.ietf.org/doc/html/rfc7386)).

## Empfehlung + Integrationsskizze

### Empfehlung (Top-3)

1. **Default: Eigenbau-Layer auf Playwright + pixelmatch + jsondiffpatch** in der Senify-App (Postgres). Maximale Kontrolle über Datenmodell (Revisionen aus Ticket 05), Freigabe-Regeln (Ticket 06), UI und Retention; alle Lizenzen permissiv (Apache-2.0/ISC/MIT); keine zusätzliche Serverflotte.
2. **Option B (Fertiglösung): Argos self-hosted** für den reinen Screenshot-Review-Teil, wenn die eigene UI zu teuer wird. MIT, sehr aktiv, aber: kein Self-Host-Support, schwerer Stack; JSON-Diff bleibt Eigenbau daneben. Vorher Spike mit echtem Compose-Setup + Upgrade-Test einplanen.
3. **Option C (CI-nah): reg-suit** mit S3/GCS für Git-/CI-getriebene Report-Workflows ohne interaktive Freigabe. Nur, wenn die Approval-Queue ohnehin im Git-Review stattfindet (widerspricht dem Senify-Anspruch, daher Fallback).

**Nicht wählen:** BackstopJS (Maintainer gesucht), Lost Pixel (archiviert). Chromatic/Percy nur als Benchmark. Visual Regression Tracker als Bauplan-Referenz für eine fertige Self-Hosted-Approval-Struktur.

### Pipeline-Skizze (Agent-Änderung → Freigabe)

```
Agent mutiert Seiten-JSON (Revision R+1, versioniert via Ticket 05)
        │
        ▼
[1] Render/Preview: immutable Preview-URL je Revision (deterministischer Build)
        │
        ▼
[2] Capture (Playwright, gepinnte Docker-Umgebung)
    • launch: --disable-lcd-text --font-render-hinting=none, fixes ColorProfile/DPR
    • Kontext: feste Viewports (z. B. 1440/768/390), colorScheme fix, reducedMotion: 'reduce'
    • Warten: document.fonts.ready + app-eigenes "render-complete"-Signal (Ticket 02);
      im Capture-Mode Motion einfrieren (GSAP-Timelines pausiert, WebGL-Frame fix)
    • Screenshots: page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide',
      scale: 'css', mask, stylePath }) + pro Sektion locator.screenshot() + boundingBox()
        │
        ▼
[3] Diff
    • Bild: pixelmatch (Start) / odiff (Skalierung) gegen Baseline der letzten
      freigegebenen Revision → diff.png, changed-px, ratio (Schwellen je Seite/Viewport)
    • Baum: jsondiffpatch.diff(baselineTree, newTree, { objectHash: n => n.id })
      → geordnete Änderungsliste (add/remove/move/text/props) je Sektion, mit Severity
        │
        ▼
[4] Approval-Item (Postgres): Revision-IDs, Screenshot-Set (before/after/diff),
    JSON-Delta, Metriken, Masken-Info; Blobs content-addressed (sha256) auf S3/MinIO
        │
        ▼
[5] Review-UI (Ticket 06): Side-by-Side + Overlay/Slider; JSON-Diff als strukturierte
    Liste; Klick auf JSON-Change hebt Sektion im Screenshot hervor (bbox) und umgekehrt;
    "nicht verglichen"-Markierung für maskierte/freigegebene volatile Bereiche
        │
        ▼
[6] Entscheidung: Approve → Baseline-Zeiger der Seite auf R+1 (Snapshots promote);
    Reject + Kommentar → Agent revidiert (neue Revision, Diff gegen dieselbe Baseline);
    Undo via jsondiffpatch reverse oder RFC-6902-Patch
```

**Bausteine der Kombination Screenshot + JSON:**

- **Verknüpfung über stabile IDs:** Beim Capture liegt für jede Sektion die `boundingBox()` vor. Der JSON-Delta-Node kennt die Section-ID → UI kann beide Repräsentationen bidirektional verlinken („diese Textänderung entspricht dieser Bildregion“).
- **Severity-Klassifikation aus dem JSON-Diff:** z. B. `text` (Content), `props`/`theme` (Design), `structure` (add/remove/move) → steuert Priorisierung und ggf. Regeln (Layout-/Struktur-Änderungen brauchen strikte Freigabe; Copy-Änderungen sind billiger zu reviewen).
- **Noise-Kontrolle:** Threshold je Seite/Sektion, Retry des Captures bei Instabilität, Masken (`mask`) + `stylePath` für Datum/Uhrzeit, Quarantäne-Flag statt Löschen von Seiten, die dauerhaft nicht deterministisch sind (explizit im UI anzeigen, nicht stillschweigend ignorieren). Argos fängt dasselbe Problem mit „orphan builds“ vor der ersten Baseline ab – d. h. erste Freigabe etabliert die Baseline.
- **Storage:** Postgres (Metadata, Approval-State), Blobs content-addressed (Dedup über Revisionen), Baseline = Zeiger auf das letzte freigegebene Snapshot-Set pro (Site, Seite, Viewport). Retention-Richtlinie separat – Full-Page-Shots × Viewports wachsen sonst unbegrenzt.
- **Job-Ausführung (Stack-konsistent):** Capture/Diff als Node-Worker im Monorepo; Job-Queue auf Postgres (z. B. pg-boss) statt Redis, um keine neue Infrastruktur einzuführen (Redis käme nur bei Argos-Self-Hosting sowieso).

**Determinismus-Checkliste (Minimum):**

1. Gepinnte Playwright-Version + offizielles Docker-Image für alle Captures (Baselines nur dort erzeugen). ([Playwright Docs](https://playwright.dev/docs/docker), [Visual comparisons](https://playwright.dev/docs/test-snapshots))
2. Fonts self-hosten; `document.fonts.ready` + Renderer-Signal abwarten; `--font-render-hinting=none`, `--disable-lcd-text`. ([Argos Docs](https://argos-ci.com/docs/quickstart/playwright-quickstart), [Playwright Issue #20203](https://github.com/microsoft/playwright/issues/20203))
3. Animationen aus (`animations: 'disabled'` ist Default; `reducedMotion` emulieren) + für Motion-/3D-Sektionen ein expliziter Capture-Mode im Renderer (Freeze bei definiertem Zeitpunkt). ([PageAssertions](https://playwright.dev/docs/api/class-pageassertions))
4. Feste Viewports, DPR=`css`, fixes ColorProfile; volatile Elemente maskieren/ausblenden (`mask`, `stylePath`). ([PageAssertions](https://playwright.dev/docs/api/class-pageassertions))
5. Schwellwerte bewusst setzen (`threshold` 0.1–0.2, `maxDiffPixels`/`maxDiffPixelRatio` pro Seite), Anti-Aliasing-Toleranz der Engine nutzen. ([PageAssertions](https://playwright.dev/docs/api/class-pageassertions), [pixelmatch](https://github.com/mapbox/pixelmatch))

## Offene Fragen / Unsicherheiten

1. **Selbstbau vs. Argos-Fork:** Wie viel UI-Aufwand spart Argos wirklich, wenn der JSON-Diff sowieso daneben gebaut werden muss? Und wie tragfähig ist der Betrieb ohne Self-Host-Doku (Tempo der Breaking Changes im Repo)? → Spike nötig, bevor die Entscheidung final wird.
2. **Motion/3D-Determinismus:** Friert der Renderer Timelines/WebGL deterministisch ein? Falls nicht, ist der Screenshot-Diff für Awwwards-Sektionen nur mit Maskierung („nicht verglichen“) haltbar. Braucht Software-GL (z. B. SwiftShader) im Capture-Container und einen eigenen Spike (Ticket 18/02).
3. **Font-Stack:** Welche Fonts nutzen generierte Sites (variable Fonts, Subsetting)? Rendering-Differenzen zwischen Mac-Dev und Linux-CI sind ein bekanntes Fehlerbild – die Docker-Pflicht mildert, eliminiert es aber nicht vollständig.
4. **Schwellwert-Kalibrierung:** Welche false-positive-Rate ist für die interne Nutzung akzeptabel? Wie viele Viewports/Seiten werden standardmäßig verglichen (Kosten vs. Abdeckung)?
5. **Baseline-Bootstrapping:** Ab wann gilt die erste Revision als Baseline (Argos: „orphan build“-Muster übernehmen)? Wer approvalt initial – nur der Mensch?
6. **Retention/Kosten:** Wie lange bleiben alte Snapshot-Sets? Full-Page × 3 Viewports × viele Revisionen ist ein Storage- und CPU-Thema.
7. **CI-/Runner-Setup:** Wo laufen Capture-Jobs (interner Runner vs. GitHub Actions)? Das Repo-/CI-Setup ist laut `map.md` noch nicht spezifiziert.
8. **Vizzly als Wildcard:** Sehr aktiv und explizit agent-orientiert („agent-readable CLI output“, [vizzly.dev](https://vizzly.dev/open-source/)), aber winzige Community und proprietäre Review-Plattform. In 6–12 Monaten erneut prüfen.

## Quellen

1. Argos – GitHub-Repository (MIT, Aktivität): https://github.com/argos-ci/argos
2. Argos – Docs Overview (OSS-Plattform): https://argos-ci.com/docs
3. Argos – Diskussion #1811 „Self hosting possible?“ (kein Support/Doku für Self-Hosting): https://github.com/argos-ci/argos/discussions/1811
4. Argos – docker-compose.yml (Services: Postgres, RabbitMQ, Redis, DynamoDB): https://raw.githubusercontent.com/argos-ci/argos/main/docker-compose.yml
5. Argos – Playwright Quickstart (Reporter, Launch-Args, Orphan-Baselines): https://argos-ci.com/docs/quickstart/playwright-quickstart
6. reg-suit – GitHub-Repository & README (MIT, Plugins, S3/GCS, x-img-diff-js, v0.14.6): https://github.com/reg-viz/reg-suit
7. BackstopJS – GitHub-Repository (MIT, „needs a new maintainer/owner“): https://github.com/garris/BackstopJS
8. BackstopJS – GitHub-API-Metadaten (7.180 ★, 579 Issues, Push 2026-09-08): https://api.github.com/repos/garris/BackstopJS
9. Lost Pixel – GitHub-Repository (archiviert 2026-04-22, „joining Figma“): https://github.com/lost-pixel/lost-pixel
10. Visual Regression Tracker – GitHub-Repository (Apache-2.0, self-hosted): https://github.com/Visual-Regression-Tracker/Visual-Regression-Tracker
11. Vizzly CLI – GitHub-Repository (MIT): https://github.com/vizzly-testing/cli
12. Vizzly – Open-Source-Seite (agent-readable Output, OSS-Programm): https://vizzly.dev/open-source/
13. Chromatic – Preise (179 $/35k Snapshots): https://www.chromatic.com/pricing
14. Argos-Blog – „Visual Testing Pricing in 2026“ (Vergleich): https://argos-ci.com/blog/visual-testing-pricing
15. Argos-Blog – „BackstopJS Alternative“ (Wartungsmodus-Einordnung): https://argos-ci.com/blog/backstopjs-alternative
16. Playwright – Visual comparisons (toHaveScreenshot, pixelmatch, Umgebungs-Warnung, stylePath): https://playwright.dev/docs/test-snapshots
17. Playwright – PageAssertions-API (Defaults: animations/caret/scale/threshold, mask, fullPage): https://playwright.dev/docs/api/class-pageassertions
18. Playwright – Docker (gepinnte Capture-Umgebung): https://playwright.dev/docs/docker
19. Playwright – Issue #20203 (Font-Determinismus, Docker-Konsistenz): https://github.com/microsoft/playwright/issues/20203
20. pixelmatch – GitHub-Repository (ISC, Anti-Aliasing-Erkennung): https://github.com/mapbox/pixelmatch
21. odiff – GitHub-Repository (MIT, SIMD, Node-API): https://github.com/dmtrKovalenko/odiff
22. Vizzly-Blog – odiff/pixelmatch-Benchmark (Skalierung bei großen Bildern): https://vizzly.dev/blog/honeydiff-vs-odiff-pixelmatch-benchmarks/
23. jsondiffpatch – GitHub-Repository (MIT, Delta/Patch/Reverse, HTML-Formatter): https://github.com/benjamine/jsondiffpatch
24. jsondiffpatch – Website/Playground: https://jsondiffpatch.com
25. RFC 6902 – JSON Patch: https://datatracker.ietf.org/doc/html/rfc6902
26. RFC 7386 – JSON Merge Patch: https://datatracker.ietf.org/doc/html/rfc7386
27. Loki – GitHub-Repository (Storybook-fokussiert, MIT): https://github.com/oblador/loki
28. awesome-regression-testing – kuratierte Tool-Liste: https://github.com/mojoaxel/awesome-regression-testing
