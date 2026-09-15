# Research 27 — Taste-Vault & Referenzen-Tab (Learnings für Senify)

> Stand 15.09.2026. Quelle: geklonte Repo `cth9191/taste-vault` (Shallow-Clone, HEAD `805dbee`, 09.09.2026, „Expand tweak studio prompt…"), Pfade relativ zu `Repos/taste-vault`. Ausgewertet: alle ~68 Dateien (App-Code, Daten, Docs, Skill, Bilder-Inventar).
> Bezug: Senify-Referenzen-Tab (Desktop-App: Referenzen · Projekte · Editor · Einstellungen) — fremde Website per KI/MCP analysieren → komplettes Designsystem speichern → Seiten „im Stil von X" bauen. Einordnung: `RESEARCH.md` §3.2 („Taste as Code"), §4.4 (Brand→Tokens-Import als Differenzierung; in `map.md` „Out of scope" als v2-Kandidat markiert), `research/22-framer-analyse.md` (Varianten-/Rhythmus-Muster).

## 1. Was taste-vault ist (Zweck, Datenmodell)

**Zweck.** Lokale, zero-build „Design-Taste-Galerie": Screenshots geliebter Websites → objektives Design-Vokabular, geclusterte Collections und paste-fertige Briefs für Coding-Assistenten (Codex, Claude Code). Eigenbeschreibung: „Inspiration in, vocabulary out" (`README.md:3`). Companion-Tool zu einem YouTube-Video; MIT-Lizenz. Es ist **kein** Website-Analyzer (keine URL-Eingabe), **kein** Token-Extraktor, **kein** Klon-Tool (Skill-Description: „not for exact site cloning", `skills/reference-to-design/SKILL.md:3`) und **kein** Mehrbenutzer-System. Der Autor liefert seinen echten Vault als Demo mit: 46 Einträge in 12 Collections plus „House DNA" (README-Angabe; im JSON verifiziert).

**Workflow (Mensch).** Browsen/Suchen → bis zu 3 Referenzen auswählen → Compare-Dialog → „Copy design brief" / „Copy combined brief" / Collection-/Style-Brief → in den Coding-Assistenten einfügen (`README.md:52-63`, `app.js:83-85,115-122`).

**Datenmodell (drei Dateien, keine DB):**

| Datei | Inhalt | Schema |
|---|---|---|
| `data/gallery.json` | Die Bibliothek („the taste database", `README.md:96`) | `meta{owner,created,version,imagesPath}` · `dna{constants[],never[]}` · `collections[]` · `entries[]` (`data/gallery.json:2-7,8-27`) |
| `data/styles.json` | 18 Standard-Ästhetikfamilien des modernen Web | je `{id,name,recognize[],vocabulary[],canonical[{name,url}],deployFor,imageStyle,risk,warning?}` (`data/styles.json:3-186`) |
| Bilddateien | `images/<slug>.png` (Seed-Set, ~46 Shots) + `generated/` (2 Beispiel-Heroes aus Recipes) | Dateiname = Entry-ID |

**Entry** (Beispiel `atelo-interior-gallery`, `data/gallery.json:242-262`): `id, file, title, collection, family, vocabulary[]` (5–8 Begriffe), `note` („the single most stealable idea"), `added`, `imageRecipe` (Stil-Prompt mit `[SUBJECT]`-Slot), `heroUsage` (wie das Bild im Layout sitzt). Quellen sind **Screenshots ohne URLs, Hex-Werte, Fonts oder Skalen**.

**Collection** = „deployable look" (`README.md:109`): `description, deployFor, vocabulary[]` (Collection-Block), `risk` (die eine kühne Bewegung), `accent` (#hex), `imageStyle` (generalisierte `[SUBJECT]`-Vorlage) — z. B. `technical-systems` (`data/gallery.json:63-80`).

**House DNA** = globale Konstanten + Never-Liste (`data/gallery.json:8-27`): „One monumental image anchors the page…"; „never: purple gradients, glossy 3D SaaS blobs, icon-grid feature rows…". README: „the never-list matters as much as the constants" (`README.md:79`). Optional in Briefs („My preferences", opt-in, `README.md:61`).

**Zwei Erfassungswege.** (a) `ingest.js` — KI-gestützt via Claude-Vision; (b) Web-Formular via `server.py` — manuell („This form does not run automatic vision analysis", `README.md:63`) mit Collection-Vererbung.

## 2. Ingest-/Analyse-Pipeline

```
node ingest.js <shot.png> [mehr …]
 1. slugify(Titel) → id, Kollisionen -2/-3 (ingest.js:77-80)
 2. Bild kopieren nach images/<id>.png (ingest.js:81)
 3. Vision-Extraktion: spawn `claude -p <prompt> --output-format text`, Timeout 180 s (ingest.js:50-54)
 4. JSON aus der Antwort per Regex `\{[\s\S]*\}` + JSON.parse (ingest.js:55-57)
 5. Collection-Zuordnung: bestehende id ODER "NEW" → newCollection seeden (ingest.js:83-105)
 6. Entry appenden, gallery.json zurückschreiben (ingest.js:107-122)
```

**Der Extraktions-Prompt** (`ingest.js:34-48`) verlangt exakt: `title`; `family` (Ästhetikfamilie); `vocabulary` 5–8 Begriffe, **objektiv und prompt-fähig** („usable in a design brief, not opinions"); `note` = „the single most stealable idea"; `imageRecipe` = Stil-Prompt mit `[SUBJECT: …]`-Slot, immer Full-Bleed-Hero-Komposition („never an isolated 3D asset, sticker, or turntable product render"), optional „STRICT palette:"-Klausel; `heroUsage` = Full-Bleed vs. isoliert-auf-Weiß vs. Split-Panel, welche Zonen textfrei bleiben; `collection` = bestehende id oder `NEW` (+ vollständige `newCollection`-Definition mit `deployFor/risk/accent/imageStyle`).

**Schwächen (kritisch):**
- Sequenziell pro Datei; Fehler überspringen Einträge (`continue`), kein Batch-Report.
- JSON-Extraktion per Regex **ohne Schema-Validierung** — Modellabweichungen werden nur teils abgefangen (`ingest.js:55-57`).
- Harte Abhängigkeit auf `claude`-CLI im PATH; kein MCP, kein Provider-Wechsel (`README.md:48`).
- Keine Qualitäts-Gates (Vokabular-Dedupe, Familien-Konsistenz) — nur der Prompt appelliert an Disziplin.
- Dateisystem als DB: Schreib-Lock nur prozessintern; parallele Ingests sind nicht vorgesehen.

**Manueller Pfad** (`server.py:29-80`): validiert Titel/Längen, dekodiert Base64, prüft Magic Bytes (PNG/JPEG/WebP, `server.py:19-26`), max 20 MB, Host-/Origin-Check (`server.py:125-129`), atomarer Write via Temp-Datei + `os.replace` (`server.py:69-78`). **Vererbung:** fehlendes Vokabular → Collection-Vokabular; fehlendes `imageRecipe` → Collection-`imageStyle`; Default-Note generisch (`server.py:62-67`). Beim Ausliefern wird `meta.imagesPath` auf einen **absoluten Pfad** umgeschrieben (`server.py:105-109`) — so tragen kopierte Briefs direkt nutzbare Bildpfade für Agenten (wichtiges Muster für Senify: stabile, konsumierbare Snapshot-Referenzen).

## 3. Struktur der Specimens/Tastes

**Ebene 1 — Entries (Brief-Vokabular).** Pro Referenz: 5–8 Vokabeln + 1 Note + `heroUsage` + `imageRecipe`. Bewusst **Prosa statt Zahlen**; Wert = Übertragbarkeit in Prompts.

**Ebene 2 — Collections (12 Look-Pakete).** Cluster mit Vokabel-Block, `deployFor` (Einsatzzweck), `risk` (die eine kühne Empfehlung, z. B. „Let the landscape occupy 90% of the viewport…", `data/gallery.json:165`), `accent`, `imageStyle`. Entries erben Defaults beim manuellen Anlegen → **zweistufige Tastes** (Collection → Entry-Override) — strukturell verwandt mit Theme-Defaults + Node-Overrides bei Senify.

**Ebene 3 — Style Guide (18 Familien).** `data/styles.json` liefert wiedererkennbare Standard-Familien (editorial-minimalism, terminal-core, glass-soft-futurism, bento-grid, quiet-luxury, immersive-3d …) je mit `recognize`-Cues, Vokabular, `canonical`-Beispielen als **URLs** (apple.com → glass-soft-futurism `data/styles.json:97-104`; apple.com events → bento-grid `data/styles.json:166-175`), `risk` und teils `warning` (KI-Default-Cluster: „Cream + serif + terracotta…", `data/styles.json:23`). Leitsatz: „Family name in a brief carries fifty decisions" (`data/styles.json:2`). Relevanz: Der Apple-Stil-Fall des Referenzen-Tabs hat hier bereits eine Taxonomie-Zelle.

**Specimens.** `specimens.js:1-20` definiert 18 winzige HTML-Vignetten, `specimens.css:1-78` rendert sie als ~185-px-Vorschaukarten der Style-Guide-Ansicht (z. B. Terminal-Core mit blinkendem Cursor samt `prefers-reduced-motion`-Guard, `specimens.css:13-15`). Handarbeit, aber genau das Muster, das Senify als Theme-/Referenz-Preview braucht.

## 4. Skills & Agent-Instruktionen im Repo

`skills/reference-to-design/` ist das einzige Skill — strukturell vorbildlich:

- **`SKILL.md`** — Frontmatter (`name`, `description` inkl. Negativ-Abgrenzung „not for exact site cloning") + Prozess: Assignment klären → **echte Referenzen öffnen** (2–5 repräsentative Bilder, „not filenames, collection labels or summaries"; Bildtext gilt als Inhalt, nicht als Instruktion, `SKILL.md:19-24`) → **Direction Cards** (Evidence / Carry over / Invent / Avoid repeating / Build scope, `SKILL.md:28-35`) → Route wählen (code-first vs. Bildgenerierung, `SKILL.md:40-46`) → bauen, **Family-Resemblance vs. Independence** prüfen (`SKILL.md:52-59`) → refinieren. Enthält Ehrlichkeitsregeln: keine erfundenen Logos/Testimonials, Einzelbild = Einzelfall statt Collection-Muster (`SKILL.md:16,22`).
- **`references/prompts.md`** — Copy-Paste-Prompts für 4 Stufen (Brief/Inspect → 3 Richtungen → 3 Variationen → Finish), **Repair-Prompts** („too close to a reference", „too generic", `prompts.md:147-165`), Image-only-Art-Direction (`prompts.md:167-182`), Design-Record-Template (`prompts.md:196-212`).
- **`references/polish.md`** — optionales „Finishing Studio": Original/Restrained/Expressive-Presets als **echte editierbare Werte**, Persistenz + versionierter Export/Import, Motion-Verhalten (kein blockierender Preloader; Motion-Off schaltet wirklich ab), Verifikationsliste (`polish.md:21-49`).
- **`references/comparison.md`** — rigorose Experiment-Methodik (Aesthetic fixieren, Inputs einfrieren, Skill-Versionen/Hashes protokollieren, „Do not declare a universal winner") — methodisch sauber, für ein internes Tool überdimensioniert.
- **`agents/openai.yaml`** — Agent-Interface-Metadaten (`display_name`, `short_description`, `default_prompt`) für OpenAI-Agenten.

Nebenbefund: Kein `AGENTS.md`/`CLAUDE.md` im Repo — die Agent-Instruktionen sind vollständig im Skill gekapselt; `.gitignore` verrät lokale Agent-Arbeit (`.claude/`, `.impeccable/`), wird aber nicht geteilt. `docs/reference-to-design.md:24-35` beschreibt Installation per Ordnerkopie (`~/.codex/skills/reference-to-design`), macht explizit, dass das Skill nicht von Taste Vault abhängt und Referenzen lokal bleiben sollen; Version 0.2.0 mit ehrlichem Reifegrad-Hinweis (`docs/reference-to-design.md:53`).

**Relevanz für Senify:** Genau das Format, das Senifys Skillpaket (Artefakt 11) braucht — knappes `SKILL.md` + ausgelagerte `references/`, Negativ-Abgrenzung in der Description, Repair-Loops, Design-Record. Der Prozess (Referenz → Richtungen → Variationen → Finish) ist die Blaupause für „Site im Stil von X", gehört aber an Senifys Registry/MCP gekoppelt (Skills müssen konkrete Section-/Preset-Namen und Tool-Aufrufe referenzieren statt frei zu formulieren).

## 5. Referenzen-Tab: Architektur-Skizze (Referenz → KI-Analyse → Designsystem → Wiederverwendung)

> Einordnung: Das Feature ist „Brand→Tokens-Import" (`RESEARCH.md` §4.4) und in `map.md` („Out of scope") bewusst als v2-Kandidat markiert. Taste-vault validiert Konzept und letzte Meile (Vokabular/Brief/UX), liefert aber **kein** URL-Crawling, **keine** Token-Extraktion und **keine** MCP-Integration — die Maschinerie ist selbst zu bauen.

### 5.1 Zielbild

Referenzen sind **workspace-scoped Ressourcen** (kein Site-Bestandteil). Eine Site/ein Theme referenziert eine oder mehrere Referenzen; „Erstelle die Seite im Apple.de-Stil" wird intern zu: `Reference (apple.de) → DesignProfile → Theme-Draft + Style-Brief → create_page mit theme + style_context`.

### 5.2 Pipeline

```
URL (z. B. https://www.apple.de)
 │
 ├─ 0. Governance: robots/ToS-Check, nur interner Gebrauch, Snapshot-Hash, Provenance-Notiz
 │
 ├─ 1. Capture (server-seitiger Job, Playwright headless)
 │     Viewports: Desktop 1440 / Tablet ~810 / Mobile 390 (Framer-Varianten-Muster, research/22)
 │     Artefakte: Full-Page-Shots, Hero-/Sektions-Shots, DOM-Dump, Asset-Liste
 │     Motion: Scroll-/Hover-Sampling, Transitions/Durations/Easings, Lib-Detektion (GSAP/Lenis)
 │
 ├─ 2. Deterministische Extraktion (Code, kein LLM — genau das leistet taste-vault NICHT)
 │     Farb-Histogramm (hex + Flächenanteil) → Palettenkandidaten
 │     Font-Inventar (Familie/Weight/Size/LineHeight/LetterSpacing + Rollen h1…p/Button)
 │     Spacing/Radii/Shadows/Container (geclustert zu Skalen), Breakpoints aus Media Queries
 │
 ├─ 3. KI-Analyse (MCP-Tool `analyze_reference`; Vision + Extrakt als Input)
 │     - Familien-Klassifikation (Seed: styles.json-Taxonomie, 18 Familien)
 │     - Vocabulary nach taste-vault-Muster (objektiv + prompt-fähig, ingest.js:34-48)
 │     - Komponenten-Inventar (Nav, Buttons, Karten, Forms …) + Varianten
 │     - Kompositionsregeln (heroUsage-Analog), Do-/Don't-Listen
 │     - Evidenz + Konfidenz je Aussage; keine erfundenen Werte; Widersprüche markieren
 │
 ├─ 4. DesignProfile (JSONB, DTCG-nah; deckt artifacts/07-System ab)
 │     tokens{color,type,space,radius,shadow,motion} + families[] + components[]
 │     + vocabulary[] + evidence[] + snapshots[] + provenance{url,date,hash}
 │
 ├─ 5. Kuratierung im Referenzen-Tab (Mensch)
 │     Token-Swatches, Typo-Skala, Komponentenliste, Motion-Recording prüfen,
 │     korrigieren, freigeben (Approval-Muster wie artifacts/06)
 │
 └─ 6. Wiederverwendung
       a) Theme-Draft: Profil → Primitives/Semantik-Mapping über die Token-Skalen-Engine (artifacts/07)
       b) Agenten-Kontext: `get_reference(id)` liefert maschinenlesbaren Style-Brief
          (ersetzt taste-vaults Copy-Paste-Brief, app.js:81-85)
       c) Sektions-/Motion-Mapping: Familie → Varianten + Preset-Empfehlungen (artifacts/03/08)
       d) QA: Style-Adhärenz-Check generierter Seiten gegen das Profil (Visual-Diff + Regeln)
```

### 5.3 Datenmodell-Skizze (Postgres)

`reference`: `id, workspace_id, source_url, captured_at, status (draft|analyzed|approved|archived), family[], vocabulary[], profile JSONB (Tokens/Komponenten/Motion), snapshots JSONB, provenance JSONB, revision` — Revisionen analog Senifys Revisionsmodell; Themes/Sites referenzieren `source_reference_id` (Provenance bis in die generierte Site). Suche: Volltext + Embeddings statt Substring.

### 5.4 Was taste-vault liefert / was fehlt

**Direkt verwertbar:** Familien-Taxonomie + Warnungen (`data/styles.json`), House-DNA-Konzept (Workspace-/Site-Rules), Extraktions-Prompt-Bausteine (`ingest.js:34-48`), Brief-Format (`app.js:81-85`), Gallery-/Compare-/Inspector-UX (`index.html:30-47`, `app.js:29-128`), Prozess-Skill inkl. Repair-Prompts (`skills/reference-to-design/`), Specimen-Idee, Server-Härtungsmuster, Collection-Inheritance, absolute Referenzpfade.

**Fehlt (Selbstbau):** URL-Capture/Crawl; Computed-Styles-/Token-Extraktion; Motion-Capture; Komponenten-Mining; strukturierte Speicherung/Versionierung/Provenance; Semantic Search; MCP-Integration statt Copy-Paste; Provider-Agnostik; Governance (Rechte, robots, keine Brand-Assets); Multi-User/Concurrency; „too close"-Guardrails in der Generierung.

## 6. Übernahme-Tabelle (Element | taste-vault-Ansatz | Empfehlung | Quelle: Dateipfad)

| Element | taste-vault-Ansatz | Empfehlung für Senify | Quelle |
|---|---|---|---|
| Style-Familien-Taxonomie | 18 Familien mit `recognize`-Cues, Vokabular, `canonical`-URLs, `risk`, `warning` | Als Seed fürs Referenzen-Tab übernehmen (inkl. KI-Default-Warnungen); kuratiert erweiterbar | `data/styles.json:2-186` |
| House DNA | `constants[]` + `never[]`, optional in Briefs | Als Workspace-/Site-Rules (Do/Don't) ins Skill-/Prompt-Paket; Never-Listen ernst nehmen | `data/gallery.json:8-27`, `README.md:75-83` |
| Vision-Extraktion | Prompt für objektives, prompt-fähiges Vokabular + „stealable idea" + Komposition | Prompt-Teil übernehmen; Ausgabe zusätzlich schema-validiert und um Tokens/Komponenten erweitert | `ingest.js:34-58` |
| Brief-Konstruktion | `entrySection`/`buildBrief`/`styleBrief`: Evidence → Borrow → Composition → DNA | Als **maschinenlesbaren** „Style-Brief" ans MCP hängen statt Copy-Paste-Text | `app.js:81-85` |
| `[SUBJECT]`-Slot-Konvention | Recipe = Stil gelockt, Subjekt swappable; „STRICT palette"-Klausel | Für Bild-Assets: Referenz liefert Stilparameter, Rendering ersetzt Subjekt | `ingest.js:43`, `data/gallery.json:259,299` |
| Gallery-/Compare-UX | Karten, Suche, max. 3, Compare-Dialog, Inspector, Style-Guide-View | UI-Blueprint für den Referenzen-Tab (nachbauen, nicht Code kopieren) | `index.html:30-47`, `app.js:29-128` |
| Prozess-Skill | Inspect → Direction Cards → 3 Richtungen → Variationen → Polish + Repair-Prompts | Als Senify-Skill (Artefakt 11) übernehmen, an Registry/MCP koppeln | `skills/reference-to-design/SKILL.md:10-69`, `references/prompts.md:147-165` |
| Transformationsdisziplin | „Family resemblance vs. independence"; nie Subjekt+Layout+Palette+Fokus als Paket kopieren | Guardrail für „im Stil von X": Designsystem generalisieren, Brand-Assets/Inhalte nie übernehmen | `SKILL.md:26-41,54-59` |
| Specimens | 18 handgebaute CSS-Vignetten als Style-Vorschau | Theme-/Referenz-Preview im Tab — generiert statt handgebaut | `specimens.js:1-20`, `specimens.css:1-78` |
| Server-Härtung | Origin-/Host-Check, Magic Bytes, Größenlimit, Lock, atomares Schreiben | Gleiche Muster für Senify-Upload-/Import-Endpunkte | `server.py:15-26,54-79,120-145` |
| Collection-Inheritance | Entry erbt Collection-Vokabular/`imageStyle`; Overrides möglich | Entspricht Theme-Defaults + Node-Overrides (Token-Ebenen) | `server.py:62-67` |
| Absolute Referenzpfade | Server schreibt `meta.imagesPath` absolut → Briefs tragen nutzbare Pfade | Signierte, stabile Snapshot-URLs im Agenten-Kontext | `server.py:105-109`, `app.js:10,82` |

## 7. Nicht übernehmen (und warum)

1. **Screenshot-First statt URL-First.** taste-vault nimmt fertige Bilder; kein Crawler, keine Computed Styles, keine Extraktion von Tokens/Komponenten (`ingest.js`, `README.md:63-71`). Für Senify ist genau das Kernauftrag — Screenshot bleibt nur Zusatz-Input (Upload aus Figma/PDF).
2. **LLM-Prosa als einziges Analyse-Ergebnis.** Vokabular + Note sind wertvoll, aber kein Designsystem. Senify ist Tokens-first (Artefakt 07): Farben/Fonts/Skalen/Radii/Shadows/Motion deterministisch extrahieren und validieren; KI klassifiziert und beschreibt, erfindet aber keine Werte.
3. **`claude -p`-Subprozess + Regex-JSON.** Nicht provider-agnostisch, nicht beobachtbar, ohne Schema-Validierung, 180-s-Timeout (`ingest.js:50-57`). Senify: serverseitiger Job + MCP-Tool, validierte Ausgaben (TypeBox), Retry/Progress.
4. **Flache JSON-Datei als Datenbank.** Single-User-localhost, Prozess-Lock, kein Modell für Revisionen/Suche/Concurrency (`server.py:54-79`). Senify: Postgres + JSONB + Revisions-/Release-Modell.
5. **Single-Label-Klassifikation.** Ein Entry gehört genau einer Collection an (`ingest.js:83-105`) — zu starr; Senify: Multi-Facet (Familie + Tags + Nutzungskontext), semantische Suche.
6. **Fremd-Screenshots als Repo-Bestand.** `images/` enthält ~46 Bilder fremder Websites (teils mehrere MB); Rechte nur als README-Hinweis („all rights remain with their creators", `README.md:112-114`). Für Senify: eigener Media-Store (Hash-Dedupe), Provenance-Pflicht, keine Weitergabe/Redistribution, Aufnahme-Rechte prüfen.
7. **„1:1 im Stil von Apple"-Framing.** taste-vault ist explizit Anti-Klon und verlangt aktive Abgrenzung (`SKILL.md:3,26-41`) — richtig so. Senify sollte das Feature als „Designsystem-Inspiration" positionieren, mit harten Guardrails (keine Logos/Brand-Assets/Fotos, keine identischen Layouts bei Kundensites) und rechtlicher Sensibilisierung (ToS, Marken-, UWG-Risiko). Der „too close"-Repair-Prompt (`prompts.md:147-155`) ist die operative Umsetzung.
8. **Handgebaute Specimens als Skalierungsmodell.** 18 kuratierte CSS-Vignetten sind Demo, kein System (`specimens.js`). Preview muss aus dem extrahierten DesignProfile generiert werden.
9. **localStorage-/Browser-only-Zustand.** Preferences/Selection liegen im Browser des Nutzers (`app.js:6,119`). Senify: serverseitig, workspace-scoped.
10. **Vergleichs-/Matrix-Experimentmodus.** Methodisch sauber (`references/comparison.md`), für ein internes Agency-Tool überdimensioniert — höchstens optionale QA-Doktrin.
11. **Vanilla-JS-Zero-Build als Codebasis.** Die App ist ein 19-KB-`app.js` ohne Framework — gut als UX-Referenz, nicht als Fundament der Senify-Desktop-App (TS/React-Stack; Desktop-Shell-Frage offen).
