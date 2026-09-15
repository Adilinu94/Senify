# Wayfinder-Map: Senify v1

## Destination

Baubare Spezifikation für **Senify v1**: agent-native Website-Plattform („WordPress für KI-Agenten") als **lokales Programm** (Web-App im Browser; Engine lokal auf dem eigenen Rechner) — Tabs **Referenzen · Projekte · Editor · Einstellungen**; Kern-Engine via MCP, **Content-Kern (Collections/Entries, Entry-Templates, Loops, Forms + Submissions)**, **Referenzen-Tab (Website-Analyse → volles Design-Profil)**, visueller Editor (Puck, Instatic-Niveau), Review als Teil des Projekts, AEO-/Qualitäts-Checks. Am Ende steht ein Spec (via `/to-spec`), von dem `/to-tickets` → `/implement` ohne offene Entscheidungen starten können.

> **Status 15.09.2026: Alle 28 Tickets gelöst — die Route ist vollständig!** 23 Artefakte, 3 ADRs, Glossar, Prototyp, 12 Research-Dokumente tragen die Entscheidungen. Die **Spec ist geschrieben** ([spec.md](spec.md), `Status: ready-for-agent`, 114 User Stories, 3 Prüfstellen). Nächster Schritt: **`/to-tickets`** → `/implement`.

## Notes

- Domäne: strukturierte Sektionen + Komponenten-Registry (JSON-Baum); TS-Stack (React/Next-artig, Node, Postgres).
- Qualitätsmodell: **Schlicht-modern ist ein vollwertiger Default** — Sites müssen nicht aufwändig sein. Framer-/Webflow-Niveau als Basis; Awwwards-Level (Motion, 3D) als **Optionsstufe** (Eskalation, kein Muss). Sektionen müssen ohne Motion vollwertig aussehen.
- Programm (15.09.): **lokale Web-App im Browser**; Engine komplett lokal (Postgres/Builds/Assets auf dem eigenen Rechner); Desktop-Verpackung/Remote-Betrieb später (Fog).
- v1 in **voller Breite** (15.09.): Programm-Shell + Content-Kern + Referenzen-Tab + Editor + Media + Forms — kein Sequenz-Schnitt, alle Bereiche parallel.
- Review/Approval: **Teil des Projekts** (kein eigener Tab).
- Referenzen-Tab: **volles Design-Profil** (Tokens + Stil-Guide); Guardrail „family resemblance, not clone" — keine Assets/Layouts 1:1 kopieren.
- Site-Profile (schlicht ↔ Showcase) & Intensität: entschieden in Ticket 21 (`clean` · `standard` · `showcase`).
- Kontext: internes Werkzeug für Agentur-Arbeit (kein Launch, kein Billing, keine externen Mandanten); Ziel-Workflow bleibt Agentur-/Kunden-tauglich.
- Sprache: Artefakte Deutsch, Fachbegriffe Englisch.
- Fragen an den Nutzer: immer über den Klick-Wizard (siehe `AGENTS.md` § Arbeitsweise).
- Primärquelle: `RESEARCH.md` (Repo-Root). Research-Ergebnisse unter `.scratch/senify-v1/research/`.
- Referenzprojekte (OpenPage, Instatic, OpenDesign): Learnings in `research/20-referenzprojekte.md` — als `Input:` in Tickets 01, 02, 07, 08, 09, 10, 11, 14 verdrahtet.
- Framer-Referenzprojekt (Unframer MCP, Live: https://innocent-labeling-877706.framer.app): Analyse in `research/22-framer-analyse.md` — Muster für Sektionen, Tokens, Varianten/Props.
- Deep-Dives 15.09. (Shallow-Clones unter `Repos/`): `research/24-payload-learnings.md` · `research/25-emdash-learnings.md` · `research/26-instatic-delta.md` · `research/27-taste-vault-learnings.md` — Inputs für Tickets 22–28.
- Bei Ticketarbeit: Skills `/grilling` + `/domain-modeling` laden.

## Decisions so far

<!-- eine Zeile pro geschlossenem Ticket; Charting-Entscheidungen sind markiert -->

- *(Charting)* **Greenfield, WP-frei** — der Kern hat nichts mit WordPress zu tun (siehe `RESEARCH.md`).
- *(Charting)* **Destination & v1-Scope** — Spec für v1 = Kern via MCP + Docs-Portal v0 + visueller Editor + Approval-Queue + AEO-Checks.
- *(Charting)* **Bau-Modell** — strukturierte Sektionen (JSON) + Komponenten-Registry; kein freier Code pro Site.
- *(Charting)* **Nutzer** — internes Werkzeug für den Agentur-Workflow (du dogfoodst; kein Produkt-Launch).
- *(Charting)* **Qualitätslatte** — Framer-Niveau Minimum; Awwwards/3D/experimentell (modernste Technologien) als Ziel.
- *(Charting)* **Delivery** — rein internes Tool; keine SaaS-/Billing-/Mandanten-Architektur.
- *(Charting)* **Stack** — TypeScript überall (React/Next-artiger Kern, Node, Postgres).
- *(Charting)* **Zusatz-Scope** — Importe, i18n und Plattform-AI-APIs sind nicht in v1 (→ Out of scope).
- *(Research)* **Editor-Basis** — Puck (MIT-Core, ~13k Stars) ist die reifste einbettbare Basis mit JSON-Baum + Component-Registry; Agenten schreiben über `dispatch`/`onChange` (nicht `data`); Puck AI/Cloud bleibt außen vor. Details: [research/16-editor-basis.md](research/16-editor-basis.md)
- *(Research)* **Renderer** — Astro 7 bester Fit (0-KB-JS-Baseline, schnellste Builds, Agent-Features); Stolpersteine: statische `client:*`-Direktiven beim JSON-Baum (Dispatcher-Pattern) und Cross-Island-Choreografie; Next.js = Fallback, Eigenbau lohnt nicht. Details: [research/17-renderer.md](research/17-renderer.md)
- *(Research)* **Motion/3D-Patterns** — Kuratiertes Preset-System mit typisierten Motion-Specs (Preset + Intensity + Token-Timing + Pflicht-Reduced-Motion) statt frei generiertem Animations-Code; GSAP + ScrollTrigger als Choreografie-Kern, Motion für React-State, R3F als isolierte Lazy-3D-Sektion. Details: [research/18-motion-3d.md](research/18-motion-3d.md)
- *(Research)* **Approval-Tooling** — Kein OSS-Tool kombiniert Screenshot- und JSON-Diff: eigener Approval-Layer bauen — Playwright (Capture) + pixelmatch/odiff (Bild) + jsondiffpatch (JSON) + eigene Review-UI; Argos self-hosted als Fallback. Details: [research/19-approval-tooling.md](research/19-approval-tooling.md)
- **Datenmodell & Schema-System** — Flacher NodeTree + registry-regulierte Verschachtelung/Slots; Breakpoint-Overrides per Node; Tokens-first in Props; Entitäten: Site/Page/Node/Section/Asset/Theme/Revision/Release; TypeBox + `schemaVersion` (additive, Deprecation); nur kanonische Mutationen; Draft + immutable Revisionen (Release-Bündelung); Postgres + JSONB. Artefakt: [artifacts/01-datenmodell.md](artifacts/01-datenmodell.md)
- **Renderer der generierten Sites** — Astro 7 (SSG, Islands); vollstatischer Bake pro Release; Markup-first + deklarative Motion über Page-Script-Layer; echte Build-Previews; Editor separat mit geteiltem Section-SDK; React-Sektionen frei von Renderer-Code (Next = dokumentierter Fallback); 3D scroll-gekoppelt → Prototype „Scroll-gekoppelte 3D-Choreografie" (Issue 20). Artefakt: [artifacts/02-renderer.md](artifacts/02-renderer.md)
- **Prototype: Scroll-gekoppelte 3D-Choreografie** — validiert (Nutzer-Check ✅): ein persistenter Canvas hinter DOM-Flow; Shared Store (window-gebunden, im Build geteilter Chunk); ein rAF-Loop (Lenis↔ScrollTrigger); Pin speist Store → scrub-gekoppelte Kamera-/Objekt-Choreografie; 3D-Bundle 879 KB → lazy laden. Verbindliche Muster → Tickets 03/08. Asset: [prototypes/scroll-3d/](prototypes/scroll-3d/)
- **Motion- & 3D-Technologie** — 3-Layer-Stack (GSAP+ScrollTrigger Choreografie · CSS-Baseline · Motion für React-State); Lenis Standard an (Mobile aus); voller Preset-Katalog (24, A–G); Motion-Spec = Preset + Intensity-Dial + Tokens; Guardrails teilweise hart (Pin ×1, Parallax ×2, keine Scroll-Listener, RM Pflicht); Budgets = Richtwerte ohne Gates; 3D = 1 Canvas/Seite, lazy, Mobile-Poster. Artefakt: [artifacts/03-motion-3d.md](artifacts/03-motion-3d.md)
- **MCP-Betrieb & Authentifizierung** — lokaler stdio-MCP via Senify-CLI (transport-agnostischer Kern, remote später); scoped API-Tokens pro Client (revocierbar, gehasht); 3 Scopes `read`/`write`/`publish` (serverseitig durchgesetzt); `senify mcp configure` + Docs; Single-Operator-Zugang; Rate-Limits + volles Audit-Log. Artefakt: [artifacts/04-mcp-betrieb.md](artifacts/04-mcp-betrieb.md)
- **Versionierung & Lifecycle** — Revisionen pro Page; Release = vollständiger Site-Commit (alle Seiten + Theme); Previews = immutable Draft-Builds mit Token-URL + TTL (30 Tage); append-only (Restore → neuer Draft, Rollback → neues Release); lebender Draft + Undo; Agent Draft/Preview, Mensch Publish. Artefakt: [artifacts/05-lifecycle.md](artifacts/05-lifecycle.md)
- **Approval-Queue & Guardrails** — dreiteilige Review-Ansicht (Struktur-Diff + Screenshot-Diff + Preview-Link); Trigger = Agent-Submit; Aktionen Approve/Request changes/Discard; ganzes Review-Item (kein Teil-Approval); Screenshots = betroffene Seiten × 3 Breakpoints; Motion-Video nur bei Motion-Änderungen; Hard-Guardrails blocken vor dem Review. Artefakt: [artifacts/06-approval.md](artifacts/06-approval.md)
- **Design-Token- & Theme-System** — zwei Ebenen (Primitives → Semantik) über 6 Skalen; Skalen-Engine generiert + überschreibbar; Light/Dark strukturell; JSON (DTCG-nah) → CSS-Variablen + Tailwind-v4-Theme; Fonts kuratiert + self-hosted; Agenten setzen Rollen, nie Rohwerte. Artefakt: [artifacts/07-tokens.md](artifacts/07-tokens.md)
- **Section-Library v1 & Registry** — 25 Sektionen (erweiterter Katalog) × 2–3 Varianten (~55–60); self-contained + sparsame Slots; freie Style-Props (Token-first); Registry trägt TypeBox-Validierung + UI-Metadaten in einem Schema; Golden-Beispiel + Thumbnail je Sektion. Artefakt: [artifacts/08-section-library.md](artifacts/08-section-library.md)
- **Visueller Editor** — Puck (MIT) als Basis mit Mapping auf den NodeTree; volle Werkbank (Sections/Props/Varianten/Overrides/Theme/Motion/Undo); optimistisches Locking; Live-Canvas + echte Build-Preview; Breakpoint-Umschalter mit Override-Badges; History-Panel. Artefakt: [artifacts/09-editor.md](artifacts/09-editor.md)
- **MCP-Tool-Katalog v1** — Hybrid: High-Level-Verben + `apply_mutations`-Batch (atomar, dry_run); Outline-Lesen (`get_page` → `get_nodes`); 25 Tools (Kern/Lifecycle/Review/Theme/Media-minimal/Docs/Feedback); strukturierte Fehler mit Handlungsanweisung; Hard-Guardrails sofort. Artefakt: [artifacts/10-mcp-tools.md](artifacts/10-mcp-tools.md)
- **Agent-Experience & Onboarding** — ein `senify`-Skillpaket mit Knowledge-Router (generierte Referenzen aus Registry/Tools/Fehlern); `senify setup` als Ein-Kommando-Onboarding; Master-Workflow „Site aus Brief" + Szenario-Prompts; Design-Regeln mit Verweis auf bestehende Skills; `senify_feedback`-Loop. Artefakt: [artifacts/11-agent-experience.md](artifacts/11-agent-experience.md)
- **Docs-Portal v0** — Sanity-IA (Getting Started · Platform-Guides · Reference · Changelog); Astro + MDX (statisch, Plattform-Tokens); Referenz generiert + Guides kuratiert; Pagefind + „Ask AI" (BYOK); Agenten-Exports llms.txt/llms-full.txt/.md + MCP-Docs-Tools. Artefakt: [artifacts/12-portal.md](artifacts/12-portal.md)
- **AEO & Output-Qualität** — AEO-Set standardmäßig pro Site (llms.txt, .md, Structured Data, semantisches HTML; abschaltbar); JSON-LD Basis + sektions-bewusst; Checks: Integrität **hart** (Links/Alt/Kontrast/Meta/JSON-LD/Guardrails), Metriken weich; dreistufig (Schreiben → Submit → Publish). Artefakt: [artifacts/13-aeo-quality.md](artifacts/13-aeo-quality.md)
- **Hosting & Deploy** — Plattform auf EU-VPS (Docker Compose + Caddy); Kunden-Sites über Deploy-Adapter auf **Vercel/Netlify** (statische Artefakte, austauschbar); Deployment je Release + Rollback = Re-Deploy; geschützte Preview-Deployments mit TTL; Domain-Automation; tägliche EU-Backups. Artefakt: [artifacts/14-hosting.md](artifacts/14-hosting.md)
- **Media-Pipeline** — Assets zentral (EU-VPS/S3-EU, Hash-Dedupe, site-scoped); Build-time-srcset (AVIF/WebP, 480–1920) mit Blurhash; Focal-Point-Crops; Alt-Text Pflicht (Dekorativ-Ausnahme, Hard-Check); Video-Upload ohne Transcoding (Poster automatisch). Artefakt: [artifacts/15-media.md](artifacts/15-media.md)
- **Site-Profile & Intensitätsstufen** — drei Profile (`clean` · `standard` · `showcase`) mit Intensity-Caps, Preset-Klassen und Lenis-/3D-Regeln; Default `standard`; Site-Feld `profile`; harte Grenzen (Guardrail + Vorschlag); stiller Profil-Wechsel ausgeschlossen; Agenten wählen frei (Skill-Guidance). Artefakt: [artifacts/21-profile.md](artifacts/21-profile.md)
- *(Charting 15.09.)* **Programm-Form** — lokale Web-App im Browser; Engine komplett lokal (Postgres/Builds/Assets auf eigenem Rechner); Desktop-Verpackung/Remote-Betrieb später (Fog).
- *(Charting 15.09.)* **Scope-Update Content & Referenzen** — Collections/Entries, Entry-Templates/Loops, Forms+Submissions und der Referenzen-Tab (Website → Design-Profil) sind **v1** (vorher v2/Out-of-scope); Grundlage: Instatic-Deep-Dive + Nutzer-Anforderung „komplettes CMS".
- *(Charting 15.09.)* **Meilenstein** — v1 in **voller Breite** parallel (kein Sequenz-Schnitt).
- *(Charting 15.09.)* **Review-Ort** — Approval-Ansicht lebt **im Projekt** (Screenshot-Diff + Struktur-Diff + Entscheidungen), kein eigener Tab.
- **Content-Kern: Collections & Entries** — dedizierte Entitäten (JSONB-`cells` keyed by Feld-ID, `EntryVersion` je Publish, Slug-301, Trash); 16 Feldtypen (Relation typisiert, Repeater 1 Ebene); Workflow voll (draft/published/unpublished/scheduled); Agent-Draft/Mensch-Publish; Autosave + explizites Publish; Postgres-FTS; Schema-Mutation agentenfähig; Entry-Publish eigenständig + Re-Bake (→ 23); Workspace = Liste + Editor + Settings. Entblockt 23 + 26. Artefakt: [artifacts/22-content-kern.md](artifacts/22-content-kern.md)
- **Entry-Templates, Bindings & Loops** — Page als Vorlage (Layout/Collection) mit `outlet`-Baustein; Platzhalter + Text-Mix-Bindings (entry/parentEntry/site/route); neue Sektionen `collection-list` + `card` (Katalog 25→28); einfache Filter + `?seite=N`-Blättern; „Weitere Artikel" mit Ausschluss; Re-Bake nur betroffener Seiten (Abhängigkeits-Index); Live-Vorschau automatisch (read-only). Artefakt: [artifacts/23-templates-bindings-loops.md](artifacts/23-templates-bindings-loops.md)
- **Forms: Native Formulare & Submissions** — Einsendungen = Entries in Ziel-Sammlung; `contact`/`newsletter` nativ (Feldliste + „Sammlung aus Formular anlegen"); Senify-Endpoint (EU-VPS) mit signiertem Formular-Token (cache-sicher); Spam-Schutz automatisch (Honeypot/Min-Zeit/Origin/Rate-Limits); E-Mail + Programm-Ansicht; progressives Absenden; Newsletter mit Double-Opt-In (Kampagnen-Versand → v2); Consent Pflicht, Aufbewahrung bis gelöscht. Artefakt: [artifacts/26-forms.md](artifacts/26-forms.md)
- **Editor-Alignment (Instatic-Muster)** — zwei Modi (Design-Multi-Frame mit Zoom/Pan + Live, alle editierbar); Inline-Text-Editing (Puck-OOB + Multi-Frame-Delta, Escape = Revert); Explorer-Tabs (Ebenen/Seiten/Vorlagen/Medien); Cmd+K, Deep-Links, Medien-Fenster, Rings/Alt-Inspect/Toolbar — alles v1; Frame-Manager = größter Eigenbau (L); Puck gepinnt, Bugs #1829/#1794 eingeplant. Gap-Analyse: [research/28-puck-gap.md](research/28-puck-gap.md) · Artefakt: [artifacts/24-editor-alignment.md](artifacts/24-editor-alignment.md)
- **Media-Erweiterung (Instatic-Delta)** — Ordner + Tags + 4 Smart-Listen; Replace File mit Historie; Papierkorb; feine Varianten-Ladder (64–2048+Intrinsic, kein Upscaling) + `sizes`-Resolver; Bulk-Bearbeitung; alles öffentlich; Agenten volle Medien-Rechte (`write`) mit Trash/Historie/Audit/Badge als Schutz. Artefakt: [artifacts/25-media-erweiterung.md](artifacts/25-media-erweiterung.md)
- **Programm-Shell & Projektverwaltung** — Ein-Klick-Start; Tabs Projekte/Referenzen/Einstellungen (Editor = Projekt-Arbeitsbereich, Kopf-Leiste Seiten·Artikel·Vorlagen·Prüfen·Aktivität·Einstellungen); Karten-Grid mit Thumbnail/Status; Anlage nur Name; Duplizieren (mit/ohne Inhalte); Papierkorb; Aktivitätsliste (Audit). Artefakt: [artifacts/27-programm-shell.md](artifacts/27-programm-shell.md)
- **Referenzen-Tab** — vollautomatische Analyse (Playwright-Capture 3 Größen + Motion → deterministische Extraktion → KI) → Design-Profil (Tokens/Komponenten/Regeln/Stil-Blatt/Evidenz/Provenance), sofort nutzbar; im Projekt wählbar, Mischung über Skalen-Zuordnung; keine Re-Analyse; Schutzregeln „Inspiration, kein Klon"; MCP: `analyze`/`list`/`get`/`apply_reference`. Artefakt: [artifacts/28-referenzen-tab.md](artifacts/28-referenzen-tab.md)

## Not yet specified

- Repo-/Projekt-Setup: Monorepo-Struktur, CI, Environments, Secrets — klärt sich beim Spec-Schreiben.
- Persistenz-Details: Postgres-Schema, JSONB-Struktur, Storage-/Backup-Konzept — folgt aus Datenmodell + Hosting.
- Starter-Templates/-Designs für Kunden-Sites — graduiert aus „Section-Library v1".
- Observability/Logging der Agentenläufe (MCP-Calls, Fehlerraten, Kosten) — nach dem MVP-Kern.
- Desktop-Verpackung (Tauri) bzw. Remote-/WebApp-Betrieb — nach v1 (lokal/Browser zuerst).

## Out of scope

- Produktisierung: SaaS-Billing, Accounts/Abos, Marketing-Website, externes Onboarding — kein Produkt-Geschäft geplant.
- Importe: Framer/Webflow/WP → Senify (erster v2-Kandidat) — **konkretisierter Pfad:** `target-senify` im `unified-elementor-converter` (Visual IR → Senify-NodeTree + Theme + Media; Import-Paket + Senify-Import-UX); Konzept: [research/31-framer-import-konzept.md](research/31-framer-import-konzept.md).
- i18n/Multilingual für generierte Sites.
- Plattform-eigene AI-APIs (Content-/Bild-Generierung à la Sanity Agent Actions).
- Marktplatz/Ökosystem (Third-Party-Sections, Plugin-System), Mobile-Apps.
- Weitere Komfort-Features jenseits des Referenzen-Tabs (z. B. Figma-Sync, Design-Tool-Auto-Importe) — v2.
- Newsletter-Kampagnen-Versand (Massenmails, Segmentierung) — v2; v1 sammelt nur Abos ein (Double-Opt-In).
