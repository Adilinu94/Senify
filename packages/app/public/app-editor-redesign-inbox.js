// Die Redesign-Inbox am Canvas (ADR-0012) - aus `app-editor.js` (R12).
//
// WARUM EIGENES MODUL: Der Block war ein Teil der 893-Zeilen-Closure
// `mountCanvasView`. Er kennt weder Canvas noch Auswahl noch Speichern; er
// fragt eine Route, zaehlt die offenen Richtungen und zeigt einen Knopf. Genau
// die Sorte Block, die ohne Zustandsbezug herausgeht.
//
// DIE REGEL, DIE ER TRAGEN MUSS (ADR-0012): die Inbox ist ein HINWEIS, nie ein
// Dialog. Sie oeffnet sich nicht selbst, sie stiehlt keinen Fokus, und ein
// fehlgeschlagener Abruf ist kein Grund, das Bearbeiten zu stoeren. Wer sie
// sieht, entscheidet selbst, ob er klickt.
//
// Die Uhr kommt von aussen (`setInterval`/`clearInterval`), damit ein Test das
// Polling ohne Warten pruefen kann; die Route kommt als `fetchProposals`.

const POLL_MS = 12000;

// Offen heisst: eine Richtung wartet auf einen Menschen. Alles andere
// (applied, rejected, expired) gehoert nicht in den Hinweis.
function openOnes(proposals) {
  return (Array.isArray(proposals) ? proposals : []).filter(
    (entry) => entry !== null && typeof entry === "object" && entry.status === "proposed",
  );
}

export function createRedesignInbox({ el, fetchProposals, onOpen, setInterval, clearInterval }) {
  const button = el("button", {
    type: "button",
    class: "ghost",
    "data-action": "redesign-inbox-open",
    "data-role": "redesign-inbox",
    hidden: true,
    text: "Richtungen",
  });

  let proposals = [];
  let timer = null;

  // Zaehlt und schreibt. Immer beide Zustaende: verstecken heisst auch, die
  // Zahl abzuraeumen, sonst zeigt ein versteckter Knopf eine alte Zahl.
  const render = () => {
    const open = openOnes(proposals);
    button.hidden = open.length === 0;
    if (open.length === 0) {
      delete button.dataset.count;
      return;
    }
    button.dataset.count = String(open.length);
    button.textContent = `${open.length} ${open.length === 1 ? "Richtung" : "Richtungen"}`;
  };

  const load = async () => {
    try {
      proposals = await fetchProposals();
    } catch {
      // Ein fehlender Hinweis ist nie ein Blocker fuers Bearbeiten.
      proposals = [];
    }
    render();
    return openOnes(proposals).length;
  };

  button.addEventListener("click", () => {
    const first = openOnes(proposals)[0];
    if (first === undefined) return;
    onOpen(first);
  });

  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  // Einmal laden und dann im festen Takt. Ein zweiter `start` loest den alten
  // Takt zuerst - sonst laufen nach einem Ansichtswechsel zwei Abrufe.
  const start = () => {
    stop();
    void load();
    timer = setInterval(() => {
      void load();
    }, POLL_MS);
  };

  return {
    element: button,
    start,
    stop,
    load,
    // Nur fuer Tests und die Anzeige: was gerade als offen gilt.
    openCount: () => openOnes(proposals).length,
  };
}

export { POLL_MS };
