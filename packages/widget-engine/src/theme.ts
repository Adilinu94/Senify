// Theme integration for the CSS compiler (Phase 0).
//
// The catalog stores color and size values as token references
// (`{ $token: "color.brand-500" }`, `{ $token: "space.4" }`). The compiler used
// to emit `var(--…)` for those and left the concrete value to whoever defined
// the variable. This module binds the compiler to `@senify/tokens`: it turns a
// token reference into the concrete CSS value of the given theme, so a theme
// change is visible in the compiler output and no border or text loses its
// colour.
//
// Resolution order (both are pure lookups, no re-derivation of the mapping):
//   1. the emitted CSS variable of the theme (`--color-brand-500`), which is
//      exactly what `emitCss` writes into `:root`;
//   2. the semantic role lookup of the tokens package (`accent`, `fg.base`, …),
//      which follows `$ref` chains and applies alpha.
// An unknown reference is not dropped — the caller keeps the `var(--…)` form.

import {
  resolveTheme,
  resolveTokenRef,
  themeVariables,
  type Theme,
} from "@senify/tokens";
import type { TokenResolver } from "./css/format.ts";

// `{ $token: "brand.primary" }` -> `--brand-primary`, the same naming the
// registry uses (`tokenCss`).
export function tokenVariableName(ref: string): string {
  return `--${ref.replace(/\./g, "-")}`;
}

export function themeTokenResolver(theme: Theme): TokenResolver {
  const variables = themeVariables(resolveTheme(theme));
  return (ref) => {
    if (ref === "") return undefined;
    const fromVariables = variables[tokenVariableName(ref)];
    if (fromVariables !== undefined) return fromVariables;
    return resolveTokenRef(theme, ref);
  };
}
