// Editor operations (rebuild Phase 0, third slice).
//
// One pure function per op. An operation validates the intent against the
// widget catalog (unknown primitives, unknown properties, child rules, slots,
// class names, device inheritance), then describes the change as two patch
// lists: `forward` turns the current document into the next one, `inverse` turns
// it back. Nothing here mutates the document; the store applies the patches and
// records the history entry.
//
// All errors are `SenifyError` with a dotted `field` path, matching the engine.

import { SenifyError } from "@senify/core";
import type { EditorMutation, EditorNodeSpec } from "@senify/engine/browser";
import { motionPreset, type MotionSpec, type PropValue } from "@senify/section-sdk";
import {
  STATE_ORDER,
  assertValidCssClassName,
  baseKeyOf,
  camelToKebab,
  deviceKey,
  formatSpacing,
  getPrimitive,
  inheritanceChain,
  isRecord,
  isSafeCssProperty,
  isSafeRawCss,
  isValidCssSelector,
  isComponentPrimitive,
  matchesValueType,
  canonicalStyleRule,
  parseCssValue,
  reservedContextIds,
  scopeNameFor,
  scopeSelectorFor,
  styleRuleErrors,
  tokenRef,
  translatableProperties,
  type Device,
  type DeviceValueMap,
  type PrimitiveDefinition,
  type StyleRule,
} from "@senify/widget-engine";
import {
  collectSubtree,
  editorSlotSpecs,
  locateParent,
  nodeExists,
  styleRuleById,
  type EditorDocument,
  type EditorNode,
  type NodeId,
  type ParentRef,
} from "./document.ts";
import { isClassDefined } from "./document.ts";
import { newNodeId } from "./ids.ts";
import type { DocumentPatch } from "./patches.ts";

export type OperationContext = {
  idFactory?: () => string;
};

export type OperationResult = {
  forward: DocumentPatch[];
  inverse: DocumentPatch[];
  warnings: string[];
};

const EMPTY: OperationResult = { forward: [], inverse: [], warnings: [] };

function requireNode(
  document: EditorDocument,
  id: NodeId,
  field: string,
): EditorNode {
  const node = document.nodes[id];
  if (node === undefined) {
    throw new SenifyError("not_found", `Node "${id}" does not exist`, {
      field,
      suggestion: "The node was deleted or never existed — reload the document.",
    });
  }
  return node;
}

function requirePrimitive(primitive: string, field: string): PrimitiveDefinition {
  const definition = getPrimitive(primitive);
  if (definition === undefined) {
    throw new SenifyError("not_found", `Unknown primitive "${primitive}"`, {
      field,
      suggestion: "Use a primitive from the widget catalog.",
    });
  }
  return definition;
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
function assertKnownProp(
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
// carry JSON, not style values.
const STRUCTURAL_PROPS = new Set([
  "overrides",
  "componentId",
  "componentVersion",
  "name",
  "version",
  "allowedTypes",
  "max",
]);

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

function assertStyleDeclaration(key: string, value: PropValue, field: string): void {
  const property = camelToKebab(baseKeyOf(key));
  if (!isSafeCssProperty(property)) {
    throw new SenifyError("validation", `Unsafe CSS property "${key}"`, {
      field,
      suggestion: "Use a plain CSS property name (`border-radius`, `scroll-snap-type`).",
    });
  }
  assertSafeValue(value, field);
}

function assertPropValue(
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
    return;
  }
  // Not a catalog control: a style value. It runs through the same value
  // grammar as a style rule — the node prop path is not a second, weaker door
  // (ADR-0005).
  assertSafeValue(value, field);
}



// The motion spec is the one authoring channel (ticket 19): the preset must be
// in the registry, the dial stays 1-10 and the delay non-negative. The schema
// already bounds the numbers; this is the semantic half (catalog membership).
function assertMotionSpec(spec: MotionSpec, field: string): void {
  if (motionPreset(spec.preset) === undefined) {
    throw new SenifyError("validation", `Unknown motion preset "${spec.preset}"`, {
      field: `${field}.preset`,
      suggestion:
        "Use a preset from the motion registry (e.g. fade-up, scroll-reveal, scrub-pin).",
    });
  }
  if (spec.intensity !== undefined && (spec.intensity < 1 || spec.intensity > 10)) {
    throw new SenifyError("validation", "Motion intensity must be between 1 and 10", {
      field: `${field}.intensity`,
    });
  }
  if (spec.delay !== undefined && spec.delay < 0) {
    throw new SenifyError("validation", "Motion delay must not be negative", {
      field: `${field}.delay`,
    });
  }
}

function buildNode(
  document: EditorDocument,
  spec: EditorNodeSpec,
  fieldPrefix: string,
  idFactory: () => string,
): EditorNode {
  if (spec.primitive === "root") {
    throw new SenifyError("validation", "The root cannot be inserted or nested", {
      field: `${fieldPrefix}.primitive`,
      suggestion: "The root exists exactly once per document.",
    });
  }
  const definition = requirePrimitive(spec.primitive, `${fieldPrefix}.primitive`);
  const props: DeviceValueMap = {};
  for (const [key, value] of Object.entries(spec.props ?? {})) {
    assertKnownProp(definition, key, `${fieldPrefix}.props.${key}`);
    assertPropValue(definition, key, value, `${fieldPrefix}.props.${key}`);
    props[key] = value;
  }
  const id = spec.id ?? idFactory();
  if (document.nodes[id] !== undefined) {
    throw new SenifyError("conflict", `Node id "${id}" is already in use`, {
      field: `${fieldPrefix}.id`,
      suggestion: "Omit the id to let the store generate a unique one.",
    });
  }
  const node: EditorNode = { id, primitive: spec.primitive, props };
  if (spec.variant !== undefined) node.variant = spec.variant;
  if (spec.classes !== undefined) {
    for (const name of spec.classes) {
      if (!isClassDefined(document, name)) {
        throw new SenifyError(
          "not_found",
          `Unknown style class "${name}"`,
          {
            field: `${fieldPrefix}.classes`,
            suggestion: "Create the style rule before assigning it.",
          },
        );
      }
    }
    node.classes = [...new Set(spec.classes)];
  }
  if (spec.hidden !== undefined) node.hidden = spec.hidden;
  if (spec.locked !== undefined) node.locked = spec.locked;
  if (spec.motion !== undefined) {
    assertMotionSpec(spec.motion, `${fieldPrefix}.motion`);
    node.motion = structuredClone(spec.motion);
  }
  return node;
}

function targetList(
  document: EditorDocument,
  parent: EditorNode,
  childPrimitive: string,
  ref: ParentRef,
  field: string,
): NodeId[] {
  const definition = requirePrimitive(parent.primitive, field);
  if (ref.slot !== undefined) {
    // A component instance carries the slots of its definition, not of the
    // structural catalog type - `editorSlotSpecs` resolves both.
    const specs = editorSlotSpecs(document, parent);
    const slotSpec = specs[ref.slot];
    if (slotSpec === undefined) {
      const available = Object.keys(specs);
      throw new SenifyError(
        "validation",
        `Primitive "${definition.type}" has no slot "${ref.slot}"`,
        {
          field,
          suggestion:
            available.length > 0
              ? `Available slots: ${available.join(", ")}.`
              : "This primitive has no slots — insert into children instead.",
        },
      );
    }
    if (
      slotSpec.allowedTypes.length > 0 &&
      !slotSpec.allowedTypes.includes(childPrimitive)
    ) {
      throw new SenifyError(
        "validation",
        `Slot "${ref.slot}" of primitive "${definition.type}" does not allow "${childPrimitive}"`,
        { field, suggestion: `Allowed types: ${slotSpec.allowedTypes.join(", ")}.` },
      );
    }
    const list = parent.slots?.[ref.slot] ?? [];
    if (slotSpec.max !== null && list.length >= slotSpec.max) {
      throw new SenifyError(
        "validation",
        `Slot "${ref.slot}" of primitive "${definition.type}" is full (max ${slotSpec.max})`,
        { field, suggestion: "Remove a node from this slot first." },
      );
    }
    return list;
  }
  const allowed = definition.allowedChildren;
  if (allowed === "none") {
    throw new SenifyError(
      "validation",
      `Primitive "${definition.type}" does not allow children`,
      { field, suggestion: "Insert the node into a container primitive instead." },
    );
  }
  if (Array.isArray(allowed) && !allowed.includes(childPrimitive)) {
    throw new SenifyError(
      "validation",
      `Primitive "${definition.type}" does not allow child "${childPrimitive}"`,
      { field, suggestion: `Allowed children: ${allowed.join(", ")}.` },
    );
  }
  return parent.children ?? [];
}

function resolveIndex(
  index: number | undefined,
  length: number,
  field: string,
): number {
  const at = index ?? length;
  if (at < 0 || at > length) {
    throw new SenifyError("validation", `Index ${at} is out of range (0..${length})`, {
      field,
      suggestion: "Use an index within the current child list.",
    });
  }
  return at;
}

function requireNotRoot(document: EditorDocument, id: NodeId, action: string): void {
  if (id === document.rootNodeId) {
    throw new SenifyError("validation", `The root cannot be ${action}`, { field: "id" });
  }
}

function deviceOf(device: Device | undefined): Device {
  return device ?? "desktop";
}

function setPropsPatch(
  id: NodeId,
  props: Record<string, PropValue | null>,
): DocumentPatch {
  return { patch: "setNodeProps", id, props };
}

// --------------------------------------------------------------- prop writes

function applySetNodeProp(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "setNodeProp" }>,
): OperationResult {
  const device = deviceOf(mutation.device);
  const node = requireNode(document, mutation.id, "id");
  const definition = requirePrimitive(node.primitive, "id");
  assertKnownProp(definition, mutation.key, "key");
  assertPropValue(definition, mutation.key, mutation.value, "value");
  const storeKey = deviceKey(mutation.key, device);
  const had = Object.prototype.hasOwnProperty.call(node.props, storeKey);
  const previous = had ? (node.props[storeKey] ?? null) : null;
  const warnings: string[] = [];
  if (device !== "desktop") {
    const broader = inheritanceChain(mutation.key, device).slice(1);
    if (!broader.some((key) => node.props[key] !== undefined)) {
      warnings.push(
        `No broader value for "${mutation.key}" — the ${device} value stands alone.`,
      );
    }
  }
  return {
    forward: [setPropsPatch(mutation.id, { [storeKey]: mutation.value })],
    inverse: [setPropsPatch(mutation.id, { [storeKey]: previous })],
    warnings,
  };
}

function applyClearNodeProp(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "clearNodeProp" }>,
): OperationResult {
  const device = deviceOf(mutation.device);
  const node = requireNode(document, mutation.id, "id");
  const definition = requirePrimitive(node.primitive, "id");
  assertKnownProp(definition, mutation.key, "key");
  const storeKey = deviceKey(mutation.key, device);
  if (!Object.prototype.hasOwnProperty.call(node.props, storeKey)) return EMPTY;
  const previous = node.props[storeKey] ?? null;
  return {
    forward: [setPropsPatch(mutation.id, { [storeKey]: null })],
    inverse: [setPropsPatch(mutation.id, { [storeKey]: previous })],
    warnings: [],
  };
}

// ------------------------------------------------------------- motion writes

// The page root has no motion: the v1 section tree cannot carry one (the root
// is not a section), so the editor refuses it here instead of failing in the
// bridge later.
function applySetMotion(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "setMotion" }>,
): OperationResult {
  const node = requireNode(document, mutation.id, "id");
  if (node.id === document.rootNodeId) {
    throw new SenifyError("validation", "The page root has no motion", { field: "id" });
  }
  assertMotionSpec(mutation.spec, "spec");
  const previous = node.motion === undefined ? null : structuredClone(node.motion);
  return {
    forward: [{ patch: "setNodeMotion", id: node.id, spec: structuredClone(mutation.spec) }],
    inverse: [{ patch: "setNodeMotion", id: node.id, spec: previous }],
    warnings: [],
  };
}

function applyClearMotion(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "clearMotion" }>,
): OperationResult {
  const node = requireNode(document, mutation.id, "id");
  if (node.motion === undefined) return EMPTY;
  return {
    forward: [{ patch: "setNodeMotion", id: node.id, spec: null }],
    inverse: [{ patch: "setNodeMotion", id: node.id, spec: structuredClone(node.motion) }],
    warnings: [],
  };
}

// ------------------------------------------------------------- class writes

function applyAssignClass(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "assignClass" }>,
): OperationResult {
  const node = requireNode(document, mutation.id, "id");
  if (!isClassDefined(document, mutation.classId)) {
    throw new SenifyError(
      "not_found",
      `Unknown style class "${mutation.classId}"`,
      {
        field: "classId",
        suggestion: "Create the style rule before assigning it.",
      },
    );
  }
  const current = node.classes ?? [];
  if (current.includes(mutation.classId)) return EMPTY;
  return {
    forward: [
      {
        patch: "setNodeFields",
        id: mutation.id,
        fields: { classes: [...current, mutation.classId] },
      },
    ],
    inverse: [
      {
        patch: "setNodeFields",
        id: mutation.id,
        fields: { classes: current.length > 0 ? [...current] : null },
      },
    ],
    warnings: [],
  };
}

function applyRemoveClass(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "removeClass" }>,
): OperationResult {
  const node = requireNode(document, mutation.id, "id");
  const current = node.classes ?? [];
  if (!current.includes(mutation.classId)) {
    throw new SenifyError(
      "validation",
      `Class "${mutation.classId}" is not assigned to node "${mutation.id}"`,
      { field: "classId" },
    );
  }
  const next = current.filter((name) => name !== mutation.classId);
  return {
    forward: [
      {
        patch: "setNodeFields",
        id: mutation.id,
        fields: { classes: next.length > 0 ? next : null },
      },
    ],
    inverse: [
      {
        patch: "setNodeFields",
        id: mutation.id,
        fields: { classes: [...current] },
      },
    ],
    warnings: [],
  };
}

// The raw structural write: whole class list, hidden, locked. The canvas
// patches these fields directly (assign/remove and deleteStyleRule build on
// them), so this op is the transport form of a `setNodeFields` patch — it
// validates nothing beyond the node's existence, exactly like the patch.
function applySetNodeMeta(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "setNodeMeta" }>,
): OperationResult {
  const node = requireNode(document, mutation.id, "id");
  const meta = mutation.meta;
  const forward: DocumentPatch[] = [];
  const inverse: DocumentPatch[] = [];
  if (meta.classes !== undefined) {
    forward.push({
      patch: "setNodeFields",
      id: node.id,
      fields: { classes: meta.classes === null ? null : [...meta.classes] },
    });
    inverse.push({
      patch: "setNodeFields",
      id: node.id,
      fields: { classes: node.classes === undefined ? null : [...node.classes] },
    });
  }
  if (meta.hidden !== undefined) {
    forward.push({ patch: "setNodeFields", id: node.id, fields: { hidden: meta.hidden } });
    inverse.push({
      patch: "setNodeFields",
      id: node.id,
      fields: { hidden: node.hidden ?? null },
    });
  }
  if (meta.locked !== undefined) {
    forward.push({ patch: "setNodeFields", id: node.id, fields: { locked: meta.locked } });
    inverse.push({
      patch: "setNodeFields",
      id: node.id,
      fields: { locked: node.locked ?? null },
    });
  }
  return { forward, inverse, warnings: [] };
}

// Ticket 11: the breakpoints on which a node is additionally hidden. The list
// is authoritative; `null` in the inverse patch removes the field.
function applySetNodeHiddenDevices(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "setNodeHiddenDevices" }>,
): OperationResult {
  const node = requireNode(document, mutation.id, "id");
  const before = node.hiddenDevices === undefined ? null : [...node.hiddenDevices];
  return {
    forward: [
      {
        patch: "setNodeFields",
        id: node.id,
        fields: { hiddenDevices: [...mutation.devices] },
      },
    ],
    inverse: [
      {
        patch: "setNodeFields",
        id: node.id,
        fields: { hiddenDevices: before },
      },
    ],
    warnings: [],
  };
}

// ------------------------------------------------------------- style rules

// The hard shape check plus the semantic rules the schema cannot express:
// every declaration runs through the value grammar, context ids may not shadow
// the device suffixes, and `rawCss` stays a keyframes block.
function assertStyleRuleShape(rule: StyleRule, field: string): void {
  const errors = styleRuleErrors(rule);
  if (errors.length > 0) {
    throw new SenifyError("validation", `Invalid style rule: ${errors[0]}`, {
      field,
      suggestion: "Check the rule against the canonical style rule shape.",
    });
  }
  const reserved = reservedContextIds(rule);
  if (reserved.length > 0) {
    throw new SenifyError(
      "validation",
      `Context id "${reserved[0]}" is reserved for a built-in device`,
      {
        field: `${field}.contextStyles`,
        suggestion: "Use the device suffix form (`padding_tablet`) for tablet and mobile.",
      },
    );
  }
  if (rule.kind === "ambient" && !isValidCssSelector(rule.selector)) {
    throw new SenifyError("validation", `Invalid CSS selector "${rule.selector}"`, {
      field: `${field}.selector`,
    });
  }
  if (rule.rawCss !== undefined && !isSafeRawCss(rule.rawCss)) {
    throw new SenifyError("validation", "rawCss must be a single @keyframes block", {
      field: `${field}.rawCss`,
      suggestion: "Only sanitised @keyframes are carried verbatim; everything else is structured.",
    });
  }
  for (const [key, value] of Object.entries(rule.styles)) {
    assertStyleDeclaration(key, value, `${field}.styles.${key}`);
  }
  for (const state of STATE_ORDER) {
    const bag = rule.states?.[state];
    if (bag === undefined) continue;
    for (const [key, value] of Object.entries(bag)) {
      assertStyleDeclaration(key, value, `${field}.states.${state}.${key}`);
    }
  }
  for (const [context, bag] of Object.entries(rule.contextStyles)) {
    for (const [key, value] of Object.entries(bag)) {
      assertStyleDeclaration(key, value, `${field}.contextStyles.${context}.${key}`);
    }
  }
}

function applyRenameStyleRule(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "renameStyleRule" }>,
): OperationResult {
  const rule = styleRuleById(document, mutation.id);
  if (rule === undefined) {
    throw new SenifyError("not_found", `Style rule "${mutation.id}" does not exist`, {
      field: "id",
    });
  }
  if (rule.kind !== "class" || rule.scope !== undefined) {
    throw new SenifyError("validation", "Only an assignable class rule can be renamed", {
      field: "id",
      suggestion: "Ambient rules are renamed through their selector; scoped rules are generated.",
    });
  }
  let name: string;
  try {
    name = assertValidCssClassName(mutation.name);
  } catch (error) {
    throw new SenifyError(
      "validation",
      error instanceof Error ? error.message : "Invalid style class name",
      { field: "name" },
    );
  }
  const clash = document.styleRules.find(
    (entry) =>
      entry.id !== rule.id &&
      entry.kind === "class" &&
      entry.scope === undefined &&
      entry.name === name,
  );
  if (clash !== undefined) {
    throw new SenifyError("conflict", `Style class "${name}" already exists`, {
      field: "name",
      suggestion: "Pick a name that is not in use yet.",
    });
  }
  if (name === rule.name) return EMPTY;
  return {
    forward: [{ patch: "renameStyleRule", id: rule.id, name }],
    inverse: [{ patch: "renameStyleRule", id: rule.id, name: rule.name }],
    warnings: [],
  };
}

function applyUpsertStyleRule(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "upsertStyleRule" }>,
): OperationResult {
  const rule = mutation.rule;
  assertStyleRuleShape(rule, "rule");
  // Store the canonical form (known fields, canonical order) so a save/load
  // cycle is byte-stable.
  const canonical = canonicalStyleRule(rule);
  if (canonical === undefined) {
    throw new SenifyError("validation", "Invalid style rule", { field: "rule" });
  }

  if (rule.kind === "class" && rule.scope === undefined) {
    const clash = document.styleRules.find(
      (entry) =>
        entry.id !== rule.id &&
        entry.kind === "class" &&
        entry.scope === undefined &&
        entry.name === rule.name,
    );
    if (clash !== undefined) {
      throw new SenifyError("conflict", `Style class "${rule.name}" already exists`, {
        field: "rule.name",
        suggestion: "Pick a name that is not in use yet.",
      });
    }
  }
  if (rule.kind === "scoped") {
    if (rule.scope === undefined) {
      throw new SenifyError("validation", "A scoped rule must name its node", {
        field: "rule.scope",
      });
    }
    if (!nodeExists(document, rule.scope.nodeId)) {
      throw new SenifyError("not_found", `Node "${rule.scope.nodeId}" does not exist`, {
        field: "rule.scope.nodeId",
      });
    }
    const clash = document.styleRules.find(
      (entry) =>
        entry.id !== rule.id && entry.scope?.nodeId === rule.scope?.nodeId,
    );
    if (clash !== undefined) {
      throw new SenifyError(
        "conflict",
        `Node "${rule.scope.nodeId}" already owns a scoped style rule`,
        { field: "rule.scope.nodeId", suggestion: "Update the existing rule instead." },
      );
    }
  }

  const existing = styleRuleById(document, rule.id);
  return {
    forward: [{ patch: "upsertStyleRule", rule: canonical }],
    inverse: [
      existing === undefined
        ? { patch: "deleteStyleRule", id: rule.id }
        : { patch: "upsertStyleRule", rule: structuredClone(existing) },
    ],
    warnings: [],
  };
}

function applyDeleteStyleRule(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "deleteStyleRule" }>,
): OperationResult {
  const rule = styleRuleById(document, mutation.id);
  if (rule === undefined) {
    throw new SenifyError("not_found", `Style rule "${mutation.id}" does not exist`, {
      field: "id",
    });
  }
  const forward: DocumentPatch[] = [{ patch: "deleteStyleRule", id: mutation.id }];
  const inverse: DocumentPatch[] = [
    { patch: "upsertStyleRule", rule: structuredClone(rule) },
  ];
  // An assignable class leaves the nodes with it.
  if (rule.kind === "class" && rule.scope === undefined) {
    for (const node of Object.values(document.nodes)) {
      if (node.classes === undefined || !node.classes.includes(rule.name)) continue;
      const without = node.classes.filter((name) => name !== rule.name);
      forward.push({
        patch: "setNodeFields",
        id: node.id,
        fields: { classes: without.length > 0 ? without : null },
      });
      inverse.push({
        patch: "setNodeFields",
        id: node.id,
        fields: { classes: [...node.classes] },
      });
    }
  }
  return { forward, inverse, warnings: [] };
}

// Reordering moves a rule inside the class registry. The index is the target
// position after removal (like the section `moveNode` op), and the inverse is
// the move back to the position the rule had before.
function applyReorderStyleRule(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "reorderStyleRule" }>,
): OperationResult {
  const from = document.styleRules.findIndex((rule) => rule.id === mutation.id);
  if (from < 0) {
    throw new SenifyError("not_found", `Style rule "${mutation.id}" does not exist`, {
      field: "id",
    });
  }
  if (mutation.index < 0 || mutation.index >= document.styleRules.length) {
    throw new SenifyError(
      "validation",
      `Index ${mutation.index} is outside the style rule list`,
      {
        field: "index",
        suggestion: `Use an index between 0 and ${document.styleRules.length - 1}.`,
      },
    );
  }
  return {
    forward: [{ patch: "reorderStyleRule", id: mutation.id, index: mutation.index }],
    inverse: [{ patch: "reorderStyleRule", id: mutation.id, index: from }],
    warnings: [],
  };
}

// ------------------------------------------------------------- structure

function applyInsertNode(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "insertNode" }>,
  idFactory: () => string,
): OperationResult {
  const parent = requireNode(document, mutation.parent.nodeId, "parent.nodeId");
  const node = buildNode(document, mutation.node, "node", idFactory);
  const list = targetList(
    document,
    parent,
    node.primitive,
    mutation.parent,
    "parent.nodeId",
  );
  const index = resolveIndex(mutation.index, list.length, "index");
  return {
    forward: [
      { patch: "insertNodes", parent: mutation.parent, index, nodes: [node] },
    ],
    inverse: [{ patch: "deleteNode", id: node.id }],
    warnings: [],
  };
}

function applyDuplicateNode(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "duplicateNode" }>,
  idFactory: () => string,
): OperationResult {
  requireNotRoot(document, mutation.id, "duplicated");
  const source = requireNode(document, mutation.id, "id");
  const located = locateParent(document, mutation.id);
  if (located === undefined) {
    throw new SenifyError("validation", `Node "${mutation.id}" is not attached to the tree`, {
      field: "id",
    });
  }
  const subtree = collectSubtree(document, mutation.id);
  const subtreeIds = new Set(subtree.map((entry) => entry.id));
  const target: ParentRef = mutation.target !== undefined ? { ...mutation.target } : { ...located.parent };
  if (subtreeIds.has(target.nodeId)) {
    throw new SenifyError("validation", "A node cannot be duplicated into its own subtree", {
      field: "target.nodeId",
      suggestion: "Choose a target outside the duplicated subtree.",
    });
  }
  const targetOwner = requireNode(document, target.nodeId, "target.nodeId");
  const list = targetList(document, targetOwner, source.primitive, target, "target.nodeId");
  const index =
    mutation.index !== undefined
      ? resolveIndex(mutation.index, list.length, "index")
      : target.nodeId === located.parent.nodeId && target.slot === located.parent.slot
        ? located.index + 1
        : list.length;
  const idMap = new Map<NodeId, NodeId>();
  for (const entry of subtree) idMap.set(entry.id, idFactory());
  const clones: EditorNode[] = subtree.map((entry) => {
    const clone: EditorNode = structuredClone(entry);
    const fresh = idMap.get(entry.id);
    if (fresh === undefined) throw new Error("Internal error: id map incomplete");
    clone.id = fresh;
    if (clone.children !== undefined) {
      clone.children = clone.children.map((childId) => {
        const mapped = idMap.get(childId);
        if (mapped === undefined) throw new Error("Internal error: child id missing");
        return mapped;
      });
    }
    if (clone.slots !== undefined) {
      const slots: Record<string, NodeId[]> = {};
      for (const [slot, ids] of Object.entries(clone.slots)) {
        slots[slot] = ids.map((childId) => {
          const mapped = idMap.get(childId);
          if (mapped === undefined) throw new Error("Internal error: slot id missing");
          return mapped;
        });
      }
      clone.slots = slots;
    }
    return clone;
  });
  const root = clones[0];
  if (root === undefined) throw new Error("Internal error: empty clone set");
  // A scoped rule follows its node: the copy gets its own rule with a fresh id,
  // pointing at the copied node (the generated name mirrors the new node id).
  const scopedClones: StyleRule[] = [];
  for (const rule of document.styleRules) {
    if (rule.kind !== "scoped" || rule.scope === undefined) continue;
    const mapped = idMap.get(rule.scope.nodeId);
    if (mapped === undefined) continue;
    scopedClones.push({
      ...structuredClone(rule),
      id: idFactory(),
      name: scopeNameFor(mapped),
      selector: scopeSelectorFor(mapped),
      scope: { type: "node", nodeId: mapped, role: "module-style" },
    });
  }
  return {
    forward: [
      { patch: "insertNodes", parent: target, index, nodes: clones },
      ...scopedClones.map((rule): DocumentPatch => ({ patch: "upsertStyleRule", rule })),
    ],
    inverse: [
      { patch: "deleteNode", id: root.id },
      ...scopedClones.map((rule): DocumentPatch => ({ patch: "deleteStyleRule", id: rule.id })),
    ],
    warnings: [],
  };
}

function applyMoveNode(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "moveNode" }>,
): OperationResult {
  requireNotRoot(document, mutation.id, "moved");
  const node = requireNode(document, mutation.id, "id");
  const located = locateParent(document, mutation.id);
  if (located === undefined) {
    throw new SenifyError("validation", `Node "${mutation.id}" is not attached to the tree`, {
      field: "id",
    });
  }
  if (collectSubtree(document, mutation.id).some((entry) => entry.id === mutation.target.nodeId)) {
    throw new SenifyError("validation", "A node cannot be moved into its own subtree", {
      field: "target.nodeId",
      suggestion: "Choose a target outside the moved subtree.",
    });
  }
  const targetOwner = requireNode(document, mutation.target.nodeId, "target.nodeId");
  const list = targetList(document, targetOwner, node.primitive, mutation.target, "target.nodeId");
  // The section contract resolves the move index *after* the node left its old
  // list (the engine unlinks first, then inserts). The editor accepts the
  // natural pre-removal index (0..length) and normalizes it for a same-list
  // move, so the index that reaches the engine is one it can resolve.
  const raw = resolveIndex(mutation.index, list.length, "index");
  const sameList =
    located.parent.nodeId === mutation.target.nodeId &&
    located.parent.slot === mutation.target.slot;
  const index = sameList && raw > located.index ? raw - 1 : raw;
  return {
    forward: [
      { patch: "moveNode", id: mutation.id, target: mutation.target, index },
    ],
    inverse: [
      { patch: "moveNode", id: mutation.id, target: located.parent, index: located.index },
    ],
    warnings: [],
  };
}

function applyDeleteNode(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "deleteNode" }>,
): OperationResult {
  requireNotRoot(document, mutation.id, "deleted");
  requireNode(document, mutation.id, "id");
  const located = locateParent(document, mutation.id);
  if (located === undefined) {
    throw new SenifyError("validation", `Node "${mutation.id}" is not attached to the tree`, {
      field: "id",
    });
  }
  const subtree = collectSubtree(document, mutation.id);
  const subtreeIds = new Set(subtree.map((entry) => entry.id));
  const forward: DocumentPatch[] = [{ patch: "deleteNode", id: mutation.id }];
  const inverse: DocumentPatch[] = [
    {
      patch: "insertNodes",
      parent: located.parent,
      index: located.index,
      nodes: subtree,
    },
  ];
  // A scoped rule belongs to exactly one node: when the node goes, its rule
  // goes with it, or the document would be inconsistent afterwards.
  for (const rule of document.styleRules) {
    if (rule.kind !== "scoped" || rule.scope === undefined) continue;
    if (!subtreeIds.has(rule.scope.nodeId)) continue;
    forward.push({ patch: "deleteStyleRule", id: rule.id });
    inverse.push({ patch: "upsertStyleRule", rule: structuredClone(rule) });
  }
  return { forward, inverse, warnings: [] };
}

// --------------------------------------------------------------- slots

function applySetSlotContent(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "setSlotContent" }>,
  idFactory: () => string,
): OperationResult {
  const parent = requireNode(document, mutation.id, "id");
  const definition = requirePrimitive(parent.primitive, "id");
  const specs = editorSlotSpecs(document, parent);
  const slotSpec = specs[mutation.slot];
  if (slotSpec === undefined) {
    const available = Object.keys(specs);
    throw new SenifyError(
      "validation",
      `Primitive "${definition.type}" has no slot "${mutation.slot}"`,
      {
        field: "slot",
        suggestion: available.length > 0 ? `Available slots: ${available.join(", ")}.` : undefined,
      },
    );
  }
  const newNodes = mutation.nodes.map((spec, index) =>
    buildNode(document, spec, `nodes[${index}]`, idFactory),
  );
  for (const node of newNodes) {
    if (
      slotSpec.allowedTypes.length > 0 &&
      !slotSpec.allowedTypes.includes(node.primitive)
    ) {
      throw new SenifyError(
        "validation",
        `Slot "${mutation.slot}" of primitive "${definition.type}" does not allow "${node.primitive}"`,
        { field: "nodes", suggestion: `Allowed types: ${slotSpec.allowedTypes.join(", ")}.` },
      );
    }
  }
  if (slotSpec.max !== null && newNodes.length > slotSpec.max) {
    throw new SenifyError(
      "validation",
      `Slot "${mutation.slot}" of primitive "${definition.type}" holds at most ${slotSpec.max} nodes`,
      { field: "nodes" },
    );
  }
  const oldIds = parent.slots?.[mutation.slot] ?? [];
  const oldSubtrees = oldIds.map((id) => collectSubtree(document, id));
  const parent_ = { nodeId: mutation.id, slot: mutation.slot };
  const forward: DocumentPatch[] = [
    ...oldIds.map((id): DocumentPatch => ({ patch: "deleteNode", id })),
    ...newNodes.map((node, index): DocumentPatch => ({
      patch: "insertNodes",
      parent: parent_,
      index,
      nodes: [node],
    })),
  ];
  const inverse: DocumentPatch[] = [
    ...newNodes.map((node): DocumentPatch => ({ patch: "deleteNode", id: node.id })),
    ...oldIds.map((id, index): DocumentPatch => ({
      patch: "insertNodes",
      parent: parent_,
      index,
      nodes: oldSubtrees[index] ?? [],
    })),
  ];
  return { forward, inverse, warnings: [] };
}

function requireCollection(
  document: EditorDocument,
  id: NodeId,
): EditorNode {
  const node = requireNode(document, id, "id");
  const definition = requirePrimitive(node.primitive, "id");
  if (definition.type !== "collection") {
    throw new SenifyError(
      "validation",
      `Primitive "${definition.type}" is not a collection`,
      { field: "id", suggestion: 'Only the "collection" primitive holds entries.' },
    );
  }
  return node;
}

function applyCreateCollectionEntry(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "createCollectionEntry" }>,
  idFactory: () => string,
): OperationResult {
  const parent = requireCollection(document, mutation.id);
  const definition = requirePrimitive(parent.primitive, "id");
  const slotSpec = definition.slots["item"];
  const node = buildNode(document, mutation.node, "node", idFactory);
  const existing = parent.slots?.item ?? [];
  if (slotSpec?.max !== undefined && existing.length >= slotSpec.max) {
    throw new SenifyError(
      "validation",
      `The item slot of "${parent.primitive}" is full (max ${slotSpec.max})`,
      { field: "node", suggestion: "Remove the existing entry first." },
    );
  }
  if (
    slotSpec?.allowedTypes !== undefined &&
    slotSpec.allowedTypes.length > 0 &&
    !slotSpec.allowedTypes.includes(node.primitive)
  ) {
    throw new SenifyError(
      "validation",
      `The item slot does not allow "${node.primitive}"`,
      { field: "node.primitive", suggestion: `Allowed types: ${slotSpec.allowedTypes.join(", ")}.` },
    );
  }
  const index = resolveIndex(mutation.index, existing.length, "index");
  return {
    forward: [
      {
        patch: "insertNodes",
        parent: { nodeId: mutation.id, slot: "item" },
        index,
        nodes: [node],
      },
    ],
    inverse: [{ patch: "deleteNode", id: node.id }],
    warnings: [],
  };
}

function applyUpdateCollectionEntry(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "updateCollectionEntry" }>,
): OperationResult {
  const parent = requireCollection(document, mutation.id);
  const entryIds = parent.slots?.item ?? [];
  const entryId = entryIds[mutation.index];
  if (entryId === undefined) {
    throw new SenifyError(
      "validation",
      `No collection entry at index ${mutation.index}`,
      { field: "index", suggestion: `The item slot holds ${entryIds.length} entries.` },
    );
  }
  const entry = requireNode(document, entryId, "index");
  const definition = requirePrimitive(entry.primitive, "index");
  const changes: Record<string, PropValue | null> = {};
  const restore: Record<string, PropValue | null> = {};
  for (const [key, value] of Object.entries(mutation.patch)) {
    assertKnownProp(definition, key, `patch.${key}`);
    if (value !== null) assertPropValue(definition, key, value, `patch.${key}`);
    changes[key] = value;
    restore[key] = Object.prototype.hasOwnProperty.call(entry.props, key)
      ? (entry.props[key] ?? null)
      : null;
  }
  return {
    forward: [setPropsPatch(entryId, changes)],
    inverse: [setPropsPatch(entryId, restore)],
    warnings: [],
  };
}

export function applyEditorMutation(
  document: EditorDocument,
  mutation: EditorMutation,
  context: OperationContext = {},
): OperationResult {
  const idFactory = context.idFactory ?? newNodeId;
  switch (mutation.op) {
    case "setNodeProp":
      return applySetNodeProp(document, mutation);
    case "clearNodeProp":
      return applyClearNodeProp(document, mutation);
    case "setNodeMeta":
      return applySetNodeMeta(document, mutation);
    case "setNodeHiddenDevices":
      return applySetNodeHiddenDevices(document, mutation);
    case "setMotion":
      return applySetMotion(document, mutation);
    case "clearMotion":
      return applyClearMotion(document, mutation);
    case "assignClass":
      return applyAssignClass(document, mutation);
    case "removeClass":
      return applyRemoveClass(document, mutation);
    case "renameStyleRule":
      return applyRenameStyleRule(document, mutation);
    case "upsertStyleRule":
      return applyUpsertStyleRule(document, mutation);
    case "deleteStyleRule":
      return applyDeleteStyleRule(document, mutation);
    case "reorderStyleRule":
      return applyReorderStyleRule(document, mutation);
    case "insertNode":
      return applyInsertNode(document, mutation, idFactory);
    case "duplicateNode":
      return applyDuplicateNode(document, mutation, idFactory);
    case "moveNode":
      return applyMoveNode(document, mutation);
    case "deleteNode":
      return applyDeleteNode(document, mutation);
    case "setSlotContent":
      return applySetSlotContent(document, mutation, idFactory);
    case "createCollectionEntry":
      return applyCreateCollectionEntry(document, mutation, idFactory);
    case "updateCollectionEntry":
      return applyUpdateCollectionEntry(document, mutation);
  }
}
