import { SenifyError } from "@senify/core";
import {
  inlineComponents,
  PAGE_ROOT_TYPE,
  type Node,
  type NodeId,
  type NodeTree,
} from "@senify/section-sdk";
import { enqueueRebakeForPage, type RebakeTrigger } from "./rebake.ts";
import { newNodeId } from "./ids.ts";
import { entryPathFor } from "./paths.ts";
import type { Store } from "./store.ts";
import type { Page, PageTemplate } from "./types.ts";
import type { PutPageTemplateBody } from "./templates-contract.ts";

// Templates & Layouts (artifacts/23 §1): a page marked as a template carries its
// layout choice in page_templates; the resolve chain splices the content into
// the outlets of layout, entry template and page.

export async function putPageTemplate(
  store: Store,
  input: { pageId: string; body: PutPageTemplateBody },
): Promise<{ page: Page; rebake: RebakeTrigger }> {
  const page = await store.getPage(input.pageId);
  const template =
    input.body.template === undefined
      ? page.template
      : normalizeTemplate(input.body.template);
  const layoutId =
    input.body.layoutId === undefined ? page.layoutId : input.body.layoutId;
  if (template?.kind === "collection") {
    const known = await store.listCollections(page.siteId, {
      includeDeprecated: true,
    });
    const ids = new Set(known.map((collection) => collection.id));
    template.collectionIds.forEach((collectionId, index) => {
      if (!ids.has(collectionId)) {
        throw new SenifyError(
          "validation",
          `Collection "${collectionId}" does not exist on this site`,
          {
            field: `template.collectionIds[${index}]`,
            suggestion: `Use one of: ${[...ids].join(", ")}.`,
          },
        );
      }
    });
  }
  if (layoutId !== null) {
    if (layoutId === page.id) {
      throw new SenifyError("validation", "A page cannot be its own layout", {
        field: "layoutId",
      });
    }
    const layout = await store.getPage(layoutId);
    if (layout.siteId !== page.siteId) {
      throw new SenifyError("validation", "The layout belongs to another site", {
        field: "layoutId",
      });
    }
    if (layout.template?.kind !== "layout") {
      throw new SenifyError(
        "validation",
        `Page "${layout.title}" is not a layout template`,
        {
          field: "layoutId",
          suggestion: 'Mark the page as a layout first (template.kind = "layout").',
        },
      );
    }
  }
  const updated = await store.setPageTemplate({
    pageId: page.id,
    template,
    layoutId,
  });
  const { trigger: rebake } = await enqueueRebakeForPage(store, {
    siteId: page.siteId,
    pageId: page.id,
    reason: `template.changed:${page.id}`,
  });
  return { page: updated, rebake };
}

function normalizeTemplate(
  template: PutPageTemplateBody["template"],
): PageTemplate | null {
  if (template === undefined || template === null) return null;
  if (template.kind === "layout") {
    return { kind: "layout", label: template.label ?? "" };
  }
  return {
    kind: "collection",
    collectionIds: [...template.collectionIds],
    priority: template.priority ?? 0,
  };
}

// ------------------------------------------------------------------- resolve

export function findFirstOutlet(tree: NodeTree): NodeId | undefined {
  const queue = [...(tree.nodes[tree.rootNodeId]?.children ?? [])];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) continue;
    const node = tree.nodes[id];
    if (!node) continue;
    if (node.type === "outlet") return id;
    queue.push(...(node.children ?? []));
  }
  return undefined;
}

// Clones the inserted subtree with fresh ids so two spliced trees never share a
// node id (artifacts/23 §"ID-Rekeying") and returns the new top ids. When
// `idMap` is given, it collects the draft-id -> composed-id pairs of the splice
// (ticket 22): the bake needs them to remap `scoped` style rules, which are
// bound to draft node ids, onto the composed tree.
function rekeyChildren(
  target: Record<string, Node>,
  source: NodeTree,
  ids: readonly NodeId[],
  createId: () => NodeId,
  idMap?: Map<NodeId, NodeId>,
): NodeId[] {
  const mapping = new Map<NodeId, NodeId>();
  const walk = (id: NodeId): NodeId | undefined => {
    const node = source.nodes[id];
    if (!node) return undefined;
    const existing = mapping.get(id);
    if (existing !== undefined) return existing;
    const newId = createId();
    mapping.set(id, newId);
    idMap?.set(id, newId);
    target[newId] = { ...node, id: newId };
    const children = (node.children ?? [])
      .map((child) => walk(child))
      .filter((child): child is NodeId => child !== undefined);
    if (node.children !== undefined) target[newId].children = children;
    if (node.slots !== undefined) {
      const slots: Record<string, NodeId[]> = {};
      for (const [name, list] of Object.entries(node.slots)) {
        slots[name] = list
          .map((child) => walk(child))
          .filter((child): child is NodeId => child !== undefined);
      }
      target[newId].slots = slots;
    }
    return newId;
  };
  const out: NodeId[] = [];
  for (const id of ids) {
    const mapped = walk(id);
    if (mapped !== undefined) out.push(mapped);
  }
  return out;
}

function replaceReference(
  nodes: Record<string, Node>,
  id: NodeId,
  replacement: readonly NodeId[],
): boolean {
  for (const node of Object.values(nodes)) {
    if (node.children?.includes(id)) {
      node.children = node.children.flatMap((child) =>
        child === id ? [...replacement] : [child],
      );
      return true;
    }
    if (node.slots !== undefined) {
      for (const [name, list] of Object.entries(node.slots)) {
        if (!list.includes(id)) continue;
        node.slots[name] = list.flatMap((child) =>
          child === id ? [...replacement] : [child],
        );
        return true;
      }
    }
  }
  return false;
}

// The first outlet of `container` is replaced by the children of `inserted`
// (ids rekeyed), which is the splice step of the template chain. `idMap`
// collects the rekeying for callers that bind data to draft node ids (scoped
// style rules, ticket 22).
export function spliceOutlet(input: {
  container: NodeTree;
  outletId: NodeId;
  inserted: NodeTree;
  createId?: () => NodeId;
  idMap?: Map<NodeId, NodeId>;
}): NodeTree {
  const createId = input.createId ?? newNodeId;
  const nodes = structuredClone(input.container.nodes);
  if (nodes[input.outletId] === undefined) return { ...input.container };
  const insertedIds = input.inserted.nodes[input.inserted.rootNodeId]?.children ?? [];
  const rekeyed = rekeyChildren(
    nodes,
    input.inserted,
    insertedIds,
    createId,
    input.idMap,
  );
  const replaced = replaceReference(nodes, input.outletId, rekeyed);
  if (!replaced) return { ...input.container };
  delete nodes[input.outletId];
  return reindexNodeParents({ rootNodeId: input.container.rootNodeId, nodes });
}

function articleTree(body: string | null, createId: () => NodeId): NodeTree {
  const root = createId();
  const content = createId();
  return {
    rootNodeId: root,
    nodes: {
      [root]: { id: root, type: PAGE_ROOT_TYPE, props: {}, children: [content] },
      [content]: { id: content, type: "content", props: { body: body ?? "" } },
    },
  };
}

function emptyTree(createId: () => NodeId): NodeTree {
  const root = createId();
  return { rootNodeId: root, nodes: { [root]: { id: root, type: PAGE_ROOT_TYPE, props: {} } } };
}

export type ComposeInput = {
  // Layout template page (outermost), entry template and page content: exactly
  // one of page/template supplies the inner content.
  layout: NodeTree | null;
  template: NodeTree | null;
  page: NodeTree | null;
  article: string | null;
  createId?: () => NodeId;
  // Draft-id -> composed-id pairs of every splice step (ticket 22). A caller
  // that compiles scoped style rules against the result needs the map; a
  // composition without layout keeps the draft ids and leaves the map empty.
  idMap?: Map<NodeId, NodeId>;
};

// Resolve-Reihenfolge Layout → Entry-Template → Inhalt (artifacts/23 §1): a
// template without outlet counts as unfinished and is ignored (no error).
//
// Components (ticket 04) are inlined as the last step: the page, the template
// and the layout may define them, instances may sit anywhere, and only after
// the composition is the tree complete. A tree that cannot be resolved (unknown
// component, cycle) is a publish error, never a silent fallback — the same
// derivation the canvas runs (`inlineComponents`), so both sides agree.
export function composePageTree(input: ComposeInput): NodeTree {
  const createId = input.createId ?? newNodeId;
  const idMap = input.idMap;
  let content: NodeTree;
  if (input.template !== null) {
    const outlet = findFirstOutlet(input.template);
    content =
      outlet === undefined
        ? emptyTree(createId)
        : spliceOutlet({
            container: input.template,
            outletId: outlet,
            inserted: articleTree(input.article, createId),
            createId,
            ...(idMap === undefined ? {} : { idMap }),
          });
  } else if (input.page !== null) {
    content = input.page;
  } else {
    content = emptyTree(createId);
  }
  let composed: NodeTree;
  if (input.layout !== null) {
    const outlet = findFirstOutlet(input.layout);
    composed =
      outlet === undefined
        ? content
        : spliceOutlet({
            container: input.layout,
            outletId: outlet,
            inserted: content,
            createId,
            ...(idMap === undefined ? {} : { idMap }),
          });
  } else {
    composed = content;
  }
  const inlined = inlineComponents(composed);
  if (inlined.problems.length > 0) {
    const first = inlined.problems[0]!;
    throw new SenifyError("validation", first.message, {
      field: "tree",
      suggestion:
        "Fix the component definition or the instance before publishing (the canvas shows a stub for it).",
    });
  }
  // Scoped style rules of a definition follow its copies: the first copy per
  // node rides the existing draft->composed map (ticket 22). More than one
  // instance per definition needs the multi-target remap (ticket 04, slice 2).
  if (idMap !== undefined) {
    for (const [original, copies] of inlined.copies) {
      if (idMap.has(original)) continue;
      const first = copies[0];
      if (first !== undefined) idMap.set(original, first);
    }
  }
  return inlined.tree;
}

// After a merge every reference points at an existing node and unreachable
// nodes are gone (the reindexNodeParents equivalent of artifacts/23 §1).
export function reindexNodeParents(tree: NodeTree): NodeTree {
  const nodes: Record<string, Node> = {};
  const seen = new Set<NodeId>();
  const visit = (id: NodeId): void => {
    if (seen.has(id)) return;
    const node = tree.nodes[id];
    if (node === undefined) return;
    seen.add(id);
    const clone: Node = { ...node };
    const children = (node.children ?? []).filter(
      (child) => tree.nodes[child] !== undefined,
    );
    if (node.children !== undefined) clone.children = children;
    if (node.slots !== undefined) {
      const slots: Record<string, NodeId[]> = {};
      for (const [name, list] of Object.entries(node.slots)) {
        const kept = list.filter((child) => tree.nodes[child] !== undefined);
        if (kept.length > 0) slots[name] = kept;
      }
      if (Object.keys(slots).length > 0) clone.slots = slots;
      else delete clone.slots;
    }
    nodes[id] = clone;
    for (const child of children) visit(child);
    for (const list of Object.values(clone.slots ?? {})) {
      for (const child of list) visit(child);
    }
  };
  visit(tree.rootNodeId);
  return { rootNodeId: tree.rootNodeId, nodes };
}

// ---------------------------------------------------------------- selection

export function findLayout(
  pages: readonly Page[],
  layoutId: string | null,
  defaultLabel = "standard",
): Page | undefined {
  const layouts = pages.filter((page) => page.template?.kind === "layout");
  if (layoutId !== null) {
    return layouts.find((page) => page.id === layoutId);
  }
  // Default layout: the configured label (Standardwert), else the first
  // declared layout.
  return (
    layouts.find(
      (page) => page.title.toLowerCase() === defaultLabel.toLowerCase(),
    ) ?? layouts[0]
  );
}

export function findEntryTemplate(
  pages: readonly Page[],
  collectionId: string,
): Page | undefined {
  return pages
    .filter(
      (page) =>
        page.template?.kind === "collection" &&
        page.template.collectionIds.includes(collectionId),
    )
    .sort((a, b) => {
      const aPriority =
        a.template?.kind === "collection" ? a.template.priority : 0;
      const bPriority =
        b.template?.kind === "collection" ? b.template.priority : 0;
      return bPriority - aPriority || a.createdAt.localeCompare(b.createdAt);
    })[0];
}

export { entryPathFor };
