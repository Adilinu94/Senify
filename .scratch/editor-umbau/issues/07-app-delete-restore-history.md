# Gemeinsame Delete/Restore-History in der App

Type: task
Status: resolved
Blocked by: 06

## Definition of Ready

- HEAD `472e18e`; Arbeitsbaum beim Start leer, keine konkurrierende Bearbeitung. Vorangegangener Checkpoint-/Browser-/Doku-Gate grün.
- Scope: echte Delete/Restore-Runner, bestätigte gemischte History samt Cursor und Belegen im Session Storage; Antwortverlust, feste Retry-Basis, Reload und ausdrückliche Recovery. Rename bleibt vor der Tokenmigration separat.
- Betroffene Schnittstellen: App-Variablenpanel, Session-/Pipeline-Bestätigung, geprüfte Checkpoints und Engine-Delete/Restore-API. Scope-Erweiterung aus dem Gegenreview: Klassenlöschbelege im Checkpoint, Inhaltsgleichheit für Klassen-Restore und additive DB-Spalten `resource_hashes`, `request_basis`, `restore_result`; ohne diese Verträge scheitert Klassen-Undo nach vollständig zurückgenommenen Variablenschritten.
- Testlücke: Die echte App entfernt bisher bestätigte Variablenmarker, sodass Toolbar-Undo statt Restore den vorherigen Page-Schritt ausführt. Gemischte Page-/Klassen-/Delete-Schritte und verlorene Undo-/Redo-Antworten nach Reload sind nicht abgenommen.

## Vertrag und Gate

- Delete/Restore verändern keine lokalen Dokumentinhalte. Nur ein exakt bestätigter Theme-/Page-/Registry- und Inhaltsstand erlaubt die Übernahme; neue Eingaben bleiben erhalten.
- Belege sind an History-Eintrag, Richtung und ursprüngliche Request-Basis gebunden. Redo-Delete erstellt pro bestätigtem Zyklus einen neuen Beleg, Retry niemals.
- Bestätigte Checkpoints und Belege werden gemeinsam gespeichert. Pending-Anfragen enthalten eine getrennte saubere Ausgangsmomentaufnahme; sie sind kein Bestätigungsbeweis.
- Reload-Recovery darf History nur nach tatsächlicher Serverbestätigung und vollständigem Inhalts-/Versionsabgleich wieder anbinden. Nicht passende Stände bleiben gesperrt bis zur ausdrücklichen Recovery.
- Alte separate Belege bleiben bedienbar; die entsprechende Aktion wird ein neuer gemeinsamer Schritt. Keine stillschweigende Migration ungeprüfter History.
- Klassen-Restore prüft aktuelle Request-Versionen sowie gleiche Registry-/Page-Versionen oder vollständige rohe Registry-/Page-Inhalte einschließlich Metadaten und Identität. Ausschließlich Regel-`updatedAt` wird beim Inhaltsvergleich ignoriert. Unvollständige Altbelege bleiben versionsgebunden; neue Restore-Retries sind an tatsächlich verwendete Basis und gespeicherte Ergebnisversionen gebunden.
- Gate: echte App-Variablen-/Klassen-/Konflikt-/Canvas-Browser; History-/Checkpoint-/State-/Pipeline-Tests; gezielter Engine-Delete-/Klassen-/Schema-/Backup-Gate einschließlich echter PostgreSQL-Konkurrenz, Migration und Rollback; Typecheck, Lint, Doku-/Patch-Gate und Graphify AST-Update.

## Answer

- Delete/Restore laufen in der echten App über die gemeinsame History; bestätigte Checkpoints, Cursor und Belege werden gemeinsam gespeichert, Pending bleibt bis zum erfolgreichen Checkpoint-Write erhalten und ist kein Bestätigungsbeweis.
- Feste Retry-Basis, neue Redo-Belege, Legacy-Pending-Übernahme, getrennte Altbelege, Checkpoint-only-Recovery und ausdrückliche atomare Recovery sind im Adapter und in echten Browserpfaden abgenommen.
- Klassen-Restore prüft aktuelle Request-Versionen sowie gleiche Versionen oder vollständige rohe Registry-/Page-Inhalte; nur Regel-`updatedAt` bleibt ausgenommen.
- Neu geschlossen: Der Klassen-Browsertest deckte eine Order-Divergenz zwischen lokaler Teilmenge und vollständiger Site-Registry auf. `reconcileStyleRuleOrder` übernimmt die Serverreihenfolge nach Reorder, `reconcileStyleRuleOrderShift` spiegelt Delete/Restore-Verschiebungen; Regressionen sichern beide Pfade.
- Gates: App-/History 268 bestanden in 13 Dateien; Engine-In-Memory 69 bestanden mit 18 erwarteten Skips; Engine-PostgreSQL 87 bestanden ohne Skips; Editor 613 bestanden / 10 erwartete Skips; Typecheck und Lint grün. Messzahlen ausschließlich in `docs/current/qualitaet.md`.
- Offen bleiben Rename-/Tokenmigration, atomare History-Sprünge über mehrere externe Schritte und die Elementor-/Framer-Gesamtabnahme.

## Comments

- History-Sprünge über externe Schritte bleiben bis zum atomaren Mehrschrittvertrag gesperrt.
