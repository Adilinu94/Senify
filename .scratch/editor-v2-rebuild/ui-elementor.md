# Elementor als Bauplan: Auswertung mit Dateibelegen (ui-elementor.md)

Status: Runde 80, Auswertung abgeschlossen
Auftrag: `C:\Users\adini\projects\Senify\Repos\elementor-main` als Bauplan auswerten, mit Dateibelegen,
je Erkenntnis ein Satz uebernehmen, abwandeln oder verwerfen, mit Begruendung.
Lizenz: Es wird **kein Code uebernommen**. Jeder Eintrag nennt nur Konzept, Mass und Verhalten und die
Datei, in der es steht. Namen wie `.elementor-slider` oder `rovingTabindex` sind Zitate zur Nachpruefung,
keine Kopiervorlage.

## 0. Quellenlage im Repo

Drei Schichten liegen vor, und sie sind unterschiedlich alt:

| Schicht | Ort | Bedeutung fuer uns |
|---|---|---|
| Steuerdefinitionen (PHP) | `includes/controls/`, `includes/controls/groups/`, `includes/conditions.php` | die belastbarste Quelle: jeder Feldtyp mit Argumenten, Standardwerten und Zweck |
| Alter Editor (v3) | `assets/dev/scss/editor/**`, `assets/dev/js/editor/**` | die einzige Quelle fuer echte Pixelwerte des Werkzeugrahmens (Panel, Menue, Navigator, Lineal-Umfeld) |
| Neuer Editor (v4, React) | `packages/packages/core/**`, `packages/packages/libs/editor-controls/**` | die einzige Quelle fuer Zustandslogik (Bedingungen, Reset, Auswahlrahmen, Rasterhilfe, Interaktionen, Tastatur) |

Nicht vorhanden: gebaute `assets/css/**` und `assets/js/**` im Wurzelordner. Die Verweise unten zeigen
deshalb auf die Quellen (`assets/dev/...`) und auf die Pakete, nicht auf Auslieferungsdateien.

Nicht auffindbar im Repo (Grep ueber `Repos/elementor-main` ohne `vendor*`): ein Lineal, Fuehrungslinien
oder Einrasten an Fuehrungslinien (`ruler` kommt nur in `assets/lib/font-awesome/**` und in
`modules/mcp/static-resources/abilities/list-resources.md` vor), eine Favoritenliste fuer Bausteine und
eine Fangfunktion (`snap`) ausserhalb der Rasterhilfe. Diese drei Punkte sind in Abschnitt F gefuehrt.

---

## A. Felder

### 1 Schieberegler mit Einheiten

**Beleg.** `includes/controls/slider.php`: `get_default_settings()` fuehrt `labels`, `scales`, `handles`
(`default` oder `range`) und `label_block`; `content_template()` gibt `.elementor-slider` aus, dazu eine
`elementor-slider-input` Zahlfeld mit `data-setting="size"` und die Vorlage fuer die Einheitenwahl.
`includes/controls/base-units.php` definiert die Standardbereiche je Einheit
(`px 0..100 step 1`, `em/rem 0.1..10 step 0.1`, `% 0..100`, `deg 0..360`, `grad 0..400`,
`rad 0..6.2832 step 0.0001`, `turn 0..1 step 0.01`, `vh/vw 0..100`, `s 0..3 step 0.1`,
`ms 0..3000 step 100`) und `print_units_template()` baut die Umschaltung aus Radios mit
`elementor-screen-only`-Text. `assets/dev/scss/editor/panel/controls/_slider.scss`: Spur `height: 4px`,
`border-radius: 5px`, Griff `.noUi-handle { height: 16px; width: 16px; border-radius: 50% }`,
Wertfeld `.elementor-slider-input { width: 21%; min-width: 54px; margin-inline-start: 12px }`,
Kerben `.elementor-slider__scale { width: 1px; height: 21px }`, Bezeichner `font-size: 9px`,
Momentwert `.noUi-tooltip { font-size: 10px }`. Im v4-Stack: `packages/packages/libs/editor-controls/src/controls/size-control.tsx`
(Auswahl der Einheit am Feld, Sonderfall `custom`, Popover fuer eigene Werte, `min`),
`packages/packages/libs/editor-controls/src/components/number-input.tsx` (sperrt `e`, `E`, `+` und bei
`min >= 0` auch `-`, stellt bei ungueltiger Eingabe den letzten gueltigen Wert wieder her).

**Entscheidung: uebernehmen, abwandeln.** Uebernommen wird der Kern: ein Feld vereint Spur, Zahl und
Einheit, der Wertebereich gilt je Einheit, das Zahlfeld bleibt der genaue Weg, die Momentanzeige erscheint
waehrend des Ziehens. Abgewandelt wird die Form: Griff 12px und Radius 0 statt 16px rund, Wertblase ueber
dem Griff statt Tooltip unter der Spur, Spurflaeche 24px hoch als Trefferflaeche (WCAG 2.5.8), Einheit als
Auswahl am Feld statt als Radiozeile.
**Begruendung.** Die Rubrik "Werkzeug" verlangt harte Kanten (Grundsatz 4 in `ui-design.md`), und ein
zierlicher runder Griff ist die Zierform, die wir ausschliessen. Die Trefferflaeche ist bei Elementor
nur 16px hoch und damit unter der Grenze.

### 2 Farbwaehler mit Deckkraft und Palette

**Beleg.** `includes/controls/color.php`: `get_default_settings()` setzt `alpha => true`, `scheme` und
`global => active => true`, der Rumpf rendert nur `.elementor-color-picker-placeholder` (der Waehler
kommt aus dem Skript). `assets/dev/scss/editor/_color-picker.scss`: `.pcr-app[data-theme=monolith]{ width: 270px }`,
`.pcr-color-palette { height: 150px }`, Deckkraft und Farbton je `height: 8px`, `.pickr { height: 27px }`,
die Werkzeuge `.e-control-tools`/`.e-control-tool { width: 20px; height: 20px; border-radius: 3px }`,
und der Sonderfall "kein Wert": `.e-control-color--no-value .pcr-button` mit Schraegstrich als Zeichnung.
Im v4-Stack: `packages/packages/libs/editor-controls/src/controls/color-control.tsx` (Feld klein, Ausrichtung
des Popovers an der Zeile, `ControlActions` als Werkzeugspalte), und fuer den Verlauf
`packages/packages/core/editor-editing-panel/src/utils/get-recently-used-styles.ts` (liest die tatsaechlich
gesetzten Eigenschaften und gibt sie als Liste zurueck).

**Entscheidung: uebernehmen, abwandeln.** Uebernommen werden Deckkraft immer, die Farbflaeche mit
Farbton- und Deckkraftstreifen, die Palette der Themensignale und "Zuletzt" als Verlauf der zuletzt
gesetzten Werte. Abgewandelt: Platte 240px statt 270px, Streifen 12px statt 8px, Felder eckig mit
Radius 4 nur fuer das Farbfeld, Alt-Klick setzt den Tokenwert `{ $token: ... }` statt einer Farbvariable.
**Begruendung.** Der Deckkraftstreifen von 8px ist unter der Trefferflaeche, mit der ein Ziehgriff
bedient wird, und ein Gradientenfeld ohne Kante ist auf dunklem Grund nicht ablesbar;
`--ed-line-control` sichert hier die 3:1-Kennzeichnung.

### 3 Reiner Umschalter

**Beleg.** `includes/controls/switcher.php`: `label_off => 'No'`, `label_on => 'Yes'`,
`return_value => 'yes'`; der Rumpf schreibt die beiden Beschriftungen als Attribute
`data-on="{{ data.label_on }}"` und `data-off="{{ data.label_off }}"` auf `.elementor-switch-label`.
`assets/dev/scss/editor/panel/controls/_switcher.scss`: `.elementor-switch { height: 20px; border-radius: 18px }`,
`.elementor-switch-handle { width: 18px; height: 18px; border-radius: 10px }`,
`.elementor-switch-label { transition: 0.15s ease-out; transition-property: opacity, background }`,
eingeschaltet `background: var(--e-a-btn-bg-primary)`; die beiden Texte sitzen als `:before` und `:after`
mit `opacity 0/1` im Innern und tragen `font-size: 10px`.

**Entscheidung: abwandeln, in einem Punkt verwerfen.** Uebernommen wird der reine Umschalter mit
Deckkraftwechsel und einem Knopf, der die Seite wechselt (bei Elementor `inset-inline-start` auf
`auto`/`1px`). Abgewandelt: 32x18px statt 20px hoch, Bahn `rgb(154 201 226 / 0.26)`, Uebergang 160ms
auf `transform` statt `0.15s` auf `inset-inline-start` (Position ist eine Layout-Eigenschaft, `transform`
nicht). **Verworfen** wird die Beschriftung im Innern (`data-on`/`data-off`).
**Begruendung.** Zwei Woerter in 10px auf 20px Hoehe sind bei der Dichte eines Werkzeugpanels nicht
lesbar; der Zustand liegt deshalb im Formwechsel (Knopfseite, Bahnfarbe), die Beschriftung steht links.

### 4 Auswahlfeld, Auswahlkacheln, Bildauswahl

**Beleg.** `includes/controls/select.php`: `options` und `groups` mit `optgroup label="..."` (Gruppen
sind also vorgesehen). `includes/controls/choose.php`: Radios als Knoepfe mit `options.icon`, jedes
Label traegt `tooltip-target` und `data-tooltip="{{ options.title }}"`, dazu
`elementor-screen-only`-Text. `includes/controls/visual-choice.php`: Kachelraster mit
`--elementor-visual-choice-columns`, `toggle`, Bild oder Knopf je Option, ebenfalls `tooltip-target` und
`elementor-screen-only`.

**Entscheidung: uebernehmen, abwandeln.** Uebernommen werden Gruppen im Menue, ein Symbol je Zeile,
Tooltip-Pflicht fuer Nur-Symbol-Ziele und ein vorlesbarer Text, der dem sichtbaren Label entspricht.
Abgewandelt: die gewaehlte Zeile traegt 14% Tiefwasser-300-Flaeche und einen Haken, nicht nur eine
Farbflaeche.
**Begruendung.** WCAG 1.4.1: der Zustand darf nicht allein an der Farbe haengen; Elementors
`i.e-tab-active`-Flaechenwechsel ist hier der schwaechere Weg.

### 5 Vierfach-Werte

**Beleg.** `includes/controls/dimensions.php`: `get_default_value()` fuehrt `top`, `right`, `bottom`,
`left`, `isLinked`; `allowed_dimensions` sperrt einzelne Kanten (`disabled`), je Kante ein
`<input>` mit `elementor-control-dimension-label` und der Kettenknopf
`.elementor-link-dimensions.tooltip-target[data-tooltip="Link values together"]` mit zwei Symbolen
(`eicon-link` / `eicon-chain-broken`). `assets/dev/scss/editor/panel/controls/_dimensions.scss` zieht das
Aussehen aus `_controls-utility.scss`. Im v4-Stack:
`packages/packages/libs/editor-controls/src/controls/linked-dimensions-control.tsx` loest die Verkettung
anders: verkettet wird auf einen einzelnen Wert umgeschaltet, geloest auf vier, und die Kanten sind
logisch benannt (`block-start`, `inline-end`, `block-end`, `inline-start`) mit RTL-Spiegelung und
`aria-label` "Margin top" und so weiter.

**Entscheidung: uebernehmen, abwandeln.** Uebernommen werden Verkettung mit einem Knopf, Kantenzeichen
statt Beschriftung, `aria-label` je Kante, Sperren einzelner Kanten und RTL-Spiegelung. Abgewandelt:
vier Felder in **einer** Zeile (unser Sollbild) statt zwei Reihen, und der geloeste Zustand schreibt nur
in das eine Feld.
**Begruendung.** Zwei Reihen kosten 32px Hoehe je Abstandsgruppe; bei einem Panel mit vielen
Abstandsgruppen entscheidet das ueber die Zahl der sichtbaren Zeilen. Die logischen Kantennamen von v4
uebernehmen wir als Datenmodell, die Anzeige bleibt oben/rechts/unten/links, weil der Editor einseitig
deutsch und LTR ist.

### 6 Wiederholfeld

**Beleg.** `includes/controls/repeater.php`: `fields`, `title_field`, `prevent_empty`, `min_items`,
`max_items`, `item_actions` (`add`, `duplicate`, `remove`, `sort`), `validate()` wirft einen Fehler, wenn
`min_items` ohne passenden Standardwert gesetzt ist. `assets/dev/scss/editor/panel/controls/_repeater.scss`:
Zeilenwerkzeuge `.elementor-repeater-row-tools > button { height: 40px }`, Sortiergriff
`.elementor-repeater-row-handle-sortable { width: 10px; cursor: move }`, jede Werkzeugspalte 40px breit,
und zwei Sperrzustaende: `.elementor-repeater-has-minimum-rows .elementor-repeater-tool-remove { display: none }`
sowie `.elementor-repeater-has-maximum-rows .elementor-repeater-tool-duplicate, .elementor-repeater-add { display: none }`.
Im v4-Stack baut `packages/packages/libs/editor-controls/src/controls/repeatable-control.tsx` die Zeile aus
`Item` plus `DuplicateItemAction`, `DisableItemAction`, `RemoveItemAction`, `ItemsContainer isSortable`
und oeffnet den Inhalt in `EditItemPopover`; ein Muster `patternLabel` mit `${...}`-Platzhaltern erzeugt
die Zeilenbeschriftung.

**Entscheidung: uebernehmen, abwandeln.** Uebernommen werden Werkzeuge je Zeile, Zaehler, das Sperren der
Werkzeuge an der Mindest- und Hoechstgrenze, Sortieren durch Ziehen und das Bearbeiten des Inhalts in einer
schwebenden Platte statt in der Zeile. Abgewandelt: Zeile 32px statt 40px, Sortiergriff 12px, Zaehler
tabellarisch als "3 von 8".
**Begruendung.** Eine 40px-Zeile mit drei 40px-Werkzeugspalten ist bei 320px Panelbreite kaum nutzbar;
die Zeile soll Name und Wert tragen, alles Weitere in der Platte.

### 7 Medienwahl

**Beleg.** `includes/controls/media.php`: `media_types` (Standard `['image']`, dazu `video`, `svg`),
`has_sizes` blendet eine Bildgroessen-Auswahl ein (`get_image_sizes()`), der Rumpf baut
`.elementor-control-media__content` mit `__remove` (Papierkorb), `__content__upload-button` (Plus),
`__tools` mit je einem `__replace`-Ziel je Typ und Beschriftung "Choose Image" / "Choose Video" /
"Choose SVG", dazu ein Leerzustand `__file` "Click the media icon to upload file". Eine auskommentierte
Alt-Text-Warnung steht im Rumpf (`This image doesn’t contain ALT text`). `assets/dev/scss/editor/panel/controls/_media.scss`:
`.elementor-control-media-area { aspect-ratio: 21 / 9 }`, `@include checkers-background(16px)` fuer
Transparenz, Werkzeugstreifen `.elementor-control-media__tools { height: $control-unit }` also 27px,
`transition: all .2s ease-in-out`, Loeschknopf `20px` oben rechts mit `rgba(0,0,0,.5)`,
Videozeichen 21px, Werkzeugstreifen faehrt aus (`inset-block-end: -30px` bei nicht Ueberfahren).

**Entscheidung: uebernehmen, abwandeln.** Uebernommen werden die Flaeche mit festem Seitenverhaeltnis,
der Bildgroessen-Anhang, Getrenntes fuer "Entfernen" und "Ersetzen", ein sichtbarer Leerzustand mit
Handlung und die Alt-Text-Pruefung. Abgewandelt: kein Ausfahren des Werkzeugstreifens (er steht fest),
Uebergaenge 120ms statt 200ms, eckige Flaeche, Loeschknopf 24px Trefferflaeche.
**Begruendung.** Ein Streifen, der erst beim Ueberfahren unter dem Bild hervorkommt, ist auf einem
Notebook ohne Zeiger (Tastaturbedienung) nicht erreichbar; die Werkzeuge bleiben stehen. Die
Alt-Text-Pruefung ist bei `design-guidelines.md` und im Redesign-Auftrag ohnehin gefordert.

### 8 Typografie-Gruppe

**Beleg.** `includes/controls/groups/typography.php`: `init_fields()` fuehrt `font_family` (Typ `FONT`),
`font_size` (Typ `SLIDER`, Einheiten `px, em, rem, vw, custom`, `range` je Einheit, `responsive => true`),
`font_weight` (Typ `SELECT` mit Stufen 100 bis 900 und `Default`/`Normal`/`Bold`), `text_transform`,
`font_style`, `text_decoration`, `line_height` (Einheiten `px, em, rem, lh, rlh, custom`),
`letter_spacing` (`px -5..10 step 0.1`, `em/rem 0..1 step 0.01`), `word_spacing`; dazu
`add_font_variables_fields()` mit variablen Schriften als `SLIDER` und `condition`
(`'font_family' => [ ... ]`, `'font_family!' => [ ... ]`). `get_default_options()` setzt
`'popover' => [ 'starter_name' => 'typography', 'starter_title' => 'Typography' ]`, und
`groups/base.php :: start_popover()` legt dafuer einen `POPOVER_TOGGLE` mit `return_value` an, setzt
`groupPrefix` und danach `end_popover()`. `prepare_fields()` haengt je Feld
`selectors => ['{{SELECTOR}}' => $selector_value]` an. Der Reset liegt in `popover-toggle.php`: zwei
Radios, eines fuer "eigener Wert" (`eicon-edit`), eines fuer "Back to default" (`eicon-undo`,
`data-tooltip="Back to default"`).

**Entscheidung: uebernehmen.** Uebernommen werden die Gruppe als eine aufklappbare Einheit mit eigenem
Reset, feste Vorgaben je Feld, die Einheiten je Feld, `condition` fuer abhaengige Felder (variable
Schriftgrade) und die Gruppe als Ganzes schaltbar.
**Begruendung.** Eine Typografie-Gruppe ist die richtige Ebene: die acht Einzelfelder waeren als
acht Zeilen zu viel, und der Reset der ganzen Gruppe ist die Haupthandlung "zuruecksetzen", nicht das
einzelne Feld.

### 9 Bedingungen

**Beleg.** `includes/conditions.php` ist die ganze Vergleichslogik: `compare()` kennt `==`, `!=`, `!==`,
`in`, `!in`, `contains`, `!contains`, `<`, `<=`, `>`, `>=`, sonst strikte Gleichheit; `check()` liest
`relation` (`or` gegen Standard `and`) und laeuft `terms` durch, wobei ein Term selbst wieder `terms`
tragen darf (Verschachtelung) und Namen der Form `name[key]` ueber einen regulaeren Ausdruck zerlegt
werden. `includes/controls/groups/base.php` verankert das in Gruppen:
`add_condition_prefix()` und `add_conditions_prefix()` schreiben den Gruppennamen vor die Feldnamen,
`prepare_fields()` fuehrt `condition` und `conditions` zusammen. Im v4-Stack ist es ein Datenvertrag statt
einer Pruefung: `packages/packages/core/editor-editing-panel/src/controls-registry/conditional-field.tsx`
liest `propType.dependencies.terms`, ruft `isDependencyMet`, rendert bei Nichterfuellung `null` und
setzt ueber `resetValue()` den Wert zurueck, wenn eine Abhaengigkeit gekappt wird. Dieselbe Datei zeigt
im `useSyncDepsWithInherited`-Block, dass geerbte Werte (Gerätepunkt!) die Abhaengigkeit erfuellen und
dann in das lokale Feld geschrieben werden.

**Entscheidung: uebernehmen, abwandeln.** Uebernommen werden die elf Vergleiche, UND/ODER mit
Standard `and`, verschachtelte Terme, das Verstecken abhaengiger Felder und der Reset beim Kappen.
Abgewandelt: die Bedingung wird nicht nur versteckt, sondern es wird gezeigt, dass eine Bedingung
gesetzt ist (Zeile mit Auswahl, Token-Feld und Chip; leere Bedingung in `--ed-ink-faint` plus
Beschriftung).
**Begruendung.** Ein Feld, das lautlos verschwindet, ist nach dem naechsten Reload nicht wiederzufinden;
der sichtbare Zustand ist der Unterschied zwischen "kein Wert" und "wegen einer Bedingung kein Wert" und
damit der haeufigste Supportfall in Elementor-Foren. Deshalb der Anteil "Zustand wird sichtbar gemacht".

### 10 Zuruecksetzen

**Beleg.** `includes/controls/popover-toggle.php` (siehe 8): der Reset liegt als eigenes Ziel neben dem
Feld, mit Symbol und Tooltip. Im v4-Stack ist er eine registrierte Aktion:
`packages/packages/core/editor-editing-panel/src/reset-style-props.tsx` registriert in
`controlActionsMenu` die Aktion `reset-style-value` mit `title: "Clear"`, `BrushBigIcon` und
`registerAction`, und `useResetStyleValueProps()` berechnet die Sichtbarkeit:
`visible = false` bei fehlendem Wert, bei `settings.hide_reset`, bei einer Variable, die es nicht mehr
gibt; sonst `!isEqual(value, propType.initial_value)` oder `!isRequired`. Das heisst: der Reset erscheint
nur, wenn der Wert wirklich vom Standard abweicht.

**Entscheidung: uebernehmen, abwandeln.** Uebernommen wird genau dieser Sichtbarkeitsvertrag (kein Reset
bei Standardwert und keiner bei gesperrter Eigenschaft) und die Ausfuehrung als Aktion.
Abgewandelt: der Ort ist das Zeilenkontextmenue am Feld (Kuersel `Cmd+Shift+Backspace`), nicht ein
Doppelradio links neben dem Feld.
**Begruendung.** Ein immer sichtbarer Zuruecksetzen-Knopf macht jede Zeile um ein Ziel schwerer
lesbar und verleitet zum versehentlichen Leeren; unser Grundsatz 10 in `ui-design.md` verlangt
"keine Zierrate", und ein wirkungsloser Knopf ist Zierrat.

### 11 Geraeteumschaltung

**Beleg.** `packages/packages/core/editor-app-bar/src/extensions/responsive/components/breakpoints-switcher.tsx`
baut die Umschaltung aus `Tabs`, je Station ein Symbol (`WidescreenIcon`, `DesktopIcon`, `LaptopIcon`,
`TabletLandscapeIcon`, `TabletPortraitIcon`, `MobileLandscapeIcon`, `MobilePortraitIcon`), ein
**Hinweis (O10, 17.09.):** Das ist die Referenz von Elementor. Senify kennt bewusst **drei**
Stationen (desktop/tablet/mobile, ui-plan 5.13); die sieben Symbole sind Anschauungsmaterial, keine
Senify-Festlegung.
`aria-label` "Switch Device" an der Gruppe, ein `aria-label` je Station aus `labelsMap` mit
`'%s (%dpx and up)'` fuer `min-width` und `'%s (up to %dpx)'` fuer `max-width`, und ein
`data-testid="switch-device-to-<id>"`. Daneben steht in v3 eine eigene Geräteleiste:
`assets/dev/scss/editor/_responsive-bar.scss` mit `#elementor-responsive-bar { height: calc(40px * var(--e-is-device-mode)) }`
und `transition: height .2s ease-in-out, opacity .1s`, je Gerät ein Ziel 22x22px mit
`border-radius: 3px`, Groessenfelder 60x18px, Zoom `&__plus, &__minus, &__reset { width: 20px; height: 20px }`
und Wert `min-width: 32px`, `margin: 0 14px`.

**Entscheidung: uebernehmen, abwandeln.** Uebernommen werden die Gerätestationen mit Breite in der
Beschriftung, ein `aria-label` an der Gruppe und je Station, und die Zoomgruppe mit Wert und Einpassen.
Abgewandelt: die Stationen liegen als Segment 32px in der Kopfleiste (unser Sollbild), nicht als zweite
Leiste unter dem Rahmen, und die Zoomgruppe sitzt in der Werkzeugleiste, nicht in der Geräteleiste.
**Begruendung.** Zwei Leisten ueber der Buehne kosten 40px Hoehe dauerhaft und machen aus einem Werkzeug
eine Staffelei; `_responsive-bar.scss` zeigt zudem genau den Fehler, den wir vermeiden: eine Hoehe, die
von einem Schalter abhaengt und deshalb animiert werden muss.

---

## B. Einstellungsaufbau

### 12 Tabs, Abschnitte, Gruppierung

**Beleg.** `includes/controls/tabs.php` und `tab.php` sind reine Geruesttypen (`Base_UI_Control`,
`content_template()` leer), `section.php` rendert `<button class="elementor-panel-heading">` mit
`.elementor-section-toggle` (Dreieck) und `.elementor-section-title`, also einen echten Knopf mit
Dreieck als Aufklapper. `assets/dev/scss/editor/panel/_controls.scss`:
`.elementor-control { padding: 0 20px 15px }`, `--control-title-size: 12px`, Trenner ueber
`&.elementor-control-separator-before { padding-block-start: 15px }` mit 1px Linie auf
`inset: 0 20px auto`, und `.elementor-panel-heading { height: 48px; padding-inline: 20px }` mit
`.elementor-panel-heading-toggle i { transform: rotate(90deg) }` im offenen Zustand.
`assets/dev/scss/editor/panel/controls/_tabs.scss`: Tab als `width: 100%` in einer Zeile, erster und
letzter Tab mit Radius, `.e-tab-active { background-color: var(--e-a-bg-active-bold) }`.
Im v4-Stack: `packages/packages/core/editor-editing-panel/src/components/editing-panel-tabs.tsx`
nutzt `Tabs variant="fullWidth" size="small"`, drei Tabs (General, Style, Interactions), eine `Divider`,
und merkt den letzten Tab ueber `useStateByElement('tab', defaultComponentTab)`;
`style-tab-section.tsx` liest `useDefaultPanelSettings().defaultSectionsExpanded.style` und gibt den
Aufklappzustand an `Section` weiter.

**Entscheidung: uebernehmen, abwandeln.** Uebernommen werden Tabzeile mit Unterkante, je Panel ein
gemerkter Zustand, Abschnittskopf als Knopf mit Dreieck und gemerkter Aufklappzustand je Abschnitt.
Abgewandelt: Tabzeile 36px statt 48px, aktive Unterkante Lime 2px, Abschnittskopf 32px statt 48px.
**Begruendung.** 48px pro Abschnittskopf heisst bei acht Abschnitten 384px, also mehr als die halbe
Panelhoehe ohne einen einzigen Wert; die Verdichtung ist der Zweck der Werkzeugdichte 7.

### 13 Suche (Finder, Spotlight)

**Beleg.** `packages/packages/core/editor-app-bar/src/extensions/finder/hooks/use-action-props.ts`:
`title: "Finder"`, `SearchIcon`, `runCommand('finder/toggle')`; die Flaeche selbst liegt im Modul
`core/common/modules/finder/assets/js/component.js` mit `modal/views/categories.js`, also mit
Kategorien in der Trefferliste.

**Entscheidung: uebernehmen, abwandeln.** Uebernommen werden eine eigene Suchflaeche mit Kategorien in
der Liste und ein Kuerzel zum Oeffnen. Abgewandelt: unser Spotlight oeffnet ohne Uebergang, laeuft mittig
oben, fenstert die Trefferliste und druckt je Treffer das Kuerzel aus.
**Begruendung.** Der Grund fuer "ohne Uebergang" steht in `ui-design.md` und ist belegt
(emil-design-eng, "keine Animation fuer Tastaturvorgaenge"); Elementors Finder animiert und ist
deshalb bei hundert Aufrufen am Tag langsamer als noetig.

### 14 Favoriten

**Beleg.** Kein Fund. Die Bausteinliste kennt Kategorien (`assets/dev/scss/editor/panel/_categories.scss`),
eine Favoritenliste erscheint im Repo nicht.

**Entscheidung: verwerfen (als Pflicht), offen (als Moeglichkeit).** Favoriten sind nicht belegt und
deshalb keine Pflichtaufgabe; die Kategorien sind belegt und werden uebernommen.
**Begruendung.** Belegpflicht: Ohne Datei und ohne Bedienbeleg waere "Favoriten" eine Erfindung, und
eine erfundene Funktion ist teurer als eine fehlende.

### 15 Verlauf und Rueckgaengig

**Beleg.** `packages/packages/core/editor-app-bar/src/extensions/history/hooks/use-action-props.ts`:
`title: "History"`, `HistoryIcon`, `openRoute('panel/history/actions')`, `selected: isActive` und
`disabled: isBlocked` aus `useRouteStatus('panel/history')`. Dazu `modules/history/assets/js/history/component.js`
und `modules/history/assets/js/revisions/component.js`. Fuer den Stilverlauf:
`packages/packages/core/editor-editing-panel/src/utils/get-recently-used-styles.ts`.
In `includes/editor-templates/hotkeys.php` steht "History" mit `Cmd+Shift+H`.

**Entscheidung: uebernehmen, abwandeln.** Uebernommen werden Rueckgaengig und Wiederholen in der
Kopfleiste als Symbolknopf mit Deaktiviertzustand (bei Elementor `disabled: isBlocked`) und eine
Verlaufsliste mit Aktion und Zeit. Abgewandelt: Zeilen 28px, tabellarische Zeiten, "2 von 40" als
Zaehler, gefensterte Liste.
**Begruendung.** Der Deaktiviertzustand ist der Beleg dafuer, dass ein wirkungsloser Knopf sichtbar
deaktiviert wird und nicht verschwindet; das uebernehmen wir als Zustandsregel.

### 16 Kontextmenue am Element

**Beleg.** `assets/dev/js/editor/elements/views/behaviors/context-menu.js`: die Ereignisbindung laeuft
ueber `contextmenu` (`events()`), es gibt `groups` als Daten, `initContextMenu()` schiebt die Gruppe
`tools` mit dem Eintrag `navigator` ("Structure", `shortcut: controlSign + '+I'`) **vor** die Gruppe
`delete`, `controlSign` ist `⌘` oder `^` je Betriebssystem, beim Oeffnen wird `event.preventDefault()`
und `stopPropagation()` gerufen, das Sortieren der Elternliste wird abgeschaltet
(`toggleSortMode(false)`) und beim Schliessen wieder an (`true`), und wenn das Ziel nicht in der Auswahl
liegt, wird die Auswahl geleert (`$e.run('document/elements/deselect-all')`).
`assets/dev/scss/editor/_context-menu.scss`: `.elementor-context-menu { width: 250px; padding: 5px 0; z-index: 101 }`
(101, weil der Navigator bei 100 liegt), `&__item { padding: 12px 20px; display: flex; gap: 16px }`,
`&--disabled { opacity: .5 }`, `.elementor-context-menu-list__item__shortcut { color: var(--e-a-color-txt-muted) }`,
`&.elementor-context-menu-list__item-delete:hover > * { color: var(--e-global-color-danger) }`,
Gruppentrenner `&:not(:last-child) { border-block-end: var(--e-a-border) }`.

**Entscheidung: uebernehmen, abwandeln.** Uebernommen werden Gruppen mit Trennern, die Kuerselspalte
rechts, Loeschen in Rot mit unterlegter Flaeche, das Leeren einer fremden Auswahl beim Rechtsklick, das
Sperren des Sortierens waehrend das Menue offen ist, und der Navigator-Eintrag in einem eigenen
Werkzeugblock. Abgewandelt: Breite 200 bis 320px, Zeile 32px, Innenabstand 4px und Radius 8px, Eintritt
200ms aus dem Zeigerpunkt, Fokus faengt und gibt an den Ausloeser zurueck.
**Begruendung.** Zwei Punkte sind wichtig und fehlen in Elementor: Es animiert das Menue nicht aus dem
Zeigerpunkt (es erscheint zentriert), und es gibt keinen Tastaturvertrag fuer das Schliessen mit
Fokusruckgabe; beides ist bei uns Pflicht. Das Leeren der Auswahl beim Rechtsklick ist eine gute
Konvention und wird uebernommen, weil sie dem Nutzer erklaert, worauf sich die Handlung bezieht.

### 17 Doppelklick und Schreiben am echten Element

**Beleg.** `packages/packages/core/editor-canvas/src/legacy/replacements/inline-editing/canvas-inline-editor.tsx`,
`inline-editing-elements.tsx`, `inline-editing-eligibility.ts` und `inline-editing-utils.ts` bilden den
Schreibfluss im Rahmen, `assets/dev/scss/editor/preview/_inline-editor.scss` das Aussehen.

**Entscheidung: uebernehmen, abwandeln.** Uebernommen werden Doppelklick auf ein Element als Einstieg in
das Schreiben am echten Element und eine Zulassungspruefung, die entscheidet, ob ein Element ueberhaupt
schreibbar ist. Abgewandelt: kein Overlay und kein eigener Rahmen im Schreibzustand, nur der
Auswahlrahmen bleibt stehen; der ganze Schreibfluss zaehlt als ein Rueckgaengig-Schritt (unser
`coalesceKey`).
**Begruendung.** Ein zusaetzliches Textfeld ueber dem Inhalt zerbricht das Bild, weil Schrift und
Zeilenumbruch dann zweimal gerechnet werden; das Schreiben im Element ist genauer und billiger.

### 18 Mehrfachauswahl

**Beleg.** `packages/packages/libs/editor-elements/src/sync/get-selected-elements.ts` (Auswahl als
Menge), `assets/dev/js/editor/elements/views/behaviors/context-menu.js` (Leeren der Auswahl beim
Rechtsklick auf ein Element ausserhalb), `packages/packages/core/editor-editing-panel/src/sync/is-atomic-widget-selected.ts`
(Zustand "ist ausgewaehlt" als eigene Abfrage, nicht als lokale Kopie).

**Entscheidung: uebernehmen, abwandeln.** Uebernommen wird die Auswahl als eine Menge mit einer
einzigen Wahrheit (kein Kopiezustand in einem Panel) und die Regel, dass ein Rechtsklick auf ein
Element ausserhalb der Auswahl die Auswahl auf dieses Element setzt. Abgewandelt: unsere Bedienung
(Klick, Shift-Bereich, Strg/Cmd ergaenzen, Escape leeren), Kaestchen 14px vor jedem Namen und gemischte
Werte als "gemischt" im Feld.
**Begruendung.** Der gemischte Wert ist der Punkt, den Elementor nicht zeigt: bei Mehrfachauswahl
stehen dort die Werte des ersten Elements; bei uns ist das ein falscher Wert ohne Warnung.

### 19 Kopieren und Einfuegen von Stilen

**Beleg.** `packages/packages/core/editor-canvas/src/style-commands/paste-style.ts`: hoert auf
`document/elements/paste-style`, liest `getClipboardElements()`, uebernimmt vom Quellknoten zuerst die
**Klassen ohne lokalen Stil** (`getClassesWithoutLocalStyle`) und dann den lokalen Stil
(`pasteLocalStyle`), und entdoppelt die Klassen ueber `Array.from(new Set([...classes, ...currentClasses]))`.
`reset-style.ts` ist das Gegenstueck (`document/elements/reset-style`).
`packages/packages/core/editor-interactions/src/commands/paste-interactions.ts` uebertraegt Animationen.
In `includes/editor-templates/hotkeys.php` steht "Paste Style" mit `Cmd+Shift+V`.

**Entscheidung: uebernehmen.** Uebernommen werden ein eigenes Kommando "Stil einfuegen" mit eigenem
Kuerzel `Cmd+Shift+V`, die Reihenfolge "erst Klassen, dann lokaler Stil", das Entdoppeln und ein
Rueckgaengig-Schritt fuer den ganzen Vorgang.
**Begruendung.** Das Kuerzel ist belegt und in der Zielgruppe eingeuebt (dieselbe Belegung nutzen
Figma und Webflow), und die Klassen-vor-Stil-Reihenfolge ist die einzige Reihenfolge, die eine
Kaskade nicht doppelt schreibt.

---

## C. Arbeitsflaeche

### 20 Auswahlrahmen und Griffe

**Beleg.** `packages/packages/core/editor-canvas/src/components/outline-overlay.tsx`:
`outline: ${ isSelected ? '2px' : '1px' } solid ${ isGlobal ? global.main : primary.light }` mit
`outlineOffset: isSelected && !isSmallerOffset ? '-2px' : '-1px'` und `pointerEvents: 'none'`; das
Overlay rendert in ein `FloatingPortal` mit der Zielkennung `elementor-preview-responsive-wrapper`,
traegt `role="presentation"` und `data-element-overlay`, und verschwindet, wenn `useHasOverlapping()`
eine Verdeckung meldet. `use-floating-on-element.ts` setzt Groesse
(`rects.reference.width + 2`) und zentriert ueber `offset(...)`, mit `whileElementsMounted: autoUpdate`.
`use-element-rect.ts` drosselt auf `20` Millisekunden und beobachtet Scrollen, Groesse
(`ResizeObserver`) und Baumänderungen (`MutationObserver`).

**Entscheidung: uebernehmen, abwandeln.** Uebernommen werden: eine Linie im Ruhezustand und zwei im
Zustand "ausgewaehlt", das Verschieben der Linie um 1px nach innen, Groesse plus 2px, das Rechnen mit
gedrosselten Messungen statt bei jedem Ereignis, und das Anhaengen des Overlays ausserhalb des
Inhaltsbaums (Portal). Abgewandelt: ein Doppelstrich aus zwei festen Farben (aussen Tiefwasser 900 mit
55%, innen Tiefwasser 300) statt einer Themenfarbe, und Griffe 8px mit 24px Trefferflaeche.
**Begruendung.** Die Doppelkante ist unsere Loesung fuer das Problem, das Elementor mit zwei Themenfarben
loest: der Rahmen muss auf hellem und dunklem Inhalt gleichzeitig 3:1 erreichen. Mit einer festen
hellen und einer festen dunklen Linie erreicht immer eine von beiden die Grenze.

### 21 Abstandsregler durch Ziehen am Rahmen

**Beleg.** `packages/packages/libs/editor-controls/src/controls/gap-control.tsx` und
`selection-size-control.tsx` zeigen den Wert im Panel; am Rahmen ist die Geste in
`assets/dev/scss/editor/_resizable.scss` und `assets/dev/scss/editor/preview/_section.scss` angelegt.

**Entscheidung: uebernehmen, abwandeln.** Uebernommen wird, dass die Ziehgeste am Rahmen denselben Wert
schreibt wie das Feld im Panel (eine Wahrheit, zwei Wege). Abgewandelt: waehrend des Ziehens erscheint
ein Plaetzchen mit dem Wert in 11px Mono, und beim Loslassen ist der ganze Vorgang **ein**
Rueckgaengig-Schritt.
**Begruendung.** Ziehen erzeugt dutzende Zwischenwerte; ohne Zusammenfassen ist die Rueckgaengig-Kette
nach einer Sekunde Ziehen unbrauchbar.

### 22 Lineal und Hilfslinien

**Beleg.** Kein Fund im Repo. Grep nach `ruler` ueber `Repos/elementor-main` (ohne `vendor*`) liefert nur
`assets/lib/font-awesome/**` und `modules/mcp/static-resources/abilities/list-resources.md`; Grep nach
`guides` und `snapTo` in `modules/` liefert nichts.

**Entscheidung: verwerfen als Elementor-Erkenntnis, beibehalten als eigene Festlegung.** Es wird nichts
uebernommen, weil es nichts zu belegen gibt. Die Werte des Lineals (24px Hoehe, Marken alle 80px,
`Shift+R`/`Shift+G`) bleiben eine eigene Festlegung und sind in `ui-design.md` Abschnitt 3.10 als Quelle
Webflow gefuehrt, nicht Elementor.
**Begruendung.** Belegpflicht: Eine Elementor-Erkenntnis ohne Elementor-Datei waere eine falsche
Zuordnung, und falsche Zuordnungen wandern in spaetere Sitzungen als Wahrheit weiter.

### 23 Raster und Einrasten

**Beleg.** `packages/packages/core/editor-canvas/src/components/grid-outline/grid-outline.tsx`: ein
`<svg>` in der Groesse des Elements, Zellen bei Spalten- oder Zeilenabstand (`hasGap`) sonst Linien, und
alle Koordinaten laufen durch `snapToHalfPixel`; die Zellen werden in der Reihenfolge der ersten
leeren Zelle ergaenzt (`findFirstEmptyCell`), und die Hilfen verschwinden, wenn im Inhalt gezogen wird
(`isDragActiveFromDom` prueft `.e-dragging-over`, `.elementor-widget-placeholder` und weitere Klassen).
`components/grid-outline/line.tsx`: `strokeWidth={1}`, `strokeDasharray="2 2"`,
`vectorEffect="non-scaling-stroke"`, Rueckfallfarbe `rgba(0, 0, 0, 0.12)`.
`utils/grid-outline-utils.ts` traegt `computeGridLines`, `computeCellRects` und `snapToHalfPixel`.

**Entscheidung: uebernehmen, abwandeln.** Uebernommen werden die gestrichelte 1px Hilfe, das Zeichnen
ausserhalb des Inhalts (SVG mit `pointer-events: none`), das Ausblenden waehrend eines Ziehvorgangs und
`snapToHalfPixel` gegen Verwackeln. Abgewandelt: die Farbe ist `--ed-signal-select` bei 35% statt
Schwarz bei 12% (auf dunklem Grund und auf weissem Inhalt gleich sichtbar), und das Raster liegt auf
dem 4px-Takt mit Einrasten in 4px-Schritten.
**Begruendung.** `vectorEffect="non-scaling-stroke"` ist der wertvollste Einzelpunkt der Datei: bei
Zoom bleibt die Hilfslinie 1 Bildpunkt dick und wird nicht zu einem Balken. Das uebernehmen wir als
Pflicht fuer alle Canvas-Hilfen.

### 24 Zoom

**Beleg.** `assets/dev/scss/editor/_responsive-bar.scss`: `&__scale { padding: 0 20px }` mit
`&__value-wrapper { margin: 0 14px; min-width: 32px }` und
`&__plus, &__minus, &__reset { cursor: pointer; width: 20px; height: 20px }`; die Skalierung des
Inhalts laeuft ueber `transform: scaleX(var(--e-preview-scale, 1))` in `#elementor-responsive-bar:before`
und `assets/dev/scss/editor/_devices.scss`.

**Entscheidung: uebernehmen, abwandeln.** Uebernommen werden der Zahlenwert mit Umbruchschutz
(`min-width`), getrennte Ziele fuer kleiner, groesser und einpassen, und die Skalierung des Inhalts ueber
eine CSS-Variable statt ueber neue Groessen. Abgewandelt: Zoom steht in der Werkzeugleiste und in der
Statusleiste (0,25 bis 2,0, `Cmd+0` setzt zurueck, `Shift+1` passt ein), nicht in einer Geräteleiste.
**Begruendung.** `min-width: 32px` ist ein Detail mit Wirkung: ohne es springt die ganze Leiste mit
jedem Wechsel zwischen "100 %" und "9,5 %"; das uebernehmen wir als Regel fuer jede Wertanzeige.

### 25 Vorschau-Zustaende und Platzhalter

**Beleg.** `assets/dev/scss/editor/preview/_animations.scss`:
`@keyframes placeholder-section { 0% { height: 0; opacity: 0 } 100% { height: 40px; opacity: .9 } }`,
`@keyframes placeholder-widget` mit `height: 10px` und `@keyframes section-outline { 0% { opacity: 0 } 100% { opacity: 1 } }`;
`$section-placeholder-size: 40px` und `$widget-placeholder-size: 10px`.

**Entscheidung: uebernehmen, abwandeln.** Uebernommen wird die Idee, den Einfuegeort als eigene Flaeche
mit festen Groessen zu zeigen (Lichtkante oben genuegt, kein Rahmen). Abgewandelt: der Platzhalter waechst
nicht ueber `height` (Layout-Eigenschaft), sondern erscheint mit `opacity` und einer Linie in Lime, und
er ist 2px hoch als Einfuegemarke plus eine 40px Zone als Ziel.
**Begruendung.** `animation` auf `height` erzwingt Layout bei jedem Bild und ruckelt bei langen Seiten;
unser Grundsatz "es bewegen sich nur `transform` und `opacity`" ist hier die Abhilfe.

### 26 Baum-Navigation

**Beleg.** `assets/dev/scss/editor/navigator/navigator.scss`: Breite `240px`, Hoehe `50vh`,
`.elementor-navigator__item { height: 30px }` mit `&:hover, &:focus { background-color: var(--e-a-bg-hover) }`
und `&[data-locked="true"] { cursor: not-allowed }`; Zustandssymbole liegen in einer Spalte, die sich
bei nicht Ueberfahren wegzieht:
`&__indicators:not(:hover) { transform: translateX(calc(100% * var(--direction-multiplier) - (var(--e-editor-navigator-indicator-width) * var(--direction-multiplier)))) }`
mit `--e-editor-navigator-indicator-width: 3px` und je Ziel `width: 31px`; Aufklappen dreht das Dreieck
(`transform: rotate(calc(-90deg * var(--direction-multiplier)))`); der Titel ist schreibbar
(`&__text[contenteditable="true"] { outline: none; background-color: var(--e-a-bg-hover) }`);
versteckte Elemente liegen auf `opacity: .5`; beim Ziehen rotiert die Ziehfigur
(`.ui-sortable-helper { transform: rotate(4deg) }`) und der Einfuegeort ist eine Flaeche
(`.ui-sortable-placeholder { background-color: var(--e-a-bg-hover) }`); in der angedockten Fassung
sitzt der Baum rechts mit `height: 100%`.

**Entscheidung: uebernehmen, abwandeln.** Uebernommen werden Umbenennen im Titel mit
`contenteditable` und ohne Rahmen im Ruhezustand, der Dreh des Aufklapp-Dreiecks, `not-allowed` bei
gesperrten Ebenen, verminderte Deckkraft bei versteckten Ebenen und die verschiebbare Zustandsspalte
(nur bei Ueberfahren sichtbar). Abgewandelt: Zeile 28px statt 30px, Explorer 264px statt 240px,
Angedockt statt schwebend, Zustandssymbole immer rechts sichtbar (nicht verschoben), und bei vielen
Ebenen wird gefenstert.
**Begruendung.** Eine Zustandsspalte, die sich wegzieht, ist eine Bewegung, die bei jedem
Mausschwenk ueber 40 Zeilen laeuft; bei uns stehen die Symbole still, weil eine versteckte Ebene
selbst das Signal ist. Die Rotation der Ziehfigur verwerfen wir: sie ist ein Kostuemeffekt ohne
Bedeutung.

---

## D. Animation und Bewegung

### 27 Werte

**Beleg (v3, echte Pixel- und Zeitwerte).**
`assets/dev/scss/helpers/variables.scss`: `$transition-hover: all .3s`, `$default-border-radius: 3px`,
`$control-unit: 27px`, `$panel-width: 280px`, `$panel-xl-width: 300px`, `$element-overlay: 9998`,
`$editor-layer: 9999`.
`assets/dev/scss/direction/theme-dark.scss`: `--e-a-transition-hover: all .3s`,
`--e-a-popover-shadow: 0 2px 15px rgba(0, 0, 0, 0.9)`, `--e-a-dropdown-shadow: 0 0 3px rgba(0, 0, 0, 0.9)`
(die helle Fassung in `theme-light.scss` ist identisch bis auf 0.3).
`assets/dev/scss/editor/panel/controls/_switcher.scss`: `transition: 0.15s ease-out`.
`assets/dev/scss/editor/_mode-switcher.scss`: `transition: .3s opacity`.
`assets/dev/scss/editor/_responsive-bar.scss`: `transition: height .2s ease-in-out, opacity .1s`.
`assets/dev/scss/editor/panel/controls/_media.scss`: `transition: all .2s ease-in-out` und `.3s`.
`assets/dev/scss/editor/_animations.scss`: die Schluesselbilder `load`, `fadeIn`, `mover`, `slideDown`.
`assets/dev/scss/editor/navigator/navigator.scss`: `transition: padding .5s linear`,
`transition: transform .3s`, `transition: color .5s`.

**Beleg (v4, Animationspanel).** `packages/packages/core/editor-interactions/src/configs/time-constants.ts`:
`TIME_UNITS = [ 's', 'ms' ]`, `DEFAULT_TIME_UNIT = 'ms'`.
`packages/packages/core/editor-interactions/src/components/interaction-details.tsx`:
`DEFAULT_VALUES = { trigger: 'load', effect: 'fade', duration: 600, delay: 0, easing: 'easeIn', start: 85, end: 15, ... }`
und die Regel "Replay nur bei Ausloesern ausserhalb von load" (`TRIGGERS_WITHOUT_REPLAY`).
`packages/packages/core/editor-interactions/src/components/controls/easing.tsx`:
sieben Kurven `easeIn, easeInOut, easeOut, backIn, backInOut, backOut, linear`, Basis frei, Rest gesperrt.

**Entscheidung: uebernehmen (Struktur), abwandeln (Werte), verwerfen (eine Sache).**
Uebernommen werden: benannte Bewegungsstufen statt Zahlen im Bauteil, eine Einheitenwahl `ms`/`s`,
eine feste Kurvenliste, ein Vorgabewert fuer Dauer (600ms fuer Inhaltsbewegung im Canvas) und
Abhaengigkeitsregeln zwischen Animationsfeldern.
Abgewandelt: `all .3s` wird zu vier Stufen (120ms Ueberfahren, 160ms Druck, 200ms schwebende Platte,
240ms Panel und Blatt) mit benannten Kurven; die Canvasbewegung behaelt 600ms als Standard und
1200ms als Erscheinen.
**Verworfen** wird `transition: all`, weil es Layout-Eigenschaften mitanimiert und damit genau die
Ruckler erzeugt, die unser Bewegungsgrundsatz ausschliesst.
**Begruendung.** 300ms liegt ueber dem, was ein Werkzeug bei jeder Zeile vertraegt; 1200ms waere fuer
einen Knopf eine Bremse, fuer das Erscheinen einer Seite aber richtig. Deshalb zwei Wahrheiten mit
klarer Abgrenzung.

---

## E. Barrierefreiheit und Tastatur

### 28 Kuerzelverzeichnis

**Beleg.** `includes/editor-templates/hotkeys.php`: eine eigene Vorlage `tmpl-elementor-hotkeys` mit
drei Spalten (Actions, Panels, Go To), je Eintrag `elementor-hotkeys__item--label` und
`--shortcut` mit `<kbd>` je Taste, Mac-Beschriftung `&#8984;` gegen `Ctrl`, und diese Belegungen:
Undo `Cmd+Z`, Redo `Cmd+Shift+Z`, Copy `Cmd+C`, Paste `Cmd+V`, **Paste Style `Cmd+Shift+V`**,
Delete `Delete`, Duplicate `Cmd+D`, Save `Cmd+S`, Finder `Cmd+E`, Panel zeigen/verstecken `Cmd+P`,
Site Settings `Cmd+K`, **Structure `Cmd+I`**, Page Settings `Cmd+Shift+Y`, **History `Cmd+Shift+H`**,
Responsive Mode `Cmd+Shift+M`, Template Library `Cmd+Shift+L`, Keyboard Shortcuts `Shift+?`,
Quit `Esc`. Der Aufruf steht in
`packages/packages/core/editor-app-bar/src/extensions/keyboard-shortcuts/hooks/use-action-props.ts`
(Eintrag im Hauptmenue, `priority: 40`).

**Entscheidung: uebernehmen, abwandeln.** Uebernommen werden die Trennung nach Gruppen, das Druclen
der Tasten als Tastenform (`<kbd>`), die Betriebssystemschreibweise (`⌘` gegen `Ctrl`) und die
Belegungen fuer Stil einfuegen, Struktur, Verlauf und die Kuerzelliste selbst. Abgewandelt: die Liste
liegt im Spotlight-Fuss und im Kuerzelverzeichnis als **eine** Quelle (bei Elementor steht die Liste in
einer Vorlage, die Kuerzel aber zusaetzlich im Code), und wir nehmen Spotlight `Cmd+K` statt
Finder `Cmd+E` (weil `Cmd+K` bei Figma, Linear und Raycast eingeuebt ist).
**Begruendung.** Elementor belegt `Cmd+K` mit "Site Settings" und `Cmd+E` mit dem Finder. Beide
Belegungen kollidieren mit der inzwischen eingeuebten Konvention; wir weichen deshalb bewusst ab und
fuehren das als Abweichung, nicht als Versehen.

### 29 Fokus, Sprungreihenfolge, Bedienung ohne Zeiger

**Beleg.** `assets/dev/js/editor/utils/keyboard-nav.js` ist die belastbarste Datei im ganzen Repo fuer
diesen Punkt:
`rovingTabindex({ event, $items, orientation, wrap = true, activateOnFocus = false, homeEnd = true })`
behandelt `ArrowLeft/ArrowUp` und `ArrowRight/ArrowDown` je nach `orientation`
(`horizontal`/`vertical`/`both`), `Home` und `End`, sowie `Enter` und Leertaste als
`onActivate`, und setzt beim Wechsel `tabindex="-1"` auf alle und `tabindex="0"` plus `focus()` auf das
Ziel. `escapeFromPanelField(event, root)` laesst `Escape` aus einem bearbeitbaren Feld **nicht** an die
globale Kuerzelverarbeitung durch, sondern blurrt das Feld und parkt den Fokus auf dem umgebenden
Bedienanker (`CONTROL_ANCHOR_SELECTOR = '.elementor-control, [data-type="settings-field"], [role="group"]'`),
mit einem einmaligen `Tab`-Behandler (`parkFocusOnAnchor`), damit der naechste Tab nicht in dasselbe
Feld zuruecklaeuft. `isInsideOverlay()` schuetzt Dialoge, Popover und Auswahlfelder davor, das
`Escape` an den Editor abzugeben (`ESCAPE_OWNER_SELECTOR` mit `.dialog-widget`, `[role="dialog"]`,
`.MuiModal-root`, `.MuiPopover-root` und weiteren). `suppressEscapeKeyUp()` verhindert das
Nachzucken der `keyup`-Phase.

**Entscheidung: uebernehmen.** Uebernommen werden: wanderndes `tabindex` mit `wrap` und `Home`/`End`,
das Melden von `activateOnFocus` als Option, `Escape` aus einem Feld gibt den Fokus an die
**umgebende Zeile** zurueck (nicht an den Anfang des Panels), und Overlays behalten `Escape`.
**Begruendung.** Das sind drei Punkte, die man nicht erfindet, sondern erst merkt, wenn man sie
vergisst: Der Fokus nach `Escape` ist der Unterschied zwischen einer bedienbaren und einer
quaelenden Werkzeugleiste, und das Sperren von `keyup` ist noetig, weil ein Dialog sonst auf denselben
Tastendruck zweimal reagiert.

### 30 Vorlesbarkeit von Nur-Symbol-Zielen

**Beleg.** `packages/packages/core/editor-canvas/src/components/outline-overlay.tsx` setzt
`role="presentation"` (das Overlay ist keine Information). `includes/controls/dimensions.php` und
`choose.php` und `visual-choice.php` setzen dagegen ueberall `elementor-screen-only`-Text neben das
Symbol. `packages/packages/core/editor-app-bar/src/extensions/responsive/components/breakpoints-switcher.tsx`
setzt `aria-label` an der Gruppe und an jeder Station.

**Entscheidung: uebernehmen.** Uebernommen wird: reine Dekoration bekommt `role="presentation"` und
`aria-hidden`, jedes bedienbare Nur-Symbol-Ziel bekommt einen vorlesbaren Namen, und jede Gruppe
bekommt ein `aria-label`. Das deckt sich mit `ui-ux-pro-max` (`aria-labels`, `no-emoji-icons`).
**Begruendung.** Es ist die billigste Massnahme mit der groessten Wirkung: Ein Rahmen braucht keine
Vorlesbarkeit, ein Geräteknopf ohne Namen ist dagegen unerreichbar.

---

## F. Nicht belegt und deshalb offen oder verworfen

| Punkt | Suchlauf | Entscheidung |
|---|---|---|
| Lineal, Fuehrungslinien, Einrasten an Linien | `ruler` in `Repos/elementor-main` ausser `vendor*`: nur FontAwesome und MCP-Dokumentation; `guides`/`snapTo` in `modules/`: nichts | verworfen als Elementor-Beleg, eigene Festlegung bleibt |
| Favoriten fuer Bausteine | kein Treffer fuer eine Favoritenliste, nur `assets/dev/scss/editor/panel/_categories.scss` | keine Pflicht; Kategorien uebernommen |
| Kurven als `cubic-bezier`-Werte | v3 nennt nur `ease-out`/`ease-in-out`/`linear`; die sieben Kurven in `easing.tsx` sind Namen ohne Zahlen | eigene Kurvenwerte bleiben (belegt in `ui-design.md` aus emil-design-eng) |
| Gebaute Auslieferungsdateien | `assets/` enthaelt nur `data`, `dev`, `images`, `lib`, `mask-shapes`, `shapes`, `svg-paths` | keine Messung an gebauten Dateien moeglich, deshalb Quellenverweise |
| Mehrfachauswahl als Kaestchen mit Drei-Zustands-Kopf | kein Fund im v4-Stack | eigene Festlegung, im Plan als Regel gefuehrt |
