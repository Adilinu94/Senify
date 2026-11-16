# Klick-Menü (Mobil) öffnet im Build nicht

Status: offen — Ursache belegt (12.11.2026), Korrektur nicht umgesetzt
Label: ready-for-human (Produktfrage: JS im Bake / Klick-Zustände)
Type: task

## Befund

Auf Mobil öffnet der Menü-Knopf im Original das Navigations-Menü (nach dem
Klick erscheint der Link „Home“, die Nav wechselt auf die Menü-Links). Im
Build passiert beim Klick **nichts** (keine neuen Links). Hover dagegen
funktioniert identisch zum Original (7/8 Kandidaten mit Änderung, gleiche
Werte, z. B. Nav `backgroundColor rgb(15,14,13)→rgb(31,29,26)`).

## Ursache (belegt)

Das Menü ist eine klickgetriebene JS-Zustandsmaschine der Framer-Laufzeit
(Varianten-Umschaltung bei Klick). Der statische Import reproduziert kein
Laufzeit-JS. Hover ist erfasst (CSS `:hover`, ADR-0033/0034), Klick-Zustände
nicht — der Capture misst nur Hover.

## Belege

- `.scratch/choc-interaction.mts` → `.scratch/choc-interaction.json`:
  `originalMenu.neueLinks` = `["Home"]`, `buildMenu.neueLinks` = `[]`;
  `originalHover`/`buildHover` mit identischen Eigenschafts-Differenzen.

## Produktfrage (vor dem Code zu klären)

Wie soll der Import klickgetriebene Zustände behandeln? Optionen:

1. **Klick-Zustände messen wie Hover** (ADR nötig): Kandidaten klicken,
   Differenz messen, als Zustand in den Bake schreiben — z. B. über
   `<details>`/`:checked` oder ein kleines, geprüftes Inline-Skript. Das
   widerspricht möglicherweise der bisherigen Statik-Entscheidung des Bakes
   und braucht eine eigene ADR.
2. **Abbildung auf ein bestehendes Disclosure-Primitive**, falls der Katalog
   eines trägt (Menü als aufklappbare Liste).
3. **Grenze akzeptieren und dokumentieren** (Mobil-Menü bleibt zu).

Empfehlung: erst Variante 2 prüfen (kein JS, editierbar); scheitert sie an der
Quellstruktur, Variante 1 als eigene ADR. Das betrifft nicht nur dieses Menü,
sondern jede klickgetriebene Framer-Interaktion (Tabs, Akkordeons).

## Grenzen

- Die Messung belegt eine Quelle und einen Knopf. Die Häufigkeit bei anderen
  Framer-Seiten ist nicht gemessen.
- Bericht `.scratch/chocolate-importtest/bericht.md` (Befund 8) nennt diesen
  Befund als benannte Grenze, bewusst nicht in diesem Schritt behoben.