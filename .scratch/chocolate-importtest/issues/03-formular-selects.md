# Formular-Selects werden zu statischem Text flattet

Status: offen — Ursache belegt (12.11.2026), Korrektur nicht umgesetzt
Label: ready-for-human (Produktfrage: neues Select-Primitive)
Type: task

## Befund

`/contact` hat im Original zwei native `<select>` mit Laufzeit-Vorauswahl:

- **Country**: 5 Optionen, Wert `us` („United States“), `selectedIndex` 1.
- **Team Size**: 5 Optionen, Wert `1-10` („1–10“), `selectedIndex` 1.

Bei beiden ist `defaultSelected` aller Optionen `false` — die Vorauswahl setzt
die Framer-Laufzeit, nicht das Markup. Der Build rendert statischen Text
(„Select...“ bzw. die Beschriftung), **0 native Selects, 0 Pseudo-Dropdowns**.

## Ursache (belegt)

Der Capture flattet `<select>` zu einem Textknoten:
`packages/framer-import/src/capture-html.ts:371` ersetzt die Kinder durch
`selectedOptionLabel(children)` (Funktion :420). Optionen und Vorauswahl gehen
verloren; das IR behandelt `<select>` als Blatt (wie `<svg>`, siehe
Live-Schlüsselstempel, Stand 10.11.2026). Es gibt kein Select-Primitive in
Katalog/Renderer.

## Belege

- `.scratch/choc-icon-select.mts` → `.scratch/choc-icon-select.json`
  (`originalContactSelects.nativeSelects` mit Optionen und Werten,
  `buildContactSelects.nativeSelects` = `[]`).
- Bildpaare `.scratch/choc-visual-2026-11-12/contact/` (Formularabschnitte).

## Produktfrage (vor dem Code zu klären)

Soll der Import ein **bedienbares natives Select** als neues Widget-Primitive
liefern (Katalog, Markup, Sanitizer, Editor-Control, Bake), oder reicht eine
getreue **Anzeige** des gewählten Werts? Empfehlung: natives Select-Primitive —
das Handoff-Ziel ist „vollständig editierbar“, und ein Formular ohne seine
Auswahlfelder ist weder originalgetreu noch editierbar. Die Laufzeit-Vorauswahl
(`selectedIndex` ohne `defaultSelected`) muss der Browser-Capture messen, das
statische Markup trägt sie nicht.

## Korrekturskizze (nach Entscheidung)

1. IR: `<select>` als eigener Knotentyp mit `options` (value/text) und
   `selected` (gemessen im Browser-Capture).
2. Widget-Engine: Select-Primitive in Katalog, Markup, Sanitizer; Bake
   rendert natives `<select>` mit `selected`-Attribut.
3. Editor: Select-Control für Optionen und Vorauswahl.
4. Roter Test zuerst: Fixture mit Select + Laufzeit-Vorauswahl, Assert auf
   Optionen und gewählten Wert im Bake. Re-Import + visueller Lauf.

## Grenzen

- Das Formular selbst (Submit-Verhalten) ist nicht Teil dieses Tickets; die
  Quelle bindet es an einen Fremd-Dienst ein.
- Bericht `.scratch/chocolate-importtest/bericht.md` (Befund 7) nennt diesen
  Befund als bewusst nicht in diesem Schritt behoben.