# Referenzen 01 - Import der Framer-Sammlung (`Referenzsites/`)

Status: **erledigt (20.09.)** - 679 Referenzen, 41 Sammlungen, 0 Fehler im Volllauf
Abhaengig von: nichts (setzt auf der bestehenden Referenz-Bibliothek T14 auf)
Herkunft: `.scratch/referenzen/spec.md`, Entscheidung 1

## Ziel

Die 684 lokal angelegten Referenz-Ordner (Framer-Marketplace-Auswertung) sollen als Referenzen in der Bibliothek liegen: Kartenbild, Live-Link, Design-Dokumente und ein Profil, aus dem die Theme-Ableitung ohne Live-Analyse arbeiten kann.

## Umfang

1. **Datenmodell:** `Reference.documents` (`design`, `guidelines`, `components`) als eigene, nachrüstbare Spalte; die Liste lädt sie nicht mit (`ReferenceSummary` ohne `documents`).
2. **Verträge:** `POST /api/references/manual` nimmt `sourceUrl`, `documents` und `imageMobile`; `PATCH /api/references/:id` kann `sourceUrl` und `documents` (auch `null`) setzen.
3. **Dokument-Parser (`references-documents.ts`):** liest Farb-, Typo-, Shape-, Elevation-, Motion- und Spacing-Tabellen sowie Do's/Don'ts und Komponenten in ein `ReferenceProfile`; Evidenzstufen (`observed`/`inferred`) aus den Zeilen, unplausible Typo-Zeilen werden verworfen und begründet (Label-Größe rückt nach), nie stillschweigend korrigiert.
4. **Ordnerleser (`references-referenzsites.ts`):** Metadaten aus `info.md` (Name, Kategorie, Subkategorie, Ersteller, Live-Preview, Marktplatz-Link, Beschreibung), beide Screenshots, Dokumente; `planReferenzsites` bildet Sammlungen (Kategorie, größte zuerst) und Einträge.
5. **Import-Skript (`scripts/import-referenzsites.ts`):** `--dry-run`, `--only`, `--limit`, `--pause`, `--cleanup`; wiederholbar über den Namen; Zusammenfassung als JSON, Exit 1 bei Fehlern oder unvollständigen Ordnern.
6. **Verdrahtung:** `createManualReference` speichert `sourceUrl`, beide Snapshots (Desktop, Mobil) und legt aus den Dokumenten eine Profil-Revision an (`note: "Aus Design.md gelesen"`).
7. **Repo-Hygiene:** `Referenzsites/` in `.gitignore` (250 MB fremde Screenshots gehören ins Datenverzeichnis, nicht ins Repo).

## Abnahme

- `--dry-run` meldet 679 Referenzen und 41 Kategorien; der Echtlauf legt sie an, ohne Fehler.
- Ein zweiter Lauf legt nichts neu an, sondern aktualisiert (Sammlungen und Referenzen).
- Eine importierte Referenz hat beide Snapshots, alle vorhandenen Dokumente und ein Profil (`revision > 0`).
- Ein Upload ohne Dokumente bleibt wie bisher ohne Profil.
- 8 Ordner der Sammlung sind unvollständig und werden mit Grund übersprungen (6 nur mit Screenshots, `aeye` ohne design.md, `tools/` sind die Generator-Skripte); sie ändern den Exit-Code nicht, stehen aber im Bericht.

## Belege

- Volllauf gegen eine temporäre Instanz (pg-mem, `--pause 5`): 679 Referenzen, 41 Sammlungen, 0 Fehler in 117 s; zweiter Lauf 0 neu/679 aktualisiert; 8 unvollständige Ordner gemeldet.
- Alle 679 Referenzen tragen eine Quell-URL und ein Profil (`withSource`/`withProfile` je 679).
- Tests: `references-documents.test.ts`, `references-referenzsites.test.ts` (inkl. Kategorie-Split), `references-library.test.ts` (Import-Fall).
- Stichproben: `Achilles` (9 Farb-Tokens, 5 Typo-Stufen, 3 Radien, Design.md 4160 Zeichen, Guidelines 2393, Komponenten 2975), `Alta®` (4 Typo-Stufen), `David Sinclair` (3 Typo-Stufen); überall Snapshots `manual` und `mobile`.
