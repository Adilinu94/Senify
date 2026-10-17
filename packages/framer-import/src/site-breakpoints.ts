// The breakpoint pair of the imported site (ADR-0020).
//
// A Framer site writes its own breakpoints into `__framer__breakpoints`:
// ranges like `≥1200`, `810–1199.98`, `<810`, or, as in the easier-train export,
// `≥1440`, `810–1439.98`, `<810`. Senify's pair is the width below which the
// tablet layout applies and the width below which the mobile layout applies.
// Taken from the same boundaries, the baked page switches layouts at the same
// widths as the original — which the platform default (1024 / 640) cannot do
// for any of the three fixtures.
//
// The boundaries are the lower bounds of the ranges and the widths just above
// their upper bounds (`1199.98` closes at 1200). The smallest boundary is where
// the phone layout ends, the next one where the tablet layout ends. A site with
// four layouts (≥1440, 1200–1439, 810–1199, <810) has three boundaries: the
// two smallest are the pair, and the in-between desktop layout stays desktop.
import { checkBreakpoints, type Breakpoints } from "@senify/widget-engine/breakpoints";
import type { IrBreakpoint } from "./ir.ts";

function boundariesOf(breakpoints: readonly IrBreakpoint[]): number[] {
  const found = new Set<number>();
  for (const range of breakpoints) {
    if (range.minWidth > 0) found.add(range.minWidth);
    if (range.maxWidth !== null) found.add(Math.round((range.maxWidth + 0.02) * 100) / 100);
  }
  return [...found].sort((a, b) => a - b);
}

// The pair, or `null` when the source gives none that Senify can carry: fewer
// than two boundaries (a two-layout site), fractional or out-of-range numbers.
// `null` leaves the platform default in force.
export function siteBreakpointsOf(breakpoints: readonly IrBreakpoint[]): Breakpoints | null {
  const [mobile, tablet] = boundariesOf(breakpoints);
  if (mobile === undefined || tablet === undefined) return null;
  const checked = checkBreakpoints({ tablet, mobile });
  return checked.ok ? checked.value : null;
}
