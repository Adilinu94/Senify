# Editor v2 - Style-Rule-Modell im Editor-Dokument (B1)

Status: **erledigt (18.09.) - Stufen 0 bis 6**

**Umsetzung (alles am 18.09., test-first):**
- **Stufe 0** Wert-Grammatik: `widget-engine/src/css/value-grammar.ts` (Normalisierung +
  Allowlist-Parser), 94 Tests; im Compiler und im Editor-Schreibpfad verdrahtet.
- **Stufe 1** Kanonisches Modell: `states`, `statePriorities`, `authoredBy` in
  `style-rule.ts` (Schema, toleranter Parser, `canonicalStyleRule` fuer byte-stabile
  Serialisierung, `styleRuleToClassRule` reicht `states` durch). 25 Tests.
- **Stufe 2** Editor-Dokument: `styleRules: StyleRule[]` statt `classes`-Record;
  `styleRuleById`/`styleRuleByName`/`classRules`/`toCssDocument`.
- **Stufe 3** Patches/Ops: `upsertStyleRule { rule }`, `deleteStyleRule { id }`,
  `reorderStyleRule { id, index }`, `renameStyleRule { id, name }` (Transport-Vertrag in
  `engine/src/mutations/editor-contract.ts` mitgezogen). Scoped-Regeln wandern beim
  Duplizieren mit und sterben mit ihrem Knoten.
- **Stufe 4** Compiler: Klassen-States (`[data-node-id].cls:hover`), `ambient` verbatim,
  `scoped` am Knoten, `contextStyles` als verschachtelte Bedingung, `rawCss` nur als
  geprueftes `@keyframes`. 15 Tests.
- **Stufe 5** Konsistenz: `duplicate-rule-id`, `duplicate-class-name`, `duplicate-scope`,
  `unknown-rule-kind`, `invalid-rule-selector`, `reserved-context-id`,
  `scoped-rule-without-node`.
- **Stufe 6** Migration: alter `classes`-Wert-Bag wird additiv geliftet
  (`createClassRule`, `order` aus Einfuegereihenfolge); `styleRules` laufen durch
  `parseStyleRuleRegistry`. `DOCUMENT_VERSION` bleibt 2.
- **Abnahme** der Roundtrip gegen die Site-Registry ist belegt
  (`engine/test/style-rules.test.ts`, „takes a canonical editor-document rule unchanged").

**Zahlen:** `pnpm test` 1102 gruen / 2 uebersprungen / 124 Dateien, typecheck 0, lint 0.

**Delegiert:** Editor-Anbindung an die Site-Routen (Save-Pipeline) und der Bake-Renderpfad
stehen in Ticket 13; Inspektor-UI in Ticket 02; Wert-Ebene-Fence fuer Agenten in Ticket 18.

**Stufe 0 erledigt:** `packages/widget-engine/src/css/value-grammar.ts` (Normalisierung,
Allowlist-Parser), im Compiler verdrahtet (Text-Werte + offener Durchreich-Pfad, unsichere
Werte werden verworfen) und im Editor-Schreibpfad (`assertSafeValue` wirft SenifyError).
94 Grammatik-Tests + 9 Injektions-Tests. **Damit ist das Gate fuer Ticket 10 offen.**

**Offen (Stufe 1-6):** `states`/`statePriorities`/`authoredBy` am kanonischen Modell,
`styleRules[]` im Editor-Dokument, Patches/Ops per `id`, Konsistenz, Migration,
Compiler-Emission fuer Klassen-States/ambient/scoped/contextStyles/rawCss.
Abhaengig von: 01-widget-engine-canvas (Fertigstellung Phase 0-Slices)
Muss liegen: VOR dem ersten Inspektor-Code (Ticket 02 Punkt 2/3)
Herkunft: `.scratch/editor-v2-rebuild/research/02-bauplan-aenderungen.md`, B1
Entscheidungen: O13 (offenes CSS, ADR-0005), O10 (drei Geraetestationen), O11 (vier Pseudo-States)

## Warum dieses Ticket neu gefasst wurde

Der urspruengliche B1-Entwurf schlug ein **eigenes, engeres** Modell im Editor-Dokument vor
(`{ name, kind, props, states?, origin: "user"|"agent"|"preset", position }`). Zwei Befunde vom
18.09. machen das falsch:

1. **Das kanonische Modell existiert bereits** in
   `packages/widget-engine/src/css/style-rule.ts` (`StyleRule` mit stabiler `id`, `name`, `kind`,
   freiem `selector`, `order`, `styles`, `stylePriorities`, `contextStyles`,
   `contextStylePriorities`, `rawCss`, `scope`, `origin` als Import-Herkunft) — mit tolerantem
   Parser, Konstruktoren, Validierung und Compiler-Bruecke. Die Site-weite Persistenz
   (`sites.style_rules_json`) und die Routen (`/api/sites/:siteId/style-rules`, inkl. `reorder`)
   sind ebenfalls gebaut. Die Routen adressieren per **`ruleId`** — ein Modell ohne `id` kann sie
   nicht bedienen.
2. **Der B1-Entwurf haette den Baukasten-Deckel ins Datenmodell eingebaut** (kein `selector`,
   kein `rawCss`, keine `contextStyles`). Genau das schliesst ADR-0005 aus.

Deshalb: **ein Modell, nicht drei.** Das Editor-Dokument fuehrt die kanonischen Regeln.

## Ziel

Das Editor-Dokument speichert Stilregeln in derselben Form, in der die Site sie persistiert, und
der Compiler emittiert daraus die volle Kaskade — Basiswerte, Geraetestufen, Pseudo-Zustaende,
eigene Bedingungen. Danach kann Ticket 02 den Inspektor gegen ein Modell bauen, das nicht mehr
umzieht.

## Umfang

### 0. VORBEDINGUNG: Wert-Grammatik und `assertSafeDeclaration`

**Diese Stufe ist ein Gate. Ohne sie darf `assertStyleProp` nicht fallen (Ticket 10), sonst ist die
Oeffnung ein Sicherheitsrueckschritt.** Begruendung: es gibt in diesem Repository **keinen
CSS-Sanitizer**. `sanitize-html` ist genau einmal eingebunden (`packages/registry/src/md.ts`) und
wirkt dort auf HTML aus Markdown. Bis heute war die 33er-Whitelist die faktische Sicherheitsgrenze
des Stilpfads. Eine Denylist auf literalen Teilstrings (`javascript:`, `expression(`, `@import`)
ist kein Ersatz: CSS erlaubt Escapes, Kommentare und beliebige Schreibweisen —
`url(jav\61 script:alert(1))`, `u\72 l(...)`, `expr/**/ession(...)`, `URL( JAVASCRIPT:...)` laufen
durch und werden vom Browser dennoch ausgefuehrt.

Umzusetzen (Ort: `widget-engine/src/css/`, neue Datei `value-grammar.ts`; benutzt von Compiler
**und** Schreibpfad — eine Stelle, nicht zwei):

1. **Normalisierung vor der Pruefung:** CSS-Escapes aufloesen (`\61` → `a`, `\000061` → `a`),
   Kommentare entfernen (`/* */`), Funktions- und Schema-Namen kleinschreiben, Steuerzeichen
   verwerfen. **Geprueft wird die normalisierte Form, emittiert wird ebenfalls die normalisierte
   Form** — sonst prueft man einen anderen Text als den ausgelieferten.
2. **Allowlist der Wert-Formen** (nicht Denylist): Zahl+Einheit (auch `.5`), Schlagwort, Farbe
   (hex/rgb/hsl/oklch/color-mix), Funktion aus benannter Liste (Argumente rekursiv; in
   `calc`/`min`/`max`/`clamp` zusaetzlich `+ - * /` und Klammern), Zeichenkette, Liste (Trenner
   `,`, Leerzeichen oder `/`). `url()` nur mit `./`/`../`-Pfaden, einem einzelnen fuehrenden `/`
   (**nicht** `//` — protokollrelativ), `https:` oder `data:` mit **Rasterbild-Typ**
   (`image/png|jpeg|gif|webp|avif`, optional `;base64`); `data:image/svg+xml` ist
   **ausgeschlossen** (SVG kann Skript tragen).
3. **Property-Namen:** `^--[a-zA-Z0-9-_]+$` (eigene Variable) oder `^[a-zA-Z][a-zA-Z0-9-]*$`.
4. **`assertSafeDeclaration(property, value, field)`** wirft `SenifyError` mit dotted field path.
5. **`rawCss`** bleibt auf `@keyframes` beschraenkt, wird eigenstaendig geparst; die Deklarationen
   darin laufen wieder durch die Grammatik.
6. **Umgehungs-Tests** (der Kern dieser Stufe): je Variante ein Ablehnungsfall —
   Escape-Schreibweise, Kommentar im Token, Gross-/Kleinschreibung, Zeilenumbruch,
   `javascript:`/`vbscript:`/`data:text/html` in `url()`, Ausbruch aus dem Regelblock
   (`;`, `}`, `{`), `@import`, `expression(`, `url()` auf Fremdhost. Dazu Durchlassfaelle:
   `var(--x)`, `calc(50% - 4px)`, `clamp(1rem, 2vw, 2rem)`, `linear-gradient(...)`,
   `translate3d(...)`, `cubic-bezier(...)`, `url(/assets/a.png)`, `url(https://…/a.avif)`,
   `data:image/png;base64,…`.

**Reihenfolge:** Stufe 0 (dies) → Ticket 10 (Tor faellt) → Rest von Ticket 07.

### 1. Kanonisches Modell erweitern (`widget-engine/src/css/style-rule.ts`)

Drei additive Felder, von ADR-0005/O11/Ticket 18 verlangt und heute nicht vorhanden:

```ts
export type StyleRule = {
  // ... unveraendert: id, name, kind, selector, order, description?, scope?,
  //     styles, stylePriorities?, contextStyles, contextStylePriorities?,
  //     rawCss?, origin?, createdAt?, updatedAt?
  states?: Partial<Record<StateName, DeviceValueMap>>;   // NEU — Pseudo-Zustaende an der Regel
  statePriorities?: Partial<Record<StateName, Record<string, "important">>>;  // NEU, analog
  authoredBy?: "user" | "agent" | "preset";              // NEU — Autor-Herkunft, Default "user"
};
```

- Schema (`StyleRuleSchema`), toleranter Parser (`parseStyleRule`) und `styleRuleErrors` ziehen mit.
- `styleRuleToClassRule` gibt `states` mit durch.
- **`authoredBy` ist bewusst ein eigenes Feld**, nicht `origin`: `origin` bleibt Import-Herkunft
  (`{ source, ordinal }`) und dient als Identitaet fuer den Re-Import. Zwei Bedeutungen unter einem
  Namen waeren ein Datenmodellfehler. Ticket 18 baut seine Wert-Ebene-Fence auf `authoredBy`.
- Die Compiler-Bruecke `styleRuleToClassRule` und der Store reichen `states` durch (Letzteres in
  Ticket 13, Punkt 4).

### 2. Editor-Dokument (`packages/editor/src/state/document.ts`)

```ts
export type EditorDocument = {
  version: typeof DOCUMENT_VERSION;
  rootNodeId: NodeId;
  nodes: Record<NodeId, EditorNode>;
  styleRules: StyleRule[];        // ersetzt `classes: StyleRuleMap`; Array = Kaskadenordnung
};
```

- **Array, nicht Record.** Das ist die kanonische Form (`order` = Array-Position,
  `normalizeRuleOrder`), damit Laden und Speichern gegen die Site-Registry **identisch** sind —
  keine Sortier-/Nummerier-Uebersetzung.
- Namens-Nachschlag als Helfer (`styleRuleByName`, `isClassDefined`), damit `node.classes`
  (Namens-Referenzen) unveraendert weiterlaufen. Der Umzug auf `classIds` (id-Referenzen wie in
  der Vergleichsbasis) ist **eigenes** Ticket — er beruehrt Renderer und Bake.
- `classRules(document)` / `toCssDocument` mappen ueber `styleRuleToClassRule`; nur
  `kind: "class"` ohne `scope` wird zugewiesen. `ambient` und `scoped` gehen als eigene
  Emissionsquellen in den Compiler (Punkt 4).

### 3. Patch-Vokabular (`patches.ts`) und Operationen (`operations.ts`)

- `setStyleRule` (Name → Wert-Bag) entfaellt. Neu: `upsertStyleRule { rule }`,
  `deleteStyleRule { id }`, `reorderStyleRule { id, index }`.
  **Adressiert wird per `id`** — gleiche Adressierung wie die Site-Routen.
- Je Op forward/inverse Patches (Undo bleibt patch-basiert).
- `renameClass` bleibt, benennt aber nur `name` + `selector` neu (`classKindSelector`); die `id`
  ist stabil, Zuweisungen brechen nicht.
- **`assertStyleProp` faellt weg** (ADR-0005) — aber erst, wenn die Wert-Grammatik steht
  (Reihenfolge: Stufe 0 zuerst, siehe Abnahme). An seine Stelle tritt `assertSafeDeclaration`:
  - **Property-Name** gegen `^--[a-zA-Z0-9-_]+$` (eigene Variable) oder
    `^[a-zA-Z][a-zA-Z0-9-]*$` (regulaere Property) — identisch zu ADR-0005.
  - **Wert** gegen die **Allowlist-Grammatik** aus ADR-0005, Abschnitt „Die Sicherheitsgrenze"
    (Zahl mit Einheit, Schlagwort, Farbe, erlaubte Funktion, Zeichenkette, Liste; Rechenoperatoren
    in `calc`/`min`/`max`/`clamp`, `/` als Trenner in Farb- und Listenformen, fuehrende Punkte
    wie `.5`). **Keine Denylist:** aufgezaehlt wird, was erlaubt ist, nicht was verboten ist.
  - **Normalisierung vor der Pruefung:** CSS-Escapes aufloesen, Kommentare entfernen,
    Schreibweise von Funktions- und Schemanamen vereinheitlichen; geprueft wird die normalisierte
    Form, **emittiert wird dieselbe** (Pruef-Text == Ausgabe-Text).
  - Selektoren laufen weiter ueber `isValidCssSelector`, `rawCss` bleibt auf `@keyframes`
    beschraenkt (eigener Schnitt, ADR-0005).

### 4. Compiler (`widget-engine/src/css/compile.ts`)

- `CssClassRule` erhaelt `states?`, `contextStyles?`, `rawCss?`, `selector?`, `kind?`.
- **Zustaende an der Klasse:** eine Regel mit `states.hover` emittiert in der state-Stufe
  (`[data-node-id].cls:hover`), nach device, vor class — die doppelte Selektorform, die es fuer
  Knoten schon gibt.
- **Ambient-Regeln:** eigene Emissionsquelle mit dem verbatim `selector`, ohne Knotenanker.
- **Scoped-Regeln:** `[data-node-id="x"].__senify_scope_x`.
- **`contextStyles`:** eigene Bedingungen als `@media`/`@container`/`@supports`-Praeludium;
  die drei Geraetestationen bleiben die Suffix-Form (O10, `RESERVED_CONTEXT_IDS` bleibt).
- **`rawCss`:** unveraendert durchgereicht (nur `@keyframes`, eigener Sicherheitsschnitt).
- Reihenfolge innerhalb der class-Stufe: nach `order` aufsteigend.

### 5. Konsistenzpruefung (`consistency.ts`)

Neue Befundarten: `duplicate-rule-id`, `duplicate-class-name` (nur unter `kind: "class"`),
`unknown-rule-kind`, `invalid-rule-selector`, `reserved-context-id`, `scoped-rule-without-node`.
`undefined-class` bleibt.

### 6. Migration (`migration.ts`)

- `DOCUMENT_VERSION` bleibt **2**: das Feld ist additiv, und das Editor-Dokument wird nirgends
  als Ganzes persistiert (`serializeDocument` lebt nur in Tests; gespeichert werden Ops).
- Ein Dokument mit altem `classes`-Wert-Bag wird beim Laden geliftet: je Eintrag
  `createClassRule({ id: idFactory(), name, styles, order: Einfuegeposition })`.
- Ein Dokument mit `styleRules` laeuft durch `parseStyleRuleRegistry` (tolerant, dedupliziert,
  normalisiert `order`).

## Abnahme

**Reihenfolge-Hinweis (behebt einen Fehler der ersten Fassung):** Das Kriterium „`heading` bekommt
`border-width`" kann dieses Ticket **nicht** erfuellen, weil die Sperre in `properties.ts`
(`styleGroups`) sitzt und erst von **Ticket 10** entfernt wird. Es steht deshalb dort (Ticket 10,
Abnahme) und nicht hier. Ebenso gehoert das Durchreichen unbekannter Properties (`scroll-snap-type`,
`clip-path`) zu Ticket 10. Hier bleiben: die Sicherheitsgrenze (Stufe 0), das Dokument-Modell, die
Kaskade und die Migration.

- **Sicherheits-Gate (Stufe 0, Vorbedingung):** `background: url(javascript:alert(1))`,
  `background: url(jav\61 script:alert(1))`, `background: u\72 l(http://fremd/x)`,
  `color: red; } body {`, `@import url(x)`, `width: expression(alert(1))` werden abgelehnt; der
  Fehler nennt das Feld. Durchlassfaelle: `var(--x)`, `calc(50% - 4px)`,
  `clamp(1rem, 2vw, 2rem)`, `linear-gradient(...)`, `url(/assets/a.png)`,
  `url(https://…/a.avif)`, `data:image/png;base64,…`. Abgelehnt: `data:image/svg+xml;base64,…`,
  `url(//fremdhost/x)`.
- **Wert-Normalisierung:** eine Deklaration mit Escape-Schreibweise wird **normalisiert** geprueft
  und **normalisiert** emittiert (Pruef-Text == Ausgabe-Text).
- **Zustaende:** eine Regel mit `states.hover` und `states.disabled` emittiert
  `...:hover` / `...:disabled` in der state-Stufe, in `STATE_ORDER`-Reihenfolge; Golden-Snapshot.
- **Ambient/Scoped:** `h1 > span` emittiert verbatim ohne Knotenanker; eine scoped Regel emittiert
  mit Knotenanker und taucht in keinem `class=`-Attribut einer anderen Node auf.
- **Bedingungen:** `contextStyles["(orientation: landscape)"]` emittiert das Praeludium;
  `contextStyles["mobile"]` wird abgelehnt (reservierter Kontext, O10).
- **Undo/Redo:** anlegen → Zustand setzen → umordnen → loeschen roundtript ueber forward/inverse.
- **Konsistenz:** doppelte `id` oder doppelter Klassenname wird vom Store abgelehnt, nichts wird
  geschrieben.
- **Migration:** ein v2-Dokument mit `classes`-Bag wird additiv geliftet; ein Roundtrip
  (speichern → laden) ist identisch.
- **Roundtrip gegen die Site-Registry (Vorbereitung Ticket 13):** eine im Dokument angelegte Regel
  ist byte-gleich das, was `POST /api/sites/:siteId/style-rules` akzeptiert und
  `GET` zurueckgibt — belegt durch einen Test, der beide Formen vergleicht.
- `pnpm test`, `pnpm typecheck`, `pnpm lint` gruen.

## Was dieses Ticket NICHT tut

- Kein Umzug von `node.classes` (Namen) auf `node.classIds` (ids) — eigenes Ticket, beruehrt
  Renderer und Bake.
- Keine Inspektor-UI (Ticket 02).
- Keine **Durchsetzung** der Autor-Herkunft — das Feld `authoredBy` wird hier angelegt, die
  Wert-Ebene-Fence (Token-Zwang fuer Agenten) ist Ticket 18.
- Keine Editor-Anbindung an die Site-Routen — Ticket 13 (Server-Seite steht schon).
- **Kein Fall des Schreibtors** — das ist Ticket 10 und setzt Stufe 0 dieses Tickets voraus.
