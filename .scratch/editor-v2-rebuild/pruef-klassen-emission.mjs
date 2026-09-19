// Ticket 14: Klassen-Emission regional vs. global MESSEN (B8).
//
// classSelector (cascade.ts) haengt jede Klassenregel an jeden tragenden
// Knoten: `[data-node-id="a"].cls { … }`, `[data-node-id="b"].cls { … }`, …
// Das kauft die triviale Kaskadengeschichte (gleiche Spezifitaet wie eine
// State-Regel, Gewinn per Quellordnung), kostet aber Bytes bei
// klassengetriebenen Seiten: eine Klasse auf 40 Knoten = 40 Regeln.
//
// Dieses Skript baut die drei Dokumente aus dem Ticket und misst beide
// Strategien mit compileCssReport (Bytes, Regeln, Deklarationen) und prueft,
// dass beide fuer jeden Traeger dieselben Deklarationen beschreiben. Es
// braucht keine Instanz und keinen Browser: der Compiler ist rein.
//
// Ausgabe: .scratch/refs/klassen-emission.json + .md
// Aufruf:  node .scratch/editor-v2-rebuild/pruef-klassen-emission.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileCssReport } from "../../packages/widget-engine/src/index.ts";

const PADDING = { top: "8", right: "16", bottom: "8", left: "16", isLinked: false, unit: "px" };
const GAP = { row: "12", column: "16", isLinked: false, unit: "px" };
const MARGIN = { top: "0", right: "8", bottom: "16", left: "8", isLinked: false, unit: "px" };

// Eine Klasse mit 20 Deklarationen (Dokument a) — generische Style-Props, die
// nicht an ein Primitive-Control gebunden sind.
const PROPS_20 = {
  position: "relative",
  top: "12px",
  zIndex: 5,
  overflow: "hidden",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  gap: GAP,
  padding: PADDING,
  margin: MARGIN,
  width: "320px",
  maxWidth: "1200px",
  minHeight: "48px",
  fontFamily: "Inter",
  fontSize: "16px",
  fontWeight: 600,
  lineHeight: 1.5,
  letterSpacing: "0.02em",
  color: "#111111",
  background: "#ffffff",
};

// Die 15er-Variante (Dokument b): dieselbe Sprache, pro Klasse eigener Ton.
const TONES = [
  { color: "#0f172a", background: "#f8fafc" },
  { color: "#3f3f46", background: "#fafaf9" },
  { color: "#064e3b", background: "#ecfdf5" },
  { color: "#7f1d1d", background: "#fef2f2" },
  { color: "#312e81", background: "#eef2ff" },
  { color: "#78350f", background: "#fffbeb" },
];

function props15(tone) {
  return {
    padding: PADDING,
    margin: MARGIN,
    gap: GAP,
    width: "320px",
    maxWidth: "1200px",
    fontSize: "16px",
    fontWeight: 600,
    lineHeight: 1.5,
    letterSpacing: "0.02em",
    textAlign: "center",
    color: tone.color,
    background: tone.background,
    borderRadius: "12px",
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.25)",
    opacity: 0.9,
  };
}

// Die 40er-Variante (Dokument c): das offene Vokabular weitgehend ausgeschoepft.
function props40(tone) {
  return {
    position: "relative",
    top: "12px",
    right: "0",
    bottom: "0",
    left: "12px",
    zIndex: 5,
    overflow: "hidden",
    flexDirection: "column",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    alignContent: "center",
    placeItems: "center",
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: "50%",
    order: 2,
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gridTemplateRows: "auto",
    gridColumn: "span 2",
    gridRow: "1 / 3",
    gridAutoFlow: "row",
    padding: PADDING,
    margin: MARGIN,
    gap: GAP,
    width: "100%",
    minWidth: "0",
    maxWidth: "1200px",
    minHeight: "48px",
    maxHeight: "600px",
    fontFamily: "Inter",
    fontSize: "16px",
    fontWeight: 600,
    lineHeight: 1.5,
    letterSpacing: "0.02em",
    textAlign: "center",
    textTransform: "uppercase",
    fontStyle: "italic",
    color: tone.color,
    background: tone.background,
  };
}

const NODE_BASE = { color: "#333333" };

function documentA() {
  const nodes = Array.from({ length: 30 }, (_, index) => ({
    id: `a${index + 1}`,
    primitive: "frame",
    props: NODE_BASE,
    classIds: ["brand"],
  }));
  return {
    name: "a-30-knoten-1-klasse-20-deklarationen",
    nodes,
    classRules: [{ name: "brand", props: PROPS_20 }],
  };
}

function documentB() {
  const names = ["tone-slate", "tone-sand", "tone-mint", "tone-coral", "tone-indigo", "tone-amber"];
  const nodes = Array.from({ length: 120 }, (_, index) => ({
    id: `b${index + 1}`,
    primitive: "frame",
    props: NODE_BASE,
    classIds: [names[index % names.length]],
  }));
  return {
    name: "b-120-knoten-6-klassen-15-deklarationen",
    nodes,
    classRules: names.map((name, index) => ({ name, props: props15(TONES[index]) })),
  };
}

function documentC() {
  const names = ["hero-shell", "hero-copy", "hero-cta"];
  const nodes = Array.from({ length: 15 }, (_, index) => ({
    id: `c${index + 1}`,
    primitive: "frame",
    props: NODE_BASE,
    classIds: [names[index % names.length]],
  }));
  return {
    name: "c-hero-15-knoten-3-klassen-40-deklarationen",
    nodes,
    classRules: names.map((name, index) => ({ name, props: props40(TONES[index]) })),
  };
}

// Beide Strategien muessen fuer jeden Traeger dieselben Deklarationen
// beschreiben — nur der Selektor unterscheidet sich (regional pro Knoten,
// global einmal pro Klasse).
function verifyEmission(document, regional, global) {
  const problems = [];
  for (const rule of document.classRules) {
    const carriers = document.nodes.filter((node) => node.classIds?.includes(rule.name));
    const regionalRules = regional.rules.filter(
      (entry) => entry.classIds.includes(rule.name) && entry.state === null && entry.media === null,
    );
    const globalRules = global.rules.filter(
      (entry) => entry.classIds.includes(rule.name) && entry.state === null && entry.media === null,
    );
    if (regionalRules.length !== carriers.length) {
      problems.push(
        `${rule.name}: regional ${regionalRules.length} Regeln, erwartet ${carriers.length} (ein Anker je Traeger)`,
      );
    }
    if (globalRules.length !== 1) {
      problems.push(`${rule.name}: global ${globalRules.length} Regeln, erwartet 1`);
    }
    const expected = globalRules[0]?.declarations;
    if (expected === undefined) continue;
    for (const entry of regionalRules) {
      if (JSON.stringify(entry.declarations) !== JSON.stringify(expected)) {
        problems.push(`${rule.name}: Deklarationen weichen ab (${entry.selector})`);
      }
    }
  }
  return problems;
}

const documents = [documentA(), documentB(), documentC()];
const results = [];

for (const document of documents) {
  const input = { nodes: document.nodes, classRules: document.classRules };
  const regional = compileCssReport(input, { classEmission: "regional" });
  const global = compileCssReport(input, { classEmission: "global" });
  const problems = verifyEmission(document, regional, global);
  const classRulesRegional = regional.rules.filter((entry) => entry.classIds.length > 0).length;
  const classRulesGlobal = global.rules.filter((entry) => entry.classIds.length > 0).length;
  results.push({
    name: document.name,
    nodes: document.nodes.length,
    classes: document.classRules.length,
    regional: {
      bytes: regional.bytes,
      rules: regional.ruleCount,
      classRules: classRulesRegional,
      declarations: regional.declarationCount,
    },
    global: {
      bytes: global.bytes,
      rules: global.ruleCount,
      classRules: classRulesGlobal,
      declarations: global.declarationCount,
    },
    ratio: Math.round((regional.bytes / global.bytes) * 100) / 100,
    problems,
  });
}

const outDir = join(".scratch", "refs");
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, "klassen-emission.json"),
  JSON.stringify({ date: new Date().toISOString(), results }, null, 2),
);

const lines = [
  "# Klassen-Emission: regional vs. global (Ticket 14)",
  "",
  `Messung: ${new Date().toISOString()} — \`node .scratch/editor-v2-rebuild/pruef-klassen-emission.mjs\``,
  "",
  "Regional = `[data-node-id].cls` je tragendem Knoten (heute). Global = `.cls` einmalig je Klasse.",
  "",
  "| Dokument | Knoten | Klassen | Strategie | Bytes | Regeln (gesamt) | davon Klassen | Deklarationen |",
  "|---|---|---|---|---|---|---|---|",
];

for (const entry of results) {
  lines.push(
    `| ${entry.name} | ${entry.nodes} | ${entry.classes} | regional | ${entry.regional.bytes} | ${entry.regional.rules} | ${entry.regional.classRules} | ${entry.regional.declarations} |`,
  );
  lines.push(
    `| ${entry.name} | ${entry.nodes} | ${entry.classes} | global | ${entry.global.bytes} | ${entry.global.rules} | ${entry.global.classRules} | ${entry.global.declarations} |`,
  );
}

lines.push("", "## Verhaeltnis regional/global", "");
for (const entry of results) {
  lines.push(`- ${entry.name}: ${entry.ratio}x`);
}
lines.push("", "## Korrektheitsprobe", "");
for (const entry of results) {
  lines.push(
    entry.problems.length === 0
      ? `- ${entry.name}: gruen (gleiche Deklarationen je Traeger in beiden Strategien)`
      : `- ${entry.name}: FEHLER\n${entry.problems.map((problem) => `  - ${problem}`).join("\n")}`,
  );
}
lines.push("", "## Kriterium", "");
lines.push(
  "Bei Dokument (b) mehr als ~2x Bytes regional -> global umstellen; sonst regional behalten.",
);

writeFileSync(join(outDir, "klassen-emission.md"), lines.join("\n") + "\n");

for (const entry of results) {
  console.log(
    `${entry.name}: regional ${entry.regional.bytes} B / ${entry.regional.classRules} Klassenregeln, global ${entry.global.bytes} B / ${entry.global.classRules}, Verhaeltnis ${entry.ratio}x, Probe ${entry.problems.length === 0 ? "gruen" : "ROT"}`,
  );
  for (const problem of entry.problems) console.log(`  - ${problem}`);
}
console.log(`\nBericht: .scratch/refs/klassen-emission.md`);
