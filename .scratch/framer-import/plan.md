# Framer-Import — detaillierter Plan (Entwurf zur Abnahme)

> Historischer Umsetzungsplan mit fortlaufenden Statusnotizen. Für den kanonischen Status gelten `docs/current/stand.md`. Frühere Budgetangaben sind durch ADR-0010 und `packages/engine/src/guardrails.ts` überholt; aktuell gelten 3 MiB je Payload und 8 MiB je Seite.

**Stand:** 23.09.2026 (2. Nachschärfung) · **Grundlage:** `.scratch/framer-import/research.md`
**Beschlossene Leitlinien (Nutzer, 23.09.):**
1. **Beides gekoppelt**: der bearbeitbare Baum ist das Produkt, die Bild-Wahrheit ist das Import-Gate.
2. **Zuerst tiefe Analyse und ein detaillierter Plan** — keine Implementierung vor der Abnahme dieses Plans.
3. **Importierte Komponenten werden zu wiederverwendbaren Bausteinen in Senify** und die
   Bibliothek wächst über Projekte hinweg weiter.

**Nachgeschärft (Nutzerentscheidungen, 23.09. 2. Runde):**
- **DNA-Fence:** Der Import **muss DNA-konform schreiben** — der Normalisierungsschritt
  (S1.4) macht importierte Flächen konform (Gradienten → flächige Token-Farbe, Schatten
  vereinfachen, Headings linksbündig), Abweichungen vom Original stehen als Funde im
  Bericht (Fundart `dna-adjustment`). Der Publish-Gate (E26 S3b) gilt unverändert.
- **Tablet-Breite:** **1024 überall** — der Import-Gate-Vergleich und
  `analysis-worker/visual.ts` messen beide 1024 (Framer-Tablet-Range 810–1199 enthält 1024).
- **Fixtures:** Die drei Framer-Exporte werden **getrimmt ins Repo** eingecheckt
  (`packages/framer-import/test/fixtures/`, nur HTML + CSS + Appear-JSON, ohne
  node_modules/Fonts-Binary-Ballast) — Golden-Tests laufen ohne externen Ordner.
- **Payload-Budget:** **Erhöht auf 3 MB je Payload / 8 MB je Seite** (gemessen: das
  gebundelte WaveBackground-Modul wiegt 2,78 MB). Umgesetzt in `guardrails.ts` + ADR-0010 §6.
- **Nachweis-Dateien:** `nachweis-trace.py` (Shader-Verifikation des WaveBackground-Moduls)
  und `nachweis/wave-payload.mjs` (esbuild-Bundle-Schritt mit Mount-Vertrag) sind der
  S3b-Nachweis — im Plan als Beleg notiert, bleiben liegen.

---

## 1. Zielbild und Erfolgskriterien

**Ein Satz:** Ein Framer-Seitenimport erzeugt in Senify einen **bearbeitbaren NodeTree**,
dessen Bild dem Original bei 1440/1024/390 nachweislich nahekommt, dessen Farben und
Typografie **Tokens** sind, dessen wiederkehrende Strukturen zu **Komponenten in einer
wachsenden Baustein-Bibliothek** werden, und dessen Nicht-Abbildbares als **Fundbericht**
sichtbar bleibt.

Messbare Erfolgskriterien für die erste vollständige Fassung:

| # | Kriterium | Messung |
|---|---|---|
| E1 | Bildtreue einer statischen Beispielseite | Import-Visual-Diff ≤ 2 % Fläche bei 1440/1024/390 (Motion eingefroren) |
| E2 | Bearbeitbarkeit | 100 % der importierten Knoten sind im Explorer selektierbar und im Inspektor änderbar; 0 Knoten ohne Prüfpfad |
| E3 | Tokenisierung | ≥ 90 % der importierten Farb-Literale liegen als Theme-Token vor (Rest als literale Ausnahme mit Grund) |
| E4 | Ehrlichkeit | jeder nicht abgebildete Fund hat einen Datensatz mit Knoten, Grund, Fundstelle |
| E5 | Idempotenz | zweiter Import derselben Quelle erzeugt 0 neue Knoten/Regeln und 0 Duplikate in der Bibliothek |
| E6 | Bibliothek | ≥ 1 importierte Komponente ist in einem **anderen** Site installierbar und dort als Instanz nutzbar |
| E7 | Parität Mensch/Agent | derselbe Import ist über Editor-Dialog, CLI und MCP mit gleichem Ergebnis auslösbar |

---

## 2. Leitentscheidungen (Vorschlag, mit Begründung)

| # | Entscheidung | Begründung |
|---|---|---|
| D1 | **Zwei Aufnahmen, eine IR.** Plugin-Dump (F1) und URL-Capture (F3+F4) erzeugen dasselbe `FramerIrDocument`. | Der Mapper (IR→NodeTree) wird einmal gebaut und ist ohne Netz testbar. Plugin-Struktur und Link-Struktur laufen durch dieselbe Ableitung. |
| D2 | **Import ist ein Autor eigener Art** (`authoredBy: "preset"`, `origin.source`), kein `agent` und kein `human`. | Die Token-Fence (`engine/src/style-fence.ts`) soll Importe nicht als Agentenlauf abweisen; der Mensch soll Importe nicht als seine eigenen Edits erben (Re-Import braucht Unterscheidbarkeit). |
| D3 | **Jeder Framer-Knoten wird genau eine `scoped`-Regel** (`origin: { source, ordinal }`), **gleiche Deklarationen werden zu `class`-Regeln zusammengefasst**. | Framer-Klassen sind knotengebunden → keine zweite Wahrheit. Zusammenfassen hält den Inspektor und die Bytes klein (Lehre aus Webflow: „Components built on ad-hoc styling encode the mess"). |
| D4 | **Reihenfolge der Normalisierung: Tokens → Klassen → Komponenten.** Komponenten entstehen nur aus gemessener Wiederholung auf der Seite oder auf ausdrücklichen Zuruf. | Die Webflow-Lehre: erst Variablen, dann Klassensystem, dann Komponenten. Umgekehrt zementiert der Import die Unordnung. |
| D5 | **Die Bibliothek liegt global** (kein `site_id`), Sites **installieren** Einträge (Muster: `design_references` global + `reference_assignments` mit `site_id`). | Genau die gewünschte Wirkung („für spätere Projekte") und der einzige Weg, der kein zweites Registry-Modell braucht. |
| D6 | **Instanz pinnt eine Bibliotheksversion; Drift ist ein Signal, kein Automatismus.** | Das Modell existiert bereits (`componentVersion` + `componentDrift` + `bump_component_version`/`update_component_instances`, HANDOFF §2.12/§2.18) — wir erweitern es, statt es zu verdoppeln. |
| D7 | **Trennen statt auflösen:** Beim Deinstallieren/Entfernen eines Bibliothekseintrags werden Instanzen zu lokalen Definitionen („Detach"), nichts verschwindet. | Webflow macht es so („shared Library components … will be converted to site components"); bei uns ist `detachComponent` schon da. |
| D8 | **Klasse C wird nachgebaut, nicht abgelegt.** Drei Stufen: (1) Nachbau in Primitiven, (2) **Island** mit dem Original-Modul (echter Code, eigener Payload-Transport), (3) Platte nur, wenn beides nicht geht. Animationen laufen über den Motion-Kanal (E2-ADR). | Nutzerentscheidung 23.09.: „1:1 Kopie“ hat Vorrang. Stufe 2 ist die in ADR-0001 vorgesehene **bewusste Eskalation** („echter Custom-Code … als Modell-Erweiterung“) — kein Hintertürchen, sondern ein eigener ADR mit Provenienz- und Lizenzpflicht. |
| D9 | **Die Baustein-Bibliothek gilt global** für die Installation (kein Kunden-/Workspace-Schnitt). | Nutzerentscheidung 23.09.; Muster `design_references` (global) + `reference_assignments` (site). |
| D10 | **Motion-ADR spät** (nach S5/Import-Gate). | Nutzerentscheidung 23.09.; bis dahin trägt eine generische Platzhalter-Platte bzw. Island 1:1.

---

## 3. Architektur

```
  Quelle A: Framer-Plugin            Quelle B: URL / Offline-Mirror
  (Plugin SDK, Traits)               (SSR-HTML + CSS + Playwright-Proben)
            │                                   │
            └──────────► framer-ir ◄────────────┘      ← eine Zwischendarstellung
                            │
                    framer-fidelity              ← Bericht (Knoten, Deklarationen, Funde)
                            │
                    framer-mapper                ← IR → Nodes + Style-Rules + Theme-Patch
                            │
            ┌───────────────┼────────────────────┐
            │               │                    │
      Baum (Draft)    Theme-Tokens         Bibliotheks-Kandidaten
            │                                    │
            └──────────► Import-Gate (Visual-Diff) ◄────────── Originalbild
                                                 │
                                        Baustein-Bibliothek (global)
```

**Module (Vorschlag, neue Dateien)**

| Ort | Modul | Inhalt |
|---|---|---|
| `packages/framer-import/src/` (neues Paket) | `ir.ts` | `FramerIrDocument`-Typen + TypeBox-Schema + `parseIr` (tolerant, Muster `style-rule.ts`) |
| | `capture-html.ts` | F3: SSR-HTML → IR (ohne Browser) |
| | `capture-browser.ts` | F4: Playwright-Proben (computed styles, `motion.json`, `tokens.json`) |
| | `capture-plugin.ts` | F1: Plugin-Dump-JSON → IR (der Validator, nicht der Plugin-Code) |
| | `probes/tokens-probe.mjs` | eigener, versionierter Probe (Herkunft aus `Repos/site-clone` dokumentiert) |
| | `probes/motion-probe.mjs` | dito |
| | `assets.ts` | Asset-Liste, Download, Dedupe über Hash |
| | `mapper.ts` | IR → `EditorDocument` + `StyleRule[]` + Theme-Patch + Platzhalter |
| | `normalize.ts` | Tokens→Klassen→Komponenten, Frequenzanalyse, Zusammenfassen von Deklarationen |
| | `fidelity.ts` | Bericht + Score + Fundtypen |
| | `library.ts` | Kandidaten erkennen (Wiederholung), Fingerprint, Promotion-Eingabe |
| `packages/framer-import/test/` | `ir.test.ts`, `mapper.test.ts`, `normalize.test.ts`, `assets.test.ts`, `fidelity.test.ts`, `golden/*.json` | Golden-Eingaben (echte Framer-Ausschnitte), deterministische Ausgaben |
| `packages/engine/src/` | `imports-contract.ts`, `imports.ts` | Routen-Verträge, Aufnahme, Dry-Run, Idempotenz-Schlüssel |
| | `library.ts`, `library-contract.ts` | Baustein-Bibliothek: CRUD, Install/Uninstall, Versionen, Drift |
| | `db.ts` (Erweiterung) | `library_components`, `site_library_installs`, `import_jobs` |
| `packages/mcp/src/tools.ts` | `import_framer`, `get_import_report`, `list_library_components`, `install_library_component`, … | MCP-Parität |
| `packages/app/src/` + `public/app.js` | Import-Dialog, Bibliotheks-Workspace | Editor-/Programm-Oberfläche |
| `packages/editor/src/` | Import-Folgezustand, Platzhalter-Anzeige, Bibliotheks-Kandidaten-Liste | „Was ist importiert worden" sichtbar machen |

---

## 4. Datenmodell

### 4.1 Import-IR (Skizze)

```ts
export type FramerIrDocument = {
  ir: 1;
  source: {
    kind: "plugin" | "html" | "browser";
    url: string | null;
    projectId: string | null;
    capturedAt: string;
    contentHash: string;          // Idempotenz: gleiche Quelle = gleicher Hash
  };
  breakpoints: { id: string; minWidth: number; name: string | null }[];
  pages: FramerIrPage[];
  styles: {
    colors: { id: string; name: string; light: string; dark: string | null }[];   // getColorStyles
    texts: { id: string; name: string; tag: string | null; values: DeviceValueMap;
             breakpoints: { minWidth: number; values: DeviceValueMap }[] }[];     // getTextStyles
    fonts: { family: string; weight: number; style: string; src: string[] }[];    // @font-face
  };
  assets: { url: string; kind: "image" | "video" | "font" | "svg"; hash: string | null; alt: string | null }[];
  motion: IrMotionSample[];       // gemessene Interaktionen (F4)
  findings: IrFinding[];          // was schon bei der Aufnahme nicht geht
};

export type FramerIrNode = {
  key: string;                            // stabil innerhalb der Seite (Framer-Id / Pfad-Hash)
  kind: "frame" | "text" | "rich-text" | "svg" | "image" | "video" | "component-instance"
      | "component-definition" | "embed" | "placeholder" | "unknown";
  name: string | null;                    // data-framer-name / node.name
  componentType: string | null;           // data-framer-component-type / "FrameNode" …
  layout: {
    mode: "absolute" | "stack" | "grid";
    direction?: "horizontal" | "vertical";
    gap?: string; padding?: Partial<Record<"top" | "right" | "bottom" | "left", string>>;
    align?: string; distribution?: string; wrap?: boolean;
    columns?: string; rows?: string;
    spans?: { column?: number; row?: number };
  };
  box: { width?: string; height?: string; minWidth?: string; maxWidth?: string;
         minHeight?: string; maxHeight?: string; aspectRatio?: string;
         position?: string; inset?: Partial<Record<"top"|"right"|"bottom"|"left", string>>;
         centerX?: number; centerY?: number };
  visual: Partial<Record<string, string>>;  // background*, border*, border-radius, opacity,
                                            // transform, overflow*, z-index, filter, mix-blend-mode …
  text?: { content: string; styleRef: string | null; inline?: Partial<Record<string, string>> };
  link?: { href: string; newTab: boolean };
  states?: Partial<Record<"hover" | "focus" | "active" | "disabled", Record<string, string>>>;
  children: FramerIrNode[];
  slots?: Record<string, FramerIrNode[]>;
  motion?: IrMotionBinding[];
  origin: { source: string; ordinal: number };
};

export type IrMotionSample = {
  nodeKey: string;
  library: "gsap" | "scrolltrigger" | "waapi" | "css" | "lenis" | "framer" | "unknown";
  trigger: "appear" | "scroll" | "hover" | "click" | "time" | "inview";
  params: Record<string, string | number | boolean>;  // start/end/scrub/pin/ease/delay/stagger/duration…
  raw: string;                                        // Beleg (JSON-Ausschnitt)
};

export type IrFinding = {
  kind: "code-component" | "shader" | "cms" | "locale" | "breakpoint-collapse"
      | "unsupported-declaration" | "unknown-node" | "asset-blocked" | "page-transition";
  nodeKey: string | null;
  message: string;
  evidence: string;      // Fundstelle: Selektor, Klassennamen, Attribut
  severity: "block" | "warn" | "info";
  suggestion: string;
};
```

### 4.2 Fidelity-Bericht

```ts
export type FidelityReport = {
  ir: 1;
  source: FramerIrDocument["source"];
  counts: { nodes: number; mapped: number; placeholders: number; skipped: number };
  declarations: { total: number; carried: number; tokenized: number; dropped: number };
  motion: { measured: number; mappedToPreset: number; documented: number };
  findings: IrFinding[];
  score: number;              // 0–100, gewichtet: Bildanteil, Tokenisierung, Motion-Abdeckung
  steps: string[];            // was der Import getan hat, in Reihenfolge
};
```

Der Bericht ist **Produktteil**, nicht Log: Er erscheint im Import-Dialog, im Review
(`review_items`) und als MCP-Antwort — dieselbe Haltung wie `get_design_report`.

### 4.3 Baustein-Bibliothek

```sql
CREATE TABLE IF NOT EXISTS library_components (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  tags jsonb NOT NULL,                  -- Rolle: navbar, hero, card, footer …
  definition jsonb NOT NULL,            -- Teilbaum + Varianten + Slots + Default-Props
  version integer NOT NULL,
  fingerprint text NOT NULL,            -- Dedupe (normalisierte Struktur)
  provenance jsonb NOT NULL,            -- { kind: "framer-import" | "hand", source, pagePath, irHash }
  notes text,                           -- „wofür, wann nicht", Besitzerhinweis
  deprecated_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS site_library_installs (
  site_id text NOT NULL,
  library_component_id text NOT NULL,
  installed_version integer NOT NULL,   -- Pin; Drift = installiert < aktuell
  mode text NOT NULL,                   -- "linked" | "copied"
  created_at timestamptz NOT NULL,
  PRIMARY KEY (site_id, library_component_id)
);
```

### 4.4 Klasse C: die 1:1-Strecke über Islands (Nutzerentscheidung)

Der Wunsch ist die **1:1-Kopie**. Für Code-Komponenten, Shader und andere Flächen, die
Senify in Primitiven nicht ausdrücken kann, gibt es deshalb drei Stufen — nachgebaut wird
in dieser Reihenfolge, abgelegt wird nur am Ende:

| Stufe | Vorgehen | Ergebnis | Preis |
|---|---|---|---|
| **1. Nachbau** | die Fläche in Primitiven + Style-Regeln aufbauen (Layout, Typo, Bilder, SVG) | voll editierbar | Verlust bei Logik/Interaktion |
| **2. Island** | das **Original-Modul** aus dem Framer-Bundle übernehmen und als Senify-Island mounten (Payload-Transport + esbuild-Bake existieren für `webgl-scene` bereits) | bild- und funktionsgleich, nicht in Primitiven editierbar | braucht einen **Modell-Zusatz** (ADR) + Herkunfts-/Lizenznachweis |
| **3. Platte** | Platzhalter-Primitiv mit Größe und Position | sichtbar, ehrlich, unbefriedigend | bleibt im Bericht |

Stufe 2 ist wirtschaftlich der Hebel für „1:1": Senify hat die Maschinerie schon —
Islands laden per IntersectionObserver nach, der Bake bundelt three.js zur Bake-Zeit
(`renderer/src/webgl-vendor.ts`), das Poster-Bild überbrückt bis zum Laden. Was fehlt, ist
der **Transport der Fremd-Module** (Wo liegen sie? Wie werden sie versioniert? Wie ist die
Herkunft belegt?) und die Entscheidung, dass importierter Fremd-Code neben dem Baum leben
darf. Das ist genau die Eskalation, die ADR-0001 ankündigt („Eine spätere Eskalationsstufe
(echter Custom-Code) müsste bewusst als Modell-Erweiterung eingeführt werden — nicht als
Hintertür”) — also ein eigener ADR, **früh**, weil die 1:1-Zusage daran hängt.

Ehrliche Folge, die im ADR stehen muss: Ein Island ist eine Insel. Der Senify-Inspektor kann
es verschieben, skalieren, ein- und ausblenden, aber seine **Innereien** sind nicht in
Senify editierbar — dafür braucht es den Original-Editor (Framer). Die 1:1-Kopie gewinnt
Bildtreue und verliert Bearbeitbarkeitstiefe an genau dieser Stelle. Beides gleichzeitig
geht für fremden Code nicht, in keinem Werkzeug.

---

## 5. Die Baustein-Bibliothek — wie sie wächst, ohne zu verfaulen

### 5.1 Der Mechanismus in vier Schritten

1. **Erkennen (Import).** Der Import zählt Wiederholungen: identische Struktur mit
   denselben Regeln (Fingerprint) ≥ 2 × pro Seite oder ≥ 2 × über Seiten → **Kandidat**.
   Keine Automatik: Kandidaten landen als Liste im Bericht („3 Kandidaten: Navbar 4×,
   Karte 6×, Abschnittskopf 9×").
2. **Heben (Mensch oder Agent, bewusst).** Ein Kandidat wird zur Bibliothekskomponente:
   Definition + Varianten + Slots + Default-Props, **vorher normalisiert** (Tokens,
   Klassenzusammenfassung). Das ist ein Schreibvorgang mit Undo und Audit, kein Nebeneffekt.
3. **Installieren (Site).** Eine Site installiert den Eintrag (Pin auf `installed_version`)
   und setzt Instanzen. Bibliothekseinträge sind auf der Site **nicht editierbar** —
   nur Instanz-Overrides.
4. **Pflegen (Versionen).** Definition ändern = Version erhöhen. Instanzen bleiben auf ihrem
   Pin; `update_instances` zieht sie in **einem** Schritt nach (ein Undo). Drift blockiert
   kein Publish (Anders als heute beim page-lokalen VC-Drift: hier ist die Bibliothek eine
   Quelle über Sites hinweg, ein harter Blocker würde fremde Sites lahmlegen) — sie
   erscheint als Hinweis und im Release-Manifest.

### 5.2 Vorbilder und was wir daraus übernehmen (recherchiert)

| Vorbild | Modell | Was wir übernehmen | Was wir anders machen |
|---|---|---|---|
| **Webflow Shared Libraries** (help.webflow.com, 20.07.2026) | Quelle = „source site", Einträge werden auf Sites **installiert**; Updates werden gepusht und **akzeptiert** (einzeln oder als Bulk); Löschen/Deinstallieren **konvertiert zu Site-Komponenten**; nichts verschwindet | Installations-Modell, Pin + „Review changes"/„Accept", Konvertieren statt Löschen, „Installed on N sites" als Sicht | Kein Bulk-Push über fremde Sites ohne Freigabe (Senify: Publish nur nach Freigabe); Versionen und Undo sind im Modell, nicht in einem Änderungsprotokoll |
| (dieselbe Quelle) Grenzen | „No cross-project inheritance in the way engineers expect", „updates don't propagate like an npm version bump", „detaching is one-way. No reattach" | Wir sagen die Grenze **im Bericht** und bauen Re-Attach: ein Detach merkt sich seine Herkunft (`provenance`), Re-Attach ist möglich | |
| **Figma Library** (published libraries, update/variant-swap) | Veröffentlichen, Instanzen melden Updates, Varianten und Slots, Swap behält Overrides | Pin + Drift + expliziter Update-Schritt; Overrides adressieren **stabile Part-IDs**, nie Labels (das steht schon so in `section-sdk/components.ts`) | Figma committet still; wir verweigern den Automatismus |
| **Builder.io Registry** (RESEARCH.md §2.1) | Komponenten-Registry mit Props-Schema = Guardrails für Agenten | Bibliothekseinträge tragen **typisierte Props** (Slots, Varianten) — nicht nur Struktur | Kein Schema-Deploy nötig; Senify liest den Katalog aus dem Code |
| **Referenz-Bibliothek (E24, eigenes Haus)** | globaler Datensatz + Site-Zuweisung, Hash-Dedupe, Fehlerbericht statt stillem Überspringen, idempotenter Re-Import | Das ist die **Vorlage** für die Baustein-Bibliothek: gleiche Tabellenform, gleiche Idempotenzregeln, gleiche MCP-Parität | |
| **Webflow-Praxis-Lehren** (flowappz, 29.07.2026) | Reihenfolge Variablen → Klassen → Komponenten; „expose as properties anything that legitimately varies"; Varianten deckeln; „audit detached instances quarterly"; Namen nach Rolle, nicht Aussehen | D4 (Reihenfolge), Eigenschaften vor Detach, Variantendeckel (Warnung > 6 Varianten), **Bibliotheks-Audit** als wiederkehrender Bericht (`library tick`), Rollen-Namen (`card`, nicht „purple-box") | |

### 5.3 Dedupe und Namensgebung

- **Fingerprint**: Hash über normalisierte Definition (Knotentypen, auf Token aufgelöste
  Deklarationen, Variantennamen, Slotnamen, Kinderreihenfolge). Zwei Importe derselben
  Komponente aus zwei Quellen treffen sich dort.
- **Ähnlichkeit statt Gleichheit**: Bei 85–99 % Ähnlichkeit **kein** automatisches
  Zusammenlegen, sondern ein Hinweis („ähnlich zu `card` 92 % — zusammenlegen?").
  Muster: der Design-Score zeigt Zahlen, der Mensch entscheidet.
- **Rollen-Namen** mit Slash-Ordnern wie bei den Farbmarken (`section/hero`, `chrome/navbar`).

### 5.4 Was die Bibliothek ausdrücklich nicht ist

Keine Code-Registry (das bleibt `packages/registry`, ADR-0001: „Registry ist Gesetz"), kein
Marketplace, keine automatische Verteilung. Der wachsende Teil ist **Daten**; wenn ein
Baustein reif ist, ist die Promotion in eine echte Section im Code ein eigener,
bewusster Schritt (Ticket, Review) — dieselbe Linie wie die vertagte Sections-Migration.

---

## 6. Scheiben mit Aufgaben, Dateien, Abnahme

Schätzung in Personentagen (pt) für eine einzelne Person; „—" heißt: hängt an der
Vorscheibe.

### S0 — Messlauf und Beweise sammeln (2 pt) · **empfohlener Start**

| # | Aufgabe | Datei/Beleg |
|---|---|---|
| 0.1 | Die drei lokalen Framer-Exporte auswerten: Knotenzahl, Klassenzahl, Deklarationszahl, Marker-Inventar. Quelle: `C:\Users\adini\FramerExport\framer-*`; die getrimmten Kopien liegen inzwischen als Fixtures im Repo (`packages/framer-import/test/fixtures/`, Aufgabe 6.1b) | Skript `.scratch/framer-import/messlauf.mjs` + `befund.md` |
| 0.2 | Nicht-Abbildbares quantifizieren: die 20 häufigsten Deklarationen außerhalb der Erwartung, unbekannte Knotenarten, Assets ohne Download | dito |
| 0.3 | Animations-Inventar per `motion-probe` an einer Live-Seite + an der Offline-Kopie | `motion.json` |
| 0.4 | **Plugin-Frage klären**: Probe-Plugin gegen die Traits-Matrix; gibt es Interaktions-Attribute? Ergebnis mit Beleg | `plugin-befund.md` |
| 0.5 | Entscheidungsvorlage E2 (Motion-Kanal) mit echten Zahlen: wie viele gemessene Interaktionen passen in die bestehenden Presets? | `motion-abdeckung.md` |

**Abnahme:** Zahlen stehen; die drei offenen Punkte aus `research.md` §9 sind beantwortet
oder als „nicht beantwortbar, weil …" geschlossen. **Kein Produktivcode.**

> **Ergebnis liegt vor:** `.scratch/framer-import/befund.md` + `messlauf.mjs` + `messlauf.json`.
> Wichtigste Funde: **Appear-Parameter und Breakpoints sind statisch lesbar** (JSON im
> SSR-HTML), Komponentengrenzen über `*-container`-Klassen erkennbar, 20–30 % der CSS-Regeln
> sind Dubletten, und der SSR-Startzustand ist **unsichtbar** (`opacity:0.001`) — das
> Import-Gate muss gegen den `animate`-Zustand messen. **Nachtrag 23.09. 2. Runde:** die
> offenen Punkte 2–4 sind geschlossen (befund.md §4) — Live-Lauf (`live-probe.mjs`,
> 12,30 MB CDN, 675 Knoten, 51 Font-Subsets), WAAPI-Verifikation (`getAnimations()`:
> Appear + genau eine Loop-Form, Ticker-Marquee 140 s), alle drei Spiegel im Motion-Lauf
> gemessen (IO 27/34/198).

### S1 — IR und Mapper (5 pt) — **UMGESETZT 23.09. (3. Runde)**

| # | Aufgabe | Stand |
|---|---|---|
| 1.1 | `framer-ir`-Typen + TypeBox-Schema + toleranter Parser (Muster: `parseStyleRule`) | ✅ `packages/framer-import/src/ir.ts` — `FramerIrDocument`, `IrNode` mit `states[]` (Geräte-/Varianten-Zustände), `IrFinding` mit den neuen Fundarten (`dna-adjustment`, `smooth-scroll`, `loop-animation`, `font-subset`); `parseIr` tolerant (kaputte Einträge fallen, nie throw) |
| 1.2 | `capture-html.ts`: SSR-HTML → IR (Marker, Klassen, `<style>`-Blöcke, Fonts) — **inklusive** `__framer__appearAnimationsContent` (Start/Ende/Feder je Element und Breakpoint) und `data-framer-custom-breakpoints` (mediaQuery → Station) | ✅ eigener Tag-Scanner (keine HTML-Parser-Dep, Muster `messlauf.mjs`); liest die drei Kanäle (appear/breakpoints/handover), Token-Definitionen (`--token-*`), `@font-face` (auch aus der verlinkten Seiten-CSS), Presets, Assets; **löst die `ssr-variant`-Wrapper auf** (hidden-Hashes wandern an das Kind) |
| 1.3 | `mapper.ts`: IR → `EditorDocument` + `StyleRule[]` + Theme-Patch | ✅ `mapDocument` erzeugt ein version-2-Dokument (root/frame/heading/text/body/link/image/icon/list), Regeln mit `origin: framer-import`, Theme-Patch aus den Font-Faces (dominante Familie → body) |
| 1.4 | `normalize.ts`: **eigener, getesteter Konsolidierungsschritt** — Deklarations-Dubletten zu `class`-Regeln zusammenfassen (Messwert: 20–30 % gespart, S0/B5), danach Tokenisierung; **DNA-Konformität erzwungen** (Entscheidung 23.09./2): Gradienten → flächige Token-Farbe, Schatten vereinfachen, Headings linksbündig — jede Abweichung vom Original wird als Fundart `dna-adjustment` mit Beleg im Bericht geführt | ✅ DNA-Pfad über alle Node-States (Gradient → erste Farbe, Schatten → weg, Radius → 0, zentrierte Headings → links, Neon/Mono → Fund mit Theme-Mapping); Konsolidierung über Deklarations-Sets (identischer Satz = eine Regel), Vendor-Präfixe fallen gezählt |
| 1.5 | Geräte-Merge: Knoten, die per Breakpoint-Wrapper dupliziert sind, zu **einem** Knoten mit `_tablet`/`_mobile`-Werten zusammenziehen (S0/§4 Punkt 5) | ✅ Zwei Ebenen: (1) Capture löst `ssr-variant`-Wrapper auf, (2) Mapper foldet Geschwister mit identischer Basis-Klassen-Signatur (`baseSignature`) — das Duplikat wird Device-State (`deviceOfVariant` über die Framer-Range-Minuten), nur der **Wertunterschied** wird `_tablet`/`_mobile`-Prop (Vererbung tut den Rest). Gemessen am fluffy-Fixture: 3 header-Varianten → 1 Node mit Device-Overrides |
| 1.6 | `fidelity.ts`: Bericht + Score + Fundtypen — **Fundart `smooth-scroll`** (S0/B6: Lenis/`SmoothScroll_Prod`-Chunk, 28 KB, auf allen drei Exporten): Scroll-Steuerung außerhalb der Presets wird als Fund mit Profil-Zuordnung gemeldet, nicht stillschweigend gedroppt | ✅ `buildFidelityReport` (counts/declarations/motion/findings/score/steps); Fundarten fließen aus Capture + Mapper durch |
| 1.7 | Golden-Tests: 3 festgeschriebene IR-Eingaben → 3 erwartete Dokumente (byte-stabil) — Eingaben sind die Fixtures aus 6.1b | ✅ `golden.test.ts`: alle drei Fixtures durch die Pipeline, Stabilität über zwei Läufe (stats/score/Fundarten), Primitive-Abdeckung, Größenordnung wie in S0 gemessen |
| 1.8 | Integritätstest: Ergebnis läuft durch `validateDocument`, `validateTreeIntegrity` und den Compiler | ✅ `integrity.test.ts`: `validateDocument` = **0 Issues** auf allen drei Fixtures, `compileCss` erzeugt Stylesheet **ohne `gradient(`** (DNA-Fence hält bis ins CSS) |

**Abnahme:** Ein IR erzeugt ein gültiges, kompilierbares Dokument; die Goldens sind stabil;
ein Bericht wird ausgegeben. **Erfüllt:** 48/48 Tests grün; typecheck/lint 0.

**Mapper-Ehrlichkeiten (Fundarten statt stiler Drops), gemessen an den Fixtures:**
- RichTextContainer mit genau einem Heading-Kind → `heading` mit level/text (der häufigste Framer-Form)
- RichText mit mehreren/Block-Kindern → `body` mit generiertem Inline-HTML (`<a href>`, `<strong>` …)
- `<a>` mit nur Text (auch durch Container) → `link` mit deepText-Label
- `<a>` mit Block-Kindern (Karten) → `frame` + Fundart `unsupported-declaration` (URL im Bericht)
- `ul` mit Block-Items → `frame` + Struktur bleibt; `svg` mit Kindern → `frame`, nacktes `svg` → `icon` mit Fund
- Alle Kind-Regeln folgen `allowedChildren` des Katalogs — `validateDocument` ist der Beweis

### S2 — Aufnahme: URL, Offline-Mirror, Assets (4,5 pt) — **UMGESETZT 23.09. (4. Runde)**

| # | Aufgabe | Stand |
|---|---|---|
| 2.1 | `capture-browser.ts` auf der bestehenden Playwright-Kette (Freeze-Kill-Switch „off") | ✅ `packages/framer-import/src/capture-browser.ts` — lädt die Seite in Chromium (1440×900), Settle-Pass über die Scrollhöhe (Muster `motion-lauf.mjs`), liest das SSR-HTML per `page.content()` und führt es durch die statische Capture (`source.kind = "browser"`). Freeze „off": `__SENIFY_MOTION__` als Init-Script **plus** Freeze-CSS (`animation: none`, Muster `visual.ts`) — die frozen Baseline zählt keine WAAPI-Einträge, der Messlauf läuft mit `motion: "live"` |
| 2.2 | Probes als eigene, versionierte Module übernehmen (Herkunft + Lizenz dokumentieren) — **Zuschnitt nach S0/B8 + Live-Messung (befund.md §4):** Framer animiert **nicht** mit GSAP (0 ScrollTrigger, 0 Tweens — auch live bestätigt). Also: (a) statische Blöcke `appear`/`breakpoints`/`handover` lesen, (b) IntersectionObserver instrumentieren (27/34/198 Registrierungen gemessen), (c) **eigener Sensor für Scroll-Transform/Speed** (Bounding-Box gegen Scrollposition), (d) GSAP-Probe nur als Fallback für Seiten, die wirklich GSAP nutzen. **Endlos-Loops** (einzige gefundene Loop-Form: Ticker-Marquee, translateX ±4192 px über 140 s, `iterations: null`) werden als Fundart `loop-animation` gemeldet und auf `set_motion`-Marquee-Presets abgebildet, wo ein Preset passt | ✅ `probes/motion-probe.mjs` + `probes/tokens-probe.mjs` als **unveränderte MIT-Kopien** aus `Repos/site-clone` (Provenienz/Lizenz in `probes/README.md`, eslint-Ausnahme für die defensiven `catch {}`-Blöcke des Originals); der eigene Scroll-Sensor (`senifyScrollSample`) sampelt Bounding-Boxen vor/nach dem Scrollpass und meldet Delta ≠ Scrollbetrag als scroll-Sample; GSAP bleibt im Probe-Inventar als Fallback. Endlos-Loops (`iterations` endless/null) → Motion-Samples mit `trigger: "time"` **und** Fundart `loop-animation`; `marqueeCandidates()` (import.ts) liefert die Marquee-Preset-Zuordnung mit Grund |
| 2.3 | `assets.ts`: Download, Hash-Dedupe, Upload in die Medien-Pipeline, Alt-Texte | ✅ `packages/framer-import/src/assets.ts` — `importAssets` lädt jede URL einmal, dedupliziert über SHA-256 (identischer Inhalt = ein Download, Zähler `deduped`), schreibt über einen **Uploader-Callback** (die Engine-Verdrahtung läuft in S3 über die signierte Upload-Route `POST /assets/upload-url` + `PUT`; der Test nutzt exakt diese Vertragsform) oder in einen Mirror-Ordner; Alt-Texte bleiben im Asset-Eintrag; fehlgeschlagene Downloads sind Fundart `asset-blocked` mit Beleg, nie stille Drops |
| 2.3b | **Fonts (DSGVO-Aufgabe):** die `@font-face`-Blöcke des Imports verweisen heute auf Framer-CDN-URLs — für DSGVO-Konformität werden Font-Dateien geholt, in die Medien-Pipeline hochgeladen und die `src`-URLs umgeschrieben; Font-Subsets werden dedupliziert (Hash über Datei + `unicode-range`), doppelte Familien/Weights landen in einer Datei | ✅ Font-Pfad in `importAssets`: Dateien werden geholt, Dedupe über (SHA-256, `unicode-range`) — derselbe Inhalt landet nur einmal in der Ablage, `report.fonts` führt jede Datei mit Hash/Bytes; die IR-`src`-Listen zeigen nach dem Lauf **nur lokale Pfade**, keine framerusercontent-URL (im Test mit `not.toContain` bewiesen); unerreichbare Font-Dateien → `asset-blocked`-Fund |
| 2.4 | Offline-Modus: lokaler Mirror als Eingabe (kein Netz), für Tests und Wiederholbarkeit | ✅ `runImport({ source: { kind: "mirror", rootDir } })` — der Mirror läuft die komplette Pipeline (IR → normalize → map → report) ohne Netz; relative Asset-URLs werden über `baseUrl` aufgelöst; `file://`-URLs nimmt auch `captureBrowser` |
| 2.5 | Idempotenz: `contentHash` je Quelle; zweiter Lauf ändert nichts | ✅ `irHashOf` (`ir1:<contentHash>:<pages>:<findingKinds>:<motion>`) + `compareRuns` (irHash, Knotenzahl, Regelzahl, Score) + `summaryOf/compareSummaries` für den S3-Schreibweg; der Test führt zwei Läufe über denselben Mirror: `identical: true`, `changes: []`, identische Node-Records |

**Abnahme:** Ein Lauf gegen eine URL erzeugt IR + Assets + `motion.json`; der zweite Lauf
ist ein No-Op (Zahlenvergleich im Test). **Erfüllt:** `runImport` über den Mirror erzeugt
IR + Regeln + Bericht (`run.assets` bei Upload/Mirror), zweiter Lauf `identical: true` mit
`changes: []`. **22 neue Tests** (assets 11, capture-browser 5 — `describe.skipIf` ohne
Chromium, import 6); **framer-import gesamt 70/70 grün**, typecheck/lint 0.

### S3 — Weg in die Engine (4 pt) — **UMGESETZT 23.09. (5. Runde)**

| # | Aufgabe | Stand |
|---|---|---|
| 3.1 | `imports-contract.ts` + `imports.ts`: Dry-Run und Schreiben, atomar, mit `baseDraftVersion` | ✅ `packages/engine/src/imports-contract.ts` (`CreateImportBodySchema` mit Quelle url/rootDir/html, `pagePath`, `assets`, `fonts`, `applyTheme`, `write`, `pageId`, `idempotencyKey`; `ImportReportSchema` — dieselbe Form für Dry-Run und Write) + `imports.ts` (`runFramerImportJob`): **Dry-Run schreibt nichts** (Report mit Score/Counts/Funden/Marquee-Kandidaten), `write: true` erzeugt die Seite (oder schreibt in `pageId`) und legt das Dokument als **eine Revision** über `store.persistBatch` ab (Audit-Eintrag `importFramer`, Draft-Version +1) — die `EditorDocument`→`NodeTree`-Übersetzung (`editorDocumentToNodeTree`) ist die exakte Umkehrung von `migrateV1ToV2`: root-primitive → `PAGE_ROOT_TYPE`, `_tablet`/`_mobile`-Suffixe → Overrides. Style-Regeln gehen mit `framer-import`-Origin durch `appendImportedStyleRules` in die site-weite Registry (eigene Audit-Mutation `importFramerStyleRules`), der Theme-Font-Patch optional über `update_theme` |
| 3.2 | `import_jobs` (Fortschritt/Schema-Muster wie `reference_jobs`) für lange Läufe | ✅ Tabelle `import_jobs` in `db.ts` (additiv, Index auf status/next_attempt_at + site), `ImportJob`-Typ in `types.ts`, Store-Funktionen `createImportJob` / `getImportJob` / `getImportJobPayload` / `listDueImportJobs` (Claim-Muster von `listDueReferenceJobs`) / `updateImportJob` / `getImportJobResult` / `setImportJobResult` — der Report liegt auf dem Job, Clients pollen statt neu zu laufen |
| 3.3 | Route `POST /api/imports/framer` (+ `GET /api/imports/:id` für den Bericht) | ✅ `POST /api/sites/:siteId/imports/framer` (Job anlegen → running → Run → succeeded/failed mit lastError; Report in den Job geschrieben; Antwort trägt den **finalen** Job-Stand + Report; Idempotenz-Schlüssel über `withIdempotency`), `GET /api/sites/:siteId/imports` (Jobliste), `GET /api/imports/:jobId` (Job + Report) — route-matrix neu erzeugt (155 Routen) |
| 3.4 | CLI `pnpm senify import framer <url\|datei> --dry-run --report` | ✅ `senify import framer <quelle>` in `packages/mcp/src/cli.ts` — die Quelle wird nach Form erkannt (http(s) → URL, `<`-Anfang → HTML-Datei, sonst Mirror-Ordner), ohne `--write` Dry-Run, `--report` gibt den vollen JSON-Bericht, sonst die Kurz-Zeilen (Score, Knoten, Deklarationen, Assets/Fonts, Funde, Marquee-Kandidaten); Programm-Token wie `deploy` |
| 3.5 | MCP: `import_framer_page`, `get_import_report` | ✅ `import_framer_page` (write-Scope, Quelle url/rootDir/html, `write`/`applyTheme`/`pagePath`/`pageId`, `idempotencyKey`), `get_import_report` (read-Scope); Annotationen: `import_framer_page` in `IDEMPOTENT_TOOLS` (serverseitiger Idempotenz-Schlüssel) **und** `OPEN_WORLD_TOOLS` (die URL-Quelle holt Fremdes) |

**Abnahme:** Dry-Run zeigt den Bericht, ohne zu schreiben; das Schreiben erzeugt **eine**
Revision/Undo-Einheit; CLI und MCP liefern dasselbe Ergebnis wie der Editor.
**Erfüllt:** `imports.test.ts` 8/8 — Dry-Run ändert die Seitenzahl nicht, Write erzeugt
eine Revision (Draft 1→2) mit `validateTreeIntegrity` = 0 und `bakePages` = 1 Seite,
Write in bestehende Seite hebt deren Draft-Version um genau 1, Registry trägt
`framer-import`-Origin, Job-Protokoll hält Report + irHash, gleiche Quelle zweimal =
gleicher irHash, lehre/ambigue Quelle → 400, Mirror-Quelle läuft offline.

### S3b — Island-Payload: ADR + Transport (5 pt, früh — die 1:1-Zusage hängt daran) — **UMGESETZT 23.09.**

| # | Aufgabe | Stand |
|---|---|---|
| b.1 | **ADR**: importierter Fremd-Code als Island — Herkunft, Version, Lizenzhinweis, Größenbudget, Grenzen (was Senify daran editieren kann und was nicht) | ✅ `docs/adr/0010-island-payload-fuer-importierten-fremd-code.md` |
| b.2 | Payload-Ablage je Site (`site_code_payloads`), Inhalt = gebundeltes Modul + Hash + Herkunft | ✅ `packages/engine/src/db.ts` (Tabelle), `store.ts` (`createCodePayload`, `listCodePayloads`, `getCodePayload(Bundle)`, `deleteCodePayload`), `code-payloads-contract.ts`, `code-payloads.ts`; Routen `POST/GET /api/sites/:siteId/code-payloads`, `GET/DELETE /api/code-payloads/:payloadId` |
| b.3 | Bake: Island-Einbindung wie `webgl-scene` (esbuild zur Bake-Zeit, Poster, Lazy-Load) | ✅ Island-Typ `payload` (`renderer/src/islands.ts`), Loader in `renderIslandsScript` (IntersectionObserver, Mount-Vertrag `export function mount(stage, options)`), Datei `assets/payloads/<id>.<hash8>.js` + Manifest `BakeResult.payloads` (`renderer/src/bake.ts`); Markup/Primitiv `payload` (`widget-engine`), Zustands-CSS (`renderer/astro-template/src/styles/components.css`). Das Bundling selbst leistet der Import-Schritt (S2); der Ablage-Vertrag prüft Mount-Export, Größe und Integrität |
| b.4 | Guardrails: Profil (`showcase` für 3D), max. N Islands je Seite, Größenbudget mit Messung | ✅ `engine/src/guardrails.ts`: `PAYLOAD_BUDGET_BY_PROFILE` (clean 1 / standard 3 / showcase 8), `MAX_PAYLOAD_BYTES` 512 KB, `MAX_PAGE_PAYLOAD_BYTES` 1,5 MB (GeprÜft im Bake), „schwere Fläche“ geteilt mit `webgl-scene` (`heavy-surface-excess`) |
| b.5 | Nachweis: Island rendert im Release und Live-Modus; ohne Dateiserver greift das Poster (gewollt) | ✅ Tests `packages/engine/test/code-payloads.test.ts` (Ablage, Herkunft, Budgets, Bake-Manifest, Poster/Platte) + `route-matrix` neu erzeugt; der Live-Modus-Nachweis folgt mit dem Import-Schritt S2 (der die echten Framer-Module einliefert) |

**Abnahme (b.1–b.4 erfüllt):** Eine importierte Code-Komponente läuft im Release (Manifest + Island-Loader +
Mount-Vertrag nachgewiesen); der Bericht nennt Herkunft und Größe (`CodePayload.provenance`, `.bytes`,
`.integrity`); ohne das Payload fällt die Stelle sichtbar auf die Platte zurück (`payload-missing`-Warnung,
`data-payload-state="plate"`).

### S4 — Oberfläche: Bericht, Klasse-C-Strecke, Kandidaten (4 pt) — **TEILWEISE UMGESETZT 24.09.**

| # | Aufgabe | Stand |
|---|---|---|
| 4.1 | Import-Dialog (Explorer → „Seite importieren"): Quelle, Vorschau, Bericht, „Übernehmen" | ✅ `packages/app/public/app.js`: Toolbar-Aktion, Quelle URL/HTML/Mirror, Ziel neue/bestehende Seite, Assets/Fonts/Theme, Dry-Run-Report und Apply; bei bestehender Seite `session.replaceDocument()`, bei neuer Seite Navigation |
| 4.2 | Klasse-C-Strecke in der Oberfläche: Nachbau-Hinweis, Island-Mount, Platzhalter als letzter Ausweg | ⚠️ `payload`-Infrastruktur und Bake-Fallback bestehen; Framer-Code/Shader werden im Import ehrlich als sichtbare `plate`-Auflösung mit Finding geführt. Echte Modul-Extraktion aus Framer-Code und automatische Island-Erzeugung bleiben als S4-Rest offen |
| 4.3 | Kandidatenliste („3 Bausteine wiederholen sich — heben?") inkl. Fingerprint-Hinweis | ✅ `library.ts` + `FidelityReport.candidates` + Engine-Report + Importdialog/Review; rekursiver, memoiserter Strukturfingerprint, keine automatische Zusammenlegung; `library.test.ts` 4 Tests |
| 4.4 | Bericht im Review sichtbar (`review_items`) und per MCP abrufbar | ✅ `ReviewItem.importReports`, additive `import_reports`-Spalte, Review-Submit-Snapshot passender Write-Jobs, `GET /api/reviews/:reviewId`, App-Reportblock, `get_review_feedback`-Beschreibung und 11 Engine-Tests |

**Abnahme S4:** ✅ Bericht im Importdialog und Review lesbar, Findings mit Evidence, Kandidaten mit Fingerprint und Klasse-C-Platten nachvollziehbar. ⚠️ Echte Framer-Fremdcode-Islands bleiben als nachgelagerter Integrationsschritt offen; dafür werden keine Payloads erfunden.

### S5 — Import-Gate (2 pt)

| # | Aufgabe |
|---|---|
| 5.1 | `scripts/verify-import.mjs` (Muster `verify-parity.mjs`), Browser **Pflicht** |
| 5.2 | Vergleich Original ↔ Import bei 1440/**1024**/390 (Entscheidung 23.09./2: 1024 überall — `analysis-worker/visual.ts` wird von 768 auf 1024 gezogen), **gegen den `animate`-Zustand auf BEIDEN Seiten** (S0/B7: der SSR-Startzustand ist unsichtbar; das Original-Capture läuft mit JS an und Animationen settled, der Senify-Bake mit `motion: off`), Toleranz verankert |
| 5.3 | CI-Schritt in `.github/workflows/verify.yml` |

**Abnahme:** Das Gate ist rot bei bewusster Verschlechterung; die Diff-Zahlen stehen im Log.

### S6 — Baustein-Bibliothek, Modell und Engine (6 pt)

| # | Aufgabe |
|---|---|
| 6.1 | Tabellen `library_components`, `site_library_installs` (in `db.ts`, additiv) |
| 6.1b | **Fixtures einchecken:** die drei Framer-Exporte getrimmt nach `packages/framer-import/test/fixtures/` (HTML + CSS + Appear-JSON, Herkunft im README notiert) — Voraussetzung für die Golden-Tests aus S1 |
| 6.2 | `library.ts`: anlegen, umbenennen, beschreiben, taggen, deprecaten, löschen (nur eigener Stand) |
| 6.3 | Heben: Kandidat → Bibliothekseintrag (Fingerprint, Normalisierung erzwungen) |
| 6.4 | Installieren: Bibliothekseintrag → Site (Pin), Entfernen → **Detach** aller Instanzen |
| 6.5 | Versionen + Drift über Sites; `update_instances` in einem Schritt |
| 6.6 | „Bibliotheks-Audit": Detach-Quoten, veraltete Pins, Variantendeckel-Warnungen |
| 6.7 | MCP-Parität: `list_library_components`, `get_library_component`, `promote_to_library`, `install_library_component`, `uninstall_library_component`, `update_library_instances`, `library_audit` |

**Abnahme (E6):** Eine importierte Komponente steht in einem **zweiten** Site als Instanz; die
Definition ist dort nicht editierbar; Overrides überleben eine Bibliotheks-Aktualisierung;
Detach erzeugt eine lokale Definition ohne Datenverlust.

### S7 — Bibliotheks-Oberfläche (4 pt)

| # | Aufgabe |
|---|---|
| 7.1 | Workspace „Bausteine": Liste, Suche, Tags, Specimen-Vorschau (Muster: Referenzen-Workspace) |
| 7.2 | Detailseite: Struktur, Varianten, Slots, Props, Herkunft, Notiz, Versionen |
| 7.3 | „Installiert auf N Sites" + Drift-Anzeige + „Aktualisieren"-Weg |
| 7.4 | Editor: Komponenten-Tab zeigt Site-Bausteine und Bibliotheks-Bausteine getrennt |

**Abnahme:** Der ganze Weg ist ohne CLI bedienbar.

### S8 — Motion-Kanal (4 pt, erst nach E2-ADR)

| # | Aufgabe |
|---|---|
| 8.1 | ADR: Import-Parameter für Motion (was erlaubt ist, was nicht) — mit den S0-Zahlen (Federn: `type/damping/mass/stiffness/delay`, Achsen x/y/scale/rotate/opacity, je Breakpoint) |
| 8.2 | Zuordnung je Kanal: **Appear** (lesbar, direkt) → Preset+Parameter · **IO-Reveal** (gemessen) → Reveal-Preset · **Hover** (CSS-Übergang `0.2s cubic-bezier(...)` + Variantenklasse) → Hover-Preset/Token · **Scroll-Transform** (Sensor) → Parallax/Scrub · **three.js** → Island (`webgl-scene`) · Rest → dokumentierter Fund |
| 8.3 | Guardrails: `showcase`-Grenzen, ein Pin je Seite, Reduced-Motion-Pflicht |
| 8.4 | Rest als Fund („Interaktion nicht abbildbar: …, Beleg: …") |

**Abnahme:** Für die Beispielseite ist die Motion-Abdeckung als Zahl belegt; kein Fund
verschwindet.

### S9 — Spätere Pakete (nicht in dieser Fassung)

Mehrseiten-Import + Navigationsbaum, CMS-Schema-Mapping (`getCollections`), Lokalisierung,
`propertyControls` → Bibliotheks-Props, E27-Anschluss (Design-System-Import für das
Theme), Promotion in Code-Sections.

**Summe S0–S8 (inkl. S3b):** ca. **40 Personentage**. Nach S0 gibt es belastbare Zahlen zur
Korrektur.

---

## 7. Teststrategie

| Ebene | Was |
|---|---|
| Golden | IR-Eingaben → erwartete Dokumente (byte-stabil), wie `css-golden` |
| Integrität | `validateDocument`, `validateTreeIntegrity`, Compiler, Bake grün |
| Idempotenz | zweiter Import = 0 Änderungen; zweiter Lauf in die Bibliothek = 0 Duplikate |
| Gate | Import-Visual-Diff (Original ↔ Import), Browser Pflicht, Toleranz verankert |
| Parität Mensch/Agent | CLI, MCP, Editor-Dialog erzeugen denselben Draft-Hash |
| Bibliothek | Install → Instanz → Override → Bibliotheks-Update → Override überlebt → Detach → Re-Attach |
| Regression | jede neue Wertform in einem echten Framer-Ausschnitt als Eingabe (kein erfundener Fall) |

---

## 8. Risiken

| # | Risiko | Gegenmaßnahme |
|---|---|---|
| 1 | **Überversprechen** („1:1 mit allen Animationen") | Fidelity-Bericht ab S3 als Produktteil; Klasse C wird benannt, nie verschwiegen |
| 2 | **Regel-Flut** (tausende `scoped`-Regeln) machen den Inspektor unbenutzbar | D3 (Zusammenfassen), Messgröße in S0, Deckel mit Warnung |
| 3 | **Recht** (fremde Vorlagen kopieren) | Herkunft in `origin` + Nutzerhinweis im Dialog; Import nur für eigene/erlaubte Quellen |
| 4 | **Bibliotheks-Verfall** (Detach schleicht sich ein) | Audit-Bericht (6.6), Re-Attach (6.4), Eigenschaften statt Detach (D4) |
| 5 | **Zwei Tablet-Breiten** (Capture 768 vs. Station 1024) | S0 legt die Messbreite fest; Gate und Import nutzen dieselbe |
| 6 | **Framer ändert sein Format** (`data-framer-*`, Klassen, SSR) | Aufnahme ist versioniert und golden-getestet; Marker sind Eingaben, nicht Annahmen |
| 7 | **Plugin-API-Abhängigkeit** | Der Link-Weg (F3/F4) bleibt gleichwertig; Plugin ist Beschleuniger, nicht Bedingung |

---

## 9. Entscheidungsstand (23.09.)

| # | Frage | Antwort | Folge im Plan |
|---|---|---|---|
| 1 | Weiter nach dem Plan | **S0 starten** (Messlauf) | `befund.md` liegt vor; Aufwände werden anhand der Zahlen korrigiert |
| 2 | Geltungsbereich der Bibliothek | **global für die Installation** | D9; Tabellen ohne Kunden-Schnitt |
| 3 | Klasse C | **nachbauen, damit es eine 1:1-Kopie wird** | D8 + §4.4 (Nachbau → Island → Platte) + **neuer ADR E6/S3b, früh** |
| 4 | Motion-ADR | **spät, nach dem Import-Gate** | D10; bis dahin trägt Stufe 2 (§4.4) |

**Entschieden (23.09.):** Der Island-ADR liegt als
**`docs/adr/0010-island-payload-fuer-importierten-fremd-code.md`** vor. Kern: Fremd-Code lebt als
**Island-Payload** neben dem Baum (`site_code_payloads`, Teil des Build-Hash), Herkunft und Lizenz
sind Pflicht (Bibliotheks-Promotion nur mit geprüfter Lizenz), neuer Island-Typ `payload`,
Budgets je Profil, drei Rückfallstufen (Payload → Poster → Platte), und Payloads laufen **nie** im
Editor-Canvas. Damit ist der ADR-Teil von S3b abgeschlossen; die Bauaufgaben bleiben.

**Nachweis S3b komplett (23.09., 2. Runde):** Das echte WaveBackground-Modul aus
`framer-fluffy-rectangle-418998` wurde mit `nachweis/wave-payload.mjs` gebündelt (esbuild,
React/three aus dem eigenen Repo statt Framer-Bindings, Mount-Vertrag `mount(stage, options)`)
und über `nachweis/beweis-lauf.mjs` durch den vollen Release-Weg geschickt: Ablage → Bake →
Manifest → ausgelieferte Datei byte-gleich → Island-Host im Markup. Der Browser-Lauf
(`nachweis/live-check.mjs` gegen den lokal geservten Bake) zeigt: `data-payload-state="mounted"`,
**Canvas rendert** (WebGL-Shader-Loop aktiv), keine Seitenfehler. Dabei **gefundene und
gefixte Bugs**: (1) die Shim-Ersetzung erzeugte eine Pfeilfunktion ohne Aufruf (`(() => {…})`
statt `(() => {…})()`) — der three.js-Body lief nie; (2) `React.createRoot` statt
`ReactDOM.createRoot` im Mount-Vertrag. **Messung:** das Bundle wiegt **2,78 MB** (three.js +
React unminifiziert inlined) — das 512-KB-Budget hätte jede echte 3D-Island blockiert; die
Budgets sind auf **3 MB je Payload / 8 MB je Seite** erhöht (`guardrails.ts`, ADR-0010 §6),
Tests 11/11 grün.
