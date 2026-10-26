// Setzt P3-7 auf den ehrlichen Stand.
//
// Befund vom 26.10.2026: die Ueberschrift sagt "geschlossen 21.10.2026", und
// der Text darunter sagt "alle sechs Messpunkte sind geschlossen, keiner ist
// offen". Beides ist falsch:
//
//   Punkt 15: `unifiersofjapan` bleibt offen bei 14,73 / 22,82 / 21,24 %.
//             Die Hoehe stimmt exakt, die Schrift laedt - die Ursache ist
//             unklar, also ist die Arbeit nicht getan.
//   Punkt 1:  Die Bewertungssterne fehlen. Das ist KEINE Import-Luecke (die
//             Sterne stehen nicht im SSR-HTML), sondern eine Grenze der
//             Quelle - aber der Punkt ist darum nicht "geschlossen".
//
// Der neue Kopf sagt "teilweise", damit die Ueberschrift nicht mehr
// Erledigung behauptet als der Inhalt hergibt.
import { readFileSync, writeFileSync } from "node:fs";

const datei = "docs/fahrplan.md";
const L = readFileSync(datei, "utf8").split(/\r?\n/);

const kopf = L.findIndex((z) => z.startsWith("### P3-7"));
if (kopf < 0) throw new Error("P3-7 fehlt");

const vorher = L[kopf];
// "— geschlossen 21.10.2026" -> "— teilweise geschlossen (26.10.2026 berichtigt)"
const nachher = vorher.replace(
  /[—–-]{1,2}\s*geschlossen\s+\d{2}\.\d{2}\.\d{4}\s*$/,
  "— teilweise geschlossen (26.10.2026 berichtigt)",
);
if (nachher === vorher) throw new Error("Kopf-Status nicht ersetzt");
L[kopf] = nachher;
console.log("Kopf:");
console.log(`  vorher : ${vorher}`);
console.log(`  nachher: ${nachher}`);
console.log("");

// Den irrefuehrenden Satz darunter berichtigen.
const s = L.findIndex(
  (z, i) => i > kopf && i < kopf + 12 && z.startsWith("**Stand 24.10.2026: alle sechs Messpunkte"),
);
if (s < 0) {
  console.log("Der Satz 'alle sechs Messpunkte sind geschlossen' steht nicht mehr da.");
} else {
  const alt = L[s];
  L[s] =
    "**Stand 26.10.2026: von 16 Punkten sind 14 geschlossen, einer ist eine Grenze der Quelle, einer ist offen.** " +
    "Die Ueberschrift sagte bis heute „geschlossen“; gemessen ist das nicht mehr wahr. " +
    "**Offen ist Punkt 15:** `unifiersofjapan` bleibt bei 14,73 / 22,82 / 21,24 % Abweichung — die Höhe stimmt exakt (7699 px), die Schrift lädt (Anton wird gerendert), die Ursache ist unklar. " +
    "**Eine Grenze ist Punkt 1:** die Bewertungssterne stehen nicht im Server-HTML (0× im SSR, 5× im gerenderten DOM), der Import kann nur lesen, was das SSR preisgibt; wer sie will, braucht eine zweite Quelle (Unframer oder Bild) — das ist eine Produktentscheidung. " +
    "Die Zählung ist nicht von Hand: `packages/engine/test/doku-konsistenz.test.ts` liest den Status jeder Punktzeile aus der Ursachen-Zelle.";
  console.log("Satz berichtigt:");
  console.log(`  vorher : ${alt.slice(0, 120)}...`);
  console.log(`  nachher: ${L[s].slice(0, 120)}...`);
}

writeFileSync(datei, L.join("\r\n"), "utf8");
