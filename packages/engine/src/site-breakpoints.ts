import { SenifyError } from "@senify/core";
import { DEFAULT_BREAKPOINTS, checkBreakpoints, type Breakpoints } from "@senify/widget-engine/breakpoints";

// The two breakpoint numbers of a site (ADR-0020). Absent means the platform
// default (1024 / 640); a site that never set them bakes and renders as before.

// A submitted pair. `null` clears it (back to the default); anything else must
// pass the guard rails of `checkBreakpoints`. The error names the first rule
// that fails.
export function normalizeSiteBreakpoints(raw: unknown): Breakpoints | null {
  if (raw === null) return null;
  const checked = checkBreakpoints(raw);
  if (!checked.ok) {
    throw new SenifyError("validation", checked.message, {
      field: "breakpoints",
      suggestion:
        'Send { "breakpoints": { "tablet": 1024, "mobile": 640 } } with whole pixel values, or { "breakpoints": null } to return to the default.',
    });
  }
  return checked.value;
}

// A stored pair. A row that fails the check (hand-edited, or written under
// older limits) reads as "no pair" instead of breaking every bake of the site.
export function readStoredBreakpoints(raw: unknown): Breakpoints | undefined {
  const value = typeof raw === "string" ? safeParse(raw) : raw;
  if (value === null || value === undefined) return undefined;
  const checked = checkBreakpoints(value);
  return checked.ok ? checked.value : undefined;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// What a Framer import does with the breakpoints it found in the source
// (ADR-0020). The source breaks where its own numbers say; a site that bakes
// the imported page at other numbers shows another layout at every width
// between the two pairs. So the import carries the source's pair over — but
// only where that cannot change a page the author already built:
//
//   set        the site has no pair of its own and no other page, so nothing
//              else was laid out for the platform default: the pair is set,
//   unchanged  the site already breaks at the same numbers,
//   kept       the site has a different pair, or other pages built for the
//              default: nothing is changed, the report says so.
export type ImportBreakpointsPlan = {
  derived: Breakpoints;
  outcome: "set" | "unchanged" | "kept";
  // Why `kept`, so the report can name the reason.
  reason: "site-pair" | "other-pages" | null;
  // The pair the imported page renders with after this import.
  effective: Breakpoints;
};

export function planImportBreakpoints(input: {
  derived: Breakpoints | null;
  site: Breakpoints | undefined;
  // True when the site holds a page other than the one the import writes.
  otherPages: boolean;
}): ImportBreakpointsPlan | null {
  const { derived, site } = input;
  if (derived === null) return null;
  const current = site ?? DEFAULT_BREAKPOINTS;
  const same = (a: Breakpoints, b: Breakpoints): boolean => a.tablet === b.tablet && a.mobile === b.mobile;
  if (same(derived, current)) return { derived, outcome: "unchanged", reason: null, effective: derived };
  if (site !== undefined) return { derived, outcome: "kept", reason: "site-pair", effective: site };
  if (input.otherPages) return { derived, outcome: "kept", reason: "other-pages", effective: DEFAULT_BREAKPOINTS };
  return { derived, outcome: "set", reason: null, effective: derived };
}
