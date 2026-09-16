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

## Tests

```bash
pnpm verify
```

Zusätzlich die zwei Tests, die echtes Postgres brauchen (Wegwerf-Schema, wird danach aufgeräumt):

```powershell
$env:TEST_DATABASE_URL = "postgres://senify:senify@127.0.0.1:5433/senify"
pnpm vitest run packages/engine/test/transactions.test.ts
```
