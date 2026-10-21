# Der Browser holt nur öffentliche Adressen

Status: angenommen · 20.10.2026 (Vorschlag aus der Projektanalyse vom 19.10.2026; die Entscheidung
über die Reichweite wurde am 20.10.2026 an Adi gestellt und mit „Kümmere dich um alle Punkte" an
die Umsetzung gebunden)
Bezug: ADR-0016 (Abrufe fremder URLs nur an öffentliche Adressen), ADR-0015 (Site-Inhalte auf der
Engine-Origin).

**Problem.** ADR-0016 regelt den Node-Pfad: `fetchPublic` prüft jede Weiterleitung neu und verbindet
sich mit der geprüften Adresse. Der Browser-Pfad war davon nicht erfasst. ADR-0016 hat den Browser
ausdrücklich ausgenommen: „Weiterleitungen und Sub-Requests innerhalb des Browsers der
Referenz-Analyse sind Sache des Browsers.“

Das trägt nur für das Dashboard. Die Engine holt die Seite mit einem echten Chromium, und ein Browser
folgt allem, worauf die Seite zeigt: einer Weiterleitung, einem Sub-Resource, einem `fetch()` aus dem
Skript der Seite. Nichts davon prüfte die Adresse. Eine präparierte Referenz-Seite konnte den Browser
damit auf `http://169.254.169.254/` (Cloud-Metadaten) oder auf einen Dienst im LAN zeigen. Die Antwort
landete als Asset oder als Markup in der Analyse und damit im späteren Build der eigenen Seite.

Der Ausweg über das Dashboard-Proxy hilft hier nicht: der Browser spricht direkt mit dem Ziel, nicht
mit dem Proxy.

**Entscheidung.**

1. `isAllowedBrowserUrl(raw, { allowFile })` in `@senify/core/net` prüft eine Browser-Adresse mit
   derselben Adresslogik wie der Node-Pfad (`publicTarget`): `http(s)` ohne Zugangsdaten, Host
   aufgelöst, jede Adresse öffentlich. Die Browser-eigenen Schemata (`data:`, `blob:`, `about:`)
   verlassen den Prozess nicht und sind erlaubt; `file:` ist für den Offline-Mirror des Imports
   ausdrücklich erlaubt (`allowFile: true`).
2. Der Referenz-Capture (`packages/engine/src/references-lifecycle.ts`) und der Import-Capture
   (`packages/framer-import/src/capture-browser.ts`) registrieren vor der Navigation eine
   Playwright-Route auf `**/*`. Jede Anfrage - die Navigation, jede Weiterleitung, jeder
   Sub-Resource - läuft durch dieselbe Prüfung; eine nicht-öffentliche Adresse wird mit
   `abort("blockedbyclient")` abgewiesen. Die Seite selbst wird dadurch unter Umständen unvollständig
   geladen. Das ist der gewollte Preis: eine unvollständige Seite analysiert schlecht, eine
   vollständige Seite aus dem LAN ist ein Datenleck.
3. Der Betreiber-Schalter `SENIFY_ALLOW_PRIVATE_URLS=1` gilt auch hier. Er hebt die Adressprüfung,
   nicht die Schema-Prüfung. Das ist die gleiche Aussage wie in ADR-0016 und derselbe Schalter: der
   Import aus einem lokalen Server soll weiterhin möglich sein.

**Kosten.** Die Prüfung löst den Host auf — für jeden Request, auch für jeden Sub-Resource. Der
Auflöser des Betriebssystems cacht die Antwort, und die Abfragen laufen parallel, aber eine Seite
mit vielen fremden Hosts macht mehr Namensauflösungen als vorher. Das ist der Preis der
Prüfung; ein Cache je Capture-Lauf wäre die naheliegende Optimierung, wenn die Messung sie
verlangt.

**Folgen.** Die Referenz-Analyse erreicht keine internen Dienste mehr. Wer eine Referenz aus dem LAN
analysieren will, startet das Programm mit `SENIFY_ALLOW_PRIVATE_URLS=1` - genau wie beim Import.

**Nicht geändert, mit Grund.** Die erste Navigation der Referenz-Analyse wird weiterhin über
`assertPublicHttpUrl` geprüft (`references-lifecycle.ts`), nicht über die Route: die Route greift erst,
nachdem der Browser die Adresse aufgelöst hat, und der Fehler soll eine Meldung mit Ursache und
Schalter nennen, kein abgebrochener Request.

**Verwandt.** ADR-0016 bleibt für den Node-Pfad unverändert; dieses ADR ergänzt es um den Browser und
schließt die Lücke, die es dort offenließ.

---

## Nachtrag (20.10.2026, aus der Prüfung am Endstand)

Die Entscheidung bleibt, ihre Reichweite war unvollständig. Beim Nachprüfen aller Zusagen aus der
Projektanalyse zeigte sich: **es gibt einen dritten Browserpfad**, der in Punkt 2 nicht genannt war.

Der Analyse-Worker (`packages/analysis-worker/src/visual.ts`) startet den Browser für die
Vorschau-Bilder, den Review-Vergleich und das Bewegungs-Video. Er war **ungeschützt**. Über ihn
läuft unter anderem die Import-Vorschau: sie fotografiert die Seite des Benutzers
(`beforeUrl`) — und die Adresse, die der Browser dort öffnet, ist die des Benutzers. Bisher schützte
nur der Node-Pfad (`runFramerImport`, das die Adresse vorher prüft), also die **Reihenfolge** der
Aufrufe: wer den Browser zuerst aufrief, wäre ungeprüft gegangen (Fachanalyse 3, B5-Umfeld; der
Punkt stand als offener Befund in Abschnitt 4 des Berichts).

**Ergänzung der Entscheidung:**

1. Auch der Analyse-Worker registriert die Playwright-Route auf `**/*` — in allen drei
   Browserkontexten (`captureScreenshots`, `captureThumbnails`, `recordMotion`). Die Prüfung sitzt
   damit **am Browser**, nicht an der Aufrufstelle: die Reihenfolge der Aufrufe entscheidet nicht
   mehr, ob geprüft wird.
2. Die Produkt-eigenen Server sind ausgenommen: der Vorschau-Server und der Offline-Mirror laufen
   auf der Schleife, und der Browser muss sie erreichen. Sie stehen deshalb in einer Liste
   (`allowOrigins`), die der Aufrufer übergibt — ein Adressvergleich über den Origin, keine
   Musterregel. Ohne diese Liste gäbe es keine Vorschau.
3. `file:` ist **nicht** mehr pauschal erlaubt, sondern pro Aufnahme: nur eine Aufnahme eines
   lokalen Ordners (der Offline-Mirror) setzt `allowFile`. Eine **entfernte** Seite darf den
   Browser nicht auf eine lokale Datei zeigen und das Bild davon in die Analyse bringen.
   Der Import-Capture (`capture-browser.ts`) behält sein `allowFile: true`, weil seine Quelle per
   Definition lokal ist.
4. `isAllowedBrowserUrl` kennt die Ausnahme über `allowOrigins`; die Liste ist eine Angabe des
   Aufrufers und steht damit an der Stelle, die sie geprueft.

**Was das ändert.** Der Import-Vorschau funktioniert unverändert, und der Browser kann eine
Benutzeradresse jetzt auch dann nicht erreichen, wenn der Node-Pfad vorher ausfällt. Die
Belege: `packages/analysis-worker/test/visual-guard.test.ts` (der Server zählt seine Anfragen —
ohne die Route ist die Zahl nicht null) und `packages/engine/test/import-preview-browser.test.ts`
(ohne die Ausnahmeliste wird der eigene Vorschau-Server blockiert: `ERR_BLOCKED_BY_CLIENT`).

