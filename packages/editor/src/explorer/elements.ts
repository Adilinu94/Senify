// Elemente-Panel (E4): Kacheln in einklappbaren Kategorien mit Suche. Ein
// Klick fuegt das Element ein (`insert`: am Ziel eines Plus-Punkts, sonst am Ende
// der Seite), Ziehen setzt es per Drag and Drop (`bindDragSource`); beides
// ergibt dieselbe `insertNode`-Mutation.
// Das Panel kennt weder Store noch Canvas, beides kommt als Funktion herein. Es
// steht in der linken Spalte und weicht dem Inspektor, sobald ein Element
// gewaehlt ist (E5).
//
// Zwei Reiter, wenn der Aufrufer Sektionen einfuegen kann: „Bausteine“ (die
// Primitive des Katalogs) und „Sektionen“ (die Registry-Sektionen, je Variante
// eine Kachel mit Vorschaubild). Ohne `insertSection` gibt es nur die Bausteine.

import type { DomDocument, DomElement } from "../dom.ts";
import { DEFAULT_SECTION_THUMBNAIL_BASE } from "../state/sections.ts";
import { EDITOR_ROOT_ATTRIBUTE } from "../ui/tokens.ts";
import { buildElementGroups, type ElementGroup } from "./elements-model.ts";
import { buildSectionGroups, type SectionGroup } from "./sections-model.ts";
import { ensureExplorerStyles } from "./styles.ts";

export type ElementsPanelOptions = {
  insert: (primitive: string) => void;
  bindDragSource: (element: DomElement, primitive: string) => void;
  // Verwirft das gemerkte Ziel (das Kreuz im Hinweis).
  cancelTarget: () => void;
  // Sektionen einfuegen: ein Klick auf eine Variante setzt sie, Ziehen setzt sie
  // per Drag and Drop. Fehlt `insertSection`, zeigt das Panel nur Bausteine.
  insertSection?: (type: string, variant: string) => void;
  bindSectionDragSource?: (element: DomElement, type: string, variant: string) => void;
  // Wo die Vorschaubilder der Varianten liegen (Ordner mit Schraegstrich am Ende).
  thumbnailBase?: string;
};

export type ElementsPanelTab = "elements" | "sections";

export type ElementsPanel = {
  element: DomElement;
  // Setzt den Suchtext (wie eine Eingabe im Feld).
  search(query: string): void;
  // Zeigt, wohin das naechste Element geht ("hinter Hero"), nachdem ein
  // Plus-Punkt im Canvas ein Ziel gemerkt hat; `null` blendet den Hinweis aus.
  setTarget(label: string | null): void;
  // Wechselt den Reiter; ohne Sektions-Funktionen bleibt es bei den Bausteinen.
  showTab(tab: ElementsPanelTab): void;
  tab(): ElementsPanelTab;
};

export { DEFAULT_SECTION_THUMBNAIL_BASE };

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
  const target = h(doc, "div", {
    className: "senify-elements__target",
    attributes: { role: "status" },
  });
  target.hidden = true;
  const targetText = h(doc, "span", { className: "senify-elements__target-text" });
  const targetCancel = h(doc, "button", {
    className: "senify-elements__target-cancel",
    attributes: { type: "button", title: "Ziel verwerfen", "aria-label": "Ziel verwerfen" },
  });
  targetCancel.appendChild(icon(doc, "close", 10));
  targetCancel.addEventListener("click", () => options.cancelTarget());
  target.appendChild(targetText);
  target.appendChild(targetCancel);
  const input = h(doc, "input", {
    className: "senify-elements__search",
    attributes: { type: "search", placeholder: "Elemente suchen", "aria-label": "Elemente suchen" },
  });
  const groupsHost = h(doc, "div", { className: "senify-elements__groups" });
  root.appendChild(h(doc, "div", { className: "senify-elements__header", text: "Elemente" }));
  const canInsertSections = options.insertSection !== undefined;
  const thumbnailBase = options.thumbnailBase ?? DEFAULT_SECTION_THUMBNAIL_BASE;
  let tab: ElementsPanelTab = "elements";
  const tabButtons = new Map<ElementsPanelTab, DomElement>();
  if (canInsertSections) {
    const tabs = h(doc, "div", {
      className: "senify-elements__tabs",
      attributes: { role: "tablist", "aria-label": "Elementart" },
    });
    for (const [id, name] of [
      ["elements", "Bausteine"],
      ["sections", "Sektionen"],
    ] as const) {
      const button = h(doc, "button", {
        className: "senify-elements__tab",
        text: name,
        data: { tab: id },
        attributes: { type: "button", role: "tab", "aria-selected": String(id === tab) },
      });
      button.addEventListener("click", () => showTab(id));
      tabButtons.set(id, button);
      tabs.appendChild(button);
    }
    root.appendChild(tabs);
  }
  body.appendChild(target);
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

  // Eine Variante als Kachel: Vorschaubild oben, Name darunter. Ein Klick setzt
  // sie, Ziehen setzt sie per Drag and Drop; beides ergibt dieselbe
  // `insertNode`-Mutation. Fehlt das Bild, bleibt die Kachel mit ihrem Namen.
  function renderSectionGroup(group: SectionGroup): DomElement {
    const key = `section:${group.id}`;
    const open = query !== "" || !collapsed.has(key);
    const section = h(doc, "section", {
      className: "senify-elements__group",
      data: { category: key, open: String(open) },
    });
    const head = h(doc, "button", {
      className: "senify-elements__head",
      attributes: { type: "button", "aria-expanded": String(open) },
    });
    head.appendChild(icon(doc, "down", 10));
    head.appendChild(h(doc, "span", { text: group.name }));
    const list = h(doc, "div", {
      className: "senify-elements__sections",
      attributes: { role: "list", "aria-label": group.name },
    });
    list.hidden = !open;
    head.addEventListener("click", () => {
      if (query !== "") return;
      const next = !collapsed.has(key);
      if (next) collapsed.add(key);
      else collapsed.delete(key);
      section.setAttribute("data-open", String(!next));
      head.setAttribute("aria-expanded", String(!next));
      list.hidden = next;
    });
    for (const entry of group.sections) {
      const block = h(doc, "div", {
        className: "senify-elements__section",
        data: { section: entry.type },
        attributes: { role: "listitem" },
      });
      block.appendChild(
        h(doc, "div", {
          className: "senify-elements__section-name",
          text: entry.name,
          attributes: { title: entry.description },
        }),
      );
      const variants = h(doc, "div", {
        className: "senify-elements__variants",
        attributes: { role: "list", "aria-label": `${entry.name}: Varianten` },
      });
      for (const variant of entry.variants) {
        const button = h(doc, "button", {
          className: "senify-elements__variant",
          data: { section: entry.type, variant: variant.key },
          attributes: {
            type: "button",
            role: "listitem",
            draggable: "true",
            title: `${entry.name}, ${variant.label}: ${entry.description}`,
          },
        });
        const picture = h(doc, "span", { className: "senify-elements__thumb" });
        const image = h(doc, "img", {
          attributes: {
            src: `${thumbnailBase}${variant.thumbnail}`,
            alt: "",
            loading: "lazy",
            draggable: "false",
          },
        });
        image.addEventListener("error", () => picture.setAttribute("data-missing", "true"));
        picture.appendChild(image);
        button.appendChild(picture);
        button.appendChild(
          h(doc, "span", { className: "senify-elements__label", text: variant.label }),
        );
        button.addEventListener("click", () => options.insertSection?.(entry.type, variant.key));
        options.bindSectionDragSource?.(button, entry.type, variant.key);
        variants.appendChild(button);
      }
      block.appendChild(variants);
      list.appendChild(block);
    }
    section.appendChild(head);
    section.appendChild(list);
    return section;
  }

  function renderGroups(): void {
    groupsHost.textContent = "";
    if (tab === "sections") {
      const sectionGroups = buildSectionGroups(query);
      if (sectionGroups.length === 0) {
        groupsHost.appendChild(
          h(doc, "div", { className: "senify-elements__empty", text: "Keine Sektionen gefunden." }),
        );
        return;
      }
      for (const group of sectionGroups) groupsHost.appendChild(renderSectionGroup(group));
      return;
    }
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

  function showTab(next: ElementsPanelTab): void {
    if (!canInsertSections && next === "sections") return;
    if (tab === next) return;
    tab = next;
    for (const [id, button] of tabButtons) button.setAttribute("aria-selected", String(id === tab));
    const label = tab === "sections" ? "Sektionen suchen" : "Elemente suchen";
    input.setAttribute("placeholder", label);
    input.setAttribute("aria-label", label);
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

  function setTarget(label: string | null): void {
    target.hidden = label === null;
    targetText.textContent = label === null ? "" : `Einfügen ${label}`;
  }

  renderGroups();
  return { element: root, search, setTarget, showTab, tab: () => tab };
}
