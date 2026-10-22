// Die Rueckmeldungen der Referenzen-Seite: der Toast, das Kopieren mit
// Rueckfall und das Schliessen per Hintergrund-Klick. `app-references.js`
// importiert sie.
//
// Das Modul haengt an nichts ausser `el` und dem Schliessen-Symbol. Es kennt
// weder den Zustand der Bibliothek noch die API - deshalb steht es fuer sich,
// und deshalb war es der naechste Block, der sich schneiden liess, ohne die
// 52 Zugriffe auf den geteilten Zustand mitzunehmen.

import { el } from "./app-core.js";

// Das Schliessen-Symbol der Dialoge. Es steht hier und nicht in
// `app-references.js`, weil nur dieses Modul es braucht - und weil ein
// Rueckimport einen Zyklus zwischen beiden Modulen ergaebe.
export const REFS_ICON_CLOSE = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.8 6.8 17.2 17.2M17.2 6.8 6.8 17.2"/></svg>';

// Toast der Referenzen-Seite: unten mittig, 2600 ms sichtbar, Uebergang wie im
// Vorbild (`#toast`). Anders als die Shell-Toasts (rechts oben in der Ecke).
// Liegt ein modales Fenster offen, wandert der Toast hinein: die oberste Ebene
// (`top layer`) deckt sonst alles ab, was am `<body>` haengt — genau wie im
// Vorbild haengt `notify()` den Toast in den zuletzt geoeffneten Dialog.

export function refsToast(message) {
  for (const old of document.querySelectorAll(".refs-toast")) old.remove();
  const node = el("div", {
    class: "refs-toast",
    role: "status",
    "aria-live": "polite",
    text: message,
  });
  const open = document.querySelector("dialog[open]");
  (open ?? document.body).append(node);
  window.requestAnimationFrame(() => node.classList.add("show"));
  setTimeout(() => {
    node.classList.remove("show");
    setTimeout(() => node.remove(), 200);
  }, 2600);
}

// Brief kopieren: Clipboard wenn verfuegbar, sonst Dialog zum Markieren.

export function refsCopy(text, message) {
  const clipboard = window.navigator ? window.navigator.clipboard : undefined;
  if (clipboard && typeof clipboard.writeText === "function") {
    clipboard.writeText(text).then(
      () => refsToast(message ?? "Brief kopiert"),
      () => refsCopyFallback(text),
    );
    return;
  }
  refsCopyFallback(text);
}

function refsCopyFallback(text) {
  const area = el("textarea", { class: "refs-input", rows: "15" });
  area.readOnly = true;
  area.value = text;
  const dialog = el(
    "dialog",
    { class: "refs-dialog refs-copy-dialog" },
    el(
      "div",
      { class: "refs-dialog-head" },
      el("h2", { text: "Dein Brief" }),
      el(
        "div",
        { class: "refs-dialog-tools" },
        el("button", {
          type: "button",
          class: "refs-icon-button",
          "aria-label": "Schliessen",
          html: REFS_ICON_CLOSE,
          onclick: () => dialog.close(),
        }),
      ),
    ),
    el(
      "div",
      { class: "refs-dialog-body" },
      el("p", {
        text: "Automatisches Kopieren ist nicht verfügbar. Wähle den Text unten aus und kopiere ihn.",
      }),
      area,
    ),
  );
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  refsBindBackdropClose(dialog);
  dialog.showModal();
  area.focus();
  area.select();
}

// Hintergrund-Klick schliesst jeden `refs-`-Dialog (wie im Vorbild).

export function refsBindBackdropClose(dialog) {
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      dialog.close();
    }
  });
}
