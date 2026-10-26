// Die Agent-Vorschau (Ticket 05, Punkt 5) - aus `app-editor.js` (R12).
//
// WAS SIE ENTSCHEIDET: Darf die Ansicht einer fremden Aenderung folgen - auch
// auf eine andere Seite? "Agent baut, Nutzer sieht es im Canvas wachsen."
//
// DREI REGELN, die vorher in der Closure standen und nirgends geprueft waren:
//
//   1. Der Schalter liegt GLOBAL, nicht je Seite, und ist standardmaessig AN.
//      Nur ein gespeichertes "0" schaltet ihn aus.
//   2. Offene eigene Aenderungen blockieren JEDEN Wechsel: ein Routenwechsel
//      verwirft sie, und das waere stiller Datenverlust.
//   3. Der Nutzer schaltet sich selbst aus, sobald er eine Seite waehlt. Diese
//      Entscheidung faellt im Aufrufer (er kennt die Seite); hier steht nur,
//      was danach gilt.
//
// Die Speicherung kommt herein (`storage`), damit ein Test sie festhalten kann.

const KEY = "senify-agent-preview";

export function createAgentPreview({ el, storage, isBusy, onMessage }) {
  // Standard AN: nur ein ausdrueckliches "0" schaltet aus. Ein leerer Speicher
  // (erster Besuch, privates Fenster) heisst also "an".
  let enabled = storage.get(KEY) !== "0";

  const button = el("button", {
    type: "button",
    "data-action": "canvas-follow",
    "aria-pressed": String(enabled),
    text: "Agent-Vorschau",
    title: "Fremden Änderungen folgen — auch auf andere Seiten",
  });
  button.classList.toggle("active", enabled);

  const set = (value, { announce = true } = {}) => {
    enabled = value;
    storage.set(KEY, value ? "1" : "0");
    button.setAttribute("aria-pressed", String(value));
    button.classList.toggle("active", value);
    if (announce) onMessage(value ? "Agent-Vorschau an" : "Agent-Vorschau aus");
  };

  button.addEventListener("click", () => set(!enabled));

  return {
    element: button,
    enabled: () => enabled,
    set,
    toggle: () => set(!enabled),
    // Darf die Ansicht jetzt auf `targetPageId` wechseln?
    // Nein heisst: es gibt einen Grund, und den nennt die Statuszeile.
    mayFollow(targetPageId, currentPageId) {
      if (!enabled) return { allowed: false, reason: null };
      if (targetPageId === currentPageId) return { allowed: false, reason: null };
      if (isBusy()) {
        return {
          allowed: false,
          reason: "Fremde Änderung auf einer anderen Seite - bitte speichern",
        };
      }
      return { allowed: true, reason: null };
    },
  };
}

export { KEY as AGENT_PREVIEW_KEY };
