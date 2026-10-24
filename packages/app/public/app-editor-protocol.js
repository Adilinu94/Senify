// „Was gerade passiert" - das Protokoll unter dem Canvas (aus `app-editor.js`).
//
// WARUM EIGENES MODUL: Der Block war ein Teil der 913-Zeilen-Closure
// `mountCanvasView`. Er hat mit Canvas, Auswahl und Speichern nichts zu tun:
// er bekommt ein Ereignis, merkt sich die letzten sechs Zeilen und schreibt
// sie in ein Element. Genau die Sorte Block, die ohne Zustandsbezug
// herausgeht (R12, Muster der bisherigen Schnitte).
//
// WAS HIER NICHT PASSIERT: kein Zugriff auf die Session, kein Netzwerk, kein
// Modulzustand. Die Zeilenliste lebt in der zurueckgegebenen Funktion - zwei
// Aufrufe auf derselben Seite teilen sich also nichts.
//
// Die Zeit wird hereingereicht (`clock`), damit ein Test sie festhalten kann;
// im Editor ist das die echte Uhr.

const MAX_ROWS = 6;
const TITLE = "Was gerade passiert";

export function createProtocolLog({ el, host, labels, clock }) {
  const rows = [];
  const panel = el("div", {
    class: "canvas-view__protocol",
    "data-role": "protocol",
  });
  panel.hidden = true;
  host.append(panel);

  const actionLabel = (action) => labels[action] ?? action ?? "Änderung";
  const timeOf = () =>
    clock().toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  const paint = () => {
    panel.replaceChildren(
      el("div", { class: "canvas-view__protocol-title", text: TITLE }),
      ...rows.map((row) =>
        el(
          "div",
          { class: "canvas-view__protocol-row" },
          el("span", { class: "canvas-view__protocol-actor", text: row.actor }),
          el("span", { class: "canvas-view__protocol-action", text: row.action }),
          el("span", { class: "canvas-view__protocol-time", text: row.time }),
        ),
      ),
    );
    panel.hidden = false;
  };

  return {
    element: panel,
    // Ein Ereignis der Engine: Actor und Aktion. Die neueste Zeile steht oben,
    // die Liste bleibt bei sechs - ein Protokoll, das den Bildschirm fuellt,
    // ist keins mehr.
    log(payload) {
      rows.unshift({
        actor: payload?.actor?.label ?? "Unbekannt",
        action: actionLabel(payload?.action),
        time: timeOf(),
      });
      rows.length = Math.min(rows.length, MAX_ROWS);
      paint();
    },
    // Nur fuer Tests und den Leerzustand: die Merkliste, nicht das DOM.
    rows: () => rows.map((row) => ({ ...row })),
  };
}
