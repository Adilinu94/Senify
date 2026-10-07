# Senify

Senify ist ein lokales Programm, das Websites baut. Ein Agent (Claude Code, Cursor, opencode) redet über MCP mit der Engine, im Browser gibt es die Arbeitsfläche mit Editor, Referenzen und Einstellungen.

## Was du brauchst

- Node.js 24 oder neuer und pnpm
- Eine Postgres-Datenbank (lokal installiert oder über Docker)

## Starten

1. Abhängigkeiten installieren:

   ```bash
   pnpm install
   ```

2. Datenbank bekannt machen. Eine der beiden Varianten:

   - Docker: `docker compose up -d` (Postgres auf Port 5433), dann die URL in `~/.senify/config.json` eintragen:

     ```json
     { "databaseUrl": "postgres://senify:senify@127.0.0.1:5433/senify" }
     ```

   - Eigene Postgres-Installation: URL ebenfalls als `databaseUrl` in `~/.senify/config.json` eintragen oder als Umgebungsvariable `SENIFY_DATABASE_URL` setzen.

3. Programm starten:

   ```bash
   pnpm start
   ```

   Die Ausgabe nennt das Dashboard, standardmäßig `http://localhost:4322`. Mit `--engine-port`, `--app-port` und `--no-open` lässt sich das ändern.

4. Beenden mit `Strg+C` im Terminal. Engine und Dashboard laufen in einem Prozess, die Datenbank bleibt bestehen.

## Ausprobieren

- Projekt anlegen (nur Name), Karte erscheint, Projekt öffnen.
- Seite öffnen, dann lädt das Dashboard den visuellen Editor nach (Design- und Live-Modus, drei Breakpoints, Panels, Undo/Redo).
- Referenzen-Tab: URL analysieren lassen. Echte Aufnahmen brauchen Chromium (`npx playwright install chromium`), sonst greift der Snapshot-Fallback.
- Einstellungen: E-Mail (SMTP-Testmail), Sicherung (Backup anlegen und ansehen), Standardwerte (Niveau, Layout, Autostart).
- Agenten anbinden:

  ```bash
  pnpm senify setup
  ```

  Der Agent-Token läuft nach 90 Tagen ab (`--expires 30d` ändert das, `--expires never` hebt es auf); danach genügt ein erneutes `setup`.

## Tests

```bash
pnpm verify
```

## Dokumentation

- Fachmodell: [`CONTEXT.md`](CONTEXT.md)
- Dokumentationseinstieg und Vorrangregeln: [`docs/README.md`](docs/README.md)
- **Offene Arbeit, priorisiert und mit Gates: [`docs/fahrplan.md`](docs/fahrplan.md)**
- Aktueller Stand: [`docs/current/stand.md`](docs/current/stand.md)
- Aktuelle Architektur: [`docs/current/architektur.md`](docs/current/architektur.md)
- Test- und Gate-Stand: [`docs/current/qualitaet.md`](docs/current/qualitaet.md)
- Entscheidungen: [`docs/adr/`](docs/adr/)
- Historische Übergaben und abgelöste Pläne: [`docs/history/`](docs/history/) — `HANDOFF.md`, `umbauplan.md`, `verbesserungsplan.md`, `analyse-2026-09-23.md`, `RESEARCH.md`

## Tests

Das Paritäts-Tor (Canvas vs. ausgeliefertes Release) läuft als eigener
blockierender Schritt und verlangt einen installierten Chromium:

```bash
pnpm exec playwright install chromium
pnpm verify:parity
```

In CI läuft beides nacheinander (`.github/workflows/verify.yml`); fehlt der
Browser, wird das Tor rot statt still übersprungen.

Zusätzlich die zwei Tests, die echtes Postgres brauchen (Wegwerf-Schema, wird danach aufgeräumt):

```powershell
$env:TEST_DATABASE_URL = "postgres://senify:senify@127.0.0.1:5433/senify"
pnpm vitest run packages/engine/test/transactions.test.ts
```
