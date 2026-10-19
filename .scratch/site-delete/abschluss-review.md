# Abschlussprüfung PR #38

Stand: 16.10.2026. Scope: permanente Site-Löschung; keine Änderungen an anderen Produkt-Branches oder Backup-Worktrees.

## Definition of Ready

Der bekannte Folge-Diff wird im eigenen Worktree abgeschlossen. Betroffene Schnittstellen: `Store.deleteSite`, HTTP `DELETE /api/sites/:siteId`, `removeSiteFiles`, Schema-Liste und PostgreSQL-Lane. Die bestehenden Löschtests belegen den Ausgangsfehler; PostgreSQL ergänzt den zuvor fehlenden Rollback-Beweis. Vor weiteren Produktänderungen wird dieser Diff fachlich gesichert.

## Review-Runde 1

Angewendete Linsen: Vollständigkeit, Einzeloperationen, Kategorien, Ressourcen, HTTP-Vertrag, Windows/Linux, Fehler, Zustände, Bedienung, Konfiguration, Sicherheit, Datenzugriff, Testqualität und interne Konsistenz.

- **HIGH, behoben:** Indirekte Asset-Zeilen und Redesign Proposals müssen vor ihren Parents bereinigt werden. `packages/engine/src/store.ts`, `deleteSite`; Regressionen in `packages/engine/test/site-delete.test.ts`, inklusive gelöschter Quellseite und fremder Site.
- **HIGH, behoben:** Normalisierte Pfade können trotz direktem Parent fremde Ordner treffen (`../reviews/keep`, `unused/../keep`, Windows-Backslash). `packages/engine/src/storage.ts`, `removeSiteFiles`; gezielte Gegenprobe in `site-delete.test.ts` vor dem Fix rot, danach grün. Entity-IDs enthalten nur das Alphabet aus `ids.ts`.
- **MEDIUM, behoben:** Ein unfertiges Release ohne `build_ref` kann bereits Dateien besitzen. `Store.deleteSite` liefert auch dafür eine ID-basierte Dateireferenz; `site-delete.test.ts` prüft den partiellen Build.
- **MEDIUM, behoben:** Der neue Kaskaden-Test nannte irrtümlich `site_themes`; das Schema definiert `themes`. `site-delete.test.ts` prüft nun die vorhandene Tabelle und den Erhalt der fremden Site.
- **MEDIUM, geschlossen:** pg-mem beweist keinen Rollback. `packages/engine/test/site-delete-transaction.test.ts` löst nach den Kaskaden und expliziten Löschungen einen echten SQL-Fehler aus und vergleicht anschließend alle Schema-Tabellen sowie Dateien und Preview. `scripts/verify-postgres.mjs` führt diese Datei verpflichtend aus.

## Review-Runde 2

Dieselben Linsen erneut am korrigierten Diff: keine weiteren Befunde im vereinbarten Scope. Alle `deleteSite`-Aufrufer nutzen `fileRefs`; direkte Site-Tabellen werden gegen das Schema verglichen. Asset-History, Varianten, Blurhash, Reviews und Proposals sind berücksichtigt. Fehlende Site bleibt 404; eine fremde Site und ihre Dateien bleiben erhalten. Typecheck, Lint, Patch-Prüfung und gezielte Tests grün; die erweiterten PostgreSQL-Fälle wurden gegen einen isolierten Cluster ausgeführt. Das Gesamt-Gate, Coverage und abschließende PR-CI bleiben Merge-Bedingungen; Messwerte stehen nur in `docs/current/qualitaet.md`.

## Bewusste Grenzen

- DB-Commit und Dateibereinigung sind keine gemeinsame Transaktion. Ein Dateisystemfehler nach Commit kann Dateien hinterlassen; es wird kein Rollback der bereits committed Daten behauptet.
- Beschädigte gespeicherte Build-Pfade werden nicht verfolgt. Sicherheit vor fremden Löschungen hat Vorrang vor dem Entfernen unbekannter Dateien.
- Globale Referenzen, gespeicherte Backups und externe Deployments gehören nicht zu den lokalen, Site-eigenen Artefakten dieses PRs.
- Der Site-Lock serialisiert konkurrierende Site-Löschungen, ersetzt aber keinen systemweiten Lock-Vertrag für jeden laufenden Worker.
