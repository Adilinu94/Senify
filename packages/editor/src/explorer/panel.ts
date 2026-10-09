// Explorer panel (ticket 03, slice 1): the layer tree of the rebuild editor.
//
// The tree is a projection of the session store, like canvas and inspector:
// it reads the v2 document (`buildEditorLayerList`), renders it as an
// accessible tree (`role=tree/treeitem`, `aria-level/selected/expanded`,
// roving tabindex) and writes every action through the store's single gate.
//
// Keyboard (E7): arrows move/expand/collapse, Home/End jump, Enter/Space
// selects, F2 renames the node's content, Delete removes, Shift+F10 opens the
// context menu, Escape closes it and returns the focus to the tree. The menu
// carries duplicate, move up/down, hide/show, lock/unlock and delete; every
// entry is also reachable by keyboard.

import { SenifyError } from "@senify/core";
import {
  COMPONENT_DEFINITION_PRIMITIVE,
  COMPONENT_INSTANCE_PRIMITIVE,
  COMPONENT_SLOT_PRIMITIVE,
  getPrimitive,
} from "@senify/widget-engine";
import { requireDocument, getWindow, type DomDocument, type DomElement, type DomEvent } from "../dom.ts";
import { EDITOR_ROOT_ATTRIBUTE } from "../ui/tokens.ts";
import { EditorStore } from "../state/store.ts";
import { copyNode, pasteNode, wrapNode } from "../state/clipboard.ts";
import {
  bumpComponentVersion,
  componentDriftIn,
  createComponent,
  createVariantFromOverrides,
  definitionVariantNames,
  detachComponent,
  instantiateComponent,
  suggestVariantName,
  updateComponentInstances,
} from "../state/components.ts";
import { locateParent } from "../state/document.ts";
import {
  dropPositionFor,
  isContainer,
  resolveMoveDrop,
} from "../canvas/dnd.ts";
import {
  buildEditorLayerList,
  editorMenuItems,
  editorNodeSnippet,
  type EditorLayerItem,
} from "../explorer.ts";
import { ensureExplorerStyles } from "./styles.ts";

export type ExplorerTabItem = {
  id: string;
  label: string;
  hint?: string;
  active?: boolean;
};

// A site tab next to the layer tree (ticket 03 point 1): pages and media come
// from the shell, so the panel stays free of engine calls. Templates and
// components follow once their data sources exist (O14).
export type ExplorerTabSource = {
  id: string;
  label: string;
  items: () => ExplorerTabItem[];
  onActivate?: (id: string) => void;
  empty?: string;
  // Eigener Body statt der Liste (Elemente-Panel, E4): liefert immer dasselbe
  // Element, damit Suchtext und Fokus ein Neuzeichnen des Explorers ueberstehen.
  element?: (doc: DomDocument) => DomElement;
};

export type ExplorerOptions = {
  host: DomElement;
  store: EditorStore;
  tabs?: readonly ExplorerTabSource[];
  onMessage?: (message: string | null) => void;
  // Asks for a name (variant creation, ticket 04). The shell passes the
  // browser's prompt; a test double may leave it out, then the action reports
  // instead of asking.
  prompt?: (message: string, initial: string) => string | null;
};

export type ExplorerInstance = {
  element: DomElement;
  refresh(): void;
  focused(): string | null;
  focus(nodeId: string | null): void;
  openContextMenu(nodeId: string): void;
  menuOpen(): boolean;
  setTab(id: string): void;
  activeTab(): string;
  destroy(): void;
};

type ElementSpec = {
  className?: string;
  text?: string;
  data?: Record<string, string>;
  attributes?: Record<string, string>;
};

function h(doc: DomDocument, tag: string, spec: ElementSpec = {}): DomElement {
  const element = doc.createElement(tag);
  if (spec.className !== undefined) element.className = spec.className;
  if (spec.text !== undefined) element.textContent = spec.text;
  for (const [name, value] of Object.entries(spec.data ?? {})) {
    element.setAttribute(`data-${name}`, value);
  }
  for (const [name, value] of Object.entries(spec.attributes ?? {})) {
    element.setAttribute(name, value);
  }
  return element;
}

function icon(doc: DomDocument, name: string, size = 12): DomElement {
  return h(doc, "span", { className: `ic ic--${name} ic--${size}`, attributes: { "aria-hidden": "true" } });
}

const TEXT_PROP_KEYS = ["text", "headline", "label", "html", "eyebrow"] as const;

function messageOf(error: unknown): string {
  if (error instanceof SenifyError) return error.message;
  if (error instanceof Error) return error.message;
  return "Aktion fehlgeschlagen";
}

export function createExplorer(options: ExplorerOptions): ExplorerInstance {
  const doc = requireDocument();
  ensureExplorerStyles(doc);
  const root = h(doc, "section", { className: "senify-explorer", attributes: { "aria-label": "Ebenen" } });
  root.setAttribute(EDITOR_ROOT_ATTRIBUTE, "true");
  const header = h(doc, "div", { className: "senify-explorer__header" });
  header.appendChild(h(doc, "span", { className: "senify-explorer__title", text: "Ebenen" }));
  const countEl = h(doc, "span", { className: "senify-explorer__count" });
  header.appendChild(countEl);
  root.appendChild(header);
  const tabRow = h(doc, "div", {
    className: "senify-explorer__tabs",
    attributes: { role: "tablist", "aria-label": "Bereiche" },
  });
  if ((options.tabs ?? []).length > 0) root.appendChild(tabRow);
  const body = h(doc, "div", { className: "senify-explorer__body" });
  root.appendChild(body);

  const expanded = new Set<string>();
  let focusedId: string | null = null;
  let renaming: { id: string; key: string } | null = null;
  let menu: { id: string; left: number; top: number } | null = null;
  let activeTab = "layers";
  // Das eigene Body-Element eines Reiters, solange es im Body steht.
  let customShown: DomElement | null = null;
  let unsubscribe: (() => void) | null = null;
  let dragId: string | null = null;
  let dropRow: DomElement | null = null;

  // The root starts open (the tree is useless collapsed) and every ancestor of
  // the focused node is expanded, so the selection is always visible.
  function ensureVisible(id: string): void {
    expanded.add(options.store.document.rootNodeId);
    let current: string | undefined = id;
    while (current !== undefined) {
      const located = locateParent(options.store.document, current);
      if (located === undefined) return;
      expanded.add(located.parent.nodeId);
      current = located.parent.nodeId;
    }
  }

  const report = (message: string | null): void => options.onMessage?.(message);

  function apply(mutation: unknown, label: string): boolean {
    try {
      options.store.apply(mutation, { label });
      report(null);
      return true;
    } catch (error) {
      report(messageOf(error));
      return false;
    }
  }

  // Component operations throw on an inconsistent document; the panel turns
  // that into a status message instead of losing the action silently.
  function runComponentOp(run: () => string | null, failure: string): string | null {
    try {
      const result = run();
      if (result === null) report(failure);
      return result;
    } catch (error) {
      report(messageOf(error));
      return null;
    }
  }

  function items(): EditorLayerItem[] {
    return buildEditorLayerList(options.store.document);
  }

  function visibleItems(): EditorLayerItem[] {
    const all = items();
    const visible: EditorLayerItem[] = [];
    const stack: EditorLayerItem[] = [];
    for (const item of all) {
      while (stack.length > 0 && (stack[stack.length - 1]?.depth ?? -1) >= item.depth) {
        stack.pop();
      }
      const parent = stack[stack.length - 1];
      const parentExpanded =
        parent === undefined || expanded.has(parent.id);
      stack.push(item);
      if (parentExpanded) visible.push(item);
    }
    return visible;
  }

  function selectedId(): string | null {
    return options.store.selection.focus ?? options.store.selection.selected[0] ?? null;
  }

  function selectNode(id: string, options2: { focus?: boolean } = {}): void {
    focusedId = id;
    ensureVisible(id);
    options.store.select(id);
    if (options2.focus !== false) focusTreeItem(id);
  }

  function focusTreeItem(id: string): void {
    const row = body.querySelector(`[data-node="${id}"]`);
    row?.focus?.();
  }

  function textKeyOf(id: string): string | undefined {
    const node = options.store.document.nodes[id];
    if (node === undefined) return undefined;
    // A definition and a slot carry their display name in `name`; an instance
    // has none of its own (it shows the definition's name).
    if (
      node.primitive === COMPONENT_DEFINITION_PRIMITIVE ||
      node.primitive === COMPONENT_SLOT_PRIMITIVE
    ) {
      return "name";
    }
    if (node.primitive === COMPONENT_INSTANCE_PRIMITIVE) return undefined;
    const definition = getPrimitive(node.primitive);
    if (definition === undefined) return undefined;
    for (const key of TEXT_PROP_KEYS) {
      if (definition.controls.some((control) => control.key === key)) return key;
    }
    return undefined;
  }

  /* ------------------------------------------------------------ context menu */

  function closeMenu(): void {
    if (menu === null) return;
    const id = menu.id;
    menu = null;
    doc.removeEventListener("keydown", onMenuKeydown);
    render();
    focusTreeItem(id);
  }

  // The menu closes on Escape no matter where the focus sits — the tree row,
  // the first menu entry or the document (a re-render may drop the focus).
  const onMenuKeydown = (event: DomEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault?.();
    closeMenu();
  };

  function openMenu(id: string, position?: { left: number; top: number }): void {
    focusedId = id;
    options.store.select(id);
    const item = body.querySelector(`[data-node="${id}"]`);
    const box = item?.getBoundingClientRect?.();
    menu = {
      id,
      left: position?.left ?? box?.left ?? 0,
      top: position?.top ?? (box === undefined ? 0 : box.top + 24),
    };
    doc.addEventListener("keydown", onMenuKeydown);
    render();
  }

  function move(id: string, delta: -1 | 1): void {
    const located = locateParent(options.store.document, id);
    if (located === undefined) {
      report("Die Wurzel lässt sich nicht verschieben.");
      return;
    }
    const parent = options.store.document.nodes[located.parent.nodeId];
    const list =
      located.parent.slot === undefined
        ? (parent?.children ?? [])
        : (parent?.slots?.[located.parent.slot] ?? []);
    const index = located.index + delta;
    if (index < 0 || index >= list.length) return;
    apply(
      {
        op: "moveNode",
        id,
        target: located.parent,
        index,
      },
      "Ebene verschieben",
    );
  }

  function runMenuAction(id: string, action: string): void {
    const node = options.store.document.nodes[id];
    if (node === undefined) return;
    switch (action) {
      case "rename": {
        if (node.primitive === COMPONENT_INSTANCE_PRIMITIVE) {
          report("Eine Instanz trägt den Namen ihrer Komponente.");
          closeMenu();
          return;
        }
        const key = textKeyOf(id);
        if (key === undefined) {
          report("Dieser Baustein hat keine Beschriftung.");
          closeMenu();
          return;
        }
        renaming = { id, key };
        menu = null;
        render();
        return;
      }
      case "duplicate":
        apply({ op: "duplicateNode", id }, "Ebene duplizieren");
        break;
      case "copy":
        if (copyNode(options.store, id)) report("Ebene kopiert");
        else report("Die Wurzel lässt sich nicht kopieren.");
        break;
      case "paste": {
        const pasted = pasteNode(options.store, id);
        if (pasted === null) {
          report("Die Zwischenablage ist leer oder die Quelle fehlt.");
          break;
        }
        focusedId = pasted;
        options.store.select(pasted);
        report(null);
        break;
      }
      case "wrap": {
        const container = wrapNode(options.store, id);
        if (container === null) report("Einwickeln ist hier nicht möglich.");
        else {
          focusedId = container;
          options.store.select(container);
          report(null);
        }
        break;
      }
      case "reveal":
        focusedId = id;
        ensureVisible(id);
        render();
        focusTreeItem(id);
        return;
      case "up":
        move(id, -1);
        break;
      case "down":
        move(id, 1);
        break;
      case "hidden":
        apply(
          { op: "setNodeMeta", id, meta: { hidden: node.hidden !== true } },
          node.hidden === true ? "Ebene einblenden" : "Ebene ausblenden",
        );
        break;
      case "locked":
        apply(
          { op: "setNodeMeta", id, meta: { locked: node.locked !== true } },
          node.locked === true ? "Ebene entsperren" : "Ebene sperren",
        );
        break;
      case "delete":
        apply({ op: "deleteNode", id }, "Ebene löschen");
        break;
      // Components (ticket 04): the node becomes a definition and an instance
      // takes its place; the definition is selected so F2 can name it. The
      // instance detaches back into a real subtree; a definition drops a new
      // instance next to itself.
      case "component-create": {
        const definitionId = runComponentOp(
          () => createComponent(options.store, id),
          "Hier lässt sich keine Komponente anlegen.",
        );
        if (definitionId === null) break;
        focusedId = definitionId;
        options.store.select(definitionId);
        report("Komponente angelegt - F2 benennt sie um.");
        break;
      }
      case "component-detach": {
        const detached = runComponentOp(
          () => detachComponent(options.store, id),
          "Die Instanz lässt sich nicht auflösen.",
        );
        if (detached === null) break;
        focusedId = detached;
        options.store.select(detached);
        report(null);
        break;
      }
      // The variant lever (ticket 04): the instance's own values become a
      // named overlay of the definition, the instance activates the variant
      // instead of carrying the overrides. The name comes from the prompt
      // (default: the first free "Variante N"); renaming and deleting live in
      // the inspector of the definition.
      case "component-save-variant": {
        const componentId = node.props["componentId"];
        const declared =
          typeof componentId === "string"
            ? definitionVariantNames(options.store.document, componentId)
            : [];
        const ask = options.prompt ?? getWindow()?.prompt;
        if (ask === undefined) {
          report("Diese Umgebung fragt nicht nach einem Namen.");
          break;
        }
        const input = ask("Name der Variante", suggestVariantName(declared));
        if (input === null) break;
        const saved = runComponentOp(
          () => {
            const changed = createVariantFromOverrides(options.store, id, input);
            return changed ? input.trim() : null;
          },
          "Die Variante ließ sich nicht speichern.",
        );
        if (saved === null) break;
        report(`Variante "${saved}" gespeichert - umbenennen im Inspektor der Komponente.`);
        break;
      }
      case "component-insert": {
        const instanceId = runComponentOp(
          () => instantiateComponent(options.store, id, id),
          "Die Instanz ließ sich nicht einfügen.",
        );
        if (instanceId === null) break;
        focusedId = instanceId;
        options.store.select(instanceId);
        report(null);
        break;
      }
      // The version lever (ticket 04, slice 3): a bump moves the definition
      // ahead, the instances stay pinned until they are pulled up - the badge
      // in the tree shows the difference.
      case "component-bump": {
        const version = runComponentOp(
          () => {
            const next = bumpComponentVersion(options.store, id);
            return next === null ? null : String(next);
          },
          "Die Version ließ sich nicht erhöhen.",
        );
        if (version === null) break;
        const drift = componentDriftIn(options.store, id).length;
        report(`Version v${version} - ${drift} Instanz(en) folgen noch.`);
        break;
      }
      case "component-update": {
        const count = updateComponentInstances(options.store, id);
        if (count === 0) {
          report("Alle Instanzen sind bereits aktuell.");
          break;
        }
        report(count === 1 ? "1 Instanz aktualisiert" : `${count} Instanzen aktualisiert`);
        break;
      }
      default:
        break;
    }
    closeMenu();
  }

  /* ------------------------------------------------------------------ keyboard */

  function handleTreeKey(event: DomEvent): void {
    const all = visibleItems();
    if (all.length === 0) return;
    const current = focusedId ?? selectedId() ?? all[0]?.id ?? null;
    const index = all.findIndex((item) => item.id === current);
    const item = index >= 0 ? all[index] : undefined;
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault?.();
        const next = all[Math.min(all.length - 1, (index < 0 ? -1 : index) + 1)];
        if (next !== undefined) selectNode(next.id);
        return;
      }
      case "ArrowUp": {
        event.preventDefault?.();
        const next = all[Math.max(0, (index < 0 ? all.length : index) - 1)];
        if (next !== undefined) selectNode(next.id);
        return;
      }
      case "ArrowRight": {
        event.preventDefault?.();
        if (item === undefined) return;
        if (item.hasChildren && !expanded.has(item.id)) {
          expanded.add(item.id);
          render();
          return;
        }
        const next = all[index + 1];
        if (next !== undefined && next.depth > item.depth) selectNode(next.id);
        return;
      }
      case "ArrowLeft": {
        event.preventDefault?.();
        if (item === undefined) return;
        if (item.hasChildren && expanded.has(item.id)) {
          expanded.delete(item.id);
          render();
          return;
        }
        if (item.parentId !== null) selectNode(item.parentId);
        return;
      }
      case "Home": {
        event.preventDefault?.();
        const first = all[0];
        if (first !== undefined) selectNode(first.id);
        return;
      }
      case "End": {
        event.preventDefault?.();
        const last = all[all.length - 1];
        if (last !== undefined) selectNode(last.id);
        return;
      }
      case "Enter":
      case " ": {
        event.preventDefault?.();
        if (item !== undefined) selectNode(item.id);
        return;
      }
      case "F2": {
        event.preventDefault?.();
        if (item === undefined) return;
        runMenuAction(item.id, "rename");
        return;
      }
      case "Delete": {
        event.preventDefault?.();
        if (item === undefined) return;
        runMenuAction(item.id, "delete");
        return;
      }
      case "F10": {
        if (event.shiftKey !== true) return;
        event.preventDefault?.();
        if (item === undefined) return;
        openMenu(item.id);
        return;
      }
      case "c": {
        if (event.metaKey !== true && event.ctrlKey !== true) return;
        event.preventDefault?.();
        if (item === undefined) return;
        if (copyNode(options.store, item.id)) report("Ebene kopiert");
        return;
      }
      case "v": {
        if (event.metaKey !== true && event.ctrlKey !== true) return;
        event.preventDefault?.();
        const pasted = pasteNode(options.store, item?.id ?? null);
        if (pasted === null) {
          report("Die Zwischenablage ist leer oder die Quelle fehlt.");
          return;
        }
        focusedId = pasted;
        options.store.select(pasted);
        report(null);
        return;
      }
      case "Escape": {
        if (menu !== null) {
          event.preventDefault?.();
          closeMenu();
          return;
        }
        if (renaming !== null) {
          event.preventDefault?.();
          renaming = null;
          render();
        }
        return;
      }
      default:
        return;
    }
  }

  /* -------------------------------------------------------------------- render */

  function renderRename(item: EditorLayerItem, key: string): DomElement {
    const wrap = h(doc, "div", { className: "senify-explorer__rename" });
    const node = options.store.document.nodes[item.id];
    const value = node?.props[key];
    const input = h(doc, "input", {
      className: "senify-explorer__rename-input",
      data: { role: "rename-input" },
    });
    input.value =
      typeof value === "string"
        ? value
        : (editorNodeSnippet(node ?? { id: item.id, primitive: item.primitive, props: {} }) ?? "");
    const commit = (): void => {
      const next = input.value ?? "";
      renaming = null;
      if (next !== value) {
        apply(
          { op: "setNodeProp", id: item.id, key, value: next },
          "Ebene umbenennen",
        );
      } else {
        render();
      }
      focusTreeItem(item.id);
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault?.();
        commit();
      } else if (event.key === "Escape") {
        event.preventDefault?.();
        renaming = null;
        render();
        focusTreeItem(item.id);
      }
    });
    input.addEventListener("blur", () => {
      if (renaming !== null && renaming.id === item.id) commit();
    });
    wrap.appendChild(input);
    return wrap;
  }

  function renderItem(item: EditorLayerItem): DomElement {
    const selected = selectedId() === item.id;
    const row = h(doc, "div", {
      className: "senify-explorer__item",
      data: {
        node: item.id,
        depth: String(item.depth),
        selected: String(selected),
        hidden: String(item.hidden || item.hiddenDevices.length > 0),
        locked: String(item.locked),
      },
      attributes: {
        role: "treeitem",
        "aria-level": String(item.depth + 1),
        "aria-selected": String(selected),
        ...(item.hasChildren ? { "aria-expanded": String(expanded.has(item.id)) } : {}),
        tabindex: focusedId === item.id || (focusedId === null && selected) ? "0" : "-1",
      },
    });
    row.style.paddingLeft = `${6 + item.depth * 14}px`;
    const caret = h(doc, "button", {
      className: "senify-explorer__caret",
      data: { role: "caret" },
      attributes: {
        type: "button",
        tabindex: "-1",
        "aria-label": item.hasChildren
          ? expanded.has(item.id)
            ? "Zuklappen"
            : "Aufklappen"
          : "Keine Kinder",
      },
    });
    if (item.hasChildren) caret.appendChild(icon(doc, "down", 10));
    caret.addEventListener("click", (event) => {
      event.stopPropagation?.();
      if (!item.hasChildren) return;
      if (expanded.has(item.id)) expanded.delete(item.id);
      else expanded.add(item.id);
      render();
      focusTreeItem(item.id);
    });
    row.appendChild(caret);
    if (renaming !== null && renaming.id === item.id) {
      row.appendChild(renderRename(item, renaming.key));
    } else {
      row.appendChild(
        h(doc, "span", { className: "senify-explorer__label", text: item.label }),
      );
    }
    const badges = h(doc, "span", { className: "senify-explorer__badges" });
    if (item.motion) badges.appendChild(h(doc, "span", { className: "senify-explorer__badge", text: "M" }));
    if (item.drift !== undefined) {
      const badge = h(doc, "span", {
        className: "senify-explorer__badge senify-explorer__badge--drift",
        text: `v${item.drift.pinned}`,
        data: { role: "drift" },
        attributes: {
          title: `Version ${item.drift.pinned} · Definition ist v${item.drift.current}`,
        },
      });
      badges.appendChild(badge);
    }
    if (item.hidden || item.hiddenDevices.length > 0) {
      badges.appendChild(icon(doc, "eyeoff", 12));
    }
    if (item.locked) badges.appendChild(icon(doc, "lock", 12));
    row.appendChild(badges);
    row.addEventListener("click", () => {
      focusedId = item.id;
      options.store.select(item.id);
      render();
      focusTreeItem(item.id);
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault?.();
      openMenu(item.id, { left: event.clientX ?? 0, top: event.clientY ?? 0 });
    });
    row.addEventListener("keydown", handleTreeKey);
    // Drag and drop (ticket 03 point 1): a row drags onto another row; the
    // drop position comes from the row's vertical halves (containers take
    // "into" in the middle band). `resolveMoveDrop` is the visible cycle
    // guard — a node never lands inside its own subtree.
    row.setAttribute("draggable", "true");
    row.addEventListener("dragstart", (event) => {
      dragId = item.id;
      const transfer = (event as {
        dataTransfer?: { setData?: (format: string, value: string) => void; effectAllowed?: string };
      }).dataTransfer;
      transfer?.setData?.("text/plain", item.id);
      if (transfer !== undefined) transfer.effectAllowed = "move";
    });
    row.addEventListener("dragover", (event) => {
      if (dragId === null || dragId === item.id) return;
      event.preventDefault?.();
      const rect = row.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 0, height: 0 };
      const position = dropPositionFor(
        rect,
        event.clientY ?? 0,
        isContainer(options.store.document, item.id),
      );
      const resolution = resolveMoveDrop(options.store.document, dragId, item.id, position);
      if (dropRow !== null && dropRow !== row) dropRow.removeAttribute("data-drop");
      dropRow = row;
      row.setAttribute(
        "data-drop",
        resolution.kind === "reject" ? "rejected" : position,
      );
    });
    row.addEventListener("drop", (event) => {
      if (dragId === null) return;
      event.preventDefault?.();
      const source = dragId;
      const target = item.id;
      const rect = row.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 0, height: 0 };
      const position = dropPositionFor(
        rect,
        event.clientY ?? 0,
        isContainer(options.store.document, target),
      );
      dragId = null;
      dropRow?.removeAttribute("data-drop");
      dropRow = null;
      const resolution = resolveMoveDrop(options.store.document, source, target, position);
      if (resolution.kind === "reject") {
        report(resolution.reason);
        render();
        return;
      }
      if (resolution.kind !== "move") {
        render();
        return;
      }
      apply(
        { op: "moveNode", id: source, target: resolution.target, index: resolution.index },
        "Ebene verschieben",
      );
      render();
    });
    row.addEventListener("dragend", () => {
      dragId = null;
      dropRow?.removeAttribute("data-drop");
      dropRow = null;
    });
    return row;
  }

  function renderMenu(): DomElement | null {
    if (menu === null) return null;
    const menuId = menu.id;
    if (options.store.document.nodes[menuId] === undefined) return null;
    const list = h(doc, "div", {
      className: "senify-explorer__menu",
      data: { role: "context-menu" },
      attributes: { role: "menu", "aria-label": "Ebenen-Aktionen" },
    });
    list.style.left = `${menu.left}px`;
    list.style.top = `${menu.top}px`;
    for (const entry of editorMenuItems(options.store.document, menuId)) {
      const item = h(doc, "button", {
        className: "senify-explorer__menu-item",
        data: { action: entry.id, danger: String(entry.danger === true) },
        attributes: { type: "button", role: "menuitem", tabindex: "-1" },
      });
      item.appendChild(h(doc, "span", { text: entry.label }));
      if (entry.hint !== undefined) {
        item.appendChild(h(doc, "span", { className: "senify-explorer__menu-hint", text: entry.hint }));
      }
      item.addEventListener("click", () => runMenuAction(menuId, entry.id));
      list.appendChild(item);
    }
    list.addEventListener("keydown", (event) => {
      // `querySelectorAll` returns a NodeList in the browser; the structural
      // DOM type calls it an array, so normalize before indexing.
      const items = Array.from(list.querySelectorAll('[role="menuitem"]'));
      const index = items.findIndex((entry) => entry === doc.activeElement);
      if (event.key === "Escape") {
        event.preventDefault?.();
        closeMenu();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault?.();
        const next = items[Math.min(items.length - 1, index + 1)];
        next?.focus?.();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault?.();
        const next = items[Math.max(0, index - 1)];
        next?.focus?.();
      }
    });
    return list;
  }

  function renderTabs(): void {
    tabRow.textContent = "";
    const entries = [
      { id: "layers", label: "Ebenen" },
      ...(options.tabs ?? []).map((tab) => ({ id: tab.id, label: tab.label })),
    ];
    for (const entry of entries) {
      const active = entry.id === activeTab;
      const button = h(doc, "button", {
        className: "senify-explorer__tab",
        text: entry.label,
        data: { tab: entry.id, active: String(active) },
        attributes: {
          type: "button",
          role: "tab",
          "aria-selected": String(active),
          tabindex: active ? "0" : "-1",
        },
      });
      button.addEventListener("click", () => setTab(entry.id));
      tabRow.appendChild(button);
    }
  }

  function renderTabList(source: ExplorerTabSource): void {
    const list = h(doc, "div", {
      className: "senify-explorer__tablist",
      attributes: { role: "list", "aria-label": source.label },
    });
    const entries = source.items();
    if (entries.length === 0) {
      list.appendChild(
        h(doc, "div", {
          className: "senify-explorer__tabempty",
          text: source.empty ?? "Nichts vorhanden.",
        }),
      );
    }
    for (const entry of entries) {
      const row = h(doc, "button", {
        className: "senify-explorer__tabitem",
        data: { id: entry.id, active: String(entry.active === true) },
        attributes: { type: "button", title: entry.hint ?? entry.label },
      });
      row.appendChild(h(doc, "span", { className: "senify-explorer__label", text: entry.label }));
      if (entry.hint !== undefined) {
        row.appendChild(h(doc, "span", { className: "senify-explorer__tabhint", text: entry.hint }));
      }
      row.addEventListener("click", () => source.onActivate?.(entry.id));
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  function setTab(id: string): void {
    if (activeTab === id) return;
    activeTab = id;
    render();
  }

  function render(): void {
    renderTabs();
    if (activeTab !== "layers") {
      const source = (options.tabs ?? []).find((tab) => tab.id === activeTab);
      if (source?.element !== undefined) {
        const custom = source.element(doc);
        if (customShown !== custom) {
          body.textContent = "";
          body.appendChild(custom);
          customShown = custom;
        }
        return;
      }
      customShown = null;
      body.textContent = "";
      if (source !== undefined) {
        renderTabList(source);
        return;
      }
      activeTab = "layers";
    }
    customShown = null;
    body.textContent = "";
    const all = items();
    if (focusedId === null) focusedId = selectedId() ?? all[0]?.id ?? null;
    ensureVisible(focusedId ?? options.store.document.rootNodeId);
    const visible = visibleItems();
    countEl.textContent = `${all.length}`;
    const tree = h(doc, "div", {
      className: "senify-explorer__tree",
      attributes: { role: "tree", "aria-label": "Ebenen des Dokuments" },
    });
    for (const item of visible) tree.appendChild(renderItem(item));
    body.appendChild(tree);
    const menuEl = renderMenu();
    if (menuEl !== null) {
      body.appendChild(menuEl);
      // Keyboard-first: the first entry takes the focus, Escape returns it to
      // the tree (closeMenu).
      menuEl.querySelector('[role="menuitem"]')?.focus?.();
    }
  }

  unsubscribe = options.store.subscribe(() => {
    const selected = selectedId();
    if (selected !== null && renaming === null && menu === null) {
      focusedId = selected;
      ensureVisible(selected);
    }
    render();
  });
  render();
  options.host.appendChild(root);

  return {
    element: root,
    refresh: render,
    focused: () => focusedId,
    focus: (nodeId: string | null) => {
      if (nodeId === null) return;
      selectNode(nodeId);
    },
    openContextMenu: (nodeId: string) => openMenu(nodeId),
    menuOpen: () => menu !== null,
    setTab,
    activeTab: () => activeTab,
    destroy: () => {
      unsubscribe?.();
      unsubscribe = null;
      root.remove();
    },
  };
}
