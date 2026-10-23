// Wie tief sind echte Framer-Importe, und was macht die Einrueckung daraus?
//
// `explorer/panel.ts` setzt `paddingLeft = 6 + depth * 14` px. Das Explorer-
// Panel ist 259 px breit (gemessen im UI-Audit vom 24.09.2026). Ab Tiefe 18
// sind das 258 px - der Zeileninhalt beginnt dann am oder hinter dem Rand.
//
// Diese Messung zaehlt die Tiefenverteilung in allen drei Exporten, damit die
// Grenze aus Daten kommt und nicht aus Geschmack.
import { resolve } from "node:path";
import { runImport } from "@senify/framer-import";

const FIXTURES = [
  "framer-stupendous-football-158496",
  "framer-fluffy-rectangle-418998",
  "framer-easier-train-154753",
];

const PANEL_PX = 259;
const STEP_PX = 14;
const BASE_PX = 6;

for (const name of FIXTURES) {
  const run = await runImport({
    source: { kind: "mirror", rootDir: resolve("packages/framer-import/test/fixtures", name) },
    mode: "fidelity",
  });
  const document = run.mapped.document;

  const tiefen = new Map<number, number>();
  const besuchen = (id: string, d: number): void => {
    tiefen.set(d, (tiefen.get(d) ?? 0) + 1);
    const node = document.nodes[id];
    if (node === undefined) return;
    for (const child of node.children ?? []) besuchen(child, d + 1);
    for (const list of Object.values(node.slots ?? {})) for (const child of list) besuchen(child, d + 1);
  };
  besuchen(document.rootNodeId, 0);

  const max = Math.max(...tiefen.keys());
  const knoten = [...tiefen.values()].reduce((a, b) => a + b, 0);
  // Ab welcher Tiefe laeuft der Inhalt aus dem Panel?
  const grenze = Math.floor((PANEL_PX - BASE_PX) / STEP_PX);
  let betroffen = 0;
  for (const [d, n] of tiefen) if (BASE_PX + d * STEP_PX > PANEL_PX - 40) betroffen += n;

  console.log(
    `${name}\n` +
      `  Knoten: ${knoten}, maximale Tiefe: ${max}\n` +
      `  Einrueckung bei Tiefe ${max}: ${BASE_PX + max * STEP_PX} px (Panel ${PANEL_PX} px)\n` +
      `  Ab Tiefe ${grenze} ist die Zeile randlos\n` +
      `  Knoten, deren Zeile kaum Platz hat (> ${PANEL_PX - 40} px Einrueckung): ${betroffen}\n`,
  );
}
