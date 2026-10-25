// Der dokumentierte offene Punkt an der veröffentlichten Earn-Seite: die fünf
// Bewertungssterne stehen nicht im SSR (0-mal viewBox="0 0 256 256"), im
// gerenderten DOM 5-mal. Genau dafür ist `capture: "browser"` gebaut.
import { runImport } from "@senify/framer-import";

const URL_ = "https://distinct-assistant-875072.framer.app";

const count = (value: unknown, needle: string): number => JSON.stringify(value).split(needle).length - 1;

for (const capture of ["static", "browser"] as const) {
  try {
    const run = await runImport({ source: { kind: "url", url: URL_ }, mode: "fidelity", capture });
    const nodes = Object.keys(run.mapped.document.nodes).length;
    const icons = Object.values(run.mapped.document.nodes).filter((node) => node.primitive === "icon").length;
    console.log(JSON.stringify({
      capture,
      kind: run.document.source.kind,
      nodes,
      icons,
      sterne: count(run.mapped.document, "256 256"),
      motion: run.report.motion,
      irHash: run.irHash.slice(0, 30),
    }));
  } catch (error) {
    console.log(JSON.stringify({ capture, error: error instanceof Error ? error.message : String(error) }));
  }
}
