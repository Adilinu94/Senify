# 12: Programm-Shell & Projektverwaltung

**What to build:** Das lokale Programm: `senify start` startet Engine + öffnet den Browser (Health-Check mit klarem Fehlerbild). Globale Tabs **Projekte · Referenzen · Einstellungen**; Projekt-Arbeitsbereich mit Kopf-Leiste **Seiten · Artikel · Vorlagen · Prüfen · Aktivität · Projekt-Einstellungen**. Projekte-Tab: Karten-Grid (Thumbnail, Statuspunkt, letzte Änderung), Neu (nur Name), Öffnen → Editor, Duplizieren (mit Inhalten / nur Struktur & Design), Umbenennen, Papierkorb (wiederherstellen/endgültig). Review-Ansicht im Projekt (aus 07: Screenshot-Slider, Struktur-Diff, Aktionen). Aktivitätsliste pro Projekt (Audit: wer/was/wann, Agent/Mensch + Token). Globale Einstellungen: Agenten-Zugänge (Tokens/MCP-Clients), E-Mail (SMTP + Testmail), Speicher & Sicherung (Backup-Status, Restore-Anleitung), Standardwerte (Profil, Layout, Autostart). Cmd+K global.

**Blocked by:** 02 (Site & Pages + Mutations), 06 (MCP-Kern & Agent-Setup), 07 (Lifecycle, Review & Checks).

**Status:** umgesetzt (Scoped-Verify grün: Lint/Build + 21 neue Tests; der repo-weite `pnpm verify` ist aktuell durch parallelen Editor-WIP blockiert, nicht durch dieses Ticket)

- [x] `senify start` startet Engine und öffnet das Dashboard; ist die Engine nicht erreichbar, liefert der Proxy einen klaren Hinweis mit „senify start“-Aktion
- [~] Projekt anlegen (nur Name) → Karte erscheint; Öffnen landet im Arbeitsbereich (Seiten-Liste + Read-only-Aufbau; der visuelle Editor folgt mit T13); Duplizieren (mit/ohne Inhalte) erzeugt vollständiges Projekt (Medien nur referenziert)
- [x] Papierkorb: löschen → wiederherstellen → endgültig löschen (nur mit Bestätigung)
- [x] Kopf-Leiste navigiert zu Seiten/Artikel/Vorlagen/Prüfen/Aktivität/Einstellungen; Aktivität listet Audit-Ereignisse mit Quelle (Agent/Mensch, Token-Name)
- [~] Review-Ansicht: Struktur-Diff/Details + Approve/Request changes/Discard aus der UI; Screenshot-Slider folgt mit den Screenshots (offener Punkt aus T07)
- [~] Einstellungen: Token anlegen/widerrufen (letzte Nutzung) wirkt; SMTP-Testmail/Backup-Status/Standard-Niveau folgen mit Hosting-/Profil-Ticket
- [x] Cmd+K findet Projekte/Seiten/Aktionen; Plattform-UI nutzt das Theme-System

Quellen: `artifacts/27`, `artifacts/06` (Review-Ansicht), `artifacts/04` (Audit), Spec „Shell, Start & Betrieb".

## Comments

**16.09.2026 — Umsetzung (App-Shell + Start).**
- **Engine-Seite** (Umbenennen `PATCH /api/sites/:id`, Papierkorb `POST /api/sites/:id/trash|restore` + `GET /api/sites?trash=1`, Duplizieren `POST /api/sites/:id/duplicate`, `site_trash`-Tabelle, Site-Events im Audit) lag bereits im Commit `aa33fad` (T10 Teil 1) — mit 13 Engine-Tests in `sites.test.ts`.
- **`@senify/app`:** Dashboard-Server (`createAppServer`: statische Shell, `/theme.css` aus dem Plattform-Theme, `/api`-Proxy mit injiziertem Operator-Token — kein Token im Browser, keine CORS-Frage) und Start-Orchestrierung (`startProgram`: Postgres/Engine/Dashboard, Browser öffnen, sauberes Herunterfahren). Das Operator-Token wird einmalig als „Programm“ angelegt und unter `~/.senify/program-token.json` wiederverwendet (self-healing bei Revoke).
- **Dashboard (vanilla SPA):** globale Tabs Projekte/Referenzen/Einstellungen, Projekt-Karten mit Statuspunkt und Aktionen (Öffnen/Umbenennen/Duplizieren/Papierkorb), Papierkorb-Ansicht mit Wiederherstellen/endgültig löschen, Arbeitsbereich mit Kopf-Leiste (Seiten, Artikel, Vorlagen, Prüfen, Aktivität, Einstellungen), Seiten-Outline, Review-Liste mit Detail und Aktionen, Aktivitätsliste (Mutation → deutsche Labels), Token-Verwaltung, Cmd+K-Palette (Projekte/Seiten/Aktionen), Theme-Tokens als Stylesheet.
- **Artikel-Workspace:** Sammlungs-Auswahl, Entry-Liste, generierter Feld-Editor (Kontrollen je Feldtyp, JSON-Fallback für komplexe Typen), Speichern mit `baseVersion`-Konfliktschutz (409 → neu laden), „Veröffentlichen“ (Speichern + Publish).
- **CLI:** `senify start` verdrahtet Engine/DB/Dashboard inkl. `--engine-port`/`--app-port`/`--no-open`; `resolveDatabaseUrl` liest `SENIFY_DATABASE_URL`/`DATABASE_URL` oder `~/.senify/config.json`.
- **Fixes:** `@senify/mcp/tools`-Subpath (+ Paket-Export/tsconfig-Pfad) und exakte Vite-Aliase im Docs-Portal — der Portal-Build zog über den mcp-Index die CLI samt App/Engine/Renderer-Kette herein.
- **Tests:** App-Server-E2E über den Proxy (Dashboard, Theme, API-Durchleitung, Projekt-Lebenszyklus), Engine-Sites (Rename/Trash/Restore/Duplikat), CLI unverändert grün.