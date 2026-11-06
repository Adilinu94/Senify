// History dialog (ticket 03 point 5): the undo/redo log as a sheet.
//
// The rows come from the store's `HistoryStack` (time + action label), the
// cursor marks the current state and the future entries stay visible dimmed.
// A click jumps to that state step by step: local steps use the store's patch
// gate, external steps use the session's registered runner and confirmed server
// state. Without a session, only purely local routes are offered. The history
// belongs to the document: the store is replaced when another page loads, and
// so is this list.

import type { DomDocument, DomElement, DomEvent } from "../dom.ts";
import { EDITOR_ROOT_ATTRIBUTE } from "../ui/tokens.ts";
import type { EditorSession } from "../state/session.ts";
import type { EditorStore } from "../state/store.ts";
import { ensureHistoryStyles } from "./styles.ts";

export type HistoryDialogOptions = {
  doc: DomDocument;
  store: EditorStore;
  session?: EditorSession;
  onOpenChange?: (open: boolean) => void;
};

export type HistoryDialog = {
  element: DomElement;
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  render(): void;
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

function clock(at: number): string {
  const date = new Date(at);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function createHistoryDialog(options: HistoryDialogOptions): HistoryDialog {
  const { doc, store, session } = options;
  ensureHistoryStyles(doc);
  const root = h(doc, "div", { className: "senify-history", data: { open: "false" } });
  root.setAttribute(EDITOR_ROOT_ATTRIBUTE, "true");
  const backdrop = h(doc, "div", { className: "senify-history__backdrop" });
  const sheet = h(doc, "div", {
    className: "senify-history__sheet",
    attributes: { role: "dialog", "aria-modal": "true", "aria-label": "Verlauf" },
  });
  const head = h(doc, "div", { className: "senify-history__head" });
  head.appendChild(h(doc, "span", { className: "senify-history__title", text: "Verlauf" }));
  const close = h(doc, "button", {
    className: "senify-history__close",
    text: "×",
    attributes: { type: "button", "aria-label": "Verlauf schließen" },
  });
  head.appendChild(close);
  const list = h(doc, "div", { className: "senify-history__list" });
  const status = h(doc, "div", { className: "senify-history__status", attributes: { "aria-live": "polite" } });
  sheet.appendChild(head);
  sheet.appendChild(status);
  sheet.appendChild(list);
  root.appendChild(backdrop);
  root.appendChild(sheet);
  doc.body.appendChild(root);

  let open = false;
  let restoreFocus: DomElement | null = null;
  let jumping = false;

  function render(): void {
    list.textContent = "";
    status.textContent = "";
    const externalState = session?.externalHistoryState();
    if (externalState && externalState.status !== "idle" && externalState.message) {
      status.textContent = externalState.message;
      status.setAttribute("data-status", externalState.status);
    } else {
      status.removeAttribute("data-status");
    }
    const entries = store.history.entries();
    const applied = store.history.applied();
    if (entries.length === 0) {
      list.appendChild(
        h(doc, "div", {
          className: "senify-history__empty",
          text: "Noch keine Änderungen — der Verlauf füllt sich mit dem ersten Schritt.",
        }),
      );
      return;
    }
    const currentId = applied[applied.length - 1]?.id ?? null;
    const running = jumping || store.pendingExternalId !== null || externalState?.status === "running";
    // Newest first: the state the user is looking at stays at the top.
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry === undefined) continue;
      const future = index >= applied.length;
      const local = store.history.canRestoreTo(entry.id);
      const asyncRoute = session ? session.canRestoreToAsync(entry.id) : store.canRestoreToAsync(entry.id);
      const blocked = running || (!local && !asyncRoute);
      let title = `${clock(entry.at)} · ${entry.label}`;
      if (running) title = store.pendingExternalId !== null || jumping ? "Ein Verlaufsschritt wird noch ausgeführt." : "Ein externer Vorgang wird noch ausgeführt.";
      else if (!local && asyncRoute) title = `${title} · wird Schritt für Schritt bestätigt`;
      else if (blocked) title = "Dieser Sprung ist gerade nicht möglich.";
      const row = h(doc, "button", {
        className: "senify-history__row",
        data: {
          "entry-id": entry.id,
          current: String(entry.id === currentId),
          future: String(future),
          external: String(asyncRoute && !local),
        },
        attributes: {
          type: "button",
          title,
          ...(blocked ? { disabled: "", "aria-disabled": "true" } : {}),
        },
      });
      row.appendChild(h(doc, "span", { className: "senify-history__time", text: clock(entry.at) }));
      row.appendChild(h(doc, "span", { className: "senify-history__label", text: entry.label }));
      if (entry.id === currentId) {
        row.appendChild(h(doc, "span", { className: "senify-history__mark", text: "jetzt" }));
      }
      row.addEventListener("click", () => {
        if (jumping || store.pendingExternalId !== null) return;
        if (session) {
          if (!session.canRestoreToAsync(entry.id)) return;
          jumping = true;
          render();
          void session.restoreToAsync(entry.id).catch(() => undefined).finally(() => {
            jumping = false;
            if (open) render();
          });
          return;
        }
        if (store.history.canRestoreTo(entry.id)) store.restoreTo(entry.id);
      });
      list.appendChild(row);
    }
  }

  function setOpen(next: boolean): void {
    if (open === next) return;
    open = next;
    root.setAttribute("data-open", String(open));
    options.onOpenChange?.(open);
    if (open) {
      restoreFocus = doc.activeElement ?? null;
      render();
    } else {
      const target = restoreFocus;
      restoreFocus = null;
      target?.focus?.();
    }
  }

  function onKeydown(event: DomEvent): void {
    if (!open || event.key !== "Escape") return;
    event.preventDefault?.();
    event.stopPropagation?.();
    setOpen(false);
  }

  close.addEventListener("click", () => setOpen(false));
  backdrop.addEventListener("click", () => setOpen(false));
  // Document level: a jump re-renders the list and can drop the row that had
  // the focus, so a root-level listener would miss the next Escape.
  doc.addEventListener("keydown", onKeydown);
  const unsubscribe = store.subscribe(() => {
    if (open) render();
  });

  return {
    element: root,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    isOpen: () => open,
    render,
    destroy: () => {
      unsubscribe();
      doc.removeEventListener("keydown", onKeydown);
      root.remove();
    },
  };
}
