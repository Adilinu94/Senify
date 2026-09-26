# Direction Card mit Sektions-Plan und Medienbedarf als Handoff

Status: accepted · 25.09.2026
Bezug: ADR-0001 (JSON-first, Registry ist Gesetz), ADR-0012 (persistente Redesign Proposals, Karte als Angebot),
`CONTEXT.md` (Direction Card, Sektions-Plan, Medienbedarf), `packages/engine/src/redesign-proposals.ts`.

Die Direction Card aus ADR-0012 beschreibt Referenzbild, Theme, Regeln und Warnungen. Sie sagt einem
Menschen aber noch nicht, **welche Sections** der eigenen Seite die Richtung betrifft, welche registrierten
Zieltypen und Varianten dafür gelten, wie die Slot-Struktur aussieht und welche Medien dafür gebraucht
werden. Der Agent bekommt damit nach dem menschlichen Confirm nur ein Theme und ein Scaffold, aber keinen
verbindlichen Bauauftrag für `apply_mutations`.

**Entscheidung.** Die Direction Card erhält einen **serverseitig abgeleiteten, unveränderlichen und
validierten Sektions-Plan mit Medienbedarf**. Er ist ein vollständiger Handoff, und die menschliche
Bestätigung wendet ihn in dieser Scheibe **noch nicht** automatisch an.

1. **Der Plan ist Systemangebot, kein Agenten-JSON.** `create_redesign_proposal` nimmt weiterhin nur
   `pageId`, `referenceIds` und `idempotencyKey`. Plan, Zieltypen und Medienbedarf leitet der Server aus
   dem vollständigen Source-`NodeTree`, der aktiven Registry und dem Referenzprofil ab — dieselbe
   Haltung wie ADR-0001 („Registry ist Gesetz") und ADR-0012 („nur die Entscheidung kommt vom Menschen").
   Ein Agent kann weder Mapping noch Asset-Zuordnung einspeisen.
2. **Grundlage ist der vollständige Baum, nicht die Kurz-Outline.** `RedesignPackage.source.outline`
   kürzt Text auf 600 Zeichen, verliert Arrays, Assets, Slots, Overrides und Motion und ist als Planbasis
   unbrauchbar. Der Plan entsteht aus dem kompletten Draft.
3. **Konservativ statt clever.** Registrierte, nicht deprecated Typen bleiben erhalten; eine bestehende
   gültige Variante bleibt, sonst greift die Golden-Variante, sonst die erste registrierte Variante.
   Unbekannte, strukturelle, Component- und deprecated Types werden sichtbar `manual`. Es gibt **keine**
   heuristische Cross-Type-Konvertierung nach Kategorie oder ähnlichem Titel — geratenes Layout ist
   schlimmer als sichtbare Handarbeit.
4. **Inhalte bleiben, Design erbt.** Der Plan ändert in dieser Scheibe keine Inhalts-Props. Er hält fest,
   welche Inhalts- und Style-Prop-Schlüssel eine Section hat, und dass das Design über das bestätigte
   Theme erbt. Content bleibt die Entscheidung des Kunden.
5. **Varianten-Presets werden vollständig materialisiert.** `updateNodeMeta` setzt nur die Variante und
   mischt das Preset **nicht** nachträglich (`mutations/apply.ts`). Der Plan trägt deshalb das komplette
   Preset der Zielvariante, damit ein späterer Executor nicht halb umschaltet.
6. **Slots sind explizite Endbestände.** `hero.visual` und `collection-list.item` werden mit erlaubten
   Typen und `max` geplant. Eine Section ohne Slot-Plan gilt als unvollständig.
7. **Referenzmedien werden nie zu Ziel-Assets.** Quell-Site-Assets mit eigener Site, Status `ready` und
   bekanntem Hash sind Wiederverwendungskandidaten. Logos und identitätsgefährdende Medien der Referenz
   erhalten `avoid`; andere Referenzmedien sind höchstens Stilbeleg. Es gibt beim Proposal-Erzeugen
   keinen Download, keinen Upload und keinen Bildjob — Medienbedarf ist eine spätere Arbeitsanweisung.
8. **Der Plan wird vor dem Speichern bewiesen.** Er wird gegen eine Kopie des Source-Drafts geprüft:
   eindeutige IDs, keine Zyklen, Registry-Typen und -Varianten, `allowedChildren`, Slot-Regeln, Prop-
   Schemata. `hardGuardrailsForTree()` darf keine **neuen** Verstöße erzeugen; bestehende werden
   gewarnt, nicht stillschweigend repariert. Ohne diesen Beweis wird keine Card gespeichert.
9. **Der Content-Hash wird ehrlich.** `offerHash` ist ein Inhalts-Hash: ohne zufällige `directionId` und
   ohne den abgeleiteten `screenshot.fileName`, dafür mit `screenshot.hash`, Sektions-Plan und
   Medienbedarf. Zwei Proposals für dieselbe Seite und Referenz liefern denselben Hash. Vor dem Confirm
   wird die gespeicherte Card gegen den neu berechneten Hash geprüft; eine manipulierte Card ergibt 409
   ohne Entscheidung.
10. **Freshness pinnt, was der Plan nicht selbst mitbringt.** Source-Tree-Hash, Site-Profil,
    Design-Contract, Mapping-Version und die Hashes der **verwendeten** Sections. Eine geänderte, nicht
    verwendete Section macht ein Proposal nicht stale. `stale` bleibt berechnet und blockiert ohne
    Auto-Rebase.
11. **Confirm bleibt ehrlich begrenzt.** `applyResult` erhält `scope: "scaffold-theme"` und
    `sectionPlanApplied: false`. Die Bestätigung erzeugt Draft-Site, bestätigtes Theme und Scaffold —
    genau das. Sie behauptet nicht, die Section-Zuordnung sei geschrieben. Ein späterer atomarer Executor
    übernimmt den unveränderten Plan; bis dahin arbeitet der Agent damit über die kanonischen Mutationen.
12. **Keine neue Oberfläche.** Der Plan erscheint im bestehenden Richtungsdialog und über
    `get_redesign_proposal`. Kein Tab, kein Workspace, keine neue Route, kein MCP-Confirm.

**Betrachtete Optionen:**

- *Plan beim Confirm automatisch ausführen* — verworfen: `applyRedesign()` läuft in mehreren Schritten
  ohne Gesamttransaktion, kopiert keine Assets, umgeht Guardrails und Design-DNA und würde einen
  halb angewandten Stand hinter einem grünen `applied` verstecken. Der Plan wird stattdessen
  bewiesen und übergeben; die Ausführung bekommt eine eigene, atomare Scheibe.
- *Plan nur als lesbarer Hinweistext ohne Struktur* — verworfen: ein Prosatext kann nicht validiert,
  nicht gehasht und nicht als Basis eines späteren Writes benutzt werden.
- *Mapping als freies Agenten-JSON* — verworfen: der Agent würde Zieltypen, Varianten und Assets erfinden
  und als Systemaussage ausgeben.
- *Nur Theme-Mapping* — verworfen: genau die Richtung, die ADR-0012 mit der menschlichen Karte schließen
  wollte; ohne Section-Zuordnung bleibt die Karte eine Absichtserklärung.
- *Cross-Type-Mapping über Ähnlichkeit* — verworfen: erzeugt Layout, das niemand bestätigt hat, und
  verletzt die Registry als Gesetz.
- *Registry-Hash über Titel und Beschreibungen* — verworfen: ein Tippfehler im Katalogeintrag würde jedes
  Proposal ohne sachlichen Grund invalidieren.
- *Plan im Audit-Log statt in der Card* — verworfen: das Audit ist Verlauf, nicht Angebot; die Karte ist
  die Einheit, die ein Mensch bestätigt.

**Konsequenzen:**

- `CONTEXT.md` führt Sektions-Plan und Medienbedarf als Fachbegriffe.
- Neu `packages/engine/src/redesign-section-plan.ts`; additive Felder in der Proposal-Basis und im
  Apply-Ergebnis. Keine neue Tabelle, keine neue Route.
- `DirectionCard.sectionPlan` wird Teil von `offerHash` und read-only ausgeliefert.
- `applyResult.scope` und `sectionPlanApplied` verhindern eine falsche Erfolgsaussage in Proposal, MCP
  und Dialog.
- Neue Tests: Planableitung, Slots, Varianten-Preset, Medienbedarf, Registry-Drift, Hash-Stabilität,
  Hash-Manipulation, Backup/Restore, Browser- und A11y-Nachweis.
- **Offen:** atomarer Section-Executor mit Gesamttransaktion, Asset-Kopien in die Ziel-Site,
  Design-Record an Review/Release, Aufräumen abgebrochener Proposals.
