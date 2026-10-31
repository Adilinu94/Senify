# Der Browser-Capture ist der Standard für URL-Importe, mit Rückfall auf das SSR-HTML

Status: angenommen · 31.10.2026
Bezug: ADR-0016 (öffentliche Adressen), ADR-0022 (Browser-Adressen),
`packages/framer-import/src/import.ts`, `capture-browser.ts`, `fidelity.ts`,
`packages/engine/src/imports.ts` / `imports-contract.ts`

**Problem.** Punkt 1 der Treue-Liste war keine Import-Lücke, sondern eine Grenze der
Quelle: Framer rendert Code-Komponenten nicht im SSR. Am 22.10.2026 an der
veröffentlichten Earn-Seite gemessen — der Sterne-Container steht im Server-HTML
leer (`viewBox="0 0 256 256"` 0×), erst die Laufzeit füllt ihn (5×). Bis heute war
der statische Weg der Standard; der Browser-Capture existierte, aber nur auf
Zuruf. Damit bekam der Standard genau den Inhalt nicht, für den der aufwendigere
Weg gebaut wurde.

**Gemessen.** Der Browser-Weg holt nicht nur Skript-Inhalt: Er liefert die
Gerätevarianten der anderen Builds mit. Auf `rare-works` hatten fünf Abschnitte
(nav, products, footer, …) im statischen Weg `hidden: mobile` und die gebackene
Seite war auf dem Handy 2 680 px zu kurz (20 648 → 17 968). Auf den drei
Export-Fixtures ändert sich strukturell nichts (715 / 2 958 / 2 147 Knoten auf
beiden Wegen) — dort ist der Preis ohne Gegenwert, deshalb bleibt `static`
wählbar. Der Preis des Browser-Wegs ist ein Chromium-Start je Import.

**Entscheidung.**

1. **Ohne Angabe: Browser mit Rückfall.** Eine URL-Quelle wird zuerst in Chromium
   geladen. Schlägt das fehl (Playwright fehlt, Chromium startet nicht, die Seite
   ist für den Browser nicht erreichbar), liest der Lauf das SSR-HTML weiter und
   **sagt es**: ein Fund `capture-fallback` (Schwere `warn`, mit dem Fehlertext
   als Beweis), `report.capture = { path: "static", fallbackReason }` und der
   erste Schritt des Berichts nennen den Rückfall. Kein Import scheitert daran,
   dass ein Browser nicht da ist.
2. **`capture: "static"`** liest nur das Server-HTML — der billige, ausdrücklich
   gewählte Weg (die drei Exporte gewinnen strukturell nichts).
3. **`capture: "browser"` ist strikt.** Wer den Laufzeitinhalt verlangt, bekommt
   ihn oder den Fehler — nie einen stillen Downgrade.
4. **Der Capture bleibt injizierbar** (`RunImportInput.capturer`, gleiche Haltung
   wie der Fotograf von `importPreview`). Nur so ist der Rückfall-Zweig ohne
   kaputtes Chromium testbar.
5. **Idempotenz vergleicht Gleiches mit Gleichem.** Der IR-Hash entsteht über das
   Dokument, das der Lauf tatsächlich gebaut hat. Ein Rückfall-Lauf und ein
   Browser-Lauf derselben Quelle dürfen verschiedene Hashes tragen — sie haben
   verschiedene Dokumente gelesen.

**Verworfene Alternativen.**

- *`static` bleibt Standard.* Dann liefert der Standard nie den Inhalt, für den
  der Browser-Weg existiert; Punkt 1 bliebe eine offene Grenze, obwohl der Weg
  gebaut ist. Auch die Gerätevarianten der anderen Builds fehlten weiter.
- *Browser ohne Rückfall.* Ein fehlender Browser würde jeden URL-Import
  verhindern — der Nutzen des Imports hängt aber nicht an Chromium, nur seine
  Vollständigkeit.
- *Stiller Rückfall ohne Meldung.* Ein Bericht, der wie ein sauberer statischer
  Import aussieht, macht aus einer fehlenden Fähigkeit eine unsichtbare Lücke.
  Deshalb Fund **und** Feld **und** erster Schritt.

**Folgen.**

- Ein URL-Import dauert länger (Chromium-Start plus drei Breiten). Das ist der
  bewusst gewählte Preis; `static` bleibt der Ausweg für Massenläufe und die
  Fixture-Gates, die weiterhin den statischen Weg messen und ihn deshalb
  ausdrücklich anfordern.
- Der API-Bericht (`ImportReportSchema`) trägt `capture` mit; MCP-Werkzeug und
  CLI-Hilfe nennen den Standard und den Rückfall.
- `structureSource` (hydratisierte Struktur, ADR-0026-Umfeld) bleibt davon
  unberührt und opt-in: Es tauscht den Baum gegen die Laufzeitstruktur und
  kostet die Appear-Marker — eine andere Entscheidung als der Lesepfad.

**Beleg.** `packages/framer-import/test/import-browser-capture.test.ts` (4 Fälle):

1. Inhalt, den erst ein Skript baut: statisch 0 Icons, im Browser 3 (dieselbe
   Fixture-Seite).
2. Ohne Angabe liest der Lauf im Browser (`source.kind === "browser"`,
   `report.capture.path === "browser"`, 3 Icons); `capture: "static"` liefert
   `html` / `static` / 0 Icons.
3. Injizierter werfender `capturer`: der Lauf liefert das statische Dokument,
   der Bericht trägt `capture-fallback` (mit Beweis), `report.capture =
   { path: "static", fallbackReason }` und den Rückfall im ersten Schritt.
4. Explizites `capture: "browser"` mit werfendem `capturer` rejectet.

Die Live-Messung an der veröffentlichten Earn-Seite (5 statt 0 Sterne) läuft als
`import-live-capture.test.ts` und überspringt sich ohne Netz, statt rot zu werden
(fremde Adresse, kein Fixture).
