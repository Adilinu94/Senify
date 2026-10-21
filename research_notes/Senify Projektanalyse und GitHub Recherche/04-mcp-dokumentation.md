# Fachanalyse 4 — MCP-Vertrag, Manifest, Dokumentation

**Basis:** `master` `5ac1a84` (19.10.2026). Geprüfte Dateien: `packages/mcp/src/server.ts`,
`packages/mcp/src/tools.ts`, `packages/mcp/src/tools-support.ts`, `packages/mcp/src/tools-components.ts`,
`packages/manifest/**`, `scripts/render-manifest.mjs`, `packages/skills/**`,
`packages/docs-portal/**`, `packages/mcp/test/manifest-mirror.test.ts`.

**Verbindliche Entscheidungen:** ADR-0009 (kein MCP-Sampling), P3-3 Punkt 4 (Manifest als
neutrales Paket), P3-3 Punkt 8 (Routenmatrix aus dem Manifest).

---

## Kurzfassung

Der MCP-Vertrag ist in der **Laufzeit** sehr sorgfältig gebaut: Ausgabeschemas, `structuredContent`
mit Schema-Prüfung, eine begründete `retryable`-Tabelle, Versuchszählung. Die Schwäche liegt
**einem Schritt davor**: Das Manifest — die Quelle, aus der die Dokumentation entsteht — wird per
**Textanalyse** aus einer 151-KB-Quelldatei erzeugt, und **nichts prüft, ob die eingecheckte
Fassung noch zum Quelltext passt**.

---

## 1 — Der MCP-Server selbst: gut

`packages/mcp/src/server.ts`:

- **Ausgabeschemas.** `outputSchema` wird nur an den Client durchgereicht, wenn das Werkzeug eines
  deklariert (Zeile 461-466). `structuredFor()` (Zeile 490-502) prüft den Wert gegen das Schema
  und **verschickt** `structuredContent` nur, wenn er passt — sonst wird protokolliert und ohne
  Struktur gesendet, damit der Textblock die Wahrheit bleibt. Das ist genau die Entscheidung, die
  P3-3 Punkt 1 beschreibt.
- **Die `retryable`-Tabelle** (Zeile 41-80) ist eine **Entscheidung**, kein Zufall: von den fünf
  Fehlerkategorien ist nur `conflict` wiederholbar. `auth` ist ausdrücklich **nicht** wiederholbar
  („ein Agent, der 401 in einer Schleife wiederholt, wie ein Angriff aussieht“, Zeile 53).
- **Versuchszählung** je (Werkzeug, Argumente), gedeckelt auf 200 Einträge (Zeile 564-569,
  785-793). Ältere Einträge werden verdrängt.
- **Ein Fehlerobjekt statt einer Exception** (Zeile 796): der Fehler geht als Textblock mit
  `retryable` und `attempt` an den Client.

Das ist Arbeit, die man selten sieht. **Kein Befund.**

---

## 2 — Das Manifest: erzeugt per Textanalyse, ohne Drift-Tor

### 2.1 Der Weg vom Werkzeug zur Doku

```
packages/mcp/src/tools.ts   (151 KB, 3403 Zeilen, 106 Werkzeuge)
        │  scripts/render-manifest.mjs  (20,7 KB — parst den QUELLTEXT)
        ▼
packages/manifest/src/tools.ts  (85 KB, generiert, "do not edit")
        │
        ├──► docs-portal (Astro)          — die Werkzeug-Dokumentation
        ├──► route-matrix.ts               — die Aufrufer-Matrix
        └──► mcp/src/server.ts             — spiegelt Name/Scope/Titel/Beschreibung
```

Der Generator ist kein AST-Parser, sondern eine **Textanalyse**: `werkzeugBloecke()`
(`render-manifest.mjs:152`), `feld()` (183), `routeAnfragen()` (214), `normalisiereRoute()` (263),
`parameter()` (347), `topLevelSplit()` (387). Das ist nicht dumm — die Datei beschreibt, warum
Klammern gezählt statt gematcht werden (Zeile 340-346) —, aber es ist eine Datei, die die
**Form** einer Quelldatei kennt.

### 2.2 Was der Generator selbst als Risiko benennt

`render-manifest.mjs:340-346`:

> The braces are counted rather than matched by a pattern, because the tools write their schemas
> BOTH ways — `objectSchema({ siteId: … }, ["siteId"])` on one line and a multi-line form for the
> bigger tools. A regex that assumed one of them would silently produce an empty parameter list
> for the other, **and a documentation table with missing rows is worse than one that fails**.

Das Risiko ist also **bekannt** und benannt. Nur: Der Satz endet mit „worse than one that fails“ —
und **nichts sorgt dafür, dass es scheitert**.

### 2.3 Der Befund: es gibt kein Drift-Tor

Die geprüfte Datei `packages/manifest/src/tools.ts` trägt die Kopfzeile

```
// The tool manifest (Fahrplan P3-3 Punkt 4, R8) - GENERATED, do not edit.
//
// Run `pnpm manifest:render` after changing a tool in
// `packages/mcp/src/tools.ts`. …
```

Der Generator wird **von Hand** aufgerufen. Ich habe geprüft:

- `packages/manifest/package.json` hat **kein** `build`-Skript — der Build erzeugt das Manifest nicht.
- `pnpm verify` (`package.json:31`) = `build && verify:dist && lint && check:patch && test`. Kein
  Manifest-Schritt.
- `.github/workflows/verify.yml` enthält keinen `manifest:render`-Schritt.
- `packages/manifest/test/manifest.test.ts` prüft **nicht**, ob die eingecheckte Datei dem
  Generator-Output entspricht (kein Aufruf von `render-manifest.mjs`, kein Vergleich).

**Was der Test stattdessen prüft** (`manifest.test.ts:37-49`): die **Namen**. Jedes Werkzeug aus
`tools.ts` (per Regex über den Quelltext, Zeile 32-34) muss im Manifest stehen und umgekehrt. Das
fängt ein hinzugefügtes oder gelöschtes Werkzeug.

**Was dadurch unbemerkt falsch werden kann:**

| Änderung an `tools.ts` | Manifest | Test | Doku |
|---|---|---|---|
| Beschreibung geändert | veraltet | grün | **falsch** |
| Parameterliste geändert | veraltet | grün | **falsch** |
| Route geändert | veraltet | grün | **falsch** (die Routenmatrix zeigt einen Aufrufer, den es nicht gibt) |
| Werkzeug umbenannt | neu generiert nötig | **rot** (Namensparität) | — |
| Werkzeug gelöscht | neu generiert nötig | **rot** | — |

Die ersten drei Zeilen sind der wahrscheinliche Fall: Eine Beschreibung, ein Parameter, eine Route
ändern sich viel öfter als ein ganzes Werkzeug.

**Auswirkung.** Das Manifest ist die Grundlage der Doku-Portals und der Routenmatrix. Ein still
veraltetes Manifest bedeutet: Die Doku beschreibt Werkzeuge anders als sie sich verhalten, und die
Routenmatrix weist Aufrufer aus, die es nicht mehr gibt. Der Fahrplan nennt das in P3-3 Punkt 8
selbst als das Ziel („drei Stellen lesen das Manifest, und eine Handkopie von 106 Werkzeugen ist
eine Kopie, die beim ersten Rename driftet“) — der Rename ist nur der lauteste Fall.

### 2.4 Die Behebung: ein Drift-Tor, das den Generator laufen lässt

Der Generator ist ein **Skript**, kein Paket. Er kann in einem Test laufen:

```
scripts/render-manifest.mjs  →  Datei im Speicher  →  Vergleich mit packages/manifest/src/tools.ts
```

Ein Test dieser Form beweist in Sekunden: „Die eingecheckte Fassung ist genau das, was der
Generator heute erzeugt.“ Danach ist jedes Vergessen von `pnpm manifest:render` ein **roter
Test** statt einer stillen Falschaussage in der Doku.

**Aufwand:** ein Testfall plus ein Aufruf des Skripts. **Wirkung:** die gesamte Fehlerklasse
„stille Drift zwischen Werkzeug und Doku“ ist geschlossen.

### 2.5 Die strukturelle Alternative: das Manifest aus der Laufzeit statt aus dem Text

Der Generator könnte die Werkzeugdefinitionen **importieren** statt sie zu **parsen**. Das
entkräftet die ganze Klasse (kein Format, keine Heuristik, keine stille Leere).

**Der Zyklus kehrt nicht zurück.** Die Entscheidung P3-3 Punkt 4 hat den Zyklus
`docs-portal → mcp → docs-portal` gelöst, indem die **Daten** in ein neutrales Paket gewandert
sind. Ein *Generator*, der zur Laufzeit `@senify/mcp` importiert, ändert daran nichts:

- `@senify/manifest` bleibt abhängigkeitsfrei (es erbt nur die generierte Datei).
- `docs-portal` hängt weiterhin **nicht** von `@senify/mcp` ab — der Beweis dafür steht in
  `packages/docs-portal/package.json` und ist im Fahrplan festgehalten.
- Nur das Skript `scripts/render-manifest.mjs` bekäme eine Abhängigkeit — und ein Skript ist keine
  Paketkante.

**Der Preis:** die Werkzeuge tragen TypeBox-Schemas; das Manifest braucht Name, Typ und
Pflicht. Diese Abbildung ist strukturell (Properties, `required`) und damit verlässlicher als
jede Textanalyse. Die Routen müssten weiterhin aus dem Quelltext stammen, sofern die Werkzeuge
ihre Route nicht als Daten führen — **das ist der Punkt, an dem sich der Aufwand entscheidet**:
Führen die Werkzeuge ihre Route als Feld, ist auch der Routenteil sauber ablesbar.

**Empfehlung.** Zuerst das Drift-Tor (2.4) — es ist billig und schließt das akute Problem. Die
Laufzeit-Ableitung (2.5) ist die Antwort, wenn die Werkzeugdefinitionen ohnehin angefasst werden
(P3-2 zerlegt `tools.ts` ohnehin in Fachmodule).

---

## 3 — Die Skills: der Werkzeugbezug wird nicht geprüft

`packages/skills/skills/` enthält neun deutsche Arbeitsanweisungen für Agenten (Router,
Grundfluss, Assets, Bilder, Motion, CMS, Layout, Review, Referenz-Redesign).

`packages/skills/test/skills.test.ts` prüft **String-Präsenz**: ein Skill muss „apply_mutations“,
„get_section“, „Alt-Text“, „Qwen Research License“ usw. **enthalten**. Das ist ein guter Test für
„der Inhalt ist da“.

**Er prüft aber nicht, ob die genannten Werkzeuge noch existieren.** Der Test entnimmt die
Werkzeugnamen aus der erwarteten Liste (Zeile 59-74) — er vergleicht sie mit **keinem** Manifest.
Ein umbenanntes oder entferntes Werkzeug lässt die Skill-Datei unverändert grün, während der Agent
danach ein Werkzeug aufruft, das es nicht mehr gibt.

**Vorschlag.** Ein Test, der alle `snake_case`-Bezeichner aus den Skill-Dateien sammelt, gegen
`TOOL_MANIFEST` prüft und eine kleine Ausnahmeliste (Namen, die keine Werkzeuge sind: `image-use`,
`senify`, Dateinamen) zulässt. Dann wäre der Bezug zwischen Anweisung und Wirklichkeit maschinell
geprüft.

---

## 4 — Die verbleibenden God-Files (Bestand, kein neuer Befund)

| Datei | Größe | Stand |
|---|---|---|
| `packages/mcp/src/tools.ts` | 151 KB / 3403 Zeilen | P3-2 (R12) nennt es als Ziel; die Auslagerung `tools-support.ts` / `tools-components.ts` hat 9727 / 4051 Bytes erreicht |
| `packages/mcp/src/server.ts` | 35 KB | nicht im Fahrplan genannt |
| `packages/mcp/src/cli.ts` | 22,5 KB | nicht im Fahrplan genannt |
| `packages/app/public/app.js` | 7436 Zeilen | P3-2 (R12) nennt es als Ziel |
| `packages/engine/src/http.ts` | 5244 Zeilen | P3-2 (R12) nennt es als Ziel; `http-response.ts` / `http-build-files.ts` sind ausgelagert |
| `packages/engine/src/store.ts` | 4120 Zeilen | P3-2, 22. Schritt abgeschlossen (ADR-0019) |

Der Fahrplan führt die Reihenfolge: `store.ts`, `http.ts`, `mcp/tools.ts`, `app.js`. `store.ts` ist
fast fertig (22 Schritte). Der nächste große Schritt — `http.ts` — ist der mit dem höchsten
Nutzen, weil dort die Routen, die Auth-Prüfung und die Fehlerabbildung liegen.

**Kein neuer Befund** — der Bestand ist dokumentiert und eingeplant. Der Hinweis in diesem Bericht
gilt der **Reihenfolge**: Wer `tools.ts` angefasst hat, hat den Generator angefasst (siehe 2.5).

---

## 5 — Prüfgrenzen

| Punkt | Stand |
|---|---|
| MCP-Server-Laufzeit | Code gelesen; **kein** Live-Aufruf eines MCP-Werkzeugs in dieser Untersuchung |
| Manifest-Generator | gelesen, **nicht** ausgeführt; die Behauptung „kein Drift-Tor“ ist durch die Suche in `package.json`, `verify.yml`, `verify`-Skript und `manifest.test.ts` belegt |
| Skills | Testlogik gelesen; die Behauptung „kein Bezug zum Manifest“ ist aus `skills.test.ts` belegt |
| Werkzeugverhalten | nicht gegen die Doku-Individualtexte geprüft (106 Werkzeuge × Doku) |
| Route-Matrix | nicht neu erzeugt (`pnpm route-matrix` wurde nicht ausgeführt) |

---

## Umsetzung (20.10.2026)

- **Drift-Tor für das Manifest:** `scripts/render-manifest.mjs --check` vergleicht die generierte
  Datei mit dem Generator (zeilenendunabhängig, weil die Zeilenenden Sache des Repos sind und
  nicht des Generators). `pnpm manifest:check` ruft das, ein Test in
  `packages/manifest/test/manifest.test.ts` ruft es im normalen Testlauf, die CI hat einen
  eigenen Schritt. Gegenprobe: eine manipulierte Manifest-Datei macht den Check rot.
- **Die letzte Kante des Docs-Zyklus ist weg:** der Test des Docs-Portals zog den MCP-Server in
  den Docs-Build (`import { TOOLS } from "@senify/mcp"`), obwohl das Manifest genau diese Fakten
  hält. Der Test liest jetzt `TOOL_MANIFEST` aus `@senify/manifest`, und die beiden
  `@senify/mcp`-Aliase in `packages/docs-portal/astro.config.mjs` sind entfernt.
- **Paketregeln als ausführbare Regel:** `.dependency-cruiser.js` (siehe Fachanalyse 6).
- **Der Werkzeugbezug der Skills wird jetzt geprüft** (zweite Prüfung, 20.10.2026): Abschnitt 3
  dieses Berichts hatte festgehalten, dass die Skills nur *nennen*, was sie tun — ohne zu prüfen,
  ob es das Werkzeug noch gibt. `packages/mcp/test/skills-tools.test.ts` prüft jetzt jeden in den
  Skills genannten Namen gegen das Manifest (die Faktenquelle). Zwei Namen sind mit Grund
  ausgenommen: `dry_run` (ein Schalter im Mutations-Batch) und `invalid_input` (eine
  Fehlerkategorie); ein zweiter Test meldet eine Ausnahme, die keine Fundstelle mehr hat.
  Gegenprobe: ein erfundener Werkzeugname im Router macht den Test rot. Der Test liegt im
  MCP-Paket, weil es das einzige Paket ist, das die Skills **und** das Manifest kennt — das
  Skills-Paket selbst darf keine Fachabhängigkeit haben (`skills-know-nobody`).