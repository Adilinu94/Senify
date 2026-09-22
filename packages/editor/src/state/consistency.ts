// Document consistency check (rebuild Phase 0, third slice).
//
// One function that reports everything wrong with a document: wrong version,
// missing or non-root root, unknown primitives, references to nodes that do not
// exist, a node claimed by two parents, orphans, children the catalog does not
// allow, slots that do not exist or are overfull, classes that are not defined
// and reference cycles. Every issue carries a message and, where useful, the
// node or class it points at. The store runs this after every write and refuses
// a patch that would break the document.

import {
  COMPONENT_DEFINITION_PRIMITIVE,
  COMPONENT_INSTANCE_PRIMITIVE,
  getPrimitive,
  isValidCssSelector,
  reservedContextIds,
  STYLE_RULE_KINDS,
} from "@senify/widget-engine";
import { motionPreset, motionProfileViolations, webglSceneEnabled, type MotionProfile } from "@senify/section-sdk";
import {
  DOCUMENT_VERSION,
  editorSlotSpecs,
  isClassDefined,
  type EditorDocument,
  type NodeId,
} from "./document.ts";

export type DocumentIssueKind =
  | "wrong-version"
  | "missing-root"
  | "root-primitive"
  | "unknown-primitive"
  | "dangling-child"
  | "dangling-slot"
  | "duplicate-parent"
  | "orphan-node"
  | "child-not-allowed"
  | "slot-unknown"
  | "slot-not-allowed"
  | "slot-full"
  | "undefined-class"
  | "duplicate-rule-id"
  | "duplicate-class-name"
  | "duplicate-scope"
  | "unknown-rule-kind"
  | "invalid-rule-selector"
  | "reserved-context-id"
  | "scoped-rule-without-node"
  | "motion-preset-unknown"
  | "motion-pin-excess"
  | "motion-scene-excess"
  | "profile-intensity-cap"
  | "profile-preset"
  | "profile-pin"
  | "profile-3d"
  | "cycle";

export type DocumentIssue = {
  kind: DocumentIssueKind;
  nodeId?: NodeId;
  ref?: NodeId;
  classId?: string;
  message: string;
};

export function validateDocument(document: EditorDocument): DocumentIssue[] {
  const issues: DocumentIssue[] = [];

  if (document.version !== DOCUMENT_VERSION) {
    issues.push({
      kind: "wrong-version",
      message: `Document version must be ${DOCUMENT_VERSION}, got ${String(document.version)}`,
    });
  }

  const root = document.nodes[document.rootNodeId];
  if (root === undefined) {
    issues.push({
      kind: "missing-root",
      message: `Root node "${document.rootNodeId}" is missing from the document`,
    });
    return issues;
  }
  if (root.primitive !== "root") {
    issues.push({
      kind: "root-primitive",
      nodeId: root.id,
      message: `Root node "${root.id}" must be a "root" primitive, got "${root.primitive}"`,
    });
  }

  const attached = new Set<NodeId>([document.rootNodeId]);
  const parents = new Map<NodeId, NodeId>();
  const claim = (childId: NodeId, parentId: NodeId, list: string): void => {
    if (attached.has(childId)) {
      issues.push({
        kind: "duplicate-parent",
        nodeId: childId,
        message: `Node "${childId}" is referenced by more than one parent (first "${parents.get(childId) ?? "?"}", also "${parentId}" via ${list})`,
      });
      return;
    }
    attached.add(childId);
    parents.set(childId, parentId);
  };

  let motionPins = 0;
  for (const node of Object.values(document.nodes)) {
    const definition = getPrimitive(node.primitive);
    if (definition === undefined) {
      issues.push({
        kind: "unknown-primitive",
        nodeId: node.id,
        message: `Node "${node.id}" uses unknown primitive "${node.primitive}"`,
      });
    }

    for (const childId of node.children ?? []) {
      const child = document.nodes[childId];
      if (child === undefined) {
        issues.push({
          kind: "dangling-child",
          nodeId: node.id,
          ref: childId,
          message: `Node "${node.id}" references missing child "${childId}"`,
        });
        continue;
      }
      if (definition !== undefined) {
        const allowed = definition.allowedChildren;
        if (
          allowed === "none" ||
          (Array.isArray(allowed) && !allowed.includes(child.primitive))
        ) {
          issues.push({
            kind: "child-not-allowed",
            nodeId: node.id,
            ref: childId,
            message: `Primitive "${node.primitive}" does not allow child "${child.primitive}"`,
          });
        }
      }
      claim(childId, node.id, "children");
    }

    for (const [slot, list] of Object.entries(node.slots ?? {})) {
      const spec = editorSlotSpecs(document, node)[slot];
      // A legacy stand-in (an existing section type, see widget-engine
      // `legacy.ts`) carries no slot rules of its own: their truth lives in the
      // section registry, so the slot is tolerated here. A component instance
      // is judged against its definition - unless the definition is missing,
      // which is the inliner's problem, not a slot error.
      const instanceDefinition =
        node.primitive === COMPONENT_INSTANCE_PRIMITIVE
          ? document.nodes[
              typeof node.props["componentId"] === "string"
                ? (node.props["componentId"] as string)
                : ""
            ]
          : undefined;
      const definitionMissing =
        node.primitive === COMPONENT_INSTANCE_PRIMITIVE &&
        instanceDefinition?.primitive !== COMPONENT_DEFINITION_PRIMITIVE;
      if (
        definition !== undefined &&
        definition.legacy !== true &&
        !definitionMissing &&
        spec === undefined
      ) {
        issues.push({
          kind: "slot-unknown",
          nodeId: node.id,
          message: `Primitive "${node.primitive}" has no slot "${slot}"`,
        });
      }
      if (spec !== undefined && spec.max !== null && list.length > spec.max) {
        issues.push({
          kind: "slot-full",
          nodeId: node.id,
          message: `Slot "${slot}" of node "${node.id}" holds ${list.length} nodes (max ${spec.max})`,
        });
      }
      for (const childId of list) {
        const child = document.nodes[childId];
        if (child === undefined) {
          issues.push({
            kind: "dangling-slot",
            nodeId: node.id,
            ref: childId,
            message: `Slot "${slot}" of node "${node.id}" references missing child "${childId}"`,
          });
          continue;
        }
        if (
          spec !== undefined &&
          spec.allowedTypes.length > 0 &&
          !spec.allowedTypes.includes(child.primitive)
        ) {
          issues.push({
            kind: "slot-not-allowed",
            nodeId: node.id,
            ref: childId,
            message: `Slot "${slot}" of node "${node.id}" does not allow "${child.primitive}"`,
          });
        }
        claim(childId, node.id, `slot "${slot}"`);
      }
    }

    for (const name of node.classes ?? []) {
      if (!isClassDefined(document, name)) {
        issues.push({
          kind: "undefined-class",
          nodeId: node.id,
          classId: name,
          message: `Node "${node.id}" uses undefined style class "${name}"`,
        });
      }
    }

    if (node.motion !== undefined) {
      const preset = motionPreset(node.motion.preset);
      if (preset === undefined) {
        issues.push({
          kind: "motion-preset-unknown",
          nodeId: node.id,
          message: `Node "${node.id}" uses unknown motion preset "${node.motion.preset}"`,
        });
      } else if (preset.flags.includes("pins")) {
        motionPins += 1;
      }
    }
  }

  // The hard motion guardrail (ticket 19): at most one pin preset per page.
  // The soft rules (one char-split, reveal length) stay bake warnings — they
  // do not block a write.
  if (motionPins > 1) {
    issues.push({
      kind: "motion-pin-excess",
      message: `Page uses ${motionPins} pin motion presets (max 1)`,
    });
  }

  // One WebGL scene per page (M6): the count follows the render surfaces, not
  // the specs — a disabled spec leaves the poster and renders no canvas.
  const sceneSurfaces = Object.values(document.nodes).filter((node) =>
    webglSceneEnabled({
      type: node.primitive,
      variant: node.variant,
      slots: node.slots,
      motion: node.motion,
    }),
  );
  if (sceneSurfaces.length > 1) {
    issues.push({
      kind: "motion-scene-excess",
      nodeId: sceneSurfaces[sceneSurfaces.length - 1]?.id,
      message: `Page renders ${sceneSurfaces.length} 3D scenes (max 1)`,
    });
  }

  for (const node of Object.values(document.nodes)) {
    if (node.id !== document.rootNodeId && !attached.has(node.id)) {
      issues.push({
        kind: "orphan-node",
        nodeId: node.id,
        message: `Node "${node.id}" (${node.primitive}) is not attached to the document`,
      });
    }
  }

  issues.push(...validateStyleRules(document));
  issues.push(...detectCycles(document));
  return issues;
}

// The rule registry invariants: ids and class names are unique, the kind is
// known, a selector is usable, a context id may not shadow a device stage, and
// a scoped rule points at exactly one living node.
function validateStyleRules(document: EditorDocument): DocumentIssue[] {
  const issues: DocumentIssue[] = [];
  const seenIds = new Set<string>();
  const seenClassNames = new Set<string>();
  const seenScopes = new Set<string>();

  for (const rule of document.styleRules ?? []) {
    if (seenIds.has(rule.id)) {
      issues.push({
        kind: "duplicate-rule-id",
        classId: rule.name,
        message: `Style rule id "${rule.id}" is used more than once`,
      });
    }
    seenIds.add(rule.id);

    if (!(STYLE_RULE_KINDS as readonly string[]).includes(rule.kind)) {
      issues.push({
        kind: "unknown-rule-kind",
        classId: rule.name,
        message: `Style rule "${rule.id}" uses unknown kind "${String(rule.kind)}"`,
      });
    }

    if (rule.kind === "class" && rule.scope === undefined) {
      if (seenClassNames.has(rule.name)) {
        issues.push({
          kind: "duplicate-class-name",
          classId: rule.name,
          message: `Style class "${rule.name}" is defined more than once`,
        });
      }
      seenClassNames.add(rule.name);
    }

    if (
      (rule.kind === "ambient" || rule.kind === "scoped") &&
      !isValidCssSelector(rule.selector)
    ) {
      issues.push({
        kind: "invalid-rule-selector",
        classId: rule.name,
        message: `Style rule "${rule.id}" carries an unusable selector "${rule.selector}"`,
      });
    }

    const reserved = reservedContextIds(rule);
    if (reserved.length > 0) {
      issues.push({
        kind: "reserved-context-id",
        classId: rule.name,
        message: `Style rule "${rule.id}" uses the reserved context id "${reserved[0]}"`,
      });
    }

    if (rule.kind === "scoped") {
      const nodeId = rule.scope?.nodeId;
      if (nodeId === undefined || document.nodes[nodeId] === undefined) {
        issues.push({
          kind: "scoped-rule-without-node",
          classId: rule.name,
          message:
            nodeId === undefined
              ? `Scoped rule "${rule.id}" names no node`
              : `Scoped rule "${rule.id}" points at missing node "${nodeId}"`,
        });
      } else if (seenScopes.has(nodeId)) {
        issues.push({
          kind: "duplicate-scope",
          classId: rule.name,
          message: `Node "${nodeId}" owns more than one scoped style rule`,
        });
      } else {
        seenScopes.add(nodeId);
      }
    }
  }

  return issues;
}

function detectCycles(document: EditorDocument): DocumentIssue[] {
  const issues: DocumentIssue[] = [];
  const done = new Set<NodeId>();
  const guard = new Set<NodeId>();
  const visit = (id: NodeId): void => {
    if (guard.has(id)) {
      issues.push({
        kind: "cycle",
        nodeId: id,
        message: `Node "${id}" is part of a reference cycle`,
      });
      return;
    }
    if (done.has(id)) return;
    const node = document.nodes[id];
    if (node === undefined) return;
    guard.add(id);
    for (const childId of [
      ...(node.children ?? []),
      ...Object.values(node.slots ?? {}).flat(),
    ]) {
      visit(childId);
    }
    guard.delete(id);
    done.add(id);
  };
  visit(document.rootNodeId);
  return issues;
}

export function firstIssueMessage(
  issues: readonly DocumentIssue[],
): string | undefined {
  return issues[0]?.message;
}

export function isConsistent(document: EditorDocument): boolean {
  return validateDocument(document).length === 0;
}

// The profile gate over the document's motion specs (ticket 20/21): intensity
// cap, allowed preset classes and 3D. The editor lists these before it changes
// the site profile (nothing changes silently); the engine blocks them at
// publish (M5). Not part of `validateDocument`: a profile downgrade must not
// freeze unrelated edits — it is a publish/wechsel gate, not a write gate.
export function profileIssues(
  document: EditorDocument,
  profile: MotionProfile,
): DocumentIssue[] {
  const entries = Object.values(document.nodes)
    .filter((node) => node.motion !== undefined)
    .map((node) => ({
      nodeId: node.id,
      preset: node.motion?.preset ?? "",
      ...(node.motion?.intensity === undefined ? {} : { intensity: node.motion.intensity }),
      ...(node.motion?.enabled === undefined ? {} : { enabled: node.motion.enabled }),
    }));
  return motionProfileViolations(profile, entries).map((violation) => ({
    kind: violation.code,
    ...(violation.nodeId === undefined ? {} : { nodeId: violation.nodeId }),
    message: violation.message,
  }));
}
