# Fachanalyse 2 — Netzwerkgrenze: Node-Pfad, Browser-Pfad, ADR-0016

**Basis:** `master` `5ac1a84` (19.10.2026). `packages/core/src/net.ts`,
`packages/engine/src/references-lifecycle.ts`, `packages/engine/src/references-capture-chain.ts`,
`packages/analysis-worker/src/visual.ts` und `packages/engine/src/import-preview.ts` sind zwischen
`19c8ee0` und `5ac1a84` unverändert (der Diff betrifft nur die Breakpoint-Planung in
`import-preview.ts`).

**Verbindliche Entscheidung:** `docs/adr/0016-abrufe-fremder-urls-nur-oeffentlich.md` (accepted,
09.10.2026). Dieser Bericht behandelt die Entscheidung **nicht** als offen, sondern prüft, ob ihre
Begründung trägt und wo ihre Reichweite endet.

---

## Kurzfassung

Es gibt zwei Wege, auf denen Senify fremde Adressen erreicht, und sie sind sehr unterschiedlich
geschützt:

| Weg | Prüfung | Bewertung |
|---|---|---|
| Node/HTTP (`fetchPublic`) | jede Weiterleitung einzeln, DNS-Antwort wird **gepinnt**, Body wird begrenzt | vollständig geschützt, mit Tests belegt |
| Browser (Playwright) | nur die **Startadresse**, einmal, vor dem Start | nicht geschützt: Weiterleitungen und Sub-Requests laufen ungeprüft |

Die Lücke zwischen beiden Wegen ist **kein Versehen**, sondern eine angenommene Entscheidung
(ADR-0016). Die Begründung dieser Entscheidung deckt jedoch nur das **Dashboard** ab, nicht die
übrigen internen Dienste der Maschine. Das ist die Lücke, die eine Entscheidung von Adi braucht.

---

## 1 — Der Node-Pfad ist sauber

`packages/core/src/net.ts`:

- `publicTarget()` (Zeile 108-141) löst den Host auf und prüft **alle** zurückgegebenen Adressen
  (`addresses.every(isPublicAddress)`, Zeile 135). Private, Loopback-, Link-local- (also Cloud-
  Metadaten), Carrier-NAT-, Test-, Dokumentations- und reservierte Bereiche werden abgewiesen —
  auch in IPv6-Verpackung (`::ffff:…`, NAT64, 6to4, Teredo; Zeilen 71-96).
- **DNS-Pinning:** Die Verbindung geht an die Adresse, die gerade geprüft wurde
  (Zeile 138-140, `pin`). Ein zweiter DNS-Schritt (Rebinding) kann die Verbindung nicht umleiten.
- `fetchPublic()` (Zeile 242-263) prüft **jede** Weiterleitung neu (höchstens 5) und wirft bei
  einer privaten Zwischenadresse.
- `isFetchBlockedPort()` (Zeile 276) sperrt die Ports, die Fetch und Chromium nicht connectieren.

**Belegt durch Tests:** `packages/core/test/net.test.ts` prüft `isPublicAddress` (Zeile 18-76),
`assertPublicHttpUrl` (Zeile 77-117) und `fetchPublic` einschließlich Weiterleitung auf ein privates
Ziel (Zeile 167: „a redirect to a private target is refused like a direct request to it“),
Weiterleitungsschleife, Schemawechsel, Größenlimit und Abbruch (Zeilen 119-210).

**Anschluss:** `packages/framer-import/src/import.ts:130` (Seitenabruf), `packages/framer-import/src/assets.ts:113`
(Asset-Download), `packages/engine/src/references-capture-chain.ts:273` (HTTP-Snapshot-Fallback).

Das ist die Sorgfalt, die man sich wünscht. Sie ist an dieser Stelle **kein Befund**.

---

## 2 — Der Browser-Pfad ist nicht geschützt

### 2.1 Es gibt keine Request-Filterung im Produktivcode

`context.route()` / `page.route()` kommt im ganzen Repository **nur in Tests** vor
(`packages/app/test/widget-slice-browser.test.ts:237`, `canvas-browser.test.ts:114`,
`route-guard-browser.test.ts:36`, `references-browser.test.ts:125`,
`packages/renderer/test/consent-browser.test.ts:98`). In keinem Produktivmodul.

Damit gilt: Was Chromium anfordert, ist Chromiums Sache. Es gibt keine Allowlist, keine
Host-Prüfung pro Anfrage, keine Sperre privater Ziele.

### 2.2 Die Referenz-Analyse prüft nur die Startadresse

`packages/engine/src/references-lifecycle.ts`:

```
451:  // Every driver - browser, Firecrawl, plain HTTP - gets a public address only
452:  // (ADR-0016), before anything is started or sent. Later requests of the page
453:  // and its redirects are the browser's own; they reach the dashboard only as
454:  // cross-site requests, which the proxy refuses.
455:  try {
456:    await assertPublicHttpUrl(reference.sourceUrl);
...
466:  const driver = context.deps?.capture ?? createPlaywrightCaptureDriver();
467:  return driver({ url: reference.sourceUrl, breakpoints: [...REFERENCE_BREAKPOINTS] });
```

Der Treiber navigiert danach selbst (Zeile 548: `await page.goto(input.url, …)`). Von da an:

- **Weiterleitungen** folgt Chromium (Zeile 548-551). Eine öffentliche Startadresse, die auf
  `http://169.254.169.254/…` oder `http://127.0.0.1:…` umleitet, wird abgerufen.
- **Sub-Requests** (Bilder, Skripte, XHR, `fetch`, WebSockets) gehen an jedes erreichbare Ziel.
- **DNS wird neu aufgelöst.** Die Prüfung in Zeile 456 hat eine Adresse geprüft; Chromium löst
  den Host ein zweites Mal auf — diesmal ohne Pin.

### 2.3 Was mit dem Abgeholten geschieht

Das ist der Teil, der aus einem blinden SSRF einen Datenweg macht:

- `page.content()` (Zeile 563) liefert das **Markup der Zielseite** — bei einer Weiterleitung also
  das Markup des internen Dienstes.
- Der Probe-Block (Zeile 573) liest Stile, Assets, Canvas, WebGL — ebenfalls vom Ziel.
- Die Screenshots (Zeile 576-587) und das Motion-Video (Zeile 590-609) zeigen den internen Dienst.
- Der Markup-Hash geht in die Referenz (Zeile 266).
- `buildReferenceProfile()` (Zeile 279) baut daraus das Profil: Vokabular, Familien, Stilkurven,
  Farben, Assets, technische Signale.
- `persistReferenceSnapshots()` (Zeile 273) schreibt die Bilder als Dateien ins Datenverzeichnis.
- `refreshDesignContractFromReferences()` (Zeile 862, 892) macht das Profil zum **Design-Vertrag
  des Projekts** — den „never rules“, gegen die spätere Redesigns gebaut werden.

**Die Kette:** interne Seite → Referenzprofil → Design-Vertrag → Redesign → veröffentlichte Seite.
Der Inhalt eines internen Dienstes kann damit in eine veröffentlichte Website gelangen.

### 2.4 Die Begründung in ADR-0016 trägt für das Dashboard — und nur für das Dashboard

ADR-0016, Abschnitt „Nicht geändert, mit Grund“:

> Weiterleitungen und Sub-Requests innerhalb des Browsers der Referenz-Analyse sind Sache des
> Browsers. Sie erreichen das Dashboard nur als `cross-site`, und das lehnt der Proxy ab
> (ADR-0015); die Engine verlangt dort einen Bearer.

Dieser Satz ist **inhaltlich richtig** und im Code **belegt**:

- `packages/app/src/server.ts:128-145` — `trustedProxyRequest()`: `Sec-Fetch-Site` muss
  `same-origin` oder `none` sein, und ein vorhandener `Origin` muss zum `Host` passen.
- `packages/app/src/server.ts:113-126` — das Dashboard antwortet nur unter
  `127.0.0.1` / `localhost` / `[::1]`, damit eine DNS-Rebinding-Seite keinen Zugriff bekommt.
- Die Engine verlangt für ihre eigenen Routen einen Bearer.

**Die Begründung adressiert aber ein anderes Ziel als das, was der Browser erreichen kann.** Sie
schützt den *Dashboard-Port*. Sie sagt nichts über den *Rest des Netzes der Maschine*: interne
Dienste auf anderen Ports, ein Docker-Netz, ein Router, ein Cloud-Metadatendienst
`169.254.169.254`, ein Redis, ein Postgres. Der Browser erreicht sie alle.

Das ist kein Widerspruch zur Entscheidung, sondern deren **Geltungsbereich**: die Annahme lautet
„die Redirects sind Sache des Browsers“, und die Begründung liefert nur den Grund, warum das
*speziell für das Dashboard* unkritisch ist. Für den übrigen Netzzugriff fehlt eine Begründung —
und eine Maßnahme.

**Einordnung als offene Frage, nicht als wiedereröffneter Befund:** Die Entscheidung ist
angenommen, die Begründung ist geprüft und für ihren Zweck bestätigt. Ob das Nicht-Eingreifen auch
für interne Dienste gelten soll, ist eine Abwägung, die Adi treffen muss (lokales Einzelplatz-
Programm vs. Betrieb auf einem Server mit Nachbardiensten). Diese Analyse liefert die Fakten dazu,
nicht die Entscheidung.

### 2.5 Die Import-Vorschau: heute geschützt, aber zufällig

`packages/engine/src/import-preview.ts:102-103` übernimmt eine **benutzergelieferte** URL
unverändert in `beforeUrl`. Diese URL geht in `captureThumbnails()`
(`packages/analysis-worker/src/visual.ts:213-251`), das **keinerlei** Adressprüfung kennt
(`page.goto(options.url)`, Zeile 235) — der Analyse-Worker prüft nirgends eine Adresse.

Der Schutz entsteht trotzdem, aber **aus der Reihenfolge**:

```
119:  const run = await runFramerImport({ source: input.source, … });
...
125:  return await bakeAndShoot(input, run.mapped.document, …, beforeUrl, work, closers);
```

`runFramerImport` holt die Seite vorher über `fetchPublic`
(`packages/framer-import/src/import.ts:130`) — und wirft bei einer privaten Adresse **oder einer
privaten Weiterleitung**. Der Browser bekommt die URL also nie zu sehen, wenn sie nicht öffentlich
ist.

Das ist eine **zufällige** Sicherung: sie hängt an der Reihenfolge zweier Aufrufe in einer Datei.
Wer die Vorschau später umstellt (etwa „erst fotografieren, dann importieren“, weil das billiger
ist), entfernt den Schutz, ohne dass ein Test rot wird.

**Empfehlung:** Die Prüfung gehört an die Stelle, an der die URL in den Browser geht — also in
`captureThumbnails`/`captureScreenshots` oder in den Aufrufer. Dann ist sie von der Reihenfolge
unabhängig.

### 2.6 `captureBrowser` — die ADR-Aussage hält

ADR-0016 nennt `captureBrowser` (framer-import) als bewusst `file://`-fähig und „nur aus Bibliothek
und Tests erreichbar, nicht aus einer Agent-Route“.

**Geprüft:** `captureBrowser` ist in `packages/framer-import/src/index.ts:93` exportiert und wird
im Repository **ausschließlich** in `packages/framer-import/test/capture-browser.test.ts` verwendet
(9 Fundstellen, alle in dieser einen Testdatei). Keine Agent-Route ruft es. Die ADR-Aussage
**stimmt** und ist weiterhin gültig.

### 2.7 Was in dieser Analyse **nicht** gemessen wurde

- Es wurde **kein** Angriff durchgeführt: kein Redirect auf einen privaten Dienst, kein
  Cloud-Metadatenabruf, kein Sub-Request-Versuch. Die Aussagen sind **Codeableitungen**.
- Ob der Chromium-Build des Projekts `Private Network Access` oder ähnliche eingebaute Sperren
  hat, wurde nicht geprüft; Playwright lädt ein Standard-Chromium.
- Wie viele Referenzen tatsächlich aus dem öffentlichen Web kommen, ist unbekannt.

---

## 3 — Behebungsrichtungen (nicht angewendet, nach Aufwand geordnet)

### 3.1 Eine Request-Sperre im Browser-Kontext (der eigentliche Hebel)

Ein `context.route()`-Handler im Capture-Treiber, der jede Anfrage prüft:

- **Host ist eine IP-Literal** → `isPublicAddress()` aus `@senify/core/net` entscheidet genau.
- **Host ist ein Name** → der Handler löst selbst auf und prüft. Damit ist die **Weiterleitung**
  geschlossen (Chromium meldet jede Anfrage, auch die nach einem 302), nicht aber das Rebinding
  (zwei Auflösungen: eine in der Prüfung, eine in Chromium).
- **Für Rebinding** braucht es Chromium-seitig `--host-resolver-rules`, um die Auflösung an eine
  feste Adresse zu binden. Das ist der aufwändigere Teil.

Es gibt eine важная Grenze: Ein Route-Handler sieht **die URL**, nicht die Zieladresse. Für
`http://interner-name/` ohne Port ist der Hostname nicht auflösbar — die Sperre greift dann über
die Namensauflösung, nicht über die IP.

### 3.2 Die Prüfung an die Stelle des Browsers

Unabhängig von 3.1: `captureScreenshots`, `captureThumbnails` und `recordMotion` sollten die Adresse
**vor** `page.goto` prüfen (`assertPublicHttpUrl` ist im Node-Kontext verfügbar). Damit ist die
Import-Vorschau unabhängig von der Aufrufreihenfolge geschützt.

### 3.3 Engine-Seite: die aktuelle Registry-Version im Konflikt melden

Siehe Fachanalyse 1, Befund E. Der Konfliktfehler der Engine
(`packages/engine/src/store-style-rules.ts:722-727`) nennt `field: "baseVersion"`, aber nicht den
aktuellen Wert. Ohne diesen Wert kann der Client den Konflikt nicht auflösen. Dasselbe Muster
fehlt beim Registry-Konflikt; beim Seitenkonflikt löst es der Text „current v<N>“.

### 3.4 Ein Hinweis, den Benutzer nicht erschreckt

Wenn eine Sperre eingebaut wird, gehört eine klare Meldung dazu: „Die Seite lädt eine Ressource
von einem internen Netzwerk — die Analyse wurde abgebrochen.“ Ein stilles Blockieren führt zu
„die Referenz ist leer“ und damit zu einem Support-Fall ohne Aussage.

---

## 4 — Prüfgrenzen dieser Analyse

| Punkt | Stand |
|---|---|
| Node-Pfad (`fetchPublic`) | vollständig geprüft, Code + Tests gelesen |
| Browser-Pfad | Code gelesen, **kein** Laufzeitnachweis |
| ADR-0016-Begründung | im Code bestätigt (`server.ts:113-145`) |
| Reichweite der Entscheidung auf interne Dienste | **offen** — Entscheidung liegt bei Adi |
| Rebinding | nicht praktisch geprüft; im Node-Pfad geschlossen, im Browser-Pfad offen |
| `captureBrowser`-Erreichbarkeit | geprüft: nur Tests |
| Kein Angriff durchgeführt | bewusst — die Analyse beschreibt, sie nutzt nicht aus |

---

## Umsetzung (20.10.2026)

Die offene Frage — gilt ADR-0016 auch für interne Dienste außerhalb des Dashboards? — ist
entschieden und umgesetzt: **ja, mit einer engeren Reichweite als der Node-Pfad**, weil der
Browser direkt mit dem Ziel spricht und nicht über den Proxy.

- `packages/core/src/net.ts`: `isAllowedBrowserUrl(raw, { allowFile })` — dieselbe Adresslogik
  wie der Node-Pfad (`publicTarget`), zusätzlich die browser-eigenen Schemata `data:`, `blob:`,
  `about:`; `file:` nur für den Offline-Mirror.
- `packages/engine/src/references-lifecycle.ts` und `packages/framer-import/src/capture-browser.ts`:
  Playwright-Route auf `**/*`; jede Anfrage (Navigation, Weiterleitung, Sub-Resource) läuft durch
  die Prüfung, eine nicht-öffentliche Adresse wird mit `abort("blockedbyclient")` abgewiesen.
- `packages/core/test/net.test.ts`: vier neue Fälle (interne Ziele, browser-eigene Schemata,
  `file:`, Betreiber-Schalter).
- **ADR-0022** (`docs/adr/0021-der-browser-holt-nur-oeffentliche-adressen.md`) hält die
  Entscheidung fest, ADR-0016 bleibt für den Node-Pfad unverändert.