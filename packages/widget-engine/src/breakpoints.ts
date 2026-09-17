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
export const BREAKPOINTS = {
  tablet: 1024,
  mobile: 640,
} as const;
