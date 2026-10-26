// Das Overflow-Menue der Editor-Toolbar - aus `app-editor.js` (R12).
//
// WARUM EIGENES MODUL: Das Menue ist Bedienlogik ohne Fachbezug. Es kennt eine
// Handvoll Eintraege, eine Tastatur und einen Fokus - aber keinen Canvas, keine
// Auswahl und kein Speichern. Vorher standen 90 Zeilen davon in der
// 836-Zeilen-Closure.
//
// DIE REGELN, DIE ES TRAGEN MUSS (und die vorher nur im Browser galten):
//
//   1. `Escape` schliesst und gibt den Fokus an den Ausloeser zurueck,
//   2. `ArrowDown`/`ArrowUp` laufen im Kreis - ueber die SICHTBAREN Eintraege,
//   3. `Home`/`End` springen an den Anfang und ans Ende,
//   4. ein Klick ausserhalb schliesst, ein Klick IM Menue auch (der Eintrag
//      handelt selbst, das Menue soll nicht offen bleiben),
//   5. ein Eintrag, der versteckt ist (etwa "Neu laden" ohne Konflikt), wird
//      von der Tastatur uebersprungen - sonst landet der Fokus im Nichts,
//   6. ein Umschalter traegt `menuitemcheckbox`, ein Befehl `menuitem`. Die
//      Rolle wird HEREINGEREICHT, nicht aus der Position geraten.

const ITEM_SELECTOR = "button:not([hidden])";

export function createToolbarOverflow({ doc, el, label = "Mehr", entries = [] }) {
  const menuId = "canvas-toolbar-overflow";
  const button = el("button", {
    type: "button",
    class: "toolbar-overflow__trigger",
    "data-action": "canvas-overflow",
    "aria-haspopup": "menu",
    "aria-expanded": "false",
    "aria-controls": menuId,
    text: label,
  });
  const menu = el("div", {
    class: "toolbar-overflow__menu",
    id: menuId,
    role: "menu",
    "aria-label": "Weitere Editor-Aktionen",
  });
  menu.hidden = true;
  for (const entry of entries) {
    entry.element.setAttribute("role", entry.role ?? "menuitem");
    entry.element.classList.add("toolbar-overflow__item");
    menu.append(entry.element);
  }
  const host = el("div", { class: "toolbar-overflow" }, button, menu);

  // Sichtbar heisst: nicht als `hidden` markiert. `querySelectorAll` liefert
  // in Dokumentreihenfolge, also in der Reihenfolge der Eintraege.
  const visibleItems = () => [...menu.querySelectorAll(ITEM_SELECTOR)];

  let open = false;
  const setOpen = (next, restoreFocus = false) => {
    open = next;
    menu.hidden = !next;
    button.setAttribute("aria-expanded", String(next));
    if (next) visibleItems()[0]?.focus();
    else if (restoreFocus) button.focus();
  };

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(menu.hidden);
  });
  button.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    setOpen(true);
    const visible = visibleItems();
    (event.key === "ArrowUp" ? visible[visible.length - 1] : visible[0])?.focus();
  });
  menu.addEventListener("click", () => setOpen(false));
  menu.addEventListener("keydown", (event) => {
    const visible = visibleItems();
    if (visible.length === 0) return;
    const current = visible.indexOf(doc.activeElement);
    let next = -1;
    if (event.key === "ArrowDown") next = (current + 1) % visible.length;
    else if (event.key === "ArrowUp") next = (current - 1 + visible.length) % visible.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = visible.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false, true);
      return;
    } else return;
    event.preventDefault();
    visible[next]?.focus();
  });

  const onOutsidePointer = (event) => {
    if (!host.contains(event.target)) setOpen(false);
  };
  doc.addEventListener("pointerdown", onOutsidePointer);

  return {
    element: host,
    button,
    menu,
    isOpen: () => open,
    close: () => setOpen(false),
    // Nur fuer den Aufraeum-Pfad: nimmt den Dokument-Zuhoerer wieder ab.
    dispose() {
      doc.removeEventListener("pointerdown", onOutsidePointer);
      if (button.isConnected) setOpen(false);
    },
  };
}

export { ITEM_SELECTOR };
