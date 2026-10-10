// Elemente-Panel (E4): Kacheln in einklappbaren Kategorien mit Suche. Ein
// Klick haengt das Element ans Ende der Seite (`insert`), Ziehen setzt es per
// Drag and Drop (`bindDragSource`); beides ergibt dieselbe `insertNode`-Mutation
// wie die Schnellzugriff-Chips.
// Das Panel kennt weder Store noch Canvas, beides kommt als Funktion herein. Es
// steht in der linken Spalte und weicht dem Inspektor, sobald ein Element
// gewaehlt ist (E5).

import type { DomDocument, DomElement } from "../dom.ts";
import { EDITOR_ROOT_ATTRIBUTE } from "../ui/tokens.ts";
import { buildElementGroups, type ElementGroup } from "./elements-model.ts";
import { ensureExplorerStyles } from "./styles.ts";

export type ElementsPanelOptions = {
  insert: (primitive: string) => void;
  bindDragSource: (element: DomElement, primitive: string) => void;
};

export type ElementsPanel = {
  element: DomElement;
  // Setzt den Suchtext (wie eine Eingabe im Feld).
  search(query: string): void;
};

type Spec = {
  className?: string;
  text?: string;
  data?: Record<string, string>;
  attributes?: Record<string, string>;
};

function h(doc: DomDocument, tag: string, spec: Spec = {}): DomElement {
  const element = doc.createElement(tag);
  if (spec.className !== undefined) element.className = spec.className;
  if (spec.text !== undefined) element.textContent = spec.text;
  for (const [name, value] of Object.entries(spec.data ?? {})) element.setAttribute(`data-${name}`, value);
  for (const [name, value] of Object.entries(spec.attributes ?? {})) element.setAttribute(name, value);
  return element;
}

function icon(doc: DomDocument, name: string, size: number): DomElement {
  return h(doc, "span", {
    className: `ic ic--${name} ic--${size}`,
    attributes: { "aria-hidden": "true" },
  });
}

export function createElementsPanel(doc: DomDocument, options: ElementsPanelOptions): ElementsPanel {
  ensureExplorerStyles(doc);
  const root = h(doc, "section", {
    className: "senify-elements",
    attributes: { "aria-label": "Elemente" },
  });
  root.setAttribute(EDITOR_ROOT_ATTRIBUTE, "true");
  const body = h(doc, "div", { className: "senify-elements__body" });
  const input = h(doc, "input", {
    className: "senify-elements__search",
    attributes: { type: "search", placeholder: "Elemente suchen", "aria-label": "Elemente suchen" },
  });
  const groupsHost = h(doc, "div", { className: "senify-elements__groups" });
  root.appendChild(h(doc, "div", { className: "senify-elements__header", text: "Elemente" }));
  body.appendChild(input);
  body.appendChild(groupsHost);
  root.appendChild(body);

  // Eingeklappte Kategorien bleiben ueber Suchen hinweg gemerkt. Waehrend einer
  // Suche sind alle Treffer sichtbar.
  const collapsed = new Set<string>();
  let query = "";

  function renderGroup(group: ElementGroup): DomElement {
    const open = query !== "" || !collapsed.has(group.id);
    const section = h(doc, "section", {
      className: "senify-elements__group",
      data: { category: group.id, open: String(open) },
    });
    const head = h(doc, "button", {
      className: "senify-elements__head",
      attributes: { type: "button", "aria-expanded": String(open) },
    });
    head.appendChild(icon(doc, "down", 10));
    head.appendChild(h(doc, "span", { text: group.name }));
    const grid = h(doc, "div", {
      className: "senify-elements__grid",
      attributes: { role: "list", "aria-label": group.name },
    });
    grid.hidden = !open;
    head.addEventListener("click", () => {
      // Waehrend einer Suche zeigt jede Kategorie ihre Treffer; Einklappen gilt
      // nur ohne Suchtext.
      if (query !== "") return;
      const next = !collapsed.has(group.id);
      if (next) collapsed.add(group.id);
      else collapsed.delete(group.id);
      section.setAttribute("data-open", String(!next));
      head.setAttribute("aria-expanded", String(!next));
      grid.hidden = next;
    });
    for (const tile of group.tiles) {
      const button = h(doc, "button", {
        className: "senify-elements__tile",
        data: { primitive: tile.type },
        attributes: {
          type: "button",
          role: "listitem",
          draggable: "true",
          title: `${tile.name}: ${tile.description}`,
        },
      });
      button.appendChild(icon(doc, tile.icon, 20));
      button.appendChild(h(doc, "span", { className: "senify-elements__label", text: tile.name }));
      button.addEventListener("click", () => options.insert(tile.type));
      options.bindDragSource(button, tile.type);
      grid.appendChild(button);
    }
    section.appendChild(head);
    section.appendChild(grid);
    return section;
  }

  function renderGroups(): void {
    groupsHost.textContent = "";
    const groups = buildElementGroups(query);
    if (groups.length === 0) {
      groupsHost.appendChild(
        h(doc, "div", { className: "senify-elements__empty", text: "Keine Elemente gefunden." }),
      );
      return;
    }
    for (const group of groups) groupsHost.appendChild(renderGroup(group));
  }

  function search(next: string): void {
    query = next;
    input.value = next;
    renderGroups();
  }

  input.addEventListener("input", () => {
    query = input.value ?? "";
    renderGroups();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || query === "") return;
    event.preventDefault?.();
    search("");
  });

  renderGroups();
  return { element: root, search };
}
