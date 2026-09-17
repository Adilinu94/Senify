import type {
  Condition,
  Control,
  GapsValue,
  PrimitiveDefinition,
  PropValue,
  SpacingValue,
  StyleGroup,
  ValueType,
} from "./types.ts";
import {
  controlShapeIssues,
  primitiveShapeIssues,
  type ValidationIssue,
} from "./schema.ts";

function isRecord(value: PropValue): value is { [key: string]: PropValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTokenRef(value: PropValue): boolean {
  return isRecord(value) && typeof value["$token"] === "string";
}

export function isAssetRef(value: PropValue): boolean {
  return isRecord(value) && typeof value["assetId"] === "string";
}

export function isLinkValue(value: PropValue): boolean {
  if (!isRecord(value)) return false;
  return typeof value["url"] === "string" || typeof value["pageId"] === "string";
}

export function isSpacingValue(value: PropValue): value is SpacingValue & PropValue {
  if (!isRecord(value)) return false;
  return (
    typeof value["top"] === "string" &&
    typeof value["right"] === "string" &&
    typeof value["bottom"] === "string" &&
    typeof value["left"] === "string" &&
    typeof value["isLinked"] === "boolean" &&
    typeof value["unit"] === "string"
  );
}

export function isGapsValue(value: PropValue): value is GapsValue & PropValue {
  if (!isRecord(value)) return false;
  return (
    typeof value["row"] === "string" &&
    typeof value["column"] === "string" &&
    typeof value["isLinked"] === "boolean" &&
    typeof value["unit"] === "string"
  );
}

export function matchesValueType(valueType: ValueType, value: PropValue): boolean {
  switch (valueType) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "color":
      return typeof value === "string" || isTokenRef(value);
    case "enum":
      return typeof value === "string";
    case "spacing":
      return isSpacingValue(value);
    case "gaps":
      return isGapsValue(value);
    case "list":
      return Array.isArray(value);
    case "asset":
      return typeof value === "string" || isAssetRef(value);
    case "link":
      return typeof value === "string" || isLinkValue(value);
  }
}

// Condition semantics mirror `isPropHidden` of the section SDK.
export function isConditionSatisfied(
  condition: Condition,
  values: Record<string, PropValue>,
): boolean {
  if (condition.equals !== undefined) {
    return values[condition.prop] === condition.equals;
  }
  if (condition.notEquals !== undefined) {
    return values[condition.prop] !== condition.notEquals;
  }
  return false;
}

export function isControlVisible(
  control: Control,
  values: Record<string, PropValue>,
): boolean {
  if (!control.condition) {
    return true;
  }
  return isConditionSatisfied(control.condition, values);
}

// Structural check first (`ControlSchema` via TypeBox — the same mechanism the
// section SDK uses), then the semantic rules TypeBox cannot express. Both
// return `ValidationIssue[]`, exactly like `validateDefinition` in
// `@senify/section-sdk`.
export function validateControl(control: Control, path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const p = `${path}.${control.key || "?"}`;

  issues.push(...controlShapeIssues(control, p));

  if (!matchesValueType(control.valueType, control.default)) {
    issues.push({
      path: p,
      message: `Standardwert passt nicht zum Typ "${control.valueType}"`,
    });
  }

  switch (control.kind) {
    case "slider":
    case "number": {
      const { min, max, step } = control;
      if (min === undefined || max === undefined || step === undefined) {
        issues.push({ path: p, message: "min, max und step sind Pflicht" });
      } else {
        if (!(min < max)) {
          issues.push({
            path: p,
            message: `min (${min}) muss kleiner als max (${max}) sein`,
          });
        }
        if (!(step > 0)) {
          issues.push({ path: p, message: "step muss positiv sein" });
        }
        const value = control.default;
        if (typeof value === "number" && (value < min || value > max)) {
          issues.push({
            path: p,
            message: `Standardwert liegt außerhalb von [${min}, ${max}]`,
          });
        }
      }
      if (control.kind === "slider" && (control.units?.length ?? 0) === 0) {
        issues.push({
          path: p,
          message: "Schieberegler braucht mindestens eine Einheit",
        });
      }
      break;
    }
    case "choose":
    case "select": {
      const options = control.options;
      if (!options || options.length === 0) {
        issues.push({ path: p, message: "Auswahl braucht Optionen" });
        break;
      }
      const values = options.map((option) => option.value);
      if (new Set(values).size !== values.length) {
        issues.push({ path: p, message: "doppelte Optionswerte" });
      }
      if (
        typeof control.default === "string" &&
        !values.includes(control.default)
      ) {
        issues.push({ path: p, message: "Standardwert ist keine der Optionen" });
      }
      break;
    }
    case "color": {
      if (control.alpha !== undefined && typeof control.alpha !== "boolean") {
        issues.push({ path: p, message: "alpha muss ein Wahrheitswert sein" });
      }
      if (control.palette && control.palette.length === 0) {
        issues.push({ path: p, message: "Palette ist leer" });
      }
      break;
    }
    case "dimensions": {
      if ((control.units?.length ?? 0) === 0) {
        issues.push({ path: p, message: "Vierfach-Werte brauchen eine Einheit" });
      }
      if (!isSpacingValue(control.default)) {
        issues.push({ path: p, message: "Standardwert ist kein Vierfach-Wert" });
      }
      break;
    }
    case "gaps": {
      if ((control.units?.length ?? 0) === 0) {
        issues.push({ path: p, message: "Zwei-Werte brauchen eine Einheit" });
      }
      if (!isGapsValue(control.default)) {
        issues.push({ path: p, message: "Standardwert ist kein Zwei-Wert" });
      }
      break;
    }
    case "repeater": {
      if (!Array.isArray(control.default)) {
        issues.push({ path: p, message: "Standardwert ist keine Liste" });
      }
      const fields = control.fields;
      if (!fields || fields.length === 0) {
        issues.push({ path: p, message: "Wiederholfeld braucht Felder" });
        break;
      }
      const keys = fields.map((field) => field.key);
      if (new Set(keys).size !== keys.length) {
        issues.push({ path: p, message: "doppelte Feld-Keys" });
      }
      for (const field of fields) {
        issues.push(...validateControl(field, p));
      }
      if (
        control.minItems !== undefined &&
        control.maxItems !== undefined &&
        control.minItems > control.maxItems
      ) {
        issues.push({
          path: p,
          message: "minItems darf nicht größer als maxItems sein",
        });
      }
      if (
        control.minItems !== undefined &&
        Array.isArray(control.default) &&
        control.default.length < control.minItems
      ) {
        issues.push({
          path: p,
          message: "Standardwert hat weniger Einträge als minItems",
        });
      }
      break;
    }
    default:
      break;
  }

  if (control.condition) {
    if (!control.condition.prop) {
      issues.push({ path: p, message: "Bedingung ohne Eigenschaft" });
    }
    if (control.condition.prop === control.key) {
      issues.push({ path: p, message: "Bedingung verweist auf sich selbst" });
    }
    if (
      control.condition.equals !== undefined &&
      control.condition.notEquals !== undefined
    ) {
      issues.push({
        path: p,
        message: "Bedingung setzt equals und notEquals zugleich",
      });
    }
  }

  return issues;
}

export function controlKeys(primitive: PrimitiveDefinition): string[] {
  return primitive.controls.map((control) => control.key);
}

export function validatePrimitive(primitive: PrimitiveDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const p = `primitive(${primitive.type || "?"})`;

  issues.push(...primitiveShapeIssues(primitive, p));

  if (primitive.description.length === 0) {
    issues.push({ path: p, message: "description fehlt" });
  }
  if (primitive.styleGroups.length === 0) {
    issues.push({ path: p, message: "keine Stil-Gruppen" });
  }

  const keys = controlKeys(primitive);
  if (new Set(keys).size !== keys.length) {
    issues.push({ path: p, message: "doppelte Control-Keys" });
  }
  for (const control of primitive.controls) {
    issues.push(...validateControl(control, `${p}.controls`));
  }

  const known = new Set(keys);
  for (const control of primitive.controls) {
    if (control.condition && !known.has(control.condition.prop)) {
      issues.push({
        path: `${p}.${control.key}`,
        message: `Bedingung verweist auf unbekannte Eigenschaft "${control.condition.prop}"`,
      });
    }
  }

  const hasSlots = Object.keys(primitive.slots).length > 0;
  const isContainer =
    primitive.allowedChildren !== "none" || hasSlots;
  if (primitive.container !== isContainer) {
    issues.push({
      path: p,
      message: `Container-Flag passt nicht zur Kinder-Regel (${String(primitive.allowedChildren)})`,
    });
  }

  return issues;
}

export function styleGroupsOf(primitive: PrimitiveDefinition): StyleGroup[] {
  return primitive.styleGroups;
}
