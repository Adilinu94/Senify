import { SenifyError } from "@senify/core";
import type { PropValue } from "@senify/section-sdk";
import { getPrimitive, sectionTwinControls } from "./catalog.ts";
import { matchesValueType } from "./controls.ts";
import { baseKeyOf } from "./device.ts";
import { isComponentPrimitive, STRUCTURAL_PROP_KEYS } from "./legacy.ts";
import { camelToKebab, formatSpacing, isRecord, tokenRef } from "./css/format.ts";
import { translatableProperties } from "./css/properties.ts";
import { isSafeCssProperty, parseCssValue } from "./css/value-grammar.ts";
import type { PrimitiveDefinition } from "./types.ts";

export function requirePrimitive(primitive: string, field: string): PrimitiveDefinition {
  const definition = getPrimitive(primitive);
  if (definition === undefined) {
    throw new SenifyError("not_found", `Unknown primitive "${primitive}"`, {
      field,
      suggestion: "Use a primitive from the widget catalog.",
    });
  }
  // A twin name (divider/embed) is rendered by the running section until the
  // parity gate: the store validates against the section's control surface, so
  // a migrated or newly written section value is storable. At the cutover the
  // primitive's own controls apply unchanged.
  const twin = sectionTwinControls(primitive);
  return twin === undefined ? definition : { ...definition, controls: twin };
}

function knownProps(definition: PrimitiveDefinition): Set<string> {
  const keys = new Set(definition.controls.map((control) => control.key));
  for (const prop of translatableProperties(definition.type)) keys.add(prop);
  return keys;
}

// A property the catalog does not know is not an error any more: the style
// space is open (ADR-0005). It only has to be a *safe* CSS property name —
// `fontSzie` is a typo that emits nothing, `color:red` or `url(x)` would break
// out of the declaration and is rejected. Behavioural catalog props stay gated
// by `knownProps` (that is the typo protection for `text`, `level`, …).
export function assertKnownProp(
  definition: PrimitiveDefinition,
  key: string,
  field: string,
): void {
  const base = baseKeyOf(key);
  if (knownProps(definition).has(base)) return;
  // The structural props of the component model (ids, versions, the override
  // bag, the slot rules) are JSON, not CSS - they never run through the style
  // grammar, neither as a control nor as an open property.
  if (isComponentPrimitive(definition.type) && STRUCTURAL_PROPS.has(base)) return;
  const property = camelToKebab(base);
  if (!isSafeCssProperty(property)) {
    throw new SenifyError(
      "validation",
      `Unsafe CSS property "${base}" for primitive "${definition.type}"`,
      {
        field,
        suggestion:
          "A style property is a plain CSS name (`border-radius`, `--brand`); it must not contain `:`, `;`, braces or spaces.",
      },
    );
  }
}

// The value side of the open space (ADR-0005): strings run through the value
// grammar, numbers must be finite, token references must be well-formed and a
// spacing bag is formatted and then checked like any other value. This is the
// loud half of the boundary — the compiler drops what it cannot trust.
//
// The structural props of the component model (ticket 04) are exempt: they
// carry JSON, not style values. The list lives in widget-engine so the CSS
// compiler's open pass uses the very same one.
const STRUCTURAL_PROPS = new Set(STRUCTURAL_PROP_KEYS);

function assertSafeValue(value: PropValue, field: string): void {
  if (value === null) return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new SenifyError("validation", "A numeric style value must be finite", { field });
    }
    return;
  }
  if (typeof value === "string") {
    const parsed = parseCssValue(value);
    if (!parsed.ok) {
      throw new SenifyError(
        "validation",
        `Unsafe CSS value: ${parsed.problem}`,
        {
          field,
          suggestion:
            "Use a plain value (`16px`, `#fff`, `calc(50% - 4px)`) — no block breakouts, no foreign url schemes.",
        },
      );
    }
    return;
  }
  if (isRecord(value)) {
    const ref = tokenRef(value);
    if (ref !== undefined) {
      if (!/^[a-zA-Z0-9._-]+$/.test(ref)) {
        throw new SenifyError("validation", `Invalid token reference "${ref}"`, { field });
      }
      return;
    }
    const formatted = formatSpacing(value);
    const parsed = formatted === undefined ? undefined : parseCssValue(formatted);
    if (parsed === undefined || !parsed.ok) {
      throw new SenifyError("validation", "Unsupported style value shape", {
        field,
        suggestion: "Use a number, a string, a token reference or a four-side bag.",
      });
    }
    return;
  }
  throw new SenifyError("validation", "Unsupported style value", { field });
}

export function assertStyleDeclaration(key: string, value: PropValue, field: string): void {
  const property = camelToKebab(baseKeyOf(key));
  if (!isSafeCssProperty(property)) {
    throw new SenifyError("validation", `Unsafe CSS property "${key}"`, {
      field,
      suggestion: "Use a plain CSS property name (`border-radius`, `scroll-snap-type`).",
    });
  }
  assertSafeValue(value, field);
}

export function assertPropValue(
  definition: PrimitiveDefinition,
  key: string,
  value: PropValue,
  field: string,
): void {
  if (value === null) return;
  const base = baseKeyOf(key);
  // The structural props of the component model carry JSON — the override bag
  // is a map of maps, the ids are opaque strings. The value grammar (ADR-0005)
  // describes style values and does not apply here.
  if (isComponentPrimitive(definition.type) && STRUCTURAL_PROPS.has(base)) return;
  const control = definition.controls.find((entry) => entry.key === base);
  if (control !== undefined) {
    if (!matchesValueType(control.valueType, value)) {
      throw new SenifyError(
        "validation",
        `Value for "${base}" must be a ${control.valueType}`,
        { field, suggestion: `Expected the value type "${control.valueType}".` },
      );
    }
    if (isRecord(value) && tokenRef(value) !== undefined) assertSafeValue(value, field);
    return;
  }
  // Not a catalog control: a style value. It runs through the same value
  // grammar as a style rule — the node prop path is not a second, weaker door
  // (ADR-0005).
  assertSafeValue(value, field);
}



