# Issue-Tracker: lokales Markdown

Issues und Specs liegen als Markdown-Dateien unter `.scratch/`.

## Konventionen

- Ein Feature pro Verzeichnis: `.scratch/<feature-slug>/`.
- Die Spec liegt unter `.scratch/<feature-slug>/spec.md`.
- Umsetzungstickets liegen einzeln unter `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, fortlaufend ab `01`.
- Triage steht als `Status:` nahe dem Dateianfang.
- Kommentare und Gesprächsverlauf stehen unter `## Comments` am Dateiende.
- `.scratch/` ist Arbeitsmaterial, nicht automatisch der aktuelle Produktstand. Der aktuelle Stand steht in `docs/current/stand.md`.

## Ticket veröffentlichen

Bei einer Anweisung, ein Ticket im lokalen Tracker zu veröffentlichen, wird eine neue Datei unter `.scratch/<feature-slug>/` angelegt. Das Verzeichnis wird bei Bedarf erstellt.

## Ticket abrufen

Die genannte Datei oder Ticktnummer wird gelesen. Fehlt der Pfad, wird kein Inhalt erfunden.

## Wayfinding

- Map: `.scratch/<effort>/map.md`.
- Ein Ticket: `.scratch/<effort>/issues/<NN>-<slug>.md`.
- `Type:` beschreibt `research`, `prototype`, `grilling` oder `task`.
- `Status:` beschreibt mindestens `claimed` und `resolved`.
- `Blocked by: NN, NN` beschreibt Blocker.
- Ein Ticket ist frei, wenn es offen, unblockiert und unbeansprucht ist.
- Beim Start wird `Status: claimed` gesetzt und gespeichert.
- Beim Abschluss wird die Antwort unter `## Answer` eingetragen, `Status: resolved` gesetzt und ein kurzer Kontextpointer in die Map geschrieben.
