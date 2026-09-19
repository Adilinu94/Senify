# ADR-0004: Senify ist Postgres-only bis Phase 5

Status: Angenommen, 17.09.2026
Bezug: editor-v2-rebuild, Ticket 15 `B6), Entscheidung O12 in `.scratch/editor-v2-rebuild/map.md`

## Entscheidung

Senify bleibt **Postgres-only** bis mindestens Phase 5 des editor-v2-rebuild. Der Editor-Umbau
`Tickets 07–18) baut keine SQLite-/Dialekt-Ebene. Der Ausstieg zu einem Dual-Dialect-Modell
bleibt offen und wird durch drei Regeln günstig gehalten:

1. **Neue Repositories halten SQL ANSI-nah.** Verboten außerhalb von `packages/engine/src/db.ts`:
   `::`-Casts, `now()` in DML, `any($N::...)`, `distinct on`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
   (das ist Schema-Layer, gehört nach db.ts).
2. **JSON-Behandlung nur über die db.ts-Helfer.** Die abgeleiteten Funktionen
   (`jsonColumns()`, `tableNames()`) bleiben die einzige Quelle für JSON-Spalten-Semantik;
   Repositories handhaben keine jsonb-Konvertierung selbst.
3. **Ein grep-Gate-Test setzt die Regel durch** (wie Instatics `db-postgres-isms`-Gate): scannt
   `packages/engine/src/**/*.ts` auf die verbotenen Muster außerhalb von `db.ts` und schlägt in
   `pnpm test` an.

## Kontext

- `packages/engine/src/db.ts` ist faktisch PG-only: `jsonb`, `timestamptz`,
  `ADD COLUMN IF NOT EXISTS`, Kommentar „there is no migration tooling in v1".
- Die editor-v2-Arbeit legt weitere persistente Formate an (`sites.style_rules_json` liegt
  uncommittet im Arbeitsbaum, **nicht in HEAD**; Revisions-/Release-Formate folgen) — jede
  zusätzliche Tabelle verteuert einen späteren
  Dialektwechsel stillschweigend, wenn keine Regel existiert.
- Der Nutzerentscheid vom 17.09. lautet bewusst PG-only (Option A des Tickets 15) — Senifys
  Produktversprechen ist die agent-native Plattform, nicht „läuft auf jedem Shared-Host"
  `das ist Instatics Terrain: dual dialect mit Paritäts-Gates).

## Verworfene Alternativen

- **Dual dialect ab jetzt `Option B):** Migrationen je Dialekt mit identischen IDs, jsonb→json-
  Konvention, SQLite-Adapter. Aufwand in Wochen, kein aktuelles Produktbedürfnis `Senify v1
  läuft auf Postgres via Docker/eigener Instanz), und der Editor-Umbau hat denselben kritischen
  Pfad wie die Versionierung — Doppelarbeit ohne Dringlichkeit.
- **Nicht entscheiden `Option C):** Jede neue Tabelle hätte die Ausstiegskosten weiter erhöht,
  ohne dass jemand die Entscheidung getroffen hätte — der Zustand, den dieser ADR beendet.

## Folgen

- Editor-Umbau und Ticket 02 `Style-Rule-Registry) bauen ohne Dialekt-Layer — Zeit geht in die
  Kaskade, die Inspektor-Qualität und die Bridge.
- Für den Fall eines späteren Wechsels `Phase 5+): Die drei Regeln oben halten den
  Migrationsaufwand auf „Adapter + Dialekt-Migrationen", nicht auf „Rewrite aller Queries".
- SQLite ist kein Produktversprechen von Senify; sollte sich das ändern, ersetzt ein neuer ADR
  diesen hier `nicht: stillschweigender Umbau).
