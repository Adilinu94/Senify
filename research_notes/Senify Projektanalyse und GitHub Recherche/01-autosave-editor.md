# Fachanalyse 1 — Autosave-Pipeline und Editor-Zustand

**Basis:** `master` `5ac1a84` (19.10.2026). Die Dateien `packages/editor/src/state/persist.ts`,
`packages/editor/src/state/session.ts` und `packages/editor/src/inspector/inspector.ts` sind seit
`19c8ee0` **unverändert**; die Befunde gelten also für beide Stände.

**Belege:** `packages/editor/src/state/persist.ts` (626 Zeilen), `packages/editor/test/state/persist.test.ts`,
`packages/app/public/app.js`, `packages/engine/src/mutations/editor-contract.ts`,
`packages/engine/src/mutations/editor-bridge.ts`, `packages/engine/src/mutations/contract.ts`.

**Reproduktion:** `research_notes/Senify Projektanalyse und GitHub Recherche/autosave-probe.mts`
(sechs Gegenproben, ausgeführt unter Node 24.15.0, alle sechs bestätigt). Die Probe ist bewusst
**nicht** Teil der regulären Suite — sie ist eine Review-Sonde, kein Regressionstest.

---

## Übersicht

| Nr. | Befund | Schwere | Produktionspfad | Beleg |
|---|---|---|---|---|
| A | Die Pipeline ist nicht ausnahmesicher: ein ablehnender Transport blockiert alle folgenden Saves | mittel (latent) | **nein** — die Shell wandelt jeden Fehler in einen Status um | `persist.ts:519`, `app.js:6490-6503` |
| B | Änderungen, die während eines laufenden Requests eintreffen, werden aus der Save-Queue verdrängt | **hoch** | ja | `persist.ts:536`, `persist.ts:527` |
| C | Ein während eines laufenden Requests abgelaufener Debounce stellt keinen neuen Timer | mittel | ja | `persist.ts:450-457`, `persist.ts:504` |
| D | `setNodeHiddenDevices` wird nie gespeichert, obwohl die Engine die Operation vollständig unterstützt | **hoch** | ja | `persist.ts:127-142`, `inspector.ts:1286` |
| E | Ein Style-Registry-Konflikt hat keinen funktionierenden Wiederholungsweg | **hoch** | ja | `persist.ts:549-554`, `persist.ts:574-584` |

Die Befunde B, C, D und E sind unabhängig voneinander. B und C verstärken sich gegenseitig (siehe
„B in Verbindung mit C“).

---

## A — Die Pipeline ist nicht ausnahmesicher

**Mechanik.** `flush()` setzt `running = true` (Zeile 505) und wartet auf `await request(...)`
(Zeile 519). Der `await` steht in **keinem** `try/catch`. Lehnt der Transport ab (Netzwerkfehler,
DNS-Fehler, `fetch`-Fehler), verlässt die Exception die Funktion, bevor `running = false`
(Zeilen 528, 537, 565) erreicht wird.

**Folge.** `running` bleibt dauerhaft `true`. Jeder spätere `flush()` kehrt in Zeile 504 zurück
(`if (paused || running || pending.length === 0) return;`). Damit gilt:

- Der Status bleibt auf `"saving"` (gesetzt in Zeile 508) — die Statuszeile zeigt dauerhaft
  „Speichert …“ (`app.js:6543`).
- `retry()` (Zeile 583) ruft `flush()` auf und sendet nichts.
- Der Autosave-Timer ruft `void flush()` ohne `catch` (Zeile 455) — eine abgelehnte Promise wird
  **nicht behandelt**. Im Browser landet sie als unbehandelte Ablehnung in der Konsole; in einem
  Node-Konsumenten beendet sie den Prozess (Node-Standard `unhandled-rejections=throw`).
- Der Speichern-Knopf ruft ebenfalls `void session.flush()` (`app.js:7249-7250`) — die Rejection
  erreicht den Benutzer nicht.

**Warum das kein Live-Befund ist.** Der Transport der Shell fängt jeden Fehler ab und gibt einen
Status zurück (`app.js:6490-6503`): `catch (error) { return { status: … ?? 500, body: … } }`. Ein
Netzwerkfehler erreicht `flush()` also als HTTP 500, nicht als Ablehnung.

**Einordnung.** Der Vertrag von `SaveTransport` (Typ in `persist.ts:102`) erlaubt eine Ablehnung;
die Pipeline ist darauf nicht vorbereitet. Das ist ein latenter Defekt, kein Produktionsausfall.
Der Aufwand zur Behebung ist klein (`try/catch` um den Aufruf, `running` im `finally` zurücksetzen),
der Nutzen ist die Robustheit des Vertrags und die Vermeidung einer unbehandelten Ablehnung.

**Zusatzbefund.** `dispose()` (Zeile 602) räumt Timer und Listener auf, löst aber den
Store-Listener nicht (`store.setActionListener(record)`, Zeile 608). `setActionListener` **ersetzt**
den Listener (`store.ts:128-132`), es ist also kein Doppel-Registrieren — die verworfene Pipeline
sammelt aber weiterhin Aktionen in ihrem `pending`-Array. Praktisch unkritisch, weil Store und
Pipeline dieselbe Lebensdauer haben.

---

## B — Änderungen während eines laufenden Requests werden verdrängt (Schwere: hoch)

**Mechanik.** In `flush()` wird der Batch vor dem Request abgenommen (Zeilen 506-507:
`const batch = pending; pending = [];`). Während der Request läuft, kann eine neue Änderung
eintreffen; `record()` (Zeile 474) hängt sie an `pending` an. Kommt der Request zurück, wird
`pending` **überschrieben**, nicht zusammengeführt:

- Zeile 536 (Status ≥ 400): `pending = batch;`
- Zeile 527 (Status 409): `pending = batch;`

Die zwischenzeitlich eingetroffene Änderung liegt danach weder in `pending` noch in `batch` — sie
ist aus der Queue verschwunden. Das lokale Dokument enthält sie weiterhin
(`store.apply` hat sie bereits geschrieben).

**Folge.** Server und lokales Dokument laufen auseinander, ohne dass der Benutzer etwas davon
merkt. Der Serverstand enthält den Wert nicht; ein Neuladen verwirft ihn. Die Statuszeile zeigt
„1 offen“ — die Zahl zählt den **alten** Batch, nicht die verlorene Änderung.

**Beleg (Messprobe).** Für HTTP 409 und HTTP 500 jeweils: eine Änderung vor dem Request, eine
während des Requests, Antwort mit Fehlerstatus. Ergebnis: `pending === 1` (erwartet wären zwei
Writes), während das lokale Dokument den neuen Wert trägt. Die Probe ist Zeile 27-43 von
`autosave-probe.mts`.

**Warum der vorhandene Test den Fehler nicht sieht.** `packages/editor/test/state/persist.test.ts:412-422`
prüft „keeps the batch and reports an error when the server fails“: eine Änderung, `flush()`,
Status 500, Erwartung `pending === 1`. Träte eine zweite Änderung **während** des Requests hinzu,
wäre `pending` nach dem Fehler ebenfalls `1` — aber der *andere* Batch. Der Test kann den
Fehler nicht sehen, weil er die entscheidende Konstellation nicht herstellt.

**Behebungsrichtung (nicht angewendet).** `pending = [...batch, ...pending]` statt `pending = batch`
an beiden Stellen. Damit bleibt die Reihenfolge erhalten (der ältere Batch zuerst), und die
verdrängte Änderung wird im nächsten Zyklus mitgesendet.

---

## C — Ein verbrauchter Debounce stellt keinen neuen Timer (Schwere: mittel)

**Mechanik.** `schedule()` (Zeile 450) setzt einen Timer, dessen Rückruf `void flush()` aufruft
(Zeile 455). Läuft zu diesem Zeitpunkt bereits ein Request, kehrt `flush()` in Zeile 504 sofort
zurück — der Timer ist damit verbraucht, und `timer` ist `undefined` (Zeile 454). **Es wird kein
neuer Timer gesetzt.**

**Folge.** Die Änderung bleibt in `pending`, bis eine weitere Aktion folgt oder der Benutzer
manuell speichert. Der Autosave-Versprechen („das speichert von allein“) gilt für diese Änderung
nicht. Die Oberfläche zeigt „1 offen“ und der Knopf „Speichern (1)“ — der Zustand ist sichtbar
und reparierbar, deshalb mittel und nicht hoch.

**Beleg (Messprobe).** Zeile 45-63 von `autosave-probe.mts`: ein Request in der Luft, eine
Änderung währenddessen, Debounce 5 ms, nach dem Erfolg des Requests 30 ms warten. Ergebnis:
`requests === 1` (erwartet 2), `pending === 1`.

**Behebungsrichtung (nicht angewendet).** Nach erfolgreichem `flush()` erneut `schedule()` aufrufen,
wenn `pending.length > 0` — oder den Timer beim Betreten von `flush()` nicht verbrauchen, sondern
bei `running` erneut einplanen.

### B in Verbindung mit C

Die Kombination ist schärfer als jeder Einzelfall: C stellt sicher, dass der Folge-Batch keinen
eigenen Timer bekommt; B sorgt dafür, dass der Folge-Batch beim nächsten Fehler **endgültig**
verdrängt wird. Eine Änderung, die während eines laufenden, fehlschlagenden Requests eintrifft,
geht dann verloren — statt nur liegen zu bleiben.

---

## D — `setNodeHiddenDevices` wird nie gespeichert (Schwere: hoch)

**Das ist der schwerwiegendste Befund: eine sichtbare Funktion speichert ihre Änderung nicht.**

**Der Filter.** `record()` (Zeile 464) prüft zuerst die Operationsart:

```
466:      if (!PAGE_OPS.has(op) && !SITE_OPS.has(op)) {
467:        recordUnsupported([op]);
468:        return;   // <- die Patch-Übersetzung wird nie erreicht
469:      }
```

`PAGE_OPS` (Zeile 127-142) enthält 14 Operationen; `SITE_OPS` (Zeile 145-150) vier. `setNodeHiddenDevices`
fehlt in beiden.

**Die Engine kann es — und beweist es auch.** Die Operation ist an drei Stellen vollständig
vorbereitet:

- `packages/engine/src/mutations/contract.ts:42` — `setNodeHiddenDevices` steht in `EDITOR_MUTATION_OPS`.
- `packages/engine/src/mutations/editor-contract.ts:145-152` — ein TypeBox-Schema
  (`devices`: „tablet“ | „mobile“).
- `packages/engine/src/mutations/editor-bridge.ts:199-219` — die Brücke schreibt **beide**
  Breakpoints idempotent: gesetzt wird `{ hidden: true }`, nicht gesetzt wird der Hidden-Flag
  selektiv per `clearBreakpointOverride` gelöscht, damit andere Overrides dieses Breakpoints
  erhalten bleiben.

Und die Engine-Seite ist **getestet**:
`packages/engine/test/editor-mutations.test.ts:55-74` („maps the hidden-device op onto both
breakpoint overrides (ticket 11)“) prüft genau diesen Bridge-Zweig — inklusive des selektiven
Löschens für das Gerät, das nicht in der Liste steht. `:76-95` deckt den Fall „frisch
eingefügter Knoten mit `hiddenDevices`“ ab.

**Das macht den Befund schwerer, nicht leichter:** Auf beiden Seiten des Bruchs steht ein
**grüner** Test — die Engine beweist, dass die Operation funktioniert, und der Editor beweist,
dass sie richtig übersetzt wird. Was fehlt, ist der eine Test, der die Kette dazwischen prüft.

**Die Übersetzung existiert ebenfalls.** `patchesToPending` (Zeile 298-307) bildet das
`hiddenDevices`-Feld genau auf die Operation ab — der Kommentar dort nennt Ticket 11.

**Der Benutzerpfad.** Der Inspektor ruft die Operation direkt auf
(`packages/editor/src/inspector/inspector.ts:1282-1288`): der Schalter „Sichtbarkeit je Gerät“
schreibt `{ op: "setNodeHiddenDevices", id: nodeId, devices: [...] }` in den Store. Das lokale
Dokument ändert sich, der Canvas zeigt es sofort.

**Der Server bekommt es nie.** Der Filter greift, bevor der Request gebaut wird. `requests` bleibt
0, `unsupported` enthält `setNodeHiddenDevices`.

**Was der Benutzer sieht.** Die Statuszeile hängt den Hinweis an
(`app.js:6548-6549`): „nicht speicherbar: setNodeHiddenDevices“. Das ist ehrlich, aber der
Fehlerzustand ist **umgekehrt**: Die Änderung ist im Dokument, sieht gespeichert aus, wird nur
nicht übertragen. Nach einem Neuladen ist sie weg.

**Der vorhandene Test erzeugt falsche Sicherheit.** `packages/editor/test/state/persist.test.ts:426-451`
heißt „maps the hidden-device field onto the dedicated op“ und prüft `patchesToPending` — die
Funktion **einzeln**. Der Test ist grün, das Feld ist richtig übersetzt. Der Filter in `record()`
liegt aber **vor** der Übersetzung und ist im Test nicht beteiligt. Der Test sagt also etwas
Wahres über eine Funktion, die im Produktpfad nie erreicht wird. Das ist der Fehlertyp „der Test
prüft das Richtige, aber nicht den Weg, den das Produkt nimmt“.

**Vollständigkeit der Liste.** Der Abgleich von `EDITOR_MUTATION_OPS` (19 Operationen,
`contract.ts:38-58`) gegen `PAGE_OPS` ∪ `SITE_OPS` (18) ergibt **genau eine** Lücke:
`setNodeHiddenDevices`. Alle übrigen 18 Operationen sind abgedeckt.

**Behebungsrichtung (nicht angewendet).** Eine Zeile: `"setNodeHiddenDevices"` in `PAGE_OPS`
aufnehmen. Die Engine-Seite braucht **keine** Änderung — sie ist implementiert und getestet
(`packages/engine/test/editor-mutations.test.ts:55-74`). Nötig ist ein Test, der die Strecke
**über die Pipeline** führt (Store → `flush()` → Request-Body), nicht nur die
Übersetzungsfunktion.

---

## E — Ein Style-Registry-Konflikt hat keinen funktionierenden Wiederholungsweg (Schwere: hoch)

**Mechanik.** Der Registry-Schreibpfad läuft in der Schleife ab Zeile 545. Bei HTTP 409 gilt
(Zeilen 549-554):

```
550:        pending = [...siteOps.slice(index), ...pending];
551:        running = false;
552:        setStatus("conflict", "Die Style-Registry wurde zwischenzeitlich geändert");
553:        return;
```

`conflictVersion` wird **nicht** gesetzt — anders als im Seitenpfad, wo Zeile 525
`conflictVersion = readConflictVersion(response.body)` setzt. `readConflictVersion` liest die
Seitennummer aus dem Fehlertext im Format „current v<N>“ (Zeile 335-341); die Engine meldet für
die Registry aber `field: "baseVersion"` und einen Vorschlag, **ohne** die aktuelle Version
(`packages/engine/src/store-style-rules.ts:722-727`).

**Folge für `retry()`.** Zeile 574-584:

```
575:    const target = nextVersion ?? conflictVersion;         // beide undefined
576:    if (target !== undefined) version = target;
577:    if (conflictVersion === undefined && nextVersion === undefined && status === "conflict") {
578:      setStatus("conflict", "Reload the page to get the current draft version, then retry.");
579:      return;                                               // <- kein Versand
580:    }
```

`retry()` **ohne** Argument sendet nichts. Die Shell ruft aber `session.retry(fresh.draftVersion)`
auf (`app.js:6583`), wobei `fresh.draftVersion` die **Seiten**-Version ist. Damit:

1. `version` wird auf die Seitenversion gesetzt — für einen Registry-Konflikt die falsche Größe.
2. `styleRegistryVersion` bleibt unverändert. Der erneute Write geht mit dem alten
   `baseVersion` hinaus (Zeile 484: `const versionBody = { baseVersion: styleRegistryVersion, author }`).
3. Die Engine lehnt erneut mit 409 ab (`store-style-rules.ts:722`).

**Der Kreis ist geschlossen.** Der Knopf „Eigene Änderungen senden“ im Konfliktdialog
(`app.js:6606-6615`) löst den Registry-Konflikt nicht auf; der Dialog öffnet sich erneut mit
„unbekannter Version“ (`persist.ts:79-82`, weil `serverVersion` null ist). Der Dialog bietet
„Server laden (eigene Änderungen verwerfen)“, „Eigene Änderungen senden“ und „Später“ — der
zweite Knopf funktioniert für diesen Konflikt nicht.

**Der einzige Ausweg ist ein Neuladen des Browsers.** `replaceDocument` → `acceptVersion`
(Zeile 586-591) setzt `version` und `paused`, **nicht** aber `styleRegistryVersion`. Erst eine
neue Sitzung (`app.js:6525-6534`, `styleRegistryVersion` aus dem Seitenaufruf) hat den aktuellen
Registry-Stand. Beim Neuladen geht der lokal gepflegte Regel-Entwurf verloren, weil
`discardPending()` ihn verwirft (`app.js:6573`).

**Beleg (Messprobe).** Zeile 79-99 von `autosave-probe.mts`: ein Upsert, Antwort 409, danach
`retry()` (ohne Argument) und `retry(2)`. Ergebnis: nur ein Request abgesetzt, `conflict.serverVersion`
null, und der zweite Versuch trägt weiterhin `baseVersion: 0`.

**Behebungsrichtung (nicht angewendet).** Zwei Seiten, weil beide fehlen:

- **Engine:** Der Konfliktfehler muss die aktuelle Registry-Version mitführen (etwa
  `currentVersion` im Fehlerobjekt), sonst kann der Client sie nicht erfahren.
- **Client:** Bei einem Registry-409 `styleRegistryVersion` übernehmen und ein eigenes
  Retry-Ziel anbieten. Der Dialogtext („Entwurf wurde inzwischen geändert“, `persist.ts:84`)
  beschreibt heute ausschließlich den Seitenkonflikt und trifft für den Registry-Fall nicht zu.

---

## Testlücken, die diese Befunde ermöglicht haben

| Lücke | Ort | Folge |
|---|---|---|
| Die Test-Harness kann keine Ablehnung erzeugen | `persist.test.ts:18-35` — `Scripted` liefert `SaveResponse \| undefined`, `request` ist `async` und **immer** auflösend | Befund A ist nicht testbar; jeder Test mit einem Netzwerkfehler muss eine Sonderform nutzen |
| Kein Test mit einer Änderung **während** eines laufenden Requests | gesamte Datei | Befund B und die Kombination B+C bleiben unsichtbar |
| Kein Test für den Debounce während eines laufenden Requests | gesamte Datei | Befund C bleibt unsichtbar |
| `setNodeHiddenDevices` wird nur auf Funktionsebene geprüft | `persist.test.ts:426-451` | Befund D bleibt unsichtbar, obwohl der Test existiert und grün ist |
| Kein Test für einen Registry-409 mit anschließendem `retry()` | gesamte Datei; `packages/app/test/save-pipeline.test.ts` deckt nur den Seitenkonflikt (Zeile 149-162) | Befund E bleibt unsichtbar |
| Die Engine-Achse **ist** getestet — der Test belegt aber die Brücke, nicht den Produktpfad | `packages/engine/test/editor-mutations.test.ts:55-74` | Beide Seiten des Bruchs sind grün; genau deshalb bleibt der Bruch unsichtbar |

**Empfohlene Reihenfolge der Regressionstests** (nach Aufwand): erst D (ein Testfall, einzeilige
Änderung), dann E (Testfall plus Engine-Feld), dann B (zwei Testfälle), dann C, dann A
(Harness erweitern).

---

## Was **nicht** bestätigt wurde

- Ob die Shell den Nutzer bei einem Registry-Konflikt tatsächlich in die Schleife schickt: der
  Codeweg ist belegt (`app.js:6583` → `persist.ts:574-584` → erneuter 409), eine Bildschirmaufnahme
  oder ein Browserlauf liegt nicht vor. Die Aussage ist eine Codeableitung, keine Messung.
- Ob `setNodeHiddenDevices` in der Praxis häufig benutzt wird: der Inspektor bietet den Schalter
  an (`inspector.ts:1279-1289`), eine Nutzungsstatistik gibt es nicht.
- Ob ein anderer Client (`@senify/mcp`, `@senify/skills`) `createSavePipeline` mit einem ablehnenden
  Transport benutzt: im Repository ist der Editor-Shell der einzige Verbraucher
  (`packages/app/public/app.js:6490`).

---

## Umsetzung (20.10.2026)

Alle fünf Befunde sind behoben und mit Regressionstests belegt.

| Befund | Behebung | Beleg |
|---|---|---|
| D | `"setNodeHiddenDevices"` in `PAGE_OPS` (`packages/editor/src/state/persist.ts:151`) | `packages/editor/test/state/persist-vocabulary.test.ts` („sends setNodeHiddenDevices“); ohne die Zeile rot (Gegenprobe) |
| B | `pending = [...batch, ...pending]` an beiden Stellen; `sendBatch()` als eigener Schritt | `persist.test.ts`: „keeps a change that arrives while a failing request is in flight“ und „…while a conflicting request is in flight“; beide ohne die Behebung rot (Gegenprobe) |
| C | Nach dem Flush wird erneut geplant, wenn noch etwas offen ist (`if (sent && !paused && pending.length > 0) schedule()`) | `persist.test.ts`: „saves a change that arrived during the request without another user action“; ohne die Behebung rot (Gegenprobe) |
| A | `flush()` fängt eine Ablehnung des Transports ab, legt den Batch zurück und meldet den Fehler; `running` wird im `finally` zurückgesetzt | `persist.test.ts`: „keeps the batch and recovers when the transport rejects“; ohne die Behebung rot (Gegenprobe) |
| E | Die Engine meldet die aktuelle Registry-Version im Konfliktfehler (`currentVersion`), der Client übernimmt sie; `retry()` sendet gegen sie statt gegen die Seitenversion | `packages/engine/test/style-rules.test.ts` („currentVersion“), `persist.test.ts`: „resends against the registry version the server reported“ |

**Dazu das Wörterbuch-Tor.** `packages/editor/test/state/persist-vocabulary.test.ts` fährt alle
19 Operationen des Engine-Vokabulars durch den Store und die Pipeline und prüft, dass jede
Operation den Editor verlässt. Eine zweite Gruppe prüft für dieselben 19 Operationen, dass
Patch → Mutation → Patch denselben Zustand ergibt. Das ersetzt den `fast-check`-Vorschlag aus
Fachanalyse 6: das Vokabular ist eine geschlossene Liste, eine erschöpfende Prüfung ist stärker
als eine zufällige.