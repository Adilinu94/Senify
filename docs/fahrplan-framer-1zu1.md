# Bauplan: Framer-Seiten vollständig übernehmen (1:1, inklusive Animation, 3D, Lenis, GSAP)

> **Dokumenttyp:** Arbeitsplan (Vorhaben), keine Ist-Beschreibung.
> **Stand:** 21.10.2026 · **Basis:** `master` `d14880e` (PR #81 gemergt), Branch `docs/framer-import-bauplan-2026-10-21` (PR #100)
> **Geltung:** Was heute steht, steht in `docs/current/stand.md`; Messzahlen in `docs/current/qualitaet.md`.
> **Verhältnis:** Dieses Dokument ersetzt den früheren Anspruch „so nah wie möglich" durch
> **„1:1, ausdrücklich inklusive Bewegung"**. Es baut auf `docs/fahrplan-framer-import.md` auf und
> erweitert es um die Code-Ebene.

## 1. Das Ziel

Eine Framer-Seite kommt in den Editor und ist danach **nicht unterscheidbar vom Original**:
Layout, Text, Bilder, **Animationen, Scroll-Effekte, 3D-Szenen, Smooth-Scroll** — und sie bleibt
im Editor **bearbeitbar**, soweit Bearbeitbarkeit möglich ist.

Das ist eine bewusste Verschärfung. „Sieht ähnlich aus" ist nicht mehr das Kriterium.

## 2. Der entscheidende Befund vorab

Es gibt **zwei grundsätzlich verschiedene Wege**, und sie schließen sich nicht aus:

| Weg | Was er liefert | Was er kostet |
|---|---|---|
| **A · Struktur** (heute gebaut) | NodeTree: Text, Bilder, Layout als Daten, alles editierbar | Bewegung nur als Preset — bricht bei allem, was nicht „Einblendung von unten" ist |
| **B · Code** (ADR-0010, gebaut, aber ungenutzt) | die echte Framer-Runtime läuft mit — 1:1, nichts geht verloren | der Bereich ist **nicht** editierbar; er ist ein Paket neben dem Baum |
| **C · Projekt-Schnittstelle** (Framer MCP, am 21.10. getestet) | echte Struktur: benannte Komponenten, `layout="stack"`, Tokens, Text-Stile | braucht Zugang zum Framer-Projekt; Zeitsteuerung fehlt auch hier |

**Die entscheidende Erkenntnis dieser Analyse:** Weg B ist **kein Kompromiss, sondern die
Voraussetzung für die 1:1-Zusage**. Wer 3D-Szenen, Lenis und GSAP „exakt" will, bekommt sie nur,
wenn der Original-Code mitläuft. Das Repo hat dafür bereits die Entscheidung (ADR-0010) und den
Mechanismus (Island-Payload) — **er wird vom Import aber nur bei Mirror-Quellen benutzt**
(`import.ts:184`: `input.source.kind === "mirror"`, sonst keine Payloads).

**Das ist der Angelpunkt dieses Plans:** Nicht „wie bauen wir Animationen nach", sondern
**„wie bringen wir den Original-Code auch bei einem URL-Import mit"**.

## 3. Was heute wirklich da ist

### 3.1 Jede Behauptung mit Datei und Zeile (am 21.10.2026 gegengeprüft)

Weil dieser Plan behauptet „das ist schon gebaut" und „das fehlt", hier jede Stelle mit Datei und
Zeile — nicht als Zusammenfassung, sondern nachprüfbar.

**Gebaut und einsatzfähig:**

| Baustein | Datei:Zeile | Was dort steht |
|---|---|---|
| Island-Payload (Fremd-Code neben dem Baum) | `packages/engine/src/code-payloads.ts` | Ablage eines Code-Pakets mit `bytes` und `integrity` aus dem Bundle |
| Payload als Island-Art | `packages/renderer/src/islands.ts:13` | `IslandKind` enthält `"payload"` |
| Payload wird als Island bedient | `packages/renderer/src/islands.ts:54` | `if (node.type === "payload")` |
| Payload-Träger-Knoten | `packages/widget-engine/src/catalog.ts` | Primitiv mit `payloadId`, `poster` |
| Payload-Bündelung zur Import-Zeit | `packages/framer-import/src/payloads.ts:95` | esbuild mit `stdin` und `resolveDir` |
| three.js zur Bake-Zeit | `packages/renderer/src/webgl-vendor.ts` | eigenes Bundle |
| Lenis (Smooth-Scroll) | `packages/renderer/src/bake.ts` | `lenis.min.js` im Vendor-Bündel |
| GSAP + ScrollTrigger + SplitText | `packages/renderer/src/bake.ts:231-236` | drei Vendor-Dateien |

**Gebaut, aber mit Lücke:**

| Datei:Zeile | Was dort steht | Lücke |
|---|---|---|
| `packages/framer-import/src/import.ts:184` | `input.source.kind === "mirror" ? extractPayloads(...) : []` | Der URL-Import bekommt **nie** Payloads |
| `packages/framer-import/src/motion-mapping.ts:77` | `durationScale: Math.max(0.1, duration / 300)` | Einheit falsch (Sekunden gegen Millisekunden) |
| `packages/framer-import/src/motion-mapping.ts:35-43` | `appearPreset`: nur `x=0`, `scale=1`, `y>=0` | 3D-Kippung, Seitwärts, Skalierung fallen weg |
| `packages/renderer/src/motion.ts:157` | `(durationScale ?? 1) * baseDurationMs / 1000` | macht aus `0.1` → 30 ms |
| `packages/framer-import/src/normalize.ts:352` | `if (property.startsWith("-webkit-") …)` → `delete` | 4121 von 7602 Deklarationen bei last-studio |

**Nicht gebaut - Stand 21.10.2026.** Diese Tabelle ist der Ausgangsbefund; drei der vier Zeilen
sind inzwischen gebaut. Die Spalte „Heute" nennt, was daraus wurde - der Befund bleibt stehen,
weil er die Reihenfolge der Schritte begründet hat.

| Was (21.10.2026) | Beleg damals | Heute |
|---|---|---|
| Der Weg vom URL zum Mirror | `import.ts:31` kennt `{ kind: "mirror" }` als **Eingabe**. Niemand erzeugt sie aus einer URL; der Mirror muss heute von Hand bereitliegen. | **gebaut** (Schritt 1): der URL-Import erzeugt den Mirror selbst; mit `capture: "browser"` liest er sogar die hydratisierte Seite (gemessen 15,74 → 11,25 %) |
| Appear-Spec → CSS-Keyframes | Keine Datei im Repo erzeugt aus `appearAnimationsContent` ein `@keyframes`. | **gebaut** (Schritt 4b): `appear-css.ts`, Beleg `appear-bake.test.ts` |
| Framer-Runtime als Payload | `payloads.ts` bündelt nur die in `data-framer-module` genannten Module. `script_main.*.mjs` wird nie gelesen (im Code geprüft). | **gebaut** (Schritt 2): `buildPageRuntimePayload` bündelt die Runtime als Seiten-Payload |
| Hover als *Bewegung*, Scroll-Trigger | kommen nicht aus dem SSR; kein Pfad im Import liest sie. | **gebaut** (Schritt 2): sie reisen mit der Runtime; der Bericht nennt jede Seite, die als Original-Code läuft |

### 3.2 Die Lücken in Kurzform - **Stand 21.10.2026, inzwischen alle geschlossen**

> **Diese Tabelle ist der Ausgangsbefund, nicht der heutige Stand.** Sie steht hier, weil die
> Schritte 2 bis 4b sie einzeln adressiert haben; alle fünf Zeilen sind geschlossen (Belege in
> den jeweiligen Schritt-Abschnitten und in `docs/current/qualitaet.md`). Wer den heutigen Stand
> sucht, liest `docs/current/stand.md`.

| Lücke (21.10.2026) | Folge damals | Heute |
|---|---|---|
| URL-Import bringt keine Payloads mit | Kein Original-Code bei einem normalen Import | **geschlossen** (Schritt 1/2): URL-Import bündelt die Runtime als Seiten-Payload, gemessen 1,24 MB bei `donutshop`, 2,83 MB bei `unifiersofjapan` |
| Framer-Runtime wird nie mitgenommen | Lenis/three.js/GSAP der Quelle fehlen | **geschlossen** (Schritt 2): `buildPageRuntimePayload`; Lenis, three.js und die 3D-Kippung reisen mit |
| Zeitmaßstab um Faktor ~47 falsch | Einblendung dauert 30 ms statt 1400 ms | **geschlossen** (Schritt 4): `durationUnit` je Sample, `durationScale` gegen die echte Basis-Dauer |
| Nur Einblendungen von unten abbildbar | 3D, Seitwärts, Skalierung bleiben Befund | **geschlossen** (Schritt 4b): `appear-css.ts` schreibt `@keyframes` mit der Transform-Reihenfolge der Quelle, `rotateX(-25deg)` geprüft |
| Vier von zehn Seiten: Animation ganz verloren | `appearId` da, `appearAnimationsContent` fehlt | **geschlossen** (Schritt 5, Punkt 1): 39 Einblendungen aus dem Startzustand abgeleitet, Dauer als Annahme benannt |

### 3.3 Der wichtigste gemessene Befund
An der Earn-Seite: **Lenis 10×, three.js 6×, `data-framer-appear-id` 11×, GSAP 0×, ScrollTrigger 0×.**
Das bestätigt die S0-Messung aus ADR-0010: **Framer nutzt seine eigene Runtime, nicht GSAP.**
„GSAP übernehmen" heißt also in Wahrheit: **die Framer-Runtime übernehmen.** GSAP und Lenis sind
in Senify vorhanden, aber sie sind nicht das, was die Quelle antreibt.

## 4. Werkzeuge und Quellen, die helfen — geprüft am 21.10.2026

### 4.0 Was hier „geprüft" heißt — und was nicht

Damit niemand eine Behauptung für eine Messung hält, ist jeder Eintrag mit einem **Prüfgrad**
versehen:

| Grad | Bedeutung |
|---|---|
| **A · ausgeführt** | Ich habe das Werkzeug auf diesem Rechner installiert/geklont, gegen echte Framer-Seiten laufen lassen und die Ausgabe gelesen. |
| **B · Code gelesen** | Ich habe den Quelltext gelesen (nicht nur die README) und kann die Aussage an einer Datei festmachen. |
| **C · nur Beschreibung** | Nur die Projektbeschreibung/Store-Seite gelesen. **Nicht** belegt. |

**Übersicht:**

| Werkzeug | Grad | Was genau gemacht |
|---|---|---|
| Framer MCP | **A** | 23 Werkzeuge aufgelistet, `getProjectXml`, `getNodeXml` (3 Seiten), `getCMSCollections`, `exportReactComponents` selbst aufgerufen |
| Niranjan266/unframer | **A** | geklont, `npm install`, zwei Seiten exportiert (`donutshop`, `wedge`), beide verifiziert; `src/appear.ts`, `reveal.ts`, `verify.ts` gelesen |
| danbenba/FramerExport | **B** | geklont, `src/` gelesen (`capture.ts`, `snapshot.ts`); **nicht** ausgeführt |
| remorses/unframer | **A** (nur MCP-Teil) | Über den MCP-Endpunkt `exportReactComponents` aufgerufen → Abo-Fehler. Die CLI selbst **nicht** ausgeführt |
| SingleFile, monolith | **C** | nur Beschreibung/Zahlen. **Nicht** ausgeführt |
| Full Site Export | **C** | nur die Marketplace-Beschreibung gelesen. **Nicht** ausgeführt |
| rakshith48/framer-to-cloudflare | **B** | README gelesen, nicht ausgeführt |
| 6 weitere Klein-Repos | **C** | nur Suche/API-Metadaten, siehe §4.7 |

**Was das für den Plan heißt:** Die zwei tragenden Aussagen (Animations-Kompilierung funktioniert;
Ganzseiten-Export schwächer als unserer) sind **Grad A**. Alles andere ist Vorarbeit, die vor dem
Bau auf Grad A gehoben werden muss — das steht in den Gates der Schritte.

### 4.1 Unframer / Framer MCP — **Grad A, am 21.10.2026 selbst getestet**

Der Zugang wurde geprüft (Endpunkt antwortet, Server `Framer MCP 1.8.0`, 23 Werkzeuge).
Getestet am Projekt `sustained-shares-680007` (drei Seiten: `/`, `/contact`, `/404`).

**Was `getProjectXml` liefert** (23 KB): die Projektstruktur als XML —
`<Pages>` mit `nodeId` und `path`, `<Components>` mit Namen (`Primary Button`,
`Services Card`, `Avatar`, …), dazu **Text-Stile** (`/Body/Body-16Px-Medium`,
`font="CUSTOMV2;Neue Montreal Medium"`, `fontSize`, `lineHeight`) und
**Farbstile als Pfade** (`/White/White`, `/Blue/Dark Blue`).

**Was `getNodeXml` liefert** (92 KB für die Startseite): die **echte Layout-Struktur**
mit lesbaren Namen und Layout-Attributen —

```xml
<HeroSection nodeId="RPkptGUwn" width="1fr" height="100vh" overflow="clip"
             layout="stack" padding="168px 30px 54px 30px"
             stackDirection="horizontal" stackDistribution="center">
  <Image position="absolute" width="100%" height="100%" centerX="50%" centerY="50%"
         backgroundImage="https://framerusercontent.com/images/…" zIndex="1" />
  <Container width="1fr" maxWidth="1140px" layout="stack">
    <Content layout="stack" gap="176px" stackDirection="vertical" stackAlignment="start">
```

Das ist **strukturell genau das, was wir brauchen**: `layout="stack"` statt gerenderter
Grid-Zellen, benannte Komponenten statt anonymer `div`s, Token-Pfade statt ausgerechneter
Farben.

**Animationen stehen als Parameter im XML.** Gemessen im selben Seiten-XML: ein
Carousel mit `effectsOptions='{"effectsScale":0.9,"effectsPerspective":1146,
"effectsRotate":0,"effectsHover":true}'`. Die **Wirkung** ist also beschrieben — aber
`appear`, `transition`, `animation`, `transform` kommen im XML **0-mal** vor: die
Zeitsteuerung (Startzustand, Dauer, Easing) steht **nicht** darin.

**Grenzen, gemessen:**

- `exportReactComponents` antwortet: *„No active React Export subscription found"* — der
  React-Export ist **kostenpflichtig** und mit diesem Zugang **nicht** nutzbar.
- `getCMSCollections` liefert in diesem Projekt nur die Format-Doku, keine Sammlungen
  (das Projekt hat keine).
- `<CodeFiles>` taucht im Projekt-XML nicht als Block auf; der Server verweist für
  Code-Dateien auf eine eigene Anleitung (`mcp://…/how-to-write-framer-code-files.md`).
- Das XML ist **schreibend** gedacht (`updateXmlForNode`, `createPage`, `deleteNode`) —
  es ist eine Projekt-Schnittstelle, keine Export-Schnittstelle.

**Was das für den Plan heißt:** Das MCP ist ein **starker Struktur-Lieferant** — besser als
der SSR-Weg, weil es Namen, Stapel-Layout und Tokens kennt. Es ist **kein** Lieferant für
Zeitsteuerung und **kein** Ersatz für die Original-Runtime. Es braucht außerdem Zugang zum
**Framer-Projekt** (Plugin), nicht nur zur veröffentlichten Seite.

### 4.2 FramerExport / F-EXPORT (MIT, Open Source) — **Grad B, Code gelesen**

npm `framer-export@5.0.2`, MIT, Repo `danbenba/FramerExport` (67 ★, letzter Push 2026-09-15).
**Geklont und `src/` gelesen, aber nicht ausgeführt.**

- **Was es ist:** `npm i -g framer-export`. Lädt die Seite in einem Headless-Browser (Puppeteer),
  nimmt das gerenderte Ergebnis auf, lädt jedes Asset, schreibt CDN-URLs auf relative Pfade um,
  entfernt Plattform-Badges und Tracker, legt einen `serve.js` dazu. Kennt 25 Plattformen und
  erkennt sie an der URL.
- **Was es löst:** **Genau unsere Lücke beim Mirror.** Es liefert das, was im SSR fehlt: die
  Sterne, den hydratisierten Zustand, alle Assets — als lokale Dateien. Und es macht daraus einen
  **Mirror**, also eine Quelle, für die unser Payload-Extraktor bereits gebaut ist (`import.ts:184`).
- **Belegte Grenze (im Code geprüft):** Es hat **keine Animations-Kompilierung.** Die einzigen
  `@keyframes` in `src/` gehören zur eigenen Bedienoberfläche (`src/ui/page.ts`:
  `screen-enter`, `dialog-enter`), nicht zu den exportierten Seiten. Es sucht weder
  `framer/appear` noch `appearAnimations` noch `keyframes` in den Zielseiten.
  **Folge:** Ein Mirror daraus enthält den Startzustand, aber keine Animation — die Animation
  müsste aus dem Mirror **nachträglich** kompiliert werden (§4.5, Schritt 4b).
- **Lizenz:** MIT (`package.json` und Registry bestätigen es).
- **Aufwand:** klein. Ein CLI-Aufruf.
- **Erledigt (24.10.2026):** Der echte Lauf gegen Framer-Seiten ist der Blindtest
  (`scripts/blindtest.ts`, acht fremde Seiten, Import → Backen → Pixel-Differenz in drei
  Breiten). Das Werkzeug selbst wurde **nicht** als Abhängigkeit genommen: der Mirror läuft im
  vorhandenen Analyse-Worker (Schritt 1), und dessen Browser-Capture ist seit 24.10.2026 über
  `capture: "browser"` erreichbar.

### 4.3 Full Site Export (Framer-Marketplace-Plugin, kostenpflichtig)

- **Was es ist:** Plugin, liest die veröffentlichte Seite „wie jeder Besucher" und gibt Dateien
  zurück. Drei Modi: *Perfect Copy* (pixelgenau statisch), *Exact (Next.js)*, *Readable (React)*.
- **Was es löst — und das ist bemerkenswert:** laut eigener Beschreibung **CMS-Sammlungen aus dem
  Laufzeitverkehr**, **Scroll-Reveals mit Stagger, Endlos-Marquee als CSS**, WebGL in den exakten
  Kopien. Entfernt Framer-Badge, Editor-Leiste, Analytics.
- **Grenzen (ehrlich benannt):** Der *Readable*-Export ist „nah dran, nicht pixelgleich"; eine
  frame-genaue Komponente (WebGL-Hintergrund) überlebt nur in den exakten Kopien; die Seite muss
  veröffentlicht sein; **„It does not change what you are licensed to own."**
- **Preis:** 3 kostenlose Exporte à 3 Seiten, danach Lizenzschlüssel (10 USD/Monat, 50 Seiten).
- **Aufwand:** klein — aber es ist ein **externes, kostenpflichtiges Werkzeug** und eine
  Produktentscheidung.

### 4.4 Was ausdrücklich **nicht** hilft

- **„Framer hat keinen HTML-Export"** — richtig, und deshalb ist jeder Weg ein Nachbau oder ein
  Mirror. Es gibt keinen offiziellen Export, auf den man sich stützen könnte.
- **Nur auf GSAP setzen** — die Quelle nutzt es nicht (0 Treffer). GSAP nachzubauen, wo Framer eine
  eigene Runtime hat, wäre eine Fälschung.
- **Den SSR-Weg weiter perfektionieren** — er kann die Browser-Phase grundsätzlich nicht sehen. Das
  ist keine Implementierungslücke, sondern eine Grenze der Quelle (in `docs/adr/0010` bereits
  festgehalten).

### 4.5 GitHub-Recherche: kostenlose Alternativen (21.10.2026, mit Zahlen)

Recherchiert über die GitHub-API (Sterne, Lizenz, letzter Push, archiviert) und **am Code
gelesen**, nicht nur an der Beschreibung.

| Repo | ★ | Lizenz | letzter Push | Was es kann | Urteil |
|---|---|---|---|---|---|
| **Niranjan266/unframer** | 1 | **MIT** | 2026-08-22 | Framer-Seite → portables HTML/CSS. **Kompiliert die Appear-Spec zu CSS-Keyframes** (`src/appear.ts`), rekonstruiert **Scroll-Reveals** (`src/reveal.ts`), **Ticker** (`src/ticker.ts`), entfernt Runtime + Tracker, `--offline`, eigene **Verifikation** gegen das Original | **der beste Code-Fund** — aber Einzelprojekt, 1 Stern |
| **danbenba/FramerExport** | 67 | **MIT** | 2026-09-15 | Headless-Mirror für 25 Plattformen, wartet auf Hydration, lädt alle Assets, rewritet CDN-Pfade | **reifer**, aber ohne Animations-Kompilierung |
| **remorses/unframer** | 258 | *kein Lizenzfeld* | 2026-10-21 | React-Komponenten mit Framer-Motion | aktiv, aber React-Export **kostenpflichtig** (getestet) |
| **gildas-lormeau/SingleFile** | 22 652 | **AGPL-3.0** | 2026-10-20 | speichert eine Seite als **eine** HTML-Datei, sehr ausgereift | **AGPL** — für eigene Nutzung unkritisch, für Weitergabe nicht |
| **Y2Z/monolith** | 15 524 | **CC0-1.0** | 2026-10-16 | Seite als eine HTML-Datei, CLI + Library | **CC0** = keine Bedingungen; gut als Notfall-Mirror |
| **rakshith48/framer-to-cloudflare** | 3 | MIT | 2026-03-15 | Claude-Code-Skill, der eine Framer-Seite spiegelt und auf Cloudflare legt | Idee gut, Umsetzung ein Skill |

**Selbst getestet, nicht nur gelesen** — `Niranjan266/unframer`, geklont und ausgeführt:

```
npx tsx src/cli.ts https://donutshop.framer.website/ --out out --offline
  ✓ 4 Seiten exportiert (/, /about, /contact, /menu), 54,7 MB mit Assets
  totalAnimationRules: 0      ← weil der appear-Kanal dort fehlt (U5 b)
  verify: Pixel 0,01–6,28 %, aber sichtbarer Text nur 84–94 %

npx tsx src/cli.ts https://wedge.framer.website/ --out out-wedge --offline
  totalAnimationRules: 85     ← hier ist der Kanal da
  verify: Pixel 17–44 %, Text 30–96 %
```

**Die zwei Lehren daraus:**

1. **Die Animations-Kompilierung funktioniert** — 85 Regeln aus einer echten Seite, ohne
   JavaScript. Genau die Lücke, die unser Import hat.
2. **Als Ganzseiten-Export ist es schwächer als unser Import.** Bei `wedge` liegen wir bei
   **0,46 %**, das Werkzeug bei **17–44 %**. Es fehlt Text (30 % bei einer Seite), es gibt
   HTML-Strukturfehler, und die Verifikation schlägt auf allen vier Routen fehl.

**Das heißt: nicht ersetzen, sondern den einen Baustein übernehmen.** Das MIT-lizenzierte
`src/appear.ts` (10,9 KB) löst ein Problem, das wir messbar haben. Es ist klein, dokumentiert
und ohne Abhängigkeit außer `cheerio` (das wir nicht brauchen — wir haben schon einen Scanner).

**Was in `src/appear.ts` steht und was wir daraus lernen** (die Kommentare sind wertvoll, weil
sie dieselben Fallen benennen, in die unser Import läuft):

- „The inline state is the trap: strip Framer's runtime without compiling the JSON and every
  animated element stays permanently invisible." — **genau unser Fall** (U5 b).
- Breakpoint-Varianten müssen als `:not(.hidden-<hash>) [data-framer-appear-id="<id>"]` gescoped
  werden, sonst bleibt ein Element auf dem Breakpoint unsichtbar, den man vergessen hat.
- Die Transform-Reihenfolge muss Motion's eigener `buildTransform` folgen (perspective,
  translate, scale, rotate, skew) — sonst entstehen „subtly different matrices".
- `src/reveal.ts` beschreibt die zweite Lücke: „framer.university has 325 such elements and zero
  appear-ids" — Elemente mit `opacity:0`, die **keine** deklarativen Daten haben.
- `src/verify.ts` nennt drei Fallen beim Messen: ein nicht komponierender Tab lässt Animationen
  nie laufen (`finish()` statt warten), versteckte Geräte-Varianten haben keine laufenden
  Animationen (nur gerenderte Elemente prüfen), und „kein Element bei opacity 0" ist notwendig,
  aber nicht hinreichend für „die Seite ist lesbar".

**Empfehlung nach dieser Recherche:** `Niranjan266/unframer` **nicht als Werkzeug** einsetzen
(der Ganzseiten-Export ist schwächer als unserer), sondern **die zwei Module als Vorlage lesen**
und die Logik in unseren Capture einbauen — MIT erlaubt das ausdrücklich, auch ohne
Quellenangabe. Das ist keine Abhängigkeit von einem 1-Stern-Projekt, sondern eine übernommene
Idee mit belegter Wirkung.

### 4.5b Die geprüften Klein-Repos (Grad C — nur Metadaten, nicht ausgeführt)

Vollständigkeit halber, damit die Suche nachvollziehbar ist. **Keines davon wurde ausgeführt**;
sie sind hier, weil sie in der Suche auftauchten und ein zweites Mal geprüft werden müssten,
falls die tragenden Kandidaten ausfallen.

| Repo | ★ | Lizenz | letzter Push | Was die Beschreibung sagt | Warum nicht gewählt |
|---|---|---|---|---|---|
| `Ostavnow/Exporter-Framer` | 0 | — | 2026-08-21 | „Export site framer" | keine Beschreibung, keine Lizenz |
| `Shakunth/framer-exporter-cli` | 0 | — | 2026-10-21 | „Framer to React Agent: Clone, Own & Edit Any Published Site" | keine Lizenz, keine Belege |
| `shafanaura/framer-to-html` | 2 | — | 2026-08-07 | (leer) | keine Beschreibung, keine Lizenz |
| `kiteprize/framer-to-html` | 0 | — | 2025-07-07 | (leer) | ein Jahr alt, keine Lizenz |
| `onunbeai/framer-to-html-kodety-skill` | 0 | — | 2026-10-02 | Skill für Claude Code/Codex, „Pixel Perfect" | keine Lizenz |
| `zaynors/framer-export` | 3 | — | 2026-07-01 | (leer) | keine Beschreibung |
| `zumuuser/framer-clone-portal` | 1 | — | 2026-07-28 | „Export Framer sites to GitHub" | keine Lizenz |
| `michalporada/framer-marketplace-scraper-py` | 1 | — | 2026-01-13 | scrapt den Marketplace, nicht Seiten | falsches Ziel |

**Muster:** Fast alle tragen **keine Lizenz** und **keine Beschreibung**. Für eine Übernahme
scheiden sie damit aus, egal wie gut sie wären — man weiß nicht, was man darf.

### 4.6 Der Vergleich in einer Tabelle

| Werkzeug | Lizenz | Liefert | Löst für uns | Grenze |
|---|---|---|---|---|
| **Niranjan266/unframer** | **MIT** | HTML/CSS-Export + **Appear→CSS-Keyframes**, Reveals, Ticker, Verifikation | **die Animationslücke** (Schritt 4b) | Ganzseiten-Export schwächer als unserer (17–44 % gegen 0,46 %) |
| **danbenba/FramerExport** | **MIT** | hydratisierter Mirror, 25 Plattformen, alle Assets | **die Lücke zum SSR-Weg** | keine Animations-Kompilierung |
| **Framer MCP** (getestet) | Zugang nötig, React-Export **kostenpflichtig** | Projekt-XML: Seiten, Komponenten, `layout="stack"`, Tokens, Text-Stile | **Struktur ohne Raten** | keine Zeitsteuerung (0 Treffer), braucht Projekt-Zugang |
| **SingleFile** | AGPL-3.0 | Seite als eine HTML-Datei | Notfall-Mirror | AGPL, 22 652 ★, sehr ausgereift |
| **monolith** | CC0-1.0 | Seite als eine HTML-Datei | Notfall-Mirror ohne Bedingungen | kein Struktur-Import |
| **Full Site Export** | kommerziell | Perfect Copy / Exact / Readable; CMS | sofort 1:1 inkl. CMS | **nicht gewählt** (E2) |
| **eigener Weg** (SSR + Payload + CSS-Keyframes) | hausgemacht | was wir bauen | volle Kontrolle, keine Kosten | der meiste Aufwand |

**Die Empfehlung in einem Satz (nach deinen Entscheidungen):** Die Appear→CSS-Kompilierung aus
`Niranjan266/unframer` (MIT) als Vorlage in den eigenen Capture einbauen, den Mirror über den
vorhandenen Analyse-Worker bauen, die Original-Runtime als Payload mitnehmen (ADR-0010, E1 ja) —
und das Framer-MCP als zweite Strukturquelle dazunehmen, wo Projekt-Zugang besteht (E5).

## 5. Der empfohlene Weg: drei Quellen, ein Dokument

Die 1:1-Zusage und die Bearbeitbarkeit sind **zwei Ziele, die sich teilweise ausschließen**. Der
Plan trennt sie sauber, statt eines zu opfern:

```
                       ┌──────────────────────────────┐
  URL der Seite ──────►│ 1. Struktur-Import (heute)   │──► NodeTree: Text, Bilder, Layout
                       └──────────────────────────────┘    editierbar, Presets für Bewegung
                       ┌──────────────────────────────┐
  Framer-MCP-Zugang ──►│ 2. Projekt-Struktur (neu)    │──► benannte Komponenten, Stapel-Layout,
                       └──────────────────────────────┘    Tokens, Text-Stile — editierbar
                       ┌──────────────────────────────┐
  URL der Seite ──────►│ 3. Code-Übernahme (ADR-0010) │──► Island-Payload: Framer-Runtime,
                       └──────────────────────────────┘    three.js, Lenis, Effekte — 1:1
                                     │
                                     ▼
                       Beides wird zu EINER Seite verschmolzen:
                       Struktur trägt den Inhalt, Payload trägt die Bewegung.
```

**Warum eine dritte Quelle?** Der SSR-Weg muss erraten, was das Framer-Projekt weiß: dass
`layout="stack"` ein Flex-Container mit `gap` ist, dass `/White/White` ein Token ist, dass
„Large" und „Large Mobile" **dieselbe** Karte sind — genau der Fehler, der `last-studio` auf 65 %
treibt (U1 im Schwesterdokument). Mit der Projekt-Schnittstelle fällt das Raten weg.

**Regel der Verschmelzung:** Die Projekt-Struktur bestimmt, **was** ein Element ist (Stapel,
Komponente, Text-Stil). Der SSR-Weg liefert, **wie** es gerendert wird (konkrete Pixel,
berechnete Farben). Der Payload übernimmt die Flächen, die er allein originalgetreu kann. Wo
Struktur und Payload dasselbe Element betreffen, **gewinnt der Payload** — 1:1 schlägt
Bearbeitbarkeit, und der Editor zeigt statt des Payloads sein Poster.

### 5.1 Warum diese Reihenfolge

1. **Erst den Code-Weg bauen**, nicht den Struktur-Weg weiter polieren. Der Struktur-Weg ist bei
   **3 von 7** fremden Seiten brauchbar (korrigiert am 21.10.2026, siehe Schritt 3: die frühere
   Zahl „4 von 11" stammte aus einer Messung, die auf die kürzere Bildhöhe schnitt und Fehler
   verdeckte); der Code-Weg ist bei **jeder** Seite 1:1, weil er die Originaldateien
   ausführt. Die 1:1-Zusage hängt am Code-Weg.
2. **Dann die Projekt-Schnittstelle als zweite Strukturquelle.** Sie ist dort stärker, wo der
   SSR-Weg rät (Stapel, Komponenten, Tokens). Sie ersetzt ihn nicht: nicht jeder Kunde gibt
   Projekt-Zugang, und sie liefert keine Zeitsteuerung.
3. **Dann die Naht.** Wo der Payload steht, muss der Struktur-Knoten unsichtbar sein, sonst
   steht alles doppelt.

## 6. Die Schritte

Jeder Schritt hat ein Gate. Kein Schritt gilt als fertig, ohne dass sein Gate auf **allen elf
Messseiten** ausgeführt ist (§8).

### Schritt 1 · Den Mirror-Weg zur Produktquelle machen - **umgesetzt 24.10.2026 (als opt-in)**

**Stand 24.10.2026 - was wirklich fehlte.**
Der Gate unten war erfüllt (`donutshop` hat ein Seiten-Payload), aber der **Struktur**-Weg war es nicht:
`captureBrowser` war seit dem Browser-Slice exportiert und wurde von `runImport` **nie aufgerufen** -
der Import las bei einer URL immer das Server-HTML. Genau daher kamen die zwei Lücken, die wie
Import-Fehler aussahen (die Sterne der Bewertung, die Karten von `unifiersofjapan`).

**Gemessen mit beiden Quellen, derselbe Import, 1440 px, Struktur-Bake, Höhe beidseitig exakt:**

| Quelle | Pixel-Differenz | `viewBox="0 0 524 676"` | `ssr-variant` | Appear-Marker (`donutshop`) |
|---|---|---|---|---|
| Server-HTML | 15,74 % | 0 | 56 | 52 |
| hydratisierte Seite | **11,25 %** | **49** | **28** | 18 |

Die hydratisierte Seite füllt die Platzhalter und hat die Geräte-Varianten schon gefaltet - sie
**verliert** aber die Appear-Marker und den Breakpoint-CSS-Kanal. Deshalb ist der Weg ein
**Schalter** (`capture: "browser"`), kein neuer Standard: eine Seite, deren Einblendungen
aus dem abgeleiteten Startzustand kommen, verlöre sie. Beleg: `structure-source-browser.test.ts`
(2 Fälle; der SSR-Weg findet das per Skript gefüllte Element nicht, der Browser-Weg schon).

**Was zusätzlich gebaut wurde, weil der Bericht schwieg:** die leeren Platzhalter werden jetzt
benannt (`code-component`, `info`, mit Anzahl und Signatur) - vorher standen 15 leere Kästen auf
`unifiersofjapan` ohne einen Satz dazu. Beleg: `runtime-placeholder.test.ts` (5 Fälle; ohne den
Fix 3 rot).

**Ziel:** Ein URL-Import erzeugt zuerst einen lokalen Mirror (hydratisierte Seite + alle Assets),
und dieser Mirror ist die Quelle für **beides**: Struktur und Payload.

**Entschieden (E2, E4: kostenlos):** Der Mirror läuft im **vorhandenen Analyse-Worker**, nicht über
ein zweites Werkzeug. Der Browser ist schon da, die Adressprüfung ist schon da
(`allowOrigins`, ADR-0022) — ein zweites Werkzeug mit eigenem Chrome wäre eine zweite
Sicherheitsgrenze.

**Was aus der GitHub-Recherche (§4.5) übernommen wird** — als Vorlage gelesen, nicht als
Abhängigkeit:

- `Niranjan266/unframer` `src/appear.ts`: liest die Appear-Spec **bevor** sie entfernt wird und
  kompiliert sie zu CSS-Keyframes. MIT, 10,9 KB, ohne Abhängigkeit außer `cheerio` (das wir nicht
  brauchen). **Das ist der Kern.**
- `src/reveal.ts`: die zweite Lücke (Elemente mit `opacity:0` **ohne** deklarative Daten).
- `src/verify.ts`: die drei Messfallen (nicht komponierender Tab, versteckte Geräte-Varianten,
  „kein Element bei opacity 0" ist nicht genug).

**Nicht übernommen:** der Ganzseiten-Export des Werkzeugs. Gemessen ist er **schwächer** als
unser Import (wedge: 17–44 % gegen unsere 0,46 %).

**Gate:** Ein URL-Import erzeugt einen Mirror, und `extractPayloads` findet darin mindestens ein
Payload auf einer Seite, die heute 0 hat (`donutshop`). Ein Testfall, der ohne den Schritt rot ist.

### Schritt 1b · Die Projekt-Schnittstelle als zweite Strukturquelle (nur wenn E5 ja)

**Ziel:** Wo Projekt-Zugang besteht, die Struktur **lesen** statt raten.

- `getProjectXml` + `getNodeXml` liefern `layout="stack"`, `stackDirection`, `gap`, `padding`,
  `zIndex`, Token-Pfade und Text-Stile — gemessen, siehe §4.1.
- Ein neuer IR-Zweig `project-xml` neben `html`: dieselbe IR-Form, anderer Leser.
- **Was es löst:** Der Faltungs-Fehler aus U1 (zwei `ssr-variant`-Kopien) entsteht gar nicht,
  weil das Projekt **eine** Karte kennt, nicht zwei Geräte-Kopien. Ebenso fallen die
  geratenen Grid-Spannen weg (`layout="stack"` ist ein Flex-Stack, kein Grid).
- **Was es nicht löst:** Zeitsteuerung (`appear`/`transition` fehlen im XML, gemessen 0-mal).
  Dafür bleibt Weg B.

**Gate:** Eine Seite, die über MCP importiert wurde, hat **keine** Knoten mit doppelter
Geräte-Kopie (gemessen), und ihre Struktur nennt Komponenten beim Namen.

### Schritt 3 · Den Messapparat härten — **umgesetzt 21.10.2026**

**Ziel:** Die Messung darf einen Fehler nicht verstecken.

**Was falsch war:** Der Blindtest schnitt beide Screenshots auf die **kürzere**
Höhe (`Math.min(a.height, b.height)`). Eine Seite, die 8000 px zu lang war, wurde
damit auf den gemeinsamen Teil verglichen — der Fehler verschwand aus der Zahl.
Genau dieser Fehler stand in den dokumentierten Werten.

**Was jetzt gilt:** Der **höhere** Rahmen ist das Maß, und der Streifen, den das
kürzere Bild nicht erreicht, zählt als Unterschied — dieselbe Regel, die
`diffScreenshots` schon benutzt. Das ist als Test festgehalten
(`packages/analysis-worker/test/visual.test.ts`, „compares images of different
heights against the taller canvas").

**Der Blindtest ist jetzt ein Skript im Repo** (`packages/framer-import/scripts/blindtest.ts`),
kein Wegwerf-Skript in einem Temp-Ordner: acht fremde Framer-Seiten, Import →
Backen → Pixel-Differenz bei 1440 / 900 / 390 px, mit Höhenvergleich.

**Die korrigierte Messung (22.10.2026, Desktop / Tablet / Mobil):**

| Seite | Pixel-Differenz | Höhe Import − Quelle | Urteil |
|---|---|---|---|
| wedge | 0,92 / 1,35 / 0,86 % | **0 / 0 / 0 px** | brauchbar |
| meeko | 0,40 / 0,64 / 1,09 % | **0 / 0 / 0 px** | brauchbar |
| refined | 1,66 / 2,40 / 5,64 % | −18 / −18 / −36 px | brauchbar |
| donutshop | **11,81 / 10,12 / 20,51 %** | **+3 / +3 / −35 px** | grenzwertig |
| last-studio | **24,85 / 23,30 / 15,34 %** | +177 / +107 / +43 px | nicht brauchbar |
| unifiersofjapan | 21,61 / 24,09 / 26,68 % | +780 / −615 / +182 px | nicht brauchbar |
| notes | 27,95 / 34,23 / 36,64 % | −242 / −241 / −503 px | nicht brauchbar |

**Was die Zahl am 22.10.2026 bewegte** (U1, `docs/fahrplan-framer-import.md`):
`last-studio` lag bei 80,21 / 78,66 / 83,74 % und ist auf **24,85 / 23,30 /
15,34 %** gefallen; `donutshop` von 45,28 / 44,36 / 44,52 % auf **11,81 / 10,12 /
20,51 %**. Drei Fehler zusammen: die Seiten liefern ihre Breakpoints nicht im
Kanal (nur im `data-framer-breakpoint-css`-Block), der `hidden-`-Marker wurde
zu weit vererbt, und das Geräte-Universe war zu klein. `refined` und `wedge`
bleiben unverändert — der Gegenbeweis, dass die Änderung nicht breit streut.

**Ergebnis: 3 von 7 Seiten sind brauchbar** (statt der vorher dokumentierten
„4 von 11"). Die Abweichung ist nicht die neue Regel, sondern die alte, die
Fehler verdeckt hat. `receivio` ist inzwischen 404 und fällt aus der Gruppe.

**Was noch offen ist:** `unifiersofjapan` verliert weiter Fläche - dort ist es
**nicht** die Geräte-Faltung. Das braucht eine eigene Messung.

**`notes` ist nachgezogen (24.10.2026):** die Zeile oben nannte `notes` noch als
offen; gemessen ist die Seite inzwischen bei **0,04 / 0,07 / 0,17 %** mit exakter
Höhe (290 Knoten). Die frühere Fläche ging an die unsichtbaren Überschriften
(`font-size: 0` als Messgröße) und ist mit dem Fit-Text-Fix geschlossen.

**`unifiersofjapan` ist gemessen und erklärt (24.10.2026):** die 14,96 / 16,50 /
21,21 % sind **keine** Import-Lücke. Die Karten-Grafiken stehen nicht im SSR; ich
habe nachgezählt: `viewBox="0 0 524 676"` kommt im Server-HTML **0-mal** vor, im
gerenderten DOM **49-mal**. Gegengeprüft mit demselben Import über die
**hydratisierte** Seite: **15,74 % → 11,25 %** bei exakter Höhe - die Lücke ist
also die Quelle, nicht der Leser. Der Bericht nennt sie seit demselben Tag als
`code-component` (15 leere Platzhalter, Beleg `runtime-placeholder.test.ts`).

### Schritt 2b · Die Geräte-Faltung (U1) — **umgesetzt 22.10.2026**

**Ziel:** Die per Gerät duplizierten Elemente werden **ein** Knoten, nicht zwei
übereinander.

Drei Fehler zusammen — jeder allein hätte nicht gereicht:

1. **Die Seite kennt ihre Breakpoints nicht.** `last-studio` liefert keinen
   `__framer__breakpoints`-Kanal; die Hashes stehen nur im
   `<style data-framer-breakpoint-css>`-Block. Der Capture liest sie jetzt auch
   dort (`breakpointsFromStyles`), in beiden Formen: nackt (`.hidden-72rtr7`) und
   unter einem Komponenten-Vorfahren (`.framer-BsqgT .hidden-72rtr7`,
   donutshop). Der Kanal gewinnt, wenn es ihn gibt.
2. **Der `hidden-`-Marker gehört einem Element, nicht seinem Teilbaum.** Die
   Vererbung an die Kinder machte aus `refined` 2,4 → 16,9 % auf Tablet.
3. **Das Geräte-Universe ist die Seite, nicht die Geschwisterliste.** Bei
   verschachtelten Kopien blieb die Menge leer und **397 von 824 Knoten** waren
   „auf keinem Gerät sichtbar".

**Messung:** last-studio 80,21 / 78,66 / 83,74 % → **24,85 / 23,30 / 15,34 %**;
donutshop 45,28 / 44,36 / 44,52 % → **11,81 / 10,12 / 20,51 %**; refined und
wedge unverändert.

**Beleg:** `packages/framer-import/test/device-fold.test.ts` (7 Fälle, **5 rot**
ohne den Fix).

**Gate:** Ein Test belegt, dass eine zu kurze Seite nicht als „gleich" durchgeht
(`visual.test.ts`, Höhenfall); der Blindtest läuft als Skript und nennt Höhe und
Pixel nebeneinander.

### Schritt 2 · Die Framer-Runtime als Payload mitnehmen — **umgesetzt 22.10.2026**

**Ziel:** Die Original-Runtime läuft im Bake mit, nicht nur die Module.

- Der Mirror enthält `script_main.*.mjs` und die Chunks. Diese werden zum Payload, samt
  `integrity` und `provenance` (ADR-0010 verlangt beides).
- Die Island lädt sie **nur in Preview und Release**, nie im Canvas (ADR-0010 Punkt 8).
- Poster für den Editor: aus der Quelle, Pflichtfeld.

**Die Budgets sind bereits beschlossen** (ADR-0010 Punkt 6, dort per Messung nachgezogen) — sie
gelten auch hier und sind **kein** offener Punkt:

| Grenze | Wert | Woher |
|---|---|---|
| Payload-Knoten je Seite | 1 (`clean`) / 3 (`standard`) / 8 (`showcase`) | `packages/engine/src/guardrails.ts` |
| eine Payload | ≤ 3 MB unkomprimiert | ADR-0010, gemessen am WaveBackground-Modul (2,78 MB) |
| Seitenbudget | ≤ 8 MB zusätzliche JS-Bytes | ADR-0010 |
| `webgl-scene` + `payload` | teilen sich **einen** Zähler „schwere Fläche" | ADR-0010 |

**Das ist der kritische Punkt für die 1:1-Zusage:** Ein echtes Framer-Bündel (`script_main` +
Chunks) liegt bei **~212 KB für eine typische Seite** (in §4.2 bei `framer-export` gemessen: „the
React + Motion bundle … 212 KB on a typical page"). Das passt in 3 MB. Aber eine Seite mit
**mehreren** 3D-Szenen kann die 8-MB-Grenze reißen — dann greift der Rückfall (Poster → Platte),
und die 1:1-Zusage gilt für diese Seite **nicht**. Der Bericht muss das vorher sagen.

**Gate:** Eine Seite mit Lenis/three.js (Earn) zeigt im Release denselben Scroll-Effekt wie das
Original; der Editor zeigt das Poster; die Payload-Größe steht im Bericht.

#### Was die Messung erzwungen hat: die Runtime ist seiten-, nicht abschnittsweise

Die Runtime liest `document.getElementById("main")` und hydriert **diesen** Baum. Sie liest die
Route aus dem Zustand (`data-framer-hydrate-v2` → `routeId`), **nicht** aus `location.pathname` —
die Release-Seite darf also an einem anderen Pfad liegen. Ein **Abschnitts**-Payload wäre mit
derselben Runtime nicht möglich: sie rendert die Seite, nicht einen Ausschnitt.

**Deshalb ist der Payload seitenweit** — und deshalb ersetzt er im Release die Struktur
(Schritt 3). Das ist eine Korrektur des Plans, keine Auslegung: der Plan nannte
`script_main.*.mjs`, die Framer-Seiten liefern `_script0.<hash>.mjs` plus Chunks plus **ein
Modul je Seite** (dynamisch importiert). Das Modul findet man nur, wenn man die Datei liest —
der Import ist ein Textmuster, kein Kanal.

#### Der Beleg, dass die Runtime reisen kann

`notes.framer.website` lokal nachgespielt (Original-HTML + Original-CSS + Original-Runtime,
alles lokal): **0,03 % / 0,06 % / 0,15 %** Pixel-Differenz (Desktop/Tablet/Mobil), Seitenhöhe
**exakt gleich** (1743 / 1677 / 1906 px). Die Runtime hydriert also auch in fremder Umgebung.

#### Was gebaut wurde

`packages/framer-import/src/runtime-payload.ts`:

1. **Die Erkennung** (`detectFramerRuntime`) liest das Bundle-Skript (`data-framer-bundle`), das
   Wurzelelement **mit** dem Zustandsattribut und das CSS der Seite. Ohne
   `data-framer-hydrate-v2` gibt es **keinen** Payload: die Runtime fiele auf
   `location.pathname` zurück, und das wäre eine Vermutung, keine Kopie.
2. **Die Dateien** (`collectRuntimeFiles`) sammeln das Bundle, seine Chunks und die
   Seitmodule — transitiv, denn das Seitmodul kommt per **dynamischem** Import.
3. **Das Bündel** (`buildRuntimePayload`) legt Markup, CSS und Runtime in **ein** ESM-Modul
   (`export function mount(stage, options)` — der Vertrag des Island-Skripts). Die Runtime
   startet **nicht** beim Laden des Moduls, sondern in `mount()`: sie sucht beim Start `#main`,
   und der steht erst dann. (Erster Versuch: statischer Import → `getElementById` lieferte
   `null`, React Error #200. Der Test hält die Reihenfolge fest.)
4. **Die Asset-Umschreibung**: die Font- und Bildadressen im CSS des Payloads zeigen auf den
   eigenen Speicher (`urlRewrites` aus dem Asset-Lauf), sonst ginge zur Laufzeit ein Request
   an das CDN (DSGVO, ADR-0010 §8).
5. **Auch der Offline-Import (Mirror)**: der Mirror trägt die Runtime-Dateien selbst; sie werden
   **nur** aus dem Mirror gelesen (ADR-0016: ein Ordner liefert nur seine eigenen Dateien). Ein
   Mirror, der die Runtime mit **absoluter** CDN-Adresse nennt, liefert offline nichts — der
   Bericht sagt das (`warn`), statt still zu schweigen.

**Die Messung der ganzen Kette** (Import → Payload → Bake → Release, `notes.framer.website`):

| Prüfung | Ergebnis |
|---|---|
| Pixel-Differenz zur Originalseite | **0,54 % / 0,90 % / 1,16 %** (Desktop/Tablet/Mobil) |
| Seitenhöhe | **1743 / 1677 / 1906 px — exakt gleich** |
| Zustand des Trägers im Release | `mounted` |
| Größe des Payloads | **903 KB** (Budget 3 MB) |
| Struktur-Variante zum Vergleich | 27,95 / 34,23 / 36,64 % |

**Belege:** `packages/framer-import/test/runtime-payload.test.ts` (12 Fälle; die Reihenfolge
„Runtime startet nach dem Markup" wird **rot**, sobald der Import statisch wird),
`packages/renderer/test/payload-page.test.ts` (3 Fälle; **rot**, sobald die Naht fehlt).

#### Was offen bleibt — **geschlossen 23.10.2026**

- ~~**Das Poster für den Editor** (ADR-0010 §7, Pflicht beim Import) fehlt~~ — **umgesetzt.** Der
  Capture nimmt das Social Image der Quelle (`og:image`) in die Asset-Liste auf und der Träger
  nennt es als `poster`. Es ist das Bild **der Quelle**, also zeigt das Poster, was die Seite
  zeigt — kein Screenshot nötig, keine Vermutung. Beleg: `payload-poster.test.ts` (4 Fälle).
  Der Rückfall lautet jetzt wirklich Payload → Poster → Platte; `failed` zeigt das Poster statt
  der Platte (die Reihenfolge in `components.css` war umgedreht).
- ~~**Die CSS-Assets der Originalseite** zeigen im Payload-CSS weiter auf das CDN~~ —
  **umgesetzt und größer als gedacht.** Nicht nur das CSS: das **Markup** und die
  **Runtime-Daten** trugen die CDN-Adressen (die Runtime baut ihre Bilder aus ihrem JSON, nicht
  aus `<img src>`). Alle drei Wege werden jetzt umgeschrieben, längste Adresse zuerst, beide
  Schreibweisen (`/` und `\/`), `srcset` mit `&amp;` korrekt geteilt und die Query
  (`?width=840`, `?scale-down-to=512`) vor der Suche abgeschnitten. Gemessen an
  `unifiersofjapan`: **76 → 4** CDN-Adressen (die vier sind der „Made in Framer"-Badge und
  `www.w3.org`-Namensräume).
- **Nebenbefund, der die 1:1-Zusage erst einlöst:** `MAIN_ELEMENT` las `#main` mit einem Regex,
  der am ersten `</div>` endet. Der Payload trug **0,5–1,3 %** des Markups (notes 620 von
  46.520 Bytes). `elementBody` zählt jetzt die Verschachtelung.
- **Die Seite im Editor** ist die Struktur, im Release das Original. Das ist die ehrliche
  Teilung; der Import-Bericht sagt sie jetzt mit einer Zahl (`editableShare`: „0 % bearbeitbar,
  100 % Original-Code").
- **Die CSP** (ADR-0010 §8, dort als offen geführt) ist gesetzt: Preview und Release antworten
  mit `PAGE_CSP`. Sie beschränkt die Herkunft, nicht die Inline-Form — der Bake schreibt
  Inline-Blöcke, eine Hash-Policy bräche bei jeder Änderung. Nach der Adress-Umschreibung lädt
  die Seite nichts Fremdes mehr; der Badge fällt weg.

### Schritt 3 · Die Naht zwischen Struktur und Payload — **umgesetzt 22.10.2026**

**Ziel:** Kein Element steht doppelt.

- Der Import markiert je Bereich: „vom Payload getragen" oder „vom Struktur-Baum getragen".
- Der Bake blendet den Struktur-Knoten aus, wo der Payload steht (`visibility`/`display`, nicht
  löschen — der Baum bleibt die Wahrheit).
- Der Import-Bericht nennt je Seite, **wie viel** Fläche der Payload trägt (in %).

**Was gebaut wurde:** `renderTreeOf` (`packages/renderer/src/bake.ts`) — ein Träger mit
`coversPage` **ersetzt** im Release die Struktur: der Original-Aufbau steht, wo die Struktur
stand, also steht **nichts doppelt**, und die Seitenhöhe ist mit und ohne Payload **gleich**
(1743 / 1677 / 1906 px — gemessen, nicht behauptet).

**Die Abweichung vom Plan, mit Grund:** Der Plan sah eine Naht **je Bereich**. Die Runtime
erlaubt sie nicht (sie hydriert `#main`, also die Seite). Der Träger ist deshalb
**seitenweit**, und die Fläche, die er trägt, ist **100 %** — das steht so im Import-Bericht
(„der Release zeigt die Originalseite").

**Der Baum bleibt die Wahrheit:** Der Träger steht im Baum, die Struktur bleibt darin, und der
Editor arbeitet auf der Struktur. Nur der Release zeigt das Original. Der Canvas führt **nie**
Fremd-Code aus (ADR-0010 §8).

**Belege:** `packages/renderer/test/payload-page.test.ts` (4 Fälle: der Träger ersetzt die
Struktur; ohne `coversPage` bleibt die Struktur stehen — der Gegenbeweis; der Payload wird
geschrieben und dem Island-Skript übergeben; **ohne gelieferten Payload bleibt die Struktur
stehen**).

**Der Fund während der Messung (und die Korrektur):** Der Träger ersetzte die Struktur auch
dann, wenn der Build den Payload **nicht** liefert. Dann stand die Platte auf der Seite und die
Seite war **900 px** hoch statt 1743 px — ein stiller Abriss, genau den ADR-0010 §7 verbietet.
Der Bake blendet die Struktur jetzt **nur** aus, wo der Payload auch steht; sonst bleibt die
Struktur und die Platte sagt, was fehlt.

**Gate:** Auf allen elf Seiten ist die Seitenhöhe mit und ohne Payload gleich (kein Doppelstand).

### Schritt 4 · Den Zeitmaßstab der Presets reparieren — **umgesetzt 21.10.2026**

**Ziel:** Was als Preset abgebildet wird, läuft auch so lange wie in der Quelle.

**Was der Fehler war (belegt):** Zwei Capture-Pfade schreiben `duration` in
verschiedenen Einheiten. Der WAAPI-Probe liest `AnimationEffect.getTiming()`
(**Millisekunden**, die Plattform-Einheit); der Appear-Kanal liest Framers eigene
Spec (**Sekunden**, wie `delay` daneben). `motion-mapping.ts:77` teilte **jeden**
Wert durch 300 — für Millisekunden richtig, für Sekunden um Faktor ~47 falsch:
aus `duration: 1.4` wurde eine Skala von 0,0047, geklemmt auf 0,1, und der
Renderer machte daraus **30 ms statt 1400 ms**.

**Was geändert wurde:**

- Jedes Sample **benennt seine Einheit** (`params.durationUnit: "s" | "ms"`).
  Der Capture setzt sie an beiden Stellen; der Mapper rät nicht mehr.
- `durationSeconds()` rechnet in Sekunden um; ein Sample **ohne** das Feld gilt
  als Millisekunden (der ältere Stand bleibt lesbar).
- `durationScale` wird gegen die **echte Basis-Dauer des Ziel-Themes** gerechnet,
  nicht gegen die Annahme 300. Der Import-Job liest sie aus dem Theme
  (`runFramerImportJob` in `packages/engine/src/imports.ts`), die Vorschau reicht
  dieselbe Zahl durch (`import-preview.ts`) — sonst zeigte die Vorschau eine
  andere Zeit als die geschriebene Seite.
- Der bestehende Test mit `duration: 900` war die **WAAPI-Annahme**, kein
  Widerspruch: er steht jetzt mit `durationUnit: "ms"` da, und der Appear-Fall
  hat seinen eigenen Test mit `0.9` + `"s"`.

**Gate — gemessen am gebackenen CSS, nicht am Mapper:**

| Fall | Erwartet | Gebacken |
|---|---|---|
| Appear 1,4 s, Theme-Basis 300 ms | 1400 ms | **1400 ms** |
| Appear 0,6 s | 600 ms | **600 ms** |
| Appear 1,4 s, Theme-Basis 600 ms (relativer Skalenwert) | 1400 ms | **1400 ms** |
| Spring (stiffness 160, damping 30) | Settle-Zeit ~270 ms | **240–300 ms** |

Belege: `motion-bake-timing.test.ts` (4 Fälle, gegen die alte Annahme **alle vier rot**), `motion-mapping.test.ts` (Gegenprobe:
7 von 10 rot mit `durationUnit: "ms"` fest verdrahtet).

**Hinweis zur Reihenfolge der Arbeit:** Dieses Gate misst den **Preset-Pfad** —
dorthin gehört `durationScale`. Seit Schritt 4b spielt eine Seite **mit**
Appear-Kanal ihre Einblendung über die kompilierten Keyframes; das Preset wird
dort nicht mehr gesetzt („ein Element, eine Animation", siehe 4b). Der Test baut
seinen Baum deshalb von Hand, damit er die Zeit misst und nicht den Pfad.

### Schritt 4b · Die Appear-Spec zu CSS kompilieren — **umgesetzt 21.10.2026**

**Ziel:** Animationen überleben **ohne** die Framer-Runtime — als CSS-Keyframes.

**Was gebaut wurde** (`packages/framer-import/src/appear-css.ts`):

1. **Der Capture behält die volle Spec.** Bisher wurde der Kanal zu wenigen
   Samples reduziert und verworfen; jetzt trägt `FramerIrDocument.appear` jede
   Variante je Breakpoint-Hash (`default` + Hash, `null` = „kein Effekt dort")
   mit Start-, Endzustand und Spring. Sie überlebt den JSON-Rundlauf.
2. **Kompilierung zu Keyframes.** `compileAppearRules` erzeugt je (appear-id,
   Variante) ein `@keyframes` und die Animationsdeklaration — mit **`both`**,
   damit das Element den Startzustand durch die Verzögerung hält und danach den
   Endzustand.
3. **Transform-Reihenfolge nach Motion's `buildTransform`:**
   perspective → translate → scale → rotate → skew. Eine andere Reihenfolge
   ergibt eine andere Matrix.
4. **Breakpoint-Scoping.** Eine explizite Variante bekommt ihren `@media`-Block;
   `default` deckt, was keine Variante beansprucht. Die Media-Bedingung kommt aus
   den Breakpoints der Seite (`__framer__breakpoints`), nicht aus einer Annahme.
5. **Der Startzustand bleibt draußen.** Der Capture nimmt `opacity`/`transform`
   aus dem Aussehen; der Mapper schreibt sie nicht zurück. Die Animation besitzt
   sie jetzt (`both`-Fill).
6. **Befund statt Stille.** Eine appear-id ohne Knoten oder ohne Endzustand
   erzeugt einen Fund — vorher verschwand der Effekt wortlos (U5 b).
7. **Reduced Motion.** Die importierten Regeln laufen unter `static`; ein
   Effekt, der stoppt, darf das Element nicht unsichtbar lassen.

**Der Weg ins CSS:** `@keyframes` reist als `rawCss` der Regel (ADR-0005 lässt
genau dieses At-Rule zu), die Animationsdeklaration als Property, die
Breakpoint-Varianten über `contextStyles`. Ein `rawCss`-Block ist genau **ein**
`@keyframes` — eine Regel mit mehreren Varianten wird deshalb zu mehreren
Regeln, alle an denselben Knoten gehängt.

**Ein Element, eine Animation.** Dabei kam ein Fehler heraus, der beim Bauen
sofort sichtbar wurde: Ein Knoten konnte **zwei** Bewegungsquellen bekommen —
das Preset (was der Editor zeigt, vom Seitenskript gespielt) **und** die
kompilierte Appear-Regel. Beide starten ihre eigene Animation auf demselben
Element; das Preset mit `gsap.from` und einem eigenen Versatz, die Keyframes mit
dem Startzustand der Quelle. Sie streiten um `opacity` und `transform`, und wer
zuletzt startet, gewinnt — auf einer Seite mit Kanal lief also die **falsche**
der beiden. Die Regel ist jetzt: die kompilierte Appear-Regel besitzt die
Einblendung, ein Preset wird nur gesetzt, wo es keine Appear-Regel gibt
(`import.ts`). Beleg: `motion-owner.test.ts` (3 Fälle, gegenprobt).

**Eine zweite Lücke, die dabei sichtbar wurde:** `style-css.ts` warf importierte
Regeln ohne `:hover`/`:focus` weg („die Basis steht schon in den Knoten-Props").
Für eine Keyframe-Regel stimmt das nicht — dort steht die `animation`-Deklaration
**nur** in der Regel. Regeln mit `rawCss` oder `contextStyles` überleben jetzt
auch ohne States.

**Gate:**

| Prüfung | Ergebnis |
|---|---|
| `@keyframes` für einen Seitwärts-Slide und eine 3D-Kippung im gebackenen CSS | **vorhanden** |
| Dauer der Quelle (1,4 s) in der Deklaration | **1.4s** |
| `both`-Fill | **vorhanden** |
| Startzustand als Inline-Stil am Element | **nicht vorhanden** |
| Klasse am Knoten | **vorhanden** |
| Genau **eine** Animation je Knoten (kein Preset zusätzlich) | **belegt** (`motion-owner.test.ts`, Gegenprobe rot) |

Belege: `packages/framer-import/test/appear-css.test.ts` (15 Fälle),
`appear-bake.test.ts` (3 Fälle, gebackenes CSS), `appear-bake.test.ts` Fall 2
(mutationsfest: mit zurückgeschriebenem Startzustand rot), `motion-owner.test.ts`
(3 Fälle).

**Was dieser Schritt nicht löst** (steht in §9): der Spring-Überschwung ist
angenähert (`ease-out` bzw. eine Overshoot-Kurve), nicht exakt; Scroll-Trigger
und Hover-*Bewegung* brauchen weiter den Payload (Schritt 2).

### Schritt 5 · Die verbliebenen Animationen abdecken — **Punkt 1 umgesetzt 21.10.2026**

**Ziel:** Was der Payload nicht trägt, wird wenigstens benannt oder nachgebaut.

**Punkt 1 — Fehlender Appear-Kanal: umgesetzt.** (Die frühere Zahl „4 von 11"
stammte aus der Messung, die auf die kürzere Bildhöhe schnitt; siehe Schritt 3.)
Gemessen an der Live-Seite `https://donutshop.framer.website/`: 51 Elemente tragen
eine `data-framer-appear-id`, **kein** Appear-Kanal — aber **39** davon tragen
ihren Startzustand im Inline-Stil (`opacity:0.001; transform:perspective(1200px)
scale(1.2) rotate(10deg)`).

Der Import leitet die Einblendung daraus ab (`deriveAppearFromStartState` in
`capture-html.ts`): Startzustand aus dem Inline-Stil, Endzustand ist die Ruhe
(Identität). Das ist die **Bewegung** der Quelle, nicht eine Erfindung — derselbe
Transform, den der Browser animieren würde.

**Was dabei ehrlich benannt wird:** die **Dauer** steht nicht in der Seite (der
Kanal, der sie trägt, fehlt). Sie ist eine Annahme (`0.6 s`) und der Bericht sagt
das mit Schwere `info` und dem Vorschlag, sie im Editor zu prüfen. Ohne Startzustand
bleibt es bei einer `warn`-Meldung — nie bei stiller Untätigkeit.

**Eine Grenze, die der Test aufgedeckt hat:** Ein `opacity:0` **ohne** Transform
ist kein Reveal, sondern ein gestalteter Zustand (das geschlossene Handy-Menü,
eine zugeklappte FAQ-Antwort). Daraus eine Einblendung zu machen, würde das Menü
bei jedem Seitenaufruf aufblenden. Das Kriterium ist deshalb „unsichtbar **und**
bewegt", genau wie im Capture.

**Gate (ausgeführt):**

| Prüfung | Ergebnis |
|---|---|
| Live donutshop, abgeleitete Effekte | **39** (vorher 0) |
| Meldung im Bericht | `info`, nennt die Annahme und die Zahl |
| Seite ohne Kanal **und** ohne Startzustand | `warn`, kein stiller Fall |
| `opacity:0` ohne Transform | **nicht** abgeleitet |
| Seite mit Kanal | keine Ableitung, Kanalwerte gewinnen |

Belege: `packages/framer-import/test/appear-derived.test.ts` (6 Fälle).

**Punkt 2 — 3D-Kippung (`rotateX/rotateY`): umgesetzt** durch Schritt 4b, nicht
als Preset. Die Keyframes tragen `rotateX`/`rotateY` in Motion's Transform-Reihenfolge;
ein Preset hätte nur einen Winkel erlaubt. Beleg: `appear-css.test.ts`,
`appear-bake.test.ts` (Fall 1 prüft `rotateX(-25deg)` im gebackenen CSS).

**Punkt 3 — Hover als Bewegung, Scroll-Trigger: offen, gehört zu Schritt 2.**
Diese Information ist im SSR nicht enthalten; sie kommt nur mit der Framer-Runtime
(Payload). Der Bericht nennt heute, was nicht ankam.

**Gate:** Keine Seite hat mehr eine Animation, die **weder** als Preset **noch** als Payload
ankommt, ohne dass der Bericht es sagt. — **erfüllt (23.10.2026)**: Hover-Bewegung und
Scroll-Trigger reisen seit Schritt 2 mit der Runtime; der Bericht nennt jede Seite, die als
Original-Code läuft.

### Schritt 6 · Die Grenze der Werkzeuge festhalten

**Ziel:** Wissen, was auch mit Code-Übernahme nicht geht.

- **CMS-Daten:** Unframer exportiert sie nicht; Full Site Export liest sie aus dem Laufzeitverkehr.
  **Geprüft 24.10.2026.** Von sieben Blindtest-Seiten tragen **zwei** den Kanal (`__framer__handoverData`:
  `last-studio`, `refined`). Am Baum gemessen: bei `last-studio` fehlen von **62** sichtbaren Texten **2**,
  bei `refined` von **98** sechs - und die Sammlungseinträge („Grey Space", „Reflections") stehen im Baum.
  Was fehlt, fehlt aus demselben Grund wie überall sonst: es steht nicht im SSR („Bold thinking" kommt im
  Server-HTML **0x** vor). Die frühere Meldung „Sammlungsinhalte werden nicht importiert" war damit
  **falsch** und ist berichtigt. Beleg: Meldungstext in `capture-html.ts`, Zählung im Gate-Eintrag vom
  24.10.2026 in `docs/current/qualitaet.md`.
- **Seitenübergänge:** ~~bleiben laut Unframer nicht erhalten. Für uns: eigene Entscheidung nötig.~~
  **Entschieden 24.10.2026 (ADR-0024).** Nicht importiert und nicht erfunden: auf allen sieben
  Blindtest-Seiten trägt das Server-HTML **keine** Spur eines Seitenübergangs (`pageEffect`,
  `pageTransition`, `data-framer-page-transition`, `animatePresence` je 0). Ein Übergang beim Wechsel
  zwischen zwei Seiten kann nicht gelesen werden, weil die Quelle ihn nicht ausliefert; wo die Quelle
  einen hatte, führt ihn die Original-Runtime im Release selbst aus. Damit steht der Punkt nicht mehr
  als offen im Bericht.
- **Lizenz:** Framer-Templates haben eigene Bedingungen. ADR-0010 verlangt ein sichtbares
  Lizenzfeld; „unknown" darf nicht in die globale Bibliothek.

**Die zwei Punkte aus ADR-0010 — Stand 23.10.2026:**

- ~~**CSP-Header im Deploy.**~~ **Umgesetzt.** Preview und Release antworten mit
  `Content-Security-Policy` (`PAGE_CSP` in `packages/engine/src/http-build-files.ts`):
  `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'self'`.
  Inline-Stile und -Skripte bleiben erlaubt — der Bake schreibt sie, eine Hash-Policy bräche bei
  jeder Seitenänderung; die Grenze ist die **Herkunft**. Damit sie hält, schreibt der Import die
  Adressen der Quelle in Markup, CSS und Runtime-Daten um (gemessen an `unifiersofjapan`:
  76 → 4 CDN-Adressen; die vier sind der „Made in Framer"-Badge und `w3.org`-Namensräume).
  Beleg: `lifecycle.test.ts` (Preview- und Release-Antwort tragen die Policy), `_messung/csp-test.ts`
  (Seite rendert exakt, Zustand `mounted`, Verstöße nur der Badge).
- ~~**Lizenzfrage für kommerzielle Kundenarbeiten.**~~ **Im Code durchgesetzt.**
  `assertLicensedForLibrary` weist einen importierten Baustein mit ungeprüfter Lizenz aus der
  globalen Bibliothek ab (400, `field: "license"`); der Release führt ihn als Soft-Befund
  `payload-license-unchecked`. Beleg: `library.test.ts` (2 neue Fälle), `lifecycle.test.ts` (1).
  **Was bleibt, ist keine Code-Frage:** bei einer Weitergabe an Dritte musst du die Lizenz
  tatsächlich prüfen — der Code kann nur verlangen, dass sie dasteht.

**Gate:** Ein Satz je Punkt, mit Beleg. Kein Bau. — **erfüllt.**

### Schritt 7 · Editor und Doku

**Ziel:** Wer importiert, versteht vorher, was er bekommt.

- Der Dialog sagt bei jedem Import: „X % der Seite sind bearbeitbar, Y % laufen als Original-Code."
- Die Anleitung (`packages/docs-portal/content/docs/framer-import.md`) nennt die Werkzeuge und ihre
  Grenzen.

**Umgesetzt 23.10.2026.** Der Import-Bericht trägt `editableShare` (`{ editable, original, nodes }`),
der Dialog zeigt es als eigene Zeile (`data-role="framer-editable-share"`). Die Zahl ist ehrlich
gerechnet, nicht geschätzt: eine Seite mit Framer-Runtime läuft im Release als Original (0/100),
eine Seite ohne Runtime ist vollständig bearbeitbar (100/0). Die Anleitung hat einen neuen
Abschnitt „Zwei Ausgaben: bearbeitbarer Baum und Original-Code" mit der Tabelle, was jeweils
editierbar ist, und einen Abschnitt „Was die Seite nach dem Import lädt" (Adress-Umschreibung und
CSP).

**Gate:** Doku-Tests grün; der Dialog zeigt die Quote. — **erfüllt.**
`packages/docs-portal/test` 38 Tests grün, `packages/app/test/framer-import-browser.test.ts`
prüft die Zeile im echten Dialog.

## 7. Die Entscheidungen, die du treffen musst

**Deine Antworten vom 21.10.2026:**

| | Frage | Deine Entscheidung |
|---|---|---|
| **E1** | Darf fremder Framer-Code in deinen Seiten laufen? | **Ja.** Damit ist Weg B offen und 1:1 erreichbar. |
| **E2** | Werkzeug kaufen oder selbst bauen? | **Kostenlose Alternativen.** FramerExport (MIT), kein Abo. |
| **E3** | Unframer trotz fehlender Lizenz? | **Ja**, Nutzung nur privat. |
| **E4** | React-Export-Abo zahlen? | **Nein**, kostenlose Alternativen. |
| **E5** | Geben Kunden uns Projekt-Zugang? | offen (Erklärung unten) |

### Was E5 genau bedeutet

Das **Framer MCP** (das Werkzeug, mit dem ich `getProjectXml` und `getNodeXml` getestet habe)
funktioniert **nicht** über die veröffentlichte Adresse. Es ist ein **Plugin, das im
Framer-Editor** des jeweiligen Projekts läuft, und der MCP-Server spricht mit diesem Editor.

Praktisch heißt das:

- **Deine eigenen Framer-Projekte:** Du öffnest das Projekt in Framer, aktivierst das Plugin
  einmal, und ich kann die Struktur lesen. Kein Problem.
- **Ein fremdes Kundenprojekt:** Der Kunde müsste das Plugin in **seinem** Framer-Projekt
  aktivieren und mir den Zugang geben. Sonst sehe ich nur die veröffentlichte Seite (SSR) —
  also genau das, was heute schon geht.

**Warum die Frage zählt:** Mit Projekt-Zugang bekomme ich `layout="stack"`, benannte Komponenten,
Tokens und Text-Stile **geschenkt**. Ohne ihn muss der Import das aus dem gerenderten HTML
**erraten** — und genau dieses Raten erzeugt den Fehler, der `last-studio` auf 65 % treibt (zwei
Geräte-Kopien, die niemand als „dieselbe Karte" erkennt).

**Für dich als Einzelnutzer heißt das wahrscheinlich:** Bei Seiten, die du selbst in Framer
gebaut hast → Zugang da, bester Weg. Bei fremden Seiten → nur die veröffentlichte Adresse, also
SSR + Mirror. Der Plan muss **beides** können.

### E1 · Darf fremder Framer-Code in deinen Seiten laufen? — **entschieden: Ja**

*(Die folgenden Absätze bleiben als Begründung stehen.)*

Das ist die Grundfrage. ADR-0010 sagt **ja**, aber nur als Payload, nur in Preview/Release, nie im
Editor. Die Konsequenz: Auf einer solchen Seite läuft Code, den weder du noch ich geschrieben
haben. Sicherheitstechnisch ist das ein **bewusstes** Risiko (der Code kommt aus dem Bake-Ausgang,
nicht von einer Fremd-URL — aber er ist ausführbar).

- **Ja** → Weg B ist offen, 1:1 ist erreichbar.
- **Nein** → 1:1 ist **nicht** erreichbar. Dann bleibt es bei Presets und dem heutigen Stand.

### E2 · Kaufen wir „Full Site Export" (10 USD/Monat)? — **entschieden: Nein, kostenlose Alternativen**

- **Kaufen** → CMS, Scroll-Reveals, WebGL sind sofort abgedeckt; wir sparen Wochen. Dafür ein
  externes Werkzeug und laufende Kosten.
- **Selbst bauen** (auf `framer-export`, MIT) → keine Kosten, volle Kontrolle, aber eigener Aufwand
  und eigene Wartung.

### E3 · Ist Unframer nutzbar, obwohl die Lizenz im Manifest fehlt? — **entschieden: Ja (nur private Nutzung)**

- **Klären** (empfohlen): beim Autor anfragen. Ohne klare Lizenz würde ich es für Kundenarbeit
  **nicht** einsetzen.
- **Nicht nutzen** → Weg B stützt sich allein auf den Mirror (der reicht, wenn E1 ja ist).

### E4 · Zahlen wir den React-Export (Abo)? — **entschieden: Nein, kostenlose Alternativen**

Am 21.10. getestet: `exportReactComponents` antwortet mit *„No active React Export subscription
found"*. Der Export ist **kostenpflichtig** und mit deinem Zugang **nicht** enthalten.

- **Abo** → wir bekommen fertigen React-Code mit Animationen (laut Doku: „hover effects,
  transitions, and scroll animations work out of the box"). Das wäre der kürzeste Weg zu Weg B.
- **Ohne Abo** → Weg B stützt sich auf den Mirror + Original-Runtime. Mehr Eigenbau, aber keine
  laufenden Kosten.

### E5 · Geben Kunden uns Projekt-Zugang? — **offen**

Die Projekt-Schnittstelle (MCP) braucht Zugang zum **Framer-Projekt** über ein Plugin, nicht nur
zur veröffentlichten Seite. Für eigene Projekte trivial; für Kundenprojekte eine Vertragsfrage.

- **Ja** → die stärkere Strukturquelle ist nutzbar (benannte Komponenten, Tokens, Stapel).
- **Nein** → es bleibt beim SSR-Weg plus Mirror; mehr Raten, mehr Fehler wie U1.

## 8. Woran wir Erfolg messen

Dieselben elf Seiten wie in `docs/fahrplan-framer-import.md` (drei Fixtures, die Earn-Vorlage, zehn
fremde). Zwei Zahlen je Seite:

| Kennzahl | Was sie sagt |
|---|---|
| **Pixel-Differenz** (Desktop / Tablet / Mobil) | wie nah das Aussehen ist |
| **Bewegungsgleichheit** | wie viele der gefundenen Effekte im Bake ankommen (Zahl + Dauer) |

Und eine dritte, neue:

| Kennzahl | Was sie sagt |
|---|---|
| **Bearbeitbarkeitsquote** | wie viel Fläche Struktur ist (editierbar) und wie viel Payload (1:1, nicht editierbar) |

**Ziel:** 11 von 11 Seiten unter 3 % Pixel-Differenz **und** 100 % der erkannten Effekte
angekommen — mit einer ehrlich genannten Bearbeitbarkeitsquote.

Für die Bewegung braucht es einen **neuen Messweg**: einen Bildvergleich **über die Zeit**
(Frames bei 0, 200, 700, 1400 ms), nicht nur einen Stand. Den gibt es heute nicht.

## 8.5 Lizenzen: was „nur für mich" praktisch bedeutet

Deine Entscheidung (E3) ist: **private Nutzung, kein Weitergeben.** Das ist eine klare Linie, hat
aber drei praktische Folgen, die im Code stehen müssen — sonst wird die Linie später unbemerkt
überschritten.

### 8.5.1 Was privat unkritisch ist

| Fall | Bewertung |
|---|---|
| Eine fremde Framer-Seite für dich importieren und ansehen | unkritisch (wie „Seite im Browser speichern") |
| MIT-Code als Vorlage lesen und Logik nachbauen | ausdrücklich erlaubt, auch ohne Quellenangabe |
| CC0 (`monolith`) | keine Bedingungen |
| `unframer` ohne Lizenzfeld | Grauzone, privat vertretbar — aber nicht weitergeben |

### 8.5.2 Wo die Linie überschritten würde — und was das technisch bedeutet

| Handlung | Warum sie die Linie überschreitet |
|---|---|
| Eine importierte Seite **veröffentlichen** (`publish_release`) | Die Seite geht an Dritte; fremdes Template-Material wird öffentlich |
| Eine importierte Seite in die **globale Baustein-Bibliothek** heben | Andere Projekte erben den fremden Code (ADR-0010 verbietet das für `license: unknown` ausdrücklich) |
| Eine Seite an einen **Kunden** ausliefern | Kommerzielle Nutzung fremden Template-Materials |

**Die Regel steht in ADR-0010, aber der Code setzt sie noch nicht um.** ADR-0010 Punkt 4 sagt: Ein
Payload mit `license: unknown` **darf nicht** in die globale Baustein-Bibliothek. Eine Suche in
`packages/engine/src/code-payloads.ts` nach `unknown` oder `library` findet **keine** solche Sperre
(21.10.2026 geprüft). Die Regel ist heute also eine Absicht, kein Tor.

**Was fehlt — und das gehört in Schritt 7:**

1. Eine **Sperre** für „Payload mit `unknown` → Bibliothek" (ADR-0010 verlangt sie, der Code hat sie
   nicht).
2. Eine sichtbare **Warnung beim Veröffentlichen** einer Seite, die fremden Code oder ein fremdes
   Template trägt. Heute läuft der Publish durch.

**Gate:** Ein Test, dass ein Payload mit `license: unknown` **nicht** in die Bibliothek gehoben
werden kann; und der Publish-Weg nennt die Herkunft, bevor veröffentlicht wird.

## 9. Was dieser Plan nicht verspricht

**Ein Element, eine Animation — was das praktisch heißt.** Seit dem Import
besitzt die kompilierte Appear-Regel die Einblendung eines Knotens; ein Preset
wird dort nicht mehr gesetzt. Der Editor zeigt für solche Knoten **kein
Preset** in der Motion-Auswahl — die Bewegung steckt in der CSS-Regel. Das ist
eine bewusste Entscheidung: zwei Quellen auf einem Element ergaben zwei
Animationen, und die falsche gewann. Wer die Einblendung im Editor ändern will,
ändert die Regel (Dauer, Verzögerung) oder löscht sie und setzt ein Preset.
- **Keine Bearbeitbarkeit des Payload-Inneren.** Das ist die Preisangabe zur 1:1-Zusage und steht in
  ADR-0010. Wer die Animation im Editor ändern will, muss sie neu bauen.
- **Kein Framer-CMS als Datenquelle.** Der Inhalt kommt als gerendertes HTML mit, nicht als Sammlung.
- **Keine Lizenz für fremde Templates.** Technisch kopierbar ist nicht rechtlich erlaubt. Für
  eigene Nutzung (deine Entscheidung E3) ist das unkritisch; sobald eine Seite an Dritte geht,
  wird es wieder eine Frage.
- **Keine Zahl ohne Lauf.** Jede Quote in diesem Plan stammt aus einer Messung; geschätzte Werte
  stehen als offen.

### 9.1 Die gemessenen Grenzen der freien Werkzeuge

Damit niemand später denkt, es sei nur eine Frage der Mühe — das ist **gemessen**, nicht geschätzt:

| Was | Ergebnis | Quelle |
|---|---|---|
| `unframer`-CLI, Ganzseiten-Export | wedge **17–44 %** Pixel-Differenz (unser Import: **0,46 %**) | eigener Lauf, §4.5 |
| `unframer`-CLI, Textvollständigkeit | 30–96 % des sichtbaren Textes | eigener Lauf |
| `unframer`-CLI, Animationen | **85 Regeln** bei wedge (Kanal da), **0** bei donutshop (Kanal fehlt) | eigener Lauf |
| Animationen in der Projekt-XML | `appear`/`transition`/`animation` **0 Treffer** | MCP, §4.1 |
| React-Export über MCP | **kostenpflichtig**, nicht im Zugang | MCP-Antwort |
| Unframer-Lizenz | **kein `license`-Feld** im npm-Manifest | npm registry |
| nicht komponierender Browser-Tab | CSS-Animationen melden `running` bei `currentTime: 0` | `src/verify.ts` |

**Was das bedeutet:** Die freien Werkzeuge decken die **Animationen** gut ab (CSS-Keyframes) und
die **Struktur** schlechter als unser eigener Import. Deshalb der gemischte Weg — nicht ein
Werkzeug, das alles kann. Ein solches Werkzeug gibt es nach dieser Recherche **nicht**.

## 10. Reihenfolge

```
E1 (Entscheidung) ──► Schritt 1 (Mirror) ──► Schritt 2 (Runtime) ──► Schritt 3 (Naht)
E2/E3/E4/E5       ──► parallel zu Schritt 1
Schritt 1b (MCP)  ── nach Schritt 1, nur wenn E5 ja
Schritt 4 (Zeitmaßstab) ── unabhängig, klein
Schritt 5 (Rest) ── nach 2 und 3
Schritt 6/7 (Grenzen, Doku) ── am Ende
```

**Vor allem anderen: E1.** Ohne die Entscheidung „darf fremder Code laufen" ist der halbe Plan
gegenstandslos.

**Der schnellste sichtbare Gewinn** ist Schritt 4 (Zeitmaßstab): eine Einheit, keine neue
Abhängigkeit, und danach laufen die vorhandenen Einblendungen richtig. Er kann sofort gemacht
werden, unabhängig von allen Entscheidungen.

## 11. Definition of Ready / Done

**Ready** je Schritt: vorheriger Gate grün, `git status` sauber, Testfall für den Ausgangsfehler
existiert und ist rot, betroffene Dateien benannt.

**Done** je Schritt: Gate auf allen elf Seiten ausgeführt, jede Aussage „umgesetzt" mit Code- oder
Testbeleg, Zahlen nur in `docs/current/qualitaet.md`, keine Verschlechterung einer vorher
brauchbaren Seite.