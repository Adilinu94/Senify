# Paket 1: Reproduzierbarer Vorher-/Nachher-Beleg (09.11.2026)

**Stand:** Branch `integration/c-auf-g-2026-11-08`, HEAD `d99b13d` (Lauf.Meta.gitHead).
**Werkzeug:** `.scratch/framer/paket1-beleg.mts` (versioniert). Lauf: `pnpm exec tsx .scratch/framer/paket1-beleg.mts [--offline]`.
**Beweisläufe:** `.scratch/framer-live-2026-11-09/paket1/` (ignoriert, kann Projektinhalte enthalten; nicht commiten).
**Datenbank:** isolierte Engine-Testinstanz mit pg-mem (in-memory); kein bestehendes Senify-Projekt verändert.

## Importmodus und Prüfbedingungen (für beide Fälle gleich)

- Capture `browser`, Modus `fidelity`, `write:true`, `createOnly:true`.
- Browserprüfung: Viewport 1440×900, `colorScheme: light`, Scrollposition 0, 5000 ms Wartezeit nach Load; Playwright 1.63.0, Node v24.15.0.
- Zusatzlasten des Imports: 900×1000 und 390×844 (Gerätevarianten). Diese Zustände sind im Build-Beleg **nicht** einzeln geprüft.
- Marker (synthetische Prüfzeichenfolge, kein Projektinhalt): `SENIFY-P1-EDIT-…`.

## Fall A — kontrollierte Fixture (abgeschlossen, offline wiederholbar)

Kleiner Mirror mit `data-framer-hydrate-v2` + Bundle-Skript; die mitgelieferte Runtime überschreibt die Überschrift zur Laufzeit. Drei Knoten, `editableShare {editable:0, original:100}`, Score 86.

| Variante | Marker im HTML | Marker im DOM | Runtime montiert | Payload-Träger im HTML | Framer-Anfragen | Console-Errors |
|---|---|---|---|---|---|---|
| before (Payload aktiv) | nein | nein | ja („FIXTURE RUNTIME OUTPUT“) | ja | 0 | keine |
| after (Text editiert, Payload aktiv) | nein | nein | ja | ja | 0 | keine |
| structure (Träger `active:false`) | **ja** | **ja** | nein | nein | 0 | keine |

- Textmutation `updateNodeProps` → 200, `newDraftVersion 3`; Träger-Deaktivierung → 1 (bei der Fixture trägt der Träger kein Poster, deshalb gelingt der Toggle hier).
- **Aussage:** Solange der Seiten-Payload aktiv ist, erscheint die Editor-Änderung **nicht** in der ausgelieferten Seite (HTML und DOM). Erst der Strukturpfad (`active:false`, ADR-0026) liefert den editierten Text aus und lädt die Fremd-Runtime nicht. Der Bake legt die Payload-Datei zwar weiter ab, bindet sie im Strukturpfad aber nicht ein.
- Grenze: `framerAnfragen:0` heißt hier nur „keine Anfrage an eine Framer-Domain im Prüflauf“, **nicht** „runtimefrei“ — die Fixture-Runtime ist lokal gebündelt und wird im Payload-Pfad sehr wohl ausgeführt (DOM-Beweis „montiert“).

## Fall B — echte Chocolate-Seiten (Ausgangsfall belegt, Strukturpfad blockiert)

Quelle: veröffentlichte URLs `/` und `/about` mit Browser-Capture (nicht der vorbereitete Mirror). Zugang temporär, nicht gespeichert.

- Import beide Seiten `succeeded`: `/` 719 Knoten, Score 69; `/about` 273 Knoten, Score 65; je `editableShare {editable:0, original:100}` und je ein seitenweiter `framer-runtime-payload`-Träger (`coversPage:true`, Pflicht-Poster aus `og:image`).
- Textmutationen je Seite → **200**, `newDraftVersion 3` (Startseite und `/about`).
- **Ausgangsfall Payload-Modus bestätigt:** Der Marker steht in **keiner** gebauten HTML-Datei des After-Builds (`/` und `/about`), obwohl die Textmutation gespeichert wurde. Beide HTML-Dateien enthalten den Payload-Träger (`data-payload-id="…"`). Die ausgegebene Seite ist die Fremd-Runtime, nicht der editierte Baum.
- Build-Warnungen: mehrere `children-unrendered` an `link`-Knoten (Kinder, die keine Komponente rendert) — als ungeprüfte Auffälligkeit vorgemerkt, nicht Bestandteil dieses Gates.

### Blocker B1 — Träger-Toggle (`active:false`) scheitert an der Prop-Grenze

Der Wechsel in den Strukturpfad (ADR-0026) bricht für **jede importierte Seite mit Pflicht-Poster** ab:

```
POST /api/pages/:id/mutations  { op:"updateNodeProps", id:"framer-runtime-payload", patch:{ active:false } }
→ 400 { category:"validation", message:"Unsupported style value shape",
        field:"mutations[0].props.poster",
        suggestion:"Use a number, a string, a token reference or a four-side bag." }
```

**Ursache (Codebeleg):**

1. `registerCatalogPrimitives` registiert `payload` als Registry-Typ (`packages/registry/src/sections/primitives.ts:87`). Dadurch nimmt `applyUpdateProps` den Registry-Zweig, der **alle** gemergten Props prüft (`packages/engine/src/mutations/apply.ts:656`), nicht den Primitiv-Schnellpfad (der nur Patch-Tasten prüft, `apply.ts:625`).
2. `validatorOf` läuft über alle Props und ruft `checkPropValue` (`primitives.ts:75`).
3. `checkPropValue` akzeptiert die Asset-Referenz über `matchesValueType("asset", {assetId})` (`packages/widget-engine/src/controls.ts:74`, `isAssetRef`), schickt Objekt-Werte danach aber erneut durch `checkSafeValue` (`packages/widget-engine/src/prop-boundary.ts:118`).
4. `checkSafeValue` kennt nur Token-Referenz und Spacing-Bag; eine Asset-Referenz `{assetId:…}` ist weder das eine noch das andere → „Unsupported style value shape“ (`prop-boundary.ts:93`).

**Divergenz:** Der Primitiv-Schnellpfad (`assertPropValue`, `packages/widget-engine/src/validation.ts:154`) prüft Objekt-Werte nur bei Token-Referenzen nach und lässt Asset-Referenzen passieren. Der Registry-Zweig weist sie ab. Zwei Türen, zwei Ergebnisse.

**Tragweite (Boundary-Probe, reproduzierbar):** `checkPropValue` weist `{assetId:…}` für `payload.poster` **und** `image.asset` ab; eine Asset-Zeichenfolge (`"/assets/…"`) und eine Token-Referenz (`{$token:…}`) werden akzeptiert. Damit ist nicht nur der Träger-Toggle betroffen, sondern jede Bearbeitung eines Knotens, der bereits eine Asset-Referenz trägt, über den Registry-Zweig — ein Kernhindernis für strukturierte Bearbeitbarkeit (Paket 3).

**Einordnung:** Das Poster ist beim Import Pflicht (ADR-0010 §7). Der dokumentierte Rückweg in den editierbaren Baum (ADR-0026, `active`) ist damit für reale Importseiten aktuell nicht ausführbar. Der Fix berührt die Wert-Grenze aus ADR-0005 (Asset-Referenzen sind opaque IDs, kein CSS) und die Konsistenz zweier Validierungspfade — nach Arbeitsauftrag §5.3 und AGENTS.md ist das eine fachlich zu entscheidende und zu dokumentierende Änderung, **kein** stiller Patch. Entscheidung wird in Paket 2 vorgelegt.

## Ergebnis gegen das Paket-1-Gate

- Wiederholbarer Vorher-/Nachher-Beleg für eine konkrete Änderung: **erfüllt** (Fixture, drei Varianten, Browser-Gegenprobe in HTML und DOM).
- Getrennte Kennzeichnung des tatsächlich ausgelieferten Seiteninhalts: **erfüllt** (Payload-Träger vs. Strukturbaum, Marker-Sichtbarkeit, Netzwerk, Console).
- Importmodus, Projektstand, ungeprüfte Fälle: **benannt** (siehe oben; Geräte-Zusatzlasten, CMS, Mehrseiteninventar, Motion-Zustände, `children-unrendered`-Warnungen sind ungeprüft).
- Echtabnahme Strukturpfad: **blockiert** durch B1. Kein Erfolg der strukturierten Bearbeitung angenommen.

## Ungeprüft / offen

- Gerätebreiten 900×1000 und 390×844 nur als Import-Zusatzlast, nicht als Build-Gegenprobe.
- CMS, Mehrseiteninventar, Reimport/Bestandsschutz (Paket 5), Motion-/Hover-Zustände (Paket 6), Runtime-Freiheitsprüfung über Domain-Zählung hinaus (Paket 4).
- B1-Entscheidung (Wert-Grenze / Ausgabearten) — Paket 2.