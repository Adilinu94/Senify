# Struktur-Ausgabe an der echten Framer-Seite, 09.11.2026

## Umfang

- Branch `integration/c-auf-g-2026-11-08`, HEAD `ae9f313`, Node 24.15.0.
- Isolierte Engine-Testinstanz mit pg-mem; keine produktive Datenbank und kein bestehendes Senify-Projekt verändert.
- Quelle: `https://chocolate-attributes-385353.framer.app/` und `/about`. Die Adresse liefert inzwischen die Seite „Astra“; der Inhalt hat sich seit dem früheren Chocolate-Lauf geändert.
- Import: `capture: browser`, `mode: fidelity`, `output: structure`, `write: true`, `createOnly: true`; Theme-Patch nur für `/`.
- Der Text wurde über die Editor-Mutationsroute geändert, nicht über den Browser-Editor. Den echten Editorweg belegt `packages/app/test/framer-import-browser.test.ts`.
- Rohbelege: `.scratch/framer-live-2026-11-09/structure-final-run/result.json` und die Builds daneben. Der Ordner ist lokal und ignoriert.

## Import

| Seite | Knoten | Dauer | Ausgabe | Träger | Payloads | aktive Seiten-Träger | Funde (nicht info) |
|---|---|---|---|---|---|---|---|
| `/` | 720 | 169 s | `structure` | `structure` | 0 | 0 | 178 von 189 |
| `/about` | 274 | 20 s | `structure` | `structure` | 0 | 0 | 124 von 134 |

Beide Berichte nennen `Ausgabe "structure" am Seitenwurzelknoten gespeichert.`

## Änderung und Build

- Erster Textknoten je Seite war „Astra“ (`fi-8a5eda-11`, `fi-979bdd-11`); die Mutation setzte den Marker `SENIFY-STRUCT-mw9lwxcb`, Draft-Version jeweils 3.
- Build vor und nach der Änderung für beide Seiten. Der Marker erscheint nach der Änderung in HTML und Browser-DOM.
- Kein `data-payload-id` im HTML, kein `framerImport` im HTML, kein Verzeichnis `assets/payloads`.
- Keine Anfrage an einen Framer-Host im gebauten Zustand (`/`: 37 Anfragen, `/about`: 13).
- Keine Konsolenfehler im Browser.
- HTML-Größe nach der Änderung: `/` 226 326 Bytes, `/about` 70 893 Bytes.

## Konkrete offene Fälle

- `/`: 176 `warn:unsupported-declaration`, 2 `warn:smooth-scroll`; darunter 27 Data-URL-Grafiken in einem Stilausdruck nicht übernommen und mehrere `appear-id`-Effekte ohne zugeordneten Knoten.
- `/about`: 122 `warn:unsupported-declaration`, 2 `warn:smooth-scroll`; gleiche `appear-id`-Klasse.
- Build-Warnungen je Variante: 17 `children-unrendered` (Link-Knoten mit Kindern) und 24 `css-value-dropped`.
- `/` lädt lokal `lenis.min.js`, `page.js` und ein Inline-Skript. Deren Verhalten ist nicht vollständig geprüft; ein fehlender Framer-Host-Aufruf allein belegt keine Runtime-Freiheit.
- Nur 1440 × 900, hell, Scrollposition 0, 3 s nach `load`. Tablet, Mobil, Hover, Scroll-Zustände, Bewegung, CMS und weitere Seiten sind nicht geprüft.

## Reproduktion

```powershell
pnpm exec tsx .scratch/framer/structure-beleg-2026-11-09.mts
# oder in ein neues Verzeichnis:
$env:SENIFY_STRUCTURE_OUT = ".scratch/framer-live-2026-11-09/structure-lauf-2"
pnpm exec tsx .scratch/framer/structure-beleg-2026-11-09.mts
```

Das Skript bricht ab, wenn ein aktiver seitenweiter Träger, ein fehlender Marker in HTML oder DOM, ein Payload-Träger im HTML oder `framerImport` im HTML auftritt.
