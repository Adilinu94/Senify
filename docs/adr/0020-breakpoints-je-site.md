# Breakpoints je Site einstellbar

Status: accepted · 16.10.2026 (von Adi bestätigt: Geltung „Ganze Website“, Grenzen „Mit Schutzgrenzen“, Einbau unter der Bedingung, dass der Framer-Import dadurch besser läuft; die Bedingung ist gemessen, siehe unten)
Bezug: offener Punkt „Breakpoints pro Site“ aus `docs/current/stand.md`, Entwurf vom 14.10.2026.

**Problem.** Senify kannte genau zwei Schwellen, `tablet: 1024` und `mobile: 640`. Ein Kundendesign, das bei 900 oder
768 Pixeln umbricht, ließ sich nur annähern. Beim Framer-Import wog das schwerer: Framer-Seiten brechen bei 1200
oder 810 um, der Import musste die Bereiche der Quelle auf die Senify-Zahlen quetschen. Zwischen 1024 und 1199 px
zeigte das Original das Tablet-Layout, der Import das Desktop-Layout.

**Entscheidung.**

1. `Site.breakpoints` ist optional und trägt ein Paar `{ tablet, mobile }` in ganzen Pixeln. Ohne Eintrag gelten
   weiter `BREAKPOINTS = { tablet: 1024, mobile: 640 }`; bestehende Projekte bauen byte-gleich wie vorher. Die
   Zahlen stehen als Standard weiter genau einmal in `packages/widget-engine/src/breakpoints.ts`.
2. Das Paar gilt für die ganze Website, nicht je Seite. Gemeinsame Sektionen (Navigation, Footer) müssen bei jeder
   Breite stimmen; Seiten, die an verschiedenen Stellen umbrechen, würden das Problem nur verschieben.
3. Schutzgrenzen (`BREAKPOINT_LIMITS`, geprüft von `checkBreakpoints`): Tablet 641–1600 px, Mobile 320–900 px,
   mindestens 120 px Abstand. Ganze Zahlen. Die Grenzen sind eine Bremse gegen Tippfehler, keine Designregel.
   **Abweichung von der Vorlage:** Der Entwurf nannte Tablet ≤ 1439 und Mobile ≤ 767. Framers übliche Breiten
   (810 Tablet, 1200 oder 1440 Desktop) wären damit nicht abbildbar gewesen, und genau dafür ist die Funktion
   da. Die Obergrenzen sind deshalb auf 1600 und 900 geweitet; Mindestabstand und Untergrenzen blieben.
4. Die Media-Queries heißen `@media (max-width: <Schwelle − 0,02>px)`. Der Tablet-Override gilt darunter und
   kaskadiert nach unten in Mobile. Die Overrides am Knoten behalten die festen Schlüssel `overrides.tablet` und
   `overrides.mobile`: Wer die Schwelle verschiebt, ändert, ab wann ein Override greift, nicht was in ihm steht.
   Es gibt keine Datenmigration der Knoten.
5. Alles, was eine Media-Query schreibt, nimmt das Paar als Option und fällt auf den Standard zurück
   (`resolveBreakpoints`): Compiler (`widget-engine/css`), Bake, Stilregeln, Motion-Daten und die versteckten
   Geräte (`packages/renderer`). Preview, Release und Export laufen über denselben Bake und lesen das Paar aus
   der Site (`packages/engine/src/bake.ts`).
6. Der Editor leitet die Blattbreiten aus dem Paar ab (`designFramesFor`, `packages/editor/src/frames.ts`):
   Desktop `max(1440, Tablet)`, Tablet `min(max(1024, Mobile), Tablet − 1)`, Mobile `min(390, Mobile − 1)`. Die
   Blätter sind echte iframes, ihre Media-Queries antworten auf die Blattbreite. **Sichtbare Folge:** Mit dem
   Standardpaar ist das Tablet-Blatt 1023 statt 1024 px breit. Bei 1024 px liegt die Seite genau auf der
   Schwelle und zeigte das Desktop-Layout; das Tablet-Blatt zeigte also bisher nicht das, was sein Name sagt.
   Das war ein Fehler und ist damit behoben.
7. Gesetzt wird das Paar im Dashboard unter Projekt-Einstellungen („Breakpoints“, mit Zurücksetzen auf den
   Standard) und über `PATCH /api/sites/:siteId` mit `{ "breakpoints": { "tablet": …, "mobile": … } }`; `null`
   löscht es. Die Änderung steht in der Projekt-Aktivität (`update_site_breakpoints`). Agenten lesen es in
   `get_site`; ändern ist Sache des Betreibers (wie bei ADR-0018). Fehler kommen im Dashboard auf Deutsch.
8. Datenbank: neue Spalte `sites.breakpoints_json jsonb`, nullable und additiv (`ADD COLUMN IF NOT EXISTS`, wie
   `sites.base_url` in ADR-0018). Ein ungültiger gespeicherter Wert liest sich als „kein Eintrag“, der Bau
   bricht deshalb nicht ab. `duplicate_site` kopiert das Paar mit.
9. Eine Änderung der Schwellen macht die gebackenen Seiten der Site ungültig; sie werden neu gebacken. Eine
   veröffentlichte Seite ändert sich erst mit dem nächsten Release.

**Framer-Import.**

- `siteBreakpointsOf` (`packages/framer-import/src/site-breakpoints.ts`) liest die Bereiche aus
  `__framer__breakpoints`: Die Untergrenzen sind die Schwellen, eine Obergrenze plus 0,02 ebenfalls. Mobile ist
  die kleinste, Tablet die zweitkleinste Grenze. Besteht das Paar `checkBreakpoints` nicht, gibt es keines
  (`null`), und der Import verhält sich wie vorher.
- Der Plan (`planImportBreakpoints`, `packages/engine/src/site-breakpoints.ts`) setzt das Paar **nur** auf einer
  Site ohne eigenes Paar und ohne weitere Seiten (`set`). Es wird in derselben Transaktion geschrieben wie der
  übrige Import-Commit (`commitFramerImportPlan`, Audit-Eintrag `update_site_breakpoints` mit
  `source: "framer-import"`). Ist das Paar gleich dem der Site oder dem Standard, bleibt alles (`unchanged`).
  Sonst bleibt das Paar der Site, und der Bericht trägt einen Warnhinweis (`kept`, Grund `site-pair` oder
  `other-pages`): Ein Import darf die Darstellung vorhandener Seiten nicht still verändern. Ein Replay setzt das
  Paar nie erneut.
- Preview und Commit entscheiden mit demselben Plan. Die Vorschau backt mit dem Paar, das der Commit setzen
  würde.

**Belegt (Bedingung „Import läuft besser“).** Gemessen mit `import-fixture-gate-browser.test.ts` (Pixelabstand
gegen die Original-Aufnahme, Standardpaar gegen Paar der Site), 16.10.2026 auf dem Stand mit der neuen
Selektor-Engine des Imports (`master` `7f85d8b`; auf dem Stand davor lagen die Zahlen höher, die Richtung war
dieselbe):

| Fixture (Paar der Site) | bei 1024 px | bei 1200 px | bei 720 px |
|---|---|---|---|
| easier-train (1440 / 810) | 24,1 % → 12,1 % | 29,8 → 15,4 | 27,9 → 28,0 |
| fluffy-rectangle (1200 / 810) | 56,8 % → 29,5 % | 12,2 → 12,2 | 42,3 → 39,2 |
| stupendous-football (1200 / 810) | 43,6 % → 16,4 % | 15,0 → 15,0 | 48,9 → 33,5 |

Bei 1024 und 1200 px wird kein Wert schlechter, bei 720 px liegt easier-train mit +0,1 Punkten im Rauschen.
Wo beide Paare dasselbe Layout wählen (1200 px bei fluffy-rectangle und stupendous-football: beide Desktop),
bleibt das Bild gleich. Der Gate behält seine Messung bei 900 px mit den alten Obergrenzen und
bekommt eine zweite bei 1024 px mit eigener Ratsche (`DIFF_CEILING_PLATFORM_TABLET`).

**Folgen und Grenzen.**

- **Registry-Sektionen folgen dem Paar nicht.** Ihre Raster brechen bei festen Breiten (zum Beispiel
  `GRID_IMAGE_SECTIONS` bei 640 und 768 px in `packages/registry/src/components/shared.tsx`), und
  `PRIMITIVE_BASE_CSS` ist geräteunabhängig. Auf einer Site mit eigenem Paar bleibt das Verhalten dieser
  Sektionen also bei den festen Breiten; nur Overrides und Sichtbarkeit am Knoten folgen dem Paar. Wer das
  ändern will, braucht eine eigene Entscheidung (Sektion liest das Paar aus dem Theme oder wechselt auf
  Container-Queries).
- Die Gates prüfen das Produkt, nicht eine Site: `VISUAL_VIEWPORTS` (Tablet 1024) im `analysis-worker`,
  `REVIEW_VISUAL_BREAKPOINTS` und die Visual-Baselines bleiben bei den Standardmaßen. Dass ihr Tablet bei 1024
  auf der Schwelle liegt (derselbe Randfall wie beim alten Editor-Blatt), ist ein Befund für später, kein Teil
  dieser Änderung.
- Das Laufzeit-Skript im Browser (`browser-entry.ts`) liest keine festen Breiten; Motion-Daten tragen das Paar
  seit dieser Änderung mit.
- Die 12 Editor-Visual-Baselines können durch das 1023-px-Tablet-Blatt abweichen; sie werden nur dann
  aktualisiert, wenn der Gate es verlangt.

**Verworfen.**

- Eine freie Liste benannter Breakpoints (mehr als drei Geräte). Die Overrides tragen feste Schlüssel, das Canvas
  drei feste Blätter; Modell, Compiler, Kaskade und Editor müssten mit.
- Breakpoints je Seite statt je Site (siehe Entscheidung 2).
- Container-Queries statt Media-Queries. Anderer, größerer Weg, eigene Entscheidung.
- Pixelwerte in den Overrides statt Gerätenamen. Das bricht jede bestehende Seite.
- Das Paar beim Import immer überschreiben. Eine bestehende Site mit anderen Seiten würde sich still verändern.

**Offen.** Registry-Sektionen auf das Paar umstellen (siehe Folgen). Die Schwelle der Gates bei 1024 px
(Randfall) prüfen. Ob die Site-Duplikation das Paar kopieren soll, ist entschieden (ja); ob ein Redesign-Apply es
verändern darf, ist nicht vorgesehen.
