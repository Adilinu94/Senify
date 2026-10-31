// Wo geht das Badge "SITE OF THE MONTH" verloren? Im rohen IR, im gemappten
// Dokument oder schon im Capture? Der Text steht im Server-HTML.
import { runImport } from "../../packages/framer-import/src/index.ts";

const run = await runImport({
  source: { kind: "url", url: "https://unifiersofjapan.framer.website/" },
  mode: "fidelity",
  uploader: async ({ filename }) => ({ assetId: "up", url: `/assets/up/${filename}`, deduped: false }),
});

const count = (value: unknown, needle: string): number => {
  const text = JSON.stringify(value);
  return text.split(needle).length - 1;
};

for (const [name, value] of [
  ["document (rohes IR)", run.document],
  ["mapped.document", run.mapped.document],
] as const) {
  console.log(`${name}: "SITE OF THE MONTH" ${count(value, "SITE OF THE MONTH")}, "textPath" ${count(value, "textPath")}`);
}

const nodes = JSON.stringify(run.document);
const index = nodes.indexOf("SITE OF THE MONTH");
if (index >= 0) console.log(`Ausschnitt IR: ${nodes.slice(Math.max(0, index - 500), index + 300)}`);
else console.log("Nicht im rohen IR.");

const mapped = JSON.stringify(run.mapped.document);
const mappedIndex = mapped.indexOf("SITE OF THE MONTH");
if (mappedIndex >= 0) console.log(`Ausschnitt gemappt: ${mapped.slice(Math.max(0, mappedIndex - 900), mappedIndex + 400)}`);
else console.log("Nicht im gemappten Dokument.");

for (const needle of ["0.984808", "rotate(10deg)", "translateY(390", "390px", "768.857", "768.86"]) {
  console.log(
    `"${needle}": IR ${count(run.document, needle)}, gemappt ${count(run.mapped.document, needle)}`,
  );
}


