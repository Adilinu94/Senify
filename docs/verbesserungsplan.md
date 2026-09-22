# Verbesserungsplan — Senify auf Framer/Webflow-Niveau

**Stand:** 19.09.2026 · Arbeitsbaum (`HEAD e2783da` + uncommittete Runde) · Teststand **1176 grün / 2 übersprungen / 132 Dateien**, typecheck 0, lint 0 (Log `.scratch/testlauf-19-09-m4s1.log`)

**Fortsetzung (19.09., Teil II §10–§15):** Referenz-Bibliothek 2.0, Redesign-Workflow („im Stil von …"), Anti-Slop-Qualitätssystem, Control-Matrix, UI-Design-Sprache und Ideen-Backlog — mit Verifikation am Code und an der Sammlung `C:\Users\adini\projects\Referenzsites` (688 Ordner, 678 vollständig mit `design.md`/`info.md`/`design-components.md`/`design-guidelines.md` + Hero-Screenshots). Die 2 übersprungenen Tests brauchen `TEST_DATABASE_URL` — die DB-Pfade sind im Basislauf damit ungeprüft (in §7 als Gate verankert).

**Auftrag (sinngemäß):** Ein eigener professioneller Editor, mit dem sich Framer-/Webflow-artige Webseiten gestalten lassen: einfach zu bedienen, aber mit allen Einstellungen; alles individuell einstellbar — im Editor **und** per KI-Agent über MCP; moderne UI.

**Methodik:** Sechs unabhängige Audits (Technik, Editor-UX, KI/MCP, Produktreife, Framer/Webflow-Benchmark, UI-Qualität) gegen den realen Arbeitsbaum, jeweils mit Datei-/Zeilenbelegen. Kernbehauptungen wurden anschließend stichprobenartig direkt am Code verifiziert (u. a. 49 MCP-Tools, `triggerRebake`-Stub, beide Editor-Pfade, Legacy-Farben, `hidden`-Migrationslücke). Alle Aussagen ohne Beleg sind als Empfehlung/Urteil markiert, nicht als Fakt.

**Was dieses Dokument ist:** konsolidierte Bestandsaufnahme, Zielbild, priorisierte Lücken (P0–P3; L1–L44 + R1–R14), **27 Verbesserungs-Epics** mit Akzeptanzkriterien (E1–E23 Basislauf, E24–E27 Teil II), Roadmap und die nächsten 10 Arbeitspakete (+ 10 der Fortsetzung).
**Was es nicht ist:** Ersatz für `HANDOFF.md` (Arbeitsstand), `CONTEXT.md` (Domäne), die Tickets unter `.scratch/editor-v2-rebuild/issues/` (Detailumsetzung) oder die ADRs (Entscheidungen).

**Fortsetzungs-Auftrag (Kern des Nutzerwunsches, sinngemäß):** Framer-/Webflow-artige Seiten mit einem eigenen professionellen, einfach bedienbaren Editor, der **alle** Einstellungen bietet; alles individuell einstellbar **im Editor und per KI-Agent über MCP**; ein **Referenz-Menüpunkt**, in dem Referenzseiten mit Vorschaubild und `design.md` angelegt werden; der Agent soll auf Zuruf **„erstelle ein Redesign der Seite xy im Stile der Referenzseite yz"** bauen; **keine Baukasten-/KI-Slop-Seiten**; moderne UI. Die Abschnitte 10–15 (Teil II) adressieren genau diesen Auftrag.

---

## 1. Executive Summary

**Kurzurteil.** Senify hat ein ungewöhnlich starkes, agent-natives Fundament: ein strukturiertes NodeTree-Modell, kanonische Mutationen mit Undo und Audit, eine gemessene Canvas↔Bake-Renderparität (3 abweichende Bildpunkte im 1120×48-Ausschnitt = 53.760 Pixel, Verhältnis 0,000056), offenes CSS mit Sicherheits-Grammatik, Motion-Presets mit harten Guardrails, 49 MCP-Tools, CMS/Assets/Forms/Referenzen und eine lokale Datenhoheit ohne Cloud-Zwang. Was fehlt, ist nicht die Substanz, sondern **drei Schichten**: (1) **Konsolidierung** — zwei Dokumentmodelle, zwei Editor-Pfade, verteilte History, nicht reproduzierbare Releases; (2) **Erlebnis** — der v2-Inspektor, Editor-Chrome, DnD und die moderne UI-Schicht sind spezifiziert, aber noch nicht gebaut; (3) **Betrieb** — Re-Bake ist ein Stub, Hosting/Deploy fehlt, Agenten-Schreibrechte sind nicht gefenct. Erst diese drei Schichten machen aus der starken Engine ein Produkt, das „Framer-like" verdient.

**Kernbefund in einem Satz:** Senify ist heute ein exzellentes **Agenten-Backend mit Editor-Anhang** — das Ziel ist ein **Editor-Produkt mit Agenten-Parität**.

**Aus geprüften Vorbildern (19.09., lokal getestet):** Drei produktive Agenten-Tools wurden praktisch geprüft (OpenResearch, hyperresearch, Agent-Reach — Details §16.3). Ihre stärksten, bei Senify fehlenden Muster sind aufgenommen: **Permission-Gate mit Mid-Turn-Freigaben** (Agenten-Ops warten fail-closed auf den Operator), **Run-Evidence mit Resume und Verify-Gate**, **Worktree-Isolation und Delegationsregeln** für Sub-Agenten, **Varianten-Baum mit adversarialem Review** (Kritiker + chirurgischer Patcher) und **`senify doctor`** mit Fallback-Ketten — als L39–L44 und E21–E23.

**Teil II (ab §10) — der Kern des Fortsetzungs-Auftrags:** Die vorhandene Referenz-Pipeline wird vom Analyse-Werkzeug zum **Design-Transfer-System**: `design.md`-Dokumente am Referenz-Modell, Bulk-Import der 678 Referenzordner, ein geführter **Redesign-Workflow** („Seite xy im Stil von yz") mit drei Richtungen und Design-Record, ein **Anti-Slop-Qualitätssystem** (Design-DNA, Design-Score, Slop-Heuristiken, Visual-Diff gegen die Referenz), die **Control-Matrix** für die „alles einstellbar"-Zusage an Mensch und Agent sowie die konkrete **UI-Design-Sprache**. Neue Lücken: R1–R14. Neue Epics: **E24–E27**.

### Die 12 wichtigsten Maßnahmen (Kurzliste)

| # | Maßnahme | Warum jetzt | Beleg | Prio |
|---|---|---|---|---|
| 1 | Kanonisches Dokumentmodell + v1/v2-Cutover | Zwei Vokabulare (v1 `type`/`overrides`, v2 `primitive`/Device-Suffixe) verdoppeln jede Änderung; `hidden` je Breakpoint geht bei Migration verloren | `migration.ts:56-92`, `editor-bridge.ts:104-249`, Ticket 11 | P0 |
| 2 | Release-Integrität: vollständiges Manifest + atomare Aktivierung | Rollback nutzt heute aktuelle Style-Rules/CMS-Stände statt Release-Snapshots; nicht deterministisch | `lifecycle.ts:171-244`, `types.ts:129-145` | P0 |
| 3 | Publish-Cutover über `POST /api/releases` + Paritäts-Tor als Gate | Editor-Publish und Paritätsbeweis laufen noch nicht über den echten Release-Pfad | Ticket 17, `widget-slice-browser.test.ts:19-46` | P0 |
| 4 | Agent-Sicherheit: Author aus Token ableiten, Idempotenz-Keys, `authoredBy`-Fence | `author` ist ein freies Body-Feld → Audit fälschbar; Retries nicht idempotent; Agenten dürfen Literale statt Tokens schreiben | `contract.ts:358-366`, `http.ts:897-934`, Ticket 18 | P0 |
| 5 | Editor-Shell vereinheitlichen (ein Editor, ein Store) | „Editor (bisher)" und „Canvas (neu)" sind zwei Produkte; Auswahl/History/Save divergieren | `app.js:4582-4596`, `mount.ts` vs. `canvas/canvas.ts` | P0 |
| 6 | Style-Inspektor (volles CSS-Spektrum) bauen | Das Modell ist da (ADR-0005), die Fläche fehlt; ohne ihn kein „Framer-like" | Ticket 02, `panels.ts:257-292` | P0 |
| 7 | Editor-Chrome: Explorer, Kontextmenü, Spotlight, Inline-Edit, Keyboard, Undo-UI | Grundbedienung für tägliches Arbeiten; v1 kann vieles, aber auf altem Store | Ticket 03 | P0 |
| 8 | DnD/Einfüge-Fluss (Ticket 12) | Ziehen, Plus-Punkte, Einfügelinie, Wrap — Kerninteraktion jedes visuellen Editors | Ticket 12, `canvas/insert.ts` | P0 |
| 9 | Visual Components + Templates im Editor (O14) | Wiederverwendung ist der Anti-Baukasten-Hebel; v1-Kern existiert, v2-Anbindung fehlt | Ticket 04, `templates.ts:15-277` | P0 |
| 10 | Durable Re-Bake: Jobs statt Stub | Content-Publishing stößt heute nur einen Zähler/Log an; kein inkrementeller Build | `rebake.ts:22-39` („Trigger stub"), `content.ts:116-129` | P1 |
| 11 | Moderne UI: Legacy-Palette tilgen, Zustände/Fokus/Motion nachrüsten | Magenta leckt durch die Tiefwasser-Haut; Fokus, `:active`, Reduced-Motion fehlen | `styles.ts:22-31,337,369`, UI-Audit | P0/P1 |
| 12 | Hosting-/Deploy-Adapter | „Veröffentlichen" endet heute lokal; erst damit ist die Kette geschlossen | `lifecycle.ts:233-245`, Spec §Hosting | P1 |

### Schichtenmodell

```
Schicht 3  ERLEBNIS     Inspektor · Chrome · DnD · Motion/Interactions · UI-Politur   ← sichtbar fehlend
Schicht 2  KONSOLIDIERUNG  Ein Modell · Ein Editor · Releases · Agent-Fence · Builds  ← strategisch fehlend
Schicht 1  FUNDAMENT    Mutationen · Renderparität · CSS-Compiler · MCP · CMS/Assets  ← stark vorhanden
Querschnitt BETRIEB     Builds/Jobs · Observability · Hosting/Deploy · Recht/Kosten    ← s. §8
```

---

## 2. Ist-Stand (mit Belegen)

### 2.1 Plattformkern

- **Datenmodell:** `Site → Page → NodeTree` mit Draft, Revision, Release (`CONTEXT.md:7-79`); kanonisches StyleRule-Modell `kind class|ambient|scoped` mit `selector`, `order`, `styles`, `contextStyles`, `rawCss`, `origin` (`widget-engine/src/css/style-rule.ts`).
- **Schreib-API:** typisierte Mutationen als einziges Tor — `applyMutations` validiert, klont, erzeugt Undo-Patches, prüft Baum-Integrität (`engine/src/mutations/apply.ts:968-1036`); 15 Node-Ops + Slot-/Collection-/Meta-/Motion-Ops (`mutations/contract.ts:13-29`).
- **Optimistisches Locking:** `baseDraftVersion` mit 409 + Handlungsanweisung (`http.ts:726-841`); Locks, Rate-Limits, Scopes `read/write/publish` (`auth.ts:18-24`, `rate-limit.ts:9-13`).
- **Audit:** append-only `audit_entries` pro Mutation, Theme, Site-Event; MCP-Calls separat auditiert (`server.ts:79-100`). Lücken: Page-Create/Delete, Assets, Referenzen (Audit-Bericht §4).
- **Sicherheit:** SHA-256-Token-Hashes, Pfad-Traversal-Schutz, Markdown-Sanitizing, CSS-Wert-Grammatik mit 94 Tests inkl. 23 Umgehungsfällen (`value-grammar.test.ts`), Formular-Tokens (HMAC), Upload-Limits.

### 2.2 Editor (Doppelzustand v1/v2)

- **Zwei Pfade, sichtbar im Produkt:** Umschalter „Editor (bisher)" / „Canvas (neu)" (`app.js:4582-4596`).
- **v1-Workbench (`mount.ts`, ~3.100 Zeilen):** Topbar, Explorer, Inspector (registry-generiert), Spotlight, Inline-Text, Kontextmenü, Panel-Resize, DnD-Ansätze, Motion-Panel, Live-/Design-Umschalter, Zoom-Footer. Eigene Mutations-/History-Schicht (`mount.ts:525-565`, `:764-800`).
- **v2-Canvas (`canvas/canvas.ts`):** drei Breakpoint-Frames, Katalog-Select, Forced-State-Preview, Undo/Redo über `EditorStore`, Autosave/Konfliktpfad (`state/store.ts:171-245`). Kein Inspector, kein Explorer.
- **M4 Stufe 1 (Live-Modus)** ist seit 19.09. im Code und browser-verifiziert (ein Frame, echte Seite, Motion mit Site-Profil, Zoom nur im Design); Ticket 19/03-Doku wird nachgezogen. Fund dieser Runde: Die Haut-Spezifität (0,4,0) überschrieb die Live-Regel (0,3,0) — behoben über Token-Marker (0,5,0) in `styles.ts`.
- **Responsive:** drei Stationen 1440/1024/390 (O10), Vererbung base→device→state→class→inline (`css/cascade.ts:1-23`). Lücken: `hidden` je Breakpoint geht bei Migration verloren (`migration.ts:56-92`), `clearBreakpointOverride` löscht den ganzen Breakpoint statt einer Property (`apply.ts:663-681`).
- **Inspector:** registry-generierte Felder (`panels.ts:257-292`), Token-Picker, Override-Badges — aber kein freier CSS-Raum, keine Pseudo-State-Autorenschaft, kein Box-Model/Gradient/Shadow/Transform (Ticket 02 offen).
- **Motion:** 24 Presets mit Flags, Intensity, Reduced-Motion-Pflicht, harte Guardrails im Schreib-/Submit-/Publish-Pfad (`section-sdk/src/motion.ts`, `engine/src/guardrails.ts`). Einige Presets sind `runtime: "planned"` und animieren nicht (`motion.ts:105-127`).

### 2.3 KI-Agenten & MCP (verifiziert)

- **49 MCP-Tools** (gezählt in `tools.ts`), 3 mit `scope: "publish"`. Abdeckung: Sites/Pages lesen, Nodes, Sections/Theme, `apply_mutations` (atomar, `dry_run`, 500 Ops), Motion, Previews, Reviews, Releases, Revisionen, Assets (inkl. Replace/Restore), CMS-Kern (Collections/Entries/Versionen/Suche — Lücken: `unpublish_entry`, Entry-Versionen als Tools), Submissions, Referenz-Bibliothek, Doku (`tools.ts:268-1464`).
- **Was ein Agent heute kann:** Seite anlegen, Sektionen aus Golden-Props bauen, Theme patchen, Tablet/Mobile-Overrides setzen, Klassen zuweisen, Motion setzen, CMS pflegen, Assets hochladen, Preview/Review/Publish/Rollback fahren, Referenzen analysieren und als Theme anwenden.
- **Was fehlt (Auswahl):** kein `create_site`, keine Style-Rule-Tools (HTTP existiert: `http.ts:1229-1319`), kein Undo-Endpoint (obwohl `applyUndoBatch` existiert: `apply.ts:1015-1037`), keine Revisions-/Release-/Audit-Listen, kein Seiten-Duplikat, kein Template-Setzen, keine Multi-Page-Transaktion, kein Job-/SSE-Zugriff, `dry_run` nur bei `apply_mutations`.
- **MCP-Vertragshygiene (verifiziert, L12a):** `readOnlyHint` wird korrekt aus dem Scope abgeleitet, aber `destructiveHint` ist auf **allen** Write-Tools `true` — auch auf additiven wie `create_page`/`upload_asset` (`server.ts:112-115`); `idempotentHint` und `openWorldHint` fehlen ganz (per Default also „nicht idempotent + offene Welt"). Antworten sind ausschließlich unstrukturierter Text ohne `outputSchema`/`structuredContent` (`server.ts:156-158`); Listen-Tools haben größtenteils kein `limit` und nirgends Pagination-Metadaten; Server-Instructions, MCP-Prompts, Resources und Elicitation fehlen; 5 der 49 Tool-Beschreibungen sind deutsch, 44 englisch.
- **Sicherheitslücken (verifiziert):** `author` ist freies Body-Feld (`contract.ts:358-366`) und wird ungeprüft auditiert — Audit-Fälschung möglich; keine Idempotency-Keys; Public-Routen laufen nie durch den Rate-Limiter (Loopback-Schutz); `authoredBy`-Fence (Ticket 18) offen; Klassen-Zuweisung prüft nicht, ob die Klasse existiert (`apply.ts:605-618`).

### 2.4 Render-, Preview- und Release-Pfad

- **Renderparität:** Canvas und Bake rendern dieselben Registry-Komponenten (`SectionTree`); Grund-CSS in beiden Pfaden; gemessener Durchstich: 3 abweichende Bildpunkte im 1120×48-Ausschnitt (Verhältnis 0,000056), Gegenprobe 0,485 ohne Basis-CSS (Ledger `.scratch/editor-v2-rebuild/ledger.md:25`).
- **Bake:** Full-Site-Astro-Build; `styleRulesCss` aus der Registry, global emittierte Klassen (4,2–8,2× kleiner, Ticket 14), scoped-Rekey über `nodeIdMap` (Ticket 22), AEO-Ausgaben (llms.txt, `.md`-Zwillinge, Sitemap, Robots) (`renderer/src/bake.ts:489-609`).
- **Preview/Review/Release:** signierte Preview-Builds (TTL 30 Tage), Review mit Struktur-Diff + Screenshot-Diff, Release mit Revisionen + Theme-Snapshot + Rollback (`lifecycle.ts:134-310`, `:430-649`).
- **Lücken:** Release-Manifest unvollständig (keine Style-Registry-, CMS-, Template-, Asset-Snapshots → Rollback nicht reproduzierbar); Aktivierung nicht atomar; Editor-Publish-Cutover (Ticket 17) offen; Paritäts-Tor ist Test, kein CI-Gate.

### 2.5 CMS, Assets, Forms, Referenzen

- **CMS:** 16 Feldtypen, Relations, Repeater, Slugs + 301, Status, Scheduling, Versionen, Suche (PG-FTS), Trash/Restore (`content.ts`); MCP-Kernabdeckung (Lücken s. §2.3); Entry-Publish stößt Re-Bake an (Stub, s. u.).
- **Assets:** signierte Uploads, Hash-Dedupe, Ordner/Tags/Smart-Listen, Replace-Historie, Varianten (AVIF/WebP), Blurhash (`media.ts`, `variants.ts`); Focal-Point-Crop fehlt.
- **Forms:** native Sektionen, signierte Snapshots, Honeypot/Mindestzeit/Origin/Rate-Limit, SMTP-Outbox, DOI, Submissions als Entries (`forms.ts`).
- **Referenzen:** Playwright-Capture → deterministische Extraktion mit Belegstellen → KI-Klassifikation → Style-Brief → `apply_reference` (Theme-Draft). Alleinstellung gegenüber Framer/Webflow.
- **Re-Bake (verifiziert):** `triggerRebake` ist ein Stub — Zitat: „Trigger stub for ticket 23: T09 owns the trigger, not the job. It records and counts the request so tests and diagnostics can observe it." (`rebake.ts:22-39`, Duplikat in `content.ts:116-129`). Es gibt bereits eine Abhängigkeitsberechnung (`affectedPaths`), aber keinen Job, keine Queue, kein Retry.

### 2.6 Qualitätsstand

- **Tests:** 1176 grün / 2 übersprungen (brauchen `TEST_DATABASE_URL`) / 132 Dateien; Browser-Tests für Editor, Canvas, Panels, Forms, Submissions, Widget-Slice (Parität).
- **Bekannt flaky:** `engine/test/theme.test.ts` (Ephemeral-Port/undici), vereinzelte Worker-Fehler bei inhaltlich grünem Lauf.
- **Doku:** HANDOFF, map, ledger, 22 Tickets, 6 ADRs, UI-Plan mit Kontrast-/Zustandsvertrag und Sollbild (`ui-preview/index.html`).

### 2.7 Was Senify bewusst anders/besser macht

1. **Agent-native statt KI in der Oberfläche:** derselbe Mutationsvertrag für Mensch und Agent; kein Browser-Bridge nötig (Framer öffnet External Agents erst seit 2026 und mit Grenzen; Webflow zog mit MCP 2.0 nach).
2. **Offenes CSS statt proprietäres Stilmodell:** freie Properties, `ambient`-Selektoren, `rawCss`, `contextStyles` — Sicherheit über Wert-Grammatik, nicht über Verbote (ADR-0005).
3. **Offenes Ergebnis:** der Bake ist statisches HTML/CSS/JS; kein Export-Feature nötig, weil das Ergebnis selbst offen ist.
4. **Lokale Datenhoheit:** Engine/Postgres/Assets lokal, tägliche Backups + Restore-Route (Betriebsprozedur und Verschlüsselung offen, s. §8), eigene Formular-Endpunkte; keine Item-, Seat- oder Locale-Limits.
5. **Qualität als System:** Registry-als-Gesetz, Hard-Guardrails im Schreibpfad, gemessene Parität, Review-Diff-Queue.
6. **Referenz-Pipeline + AEO-Defaults:** URL→Design-Profil→Theme; llms.txt/`.md`-Zwillinge/JSON-LD standardmäßig.

---

## 3. Zielbild

### 3.1 Produktvision

> **Ein Editor wie Framer — mit den Freiheiten von offenem CSS und der Qualität eines Systems, das Mensch und Agent auf demselben Vertrag arbeiten lässt.**

Drei Leitsätze:

1. **Einfach by default, tief bei Bedarf.** Ein Anfänger zieht eine Sektion hinein, ändert Text und Farbe, drückt Veröffentlichen. Ein Profi öffnet dieselbe Sektion, setzt `grid-template-columns`, einen Hover-State und einen Token-Override für Mobile — ohne das Dokument zu verlassen.
2. **Alles einstellbar, nichts kaputtbar.** Jede CSS-Property ist setzbar (ADR-0005), aber Werte laufen durch die Grammatik, Motion durch Guardrails, Veröffentlichung durch Hard-Checks. Freiheit innerhalb eines Sicherheitsnetzes.
3. **Zwei Bediener, eine Wahrheit.** Jede Änderung — ob Maus, Tastatur oder Agent — ist dieselbe kanonische Mutation mit Audit, Undo und Konfliktprüfung. Der Editor ist die Werkbank, der Agent die Fabrik; beide sprechen denselben Vertrag.

### 3.2 Kern-Nutzerreisen (Soll)

**Reise A — Agent baut, Mensch verfeinert (Kernversprechen):**
Agent erhält Brief → `create_site`/`create_page` → Sektionen aus Golden-Props → Theme aus Referenz → Preview-Link → Mensch öffnet den Editor, sieht den Entwurf, korrigiert Abstände/Farben/Texte in drei Breakpoints → Review mit Diff → Publish → Deploy-Adapter liefert aus.

**Reise B — Mensch baut von Hand:**
Projekt → neue Seite → Sektion aus Katalog ziehen (DnD mit Einfügelinie) → Inline-Text → Inspector: Layout/Farbe/Typo → Hover-State → Motion-Preset mit Vorschau → Mobile-Override → Veröffentlichen.

**Reise C — Referenz-Übernahme:**
URL einwerfen → Analyse (Capture, Tokens mit Belegstellen, Motion-Rezepte) → Style-Brief prüfen → `apply_reference` auf ein Projekt → Theme-Draft → Seiten im Look der Referenz bauen.

**Reise D — Content-Pflege:**
Collection anlegen (im Editor) → Entry anlegen/bearbeiten (Workspace mit Versionen) → Entry veröffentlichen → betroffene Routen werden inkrementell neu gebaut → Submissions landen in der Inbox.

**Reise E — Review & Release:**
Agent/Mensch reicht ein → Struktur-Diff + Screenshot-Diff (3 Breakpoints) → Approve/Request changes → Release (vollständiges Manifest) → Rollback reproduziert exakt den alten Stand.

### 3.3 Feature-Zielmatrix (Auszug, konsolidiert aus dem Benchmark)

| Bereich | Framer/Webflow-Standard | Senify Ist | Senify Ziel | Prio |
|---|---|---|---|---|
| Canvas | Freeform/klassenbasiert, parallele Breakpoints | 3 Frames gebaut, DnD offen | 3 Frames + DnD/Plus-Punkte/Einfügelinie im Portal | P0 |
| Style-Inspektor | Position/Size/Layout/Fill/Border/Shadow/Filters, Variablen | registry-generierte Felder | volles CSS-Spektrum, Tokens, 4 Pseudo-States, Gerätepunkte | P0 |
| Components | Components + Variants + Props + Slots | Sections + Varianten + Slots (kuratiert) | Visual Components: Instanzen, Overrides, Slot-Restrictions | P0 |
| Templates | Layout-/Collection-Templates | v1-Kern vorhanden, v2 unsichtbar | Templates/Outlet im Editor, VC-Templates | P1 |
| CMS | Collections/Items, Draft/Publish, Referenzen | Modell + MCP vollständig, UI teilweise | Content-Workspace, On-Page-Edit (Entries), Bulk | P1 |
| Interactions | Trigger/Ziel/Aktion, Scroll, Conditional Playback | 24 Motion-Presets + Trigger | Interactions-Tab (Trigger→Ziel→Aktion) über Presets | P1 |
| Responsive | Breakpoints, Side-by-side, Overrides | 3 Stationen, Overrides im Modell | Override-UX (geerbt/lokal/gemischt), „Alle anzeigen" | P0 |
| Publishing | Managed Hosting, Staging, Domains | lokal: Draft→Revision→Release, Previews | Deploy-Adapter (Vercel/Netlify), Domains, TLS | P1 |
| AI/Agents | External Agents, MCP 2.0 | 49 MCP-Tools, Audit, Scopes | Parität: Style-Rules, Undo, Lifecycle, Jobs | P1 |
| Offenheit | proprietär/Export begrenzt | Bake = offenes HTML/CSS/JS | bleibt Alleinstellung | — |
| Localization/E-Commerce/Multiplayer | vorhanden | bewusst nicht | bewusst nicht (E3/Out-of-Scope) | P3 |

---

## 4. Lücken und Risiken (priorisiert)

Legende: **Beleg** = verifizierte Stelle · **Auswirkung** = was ohne Fix passiert · **Empfehlung** = was zu tun ist.

### 4.1 P0 — kritisch (blockiert das Zielbild)

**L1 · Zwei kanonische Dokumentmodelle.**
Beleg: v2-`EditorDocument` (`document.ts:35-61`) vs. v1-`NodeTree` (`section-sdk/src/types.ts:28-47`); Bridge als Dauerbestandteil (`editor-bridge.ts:1-29`); Namensgrenze `collection`/`collection-list` (Ticket 13).
Auswirkung: Jede neue Fähigkeit muss in zwei Vokabularen, zwei Persistenzpfaden und zwei Projektionen gebaut werden; Agent, Canvas und Bake können unterschiedliche Fähigkeiten zeigen.
Empfehlung: Zielmodell festlegen (Editor-Modell als kanonisch, v1 als Adapter), Cutover-Plan mit Roundtrip-Tests, Namensgrenze auflösen.

**L2 · Responsive-Datenverlust und zu breites Löschen.**
Beleg: `migration.ts:56-92` (per-Breakpoint `hidden` wird nicht migriert, Kommentar benennt es), `apply.ts:663-681` (`clearBreakpointOverride` entfernt alle Props des Breakpoints).
Auswirkung: Beim v1→v2-Cutover verschwinden Mobile-/Tablet-Ausblendungen; ein einzelner Property-Reset löscht still andere Overrides.
Empfehlung: `hiddenDevices` einführen (Ticket 11) und Property-weises Löschen (`clearNodeProp`) korrekt übersetzen — vor jedem weiteren Inspector-Ausbau.

**L3 · Releases sind nicht reproduzierbar.**
Beleg: `types.ts:129-145` (Release = Page-Revisionen + Theme + Build-Ref); Rollback liest aktuelle Style-Rules/CMS-Stände; Aktivierung nicht atomar (`lifecycle.ts:171-244`, `store.ts:2408-2566`).
Auswirkung: Ein Rollback kann einen anderen Zustand liefern als das Original-Release — Vertrauensverlust in „Veröffentlichen".
Empfehlung: Vollständiges Release-Manifest (Style-Registry-, CMS-, Template-, Asset-, Renderer-Versionen) + atomare Aktivierung (eine Transaktion).

**L4 · Publish-Cutover und Paritäts-Tor fehlen im echten Pfad.**
Beleg: Ticket 17 offen; Paritätstest nutzt `bakeSite` statt `POST /api/releases` (`widget-slice-browser.test.ts:19-46`).
Auswirkung: Der wichtigste Qualitätsbeweis („was ich sehe, wird ausgeliefert") gilt nicht für den echten Veröffentlichungspfad.
Empfehlung: Editor-Publish auf `POST /api/releases` umstellen, Paritäts-Tor als CI-Blocker (O9), Draft-Leak-Test.

**L5 · Agenten-Schreibpfad nicht gefenct.**
Beleg: `author` frei im Body (`contract.ts:358-366`, ungeprüft in `http.ts:798-806`); keine Idempotency-Keys; `authoredBy`-Fence offen (Ticket 18); Klassen-Zuweisung ohne Existenzprüfung (`apply.ts:605-618`).
Auswirkung: Audit fälschbar; Agenten können Design-Systeme mit Literalen unterlaufen; Retries können Duplikate erzeugen.
Empfehlung: Author serverseitig aus Token ableiten; Idempotency-Keys für Create/Upload; `authoredBy` im Schreibpfad erzwingen (Agent → Token-Pflicht, `ambient`/`rawCss` nur Mensch); Klassen-Existenzprüfung.

**L6 · Style-Registry ohne eigene Versionierung; Rename bricht Referenzen.**
Beleg: `store.ts:1597-1663` (Array als Ganzes geschrieben, kein Version-Lock); `persist.ts:225-236` (Rename aktualisiert Node-Klassen nicht über die Seitenroute).
Auswirkung: Zwei Schreiber überschreiben sich; nach Reload zeigen Nodes auf alte Klassennamen.
Empfehlung: `styleRegistryVersion` + Optimistic Locking; Klassen als stabile IDs (`classIds`) statt Namen; atomare Rename-Semantik.

**L7 · Editor-Doppelzustand und verteilte History.**
Beleg: „Editor (bisher)"/„Canvas (neu)" (`app.js:4582-4596`); eigene History in `mount.ts:525-565` neben `EditorStore` (`state/store.ts:171-245`) und Pending-Queue der Save-Pipeline.
Auswirkung: Zwei Wahrheiten für Auswahl, Version, History und Konflikt — tägliche Inkonsistenzgefahr.
Empfehlung: Ein `EditorSession`-Kern (Dokument + Auswahl + History + Serverversion + Pending), Canvas/Chrome/Inspector als Projektionen; ein sichtbarer Editorpfad.

**L8 · Kein vollständiger Style-Inspektor.**
Beleg: `panels.ts:257-292` (registry-generierte Felder), Ticket 02 (Zielumfang).
Auswirkung: Senify wirkt wie ein Komponenten-Editor mit festen Props — „alles einstellbar" ist nicht eingelöst.
Empfehlung: Ticket 02 bauen: Layout/Box-Model/Typo/Farbe/Gradient/Border/Shadow/Effects/Transform/Transitions/Custom-CSS, Token↔Literal, Pseudo-States, Breakpoint-Overrides, Style-Copy/Paste.

**L9 · DnD/Einfüge-Fluss fehlt; Marker liegen teils im Inhaltsframe.**
Beleg: Ticket 12; Einfügelinie als `.senify-drop-line` im Frame (`mount.ts:2034-2055`); Marker-Farben im Canvas (`canvas/rules.ts:60-100`).
Auswirkung: Kerninteraktion eines visuellen Editors fehlt; Editor-Marker im Inhalt verletzen die Inhaltsneutralität und die Parität.
Empfehlung: DnD + Plus-Punkte + Einfügelinie als Portal-Overlay (Ticket 12 + 16), genau ein Undo-Schritt pro Zug, Zyklenschutz sichtbar.

**L10 · Visual Components und Templates fehlen im Editor.**
Beleg: Ticket 04 offen; v1-Kern (`templates.ts:15-277`) ohne v2-Anbindung (O14).
Auswirkung: Wiederverwendung wird Copy/Paste — genau das Baukasten-Gefühl, das vermieden werden soll.
Empfehlung: Component-Definition/Instanz/Overrides/Slots als Domänenmodell, Template-/Outlet-Autorenschaft im Editor, Publish-Inlining, Zyklen-Schutz.

### 4.2 P1 — Produkt vervollständigend

| # | Lücke | Beleg | Empfehlung |
|---|---|---|---|
| L11 | Re-Bake ist Stub (kein Job/Queue/Retry) | `rebake.ts:22-39` („Trigger stub"), `content.ts:116-129` | Durable Outbox + Job-API + betroffene Routen + Status in UI/MCP |
| L12 | MCP-Paritätslücken: Style-Rules, Undo, Lifecycle, Listen | Audit §3/§5; HTTP-Routen existieren (`http.ts:1229-1319`, `:1592-1612`) | Tools öffnen: `style_rules_*`, `undo_batch`, `duplicate_site`, `set_page_template`, `list_revisions/releases/previews`, `unpublish_entry`; **Prinzip Workflow- statt Endpoint-Parität** (gebündelte Tools analog `apply_mutations`) |
| L12a | MCP-Vertragshygiene: falsche/fehlende Tool-Annotations, keine strukturierten Outputs, keine Pagination, keine Server-Instructions/Prompts/Resources/Elicitation, Sprachmix (5× deutsch) | Verifiziert `server.ts:112-115` (`destructiveHint` auf allen Writes, `idempotentHint`/`openWorldHint` fehlen), `server.ts:156-158` (nur TextContent); MCP-Spec + Anthropic-Tool-Guidelines (s. §16.3) | Annotations-Matrix korrekt setzen (destruktiv nur Delete/Rollback/Restore; `openWorldHint:true` nur `analyze_reference`); `outputSchema`/`structuredContent` für Kern-Tools; einheitliches Pagination-Muster; Server-Instructions; Prompts/Resources/Elicitation bewusst entscheiden; Beschreibungssprache vereinheitlichen |
| L13 | Motion-Presets teils `planned` (kein Runtime-Effekt) | `section-sdk/src/motion.ts:105-127`, `renderer/src/motion.ts:91-100` | Runtime-Abdeckung aller im Profil erlaubten Presets **oder** klare UI-Kennzeichnung „geplant" plus Sperre in der Profil-Allowlist |
| L14 | Full-Bake ohne Inkrementalität; CMS-Grenze 500 Entries | `bake.ts:137-145,259-264` | Dependency-Index + inkrementelle Routen-Bakes + Pagination-Strategie |
| L15 | UI: Legacy-Palette leckt durch die Haut; Zustände fehlen | `styles.ts:22-31,337,369`; UI-Audit §2 | Legacy-Blöcke tilgen/neutralisieren; `:focus-visible`, `:active`, `color-scheme`, Reduced-Motion, Scrollbars |
| L16 | Explorer nicht als zugänglicher Tree; Spotlight/Kontextmenü ohne volle Tastatur | `mount.ts:2644-2653`, UI-Audit §6 | `role=tree/treeitem`, roving tabindex, F2/Rename, Shift+F10, Fokus-Rückgabe, Virtualisierung |
| L17 | Save-/Konflikt-UX uneinheitlich (Reload bei Info, Konflikt wirft Zustand weg) | `mount.ts:2821-2834`, `app.js:4631-4639` | Ein Save-State-Modell (Gespeichert/Speichert/Offen/Konflikt/Fehler), Konflikt-Dialog mit Server-vs-Eigene |
| L18 | Hosting/Deploy fehlt („Publish" endet lokal) | `lifecycle.ts:233-245`, Spec §Hosting | Erster Deploy-Adapter (Vercel/Netlify) + Domains/TLS + Preview-Deployments |
| L19 | Editor-Ladezustände, Empty States ohne nächste Aktion | UI-Audit §9 | Skeleton, `aria-busy`, Empty States mit Hauptaktion |
| L20 | On-Page-/Inline-Edit für Entries fehlt; Review-UI-Polish | Spec, `app.js` | Content-Editor-Erfahrung (Entries), Review-Details im Editor-Kontext |

### 4.3 P2 — Wettbewerbsfähigkeit und Skalierung

| # | Lücke | Empfehlung |
|---|---|---|
| L21 | Canvas rendert bei jedem Store-Event alle Frames neu; `flushSync` pro Frame | Subtree-Updates, Selektions-Ring direkt im Frame (existiert), Performance-Budget (Ticket 05) |
| L22 | Extension-/Plugin-Vertrag fehlt (Registry ist Code) | Versioniertes Extension-SDK (Sections/Primitives/Controls/Migrationen) — erst nach VC-Modell |
| L23 | Kein Analytics-/Event-Adapter | Pluggable Analytics mit Consent (Plausible/Umami), serverseitige Form-/Conversion-Events |
| L24 | Quality-Gates: CWV/Lighthouse, A11y-E2E, Structured-Data-Katalog unvollständig | Hard/Soft-Gates im Review; Schema.org-Ausbau; Keyboard-/Screenreader-Tests |
| L25 | Style-Registry-Lesen tolerant (beschädigte Einträge fallen still raus) — **auf P1 gehoben (stiller Datenverlust)** | Harter Fehlerzustand + Reparatur-Workflow (mit E1/E6) |
| L26 | Öffentliche Routen ohne Rate-Limit (Loopback als einziger Schutz) — **P0, mit E3 umsetzen** | Limiter auch für Public-Routen (`/api/tokens`) |
| L27 | Assets ohne Focal-Point-Crop, Ordner-UI, Bulk | Crop-Generierung, Bulk-Operationen, Usage-Graph |

### 4.4 P3 — bewusst später / verworfen

| # | Thema | Haltung |
|---|---|---|
| L28 | Echtzeit-Multiplayer/CRDT | bewusst nicht (E3); Review + transaktionale Batches sind die These |
| L29 | Localization | v2-Kandidat, erst bei Kundenbedarf — dann richtig (Routen, hreflang, CMS-Felder) |
| L30 | E-Commerce | verworfen; bei Bedarf Shopify-Embed über `embed` |
| L31 | Framer/Webflow-Import | nach VC-Modell; Import in Visual IR + Paritätsprüfung |
| L32 | Component-Marketplace | nach VC + Versionierung + Signierung |
| L33 | Multi-Tenant-Hardening (Rollen, Tenant-Isolation, verteilte Locks) | bei Hosted-Betrieb; heute Single-Operator |

### 4.5 P0–P2 — Architektur-Lücken (Best-Practice-Abgleich 09/2026, neu)

| # | Lücke | Beleg | Empfehlung |
|---|---|---|---|
| L34 | **Kein Undo-Modell** (nur History-Stack): Scope, Transaktionen, Pause/Resume, Preconditions fehlen; Undo validiert nicht; Reload leert History still | `store.ts:171-247` (inverse Patches, `coalesceKey` — gut), `store.ts:250-255` (Reload), `apply.ts:1015-1037` (Undo ohne `validateTreeIntegrity`); Referenz: Liveblocks/Figma/GrapesJS (s. §16.3) | Epic E17: Undo-Scope, Transaktions-API, Preconditions, History-Panel, Agenten-Undo über MCP |
| L35 | **Kein Performance-Budget, kein Dirty-Tracking:** globales Change-Event weckt alles; CSS-Dokument wird pro Aufruf neu gebaut; Parent-Suche O(n); Vollklon pro Batch | `store.ts:136-145`, `document.ts:132-147`, `document.ts:209-250`, `apply.ts:971-978`; L21 | Epic E18: Budget mit Zahlen, selektor-basierte Subscriptions, Change-Sets, Parent-Index, CSS-Cache/Dirty-Marker |
| L36 | **Component-Instancing ohne Datenmodell:** keine `componentId`/Override-Adressierung/Part-IDs/Swap/Variants-Schema | `document.ts:35-53`, Slots nur für Primitives (`operations.ts`); E11-Ziele ohne Schema | E11-Ergänzung: Instanz-/Override-/Swap-/Variant-Schema mit stabilen Part-IDs |
| L37 | **Patch-Modell nicht collaboration-ready:** Ordnung als Listenindex, Undo ohne Preconditions, `version` = History-Länge (vermischt lokal mit Serverversion) | `operations.ts:807-948`, `apply.ts:1015-1037`, `store.ts:159-161` | Epic E19: Readiness-Klausel (stabile Ordnung, Preconditions, client-scoped History) + ADR; CRDT/OT weiter bewusst vertagt |
| L38 | **Style-Kompilierung ohne `@layer`/Atomic-Entscheidung:** Spezifitäts-Eskalation als Muster (Haut 0,4,0 > Live 0,3,0, gelöst via 0,5,0-Marker) | `styles.ts` (0,5,0-Marker, §2.2), O15/Ticket 14 | Epic E20 + ADR-0007: `@layer`-Prioritäten, Atomic-Option (StyleX/Webstudio-Muster, 70–90 % Reduktion), inkrementelle Emission |

### 4.6 P1/P2 — Agenten-Betriebslücken (aus geprüften Vorbildern, 19.09.)

Geprüft wurden drei produktive Agenten-Tools (Details in §16.3): **OpenResearch** (local-first Agent-Workspace, Rust), **hyperresearch** (16-Schritt-Research-Pipeline, Python), **Agent-Reach** (Plattform-Zugang mit Fallback-Ketten, Python; Testsuite 589 grün/3 umgebungsbedingt rot). Ihre Muster fehlen Senify an diesen Stellen:

| # | Lücke | Beleg/Vorbild | Empfehlung |
|---|---|---|---|
| L39 | **Kein Permission-/Escalation-Modell:** riskante Agenten-Ops laufen ohne Mid-Turn-Freigabe; blockierte Fetches (Login-Wall, Bot-Wall, Captcha) haben keine Queue; es gibt keinen read-only-Plan-Modus | OpenResearch `mcp-gate` (blockiert bis Operator antwortet; Fehler ⇒ deny/fail-closed; read-only via `plan-gate` automatisch erlaubt); hyperresearch Escalation-Queue („CAPTCHAs/logins ALWAYS handed to the human, consolidated") | Epic E21: Permission Gate + Escalations + read-only-Modus |
| L40 | **Kein Agent-Run-Modell:** kein Run-Objekt mit Status/Manifest/Spend, kein Resume nach Abbruch, kein Verify-Gate vor „fertig", keine Evidence-Logs (Byte-Fenster) | hyperresearch `run status/resume/report/verify` + Manifest (`run.json`); OpenResearch `orx logs` + „Run logs are the evidence channel" + immutable run archive | Epic E22: Runs, Evidence, Resume, Verify |
| L41 | **Keine Agent-Isolation/Delegation:** Sub-Agenten hätten weder eigene Worktrees noch Concurrency-Limits; kein „kein Auto-Merge"-Prinzip (Repo kennt die „parallele Stränge"-Falle bereits) | OpenResearch `orx agent spawn` (eigener Worktree + Transcript; „never give a helper a branch checked out by this session"; Frozen-Nodes unantastbar; kein Auto-Merge; Spawn-Limits; standalone Briefs) | Epic E22: Isolation + Delegationsregeln |
| L42 | **Referenz-Bibliothek ohne Vault-Eigenschaften:** keine Volltextsuche über Analysen, kein Dedupe, keine Backlinks/Graph, kein „Vault-first" (erst suchen, dann neu capturen) | hyperresearch Vault (Markdown+SQLite FTS5, Dedupe, Backlinks/Graph, Auto-Sync; „each session starts smarter") | E13-Ergänzung: Referenz-Vault (FTS, Dedupe, Graph, Vault-first-Regel) |
| L43 | **Kein Diagnose-Befehl, keine Fallback-Ketten:** `senify setup` existiert, aber kein `senify doctor`; Fetch (Playwright) und Deploy haben keine Health-geprüften Fallback-Ketten | Agent-Reach `doctor` (Status je Kanal, konkreter Fix-Befehl, ehrliche „nicht verifiziert"-Markierung); Agent-Reach/hyperresearch Primary→Fallback-Backends; eigener 403-Fund: Wikipedia-Fetch im builtin-Provider scheitert | E12/E14-Ergänzung: `senify doctor` + Fallback-Ketten mit Health-Checks |
| L44 | **Skills nicht modular:** wenige große Skill-Dateien statt Thin Router + Step-Module; kein schrittweises Nachladen gegen Kontext-Rot | hyperresearch („thin router; each step's procedure loads only when that step runs"); OpenResearch `orx skill <name>` (12 Module) | E4 Scheibe 2: Skills als Router + Module (z. B. `senify-layout`, `senify-motion`, `senify-cms`, `senify-review`) |

---

## 5. Verbesserungs-Epics

Jedes Epic: **Ziel · Umfang · Akzeptanzkriterien · Belege · Abhängigkeiten · Größe** (S ≤ 1 Woche, M 2–6 Wochen, L > 6 Wochen; Single-Operator-Tempo).

### E1 · Kanonisches Dokumentmodell & v1/v2-Cutover — **P0, L**

**Ziel:** Ein Modell als Wahrheit; v1 nur noch als Kompatibilitätsadapter.
**Umfang:** Zielmodell festlegen (v2-Dokument kanonisch); `hiddenDevices`; Property-weises Override-Löschen; `collection`/`collection-list`-Auflösung; Roundtrip-Migration v1↔v2 mit Datenverlust-Tests; Bridge als expliziter, versionierter Adapter.
**Akzeptanz:** Jede v1-Seite migriert verlustfrei gegen eine definierte Feldmatrix (Props, Slots, Overrides je Breakpoint inkl. `hidden`, Klassen, Motion, Locking) mit Fixtures und Roundtrip-Gegenprobe; ein Property-Reset ändert genau eine Property; Namensdubletten aufgelöst; ein neuer Knotentyp wird an genau einer Stelle registriert und erscheint in Canvas, Bake, MCP und Explorer. **Zielentscheidung + Deprecation:** Die Bridge bleibt als versionierter Adapter, bekommt aber ein Deprecation-Kriterium (entfällt, sobald keine v1-Dokumente mehr gelesen werden müssen) — als ADR festgehalten.
**Belege:** `document.ts:35-61`, `section-sdk/src/types.ts:28-47`, `migration.ts:56-92`, `apply.ts:663-681`, `editor-bridge.ts:1-29`.
**Übernommene Muster (Webstudio + Plasmic, geprüft):** (a) **Feld-Annotationen als Single Source:** Jedes Modellfeld trägt eine dokumentierte Semantik (`own`/`weakRef`/`const`/`transient`), aus der Integritätsprüfung, Diff/Merge und Migration ihre Regeln ableiten (Plasmic `model-schema.ts`); ein neuer Knotentyp wird an genau einer Stelle deklariert und erscheint von dort in Canvas, Bake, MCP und Explorer — ein Test prüft die Vollständigkeit der Annotationen. (b) **Patch-Invariante:** Roh-Patches dürfen keine generierten IDs schreiben (Webstudio-Refinement: „Raw patches cannot create or replace generated record collections") — Schutz vor ID-Kollisionen bei Agenten-Patches.
**Abhängig:** keine (Fundament). **Blockiert:** E4, E5, E6, E11.

### E2 · Release-Integrität & Publish-Cutover — **P0, M**

**Ziel:** Veröffentlichen ist reproduzierbar und beweisbar.
**Umfang:** Vollständiges Release-Manifest (Pages, Theme, Style-Registry, CMS-Entries, Templates/Components, Assets, Renderer-/Preset-Version, Build-Hash); atomare Aktivierung; Rollback aus dem Manifest; Editor-Publish über `POST /api/releases`; Paritäts-Tor als CI-Blocker (Canvas↔Bake, 3 Breakpoints, CMS-/Template-Routen).
**Akzeptanz:** Rollback liefert für dieselbe Renderer-Version eine byte-identische Auslieferung (Vergleichsgegenstand: ausgelieferte HTML-Dateien + CSS/JS-Assets per SHA-256; bei neuer Renderer-Version gilt semantische Parität plus dokumentierter Diff); ein Draft-Leak-Test schlägt fehl, wenn Draft-Daten in den Release geraten; das Paritäts-Tor blockiert die CI bei Abweichung.
**Übernommene Muster (Webstudio + Payload, geprüft):** (a) **Transaktionsklammer** um die Aktivierung: `initTransaction` → `commit`/`kill` — Teilfehler rollen vollständig zurück; `disableTransaction` nur als explizite Test-Option (Payload `collections/operations/update.ts`). (b) **Draft-Leak-Schutz zweistufig:** Ein Draft-Save darf das aktive Release/publizierte Assets nie überschreiben (`isDraftOverPublished`), und der Release-Snapshot trägt je Seite die Versions-ID, aus der gebaut wurde (Payload `updateLatestVersion.ts`). (c) **Restore-Points:** Snapshot aller Namespaces; Restore validiert Projekt-/Build-Zugehörigkeit und schreibt pro geändertem Bereich einen Root-`replace`-Patch in **einer** Transaktion mit `baseVersion` (Webstudio `project-session.ts`). Assets sind ein dokumentiert **nicht-atomarer** Teil-Snapshot. (d) **Retention:** Versionen je Dokument konfigurierbar, `0 = unbegrenzt` (Payload `maxPerDoc`).
**Belege:** `lifecycle.ts:171-244`, `types.ts:129-145`, Ticket 17, `widget-slice-browser.test.ts:19-46`.
**Abhängig:** E1 (stabile Referenzen). **Blockiert:** E14, VC-Cutover.

### E3 · Agent-Sicherheit & Governance — **P0, M**

**Ziel:** Der Schreibpfad ist fälschungssicher, idempotent und policy-konform.
**Umfang:** Author serverseitig aus Token ableiten (Body-`author` nur Vorschlag); Idempotency-Keys für Create/Upload/Entry; `authoredBy`-Fence (Agent → Token-Pflicht, `ambient`/`rawCss` nur Mensch); Klassen-Existenzprüfung; Audit-Lücken schließen (Page-Create/Delete, Assets, Referenzen); Rate-Limit für Public-Routen (L26); **Tool-Annotations als Client-Versprechen** — `readOnlyHint`/`destructiveHint`/`idempotentHint`/`openWorldHint` pro Tool semantisch korrekt und synchron zu den Idempotency-Keys (Annotation = Client-Versprechen, Key = Server-Garantie); **Security-Test-Suite** nach dem Muster von Agent-Reach (URL-Security, Credential-Scrubbing in Logs, Dateirechte/private Writes, Auth-Guidance).
**Akzeptanz:** Ein direkter API-Call kann kein `kind: "human"` auditieren; ein Retry mit gleichem Idempotency-Key erzeugt kein Duplikat; ein Agenten-Token kann keinen Literalwert an eine Token-pflichtige Stelle schreiben (Regelkatalog: Farb-/Skalen-/Spacing-Werte mit `$token`-Äquivalent, Theme-Bindings, Motion-Tokens — je Regel ein Test); **Annotations-Matrix-Test:** jedes Tool hat alle vier Hints explizit, `destructiveHint: true` nur für Delete/Rollback/Restore, `openWorldHint: true` nur für `analyze_reference`.
**Belege:** `contract.ts:358-366`, `http.ts:798-806,897-934`, Ticket 18, `apply.ts:605-618`.
**Übernommene Muster (Payload, geprüft):** Die `authoredBy`-Fence wird als **Property-Policy** modelliert — analog zu Payloads Field-Level-Access, der Schreibbarkeit als eigene Achse je Feld und Operation führt und im Schreibpfad (Hook-Traversal), nicht in der UI, erzwingt (`fields/config/types.ts`, `auth/types.ts`). Senify-Klassen: Theme-Tokens, `ambient`/`rawCss`, Motion-Tokens. Dazu eine **Permissions-Projektion** `GET /api/access` (Muster `getAccessResults`/`docAccessOperation`): Der Token erfährt vorab seine erlaubten Kategorien und Aktionen — Grundlage für den read-only-Plan-Modus (E21) und korrekte Tool-Annotations; Client und MCP sehen nur sanitisierte Booleans, keine internen Regeln. Fehlgeschlagene Mutationen werden über einen `afterError`-Pfad auditiert (schließt die Audit-Lücke aus §2.1).
**Abhängig:** E1. **Blockiert:** Vertrauen in Agenten-Automatisierung.

### E4 · MCP-Parität: fehlende Tools & Verträge — **P1, M**

**Ziel:** Was die HTTP-API kann, kann der Agent — sicher und auffindbar; **Workflow-Parität statt Endpoint-Parität** (gebündelte Tools analog `apply_mutations`).
**Scheibe 0 · Vertragsreife (P0, S):** Annotations-Matrix (s. E3); `outputSchema` + `structuredContent` für `get_page`, `get_nodes` und die `list_*`-Kerntools; `limit` + Pagination-Metadaten (`has_more`/`next_offset`/`total_count`, Defaults 20–50) in allen Listen-Tools; Server-Instructions (Workflow-Reihenfolge Sites → Pages → Mutations → Preview → Review → Publish); Beschreibungssprache vereinheitlichen (Empfehlung Englisch wie 44/49); Fehlerobjekt um `status`/`retryable` ergänzen; Truncation mit Steuerungshinweis (Kontextbudget, Richtwert 25.000 Token).
**Scheibe 1 · Workflow-Tools (P1, M):** `create_site`; `style_rules_*` als **ein** Workflow-Tool (`apply_style_rules` mit Ops-Array, `authoredBy: "agent"`) statt fünf CRUD-Tools; `undo_batch` (nutzt `applyUndoBatch`, Preconditions s. E17); `duplicate_site`; `set_page_template`; `update_site`/Trash/Restore; `list_revisions/get_revision`, `list_releases/get_release`, `list_previews`; `unpublish_entry`; Entry-Versionen; `asset_bulk/folders/history`; `audit_list`; `dry_run` für Theme/Entry/Asset/Style-Rule; Preview-Visuals/Diff als Tool.
**Scheibe 2 · Prompts, Resources, Elicitation (P2, S–M):** vier Slash-Command-Prompts entlang der Nutzerreisen (`site-aus-brief`, `referenz-uebernehmen`, `review-und-release`, `content-pflege`) mit Argumenten und Validierung; Doku-Portal und Theme-Snapshot als Resources prüfen (Tools bleiben für Agenten führend, Resources ergänzen Host-UIs); Elicitation für fehlende/mehrdeutige Pflichtparameter (`siteId`, `collectionId`, Auswahl bei `get_reference_brief`), sofern der Client die Capability deklariert; Sampling bewusst nicht nutzen (eigene KI-Anbindung) — als ADR-Notiz festhalten. **Dazu:** Skills modularisieren (Thin Router + Module wie `senify-layout`, `senify-motion`, `senify-cms`, `senify-review` — schrittweises Nachladen statt einer großen Datei); `llms.txt` im Repo für Agenten (Verweise auf HANDOFF, CONTEXT, Verbesserungsplan, MCP-Setup); Read-only-Modus als dokumentierter Standard für Inspektions-Agenten.
**Akzeptanz:** Jede Route in `http.ts:961` hat einen bewussten Status „Tool · Operator · Workflow-gebündelt" (Matrix unter `docs/mcp-route-matrix.md`); Workflow-Test deckt die neuen Tools ab; Annotations-Matrix-Test grün; Token-Verbrauch je Referenz-Workflow gemessen und im Ledger dokumentiert; Skill-Doku aus denselben Quellen generiert.
**Belege:** Audit §1/§5; `http.ts:1229-1319,1345-1361,1592-1612,2010-2077`.
**Abhängig:** E1, E3.

### E5 · Editor-Shell & Session-Kern — **P0, L**

**Ziel:** Ein Editor, ein Zustand, eine History.
**Umfang:** `EditorSession` (Dokument, Auswahl, History, Serverversion, Pending-Queue, Konfliktzustand); Canvas/Chrome/Inspector/Live als Projektionen; einen sichtbaren Editorpfad statt „bisher/neu"; Zustandserhalt bei Moduswechsel und Reload (Auswahl, Breakpoint, Zoom, Panels, Scroll).
**Akzeptanz:** Kein sichtbarer „bisher/neu"-Umschalter; Design/Live/Preview sind Modi desselben Editors; Undo/Redo überall identisch; ein Reload verliert weder Seite noch Panelzustand.
**Belege:** `app.js:4582-4596`, `mount.ts:525-565`, `state/store.ts:171-245`.
**Übernommene Muster (Webstudio, geprüft):** Drei getrennte Stores — Dokument (Server), Client-UI (Auswahl/Hover/Drag/Panels), Fremdinhalt — plus ein Objekt-Pool mit Registrierung (`sync-stores.ts`). Der Canvas ist Follower desselben Sync-Kanals; der Emitter wird einmalig ins iframe injiziert und sofort gelöscht, Kommandos laufen über einen token-gewrappten postMessage-Bus mit rAF-Batching (`builder.tsx`, `pubsub/create.ts`). **Nicht übernehmen:** instanzbasierte Attribut-Selektoren im Canvas (Webstudio nutzt `[data-ws-id]` im Canvas und Klassen im Bake) — Senify behält identisches CSS in Canvas und Bake.
**Abhängig:** E1. **Blockiert:** E6–E10, E16.

### E6 · Style-Inspektor (volles CSS) — **P0, L**

**Ziel:** Framer-artige visuelle Kontrolle auf dem offenen Modell.
**Umfang:** Tabs Content/Style/Interactions/Advanced; Layout (Flex/Grid/Position/Insets), Dimensionen, Box-Model, Typografie, Farbe/Hintergrund/Gradient, Border/Shadow (mehrschichtig), Effects (Filter/Blur/Transform/Transition), Custom CSS; Token↔Literal mit Warnung; Gerätepunkte an jedem Control; 4 Pseudo-States mit Forced-Preview; Style-Copy/Paste; Property-Reset.
**Akzeptanz:** Jede bekannte Property hat ein passendes Control, unbekannte sind frei setzbar; geerbt/lokal/gemischt sprachlich unterscheidbar; Override anlegen/ändern/zurücksetzen ohne Datenverlust; Änderung aktualisiert den Canvas ohne Frame-Neuaufbau.
**Belege:** Ticket 02, `panels.ts:257-292`, ADR-0005.
**Abhängig:** E5, E9.

### E7 · Explorer, Selection, Kontextmenü, Spotlight — **P0, M**

**Ziel:** Navigation und Befehle auf Profi-Niveau, tastaturfähig.
**Umfang:** Semantischer Layer-Tree (`role=tree/treeitem`, `aria-level/selected/expanded`), Expand/Collapse, Rename (F2), Lock/Hide je Breakpoint, Multi-Select (Shift/Cmd), Virtualisierung, DnD-Umsortierung mit sichtbarem Zyklenschutz; Kontextmenü vollständig (Duplicate, Copy/Paste inkl. Styles, Wrap, Delete, Umbenennen, Sperren) mit Shift+F10 und Fokus-Rückgabe; Spotlight mit Dialog-/Listbox-Semantik und `aria-activedescendant`.
**Akzeptanz:** Pfeile/Home/End/F2/Escape funktionieren im Tree; bei 1.000 Ebenen sind höchstens sichtbare Zeilen + 6 Puffer im DOM (DOM-Budget-Test), Scrollen hält 60 fps; ungültige Drops sind rot + erklärend; Spotlight ohne Übergang, Fokus kehrt zurück.
**Belege:** `mount.ts:2644-2755`, `state/selection.ts:15-181`, UI-Plan §3/§6/§7.
**Abhängig:** E5.

### E8 · DnD & Canvas-Overlay — **P0, M**

**Ziel:** Ziehen, Einfügen, Auswählen — vollständig und außerhalb des Inhalts.
**Umfang:** Katalog-Drag in den Frame, Plus-Punkte, Einfügelinie, `resolveInsertLocation` mit Begründungen, Wrap-in-Container, ein Undo-Schritt je Zug; Auswahl-/Hover-/Insert-/Resize-Marker als Portal-Overlay (Ticket 16), Doppelkante für helle/dunkle Inhalte, 24px-Trefferflächen; Raster/Snap/Lineale als Editor-Overlay.
**Akzeptanz:** Kein Editor-Marker und keine Fremdfarbe im Inhaltsframe; Ziehen erzeugt genau einen Undo-Schritt; alle Insert-Fehler erklären sich; Scroll/Zoom ohne Layout-Thrashing.
**Belege:** Ticket 12/16, `mount.ts:2034-2055`, `canvas/rules.ts:60-100`, UI-Plan §8/§9/§10.
**Abhängig:** E5.

### E9 · Responsive-UX — **P0, M**

**Ziel:** Vererbung sichtbar und bedienbar machen.
**Umfang:** Geräteumschalter in Topbar und Inspector; Override-Signale je Feld (Text + Farbe); geerbt/lokal/gemischt; „Alle anzeigen" (3 Spalten); freie Frame-Breite als reine Ansicht; Drawer-Layout unter 1024px, Vollbild-Inspector unter 760px; Touch-Ziele ≥ 44px.
**Akzeptanz:** Gerätewechsel und Breitenänderung schreiben keine Mutation; jeder Override ist bewusst anlegbar/entfernbar; **Bedienmatrix 1280/1024/760:** alle Kernaktionen (Auswahl, Inspector-Feld ändern, Undo, Gerätewechsel, Publish) sind bei jeder Breite ohne horizontales Scrollen ausführbar (Browser-Test).
**Belege:** `frames.ts:208-257`, UI-Plan §5.12/§5.13, `styles.ts:230-245`.
**Abhängig:** E1 (Datenverlust-Fix), E5.

### E10 · Motion & Interactions — **P1, M**

**Ziel:** Vom Preset-Regler zum verständlichen Interaction-Authoring.
**Umfang:** Preset-Vorschauen, Reduced-Motion-Preview, Motion-Markierung im Canvas, Breakpoint-Sichtbarkeit; Interactions-Tab (Trigger → Ziel → Aktion → Parameter) auf Preset-Basis; Guardrail-Erklärungen inline; Review-Diff für Motion; Runtime-Abdeckung aller erlaubten Presets (oder „geplant"-Kennzeichnung).
**Akzeptanz:** Jedes im Site-Profil erlaubte Preset animiert nachweislich im Bake (Runtime-Test je Preset) **oder** ist im Inspector sichtbar als „geplant" gekennzeichnet und in der Profil-Allowlist gesperrt; gesperrte Presets nennen den Grund; jede Motion-/Interaction-Änderung ist im Review sichtbar; Publish blockiert fehlende RM-Policy.
**Belege:** Ticket 19, ADR-0006, `motion.ts:105-127`, `renderer/src/motion.ts:91-100`.
**Übernommene Muster (Plasmic, geprüft):** Interaktionen als `{ trigger, target, action, params, conditionalMode }` mit einer **kuratierten Action-Registry** und deterministischen Serialisierern (Renderer-Tabelle) statt freier JS-Strings; Whitelist je Site-Profil, Guardrail-Erklärung, Reduced-Motion bleibt Pflicht.
**Abhängig:** E5, E6.

### E11 · Visual Components & Templates — **P0, L**

**Stand (21.09., Ticket 04):** Scheibe 1 + Scheibe 2 Teil 1/2/3 + MCP-Fassade + Scheibe 3 +
Publish-Versionen umgesetzt — Component-Kern im Baum (reservierte Typen, `inlineComponents` als
eine Ableitung), Engine-Aufnahme (`registerStructural`, `allowedChildren: "any"`), Bake-Rekey
über den Layout-Splice, Multi-Instanz-Remap für scoped Regeln, Instanz-Overrides (Modell,
Editor-Op, Inspektor, Canvas-Klick) mit Geräteebenen und Styles/Klassen je Instanz,
Komponenten-Tab und Kontextmenü (anlegen, benennen, einsetzen, auflösen),
Definition/Instanz-Versionen mit Drift (`bump_component_version`, `update_component_instances`),
Slot-Regeln (`allowedTypes`/`max` in Engine und Editor), MCP
`list_components`/`get_component`/`set_component_override`, Drift als harter Publish-Blocker
(site-weit, kein stiller Fallback; `rebakeActiveRelease` bewusst ausgenommen).
Offen: Varianten, Sections-Migration.

**Ziel:** Wiederverwendung statt Kopieren.
**Umfang:** Component-Definition/Instanz/Version, Overrides (Props/Styles), Slots mit Restrictions, Detach, Cycle-Detection, Publish-Inlining; Template-/Outlet-Autorenschaft im Editor; VC-Templates; `collection`/`collection-list`-Konsolidierung; MCP-Tools für Components/Templates.
**Instanz-Datenmodell (Best-Practice-Ergänzung):** Instanz-Node trägt `componentId` (stabile Definition-ID, versioniert) + `overrides: Record<partId, Partial<Props>>` — Part-IDs sind **stabil und unabhängig von Anzeigenamen** (Figma matcht über Layer-Namen; das gilt als dokumentierte Fehlerquelle). Instance Swap mit Override-Migration; Nested Components; Cycle-Detection im Schreibpfad (Muster existiert für Moves); Slots auf Komponentenebene (`allowedComponents`, `max`, Preferred Replacements); Variants als Property-Sets (Name/Wert), Variant-Swap behält Overrides auf denselben Part-IDs; Detach erzeugt tiefe Kopie mit frischen IDs (Muster `applyDuplicateNode`).
**Definition/Instanz-Trennung (Plasmic-Abgleich, geprüft):** Die Definition besitzt `parts` als deklariertes, bei Registrierung validiertes Register (nie aus Labels abgeleitet), Slots mit `allowedComponents`/`max`, Varianten als Property-Sets und Default-Props. Die Instanz trägt ausschließlich `componentId`, `componentVersion` und Overrides — keine duplizierte Struktur (Plasmic: `TplComponent` hat nur `component` + `VariantSetting.args`). Veröffentlichte Definitionen sind ab Publish **unveränderlich** (append-only Versionen); der Bake löst Overrides deterministisch gegen die gepinnte Version auf und **blockiert mit Fehler**, wenn die Version fehlt (kein stiller Fallback). Zusätzlich: Editor-Kontext (`isEditor`, `selectedPart`) für interaktive VCs (Navbar/Tabs/Modals) und **Stub + Error-Boundary** für unbekannte/entfernte Typen — in Editor, Vorschau und Bake identisch, kein Frame-Absturz.
**Akzeptanz:** Header/Footer/Card einmal pflegen, auf N Seiten nutzen; Instanz-Override ändert nicht die Definition; Swap ändert nicht die Definition; Overrides überleben Variant-Wechsel; Zyklus wird blockiert; Release löst Instanzen deterministisch auf.
**Belege:** Ticket 04, `templates.ts:15-277`, O14 (`map.md:125-137`).
**Abhängig:** E1, E2.

### E12 · Build-System: Re-Bake, Jobs, SSE — **P1, L**

**Stand (21.09., Ticket 05 Scheibe 1/2):** Der SSE-Kanal steht — `GET /api/events?site=…` mit
Prozess-Bus (`EngineEvents`), Publish bei Draft-, Seiten-, Asset- und Release-Änderungen; der
Editor folgt live (Store-Patch, Blitz-Highlight, Bau-Protokoll), im Live-Modus lädt die Vorschau
bei fremder Änderung neu, die **Agent-Vorschau** folgt dem Agenten über Seitengrenzen (Seitenliste
zieht nach, eigene Seitenwahl schaltet ab), der Proxy reicht den Strom durch und räumt beim
Client-Abbruch auf. Offen: Job-API mit Claim/Lease (S1 ist nur der Status-Lesepfad),
inkrementelle Routen-Bakes, `senify doctor`, Fallback-Ketten.

**Ziel:** Content-Änderungen landen zuverlässig und schnell auf der Seite.
**Umfang:** Durable Outbox + Dependency-Index; Job-API (Status, Retry, Dedup, Priorität); inkrementelle Routen-Bakes; Build-Status in UI/MCP/Audit; SSE-Kanal für Live-Mitverfolgung (Ticket 05); CMS-Grenze 500 auflösen (Pagination); **`senify doctor`** (Status je Fähigkeit — Engine, PG, Token, MCP, Assets, Bake, Ports — mit konkretem Fix-Befehl und ehrlicher „nicht verifiziert"-Markierung, Muster Agent-Reach); **Fallback-Ketten mit Health-Checks** für Fetch (Playwright → Firecrawl → Snapshot) und Deploy (Adapter-Primary → Fallback).
**Akzeptanz:** Entry-Publish backt nur betroffene Routen; ein fehlgeschlagener Job ist sichtbar und wiederholbar; der Editor folgt Agenten-Änderungen < 1 s; kein Full-Bake bei Einzeländerung.
**Belege:** `rebake.ts:22-39` („Trigger stub"), `content.ts:116-129`, `bake.ts:137-145,259-264`, Ticket 05.
**Übernommene Muster (Payload + Webstudio, geprüft):** (a) **Claim/Lease/Heartbeat statt Zähler-Stub:** Jobs werden geclaimt (Query auf abgelaufene Lease + erreichtes `waitUntil`), halten eine Lease per Heartbeat; Crash-Recovery durch Lease-Ablauf (Payload `runJobs`). **Concurrency-Key `siteId`** verhindert parallele Bakes derselben Site; Retry mit `fixed`/`exponential` Backoff und `hasError` als Endzustand — konsolidiert Senifys bestehende Backoff-Muster in **eine** Job-Tabelle; Job-Ausführung läuft in eigener Transaktion. (b) **Inkrement:** `writeFileIfChanged` + Generated-Files-Manifest + per-Seiten-Pruning (Webstudio `prebuild.ts`).
**Abhängig:** E2.

### E13 · CMS-, Forms- und Media-Workspaces — **P1, M**

**Ziel:** Redaktion ohne API-Handarbeit.
**Umfang:** Collection-Builder, Entry-Liste (Suche/Filter/Bulk), Entry-Editor (Autosave, Versionstimeline, Preview), On-Page-Edit für Entries (Phase 2), Submission-Inbox (Status/Export/Webhooks), Media-Library (Ordner, Bulk, Replace/Restore, Alt-Status), Content-Dependency-Anzeige; **Referenz-Vault** (Volltextsuche über alle Analysen per FTS, Dedupe ähnlicher Referenzen, Backlinks/Graph „welche Seiten nutzen diese Referenz", Vault-first-Regel: erst suchen, dann neu capturen — Muster hyperresearch).
**Akzeptanz:** Blog- und Kontaktformular-Slice sind vollständig in der UI bedienbar; jede Änderung ist auch per MCP möglich (Parität); Version-Restore in der UI.
**Belege:** Spec §CMS/Forms, `content.ts`, `media.ts`, `forms.ts`.
**Übernommene Muster (Payload, geprüft):** Autosave erzeugt **keine** neue Version, sondern aktualisiert die neueste Draft-Zeile **in place**; eine Version entsteht erst bei Publish (Payload `updateLatestVersion.ts` — Concurrent-Autosaves sind abgefangen). Der Draft-Lesepfad läuft über einen expliziten Schalter (`replaceWithDraftIfAvailable`); Draft-Save validiert Format, Publish validiert Vollständigkeit (`drafts.validate` Default false). Restore läuft durch die **volle** Guardrail-/Hook-Kette und schreibt eine neue Version mit wählbarem Status (draft/published) — Restore ist kein Sonderpfad. Retention je Collection konfigurierbar (`maxPerDoc`, `0 = unbegrenzt`).
**Abhängig:** E4, E12.

### E14 · Hosting & Deploy — **P1, M**

**Ziel:** „Veröffentlichen" liefert öffentlich aus.
**Umfang:** Erster Deploy-Adapter (Vercel/Netlify): `deploy`, `protect`, `addDomain`; Domains/TLS-Status; Preview-Deployments mit Cleanup; Forms-Endpoint im Betrieb; Storage-/CDN-Adapter; Deployment-Status + Rollback in UI/MCP; Backup-/Restore-Prozedur.
**Akzeptanz:** Ein Release ist unter einer URL erreichbar; eine Submission kommt an; ein Rollback stellt den vorherigen Release öffentlich wieder her; Preview-Links sind geschützt und laufen ab.
**Belege:** `lifecycle.ts:233-245`, Spec §Hosting.
**Abhängig:** E2.

### E15 · Quality-Gates: A11y, SEO, Performance — **P1/P2, M**

**Ziel:** Qualität ist messbar und blockiert.
**Umfang:** A11y: Keyboard-E2E, Labels, Fokus, Heading-/Landmark-Struktur, Form-Errors; SEO: Canonical/OpenGraph, Schema.org-Katalog (Organization/WebSite/WebPage/Breadcrumb/FAQ/Article), Rich-Result-Validierung, harte Meta-Checks; Performance: Lighthouse/CWV im Review, LCP/CLS/INP-Report, JS-/CSS-/Font-/Image-Budgets; Analytics-Adapter mit Consent; **Adversarial Review** als Muster aus E23 (parallele Kritiker + chirurgischer Patcher mit Tool-Lock).
**Akzeptanz:** Hard-Checks blockieren Publish (Links, Alt, Assets, Kontrast, JSON-LD, Motion); Soft-Checks erscheinen begründet im Review; ein Release trägt einen maschinenlesbaren Quality-Report.
**Belege:** `checks.ts:110-364`, `aeo.ts`, Spec §SEO/Performance.
**Abhängig:** E2, E12.

### E16 · UI-Modernisierung: Design-System durchsetzen — **P0/P1, M**

**Ziel:** Der laufende Editor sieht aus wie die eigene Vorschau — modern, ruhig, konsistent.
**Umfang:** Legacy-Palette tilgen (kein Magenta/Sky/Violett); Tokens als einzige Quelle (kein rem/em-Wildwuchs); Zustände nachrüsten (`:focus-visible`, `:active scale(0.97)`, disabled 38 %); `color-scheme: dark`, Scrollbars, `::selection`, Antialiasing, Reduced-Motion; Komponentenfamilie aus `ui-preview` in den Editor überführen (Felder, Menüs, Dialoge, Toasts, Spotlight); Icon-Größen/Strichstärken; ein Radius je Gruppe; Paritätstest „Vorschau↔Editor".
**Akzeptanz:** CSS-Scan findet keine Fremdfarben; jedes Bedienelement hat sichtbaren Fokus; bei `prefers-reduced-motion` keine Bewegung > 0,001 ms; Zustandsmatrix der Vorschau ist im Editor abbildbar.
**Belege:** `styles.ts:22-31,337,369,729`, `skin.ts:44-560`, UI-Audit §2/§3/§5.
**Abhängig:** E5 (sonst doppelte Arbeit).

### E17 · Undo-, History- & Transaktionsmodell — **P0, M**

**Ziel:** Undo/Redo ist definiertes Produktverhalten, kein Nebeneffekt des Stores.
**Umfang:** Explizite Transaktions-API (`begin`/`commit`/`abort`, `pause`/`resume`) über `coalesceKey` hinaus; Undo-Scope (Mensch vs. Agent, client-scoped History als Vorbereitung); Undo-/Redo-Patches laufen durch dieselbe Validierung wie `applyMutations` (inkl. `validateTreeIntegrity`); Preconditions je Undo-Batch (erwartete Serverversion); Redo-Invalidierung bei neuen Mutationen; **Selection/Breakpoint/Zoom bewusst außerhalb der History** (Webstudio-Muster, geprüft: UI-Zustand wird synchronisiert, aber nicht historisiert — höchstens als nicht-validierende Metadaten am Eintrag); History-Panel mit Sprüngen; Größen-/Zeitlimit für Subtree-Patches; Agenten-Undo über `undo_batch` (E4).
**Übernommene Muster (Webstudio, geprüft):** (a) Ephemere Vorschau: Slider-/Drag-Vorschauen schreiben nicht ins Dokument, sondern nur in eine Vorschau-Schicht (CSS-Custom-Properties); erst der Commit erzeugt die Transaktion — „ein Zug = eine Transaktion" entsteht strukturell statt per Koaleszenz-Heuristik (`use-style-data.ts`, `canvas/shared/styles.ts`). (b) Eine Transaktion trägt ID + semantischen Op-Batch; Rückwärts-Patches werden generiert (`produceWithPatches`), nicht handgepflegt. (c) Netz-/Agenten-Retries senden **dieselbe** Transaction-ID; der Server dedupliziert und vermerkt den Retry als Diagnose (`project-session.ts`).
**Akzeptanz:** Ein Drag = genau ein Undo; ein Undo gegen einen veralteten Stand wird abgelehnt oder rebased statt still korrupt; Reload/Konflikt behält die Nutzer-History; jede Undo-Ausführung ist ein Audit-Eintrag; History-Panel zeigt Zeit + Aktion.
**Belege:** `store.ts:171-247`, `store.ts:250-255`, `apply.ts:1015-1037`; Referenzen: Liveblocks (client-scoped, pause/resume, Selection im Stack), Figma (Undo modifiziert Redo-History; Deletes im Client-Puffer), GrapesJS (`start/stop/skip`).
**Abhängig:** E5 (Session-Kern). **Blockiert:** sauberes Konfliktverhalten, Agenten-Undo.

### E18 · Performance-Budget & inkrementelles Rendering — **P1, M**

**Stand (21.09., Ticket 05 Scheibe 2):** Ein Messskript liegt vor
(`.scratch/editor-v2-rebuild/pruef-t05-performance.mjs`, Zerlegung in
`pruef-t05-breakdown.mjs`); gemessen auf 60 Nodes / 3 Blätter: erstes Paint 620-850 ms
(< 1 s), Insert-Median 12-13 ms (< 16 ms), p95 21-25 ms, ~2,3 Layouts je Insert. Der
Refresh kompiliert die CSS-Regeln einmal je Durchlauf, annotiert in einem DOM-Durchlauf,
teilt den React-Element-Aufbau und rendert die Nebenschienen einen Frame später
(rAF-Split). Offen bleibt der Kern von E18: selektor-basierte Subscriptions,
Change-Sets/Subtree-Invalidierung, Node-Memoization, Parent-Index, CSS-Dirty-Marker.

**Ziel:** Der Editor bleibt bei 1.000+ Nodes flüssig und messbar; L21 wird vom Befund zum Gate.
**Umfang:** Budget mit Zahlen (Store-Apply < 8 ms bei 1.000 Nodes; Interaktion < 16 ms; Explorer-Scroll 60 fps virtualisiert; CSS-Emission nur betroffener Regeln); selektor-basierte Subscriptions statt globalem `subscribe`; Change-Set aus Patch-Liste → nur betroffene Subtrees invalidieren; Node-Memoization; Parent-/Child-Index statt O(n)-Suche; CSS-Cache mit Dirty-Markern; inkrementelle Style-Emission; Undo-Snapshot-Limits.
**Akzeptanz:** Performance-Test mit synthetischem 1.000-Node-Dokument im CI; ein Property-Change erzeugt keinen CSS-Voll-Rebuild; Hover/Drag ohne Frame-Drops; Budgetwerte im Repo dokumentiert.
**Belege:** `store.ts:136-145`, `document.ts:132-147`, `document.ts:209-250`, `apply.ts:971-978`; Referenzen: Dirty Flag, Craft.js-Selektoren, Webstudio (Signals), Slate (Chunking), Headless Tree (Virtualisierung).
**Abhängig:** E5, E7.

### E19 · Collaboration-Readiness des Patch-Modells — **P2, S** (Vorbereitung, kein Feature)

**Ziel:** Die bewusste „kein Multiplayer"-Entscheidung (L28) bleibt, aber das Modell ist später ohne Rewrite erweiterbar.
**Umfang:** Ordnung stabilisieren (Fractional Index einführen **oder** Index-Ordnung als bewusste Grenze in einem ADR festschreiben; Parent-Link + Position atomar halten); Patch-Preconditions (jeder Patch trägt erwartete `baseDraftVersion`; `applyUndoBatch` prüft sie und validiert Integrität); client-scoped History-API + Pause/Resume (E17); Server-Autorität für Konflikte (409 bleibt), LWW-Semantik pro Property dokumentieren; CRDT/OT-Entscheidung als ADR (zentralisiert + LWW als Zielpfad; Yjs nur bei Offline-Bedarf).
**Akzeptanz:** ADR mit expliziten Kriterien; Precondition-Test (Undo gegen veralteten Stand schlägt sauber fehl); Test hält die Positions-Semantik als Grenze fest.
**Belege:** `operations.ts:807-948`, `apply.ts:1015-1037`, `store.ts:159-161`; Referenzen: Figma (Multiplayer, Ordered Sequences), Liveblocks, OT-vs-CRDT-Analysen 2025/26.
**Abhängig:** E17.

### E20 · Style-Kompilierungs-Pipeline: `@layer`, Atomic-Option, Inkrement — **P1, M**

**Ziel:** Keine Spezifitätseskalation mehr; CSS-Größe und -Ordnung sind systemisch garantiert.
**Umfang:** Kaskaden-Layer (`@layer editor-chrome, site, utilities`) statt Marker-Spezifität; Entscheidung + Messung „Klassen-Kombinationen vs. Atomic" (eine Deklaration pro Klasse, StyleX/Webstudio-Muster; Zielgrößen-Budget ≥ 70 % Reduktion, anknüpfend an Ticket 14); Token→CSS-Variablen beibehalten; stabile Klassen-IDs (L6) als Voraussetzung; deterministische Prioritäts-Ordnung (Longhand vs. Shorthand, State > Default); inkrementelle Emission (Kopplung an E18).
**Akzeptanz:** CSS-Scan findet keine konkurrierenden Spezifitäts-Marker; `@layer`-Ordnung getestet; Größen-Budget im CI; ein Property-Change emittiert genau die betroffenen Klassen.
**Belege:** `styles.ts` (0,5,0-Marker, §2.2), O15/Ticket 14; Referenzen: StyleX (Meta Engineering 2025), Webstudio Atomic CSS (~70–90 %).
**Übernommene Muster (Webstudio, geprüft):** (a) Registry-/Section-Defaults werden in `@layer presets` emittiert; unlayered Nutzer-Styles gewinnen garantiert, ohne Spezifitäts-Marker (`packages/sdk/src/css.ts`). (b) Atomic als **Emit-Transform**: eine Deklaration pro Klasse, Klassenname = Content-Hash, identische Deklarationen werden sheetweit dedupliziert — die Quell-Identität (stabile `classId`) bleibt unverändert und ist jederzeit neu berechenbar (`css-engine/src/core/atomic.ts`). (c) Deterministische Media-Ordnung: Basis → Conditions alphabetisch → `minWidth` absteigend → `maxWidth` aufsteigend (`compare-media.ts`). (d) Per-Page-Pruning: nur Styles tatsächlich gerenderter Teilbäume werden emittiert (`cli/src/prebuild.ts`).
**Abhängig:** E6 (Inspektor-Controls), L6-Fix.

### E21 · Agent Permission Gate & Escalations — **P1, M**

**Ziel:** Riskante Agenten-Ops warten auf den Menschen — mitten im Lauf, ohne den Agenten zu hängen; blockierte Arbeit wird sichtbar statt still.
**Umfang:** (1) **Permission Gate:** Kategorien riskanter Ops (Delete/Purge, Publish/Rollback, Style-Regeln `ambient`/`rawCss`, Theme-Wechsel, Site-Trash) lösen bei Agenten-Token eine Freigabe-Anfrage aus, die im Editor als Card erscheint und die Mutation **blockiert bis zur Antwort** (approve/deny); Transport als Long-Poll über die lokale Engine, MCP-kompatibel (Muster `mcp-gate`). (2) **Fail-closed:** Jeder Transport-/Timeout-Fehler beantwortet die Anfrage mit `deny` + Grund — nie „allow by accident", nie hängende Agenten. (3) **Read-only-Plan-Modus:** Lese-Ops laufen ohne Freigabe (Token-Scope `read` existiert); Schreib-Ops im Plan-Modus werden als Vorschlag gesammelt statt ausgeführt. (4) **Escalation-Queue:** blockierte Fetches (Login-Wall/Bot-Wall/Captcha) und unauflösbare Konflikte landen als konsolidierte Liste („3 Escalations warten") in der Inbox; der Mensch löst sie, der Run fährt fort. (5) Audit: jede Entscheidung mit Actor, Kategorie, Antwort und Dauer.
**Akzeptanz:** Ein Agenten-Token kann einen Delete ohne Freigabe nicht ausführen (Test); ein Gate-Ausfall führt zu `deny` (Test); eine Escalation erscheint im Editor und der Run läuft nach der Antwort weiter (Browser-Test); jede Entscheidung ist im Audit.
**Belege/Vorbilder:** OpenResearch `mcp-gate`/`plan-gate` (`src/commands/mcp_gate.rs`, „never hang Claude and never allow by accident"); hyperresearch Escalations („CAPTCHAs/logins/2FA are ALWAYS handed to the human, consolidated into one message"); L39.
**Übernommene Muster (Webstudio + Payload, geprüft):** (a) **Confirmation-Token zweiphasig:** `requiresConfirm` je Operation; der Token ist TTL-gebunden und per SHA-256 an den **kanonischen Plan** gebunden — der Agent kann den Plan zwischen Vorschau und Bestätigung nicht ändern (Webstudio `confirmation-token.ts`, `mcp.ts`). (b) **Kategorien** folgen der Access-Logik (Operation × Ressource): `delete`, `publish/rollback`, `style-rules (ambient/rawCss)`, `theme`, `site-trash`. (c) **Fail-closed ist Grundmuster:** Payloads Scheduled-Publish verweigert ohne User-Kontext (`versions/schedule/job.ts`), `runJobs` prüft `access.run` vor jedem Lauf. (d) Jede Entscheidung mit Actor, Kategorie, Antwort und Dauer im Audit.
**Abhängig:** E3 (Fence/Annotations), E12 (Jobs/Status).

### E22 · Agent-Runs: Evidence, Resume, Delegation — **P1, L**

**Ziel:** Jeder Agentenlauf ist eine auditierbare Einheit mit Beweisen, Wiederaufnahme und klaren Grenzen für Sub-Agenten.
**Umfang:** (1) **Run-Objekt:** id, Auftrag (Brief), Status, Schritte, betroffene Ressourcen, Spend/Kosten, Dauer, Manifest — sichtbar in UI und MCP. (2) **Resume:** abgebrochene Läufe setzen am letzten Schritt fort (Manifest-Position). (3) **Evidence:** strukturierte Run-Logs (was gelesen/geschrieben/geprüft, mit Byte-Fenstern und Truncation-Hinweis); Regel „Run-Logs sind der Beweiskanal" — kein „fertig" aus dem Status allein. (4) **Verify-Gate:** vor „fertig" prüft der Run selbst (Checks, Parität, Alt-Texte, Links) und meldet ein Ship-Gate-Ergebnis. (5) **Delegation/Isolation:** Sub-Agenten mit eigenem Arbeitsbereich (Worktree-Analogon: eigener Draft-Branch/Session), Concurrency-Limit, kein Auto-Merge, standalone Briefs, „frozen"-Regel für abgenommene Bereiche.
**Akzeptanz:** Ein abgebrochener Run lässt sich fortsetzen (Test); ein Run ohne Verify-Gate-Ergebnis kann nicht als „fertig" gemeldet werden; zwei Sub-Agenten können nicht dieselbe Ressource gleichzeitig exklusiv halten (Konflikt-Test); Run-Evidence ist durchsuchbar.
**Belege/Vorbilder:** hyperresearch `run status/resume/report/verify`, `run.json`-Manifest, Spend-Tracking; OpenResearch `orx logs`/`runs`/`supervise`, immutable run archive, `orx agent spawn`-Regeln („never give a helper a branch checked out by this session", kein Auto-Merge, Spawn-Limits); L40/L41.
**Übernommene Muster (Payload + Plasmic, geprüft):** Run-Evidence als strukturiertes Log **je Schritt** (`id, executedAt, completedAt, state, input, output, error, taskSlug, parent` — Payload `JobLog`), nicht als Freitext; „fertig" erst nach erfolgreichem Verify-Schritt (`completedAt` erst nach Handler-Erfolg). Sub-Agenten sind eigene Jobs mit **eigenem Concurrency-Key** (nie derselbe wie der Eltern-Run). VC-Definitionen werden als `componentId@version` referenziert; Run-Evidence enthält den Diff „Definition alt→neu" und „Instanz-Overrides" (Plasmic-Lehre: Definitionen sind versionierte, unveränderliche Ressourcen).
**Abhängig:** E12 (Job-Infrastruktur), E3.

### E23 · Design-Varianten & Adversarial Review — **P2, L**

**Ziel:** Agenten explorieren Design-Varianten strukturiert statt zufällig; jede Variante wird bewertet, eingefroren und nachvollziehbar weiterentwickelt.
**Umfang:** (1) **Varianten-Baum:** jede Design-Variante (z. B. Hero A/B/C) ist ein Knoten mit eigener Preview + Screenshot-Diff; Regeln wie bei OpenResearch: „einfrieren, sobald bewertet" (kein stilles Nachbessern), „nur Inhalt variieren, nicht die Umgebung", „in die Tiefe wachsen" (Gewinner bekommt Kinder). (2) **Adversarial Review:** mehrere Kritiker parallel (A11y, Kontrast, Design-Token-Treue, Performance, Copy) erzeugen Findings; ein **chirurgischer Patcher** (Tool-Lock: nur Einzel-Edits, kein Rewrite) wendet Korrekturen an; Cite-/Beleg-Check für Agenten-Behauptungen („Quelle belegt den Satz"). (3) **Bewertung:** Screenshot-Diff + Quality-Gates als Score; der beste Knoten wird Kandidat für Review/Publish.
**Akzeptanz:** Ein Varianten-Baum mit 3 Knoten lässt sich erzeugen, bewerten und einfrieren; ein eingefrorener Knoten ist unveränderlich (Test); der Patcher kann nachweislich keine Volltext-Rewrites machen (Tool-Lock-Test); jede Empfehlung nennt ihren Beleg.
**Belege/Vorbilder:** OpenResearch Cardinal Rules (`agent-skills/orx-experiment-tree`); hyperresearch Kritiker+Patcher („tool-locked Read+Edit"), Cite-Check, „Syndication doesn't count as consensus"; Senify-Bausteine existieren (Preview, Screenshot-Diff, Quality-Checks).
**Übernommene Muster (Plasmic, geprüft):** A/B-Experimente als **Split-Datenmodell** statt Varianten-Matrix: `Split { type: experiment|segment|schedule, status, slices: [RandomSlice{prob} | SegmentSlice{cond}], contents: [VariantContent | ComponentSwapContent] }` (`model-schema.ts`, `core/splits.ts`) — ein eigenes Site-Objekt, das das Node-Modell nicht aufbläht.
**Abhängig:** E12, E15, E22.

---

## 6. Roadmap

Vier Phasen, jede endet mit einem nutzbaren, ehrlich abgenommenen Zustand.

### Phase A — Fundament konsolidieren (P0, vor allem anderen)

1. E1 Kanonisches Modell + Migrations-Fixes (`hiddenDevices`, Property-Reset) — **Ticket 11**
2. E2 Release-Integrität + Publish-Cutover — **Ticket 17**
3. E3 Agent-Sicherheit (Author, Idempotenz, Fence, Annotations-Matrix) — **Ticket 18**
4. E4 Scheibe 0 (MCP-Vertragsreife) — klein, wirkt auf alle 49 Tools
5. E17 Undo-Modell (Bausteine existieren; Preconditions, Transaktionen, History-Panel)
6. E16 P0-Teil (Vorarbeit ohne E5): Legacy-Leaks schließen, Fokus/Zustände/Grundhaut — Farben/Tokens/Grundzustände sind unabhängig von der Shell-Konsolidierung; die Komponentenüberführung folgt in Phase B

**Phase A ist fertig, wenn:** ein Rollback reproduzierbar ist, ein Agent nicht fälschen kann, kein Responsive-Override mehr verloren geht, alle Tool-Annotations korrekt sind, Undo Preconditions prüft und der Editor keine Fremdfarben mehr zeigt.

### Phase B — Editor-Produkt (das Framer-Erlebnis)

7. E5 Editor-Shell + Session-Kern (ein Editor)
8. E6 Style-Inspektor (Ticket 02)
9. E7/E8 Explorer + DnD/Overlay (Tickets 03/12/16)
10. E9 Responsive-UX
11. E10 Motion/Interactions (M4/M6-Anschluss)
12. E4 Scheibe 1 (Workflow-Tools: Style-Rules, Undo, Lifecycle) — parallel zu E5
13. E20 Style-Kompilierung (`@layer`/Atomic) — nach E6
14. E21 Agent Permission Gate (Gate-Teil) — nach E3, unabhängig von E12; die Escalation-Queue folgt mit E12

**Phase B ist fertig, wenn:** ein Mensch eine Seite vollständig per Maus und Tastatur bauen kann — Layout, Stile, Responsive, Motion, Review — und der Agent dieselben Ergebnisse per MCP erzielt (dafür ist E4 Scheibe 1 Teil der Phase).

### Phase B+ — Referenz-Transfer & Design-Qualität (Teil II, parallel startbar)

15. **E24 Referenz-Bibliothek 2.0** (Dokumente, Bulk-Import der Sammlung, Screenshot-Slots, Specimens, MCP-Parität) — nach E1/E3/E4 S0, parallel zur frühen Phase B; der Kernauftrag „Vorschaubild + `design.md`".
16. **E25 Redesign-Workflow** (`plan_redesign`/`apply_redesign`, 3 Richtungen, Design-Record; Editor-Modus nach E5/E6) — nach E24 S1 + E5; nutzt E23 als Ausbaustufe.
17. **E27 Design-System-Import** (`design.md` → Theme) — nach E24 S1.

**Phase B+ ist fertig, wenn:** die Referenz-Sammlung importiert ist, ein Agent auf Zuruf ein Redesign als Draft liefert (3 Richtungen, Design-Record, kein Eingriff am Release) und ein Mensch denselben Weg im Editor gehen kann.

### Phase C — Content & Betrieb

14. E11 Visual Components & Templates (Ticket 04) — **Vorrang innerhalb der Phase** (Kernhebel gegen das Baukasten-Gefühl); Component-Modell P0, Templates/Outlet P1
15. E12 Build-System (Jobs, inkrementell; SSE für den Build-/Job-Kanal — die Kollaborations-Events bleiben Phase D)
16. E13 CMS/Forms/Media-Workspaces
17. E14 Hosting/Deploy
18. E15 Quality-Gates
19. E18 Performance-Budget (kann parallel zu E12 laufen)
20. E22 Agent-Runs: Evidence, Resume, Delegation — nach E12
21. E23 Design-Varianten & Adversarial Review — nach E15/E22

**Phase C ist fertig, wenn:** eine echte Kundenseite mit Blog und Formular entsteht, agentengepflegt, reviewt, veröffentlicht und öffentlich erreichbar ist.

### Phase D — Team & Ökosystem (optional)

22. E19 Collaboration-Readiness → Collaboration (Kommentare, Rollen, Presence — nach Bedarf)
23. Extension-SDK, Import, Marketplace, Localization (nach VC + Versionierung)

**Grundsatz:** Kein Phase-D-Thema beginnt, bevor Phase A steht. Die Reihenfolge schützt davor, viele Controls zu bauen, während Modell, Release und Agenten-Sicherheit noch wackeln.

---

## 7. Qualitäts- und Abnahmegates

**Definition of Done (je Arbeitspaket):**

1. **End-to-End:** Der Pfad ist in der App **und** per MCP vollständig durchführbar.
2. **Eine Schreibwahrheit:** UI und Agent nutzen dieselben Mutationen; kein UI-only-Zustand, der beim Reload verloren geht.
3. **Konfliktverhalten:** `baseDraftVersion`/`baseVersion` geprüft, 409 mit Handlungsanweisung, No-op/Undo/Redo deterministisch.
4. **Parität:** Preview/Bake nutzen denselben Renderer; keine Draft-Daten im Release; Paritäts-Gate grün.
5. **Responsive:** 1440/1024/390 geprüft; Basis/Override/Reset korrekt; kein horizontaler Überlauf.
6. **Gates:** Hard-Checks blockieren (Links, Alt, Assets, Kontrast, JSON-LD, Motion); Soft-Checks begründet sichtbar.
7. **Tests an drei Prüfstellen:** Engine-API-Blackbox, Bake-Output, MCP-Workflow.
8. **Doku:** `HANDOFF.md`, `map.md`, `ledger.md`, Ticket, ggf. ADR aktualisiert; Beleg-Log im `.scratch/`.
9. **Migration:** Persistenzänderungen mit Migration + Roundtrip-Test; fehlgeschlagener Release lässt den aktiven Release unverändert.
10. **Nachweis statt Behauptung:** Messung/Screenshot/Browser-Test mit frischen Zahlen; keine Übernahme aus Vorläufen (Ausnahme: Baseline-Belege früherer Läufe dürfen zitiert werden, wenn Logpfad und Datum genannt sind).
11. **MCP-Vertrag:** Jedes neue/geänderte Tool hat korrekte Annotations; Listen-Tools paginieren; Antworten mit `outputSchema` liefern `structuredContent`; der Referenz-Workflow bleibt unter dem Kontextbudget (Messung im Ledger).

**Zielwerte (verbindlich, sobald das jeweilige Gate existiert):** WCAG 2.2 AA für Editor und ausgelieferte Seiten; Core Web Vitals: LCP < 2,5 s, INP < 200 ms, CLS < 0,1; JS-Budget je Seite ≤ 120 kB gzip (ohne Bilder), CSS ≤ 60 kB gzip; Editor: Store-Apply < 8 ms bei 1.000 Nodes, Interaktion < 16 ms; Kontrast: Text ≥ 4,5:1, UI-Kanten ≥ 3:1; Paritäts-Toleranz ≤ 0,1 % abweichende Pixel im Referenz-Viewport (1120×48-Ausschnitt als kleinste Messfläche); Reduced Motion: `transition-duration`/`animation-duration` ≤ 0,001 s bei `prefers-reduced-motion: reduce`.

**Test-Matrix (je Phase):**

| Prüfart | Phase A | Phase B | Phase C |
|---|---|---|---|
| Unit/Integration (`pnpm test`) | Pflicht je Paket | Pflicht | Pflicht |
| Typecheck/Lint | Pflicht | Pflicht | Pflicht |
| Browser-E2E (Playwright) | Release-Rollback, Agent-Fence | Editor-Pfade, DnD, Responsive, A11y-Keyboard | CMS/Forms/Deploy |
| Paritäts-Gate (Canvas↔Bake) | CI-Blocker aktivieren | bei jeder UI-Änderung | bei jeder Render-Änderung |
| Migration/Roundtrip | Pflicht (E1) | bei Modelländerung | bei Persistenzänderung |
| Performance-Budget | Baseline messen | Gate aktiv | Gate aktiv |
| `TEST_DATABASE_URL`-Lauf | vor Release-Themen Pflicht | wöchentlich | vor jedem Deploy |

---

## 8. Steuerung: KPIs, Risiken, Betrieb, Recht

### 8.1 Erfolgsmetriken (KPIs)

| KPI | Baseline (heute) | Ziel | Messung |
|---|---|---|---|
| Time-to-first-Page (Agent baut Seite bis Preview) | nicht gemessen | < 15 min | Workflow-Test mit Zeitstempeln im Ledger |
| Agent-Task-Erfolgsrate (Referenz-Workflows ohne manuellen Eingriff) | nicht gemessen | ≥ 90 % | Workflow-Tests + Audit-Auswertung |
| Review-Rework-Rate (Reviews mit „request changes") | nicht gemessen | ≤ 20 % | Review-Tabelle |
| Publish-Qualität | Checks existieren | 0 Hard-Check-Durchbrüche; Soft-Warnungen begründet | `checks.ts` + Release-Audit |
| Paritäts-Gate | 100 % in Testläufen | 100 % im CI, Toleranz ≤ 0,1 % | Paritäts-Browser-Test |
| Editor-Performance | nicht gemessen | Budgetwerte §7 | Performance-Test (E18) |
| MCP-Kontextbudget | nicht gemessen | Referenz-Workflow < 25.000 Token | Messung je Workflow im Ledger |
| Undo-Vertrauen | nicht gemessen | 0 stille Korruptionen | Undo-Precondition-Tests (E17) |
| Agent-Run-Wiederaufnahme | nicht vorhanden | 100 % der abgebrochenen Runs ohne Datenverlust fortsetzbar | Run-Resume-Test (E22) |
| Escalation-Reaktionszeit | nicht vorhanden | < 1 Arbeitstag (Inbox-Prinzip) | Escalation-Zeitstempel (E21) |
| Design-Score (E26) | nicht gemessen | ≥ 80 bei referenz-basierten Seiten; < 60 blockiert profilabhängig | `get_design_report` + Review |

### 8.2 Risiko-Register (Eintrittswahrscheinlichkeit × Auswirkung)

| Risiko | P | A | Frühindikator | Gegenmaßnahme |
|---|---|---|---|---|
| Scope-Überlauf (27 Epics, Single-Operator) | hoch | hoch | Phase A dauert > 6 Wochen | Phasengates, Nicht-Ziele §8.4, Epics schneiden |
| Migrations-Datenverlust (E1) | mittel | hoch | Roundtrip-Tests rot | Fixtures + Gegenprobe; kein Cutover ohne grünen Roundtrip |
| Release nicht reproduzierbar (E2) | mittel | hoch | Rollback-Diff ≠ 0 | Manifest + atomare Aktivierung + Test |
| Agent-Fehlverhalten trotz Fence (E3) | mittel | mittel | Audit-Anomalien | Audit-Auswertung, Kill-Switch, Rate-Limits |
| Vendor-Risiko Deploy-Adapter (E14) | mittel | mittel | API-Brüche | Adapter-Abstraktion; zweiter Adapter ab P2 |
| Performance-Regression (E18) | mittel | mittel | Budget-Test rot | CI-Gate, Dirty-Tracking |
| Bus-Faktor 1 | hoch | hoch | — | HANDOFF/Ledger/Verbesserungsplan aktuell halten; ADRs; dokumentierte Runbooks |
| Doku-Drift (Dokument ≠ Code) | hoch | mittel | HANDOFF ≠ Arbeitsbaum | DoD #8, Ledger-Pflicht, wöchentlicher Abgleich |

### 8.3 Betrieb & Observability

- **Vorhanden:** Health-Check, Audit-Log, Locks, Rate-Limits (prozesslokal).
- **Ergänzen:** strukturierte Logs + Error-Tracking; SLOs (Bake-Erfolgsrate ≥ 99 %, Deploy-Erfolg ≥ 99 %, API-p95 < 300 ms); Alerting für fehlgeschlagene Jobs/Deploys; Runbooks („Rebake hängt", „Deploy fehlgeschlagen", „Rollback", „Backup-Restore"); verschlüsselte, getestete Backup-/Restore-Prozedur.
- **Agenten-Observability:** Audit-Auswertung (Calls, Fehler, Dauer, Kosten je Lauf); MCP-Audit ist die Quelle.

### 8.4 Nicht-Ziele (mit Wiederaufnahmebedingung)

| Nicht-Ziel | Haltung | Wiederaufnahme, wenn |
|---|---|---|
| Echtzeit-Multiplayer/CRDT | bewusst nicht (Entscheidung E3 in `map.md`) | Kundenbedarf **und** E19-Readiness erfüllt |
| Localization | v2-Kandidat | ≥ 1 Kunde mit Mehrsprachigkeit |
| E-Commerce | verworfen | nur Shopify-Embed über `embed` auf Anfrage |
| Framer/Webflow-Import | später | nach VC-Modell + Versionierung |
| Component-Marketplace | später | nach VC + Signierung + Lizenzmodell |
| Eigene generative KI (Bild/Text) | aufgehoben (ADR-0008, 21.09.): lokale Bildgenerierung via ComfyUI-Provider; BYOK-Agenten bleiben daneben möglich | Lizenzprüfung (Qwen Research License) vor Produktivbetrieb |
| Code-Export-Feature | entfällt | Bake **ist** das offene Ergebnis |

### 8.5 Annahmen (Prüfdatum)

- Single-Operator-Tempo für alle S/M/L-Schätzungen — prüfen bei Phase-A-Ende.
- Lokale Postgres-Instanz bleibt Betriebsmodell bis zum Hosting-Adapter (E14).
- Astro bleibt der Renderer (ADR-0002); React nur für Sections/Islands.
- Browser-Support: letzte zwei Versionen Chromium/Firefox/Safari; Editor zusätzlich WebKit-Check.
- Registry bleibt first-party-kuratiert (kein Dritt-Ökosystem, E2-Entscheidung).

### 8.6 Datenschutz & Recht

- **DSGVO:** Rechtsgrundlagen für Submissions (Consent existiert), Retention-/Löschkonzept für Entries/Submissions/Audit, AVV-Vorlage für Kunden, PII-Redaktion in Logs (für MCP vorhanden), Löschworkflow über Entry/Asset/Submission.
- **Referenz-Pipeline:** Capture externer Seiten — Nutzungsrechte/ToS prüfen, nur öffentliche Seiten, kein Login-Bypass, Attribution im Brief.
- **Hosting (ab E14):** EU-Region für Storage/Backups, Verschlüsselung, Auftragsverarbeitung mit Deploy-Providern, Cookie-/Consent-Konzept für Analytics (E15).

### 8.7 Kosten & Kapazität

- **Infrastruktur je Phase:** A lokal (PG, Filesystem); B lokal + Capture-Worker; C PG/Storage/CDN + Deploy-Provider + Mail (SMTP/DOI).
- **AI-Kosten:** Referenz-Analyse (Capture + Klassifikation) und Agentenläufe budgetieren; Capture-Worker begrenzen.
- **Kapazität ehrlich:** 8 L-, 18 M- und 1 S-Epic plus Scheiben (inkl. Teil II: E24–E27) ergeben grob **110+ Wochen Single-Operator**. Deshalb gilt: Phase A + B sind der verbindliche Kern (≈ 12–16 Monate bei fokussierter Arbeit), Phase B+ ist der Differenzierungs-Kern und kann parallel zur frühen Phase B starten, Phase C wird erst nach Phase-B-Abnahme priorisiert, Phase D ist optional. Die Schätzungen sind bewusst grob und werden am Ende jeder Phase nachjustiert.

### 8.8 Abhängigkeitsgraph

```
E1 ─► E4(S1), E5, E9, E11
E2 ─► E11, E12, E14, E15
E3 ─► E4(S1)
E5 ─► E6, E7, E8, E9, E10, E16, E17, E18
E6 ─► E20
E7 ─► E18
E12 ─► E13
E17 ─► E19
E3 ─► E24 · E4(S0) ─► E24
E24 ─► E25, E27
E5 ─► E25(S3)
E25 ─► E26 · E15 ─► E26
E4(S0) unabhängig · E4(S1) nach E1/E3 · E16(P0) vor E5 möglich · E24/E25/E27 parallel zur frühen Phase B
```

### 8.9 Cutover-Runbook (E1/E2, Kurzfassung)

1. **Inventar:** Seiten, Style-Rules, Templates, Entries, Assets zählen + Prüfsummen ziehen.
2. **Freeze:** Agenten-Token während des Cutovers read-only; Menschen-Editor auf Lesen.
3. **Migration in Kopie:** v1→v2 auf Klon, Roundtrip-Gegenprobe, Stichproben-Diff; erst dann Produktion.
4. **Rollback:** v1-Snapshot behalten; Abbruchkriterien: Roundtrip-Diff > 0, Paritäts-Gate rot, Check-Fehler.
5. **Kommunikation:** Hinweis im Editor, Release-Notes, Deprecation-Frist für den v1-Pfad (Vorschlag: 2 Wochen nach Cutover).

---

## 9. Die nächsten 10 Arbeitspakete (sofort umsetzbar)

1. **Baseline sichern:** Arbeitsbaum in nachvollziehbare Changesets zerlegen, `TEST_DATABASE_URL`-Lauf, Doku-Stand fixieren (Grundlage für alles Weitere).
2. **Ticket 11 (Responsive-Datenverlust, E1-Scheibe):** `hiddenDevices` in Migration + Editor-Modell + Bridge; Property-weises Reset korrigieren; Tests inkl. Gegenprobe.
3. **Ticket 18 + E4 Scheibe 0 (Agent-Fence + MCP-Vertragsreife):** Author aus Token ableiten (Engine), Idempotency-Keys für Create/Upload, Literal-Block für Agenten-Token; Annotations-Matrix, Pagination, Server-Instructions; Tests je Regel.
4. **E17 Scheibe 1 (Undo-Preconditions):** Undo-/Redo-Patches durch `validateTreeIntegrity` + Preconditions führen; verhindert stille Korruption mit kleinem Aufwand.
5. **Ticket 02 Scheibe 1 (Inspector-Grundstock):** Tabs Content/Style/Interactions/Advanced, Feld-Familie (Zahl/Slider/Switch/Select/Farbwähler) aus der Vorschau in den Editor, Token↔Literal.
6. **E5 Scheibe 1 (EditorSession-Kern):** ein Session-Kern (Dokument + Auswahl + History + Serverversion + Pending), ein sichtbarer Editorpfad — kritischer Pfad für 7–10.
7. **Ticket 03 Scheibe 1 (Chrome, E7):** Explorer als Tree mit Tastatur + Kontextmenü-Vervollständigung + Fokus-Rückgabe; Spotlight-Semantik.
8. **Ticket 12 (DnD, E8):** Katalog-Drag, Plus-Punkte, Einfügelinie als Overlay, ein Undo je Zug, sichtbarer Zyklenschutz.
9. **Ticket 17 (Release-Cutover, E2):** Editor-Publish über `POST /api/releases`, vollständiges Manifest, Paritäts-Tor als CI-Blocker.
10. **E16 P0 + E12 Scheibe 1:** Legacy-Farben/rem-Reste neutralisieren, `:focus-visible`, `:active`, `color-scheme: dark`, Reduced-Motion, Paritätstest Fremdfarben **und** Re-Bake als durabler Job mit Status statt Stub.

**Leitentscheidung:** Wenn nur ein Ziel für die nächste Etappe gilt, dann dieses: *Ein Agent baut eine kleine Site, ein Mensch korrigiert sie im echten Editor, Preview und Review zeigen belastbare Diffs, ein Klick veröffentlicht sie über einen echten Deploy-Adapter, und ein Rollback funktioniert.*

**Verhältnis zu Teil II:** Die Referenz-Transfer-Strecke (E24–E27) hat eigene, parallel startbare Arbeitspakete (§15.2). Empfohlene Reihenfolge: §9 #1–#4 zuerst (Fundament: Baseline, E1-Fix, Agent-Fence/MCP-Vertrag, Undo-Preconditions); danach parallel §15.2 #1–#3 (Referenz-Dokumente, Bulk-Import, Screenshots/Specimens) und §9 #5–#10; E25/E26 folgen nach E5/E15.

---

# Teil II — Referenz-Transfer, Anti-Slop & Editor-Tiefe (Fortsetzung)

> Dieser Teil führt den Kern des Fortsetzungs-Auftrags aus: **Referenz-Menü mit Vorschaubild und `design.md`**, **„Redesign der Seite xy im Stile von yz"** per Agent **und** Editor, **keine Baukasten-/KI-Slop-Seiten**, moderne UI. Er ergänzt die Abschnitte 1–9 (Epics E1–E23) um die Epics **E24–E27** und die Lücken **R1–R14**. Alle Behauptungen mit Datei-/Zeilenbelegen wurden am Arbeitsbaum bzw. an der Sammlung `C:\Users\adini\projects\Referenzsites` verifiziert (§15.3).

## 10. Referenz-Bibliothek 2.0 & Design-Transfer (Kernauftrag)

### 10.0 Der Kernauftrag in drei Sätzen

1. **Referenz rein:** Der Mensch legt Referenzseiten mit Vorschaubild und `design.md` an — einzeln, per URL-Analyse oder als Ordner-Import (die vorhandene Sammlung).
2. **Agent raus:** Der Agent liest Referenz + Zielseite und baut auf Zuruf ein Redesign im Stil der Referenz — als prüfbarer Draft, nicht als Chat-Antwort.
3. **Qualität als System:** Referenz-Treue, Design-Score und Anti-Slop-Gates verhindern, dass dabei Baukasten- oder KI-Slop-Seiten entstehen.

Der entscheidende Unterschied zu Framer/Webflow: Der „Redesign im Stil von …"-Auftrag wird **nicht** an einen externen Coding-Assistenten als Prompt delegiert (so wie heute der Brief), sondern läuft durch **Senifys eigene kanonische Mutationen** — mit Undo, Audit, Review, Paritäts-Tor und Rollback. Der Brief wird zum **Maschinenvertrag**; die Referenz-Bibliothek wird zur Design-Quelle.

### 10.1 Was heute schon steht (verifiziert am Arbeitsbaum)

Das Referenz-System ist kein Entwurf, sondern gebaut (T14, Taste-Vault-Portierung). Belegt:

| Baustein | Beleg | Stand |
|---|---|---|
| Analyse-Pipeline: Governance → Capture → Extraktion → Analyse → Profil, als Job mit Retry/Backoff | `references-lifecycle.ts:40-42`, `:105-120`; `db.ts:407-423` | ✅ |
| Evidenz-Stufen `confirmed`/`observed`/`inferred`, nie hochgestuft | `types.ts:592-594`; `references-evidence.ts:12-31` | ✅ |
| Profil: Tokens (Farbe/Typo/Familien/Space/Radius/Shadow), Breakpoints, Custom-Properties, Motion-Rezepte (Preset-Mapping), Surfaces, Libraries, Assets (inkl. `identityRisk`), Components, Familien, Vokabular, Regeln (`constants`/`never`), `styleBrief`, Guardrails, `reduced` | `types.ts:673-696` | ✅ |
| Manuelle Referenz (Bild-Upload bis 20 MB, PNG/JPEG/WebP, Snapshot, kein Analyseprofil) | `references-library.ts:16-18, 126-187`; `references-contract.ts:16-17, 375-394` | ✅ |
| Sammlungen (`kind: collection\|style`) mit `deployFor`, Vokabular, `risk`, `accent`, `imageStyle`, `recognize`, `examples`, `warning` | `types.ts:721-753`; `references-contract.ts:293-345` | ✅ |
| Stil-Katalog: **18 Familien** der modernen Web, einmalig geseedet, nie überschrieben | `references-styles.ts:1-34`; `references-library.ts:197-225` | ✅ |
| Briefs: Einzel-, Sammel-, Sammlungs- und Stil-Brief + Bild-Prompt; Haus-DNA/Projekt-Notizen | `references-brief.ts:141-277`; `types.ts:920-938` | ✅ |
| Projekt-Zuordnung **je Skala** (`color`/`type`/`motion`/`rest`) + Theme-Entwurf + Roundtrip-Verifikation | `types.ts:596-598, 879-887`; `references-theme.ts`; `tools.ts:1286-1315` | ✅ |
| Weiche Referenz-Treue-Hinweise in Submit/Publish (Typobasis ±25 %, Brand-Distanz > 90, Motion-Dauer ×0,5–2) | `references-analyze.ts:562-619`; `lifecycle.ts:454` | ✅ |
| Schutzregeln: Marken-Assets **hard**; Foto-Übernahme, Font-Lizenz, Original-Copy, Nähe-Warnung **soft** | `references-analyze.ts:499-559` | ✅ |
| UI: Galerie mit Karten + Vorschaubild, Sammlungs-Sidebar, Detail-Dialog (Brief, Bild-Prompt, Tokens), Upload-Dialog, Vergleich (bis 3), Stil-Führer, Präferenzen | `app.js:500, 1566, 1967, 2431, 2684-2891` | ✅ |
| MCP: 8 Referenz-Tools (`analyze_reference`, `list_references`, `get_reference`, `apply_reference`, `list_reference_collections`, `create_reference_collection`, `assign_reference_to_collection`, `get_reference_brief`) | `tools.ts:1215-1464` | ✅ |
| DB: `design_references`, `reference_profiles`, `reference_jobs`, `reference_assignments`, `reference_collections`, `reference_settings` | `db.ts:373-488` | ✅ |
| Die Editor-Designsprache selbst stammt aus `design.md` („precious-board") — das Muster ist also bereits produktiv | `packages/editor/src/ui/tokens.ts:18-35`; `packages/tokens/src/default-theme.ts:4-16` | ✅ |

**Die Blaupausen für den Workflow liegen bereits im Repo:**

- `Repos/taste-vault/skills/reference-to-design/` — „**Three directions → choose one → three variations → refine**"; Direction Cards (Evidence / Carry over / Invent / Avoid repeating / Build scope); Prüfung „Family resemblance vs. Independence"; **Design-Record** pro Projekt („brief, inspected sources, direction cards, asset prompts/paths, chosen direction, meaningful revisions, verification results").
- `Repos/site-clone/skills/remix-site/` — tokenize → re-skin → **3 Richtungen (subtle/medium/big)** → Live-Galerie → Tweak-Panel; Pixel-Diff-QA („mean 0.00 %"); Kern-These: „Without a measure → build → diff → fix loop, 1:1 is a vibe, not a fact." Die Evidenz-Tags (CONFIRMED/OBSERVED/INFERRED) hat Senify bereits übernommen.

### 10.2 Die Datenlage der Sammlung `C:\Users\adini\projects\Referenzsites` (geprüft 19.09.)

| Kennzahl | Wert |
|---|---|
| Ordner gesamt | **688** |
| vollständig (`info.md` + `design.md` + `design-components.md` + `design-guidelines.md`) | **678** |
| unvollständig | 10 (`.firecrawl`, `tools` sowie 8 Templates ohne `design.md`) |
| README-Index | 240 Templates (Framer Marketplace, Live-Scroll-Positionen, Stand 18.09.2026); die Sammlung ist darüber hinaus gewachsen |
| Dokument-Format | `design.md` (Token-Referenz: Colors, Typography, Shape, Elevation, Interaction States, Layout, Motion, Icons, `sys.*`-Token-Block), `design-components.md` (Komponenten-Specs), `design-guidelines.md` (A11y + Do's/Don'ts), `info.md` (Name, Kategorie, Ersteller, Live-URL, Remix-Link) |
| Bild-Format | `hero-desktop.png` 1920×1080 · `hero-mobile.png` 360×800 |
| Generatoren | `Referenzsites/tools/` — `gen_design_docs.py` (146 KB), `gen_info_docs.py`, `color_extract.py`, `fetch_templates.py`, `gen_readme_tables.py`, `runbook-page11plus.md` |

**Konsequenz:** Für den Import existiert ein konsistentes, maschinenlesbares Format; es fehlt nur der Weg in die Bibliothek. Die 8 unvollständigen Ordner sind der Testfall für den Fehlerbericht des Imports (kein stilles Überspringen).

### 10.3 Der Zielworkflow (Reise F — Agent, Reise G — Mensch)

**Reise F — „Redesign der Seite xy im Stile von yz" (Agent, per MCP):**

```
1. Referenz liegt bereit        → list_references / get_reference (Profil + Dokumente + Screenshots)
2. Ziel lesen                   → get_page (Struktur, Inhalte, Assets, Theme) + get_nodes
3. Plan (read-only)             → plan_redesign: 3 Direction Cards, Sektions-Mapping,
                                  Token-Delta, Copy-Regeln, Asset-Plan, Risiken (Marken/Lizenz)
4. Richtung wählen              → Mensch wählt (oder Agent begründet die Wahl)
5. Bauen                        → apply_redesign: neue Draft-Revision, sektionsweise Mutationen,
                                  Theme-Delta als Draft; niemals am aktiven Release
6. Verifizieren                 → design_report (Score + Findings), Visual-Diff Referenz↔Ergebnis,
                                  adherence, Hard-Checks
7. Review                       → submit_for_review (Diff + Score + Referenz-Herkunft im Record)
8. Publish                      → publish_release (Paritäts-Tor, Hard-Gates)
```

**Reise G — dasselbe im Editor (Mensch):**

```
Referenz wählen → „Redesign"-Modus → 3 Richtungen als Vorschau (Side-by-side) → Richtung übernehmen
→ Draft wird geöffnet → Inspector für Feinjustage (Tokens, Layout, Motion)
→ Design-Score-Panel live → Review → Publish
```

**Design-Record (neu):** Jedes Redesign hinterlässt einen leichten, versionierten Record am Draft/Review/Release: Brief, inspizierte Referenzen, Direction Cards, gewählte Richtung, Asset-Prompts/-Pfade, Verifikationsergebnisse. Damit ist nachvollziehbar, **warum** eine Seite so aussieht — nicht nur, wie sie aussieht. (Deckt L14/R14; nutzt die Review-/Preview-Infrastruktur aus `lifecycle.ts:440-554`.)

**Verhältnis zu bestehenden Epics:** E23 (Design-Varianten & Adversarial Review) liefert den Varianten-Baum und die Kritiker/Patcher-Mechanik; E25 nutzt ihn für die „3 Richtungen", kann aber ohne ihn starten (Richtungen als Preview-Snapshots). E12 liefert Jobs/Status für lange Redesign-Läufe; E21 (Permission Gate) sichert riskante Schritte (Publish, Delete) ab.

### 10.4 Lücken R1–R14 (priorisiert)

Die R-Lücken betreffen die Referenz-/Design-Strecke (Teil II) und ergänzen die Plattform-Lücken L1–L44 aus Teil I; wo sich Themen berühren (z. B. R12 ↔ L12 MCP-Parität, R7 ↔ Visual-Diff-Bedarf), gilt hier die bibliotheks- bzw. design-spezifische Fassung.

| # | Lücke | Beleg | Auswirkung | Empfehlung |
|---|---|---|---|---|
| **R1** | **`design.md` & Co. fehlen am Referenz-Modell.** Die Referenz kennt nur `note` (≤ 1000 Zeichen), Vokabular, Rezept, Komposition, Familie — keine Dokumente. | `types.ts:777-805`; `references-contract.ts:349-371` | Die 678 Dokumentensätze können nicht abgelegt, angezeigt oder an den Agenten gegeben werden; das Kernfeature „Vorschaubild + design.md" fehlt zur Hälfte. | `reference_documents` (kind `design`/`components`/`guidelines`/`notes`), versioniert; Detail-Renderer; MCP-Lesetool. → **E24** |
| **R2** | **Kein Bulk-Import.** Nur Einzel-Upload und URL-Analyse. | `http.ts` (manuell/analyze); UI nur Einzel-Upload `app.js:1202-1306` | 678 Ordner sind Handarbeit; die Sammlung bleibt außerhalb von Senify. | CLI + MCP `import_references` (Ordner: `info.md`→Metadaten, `design*.md`→Dokumente, `hero-*.png`→Screenshots, Kategorie→Sammlung, Hash-Dedupe, idempotent). → **E24** |
| **R3** | **Kein Screenshot-Slot-Modell.** Snapshots kennen nur `fullpage`/`section`/`motion`. | `types.ts:698-710` | `hero-desktop`/`hero-mobile` (das Vorschaubild-Format der Sammlung) haben keinen Platz; die Karte zeigt nur „irgendeinen" Snapshot. | Slots `hero-desktop`/`hero-mobile`/`fullpage`/`motion`; Karte zeigt bewusst den Hero. → **E24** |
| **R4** | **Kein Redesign-Workflow.** `apply_reference` leitet nur einen Theme-Entwurf ab. | `tools.ts:1286-1315`; `references-theme.ts` | Der Kernauftrag („Seite xy im Stil von yz") ist nicht als Prozess abbildbar; Agenten improvisieren. | `plan_redesign` (read-only) + `apply_redesign` (Draft-Revision, sektionsweise, Undo-fähig). → **E25** |
| **R5** | **Der Brief adressiert fremde Coding-Assistenten, nicht Senify.** Zitat: „Build [describe the website or product] … Build real responsive HTML text, controls, and components … Verify the result in a browser." | `references-brief.ts:27-31, 46-47` | Der wertvolle Brief landet außerhalb des Systems; Senifys Mutationen, Registry und Guardrails werden umgangen. | Brief um **Maschinenvertrag** ergänzen (Sektions-Mapping, Token-Delta, Regeln als prüfbare Findings) und an `plan_redesign`/`apply_redesign` binden. → **E25** |
| **R6** | **Referenz-Treue ist nur weich und nur Theme-bezogen.** Geprüft werden Typobasis, Brand-Distanz, Motion-Dauer — nicht die gebauten Seiten/Sektionen. | `references-analyze.ts:562-619` | Eine Seite kann das Theme „treffen" und trotzdem Slop sein (Karten, Abstände, Bilder). | Design-DNA + Seiten-/Sektions-Checks; `never`-Regeln hart für Agenten. → **E26** |
| **R7** | **Kein Visual-Diff Referenz ↔ Ergebnis.** Der Review-Diff vergleicht Release↔Preview, nicht Referenz↔Ergebnis. | `lifecycle.ts:510-554` | „Sieht aus wie die Referenz" ist Geschmack, kein Beweis. | Referenz-Screenshots als Diff-Basis, 3 Breakpoints, Heatmap + Kennzahl. → **E26** |
| **R8** | **Kein Design-Score.** `runChecks` kennt Links/Alt/Assets/Kontrast/JSON-LD/Motion/Adherence — keine Gestalt-Metriken. | `checks.ts:301-364` | Slop ist nicht messbar und damit nicht abnahmefähig. | Score aus Typo-Skala, Spacing-Rhythmus, Farb-Disziplin, Hierarchie, Varianz, Assets, Motion, A11y. → **E26** |
| **R9** | **Keine Design-DNA pro Projekt.** Die DNA lebt global in den Brief-Einstellungen; Zuordnungen kennen nur Skalen. | `types.ts:879-887, 920-938` | „Nie Gradienten, immer 8px-Raster" ist nirgends durchsetzbar. | `designContract` am Projekt (constants/never/vocabulary), im Schreibpfad geprüft. → **E26** |
| **R10** | **Referenz-Assets bleiben Inventar.** `identityRisk` warnt, aber Fonts/Bilder/Logos haben keinen Weg ins Theme/Asset-System. | `types.ts:646-651`; `references-analyze.ts:505-525` | Bildrezepte erzeugen keine Assets; Fonts werden nicht nutzbar; Marken werden korrekt verboten, aber Alternativen fehlen. | Font-Mapping (Open-Font-Paare), Bildrezept→Asset-Pipeline, Logo-Verbot mit Ersatz-Hinweis. → **E24/E27** |
| **R11** | **Stil-Familien ohne visuelle Specimens.** 18 Familien als Text; die Vorlage (taste-vault `specimens.js`/`specimens.css`) hat Bilder. | `references-styles.ts:24-34`; `Repos/taste-vault/specimens.*` | Der Agent wählt „Familien" blind; der Mensch sieht keine Beispiele. | Specimen-Previews je Familie (lizenzsauber), im Stil-Führer + MCP. → **E24** |
| **R12** | **MCP-Lücken der Bibliothek.** 8 Tools; es fehlen Anlegen/Bearbeiten/Löschen (manuell), Profil-Edit, Einstellungen/DNA, Tick, Unassign, Dokumente, Redesign. | `tools.ts:1215-1464` vs. `http.ts`-Routen | Ein Agent kann die Bibliothek nicht pflegen — nur lesen und zuweisen. | Parität herstellen (Matrix §10.6). → **E24** |
| **R13** | **Kein Sammlungs-Deploy.** Eine Sammlung ist Beschreibung, kein anwendbarer Stil; nur Einzel-Referenzen werden zugewiesen. | `references-contract.ts:251-269` | „Ganze Richtung anwenden" (mehrere Referenzen als Set) fehlt. | `apply_reference`/`apply_redesign` um Set-/Sammlungs-Semantik erweitern (der Brief kennt den Set-Fall bereits). → **E25** |
| **R14** | **Kein Design-Record.** Reviews/Releases dokumentieren Struktur-Diffs, nicht die Design-Herkunft. | `lifecycle.ts:480-507` | Nach drei Monaten ist unbekannt, welche Referenz welche Entscheidung trug. | Leichter, versionierter Record am Draft/Review/Release (Skill-Vorgabe). → **E25** |

### 10.5 Epics E24–E27

#### E24 · Referenz-Bibliothek 2.0 (Dokumente, Import, MCP-Parität) — **P0/P1, M**

**Ziel:** Der Menüpunkt „Referenzen" wird zum vollwertigen Arbeitsmittel: Dokumente, Bilder, Import, MCP-Parität.
**Umfang:**
1. **`reference_documents`:** kind `design` | `components` | `guidelines` | `notes`, Markdown (Größenlimit, Sanitizing wie Doku), versioniert (append-only Revisionen), Routen `GET/PUT /api/references/:id/documents/:kind`, UI-Tab im Detail, MCP `get_reference_docs` + `update_reference_doc`.
2. **Bulk-Import:** CLI `pnpm senify references import <dir>` + MCP `import_references` + UI-Import-Dialog. Mapping: `info.md`→Name/Kategorie/Ersteller/URL; `design*.md`→Dokumente; `hero-desktop.png`/`hero-mobile.png`→Screenshot-Slots; Kategorie→Sammlung (anlegen bei Bedarf); Hash-Dedupe; idempotenter Re-Import; **Fehlerbericht statt stillem Überspringen** (die 8 unvollständigen Template-Ordner sind der Testfall; `.firecrawl`/`tools` werden ignoriert).
3. **Screenshot-Slots** (`hero-desktop`, `hero-mobile`, `fullpage`, `motion`) am Modell, Karten-/Detail-Auswahl, Größen-/Formatvalidierung.
4. **Specimens:** visuelle Vorschau je Stil-Familie (18), im Stil-Führer und als MCP-Metadatum (Vorlage: `Repos/taste-vault/specimens.*`).
5. **MCP-Parität:** `create_manual_reference`, `update_reference`, `delete_reference`, `edit_reference_profile`, `get/set_reference_settings` (DNA/Präferenzen), `unassign_reference`, `reference_tick`; dazu die Workflow-Hygiene aus E4 Scheibe 0 (Annotations, Pagination, Outputs).
6. **Suche/Dedupe** der Bibliothek (FTS über Name, Notiz, Vokabular, Dokumente; Dedupe ähnlicher Referenzen) — verzahnt mit der Vault-Ergänzung in E13 (L42).
**Akzeptanz:** 688 Ordner in einem Lauf verarbeitet (678 vollständig importiert, 10 unvollständige im Fehlerbericht), idempotent; `design.md` im Detail lesbar und per MCP abrufbar; Karte zeigt das Hero-Bild; keine Duplikate bei Re-Import; die 18 Familien haben sichtbare Specimens; alle Bibliotheks-Routen haben einen bewussten Tool-Status.
**Belege:** `types.ts:777-805`; `references-contract.ts:349-394`; `db.ts:373-488`; `tools.ts:1215-1464`; `Referenzsites/README.md` + `tools/`; `Repos/taste-vault/specimens.*`.
**Abhängig:** E1 (stabile IDs), E3 (Author-Herkunft), E4 S0 (MCP-Vertrag). **Blockiert:** E25, E27. **Größe:** M.

#### E25 · Redesign-Workflow („im Stil von …", Agent + Editor) — **P0, L**

**Ziel:** „Redesign Seite xy im Stil von yz" ist ein geführter, vergleichbarer, umkehrbarer Prozess — auf Zuruf per MCP **und** per Editor.
**Umfang:**
1. **`plan_redesign`** (read-only): Eingabe `siteId`/`pageId` (oder Seite+`collectionId`), `referenceIds`/`collectionId`, optional `scope: page|section|site`. Ausgabe: **3 Direction Cards** (Evidence / Carry over / Invent / Avoid repeating / Build scope — Muster der `reference-to-design`-Skill), **Sektions-Mapping** (bestehende Sektionen → Ziel-Komposition, mit Begründung), **Token-Delta**, **Copy-Regeln** (Original-Copy-Verbot, Längenkorridor ±20 % Headline), **Asset-Plan** (Bildrezepte, keine Marken), **Risiken** (Lizenz-Fonts, Marken-Assets, Nähe-Warnung).
2. **`apply_redesign`:** schreibt in eine **neue Draft-Revision** (Seite duplizieren oder Draft-Ersetzung nach Wahl), sektionsweise Mutationen über die kanonische API, Theme-Delta als Draft, **niemals** am aktiven Release; ein Undo-Schritt je Richtungsübernahme; Scope `site` erzeugt einen Mehrseiten-Draft mit gemeinsamer Design-DNA.
3. **Design-Record** (R14): Brief, Referenzen, Richtungen, gewählte Richtung, Diffs, Verifikation — am Draft, im Review sichtbar, im Release mitgeführt.
4. **Editor-Modus „Redesign":** Referenz wählen → 3 Richtungen als Vorschau (Side-by-side) → übernehmen (Draft) → Score-Panel live; Zustand überlebt Reload (E5-Session).
5. **Sammlungs-/Set-Deploy** (R13): mehrere Referenzen als Set anwenden (der Brief kennt den Set-Fall bereits, `references-brief.ts:39-41`).
6. **Skill + Doku:** `senify-referenz-redesign`-Skill (Thin Router, ruft plan/apply auf), Portal-Guide, Beispiel-Journey; verzahnt mit E4 Scheibe 2.
**Akzeptanz:** Ein Agent führt Reise F vollständig per MCP aus; ein Mensch führt Reise G vollständig im Editor aus; kein Schritt verändert den aktiven Release; jede Richtung ist vergleichbar und einzeln umkehrbar; der Design-Record ist im Review und Release vorhanden; ein Redesign über 3 Seiten teilt eine Design-DNA.
**Belege:** `references-brief.ts:141-277`; `references-theme.ts`; `tools.ts:1286-1315`; `lifecycle.ts:440-554`; `Repos/taste-vault/skills/reference-to-design/*`; `Repos/site-clone/skills/remix-site/*` (3 Richtungen, Tweak-Panel, Pixel-Diff).
**Abhängig:** E24, E5 (Editor-Session), E2 (Release-Integrität). **Blockiert:** E26-Verifikation. **Größe:** L.

#### E26 · Design-Qualität & Anti-Slop — **P0, M**

**Ziel:** „Keine Baukasten-/KI-Slop-Seiten" ist messbar, sichtbar und — wo nötig — blockierend.
**Umfang:**
1. **Design-DNA pro Projekt** (`designContract`: `constants[]`, `never[]`, `vocabulary[]`, Quelle: zugewiesene Referenzen oder manuell). Im Schreibpfad: Agenten **hart** (Muster `hardGuardrailsForTree`, `guardrails.ts:25`), Menschen als Warnung mit Erklärung.
2. **Design-Score** (0–100) aus acht Dimensionen: Typo-Skala, Spacing-Rhythmus, Farb-Disziplin, Hierarchie, Sektions-Varianz, Asset-Behandlung, Motion-Kohärenz, A11y-Basis. Reproduzierbar, maschinenlesbar (`get_design_report`).
3. **Slop-Heuristiken S1–S12** (§11.3) als benannte Findings mit Fundstelle (Node-/Sektions-ID) und Vorschlag — Format `CheckIssue` (`checks.ts`).
4. **Visual-Diff Referenz ↔ Ergebnis** im Review: 3 Breakpoints, Kennzahl + Heatmap, Referenz-Screenshots als Basis (Muster: site-clone-Pixel-Diff).
5. **Gates:** explizite `never`-Regeln und Token-Pflicht (Ticket 18) hart; Score-Schwelle je Site-Profil (clean/standard/showcase) konfigurierbar; Review zeigt Score + Findings; Publish blockiert harte Verstöße.
**Akzeptanz:** Eine absichtlich generische Seite fällt mit Score < Schwelle und benannten Findings durch; eine referenz-treue Seite passiert; dieselbe Seite erzeugt denselben Score; jedes Finding nennt Stelle und Vorschlag; der Diff gegen die Referenz ist im Review sichtbar.
**Belege:** `checks.ts:301-364`; `references-analyze.ts:499-619`; `lifecycle.ts:440-508`; `guardrails.ts:25`; `Repos/site-clone` (Pixel-Diff-These); `Repos/taste-vault` (DNA `constants`/`never`).
**Abhängig:** E24, E25, E15 (Checks-Ausbau). **Größe:** M.

#### E27 · Design-System-Import (`design.md` → Theme) — **P1, M**

**Ziel:** Aus einer Referenz wird in einem Schritt ein belastbarer Theme-Entwurf — die `design.md`-Tabellen (Colors, Typography, Shape, Elevation, Motion) werden zu Tokens.
**Umfang:** Parser für das Dokument-Format der Sammlung (Tabellen + `sys.*`-Token-Block); Mapping auf das Senify-Token-Modell mit Evidenz je Wert; Theme-Draft + Roundtrip-Verifikation (`verifyThemeRoundTrip`); Konfliktanzeige gegen bestehende Tokens; UI „Als Theme-Entwurf übernehmen"; MCP `import_design_system`; unvollständige Dokumente → `reduced`-Kennzeichnung, kein Wert ohne Quelle; Font-Zuordnung auf Open-Font-Paare (R10).
**Akzeptanz:** `syntiq/design.md` ergibt einen vollständigen Theme-Entwurf mit allen belegten Rollen; fehlende Angaben sind als Lücken markiert; kein Token ohne Quelle; Roundtrip grün.
**Belege:** `Referenzsites/*/design.md` (z. B. `syntiq/design.md`); `references-theme.ts`; `packages/tokens`; `packages/editor/src/ui/tokens.ts:18-35` (die Editor-Sprache entstand bereits so).
**Abhängig:** E24 (Dokumente). **Größe:** M.

### 10.6 MCP-Tool-Matrix der Referenz-Bibliothek (Ist → Soll)

| Funktion | HTTP-Route | MCP heute | MCP Soll (E24/E25) |
|---|---|---|---|
| Referenz analysieren (URL/Snapshot) | `POST /api/references` | `analyze_reference` | — |
| Referenz manuell anlegen (Bild) | `POST /api/references/manual` | ❌ | `create_manual_reference` |
| Referenzen listen/lesen | `GET /api/references[/:id]` | `list_references`, `get_reference` | + Dokumente im Payload |
| Referenz bearbeiten/löschen | `PATCH/DELETE /api/references/:id` | ❌ | `update_reference`, `delete_reference` |
| Profil-Nachbearbeitung (Revisionen) | `POST /api/references/:id/profile` | ❌ | `edit_reference_profile` |
| Dokumente (`design.md` …) | ❌ (neu) | ❌ | `get_reference_docs`, `update_reference_doc` |
| Einstellungen (DNA/Präferenzen) | `GET/PATCH /api/settings/references` | ❌ | `get_reference_settings`, `set_reference_settings` |
| Jobs ausführen (Tick) | `POST /api/references/tick` | ❌ | `reference_tick` |
| Zuweisen / lösen | `POST/DELETE /api/sites/:id/references` | `apply_reference` (nur zuweisen) | + `unassign_reference` |
| Briefe (Einzel/Set/Sammlung/Stil) | `GET/POST /api/references…/brief` | `get_reference_brief` | — |
| Sammlungen CRUD | `GET/POST/PATCH/DELETE /api/reference-collections` | `list_reference_collections`, `create_reference_collection` | + `update_reference_collection`, `delete_reference_collection` |
| Bulk-Import | ❌ (neu) | ❌ | `import_references` |
| Redesign-Plan / -Anwendung | ❌ (neu) | ❌ | `plan_redesign`, `apply_redesign` |
| Design-Report | ❌ (neu) | ❌ | `get_design_report` |

**Regel (aus E4 übernommen):** Jede Route in `http.ts` hat einen bewussten Tool- oder Operator-Status; die Matrix liegt im Repo und wird getestet.

---

## 11. Anti-Slop: das System gegen Baukasten- und KI-Optik

### 11.1 Warum KI-Seiten generisch wirken (Diagnose in sieben Signaturen)

| # | Signatur | Wie sie entsteht | Woran man sie erkennt |
|---|---|---|---|
| 1 | **Einheitsbrei-Layout** | Modelle reproduzieren den häufigsten Trainings-Mittelwert: zentrierter Hero + drei Feature-Karten + Logo-Reihe + CTA-Band. | Jede zweite Sektion ist ein Card-Grid; keine Asymmetrie, kein Größen-Sprung, kein Whitespace-Risiko. |
| 2 | **Farb-Inflation** | Jede Sektion bekommt „ihre" Farbe; Gradient als Universal-Deko. | > 6 distinkte Farben außerhalb der Tokens; Verläufe ohne Funktion. |
| 3 | **Typo ohne Hierarchie** | Eine Größe für alles, System-Font, selten Display-Typografie. | H1/H2-Verhältnis < 1,4; keine Tracking-/Weight-Kontraste; Zeilenlängen ohne Regel. |
| 4 | **Spacing-Willkür** | Abstände werden „nach Gefühl" gesetzt. | Kein 4/8-Raster; gleiche Paddings überall; keine Rhythmus-Unterschiede zwischen Sektionen. |
| 5 | **Stock-Optik & Emoji-Ikonografie** | Platzhalterbilder und Emojis statt eigener Bildsprache. | Generische Business-Fotos; Emoji als Icon-Ersatz; Bildrezepte ohne Motiv. |
| 6 | **Copy-Slop** | Superlative und Floskeln („Empower your business", „Ihr Unternehmen"). | Keine Produktsubstanz, keine Zahlen, keine Stimme; Textlängen passen nicht zum Layout. |
| 7 | **Motion-Slop** | Ein Effekt für alles: fade-up bei jedem Scroll. | > 70 % der Motion-Einträge mit gleichem Preset/Dauer/Easing; Bewegung ohne Hierarchie. |

**Warum das strukturell passiert:** Ein Modell ohne Referenz, ohne Vertrag und ohne Messung optimiert auf „plausibel aussehend" — und plausibel heißt: der Durchschnitt seiner Trainingsdaten. Genau dagegen hat Senify die besseren Voraussetzungen als jedes Prompt-Tool: Registry (nur kuratierte Bausteine), Tokens (statt Hex), Motion-Presets (statt Willkür), Referenz-Pipeline (statt Stimmung) — es fehlt nur die **Durchsetzung und Messung**.

### 11.2 Die Gegenmittel (was Senify strukturell kann, sobald E24–E26 stehen)

1. **Referenz als Beweis statt als Stimmung:** Familie + Vokabular + Bildrezept + Evidenz-Stufen; der Agent muss in Direction Cards sagen, was er übernimmt und was er erfindet (E25).
2. **Design-DNA pro Projekt:** `constants` (immer) und `never` (nie) sind prüfbare Regeln, nicht Prosa — im Agenten-Schreibpfad hart, für Menschen erklärend (Muster `hardGuardrailsForTree`, `guardrails.ts:25`).
3. **Archetypen + erzwungene Variation:** mindestens drei Merkmale müssen bewusst abweichen (Palette-Mood, Type-Pairing, Hero-Treatment, Density, Motion-Personality, Surface) — wörtlich aus der vorhandenen `proximity-warning` (`references-analyze.ts:548-557`), jetzt prüfbar gemacht.
4. **Echte Assets:** Bildrezepte → eigene Motive (E24/E27); Marken-Assets hart verboten (existiert, `references-analyze.ts:505-516`); Fotos nie 1:1 (existiert, soft).
5. **Copy-Regeln:** keine Originaltexte, Längenkorridor, keine erfundenen Claims/Logos/Zahlen (aus der Skill-Vorgabe; als Checks umsetzbar).
6. **Motion-Kohärenz:** Site-Profil (`clean`/`standard`/`showcase`) + Monotonie-Check S8.
7. **Sichtbare Referenz-Nähe:** Visual-Diff und Score machen „nahe an der Referenz" und „generisch" zu Zahlen (E26).

### 11.3 Messbare Slop-Heuristiken S1–S12

Jede Heuristik liefert `code`, `severity`, `message`, `suggestion` und **Fundstelle** (Node-/Sektions-ID, Sektion, Pfad) im Format von `CheckIssue` (`checks.ts`) — Review, MCP und Editor sprechen dieselbe Sprache.

| # | Heuristik | Messvorschrift (Vorschlag) | Schwere |
|---|---|---|---|
| S1 | Sektions-Monotonie | > 2 aufeinanderfolgende Sektionen mit gleichem Layout-Archetyp | soft |
| S2 | Card-Only | > 60 % der Sektionen nutzen dasselbe Container-Muster (z. B. Card-Grid) | soft |
| S3 | Farb-Inflation | > 6 distinkte Farbwerte außerhalb der Tokens; > 1 Gradient ohne Funktion | soft; hart bei DNA-`never` |
| S4 | Font-Inflation | > 2 Font-Familien ohne Systembegründung | soft |
| S5 | Raster-Treue | > 10 % der Abstände außerhalb der 4/8-Skala (±1 px) | soft |
| S6 | Typo-Hierarchie | H1/H2 < 1,4 oder H2/Body < 1,6 | soft |
| S7 | Spacing-Uniformität | Standardabweichung der Sektions-Paddings unter Schwellwert (alles gleich) | soft |
| S8 | Motion-Monotonie | > 70 % der Motion-Einträge mit identischem Preset | soft |
| S9 | Zentrier-Slop | Hero zentriert **und** 3 Cards **und** Logo-Reihe **und** CTA-Band | soft (Kombination) |
| S10 | Emoji-Ikonografie | Emoji in Content-/Icon-Positionen | soft |
| S11 | Platzhalter-Copy | „Lorem", „Ihr Unternehmen", „Beispieltext", leere Alt-Texte | hart im Publish (Alt existiert bereits) |
| S12 | Kontrast & Alt | bestehende Checks (WCAG, Alt, Links, Assets) | hart (existiert, `checks.ts:301-364`) |

### 11.4 Der Design-Score (0–100)

| Dimension | Gewicht | Messung (Kurz) |
|---|---|---|
| Typo-Skala | 15 | Verhältnisse der Rollen (H1/H2/Body), Tracking-/Weight-Kontraste, Zeilenlängen |
| Spacing-Rhythmus | 15 | Raster-Treue, Varianz zwischen Sektionen, Weißraum-Anteil |
| Farb-Disziplin | 15 | Anzahl/Funktionen der Farben, Token-Anteil, Kontrast |
| Hierarchie | 15 | Fokus pro Sektion, Blickführung, CTA-Sichtbarkeit |
| Sektions-Varianz | 15 | Archetyp-Wechsel, Vermeidung von S1/S2/S9 |
| Asset-Behandlung | 10 | Bildrezepte, eigene Motive, Alt/Formate, keine Marken |
| Motion-Kohärenz | 10 | Profil-Treue, Preset-Varianz, Reduced-Motion |
| A11y-Basis | 5 | Kontrast, Fokus, Struktur (Deckung mit E15) |

**Schwellen (Vorschlag):** ≥ 80 grün · 60–79 Hinweis · < 60 Gate (abhängig vom Site-Profil; `showcase` strenger als `clean`). Der Score ist **reproduzierbar** (dieselbe Eingabe → derselbe Wert) und wird im Review, per MCP (`get_design_report`) und im Editor-Panel angezeigt. Der Visual-Diff gegen die Referenz liefert die zweite Kennzahl (abweichende Pixel je Breakpoint, Muster site-clone).

### 11.5 Einbau in den Prozess

1. **Schreibpfad:** `never`-Regeln und Token-Pflicht für Agenten hart (E26 + Ticket 18); für Menschen Warnung mit Vorschlag. Soft-Heuristiken laufen als Hinweis.
2. **Review:** Score + Findings + Visual-Diff gegen die Referenz; der Reviewer sieht, ob das Ergebnis die Richtung trifft.
3. **Publish:** harte Verstöße blockieren (bestehendes Gate-Muster); weiche erscheinen begründet.
4. **MCP:** `get_design_report` — Agenten können selbst nachbessern, bevor sie einreichen.

---

## 12. Editor-Tiefe: Control-Matrix & Interaktions-Soll („alles einstellbar")

### 12.1 Die Control-Matrix (Framer/Webflow-Abgleich)

Das Modell ist durch ADR-0005 offen; die Property-Tabelle beschreibt **Bedienelemente**, nicht Erlaubnisse (`widget-engine/src/css/properties.ts`; Layout-Gruppe mit 25 Einträgen, `styleGroups` entsperrt, unbekannte Properties werden durchgereicht, `canonicalStyleKey` löst Schreibweisen auf). Was fehlt, ist die **Fläche** (E6) — diese Matrix ist ihr Soll:

| Gruppe | Framer/Webflow-Standard | Modell heute | Control (Soll E6) | Prio |
|---|---|---|---|---|
| **Layout** | Display, Flex/Grid, Gap, Align/Justify, Wrap, Order | ✅ Compiler + Kaskade (Device/State/Class) | Panel „Layout" mit visuellen Presets + Freitext | P0 |
| **Position** | Absolute/Relative/Sticky/Fixed, Insets (T/R/B/L), Z-Index | ✅ offen | 4er-Inset-Feld, Position-Select | P0 |
| **Größe** | W/H, Min/Max, Aspect-Ratio, Fit | ✅ offen | W/H-Felder mit Einheit, Min/Max-Sektion | P0 |
| **Spacing** | Margin/Padding je Seite, Verknüpfung | ✅ offen | Box-Model-Control (Seiten-Toggle, Sync) | P0 |
| **Typografie** | Family, Size, Weight, Line-Height, Letter-Spacing, Align, Transform, Decoration, Color | ✅ offen | Typo-Gruppe + Token-Picker | P0 |
| **Fill/Background** | Color, Gradient (mehrstufig), Bild, Blend | ✅ offen | Farbwähler, Gradient-Editor, Bild-Referenz | P0 |
| **Border** | Width/Style/Color, Radius je Ecke | ✅ offen | Border-Gruppe, Radius-Sync | P0 |
| **Effects** | Mehrschicht-Shadow, Filter, Backdrop, Opacity | ✅ offen | Shadow-Stack-Editor, Filter-Liste | P1 |
| **Transform** | Translate/Scale/Rotate/Skew, Origin | ✅ offen | Transform-Gruppe mit Einheiten | P1 |
| **Transitions** | Property, Duration, Easing, Delay | ✅ offen (als CSS) | Transition-Builder mit Easing-Kurven | P1 |
| **States** | Hover/Focus/Active/Disabled, verschachtelt | ✅ 4 Pseudo-States (`cascade.ts`, `PREVIEW_STATES`) | State-Leiste je Feld, Forced-Preview | P0 |
| **Bedingungen** | Breakpoints, Container-Queries | ✅ Device-Overrides + `contextStyles` | Override-Signale (geerbt/lokal/gemischt), „Alle anzeigen" | P0 |
| **Custom** | Custom CSS je Element | ✅ `rawCss`/freie Properties | „Custom CSS"-Feld mit Grammatik-Feedback | P1 |
| **Interaktionen** | Trigger → Ziel → Aktion (Scroll/Hover/Click, Conditional) | Motion-Presets (24) + Trigger | Interactions-Tab (E10) über Presets | P1 |

### 12.2 Modell-Lücken unter der Control-Matrix (klein, aber nötig)

| # | Lücke | Beleg | Fix |
|---|---|---|---|
| C1 | Per-Property-Reset fehlt (ein Reset löscht den ganzen Breakpoint) | `apply.ts:663-681` (L2) | Property-weises `clearNodeProp` (E1) — Voraussetzung für jedes Override-UI |
| C2 | `hidden` je Breakpoint geht bei Migration verloren | `migration.ts:56-92` (L2) | `hiddenDevices` (E1) |
| C3 | Klassen-Existenz wird beim Zuweisen nicht geprüft | `apply.ts:605-618` (L5) | Existenzprüfung + Vorschlag (E3) |
| C4 | Style-Registry ohne Version-Lock; Rename bricht Referenzen | `store.ts:1597-1663`, `persist.ts:225-236` (L6) | `classIds` + Version (E1/L6) |
| C5 | Style-Copy/Paste zwischen Elementen fehlt | — | Clipboard-Format (Props + Style-Rules) im Editor (E6) |
| C6 | „Alle anzeigen" (3 Breakpoints nebeneinander) fehlt | `frames.ts:208-257` | E9 |
| C7 | Raster/Snap/Lineale fehlen | — | E8 (Overlay) |

### 12.3 Interaktionen: vom Preset zum Trigger→Ziel→Aktion-Modell

Heute: 24 Presets mit Intensity, RM-Pflicht, harten Guardrails (ADR-0006) — das deckt „Scroll-Reveal, Parallax, Stagger" ab. Framer-Niveau heißt zusätzlich: **Hover-/Click-Interaktionen, Conditional Playback, verschachtelte Trigger** („wenn Karte sichtbar → Bild skaliert → Text erscheint"). Der Pfad ist bewusst gestaffelt:

1. **Stufe 1 (E6/E10):** Micro-Interactions als **Transition-Presets** (Hover-Lift, Underline-Slide, Button-Press) — schreibt normale `:hover`-Regeln, kein neues Laufzeitmodell.
2. **Stufe 2 (E10):** Interactions-Tab (Trigger → Ziel → Aktion → Parameter) auf Preset-Basis; Guardrail-Erklärungen inline.
3. **Stufe 3 (M6, optional):** Scrub-/Timeline-Stufe (ADR-0006) — nur wenn der Bedarf belegt ist.

Damit bleibt die Regel erhalten: **Motion ist kuratiert und prüfbar**, nicht freie Keyframe-Bastelei.

---

## 13. Moderne UI: Design-Sprache, Dichte und Politur

### 13.1 Ist-Stand (verifiziert)

- **Die Haut existiert:** „Tiefwasser"-Palette mit Lime-Signal, Sora als Inhalts-Schrift, eingebettete Symbole (24px-Raster, 1.5px Strich), Tokens als Quelle (`packages/editor/src/ui/tokens.ts`, `skin.ts`; Belege: `tokens.ts:18-35`, `icons.ts:5`, `fonts.ts:10`).
- **Der Vertrag existiert:** `ui-plan.md`/`ui-design.md` mit Zustands- und Kontrastmatrix; `ui-preview/index.html` als Sollbild; Tests erzwingen Tokens, feste px-Größen, Verbote und Kontraste (`plan-tokens.test.ts`, `contrast.test.ts`).
- **Die Designsprache stammt aus `design.md`** (`.scratch/refs/precious-board/`) — dasselbe Muster, das E27 für Kunden-Referenzen produktiv macht.
- **Die Lücken (UI-Audit, §4.2):** Legacy-Palette leckt durch (Magenta/Sky/Violett, `styles.ts:22-31,337,369`); `:focus-visible`, `:active`, `color-scheme`, Scrollbars, Reduced-Motion fehlen teils; Lade-/Empty-States ohne nächste Aktion (L19); Explorer/Spotlight ohne volle Semantik (L16); Save-/Konflikt-UX uneinheitlich (L17). E16 schließt sie — dieser Abschnitt schärft, **wie** „modern" konkret aussieht.

### 13.2 Design-Sprache (Zielbild, verbindlich für E16)

**Prinzip:** Ruhige dunkle Werkbank, hohe Informationsdichte, ein Signal (Lime), keine Dekoration. Alles, was nicht Zustand, Struktur oder Aktion zeigt, ist wegzulassen.

| Ebene | Regel |
|---|---|
| **Farbe** | Nur Tiefwasser-Tokens; Lime ausschließlich für Auswahl/Fokus/Aktion; Rot nur für Fehler; keine Verläufe im Editor-Chrome. Kontrast: Text ≥ 4,5:1, UI-Kanten ≥ 3:1 (bestehender Vertrag). |
| **Typo** | Feste px-Größen (11/12/13/15/20); UI-Text 13/12, Labels 11 in Kapitälchen oder uppercase mit Tracking; Zahlen tabellarisch (Mono) in Feldern, Maßen, Zeitstempeln. |
| **Dichte** | Zeilen 28px, Felder 28px, Icons 16/20/24, Panel-Breiten 240/280/320, Abstände 4/8-Raster; Trefferflächen ≥ 24px (Touch ≥ 44px). |
| **Motion** | 120–200ms, `cubic-bezier(0.16, 1, 0.3, 1)`; nur Zustandswechsel, Panel-Öffnen, Einfügelinie, Toast; `prefers-reduced-motion` → ≤ 0,001s. Keine Dauer-Animationen im Chrome. |
| **Zustände** | Jede Komponente hat: rest · hover · active (scale 0,97) · focus-visible (2px Lime-Ring, nie entfernt) · disabled (38 %) · selected · loading (Skeleton/Spinner) · error (Text + Farbe, nie nur Farbe). |
| **Fokus & Tastatur** | Alles erreichbar, Fokus kehrt nach Dialogen/Menüs zurück; Spotlight/Tree mit `aria-activedescendant`/roving tabindex; Shortcut-Sheet (?) als Dialog. |
| **Ruhe** | Kein Layout-Sprung beim Laden (Skeletons mit Endmaßen), keine Toasts für Erfolgsfälle, die man sieht (nur für unsichtbare Aktionen wie Kopieren); Fehler erklären die nächste Aktion. |

### 13.3 Komponenten-Familie und Zustandsmatrix (aus `ui-preview` in den Editor)

| Komponente | Pflichtzustände | Besonderheit |
|---|---|---|
| Feld (Text/Zahl) | rest/hover/focus/disabled/error/geerbt | Einheiten-Suffix, Schrittgeber (Pfeile, Shift ×10), Token-Badge |
| Slider | rest/hover/focus/disabled | Zahlenfeld gekoppelt, Tastatur ±Schritt |
| Switch | on/off/focus/disabled | Sofortwirkung + Undo-Eintrag |
| Select/Menü | closed/open/hover/focus/disabled | Tastatur: Pfeile, Home/End, Enter, Esc; Fokus-Rückgabe |
| Farbwähler | rest/open/disabled | Tokens zuerst, Literal mit Warnung; Kontrast-Hinweis live |
| Box-Model-Control | rest/verknüpft/einzeln | Seiten-Toggle, Sync-Knopf, geerbte Werte kursiv |
| Dialog | open/closing/error | Esc, Fokus-Falle, Rückgabe; nie zwei Dialoge |
| Toast | enter/hold/exit | Max. 3, unten mittig, 2,6s (Muster `refsToast`) |
| Spotlight (Cmd+K) | idle/query/results/empty/loading | Dialog+Listbox-Semantik, Kürzel rechts, Fokus-Rückgabe |
| Panel/Toolbar | expanded/collapsed/pinned | Zustand überlebt Reload (E5-Session) |
| Tree (Explorer) | expanded/selected/hover/drop-valid/drop-invalid | `role=tree/treeitem`, virtualisiert (E7/E18) |
| Tabs | active/hover/focus | Ein aktiver Tab, Pfeiltasten wechseln |

**Paritätstest (E16):** Die Zustandsmatrix wird als Test über beide Oberflächen (Vorschau ↔ Editor) gefahren; ein CSS-Scan verbietet Fremdfarben und Fluid-Größen.

### 13.4 Politur-Checkliste (priorisiert, für E16)

1. **P0:** Legacy-Farben/rem-Reste tilgen; `:focus-visible` überall; `:active`; `color-scheme: dark`; Scrollbars; `::selection`; Reduced-Motion; Antialiasing.
2. **P0:** Ladezustände (Skeletons mit Endmaßen) und Empty States mit Hauptaktion (L19).
3. **P1:** Komponentenfamilie aus `ui-preview` überführen (Feld, Menü, Dialog, Toast, Spotlight); Icon-Größen/Strichstärken vereinheitlichen; ein Radius je Gruppe.
4. **P1:** Save-State-Modell (Gespeichert/Speichert/Offen/Konflikt/Fehler) mit Konflikt-Dialog (L17).
5. **P2:** Shortcut-Sheet, Onboarding-Tour (3 Schritte: Sektion ziehen, Inspector, Publish), Mikro-Motion-Feinschliff.

---

## 14. Weitere Ideen (priorisierter Backlog)

Kurzlegende: **Nutzen** = Hebel für das Zielbild · **Aufwand** S/M/L · **Prio** P0–P3 · **Anknüpfung** = bestehendes Epic/Ticket.

### 14.1 Design & Referenzen (der Differenzierungs-Kern)

| # | Idee | Nutzen | Aufwand | Prio | Anknüpfung |
|---|---|---|---|---|---|
| I1 | Bulk-Import der 688 Referenzordner (678 vollständig) mit Fehlerbericht | Die Sammlung wird sofort nutzbar; größter Einzeleffekt | M | P0 | E24 |
| I2 | `design.md`-Viewer + Dokument-Tabs am Detail | Kernfeature „Vorschaubild + design.md" | S–M | P0 | E24 |
| I3 | Specimen-Galerie der 18 Stil-Familien | Agent und Mensch wählen sichtbar statt blind | S | P1 | E24 |
| I4 | `design.md` → Theme-Entwurf | Referenz wird in einem Schritt anwendbar | M | P1 | E27 |
| I5 | Brand-Import (Logo/Farben/Fonts aus URL/Upload → Tokens) | Kundenmarke in Minuten statt Stunden | M | P2 | nach E27 (RESEARCH.md §4 Punkt 4) |
| I6 | 3-Richtungen-Studio (plan/apply, Side-by-side, Design-Record) | Der „Redesign"-Auftrag als Produkt | L | P0 | E25 |
| I7 | Style-Copy/Paste zwischen Elementen/Seiten/Projekten | Konsistenz ohne Wiederholung | S–M | P2 | E6 |
| I8 | Referenz-Overlay (Referenzbild halbtransparent über der Seite) | „Nähe zur Referenz" sichtbar justieren | S | P2 | E25 |
| I9 | Design-Radar (welche Seite nutzt welche Referenz, Nähe-Score) | Design-Herkunft und Drift im Blick | M | P3 | E24/E26 |
| I10 | Bildrezept → Asset (BYOK-Bildgenerierung, lizenzsauber) | Eigene Motive statt Stock | M | P2 | E24 (Rezept existiert) |
| I11 | Font-Pairing + Self-Hosting aus Referenz-Fonts | Typo-Qualität ohne Lizenzrisiko | S–M | P2 | E27 |
| I12 | Referenz-Diff (zwei Referenzen visuell vergleichen) | Kuratierung der Sammlung | S | P3 | E24 |

### 14.2 Editor & Bedienung

| # | Idee | Nutzen | Aufwand | Prio | Anknüpfung |
|---|---|---|---|---|---|
| I13 | Command Palette mit natürlicher Sprache („Hero größer", „Abstand 80") | Einfachheit ohne Menütiefe; Agent-Parität im UI | M | P2 | E5/E7 |
| I14 | Kontext-Toolbar über der Auswahl (Quick-Actions) | Framer-Gefühl; häufigste Aktionen ohne Panel | S–M | P0 | E5 |
| I15 | Inline Design-Lint (S1–S12 live im Editor) | Slop entsteht nicht erst im Review | M | P2 | E26 |
| I16 | Layout-Overlay (Grid/Flex-Kanten, Abstände messen) | Profi-Bedienung | M | P2 | E8 |
| I17 | Multi-Select + Mehrfach-Bearbeitung | Serienarbeit (Karten, Listen) | M | P1 | E7 |
| I18 | Component Detach/Swap/Variants | Wiederverwendung ohne Käfig | L | P0 | E11 |
| I19 | Varianten-Shuffle (Vorschläge innerhalb der Familie) | Anti-Monotonie auf Knopfdruck | S–M | P2 | E23 |
| I20 | Panel-Layouts speichern (Workspaces) | Rolle „Design" vs. „Content" | S | P3 | E5 |
| I21 | Zoom-/Ansichts-Presets + „Alle anzeigen" | Responsive-Arbeit | S | P0 | E9 |
| I22 | On-Page-Edit für CMS-Entries | Redaktion ohne Kontextwechsel | M | P1 | E13 |
| I23 | Shortcut-Sheet + Guided Tour | Einfachheit by default | S | P2 | E16 |

### 14.3 Qualität, Betrieb, Agent, Zukunft

| # | Idee | Nutzen | Aufwand | Prio | Anknüpfung |
|---|---|---|---|---|---|
| I24 | Design-Score + `get_design_report` | Slop messbar und abnahmefähig | M | P0 | E26 |
| I25 | Visual-Regression Referenz↔Ergebnis | „Sieht aus wie" wird Beweis | M | P0 | E26 |
| I26 | Lighthouse/CWV im Review | Auslieferungsqualität | M | P1 | E15 |
| I27 | A11y-Audit (Keyboard-E2E, Landmarks) | Recht + Qualität | M | P1 | E15 |
| I28 | Deploy-Adapter + Domains/TLS | Kette geschlossen | M | P1 | E14 |
| I29 | Jobs-Dashboard + `senify doctor` | Betrieb ohne Blindflug | S–M | P1 | E12 |
| I30 | Webhooks/Outbound-Events (Entry/Submission/Release) | Integrationen | S–M | P2 | E12/E13 |
| I31 | Analytics-Adapter mit Consent | Kundennutzen | M | P2 | E15 |
| I32 | Agent-Runs mit Evidence/Resume | Vertrauen in Automatisierung | L | P1 | E22 |
| I33 | Permission-Gate + Escalation-Inbox | Sicherheit bei Autonomie | M | P1 | E21 |
| I34 | Skill-Module (Thin Router) | Agenten-Kontextbudget | S–M | P1 | E4 S2 |
| I35 | WebMCP für generierte Sites (Funktionen als Browser-Tools) | „Agent-ready by default" — Alleinstellung | M | P3 | RESEARCH.md §4 Punkt 1 |
| I36 | Framer/Webflow-Import (Visual IR + Paritätsprüfung) | Migrationen als Lead-Magnet | L | P3 | L31 |
| I37 | Extension-SDK (Sections/Primitives/Controls) | Ökosystem | L | P3 | L22 |
| I38 | Component-/Template-Marketplace | Distribution | L | P3 | L32 |
| I39 | Mehrsprachigkeit (Routen, hreflang, CMS-Felder) | nur bei Kundenbedarf | L | P3 | L29 |
| I40 | E-Commerce | verworfen | — | — | L30 (Shopify-Embed) |

---

## 15. Fortsetzung: Roadmap-Einordnung, Arbeitspakete, Verifikation

### 15.1 Einordnung in die Roadmap (Ergänzung zu §6)

Die Referenz-Transfer-Strecke ist **der Differenzierungs-Kern** des Produkts, aber sie steht auf dem Fundament aus Phase A (stabile IDs, Author-Fence, MCP-Vertrag). Deshalb als eigener Block:

**Phase B+ — Referenz-Transfer & Design-Qualität (parallel zur frühen Phase B startbar):**

| Reihenfolge | Epic | Start abhängig von | Ergebnis |
|---|---|---|---|
| 1 | **E24** Referenz-Bibliothek 2.0 (Scheiben 1–3) | E1, E3, E4 S0 | Dokumente + Import + Screenshots + Specimens sichtbar; MCP-Parität |
| 2 | **E25** Redesign-Workflow (Scheiben 1–2) | E24 S1, E5 (Session) | `plan_redesign` + `apply_redesign` in Draft; Design-Record |
| 3 | **E27** Design-System-Import | E24 S1 | `design.md` → Theme-Entwurf |
| 4 | **E26** Design-Qualität & Anti-Slop | E25 S1, E15 | Score + Findings + Referenz-Diff als Review-/Publish-Gate |
| 5 | **E25** Editor-Redesign-Modus (Scheibe 3) | E5, E6 | Mensch führt Reise G komplett im Editor |

**Verhältnis zu Phase C:** E24/E25/E27 können parallel zu Phase B laufen (sie berühren den Editor nur additiv: ein neuer Modus + Panels). E26 braucht die Checks-Basis aus E15 und läuft daher am Ende von Phase C, kann aber als Soft-Report früher starten (Score ohne Gate).

### 15.2 Die nächsten 10 Arbeitspakete der Fortsetzung (sofort umsetzbar)

1. **E24 S1 — Referenz-Dokumente:** `reference_documents` (Modell + Route + UI-Tab + MCP `get_reference_docs`) — kleinster sichtbarer Schritt zum Kernfeature; Tests mit einem echten `design.md`.
2. **E24 S2 — Bulk-Import:** CLI + MCP `import_references`; erster Lauf über die 688 Ordner (678 vollständig); Fehlerbericht für die 10 unvollständigen; Idempotenz-Test (zweiter Lauf erzeugt 0 Duplikate).
3. **E24 S3 — Screenshot-Slots + Specimens:** Hero-Slots am Modell, Karten-Auswahl; 18 Specimen-Previews im Stil-Führer.
4. **E25 S1 — `plan_redesign` (read-only) + Design-Record:** Direction Cards, Sektions-Mapping, Token-Delta, Risiken; Record-Grundgerüst am Draft; MCP-Test „Plan verändert nichts".
5. **E25 S2 — `apply_redesign`:** neue Draft-Revision, sektionsweise Mutationen, ein Undo je Richtung, „aktiver Release unverändert"-Test.
6. **E26 S1 — Design-Score + S1–S12:** Score-Modul, Findings im `CheckIssue`-Format, `get_design_report`; Referenz-Seite als grüner Fall, generische Testseite als roter Fall.
7. **E26 S2 — Visual-Diff Referenz↔Ergebnis:** Referenz-Screenshots als Basis, 3 Breakpoints, Kennzahl + Heatmap im Review.
8. **E27 — `design.md` → Theme:** Parser + Theme-Draft + Roundtrip; Test mit `syntiq/design.md`; unvollständige Dokumente als `reduced`.
9. **E24 S4 — MCP-Parität Bibliothek:** `create_manual_reference`, `update_reference`, `delete_reference`, `edit_reference_profile`, `get/set_reference_settings`, `unassign_reference`, `reference_tick` + Workflow-Test.
10. **E25 S3 — Editor-Redesign-Modus:** Referenz wählen → 3 Richtungen als Vorschau → übernehmen (Draft) → Score-Panel; Browser-Test des kompletten Pfads.

**Leitentscheidung der Fortsetzung:** Wenn nur ein Ziel gilt, dann dieses: *Ein Mensch importiert seine Referenz-Sammlung in Senify, sagt dem Agenten „Redesign der Seite xy im Stil von yz", der Agent liefert drei begründete Richtungen, baut die gewählte als Draft, der Review zeigt Design-Score und Referenz-Diff — und die Seite sieht nicht nach Baukasten aus.*

### 15.3 Verifikation dieser Fortsetzung (was am Code/an der Sammlung geprüft wurde)

| Behauptung | Prüfung | Ergebnis |
|---|---|---|
| Referenz-System existiert (Pipeline, Sammlungen, Briefs, DNA, Zuweisung, MCP) | Dateien gelesen: `references-*.ts`, `types.ts:578-939`, `db.ts:373-488`, `tools.ts:1215-1464` | bestätigt |
| `design.md` fehlt am Modell | `types.ts:777-805`; `references-contract.ts:349-394` — kein Dokumentfeld | bestätigt (R1) |
| Bulk-Import fehlt | nur `POST /api/references` + `/manual`; UI nur Einzel-Upload (`app.js:1202-1306`) | bestätigt (R2) |
| Kein Redesign-Tool | `tools.ts:1286-1315` (`apply_reference` → Theme-Draft); kein plan/apply | bestätigt (R4) |
| Brief adressiert externe Assistenten | `references-brief.ts:27-31, 46-47` („Build … in a browser") | bestätigt (R5) |
| Referenz-Treue nur soft/Theme-bezogen | `references-analyze.ts:562-619`; `lifecycle.ts:454` | bestätigt (R6) |
| Kein Referenz-Visual-Diff | `lifecycle.ts:510-554` (Diff gegen aktiven Release) | bestätigt (R7) |
| Kein Design-Score | `checks.ts:301-364` (nur Hard/Soft-Issues, keine Gestalt-Metriken) | bestätigt (R8) |
| Sammlung: 688 Ordner, 678 vollständig | PowerShell-Zählung über alle Ordner (`Test-Path` je Datei) | bestätigt (§10.2) |
| Blaupausen im Repo | `Repos/taste-vault/skills/reference-to-design/SKILL.md`; `Repos/site-clone/README.md` + `skills/remix-site/` | bestätigt |
| Editor-Sprache aus `design.md` | `packages/editor/src/ui/tokens.ts:18-35`; `tokens/src/default-theme.ts:4-16` | bestätigt |

**Nicht in dieser Fortsetzung enthalten (bewusst):** Produktivcode-Änderungen. Dieser Plan ist Entscheidungs- und Arbeitsgrundlage; die Umsetzung beginnt mit §15.2.

---

## 16. Anhang

### 16.1 Tickets (Stand 19.09., verifiziert gegen die Ticketdateien)

**Tracker A — `.scratch/editor-v2-rebuild/issues/` (Editor-Umbau):**

| Ticket | Inhalt | Status |
|---|---|---|
| 01 | Widget-Engine/Canvas (Phase 0–1) | offen (Kern gebaut, Restpunkte im Ticket) |
| 02 | Style-Engine/Inspektor | **erledigt (20.09.)** — Punkte 1–7 |
| 03 | Editor-Chrome | **erledigt (20.09.)** — Scheibe 1, Punkt 6, Punkte 1/2/4/5/7 |
| 04 | Visual Components | offen |
| 05 | Live-Build-Follow/Performance (SSE) | offen |
| 06 | ADR: Puck-Abschied | **erledigt (20.09.)** — ADR-0007, Code + Peer-Dependency entfernt |
| 07 | Style-Rule-Modell (Stufen 0–6) | erledigt (18.09.) |
| 08 | Gerätestationen (O10; Abnahme nachgeprüft) | **erledigt** (18.09.) |
| 09 | `disabled` als vierter State | erledigt (18.09.) |
| 10 | Layout-Vokabular (bis auf UI-Anzeige) | umgesetzt (18.09.) |
| 11 | `hidden`-Devices-Migration | offen (P0) |
| 12 | DnD vorziehen | offen |
| 13 | Bridge/Style-Rules (Transport, Bake, Rekey) | erledigt (18./19.09.) |
| 14 | Klassen-Emission (global, 4,2–8,2×) | erledigt (19.09.) |
| 15 | PG-Dialekt-Entscheidung + Gate | erledigt (18.09.) |
| 16 | Marker-Overlay-Portal | offen |
| 17 | Releases-Cutover | offen (P0) |
| 18 | Agent-Style-Gate | offen (P0) |
| 19 | Motion (M0–M5 + M4 Stufe 1 umgesetzt; Scrub = M6) | fast fertig |
| 20 | Site-Settings/Profil | umgesetzt (18.09.) |
| 21 | Klassen am DOM | umgesetzt (18.09.) |
| 22 | Scoped-Rekey im Bake | umgesetzt (18.09.) |

**Tracker B — `.scratch/senify-v1/` (Plattform v1):** u. a. `issues/23-entry-templates-und-loops.md` (Entry-Templates, Bindings, Loops inkl. Re-Bake-Mechanik) — die Re-Bake-Job-Mechanik ist dort verankert; der Trigger-Stub liegt in `rebake.ts:22-39` („Trigger stub for ticket 23: T09 owns the trigger, not the job").

**Tracker C (Vorschlag, Teil II) — `.scratch/referenz-transfer/issues/`:** die Arbeitspakete aus §15.2 als Tickets: 01 Referenz-Dokumente (E24 S1) · 02 Bulk-Import (E24 S2) · 03 Screenshot-Slots + Specimens (E24 S3) · 04 `plan_redesign` + Design-Record (E25 S1) · 05 `apply_redesign` (E25 S2) · 06 Design-Score + S1–S12 (E26 S1) · 07 Referenz-Visual-Diff (E26 S2) · 08 `design.md`→Theme (E27) · 09 MCP-Parität Bibliothek (E24 S4) · 10 Editor-Redesign-Modus (E25 S3).

### 16.2 Relevante Entscheidungen und vorgeschlagene ADRs

- **Bestehend:** ADR-0001 (JSON-first) · ADR-0002 (Astro) · ADR-0003 (GSAP) · ADR-0004 (PG-only bis Phase 5) · ADR-0005 (offenes CSS) · ADR-0006 (Motion-Authoring) — Pfade unter `docs/adr/`.
- **Offene Punkte:** O10 drei Gerätestationen · O11 `disabled` vierter State · O12 PG-only · O13 offenes CSS · O14 Templates/Outlet · O15 Klassen-Emission global.
- **Entscheidungs-IDs (E1–E5 aus `map.md`, z. B. „Entscheidung E3 = kein Co-Editing") sind unabhängig von den Epic-IDs dieses Dokuments (E1–E27).** Im Text werden Entscheidungen immer als „Entscheidung E… (map.md)" qualifiziert.
- **Vorgeschlagene neue ADRs:** **ADR-0007** Style-Kompilierung (`@layer`-Prioritäten + Atomic-Option, statt Spezifitätseskalation) · **ADR-0008** Patch-Semantik & Collaboration-Readiness (Property-Boundary, Preconditions, Index-Ordnung als bewusste Grenze; zentralisiertes LWW als Zielpfad) · **ADR-0009** Undo-Semantik (client-scoped History, Transaktionen, Preconditions, Reload-/Konflikt-Verhalten) · **ADR-0010** MCP-Vertrag (Annotations, strukturierte Outputs, Prompts/Resources/Elicitation-Entscheidungen, Sampling-Verzicht) · **ADR-0011** Referenz-Dokumente & Design-Transfer (Dokument-Modell am Referenz-Modell, Redesign als kanonischer Draft-Prozess, Design-Record, Sammlungs-Set-Semantik; Teil II) · **ADR-0012** Design-Qualität (Design-DNA am Projekt, Design-Score, Slop-Heuristiken, Referenz-Visual-Diff und ihre Gate-Stufen; Teil II).

### 16.3 Quellen

- **Prüfläufe dieses Dokuments:** sechs strukturierte Agenten-Audits (Technik, Editor-UX, KI/MCP, Produktreife, Framer/Webflow-Benchmark, UI-Qualität) plus drei Härtungs-Runden (MCP-Best-Practices, Editor-Architektur-Best-Practices, Red-Team) — die Kernaussagen wurden am Code verifiziert (49 MCP-Tools in `tools.ts`, `triggerRebake`-Stub `rebake.ts:22-39`, Editor-Doppelpfad `app.js:4582-4596`, Legacy-Farben `styles.ts:22-31`, `hidden`-Migrationslücke `migration.ts:56-92`, Marker-Fremdfarben `canvas/rules.ts:62-73`, Annotations `server.ts:112-115`). Die Audit-Volltexte liegen nicht als Dateien vor; dieses Dokument ist die konsolidierte, verifizierte Fassung.
- **MCP/Agent-Design:** Anthropic „Writing effective tools for agents" und „Code execution with MCP"; MCP-Spezifikation (Tools/Resources/Prompts/Elicitation, Tool-Annotations, Client-Best-Practices); MCP-Blog „Tool Annotations as Risk Vocabulary" (2026) und „Server Instructions" (2025); Composio MCP-Best-Practices; AWS Prescriptive Guidance (Tool-Organisation).
- **Geprüfte Agenten-Vorbilder (19.09., lokal getestet):** **OpenResearch** (alphaXiv, Rust) — Permission-Gate/Plan-Gate (`mcp-gate` blockiert bis Operator antwortet, fail-closed), Experiment-Baum-Cardinal-Rules, `orx agent spawn`-Delegationsregeln, Evidence-Logs (`orx logs`), quellcodeseitig geprüft (kein cargo auf dem System). **hyperresearch** (Python) — 16-Schritt-Pipeline mit Thin-Router-Skills, Vault (SQLite FTS5, Dedupe, Backlinks), Run-Manifest mit `status/resume/report/verify`, Spend-Tracking, Escalation-Queue, Cite-Check, Tool-Lock-Patcher; lokal getestet: `init`/`status`/`fetch`/`mcp` (MCP-Server read-only, 8 Tools). **Agent-Reach** (Python) — 16 Kanäle mit Primary/Fallback-Backends, `doctor` (Status + Fix-Befehle + „nicht verifiziert"-Markierung), Security-Test-Suite; lokal getestet: Installation, Testsuite (**589 grün / 3 umgebungsbedingt rot** — Config/Transcribe), `doctor`-Lauf.
- **Quellcode-Studien (19.09., geklont und gelesen):** **Webstudio** (visueller Builder; Patch-/Transaktions-Modell, Atomic-CSS-Emit, Restore-Points, Confirmation-Tokens), **Payload CMS** (Access-Control/Field-Access, Versionierung/Autosave, Jobs-Queue mit Claim/Lease, Task-Logs), **Plasmic** (TplNode-Modell, Code-Component-Registry, Variants/Splits, Stub+Error-Boundary) — Details und Zuordnung in §16.6.
- **Editor-Architektur:** Webstudio (Architecture, Atomic CSS, Signals); Figma (Multiplayer, Ordered Sequences, Component Architecture, Slots); Liveblocks (Undo/Redo, Fractional Indexing); Craft.js (Selektoren); StyleX/Meta Engineering (Atomic CSS + `@layer`); GrapesJS (UndoManager); Plasmic/Builder.io/Puck (Architekturvergleiche); OT-vs-CRDT-Analysen 2025/26.
- **Framer/Webflow:** Angaben aus dem Benchmark-Audit (Framer: Breakpoints, Components, CMS, Localization, Agents; Webflow: MCP 2.0, Components/Slots, Variables, Interactions mit GSAP, Breakpoint-Ansicht, Localization, Ecommerce) — Quellen-URLs im Benchmark-Audit, Stand 2025/2026.
- **Teil II (Referenz-Transfer, Anti-Slop, UI):** Sammlung `C:\Users\adini\projects\Referenzsites` (688 Ordner, 678 vollständig; `README.md`, `tools/`); `Repos/taste-vault` (MIT: `skills/reference-to-design/*` mit Direction Cards + Design-Record, `data/styles.json` als Quelle der 18 Familien, `specimens.*`, `docs/reference-to-design.md`); `Repos/site-clone` (MIT: `README.md`, `skills/remix-site/*` — tokenize → re-skin → 3 Richtungen → Tweak-Panel, Pixel-Diff-QA); `.scratch/refs/precious-board/{design,design-components,design-guidelines}.md` (Editor-Designsprache); `Repos/elementor-main`, `Repos/emdash`, `Repos/payload`, `Repos/puck`, `Repos/instatic` (nur Lektüre, nichts kopiert). Code-Verifikation der R-Lücken und der Sammlung: §15.3.
- **Arbeitsstand:** `HANDOFF.md`, `.scratch/editor-v2-rebuild/{map,ledger,ui-plan,ui-aufgaben}.md`, `.scratch/senify-v1/spec.md`, `docs/adr/*`, Ticketdateien beider Tracker.

### 16.4 Glossar

| Begriff | Bedeutung |
|---|---|
| **Haut / Tiefwasser** | Das Editor-Designsystem (`skin.ts`/`tokens.ts`, Palette „Tiefwasser" mit Lime-Signal); „alt" ist die vorherige helle Elementor-nahe Oberfläche |
| **Strangler / E2-Cutover** | Übergangsarchitektur: v1-Sections laufen parallel zur neuen Widget-Engine, bis das Paritäts-Tor den Wechsel erlaubt (Entscheidung E2 in `map.md`) |
| **Durchstich** | Vertikaler End-to-End-Beweis (Bearbeiten → Speichern → Bake → Vergleich) |
| **Fremdfarben** | Farbwerte außerhalb des Tiefwasser-Tokensatzes (z. B. Magenta `#d004d4`, Sky `#0ea5e9`) in Editor-CSS |
| **M4/M6** | Motion-Meilensteine: M4 = Live-Modus/Play-Preview, M6 = optionale Scrub-/Timeline-Stufe |
| **Gerätestation/Breakpoint/Frame** | Synonyme für die drei Responsive-Ebenen (Desktop/Tablet/Mobile); „Frame" ist der sichtbare Canvas-Rahmen |
| **Part-ID** | Stabile Identität eines Bausteins innerhalb einer Component-Definition (für Overrides/Swap) |
| **Patch-Precondition** | Erwartete Serverversion, gegen die ein Patch/Undo nur angewendet werden darf |
| **LWW** | Last-Writer-Wins pro Property — Konfliktsemantik des Zielpfads (Figma-Muster) |
| **Referenz-Dokument** | Versioniertes Markdown am Referenz-Modell (`design.md`, `design-components.md`, `design-guidelines.md`, `notes`; Teil II, E24) |
| **Direction Card** | Kompakte Richtungsbeschreibung eines Redesign-Vorschlags (Evidence / Carry over / Invent / Avoid repeating / Build scope; Muster `reference-to-design`) |
| **Design-Record** | Versionierter Nachweis der Design-Herkunft eines Drafts/Reviews/Releases (Brief, Referenzen, Richtungen, Verifikation; Teil II, E25) |
| **Design-DNA / Design-Contract** | Prüfbare Projektregeln (`constants`/`never`/`vocabulary`) aus zugewiesenen Referenzen; für Agenten hart, für Menschen erklärend (E26) |
| **Design-Score** | Reproduzierbare Gestalt-Metrik 0–100 aus acht Dimensionen (Typo, Spacing, Farbe, Hierarchie, Varianz, Assets, Motion, A11y; E26) |
| **Slop-Heuristik (S1–S12)** | Benannte Erkennungsregel für generische KI-Optik mit Fundstelle und Vorschlag (Teil II, §11.3) |
| **`plan_redesign` / `apply_redesign`** | Read-only-Plan (3 Richtungen) bzw. kanonische Draft-Anwendung eines Referenz-Redesigns (E25) |
| **Set-Deploy** | Mehrere Referenzen als Set auf ein Projekt anwenden (statt Einzelzuweisung; E25, R13) |
| **Specimen** | Visuelle Vorschau einer Stil-Familie (18 Stück; E24, Vorlage taste-vault) |
| **Referenz-Visual-Diff** | Pixel-/Struktur-Vergleich Referenz-Screenshot ↔ Ergebnis je Breakpoint (E26) |

### 16.5 Pflege dieses Dokuments

Dieses Dokument ist der strategische Rahmen. Es wird aktualisiert, wenn ein Epic abgeschlossen ist (Status + Beleg) oder wenn eine Entscheidung eines Epics fällt (dann zusätzlich als ADR). Die operative Wahrheit bleibt `HANDOFF.md` + `ledger.md`.

### 16.6 Quellcode-Studien: übernommene Muster (19.09.)

Drei Repos wurden geklont und gezielt gelesen (Webstudio, Payload CMS, Plasmic); je Muster sind die geprüfte Quelle und das Ziel-Epic vermerkt. Die zugehörigen Ergänzungen stehen als „Übernommene Muster"-Absätze direkt in den Epics (E1–E23).

| Muster | Quelle (geprüft) | Ziel | Stand |
|---|---|---|---|
| Semantische Ops → Patches → ID-Transaktionen; Reverse-Patches; idempotenter Retry | Webstudio `project-build`, `sync-client`, `project-session` | E17 | übernommen |
| Undo nur auf Dokument-Namespaces; UI-Zustand außerhalb der History; ephemere Vorschau | Webstudio `sync-stores`, `use-style-data` | E17 | übernommen (**Korrektur** des früheren Vorschlags) |
| `@layer presets`; Atomic als Emit-Transform; deterministische Media-Ordnung; Per-Page-Pruning | Webstudio `sdk/css.ts`, `css-engine`, `cli/prebuild` | E20 | übernommen |
| Drei-Stores-Teilung; Bridge-Injektion + Token-Pubsub + rAF-Batching | Webstudio `builder.tsx`, `pubsub/create.ts` | E5 | übernommen |
| Restore-Points (Full-Snapshot, Root-Replace, eine Transaktion mit `baseVersion`) | Webstudio `project-session.ts` | E2 | übernommen |
| Confirmation-Token (zweiphasig, plan-gebunden, TTL); `requiresConfirm` je Op | Webstudio `confirmation-token.ts`, `mcp.ts` | E21 | übernommen |
| Transaktionsklammer (`init`/`commit`/`kill`); Draft-Leak-Schutz; Retention `maxPerDoc` | Payload `update.ts`, `updateLatestVersion.ts` | E2 | übernommen |
| Field-Access-Analogon (Property-Policy) + Permissions-Projektion (`GET /api/access`) | Payload `fields/config`, `auth/getAccessResults` | E3/E21 | übernommen |
| Claim/Lease/Heartbeat; Concurrency-Key `siteId`; Job-Isolation; Backoff-Endzustand | Payload `runJobs`, `handleTaskError` | E12 | übernommen |
| Autosave in-place; Draft-Lesepfad; Restore durch volle Kette; Retention | Payload `updateLatestVersion`, `restoreVersion` | E13 | übernommen |
| Task-Logs je Schritt; „fertig" erst nach Verify-Schritt | Payload `JobLog`, `runJob` | E22 | übernommen |
| Definition/Instanz-Trennung; Parts-Register; Stub + Error-Boundary; Editor-Kontext | Plasmic `model-schema.ts`, `code-components.ts`, `canvas-host.tsx` | E11 | übernommen |
| Feld-Annotationen (`own`/`weakRef`/`const`/`transient`) als Single Source | Plasmic `model-schema.ts` | E1 | übernommen |
| Split-Datenmodell für A/B (statt Varianten-Matrix) | Plasmic `core/splits.ts` | E23 | übernommen |
| Action-Registry mit deterministischen Serialisierern (statt JS-Strings) | Plasmic `states.ts` | E10 | abgewandelt übernommen |
| **Verworfen:** Host-in-the-loop-Canvas (zwei React-Instanzen), Code-Components als beliebiger npm-Fremdcode, Observable-/Change-Recorder-Store, Varianten-Matrix pro Node, Seiten-als-Komponenten, postMessage-Live-Preview | Plasmic/Webstudio/Payload | — | bewusst nicht (Begründungen in den Epic-Texten) |


