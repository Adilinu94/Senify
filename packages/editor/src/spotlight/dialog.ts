// Spotlight dialog (ticket 03, slice 1; E7): Cmd+K for the rebuild editor.
//
// The model (`spotlight.ts`) owns the index and the scoring; this module owns
// the dialog semantics the UI audit asks for: `role=dialog` with
// `aria-modal`, a listbox with `aria-activedescendant`, arrow keys, Enter to
// run, Escape to close — and the focus returns to whatever was focused before
// the dialog opened (E7 "Fokus-Rückgabe").

import { requireDocument, type DomDocument, type DomElement, type DomEvent } from "../dom.ts";
import { EDITOR_ROOT_ATTRIBUTE } from "../ui/tokens.ts";
import { searchSpotlight, type SpotlightCommand, type SpotlightItem } from "../spotlight.ts";
import { ensureSpotlightStyles } from "./styles.ts";

export type SpotlightDialogOptions = {
  index: readonly SpotlightItem[];
  onCommand: (command: SpotlightCommand) => void;
  onOpenChange?: (open: boolean) => void;
  placeholder?: string;
};

export type SpotlightDialog = {
  element: DomElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
  query(value: string): void;
  value(): string;
  results(): SpotlightItem[];
  activeId(): string | null;
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

const RESULT_LIMIT = 12;

export function createSpotlightDialog(options: SpotlightDialogOptions): SpotlightDialog {
  const doc = requireDocument();
  ensureSpotlightStyles(doc);
  const root = h(doc, "div", {
    className: "senify-spotlight",
    data: { open: "false" },
  });
  root.setAttribute(EDITOR_ROOT_ATTRIBUTE, "true");
  const backdrop = h(doc, "div", { className: "senify-spotlight__backdrop" });
  const dialog = h(doc, "div", {
    className: "senify-spotlight__dialog",
    attributes: {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Befehl suchen",
    },
  });
  const input = h(doc, "input", {
    className: "senify-spotlight__input",
    data: { role: "spotlight-input" },
    attributes: {
      type: "text",
      placeholder: options.placeholder ?? "Befehl, Seite oder Baustein …",
      "aria-controls": "senify-spotlight-list",
      "aria-autocomplete": "list",
      autocomplete: "off",
      spellcheck: "false",
    },
  });
  const list = h(doc, "div", {
    className: "senify-spotlight__list",
    attributes: { role: "listbox", id: "senify-spotlight-list" },
  });
  dialog.appendChild(input);
  dialog.appendChild(list);
  root.appendChild(backdrop);
  root.appendChild(dialog);
  doc.body.appendChild(root);

  let open = false;
  let results: SpotlightItem[] = [];
  let activeIndex = 0;
  let restoreFocus: DomElement | null = null;

  function setOpen(next: boolean): void {
    if (open === next) return;
    open = next;
    root.setAttribute("data-open", String(open));
    options.onOpenChange?.(open);
    if (open) {
      restoreFocus = doc.activeElement ?? null;
      input.value = "";
      renderResults();
      input.focus?.();
    } else {
      const target = restoreFocus;
      restoreFocus = null;
      target?.focus?.();
    }
  }

  function optionId(item: SpotlightItem): string {
    return `senify-spotlight-${item.id.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  }

  function activeItem(): SpotlightItem | undefined {
    return results[activeIndex];
  }

  function run(item: SpotlightItem | undefined): void {
    if (item === undefined) return;
    const command = item.command;
    setOpen(false);
    options.onCommand(command);
  }

  function renderResults(): void {
    results = searchSpotlight(options.index, input.value ?? "", RESULT_LIMIT);
    activeIndex = Math.min(activeIndex, Math.max(0, results.length - 1));
    list.textContent = "";
    if (results.length === 0) {
      list.appendChild(
        h(doc, "div", { className: "senify-spotlight__empty", text: "Kein Treffer" }),
      );
      input.setAttribute("aria-activedescendant", "");
      return;
    }
    let lastGroup = "";
    for (const [index, item] of results.entries()) {
      if (item.group !== lastGroup) {
        lastGroup = item.group;
        list.appendChild(
          h(doc, "div", {
            className: "senify-spotlight__group",
            text: item.group,
            attributes: { role: "presentation" },
          }),
        );
      }
      const active = index === activeIndex;
      const row = h(doc, "div", {
        className: "senify-spotlight__row",
        data: { kind: item.kind, active: String(active), id: item.id },
        attributes: {
          role: "option",
          id: optionId(item),
          "aria-selected": String(active),
        },
      });
      row.appendChild(h(doc, "span", { className: "senify-spotlight__label", text: item.label }));
      row.appendChild(
        h(doc, "span", { className: "senify-spotlight__description", text: item.description }),
      );
      row.addEventListener("click", () => run(item));
      row.addEventListener("mousemove", () => {
        if (activeIndex === index) return;
        activeIndex = index;
        renderResults();
      });
      list.appendChild(row);
    }
    const current = activeItem();
    input.setAttribute("aria-activedescendant", current === undefined ? "" : optionId(current));
    list.querySelector(`[data-active="true"]`)?.scrollIntoView?.({ block: "nearest" });
  }

  function move(delta: number): void {
    if (results.length === 0) return;
    activeIndex = (activeIndex + delta + results.length) % results.length;
    renderResults();
  }

  input.addEventListener("input", () => {
    activeIndex = 0;
    renderResults();
  });
  input.addEventListener("keydown", (event: DomEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault?.();
        move(1);
        return;
      case "ArrowUp":
        event.preventDefault?.();
        move(-1);
        return;
      case "Enter":
        event.preventDefault?.();
        run(activeItem());
        return;
      case "Escape":
        event.preventDefault?.();
        setOpen(false);
        return;
      default:
        return;
    }
  });
  backdrop.addEventListener("click", () => setOpen(false));

  return {
    element: root,
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => open,
    query: (value: string) => {
      input.value = value;
      activeIndex = 0;
      renderResults();
    },
    value: () => input.value ?? "",
    results: () => [...results],
    activeId: () => activeItem()?.id ?? null,
    destroy: () => {
      root.remove();
    },
  };
}
