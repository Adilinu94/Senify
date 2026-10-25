// Die Panel-Umschalter des Editors (E8) - aus `app-editor.js` (R12).
//
// Zwei Knoepfe klappen die Seitenpanels zu: links Elemente/Einstellungen,
// rechts die Struktur. Der Zustand steht als Attribut am Canvas-Host
// (`data-side`, `data-explorer`) und wird dort vom Stylesheet gelesen.
//
// WARUM EIGENES MODUL: Der Block ist ein Attribut-Schalter mit einem Knopf -
// er kennt weder Auswahl noch Dokument. In der Closure stand er zwischen
// Canvas-Aufbau und Zoom-Einpassung, wo er nichts zu suchen hatte.
//
// DIE REGEL, DIE ER TRAGEN MUSS: die Beschriftung sagt, was der Knopf TUT,
// und `aria-pressed` sagt, was gerade GILT. Beides muss zusammenpassen, sonst
// hoert ein Screenreader das Gegenteil dessen, was passiert.
//
// `aria-pressed` ist hier "Panel ist offen": gedrueckt = sichtbar. Ein Klick
// schliesst ein offenes Panel und oeffnet ein geschlossenes.

const OFFEN = "open";
const ZU = "closed";

export function createPanelToggle({ el, host, attribute, label }) {
  const button = el("button", {
    type: "button",
    class: "ghost",
    "data-panel-toggle": attribute,
    "aria-pressed": "true",
    text: label,
  });

  // Das Attribut ist die Wahrheit, nicht ein zweiter Zustand im Modul: ein
  // Neuaufbau des Hosts (etwa ein Themenwechsel) darf den Knopf nicht
  // beluegen.
  const isOpen = () => host.getAttribute(`data-${attribute}`) !== ZU;

  const sync = () => {
    button.setAttribute("aria-pressed", String(isOpen()));
  };

  button.addEventListener("click", () => {
    const next = !isOpen();
    host.setAttribute(`data-${attribute}`, next ? OFFEN : ZU);
    sync();
  });

  sync();

  return {
    element: button,
    isOpen,
    // Nur fuer Tests und einen aeusseren Zustandswechsel (etwa "alles zeigen").
    setOpen(value) {
      host.setAttribute(`data-${attribute}`, value ? OFFEN : ZU);
      sync();
    },
  };
}

export { OFFEN as PANEL_OPEN, ZU as PANEL_CLOSED };
