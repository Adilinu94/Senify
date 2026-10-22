// Zustand, Adresse und Auswahl der Referenzen-Seite (P3-2, Schritt 38).
//
// Das Modul ist der Grund, warum sich die grossen Bloecke der Seite nicht
// einzeln schneiden liessen: 17 Funktionen in `app-references.js` lesen und
// schreiben diesen Zustand. Er steht jetzt an EINER Stelle, und die anderen
// holen ihn sich hier - die Voraussetzung dafuer, dass Liste, Sammlungen und
// Inspector spaeter getrennt werden koennen.
//
// Zwei Dinge kommen von aussen herein, beide ueber Setter statt ueber Importe:
// die Sammlungsliste (`refsActiveCollection` liest sie) und die zwei
// Rueckrufe fuer Toast und Tray. Ein Import waere jeweils ein Zyklus.

const REFS_ACCENT_FALLBACK = "#8b91a0";
const REFS_MAX_COMPARE = 3;

export const refsState = {
  query: "",
  collection: "",
  sort: "newest",
  view: "",
  selected: [],
};

/** Die Sammlungsliste, gesetzt nach dem Laden. */
let refsCollections = [];
/** Rueckrufe der Seite: Toast und Neuzeichnen der Ablage. */
let toast = () => {};
let renderTray = () => {};
let updateSelectionUI = () => {};

export function refsBindCollections(list) {
  refsCollections = list;
}

/** Die geladenen Sammlungen (leer, bevor die Seite sie geholt hat). */
export function refsGetCollections() {
  return refsCollections;
}

export function refsBindHandlers(next) {
  if (next.toast) toast = next.toast;
  if (next.renderTray) renderTray = next.renderTray;
  if (next.updateSelectionUI) updateSelectionUI = next.updateSelectionUI;
}

export function refsHex(value) {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value : REFS_ACCENT_FALLBACK;
}

export function refsSplit(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// Zustand aus dem Hash lesen und zurueckschreiben (replaceState, kein Reload).

export function refsApplyAddress(hash) {
  const current = hash ?? location.hash ?? "#/references";
  const question = current.indexOf("?");
  const search = new window.URLSearchParams(
    question === -1 ? "" : current.slice(question + 1),
  );
  refsState.query = search.get("q") ?? "";
  refsState.collection = search.get("collection") ?? "";
  refsState.sort = search.get("sort") === "name" ? "name" : "newest";
  refsState.view = search.get("view") === "styles" ? "styles" : "";
}

export function refsSyncAddress() {
  if (!/^#\/references(\/|\?|$)/.test(location.hash)) return;
  const params = new window.URLSearchParams();
  if (refsState.query !== "") params.set("q", refsState.query);
  if (refsState.collection !== "") params.set("collection", refsState.collection);
  if (refsState.sort === "name") params.set("sort", "name");
  if (refsState.view === "styles") params.set("view", "styles");
  const query = params.toString();
  history.replaceState(
    null,
    "",
    query === "" ? "#/references" : `#/references?${query}`,
  );
}

export function refsActiveCollection() {
  if (refsState.view === "styles") return null;
  if (refsState.collection === "" || refsState.collection === "none") return null;
  return refsCollections.find((entry) => entry.id === refsState.collection) ?? null;
}

export function refsIsSelected(id) {
  return refsState.selected.some((entry) => entry.id === id);
}

export function refsToggleSelection(entry) {
  const index = refsState.selected.findIndex((item) => item.id === entry.id);
  if (index >= 0) {
    refsState.selected.splice(index, 1);
  } else if (refsState.selected.length < REFS_MAX_COMPARE) {
    refsState.selected.push(entry);
  } else {
    toast("Drei ausgewählt. Entferne eine, um eine andere hinzuzufügen.");
    return;
  }
  // Die Auswahl ist reine Ansichtssache: nur die Knöpfe und die Leiste
  // nachziehen, kein neuer Listenabruf (sonst laeuft der Rate-Limiter voll).
  renderTray();
  updateSelectionUI();
}

export function refsClearSelection() {
  refsState.selected = [];
  renderTray();
  updateSelectionUI();
}
