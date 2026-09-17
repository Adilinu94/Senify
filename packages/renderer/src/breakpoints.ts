// The one breakpoint definition of the platform (Phase 0, fourth slice).
//
// It used to live in `style-css.ts`, which imports the registry (and through it
// the section components) — far too much for a browser module that only wants
// the three numbers. This file carries nothing but the numbers, so the editor
// canvas can read the shared source (`@senify/renderer/breakpoints`) without
// pulling the Node-side bake. `style-css.ts` and `browser-entry.ts` both
// re-export it, so the existing importers keep working.
export const BREAKPOINTS = {
  tablet: 1024,
  mobile: 640,
} as const;
