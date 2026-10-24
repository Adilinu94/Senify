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
3. **Analysieren** ist ein Probelauf mit Bericht. Er lädt keine Medien und schreibt nichts. Der Bericht nennt die
   Aufteilung **„X % bearbeitbar, Y % Original-Code"**: die Seite mit Framer-Runtime läuft im Release als Original
   (0/100), eine Seite ohne Runtime ist vollständig bearbeitbar (100/0).
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

## Zwei Ausgaben: bearbeitbarer Baum und Original-Code

Der Import erzeugt **beides**:

- **Den bearbeitbaren Baum** — die Struktur, die du im Editor siehst, mit Layout, Text, Bildern, Schriften und den
  Erscheinungs-Effekten als CSS.
- **Den Original-Code als „Island-Payload"** (ADR-0010). Die Framer-Runtime der Seite wird mitgebündelt und beim
  Veröffentlichen ausgeliefert. Sie trägt, was der Baum nicht ausdrücken kann: Lenis-Smooth-Scroll, three.js,
  Hover-Bewegung, Scroll-Trigger, Ticker.

**Was das für dich heißt:**

| | Bearbeitbarer Baum | Original-Code |
|---|---|---|
| Wo sichtbar | Editor (Canvas) | Vorschau und veröffentlichte Seite |
| Veränderbar | ja, alles | nein, nur Lage, Größe, Sichtbarkeit, Poster, Alt-Text |
| Was es trägt | was das SSR-HTML hergibt | alles, was die Runtime im Browser baut |

Der Import-Bericht sagt, welche Teile als Original-Code laufen. Im Editor steht an dieser Stelle ein **Poster** (das
Social Image der Quelle, `og:image`) — und wenn es keins gibt, eine beschriftete Platte. Beim Veröffentlichen
ersetzt der Original-Code den Baum, damit nichts doppelt steht.

Gemessen an `notes.framer.website`: **0,54 / 0,90 / 1,16 %** Pixel-Differenz (Desktop / Tablet / Mobil) bei exakt
gleicher Seitenhöhe, Payload 947 KB. Der Baum allein läge bei 1,46 / 2,23 / 6,19 %.

## Grenzen

- **Framer-Code und Shader** laufen als Island-Payload (siehe oben). Echte Übernahme in bearbeitbare Bausteine gibt
  es nicht — die Innereien des Payloads bleiben fremder Code.
- **Inhalte, die erst im Browser entstehen, fehlen im Baum.** Der Import liest standardmäßig das Server-HTML. Was
  eine Framer-Code-Komponente erst beim Laden erzeugt, ist darin nicht enthalten — gemessen an der Earn-Vorlage: die
  fünf Bewertungssterne, und an einer anderen Seite 15 Karten-Grafiken (`viewBox="0 0 524 676"`: **0x** im
  Server-HTML, **49x** im fertig geladenen Browser). An ihrer Stelle bleibt im Baum ein leerer Rahmen stehen; der
  Bericht nennt ihn jetzt mit Anzahl und Signatur (`code-component`, Schwere `info`).
  **Im Release sind sie da**, weil dort die Original-Runtime läuft.
- **Die Struktur lässt sich auch aus der fertig geladenen Seite lesen** (`structureSource: "browser"`, braucht
  Chromium). Gemessen an derselben Seite: **15,74 % → 11,25 %** Pixel-Differenz, 109 SVG-Knoten statt 0, und die
  Geräte-Varianten sind schon gefaltet. **Das ist ein Schalter, kein neuer Standard**, weil der Weg auch etwas
  kostet: die geladene Seite hat ihre Einblende-Marker verloren (`data-framer-appear-id` 52 → 18 auf einer Seite)
  und den Breakpoint-Kanal. Eine Seite, deren Einblendungen aus dem Startzustand abgeleitet werden, verlöre sie.
- **Seiten ohne Appear-Kanal.** Manche Framer-Seiten markieren ihre Elemente (`data-framer-appear-id`), liefern aber
  das JSON nicht, das die Animation beschreibt. Der Import leitet die Einblendung dann aus dem **Startzustand** ab, der
  noch im Stil steht — Bewegung, Skalierung und Drehung stimmen. **Die Dauer ist eine Annahme (0,6 s)**, weil die Quelle
  sie nicht nennt; der Bericht sagt das. Ein `opacity:0` **ohne** Bewegung wird nicht als Einblendung gedeutet (das wäre
  ein geschlossenes Menü, das bei jedem Aufruf aufblendet).
- **Icons über `<use href>`** ohne Sprite erscheinen als Ring, weil Framer das Sprite per Skript einfügt. Liegt das
  Sprite im Server-HTML (der Regelfall), löst der Import es auf: gemessen an der Earn-Vorlage tragen alle 16 SVGs ihre
  Zeichnung. Ein Sprite, das die Quelle selbst nicht mitliefert, bleibt ein Ring.
- **Der „Made in Framer"-Badge** ist ein `position:fixed`-Widget, das Framer in seine veröffentlichte Seite setzt. Er
  ist Werbung des Baukastens, nicht Inhalt der Website. Der Import schreibt die Adressen der Quelle auf die eigenen
  Dateien um, damit die Seite nichts Fremdes mehr lädt; der Badge fällt damit weg (und die
  Content-Security-Policy blockt ihn zusätzlich). Im Pixel-Vergleich gegen das Original zählt er als Abweichung.
- **Die Seite lädt nur noch sich selbst.** Preview und veröffentlichte Seite antworten mit einer
  `Content-Security-Policy` (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'self'`). Bilder, Schriften,
  Videos und Skripte kommen aus dem eigenen Build; fremde Adressen werden beim Import heruntergeladen und umgeschrieben.
  Inline-Stile und -Skripte sind erlaubt (der Bake schreibt sie); die Grenze ist die Herkunft.
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
- **Qualität ist an drei gespeicherten Exporten gemessen**, nicht an jeder beliebigen Seite. Dazu kommen acht
  fremde Framer-Seiten als Blindtest. Die Zahlen stehen in `docs/current/qualitaet.md`.

## Was die Seite nach dem Import lädt

Preview und veröffentlichte Seite holen Bilder, Schriften, Videos und Skripte **aus dem eigenen Build**. Der Import
lädt die Medien der Quelle herunter, legt sie in der Mediathek ab und schreibt jede Adresse um — im Baum, im CSS und in
den Daten der Original-Runtime. Zusätzlich antworten beide Seiten mit einer `Content-Security-Policy`
(`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'self'`). Nach dem Import geht keine Anfrage mehr an
Framers CDN.

Ausnahmen, die der Bericht nennt: ein Video, das die Quelle von YouTube oder Vimeo einbettet (die Policy erlaubt die
drei Anbieter), und ein Bild, das die Quelle erst im Browser nachlädt und dessen Adresse deshalb nicht in der Seite
steht.

## Beim ersten Import

1. Zuerst **Analysieren** und den Bericht lesen.
2. In eine **neue Seite** importieren, nicht in eine bestehende.
3. Die Seite bei **Desktop, Tablet und Handy** prüfen: Bilder und Schriften da, Textumbrüche, Formulare, Icons,
   Scroll-Effekte, Links.
4. Bilder ersetzt du später im Editor oder auf deinen Zuruf: Ein generiertes Bild entsteht nur, wenn du es verlangst
   („ändere Bild so und so“), über die Bildgenerierung (ADR-0008).
5. Weicht etwas ab, nenne die Quelle und den Breakpoint. Gemessen werden Abweichungen mit dem Fixture-Gate
   (`docs/agents/fixture-gate-diagnose.md`).
