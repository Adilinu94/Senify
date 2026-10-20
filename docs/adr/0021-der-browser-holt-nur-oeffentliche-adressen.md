# Der Browser holt nur öffentliche Adressen

Status: angenommen · 19.10.2026 (Vorschlag aus der Projektanalyse, Umsetzung im selben Schritt)
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
