# Prüfbericht — jede Seite, jeder Screen

**Stand:** 22.09.2026 · Ziel `ui-preview/index.html` (Prototyp) · 31 Vollbilder, 24 Zuschnitte, 30 Zustände, 4 Breiten
**Methode:** nicht geschätzt. Jede Zahl unten ist gemessen (Skripte: `pruef-befunde.mjs`, `pruef-befunde2.mjs`, `pruef-befunde3.mjs`, `pruef-befunde4.mjs`, `pruef-ueberlauf.mjs`), jedes Bild angesehen (`aufnahmen/`).

---

## 0. Vorab: vier Befunde habe ich widerrufen

Damit du weißt, worauf du dich verlassen kannst — ich schreibe nur, was die Messung trägt.

| Verdacht (aus dem Bild) | Messung | Ergebnis |
|---|---|---|
| „Violette Links / ein dritter Farbton" | Kartenuntertitel `rgb(85, 84, 95)`, kein Blatt mit buntem Text auf 5 Seiten | **falsch** — die Leiter hält. Gestrichen. |
| „Die Markerleiste ist mitskaliert" | Knöpfe 24 px, Symbole 13 px in echter Größe | **falsch** — war die *Geometrie*, nicht die Größe (schon behoben) |
| „Merkmalsleiste `Bänder`/`Einrasten` zeigt ihren Zustand nicht" | beide tragen `--ui-surface-well`, also sichtbar gedrückt | **falsch** — die Ein/Aus-Sprache ist lesbar |
| „Toast verdeckt die Statusleiste" | Toast endet y 883, Statusleiste beginnt y 884 | **falsch** — knapp, aber sauber |
| „Kennzahlenzeile läuft bei 390 px aus dem Bild" | kein beschnittenes Element, alle Zahlen unter x 250 | **falsch** — sie bricht sauber um; im Bild 30 war der Aufnahmerand die Grenze |

---

## 1. Was kaputt ist (zuerst beheben)

### P0-1 · Zehn Reiter sind tot

| Ort | Beleg | Wirkung |
|---|---|---|
| Inspektor `Content / Style / Interactions / Advanced` | Klick auf alle vier → **identischer Inhalt**: dieselben 8 Abschnitte, dieselbe Textlänge 1134. `aria-selected` bleibt auf „Style" | Der Nutzer glaubt, er wechsle die Sicht — er tut es nicht |
| Baum `Ebenen / Seiten / Komponenten` | Vor/Nach dem Klick identischer Panellinhalt (`gleich: true`) | Seiten- und Komponentenliste existieren nicht |
| Einstellungen `Site / Theme / Domains / Agent & MCP / Sicherung` | Alle fünf zeigen dieselbe Karte („Name Slug Profil clean…", Länge 678), „Site" bleibt aktiv | Vier von fünf Einstellungsseiten gibt es nicht |

**Grund, warum das der schwerste Befund ist:** Ein toter Reiter kostet mehr als ein fehlender. Er sagt „hier ist etwas" und liefert nichts — genau der Eindruck, den die Oberfläche insgesamt erzeugt.
**Änderung:** Entweder je Reiter echter Inhalt (`Content` = Text/Bild/Alt/Bindung, `Interactions` = Bewegung/Ereignisse, `Advanced` = Attribute/DOM/ID; `Seiten`/`Komponenten` = echte Listen; `Theme/Domains/MCP/Sicherung` = eigene Karten), oder die Reiterleiste entfällt und es bleibt **eine** Ansicht. Halbe Ausführung (drei Reiter, drei leere Flächen) ist die schlechteste Variante.

### P0-2 · Im Dunkelmodus verschwindet das Dokument in der Bühne

```
H1.site__h1      color  rgb(245, 245, 247)   ← dunkle Modus-Tinte
DIV.site         bg     rgb(255, 255, 255)   ← feste Dokumentfläche
Kontrast: 1,04 : 1      Bild: aufnahmen/62-rahmen-dunkel.png
```
Die Überschrift der Seite, die man gerade bearbeitet, ist **nicht mehr zu sehen**; der Fließtext ist blass. Belegt an der Elternkette: `.frame` (dunkel) → `.site` (**weiß**) → `.site__h1` (hell).
**Grund:** Die Bühne ist Wahrheit. Sobald ein Werkzeug-Modus die Tinte des Dokuments umfärbt, ist WYSIWYG gebrochen — die wichtigste Zusage eines solchen Programms.
**Änderung:** Die Bühne wird vom Werkzeugmodus **entkoppelt**. Dokumentfläche *und* Dokumenttinte kommen aus dem Site-Theme (eigene Variablen, nie `--ui-*`). Zusätzlich ein Bedienelement „Seite: hell / dunkel" im Kopf der Bühne, damit man die Wirkung prüfen kann, ohne das Werkzeug umzuschalten.

**Behoben** (`ui-preview/proto-editor.css`, `design-system/senify.css`): Die Dokumentwurzel `.site` bindet die acht Tintenrollen um (`--ui-ink-strong` … `--ui-ink-on-accent`) und setzt `color-scheme: light`. `color` auf `.site` allein genügte nicht — die Basisschicht setzt die Tinte direkt am Element (`h1, h2, h3 … { color: var(--ui-ink-strong) }`) und schlägt damit jede Vererbung. Jetzt findet jede hereingreifende Werkzeugregel die Dokumentwerte vor. Gemessen: **0 Verstöße** an 24 Textstellen des Dokuments, hell wie dunkel (vorher 7, schlechtester Wert 1,09:1). Das zusätzliche Bedienelement „Seite: hell / dunkel" im Bühnenkopf ist **nicht** gebaut — es war eine Anregung, nicht der Fehler.

### P0-3 · Im Dunkelmodus ist jede Auswahlliste weiß auf weiß

```
select           bg rgb(255,255,255)   color rgb(220,220,225)   → 1,37:1
html             color-scheme: normal
```
*Korrektur am eigenen Bericht: hier stand 1,04:1 — das war die Zahl aus P0-2.*
Betroffen: „Flex", „Spalte", „Start", „Schrift: Inter Display" — also das halbe Inspektorfeld. Bild `aufnahmen/d20-dunkel-felder.png`.
**Grund:** Das native Feld malt die Betriebssystem-Fläche, wir liefern nur die Tinte.
**Änderung:** `[data-mode="dark"] { color-scheme: dark }` **und** den Feldern ein eigenes `background`, `color`, `border` und `appearance: none` mit eigenem Winkel geben (nicht auf die UA verlassen). Prüfstein: `d20` neu aufnehmen, Text muss sich vom Feld abheben.

**Behoben** (`ui-preview/proto-base.css`, `design-system/senify.css`): Die Ursache war eine Systemfläche, nicht nur die fehlende Ansage — Chromium malt `ButtonFace` (`#ffffff`) **auch mit** `appearance: none`, dazu einen Systemrand; `appearance: none` war bereits gesetzt. Fläche, Tinte und Rand nennt jetzt das Element selbst (`--ui-surface-inset`, `--ui-ink`, `border: 0`), und `color-scheme` folgt dem Modus in der Quelle. Gemessen: **0 von 11** Auswahllisten im Inspektor, 0 von 1 bzw. 2 in den Dialogen — hell wie dunkel. Der helle Modus war ohnehin betroffen: der weiße Select neben dem grau gefüllten Zahlenfeld hatte dieselbe Ursache.

### P0-4 · Bei 1024 px läuft der Editor 92 px heraus, bei 390 px sind es 702 px

| Breite | Überlauf | Was hängt heraus | Bild |
|---|---|---|---|
| 1440 | 0 px | — | 16, 17 |
| 1024 | **92 px** | `Bänder` (1048…1133), Inspektor rechts (`Alle anzeigen`, `Interactions`, `Aktiv`, `Höhe`, `Ausrichtung`, `Links` abgeschnitten), Statusleiste „2 offen[" | 28 |
| 390 | **702 px** | Topbar und Werkzeugleiste sind fest 1092 px breit | — |

**Grund:** Drei feste Spalten (250 + Bühne + 320) plus feste Leisten; nichts kollabiert.
**Änderung (Entscheidung nötig):** Unter 1180 px den Inspektor als überlagerndes Panel (wie der Agent), unter 1024 px die Bühne allein mit Umschaltern; **oder** ehrlich: „Editor braucht 1024 px" mit einer Hinweisseite statt eines beschnittenen Rasters. Ein Editor auf 390 px ist für dieses Werkzeug nicht sinnvoll — eine schöne Sperre ist besser als ein kaputtes Bild.

### P0-5 · Die Programm-Schale läuft bei 390 px links heraus

Gemessen: `nav-agent` −25…72, `theme-toggle` −25…15 in einer **48 px** breiten Leiste. Bild 30 zeigt einen angeschnittenen Kreis und „Live" halb außerhalb.
**Änderung:** Unter 900 px Agent-Kasten und Umschalter auf Symbolgröße reduzieren (oder als Flyout), `overflow: hidden` auf die Leiste.

---

## 2. Was ich je Screen ändern würde

### Start (`01`)
*Trägt:* ruhige Leiter, Kennzahlenzeile, genau eine Fortsetzen-Karte, gute Erklärsätze.
1. **Drei gefüllte Handlungen gleichzeitig** — gemessen: `Seite bauen`, `Im Editor öffnen`, `Prüfen` (plus aktive Navigationspille = vier Tintenflächen). → Nur **eine** gefüllt lassen (`Seite bauen`); `Im Editor öffnen` wird Textknopf mit Pfeil in der Karte, `Prüfen` zweitrangig — die Zahl „1 offene Prüfung" trägt die Aussage. *Grund:* Ein Primärknopf ist eine Aussage; drei sind keine.
2. **Die Vorschau-Miniatur ist ein leerer grauer Kasten** mit Dateinamen. → Echte Bake-Miniatur (dein Entscheid „aus den echten Bakes") oder bewusster Platzhalter mit Typ-Symbol. *Grund:* Der erste Blick der Seite ist heute der leerste Teil.
3. *(Widerruf: die Kennzahlenzeile bricht bei 390 px sauber um — im Bild 30 war der Bildschirmrand der Aufnahme die Grenze, nicht das Layout. Gemessen: kein beschnittenes Element, alle Zahlen unter x 250.)*

### Seiten (`02`) / CMS-Blog (`05`) / Releases (`12`)
*Trägt:* Statuspille, Version, geändert-von, Zeilenklick — das ist die richtige Informationsmenge.
1. **Zellen brechen mitten im Wert.** Belege: `Release 12` / `Heute,` / `14:31` (dreizeilig, `d11`), `3 abweichende Bildpunkte von 53.760` / `(0,000056)`, `23.07.2026 · 8` / `Min`, Slug `geschichtedes-webdesigns` am Bindestrich (`05`). → Datum **geplant** zweizeilig (Name fett, Datum gedämpft, `white-space: nowrap`), Slug `nowrap` + Ellipse, Detailzahl in eine zweite Zeile oder ein Badge. *Grund:* Ein Umbruch mitten im Datum sieht nach Zufall aus und kostet eine Zeile Höhe je Datensatz.
2. **Die aktive Zeile hat keine Aktionen** (nur `Aktiv`), alle anderen `⋯ Aktionen` (`12`) → gleiche Spalte, gleiche Bedienung, auch für die aktive Zeile.
3. Grammatik: **„Rollback möglich, solange die Build-Ordner liegt."** → „…liegen."
4. `12` ist die einzige Tabelle mit einer Fußzeile („4 Releases · 1 aktiv · …") — dieselbe Zusammenfassung fehlt auf Seiten/CMS/Medien/Aufträgen. *Grund:* Sie ist die günstigste Orientierung im Screen.

### CMS (`04`) — Sammlungen (`d03`) / Eintrag (`06`)
*Trägt:* Felder-Chips je Sammlung, „7 Felder · 4 Einträge · 3 veröffentlicht", die Nutzungskarte „Erscheint in der Liste unter /blog".
1. **`+ Collection`** mitten in deutschem Text → „Sammlung".
2. **Der Fließtext ist ein einzeiliges Feld** („Lorem Ipsum ist der Standard-Dummy-Text der Druck- und Satzindustrie …" abgeschnitten). → Textarea mit Mindesthöhe, Zeichenzahl, Vorschlag „vom Agenten schreiben lassen". *Grund:* Wer einen Artikel schreibt, kann das hier nicht.
3. **Versionen ohne Handlung** (06): drei Zeilen, kein Diff, kein „Wiederherstellen", kein Autor. → Je Zeile Diff/„Wiederherstellen"; Fassung, die man nicht zurückholen kann, ist eine Liste ohne Zweck.
4. `Gespeichert 14:26` steht zwischen Erklärsatz und Aktionsknopf (06) → in die Statusleiste oder an den Titel. *Grund:* Status- und Handlungsebene mischen sich.

### Medien (`07`)
1. **Bilder sind ein transparentes Karomuster** mit Dateinamen — das liest sich als „kaputt", nicht als „Platzhalter". → Typ-Symbol + Maße auf `surface-sunk`, oder echte Bake-Miniatur.
2. **Fünf Spalten zu eng:** „132 KB · Projekte" und „421 KB · Projekte" brechen zweizeilig, die Badgezeile verschiebt sich (Karten 4/5). → vier Spalten oder Metazeile `nowrap` + Typ kürzen.
3. Keine Suche, keine Sortierung — bei 726 Referenzen und wachsenden Medien der wichtigste fehlende Griff. → Suchfeld + „ohne Alt-Text" als Zustand sichtbar halten (der Chip ist gut, es fehlt die Suche).
4. *(Widerruf: die Alt-Badges sitzen richtig.)*

### Referenzen (`08`) / Referenz-Detail (`09`)
*Trägt:* 3-spaltiges Raster, Vokabular-Chips, `6 von 726 Referenzen · 71 Sammlungen · 18 Stilfamilien`, die Karte „Als Vorbild anwenden" mit der klaren Zusage „die aktive Release bleibt unverändert".
1. **Die Miniatur ist ein flacher grauer Block** — auf `09` das größte Element der Seite. → Miniatur aus dem Bake.
2. **Reiter `Übersicht / Design.md / Guidelines / Komponenten` mit Unterstrich** (d16). Alle Reiter im Haus sollten **dieselbe** Sprache sprechen (siehe P1: Auswahlsprache).
3. **`Dokumente` / `Bilder` als Fließtext mit umbrechendem Mittelpunkt** („design.md · design-guidelines.md ·" ⏎ „design-components.md"). → je Dokument eine Zeile mit Symbol und Handlung; Mittelpunkte nie am Zeilenende.
4. Die Karte **`Zuweisung`** hat 100 px Inhalt und 280 px Höhe. → Fläche schließen lassen oder die Zuweisungsfelder (Skalen: Farbe, Typografie) wirklich aufnehmen.

### Redesign-Paket (`10`, `d14`)
1. **Keine der drei Richtungen zeigt eine Richtung.** Genau hier — Stil zur Wahl stellen — fehlt das Bild am schmerzhaftesten. → Je Karte ein kleines Drahtgitter in *ihrer* Sprache (Raster/Block/Editorial), in reinem CSS/SVG, kein Asset nötig.
2. **Die Karten stehen nicht auf einer Linie:** Karte A beginnt wegen des `EMPFOHLEN`-Chips 25 px tiefer (gemessen an `d14`) → Titel und Wertzeilen springen. → Chip rechts neben den Titel oder 24 px reservieren.
3. Drei identische `Diese Richtung`-Knöpfe ohne Unterschiedsgrund. → Bei B und C „Stattdessen diese" / je Knopf ein Halbsatz Nutzen; der Chip bleibt nur an A.
4. `Token-Delta` (8 neutrale Felder) ist der stärkste Baustein der Seite — er sollte beschriften (von → nach), statt eine Reihe zu bleiben.

### Prüfen (`11`)
*Trägt:* Diff-Tabelle mit Vorher/Nachher, Checks mit Zahlen („34 geprüft, 0 tot"), Freigabe-Tor, Kommentar mit Agent-Antwort, Kontrastwarnung mit Token und Verhältnis („1 Hinweis: .card-sub auf #f4f4f8"). Das ist die dichteste und glaubwürdigste Seite.
1. Die **Pluszeichen der Zusätze** erscheinen in Limette, während das Haus Grün für „Veröffentlicht/Fertig" führt → Farbbedeutung trennen (Zusatz = Grün, Limette bleibt „hier zählt es jetzt").
2. `Änderungen anfordern` und `Notiz speichern` stehen gleichrangig; die eigentliche Entscheidung (`Freigeben`) liegt im Seitenkopf. → Freigabe-Zeile an das Kommentarfeld binden, dann ist der Ablauf ein Fluss statt zweier Orte.

### Aufträge (`13`)
*Trägt:* vier Zustände (läuft/fertig/fehlgeschlagen/wartet), Fehlgrund im Klartext mit fehlendem Schlüssel, „Erneut".
1. **Der Text verspricht, was die Zeile nicht liefert:** „Punkt pulsiert, Versuche sichtbar" ↔ statischer Punkt, keine Versuchszahl. → Punkt pulsieren (`prefers-reduced-motion` beachten) + „Versuch 2/3", oder den Satz korrigieren.
2. Die drei Erklärkarten (`LÄUFT / FEHLGESCHLAGEN / WARTET`) sind **Dokumentation in der Arbeitsoberfläche**. → als Info-Punkt an die Zustandspille oder in einen Hilfedialog; auf der Arbeitsebene trägt die Pille die Aussage.
3. `Läuft`-Zeile ohne Fortschritt → Balken oder „2 von 5 Seiten".

### Einstellungen (`14`)
1. **Reiter mit Unterstrich** (tote Reiter, P0-1).
2. **Gewählte Profilkarte ohne eigene Fläche** — nur Rand und Radiopunkt; der Unterschied zwischen „standard" und „showcase" ist ein 1,5-px-Rahmen. → gewählte Karte mit `surface-well`-Fläche. *Grund:* Bei einer Wahl mit Folgen muss die Wahl sichtbar sein, ohne die Radio-Punkte zu vergleichen.
3. `Speichern` klebt unter der letzten Karte. → Fußleiste der Karte (mit „geändert" als Auslöser).

### Designsystem (`15`, `27`)
1. **Die Chip-Spalte ist inhaltsbreit** → die Titel der Zeilen stehen nicht auf einer Linie („Nachgerechnet und verdrahtet" beginnt weiter rechts als „Zweispaltig + Suche"). In hell und dunkel sichtbar. → feste Spalte (110 px).
2. Inhaltlich vorbildlich: jede Zeile nennt die Änderung und den Grund. Diese Seite ist das beste Verkaufsargument im Prototyp — sie sollte auch den **Radius-Entscheid** (Werkzeug eckig / Produkt rund) als *entschieden* führen, sobald er durchgezogen ist.

### Spotlight (`21` leer, `40` Treffer, `41`)
*Trägt:* echt nützliche Treffer mit Zahlen („5 Seiten", „3 Collections", „Release 12 aktiv"), `Esc`-Chip, verschleierter Hintergrund (gemessen `rgba(17,17,22,0.45)`).
1. **Der Leerzustand beginnt 66 px zu tief** (Treffer beginnen bei y 186, der Leerzustand bei y 226) → die Fläche wirkt leer statt beantwortet. → auf die Höhe der ersten Ergebniszeile.
2. **`Suche leeren` ist doppelt** — das ✕ im Feld tut dasselbe. → Knopf streichen.
3. Ohne Eingabe ist **keine Zeile vorausgewählt** → erste Zeile auswählen, damit `Enter` immer trägt.

### Agent (`18`) und Verlauf (`19`)
*Trägt:* der Freigabekasten („Freigabe nötig: 4 Karten-Instanzen anlegen", `component.card@3` wird 4× mit Overrides …) — das ist der eigene Baustein des Produkts, den gibt es so nirgends.
1. **Werkzeugkarten sind Sackgassen** (`get_page · 9 Sektionen, 214 Knoten · fertig`): kein Aufklappen, kein Zustandssymbol je Typ, keine Dauer. → aufklappbar, Ergebnis und Dauer zeigen. *Grund:* Genau diese Karten sind der Beweis, dass der Agent arbeitet.
2. **Der Freigabekasten nennt, zeigt aber nicht.** → Mini-Diff der 4 Instanzen + betroffene Seiten. *Grund:* Die Frage bei einer Freigabe ist „was ändert sich", nicht „wie viel".
3. Verlauf: die **aktive Zeile ist versetzt** (ihr Inhalt beginnt ~53 px rechts von dem der übrigen, `19`) und trägt „42 Einträge · 1 Undo-Schritt je Zug" als Richtlinie im Kopf. → einheitlicher Innenabstand, Richtlinie in den Fuß, je Zeile Diff/„Wiederherstellen".

### Veröffentlichen (`20`)
*Trägt:* drei Schritte, sechs Prüfungen mit Zahlen, Notizfeld, atomare Zusage.
1. **Schritt 1 zeigt ein grünes ✓, obwohl darunter „1 Hinweis (Kontrast)" steht.** → Schritt „Prüfen" bei vorhandenem Hinweis in Amber; das ✓ nur, wenn alles sauber ist. *Grund:* Ein grünes Häkchen über einer Warnung ist der schlimmste Fehler in einem Freigabedialog.
2. Fußknöpfe linksbündig — im Haus durchgehalten (auch beim Freigabekasten), also kein Fehler; nur wissen: es ist ungewöhnlich.

### Kontextmenü (`44`, `46`)
- `44` (Baumzeile) rendert **korrekt**: Beschriftungen, Kürzel (`F2`, `Ctrl D`), Trenner, `Löschen` in Rot.
- `46` zeigt an derselben Stelle ein **65 px schmales Symbolband** ohne Beschriftung. Im Quelltext wird die Menüposition aus `clientX/clientY` gesetzt (`A().menu({ getBoundingClientRect: () => ({ left: e.clientX, bottom: e.clientY, top: e.clientY }) })`) — ein *Fenster*-Maß für ein Menü, das absolut positioniert wird; in einem scrollenden Behälter ist das per Konstruktion verschoben. **Ich konnte es mit einem künstlichen Rechtsklick nicht nachstellen**, deshalb als Verdacht geführt, nicht als Befund. → Prüfen: Menü außerhalb rollender Behälter an `document.body` hängen und an `innerWidth/innerHeight` klemmen, dann `46` neu aufnehmen.

### 1024 / 390 (`28`, `29`, `30`, `31`)
Siehe P0-4/P0-5. Zusätzlich: in der 48-px-Leiste haben die Symbole **keine Namen** — für den ersten Blick auf einem Telefon ist die Leiste ein Ratespiel. → Beschriftung als Flyout bei Fokus/Hover (Tastatur!) oder die fünf Hauptpunkte als untere Leiste.

---

## 3. Die formale Sprache — ein Entscheid, der alles andere berührt

Gemessenes Durcheinander (Zensus der gerundeten Elemente im Editor und in der Shell):

| Rolle | heute | sollte |
|---|---|---|
| Knopf | `.btn--product` **Pille**, `.btn`/`.ed-tool`/`.btn--icon`/`.action-bar` **4 px** | **Pille** (Klickziel) |
| Feld | Shell `.field` **Pille**, Editor `.p-input` **8 px**, Select **weiß, Radius 4** | **eine** Sprache, grau gefüllt + Pille |
| Gewählt | Gerätewahl **gefüllte weiße Pille in grauem Trog**, Zustandswahl **umrandet**, Reiter **Unterstrich** | **gefüllte zweite Fläche**, einheitlich |
| Baumzeile | volle Breite, **Radius 0**, schwarz | eingerückte Fläche, gerundet |
| Behälter | Karte 32 ✓, Menü **8**, Toast **12**, Sprechblase 16, Dialog/Spotlight 24 ✓ | 16 für Menü/Toast/Werkzeugkarte, 24 für Dialog/Spotlight, 32 für Karten |
| Randflächen | Leisten, Panels, Bühne = 0 ✓ | 0 lassen (richtig) |
| Dokument | Rahmen, Auswahlrahmen, Bänder | unverändert lassen (nicht unser Radius) |

Dazu **der Baum** (P1): `label` 27 px bei 43 px totem Spacer, `.kind`/`.cls` mit `overflow: visible` (können die Symbole überlaufen). → `label { flex: 1 1 auto; min-width: 0 }`, Spacer `flex: 0`, `.kind`/`.cls` truncaten. Beleg: „Ich …", „hero-…", „Mel…", „Leistu…" auf einer 263-px-Spalte.

Dazu **die Messhilfen** (P1): „Außen 0" (rosa) und „Innen 48 · 0" (grün) plus die Aktionsleiste liegen **auf der Überschrift** (Belege `d06`, `62`, 16/17). → eine Messung je Zug, Marken in den Bandstreifen oder in die Statusleiste, Aktionsleiste mit Kollisionsausweichung. Und: Maße immer mit Einheit und Namen („Innen 48 px"), nie nackte Zahlen.

Dazu **Sprache**: `Content/Style/Interactions/Advanced` → Inhalt/Stil/Bewegung/Erweitert; `+ Collection` → Sammlung; `Umformen` → Transformieren; `Solo` → einzeln; `Bänder` → Maße. Alles andere ist konsequent deutsch.

---

## 4. Reihenfolge, die ich empfehle

1. ~~**Die zwei Dunkelfehler** (P0-2 Dokumenttinte, P0-3 Selects) — klein im Aufwand, größter Schaden.~~ **erledigt**, Belege bei den Befunden.
2. **Tote Reiter** (P0-1) — entweder Inhalt oder Leiste entfernen; zehn Attrappen sind teurer als zehn ehrliche Flächen.
3. **Formale Sprache** (Kapitel 3) — ein Durchzug, danach sieht jede Seite zusammengehörig aus.
4. **Baum und Tabellen** (Kürzung, Spalten, Datum) — die zwei Stellen, an denen täglich gearbeitet wird.
5. **Start-Primäraktion** und **Spotlight-Leerzustand** — kleine Eingriffe, große Wirkung auf den ersten Eindruck.
6. **Entscheidung Responsive** (P0-4/P0-5) — überlagernde Panels oder ehrliche Sperre.
7. **Inhalt statt Platzhalter**: Miniaturen aus den Bakes, Drahtgitter je Redesign-Richtung, Dokumentspalte, Werkzeugkarten aufklappbar.
8. **Kleinkram**: Grammatik („Build-Ordner liegt"), Schritt 1 im Freigabedialog auf Amber, Versuchszahl bei Aufträgen, Chip-Spalte im Designsystem, `Suche leeren` streichen.

---

## 5. Was trägt (und bleiben soll)

- Die **Farbleiter** hält: kein bunter Text irgendwo, ein Akzent mit einer Bedeutung, Höhe aus Fläche und Kante.
- Der **Dunkelmodus** invertiert die Leiter sonst konsequent (Navigationspille hell, Karten heller als Grund) — nur die zwei Fehler oben brechen ihn.
- Der **Inspektor** ist zweispaltig und dicht (320 px, 8 px Abstand, ~30 px Kontrollhöhe) — genau der Dichtevorteil, der in den Referenzen fehlte.
- Die **Bühne** passt Geräte ein und der Auswahlrahmen sitzt exakt auf dem Element (frühere 0/0/0/0-Messung bestätigt sich in 16/17/22).
- **Produktwahrheit**: Kennzahlenzeile, Checks mit Zahlen, Fehlgrund im Klartext, Freigabekasten, Bau-Protokoll, Rollback-Zusage. Das ist der Teil, den kein Baukasten nachbaut — er ist heute zu leise, nicht zu schwach.
