// Die 12 nicht abgebildeten Fluffy-Samples: welcher Grund, welche Form?
import { runImport } from "@senify/framer-import";

const run = await runImport({
  source: { kind: "mirror", rootDir: "packages/framer-import/test/fixtures/framer-fluffy-rectangle-418998" },
  mode: "fidelity",
});

const unsupported = run.report.findings.filter((finding) => finding.kind === "unsupported-declaration");
const byReason: Record<string, number> = {};
for (const finding of unsupported) {
  const reason = finding.suggestion.slice(0, 120);
  byReason[reason] = (byReason[reason] ?? 0) + 1;
}
console.log(JSON.stringify({ total: unsupported.length, byReason }, null, 1));

// Die Samples selbst: Form der Startwerte
const shapes = run.document.motion.map((sample) => ({
  trigger: sample.trigger,
  x: sample.params["fromX"],
  y: sample.params["fromY"],
  scale: sample.params["fromScale"],
  mapped: sample.params["fromX"] === 0 && Number(sample.params["fromY"] ?? 0) >= 0 && (sample.params["fromScale"] ?? 1) === 1,
}));
const mappable = shapes.filter((s) => s.mapped).length;
console.log(JSON.stringify({ samples: shapes.length, nachRegelAbbildbar: mappable, nichtAbbildbar: shapes.length - mappable }, null, 1));
console.log(JSON.stringify(shapes.filter((s) => !s.mapped), null, 1));
