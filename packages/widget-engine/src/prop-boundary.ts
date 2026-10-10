// The prop boundary of a catalog primitive (ADR-0005): which property keys a
// node may carry and which values they may hold. The editor store and the
// engine's mutation path both stand on these checks, so a value the canvas
// accepts is a value the server saves - and a value the canvas rejects never
// reaches the baked CSS through a second door.
//
// Pure: a check returns a `PropProblem` or `undefined`; each caller wraps the
// problem in its own error (with its own field path).

import { baseKeyOf } from "./device.ts";
import { matchesValueType } from "./controls.ts";
import {
  camelToKebab,
  formatSpacing,
  isRecord,
  tokenRef,
} from "./css/format.ts";
import { translatableProperties } from "./css/properties.ts";
import { isSafeCssProperty, parseCssValue } from "./css/value-grammar.ts";
import { isComponentPrimitive, STRUCTURAL_PROP_KEYS } from "./legacy.ts";
import type { PrimitiveDefinition, PropValue } from "./types.ts";

export type PropProblem = {
  message: string;
  suggestion?: string;
};

// The structural props of the component model (ids, versions, the override
// bag, the slot rules) are JSON, not CSS - they never run through the style
// grammar, neither as a control nor as an open property. The list is shared with
// the CSS compiler's open pass.
const STRUCTURAL_PROPS: ReadonlySet<string> = new Set(STRUCTURAL_PROP_KEYS);

function knownProps(definition: PrimitiveDefinition): Set<string> {
  const keys = new Set(definition.controls.map((control) => control.key));
  for (const prop of translatableProperties(definition.type)) keys.add(prop);
  return keys;
}

// A property the catalog does not know is not an error: the style space is open.
// It only has to be a *safe* CSS property name - `fontSzie` is a typo that emits
// nothing, `color:red` or `url(x)` would break out of the declaration and is
// rejected. Behavioural catalog props stay gated by `knownProps` (that is the
// typo protection for `text`, `level`, ...).
export function checkKnownProp(
  definition: PrimitiveDefinition,
  key: string,
): PropProblem | undefined {
  const base = baseKeyOf(key);
  if (knownProps(definition).has(base)) return undefined;
  if (isComponentPrimitive(definition.type) && STRUCTURAL_PROPS.has(base)) return undefined;
  const property = camelToKebab(base);
  if (!isSafeCssProperty(property)) {
    return {
      message: `Unsafe CSS property "${base}" for primitive "${definition.type}"`,
      suggestion:
        "A style property is a plain CSS name (`border-radius`, `--brand`); it must not contain `:`, `;`, braces or spaces.",
    };
  }
  return undefined;
}

// The value side of the open space: strings run through the value grammar,
// numbers must be finite, token references must be well-formed and a spacing
// bag is formatted and then checked like any other value. This is the loud half
// of the boundary - the compiler drops what it cannot trust.
export function checkSafeValue(value: PropValue): PropProblem | undefined {
  if (value === null) return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? undefined
      : { message: "A numeric style value must be finite" };
  }
  if (typeof value === "string") {
    const parsed = parseCssValue(value);
    if (parsed.ok) return undefined;
    return {
      message: `Unsafe CSS value: ${parsed.problem}`,
      suggestion:
        "Use a plain value (`16px`, `#fff`, `calc(50% - 4px)`) — no block breakouts, no foreign url schemes.",
    };
  }
  if (isRecord(value)) {
    const ref = tokenRef(value);
    if (ref !== undefined) {
      return /^[a-zA-Z0-9._-]+$/.test(ref)
        ? undefined
        : { message: `Invalid token reference "${ref}"` };
    }
    const formatted = formatSpacing(value);
    const parsed = formatted === undefined ? undefined : parseCssValue(formatted);
    if (parsed !== undefined && parsed.ok) return undefined;
    return {
      message: "Unsupported style value shape",
      suggestion: "Use a number, a string, a token reference or a four-side bag.",
    };
  }
  return { message: "Unsupported style value" };
}

// A catalog control takes the value type it declares; anything else is a style
// value and runs through the same grammar as a style rule - the node prop path
// is not a second, weaker door.
export function checkPropValue(
  definition: PrimitiveDefinition,
  key: string,
  value: PropValue,
): PropProblem | undefined {
  if (value === null) return undefined;
  const base = baseKeyOf(key);
  if (isComponentPrimitive(definition.type) && STRUCTURAL_PROPS.has(base)) return undefined;
  const control = definition.controls.find((entry) => entry.key === base);
  if (control !== undefined) {
    return matchesValueType(control.valueType, value)
      ? undefined
      : {
          message: `Value for "${base}" must be a ${control.valueType}`,
          suggestion: `Expected the value type "${control.valueType}".`,
        };
  }
  return checkSafeValue(value);
}
