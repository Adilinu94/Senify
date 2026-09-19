# ADR-0005: Styling ist offenes CSS, die Tabelle beschreibt die Oberflaeche

Status: Angenommen, 18.09.2026
Bezug: editor-v2-rebuild, Tickets 07/10/14, Entscheidung O13 in `.scratch/editor-v2-rebuild/map.md`
Vergleichsbasis: `Repos/instatic/docs/reference/css-class-registry.md`, `Repos/instatic/research/instatic/08-content-bausteine-*.md`

## Entscheidung

Der Stilwert-Raum von Senify ist **offen**. Eine Stilregel und ein Knoten speichern echte
CSS-Deklarationen; die Property-Tabelle des Compilers ist ab jetzt eine **Oberflaechen-Beschreibung**
(welches Bedienelement eine Property bekommt), **kein Schreibtor**.

Vier Regeln:

1. **Kein Property-Verbot im Schreibpfad.** `assertStyleProp` faellt weg. Eine Deklaration mit
   einem CSS-Property-Namen, den die Tabelle nicht kennt, wird gespeichert und emittiert.
   Abgelehnt wird nur, was strukturell unsicher ist (siehe Regel 4).
2. **`styleGroups` ist Sortierung, kein Verbot.** Die Gruppen eines Bausteins bestimmen, welche
   Abschnitte der Inspektor **zuerst** zeigt. Sie entfernen keine Property. Eine Ueberschrift
   darf einen Rahmen bekommen, ein Bild eine Schriftfarbe.
3. **Drei Freiheits-Ventile gehoeren zum Modell**, nicht zu einer spaeteren Phase:
   - freie Selektoren (`kind: "ambient"`, inklusive Pseudo-Elementen wie `::after`),
   - `rawCss` fuer das, was keine Selektor-Deklaration ist (`@keyframes`),
   - `contextStyles` fuer eigene Bedingungen (`@media`, `@container`, `@supports`) neben den
     drei Geraetestationen aus O10.
4. **Die Grenze ist Sicherheit und Struktur, nicht Geschmack — und sie ist eine Allowlist auf der
   Wert-Grammatik, keine Denylist auf Zeichenketten.** Der Property-*Raum* ist offen, die
   Wert-*Form* ist geprueft. Begruendung und Verfahren siehe Abschnitt „Die Sicherheitsgrenze".

## Kontext

Der Befund, der diesen ADR ausgeloest hat: Senify kann heute **33 Style-Properties** schreiben
(`packages/widget-engine/src/css/properties.ts`, `STYLE_PROPERTIES`, Zeilen 62–101: 3 spacing,
7 size, 10 typography, 2 color, 4 border, 7 effects) und lehnt alles andere im
Schreibpfad ab (`packages/editor/src/state/operations.ts`, `assertStyleProp`: „Unknown style
property"). Dazu kommen 17 Control-Mappings in `PROP_MAPPINGS` (50 Tabellen-Eintraege insgesamt);
sie tragen alle `onlyPrimitives` und werden von `translatableProperties(undefined)` uebersprungen,
sind also **nicht** Teil des Schreibpfads, sondern Wert-Aufbereitung. Das Tor ist genau die
33er-Tabelle. Zusaetzlich sperrt `styleGroups` pro Baustein (`packages/widget-engine/src/catalog.ts`):
`heading` hat kein `border` und kein `size`, `image` keine Typografie.

Nicht setzbar waren damit unter anderem `position`, `inset`, `overflow`, `zIndex`, die
Flex-Einzelwerte, `gridTemplateColumns`, `clipPath`, `maskImage`, `textShadow`, `cursor`,
`outline`, `containerType`, `scrollSnapType` — und Pseudo-Elemente, Keyframes und Animationen
ueberhaupt nicht.

Die Vergleichsbasis loest das anders: `StyleRule.styles` ist dort
`Record<string, unknown>` mit echten CSS-Property-Namen, tolerant uebersetzt an **einer** Stelle
(`bagToCSS`), plus `ambient`-Selektoren, `rawCss`, `contextStyles`, `stylePriorities` und
18 unterstuetzte Pseudo-Zustaende. Der Nutzer dort ist nicht durch das Datenmodell begrenzt,
sondern nur durch die Oberflaeche — und die Oberflaeche laesst sich nachziehen, das Datenmodell
nicht ohne Migration.

Das Produktziel von Senify ist „eindrucksvolle, vollstaendig individuelle Seiten gestalten".
Eine Whitelist im Schreibpfad ist mit diesem Ziel unvereinbar: jedes fehlende CSS-Feature wird
zu einem eigenen Ticket, und der Nutzer erlebt genau den Baukasten-Deckel, den das Produkt
vermeiden will.

## Die Sicherheitsgrenze

**Ausgangslage, korrigiert.** Eine frueheEntwurfsfassung dieses ADR berief sich auf „denselben
Schnitt, den Instatic mit `isValidCssSelector` plus DOMPurify zieht". Das war eine Behauptung ueber
Code, der nicht geprueft war, und sie ist **falsch**: in diesem Repository existiert kein
CSS-Sanitizer. `sanitize-html` ist genau einmal eingebunden, in
`packages/registry/src/md.ts`, und wirkt dort auf **HTML** aus Markdown — nicht auf Stilwerte.

Damit ist die Lage ungeschminkt: **bis heute war die 33er-Whitelist die faktische
Sicherheitsgrenze des Stilpfads.** Sie zu entfernen und durch das Verbot einiger literaler
Teilstrings (`javascript:`, `expression(`, `@import`) zu ersetzen, waere ein **Sicherheitsrueckschritt**,
denn CSS erlaubt Escapes, Kommentare und beliebige Gross-/Kleinschreibung:
`url(jav\61 script:alert(1))`, `u\72 l(...)`, `expr/**/ession(...)`, `URL( JAVASCRIPT:... )` —
jede dieser Formen laeuft durch eine Teilstring-Pruefung und wird vom Browser dennoch ausgefuehrt.

**Deshalb gilt die umgekehrte Richtung: erlaubte Wert-Formen werden aufgezaehlt, nicht verbotene.**
Ein Wert wird nur emittiert, wenn er einer dieser Formen entspricht:

1. **Zahl mit optionaler Einheit** — `-?(\d+(\.\d+)?|\.\d+)` plus Einheit aus einer festen Liste
   (`px|rem|em|%|vw|vh|vmin|vmax|ch|ex|fr|s|ms|deg|rad|turn`) oder ohne Einheit. Der fuehrende
   Punkt ist erlaubt: CSS schreibt `.5` und `-.5`.
2. **Schlagwort** — `[a-zA-Z][a-zA-Z0-9-]*` (deckt `flex`, `sticky`, `border-box`, `currentColor`).
3. **Farbe** — `#rgb|#rgba|#rrggbb|#rrggbbaa`, oder eine Farbfunktion aus der Liste
   (`rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color-mix`), deren Argumente rekursiv wieder dieser
   Grammatik entsprechen.
4. **Erlaubte Funktion** — nur aus einer benannten Liste, Argumente rekursiv geprueft:
   `var|calc|min|max|clamp|translate*|rotate*|scale*|skew*|matrix*|perspective|
   linear-gradient|radial-gradient|conic-gradient|repeating-*-gradient|
   cubic-bezier|steps|blur|brightness|contrast|drop-shadow|grayscale|hue-rotate|invert|
   opacity|saturate|sepia|inset|circle|ellipse|polygon|path|env|attr|counter|
   fit-content|minmax|repeat|url`.
   **Rechenfunktionen:** in den Argumenten von `calc`/`min`/`max`/`clamp` sind zusaetzlich die
   Operatoren `+`, `-`, `*`, `/` und Klammern erlaubt; jeder Operand laeuft wieder durch diese
   Grammatik. Ohne diese Regel faellt `calc(50% - 4px)` durch, obwohl es ein Durchlassfall ist.
   **`url()` ist der Sonderfall:** erlaubt sind `./`- und `../`-Pfade, ein einzelner fuehrender
   `/`-Pfad (**nicht** `//`, das ist protokollrelativ und laedt von einem fremden Host),
   `https:`-URLs sowie `data:`-URLs mit einem **Rasterbild-Typ** (`image/png|jpeg|gif|webp|avif`,
   optional `;base64`) und reiner Base64- bzw. prozentkodierter Nutzlast.
   `data:image/svg+xml` ist **ausgeschlossen** — SVG kann Skript tragen. Jedes andere Schema
   faellt durch, inklusive aller Escape-Varianten, weil **vor** der Pruefung entescaped wird
   (siehe unten).
5. **Zeichenkette** — in Anfuehrungszeichen, ohne unmaskierte Anfuehrungszeichen und ohne
   Zeilenumbruch.
6. **Liste** — mit `,`, Leerzeichen oder `/` getrennte Folge der Formen 1–5 (deckt `box-shadow`,
   `transition`, `font-family`, `grid-template-columns`, `aspect-ratio: 16 / 9` und die moderne
   Farb-Syntax `rgb(0 0 0 / 50%)`).

**Normalisierung vor der Pruefung** — das ist der Teil, den eine Denylist strukturell nicht leisten
kann: CSS-Escapes (`\61`, `\000061`) werden aufgeloest, CSS-Kommentare (`/* */`) entfernt,
Gross-/Kleinschreibung fuer Funktions- und Schemanamen vereinheitlicht, Steuerzeichen verworfen.
Geprueft wird die normalisierte Form, **emittiert** wird ebenfalls die normalisierte Form — sonst
prueft man einen anderen Text als den, der ausgeliefert wird.

**Property-Namen** entsprechen `^--[a-zA-Z0-9-_]+$` (eigene Variable) oder
`^-?[a-zA-Z][a-zA-Z0-9-]*$` (optionales führendes `-` für Vendor-Präfixe wie
`-webkit-line-clamp`). Kein `:`, kein `;`, keine Klammer, kein Leerzeichen.

**Katalog-Controls sind kein offener Raum.** `text`, `level`, `striped`, `dropCap` und Verwandte
sind *Verhaltens*-Props eines Bausteins, kein CSS. Sie werden vom offenen Durchreich-Pfad
ausgeschlossen (die Control-Schlüssel des Bausteins sind bekannt); sonst stünde `text: Hallo` im
Stylesheet. Die Typprüfung der Controls (`text` muss ein String sein) bleibt unverändert.

**Selektoren** laufen weiter ueber `isValidCssSelector` (`style-rule.ts`), zusaetzlich geprueft auf
Pseudo-Element-Form; `rawCss` bleibt auf `@keyframes` beschraenkt und wird eigenstaendig geparst
(Name plus Prozent-/`from`/`to`-Bloecke, deren Deklarationen wieder durch dieselbe Wert-Grammatik
laufen).

**Konsequenz fuer den Ablauf:** Diese Grammatik ist die **Vorbedingung** der Oeffnung, nicht ihr
Nachtrag. Sie wird zuerst gebaut und mit Umgehungs-Tests belegt (Escape-, Kommentar-, Schreibweisen-
und Schema-Varianten); erst danach faellt `assertStyleProp`. Solange die Grammatik nicht gruen ist,
bleibt die Whitelist stehen.

**Stand der Umsetzung (18.09.2026):**
- `packages/widget-engine/src/css/value-grammar.ts` — Normalisierung, Allowlist-Parser,
  `parseCssValue`/`isSafeCssValue`/`isSafeCssProperty`; 94 Tests in `value-grammar.test.ts`
  (23 Umgehungs-Varianten, 50+ Durchlassfälle).
- Compiler: `declarationsForValues` validiert Text-Werte (`boxShadow`, `transform`, `filter`, …)
  und reicht unbekannte Properties durch; ungültige Werte werden **verworfen**.
  9 Tests in `css-injection.test.ts` belegen, dass nichts Unsicheres emittiert wird.
- Schreibpfad: `assertStyleProp` ist entfernt; `assertSafeValue` prüft Knoten-Props und
  Stilregeln und wirft `SenifyError` mit Feldpfad. Die Tests in `operations.test.ts` decken
  Ablehnung (`color:red`, `url(javascript:…)`) und Durchlass (`scrollSnapType`, `clipPath`) ab.
- `styleGroups` ist überall entsperrt (`layout`-Gruppe ergänzt, `STYLE_GROUPS` als
  Anzeige-Reihenfolge dokumentiert). Goldens und Katalog-Tests sind nachgezogen.
- **Bewusste Lücke, benannt:** Die Wert-Grammatik ist eine Allowlist auf *Formen*, kein
  CSS-Parser. Sie schützt gegen Ausbruch, Fremdschemata und Funktionsmissbrauch; sie ersetzt
  keinen Sanitizer für semantisch fragwürdige, aber grammatikalisch gültige Werte
  (`position: fixed` auf einem Inline-Element bleibt erlaubt — das ist Designfreiheit, kein
  Angriff). Sollte später ein echter Sanitizer dazukommen, ersetzt er die Grammatik nicht,
  sondern ergänzt sie.
- **Die Anker erreichen das DOM (Tickets 21/22, 18.09.):** `class`-Regeln wurden damals als
  `[data-node-id].name`, `scoped`-Regeln als `[data-node-id].__senify_scope_<id>` emittiert.
  Das Element, das `data-node-id` trägt, trägt jetzt auch die zugewiesenen Klassen
  (`node.classes`) und die deterministische Scope-Klasse; ohne sie wären beide Selektorformen
  tote Regeln gewesen. Scoped-Regeln überleben außerdem den Layout-Splice: `composePageTree`
  gibt die Draft→komponiert-ID-Map mit aus, der Bake remappt die Regeln darauf.
- **Klassen-Emission global (Ticket 14, 19.09.):** `class`-Regeln werden einmalig je Klasse als
  `.name` emittiert (Dedupe über alle Träger, Reihenfolge per `order`); die verankerte Form
  bleibt für Knoten-eigene Zustände (`[data-node-id].cls:hover`, sonst verlöre `.cls` gegen
  `[data-node-id]:hover`) und als Option `classEmission: "regional"`. Gemessen 4,2–8,2x weniger
  Bytes (`.scratch/refs/klassen-emission.md`).

## Folgen

- **Ticket 07 (Style-Rule-Modell)** baut auf dem kanonischen Modell aus
  `packages/widget-engine/src/css/style-rule.ts` auf (`styles`, `contextStyles`, `rawCss`,
  `stylePriorities`, `kind`, freier `selector`, stabile `id`) — nicht auf dem engeren
  B1-Entwurf (`props` + `states`, ohne `selector`/`rawCss`/`contextStyles`), der den Deckel ins
  Datenmodell eingebaut haette.
- **Ticket 10 (Layout-Vokabular)** wird umgeschrieben: es fuegt der Whitelist keine Properties
  hinzu, sondern schafft sie als Tor ab und ergaenzt die Tabelle um Bedienelement-Angaben fuer
  die Layout-Gruppe.
- **Der Compiler bleibt die einzige Uebersetzungsstelle.** Unbekannte Properties gehen als
  `property: value` durch, bekannte behalten ihre Wert-Aufbereitung (Abstandskreuz, Token-
  Auflösung, Einheiten). Kein zweiter Uebersetzer in der UI.
- **Property-Namen:** persistiert werden echte CSS-Namen (`border-radius`, nicht `borderRadius`).
  Die bestehenden Kunstnamen bleiben als Eingangs-Alias lesbar, damit vorhandene Dokumente und
  der Katalog weiterlaufen; geschrieben wird der CSS-Name.
- **Ein Gate-Test haelt die Entscheidung fest:** ein Test schreibt eine Property, die in keiner
  Tabelle steht (z. B. `scroll-snap-type`), und erwartet sie im kompilierten CSS. Er schlaegt an,
  sobald jemand ein neues Schreibtor einbaut.
- **Sicherheit wird explizit statt implizit.** Bisher war die Whitelist die faktische
  Sicherheitsgrenze. Die Wert-Grammatik aus dem Abschnitt „Die Sicherheitsgrenze" ersetzt sie und
  ist die **grosste einzelne Arbeitsposition** dieser Entscheidung — deutlich groesser als der
  Wegfall des Tores selbst.
- **Nur das Style-Tor faellt, nicht die Knoten-Pruefung.** Betroffen ist ausschliesslich
  `assertStyleProp` (Stilwerte einer Regel, **2 Aufrufstellen** in
  `packages/editor/src/state/operations.ts`: Z432 und Z457; dazu die Definition Z121).
  `assertKnownProp` (**4 Aufrufstellen**: Z146, Z282, Z310, Z837; dazu die Definition Z84) prueft
  **Knoten-Props** gegen den Katalog eines Bausteins und faengt Tippfehler wie `hedaing.txt` —
  diese Pruefung **bleibt**. Sie ist kein Stil-Tor: ein Knoten-Prop ist ein Katalog-Vertrag
  (Control, Wertetyp, Bedingung), kein CSS.
- **Zwei Ebenen, zwei Grenzen — die Freiheit gilt fuer Menschen, nicht automatisch fuer Agenten.**
  ADR-0005 oeffnet die **Property-Ebene**. Die **Wert-Ebene** bleibt fuer Agenten-Schreibzugriffe
  eingezaeunt (Ticket 18: Token-Zwang statt Roh-Hex, Herkunfts-Integritaet). Die Fence lebt nicht
  im Compiler und nicht in der Wert-Grammatik, sondern **im Schreibpfad des Stores, abhaengig von
  der Autor-Herkunft** der Mutation. Der Mensch darf `#ff0000` schreiben; ein Agent bekommt
  denselben Wert abgelehnt, solange ein passendes Token existiert. Ohne diese Trennung wuerde die
  Oeffnung die Guardrails aus Ticket 18 aushebeln.

## Verworfene Alternativen

- **Whitelist behalten und Properties nachtragen (Ticket 10 wie geschrieben).** Verworfen: das
  verschiebt den Deckel, statt ihn zu entfernen. Nach der Layout-Gruppe fehlen Pseudo-Elemente,
  danach Keyframes, danach Container-Queries — jedes Mal ein Ticket, und die UI wartet jedes Mal
  auf den Compiler.
- **Freies CSS nur als Textfeld („Custom CSS"-Kasten).** Verworfen: dann gibt es zwei
  Wahrheiten fuer einen Stilwert (strukturiert und Freitext), die Kaskade wird unerklaerbar, und
  der Inspektor kann den Freitext nicht anzeigen. Instatic haelt `rawCss` bewusst schmal
  (nur `@keyframes`) und alles andere strukturiert — dieselbe Linie gilt hier.
- **Offener Wertraum ohne benannte Sicherheitsgrenze.** Verworfen: die Whitelist war faktisch
  die Grenze; sie ohne Ersatz zu entfernen, waere ein Sicherheitsrueckschritt. Regel 4 ist die
  Bedingung, unter der diese Entscheidung gilt.
