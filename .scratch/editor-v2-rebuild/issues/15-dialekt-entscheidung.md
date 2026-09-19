# Editor v2 - Dialekt-Entscheidung als O-Punkt `B6)

Status: **erledigt (18.09.)** — PG-only als ADR-0004 entschieden, Gate-Test liegt in
`packages/engine/test/dialect-gate.test.ts` (scannt `engine/src/**/*.ts` auf `::`-Casts,
`now()` in DML, `DISTINCT ON`, `ADD COLUMN IF NOT EXISTS`; `db.ts` ist ausgenommen,
Gegenprobe inklusive). HANDOFF-Falle „DB ist PG-only by decision" steht.
Abhaengig von: nichts `Entscheidungsdokument)
Herkunft: `.scratch/editor-v2-rebuild/research/02-bauplan-aenderungen.md`, B6

## Ziel

`engine/src/db.ts` ist faktisch Postgres-only: `jsonb`, `timestamptz`,
`ALTER TABLE … ADD COLUMN IF NOT EXISTS`, und der Kommentar sagt es explizit:
„there is no migration tooling in v1". Das ist legitim — aber es ist eine
UNGETROFFENE Entscheidung. Der Editor-Umbau legt weitere Tabellen/Spalten
(`sites.style_rules_json` liegt uncommittet im Arbeitsbaum, nicht in HEAD; Revisions-Formate folgen), und jede davon macht einen
späteren Dialektwechsel teurer. Instatic löst denselben Bedarf über dialekt-naive
Repositories + zwei Migrationen mit identischen IDs + Paritäts-Gates; Senify hat bisher
keine Regel, die Repositories von PG-Dialekten fernhält.

## Umfang

1. **ADR — erledigt:** `docs/adr/0004-postgres-only-bis-phase-5.md` `Entscheidung PG-only
   bis Phase 5, mit Ausstiegs-Regel).
2. Die Ausstiegs-Regel in map.md O-Reihe eintragen — **erledigt als O12**; die Regeln stehen
   vollständig im ADR `ANSI-nah, JSON nur über db.ts-Helfer, Gate-Test).
3. **Architektur-Test — offen `einziger Rest):** grep-basiert wie Instatics Gates; scannt
   `packages/engine/src/**/*.ts` auf die PG-isms außerhalb von db.ts und schlägt in
   `pnpm test` an. Klein, isoliert, kein bestehender Code wird angefasst.
4. **HANDOFF.md Fallensammlung — offen:** Eintrag „DB ist PG-only by decision `ADR-0004)".

## Abnahme

- ADR existiert mit Status/Bezug; map.md trägt den O-Punkt.
- Der Architektur-Test läuft in `pnpm test` und ist gruen `bestehender Code bleibt
  unberührt oder wird an den Stellen angepasst, die der Test findet — klein halten).
