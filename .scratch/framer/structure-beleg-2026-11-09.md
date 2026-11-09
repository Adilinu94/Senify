# Struktur-Ausgabe an der echten Framer-Seite, 09.11.2026

## Umfang

- Branch `integration/c-auf-g-2026-11-08`, HEAD `1abe0d4`, Arbeitsbaum mit Link-Fix, Node 24.15.0.
- Isolierte Engine-Testinstanz mit pg-mem; keine produktive Datenbank und kein bestehendes Senify-Projekt verändert.
- Quelle: `https://chocolate-attributes-385353.framer.app/` und `/about`. Die Adresse liefert inzwischen die Seite „Astra“; der Inhalt hat sich seit dem früheren Chocolate-Lauf geändert.
- Import: `capture: browser`, `mode: fidelity`, `output: structure`, `write: true`, `createOnly: true`; Theme-Patch nur für `/`.
- Der Text wurde über die Editor-Mutationsroute geändert, nicht über den Browser-Editor. Den echten Editorweg belegt `packages/app/test/framer-import-browser.test.ts`.
- Rohbelege: `.scratch/framer-live-2026-11-09/structure-linkfix-2026-11-09/result.json` und die Builds daneben. Der Ordner ist lokal und ignoriert; die Läufe davor liegen unter `structure-audit-2026-11-09` (vor dem Link-Fix, mit `/` unbekannt) und `structure-final-run` (ohne Laufzeitprüfung).

## Import

| Seite | Knoten | Dauer | Ausgabe | Träger | Payloads | aktive Seiten-Träger | Funde (nicht info) |
|---|---|---|---|---|---|---|---|
| `/` | 712 | 154 s | `structure` | `structure` | 0 | 0 | 179 von 190 |
| `/about` | 265 | 25 s | `structure` | `structure` | 0 | 0 | 124 von 134 |

Beide Berichte nennen `Ausgabe "structure" am Seitenwurzelknoten gespeichert.` Die Knotenzahl sinkt gegenüber dem Lauf davor um 8 beziehungsweise 9, weil Textlinks keine ungerenderten Rich-Text-Kinder mehr tragen.

## Änderung und Build

- Erster Textknoten je Seite war „Astra“ (`fi-8a5eda-11`, `fi-979bdd-11`); die Mutation setzte den Marker `SENIFY-STRUCT-mw9pqj7w`, Draft-Version jeweils 3.
- Build vor und nach der Änderung für beide Seiten. Der Marker erscheint nach der Änderung in HTML und Browser-DOM.
- Kein `data-payload-id` im HTML, kein `framerImport` im HTML, kein Verzeichnis `assets/payloads`.
- Keine Anfrage an einen Framer-Host im gebauten Zustand (`/`: 35 Anfragen, `/about`: 13).
- Keine Konsolenfehler im Browser.
- HTML-Größe nach der Änderung: `/` 226 318 Bytes, `/about` 70 743 Bytes.
- Keine `children-unrendered`-Warnung mehr; vor dem Link-Fix waren es 17.

## Laufzeitprüfung

Die gebaute Seite wurde mit `auditFramerRuntime` aus `packages/engine/src/runtime-audit.ts` geprüft. Das Ergebnis hat drei Zustände: bestätigt, widerlegt, unbekannt.

| Seite | Ergebnis | Signale |
|---|---|---|
| `/` | widerlegt | Keine Script-Tags im HTML. Kein Payload, keine Framer-Host-Anfrage, kein Framer-Global. |
| `/about` | widerlegt | Keine Script-Tags im HTML. Kein Payload, keine Framer-Host-Anfrage, kein Framer-Global. |

Das widerlegte Ergebnis ist ein Marker-Beleg, kein formaler Beweis gegen bewusst verschleierten Code: in beiden gebauten Seiten gibt es keinen ausführbaren Inhalt. Im Lauf davor (vor dem Link-Fix) war `/` unbekannt, weil ein Inline-Skript `lenis.min.js` und `page.js` dynamisch nachlud. Dieser Loader gehörte zu einem Rich-Text-Kind eines Textlinks, das nie gerendert wurde. Nach dem Link-Fix ist das Kind nicht mehr im Baum, der Loader entfällt, und die gebaute Seite hat kein Skript mehr. Ein fehlender CDN-Aufruf allein würde weiterhin nicht für `refuted` reichen; hier kommt der fehlende ausführbare Inhalt hinzu.

## Link-Fix

`packages/framer-import/src/mapper.ts` hängt an einen `link`, der nur sein `label` rendert, keine Kinder mehr. Ein Test in `packages/framer-import/test/import-fidelity.test.ts` hält das fest. Im Live-Build verschwinden dadurch alle 17 `children-unrendered`-Warnungen; die Knotenzahl sinkt von 720 auf 712 beziehungsweise 274 auf 265. Die sichtbare Ausgabe bleibt gleich, weil die Kinder vorher nicht gerendert wurden.

Offen bleibt die Bewegung oder Inline-Auszeichnung auf einem Textlink: sie lag auf dem nicht gerenderten Kind und wird nicht auf das Label übertragen. Das ist ein Fidelity-Fall, kein Laufzeitfall.

## Konkrete offene Fälle

- `/`: 176 `warn:unsupported-declaration`, 2 `warn:smooth-scroll`; darunter 27 Data-URL-Grafiken in einem Stilausdruck nicht übernommen und mehrere `appear-id`-Effekte ohne zugeordneten Knoten.
- `/about`: 122 `warn:unsupported-declaration`, 2 `warn:smooth-scroll`; gleiche `appear-id`-Klasse.
- Build-Warnungen im Link-Fix-Lauf: keine `children-unrendered` und keine `css-value-dropped`. Vor dem Link-Fix waren es 17 `children-unrendered`.
- Keine lokalen Skripte in den gebauten Seiten. Der frühere Lader für `lenis.min.js` und `page.js` hing an einem nie gerenderten Link-Kind und ist mit dem Link-Fix entfallen. Die Bewegung des Textlinks selbst ist damit nicht übertragen; dieser Fidelity-Fall bleibt offen.
- Nur 1440 × 900, hell, Scrollposition 0, 3 s nach `load`. Tablet, Mobil, Hover, Scroll-Zustände, Bewegung, CMS und weitere Seiten sind nicht geprüft.

## Reproduktion

```powershell
$env:SENIFY_STRUCTURE_OUT = ".scratch/framer-live-2026-11-09/structure-lauf-$(Get-Date -Format yyyyMMdd-HHmmss)"
pnpm exec tsx .scratch/framer/structure-beleg-2026-11-09.mts
```

Das Skript verweigert ein bereits vorhandenes Ausgabeziel. Für jede Wiederholung einen neuen Pfad wählen.

Das Skript bricht ab, wenn ein aktiver seitenweiter Träger, ein fehlender Marker in HTML oder DOM, ein Payload-Träger im HTML oder `framerImport` im HTML auftritt.
