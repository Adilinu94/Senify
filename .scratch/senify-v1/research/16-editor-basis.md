# Research 16: Editor-Basis (Puck vs. Eigenbau vs. Alternativen)

> **Stand:** 14. September 2026 · **Ticket:** `16-research-editor-basis` · **Status:** abgeschlossen
> **Kontext:** Senify v1 — agent-native Website-Plattform (internes Werkzeug, React/TypeScript, Seiten als JSON-Baum aus registrierten Sektionen, Agenten-Surface via MCP). Gesucht: Editor-Basis für den visuellen Editor.

---

## Executive Summary

1. **Puck (MIT-Core) ist die klar stärkste Basis.** Einbettbarer React-Editor mit genau dem Ziel-Datenmodell: JSON-Baum (`{ content, root, zones }`) + Component-Registry über ein `Config`-Objekt ([Puck Docs – Data](https://puckeditor.com/docs/api-reference/data-model/data), [<Puck>](https://puckeditor.com/docs/api-reference/components/puck)).
2. **Reifegrad 2026 gut, Adoption real:** ~13,3k GitHub-Stars, ~86 Contributors, Release-Kadenz alle 2–6 Wochen (v0.23.0 am 07.08.2026), ~160k npm-Downloads/Woche für `@puckeditor/core` (GitHub-/npm-API, 14.09.2026).
3. **Agenten-Tauglichkeit: ja, aber nicht über Props.** Das `data`-Prop ist initial-only; programmatische Edits laufen über `dispatch({ type: "setData" })`, `onChange`/`onPublish`/`onAction` sowie headless `<Render>`/`migrate()` ([Actions](https://puckeditor.com/docs/api-reference/actions)). Der Senify-Agent schreibt JSON in die eigene Persistenz — Puck ist Editor/Renderer, nicht Agent.
4. **Puck AI ist ein kommerzielles Add-on und NICHT Open Source.** `@puckeditor/plugin-ai`/`@puckeditor/cloud-client` haben auf npm kein Lizenzfeld; Preise ab $199/Monat; Terms 4.3 erlauben per Default Training auf Customer Content ([Pricing](https://puckeditor.com/pricing), [Terms](https://puckeditor.com/terms)).
5. **Alle Alternativen fallen für v1 aus:** Plasmic-Studio ist cloud-only (nicht self-hostbar), Onlook editiert echten Code statt JSON (Paradigma-Mismatch, Release-Stillstand seit 07/2025), Easyblocks ist seit 07/2024 unmaintained (AGPL-3.0), Builder.io ist SaaS (nur Muster-Referenz).
6. **Eigenbau lohnt nicht** für v1: Drag&Drop, Fields, Undo/Redo, Viewports, Migration, Permissions sind Commodity-Infrastruktur — Puck MIT + gezielte Overrides ist der pragmatische „Eigenbau light".
7. **Empfehlung:** Puck-Core als Editor-Basis; Puck-`Data` als kanonisches Dokumentformat in einem Senify-Envelope; Puck AI in v1 bewusst weglassen; MCP-Agent-Layer bleibt die Agenten-Surface.

---

## 1. Bewertungsraster

Aus dem Ticket abgeleitete Kriterien:

| Kriterium | Anforderung Senify v1 |
|---|---|
| **Datenmodell** | JSON-Baum aus registrierten Sektionen (Schema + Slots), keine freie Code-Generierung pro Site |
| **Custom Components** | Eigene React-Komponenten mit Typ-Props registrierbar; Registry = Guardrail für Agenten |
| **Agenten-Tauglichkeit** | Agent (LLM/MCP) kann Seiten-JSON lesen/schreiben/patchten; Editor konsumiert dieselbe JSON; kein Vendor-Cloud-Zwang |
| **Lizenz/Preis** | Für internes Werkzeug tragbar; keine verteilungskritischen Lizenzen; Kosten kalkulierbar |
| **Reifegrad/Wartung 2026** | Aktive Entwicklung, Release-Kadenz, Community, Breaking-Change-Management |
| **Lock-in** | Daten bleiben eigenes Format/eigene DB; Editor austauschbar |
| **Erweiterbarkeit** | Custom Fields, UI-Overrides, Plugins, Theming für eigenes Look&Feel |

---

## 2. Puck

### 2.1 Überblick & Reifegrad

- Open-Source-React-Editor, seit 2023; Positionierung 2026: „The agentic visual editor for React" ([puckeditor.com](https://puckeditor.com/)).
- **GitHub** ([puckeditor/puck](https://github.com/puckeditor/puck)): 13.308 Stars, MIT, aktiv (letzter Push 11.09.2026), ~200 offene Issues, ~86 Contributors (GitHub-API, 14.09.2026).
- **Releases** ([github.com/puckeditor/puck/releases](https://github.com/puckeditor/puck/releases)): v0.22.0 (25.06.2026) → v0.22.4 (29.07.2026) → v0.23.0 (07.08.2026) — regelmäßige Minor-Releases, noch **0.x**.
- **Adoption:** `@puckeditor/core` ~160.418 Downloads/Woche; das alte, deprecated Paket `@measured/puck` noch ~126.620 (npm-API, 14.09.2026). Die Umbenennung `@measured/puck` → `@puckeditor/core` läuft; npm-Deprecation-Notice: „Puck has moved."

### 2.2 Lizenz & Preis

- **Editor-Core: MIT** ([LICENSE](https://github.com/puckeditor/puck/blob/main/LICENSE)); Dokumentation: „suitable for both internal systems and commercial applications", „You own your data and there's no vendor lock-in" ([Puck Docs – Introduction](https://puckeditor.com/docs)).
- **Kostenlos nutzbar:** Core + Plugins wie `@puckeditor/plugin-heading-analyzer` (MIT).
- **Kommerziell:** Puck Cloud / Puck AI — Pay-as-you-go (Token + 20 % Platform-Fee), **Launch $199/Monat**, **Growth $799/Monat**, Enterprise custom (On-prem AI, private Modelle) ([Pricing](https://puckeditor.com/pricing)).
- **Wichtig:** `@puckeditor/plugin-ai` und `@puckeditor/cloud-client` (Version 0.8.3) haben auf npm **kein Lizenzfeld** → proprietäre Cloud-Clients, kein Open Source (npm-Registry, 14.09.2026).

### 2.3 Datenmodell & Registry (Kernbefund)

`Data` = das komplette Seiten-JSON ([Data-Referenz](https://puckeditor.com/docs/api-reference/data-model/data)):

```json
{
  "content": [
    { "type": "Hero", "props": { "id": "Hero-1234", "title": "…" } }
  ],
  "root": { "props": { "title": "Meine Seite" } },
  "zones": {}
}
```

- `content`: Array von `ComponentData` (`{ type, props: { id, … } }`); `props.id` ist die stabile Instanz-ID.
- `root`: Props für das Root-Wrapper-Element (`RootData`).
- `zones`: **wird deprecated** — DropZones wurden durch **`slot`-Fields** ersetzt (inline, rekursiv im Props-Baum) ([DropZones → Slots Migration](https://puckeditor.com/docs/guides/migrations/dropzones-to-slots), [Slot-Field](https://puckeditor.com/docs/api-reference/fields/slot)). Für Senify heißt das: verschachtelte Sektionen als `slot`-Arrays statt globalem `zones`-Objekt planen.
- **Component-Registry = `Config`**: `config.components[Name] = { fields, defaultProps, render, resolveData, resolvePermissions, ai, … }`; `fields` mappen 1:1 auf React-Props ([Config](https://puckeditor.com/docs/api-reference/configuration/config), [ComponentConfig](https://puckeditor.com/docs/api-reference/configuration/component-config)).
- **Typen:** `Data`, `ComponentData`, `Config` sind als TS-Typen exportiert — eigenes Schema/Codegen darauf aufbaubar.
- **Migration:** `migrate()`-Helfer transformiert Legacy-Payloads; `resolveAllData()` und `transformProps()` für serverseitige Verarbeitung ([Data Migration](https://puckeditor.com/docs/integrating-puck/data-migration), [Functions](https://puckeditor.com/docs/api-reference/functions)).

### 2.4 Agenten-Tauglichkeit

- **Kontrolliertes Komponenten-Muster:** `<Puck config={…} data={…} onChange={(data) => save(data)} onPublish={async (data) => …} />` — der Host speichert das JSON selbst („Use this to save the Puck data to your database") ([<Puck>](https://puckeditor.com/docs/api-reference/components/puck)).
- **Einschränkung:** `data` ist als „The **initial** data to render. **Cannot be changed once `<Puck>` has been mounted**" dokumentiert. Live-Sync Agent → offener Editor-Tab braucht daher Remount (`key`-Wechsel) oder eine Bridge über die Puck-API.
- **Programmatische Edits im Editor-Prozess:** `usePuck()`/`createUsePuck()` liefert die `PuckApi`; Actions wie `dispatch({ type: "setData", data })`, `setUi`, `set` erlauben volle AppState-Mutation ([Actions](https://puckeditor.com/docs/api-reference/actions), [usePuck](https://puckeditor.com/docs/api-reference/functions/use-puck)). `initialHistory` setzt Undo/Redo-State ([<Puck>](https://puckeditor.com/docs/api-reference/components/puck)).
- **Change-Tracking für Agenten/Approval:** `onChange(data)`, `onPublish(data)`, `onAction(action, appState, prevAppState)` (z. B. „insert"-Events protokollieren) ([<Puck>](https://puckeditor.com/docs/api-reference/components/puck)).
- **Headless-Rendering:** `<Render data={…} config={…} />` rendert Seiten ohne Editor; Server-Components-Support opt-in ([Components](https://puckeditor.com/docs/api-reference/components), [Server Components](https://puckeditor.com/docs/integrating-puck/server-components)). Für Senify: eigene SSG/ISR-Pipeline kann Puck-`Render` nutzen oder das JSON mit eigenen Renderern auswerten.
- **Guardrails:** `permissions` (global) + `resolvePermissions` (per Instanz, dynamisch nach Datenstand) — z. B. Löschen deaktivieren oder Agenten-Edits einschränken ([Permissions](https://puckeditor.com/docs/api-reference/permissions), [Feature Toggling](https://puckeditor.com/docs)).
- **Agent-Dev-Experience:** Puck pflegt ein eigenes **Agent Skill** (`puckeditor/skills`, MIT, `npx skills add …`), damit Coding-Agenten Puck korrekt integrieren ([Blog Puck AI 0.8](https://puckeditor.com/blog/puck-ai-08), [github.com/puckeditor/skills](https://github.com/puckeditor/skills)).
- **Fazit:** Der Senify-MCP-Agent arbeitet am selben JSON-Baum wie der Editor; Puck kann das JSON laden, anzeigen, human-editieren und speichern. Kollisionsmodell (Agent vs. Mensch) muss Senify selbst lösen (→ Offene Fragen).

### 2.5 Erweiterbarkeit, UI & Grenzen

- **Custom Fields, Field Transforms, UI-Overrides, Plugins** für eigenes Editor-UI; Overrides und Plugins sind in der API-Tabelle als **Experimental** markiert ([<Puck>-Props](https://puckeditor.com/docs/api-reference/components/puck), [Plugins](https://puckeditor.com/docs/extending-puck/plugins), [UI Overrides](https://puckeditor.com/docs/extending-puck/ui-overrides)).
- **Viewports/Iframe-Preview**, Theming via CSS Custom Properties (v0.22), i18n-Dictionary ([<Puck>](https://puckeditor.com/docs/api-reference/components/puck), [Blog v0.22](https://puckeditor.com/blog/puck-022)).
- **Grenzen:** kein eingebautes Multiplayer/Realtime-Collaboration (in der Doku nicht vorhanden); Versionierung/Approval/Diff sind nicht Teil des Editors (Senify baut das im Lifecycle-Layer); 0.x-Versionierung bedeutet Breaking Changes zwischen Minors (Migration-Helfer vorhanden, Package-Rename 2026 zeigt Churn).

### 2.6 Puck AI (Add-on, Stand 2026)

- **Was es ist:** In-Editor-Copilot + Headless-API. `createAiPlugin()` (Client) + `puckHandler()` (Server) rufen Puck Cloud auf; Modi: **Assembly Mode** (nur registrierte Komponenten) und **Design Mode** (generiert zur Laufzeit neue Komponenten) ([AI Overview](https://puckeditor.com/docs/ai/overview), [Puck AI 0.8](https://puckeditor.com/blog/puck-ai-08)).
- **Headless Generation:** `generate({ prompt, config, mode })` erzeugt Puck-`Data` programmatisch — potenziell als Inspirations-/Bootstrap-Baustein, aber Cloud-gebunden ([Headless Generation](https://puckeditor.com/docs/ai/headless-generation)).
- **Konfigurierbarkeit:** `ai.instructions`/`ai.schema`/`ai.exclude`/`ai.required`/`ai.stream` pro Komponente/Feld — gute Guardrail-Ideen für die Senify-Registry ([AI Configuration](https://puckeditor.com/docs/ai/ai-configuration)).
- **Preis:** Pay-as-you-go (Token + 20 %), Launch $199/Mo (BYOK), Growth $799/Mo (BYOK, Training-Opt-out), Enterprise (On-prem AI) ([Pricing](https://puckeditor.com/pricing)).
- **Risiken:** nicht Open Source; BYOK-Anfragen laufen weiter über Puck-Server; **Default: Training auf Customer Content** (Terms 4.3, Stand 21.05.2026: „We may use Customer Content to develop, train, and improve our models and the Service"; Opt-out nur via Enterprise-/MSA bzw. Growth aufwärts) ([Terms](https://puckeditor.com/terms)). Für Agentur-Kundendaten in v1 nicht tragbar.
- **Bewertung:** Für Senify v1 **nicht einsetzen**. Das eigene MCP/LLM-Layer ist ohnehin der Agent; Puck AI wäre nur für einen späteren In-Editor-Copilot relevant — dann eher eigener Chat-Endpoint auf Senify-MCP als Puck Cloud.

---

## 3. Eigenbau (eigener Editor auf DOM/JSON)

**Was ein Eigenbau leisten müsste** (Checkliste ergibt sich aus dem Puck-Feature-Set): Drag&Drop inkl. verschachtelter Slots, Multi-Select, Undo/Redo/History, Outline-Panel, 12+ Field-Typen + Custom Fields, Rich-Text-Editing, Responsive Viewports/Iframe-Isolation, Theming, Data-Migration, Permissions, Plugin-System.

- **Aufwand:** Monate statt Wochen bis zu einem robusten Editor; das klassische React-Editor-Framework dafür, **Craft.js** (MIT, 8.743 Stars), ist seit Februar 2025 praktisch ohne Aktivität (GitHub-API: letzter Push 14.02.2025) ([prevwong/craft.js](https://github.com/prevwong/craft.js)).
- **Marktbeobachtung:** Selbst Anbieter eines Editor-Frameworks schreiben: „if you need a custom page builder there's a huge chance you must build one from scratch. And it's an awfully expensive and tedious process." ([Easyblocks README](https://github.com/easyblockshq/easyblocks)) — Anbieter-Interesse, aber deckungsgleich mit der Craft.js-Rotation.
- **Pragmatische Variante:** Puck-Core verwenden und UI/UX über Overrides, Field Transforms und Custom Fields auf Senify zuschneiden („Eigenbau light", ohne die Commodity-Probleme neu zu lösen).
- **Bewertung:** Für v1 **nicht empfehlen**; erst wenn Puck strukturell nicht mehr passt (z. B. eigenes Canvas-Modell), als v2-Option prüfen.

---

## 4. Plasmic

- **Was es ist:** Visueller Builder für React; OSS-Repo (`plasmicapp/plasmic`, 7.017 Stars, MIT, letzter Push 14.09.2026) mit SDKs/Plattform-Code ([GitHub](https://github.com/plasmicapp/plasmic)).
- **Zentraler Haken:** Das **Studio ist cloud-only**. Offizielle Antwort (Nov 2025): „While Plasmic has some open-source components (SDKs, built-in code components), the design tool itself requires using Plasmic's cloud platform." ([Forum](https://forum.plasmic.app/t/is-plasmic-studio-open-source-and-can-i-self-host/11224)). „Host Plasmic Studio in your app" = Einbetten **ihres** Cloud-Studios in eigene Seite ([Docs](https://docs.plasmic.app/learn/app-hosting/)).
- **Preis:** Free (3 Collaborators, Badge), Starter $39/Mo, Pro $103/Mo (inkl. Plasmic AI Beta), Scale $399/Mo, Enterprise custom; „Extended platform APIs" erst in höheren Tiers ([Pricing](https://www.plasmic.app/pricing)).
- **Workflow/Modell:** Editiert wird im Plasmic-Studio (eigenes internes Modell); Ausgabe via Codegen (React-Komponenten) oder Plasmic-Loader (rendert zur Laufzeit aus der Cloud). Kein schlanker JSON-Tree-als-eigenes-Format wie bei Puck.
- **Lock-in:** Projekt-/Content-Daten leben in der Plasmic-Cloud; Self-Service-Export nur via Codegen/Loader. Für „kein Vendor-Lock-in" in v1 ungeeignet.
- **Bewertung:** **Abgelehnt** — Cloud-Zwang, kein Embeddable-MIT-Editor, Datenhoheit unklar.

---

## 5. Onlook

- **Was es ist:** „The Cursor for Designers" — AI-first Visual Editor, der **echten React-Code** (Next.js + Tailwind) im Browser-DOM editiert und **zurück in den Code schreibt** ([GitHub](https://github.com/onlook-dev/onlook), [onlook.com/for/react](https://www.onlook.com/for/react)). 26.731 Stars, Apache-2.0, letzter Push 25.08.2026.
- **Paradigma-Mismatch:** Senify-Seiten sind **JSON-Bäume aus registrierten Sektionen ohne freien Code pro Site** — Onlooks Kernmodell ist Code-Generierung/-Mutation. Kein einbettbarer Editor, sondern eine Standalone-App (Editor + Preview-Container + Code-Sync).
- **Reifegrad/Signale:** Letztes Release v0.2.32 am 17.07.2025; ~380 offene Issues; README (2026): das OSS-Repo ist die vorherige Generation, das nächste Produkt („for AI-native designers") ist ein **gehostetes** Produkt in Early Access ([README](https://github.com/onlook-dev/onlook)). Fokus verschiebt sich weg vom OSS-Editor.
- **Bewertung:** **Abgelehnt** für die Editor-Basis; als Referenz für AI-Edit-UX (DOM-Overlays, Chat-Edits) interessant.

---

## 6. Easyblocks

- **Was es ist:** „Open-Source Visual Builder Framework" — Embeddable Editor mit Drag&Drop, No-Code Components, Templates, Design-Tokens ([easyblocks.io](https://easyblocks.io/), [GitHub](https://github.com/easyblockshq/easyblocks)). Vom Shopstory-Team.
- **Reifegrad:** **Unmaintained** — letzter Commit 24.07.2024, kein GitHub-Release, nur 576 Stars (GitHub-API, 14.09.2026). Seit ~2 Jahren keine Entwicklung.
- **Lizenz:** **AGPL-3.0** — für ein eingebettetes Framework in einem internen Tool evtl. handhabbar, aber bei späterer Distribution/SaaS-Nähe ein ernstes Copyleft-Risiko.
- **Bewertung:** **Abgelehnt** — totes Projekt; Konzeptnähe (Embeddable, eigene Komponenten) hilft nicht ohne Maintenance.

---

## 7. Builder.io (Muster-Referenz)

- **Was es ist:** Kommerzielle Visual-Development-Plattform mit **Code**- und **Content**-Spaces; Component Registry, Visual Editor, **Fusion-Agent** und eigene **Agent Skills** (`BuilderIO/builder-agent-skills`), MCP-Server ([Pricing](https://www.builder.io/pricing), [Fusion Sub-agent](https://www.builder.io/c/docs/fusion-sub-agent-for-publish), [builder-agent-skills](https://github.com/BuilderIO/builder-agent-skills)).
- **Preis:** Free ($0, 1–5 User, 15 Agent-Credits/Tag), Pro $24/User/Mo (u. a. Built-in MCP Servers), Team $40/User/Mo (AI-Training-Opt-out, Custom MCP), Enterprise custom (SSO, Privacy Mode).
- **Lock-in:** Content/Editor auf Builder-Cloud; nicht self-hostbar (Open-Source nur SDKs, [BuilderIO/builder](https://github.com/BuilderIO/builder), MIT).
- **Bewertung:** **Nicht als Basis** (SaaS, Lock-in, Kosten), aber das **Muster** (Registry + Props-Schema als Guardrail, Agent Skills + MCP als Agent-Surface, Code/Content-Trennung) bestätigt die Senify-Architektur aus `RESEARCH.md` § 2.1/§ 3.

---

## 8. Weitere gesichtete Optionen (kurz)

| Option | Modell | Warum nicht v1 |
|---|---|---|
| **Craft.js** (MIT) | Framework zum Bau eigener Editoren | Stale seit 02/2025 → Eigenbau-Risiko |
| **GrapesJS** (MIT) | Web-Builder-Framework, HTML/CSS-Templates; neues Studio SDK mit React-Renderer (07/2025) | HTML/CSS-Datenmodell statt registrierter Sektions-JSON; schwergewichtig ([GrapesJS](https://github.com/GrapesJS/grapesjs), [React Renderer Release](https://grapesjs.com/blog/react-renderer-release)) |
| **React Bricks** | Kommerzielles Visual-CMS für Next.js/Remix | CMS-/Cloud-geführt, kein MIT-Embeddable-Editor ([reactbricks.com](https://www.reactbricks.com/)) — nicht tiefgeprüft |
| **Webstudio** | Open-Source-Website-Builder (Produkt) | Vollprodukt statt Library, AGPL, eigenes Datenmodell — nicht vertieft |

---

## 9. Vergleichstabelle

| Kandidat | Lizenz | Datenmodell | Embeddable | Agenten-Edits | Reifegrad 2026 | Lock-in | Fazit |
|---|---|---|---|---|---|---|---|
| **Puck Core** | MIT | JSON-Baum `{content, root, zones}`, Slots, Registry (`Config`), TS-Typen | ✅ React-Komponente | ✅ JSON programmatisch (dispatch/onChange/Render); `data` initial-only | ✅ v0.23 (08/2026), ~13,3k★, ~160k DL/Wo, aktiv | 🟢 gering (JSON im eigenen Haus) | **Empfehlung** |
| **Puck AI** (Add-on) | proprietary (npm ohne Lizenz) | dito (ergänzt Agent/Design-Mode) | ✅ Plugin | ✅ (Cloud-API `generate()`) | Beta, Preise ab $199/Mo | 🔴 Cloud + Training-Default | v1: **aus** |
| **Eigenbau** | eigener Code | frei gestaltbar | ✅ | ✅ (volle Kontrolle) | ❌ 0 (Monate Aufwand) | 🟢 keiner | v2-Option, nicht v1 |
| **Plasmic** | Repo MIT, Studio cloud-only | eigenes Cloud-Modell, Codegen/Loader | ⚠️ Studio nur Cloud | ⚠️ nur über Cloud/APIs höherer Tiers | ✅ aktiv, aber Produkt-Cloud | 🔴 hoch (Cloud-Studio) | abgelehnt |
| **Onlook** | Apache-2.0 | **Code** (Next.js + Tailwind), DOM-Edits → Code | ❌ Standalone-App | ⚠️ AI editiert Code | ⚠️ Release v0.2.32 (07/2025), Pivot zu hosted | 🟠 mittel (Code-Sync) | abgelehnt (Mismatch) |
| **Easyblocks** | AGPL-3.0 | No-Code-Components, Embeddable | ✅ | ⚠️ unklar | ❌ tot (letzter Commit 07/2024) | 🟠 AGPL | abgelehnt |
| **Builder.io** | SaaS (SDKs MIT) | Registry + Content-Cloud | ❌ (nur Cloud/SDK) | ✅ (Fusion, MCP, Agent Skills) | ✅ kommerziell aktiv | 🔴 hoch (SaaS) | nur Muster |

---

## 10. Empfehlung + Risiken

### Empfehlung

1. **Puck-Core (MIT) als Editor-Basis adoptieren.** Kein Eigenbau des Editor-Kerns; Puck liefert DnD, Fields, Slots, Viewports, Migration, Permissions, Theming — Senify fokussiert auf Registry, Persistenz, Lifecycle, MCP.
2. **Dokumentformat:** Puck-`Data` als kanonisches Seitenformat, eingebettet in einen **Senify-Envelope** (Seiten-Metadaten, Design-Tokens, Version, Audit-Felder). Persistenz als JSONB; `migrate()` + Version im Envelope für Upgrades.
3. **Agenten-Modell:** Der MCP-Agent schreibt direkt JSON (drafts-first, wie in `RESEARCH.md` § 3.1 vorgesehen); der Editor lädt/zeigt/speichert dieselben Daten. Live-Sync in offene Editor-Tabs zunächst über Reload/Remount, optional `dispatch(setData)`-Bridge; Konfliktmodell explizit in Ticket 09/spec klären (Optimistic Versioning).
4. **Puck AI in v1 nicht einsetzen.** In-Editor-AI (falls je gebraucht) später als eigener Chat auf dem Senify-MCP — keine Kundendaten an Puck Cloud.
5. **Registry doppelt nutzen:** Puck-`ComponentConfig` wird Single Source of Truth für Editor-Fields; Senify-Metadaten (Motion-Presets, Token-Bindings, AI-Hints) als Custom Fields/Annotations ergänzen und via MCP (`list_sections`) spiegeln.

### Risiken & Unsicherheiten

- **0.x-Breaking-Changes:** Package-Rename 2026 (`@measured/puck` → `@puckeditor/core`) zeigt Churn; Versions-Pinning, Migrations-Tests und Envelope-Versionierung einplanen.
- **`data`-Prop initial-only:** Kein eingebautes Live-Update des offenen Editors; ohne Bridge gibt es „stehenden" UI-Stand. Kollisions-/Sync-Verhalten ist Eigenbau (Unsicherheit: Aufwand für saubere UX).
- **Experimental-APIs:** Overrides/Plugins als „Experimental" markiert → eigenes UI-Investment mit Upgrade-Risiko.
- **Single-Vendor-Abhängigkeit:** Firma hinter Puck (Puck Technologies) monetarisiert Puck AI; Editor-Core-MIT ist vertraglich zugesichert (Terms § 7.3), Prioritäten könnten sich aber verschieben (Einschätzung, kein Beleg).
- **Multiplayer/Realtime:** nicht Teil von Puck — falls v1 „mehrere Menschen gleichzeitig" braucht, Zusatzaufwand (aktuell nicht gefordert).
- **Unsicherheit Onlook/Plasmic:** Beide Anbieter befinden sich in Produkt-Pivots (Onlook hosted, Plasmic AI/Cloud) — Bewertung basiert auf heutigem Stand, kann sich schneller ändern als bei Puck.

---

## 11. Offene Fragen (für Ticket 09 / Spec)

1. **Envelope-Format:** Exakte Struktur `{ version, puckData, tokens, meta }` — und wie strikt koppeln wir an Puck-Typen (direkte Importe vs. eigene Typen + Adapter)?
2. **Konflikt-/Sync-Modell Agent ↔ offener Editor-Tab** (Remount-Check via `updatedAt`, Rebase, oder Editor-Session-Sperre).
3. **Overrides/Plugin-Investition in v1:** minimal (Puck-Standard-UI) vs. eigenes Panel/Branding von Anfang an.
4. **In-Editor-AI:** endgültig aus für v1? Falls später: eigener Chat + eigenes Agent-Layer, Budget/DSGVO-Fragen.
5. **Slots statt `zones`:** Formatentscheidung und Dokumentation für die Section-Registry (verschachtelte Sections).
6. **Multiplayer-Anforderung:** Muss v1 Echtzeit-Kollaboration können, oder reicht „ein Editor-Tab pro Seite"?

---

## Quellen

**Puck (Primärquellen, abgerufen 14.09.2026)**
- https://puckeditor.com/ · https://puckeditor.com/docs · https://puckeditor.com/pricing · https://puckeditor.com/terms
- https://puckeditor.com/docs/api-reference/data-model/data · https://puckeditor.com/docs/api-reference/data-model/component-data
- https://puckeditor.com/docs/api-reference/components/puck · https://puckeditor.com/docs/api-reference/actions · https://puckeditor.com/docs/api-reference/functions/use-puck
- https://puckeditor.com/docs/api-reference/configuration/config · https://puckeditor.com/docs/api-reference/configuration/component-config
- https://puckeditor.com/docs/integrating-puck/data-migration · https://puckeditor.com/docs/guides/migrations/dropzones-to-slots
- https://puckeditor.com/docs/ai/overview · https://puckeditor.com/docs/ai/ai-configuration · https://puckeditor.com/docs/ai/headless-generation
- https://puckeditor.com/blog/puck-ai-08 · https://puckeditor.com/blog/puck-ai-07 · https://puckeditor.com/blog/puck-022
- https://github.com/puckeditor/puck · https://github.com/puckeditor/puck/releases · https://github.com/puckeditor/skills
- npm: `@puckeditor/core@0.23.0` (MIT), `@puckeditor/plugin-ai@0.8.3` (kein Lizenzfeld), `@measured/puck` (deprecated) — registry.npmjs.org / api.npmjs.org (Downloads)
- GitHub-API (`api.github.com/repos/puckeditor/puck`, 14.09.2026): Stars/Lizenz/Push/Contributors

**Alternativen**
- Plasmic: https://www.plasmic.app/pricing · https://forum.plasmic.app/t/is-plasmic-studio-open-source-and-can-i-self-host/11224 · https://docs.plasmic.app/learn/app-hosting/ · https://github.com/plasmicapp/plasmic
- Onlook: https://github.com/onlook-dev/onlook · https://www.onlook.com/for/react
- Easyblocks: https://easyblocks.io/ · https://github.com/easyblockshq/easyblocks
- Builder.io: https://www.builder.io/pricing · https://www.builder.io/c/docs/fusion-sub-agent-for-publish · https://github.com/BuilderIO/builder-agent-skills · https://github.com/BuilderIO/builder
- Craft.js: https://github.com/prevwong/craft.js · GrapesJS: https://github.com/GrapesJS/grapesjs · https://grapesjs.com/blog/react-renderer-release · React Bricks: https://www.reactbricks.com/
- Projektkontext: `RESEARCH.md` (Repo-Root), `.scratch/senify-v1/map.md`
