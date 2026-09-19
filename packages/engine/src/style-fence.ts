// The value-level fence of ticket 18 (ADR-0005): style writes are open on the
// property level, but an agent may not bake raw values into a rule where the
// theme already offers a token. Ambient rules and raw custom CSS stay a human
// capability. The checks are deliberately tolerant — a literal is rejected
// only when a matching token exists, so free values keep working ("kein
// Knebel").
//
// The fence lives in the store's write path, not in the compiler and not in
// the value grammar: it needs the site theme and the author's kind, both of
// which the compiler does not see.

import { resolveTheme, type Theme } from "@senify/tokens";
import { normalizeRawCss } from "@senify/widget-engine";

export type StyleFenceViolation = {
  field: string;
  message: string;
  suggestion: string;
};

// Ticket 18, point 3: the custom-CSS block stays bounded. The selector rule is
// structural — a scoped rule's selector is generated from its own node id, and
// only ambient rules carry a free selector (which agents may not set).
export const MAX_RAW_CSS_LENGTH = 2000;

// A declaration bag with its dotted field prefix (`rule.styles`,
// `rule.states.hover`, `rule.contextStyles.<id>`).
export type StyleBag = {
  field: string;
  values: Record<string, unknown>;
};

// Color literals the fence understands. Function forms are compared as text;
// hex is normalized (lowercase, expanded, no whitespace).
const COLOR_LITERAL =
  /^(#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(.+\))$/;

function normalizeLiteral(value: string): string {
  const compact = value.trim().toLowerCase().replace(/\s+/g, "");
  const hex = /^#([0-9a-f]{3,8})$/.exec(compact);
  const digits = hex?.[1];
  if (digits !== undefined && (digits.length === 3 || digits.length === 4)) {
    return `#${[...digits].map((digit) => digit + digit).join("")}`;
  }
  return compact;
}

// The literal of a value, if it is a color written by hand. A token reference
// (`{ $token: … }`) is already the goal and never a violation.
function colorLiteralOf(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return COLOR_LITERAL.test(trimmed) ? trimmed : undefined;
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record["$token"] === "string") return undefined;
    const color = record["color"];
    if (typeof color === "string") {
      const trimmed = color.trim();
      return COLOR_LITERAL.test(trimmed) ? trimmed : undefined;
    }
  }
  return undefined;
}

// The reverse index of the theme: a normalized color literal -> the token ref
// that resolves to it. Semantic roles win over primitives, so the suggestion
// names the abstraction the theme is meant to be used through (`accent`
// instead of `color.brand-600`).
export function themeColorTokens(theme: Theme): Map<string, string> {
  const resolved = resolveTheme(theme);
  const index = new Map<string, string>();
  const add = (ref: string, value: unknown): void => {
    if (typeof value !== "string") return;
    const key = normalizeLiteral(value);
    if (key === "" || index.has(key)) return;
    index.set(key, ref);
  };
  for (const [role, value] of Object.entries(resolved.modes.light)) {
    add(role, value);
  }
  for (const [role, value] of Object.entries(resolved.semantic)) {
    add(role, value);
  }
  const colors = resolved.primitive.color;
  if (colors !== null && typeof colors === "object") {
    for (const [key, value] of Object.entries(colors)) {
      add(`color.${key}`, value);
    }
  }
  return index;
}

// The token-coercion rule (ticket 18, point 1): every color literal in the
// given bags that has a matching theme token is a violation. Values without a
// token pass untouched.
export function agentStyleViolations(input: {
  theme: Theme;
  bags: readonly StyleBag[];
}): StyleFenceViolation[] {
  const index = themeColorTokens(input.theme);
  const violations: StyleFenceViolation[] = [];
  for (const bag of input.bags) {
    for (const [property, value] of Object.entries(bag.values)) {
      const literal = colorLiteralOf(value);
      if (literal === undefined) continue;
      const ref = index.get(normalizeLiteral(literal));
      if (ref === undefined) continue;
      violations.push({
        field: `${bag.field}.${property}`,
        message: `Agent style writes must use the theme token for "${literal}"`,
        suggestion: `Use { $token: "${ref}" } instead of the raw value "${literal}".`,
      });
    }
  }
  return violations;
}

// The custom-CSS limits (ticket 18, point 3): length cap and no foreign-host
// `url()` references. `@import` and markup are already rejected by
// `isSafeRawCss`; this adds the checks that grammar does not cover.
export function rawCssViolations(rawCss: string, field: string): StyleFenceViolation[] {
  const violations: StyleFenceViolation[] = [];
  if (rawCss.length > MAX_RAW_CSS_LENGTH) {
    violations.push({
      field,
      message: `rawCss exceeds ${MAX_RAW_CSS_LENGTH} characters`,
      suggestion: "Shorten the block or split it into several rules.",
    });
  }
  const normalized = normalizeRawCss(rawCss);
  if (/url\(\s*["']?(?:https?:)?\/\//i.test(normalized)) {
    violations.push({
      field,
      message: "rawCss must not reference a foreign host via url()",
      suggestion: "Use a relative path or a data:image URL instead.",
    });
  }
  return violations;
}

// The declaration bags of a rule: base styles, the four pseudo states and the
// custom conditions. Used for the create path; the update path checks only the
// bags its patch touches.
export function styleRuleBags(
  rule: {
    styles: Record<string, unknown>;
    states?: Partial<Record<string, Record<string, unknown>>>;
    contextStyles: Record<string, Record<string, unknown>>;
  },
  field: string,
): StyleBag[] {
  const bags: StyleBag[] = [{ field: `${field}.styles`, values: rule.styles }];
  if (rule.states !== undefined) {
    for (const [state, values] of Object.entries(rule.states)) {
      if (values !== undefined) {
        bags.push({ field: `${field}.states.${state}`, values });
      }
    }
  }
  for (const [contextId, values] of Object.entries(rule.contextStyles)) {
    bags.push({ field: `${field}.contextStyles.${contextId}`, values });
  }
  return bags;
}
