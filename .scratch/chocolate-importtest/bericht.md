# Chocolate-Importtest — Bericht vom 12.11.2026

Quelle: `https://chocolate-attributes-385353.framer.app/` (10 Seiten).
Site: `4nWfjA3Kq1IUfD`. Branch: `integration/c-auf-g-2026-11-08`.
Alle Messläufe (JSON/PNG/Logs) liegen lokal unter `.scratch/` und sind nach der
`.scratch`-Hygiene nicht versioniert; dieser Bericht und die Werkzeuge (`.mts`/`.mjs`)
schon. Jede Aussage „umgesetzt/belegt“ nennt unten einen Code- oder Messbeleg.

## Zusammenfassung

Der Import liefert eine vollständig strukturierte, editierbare Seite ohne
Framer-Laufzeit. Die Release-Tore sind frei von harten und weichen Befunden
(`.scratch/choc-checks2.json` = `{"hard":[],"soft":[]}`). Desktop ist visuell nah
am Original (erster Bildschirm `/` 0,269 %, `/about` 0,364 %, `/contact` 0,735 %).
Die verbleibenden Sichtabweichungen auf Tablet/Mobil und `/price` sind auf vier
benannte Import-Fidelity-Lücken zurückgeführt (Icon-Farbe, Karten-Stapel,
Formular-Selects, Klick-Menü); sie sind als Folgetickets erfasst, nicht still
behoben. Die beiden flackernden Browsertests sind ursächlich belegt und stabil
(4×-Wiederholung grün); der Voll-Verify läuft auf dem korrigierten Stand.

## Befund 1 — Tablet-/Mobil-Bilder (Fade/Appear)

Umgesetzt und belegt. Der Capture erkannte eine reine Fade-Einblendung nicht
als Startzustand: Framer schreibt `will-change:transform; opacity:0;
transform:none` für Scroll-Reveals ohne Bewegung (auf Chocolate gemessen:
44 Elemente dieser Form, ohne Appear-ID — sie froren bei `opacity:0` ein).
`isRevealStart` und `isDerivedReveal` werten jetzt den `will-change`-Marker
als Beleg (`packages/framer-import/src/capture-html.ts`); drei neue Fälle in
`packages/framer-import/test/appear-channel.test.ts` (Erkennung, Abgrenzung
zum bewusst versteckten Element ohne Marker, Entfernung aus dem
Inline-Markup). Der visuelle Lauf bestätigt: erster Bildschirm `/` Desktop
0,269 %, Höhen identisch (8966/8966), alle Appear-Elemente in jedem Abschnitt
sichtbar. Reduzierte Bewegung: 106/106 Elemente `animation:none`, volle
Deckkraft, 0 abweichend (`.scratch/choc-visual-2026-11-12/result.json`,
`reduzierteBewegung`). Die *verbleibenden* Tablet-/Mobil-Ausreißer sind nicht
der Fade, sondern die Lücken aus Befund 7 (Icon-Farbe, Karten-Stapel) — siehe
dort.

## Befund 2 — Release-Check `release-no-stylesheet` (Fehlalarm)

Umgesetzt und belegt. Der Preview-Bake bettet CSS als `<style>` ein
(self-contained); der Check suchte nur verlinkte Stylesheets und meldete
deshalb falsch. `runReleasePreChecks` akzeptiert jetzt einen nicht-leeren
Inline-Block gleichwertig (`packages/engine/src/release-checks.ts`); zwei
neue Fälle in `packages/engine/test/release-checks.test.ts` (Inline-Block
zählt, ein leerer `<style>`-Tag zählt nicht). Die aktuellen Release-Checks
liefern `{"hard":[],"soft":[]}` (`.scratch/choc-checks2.json`, ausgeführt mit
`.scratch/choc-checks.mts` gegen den Bake `H-OXzxq_XvLirh`).

## Befund 3 — Überschriften-Hierarchie (Import korrigiert Ebene)

Umgesetzt laut Nutzerentscheidung „Import korrigiert Ebene“ (nicht das Tor
schwächen). `normalizeHeadingLevels` in `packages/framer-import/src/mapper.ts`
glättet die Hierarchie (erste Überschrift h1, keine Ebenen-Sprünge); der Mapper
hat damit 65 Funktionen (Doku-Wächter `packages/engine/test/doku-konsistenz.test.ts`,
`docs/current/module.md` neu gerendert). Jeder der 10 Re-Importe meldet genau
einen `heading-levels`-Info-Befund (`.scratch/choc-reimport2-*.json`); die zuvor
17 harten `release-heading-order`- und 7 weichen `release-heading-start`-Befunde
sind weg (Vorher-Stand am alten Bake `-09NFg0rMFI6BY` nachgemessen:
`.scratch/choc-checks-vorher.json`, 20 hart = 17 heading-order + 3 missing-file,
7 soft = heading-start).
Optische Neutralität belegt: Die einzige h1–h6-Tag-Regel im Build-CSS ist der
Preflight-Reset (`h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}`);
die Typografie hängt an den Attribut-Selektoren der Knoten, nicht am Tag —
eine Ebenen-Änderung kann das Aussehen nicht ändern. Desktop-Diffs nach der
Normalisierung: `/` 0,269 / `/about` 0,364 / `/contact` 0,735 %.
Der Finding-Kind `heading-levels` ist in `packages/framer-import/src/ir.ts`
registriert (Typecheck grün).

## Befund 4 — Publish-Fehlerliste vollständig ausgeben

Umgesetzt und belegt. Ein Guardrail-Fehler nennt jetzt die **vollständige**
Liste der fehlgeschlagenen Checks im Fehlerkörper (`issues`), nicht nur den
ersten: `ErrorIssue`/`SenifyError.issues` (`packages/core/src/errors.ts`),
Serialisierung in `sendError` (`packages/engine/src/http-response.ts`),
`hardFailure` reicht alle Issues durch (`packages/engine/src/lifecycle.ts`).
Neuer Fall `lists every hard check issue in the publish error body` in
`packages/engine/test/lifecycle.test.ts`. Auf dem Chocolate-Bake ist die
Liste leer (Befund 2/3/5), der Weg ist über den Test belegt.

## Befund 5 — CMS-Blogartikel: Quelle und Abdeckung

Erledigt. Drei Artikel liegen exakt auf den Blog-Link-Pfaden; die neuen
Preview-Checks melden 0 `missing-file`-Befunde (vorher 3 hart,
`.scratch/choc-checks-vorher.json`).
Re-Import-Reports: `.scratch/choc-reimport2-article-{onboarding,hr-automation,pto}.json`.

## Befund 6 — Verworfene CSS-Deklarationen aufschlüsseln

Erledigt, belegt durch `.scratch/choc-css-drop.mts` → `.scratch/choc-css-drop.json`:
7131 Drops = 6351 No-Op + 771 redundant + **9 echter Verlust**
(nur `-webkit-tap-highlight-color: transparent`, kosmetisch, ×9). Die erste
Klassifikation hatte den Verlust überschätzt, weil die STANDARD-Map
`mask`/`font-feature-settings` fehlte; nach Erweiterung + Quote-Normalisierung
bleiben 9. Kein funktionaler Verlust.

## Befund 7 — Sichtabweichungen /price Desktop und /contact Tablet (auswerten)

Ausgewertet; drei Ursachen belegt, eine vermutet (Karten-Stapel, Messung
zuerst). Vier Fidelity-Lücken, als Folgetickets erfasst
(`.scratch/chocolate-importtest/issues/01…04`). Keine stille Korrektur.

- **Icon-Farbe (alle Seiten/Breiten):** Die Check-/Feature-Icons rendern im
  Original hell (`fill: rgb(156,156,156)`), im Build schwarz. Ursache: Framer
  zeichnet Icons als `<svg><use href="#symbol">`; die sichtbare Farbe erbt der
  Symbol-`<path>` aus dem `svg-templates`-Container. Der Capture inline’t das
  Symbol (`withSymbols`, `capture-html.ts`), verliert dabei die Vererbung und
  erfasst die computed `fill` nicht (der Browser-Capture liest Computed-Styles
  nur für den Scroll-Sensor). Der Build-Pfad hat kein fill-Attribut und keine
  fill-Regel → Schwarz. Belege: `.scratch/choc-original-fill.mts`/`.json`
  (Original `rgb(156,156,156)`), `.scratch/choc-icon-color.mts`/`.json`
  (Build `rgb(0,0,0)`), Bildpaare `price/desktop/*-abschnitt-1.png`.
- **Karten-Stapel (Home Tablet/Mobil):** Die gestapelten Karten („Potential
  collaborators“ / „Insight“) liegen im Build überlappend statt verdeckt
  gestapelt; Text wird abgeschnitten. Ursache vermutet (noch nicht knotengenau
  gemessen): Transform-/Positionierungs-Verlust der absolut positionierten
  Stapel-Karten beim Import; Folgeticket 02 beginnt mit der Messung. Belege:
  Bildpaare `start/tablet/*-abschnitt-9.png`, `start/mobil/*-abschnitt-13.png`
  (Worst-Sections 23,15 % / 26,59 %).
- **Formular-Selects (/contact):** Original hat zwei native `<select>` mit
  Vorauswahl (`Country=us`, `Team Size=1-10`); der Build rendert statischen
  Text „Select...“ (0 native Selects). Ursache: der Capture flattet
  `<select>` zu einem Textknoten (`selectedOptionLabel`, `capture-html.ts:371`)
  und verliert Optionen + Vorauswahl. Beleg: `.scratch/choc-icon-select.mts`/`.json`.
- **Klick-Menü (Mobil):** siehe Befund 8.

Erster Bildschirm gesamt (%): `/` 0,269/5,564/8,055 · `/about` 0,364/1,299/1,96 ·
`/price` 5,636/12,432/15,869 · `/contact` 0,735/15,68/8,873
(Desktop/Tablet/Mobil, `.scratch/choc-visual-2026-11-12/result.json`).

## Befund 8 — Interaktionen im Build messen

Belegt durch `.scratch/choc-interaction.mts` → `.scratch/choc-interaction.json`:
- **Hover (Desktop):** funktioniert, identisch zum Original (Original 7/9,
  Build 7/8 Kandidaten mit Änderung; gleiche Werte, z. B. Nav
  `backgroundColor rgb(15,14,13)→rgb(31,29,26)`). Der Browser-Capture erfasst
  `:hover` (ADR-0033/0034).
- **Menü (Mobil):** öffnet im Build **nicht** (Original: neuer Link „Home“
  nach Klick; Build: keine neuen Links). Ursache: klickgetriebene JS-Zustands-
 maschine der Framer-Laufzeit, die der statische Import nicht reproduziert.
  Als Grenze benannt (Folgeticket 04).

## Befund 9 — Bearbeitbarkeit im Editor belegen

Belegt durch `.scratch/choc-editability.mts` → `.scratch/choc-editability.json`:
importierte Knoten der Typen `heading`, `body`, `image` auf `/about` per
`updateNodeProps` geändert (Text, Ebene h4, Alt) → Bake enthält alle Marker
(`headingText/headingLevel/bodyText/imageAlt` = true) → Rückbau hergestellt
(`restoredOk` = true, `markerGone` = true, Versionen 4→5→6). Die letzte Preview
entspricht wieder dem Original. Ergänzend belegen die Editor-Browsertests
(`elements-panel`, `class-editor`) den UI-Weg.

## Befund 10 — Animations-Zählung Build gegen Original

Geklärt, belegt durch `.scratch/choc-animation-census.mts`/`.json` und
`.scratch/choc-original-loops.mts`/`.json`:
- Original Spitze 389 laufende WAAPI-Animationen, Ende 346 laufend; Build
  Spitze 82 CSS-Animationen, Ende 82 `finished`. Der Unterschied ist ein
  **Lebenszyklus-Artefakt**: Framer (WAAPI) entfernt abgeschlossene endliche
  Animationen aus `document.getAnimations()`, der Build hält CSS-Keyframes mit
  fill-mode als `finished`. Die Zählung nach dem Scrollen misst daher verschieden.
- Die 346 „laufenden“ Original-Animationen sind fast ausschließlich endliche
  Per-Span-Text-Reveals: der Loop-Zensus zum Messzeitpunkt zählt 340 endliche
  (170 Spans × opacity+filter, Iterationen 1, 4200/3600 ms) und **0 unendliche**;
  die Differenz zu 346 ist der Messzeitpunkt (Animationen enden zwischen den
  beiden Erhebungen). Der Build reproduziert sie als Element-Presets
  (ADR-0029), nicht pro Span — eine benannte Granularitäts-Grenze. Die
  Ruhezustände sind identisch (alle Appear-Elemente sichtbar).

## Befund 11 — Flackernde Browsertests (Ursache belegen, verify grün)

**Drei** wechselnde Ausfälle, jede Ursache einzeln belegt und RED→GRÜN geführt:
- **class-editor:** Der Inspektor baut bei jedem Store-/Pipeline-Ereignis neu
  (auch Autosave-Status); das Klassen-Suchfeld wurde dabei geleert. Fix:
  persistierter `classSearchQuery` (`packages/editor/src/inspector/inspector.ts`).
  RED über temporäres `search.value=""`, grün normal + slowMo=120.
- **elements-panel:** Autosave (400 ms) kann vor dem Klick flushen → Knopf
  gesperrt (pending 0) → Direkt-Klick läuft in den 30-s-Timeout. Fix:
  Dual-Path-Poll (manueller Flush oder schon gespeicherter Stand). RED bei
  slowMo=400 („element is not enabled“), grün bei slowMo=400.
- **canvas-view:** `expect.poll` wartet standardmäßig nur **1 s** (Vitest-Default,
  nicht die konfigurierte `testTimeout`). Unter Volllast braucht das Canvas-Iframe
  länger; der Wert war längst committed, nur das Iframe hinkte hinterher. Im
  Voll-Verify fiel die Farb-Poll in Zeile 253 (erwartet `rgb(18,52,86)`, erhalten
  `transparent`), unter CPU-Last reproduzierbar an der textColor-Poll in Zeile 356.
  Fix: globales `expect.poll.timeout: 5_000` in `vitest.config.ts` — dieselbe
  Familie wie die bereits dokumentierten `testTimeout`/`hookTimeout`-Erhöhungen;
  die Assertion bleibt gleich, nur das Wartefenster wird realistisch. Neuer
  Charakterisierungstest `packages/app/test/inspector-draft-browser.test.ts`
  belegt den gemessenen Mechanismus: Chromium feuert `change`+`blur`+`focusout`
  auf ein entferntes fokussiertes Eingabefeld, der Stil-Entwurf committet also
  automatisch (solo grün ~3 s, unter 8 Stressoren grün in 27 s).
- Stabilität: 4×-Wiederholung von class-editor + elements-panel grün (3/3 je Lauf).
- Der erste Voll-Verify war am **Typecheck** rot (vier echte Typfehler aus den
  obigen Änderungen: `heading-levels` fehlte in der Finding-Union, inspector
  `string|undefined`). Beides korrigiert (`ir.ts`, `inspector.ts`), Typecheck grün.

**Last-Diagnose des zweiten Voll-Verify (`.scratch/verify-2026-11-12c.log`):**
16 Fehler in 8 Dateien, aber **keine** Code-Regression. Der Lauf brauchte
**2519 s** gegen **1075 s** des ersten (2,3×) — die Maschine war währenddessen
satt (andere Tools + App + ein hängtendes Messskript). 14 der 16 Fehler sind
**Timeouts** langsamer Tests unter Last: `payload-page` braucht solo **12–22 s
pro Test** (echte Astro-Bakes) bei 30 s Timeout, `launcher` ~11–12 s bei 30 s.
Beleg der Last-Ursache: `launcher` solo **2/2 grün**, `payload-page` solo
**7/7 grün**, `svg-markup` solo **20/20** und im ganzen Paket **465/465 grün**
(der eine deterministische Assertion-Fehler im Volllauf war ein Worker-Artefakt
der Extrem-Last, in Isolation nicht reproduzierbar). `elements-panel` (faq nicht
persistiert) ist der bereits behobene Autosave-Flush unter Last. Aufgeräumt:
eigenes hängtendes `choc-visual.mts` gestoppt, Senify-App bewusst angelassen.
**Gate:** sauberer Neu-Verify `.scratch/verify-2026-11-12d.log` (Task b70b8pwqq).

## Offene Punkte / Grenzen (nicht still behoben)

1. Icon-Farbe, Karten-Stapel, Formular-Selects, Klick-Menü: Folgetickets
   `issues/01…04`, Ursache belegt, Korrektur im Capture/Mapper erforderlich
   (Re-Import + Re-Verify). Bewusst nicht in diesem Schritt umgesetzt.
2. Per-Span-Reveals nur als Element-Presets (ADR-0029); JS-Puls/Loop-Feinheiten
   bleiben Grenze (`.scratch/motion-import/issues/07`).
3. Zugangsdaten aus dem Handoff (DB-Passwörter, Application-Passwort,
   Unframer) sind **nicht** rotiert/widerrufen — nur auf Zuruf des Nutzers.
   `~/.senify/config.json` hält weiter das falsche DB-Passwort.
4. Kein Push erfolgt; Commit nur am Ende dieses Schritts (Scripts + Bericht + Docs).

## Werkzeuge (versioniert)

`.scratch/choc-*.mts` und `.scratch/choc-*.mjs`: `animation-census`, `checks`,
`css-drop`, `css-rule`, `editability`, `fade-probe`, `icon-check`, `icon-color`,
`icon-mask`, `icon-select`, `img-probe`, `interaction`, `ir-node`,
`original-fill`, `original-icons`, `original-loops`, `reimport-all`,
`tablet-probe`, `visual` — reine Messwerkzeuge, schreiben nichts ins Projekt
außer lokalen JSON/PNG unter `.scratch/` (nicht versioniert, `.gitignore`).