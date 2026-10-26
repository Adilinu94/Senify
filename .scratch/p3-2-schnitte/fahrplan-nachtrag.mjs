// Ergänzt die vier fehlenden Fahrplan-Einträge (Schritte 68-71).
//
// Sie fehlen, obwohl `AGENTS.md` sagt: "Jeder Arbeitsschritt startet mit
// Definition of Ready und endet mit einem ausgefuehrten Gate aus
// docs/fahrplan.md." Der Fahrplan ist das Arbeitsprotokoll - ein Schritt, der
// dort nicht steht, ist nicht nachvollziehbar.
//
// Eingefügt wird vor dem Schritt-67-Eintrag (neueste zuerst).
import { readFileSync, writeFileSync } from "node:fs";

const pfad = "docs/fahrplan.md";
const L = readFileSync(pfad, "utf8").split(/\r?\n/);

const anker = L.findIndex((z) => z.includes("P3-2 Schritt 67: die Referenzen einer Site"));
if (anker < 0) {
  console.error("Anker (Schritt 67) nicht gefunden");
  process.exit(1);
}

const eintraege = [
  "| 26.10.2026 | P3-2 Schritt 71: die Referenz- und Design-Werkzeuge wandern aus `packages/mcp/src/tools.ts` in `tools-referenzen.ts` (31 Werkzeuge, 982 Zeilen: 24 Referenz, 4 Redesign, 3 Design). `tools.ts`: 2 614 -> 1 671 Zeilen. **Der Beweis ist der Manifest-Diff, nicht die Zeilenzahl:** `...REFERENZ_TOOLS,` steht an genau derselben Stelle (nach den Medien-Werkzeugen, vor `set_design_contract`), und `pnpm manifest:check` meldet 109 Werkzeuge unveraendert. `set_design_contract` blieb in `tools.ts` - es ist der schreibende Weg zum Design-Vertrag, waehrend im neuen Modul nur der lesende liegt. **Ein Waechter fand eine echte Luecke:** `coverage-gate.test.ts` war rot, weil das neue Modul in der Messung stand, aber keine Schwelle hatte; gemessen 88,33 / 61,36 / 100 / 94,97, Schwelle 85 / 55 / 95 / 92. **Ein eigener Fehler, korrigiert:** der Modulkopf sagte zuerst \"dreiundzwanzig Referenz-Werkzeuge\"; gezaehlt sind es 31. |",
  "| 26.10.2026 | P3-2 Schritt 70: die Code-Payloads einer Site wandern aus `http-routes-sites.ts` in `http-routes-site-code-payloads.ts` (2 Routen, 56 Zeilen: anlegen, lesen). `http-routes-sites.ts`: 303 -> 270 Zeilen, 11 -> 9 Routen; 21 Routen-Module, 178 Routen. Drei Importe wandern mit, drei bleiben gemeinsam (`CreateCodePayloadBody`, sein Schema, `createCodePayload`). **Damit ist der Zuschnitt an seiner fachlichen Grenze:** was bleibt, ist der Betrieb einer Site (Seiten, Audit, Releases, Bake-Jobs, Formulare, Benachrichtigungen, Redesign), und der Betriebs-Block wurde schon bei Schritt 67 gemessen und verworfen (2 von 6 Importen). Coverage: 100 / 100 / 100 / 100, ohne neuen Test. |",
  "| 26.10.2026 | P3-2 Schritt 69: Vorschauen und Reviews einer Site wandern aus `http-routes-sites.ts` in `http-routes-site-reviews.ts` (4 Routen, 134 Zeilen: Vorschau ausstellen, Vorschauen lesen mit Aufraeumen, Review einreichen, Reviews lesen). `http-routes-sites.ts`: 414 -> 303 Zeilen. **Vier zusammen, nicht zwei und zwei:** `submitReview` gibt `review`, `preview` und `checks` zurueck; neun Importe wandern mit, getrennt waeren es fuenf bzw. vier. Die Statuspruefung (`REVIEW_STATUSES`, 400 mit Feld `status`) steht zeichengleich im neuen Modul. Coverage: 100 / 100 / 100 / 100, ohne neuen Test. |",
  "| 26.10.2026 | P3-2 Schritt 68: die Asset-Routen einer Site wandern aus `http-routes-sites.ts` in `http-routes-site-assets.ts` (2 Routen, 86 Zeilen: Upload-Adresse, Bestand lesen). `http-routes-sites.ts`: 468 -> 414 Zeilen. Sechs Importe wandern mit (`mediaContext`, `UploadUrlBody`, sein Schema, `createUploadTicket`, `parseAssetListFilters`, `queryAssets`), sechs bleiben gemeinsam. **Die Paging-Regel wanderte woertlich mit:** der Block wird aus der GEFILTERTEN Liste gebaut, damit `total` und `hasMore` beschreiben, was der Filter getroffen hat. **Ein Coverage-Fund war eine Testluecke:** das Modul stand bei 50 % Branches, weil der Test fuer leere Koerper `/assets` traf, aber nicht `/assets/upload-url`; die Route ist ergaenzt, danach 100 / 100 / 100 / 100. |",
];

L.splice(anker, 0, ...eintraege);
writeFileSync(pfad, L.join("\r\n"), "utf8");

console.log(`${eintraege.length} Eintraege vor Zeile ${anker + 1} eingefuegt.`);
console.log("");
for (const e of eintraege) console.log(`  ${e.slice(0, 100)}…`);
