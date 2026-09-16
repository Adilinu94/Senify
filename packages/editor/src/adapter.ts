import { SenifyError } from "@senify/core";
import { PAGE_ROOT_TYPE, type Node, type NodeId, type NodeTree, type PropValue } from "@senify/section-sdk";

// The Puck data shape (v0.23) the adapter writes: `root`/`content` plus
// `props` per component. We deliberately keep this structural instead of
// importing `@puckeditor/core` types so the adapter stays testable headless
// and the pinned runtime binding lives in one place (`puck.ts`).
export type PuckProps = { id: string } & Record<string, unknown>;

export type PuckComponent = {
  type: string;
  props: PuckProps;
};

export type PuckData = {
  root: { props: PuckProps };
  content: PuckComponent[];
};

export const PUCK_ID_KEY = "id";
export const PUCK_CHILDREN_KEY = "$children";
export const PUCK_META_KEY = "$senify";

// Keys the editor owns inside a Puck prop bag. A section prop with one of
// these names would be silently swallowed by the mapping, so we reject it.
export const PUCK_RESERVED_KEYS: readonly string[] = [
  PUCK_ID_KEY,
  PUCK_CHILDREN_KEY,
  PUCK_META_KEY,
];

export type PuckNodeMeta = {
  variant?: string;
  overrides?: Node["overrides"];
  motion?: Node["motion"];
  locked?: boolean;
  hidden?: boolean;
  slotNames?: string[];
  rootType?: string;
  // Nodes the tree carries but nothing references. Round-tripping only
  // "attached" nodes would silently drop them.
  orphans?: Node[];
};

function requireNode(tree: NodeTree, id: NodeId): Node {
  const node = tree.nodes[id];
  if (!node) {
    throw new SenifyError("not_found", `Node "${id}" does not exist`, {
      field: "nodes",
      suggestion: "The tree references a node that was never added — reload the page.",
    });
  }
  return node;
}

function assertNoReservedKeys(node: Node): void {
  for (const key of Object.keys(node.props)) {
    if (PUCK_RESERVED_KEYS.includes(key)) {
      throw new SenifyError(
        "validation",
        `Prop "${key}" of node "${node.id}" uses an editor-reserved name`,
        {
          field: `props.${key}`,
          suggestion: `Reserved inside Puck props: ${PUCK_RESERVED_KEYS.join(", ")}.`,
        },
      );
    }
  }
  for (const slot of Object.keys(node.slots ?? {})) {
    if (PUCK_RESERVED_KEYS.includes(slot)) {
      throw new SenifyError(
        "validation",
        `Slot "${slot}" of node "${node.id}" uses an editor-reserved name`,
        { field: `slots.${slot}` },
      );
    }
    if (Object.hasOwn(node.props, slot)) {
      throw new SenifyError(
        "validation",
        `Node "${node.id}" has both a prop and a slot named "${slot}"`,
        {
          field: `slots.${slot}`,
          suggestion: "Rename the slot or the prop — Puck stores both in one prop bag.",
        },
      );
    }
  }
}

function metaFor(node: Node, slotNames: string[]): PuckNodeMeta {
  const meta: PuckNodeMeta = {};
  if (node.variant !== undefined) meta.variant = node.variant;
  if (node.overrides !== undefined) meta.overrides = structuredClone(node.overrides);
  if (node.motion !== undefined) meta.motion = structuredClone(node.motion);
  if (node.locked !== undefined) meta.locked = node.locked;
  if (node.hidden !== undefined) meta.hidden = node.hidden;
  if (slotNames.length > 0) meta.slotNames = slotNames;
  return meta;
}

function mapNode(tree: NodeTree, node: Node, reachable: Set<NodeId>): PuckComponent {
  reachable.add(node.id);
  assertNoReservedKeys(node);
  const props: PuckProps = { [PUCK_ID_KEY]: node.id, ...structuredClone(node.props) };
  const slotNames = Object.keys(node.slots ?? {});
  for (const slot of slotNames) {
    const ids = node.slots?.[slot] ?? [];
    props[slot] = ids.map((childId) => mapNode(tree, requireNode(tree, childId), reachable));
  }
  const children = node.children ?? [];
  if (children.length > 0) {
    props[PUCK_CHILDREN_KEY] = children.map((childId) =>
      mapNode(tree, requireNode(tree, childId), reachable),
    );
  }
  props[PUCK_META_KEY] = metaFor(node, slotNames);
  return { type: node.type, props };
}

export function toPuckData(tree: NodeTree): PuckData {
  const root = requireNode(tree, tree.rootNodeId);
  assertNoReservedKeys(root);
  const reachable = new Set<NodeId>([root.id]);
  const content = (root.children ?? []).map((childId) =>
    mapNode(tree, requireNode(tree, childId), reachable),
  );
  const props: PuckProps = { [PUCK_ID_KEY]: root.id, ...structuredClone(root.props) };
  const slotNames = Object.keys(root.slots ?? {});
  for (const slot of slotNames) {
    const ids = root.slots?.[slot] ?? [];
    props[slot] = ids.map((childId) => mapNode(tree, requireNode(tree, childId), reachable));
  }
  const orphans = Object.values(tree.nodes)
    .filter((node) => !reachable.has(node.id))
    .map((node) => structuredClone(node));
  const meta: PuckNodeMeta = {
    ...metaFor(root, slotNames),
    rootType: root.type,
    ...(orphans.length > 0 ? { orphans } : {}),
  };
  props[PUCK_META_KEY] = meta;
  return { root: { props }, content };
}

function readMeta(props: Record<string, unknown>): PuckNodeMeta {
  const raw = props[PUCK_META_KEY];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as PuckNodeMeta;
}

function readId(props: Record<string, unknown>, context: string): string {
  const id = props[PUCK_ID_KEY];
  if (typeof id !== "string" || id.length === 0) {
    throw new SenifyError("validation", `${context} is missing a string "id"`, {
      field: "props.id",
      suggestion: "Puck components need a stable node id in props.id.",
    });
  }
  return id;
}

function applyMeta(node: Node, meta: PuckNodeMeta): void {
  if (meta.variant !== undefined) node.variant = meta.variant;
  if (meta.overrides !== undefined) node.overrides = structuredClone(meta.overrides);
  if (meta.motion !== undefined) node.motion = structuredClone(meta.motion);
  if (meta.locked !== undefined) node.locked = meta.locked;
  if (meta.hidden !== undefined) node.hidden = meta.hidden;
}

function extractProps(
  props: Record<string, unknown>,
  slotNames: readonly string[],
): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const [key, value] of Object.entries(props)) {
    if (PUCK_RESERVED_KEYS.includes(key)) continue;
    if (slotNames.includes(key)) continue;
    out[key] = value as PropValue;
  }
  return out;
}

function toComponentList(value: unknown): PuckComponent[] {
  if (!Array.isArray(value)) return [];
  const list: PuckComponent[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const candidate = entry as { type?: unknown; props?: unknown };
    if (typeof candidate.type !== "string") continue;
    if (candidate.props === null || typeof candidate.props !== "object") continue;
    list.push({
      type: candidate.type,
      props: candidate.props as PuckProps,
    });
  }
  return list;
}

function readComponent(
  component: PuckComponent,
  nodes: Record<NodeId, Node>,
): NodeId {
  const meta = readMeta(component.props);
  const slotNames = meta.slotNames ?? [];
  const id = readId(component.props, `Component "${component.type}"`);
  if (nodes[id]) {
    throw new SenifyError("validation", `Duplicate node id "${id}" in Puck data`, {
      field: "props.id",
    });
  }
  const node: Node = {
    id,
    type: component.type,
    props: extractProps(component.props, slotNames),
  };
  applyMeta(node, meta);
  nodes[id] = node;
  const slots: Record<string, NodeId[]> = {};
  for (const slot of slotNames) {
    slots[slot] = toComponentList(component.props[slot]).map((child) =>
      readComponent(child, nodes),
    );
  }
  if (Object.keys(slots).length > 0) node.slots = slots;
  const children = toComponentList(component.props[PUCK_CHILDREN_KEY]).map((child) =>
    readComponent(child, nodes),
  );
  if (children.length > 0) node.children = children;
  return id;
}

export function fromPuckData(data: PuckData): NodeTree {
  const rootMeta = readMeta(data.root.props);
  const slotNames = rootMeta.slotNames ?? [];
  const rootId = readId(data.root.props, "Puck root");
  const nodes: Record<NodeId, Node> = {};
  const root: Node = {
    id: rootId,
    type: rootMeta.rootType ?? PAGE_ROOT_TYPE,
    props: extractProps(data.root.props, slotNames),
  };
  applyMeta(root, rootMeta);
  nodes[rootId] = root;
  const slots: Record<string, NodeId[]> = {};
  for (const slot of slotNames) {
    slots[slot] = toComponentList(data.root.props[slot]).map((child) =>
      readComponent(child, nodes),
    );
  }
  if (Object.keys(slots).length > 0) root.slots = slots;
  const children = toComponentList(data.content).map((child) =>
    readComponent(child, nodes),
  );
  if (children.length > 0) root.children = children;
  for (const orphan of rootMeta.orphans ?? []) {
    if (orphan && typeof orphan.id === "string" && !nodes[orphan.id]) {
      nodes[orphan.id] = structuredClone(orphan);
    }
  }
  return { rootNodeId: rootId, nodes };
}
