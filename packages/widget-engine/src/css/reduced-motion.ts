// Imported reveals, node-bound and inline, all animate through a
// `senify-appear-*` keyframes block. Under reduced motion they stop and stay
// visible: the start state lives only in the keyframes, so switching the
// animation off returns to the base look. `opacity:1` is the guard for a base
// that still carries a hidden start value from an older import.
export type AnimatedClassRule = {
  readonly name: string;
  readonly animation: unknown;
};

export function appearReducedMotionCss(rules: readonly AnimatedClassRule[]): string {
  const names = [
    ...new Set(
      rules
        .filter(
          (rule) =>
            typeof rule.animation === "string" && rule.animation.includes("senify-appear-"),
        )
        .map((rule) => `.${rule.name}`),
    ),
  ];
  if (names.length === 0) return "";
  return `@media (prefers-reduced-motion: reduce){${names.join(",")}{animation:none!important;opacity:1!important}}`;
}
