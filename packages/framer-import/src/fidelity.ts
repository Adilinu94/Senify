// The fidelity report (plan.md S1.6): the import's product part, not a log.
// Same stance as `get_design_report`: the report appears in the import
// dialog, in the review and as the MCP answer.
//
// The score is honest arithmetic over what the import could carry — it is a
// comparison measure between imports, not a quality certificate.

import type { FramerIrDocument, IrFinding } from "./ir.ts";
import { candidatesOf, resolutionsOf, type ImportCandidate, type ImportResolution } from "./library.ts";
import { sectionCandidatesOf } from "./section-candidates.ts";
import type { MapperResult } from "./mapper.ts";
import type { NormalizeResult } from "./normalize.ts";
import type { MotionMappingResult } from "./motion-mapping.ts";

export type FidelityReport = {
  ir: 1;
  source: FramerIrDocument["source"];
  counts: {
    nodes: number;
    mapped: number;
    placeholders: number;
    skipped: number;
  };
  declarations: {
    total: number;
    carried: number;
    tokenized: number;
    dropped: number;
  };
  motion: {
    measured: number;
    mappedToPreset: number;
    documented: number;
  };
  findings: IrFinding[];
  candidates: ImportCandidate[];
  resolutions: ImportResolution[];
  score: number;
  steps: string[];
};

export function buildFidelityReport(
  document: FramerIrDocument,
  normalized: NormalizeResult,
  mapped: MapperResult,
  motion: MotionMappingResult,
): FidelityReport {
  const steps: string[] = [
    "Quelle gelesen (SSR-HTML, drei statische Datenkanäle)",
    `Geräte-Varianten zusammengezogen (${mapped.stats.mergedVariants} Overrides)`,
    `Deklarationen konsolidiert (${normalized.stats.declarationSets} Sets → ${normalized.stats.rules} Regeln)`,
    normalized.mode === "dna"
      ? "DNA-Konformität erzwungen (Abweichungen als Funde dokumentiert)"
      : "Originaltreue-Modus: Verläufe, Schatten, Rundungen und Ausrichtung der Quelle bleiben erhalten",
  ];

  const findings = mapped.findings;
  const dnaAdjustments = findings.filter((finding) => finding.kind === "dna-adjustment").length;
  if (dnaAdjustments > 0) {
    steps.push(`DNA-Anpassungen: ${dnaAdjustments} (Bericht führt jede mit Beleg)`);
  }
  const brand = mapped.themePatch.scales?.brand;
  if (brand !== undefined) {
    steps.push(
      `Markenfarbe ${brand} vorgeschlagen (die am häufigsten genutzte Farbe der Seite); sie ersetzt die Theme-Markenfarbe nur mit „Theme übernehmen"`,
    );
  }

  const totalDeclarations = normalized.rules.reduce(
    (sum, rule) => sum + Object.keys(rule.declarations).length,
    0,
  );
  const carried = totalDeclarations;
  const dropped = normalized.stats.droppedDeclarations;

  const nodes = normalized.stats.nodes;
  const mappedNodes = mapped.stats.nodes;
  const placeholders = mapped.stats.placeholders;

  // The score: node coverage and declaration coverage weigh most, motion
  // coverage third, and only when the source HAS motion: a page without any
  // measured motion is scored on the other two alone instead of being handed
  // the motion points for free. Findings of severity `block` cost directly.
  const blockFindings = findings.filter((finding) => finding.severity === "block").length;
  const nodeRatio = nodes === 0 ? 0 : mappedNodes / nodes;
  const declarationRatio = carried + dropped === 0 ? 1 : carried / (carried + dropped);
  const hasMotion = document.motion.length > 0;
  const motionRatio = hasMotion ? Math.min(1, motion.mapped / document.motion.length) : 0;
  const weighted = hasMotion
    ? nodeRatio * 45 + declarationRatio * 35 + motionRatio * 20
    : (nodeRatio * 45 + declarationRatio * 35) * (100 / 80);
  const raw = weighted - blockFindings * 5;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  return {
    ir: 1,
    source: document.source,
    counts: {
      nodes,
      mapped: mappedNodes,
      placeholders,
      skipped: Math.max(0, nodes - mappedNodes),
    },
    declarations: {
      total: totalDeclarations + dropped,
      carried,
      tokenized: 0,
      dropped,
    },
    motion: {
      measured: motion.measured,
      mappedToPreset: motion.mapped,
      documented: motion.documented,
    },
    findings,
    candidates: [
      ...candidatesOf(mapped.document, document.pages[0]?.path ?? "/"),
      ...sectionCandidatesOf(mapped.document, document.pages[0]?.path ?? "/"),
    ],
    resolutions: resolutionsOf(mapped.document, findings, document),
    score,
    steps,
  };
}
