# 01: Projekt-Fundament

**What to build:** Das baubare Gerüst für Senify v1 — Monorepo (pnpm-Workspaces, TypeScript strict, Lint/Format, Test-Runner), Paket-Landkarte nach Spec (engine · section-sdk/registry · renderer · editor · app · mcp · analysis-worker · docs-portal · skills), das TypeBox-basierte Schema-System als Single Source, ein Registry-Skelett (SectionDefinition + Golden-Feld) und das Test-Gerüst für die drei Prüfstellen (Engine-API als Black-Box, Bake-Artefakte, MCP-Workflows). Am Ende ist eine Beispiel-Sektion registrierbar, validierbar und die Test-Harness für alle drei Prüfstellen läuft.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Monorepo baut, Typecheck + Lint + Tests laufen grün (ein Befehl)
- [ ] Schema-System validiert eine SectionDefinition inkl. Props, Varianten, Slots und Golden-Beispiel (TypeBox als Single Source)
- [ ] Registry-Skelett registriert die Beispiel-Sektion; unbekannte Props/Nesting werden abgelehnt
- [ ] Test-Gerüst existiert für alle 3 Prüfstellen: Engine-API (HTTP-Black-Box), Bake-Output (Artefakt-Assertions), MCP-Workflow (E2E)
- [ ] `senify`-CLI-Skelett zeigt Befehle (`start`, `setup`, `mcp configure`, `tokens`) als Stubs
- [ ] Lokale Postgres-Anbindung startet reproduzierbar (Compose/embedded) und ist im Test-Harness nutzbar

Quellen: `artifacts/01`, `artifacts/08`, Spec „Modul-Landkarte" + „Testing Decisions".

## Comments

- **15.09.2026 · implementiert** (Commit `a0f2645` + Review-Fixes): Monorepo steht, `pnpm verify` grün (24 Tests). Pakete: `core` (Fehler, Test-Infrastruktur), `section-sdk` (Datenmodell, TypeBox-Schema, Registry/Validator), `registry` (Beispiel-Sektion hero), `mcp` (CLI), 7 Stubs.
- **Code-Review (Standards + Spec)** durchgeführt; Fixes: `section-sdk` als eigenes Paket (Landkarten-Konformität), `@senify/core/testing` als separater Export (pg-mem/node:* nicht im Runtime-Graph), `pg-mem`-Dependency korrekt deklariert, `ctas` auf kanonischen `link`-Typ, `MotionSpec` mit `tokens`, Fixture-Sharing, Vitest-Alias aus tsconfig generiert (keine Doppelpflege).
- **Postgres-Praxis (Klärung zum Spec-Punkt „echte Postgres")**: `pg-mem` bleibt der schnelle, Docker-freie Pfad für Unit-/Schema-Tests; die **Prüfstelle-1-Tests der Engine (ab T02)** laufen gegen die echte Compose-Postgres via `TEST_DATABASE_URL` (Wegwerf-Schema). Compose liegt bereit (Port 5433).
- **MCP-Harness** ist bewusst in-process (ToolInvoker); der echte stdio-/Engine-E2E-Pfad entsteht in T06.

## Postgres-Fidelity-Tests starten

Die beiden Transaktions-Tests in `packages/engine/test/transactions.test.ts` (echtes `ROLLBACK` bei Audit-Fehler, atomare Persistenz bei Erfolg) hängen per `describe.skipIf` an `TEST_DATABASE_URL`; ohne die Variable laufen sie gegen `pg-mem` und werden übersprungen. Gegen die echte Postgres (Compose, Port 5433) mit Wegwerf-Schema:

```powershell
$env:TEST_DATABASE_URL = "postgres://senify@127.0.0.1:5433/senify"
pnpm vitest run packages/engine/test/transactions.test.ts
```

`createTestDatabase()` legt dafür ein eigenes Schema an, migriert es vollständig (`ensureSchema`) und entfernt es nach dem Lauf per `DROP SCHEMA ... CASCADE`; `public` bleibt unberührt.
