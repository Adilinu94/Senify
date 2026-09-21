# Editor v2 - Releases-Cutover vor Phase 4 (B11)

Status: **erledigt (20.09.)** — Publish über die Route, O9-Vorhang, Paritäts-Tor gegen das Release, Rollback belegt
Abhaengig von: 13-bridge-style-rules (Klassen persistieren), sonst keine harte Abhängigkeit
Muss liegen: Ende von Phase 2 bzw. Anfang Phase 3 — VOR Ticket 04 (VCs/Cutover)
Herkunft: `.scratch/editor-v2-rebuild/research/02-bauplan-aenderungen.md`, B11

## Ziel

Der Durchstich publiziert über `bakeSite` direkt und nicht über `POST /api/releases`
(ledger.md, Offen: „fällt mit dem Cutover in Phase 4"). Zwei Cutover-Arten — Persistenz und
Vokabular — in einer Phase zu bündeln, nimmt sich die Debug-Fähigkeit. Der Releases-Cutover
ist klein (der Pfad existiert vollständig: releases, active_releases, page_revisions im
Schema; publish_release/rollback_release als MCP-Tools), macht den Editor-Publish über die
echte Route testbar (Guardrails, Audit, Revisions, Rollback) und entkoppelt Ticket 04 vom
Persistenz-Risiko.

## Umfang

1. Editor-Publish-Button (Canvas-Ansicht) ruft `POST /api/releases` statt `bakeSite` direkt:
   alle Pages der Site als Revisionen einfrieren, Theme-Snapshot, Release anlegen,
   active_releases setzen — genau der bestehende MCP-`publish_release`-Pfad.
2. Der Durchstich-Test (`widget-slice-browser.test.ts`) wird auf die Route umgestellt:
   Canvas bauen -> über die API veröffentlichen -> Release ausliefern -> Paritäts-Messung
   gegen das Release. Das Paritäts-Tor prüft damit ab sofort den ECHTEN Publish-Pfad,
   nicht den Bake-Umweg.
3. O9-Anbindung (automatische Browser-Prüfung vor dem Veröffentlichen, map.md):
   die Prüfung läuft als Pflicht-Vorhang vor dem Release-Anlegen (keine 404, CSS/Skripte
   da, Bilder geladen, kein waagerechter Overflow, Heading-Ordnung, mobil geprüft) —
   Erstumsetzung minimal, Ausbau in Phase 5.
4. Rollback-Nachweis: `rollback_release` über die API erzeugt ein neues Release auf Basis
   `basis_release_id` (bestehende Semantik) und der Editor zeigt den zurückgerollten Stand.
5. Das Paritäts-Tor als CI-Blocker: der Test gehört in `pnpm verify`-Pfad und bricht den
   Build bei Verhältnis > Toleranz (O3-Zahlen bleiben: 0,01 Verhältnis, Gegenprobe).
   **(erledigt 21.09.: `pnpm verify:parity` + `.github/workflows/verify.yml`, Browser
   Pflicht — fehlt er, wird das Tor rot statt übersprungen)**

## Abnahme

- Publish im Editor erzeugt Release + Revisionen + active_releases; Audit-Eintrag mit
  Akteur; ohne bestandene O9-Prüfung wird kein Release angelegt.
- Paritäts-Tor läuft gegen das Release (nicht gegen bakeSite direkt) und ist Teil von
  `pnpm verify`.
- Rollback über die API kehrt den sichtbaren Stand nachweisbar um.
- `pnpm test`, `pnpm typecheck`, `pnpm lint` gruen.

## Ergebnis 20.09. (umgesetzt)

**O9-Vorhang (`engine/src/release-checks.ts`):** läuft auf dem echten Bake — lokale Verweise
müssen auf Dateien des Builds zeigen, ein Stylesheet muss verlinkt sein, die
Heading-Ordnung darf keine Stufe überspringen. „Keine Überschrift" und „Start unter h1"
sind **soft**: nur die Hero-Sektion rendert ein h1, ein harter Start-Check hätte alle
validen Seiten ohne Hero blockiert (Fund über `forms`/`submissions`). Der Browser-Ausbau
(Overflow, mobil, echtes Netzwerk) bleibt bewusst Phase 5.

**Publish-Pfad (`lifecycle.ts`):** Preflight-Bake ins Temp-Verzeichnis → Checks → erst
danach Revisionen, Release und Aktivierung (ein `rename`, kein zweiter Bake). Ein
gescheiterter Check wirft, es entsteht kein Release; der Rollback stellt Theme und Drafts
vor dem Bake zurück. Der Editor-Publish-Button (`[data-action="canvas-publish"]`) ruft die
echte Route.

**Zwei echte Funde:** (1) `variant` fehlte im v2-`EditorNode` — Canvas und Release hätten
Varianten unterschiedlich gerendert (jetzt durch alle Schichten gereicht). (2) Releases
lieferten **keine Schriften** aus (das Theme verlinkte Font-Familien ohne Dateien) —
`renderer/assets/fonts/*.woff2` + `files`-Maps im Default-Theme, Font-Kopie im Bake und die
App-Route liefern sie jetzt; erst damit ist die Parität echt.

**Paritäts-Tor:** `packages/app/test/release-cutover-browser.test.ts` publiziert über
`POST /api/sites/:siteId/releases` und misst gegen das ausgelieferte Release: Kopf-Diff 0,
Sektion 0,00088 (Toleranz 0,01), dazu Revisionen, aktives Release, zweiter Publish und
Rollback (`basisReleaseId`). Der Test läuft in `pnpm test` und damit in `pnpm verify`.
`widget-slice-browser.test.ts` bleibt auf `bakeSite`: Katalog-Primitives sind über die
v1-Bridge nicht speicherbar (E2-Strangler), der Route-Pfad ist mit registrierten Sektionen
belegt.

**Tests:** `release-checks.test.ts` (9) + `release-cutover-browser.test.ts`; Gesamtlauf
siehe Ledger, Welle 1 Teil 4.
