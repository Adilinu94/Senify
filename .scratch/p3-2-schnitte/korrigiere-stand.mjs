// Ersetzt in einer Zeile per Index - die Umlaute in den Register-Zeilen
// ueberstehen keinen Mustervergleich (das Edit-Tool scheitert daran, und ein
// Vergleich ueber die halbe Zeile scheitert an den Anfuehrungszeichen).
import { readFileSync, writeFileSync } from "node:fs";

const datei = "docs/current/stand.md";
const L = readFileSync(datei, "utf8").split(/\r?\n/);

/** Ersetzt den Text zwischen zwei Ankern (Anker bleiben stehen). */
function ersetzeZwischen(zeile, anfang, ende, neu) {
  const a = zeile.indexOf(anfang);
  if (a < 0) throw new Error(`Anfang nicht gefunden: ${anfang}`);
  const b = zeile.indexOf(ende, a + anfang.length);
  if (b < 0) throw new Error(`Ende nicht gefunden: ${ende}`);
  return zeile.slice(0, a + anfang.length) + neu + zeile.slice(b);
}

// ---- R6: die zwei Zeilenverweise ----
const i6 = L.findIndex((z) => z.startsWith("| R6 |"));
if (i6 < 0) throw new Error("R6 fehlt");
let r6 = L[i6];
// `http.ts:531-541` -> `http-route-support.ts:204-238`
r6 = r6.replace("`http.ts:531-541`", "`http-route-support.ts:204-238`");
// `http.ts:506-519` -> `http-route-support.ts:179-192`
r6 = r6.replace("`http.ts:506-519`", "`http-route-support.ts:179-192`");
// Den Hinweis auf die veralteten Verweise anhaengen, vor der schliessenden Pipe.
if (!r6.includes("hinter dem Dateiende")) {
  const letztePipe = r6.lastIndexOf("|");
  const zusatz =
    " Die Zeilenverweise zeigten bis zum 26.10.2026 auf `http.ts:531-541` und `http.ts:506-519` - die Datei hat seit dem Routen-Schnitt 275 statt ueber 500 Zeilen, die Belege lagen also hinter dem Dateiende. Sie zeigen jetzt auf `http-route-support.ts`, wo der Code seit dem Schnitt steht.";
  r6 = r6.slice(0, letztePipe) + zusatz + " " + r6.slice(letztePipe);
}
L[i6] = r6;
console.log("R6 korrigiert.");

// ---- R11: die Zahl der Fachmodule ----
const i11 = L.findIndex((z) => z.startsWith("| R11 |"));
if (i11 < 0) throw new Error("R11 fehlt");
let r11 = L[i11];
if (r11.includes("die 33 ausgelagerten Fachmodule")) {
  r11 = r11.replace(
    "die 33 ausgelagerten Fachmodule der Engine",
    "die ausgelagerten Fachmodule der Engine",
  );
  // Die gemessene Zahl hinter die Klammer mit den Dateimustern setzen.
  r11 = r11.replace(
    "(`store-*.ts`, `http-*.ts`)",
    "(`store-*.ts`, `http-*.ts`; Stand 26.10.2026: 38 + 25 = 63 Dateien)",
  );
  L[i11] = r11;
  console.log("R11 korrigiert.");
} else {
  console.log("R11: Muster nicht gefunden, unveraendert.");
  console.log(r11.slice(0, 300));
}

writeFileSync(datei, L.join("\r\n"), "utf8");
