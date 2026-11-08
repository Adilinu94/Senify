# Sicherung des G-Arbeitsbaums – Abschluss 08.11.2026

> Historischer Beleg, keine aktuelle Truth-Quelle. Aktueller Stand: `docs/current/stand.md`.

Die Sicherung `C:\Users\adini\projects\Senify-Sicherung-G-20261105` – eine Momentaufnahme des
früheren Arbeitsbaums `G:\AI Agentur\Senify` vom 05.11.2026 – wurde am 08.11.2026 vollständig
gelöscht. Das Original unter `G:` blieb unberührt.

## Vor der Löschung geprüft

- `senify-g-alle-refs.bundle`: `git bundle verify` bestätigte eine vollständige Historie; alle
  41 Refs samt Commits lagen bereits im Hauptrepo `C:\Users\adini\projects\Senify`.
- `arbeitskopie` (25 362 Dateien): enthielt keine Datei, die nicht in Commit `0dbbf6b`
  (`sicherung/g-offene-punkte-2026-10-30`) steht.
- `git-original` (211 MB): Die Commit-Objekte liegen im Hauptrepo; die Reflogs dieser Kopie sind
  mit der Löschung entfallen.
- `worktrees/senify-doku-r`, `senify-runde2`, `vitest4-counterproof`: reine Dateilöschungen ohne
  Code-Zugabe (A=0, M=0; 187 / 347 / 1244 Löschungen), teils von heute noch benötigten Dateien
  (`AGENTS.md`, `CONTEXT.md`, `docs/adr/*`). Experimentierreste, nicht anwendungswürdig.
- `worktrees/senify-vitest4`: enthielt Arbeit zum Mehrbreiten-Capture vom 27.10.2026
  (`mergeDeviceVariants`, `DEVICE_WIDTHS`, `readDeviceMarkup`, `test/device-steps.test.ts`).
  Nachprüfung am 08.11.2026: Diese Arbeit ist **nicht** verworfen. Sie liegt committet im
  Sicherungs-Ref `0dbbf6b` und auf `integration/c-auf-g`
  (`packages/framer-import/src/import.ts`, `src/capture-browser.ts`,
  `test/device-steps.test.ts`, `test/device-variants.test.ts`); die drei erstgenannten
  Dateien sind zwischen beiden Ständen byte-identisch. Auf `wip/c-history-2026-11-06`
  fehlen sie lediglich, weil dieser Branch vor den betreffenden G-Commits abzweigt.
  Ein darüber hinausgehender uncommitteter Anteil des gelöschten Worktrees lässt sich
  nach der Löschung nicht mehr rekonstruieren; belegt ist nur der committete Stand.

## Was bleibt

Die Branchhistorie liegt im Hauptrepo unter `sicherung/g-offene-punkte-2026-10-30` (`0dbbf6b`)
und `sicherung/g-geraete-sichtbarkeit` (`6e6e0be`).
