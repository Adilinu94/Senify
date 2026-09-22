// Scrub (ticket 19, M6): the slider drives the live frame's scroll position so
// pin and scrub presets can be inspected without touching the wheel. The maths
// stays pure — the canvas only wires the DOM around it.

export function scrubOffset(progress: number, maxScroll: number): number {
  const bounded = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const max = Number.isFinite(maxScroll) ? Math.max(0, maxScroll) : 0;
  return Math.round(bounded * max);
}

export function scrubProgress(scrollTop: number, maxScroll: number): number {
  if (!Number.isFinite(maxScroll) || maxScroll <= 0) return 0;
  const top = Number.isFinite(scrollTop) ? scrollTop : 0;
  return Math.min(1, Math.max(0, top / maxScroll));
}
