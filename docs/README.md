# Dokumentation

## Rollen

| Dokument | Verbindlich für |
|---|---|
| `CONTEXT.md` | Fachsprache und Domäneninvarianten |
| `docs/fahrplan.md` | **priorisierte Reihenfolge der offenen Arbeit, Gates, Definition of Ready/Done, Risiko-Register** |
| `docs/current/stand.md` | aktueller Umsetzungsstand (Code- und Testbelege) |
| `docs/current/architektur.md` | aktuelle Seams, Datenflüsse, Transaktionsverhalten, Risiko-Katalog |
| `docs/current/qualitaet.md` | letzter verifizierter Test- und Gate-Stand (einzige Stelle für Testzahlen) |
| `docs/adr/` | angenommene Architekturentscheidungen |
| `docs/umbauplan.md` | **abgelöst** durch `docs/fahrplan.md` (Planungsstand 24.09.2026, historisch) |
| `docs/verbesserungsplan.md`, `docs/analyse-2026-09-23.md`, `HANDOFF.md`, `RESEARCH.md`, `.scratch/` | historische Recherche, Übergaben, Arbeitsmaterial |

## Vorrang

Bei Widersprüchen gilt:

1. Ausführbarer Code und Tests beschreiben das aktuelle Verhalten.
2. Angenommene ADRs beschreiben verbindliche Entscheidungen.
3. `docs/fahrplan.md` beschreibt die priorisierte Reihenfolge der offenen Arbeit.
4. `docs/current/stand.md` beschreibt den belegten Umsetzungsstand.
5. `docs/current/qualitaet.md` enthält die gültigen Messzahlen.
6. Historische Dokumente (`docs/umbauplan.md`, `docs/verbesserungsplan.md`, `HANDOFF.md`, `RESEARCH.md`, `.scratch/`) erklären Vergangenheit, nicht den aktuellen Stand.

## Regeln

- Test- und Routenzahlen werden nicht in mehrere Current-Dokumente kopiert; sie stehen ausschließlich in `docs/current/qualitaet.md`.
- Jede Aussage `umgesetzt` oder `belegt` nennt einen Code- oder Testpfad.
- Status wird als `belegt`, `implementiert`, `teilweise`, `geplant`, `bewusst vertagt` oder `ungeprüft` angegeben.
- ADR-Nummern werden nie nachträglich für ein anderes Thema wiederverwendet. `ADR-0011` ist reserviert (EditorDocument als kanonisches Modell) und darf nicht anderweitig vergeben werden.
- `.scratch/` ist Arbeitsmaterial und Research-Speicher, keine automatisch gültige Produktwahrheit.
- Historische Dokumente werden nicht gelöscht, sondern eindeutig datiert und als historisch markiert.
- **Wer `docs/umbauplan.md` zitiert, zitiert einen Planungsstand vom 24.09.2026.** Einige seiner Ist-Behauptungen (Token-Routen `public`, fehlendes Optimistic Locking in der Style-Registry) sind am Code überholt. Für Ist-Aussagen gilt `docs/current/stand.md`.

## Fortlaufende Begleitung

`docs/fahrplan.md` ist das begleitende Dokument: Priorität → Schritt → Ready → Umsetzung → Gate → Done.
Es wird pro abgeschlossenem Schritt fortgeschrieben; der Abschnitt „Arbeitsstand dieses Dokuments" protokolliert jede Änderung. Risiko-Nummern `R1`–`R13` sind über `fahrplan.md`, `stand.md` und `architektur.md` identisch.
