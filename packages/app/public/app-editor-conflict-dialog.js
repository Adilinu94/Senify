// Der Konflikt-Dialog des Editors (L17) - aus `app-editor.js` (R12).
//
// WARUM EIGENES MODUL: Der Dialog ist Darstellung. Er bekommt ein Modell
// (`conflictDialogModel` aus `packages/editor/src/state/persist.ts`), baut drei
// Knoepfe und oeffnet sich. Die Texte und Zahlen stehen dort und sind dort
// getestet; hier steht nur, WANN er aufgeht, WIE er sich schliesst und dass er
// nicht doppelt aufgeht.
//
// DIE REGEL, DIE ER TRAGEN MUSS: ein Dialog je Konfliktlage. `applyState`
// laeuft bei jeder Zustandsaenderung (auch beim Tippen); ohne den Schluessel
// aus erwarteter Version, Server-Version und offenen Aenderungen wuerde
// `showModal()` bei jedem Tastendruck erneut laufen - und ein bereits
// geschlossener Dialog ginge wieder auf, obwohl der Nutzer ihn zugeklappt hat.

function keyOf(model) {
  return `${model.expectedVersion}:${model.serverVersion ?? "?"}:${model.pending}`;
}

export function createConflictDialog({ el, host, onReload, onRetry }) {
  const dialog = el("dialog", {
    class: "conflict-dialog",
    "data-role": "conflict-dialog",
  });
  host.append(dialog);

  let currentKey = null;

  const close = () => {
    // Der Schluessel faellt mit dem Schliessen: eine SPAETERE Lage mit
    // denselben Zahlen darf den Dialog wieder oeffnen.
    currentKey = null;
    if (dialog.open) dialog.close();
  };

  const button = (action, className, text, onClick) => {
    const element = el("button", { type: "button", class: className, "data-action": action, text });
    element.addEventListener("click", () => {
      close();
      onClick();
    });
    return element;
  };

  return {
    element: dialog,
    isOpen: () => dialog.open === true,
    close,
    // `model === null` heisst: kein Konflikt (mehr). Dann zu, ohne Rueckfrage.
    sync(model) {
      if (model === null) {
        close();
        return;
      }
      const key = keyOf(model);
      // Schon offen oder schon gezeigt: nichts tun. Sonst springt der Dialog
      // bei jedem Tastendruck neu auf.
      if (dialog.open || key === currentKey) return;
      currentKey = key;
      const reload = button("conflict-reload", "danger", model.reloadLabel, onReload);
      const retry = button("conflict-retry", "primary", model.retryLabel, onRetry);
      const later = button("conflict-later", "", model.dismissLabel, () => {});
      dialog.replaceChildren(
        el("h2", { text: model.title }),
        el("p", { text: model.hint }),
        el("div", { class: "conflict-dialog__actions" }, reload, retry, later),
      );
      dialog.showModal();
    },
  };
}
