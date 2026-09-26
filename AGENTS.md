# Senify

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Arbeitsweise

- Fragen an den Nutzer immer über den interaktiven Frage-Dialog (anklickbare Optionen) stellen — nie als Freitext-Runden.
- Antworten und Artefakte auf Deutsch (Fachbegriffe Englisch).

## Dokumentationsvertrag

- `CONTEXT.md` ist für Fachbegriffe und Domäneninvarianten maßgeblich.
- `docs/adr/` ist für angenommene Entscheidungen maßgeblich.
- `docs/fahrplan.md` ist für die priorisierte Reihenfolge der offenen Arbeit, ihre Gates und das Risiko-Register maßgeblich.
- `docs/current/stand.md` ist für den aktuellen Umsetzungsstand maßgeblich.
- `docs/current/qualitaet.md` ist für aktuelle Test- und Gate-Zahlen maßgeblich.
- `docs/umbauplan.md` ist abgelöst durch `docs/fahrplan.md` und gilt als historischer Planungsstand.
- Historische oder geplante Dokumente werden nicht als aktueller Truth-Stand zitiert.
- Testzahlen nicht manuell in mehrere Dokumente kopieren.
- Jede Aussage `umgesetzt` oder `belegt` braucht einen Code- oder Testbeleg.
- ADR-Nummern werden nicht nachträglich für ein anderes Thema wiederverwendet.
- Jeder Arbeitsschritt startet mit `Definition of Ready` und endet mit einem ausgeführten Gate aus `docs/fahrplan.md`.
