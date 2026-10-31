# Roadmap Senify — was steht, was fehlt

> **Dokumenttyp: abgeleitet, nicht maßgeblich.** Diese Datei ist die lesbare Gesamtsicht.
> Verbindlich bleiben: `docs/fahrplan.md` (Reihenfolge, Gates, DoR/DoD, Risiken),
> `docs/current/stand.md` (Umsetzungsstand mit Beleg), `docs/current/module.md`
> (erzeugter Modulbestand), `docs/current/qualitaet.md` (einzige Stelle für Testzahlen),
> `docs/adr/` (Entscheidungen) und `CONTEXT.md` (Fachsprache).
>
> **Stand: 31.10.2026.** Basis: `master` (`41edc69`) plus der Branch
> `arbeit/offene-punkte-2026-10-30`; der jüngste Code-Commit ist `a7f08b2` (der
> R12-Schnitt der MCP-Fassade, siehe Block 1, Abschnitt „Gerade erledigt"), die
> Roadmap selbst wird als Doku-Commit nachgezogen.
>
> **Diese Datei enthält keine Testzahlen.** Wo Zahlen stehen, sind es Zeilenlängen von
> Quelldateien mit der Quelle `module.md`; alles, was Coverage, Testfälle oder
> Messläufe betrifft, steht ausschließlich in `docs/current/qualitaet.md`.

---

## 1. In einem Absatz

Senify ist funktional weit: Engine, Editor, Renderer, Bake, Release-Lebenszyklus,
Redesign aus Referenzen, Formulare, MCP-Fassade mit Manifest, Referenzbibliothek,
Site-Breakpoints und ein Framer-Import, der an echten Seiten gemessen ist. Was fehlt,
ist **keine fehlende Funktion mehr, sondern Restarbeit in drei Sorten**: (a) drei große
Dateien und eine Handvoll mittlere, die noch zu groß sind, ohne dass ein Schnitt sie
nachweislich verbessert; (b) zwei Fälle im Framer-Import, die teils an einer
Eigenschaft der Quelle hängen und teils eine eigene Messung brauchen; (c) Produktumfang,
der noch nicht begonnen ist (CMS-Mapping, Lokalisierung, Code-Sections, der menschliche
E2E-Weg durch die Baustein-Bibliothek). Die CI ist dabei enger geworden: `verify.yml` läuft seit 16.10.2026 auch bei Pushes auf `master`, ein roter Direkt-Push bleibt also nicht mehr unbemerkt.

---

## 2. Wo das Projekt steht

### 2.1 Die Prioritätsblöcke aus `docs/fahrplan.md`

| Block | Inhalt | Zustand |
|---|---|---|
| **P0** | Arbeitsbaum gesichert, Lint, Idempotency-Completion, Build-Echtheit | erledigt (P0-1 historisch gesichert: `2a0afde`, `aad9550`, `0193fde`) |
| **P1** | CI beweist, was der Code behauptet: PostgreSQL-Lane, Coverage-Schwellen, Lint-Ziel, drei Scans (gitleaks, osv-scanner, dependency-cruiser) | erledigt (P1-1 bis P1-4) |
| **P2** | Redesign zu Ende: Sektions-Plan im Executor, Medienbedarfe operativ, Proposal-TTL, Design-Record | erledigt (P2-1 bis P2-4) |
| **P3-1** | Legacy-Editor abgelöst | erledigt |
| **P3-2** | God-Files aufteilen (R12) | **in Arbeit** — der einzige große offene Block |
| **P3-3** | MCP-Schema-first (Schema, Fehlerobjekt mit `retryable`, Pagination, Manifest-Paket) | geschlossen |
| **P3-4** | Release-Manifest mit Snapshots | erledigt |
| **P3-5** | Import-Asset-Kompensation | erledigt (mit dokumentierter Grenze) |
| **P3-6** | Doku-Prozesse und `.scratch/`-Hygiene | erledigt |
| **P3-7** | Framer-Import: Lücken der Live-Messung | **teilweise** — 14 von 16 Punkten geschlossen |

### 2.2 Risiko-Register (Kurzfassung; maßgeblich ist `docs/fahrplan.md`)

| Nr. | Thema | Zustand |
|---|---|---|
| R1–R9, R13, R15, R17–R21 | Build, TTL, Sektions-Plan, Design-Record, Legacy-Editor, Idempotency, Manifest, MCP, Style-Rename, Arbeitsbaum, Editor-Vokabular, Browser-Wächter, Route-Matrix, Bake-Lease, Lizenz | **geschlossen**, je mit Beleg |
| R10 | Import-Asset-Kompensation | Kompensationsvertrag geschlossen; Datei und DB sind **keine** gemeinsame Transaktion — eine benannte Grenze, kein TODO |
| R11 | CI: Postgres, Coverage, Fehlerpfade | implementierungsseitig geschlossen, Jobs vorhanden; die Doku-Grenze ist R12 (ungenutzte God-Files waren vorher ungemessen) |
| **R12** | **God-Files** | **offen / teilweise** — Block 1 |
| R14 | OSV-Ausnahmen (vitest, tinypool, `http-cache-semantics`) | **geschlossen 22.10.2026**, vor der Frist: `http-cache-semantics` 4.3.0, Runner auf 4.1.12, Ausnahmen entfernt |
| R16 | Vier Job-Queues teilen Lease-/Backoff-/Dedupe-Muster | **bewusst nicht vereinheitlicht** — Entscheidung, kein offener Punkt |

**Folgerung:** Von 21 Risiken sind 17 geschlossen, drei teilweise (R10, R11 mit
Doku-Grenze, R12), eines bewusst entschieden (R16). Offene *Arbeit* steckt in R12 und
P3-7, plus die Produktblöcke S3b/S4/S7/S9, die nicht im Risiko-Register stehen.

---

## 3. Die offene Arbeit in sieben Blöcken

### Block 1 — R12: God-Files (der größte offene Block)

**Prinzip (ADR-0019):** `Store` und der HTTP-Dispatcher bleiben die Fassade, die
Fachmodule tragen die Tabellen. Geschnitten wird nur an einer **Naht**, nicht an einer
Zeilenzahl. Jeder Schnitt braucht einen Beleg, dass die Grenze echt ist.

#### Gerade erledigt (30.10.2026, Branch `arbeit/offene-punkte-2026-10-30`)

| Schritt | Ergebnis | Beleg |
|---|---|---|
| Vergleichs-Ablage der Referenzen-Seite | `app-refs-compare.js` (170 Zeilen), `app-references.js` 597 → 446 | Commit `7152f93`, `references-browser.test.ts` |
| Stil-Guide der Referenzen-Seite | `app-refs-styles.js` (83 Zeilen), `app-references.js` 446 → 378 | Commit `444607a`, `references-browser.test.ts`, `module-form.test.ts` |
| Bühne des Seiten-Editors | `app-editor-canvas.js` (774 Zeilen), `app-editor.js` 1 048 → 290 | committet 30.10.2026; `canvas-view-browser.test.ts`, `canvas-browser.test.ts`, `save-conflict-browser.test.ts` |
| Veröffentlichungs- und Betriebs-Werkzeuge der MCP-Fassade | `tools-release.ts` (307 Zeilen, 12 Werkzeuge), `tools.ts` 1 671 → 1 403 | Commit `a7f08b2`; `manifest:render` 109 Werkzeuge und leerer Manifest-Diff, `doku-konsistenz.test.ts`, `packages/mcp/test` |
| Typbruch auf `master` | fehlender `tsconfig`-Pfad `@senify/widget-engine/section-breakpoints` | Commit `5ee1c02`; `pnpm typecheck` war vorher rot |

#### Was noch offen ist — nach Aufwand und Risiko geordnet

| Rang | Datei | Zeilen | Zustand | Nächster Schritt und Bedingung |
|---|---|---|---|---|
| 1 | `packages/app/public/app-references.js` | 378 | `module.md`, „laufender Zuschnitt": Seitenfunktion `referencesView`; Vergleich, Karten, Hülle, Zustand, Inspektor und Stil-Guide sind eigene Module | Der nächste Schnitt wäre der Filter-/Kopfblock; **Bedingung:** `references-browser.test.ts` bleibt grün und `module-form.test.ts` bekommt das neue Modul. Was danach übrig ist, ist die Seitenfunktion selbst — und die ist die Naht, keine Datei. Kleiner Gewinn, geringes Risiko. |
| 2 | `packages/mcp/src/tools.ts` | 1 403 | `module.md`: „ein weiterer Schnitt ist möglich und braucht den Manifest-Diff als Beweis"; die Release-Gruppe ist am 30.10.2026 herausgezogen | Nächste Werkzeuggruppe herausziehen; **Bedingung:** `pnpm manifest:render` meldet weiter 109 Werkzeuge und `git diff packages/manifest/src/tools.ts` ist leer. Das ist der Beweis, nicht die Zeilenzahl. |
| 3 | `packages/engine/src/store.ts` | 2 662 | `module.md`: **inhaltlich fertig** — vier fachübergreifende Transaktionen, `replaceTables`, Fassade; 202 von 244 Methoden sind Delegaten (gemessen) | **Kein Schnitt geplant.** Was bleibt, ist die Entscheidung (ADR-0019 Punkt 4). Wer hier schneidet, teilt eine Transaktion. |
| 4 | `packages/editor/src/inspector/inspector.ts` | 1 884 | `module.md`: eine Closure mit 22 Renderern; `renderFieldRow` allein nennt elf Fremdnamen und zehn Geschwister-Renderer | **Schnitt am 26.10.2026 gemessen und verworfen.** Eine Fabrik mit elf Rückrufen ist eine Verschiebung, keine Naht. Nur mit einer anderen Idee (z. B. Renderer-Registry mit deklarierten Abhängigkeiten) neu bewerten. |
| 5 | `packages/framer-import/src/capture-html.ts` | 2 768 | `module.md`: CSS-Block am Dateiende wurde als eigener Schnitt **versucht und verworfen** (15 Importe aus der Quelldatei wären keine Senke) | Nur mit einem anderen Zuschnitt (z. B. CSS-Auflösung als eigene Stufe mit klarer Eingabe/Ausgabe) neu bewerten. |
| 6 | `packages/framer-import/src/mapper.ts` | 2 047 | `module.md`: 57 Funktionen, `mapNode` allein 336 Zeilen, teilt Tabellen mit `mapDocument` | Ein Schnitt müsste die Tabellen als Parameter durchreichen — derzeit keine Naht. Wächst seit dem Browser-Abgriff der Animationen. |
| 7 | `packages/engine/src/content.ts` | 1 703 | `module.md`: „Sammlungen, Einträge und ihre Suche in einem Fachgebiet" | Fachlich begründet; ein Schnitt würde Suche und Schreibpfade trennen, die denselben Zustand lesen. |
| 8 | `packages/editor/src/inspector/model.ts` | 1 490 | `module.md`: „das Modell des Inspektors" | Prüfen, ob es eine reine Rechnung ohne DOM ist (dann testbar ohne Browser) — aber kein Schnitt ohne gemessene Naht. |
| 9 | `packages/engine/src/types.ts` | 1 479 | `module.md`: öffentliche Typen, keine Logik | Kein Schnitt nötig; eine Aufteilung nach Fachgebiet wäre Kosmetik. |
| 10 | `packages/editor/src/canvas/canvas.ts` | 1 336 | `module.md`: „die Bühne des Editors" | Kandidat für eine Messung, nicht für einen Schnitt auf Verdacht. |
| 11 | `packages/engine/src/forms.ts` | 1 313 | Formulare, Einsendungen, CSV-Export | Drei Gegenstände, ein Fachgebiet; CSV-Export wäre als Rechnung testbar und wäre der billigste echte Schnitt. |
| 12 | `packages/editor/src/state/operations.ts` | 1 240 | Dispatcher plus Prüfer, die Katalog und Fehlerform teilen | `module.md` begründet das Bleiben. |
| 13 | `packages/engine/src/lifecycle.ts` | 1 190 | Revision, Re-Bake, Publish, Preview, Review | Ein Release entsteht nicht ohne die anderen drei; ein Schnitt müsste die gemeinsame Transaktion teilen. |
| 14 | `packages/renderer/src/motion.ts` | 1 149 | zwei Laufzeit-Skripte als Text in Template-Literalen | Kein Quellcode-Schnitt möglich, ohne ausgelieferten Code zu zerteilen. |
| 15 | `packages/engine/src/mutations/apply.ts` | 1 144 | Dispatcher plus Platzierungsprüfer, gemeinsamer `ApplierState` | Begründet; der Zustand ist der Grund. |
| 16 | `packages/engine/src/media.ts` | 1 107 | Assets, Ableitungen, Ordner | Kandidat: Ableitungen (Leiter, Blurhash) sind reine Rechnung. |
| 17 | `packages/engine/src/references-lifecycle.ts` | 1 046 | Referenz-Pipeline, Capture-Treiber 250 Zeilen | Capture-Treiber teilt Zustand mit dem Job-Lauf — gemessen, nicht geschnitten. |
| 18 | `packages/renderer/src/bake.ts` | 1 021 | `bakeSite` hält Warnungen, Manifest, Flags über alle Seiten | Der geteilte Zustand **ist** der Grund für den einen Durchgang. |
| 19 | `packages/engine/src/http-routes-sites.ts` | 270 | zehn Schnitte, 1 205 → 270 Zeilen; Betriebsgruppe **gemessen und verworfen** | **An der fachlichen Grenze.** Nicht weiter teilen. |
| 20 | `packages/manifest/src/tools.ts` | 1 796 | **erzeugt** aus `tools.ts` (`pnpm manifest:check`) | Kein Schnitt — die Länge ist die Folge von 109 Werkzeugen. |

**Wichtig für die Bewertung:** Von den 18 Dateien über der 1 000-Zeilen-Schwelle sind
**vier erzeugt oder reine Typen** und **neun mit einer Messung begründet**. Übrig
bleiben fünf, die man ehrlich prüfen konnte. Zwei davon sind am 30.10.2026 geschnitten
worden (`app-references.js` 446 → 378; `tools.ts` 1 671 → 1 403 mit
`tools-release.ts`). Offen bleiben `forms.ts`, `media.ts` und `model.ts`; `tools.ts`
liegt mit 1 403 Zeilen weiter über der Schwelle und bleibt für eine weitere
Werkzeuggruppe ein Kandidat. Der Rest ist keine Arbeit, die noch ansteht, sondern eine
Entscheidung, die steht.

---

### Block 2 — P3-7: Framer-Import-Treue (14 von 16 Punkten geschlossen)

Der Import ist an veröffentlichten Framer-Seiten gemessen, nicht geschätzt. Offen sind
zwei Punkte und zwei Grenzen.

| Punkt | Zustand | Was fehlt / was es bräuchte |
|---|---|---|
| **15 — `unifiersofjapan` über 20 %** | **gemessen 31.10.2026, weiter offen.** Auf dem Struktur-Baum 16,98 / 16,34 / 21,26 %; auf dem Release-Pfad (mit Original-Runtime) 1,05 / 2,15 / 2,03 %, alle Höhen exakt | Vier belegte Ursachen: Fit-Text mit dem Faktor 1,3345 (Höhe 923,4 statt 253,2 px, Verschiebung +670,2 px), fehlende 10°-Drehung (weder im SSR noch im IR), ein beim Backen verlorenes Badge (Icon-Sanitizer), versetzte Papiertextur. Die leeren Karten im Band 3950–4450 sind Lottie-Laufzeitinhalt (SSR 0×). Protokoll in `docs/current/qualitaet.md`; der Grid-Zweig ist verworfen. |
| **1 — Sterne der Bewertung** | **Grenze der Quelle.** Im SSR steht der Sterne-Container leer (`viewBox="0 0 256 256"` 0× im SSR, 5× im gerenderten DOM) | Mit `capture: "browser"` **gelöst** (5 Sterne statt 0). Offen ist nur die Produktentscheidung, ob der Browser-Capture Standard werden soll — er kostet einen Chromium-Start je Import. |
| **Punkt 13 — CSS-Bildadressen** | im Punkt als „offen" vermerkt | Die CSS-Bildadressen des Originals zeigen noch aufs CDN. Adress-Umschreibung ist für Markup und Runtime gebaut; die CSS-Seite fehlt. |
| **Restabweichung** | Rasterung + Framer-Werbe-Badge | `docs/agents/framer-import-restabweichung.md`: die Boxen liegen auf dem Pixel, die Höhen sind gleich. Wer die Zahl drücken will, maskiert den **Vergleich**, nicht den Import. |

**Nicht offen, aber oft verwechselt:** die „0,98 %"-Zahl gilt für die Earn-Seite mit
Quellschriften. Andere Seiten haben andere Reste; die Tabelle in
`docs/current/qualitaet.md` ist die einzige Quelle.

---

### Block 3 — S3b/S4: Fremdcode und Island-Payloads (blockiert)

| Punkt | Zustand | Warum es nicht weitergeht |
|---|---|---|
| S3b Island-Payloads | teilweise: Original-Markup, Original-CSS und gebündelte Runtime in **einem** ESM-Modul; Mirror-Quellen und wenige Adapter | „nicht generisch" — die generische Extraktion bräuchte eine Quelle, die es in echten Exporten nicht gibt |
| S4 Fremdcode | teilweise: Klasse-C-Strecke in der Oberfläche belegt (Nachbau-Hinweis, Platte als letzter Ausweg, Befund mit Belegstelle) | `data-framer-module` kommt in **keinem** echten Export vor. Was fehlt, hängt an derselben fehlenden Quelle |
| Poster für den Editor | offen (im Punkt 13 vermerkt) | Braucht den Browser-Capture; bis dahin steht die Platte |

**Konsequenz:** Dieser Block ist **keine Implementierungsaufgabe**, sondern eine
Produktentscheidung: entweder der Unframer-MCP wird als zweite Quelle in den Dialog
geholt (eigene Anleitung, eigene Kosten), oder der Punkt bleibt eine benannte Grenze.

---

### Block 4 — S9: Erweiterung des Imports (Produktumfang, teilweise)

Der Mehrseiten-Import ist **gebaut und im Browser belegt** (bis zu 40 verlinkte Seiten,
Einzel- und Sammelimport) — die frühere Einordnung „geplant" war falsch. Offen sind:

| Thema | Zustand | Was es braucht |
|---|---|---|
| CMS-Mapping | offen | Framer-Collections auf Senify-Collections abbilden; braucht die Projekt-Sicht (Unframer) oder einen Export mit CMS-Daten |
| Lokalisierung | offen | Mehrsprachige Framer-Projekte auf getrennte Seiten/Sprachen abbilden; berührt Routing und `lang` |
| Code-Sections | offen | Framer-Code-Komponenten als eigene Senify-Sections; heute gibt es den Befund `code-component` statt einer Section |

---

### Block 5 — S5/S7: Bibliothek und Visual Gate (teilweise)

| Punkt | Zustand | Was fehlt |
|---|---|---|
| S5 Visual Gate | teilweise | Das Gate läuft auf den drei echten Export-Fixtures mit Ratchet-Grenzen (Pixeldifferenz, Texthöhe, Links). Die Tablet-Messung läuft bei 900 px, weil Senifys Tablet bei 1023,98 px endet und Framer bei 1199 — eine bewusste Abweichung, die dokumentiert bleiben muss |
| S7 Bibliotheks-UI | teilweise | **Der vollständige menschliche E2E-Weg fehlt**: Baustein finden, installieren, im Editor ändern, Instanzen nachziehen, Wiederanheften. Die Werkzeuge dafür liegen in `tools-bibliothek.ts` und den `store-library*.ts`-Modulen |

---

### Block 6 — R16: vier Job-Queues (bewusst offen, nichts zu tun)

Bake-, Bild-, Import- und Referenz-Queue teilen Muster, sind aber **nicht** zu
vereinheitlichen: nur zwei haben eine Lease, zwei laufen über `listDue`, und die
Fehlersemantik unterscheidet sich. Eine gemeinsame Klasse müsste SQL aus Strings bauen
und würde ADR-0019 widersprechen. **Diese Zeile steht hier, damit sie niemand wieder
aufmacht.**

---

### Block 7 — Prozess, CI und Doku-Tore

| Thema | Zustand | Was fehlt |
|---|---|---|
| CI-Auslöser | **geschlossen 16.10.2026** | `verify.yml` läuft bei Pushes auf `master`, bei Pull Requests und von Hand |
| Browser-Gate | geschlossen | `SENIFY_REQUIRE_BROWSER=1` im CI-Job: ohne Chromium wird der Lauf rot statt grün ohne Test |
| Drift-Tore | geschlossen | `manifest:check`, `route-matrix:check`, `module:check`, `quality:check`, dazu `doku-konsistenz.test.ts` für Risiko-Nummern und Zeilenzahlen |
| Working-Tree-Hygiene | **geschlossen** | Der vierte R12-Schnitt ist unter `a7f08b2` committet, der Arbeitsbaum ist leer; DoR-Punkt 2 ist damit erfüllt |
| Alte Branches | **geschlossen 31.10.2026** | Neun Linien lokal gelöscht: die fünf gemergten (`claude/vitest-4-*`, `docs/framer-import-bauplan-2026-10-21`, `feat/framer-motion-zeitmassstab`, `fix/framer-import-schriften`), die drei überholten Routen-Branches (#133/#135/#136) und `wip/projektanalyse-2026-10-19` (ältere Fassung; `master` hat 682 statt 458 Zeilen). Zwei Linien bleiben bewusst: `refactor/r12-editor-reste` (offener PR #147) und `feat/geraete-sichtbarkeit` (sechs eigene Commits, kein PR, nur lokal) — entgegen der früheren Annahme sind sie weder gemergt noch überholt |

---

## 4. Abhängigkeiten zwischen den Blöcken

```
Block 1 (R12)  ──  unabhängig, jeder Schnitt ist ein eigener Commit
Block 2 (P3-7) ──  Punkt 15 ist gemessen (31.10.2026); die vier Ursachen stehen in `qualitaet.md`
                   Punkt 1 braucht eine Produktentscheidung (Capture-Standard)
Block 3 (S3b/S4) ─ braucht eine Produktentscheidung (zweite Quelle)
Block 4 (S9)   ──  CMS/Lokalisierung brauchen die Entscheidung aus Block 3
Block 5 (S5/S7) ──  S7 braucht keinen Vorbau, ist reine UI-Arbeit
Block 7 (Prozess) ── Voraussetzung für alles: ohne sauberen Baum kein DoR
```

**Die einzige harte Abhängigkeit:** Ohne die Entscheidung „zweite Quelle (Unframer) ja
oder nein" bleiben Block 3 und der CMS-Teil von Block 4 stehen. Alles andere ist
unabhängig und kann in beliebiger Reihenfolge laufen.

---

## 5. Vorgeschlagene Reihenfolge (nächste zehn Schritte)

Jeder Schritt beginnt mit **Definition of Ready** (Gate des Vorgängers grün, `git status
--short` leer, keine fremde Linie in denselben Dateien, Zieldateien benannt, Ausgangsfehler
belegt) und endet mit einem **ausgeführten Gate** aus `docs/fahrplan.md`.

| # | Schritt | Warum jetzt | Gate |
|---|---|---|---|
| 1 | ~~Den gestagten `mountCanvasView`-Schnitt committen~~ **erledigt 30.10.2026** | Der Diff war geprüft und blockierte als offener Baum jeden Folgeschritt (DoR 2) | `pnpm lint`, `module:check`, `doku-konsistenz.test.ts`, drei Browser-Suiten |
| 2 | ~~`app-references.js` weiter teilen (Stil-Guide-Karten)~~ **erledigt 30.10.2026** | Kleinster echter Schnitt, hohe Browser-Abdeckung — 446 → 378 Zeilen | `references-browser.test.ts` (2 Fälle), `module-form.test.ts`, `doku-konsistenz.test.ts` |
| 3 | ~~`tools.ts` um eine Werkzeuggruppe schneiden~~ **erledigt 30.10.2026** | Der Manifest-Diff war der harte, billige Beweis: 12 Release-Werkzeuge nach `tools-release.ts`, 1 671 → 1 403 Zeilen | `manifest:render` (109 Werkzeuge, leerer Diff), `typecheck`, `lint`, `module:check`, `doku-konsistenz.test.ts` |
| 4 | ~~P3-7 Punkt 15 messen (`unifiersofjapan`)~~ **erledigt 31.10.2026** | Der einzige offene Treuepunkt mit unbekannter Ursache ist gemessen | Blindtest 16,98 / 16,34 / 21,26 %, Bandsumme 14,67 %, vier Ursachen benannt; Messprotokoll in `qualitaet.md`, kein Code geändert |
| 5 | Entscheidung Punkt 1 (Capture-Standard) herbeiführen | Ohne sie bleibt eine Grenze unentschieden statt bewusst | Frage-Dialog, ADR-Nachtrag |
| 6 | `forms.ts`: CSV-Export als Rechnung herausziehen | Belegbar testbar ohne Browser, echte Naht | Engine-Suite, `forms.test.ts` |
| 7 | S7: menschlicher E2E-Weg der Bibliothek | Größter Produktnutzen ohne Produktentscheidung | Browser-Test über den ganzen Weg |
| 8 | Punkt 13: CSS-Bildadressen der Quelle umschreiben | Schließt eine benannte Lücke der Runtime-Payload | `runtime-payload.test.ts`, Messung |
| 9 | Entscheidung Block 3 (Unframer als zweite Quelle) | Öffnet oder schließt Block 4 (CMS) | ADR + Frage-Dialog |

**Nicht in dieser Liste:** `store.ts`, `inspector.ts`, `capture-html.ts`, `mapper.ts`,
`bake.ts`, `motion.ts`, `apply.ts`, `lifecycle.ts`, `operations.ts` — sie stehen mit
Messung in `module.md` als „bleibt so". Ein Schnitt dort braucht zuerst eine **neue
Idee**, nicht einen neuen Anlauf.

---

## 6. Was ausdrücklich NICHT offen ist

Damit es nicht wieder aufgemacht wird:

1. **Der Import-Zyklus in der Oberfläche** (`app.js` → `app-projects.js` → `app-review.js`)
   ist **keine Lücke**. `.dependency-cruiser.js` erlaubt Zyklen innerhalb eines Pakets
   ausdrücklich als Frage der Dateiorganisation; die Regel `no-new-package-cycle` gilt auf
   Ordnerebene. `pnpm deps:check` ist grün.
2. **`store.ts` ist inhaltlich fertig.** 202 von 244 Methoden sind Delegaten; was bleibt,
   sind vier fachübergreifende Transaktionen und die Fassade.
3. **`inspector.ts`, `capture-html.ts`, `mapper.ts`** sind am 26.10.2026 **gemessen**
   geprüft und mit Begründung verworfen.
4. **`http-routes-sites.ts` (270 Zeilen)** ist an seiner fachlichen Grenze; die
   Betriebsgruppe wurde gemessen und verworfen.
5. **R14 (OSV-Frist 30.11.2026)** ist seit 22.10. geschlossen, ohne Ausnahme.
6. **R21 (Lizenz)** ist entschieden: alle Rechte vorbehalten, `LICENSE` liegt vor.
7. **R16 (Job-Queues)** ist eine Entscheidung, kein Rückstand.

---

## 7. Risiken und Grenzen, die bleiben

| Grenze | Was sie bedeutet | Wo sie steht |
|---|---|---|
| Datei und DB sind keine gemeinsame Transaktion (Import, Restore) | Bricht der zweite Schritt ab, sind Tabellen und Dateien auseinander; benannt statt weggeschraubt | R10, `docs/current/stand.md` |
| Framer-SSR als Grenze | Was eine Code-Komponente erst im Browser baut, fehlt im statischen Weg; der Browser-Capture holt es, kostet aber einen Chromium-Start | P3-7, Punkt 1 |
| Rasterung im Pixelvergleich | Die Boxen liegen auf dem Pixel; die Restdifferenz ist Kantenglättung und ein Fremd-Widget | `docs/agents/framer-import-restabweichung.md` |
| Tablet-Messung bei 900 px | Senifys Tablet endet bei 1023,98 px, Framer bei 1199 — bewusste Abweichung | S5 |
| Ein roter `master` wird erst nach dem Lauf sichtbar | Der Lauf ist der Wächter, nicht die Verhinderung: es gibt keinen Branch-Schutz und keine Merge-Queue | Block 7 |
| Ein Dokument wie dieses driftet | Deshalb ist es abgeleitet: bei Widerspruch gewinnen Code, ADR, Fahrplan, Stand | `docs/README.md` |

---

## 8. Belege und Wächter: was welche Aussage hält

| Aussage | Wächter / Beleg |
|---|---|
| Der Modulbestand stimmt mit dem Code | `pnpm module:check` gegen `scripts/render-modules.mjs`, `doku-konsistenz.test.ts` |
| Keine Quelldatei fehlt im Suchraum | `doku-konsistenz.test.ts` gegen `git ls-files` (die Datei muss **versioniert** sein) |
| Jede große Datei ist begründet | `doku-konsistenz.test.ts` läuft selbst durch `packages` und meldet jede Datei über 1 000 Zeilen ohne Eintrag |
| Risiko-Nummern sind synchron und Zeilenzahlen stimmen | `doku-konsistenz.test.ts` über `fahrplan.md`, `stand.md`, `architektur.md` |
| Jeder Routen-Schnitt steht im Arbeitsstand | `doku-konsistenz.test.ts` gegen alle `http-routes-*.ts` und `tools-*.ts` |
| Werkzeugzahl und Routen stimmen | `manifest:check`, `route-matrix:check` |
| Paketgrenzen | `pnpm deps:check` (`.dependency-cruiser.js`, jede Regel mit Grund) |
| Testzahlen | **nur** `docs/current/qualitaet.md`, erzeugt von `scripts/render-quality.mjs` |
| Browser-Tore laufen wirklich | `SENIFY_REQUIRE_BROWSER=1` im CI-Job `verify` |

---

## 9. Pflege dieses Dokuments

- **Nach jedem abgeschlossenen Schritt** wird hier nur die betroffene Zeile geändert; die
  ausführliche Begründung gehört in `docs/fahrplan.md` (Abschnitt „Arbeitsstand dieses
  Dokuments") und in `docs/current/stand.md`.
- **Keine Testzahlen, keine Coverage-Werte, keine Messläufe** in dieser Datei — sie
  würden beim nächsten Lauf falsch sein.
- **Bei Widerspruch** gilt die Rangfolge aus `docs/README.md`: Code und Tests, dann ADRs,
  dann `docs/fahrplan.md`, dann `docs/current/stand.md`, dann
  `docs/current/qualitaet.md`. Diese Datei steht darunter.
- **Wenn ein Block schließt**, wird er nicht gelöscht, sondern auf „erledigt (Datum,
  Commit)" gesetzt — die Frage „warum ist das so?" soll man später noch beantworten
  können.
