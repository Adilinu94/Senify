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

### 3.1 Was gebaut ist (Code-Beleg)

| Baustein | Zustand | Beleg |
|---|---|---|
| Island-Payload (Fremd-Code neben dem Baum) | **gebaut** | `packages/engine/src/code-payloads.ts`, `packages/renderer/src/islands.ts` (`IslandKind` enthält `payload`) |
| Payload-Träger-Knoten | **gebaut** | `packages/widget-engine/src/catalog.ts`, Tests in `code-payloads.test.ts` |
| Payload-Bundling beim Import | **gebaut, aber nur Mirror** | `packages/framer-import/src/payloads.ts`, `import.ts:184` |
| three.js-Bündelung zur Bake-Zeit | **gebaut** | `packages/renderer/src/webgl-vendor.ts` |
| Lenis (Smooth-Scroll) | **gebaut** | `packages/renderer/src/bake.ts` (`lenis.min.js` im Vendor-Bündel) |
| GSAP + ScrollTrigger + SplitText | **gebaut** | `packages/renderer/src/bake.ts:231-236` |
| Motion-Presets | **gebaut, aber eng** | `packages/framer-import/src/motion-mapping.ts` |

### 3.2 Was fehlt

| Lücke | Beleg |
|---|---|
| URL-Import bringt **keine** Payloads mit | `import.ts:184` — nur `kind === "mirror"` |
| Framer-Runtime selbst wird nie mitgenommen | kein Pfad im Import liest `script_main.*.mjs` |
| Zeitmaßstab der Presets um Faktor ~47 falsch | gemessen: `animation: 30ms` statt 1400 ms (`motion-mapping.ts`, `renderer/src/motion.ts:157`) |
| Nur Einblendungen von unten abbildbar | `motion-mapping.ts:35-43` (`x=0`, `scale=1`, `y>=0`) |
| Vier von zehn Seiten: Animation ganz verloren | gemessen: `appearId` vorhanden, `appearAnimationsContent` fehlt |
| Hover als *Bewegung*, Scroll-Trigger | kommen nicht aus dem SSR |

### 3.3 Der wichtigste gemessene Befund

An der Earn-Seite: **Lenis 10×, three.js 6×, `data-framer-appear-id` 11×, GSAP 0×, ScrollTrigger 0×.**
Das bestätigt die S0-Messung aus ADR-0010: **Framer nutzt seine eigene Runtime, nicht GSAP.**
„GSAP übernehmen" heißt also in Wahrheit: **die Framer-Runtime übernehmen.** GSAP und Lenis sind
in Senify vorhanden, aber sie sind nicht das, was die Quelle antreibt.

## 4. Werkzeuge und Quellen, die helfen — geprüft am 21.10.2026

### 4.1 Unframer / Framer MCP — **am 21.10.2026 selbst getestet**

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

### 4.2 FramerExport / F-EXPORT (MIT, Open Source)

- **Was es ist:** `npm i -g framer-export`. Lädt die Seite in einem Headless-Browser, **wartet auf
  Hydration**, nimmt das gerenderte Ergebnis auf, lädt jedes Asset, schreibt CDN-URLs auf relative
  Pfade um, entfernt Plattform-Badges und Tracker, legt einen `serve.js` dazu.
- **Was es löst:** **Genau unsere Lücke.** Es liefert das, was im SSR fehlt: die Sterne, die
  Scroll-Effekte, den hydratisierten Zustand — als lokale Dateien. Und es macht daraus einen
  **Mirror**, also eine Quelle, für die unser Payload-Extraktor bereits gebaut ist.
- **Lizenz:** MIT (`package.json`, `LICENSE` im Tarball). Unkritisch.
- **Grenzen:** Es ist ein Mirror, kein Struktur-Import. Die Seite ist danach eine Black Box aus
  HTML/CSS/JS — bearbeitbar nur dort, wo unser Struktur-Import greift.
- **Aufwand:** klein. Ein CLI-Aufruf.

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

### 4.5 Der Vergleich in einer Tabelle

| Werkzeug | Lizenz | Liefert | Löst für uns | Grenze |
|---|---|---|---|---|
| **Framer MCP** (getestet) | Zugang nötig, React-Export **kostenpflichtig** | Projekt-XML: Seiten, Komponenten, `layout="stack"`, Tokens, Text-Stile | **Struktur ohne Raten**; der Faltungs-Fehler entsteht gar nicht | keine Zeitsteuerung (0 Treffer), braucht Projekt-Zugang |
| **FramerExport** (`framer-export`) | **MIT** | hydratisierte Seite als lokaler Mirror + alle Assets | **die Lücke zum SSR-Weg**: Sterne, Scroll-Effekte, Laufzeit-Zustand | Black Box, kein Struktur-Import |
| **Full Site Export** | kommerziell (10 USD/Monat) | Perfect Copy / Exact Next.js / Readable React; CMS aus Laufzeitverkehr; Scroll-Reveals + Marquee als CSS | **sofort 1:1 inklusive CMS** | Readable ist „nah dran, nicht pixelgleich"; laufende Kosten |
| **Unframer CLI** (ohne Abo) | Manifest ohne `license`-Feld | `.jsx` + Chunks + `styles.css` | React-Code mit Animationen | ohne Abo nicht nutzbar (getestet); Lizenz unklar |
| **eigener Weg** (SSR + Payload) | hausgemacht | was wir bauen | volle Kontrolle, keine Fremdabhängigkeit | der meiste Aufwand |

**Die Empfehlung in einem Satz:** FramerExport (MIT) als Mirror in den Analyse-Worker einbauen,
die Original-Runtime als Payload mitnehmen (ADR-0010), das Framer-MCP als zweite Strukturquelle
dazunehmen — und Full Site Export nur kaufen, wenn CMS-Inhalte gebraucht werden.

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
   4 von 11 Seiten brauchbar; der Code-Weg ist bei **jeder** Seite 1:1, weil er die Originaldateien
   ausführt. Die 1:1-Zusage hängt am Code-Weg.
2. **Dann die Projekt-Schnittstelle als zweite Strukturquelle.** Sie ist dort stärker, wo der
   SSR-Weg rät (Stapel, Komponenten, Tokens). Sie ersetzt ihn nicht: nicht jeder Kunde gibt
   Projekt-Zugang, und sie liefert keine Zeitsteuerung.
3. **Dann die Naht.** Wo der Payload steht, muss der Struktur-Knoten unsichtbar sein, sonst
   steht alles doppelt.

## 6. Die Schritte

Jeder Schritt hat ein Gate. Kein Schritt gilt als fertig, ohne dass sein Gate auf **allen elf
Messseiten** ausgeführt ist (§8).

### Schritt 1 · Den Mirror-Weg zur Produktquelle machen

**Ziel:** Ein URL-Import erzeugt zuerst einen lokalen Mirror (hydratisierte Seite + alle Assets),
und dieser Mirror ist die Quelle für **beides**: Struktur und Payload.

- Den Browser-Mirror in den Import ziehen. Zwei Möglichkeiten, beide zu prüfen:
  **(a)** `framer-export` (MIT) als Abhängigkeit einbinden, **(b)** den vorhandenen
  Analyse-Worker (der schon einen Browser startet, ADR-0022) um einen Mirror-Modus erweitern.
- **Empfehlung: (b).** Der Browser ist schon da, die Adressprüfung ist schon da (`allowOrigins`),
  und ein zweites Werkzeug mit eigenem Chrome wäre eine zweite Sicherheitsgrenze.
- Danach ist `input.source.kind === "mirror"` der Normalfall — und der vorhandene
  Payload-Extraktor greift ohne Änderung.

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

### Schritt 2 · Die Framer-Runtime als Payload mitnehmen

**Ziel:** Die Original-Runtime läuft im Bake mit, nicht nur die Module.

- Der Mirror enthält `script_main.*.mjs` und die Chunks. Diese werden zum Payload, samt
  `integrity` und `provenance` (ADR-0010 verlangt beides).
- Die Island lädt sie **nur in Preview und Release**, nie im Canvas (ADR-0010 Punkt 8).
- Poster für den Editor: aus der Quelle, Pflichtfeld.

**Gate:** Eine Seite mit Lenis/three.js (Earn) zeigt im Release denselben Scroll-Effekt wie das
Original; der Editor zeigt das Poster. Ein Test, der ohne den Schritt rot ist.

### Schritt 3 · Die Naht zwischen Struktur und Payload

**Ziel:** Kein Element steht doppelt.

- Der Import markiert je Bereich: „vom Payload getragen" oder „vom Struktur-Baum getragen".
- Der Bake blendet den Struktur-Knoten aus, wo der Payload steht (`visibility`/`display`, nicht
  löschen — der Baum bleibt die Wahrheit).
- Der Import-Bericht nennt je Seite, **wie viel** Fläche der Payload trägt (in %).

**Gate:** Auf allen elf Seiten ist die Seitenhöhe mit und ohne Payload gleich (kein Doppelstand).

### Schritt 4 · Den Zeitmaßstab der Presets reparieren

**Ziel:** Was als Preset abgebildet wird, läuft auch so lange wie in der Quelle.

- `motion-mapping.ts:77`: `duration / 300` ist falsch, wenn `duration` in **Sekunden** kommt
  (gemessen: `duration: 1.4`). Der Faktor muss die Einheit treffen.
- Der bestehende Test (`motion-mapping.test.ts:31`) erwartet `durationScale = 3` bei `duration: 900`
  — das ist **Millisekunden**-Annahme. Der Widerspruch ist zu klären, nicht zu überschreiben.

**Gate:** Im gebackenen CSS steht die Dauer der Quelle (1,4 s → 1400 ms).

### Schritt 5 · Die verbliebenen Animationen abdecken

**Ziel:** Was der Payload nicht trägt, wird wenigstens benannt oder nachgebaut.

- **Fehlender `appearAnimationsContent`** (4 von 11 Seiten): aus dem Startzustand am Element
  ableiten — oder einen Befund erzeugen, statt still nichts zu tun.
- **3D-Kippung** (`rotateX/rotateY`): als Preset ergänzen oder dem Payload überlassen.
- **Hover als Bewegung**, **Scroll-Trigger**: nur über den Payload, nicht über Presets.

**Gate:** Keine Seite hat mehr eine Animation, die **weder** als Preset **noch** als Payload
ankommt, ohne dass der Bericht es sagt.

### Schritt 6 · Die Grenze der Werkzeuge festhalten

**Ziel:** Wissen, was auch mit Code-Übernahme nicht geht.

- **CMS-Daten:** Unframer exportiert sie nicht; Full Site Export liest sie aus dem Laufzeitverkehr.
  Für uns: der Mirror enthält sie (weil er die hydratisierte Seite liest) — zu prüfen.
- **Seitenübergänge:** bleiben laut Unframer nicht erhalten. Für uns: eigene Entscheidung nötig.
- **Lizenz:** Framer-Templates haben eigene Bedingungen. ADR-0010 verlangt ein sichtbares
  Lizenzfeld; „unknown" darf nicht in die globale Bibliothek.

**Gate:** Ein Satz je Punkt, mit Beleg. Kein Bau.

### Schritt 7 · Editor und Doku

**Ziel:** Wer importiert, versteht vorher, was er bekommt.

- Der Dialog sagt bei jedem Import: „X % der Seite sind bearbeitbar, Y % laufen als Original-Code."
- Die Anleitung (`packages/docs-portal/content/docs/framer-import.md`) nennt die Werkzeuge und ihre
  Grenzen.

**Gate:** Doku-Tests grün; der Dialog zeigt die Quote.

## 7. Die Entscheidungen, die du treffen musst

Diese drei sind **Produktentscheidungen**, keine Implementierungsfragen. Ich baue sie nicht ohne
dein Wort.

### E1 · Darf fremder Framer-Code in deinen Seiten laufen?

Das ist die Grundfrage. ADR-0010 sagt **ja**, aber nur als Payload, nur in Preview/Release, nie im
Editor. Die Konsequenz: Auf einer solchen Seite läuft Code, den weder du noch ich geschrieben
haben. Sicherheitstechnisch ist das ein **bewusstes** Risiko (der Code kommt aus dem Bake-Ausgang,
nicht von einer Fremd-URL — aber er ist ausführbar).

- **Ja** → Weg B ist offen, 1:1 ist erreichbar.
- **Nein** → 1:1 ist **nicht** erreichbar. Dann bleibt es bei Presets und dem heutigen Stand.

### E2 · Kaufen wir „Full Site Export" (10 USD/Monat) oder bauen wir selbst?

- **Kaufen** → CMS, Scroll-Reveals, WebGL sind sofort abgedeckt; wir sparen Wochen. Dafür ein
  externes Werkzeug und laufende Kosten.
- **Selbst bauen** (auf `framer-export`, MIT) → keine Kosten, volle Kontrolle, aber eigener Aufwand
  und eigene Wartung.

### E3 · Ist Unframer nutzbar, obwohl die Lizenz im Manifest fehlt?

- **Klären** (empfohlen): beim Autor anfragen. Ohne klare Lizenz würde ich es für Kundenarbeit
  **nicht** einsetzen.
- **Nicht nutzen** → Weg B stützt sich allein auf den Mirror (der reicht, wenn E1 ja ist).

### E4 · Zahlen wir den React-Export (Abo) oder nicht?

Am 21.10. getestet: `exportReactComponents` antwortet mit *„No active React Export subscription
found"*. Der Export ist **kostenpflichtig** und mit deinem Zugang **nicht** enthalten.

- **Abo** → wir bekommen fertigen React-Code mit Animationen (laut Doku: „hover effects,
  transitions, and scroll animations work out of the box"). Das wäre der kürzeste Weg zu Weg B.
- **Ohne Abo** → Weg B stützt sich auf den Mirror + Original-Runtime. Mehr Eigenbau, aber keine
  laufenden Kosten.

### E5 · Geben Kunden uns Projekt-Zugang?

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

## 9. Was dieser Plan nicht verspricht

- **Keine Bearbeitbarkeit des Payload-Inneren.** Das ist die Preisangabe zur 1:1-Zusage und steht in
  ADR-0010. Wer die Animation im Editor ändern will, muss sie neu bauen.
- **Kein Framer-CMS als Datenquelle.** Der Inhalt kommt als gerendertes HTML mit, nicht als Sammlung.
- **Keine Lizenz für fremde Templates.** Technisch kopierbar ist nicht rechtlich erlaubt.
- **Keine Zahl ohne Lauf.** Jede Quote in diesem Plan stammt aus einer Messung; geschätzte Werte
  stehen als offen.

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
