# Persistente Redesign Proposals mit menschlicher Direction Decision

Status: accepted · 25.09.2026
Bezug: ADR-0001 (JSON-first Bau-Modell), ADR-0010 (Island-Payload: Herkunft und Integrität sind Pflicht),
`CONTEXT.md` (Direction Card, Redesign Proposal, Direction Decision), `packages/skills/skills/senify-referenz-redesign.md`,
`packages/engine/src/apply-redesign.ts`, `docs/current/stand.md`.

Der Redesign-Workflow (Redesign-Vertical-Slice, 24.09.2026) ist technisch geschlossen: ein Agent plant,
appliziert, baut Sektionen um, prüft und reicht zum Review ein. Was fehlt, ist der menschliche
Entscheidungsschritt. Heute ist die „bestätigte Richtung" nichts als eine Konvention in drei
Dokumenten: der Agent kopiert eine `referenceId` aus `targets[]` und übergibt sie als
`referenceIds: [chosenReferenceId]`. Ein Mensch sieht die Richtungen nicht, kann sie nicht
vergleichen und jede Änderung an der Quelle zwischen Plan und Apply bleibt unbemerkt.

**Entscheidung.** Die Richtung wird als **serverseitig abgeleitete, unveränderliche Direction Card**
angeboten und die menschliche Wahl als **persistenter Redesign Proposal mit genau einer Direction
Decision** entschieden.

1. **Die Card ist ein Angebot, kein Agenten-JSON.** Jede Card entsteht serverseitig aus
   `buildRedesignPackage()` — derselben Quelle wie `plan_redesign`. Ein Agent darf nur `pageId` und
   `referenceIds` melden; er kann weder Card-Inhalte, Theme-Patches noch Begründungen einspeisen.
   Damit gilt die Wert-Grammatik von ADR-0001 auch hier: Was der Agent behauptet, ist kein Befund.
2. **Gespeichert wird exakt das Angebotene.** Der Proposal hält die Card-Snapshots unveränderlich
   fest, inklusive eines immutable kopierten Referenz-Screenshots. `themePreview` und
   `verification` einer Card hängen am aktuellen Theme, `reference_profiles` ist append-only: ein
   gespeicherter Karten-Snapshot wäre ohne eigene Basisangabe nach der nächsten Profilrevision still
   falsch. Deshalb friert der Proposal zusätzlich die Planbasis ein (Draft-, Theme-Version,
   Profilrevision und Profilhash) und bildet daraus `offerHash`.
3. **Persistiert wird die Entscheidung, nicht ein Kartenabbild im Audit.** Genau eine additive
   Tabelle `redesign_proposals` mit `cards`, `basis`, `decision`, `apply_result` und Status.
   `audit_entries` bleibt append-only Verlauf und ausdrücklich **nicht** die Current-State-Quelle:
   ein Audit hat keine atomare Auswahl, keine Eindeutigkeit und keinen Status. Genau wie ADR-0010
   verlangt die Herkunft einen eigenen Datensatz.
4. **Selection und Apply sind ein menschliches Kommando.** Es gibt bewusst **keinen** `select`- oder
   `PATCH decision`-Endpunkt und damit keinen langlebigen, widerrufbaren Zwischenzustand. Der
   Confirm beansprucht die Zeile per `FOR UPDATE`, speichert die Decision **vor** dem ersten Effekt
   und setzt `applying`; danach läuft der bestehende Apply mit dem gespeicherten Card-Snapshot.
   Die Basis wird unmittelbar vor dem Claim geprüft, `stale` ist eine **berechnete** Eigenschaft und
   kein Status: ein veralteter Proposal bleibt `proposed` und wird mit 409 ohne Effekt beantwortet.
   Kein automatischer Rebase — der Mensch plant neu.
5. **Bestätigen darf nur ein Mensch.** Der Confirm ist `operatorOnly`. Ein Agent-Token mit
   `write,publish` erhält 403. Das ist eine bewusste Zuspitzung gegenüber
   `submit_for_review`/`request_changes`: eine Richtungswahl ist eine Gestaltungsentscheidung, keine
   Schreibrechtefrage. MCP bekommt deshalb nur `create_redesign_proposal` und
   `get_redesign_proposal`, **kein** Confirm-Tool und **keine** Elicitation als Ersatz.
6. **Der autonome Weg bleibt.** `POST /api/sites/:siteId/redesign` und `apply_redesign` bleiben als
   Legacy-/Agentenpfad bestehen. Der Proposal-Confirm ruft dieselbe interne Funktion mit einem
   gespeicherten Snapshot auf — kein zweiter Apply-Weg, keine zweite Fachlogik.
7. **Screenshot mit Herkunft.** Wie in ADR-0010 gilt: eine unversionierte Remote-URL ist kein
   belastbares Bild für eine Entscheidung. Ohne gespeicherten Referenz-Snapshot wird die
   Proposal-Erstellung für die menschliche Reise abgelehnt.
8. **Die Transaktionsgrenze wird benannt, nicht beschönigt.** Die Proposal-Transaktion schützt
   nur den eigenen Zustand. `applyRedesign()` schreibt weiterhin in mehreren Schritten (Duplikat,
   Theme, Pages, Audit) und ist **nicht** atomar. Ein harter Prozessabbruch kann `applying` hinterlassen;
   das wird bewusst **nicht** automatisch wiederholt (fail-closed), sichtbar als „Anwendung läuft
   oder endete unvollständig". Eine atomare Redesign-Transaktion ist damit ausdrücklich als spätere
   Arbeit markiert, nicht als erfüllte Eigenschaft dieser Scheibe.
9. **Kein neuer Workspace.** Die menschliche Wahl ist ein nichtmodaler Hinweis in der
   Canvas-Toolbar der Quellseite plus ein natives Modal mit echten Radio-Cards. Kein Top-Level-Tab,
   kein Editor-Core-Umbau, kein Routing-Fall, kein SSE-Eventkind.

**Betrachtete Optionen:**

- *Direction Cards als freies Agenten-JSON speichern* — verworfen: der Agent würde Designbehauptungen
  als Verifikation ausgeben können; genau die Hintertür, die ADR-0001 und ADR-0010 ausschließen.
- *Nur das Apply-Audit anreichern* — verworfen: kein atomarer „genau eine"-Schutz, keine
  Statusmaschine, keine reloadfeste Inbox; zwei parallele Bestätigungen wären beide gültig.
- *JSON-Spalte an `sites` wie `design_contract`* — verworfen: `design_contract` ist eine
  überschreibbare, abgeleitete Eigenschaft (Zustand). Eine Direction Decision ist ein Ereignis;
  Überschreiben zerstört die Historie genau dort, wo der Mensch nachvollziehbar bleiben soll.
- *Spalte an `review_items` wie `import_reports`* — verworfen: ein Review ist semantisch später und
  würde Review-Lifecycle mit Richtungswahl vermischen; `submitReview()` baut Preview und Diff und
  wäre für eine Planung falsch.
- *Getrenntes `select` vor `apply`* — verworfen: erzeugt genau den zu vermeidenden Zwischenzustand
  „gewählt, aber nichts passiert" samt Reload- und Fehlerfällen.
- *Normalisierte `proposals`-/`cards`-/`decisions`-Tabellen* — verworfen: bei höchstens drei Cards
  unnötige Tabellen, Joins und Transaktionsgrenzen ohne Produktgewinn.
- *Status `stale` in der Tabelle* — verworfen: Staleness ist eine Ableitung aus der aktuellen Basis;
  sie als Spalte zu speichern müsste sie veralten lassen.
- *SSE-Events für Proposals* — verworfen: die Inbox ist eine Leseansicht und pollt; ein neuer
  Eventkind wäre Broadcast- und Cleanup-Aufwand ohne Produktgewinn.

**Konsequenzen:**

- `CONTEXT.md` führt Direction Card, Redesign Proposal und Direction Decision als Fachbegriffe.
- Neue Engine-Dateien `redesign-proposal-contract.ts` und `redesign-proposals.ts`; additive
  Tabelle `redesign_proposals` in `db.ts`; Store-Methoden für Anlegen, Listen, Laden, Claim
  (`FOR UPDATE`) und Finalisieren.
- `applyRedesign()` erhält einen internen Snapshot-Modus; der Design-Record führt `proposalId`,
  `directionId` und den Source-Bezug.
- Neue Routen für Create, Read, Screenshot und Confirm; `pnpm route-matrix` muss neu generiert
  werden, sonst ist der Route-Matrix-Test rot.
- Neue MCP-Tools `create_redesign_proposal` und `get_redesign_proposal`.
- Produkt-UI: Toolbar-Hinweis und natives Modal in der bestehenden Canvas-Ansicht.
- **Offen:** atomare Redesign-Transaktion, Sektions-/Asset-Mapping pro Direction Card, Design-Record
  als Objekt am Review/Release, Proposal-TTL und Aufräumen abgebrochener Proposals.
