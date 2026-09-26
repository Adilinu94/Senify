# Framer-Import in Senify — Recherche und Vorgehensweise

> Historischer Recherche-Stand vom 23.09.2026. Frühere Annahmen und offene Messfragen sind kein automatisch aktueller Produktstand. Maßgeblich ist `docs/current/stand.md`.

**Stand:** 23.09.2026
**Auftrag:** Framer-Seiten „1:1" als **bearbeitbare** Seite in den Senify-Editor importieren —
nicht als Referenz, sondern als NodeTree, der sich wie in Framer bearbeiten lässt
(Einstellungen, Stile, Animationen).
**Vorgeschichte:** Der Punkt steht seit dem 19.09. im Verbesserungsplan als
**L31 / I36 („nach VC-Modell + Versionierung", Priorität P3, Größe L)**
(`docs/verbesserungsplan.md:254,679,1182`). Das VC-Modell (Visual Components,
Varianten, Versionen) ist am 22.09. fertig geworden — die Voraussetzung ist damit erfüllt.

**Lesehilfe für die Beleg-Tags**
`belegt` = im Code/Repo/Originaldokument nachgesehen · `gemessen` = an echten
Framer-Artefakten geprüft · `offen` = noch nicht nachgewiesen, mit Prüfschritt benannt.

---

## 1. Anspruch und was „1:1" wirklich heißt

„1:1" kann drei verschiedene Dinge bedeuten, und sie sind nicht deckungsgleich:

| Lesart | Ergebnis | Erreichbar? |
|---|---|---|
| **Bildgleichheit** („sieht aus wie vorher") | Pixel-Diff ≈ 0 gegen die Originalseite | ja, mit Vertretern; beweisbar per Visual-Diff |
| **Bearbeitbarkeit** („ich kann jeden Abschnitt, jede Farbe, jeden Abstand anfassen") | jedes Element ist ein Node mit Style-Regel im Inspektor | ja, über Primitiv + offenes CSS |
| **Werkzeug-Gleichheit** („ich kann es so bearbeiten wie in Framer — mit Framers Animationen, Komponenten, CMS") | Framer-Semantik überlebt den Import | **nur teilweise**; braucht bewusste Modell-Erweiterungen |

Die dritte Lesart ist die, die der Auftrag meint, und die einzige, die nicht
vollständig erfüllbar ist. Grund: Senify hat bewusste Modell-Entscheidungen
getroffen, die ein 1:1 der Framer-Semantik ausschließen — **kein freier Code pro
Site** (ADR-0001), **keine freie Motion-Timeline** (ADR-0006), **drei
Gerätestationen** (O10), **Registry ist Gesetz**. Ein Import, der das umgeht,
wäre keine Funktion, sondern eine Hintertür (ADR-0001 nennt das ausdrücklich so).

**Deshalb die Linie dieses Vorschlags:** Der Import wird so nah an Framer gebaut,
wie das kanonische Modell trägt — und **jede** Abweichung wird als Datensatz
geführt, nicht verschwiegen. Nichts wird stillschweigend geschluckt
(„Fehlerbericht statt stillem Überspringen", dieselbe Regel wie beim
Referenz-Bulk-Import, `docs/verbesserungsplan.md:875`).

---

## 2. Die Zielfläche: was Senify aufnehmen kann

Was der Import erzeugen darf, ist der Editor-NodeTree v2 (`packages/editor/src/state/document.ts:40`):

- `EditorNode { id, primitive, props (DeviceValueMap), variant?, states?, children?, slots?,
  classes?, motion?, hidden?, hiddenDevices?, locked? }`
- `EditorDocument { version: 2, rootNodeId, nodes, styleRules }`

**23 Primitive** stehen bereit (`packages/widget-engine/src/catalog.ts:162-734`):
`frame, column, grid, section, heading, text, body, button, link, list, image, video,
icon, input, select, checkbox, submit, table, accordion, divider, embed, collection, root`.
Dazu die strukturellen Komponenten-Typen (`__component`, `__component_instance`,
`__component_slot`).

**Die entscheidende Freiheit ist ADR-0005 (offenes CSS).** Der Stilwert-Raum ist
offen: echte CSS-Properties, freie Werte (geprüft durch die Wert-Grammatik),
drei Regelarten — `class`, `ambient` (freier Selektor), `scoped` (an genau einen
Knoten gebunden) — plus `states` (hover/focus/active/disabled),
`contextStyles` (beliebige `@media`/`@container`/`@supports`) und `rawCss`
(`@keyframes`). Der Compiler reicht unbekannte Properties durch
(`packages/widget-engine/src/css/compile.ts:200-260`, `properties.ts`).

Daraus folgt der wichtigste Befund dieser Recherche:

> **Senify kann Framer-Layouts verlustfrei als CSS aufnehmen** — inklusive
> `position: absolute`, `inset`, `transform`, `clip-path`, `z-index`, Grid-Spans,
> Pseudo-Elementen und Keyframes. Was fehlt, ist nicht das CSS-Modell, sondern
> die **Semantik** (Komponenten, Varianten, Interaktionen) und die **Oberfläche**
> (Regler dafür).

Was ebenfalls schon existiert und den Import billiger macht, als er aussieht:

| Baustein | Ort | Nutzen für den Import |
|---|---|---|
| `origin: { source, ordinal }` an Style-Regeln | `packages/widget-engine/src/css/style-rule.ts:40` | **Re-Import-Identität ist im Modell vorgesehen** — „the identity a re-import reconciles against" |
| `authoredBy: "user" \| "agent" \| "preset"` | ebd. | Import schreibt `preset`, damit die Token-Fence (`engine/src/style-fence.ts`) greift, ohne Menschen zu blockieren |
| Device-Suffixe `_tablet` / `_mobile` | `packages/widget-engine/src/device.ts` | Framer-Breakpoints landen als Gerätestufen |
| Visual Components + Varianten + Overrides | `packages/editor/src/state/components.ts` | Framer-Komponenten mit Varianten → VC + Varianten |
| MotionSpec (Preset + Intensity + Tokens + Trigger) | ADR-0006, `packages/section-sdk` | Framer-Appear/Scroll → Presets, wo die Form passt |
| Playwright-Visual-Harness mit Motion-Kill-Switch | `packages/analysis-worker/src/visual.ts:22-46` | Import-Beweis: Original vs. Import bei 1440/768/390 |
| Paritäts-Tor als CI-Blocker | `scripts/verify-parity.mjs` | Muster für ein **Import-Gate** |
| Capture-Fallback-Kette | `packages/engine/src/references-capture-chain.ts` | Playwright → Firecrawl → HTTP; wiederverwendbar |

---

## 3. Die Quellen: fünf Wege an die Framer-Seite

Der Import ist nur so gut wie seine Quelle. Deshalb zuerst die Quellenlage — sie
ist der eigentliche Kern der Entscheidung.

### F1 — Framer Plugin SDK (die strukturierte Quelle)

Ein eigenes Framer-Plugin läuft im Projekt und liest den Canvas über die
offizielle API.

**Belegt** (Framer-Entwicklerdoku, Traits-Matrix
`framer.com/developers/reference-legacy/plugins-traits`, abgerufen 23.09.2026):
lesbar sind u. a. `name`, `visible`, `locked`, `backgroundColor`, `backgroundImage`,
`backgroundGradient`, `opacity`, `rotation`, `borderRadius`, `border`, `imageRendering`,
`zIndex`, `overflow(X/Y)`, `position`, `top/right/bottom/left`, `centerX/centerY`,
`width/height`, `min/max*`, `aspectRatio`, **`layout` (Stack oder Grid)**, `gap`,
`padding`, Layout- und Grid-Item-Eigenschaften (`gridColumnCount`,
`gridItemColumnSpan`, …), bei Text `font`, `inlineTextStyle`, `textTruncation`,
`link`/`linkOpenInNewTab`, bei SVGs das Markup, bei Komponenten
`componentIdentifier`, `componentName`, **`controls`** (Property Controls),
`isVariant`, `isPrimaryVariant`, `inheritsFromId`, `isBreakpoint`,
`isPrimaryBreakpoint`, bei Web-Pages `path` und `collectionId`.

Zusätzlich (`framer.com/developers/styles`, `.../nodes`):
- **`getColorStyles()`** — jede Farbmarke mit **light und dark** → direkt Senify-Theme-Tokens inkl. Dunkelmodus.
- **`getTextStyles()`** — Typo-Stile **mit bis zu vier Breakpoints** (`minWidth` + Overrides).
- `getCollections()` / `getCollection()` — CMS-Schemata und -Einträge.
- `getCodeFiles()`, `getCustomCode()` — Code-Komponenten und Custom-Code.
- `getCanvasRoot()`, `getChildren()`, `getParent()`, `getSelection()`, `getRect()`.
- **Replicas**: `node.isReplica` — „Replica nodes are used within non-primary
  Breakpoints and Component variants and inherit attributes from the primary"
  (`framer.com/developers/nodes`). Also sind **Breakpoint-Varianten und
  Komponenten-Varianten als Replica-Bäume lesbar**.
- Seit dem Canvas-API-Update laut Changelog: „Added support for layout traits,
  including stack, grid, padding, and gap."

**Nicht in der Traits-Matrix, also `offen`:** Es gibt **kein** Trait für
Animationen, Appear-Effekte, Scroll-Transforms, Transitionen oder Overrides.
Die Matrix kennt nur `gesture` („Gesture state for component variants").
**Folgerung:** Struktur, Styles, Tokens, Varianten und Layout bekommt man
geschenkt — **die Animationen nicht**. Sie müssen am gerenderten Ergebnis
gemessen werden (F4) oder aus dem Bundle gelesen werden (F2).

*Aufwand:* ein Plugin (kleines TypeScript-Paket, `framer`-API), das den Baum
serialisiert und als JSON herunterlädt. Nur für Projekte, an denen der Nutzer
Zugang hat.

### F2 — Veröffentlichtes Modul-Bundle (`main.mjs` + `chunk/*.mjs`)

Framer publiziert ES-Module, aus denen die Seite rendert. Genau die liest
**unframer**: „The CLI fetches each component's JavaScript URL from Framer's CDN …
esbuild bundles everything … Unframer runs each component in Node.js and reads the
`propertyControls` field" (`unframer.co/how-it-works.md`).

**Belegt:** machbar, und die Property Controls (Variantennamen, Skalare, Bilder,
Links, RichText, Slots) sind so auslesbar. Der Baum selbst ist minifiziert; die
Baumwahrheit entsteht erst durch Rendern (React-SSR) — und damit ist man wieder
bei F3/F4. **Bekannte Grenzen laut unframer-Doku:** „Framer CMS data is not
exported", „complex page transitions between Framer pages are not preserved".

*Nutzen:* zusätzlich zu F3 der **Komponenten-Metadaten-Kanal** (welche Variablen
hat eine Komponente, welche Wertebereiche) — ideal für die VC-Definitionen.

### F3 — Statische SSR-Ausgabe: HTML + generiertes CSS

Framer liefert serverseitig gerendertes HTML mit einem **sehr reichen**
Marken-Satz. **Gemessen** an `C:\Users\adini\FramerExport\framer-stupendous-football-158496\index.html`:

| Marker | Anzahl | Bedeutung für den Import |
|---|---|---|
| `data-framer-name` | 196 | **der Ebenenname aus dem Framer-Canvas** → Node-Label |
| `data-framer-component-type` | 254 | „RichText", „Image", „SVG", … → Primitiv-Wahl |
| `framer-XXXXXX` Klassen | — | Klassen pro Knoten → `scoped`-Regel je Knoten |
| `framer-v-XXXX` | — | **Varianten-Klasse** → Variantenzuordnung |
| `framer-styles-preset-XXXX` | — | **Framer-Textstil** → Senify-Klasse/Token |
| `data-framer-appear-id` | 3 | **Appear-Animation vorhanden** (Parameter nicht im HTML) |
| `data-framer-stack-*` | ~20 | Stack-Layout mit Richtung, Gap, Wrap → `column`/`grid` |
| `<style data-framer-font-css>` | 3 Blöcke | Fonts + `@font-face` → Theme/Fonts |
| `<!-- Published … -->`, `data-framer-hydrate-v` | — | Herkunftsnachweis für `origin.source` |

Der Vorteil: **deterministisch, offline, ohne Browser.** Kein Hydration-Rennen,
kein „warten bis `#main` da ist". Die CSS-Klassen sind 1:1-Etiketten, die sich
sauber auf `scoped`-Regeln abbilden lassen (Framer-Klassen sind ohnehin
knotengebunden — zwei Wahrheiten entstehen nicht).

### F4 — Gerenderte Seite + Browser-Probe (die Messwahrheit)

Am laufenden Dokument wird gemessen, was in HTML/CSS nicht steht:

- `getComputedStyle` je Element → der tatsächlich gemalte Wert (löst Kaskade,
  Kürzel, vererbte Werte, `clamp()`, `calc()` auf).
- **`motion-probe.js`** aus `Repos/site-clone/skills/clone-site/scripts/` (423 Z.):
  stellt der laufenden Bibliothek die Fragen direkt — alle GSAP-Tweens,
  `ScrollTrigger.getAll()` mit `trigger/start/end/scrub/pin/vars`, WAAPI-Keyframes,
  CSSOM-`@keyframes`, Lenis-Optionen, Swiper/Splide-Parameter, IntersectionObserver-
  Registrierungen. Kommentar dort: „This is the difference between 'uses scroll
  animations' and 'ScrollTrigger pinned to .hero, scrub:true, scale 1→0.3'."
- **`tokens-probe.js`** (178 Z.): Farbskala, Typo-Skala, Abstände, Radien, Schatten,
  Z-Benenen, Breakpoints, `:root`-Custom-Props — frequenzgerankt (System vs. Einzelfall).

**Das ist der einzige Weg zu den echten Animationsparametern.** Für den Import
ist das der teure, aber unverzichtbare Teil — und er ist im Repo bereits als
erprobtes Werkzeug vorhanden (`Repos/site-clone`, „Clone for migration, recovery
of your own lost source").

### F5 — Statischer Mirror (Byte-Treue)

`danbenba/FramerExport` (Puppeteer: Captures + URL-Rewriting + Asset-Download,
`src/exporter/capture.ts`) und der „fidelity fast path" aus
`Repos/site-clone/skills/clone-site/references/fidelity-fast-path.md`
(„captured post-hydration HTML + the site's own stylesheets + rewritten paths …
Validated at 0.02–0.06 % pixel diff in one pass").

Ergebnis: eine **nicht** editierbare, aber bildgenaue Kopie. Zwei Nutzen:
1. **Bild-Wahrheit** für den Import-Beweis (Referenz für den Visual-Diff).
2. **Offline-Capture**: einmal spiegeln, dann ohne Netz und ohne Framer-CDN
   wiederholt importieren (Assets lokal, stabile Eingabe für Tests).

### F5b — „Migration Pack" (Inhalts-, Token- und SEO-Schicht)

Der dritte vom Nutzer genannte Repo (`font2yeux/font2yeux.github.io`) ist kein Baum-Import,
sondern der **strukturierte Nebenausgang** derselben Werkzeugkette: `migration-manifest.json`
(Site-Map), `content/*.md` je Seite, `seo/` mit JSON-LD, `fonts.css`,
**`design-tokens.json`** und `redirects.json` — ausdrücklich zum Weitergeben an ein
Coding-Tool gedacht. **Bedeutung für uns:** Das ist die Vorlage für den **Token-, Font-,
Inhalts- und SEO-Teil der Import-IR** — und der Beleg, dass die Absicht („Seite in ein
anderes System überführen") auch außerhalb der Byte-Kopie als Datei-Pack existiert.

### F1 vs. F3/F4 — was der Zugang ausmacht (die Frage aus der Rückmeldung)

Kurz: **Mit Plugin-Zugang bekommt man Framers eigene Daten, ohne Zugang bekommt man
Framers Ergebnis.** Das ist der ganze Unterschied — und er schlägt sich in vier Punkten
nieder.

| | **Eigenes Projekt + Plugin (F1)** | **Nur der Online-Link (F3 + F4)** |
|---|---|---|
| Was gelesen wird | Canvas-Knoten über das Framer-SDK | gerendertes HTML + generiertes CSS + Laufzeitmessung |
| Struktur | **echter Baum**: Stack/Grid/absolute, Padding, Gap, Align, Spans, Replikas je Breakpoint und je Variante | rekonstruiert aus CSS + `data-framer-*`-Markern; im Ergebnis meist gleich, im Detail (verschachtelte Replikas) unschärfer |
| Farb- und Textstile | **mit Namen**, Farben mit light **und** dark, Textstile mit bis zu vier Breakpoints | nur als erzeugte Klassen (`framer-styles-preset-*`) und gemessene Werte |
| Komponenten | **echte Definitionsgrenzen**, Varianten, `controls` (Property Controls), Nested Components | nur als Klassen-/Namensspuren (`framer-v-*`, `data-framer-name`) — die Komponentengrenze muss geraten werden |
| CMS | Collections + Einträge + Schemata lesbar | nur die gerenderten Werte der aktuellen Seite; das Schema fehlt |
| Assets | Asset-Objekte mit IDs und Varianten | URLs aus HTML/CSS, müssen geladen und zugeordnet werden |
| Seiten | alle Seiten des Projekts mit Pfaden | nur die Seiten, die man einzeln abruft (und findet) |
| Animationen | **auch nicht** (kein Trait in der API — siehe §3/F1) | gemessen: GSAP/ScrollTrigger/WAAPI/Lenis-**Parameter** (F4) — hier ist der Link-Weg sogar **stärker** |
| Voraussetzung | Framer-Zugang, Plugin installiert, Projekt veröffentlicht | nichts außer Netz (oder ein Mirror) |
| Ergebnis | genauere Struktur, echte Tokens, echte Komponenten, sauberere Bibliothek | vollständig, aber rekonstruiert; dafür die einzige Animationen-Quelle |

**Praktische Folge für den Plan:** Beide Wege laufen durch dieselbe
**Import-IR** (`.scratch/framer-import/plan.md` §4.1). Der Plugin-Weg liefert die
*Semantik* (Tokens, Komponenten, CMS, Pfade), der Link-Weg die *Vollständigkeit und die
Animationsmessung*. Deshalb ist der Plugin-Weg **keine Voraussetzung**, sondern ein
Qualitätssprung: gleiche Funktion, bessere Eingabe. Wer beides hat, nimmt für eigene
Projekte das Plugin (und ergänzt die Motion-Messung am gerenderten Ergebnis), für fremde
Seiten den Link.

---

## 4. Zuordnung Framer → Senify

Erste Fassung der Abbildungstabelle. `voll` = ohne Modelländerung,
`Verlust` = abbildbar mit benanntem Verlust, `offen` = braucht Entscheidung/Erweiterung.

| Framer | Senify | Güte | Anmerkung |
|---|---|---|---|
| Frame, absolut positioniert | `frame` + `position/inset/z-index` als Stilregel | voll | ADR-0005 trägt es; Inspektor zeigt es über die offene Property-Zeile |
| Stack (V/H, Gap, Padding, Align, Wrap) | `frame`/`column` + `display:flex`, `gap`, `padding`, `align-*` | voll | `data-framer-stack-*` → direkte Werte |
| Grid (+ Column/Row-Spans, Fill) | `grid`/`column` + `grid-template-*`, `grid-column` | voll | |
| TextNode / RichText | `heading` (h1–h6) bzw. `body` (HTML) / `text` | Verlust | Textstil-Presets und Inline-Auszeichnung: Preset → Klasse/Token, Rest als HTML |
| Text Style (mit Breakpoints) | `class`-Regel + Gerätesuffixe, Fonts im Theme | Verlust | max. 4 Framer-Breakpoints → 3 Stationen |
| Color Style (light/dark) | Theme-Token (`modes.light`/dark) | voll | `getColorStyles()` liefert beide Werte |
| SVG-Node | `icon` / `embed` (Inline-SVG) | voll | Markup liegt als Attribut vor |
| Image / Background-Image | `image` + Asset-Import, bzw. `background-image` | voll | Asset-Download + Dedupe über Hash |
| Button/Link | `button` / `link` | Verlust | Framer-Variantenstile als Stilregeln, nicht als `variant`-Prop |
| Video/Embed/iframe | `video` / `embed` | Verlust | Fremdhosts: DSGVO-Entscheidung pro Fund |
| Framer-Komponente (Instanz) | `__component_instance` (VC) + Varianten | Verlust | Definition wird VC-Definition; Innereien werden Knoten |
| Komponenten-Variante | VC-Variante | Verlust | Varianten-Register existiert; Zuordnung über `framer-v-*` |
| Property Controls | VC-Definitionstypen | Verlust | Kontrolltypen → Senify-Controls (Mapping nötig) |
| Breakpoint (beliebig, bis 4) | `desktop 1440 / tablet 1024 / mobile 390` (O10) | Verlust | Zusammenfassen statt vervielfachen; Regel für Kollisionen nötig |
| Override (Code) | — | offen | Code ist nicht importierbar; als Island oder Bericht |
| Code-Komponente | Island / Platzhalter | offen | Bewusster Modell-Zusatz, kein Automatismus |
| WebGL/Canvas-Shader | `webgl-scene`-Preset oder Platte | offen | Nur `showcase`-Profil, max. 1 × je Seite |
| CMS-Collection/Eintrag/Item | Collection + Entry | Verlust | Schema-Mapping + Inhalte; eigene Scheibe |
| Lokalisierung | — | offen | Nicht Ziel der ersten Scheiben |
| Seitenübergang | `page-fade` (Motion-Preset) | Verlust | unframer verliert sie auch („not preserved") |
| Appear/Scroll/Hover-Interaktion | MotionSpec-Preset + Parameter | offen | **Der Kern der Animationenfrage**, siehe §8/E2 |
| Link zwischen Framer-Seiten | `link` mit Ziel-Route | voll | Mehrseiten-Import nötig |

---

## 5. Verlustliste — ehrlich, in drei Klassen

**Klasse A — abbildbar, nichts geht verloren:** Layout, Positionierung, Farben,
Abstände, Radien, Rahmen, Schatten, Typografie-Grade, Bilder/SVGs/Videos, Links,
Z-Ordnung, Overflow, Pseudo-Zustände (hover/focus/active/disabled), Keyframes.

**Klasse B — abbildbar mit benanntem Verlust:** Framer-Textstile und
Breakpoints auf drei Stationen, Komponenten-Struktur auf VC-Definitionen,
Richtext auf HTML, `variant`-Props auf Stilregeln.

**Klasse C — nicht abbildbar ohne bewusste Modell-Erweiterung:** freie
Animationen mit exakten Federn/Zeitachsen (Framer motion, in Framer frei
konfigurierbar), Code-Komponenten und Overrides (beliebiges React), Shader,
Seitenübergänge, CMS-Bindung im Markup, Lokalisierung.

Klasse C ist genau der Teil des Auftrags („mit allen Einstellungen, Animationen"),
der eine **Entscheidung** braucht und keine Implementierung. Deshalb steht er in
§8 und §10.

---

## 6. Empfehlung: zwei Modi, ein Beweis

Der Import wird als **ein** Vorgang mit **zwei Ergebnissen** gebaut:

**Modus A — der bearbeitbare Baum (das Produkt).**
F1/F3/F4 → **Framer-Import-IR** (eine Zwischendarstellung, quellenunabhängig) →
Senify-NodeTree + Style-Regeln + Theme-Tokens + Assets + MotionSpecs.
Jeder Knoten trägt `origin { source, ordinal }`; Regeln `authoredBy: "preset"`.
Der IR ist die eine Wahrheit, die beide Quellen (Plugin-Dump und URL-Capture)
erzeugen — dadurch ist der Importer auch testbar, ohne je ins Netz zu gehen.

**Modus B — die Bild-Wahrheit (der Beweis).**
Der Mirror (F5) bzw. die Live-Originalseite liefert den Soll-Zustand. Der Import
gilt erst als gelungen, wenn der **Import-Visual-Diff** bei 1440/768/390 unter
einer Schwelle liegt (Muster: Paritäts-Tor `scripts/verify-parity.mjs`, Harness:
`analysis-worker/visual.ts` mit Motion-Kill-Switch „off", damit der Vergleich den
Baseline-Zustand trifft — dieselbe Regel wie beim Canvas-vs-Release-Tor).

Das entspricht dem Produktprinzip **„Erst der Beweis"** (`PRODUCT.md`): Der
Import ist keine Behauptung, sondern eine Messung mit Zahl.

**Warum nicht nur Modus B?** Ein Mirror ist nicht bearbeitbar — der Auftrag wäre
nicht erfüllt. **Warum nicht nur Modus A?** Ohne Bild-Wahrheit ist „1:1" nicht
belegbar, und der Import verliert still Genauigkeit.

---

## 7. Vorgehensweise in Scheiben

Jede Scheibe ist für sich grün und beweisbar. Reihenfolge so gewählt, dass der
teuerste Teil (Animationen) zuletzt kommt, aber die Modellentscheidung früh fällt.

**S0 — Machbarkeitsbeweis (klein, 1 Tag).**
Eine echte Framer-Seite (die drei Beispiele aus `FramerExport/` liegen vor) durch
F3 + F4 schicken und als JSON ausgeben: Knotenzahl, Klassenzahl, Anteil
abbildbarer Werte, gefundene `data-framer-*`-Marker, gemessene Animationsarten.
Ergebnis: **Zahlen** statt Annahmen, plus Liste der 10 häufigsten Nicht-Abbildbaren.
*Akzeptanz:* Ein Bericht mit Prozentwerten („x % der Deklarationen sind 1:1
übernehmbar, y Knoten brauchen einen Platzhalter").

**S1 — Import-IR + Mapper (die Kernarbeit).**
`framer-ir.ts` (Typen), `framer-import-map.ts` (IR → NodeTree/Style-Regeln/Theme),
reine Funktionen, headless testbar (Muster: Editor-Store ohne DOM). Golden-Tests
mit festgeschriebenen Framer-Snapshots als Eingabe.
*Akzeptanz:* Aus einem IR entsteht ein Dokument, das `validateDocument` und den
Compiler grün durchläuft; alle Farben sind Tokens, alle Knoten haben `origin`.

**S2 — Aufnahme: URL-Capture (F3+F4) und Offline-Mirror (F5).**
Playwright-Driver auf der bestehenden Capture-Kette; `tokens-probe`/`motion-probe`
werden zu **eigenen, versionierten Modulen** im Repo (nicht als Fremdskript
eingebunden — Herkunft dokumentieren, `.scratch/refs`-Muster). Asset-Import über
die vorhandene Medien-Pipeline (Hash-Dedupe wie beim Referenz-Import).
*Akzeptanz:* Ein Lauf gegen eine URL erzeugt IR + Asset-Ordner + `motion.json`,
idempotent beim zweiten Lauf.

**S3 — Weg in die Engine: Route + CLI + MCP + Editor-Einstieg.**
`POST /api/imports/framer` (Dry-Run und echtes Schreiben), CLI
`pnpm senify import framer <url>` mit Bericht, MCP-Tool `import_framer_page`,
Editor-Dialog im Explorer („Seite importieren"). Dry-Run liefert den
Fidelity-Bericht (was wird Knoten, was Platzhalter, was geht verloren).
*Akzeptanz:* Ein Agent kann dasselbe wie der Mensch (MCP-Parität, Produktprinzip 1).

**S4 — Bericht und Platzhalter statt Stille.**
Jeder nicht abbildbare Fund wird als **Datensatz** geführt (Knoten, Grund,
Fundstelle, Vorschlag) und im Editor sichtbar (Platzhalter-Knoten mit
Kennzeichnung + Bericht im Review). Muster: Fehlerbericht des Referenz-Imports,
`design-report`-Findings.
*Akzeptanz:* Kein Fund verschwindet ohne Datensatz; der Bericht nennt Zahlen.

**S5 — Import-Gate (der Beweis).**
`pnpm verify:import` gegen eine festgeschriebene Beispielseite: Original vs.
Import bei 1440/768/390 mit Toleranz, Motion eingefroren. Rot heißt rot
(kein stilles Überspringen, `SENIFY_REQUIRE_BROWSER=1`-Muster).
*Akzeptanz:* Diff-Zahlen im Log, Schwellen im Test verankert.

**S6 — Animationen (nach der Modellentscheidung aus §8/E2).**
Zuordnung gemessener Interaktionen → MotionPreset + Parameter; Rest als
dokumentierter Fund (Klasse C). Erst hier wird der Auftragsteil „mit allen
Animationen" beantwortet — entweder als Preset-Erweiterung oder als bewusstes
Nein.

**Spätere Scheiben (nicht in diesem Paket):** Mehrseiten-Import +
Navigationsbaum, CMS-Schema-Mapping, Komponenten aus F2 (`propertyControls` →
VC-Typen), Lokalisierung, Re-Import/Drift-Abgleich gegen menschliche Edits.

---

## 8. Modell-Erweiterungen (das sind ADR-Kandidaten, keine Nebenarbeiten)

**E1 — Positionierungs-Gruppe im Inspektor.**
Das CSS-Modell trägt `position`/`inset` bereits, die Oberfläche zeigt es nur in
der offenen Property-Zeile. Für „bearbeitbar wie in Framer" gehört eine
Positions-/Größen-Gruppe in den Inspektor (Layout-Gruppe erweitern, `position`,
`inset`, `z-index`, `overflow` als Regler). Kein ADR nötig, ein UI-Ticket.

**E2 — Motion-Kanal für gemessene Parameter (ADR-0006-Erweiterung).**
Heute: Preset + Intensity. Framer liefert **Zahlen** (Delay, Dauer, Feder,
Stagger, Scrub, Start/End, Distanz, Achse). Vorschlag: Presets behalten, aber
eine **typisierte Parameter-Ergänzung** zulassen, die nur der Import schreibt
(`motion.params`, geprüft, ohne freien Code). Das ist die Entscheidung mit den
größten Folgen — dafür braucht es ein ADR, in dem steht, was freie Timeline
bleibt (nichts) und was Import-Parameter dürfen.

**E3 — Import-Herkunft und Re-Import.**
`origin` existiert; es braucht die Regeln: Was passiert beim zweiten Import,
wenn der Mensch inzwischen editiert hat? Vorschlag: Der Import schreibt nur in
Knoten/Regeln ohne menschliche Änderung (`authoredBy: "user"` blockt), alles
andere wird als Konflikt gemeldet. Das ist eine ADR-Zeile, kein Bauvorhaben.

**E4 — Import als Autor.**
`authoredBy: "preset"` vs. `kind: "human" | "agent"` in der Mutation
(`mutations/contract.ts:386`): Der Import ist weder Agent noch Mensch. Entscheidung
nötig, damit die Token-Fence den Import nicht als Agentenlauf abweist
(`engine/src/style-fence.ts`).

**E5 — Platzhalter-Primitiv (letzte Stufe).**
Fällt eine Fläche durch Nachbau **und** Island, braucht der Baum eine **ehrliche Platte**:
ein Knoten, der sichtbar ist, Größe und Position hält und im Bericht steht.
Primitiv `placeholder`, klein gehalten.

**E6 — Island-Payload für importierten Fremd-Code (entschieden).**
Die bewusste Eskalation aus ADR-0001: importierte Module leben als versioniertes Payload
**neben** dem Baum — mit Herkunft, Lizenz, Integrität, Budgets und drei Rückfallstufen.
**Entschieden am 23.09.2026 in `docs/adr/0010-island-payload-fuer-importierten-fremd-code.md`.**
Kurzfassung: neuer Island-Typ `payload`, Ablage `site_code_payloads`, Teil des Build-Hash,
keine Ausführung im Editor-Canvas, Promotion in die Bibliothek nur mit geprüfter Lizenz.

---

## 9. Risiken, Nicht-Ziele, offene Punkte

**Risiken**
1. *Größe*: Vollständig ist das ein Mehrwochen-Paket. Gegenmittel: der
   Scheibenplan; S0–S1 liefern schon sichtbaren Nutzen.
2. *Überversprechen*: „1:1 mit allen Animationen" ist in Klasse C nicht
   erfüllbar. Gegenmittel: Fidelity-Bericht ab S4 als festes Produktteil.
3. *Recht*: Fremde Vorlagen importieren ist eine Kopie. Der Import braucht eine
   Herkunftsnotiz (`origin.source` + Nutzerhinweis). Das `clone-site`-Skill nennt
   dieselbe Grenze ausdrücklich.
4. *Modell-Drift*: Wenn der Import Eigenschaften schreibt, die den Inspektor
   sprengen (tausende `scoped`-Regeln), leidet die Bearbeitbarkeit. Gegenmittel:
   Regeln zusammenfassen (gleiche Deklaration → eine `class`-Regel,
   `order` beibehalten) — Messgröße in S0.
5. *Zwei Tablet-Breiten*: `analysis-worker/visual.ts:23` misst mit 768,
   die Editor-Station ist 1024. Der Import-Vergleich muss dieselbe Breite
   benutzen wie der Import — sonst diff't man Äpfel gegen Birnen.

**Nicht-Ziele (bewusst)**
- Freier Code pro importierter Seite (widerspricht ADR-0001).
- Freie Motion-Timeline (widerspricht ADR-0006; E2 bleibt parameterbasiert).
- Import als „Referenz" (der Referenz-Pfad bleibt, was er ist: Stil-Ableitung).
- WordPress/Webflow (L31 nennt sie mit; erst nach Framer).

**Offene Punkte (mit Prüfschritt)**
- Kann die Plugin-API heute Interaktionen lesen? *Prüfung:* ein Probe-Plugin
  gegen die Traits-Matrix und `index.d.ts`; Ergebnis in S0.
- Wie viele Framer-Animationsformen gibt es real, und wie viele passen in die
  Presets? *Prüfung:* `motion-probe` über die Beispielseiten (S0).
- Wie teuer ist HTML→IR bei großen Seiten (Knotenzahl × Deklarationen)?
  *Prüfung:* S0-Messung an `framer-easier-train-154753` (944 KB HTML) und
  `framer-fluffy-rectangle-418998` (611 KB).

---

## 10. Entscheidungen (Stand 23.09.)

| # | Frage | Antwort |
|---|---|---|
| 1 | Quelle/Zugang | **Beides**: eigene Projekte (Plugin möglich) *und* Seiten, von denen nur der Link existiert — Unterschied siehe §3 „F1 vs. F3/F4“ |
| 2 | Anspruch | **Beides gekoppelt**: bearbeitbarer Baum als Produkt, Bild-Wahrheit als Import-Gate |
| 3 | Erste Scheibe | **Erst tiefer analysieren und ein detaillierter Plan** → `plan.md`, Scheibe S0 (Messlauf) als Start |
| 4 | Klasse C | **Importierte Komponenten werden wiederverwendbare Bausteine einer wachsenden Senify-Bibliothek** — dazu §12 und `plan.md` §5 |

### 10.1 Die neue Klammer: die Baustein-Bibliothek

Der Wunsch „für spätere Projekte weiter ausbauen" macht aus dem Import ein
**Bibliotheks-Vorhaben**, nicht nur ein Konvertierungs-Vorhaben. Befund aus dem Code:

- Visual Components liegen heute **im Seitenbaum** (`section-sdk/components.ts`:
  Definition = reservierter Knotentyp `__component`, Instanz = `__component_instance`;
  „no second registry, no new column“). MCP sagt es klar: „Lists the visual components
  defined on **a page**“ (`mcp/src/tools.ts:946`).
- Es gibt **keine** `components`-Tabelle in `db.ts`. Site-weit funktioniert heute nur der
  Umweg, Definitionen in ein **Layout/Template** zu legen (die Komposition inlinet nach dem
  Splice, `templates.ts` → `composePageTree`).
- **Über Sites hinweg gibt es nichts.** Der Präzedenzfall für ein globales Artefakt mit
  Site-Zuweisung ist die **Referenz-Bibliothek**: `design_references` ohne `site_id`,
  `reference_assignments` mit `site_id` (`db.ts:401,474`).

**Vorschlag:** dieselbe Form für Bausteine — globaler Bibliothekseintrag + Site-Installation
mit Versions-Pin. Ausführlich in `plan.md` §4.3/§5, mit den Vorbildern Webflow Shared
Libraries, Figma Library und den Praxis-Lehren (Reihenfolge Tokens → Klassen → Komponenten;
„expose as properties anything that varies“; Detach ist Einbahnstraße → wir bauen
Re-Attach; Bibliotheken verfaulen durch Detach → Audit-Bericht).

---

## 11. Quellen und geprüfte Artefakte

**Weiterführend:** `.scratch/framer-import/plan.md` — detaillierter Umsetzungsplan
(IR-Modell, Bibliotheks-Design, Scheiben S0–S9, Tests, Risiken).

**Zusätzlich recherchiert (23.09.)**
- Webflow Help, *Libraries* (help.webflow.com, Stand 20.07.2026): Shared/Starter/Marketplace
  Library, Source-Site-Modell, Installieren/Aktualisieren/Akzeptieren, Bulk-Push,
  Löschen → Konvertieren zu Site-Komponenten, Grenzen (CMS, Lokalisierung, Fonts, Branches).
- FlowAppz, *Reusable component libraries in Webflow* (29.07.2026): Lehren — Variablen →
  Klassen → Komponenten; Eigenschaften statt Detach; Varianten deckeln; Detach-Quoten prüfen;
  Namen nach Rolle.
- Figma-Diskussionen zur veröffentlichten Library (Update/Drift/Breakage, Per-Page-Accept):
  Pin + expliziter Update-Schritt + Overrides über stabile IDs.
- Builder.io Component Registry (aus `RESEARCH.md` §2.1) als Muster für typisierte Bausteine.

**Extern (abgerufen 23.09.2026)**
- Framer, Traits-Matrix: `framer.com/developers/reference-legacy/plugins-traits`
- Framer, Nodes: `framer.com/developers/nodes` · Styles: `framer.com/developers/styles`
  · Reference-Index: `framer.com/developers/reference`
- Unframer: `unframer.co/llms-full.txt`, `unframer.co/how-it-works.md`,
  `github.com/remorses/unframer` (README)
- FramerExport: `github.com/danbenba/FramerExport` (README, `src/exporter/capture.ts`)

**Lokal geprüft**
- `Repos/site-clone` — `skills/clone-site/SKILL.md`,
  `skills/dom-clone/SKILL.md`, `references/fidelity-fast-path.md`,
  `scripts/motion-probe.js`, `scripts/tokens-probe.js`
- `C:\Users\adini\FramerExport\framer-stupendous-football-158496\index.html`
  (Marker gemessen), `framer-easier-train-154753`, `framer-fluffy-rectangle-418998`
- Senify: `packages/editor/src/state/document.ts`,
  `packages/widget-engine/src/{catalog.ts,markup.ts,css/compile.ts,css/style-rule.ts}`,
  `packages/engine/src/{style-fence.ts,design-system-import.ts,references-capture-chain.ts}`,
  `packages/analysis-worker/src/visual.ts`, `scripts/verify-parity.mjs`,
  `docs/adr/0001,0005,0006,0007`, `docs/verbesserungsplan.md` (L31, I36, E24),
  `HANDOFF.md` §4/§8, `PRODUCT.md`, `CONTEXT.md`
- `font2yeux/font2yeux.github.io` — **geprüft, und es ist ein direkter Verwandter**: ein von
  *Framer Export* erzeugtes **„Migration Pack"** (Quelle `yeuxtest.framer.website`, 27 Seiten,
  erzeugt 17.09.2026). Inhalt: `migration-manifest.json` (maschinenlesbare Site-Map),
  `content/*.md` je Seite (Mozilla Readability), `seo/` (Metadaten + JSON-LD mit
  Confidence-Scores), `fonts.css` (`@font-face`), **`design-tokens.json`** (Farben, Fonts,
  Abstände), `redirects.json`, `llms.txt`, `sitemap.xml`. Das Pack ist ausdrücklich zum
  Übergeben an ein Coding-Tool gedacht.
  **Lehre für S1/S2:** Die *Inhalts-, Token-, Font- und SEO-Schicht* eines Framer-Imports lässt
  sich als Pack abbilden — und genau diese Artefaktform sollte unsere **Import-IR** mitliefern
  (Token-Block, Font-Dateien, SEO je Seite, Redirect-Map). Die mitgelieferten Ehrlichkeits-
  notizen sind ebenfalls übernehmbar: „Content is extracted using Mozilla Readability.
  Quality varies by page structure" und „Review schemas with confidence < 0.7" — das ist
  dieselbe Haltung wie der Fundbericht in §7/S4.
