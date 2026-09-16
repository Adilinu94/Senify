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

const KNOWN_CONTROL_KINDS = new Set<string>([
  "text",
  "textarea",
  "number",
  "slider",
  "color",
  "switcher",
  "choose",
  "select",
  "dimensions",
  "gaps",
  "repeater",
  "url",
  "media",
  "icon",
]);

export function validateControl(control: Control, path: string): string[] {
  const issues: string[] = [];
  const p = `${path}.${control.key || "?"}`;

  if (!control.key) {
    issues.push(`${p}: key fehlt`);
  }
  if (!control.label) {
    issues.push(`${p}: label fehlt`);
  }
  if (!KNOWN_CONTROL_KINDS.has(control.kind)) {
    issues.push(`${p}: unbekanntes Steuerelement "${control.kind}"`);
  }
  if (!matchesValueType(control.valueType, control.default)) {
    issues.push(`${p}: Standardwert passt nicht zum Typ "${control.valueType}"`);
  }

  switch (control.kind) {
    case "slider":
    case "number": {
      const { min, max, step } = control;
      if (min === undefined || max === undefined || step === undefined) {
        issues.push(`${p}: min, max und step sind Pflicht`);
      } else {
        if (!(min < max)) {
          issues.push(`${p}: min (${min}) muss kleiner als max (${max}) sein`);
        }
        if (!(step > 0)) {
          issues.push(`${p}: step muss positiv sein`);
        }
        const value = control.default;
        if (typeof value === "number" && (value < min || value > max)) {
          issues.push(`${p}: Standardwert liegt außerhalb von [${min}, ${max}]`);
        }
      }
      if (control.kind === "slider" && (control.units?.length ?? 0) === 0) {
        issues.push(`${p}: Schieberegler braucht mindestens eine Einheit`);
      }
      break;
    }
    case "choose":
    case "select": {
      const options = control.options;
      if (!options || options.length === 0) {
        issues.push(`${p}: Auswahl braucht Optionen`);
        break;
      }
      const values = options.map((option) => option.value);
      if (new Set(values).size !== values.length) {
        issues.push(`${p}: doppelte Optionswerte`);
      }
      if (
        typeof control.default === "string" &&
        !values.includes(control.default)
      ) {
        issues.push(`${p}: Standardwert ist keine der Optionen`);
      }
      break;
    }
    case "color": {
      if (control.alpha !== undefined && typeof control.alpha !== "boolean") {
        issues.push(`${p}: alpha muss ein Wahrheitswert sein`);
      }
      if (control.palette && control.palette.length === 0) {
        issues.push(`${p}: Palette ist leer`);
      }
      break;
    }
    case "dimensions": {
      if ((control.units?.length ?? 0) === 0) {
        issues.push(`${p}: Vierfach-Werte brauchen eine Einheit`);
      }
      if (!isSpacingValue(control.default)) {
        issues.push(`${p}: Standardwert ist kein Vierfach-Wert`);
      }
      break;
    }
    case "gaps": {
      if ((control.units?.length ?? 0) === 0) {
        issues.push(`${p}: Zwei-Werte brauchen eine Einheit`);
      }
      if (!isGapsValue(control.default)) {
        issues.push(`${p}: Standardwert ist kein Zwei-Wert`);
      }
      break;
    }
    case "repeater": {
      if (!Array.isArray(control.default)) {
        issues.push(`${p}: Standardwert ist keine Liste`);
      }
      const fields = control.fields;
      if (!fields || fields.length === 0) {
        issues.push(`${p}: Wiederholfeld braucht Felder`);
        break;
      }
      const keys = fields.map((field) => field.key);
      if (new Set(keys).size !== keys.length) {
        issues.push(`${p}: doppelte Feld-Keys`);
      }
      for (const field of fields) {
        issues.push(...validateControl(field, p));
      }
      if (
        control.minItems !== undefined &&
        control.maxItems !== undefined &&
        control.minItems > control.maxItems
      ) {
        issues.push(`${p}: minItems darf nicht größer als maxItems sein`);
      }
      if (
        control.minItems !== undefined &&
        Array.isArray(control.default) &&
        control.default.length < control.minItems
      ) {
        issues.push(`${p}: Standardwert hat weniger Einträge als minItems`);
      }
      break;
    }
    default:
      break;
  }

  if (control.condition) {
    if (!control.condition.prop) {
      issues.push(`${p}: Bedingung ohne Eigenschaft`);
    }
    if (control.condition.prop === control.key) {
      issues.push(`${p}: Bedingung verweist auf sich selbst`);
    }
    if (
      control.condition.equals !== undefined &&
      control.condition.notEquals !== undefined
    ) {
      issues.push(`${p}: Bedingung setzt equals und notEquals zugleich`);
    }
  }

  return issues;
}

export function controlKeys(primitive: PrimitiveDefinition): string[] {
  return primitive.controls.map((control) => control.key);
}

export function validatePrimitive(primitive: PrimitiveDefinition): string[] {
  const issues: string[] = [];
  const p = `primitive(${primitive.type || "?"})`;

  if (!primitive.type) {
    issues.push(`${p}: type fehlt`);
  }
  if (!primitive.name) {
    issues.push(`${p}: name fehlt`);
  }
  if (primitive.description.length === 0) {
    issues.push(`${p}: description fehlt`);
  }
  if (primitive.styleGroups.length === 0) {
    issues.push(`${p}: keine Stil-Gruppen`);
  }

  const keys = controlKeys(primitive);
  if (new Set(keys).size !== keys.length) {
    issues.push(`${p}: doppelte Control-Keys`);
  }
  for (const control of primitive.controls) {
    issues.push(...validateControl(control, `${p}.controls`));
  }

  const known = new Set(keys);
  for (const control of primitive.controls) {
    if (control.condition && !known.has(control.condition.prop)) {
      issues.push(
        `${p}.${control.key}: Bedingung verweist auf unbekannte Eigenschaft "${control.condition.prop}"`,
      );
    }
  }

  const hasSlots = Object.keys(primitive.slots).length > 0;
  const isContainer =
    primitive.allowedChildren !== "none" || hasSlots;
  if (primitive.container !== isContainer) {
    issues.push(
      `${p}: Container-Flag passt nicht zur Kinder-Regel (${String(primitive.allowedChildren)})`,
    );
  }

  return issues;
}

export function styleGroupsOf(primitive: PrimitiveDefinition): StyleGroup[] {
  return primitive.styleGroups;
}
