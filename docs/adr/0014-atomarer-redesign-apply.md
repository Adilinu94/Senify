# Atomarer Redesign-Apply ohne Zwischenzustand

Status: accepted · 25.09.2026
Bezug: ADR-0012 (persistente Redesign Proposals, Entscheidung vor dem ersten Effekt), ADR-0013 (Sektions-Plan als Handoff),
`CONTEXT.md` (Asset-Kopie, Apply-Plan), `packages/engine/src/apply-redesign.ts`, `packages/engine/src/redesign-proposals.ts`.

Zwei Lücken stehen nebeneinander und werden hier in dieser Reihenfolge geschlossen.

**Lücke 1 — Duplizierte Site trägt fremde Assets.** `duplicateSite` kopiert Pages samt Draft, aber keine
Asset-Zeilen und keine Dateien (`store.ts:1731-1733`: „assets are only referenced, never duplicated"). Der
kopierte Draft zeigt damit auf `assetId` der **Quell-Site**. Folge: `bake.ts:89` filtert die Assets per
`site_id`, liefert für die Kopie also keine; `checks.ts:166-193` meldet `broken-asset` und `submitReview`
blockiert mit 422. Schlimmer: `purgeAsset` (`media.ts:734-744`) benutzt `asset.siteId` und löscht damit über
eine ID aus dem kopierten Draft die **Originaldatei der Quell-Site**. Ursache ist nicht das Duplizieren,
sondern dass `getAsset`, `updateAsset` und `purgeAsset` keinen Site-Guard haben.

**Lücke 2 — `applying` ist eine Sackgasse.** Der Claim committet (`store.ts:4344-4375`), danach folgen
5+ unabhängige Commits: `duplicateSite`, `createPage`, `updateTheme`, `persistBatch` je Seite,
`recordSiteEvent`. Erst dann schließt `finalizeRedesignProposal` (`store.ts:4382`) als eigener Commit ab.
Ein Absturz dazwischen lässt einen Proposal dauerhaft auf `applying` — inklusive möglicherweise
vollständig geschriebener Effekten, deren `siteId` niemand kennt. Es gibt keinen Retry, keinen Lease, kein
Aufräumen und keine Reset-Route. Die Idempotenz des HTTP-Layers hilft hier nicht: der Browser sendet pro
Klick einen neuen UUID-Key, und der 409 löscht den Key ohnehin.

**Entscheidungen.**

1. **Apply-Plan statt imperativem Ablauf.** `compileRedesign()` liest und rechnet, `commitRedesignApply()`
   schreibt. Der Compile entscheidet jede Verzweigung und vergibt jede Kennung vorab; der Commit ist eine
   Schleife über vorbereitete Aussagen ohne `if`, ohne `continue`, ohne Datei-I/O. Das ist keine
   Geschmacksfrage: nur so kann der Commit kontrollflussfrei und damit transaktionsfähig werden.

2. **Claim und Abschluss in derselben Transaktion.** Damit entfällt `applying` als dauerhafter
   Zwischenzustand. Ein Absturz rollt alles zurück; der Proposal bleibt `proposed` und der Mensch kann
   erneut bestätigen. Ein halb angewandter Entwurf wird nicht mehr als Erfolg sichtbar.

3. **Verschärfung von ADR-0012, kein Bruch.** ADR-0012 sagte „Decision wird vor dem ersten Effekt
   gespeichert". Hier gilt „Decision und Effekte werden in einem Commit gespeichert". Das ist **strenger**:
   ein Rollback verwirft Entscheidung und Effekte gemeinsam, statt einen halb angewandten Stand zu
   hinterlassen. Die menschliche Wahl bleibt irreversibel, sobald der Commit durch ist.

4. **Kein Lease-Worker, keine neue Tabelle.** `bake_jobs` und `image_jobs` beweisen, dass das Lease-Muster
   im Haus funktioniert. Hier wird es nicht gebraucht: eine einzige Transaktion schließt das Window
   zwischen den Schritten. Ein Run samt `lease_until`, `attempts` und Wiederaufnahme wäre eine dritte
   Job-Tabelle für ein Problem, das die Transaktion nicht hat.

5. **Dateien vor der Transaktion, Kompensation danach.** Ein Rollback kann keine Datei löschen. Deshalb
   Dateien zuerst, dann eine Transaktion, und bei einem Commit-Fehler wird über die im Plan bekannten
   Speicherpfade zurückgeräumt. Die verbleibenden Waisen sind harmlos; Zeilen ohne Datei wären es nicht,
   weil der Bake sie still überspringt.

6. **Asset-Zugriff wird site-scoped, Pfade werden ehrlich.** Ein Asset gehört genau einer Site. Der Guard
   wird in den Zugriffsweg erzwungen, nicht in den Kommentar. Weil ein Token nicht an eine Site gebunden
   ist, kommt die Site aus dem Pfad: die acht Asset-Routen wandern unter `/api/sites/:siteId/assets/…`.
   Das ist ein Breaking Change und wird im selben Zug an MCP-Tools, Tests und Route-Matrix nachgezogen.

7. **Jede Asset-Kopie bekommt eigene Kennungen und eigene Speicherpfade.** `assets.id` ist ein globaler
   Primärschlüssel und `storage_ref` enthält Site **und** Asset. Eine Übernahme würde mit dem Original
   kollidieren; ein geteilter Pfad würde bedeuten, dass ein Purge der Quelle die Kopie mitnimmt. Ordner,
   Bildleiter, Blurhash und Datei-Historie werden mitkopiert, damit die Kopie veröffentlicht werden kann
   und sich beim Ersetzen wie eine eigene Site verhält.

8. **Unbekannte Asset-Verweise werden nicht stillschweigend repariert.** Der Draft-Rewrite ersetzt nur
   bekannte Zuordnungen. Alles andere bleibt stehen, damit `broken-asset` ehrlich meldet statt zu verlieren.

**Betrachtete Optionen:**

- *Lease-Worker wie `bake_jobs`* — verworfen: braucht eine dritte Job-Tabelle, deterministische Anker pro
  Schritt und Resumelogik, um das Window zu schließen. Die Transaktion macht das Window überflüssig.
- *Ein `__tx`-Marker am DB-Client, damit `withTransaction` auf einem laufenden Client zur No-op wird* —
  verworfen: `updateTheme` und `persistBatch` würden ihre eigene Transaktion stillschweigend abschalten.
  Verliert man den Marker irgendwo, ist die Atomarität eine Illusion **ohne Fehler**. Store-Methoden
  bekommen stattdessen eine explizite Client-Variante nach dem Muster `#readStyleRules(siteId, client)`.
- *Slug- und Pfad-Retry in die Transaktion* — verworfen: PostgreSQL bricht die Transaktion nach einem
  Constraint-Fehler ab, ein 50-facher Retry darin ist unmöglich. Slug und Seitenpfad werden im Compile
  deterministically bestimmt.
- *Assets im Executor kopieren, die Routen unangetastet lassen* — verworfen: das Leck bestünde unabhängig
  vom Redesign. Ein `purge` auf eine fremde Kennung wäre weiterhin möglich.
- *Asset-Kopie im Store statt in `media.ts`* — verworfen: der Store kennt kein `dataDir` und bleibt
  DB-only. Datei und Zeile gehören in die Medienschicht, wo es dieses Muster schon gibt.
- *Token an eine Site binden, statt Pfade zu ändern* — verworfen für diese Scheibe: die dauerhafteste
  Lösung, aber sie braucht eine `site_id`-Spalte in `api_tokens` plus ein Token-Erstellungskonzept.

**Konsequenzen:**

- `CONTEXT.md` führt Asset-Kopie und Apply-Plan als Fachbegriffe.
- Neu `compileRedesign` / `commitRedesignApply` in `apply-redesign.ts`; `applyRedesign` bleibt als Wrapper
  für den Legacy-Weg und teilt sich damit die Fachlogik.
- Store-Methoden erhalten Client-Varianten; öffentliche Signaturen bleiben unverändert.
- Neu `copySiteAssets` und `rewriteAssetIds` in `media.ts`.
- `purgeAsset` und `restoreAssetHistory` nehmen die Site als Pflichtargument.
- Acht HTTP-Routen und ein Ordner-`DELETE` werden site-scoped; MCP-Tools, Tests, Route-Matrix und
  `docs/mcp-route-matrix.md` folgen.
- **Offen:** Ausführen des Sektions-Plans im Executor, Design-Record an Review/Release, Token-an-Site-
  Bindung, Aufräumen verwaister `proposed`-Proposals.
