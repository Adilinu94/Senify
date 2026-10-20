---
title: Framer-Seite importieren
description: Eine Framer-Seite in Senify übernehmen und im Editor bearbeiten — Dialog, Voreinstellungen, Grenzen und was beim ersten Import zu prüfen ist.
path: /guides/framer-import
group: Guides
order: 12
---

Der Import liest eine veröffentlichte oder exportierte Framer-Seite, baut daraus einen Senify-Seitenentwurf und legt
Bilder und Schriften in der Mediathek ab. Danach bearbeitest du die Seite im Editor wie jede andere.

## Ablauf im Dialog „Framer-Seite importieren“

1. **Quelle und Optionen wählen.** Die Voreinstellung ist jeweils der erste Eintrag der Liste:

   | Feld | Voreinstellung | Alternative |
   |---|---|---|
   | Quelle | Framer-URL | HTML-Datei, Lokaler Mirror (Ordner auf dem Server) |
   | Ziel | Neue Seite | Aktuelle Seite ersetzen (verlangt eine Bestätigung) |
   | Assets | Hochladen | Überspringen |
   | Fonts | Lokal umschreiben | CDN beibehalten |
   | Modus | Originalgetreu | Design-DNA |

2. **Vorschau** zeigt Original und Import nebeneinander je Breakpoint. Sie schreibt nichts. Bilder und Schriften
   können dort fehlen, wenn sie nur online erreichbar sind.
3. **Analysieren** ist ein Probelauf mit Bericht. Er lädt keine Medien und schreibt nichts.
4. **Übernehmen** schreibt die Seite. Bei einer ersetzten Seite nennt der Bericht die Revision mit dem alten
   Entwurf, über die du sie zurückholen kannst.

Mit „Weitere Seiten dieser Site“ bietet der Bericht die Seiten an, auf die die Quelle verlinkt.

## Was der Import mitnimmt

- **Layout und Stil je Gerät.** Framer legt für Desktop, Tablet und Handy eigene Varianten an. Der Import zieht sie zu
  einem Knoten je Element zusammen und übernimmt das Breakpoint-Paar der Quelle (zum Beispiel 1200 und 810 px) als
  Breakpoints der Site (ADR-0020).
- **Medien aus der Quelle.** Beim Schreiben lädt der Import Bilder und Schriften herunter, dedupliziert sie über den
  Hash und legt sie in der Mediathek ab. Schriften werden lokal umgeschrieben, damit nach dem Import keine Anfrage
  an Framers CDN mehr geht. Der Import ersetzt nie von selbst ein Bild durch ein generiertes (ADR-0021).
- **Bewegung.** Scroll- und Erscheinungs-Effekte, die sich messen lassen, werden auf Motion-Presets abgebildet.
  Smooth-Scroll steht im Bericht als Hinweis auf das Site-Profil.
- **Alles, was nicht abbildbar ist, steht im Bericht.** Der Import verwirft nichts stillschweigend: Jede nicht
  übernommene Regel, jedes fehlende Asset und jedes Framer-Code-Stück erscheint als Befund.

## Grenzen

- **Framer-Code und Shader** werden zu einem sichtbaren Platzhalter mit Befund. Echte Übernahme gibt es nicht.
- **Icons über `<use href>`** ohne Sprite erscheinen als Ring, weil Framer das Sprite per Skript einfügt.
- **`<select>`-Felder** zeigen ihre Optionen als Liste.
- **Selektoren.** Nicht ausgewertet werden `:not()` an Vorfahren, Geschwister-Kombinatoren (`+`, `~`), `:first-child`
  und `:nth-*`, `@container` und Attribut-Operatoren außer `=`.
- **Lokale Quellen und Medien.** Der Import liest Medien nie aus dem Mirror-Ordner, er lädt sie über eine Basis-URL
  von der Live-Adresse. Ohne Basis-URL bricht „Assets: Hochladen“ bei relativen Medien-URLs ab (Meldung
  „Relative Asset-URL ohne baseUrl nicht auflösbar“). Der Dialog schickt für „Lokaler Mirror“ keine Basis-URL mit.
  Mit „Assets: Überspringen“ läuft der Import durch, die Bilder haben dann keine Quelle.
- **Qualität ist an drei gespeicherten Exporten gemessen**, nicht an jeder beliebigen Seite. Die Zahlen stehen in
  `docs/current/qualitaet.md`.

## Beim ersten Import

1. Zuerst **Analysieren** und den Bericht lesen.
2. In eine **neue Seite** importieren, nicht in eine bestehende.
3. Die Seite bei **Desktop, Tablet und Handy** prüfen: Bilder und Schriften da, Textumbrüche, Formulare, Icons,
   Scroll-Effekte, Links.
4. Bilder ersetzt du später im Editor oder auf deinen Zuruf: Ein generiertes Bild entsteht nur, wenn du es verlangst
   („ändere Bild so und so“), über die Bildgenerierung (ADR-0008).
5. Weicht etwas ab, nenne die Quelle und den Breakpoint. Gemessen werden Abweichungen mit dem Fixture-Gate
   (`docs/agents/fixture-gate-diagnose.md`).
