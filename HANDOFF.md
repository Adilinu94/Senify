# Übergabe: Editor v2 (Senify)

Stand: 17.09.2026, Runde nach dem senkrechten Durchstich. Diese Datei ersetzt die frühere Übergabe zu Senify v1 und beschreibt den Stand so, dass eine Person oder ein Agent ohne Vorwissen weiterarbeiten kann: was gebaut ist, was bewiesen ist, was offen ist, wie man startet, prüft, welche Entscheidungen gelten und welche Fallen lauern.

In dieser Runde erneut geprüft (nicht aus alten Berichten übernommen):

- `pnpm test`: 921 grün, 2 übersprungen, 117 Testdateien, 0 rot (Log `.scratch/testlauf-handoff.log`).
- `pnpm typecheck`: Exit 0. `pnpm lint`: Exit 0.
- Die festen Dienste `127.0.0.1:4322` (Programm) und `127.0.0.1:4321` (Engine) waren nicht erreichbar (Ports geschlossen). Sie wurden nicht gestartet.

Alles Weitere stammt aus den unten genannten Berichten und Belegordnern und ist dort als früher gemessen gekennzeichnet. Kein Commit in dieser Runde.

## 1. Worum es geht

Senify ist eine agent-native Website-Plattform: Agenten und Menschen bearbeiten dieselben strukturierten Baupläne (NodeTrees), die zu statischen Websites gerendert werden. Das laufende Produkt (Senify v1, Tickets 01 bis 17) steht und wird nicht neu gebaut; der aktuelle Umbau "Editor v2" ersetzt nur den visuellen Editor durch drei neue Schichten: Widget-Engine (Bausteine, CSS-Compiler, Kaskade), Style-Engine (Inspektor) und Canvas-UI (Chrome). Bisher ist der senkrechte Durchstich gebaut und belegt: eine Sektion entsteht im Editor-Store, wird im echten Canvas gerendert, veröffentlicht und mit tolerantem Bildvergleich gegen die ausgelieferte Seite geprüft.

## 2. Stand in einer Tabelle

| Phase | Inhalt | Zustand | Beleg (eine Zeile) |
|---|---|---|---|
| Phase 0 | Fundament: `widget-engine` (Katalog, CSS-Compiler, Kaskade), Editor-Store, Canvas | fertig | Commit `862d795` "Phase 0 (Editor-Neubau): Widget-Katalog, CSS-Compiler, Store und Canvas"; Code in `packages/widget-engine/`, `packages/editor/src/state/`, `packages/editor/src/canvas/` |
| Phase 1 | Markup-Beschreiber, Grund-CSS in beiden Renderpfaden, senkrechter Durchstich mit Paritäts-Tor | teilweise | Durchstich steht (Commit `a53f583`; `packages/app/test/widget-slice-browser.test.ts` läuft grün); offen sind DnD, Plus-Punkte, Einfügelinie und die Katalog-Namen in der Mutations-API der Engine |
| Phase 2 | Style-Engine und Inspektor | offen | nicht begonnen; nächster Schritt laut Zustandsbuch, Umfang in `issues/02-style-engine-inspector.md` |
| Phase 3 | Editor-Chrome (Explorer, Kontextmenü, Spotlight, Inline-Edit, Tastatur) | offen | Plan und Sollbild liegen vor (`ui-plan.md`, `.scratch/editor-v2-rebuild/ui-preview/index.html`), im Neubau nicht gebaut |

Davor lag Phase -1 (belegte Auslieferungsfehler behoben, fertig, Commit `7c521e0`). Danach folgen Phase 4 (Visual Components, Sections als VCs, Puck-Cutover) und Phase 5 (Live-Mitverfolgung, Leistungsbudget), beide offen (Tickets 04 und 05).

## 3. Was gebaut ist

Je Paket unter `packages/` ein Zweck und die wichtigsten Dateien. Nur was wirklich existiert.

| Paket | Zweck | Wichtigste Dateien |
|---|---|---|
| `@senify/core` | Fehlertyp `SenifyError` und gemeinsame Grundlagen | `src/errors.ts`, `src/index.ts`, `src/testing/` |
| `@senify/section-sdk` | Schema und Typen für Sektionen (TypeBox als einzige Quelle) | `src/schema.ts`, `src/types.ts`, `src/registry.ts` |
| `@senify/widget-engine` (neu, Umbau) | Katalog der 23 Grundbausteine, der eine CSS-Compiler, die Kaskaden-Entscheidung, der Markup-Beschreiber, die Legacy-Brücke | `src/catalog.ts`, `src/markup.ts`, `src/css/cascade.ts`, `src/css/compile.ts`, `src/legacy.ts`, `src/mapping.ts`, `src/controls.ts`, `src/device.ts`, `src/types.ts` |
| `@senify/registry` | Sektionskatalog mit 28 kuratierten Sektionen, Varianten, Golden-Beispielen und React-Komponenten; dazu der gemeinsame Renderpfad | `src/index.ts`, `src/components/map.tsx` (`SectionTree`, fragt zuerst die laufende Section-Registry, dann den Katalog-Beschreiber), `src/components/primitives.tsx` (Katalog-Renderer) |
| `@senify/renderer` | Bake der statischen Seiten, Bindings, Loops, Formular-Auslieferung | `src/bake.ts` (schreibt das Grund-CSS als `assets/primitive-base.css`), `src/style-css.ts`, `src/bindings.ts`, `astro-template/src/components/Section.astro` (inlinet `PRIMITIVE_BASE_CSS` genau dann, wenn ein Katalog-Baustein vorkommt) |
| `@senify/tokens` | Theme und Tokens (Farben, Typo, Abstände, Radius) | `src/default-theme.ts` (trägt jetzt die Tiefwasser-Palette statt Indigo), `src/scales.ts`, `src/emit.ts`, `src/contrast.ts`, `src/resolve.ts` |
| `@senify/engine` | Backend: Store, HTTP-Routen, Mutations, Checks, Lifecycle, Formulare, Referenzen, Einstellungen, Mail, Backup | `src/http.ts`, `src/store.ts`, `src/mutations/contract.ts`, `src/mutations/editor-contract.ts`, `src/mutations/editor-bridge.ts`, `src/bake.ts`, `src/lifecycle.ts` |
| `@senify/editor` | der visuelle Editor. Neubau: Store, Canvas, Editor-Haut (Tokens, Schrift, Symbole). Altbestand (Elementor-nahe T17-Oberfläche, weiter in Betrieb) | Neubau: `src/state/store.ts` (EditorStore, einziges Schreibtor), `src/state/{document,operations,patches,selection,migration,consistency}.ts`, `src/canvas/{canvas,rules,styles,insert,selection,device}.ts`, `src/ui/{tokens,skin,fonts,icons}.ts`, `src/styles.ts`, `src/mount.ts`. Altbestand: `src/adapter.ts`, `src/puck.ts`, `src/panels.ts`, `src/explorer.ts`, `src/spotlight.ts`, `src/golden.ts` |
| `@senify/app` | Programm-Shell: Dashboard-Server mit Proxy, SPA, Editor-Bundle on demand (esbuild) | `src/server.ts`, `src/start.ts`, `src/startup.ts`, `public/app.js`, `public/app.css` |
| `@senify/mcp` | CLI (`senify`), MCP-Server, Token-Ausgabe, Skill-Auslieferung | `src/cli.ts`, `src/server.ts`, `src/tools.ts`, `src/clients.ts` |
| `@senify/docs-portal` | Statisches Dokumentationsportal (Astro, Pagefind, Agenten-Exporte) | `src/index.ts`, `src/portal.ts`, `src/exports.ts`, `src/reference.ts` |
| `@senify/skills` | Skillpaket für Agenten-Clients | `src/index.ts` |
| `@senify/analysis-worker` | Worker für die Referenz-Analyse und den Bildvergleich (Playwright, Pixel-Diff, Motion-Video) | `src/index.ts`, `src/visual.ts` |

## 4. Was bewiesen ist

Zahlen und Belege mit Fundort. "Heute" heißt: in dieser Runde erneut gefahren. "Frühere Runde" heißt: aus einem Bericht oder Screenshot zitiert, heute nicht erneut gefahren.

| Beleg | Zahl | Fundort | Wann |
|---|---|---|---|
| Testlage | 921 grün, 2 übersprungen, 117 Dateien, 0 rot | `pnpm test`, Log `.scratch/testlauf-handoff.log` | heute |
| Typecheck und Lint | je Exit 0 | `pnpm typecheck`, `pnpm lint` | heute |
| Durchstich Canvas gegen Release | 1120 x 48 Bildpunkte, 3 abweichende, Verhältnis 0,0000558 (Toleranz 0,01); jedes Maß gleich (maxWidth 1120px; `grid-template-columns` `362.656px 362.672px 362.656px`; `columnGap` 16px; `margin` 0px); Überlauf 0 px auf beiden Seiten | `packages/app/test/widget-slice-browser.test.ts`, Zeile `PARITY` im Test-Log; Belege `.scratch/refs/nick/ui/phase1-durchstich-canvas-voll.png`, `phase1-durchstich-release-1440.png` | heute |
| Gegenprobe des Paritäts-Tors | ohne Grund-CSS Verhältnis 0,485 und `maxWidth: none`; das Tor ist scharf genug | derselbe Test, Zeile `PARITY-GEGENPROBE`; `phase1-durchstich-gegenprobe.png`, `phase1-durchstich-ohne-grund-angleich.png` | heute |
| Grund-Styling in beiden Pfaden | Canvas-Frame und Release tragen dasselbe `PRIMITIVE_BASE_CSS` in `@layer user-authored`, byte-gleich, vor dem Markup | `packages/editor/test/canvas/rules.test.ts`, `packages/renderer/test/widget-bake.test.ts` (grün in der Suite) | heute |
| Token-Treue in Editor und Canvas | je 116 von 116 `--ed-*`-Tokens gleich `packages/editor/src/ui/tokens.ts`; Kopfleiste `rgb(2 67 100)`, Veröffentlichen-Knopf `rgb(203 255 151)`, Bühne `rgb(1 40 60)` | `.scratch/refs/nick/ui/nachweis-canvas.json` (und `nachweis-r60.json`); Test `packages/editor/test/ui/canvas-skin.test.ts` | frühere Runde (Skript `pruef-nachweis-canvas.mjs`), Test in der Suite |
| Kontraste | 41 von 41 Zeilen ohne Abweichung (`data-kontrast-geprueft="ok"`) | `.scratch/refs/nick/ui/nachweis-r60.json`; Test `packages/editor/test/ui/contrast.test.ts` | frühere Runde (Skript), Test heute |
| Symbole | Editor 36 von 36 gezeichnet, 0 Platzhalter; Canvas 2 von 2; Vorschau 195 von 199 (die 4 übrigen im eingeklappten "Weitere"-Block, kein Fehler) | `nachweis-canvas.json`, `nachweis-r60.json` | frühere Runde |
| Schrift | berechnete Familien Inter (Text) und Inter Display (Titel), sechs Schnitte geladen, CLS höchstens 0,046 | `nachweis-canvas.json`, `nachweis-r60.json` | frühere Runde |
| Zustandsprobe je Komponente | 96 Zellen, 78 sichtbar anders als die Ruhe, zwei dokumentierte Ausnahmen | `.scratch/refs/nick/ui/pruefung-zustand-layout.json`; Test `packages/editor/test/ui/zustands-und-layoutprobe.test.ts` | frühere Runde (Skript), Test heute |
| Panel-Breiten und Ziehen | Standard 320 x 264, Ziehen +40 auf 360, Grenze 420, Doppelklick zurück, Explorer 200 bis 360, kein Überlauf | `packages/app/test/editor-panels-browser.test.ts`; `.scratch/refs/nick/ui/canvas-panels-1440.png` | heute (Test in der Suite) |
| Canvas-Bausteine | `[data-widget="heading"]` mit `class="w-heading"` in allen drei Geräten, `[data-widget="divider"]` 0 Treffer (Dublette bleibt bei der Section), null Konsolenfehler | `packages/app/test/canvas-browser.test.ts` (Test heute); Belegbild `.scratch/refs/nick/ui/canvas-bausteine-1600.png` | Test heute, Belegbild frühere Runde |

Die zwei übersprungenen Tests sind die bekannten Postgres-Fälle `persistBatch transactions (real Postgres)` in `packages/engine/test/transactions.test.ts` (`describe.skipIf`, weil `TEST_DATABASE_URL` nicht gesetzt ist). Kein Test ist ohne Grund übersprungen, keiner gelöscht.

## 5. Wie man startet und prüft

### Voraussetzungen

- Node.js 24 oder neuer, pnpm 10.
- Ein Postgres. Entweder Docker (`docker compose up -d`, Postgres auf Port 5433) oder eine eigene Instanz. Die Verbindungs-URL steht als `databaseUrl` in `~/.senify/config.json` oder als Umgebungsvariable `SENIFY_DATABASE_URL`.
- Für Browser-Belege Chromium: `npx playwright install chromium`.

### Starten

```bash
pnpm install
pnpm start                # Engine und Dashboard in einem Prozess
pnpm start -- --no-open   # ohne Browser zu öffnen
```

- Programm (Dashboard): `http://localhost:4322`
- Engine: `http://localhost:4321`
- Beenden mit Strg+C. `--engine-port` und `--app-port` ändern die Ports; `--no-open` verhindert das Öffnen des Browsers.

### Ansichten im Browser erreichen

- Projekt anlegen (nur ein Name genügt), die Karte in der Übersicht öffnen, dann eine Seite öffnen.
- Die Arbeitsflächen-Ansicht (der laufende Elementor-nahe Editor) öffnet über die Adresse `http://localhost:4322/#/projects/<site-id>/pages/<page-id>?view=editor`.
- Die Canvas-Ansicht öffnet über dieselbe Adresse mit `?view=canvas`.
- Umschalten geht auch über die Knöpfe in der Oberfläche: `.editor-switch button[data-view="editor"]` und `[data-view="canvas"]`.

### Prüfen

```bash
pnpm test        # vitest über alle Pakete
pnpm typecheck   # tsc
pnpm lint        # eslint packages
pnpm verify      # build + lint + test, das Gate
```

Die zwei übersprungenen Tests brauchen echtes Postgres:

```powershell
$env:TEST_DATABASE_URL = "postgres://senify@127.0.0.1:5433/senify"
pnpm exec vitest run packages/engine/test/transactions.test.ts
```

Freiwillige Browser- und Messberichte:

- Die Skripte `pruef-*.mjs` unter `.scratch/editor-v2-rebuild/` schreiben JSON-Berichte und Screenshots nach `.scratch/refs/nick/ui/`.
- Sie starten eine eigene, flüchtige Programm-Instanz (`startProgram`, `appPort: 0` / `enginePort: 0`), fassen keinen laufenden Dienst an und beenden die eigene Instanz wieder.
- Die Browser-Tests des Repos (`packages/app/test/*-browser.test.ts`) laufen mit `pnpm test` mit und überspringen sich sauber, wenn kein Chromium vorhanden ist.

## 6. Entscheidungen, die gelten

- **Tiefwasser-Designsprache mit Limette als Signal.** Dunkles Tiefwasser (`#01283c`, `#083247`, `#024364`) als Grund, Lime `#cbff97` genau einmal je Abschnitt als Hauptaktion und Fokusring; der Inhalt bleibt die hellste Fläche. Quelle: `.scratch/refs/precious-board/design.md`, `design-guidelines.md`, `design-components.md`.
- **Tokens aus einer Quelle.** Alle Editor-Werte stehen als Code in `packages/editor/src/ui/tokens.ts`; die CSS-Variablen werden daraus erzeugt, nie abgeschrieben. Tests: `packages/editor/test/ui/plan-tokens.test.ts`, `vorschau-paritaet.test.ts`, `tokens` gegen `tokens.ts`. Die Site-Theme-Ausgabe (`packages/tokens/src/default-theme.ts`) und die Editor-Haut teilen dieselben Anker.
- **Inhaltsbereich bleibt neutral.** Die Haut trifft nur die Bedienoberfläche. Im Inhaltsdokument (iframe) stehen 0 `--ed-*`-Variablen und kein `data-editor-skin`; das Canvas-Blatt bleibt `#ffffff`. Quelle: `ui-plan.md` Abschnitt 0, `ui-design.md` Grundsatz 1.
- **Oberfläche im Modus Operate ohne KI-Look.** Zwölf Verbotsregeln (keine Verläufe, kein Glas außer der einen Spotlight-Fläche, keine Emoji, keine großen Radien, keine Dauerbewegung, keine Farbe als einziger Träger, keine zweite Palette). Quelle: `ui-design.md` Abschnitt 6.
- **Kein Code aus `Repos/elementor-main`.** Die Ablage dient nur als Bauplan; jeder Eintrag nennt Konzept, Maß und Verhalten und die Datei. Lizenz und Konzepttrennung stehen in `ui-elementor.md` Abschnitt 0. Es wird nichts kopiert.
- **Puck wird am Ende entfernt.** Strangler-Strategie (Entscheidung E2 in `map.md`): Puck bleibt bis zum Paritäts-Tor, erst danach wird er entfernt. `adapter.ts`, `puck.ts` und die Puck-Typen fallen mit dem Cutover (Ticket 06, ADR noch zu schreiben).
- **Direktes Veröffentlichen ist erlaubt.** Kein Freigabe-Gate (E4). Dafür ist die automatische Browser-Prüfung vor dem Veröffentlichen Pflicht (O9), sonst fehlt jedes Netz.
- **Eine Kaskade, ein Ort.** Alle erzeugten Regeln liegen in der einen Schicht `@layer user-authored`; die Reihenfolge macht allein die Ausgabereihenfolge der festen Stufen `base -> device -> state -> class -> inline` (schwach nach stark). `kind` (class|ambient|scoped) bleibt Datum und bestimmt die Reihenfolge nicht. Nicht geschichtetes Editor-Chrome schlägt jede erzeugte Regel. Quelle: `packages/widget-engine/src/css/cascade.ts`, `ui-plan.md` Abschnitt 0 (O1).
- **Ein Markup-Beschreiber ist die einzige Quelle.** Tag, Klassen, Attribute und Grund-CSS der 23 Bausteine stehen in `packages/widget-engine/src/markup.ts`. Canvas und Bake nutzen beide `SectionTree` und malen daraus; kein Baustein ist ein Sonderfall in einer Komponente.
- **Namensdublette `divider` und `embed` bleibt bei der Section.** Wo beide Vokabulare denselben Namen tragen, bleibt die laufende Section-Registry zuständig; der Katalog-Beschreiber greift nur, wo es keine Section-Komponente gibt (Strangler, E2). Auflösung mit dem Cutover.
- **Der Store ist das einzige Schreibtor.** Jede Änderung geht durch `EditorStore.apply` (Validierung, Patch, History); die Engine-seitige Schreib-API sind die kanonischen Mutationen (`CONTEXT.md`, ADR 0001).

## 7. Fallen und Erfahrungen

- **Dienste nach Codeänderungen neu starten.** Das Editor-Bundle (`/editor.js`) wird beim ersten Aufruf gebaut und im laufenden Prozess gemerkt (`packages/app/src/server.ts`, `editorBundle`); auch Engine und Programm halten Code im Speicher. Ein laufender Dienst zeigt sonst den alten Stand, und Messungen am alten Stand sind wertlos.
- **Für Messungen eine flüchtige Instanz verwenden.** Statt die festen Dienste zu starten, eine eigene Instanz über `startProgram` mit `appPort: 0` und `enginePort: 0` auf freien Ports aufziehen (so tun es die Browser-Tests des Repos und die `pruef-*.mjs`). Das fasst keinen laufenden Prozess an und räumt sich selbst auf.
- **Namensdublette `divider` und `embed`.** Dieselben zwei Namen stehen in `widget-engine/src/legacy.ts` und in `packages/registry/src/index.ts`. Fragt der Renderpfad den Katalog zuerst, werden Altseiten stillschweigend umgeleitet. Deshalb fragt `SectionTree` (in `src/components/map.tsx`) zuerst die Section-Registry. Reihenfolge nicht umdrehen.
- **Bildvergleich nur mit Toleranz, nie auf Pixelgleichheit.** Schrift- und Kantenglättung unterscheiden sich zwischen Canvas und Release. Das Tor von Phase 1 vergleicht daher mit Toleranz (`threshold: 24` je Kanal, Verhältnis-Obergrenze 0,01) und liest zusätzlich jedes Maß numerisch. Gegenprobe nicht vergessen, sonst sagt die Zahl nichts.
- **Sonderzeichen in Commit-Nachrichten über eine Datei übergeben.** Betreffzeilen mit Umlauten über die Kommandozeile zu übergeben verstümmelt sie unter Windows. Stattdessen in eine Datei schreiben und `git commit -F <datei>` verwenden (Beispiel: `.scratch/refs/commit-msg.txt`). Betreffzeile mit Ticketnummer, Leerzeile, `Co-authored-by`-Zeile.
- **Node kann die CLI nicht direkt ausführen.** Die Registry enthält `.tsx`-Dateien, die reines Node nicht lädt. Deshalb läuft die CLI über `tsx` (`pnpm start`, `pnpm senify`).
- **`pg-mem` verdeckt Rollback.** In der Standardsuite läuft die Datenbank auf `pg-mem` und ignoriert das Rollback in `withTransaction`. Zwei Tests prüfen das nur gegen echtes Postgres und überspringen sich ohne `TEST_DATABASE_URL` (`packages/engine/test/transactions.test.ts`).
- **React-`key` nie über einen Spread geben.** Er muss direkt am Element stehen, sonst warnt React (Konsolenfehler). Gefunden erst im Browser-Test; siehe `packages/registry/src/components/primitives.tsx`.
- **Tailwind-`@source` nach dem Staging neu schreiben.** Der Bake kopiert `astro-template` eine Ebene tiefer und rechnet den `registry`-Pfad in `global.css` neu (`packages/renderer/src/bake.ts`, `rewriteTailwindSource`). Ohne das greift Tailwind auf den falschen Quellen.
- **Bekannt flaky, nicht angefasst:** `packages/engine/test/theme.test.ts` kann beim Token-Bootstrap mit `fetch failed` / `bad port` rot werden. Ursache ist der Ephemeral-Port aus `engine.listen({ port: 0 })`; undici verweigert bestimmte Ports. In Isolation grün. Inhaltfehler ist ausgeschlossen.
- **`display: grid` für einen Gitter-Container ist kein Designwert.** Ohne es läge `grid-template-columns` auf einer Blockbox und bliebe wirkungslos. Deshalb steht im Reset von `markup.ts` `grid: ["display: grid;"]` (wie `display: flex` bei `input`).
- **`--ed-ink-faint` ist kein Textwert.** Er erreicht nur 2,64 bis 3,83:1 und wird nur für Symbole und Trenner benutzt, nie als alleinige Kennzeichnung. Auf Auswahlflächen steht nie `--ed-ink-muted`, sondern `--ed-ink-base` oder `--ed-ink-strong` (`ui-design.md` 8.3).
- **Lazy-Bilder laden im Test erst im Sichtfeld.** Für `naturalWidth`-Prüfungen erst `scrollIntoViewIfNeeded()`, und als Fixture ein echt dekodierbares PNG verwenden.
- **Zwei Sessions im selben Arbeitsbaum.** Vor jedem Commit `git status` prüfen und immer nach Pfaden stagen, nie `git add -A`. `.scratch/` und `.commandcode/` bleiben absichtlich uncommittet.

## 8. Offene Punkte und nächste Schritte

Nach Dringlichkeit geordnet, aus dem Zustandsbuch (`.scratch/editor-v2-rebuild/ledger.md`).

1. **Phase 2 beginnen: die Style-Rule-Registry im Engine-Store anlegen.** Das ist der erste Schritt und lässt sich ohne Rückfrage starten. Im Einzelnen: `sites.style_rules_json` additiv migrieren (kein `ALTER` an Bestehendem); Regeln als `kind class|ambient|scoped` mit `contextStyles`, `origin` und der Kaskaden-Reihenfolge speichern; über die Mutations-API schreibbar machen (`createStyleRule`, `updateStyleRule`, `deleteStyleRule`, `reorderStyleRule`) und mit einem Roundtrip-Test absichern (Ticket 02, Punkt 1). Berührte Stellen: `packages/engine/src/mutations/contract.ts`, `packages/engine/src/store.ts`, `packages/editor/src/state/`, `packages/widget-engine/src/css/`. Danach `pnpm typecheck`, `pnpm lint`, `pnpm test` grün fahren.
2. **Veröffentlichen und Speichern mit Katalog-Namen.** Der Durchstich veröffentlicht bisher über `bakeSite` (dieselbe Funktion, die `bakePages` der Engine ruft) und noch nicht über `POST /api/releases`; die Katalog-Namen sind in der Mutations-API der Engine nicht registriert (Strangler, E2). Fällt mit dem Cutover in Phase 4.
3. **Dublette `divider` und `embed` auflösen.** Bis zum Paritäts-Tor bleibt sie bei der Section (Katalog-Beschreiber für diese zwei ungenutzt). Auflösung mit dem Cutover in Phase 4 oder als eigene Namensentscheidung.
4. **Ziehen und Ablegen, Plus-Punkte, Einfügelinie** (Ticket 01 Punkt 7) bauen. Bewusst noch nicht gebaut (`packages/editor/src/canvas/insert.ts`: Einfügen nur per Katalog-Klick). Selektionsring und vier Handles gibt es bereits.
5. **Phase 3 (Chrome): Explorer, Kontextmenü, Spotlight, Inline-Edit, Undo-UI, Tastatur.** Umfang in `issues/03-editor-chrome.md`, ausführlicher Bauplan in `ui-plan.md` und `ui-aufgaben.md`. Offene UI-Reste laut `ui-aufgaben.md`: die Typo-Primitiven `Text`/`Micro`/`Label`/`MonoNum`, die Canvas-Kopfleiste ohne Titelzeile (nutzt dort nur `--ed-font-body`), und die Punkte 33 bis 46 (Medienwahl, Typografie-Gruppe, Bedingung, Raster, Mehrfachauswahl, Vorlesbarkeit und weitere).
6. **ADR-06 schreiben (Puck-Abschied).** `adapter.ts`, `puck.ts` und die Puck-Typen werden mit dem Cutover entfernt; der neue Vertrag ist `WidgetDefinition` plus NodeTree-v2 plus Mutations-v2. Nächste freie Nummer in `docs/adr/`.
7. **Später:** Phase 4 (Visual Components, Sections als VCs, Cutover) und Phase 5 (SSE-Kanal, Live-Mitverfolgung, Leistungsbudget).

## 9. Verweise

Plandokumente und Zustandsbuch (unter `.scratch/editor-v2-rebuild/`):

- `ledger.md` (Zustandsbuch: Ziel, Kern, Geprüft, Offen, Nächster Schritt)
- `map.md` (Umbauplan mit den Entscheidungen E1 bis E5 und den Phasen -1 bis 5)
- `ui-plan.md` (verbindlicher UI-Plan je Baustein), `ui-aufgaben.md` (Aufgabenliste und Rundenstände), `ui-elementor.md` (Bauplanauswertung mit Dateibelegen), `ui-design.md` (Werte, Regeln, Kontrastnachweise)
- `ui-preview/index.html` (Sollbild aller Komponenten und Zustände ohne Buildschritt)
- `issues/01-widget-engine-canvas.md` bis `issues/06-adr-puck-abschied.md` (die sechs Tickets)

Architekturentscheidungen:

- `docs/adr/0001-json-first-bau-modell.md`, `docs/adr/0002-astro-als-site-renderer.md`, `docs/adr/0003-gsap-als-choreografie-kern.md` (ADR-06 steht noch aus)

Designsprache (Auftraggeber, verbindlich):

- `.scratch/refs/precious-board/design.md`, `design-guidelines.md`, `design-components.md`

Belegordner (Messberichte und Screenshots, nicht committet):

- `.scratch/refs/nick/ui/` (JSON-Berichte `nachweis-*.json`, `pruefung-*.json`; Screenshots `phase1-durchstich-*.png`, `r60-*.png`, `canvas-*.png`, `layoutprobe-*.png` und weitere)
- `.scratch/testlauf-handoff.log` (Testlauf dieser Runde)
- Die Belegskripte `.scratch/editor-v2-rebuild/pruef-*.mjs`

Fachmodell und Arbeitsweise:

- `CONTEXT.md` (Fachmodell und Begriffe), `AGENTS.md` (Arbeitsweise für Agenten), `docs/agents/` (Ticketprozess, Triage, Domänendokumente)
- `README.md` (Startanleitung), `docs/adr/` (Entscheidungen)
