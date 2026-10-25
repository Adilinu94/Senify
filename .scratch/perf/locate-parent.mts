// Gegenprobe: `locateParent` laeuft ueber ALLE Knoten, und `ensureVisible`
// ruft es einmal je Vorfahre auf. Bei einem tiefen Knoten ist das
// (Tiefe x Knotenzahl). Gemessen, nicht behauptet.
import { resolve } from "node:path";
import { runImport } from "@senify/framer-import";
import { locateParent } from "../../packages/editor/src/state/document.ts";

const run = await runImport({
  source: {
    kind: "mirror",
    rootDir: resolve("packages/framer-import/test/fixtures/framer-easier-train-154753"),
  },
  mode: "fidelity",
});
const document = run.mapped.document;
const knoten = Object.keys(document.nodes).length;

// Tiefsten Knoten finden (der teuerste Fall fuer ensureVisible).
const tiefe = (id: string): number => {
  let t = 0;
  let current: string | undefined = id;
  const seen = new Set<string>();
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    const found = locateParent(document, current);
    if (found === undefined) break;
    current = found.parent.nodeId;
    t += 1;
  }
  return t;
};

const ids = Object.keys(document.nodes);
let tiefster = ids[0] ?? "";
let maxTiefe = 0;
for (const id of ids) {
  // Nur die Tiefe ueber die Kinderlisten, nicht ueber locateParent (sonst
  // waere die Suche selbst quadratisch).
}
// Tiefe direkt aus dem Baum ableiten.
const tiefeVon = new Map<string, number>();
const besuchen = (id: string, d: number): void => {
  tiefeVon.set(id, d);
  const node = document.nodes[id];
  if (node === undefined) return;
  for (const child of node.children ?? []) besuchen(child, d + 1);
  for (const list of Object.values(node.slots ?? {})) for (const child of list) besuchen(child, d + 1);
};
besuchen(document.rootNodeId, 0);
for (const [id, d] of tiefeVon) if (d > maxTiefe) { maxTiefe = d; tiefster = id; }

// Genau der Pfad aus `ensureVisible`: locateParent je Vorfahre.
const zeit = (fn: () => unknown, n = 30): number => {
  for (let i = 0; i < 3; i += 1) fn();
  const s: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const t0 = performance.now();
    fn();
    s.push(performance.now() - t0);
  }
  s.sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

const einLocate = zeit(() => locateParent(document, tiefster));
const ganzEnsure = zeit(() => tiefe(tiefster));
const flach = zeit(() => tiefe(document.rootNodeId));

console.log(JSON.stringify({
  knoten,
  maximaleTiefe: maxTiefe,
  einLocateParentMs: Number(einLocate.toFixed(3)),
  ensureVisibleTiefMs: Number(ganzEnsure.toFixed(3)),
  ensureVisibleWurzelMs: Number(flach.toFixed(3)),
  aufrufeFuerTiefsten: maxTiefe,
  urteil: ganzEnsure > 1
    ? `Ein Klick auf den tiefsten Knoten kostet ${ganzEnsure.toFixed(1)} ms nur fuer die Sichtbarmachung im Baum.`
    : "Unauffaellig.",
}, null, 2));
