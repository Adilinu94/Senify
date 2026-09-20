# Referenzen 02 - Dokument-Reiter im Detailfenster

Status: **erledigt (20.09.)** - Reiter, Renderer und Umschalter stehen; Browser-Test grün
Abhaengig von: 01-framer-import (die Dokumente müssen am Datensatz stehen)
Herkunft: `.scratch/referenzen/spec.md`, Entscheidung 2

## Ziel

Der Referenzen-Tab soll je Referenz das Vorschaubild **und** das zugehörige `design.md` zeigen. Die 679 importierten Referenzen bringen drei Dokumente mit; ohne Anzeige bliebe der Import unsichtbar. Das Fenster soll dabei wie das Vorbild (taste-vault) wirken: ruhig, ein Bild, eine Spalte, wenig Chrom.

## Umfang

1. **Reiter im Detailfenster** (`.refs-doc-tabs`): Übersicht · Design.md · Guidelines · Komponenten. Reiter erscheinen nur, wenn das Dokument vorhanden ist; die Übersicht bleibt immer da (Sammlung, Name, Familie, Idee, Vokabular, Komposition, Bildrezept, Brief-Knöpfe, Extras). Je Dokument ein Knopf „Dokument kopieren" (nutzt den bestehenden Kopier-Fallback).
2. **Markdown-Renderer** (`refsRenderMarkdown` in `app.js`): Überschriften, Absätze, Tabellen, Listen, Blockzitate, Code, fett/kursiv/inline-Code und Links. Erst maskieren, dann auszeichnen; kein rohes HTML aus den Dokumenten. Tabellen sind Pflicht: die Design.md sind tabellenlastig.
3. **Live-Link** in der Übersicht (`sourceUrl` der Referenz, neue Registerkarte).
4. **Bildumschalter** in der Bildbühne: Desktop/Mobil, nur wenn mehrere Aufnahmen vorliegen.
5. **Kartenliste in Blöcken** (48 Karten, Nachladen am Wächter) und **Bilder erst auf Sicht** (IntersectionObserver mit 320 px Vorlauf): 679 Karten mit je zwei Aufnahmen wären sonst ~170 MB beim Öffnen. Die Zählung im Fenster („Referenz x von n") folgt der vollen Auswahl, nicht nur den gezeichneten Karten.
6. **Stile** in `app.css` (Reiter, Dokumentkörper, Umschalter, Wächter) aus den vorhandenen `--refs-*`-Werten.

## Abnahme

- Detailfenster einer importierten Referenz zeigt vier Reiter; das Design.md rendert seine Tabellen; „Dokument kopieren" legt den Text auch ohne Zwischenablage in den Fallback-Dialog.
- Der Mobil-Knopf wechselt das Bild und wieder zurück.
- Eine Referenz ohne Dokumente zeigt keine Dokument-Reiter und keinen Umschalter (das Verhalten der Taste-Vault-Referenzen bleibt unverändert).
- Der bestehende Bibliothekstest (Rail, Karten, Vergleich, Stil-Guide, Adresse) bleibt grün.

## Belege

- Browser-Test `packages/app/test/references-browser.test.ts`: zweiter Block „reference documents in the program" (Reiter, Tabelle, Kopieren, Umschalter, Referenz ohne Dokumente).
- Bestehender Block „reference library in the program (T14)" unverändert grün.
