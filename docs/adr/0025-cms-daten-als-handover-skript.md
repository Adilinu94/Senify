# CMS-Daten kommen als Handover-Skript mit, nicht als Nachladen

Status: angenommen · 25.10.2026
Bezug: ADR-0010 (Island-Payload für importierten Fremd-Code), `docs/fahrplan-framer-1zu1.md`
Schritt 6 („CMS-Daten"), `packages/framer-import/src/runtime-payload.ts`.

**Problem.** Eine Framer-Seite mit einem CMS (Sammlungen, Blog, Case Studies) zeigt nach dem
Import zunächst alles an — und wird nach wenigen Sekunden **weiß**. Gemessen auf
`rare-works-510047` (Saro-Vorlage, Startseite mit 3 Sammlungen):

| Zeit nach `load` | `#main`-Kinder | Höhe | `__framer_hadFatalError` |
|---|---|---|---|
| 0,5 s | 3 | 17.508 px | — |
| 2,0 s | 3 | 17.508 px | — |
| **4,4 s** | **1** | 17.508 px | **`true`** |

2.600 von 3.135 Knoten waren weg, der Rest war unsichtbar: Framer hatte die Seite geleert.

**Ursache.** Die Runtime liest ihre vorgeladenen Sammlungsdaten aus dem Dokument:

```js
let e = document.getElementById(`__framer__handoverData`);
if (e) { Nv = sn(e.text) ?? mn(); … U_(() => { e?.remove() }) }
```

Fehlt das Element, fällt sie auf das Netz zurück und ruft `Ca.loadModel()` auf einer
`.framercms`-Datei (hier 62 KB, per Range-Query). Der Payload liefert diese Datei nicht, und die
CSP verbietet den fremden Abruf (`connect-src 'self'`):

```
TypeError: Failed to fetch
    at J9 (…/rel-payload-1….js)
    at async Ca.loadModel (…)
    at async Ca.getModel (…)
Made UI non-interactive due to an error.
```

`getModel` ist der Auslöser: kein Modell → React-Fehler → `componentDidCatch` → Seite leeren.

**Der entscheidende Messbefund.** Die **Quelle** lädt **nie** eine `.framercms`-Datei:

| Prüfung | Quelle | Vorschau (vor dem Fix) |
|---|---|---|
| `.framercms`-Anfragen in 8 s + Scrollen | **0** | 1 (blockiert) |
| `framer/handover`-Skript im HTML | **1** (4.695 Zeichen) | **0** |
| `framerusercontent.com`-Anfragen | 125 (nur Bilder) | — |

Framer schickt die Ergebnisse seiner Sammlungs-Abfragen beim SSR **als Skript mit**:

```html
<script type="framer/handover" id="__framer__handoverData">[{…},["Map",…],…]</script>
```

Es ist Teil der Seite, nicht des Netzes. Der Import hatte es nur nicht mitgenommen — er las
`#main` und dessen Geschwister, aber nicht dieses Skript.

**Entscheidung.** Der Import liest das Handover-Skript aus dem SSR-HTML und der Payload setzt es
**vor** dem Start der Runtime wieder ins Dokument. Begründung:

1. **Es ist die Quelle selbst.** Kein Nachbau, kein Raten: derselbe Text, den Framer ausliefert.
   Die Datei bleibt unverändert (Frames eigenes Serialisierungsformat, kein JSON, das wir lesen
   müssten).
2. **Kein Netzzugriff, keine CSP-Ausnahme.** Der Weg über die `.framercms`-Datei hätte bedeutet,
   einen fremden Host in `connect-src` aufzunehmen und eine Binärdatei mit Range-Requests
   auszuliefern — für Daten, die im HTML schon stehen. Die CSP bleibt eng.
3. **Vor der Runtime, nicht danach.** Die Runtime sucht das Element, wenn sie es zum ersten Mal
   braucht, und entfernt es danach. Ein später eingefügtes Element wird nie gesehen — der Test
   hält diese Reihenfolge fest.
4. **Nur wenn die Seite eines hat.** Seiten ohne CMS bekommen `null` (nicht `""`): „hatte nie
   Daten" ist etwas anderes als „hatte leere Daten", und nur der Unterschied verhindert, dass
   später ein leerer Handler als Beleg für ein CMS gilt.

**Zweiter Fehler, den dieselbe Messung aufdeckte.** Nach dem Handover-Fix blieben 35
CDN-Adressen im Bundle und 13 Bilder waren kaputt. Zwei unabhängige Ursachen:

1. `import.ts` übergab die Umschreibtabelle (`urlRewrites`) **gar nicht** an den Payload — nur den
   Callback, der die Adressen im Markup ersetzt. Die Daten der Runtime (JSON mit escapten
   Schrägstrichen) brauchen aber die Tabelle. 303 → 18 Adressen nach dem Fix.
2. `collectAssets` las bei `<img>` nur `src`, nie `srcset`. Drei Sammlungsbilder nannten ihre Datei
   **nur** im `srcset`; sie hatten keinen Asset-Eintrag, also auch keinen lokalen Pfad. 18 → 4
   Adressen, 3 → 0 kaputte Bilder.

**Beleg.** Die Zählung ist wiederholbar:

```bash
pnpm exec tsx packages/framer-import/scripts/preview.ts https://rare-works-510047.framer.app/ 4174
# dann im Browser: __framer_hadFatalError muss undefined bleiben, /cms/-Anfragen 0
pnpm exec tsx _messung/release-all.ts https://rare-works-510047.framer.app/
# desktop 0.00% · tablet 0.00% · mobile 0.01%, Höhen 17508/20162/20648, state=mounted
```

Tests: `runtime-handover.test.ts` (6 Fälle, ohne Fix 4 rot), `capture.test.ts` (srcset-Fall).
Die Attrappen-Seite im Test trägt bewusst beide Attribut-Reihenfolgen: Framer schreibt `type` vor
`id`, eine neu serialisierte Seite darf es andersherum tun.

**Grenze, die bleibt.** Das Skript trägt die Daten **der importierten Seite**. Eine Sammlung, die
erst auf einer **anderen** Route gebraucht wird (Detailseite, Filterung), ist damit nicht
abgedeckt — dort müsste die jeweilige Seite selbst importiert werden. Das ist keine Lücke dieses
Verfahrens, sondern der Zuschnitt „eine Seite, ein Payload" aus ADR-0010.
