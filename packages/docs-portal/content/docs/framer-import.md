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
   | Quelle | Framer-URL | HTML-Datei, Lokaler Mirror (Ordner auf dem Server; dazu optional die Adresse der Originalseite) |
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
- **Bewegung.** Erscheinungs-Effekte werden **als CSS kompiliert** — nicht nur auf Presets abgebildet: der Import liest
  Framer's Appear-Kanal (`__framer__appearAnimationsContent`) mit jeder Breakpoint-Variante, Start- und Endzustand und
  kompiliert ihn zu `@keyframes`. Damit laufen auch Effekte, für die es kein Senify-Preset gibt: ein Seitwärts-Slide,
  ein Hineinskalieren, eine 3D-Kippung. Die Dauer und die Verzögerung sind die der Quelle (1,4 s bleiben 1,4 s), die
  Transform-Reihenfolge folgt Framer's eigener (`perspective → translate → scale → rotate → skew`), und die Varianten
  sind auf ihre Breakpoints gescoped. Bei `prefers-reduced-motion` steht das Element still und sichtbar.
  Was der Kanal **nicht** trägt — Scroll-Trigger und Hover-Bewegung — steht im Bericht. Smooth-Scroll steht dort als
  Hinweis auf das Site-Profil. Eine Feder wird angenähert (`ease-out` bzw. eine Overshoot-Kurve): ihre exakte
  Überschwingung ist kein CSS-Zeitverlauf.
- **Alles, was nicht abbildbar ist, steht im Bericht.** Der Import verwirft nichts stillschweigend: Jede nicht
  übernommene Regel, jedes fehlende Asset und jedes Framer-Code-Stück erscheint als Befund.

## Grenzen

- **Framer-Code und Shader** werden zu einem sichtbaren Platzhalter mit Befund. Echte Übernahme gibt es nicht.
- **Inhalte, die erst im Browser entstehen, fehlen.** Der Import liest das Server-HTML. Was eine Framer-Code-Komponente
  erst beim Laden erzeugt, ist darin nicht enthalten — gemessen an der Earn-Vorlage: die fünf Bewertungssterne. Ihr
  Container hält im Server-HTML nur fünf leere `display:contents`-Platzhalter, die Sterne selbst entstehen im Browser.
  An ihrer Stelle bleibt der leere Rahmen stehen, und der Bericht nennt die Stelle. Wer sie braucht, legt ein Bild
  dorthin oder braucht eine zweite Quelle (Unframer-MCP, Projektstruktur statt gerendertem HTML).
- **Icons über `<use href>`** ohne Sprite erscheinen als Ring, weil Framer das Sprite per Skript einfügt. Liegt das
  Sprite im Server-HTML (der Regelfall), löst der Import es auf: gemessen an der Earn-Vorlage tragen alle 16 SVGs ihre
  Zeichnung. Ein Sprite, das die Quelle selbst nicht mitliefert, bleibt ein Ring.
- **Der „Made in Framer"-Badge** ist ein `position:fixed`-Widget, das Framer in seine veröffentlichte Seite setzt. Er
  ist Werbung des Baukastens, nicht Inhalt der Website, und wird bewusst nicht importiert. Im Pixel-Vergleich gegen das
  Original zählt er als Abweichung.
- **Ein Rahmen, den Framer nur an einer Seite zeichnet, wird ein Inset-Schatten.** Framer zeichnet ihn als Overlay
  (`::after`); ein echter Rahmen würde die Box um seine Breite vergrößern und die Seite verschieben. Gestrichelte und
  gepunktete Rahmen behalten den echten Rahmen, weil ein Schatten keine Strichart hat.
- **`<select>`-Felder** zeigen ihre Optionen als Liste.- **Selektoren.** Nicht ausgewertet werden `:not()` an Vorfahren, Geschwister-Kombinatoren (`+`, `~`), `:first-child`
  und `:nth-*`, `@container` und Attribut-Operatoren außer `=`.
- **Lokale Quellen und Medien.** Der Import liest Medien nie aus dem Mirror-Ordner, er lädt sie über eine Basis-URL
  von der Live-Adresse. Für „Lokaler Mirror“ bietet der Dialog dazu das Feld „Adresse der Originalseite“ an
  (z. B. `https://beispiel.de`). Ohne sie bricht „Assets: Hochladen“ bei relativen Medien-URLs ab (Meldung
  „Relative Asset-URL ohne baseUrl nicht auflösbar“), und ein gescrapter Mirror, dessen Links absolut geschrieben
  sind, zeigt keine weiteren Seiten der Site an. Mit „Assets: Überspringen“ läuft der Import durch, die Bilder haben
  dann keine Quelle.
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
