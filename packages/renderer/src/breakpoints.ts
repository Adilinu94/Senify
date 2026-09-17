// The one breakpoint definition of the platform (Phase 0, fourth slice; moved
// to the widget engine in Phase 1).
//
// The numbers decide the media queries the CSS compiler writes, so they belong
// to the layer that owns the catalog. They live in
// `@senify/widget-engine/breakpoints` — a module that imports nothing — and are
// re-exported here so the existing importers (`packages/editor/src/frames.ts`,
// the bake, the browser entry) keep working. One definition, one place.
export { BREAKPOINTS } from "@senify/widget-engine/breakpoints";
