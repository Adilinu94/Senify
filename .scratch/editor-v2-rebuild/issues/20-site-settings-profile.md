# Editor v2 - Site-Profil im Editor (Kanal + Anzeige)

Status: **umgesetzt** (18.09.) - Profil-Kanal, Anzeige, Wechsel-Validierung und Profil-Gates stehen.
Herkunft: F6/F7 aus Ticket 19 (`.scratch/motion-v2/plan.md` §8), v1-Ticket 21 (`artifacts/21-profile.md`)
Abhaengig von: 07 (Dokument-Modell), 13 (Save-Pipeline), 19 (Motion M3/M5)

## Ziel

Das Site-Profil (`clean` · `standard` · `showcase`) erreicht den v2-Editor: es ist sichtbar,
aenderbar (validiert), und die Motion-Oberflaeche kennt Intensity-Cap und Preset-Klassen.
Damit ist die Voraussetzung fuer M3 (Inspektor-Hinweise) und M5 (Publish-Gates) erfuellt.

## Entscheidungen (F6/F7, 18.09.)

- **F6:** Die v1-Tabelle gilt 1:1 (Caps 3/7/10, Lenis aus/an/an, Pin 0/1/1, 3D nein/nein/ja;
  3D bleibt M6).
- **F7:** Durchsetzung gestaffelt - M2 nutzt das Profil im Bake (Lenis), M3 zeigt den Cap,
  M5 blockt Verstoesse hart, der Editor validiert Profil-Wechsel vorab.

## Umsetzung

**Engine:**
- `UpdateSiteBodySchema` (`site-contract.ts`): `PATCH /api/sites/:siteId` traegt `name`
  und/oder `profile`; ein leerer Update wird abgelehnt.
- `Store.updateSiteProfile` mit derselben Validierung wie `createSite`; Audit-Events
  `rename_site` / `update_site_profile`.
- `SITE_PROFILES`/`SiteProfile` kommen jetzt aus `@senify/section-sdk` (eine Definition).

**Geteilte Regeln:**
- `section-sdk/src/motion.ts`: `MOTION_PROFILES`, `MOTION_PROFILE_RULES` (aus der
  Preset-Registry abgeleitet), `motionProfileViolations` mit Codes
  `profile-intensity-cap` / `profile-preset` / `profile-pin` / `profile-3d`.
  Ein nicht erlaubtes Preset meldet die Klasse, nicht zusaetzlich den Cap.

**Editor:**
- `EditorOptions.site` + `onSiteProfile`; Topbar-Select mit Cap-Hinweis; der Wechsel wird
  gegen das Dokument validiert und bei Verstoessen mit Liste abgelehnt (nichts still).
- `profileIssues(document, profile)` in `consistency.ts` (Wechsel-/Publish-Gate, kein
  Schreib-Gate - ein Downgrade friert keine fremden Edits ein).
- Motion-Panel zeigt `Profil · Intensitaet ≤ Cap`, sperrt Presets ausserhalb des Profils
  und begrenzt den Dial (`max`).
- App: `pageView` laedt `GET /api/sites/:siteId`, reicht das Profil hinein und schickt den
  PATCH ueber `onSiteProfile`.

**Gates (M5):**
- `hardGuardrailsForTree(tree, profile)` prueft zusaetzlich die Profil-Regeln; der
  Schreibpfad (`applyMutationsToPage`) und `runChecks` (Submit/Publish) lesen das Profil.
  Ohne Profil bleibt die generische Pin-Regel; mit Profil ist die Profil-Meldung das Gate.
- Weiche Hinweise: `reveal-too-long` im Bake (Reveals > 0,8 s), `char-split-excess` wie
  bisher; LCP-Schutz ist strukturell (Pending-Failsafe, noscript).

**Tests:** Engine-Route (Profil-Update, Audit, unbekanntes Profil, leerer Update),
section-sdk (Regeln + Violations), Editor-Consistency (profileIssues), Panels (Cap/Profile),
Engine-Guardrails (Profil-Gate + runChecks), Browser (Profil-Select in der Topbar).

**Zahlen:** `pnpm test` 1155 gruen / 2 uebersprungen / 130 Dateien, typecheck 0, lint 0.
Kein Commit.

## Nicht-Ziele

- Kein Site-Settings-Panel (Inspektor-Tab) - das Profil sitzt vorerst in der Topbar.
- Keine Profil-Historie/Undo (Site-Ebene, wie Style-Rules site-weit).
- Kein 3D (M6).
