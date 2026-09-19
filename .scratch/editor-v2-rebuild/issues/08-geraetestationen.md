# Editor v2 - Drei Gerätestationen festlegen (B2)

Status: **erledigt (O10, 17.09.; Abnahme am 18.09. nachgeprueft)**

**Abnahme-Nachtrag 18.09.:** Punkt 4 („keine Planstelle nimmt noch acht Stationen an") war bei
der ersten Pruefung **verletzt**: `ui-plan.md` Z116 sagte „Gerät (acht Stationen als Segment 32px)".
Korrigiert auf „drei Stationen". `ui-plan.md` Z464 ist kein Verstoss (verneint den Pfad ausdruecklich:
„Kein Acht-Stationen-Pfad."). `ui-elementor.md` Z247-250 nennt sieben Symbole, ist aber die
**Elementor-Referenzbeschreibung** und jetzt ausdruecklich als solche markiert („Hinweis (O10):
Senify kennt bewusst drei Stationen"). Suche nach `acht Stationen|iconsMap|widescreen|tablet_extra`
liefert keine offene Stelle mehr.
Abhaengig von: nichts (Entscheidung + Plan-Anpassung, kein Code)
Muss liegen: VOR Ticket 02 Punkt 4 (Breakpoint-Override-UX) und VOR jeder UI am Geräte-Segment
(ui-plan 5.12/5.13)
Herkunft: `.scratch/editor-v2-rebuild/research/02-bauplan-aenderungen.md`, B2

## Ziel

Den Widerspruch zwischen ui-plan.md Abschnitt 5.13 (acht Stationen aus Elementors `iconsMap`,
„bei knapper Breite auf drei gekürzt") und dem Datenmodell auflösen. `DeviceSchema`
(editor-contract.ts) und `DEVICE_BREAKPOINTS` (cascade.ts: tablet 1024, mobile 640) kennen
genau `desktop / tablet / mobile`. Acht Stationen ohne Modell wären acht `@media`-Stufen,
achte Override-Kombinationen pro Wert und eine Migration alter Seiten — Aufwand, der in keiner
Schätzung von map.md steht.

## Entscheidung (getroffen, 17.09. — O10 in map.md)

**Drei Token-Stationen (desktop / tablet / mobile) plus freie Breitenanzeige.**

- Die drei Stationen sind die einzigen Stellen, an denen Overrides gespeichert werden.
- Die freie Breite (Frame-Label mit px-Feld, wie ui-plan 5.13 es ohnehin unter dem Rahmen
  vorsieht) ist eine **Ansichtssache**: Sie verändert nur die Frame-Breite, schreibt oder löscht
  keinen Stilwert (dieses Verhalten steht bereits richtig im Plan: „ein Gerätewechsel erzeugt
  keinen Verlaufseintrag").
- Fallback-Logik bleibt wie gebaut: `resolveAllForDevice` erbt mobile -> tablet -> desktop.

## Umfang

1. ui-plan.md 5.13 umschreiben: Segment mit drei Stationen (1440 / 1024 / 390 als
   Beschriftung), freie Breitenanzeige mit px-Feld als eigener Abschnitt, „Breite angepasst"
   als Zustand der Anzeige (nicht der Stationen). **[erledigt: siehe unten]**
2. ui-aufgaben.md Aufgabe 37 entsprechend fassen (drei Stationen, kein Acht-Kürzung-Pfad).
3. map.md Abschnitt „Offene technische Punkte": O10 „Gerätestationen = 3, freie Breite ist
   Ansichtssache" als Entscheidung eintragen (E-Reihe).
4. Prüfen, dass keine Vorschau-/Planstelle noch acht Stationen annimmt
   (Suche nach `iconsMap`, `widescreen`, `tablet_extra` in ui-plan/ui-aufgaben/ui-preview).

## Abnahme

- ui-plan.md 5.13 und ui-aufgaben.md 37 nennen dieselben drei Stationen wie `DeviceSchema`.
- Kein Plan-Dokument referenziert mehr Stationen als das Modell kennt.
- Kein Code geändert; `pnpm test` bleibt gruen (Dokumentationsrunde).
