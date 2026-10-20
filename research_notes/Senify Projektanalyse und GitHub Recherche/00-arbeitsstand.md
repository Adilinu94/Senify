# Arbeitsstand der Projektanalyse

> **Stand 20.10.2026:** Die Untersuchung ist abgeschlossen und die daraus folgende Umsetzung
> ist erfolgt (siehe `reports/senify-projektanalyse-2026-10.md`, Abschnitt 6.1, und den
> Abschnitt „Umsetzung“ in jeder Fachanalyse). Der Rahmen unten beschreibt die
> **Analysephase**; er ist seitdem nicht mehr die Arbeitsgrundlage, sondern der Nachweis, worauf
> die Befunde beruhen. Die Umsetzung entstand danach auf dem Branch
> `claude/projektanalyse-umsetzung-2026-10-20` (PR #71, gemergt als `5258f34`), aufgebaut auf
> `origin/master` und mit den Upstream-Ständen dazwischen (PRs #57, #63–#69). Diese PRs haben
> **keine** der genannten Fundstellen berührt; wo sie dieselben Dateien anfassten
> (`docs/current/stand.md`, `docs/fahrplan.md`, `vitest.config.ts`, `packages/renderer/src/bake.ts`),
> wurden beide Seiten zusammengeführt.

## Ziel und Rahmen

Senify über alle Pakete und zentralen End-to-End-Pfade untersuchen; konkrete Befunde, bestehende
Grenzen und Verbesserungen getrennt bewerten. Geeignete öffentliche GitHub-Repositories nach
Nutzen, Lizenz, Wartung und Integrationsaufwand vergleichen. Keine Implementierung, kein Pull,
Commit oder Push.

**Basis:** `master`, Stand 19.10.2026, Commit `5ac1a84` (Merge PR #55). Der lokale Branch ist
synchron zu `origin/master`. Der Stand wurde **während** der Untersuchung von `19c8ee0` auf
`5ac1a84` aktualisiert; beide Stände wurden geprüft — die vier neuen Commits betreffen
`packages/framer-import`, `packages/widget-engine/src/breakpoints.ts`,
`packages/renderer/src/{bake,style-css,motion}.ts`, `packages/engine/src/import-preview.ts` und
`packages/editor/src/canvas/*`, aber **keine** der in den Fachanalysen genannten Fundstellen.
Die Analyse gilt ausschließlich für den lokalen Stand.

**Umgebung:** Windows, Node 24.15.0, Repository auf `G:`, `%TEMP%` auf `C:`.

## Definition of Ready dieser Untersuchung

- Zieldateien: `research_notes/Senify Projektanalyse und GitHub Recherche/` und `reports/`;
  Anwendungscode bleibt unverändert.
- Bestehender Arbeitsbaum: ungetrackt `.tmp/`, `.bake-tmp/` — **nicht angefasst**. Die
  Clean-Tree-Bedingung für Implementierungsschritte ist damit **nicht erfüllt**; diese
  Untersuchung startet deshalb keinen Umsetzungsschritt.
- Verbindliche Domäne/Entscheidungen: `CONTEXT.md`, `docs/adr/`; Prioritäten: `docs/fahrplan.md`.
- Vorherige Gate-Läufe aus aktuellen Dokumenten sind historische Belege, keine Messung dieser
  Untersuchung.

## Belegregister

1. Ausgangsstatus mit `git status --short --branch` geprüft; keine getrackten Änderungen.
2. `pnpm typecheck`, `pnpm lint` und `git diff --check` liefen im ersten Sitzungsteil ohne
   gemeldete Fehler. **In dieser Fortsetzung nicht wiederholt.**
3. `vitest.config.ts:61–72` misst `http.ts`, `store.ts`, `lifecycle.ts`, `forms.ts`,
   `editor/src/state/**` und `mcp/src/tools.ts` — **nicht** die 34 ausgelagerten Fachmodule mit
   zusammen 7 344 Zeilen. Die betroffenen Module haben eigene Tests; es fehlt die Messung, nicht
   die Prüfung.
4. `scripts/render-manifest.mjs:188–193`: `--stamp` schreibt nur `coverage/measured-at.txt` und
   beendet sich. **`pnpm test:coverage` verändert die getrackte Qualitätsdokumentation nicht**;
   erst `quality:render` tut das. Die frühere Annahme ist korrigiert.
5. **Volltest (1), 19.10.2026, `%TEMP%` auf `C:`:** 40 Dateien rot / 111 Tests rot / 2318
   bestanden / 29 übersprungen, 483,91 s. Ursache aller Fehlschläge: `EXDEV: cross-device link
   not permitted` beim Astro-Build (`packages/renderer/src/bake.ts:796`), weil das Stage-Verzeichnis
   im Workspace liegt (Zeile 744) und das Ziel im Temp-Verzeichnis.
6. **Gegenprobe**, dieselbe Datei mit `%TEMP%` auf `G:`: grün, 2 Tests, 48,93 s. Damit ist der
   erste Lauf als Umgebungs-, nicht als Codebefund belegt.
7. **Volltest (2), 19.10.2026, `%TEMP%` auf `G:`:** 4 Dateien rot / 268 grün / 3 übersprungen
   (275), 732,87 s. Die vier roten Dateien sind **alle** unter Last und **keine** Funktionsfehler:
   ein Lade-Timeout beim Modul-Import (`mcp/test/write-output.test.ts`), ein
   Playwright-Matcher-Timeout (`app/test/release-cutover-browser.test.ts` — im Repo als bekannter
   Flake dokumentiert) und zwei `Test timed out in 90000ms` in Review-Tests mit Bake
   (`engine/test/design-record.test.ts`, `engine/test/lifecycle.test.ts`). Der Bake ist die
   gemeinsame Ursache: Im grünen Lauf brauchen die Nachbarn 12,3 / 15,3 / 23,8 s, unter Last
   überschreiten sie 90 s.
8. Sechs Autosave-Gegenproben ausgeführt (`autosave-probe.mts`, Node 24.15.0): fünf
   Fehlerkategorien bestätigt, eine als latent eingestuft.
9. GitHub-API-Abfrage für 21 Repositories (Lizenz, Sterne, letzter Push, offene Issues, letzte
   Version) und Klartext-Lizenzlesung der drei MCP-Repositories.

## Befundübersicht

| Fachanalyse | Befunde | Schwere |
|---|---|---|
| 1 — Autosave / Editor | A (Transport-Rejection, latent), B (Änderung während Request), C (verbrauchter Debounce), D (`setNodeHiddenDevices`), E (Registry-Konflikt) | 3 × hoch, 1 × mittel, 1 × mittel (latent) |
| 2 — Netzwerkgrenze | Browser-Pfad ungeschützt (ADR-0016-Annahme deckt nur das Dashboard) | offen — Entscheidung bei Adi |
| 3 — Build / Betrieb | B1 Bake blockiert Event-Loop, B2 `EXDEV`, B3 Lease, B4 Deploy-Frist, B5 Restore-Grenze, B6 `.tmp/` | 2 × hoch, 4 × niedrig |
| 4 — MCP / Manifest | kein Drift-Tor für das Manifest; Skills ohne Werkzeugbezug | hoch / mittel |
| 5 — Qualität / CI | Coverage misst 7 344 Zeilen nicht; kein Dependency-/Secret-Scan; Browser-Suiten überspringen still | hoch / mittel |

## Offen

- **Entscheidung nötig (ADR-0016-Reichweite):** Gilt die Annahme, dass der Browser interne
  Dienste erreichen darf, auch für Dienste außerhalb des Dashboards?
- Nicht ausgeführt: `pnpm build`, `pnpm test:coverage`, `pnpm test:visual`, `pnpm verify:parity`,
  `pnpm verify:import`, `pnpm test:postgres`, `pnpm quality:render`/`check`, `pnpm manifest:render`,
  `pnpm route-matrix`, `pnpm verify:dist`.
- Nicht ausgeführt: ein Referenzlauf gegen eine echte Fremdseite, ein Bildgenerierungs-Job, ein
  Release-Bake, ein Deploy gegen Netlify/Vercel, ein Live-Aufruf eines MCP-Werkzeugs.

## Nächster Schritt

Der Bericht liegt in `reports/senify-projektanalyse-2026-10.md`. Die Maßnahmen 1–9 (Abschnitt 6)
brauchen keine neue Abhängigkeit und je ein Gate aus `docs/fahrplan.md`. **Kein Schritt ist
gestartet** — die Umsetzung braucht die DoR des Fahrplans (sauberer Arbeitsbaum; `.tmp/` und
`.bake-tmp/` stehen dem entgegen und sollten vorher in `.gitignore` aufgenommen werden).

## Verzeichnisinhalt

| Datei | Inhalt |
|---|---|
| `00-arbeitsstand.md` | dieser Stand |
| `01-autosave-editor.md` | Fachanalyse 1 — Autosave-Pipeline und Editor-Zustand |
| `02-netzwerkgrenze.md` | Fachanalyse 2 — Node-Pfad, Browser-Pfad, ADR-0016 |
| `03-build-betrieb.md` | Fachanalyse 3 — Build, Betrieb, Jobs, Backup |
| `04-mcp-dokumentation.md` | Fachanalyse 4 — MCP-Vertrag, Manifest, Dokumentation |
| `05-qualitaet-ci.md` | Fachanalyse 5 — Qualität, Coverage-Tor, CI |
| `06-github-repositories.md` | Fachanalyse 6 — 21 Kandidaten, Nutzen, Urteil |
| `autosave-probe.mts` | die sechs ausgeführten Gegenproben (Review-Sonde, kein Regressionstest) |
