import type { NodeTree, Registry } from "@senify/section-sdk";
import {
  COMPONENT_DEFINITION_PRIMITIVE,
  COMPONENT_INSTANCE_PRIMITIVE,
  COMPONENT_SLOT_PRIMITIVE,
  getPrimitive,
  resolveAllForDevice,
} from "@senify/widget-engine";
import type { EditorDocument, EditorNode } from "./state/document.ts";
import {
  componentDriftOf,
  definitionVersionOf,
  editorOverrides,
} from "./state/components.ts";

// Explorer tabs (artifacts/24 §3): Ebenen · Seiten (+ Vorlagen-Abschnitt) ·
// Vorlagen · Medien. All four are headless list models — the shell renders
// them, the editor core decides what is in them.

export type ExplorerTab = "layers" | "pages" | "templates" | "media" | "library";

export type ExplorerTabSpec = {
  id: ExplorerTab;
  label: string;
};

export const EXPLORER_TABS: readonly ExplorerTabSpec[] = [
  { id: "layers", label: "Ebenen" },
  { id: "pages", label: "Seiten" },
  { id: "templates", label: "Vorlagen" },
  { id: "media", label: "Medien" },
  { id: "library", label: "Bibliothek" },
];

export type LayerItem = {
  id: string;
  type: string;
  label: string;
  depth: number;
  parentId: string | null;
  slot: string | null;
  hidden: boolean;
  locked: boolean;
  variant: string | undefined;
  childCount: number;
  // The node carries a motion spec (ticket 19/M3): the explorer shows a badge.
  motion: boolean;
};

export function layerLabel(type: string, registry?: Registry): string {
  if (registry?.has(type)) return registry.get(type).title;
  return type;
}

/* ------------------------------------------------------- editor document (v2)
 * The rebuild explorer reads the v2 editor document, not the section tree. The
 * model stays the same shape (depth-first, children then slots) so the panel
 * can render both paths; only the label source differs: the primitive catalog
 * names the type, the content props give the readable suffix ("Überschrift ·
 * Hallo Welt"). */

export type EditorLayerItem = {
  id: string;
  primitive: string;
  label: string;
  depth: number;
  parentId: string | null;
  slot: string | null;
  hidden: boolean;
  hiddenDevices: readonly string[];
  locked: boolean;
  motion: boolean;
  hasChildren: boolean;
  childCount: number;
  // A component instance whose pin is behind its definition's version: the
  // explorer shows the pinned version as a badge (ticket 04, slice 3).
  drift?: { pinned: number; current: number };
};

const LABEL_TEXT_KEYS = ["text", "headline", "label", "html", "eyebrow"] as const;

// A short, plain-text snippet of the node's own content, for the tree label.
export function editorNodeSnippet(node: EditorNode, limit = 32): string | undefined {
  const props = resolveAllForDevice(node.props, "desktop");
  for (const key of LABEL_TEXT_KEYS) {
    const value = props[key];
    if (typeof value !== "string") continue;
    const plain = value
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (plain === "") continue;
    return plain.length > limit ? `${plain.slice(0, limit - 1)}…` : plain;
  }
  return undefined;
}

export function editorNodeLabel(node: EditorNode, document?: EditorDocument): string {
  // The reserved component types (ticket 04) carry their name in `name` (a
  // definition, a slot) or read it from the definition they point at (an
  // instance); the catalog stand-in only says "Komponente".
  if (node.primitive === COMPONENT_DEFINITION_PRIMITIVE) {
    const name = typeof node.props["name"] === "string" ? node.props["name"] : node.id;
    return `Komponente · ${name}`;
  }
  if (node.primitive === COMPONENT_INSTANCE_PRIMITIVE) {
    const componentId = node.props["componentId"];
    const definition =
      typeof componentId === "string" ? document?.nodes[componentId] : undefined;
    const name =
      typeof definition?.props["name"] === "string"
        ? definition.props["name"]
        : typeof componentId === "string"
          ? componentId
          : "";
    return name === "" ? "Instanz" : `Instanz · ${name}`;
  }
  if (node.primitive === COMPONENT_SLOT_PRIMITIVE) {
    const name = typeof node.props["name"] === "string" ? node.props["name"] : node.id;
    return `Slot · ${name}`;
  }
  if (node.primitive === "payload") {
    const label = typeof node.props["label"] === "string" ? node.props["label"] : "Fremd-Code";
    return label.includes("Platte") ? `Platte · ${label.replace(/^Platte · /, "")}` : `Island · ${label}`;
  }
  const name = getPrimitive(node.primitive)?.name ?? node.primitive;
  const snippet = editorNodeSnippet(node);
  return snippet === undefined ? name : `${name} · ${snippet}`;
}

/* --------------------------------------------------- components (ticket 04)
 * The headless models of the components UI: the tab list (definitions with
 * their instance count) and the context menu entries per node kind. The panel
 * renders them, the shell fills the tab; both stay free of DOM. */

export type ComponentListItem = {
  id: string;
  name: string;
  instances: number;
  version: number;
  // Instances that still pin an older version.
  drift: number;
};

// Every definition in the document with the number of instances pointing at
// it. Definitions live as ordinary nodes under the root; a stale instance
// (definition removed) counts nowhere.
export function buildComponentList(document: EditorDocument): ComponentListItem[] {
  const counts = new Map<string, number>();
  for (const node of Object.values(document.nodes)) {
    if (node.primitive !== COMPONENT_INSTANCE_PRIMITIVE) continue;
    const componentId = node.props["componentId"];
    if (typeof componentId !== "string") continue;
    counts.set(componentId, (counts.get(componentId) ?? 0) + 1);
  }
  const drift = new Map<string, number>();
  for (const entry of componentDriftOf(document)) {
    drift.set(entry.componentId, (drift.get(entry.componentId) ?? 0) + 1);
  }
  return Object.values(document.nodes)
    .filter((node) => node.primitive === COMPONENT_DEFINITION_PRIMITIVE)
    .map((node) => ({
      id: node.id,
      name: typeof node.props["name"] === "string" ? node.props["name"] : node.id,
      instances: counts.get(node.id) ?? 0,
      version: definitionVersionOf(document, node.id) ?? 1,
      drift: drift.get(node.id) ?? 0,
    }));
}

export type EditorMenuEntry = {
  id: string;
  label: string;
  hint?: string;
  danger?: boolean;
};

// The context menu of one node: the common layer actions plus the component
// actions that fit the node kind. A definition can be instantiated, an
// instance can be detached, an ordinary node can become a definition; the
// root and a slot placeholder offer none of them. Labels are resolved here
// (hidden/locked depend on the node state), the panel only renders.
export function editorMenuItems(
  document: EditorDocument,
  nodeId: string,
): EditorMenuEntry[] {
  const node = document.nodes[nodeId];
  if (node === undefined) return [];
  const entries: EditorMenuEntry[] = [
    { id: "rename", label: "Umbenennen", hint: "F2" },
    { id: "duplicate", label: "Duplizieren", hint: "Cmd+D" },
    { id: "copy", label: "Kopieren", hint: "Cmd+C" },
    { id: "paste", label: "Einfügen", hint: "Cmd+V" },
    { id: "wrap", label: "In Container einwickeln" },
    { id: "up", label: "Nach oben" },
    { id: "down", label: "Nach unten" },
    { id: "hidden", label: node.hidden === true ? "Einblenden" : "Ausblenden" },
    { id: "locked", label: node.locked === true ? "Entsperren" : "Sperren" },
    { id: "reveal", label: "Im Navigator zeigen" },
    { id: "delete", label: "Löschen", hint: "Entf", danger: true },
  ];
  const isDefinition = node.primitive === COMPONENT_DEFINITION_PRIMITIVE;
  const isInstance = node.primitive === COMPONENT_INSTANCE_PRIMITIVE;
  const isSlot = node.primitive === COMPONENT_SLOT_PRIMITIVE;
  if (isDefinition) {
    const version = definitionVersionOf(document, nodeId) ?? 1;
    const drift = componentDriftOf(document, nodeId);
    entries.splice(
      1,
      0,
      { id: "component-insert", label: "Instanz einfügen" },
      {
        id: "component-bump",
        label: "Version erhöhen",
        hint: `v${version} → v${version + 1}`,
      },
      ...(drift.length > 0
        ? [
            {
              id: "component-update",
              label: "Instanzen aktualisieren",
              hint: drift.length === 1 ? "1 Instanz" : `${drift.length} Instanzen`,
            },
          ]
        : []),
    );
  } else if (isInstance) {
    entries.splice(1, 0, { id: "component-detach", label: "Komponente auflösen" });
    // The variant lever (ticket 04): only an instance with own values has
    // something to extract - a bare instance offers no entry.
    if (Object.keys(editorOverrides(node)).length > 0) {
      entries.splice(1, 0, {
        id: "component-save-variant",
        label: "Als Variante speichern",
      });
    }
  } else if (!isSlot && nodeId !== document.rootNodeId) {
    entries.splice(1, 0, { id: "component-create", label: "Als Komponente anlegen" });
  }
  return entries;
}

function editorChildCount(node: EditorNode): number {
  const slots = Object.values(node.slots ?? {}).reduce((sum, list) => sum + list.length, 0);
  return (node.children?.length ?? 0) + slots;
}

export function buildEditorLayerList(
  document: EditorDocument,
  options?: { rootLabel?: string },
): EditorLayerItem[] {
  const items: EditorLayerItem[] = [];
  const drift = new Map(
    componentDriftOf(document).map((entry) => [entry.instanceId, entry]),
  );
  const visit = (
    nodeId: string,
    depth: number,
    parentId: string | null,
    slot: string | null,
  ): void => {
    const node = document.nodes[nodeId];
    if (node === undefined) return;
    const entry = drift.get(node.id);
    items.push({
      id: node.id,
      primitive: node.primitive,
      label:
        depth === 0 && options?.rootLabel !== undefined
          ? options.rootLabel
          : editorNodeLabel(node, document),
      depth,
      parentId,
      slot,
      hidden: node.hidden === true,
      hiddenDevices: node.hiddenDevices ?? [],
      locked: node.locked === true,
      motion: node.motion !== undefined,
      hasChildren: editorChildCount(node) > 0,
      childCount: editorChildCount(node),
      ...(entry === undefined
        ? {}
        : { drift: { pinned: entry.pinned, current: entry.current } }),
    });
    for (const childId of node.children ?? []) visit(childId, depth + 1, node.id, null);
    for (const [slotName, list] of Object.entries(node.slots ?? {})) {
      for (const childId of list) visit(childId, depth + 1, node.id, slotName);
    }
  };
  visit(document.rootNodeId, 0, null, null);
  return items;
}

function childCount(tree: NodeTree, nodeId: string): number {
  const node = tree.nodes[nodeId];
  if (!node) return 0;
  const slots = Object.values(node.slots ?? {}).reduce(
    (sum, list) => sum + list.length,
    0,
  );
  return (node.children?.length ?? 0) + slots;
}

// Depth-first, in render order: children first, then slots.
export function buildLayerList(
  tree: NodeTree,
  options?: { registry?: Registry; rootLabel?: string },
): LayerItem[] {
  const root = tree.nodes[tree.rootNodeId];
  if (!root) return [];
  const items: LayerItem[] = [];
  const visit = (nodeId: string, depth: number, parentId: string | null, slot: string | null): void => {
    const node = tree.nodes[nodeId];
    if (!node) return;
    items.push({
      id: node.id,
      type: node.type,
      label:
        depth === 0 && options?.rootLabel
          ? options.rootLabel
          : layerLabel(node.type, options?.registry),
      depth,
      parentId,
      slot,
      hidden: node.hidden === true,
      locked: node.locked === true,
      variant: node.variant,
      childCount: childCount(tree, node.id),
      motion: node.motion !== undefined,
    });
    for (const childId of node.children ?? []) {
      visit(childId, depth + 1, node.id, null);
    }
    for (const [slotName, list] of Object.entries(node.slots ?? {})) {
      for (const childId of list) {
        visit(childId, depth + 1, node.id, slotName);
      }
    }
  };
  visit(root.id, 0, null, null);
  return items;
}

export type PageItem = {
  id: string;
  title: string;
  path: string;
  active: boolean;
};

export function buildPageList(
  pages: readonly { id: string; title: string; path: string }[],
  activePageId: string | null,
): PageItem[] {
  return pages.map((page) => ({
    id: page.id,
    title: page.title,
    path: page.path,
    active: page.id === activePageId,
  }));
}

export type TemplateKind = "layout" | "entry";

export type TemplateItem = {
  id: string;
  kind: TemplateKind;
  label: string;
  badge: string;
  active: boolean;
};

// Templates live as a section of the pages tab (artifacts/23 §1), not as its
// own route.
export function buildTemplatesSection(
  templates: readonly { id: string; kind: TemplateKind; label: string }[],
  activeTemplateId: string | null,
): TemplateItem[] {
  return templates.map((template) => ({
    id: template.id,
    kind: template.kind,
    label: template.label,
    badge: template.kind === "layout" ? "Layout" : "Entry",
    active: template.id === activeTemplateId,
  }));
}

export type MediaItem = {
  id: string;
  name: string;
  kind: "image" | "video" | "file";
  folders: readonly string[];
  tags: readonly string[];
  createdAt?: number;
};

export type MediaQuery = {
  query?: string;
  folders?: readonly string[];
  tags?: readonly string[];
  sort?: "name" | "newest";
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

// Medien-Fenster (Ticket 08): suchen, filtern, sortieren, einsetzen.
export function filterMedia(
  items: readonly MediaItem[],
  query?: MediaQuery,
): MediaItem[] {
  const text = normalize(query?.query ?? "");
  const folders = (query?.folders ?? []).map(normalize);
  const tags = (query?.tags ?? []).map(normalize);
  const filtered = items.filter((item) => {
    if (text !== "" && !normalize(item.name).includes(text)) {
      const inTags = item.tags.some((tag) => normalize(tag).includes(text));
      if (!inTags) return false;
    }
    if (folders.length > 0) {
      const itemFolders = item.folders.map(normalize);
      if (!folders.every((folder) => itemFolders.includes(folder))) return false;
    }
    if (tags.length > 0) {
      const itemTags = item.tags.map(normalize);
      if (!tags.every((tag) => itemTags.includes(tag))) return false;
    }
    return true;
  });
  const sort = query?.sort ?? "name";
  return [...filtered].sort((a, b) => {
    if (sort === "newest") return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    return a.name.localeCompare(b.name, "de");
  });
}

export function buildMediaTab(
  items: readonly MediaItem[],
  query?: MediaQuery,
): { items: MediaItem[]; total: number; folders: string[]; tags: string[] } {
  const folders = [...new Set(items.flatMap((item) => [...item.folders]))].sort();
  const tags = [...new Set(items.flatMap((item) => [...item.tags]))].sort();
  const filtered = filterMedia(items, query);
  return { items: filtered, total: items.length, folders, tags };
}
