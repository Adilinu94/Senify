// The one breakpoint definition of the platform.
//
// It used to live in `@senify/renderer/breakpoints`. That path pulled the
// renderer package in, and through it the registry — so the registry could not
// render the widget catalog without a package cycle (registry -> widget-engine
// -> renderer -> registry). The numbers are a fact of the widget engine (they
// decide the media queries the compiler writes), so they live here, in a
// browser-safe module that imports nothing. `@senify/renderer/breakpoints` and
// `@senify/editor/frames` read them from here, so the numbers exist exactly
// once.
//
// `BREAKPOINTS` is the platform default. A site may carry its own pair
// (ADR-0020, whole site, two numbers); everything that writes a media query
// takes the pair as an option and falls back to this default, so a site without
// an entry renders exactly as before.
export const BREAKPOINTS = {
  tablet: 1024,
  mobile: 640,
} as const;

// A pair of widths: below `tablet` the tablet layout applies (down to `mobile`),
// below `mobile` the mobile layout. Whole CSS pixels.
export type Breakpoints = { tablet: number; mobile: number };

export const DEFAULT_BREAKPOINTS: Breakpoints = { tablet: BREAKPOINTS.tablet, mobile: BREAKPOINTS.mobile };

// Guard rails against a typo, not design rules. The ranges admit the setups the
// import has to reproduce (Framer's usual 1200 / 810 and 1440 / 810) and keep
// the three layouts apart: `minGap` is the least width the tablet layout owns.
export const BREAKPOINT_LIMITS = {
  tablet: { min: 641, max: 1600 },
  mobile: { min: 320, max: 900 },
  minGap: 120,
} as const;

export type BreakpointsCheck =
  | { ok: true; value: Breakpoints }
  | { ok: false; message: string };

function whole(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

// Validates a stored or submitted pair. The message names the first rule that
// fails, in the words the dashboard shows after its own translation.
export function checkBreakpoints(input: unknown): BreakpointsCheck {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, message: "Breakpoints must be an object with tablet and mobile." };
  }
  const { tablet, mobile } = input as Record<string, unknown>;
  if (!whole(tablet) || !whole(mobile)) {
    return { ok: false, message: "Breakpoints tablet and mobile must be whole numbers of pixels." };
  }
  const limits = BREAKPOINT_LIMITS;
  if (tablet < limits.tablet.min || tablet > limits.tablet.max) {
    return {
      ok: false,
      message: `The tablet breakpoint must lie between ${limits.tablet.min} and ${limits.tablet.max} px.`,
    };
  }
  if (mobile < limits.mobile.min || mobile > limits.mobile.max) {
    return {
      ok: false,
      message: `The mobile breakpoint must lie between ${limits.mobile.min} and ${limits.mobile.max} px.`,
    };
  }
  if (tablet - mobile < limits.minGap) {
    return {
      ok: false,
      message: `The tablet breakpoint must be at least ${limits.minGap} px larger than the mobile breakpoint.`,
    };
  }
  return { ok: true, value: { tablet, mobile } };
}

// The pair a site renders with: its own, or the platform default.
export function resolveBreakpoints(input?: Breakpoints | null): Breakpoints {
  return input === undefined || input === null ? DEFAULT_BREAKPOINTS : input;
}

export function isDefaultBreakpoints(input: Breakpoints): boolean {
  return input.tablet === DEFAULT_BREAKPOINTS.tablet && input.mobile === DEFAULT_BREAKPOINTS.mobile;
}
