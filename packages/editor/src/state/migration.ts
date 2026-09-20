// Persistence format v2 and migration (rebuild Phase 0, third slice; O2).
//
// The document carries a `version`. Version 1 is the older section `NodeTree`
// (`type`, `overrides`, no class registry); version 2 is the editor document of
// `document.ts`. Loading is additive: a v1 tree is lifted to v2 (every node
// keeps its values, breakpoint overrides become the `_tablet` / `_mobile` device
// keys, new fields get defaults) and every reference is reindexed before the
// document is trusted. If anything about the load is broken, the caller can hand
// in the last valid document and it is restored instead — the rollback of O2.
//
// v2 -> v1 is deliberately not provided: nothing downstream needs the old shape.

import { SenifyError } from "@senify/core";
import type { NodeTree } from "@senify/section-sdk";
import {
  createClassRule,
  deviceKey,
  normalizeRuleOrder,
  parseStyleRuleRegistry,
  type DeviceValueMap,
  type StyleRule,
} from "@senify/widget-engine";
import {
  DOCUMENT_VERSION,
  type EditorDocument,
  type EditorNode,
  type HiddenDevice,
  type NodeId,
} from "./document.ts";
import { validateDocument } from "./consistency.ts";

export type DocumentLoadStatus = "loaded" | "migrated" | "restored";

export type DocumentLoadResult = {
  document: EditorDocument;
  status: DocumentLoadStatus;
  issues: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function detectDocumentVersion(input: unknown): 1 | 2 | undefined {
  if (!isRecord(input)) return undefined;
  if (input["version"] === DOCUMENT_VERSION) return 2;
  if (
    typeof input["rootNodeId"] === "string" &&
    isRecord(input["nodes"]) &&
    (input["version"] === undefined || input["version"] === 1)
  ) {
    return 1;
  }
  return undefined;
}

// v1 section tree -> v2 editor document. Additive: values, children, slots,
// motion, locked, hidden and the per-breakpoint hidden flags travel (ticket 11:
// `overrides[device].hidden` lifts into `hiddenDevices` instead of being dropped).
export function migrateV1ToV2(tree: NodeTree): EditorDocument {
  const nodes: Record<NodeId, EditorNode> = {};
  for (const [id, node] of Object.entries(tree.nodes)) {
    const props: DeviceValueMap = { ...(node.props ?? {}) };
    const hiddenDevices: HiddenDevice[] = [];
    for (const device of ["tablet", "mobile"] as const) {
      const override = node.overrides?.[device];
      if (override?.hidden === true) hiddenDevices.push(device);
      if (override?.props === undefined) continue;
      for (const [key, value] of Object.entries(override.props)) {
        props[deviceKey(key, device)] = value;
      }
    }
    const migrated: EditorNode = {
      id,
      // The v1 section root (`page`) becomes the v2 `root` primitive.
      primitive: id === tree.rootNodeId ? "root" : node.type,
      props,
    };
    if (node.children !== undefined) migrated.children = [...node.children];
    if (node.slots !== undefined) {
      const slots: Record<string, NodeId[]> = {};
      for (const [slot, list] of Object.entries(node.slots)) slots[slot] = [...list];
      migrated.slots = slots;
    }
    if (node.locked !== undefined) migrated.locked = node.locked;
    if (node.hidden !== undefined) migrated.hidden = node.hidden;
    if (node.variant !== undefined) migrated.variant = node.variant;
    if (hiddenDevices.length > 0) migrated.hiddenDevices = hiddenDevices;
    if (node.motion !== undefined) migrated.motion = structuredClone(node.motion);
    nodes[id] = migrated;
  }
  return {
    version: DOCUMENT_VERSION,
    rootNodeId: tree.rootNodeId,
    nodes,
    styleRules: [],
  };
}

// The style rules of a document, tolerant. Two shapes are read: the canonical
// `styleRules` array (parsed with the same tolerant parser the site registry
// uses) and the older v2 `classes` value bag, lifted additively — one class
// rule per entry, `order` from the insertion order (ADR-0005, ticket 07).
function liftStyleRules(input: unknown): StyleRule[] {
  if (!isRecord(input)) return [];
  if (Array.isArray(input["styleRules"])) {
    return parseStyleRuleRegistry(input["styleRules"]);
  }
  const classes = input["classes"];
  if (!isRecord(classes)) return [];
  const rules: StyleRule[] = [];
  for (const [name, props] of Object.entries(classes)) {
    try {
      rules.push(
        createClassRule({
          id: `class-${name}`,
          name,
          styles: isRecord(props) ? (props as DeviceValueMap) : {},
          order: rules.length,
        }),
      );
    } catch {
      // A corrupt entry drops; the rest of the registry survives.
    }
  }
  return normalizeRuleOrder(rules);
}

// Keeps only what the root reaches, drops dangling references and empty lists —
// the v2 form of the engine's `reindexNodeParents`.
export function reindexDocument(document: EditorDocument): EditorDocument {
  const nodes: Record<NodeId, EditorNode> = {};
  const seen = new Set<NodeId>();
  const visit = (id: NodeId): void => {
    if (seen.has(id)) return;
    const node = document.nodes[id];
    if (node === undefined) return;
    seen.add(id);
    const clone: EditorNode = structuredClone(node);
    const children = (node.children ?? []).filter(
      (child) => document.nodes[child] !== undefined,
    );
    if (node.children !== undefined) {
      if (children.length > 0) clone.children = children;
      else delete clone.children;
    }
    if (node.slots !== undefined) {
      const slots: Record<string, NodeId[]> = {};
      for (const [slot, list] of Object.entries(node.slots)) {
        const kept = list.filter((child) => document.nodes[child] !== undefined);
        if (kept.length > 0) slots[slot] = kept;
      }
      if (Object.keys(slots).length > 0) clone.slots = slots;
      else delete clone.slots;
    }
    if (clone.classes !== undefined && clone.classes.length === 0) delete clone.classes;
    nodes[id] = clone;
    for (const child of children) visit(child);
    for (const list of Object.values(clone.slots ?? {})) {
      for (const child of list) visit(child);
    }
  };
  visit(document.rootNodeId);
  return {
    version: DOCUMENT_VERSION,
    rootNodeId: document.rootNodeId,
    nodes,
    styleRules: liftStyleRules(document),
  };
}

export function serializeDocument(document: EditorDocument): string {
  return JSON.stringify(document);
}

export function parseDocument(text: string): unknown {
  return JSON.parse(text) as unknown;
}

export type LoadOptions = {
  // The last valid document. When the load fails it is returned with the
  // "restored" status instead of throwing.
  fallback?: EditorDocument;
};

export function loadDocument(
  input: unknown,
  options: LoadOptions = {},
): DocumentLoadResult {
  const issues: string[] = [];
  try {
    const version = detectDocumentVersion(input);
    if (version === undefined) {
      throw new SenifyError("validation", "Unknown document format", {
        field: "document",
        suggestion: "Expected a v1 section tree or a v2 editor document.",
      });
    }
    // The reindex is done by `reindexDocument` below, which drops dangling
    // references and unreachable nodes in one pass. It replaces the engine's
    // `reindexNodeParents` here, so this module stays browser-safe (the engine
    // root pulls Node-only deps).
    const raw =
      version === 2
        ? (input as EditorDocument)
        : migrateV1ToV2(input as NodeTree);
    const document = reindexDocument(structuredClone(raw));
    const problems = validateDocument(document);
    const first = problems[0];
    if (first !== undefined) {
      throw new SenifyError("validation", `Document is inconsistent: ${first.message}`, {
        field: "document",
        suggestion: "Fix the tree or load a valid revision.",
      });
    }
    return {
      document,
      status: version === 2 ? "loaded" : "migrated",
      issues,
    };
  } catch (error) {
    if (options.fallback !== undefined) {
      issues.push(error instanceof Error ? error.message : String(error));
      return { document: options.fallback, status: "restored", issues };
    }
    throw error;
  }
}

export function restoreLastValid(
  input: unknown,
  fallback: EditorDocument,
): DocumentLoadResult {
  return loadDocument(input, { fallback });
}
