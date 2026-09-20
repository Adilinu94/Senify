import type { NodeTree, Registry } from "@senify/section-sdk";
import { getPrimitive, resolveAllForDevice } from "@senify/widget-engine";
import type { EditorDocument, EditorNode } from "./state/document.ts";

// Explorer tabs (artifacts/24 §3): Ebenen · Seiten (+ Vorlagen-Abschnitt) ·
// Vorlagen · Medien. All four are headless list models — the shell renders
// them, the editor core decides what is in them.

export type ExplorerTab = "layers" | "pages" | "templates" | "media";

export type ExplorerTabSpec = {
  id: ExplorerTab;
  label: string;
};

export const EXPLORER_TABS: readonly ExplorerTabSpec[] = [
  { id: "layers", label: "Ebenen" },
  { id: "pages", label: "Seiten" },
  { id: "templates", label: "Vorlagen" },
  { id: "media", label: "Medien" },
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

export function editorNodeLabel(node: EditorNode): string {
  const name = getPrimitive(node.primitive)?.name ?? node.primitive;
  const snippet = editorNodeSnippet(node);
  return snippet === undefined ? name : `${name} · ${snippet}`;
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
  const visit = (
    nodeId: string,
    depth: number,
    parentId: string | null,
    slot: string | null,
  ): void => {
    const node = document.nodes[nodeId];
    if (node === undefined) return;
    items.push({
      id: node.id,
      primitive: node.primitive,
      label:
        depth === 0 && options?.rootLabel !== undefined
          ? options.rootLabel
          : editorNodeLabel(node),
      depth,
      parentId,
      slot,
      hidden: node.hidden === true,
      hiddenDevices: node.hiddenDevices ?? [],
      locked: node.locked === true,
      motion: node.motion !== undefined,
      hasChildren: editorChildCount(node) > 0,
      childCount: editorChildCount(node),
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
