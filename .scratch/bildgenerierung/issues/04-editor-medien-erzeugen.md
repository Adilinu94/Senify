# Bildgenerierung 04 — Editor: Erzeugen im Medien-Fenster (S4)

Status: ready-for-agent
Quelle: `.scratch/bildgenerierung/spec.md` (Scheibe S4).
Blocked by: 02
Hinweis: Das Medien-Fenster (Spotlight-Aktion `open-media`) hat noch keinen Handler. Falls es zum
Start dieses Tickets nicht existiert: zuerst Handler + Fenster bauen (eigene kleine Scheibe), dann
den Erzeugen-Bereich ergänzen. Der Erzeugen-Bereich nutzt ausschließlich die S2-Routen.

## Kontext

Der Operator soll Bilder ohne Agent erzeugen können — im Medien-Fenster des Editors, mit demselben
Job-Modell und derselben Asset-Pipeline wie der Agent.

## Aufgabe

1. Medien-Fenster: Bereich „Erzeugen" mit Prompt, Größe (Breite/Höhe, Default 1024²), optional
   Referenz-Auswahl (`referenceId`), Alt-Text, Tags, Ordner.
2. Absenden → `POST /api/sites/:siteId/images/jobs`; Job-Karte mit Status
   (queued/running/succeeded/failed) und genutztem Provider (`providerUsed`) per Polling; nach
   Erfolg erscheint das Asset in der Liste und ist einsetzbar.
3. Cancel (`DELETE`) für `queued`-Jobs; lesbare Fehlerzustände (Provider off, ComfyUI offline,
   OOM → Hinweis auf kleinere Auflösung).
4. Health-Hinweis im Dialog, wenn der Provider nicht konfiguriert ist (Verweis auf Einstellungen).

## Akzeptanz

- Ein im Editor erzeugtes Bild erscheint nach Erfolg in der Bibliothek und ist in einer Sektion
  einsetzbar.
- Cancel funktioniert für `queued`; Fehler sind lesbar und actionable.
- `pnpm verify` grün (inkl. Browser-Test nach vorhandenem Editor-Testmuster).

## Referenzen

- `.scratch/bildgenerierung/spec.md` (User Stories 8–11, S4)
- `packages/editor/src/spotlight.ts` (`open-media`), `packages/editor/src/panels.ts`,
  `packages/app/src/start.ts`
