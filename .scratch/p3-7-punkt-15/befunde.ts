// Die Befunde des Imports für unifiersofjapan, nach Art gruppiert.
import { runImport } from "../../packages/framer-import/src/index.ts";

const uploads: string[] = [];
const run = await runImport({
  source: { kind: "url", url: "https://unifiersofjapan.framer.website/" },
  mode: "fidelity",
  uploader: async ({ filename }) => {
    const assetId = `up-${uploads.length + 1}`;
    uploads.push(filename);
    return { assetId, url: `/assets/${assetId}/${filename}`, deduped: false };
  },
});

const groups = new Map<string, { count: number; samples: string[]; severities: Set<string> }>();
for (const finding of run.report.findings) {
  const key = finding.kind;
  const group = groups.get(key) ?? { count: 0, samples: [], severities: new Set<string>() };
  group.count += 1;
  group.severities.add(finding.severity);
  if (group.samples.length < 4) group.samples.push(finding.message);
  groups.set(key, group);
}
console.log(`Knoten ${run.report.counts.nodes}, Score ${run.report.score}, Befunde ${run.report.findings.length}`);
for (const [kind, group] of [...groups.entries()].sort((left, right) => right[1].count - left[1].count)) {
  console.log(`\n${kind} · ${group.count} · ${[...group.severities].join("/")}`);
  for (const sample of group.samples) console.log(`  ${sample.slice(0, 220)}`);
}
