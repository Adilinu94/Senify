// The widget catalog as the second node vocabulary of the tree (Strangler E2):
// every catalog primitive the registry does not already know as a section or a
// structural type becomes a registered type, so the engine's mutation path
// accepts what the canvas places. A section wins: `divider` and `embed` keep
// their section definition (the twin bridge), the component types stay
// structural, `root` is the document root and never a node.
//
// The definition is the door, the check is the lock: a primitive does not take
// the closed prop list of a section (its style space is open, ADR-0005), it
// runs through the same prop boundary the editor store stands on
// (`checkKnownProp` / `checkPropValue` in widget-engine).

import type {
  PropSpec,
  Registry,
  SectionCategory,
  SectionDefinition,
  ValidationIssue,
} from "@senify/section-sdk";
import {
  checkKnownProp,
  checkPropValue,
  getPrimitive,
  primitiveTypes,
  type PrimitiveCategory,
  type PrimitiveDefinition,
} from "@senify/widget-engine";

const CATEGORY: Record<PrimitiveCategory, SectionCategory> = {
  layout: "structure",
  basic: "content",
  media: "media",
  form: "utility",
  advanced: "utility",
};

// The prop list is documentation for the agents' view of a node; the value
// check is the boundary above, not these specs.
function propSpecs(primitive: PrimitiveDefinition): PropSpec[] {
  return primitive.controls.map((control) => ({
    key: control.key,
    label: control.label,
    control:
      control.valueType === "string"
        ? "text"
        : control.valueType === "number"
          ? "number"
          : control.valueType === "boolean"
            ? "boolean"
            : "json",
  }));
}

function definitionOf(primitive: PrimitiveDefinition): SectionDefinition {
  return {
    type: primitive.type,
    version: 1,
    title: primitive.name,
    description: primitive.description,
    category: CATEGORY[primitive.category],
    props: propSpecs(primitive),
    allowedChildren: primitive.allowedChildren,
    ...(Object.keys(primitive.slots).length === 0 ? {} : { slots: primitive.slots }),
    golden: { tree: { type: primitive.type, props: {} }, thumbnails: {} },
  };
}

function validatorOf(primitive: PrimitiveDefinition) {
  return (
    props: Record<string, import("@senify/section-sdk").PropValue>,
    basePath: string,
  ): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];
    for (const [key, value] of Object.entries(props)) {
      const problem = checkKnownProp(primitive, key) ?? checkPropValue(primitive, key, value);
      if (problem === undefined) continue;
      issues.push({
        path: `${basePath}.${key}`,
        message: problem.message,
        ...(problem.suggestion === undefined ? {} : { suggestion: problem.suggestion }),
      });
    }
    return issues;
  };
}

export function registerCatalogPrimitives(registry: Registry): void {
  for (const type of primitiveTypes()) {
    if (type === "root" || registry.has(type)) continue;
    const primitive = getPrimitive(type);
    if (primitive === undefined) continue;
    registry.registerPrimitive(definitionOf(primitive), validatorOf(primitive));
  }
}
