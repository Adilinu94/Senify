// Die Referenzbibliothek. Die Bloecke standen in `app.js` und
// sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt
// ESLint.

import { AUTHOR, activeTab, api, askConfirm, el, failed, friendlyError, initials, render, routeScope, snapshotImageURL, toast } from "./app-core.js";
import { linesToList, openSnapshotDialog } from "./app-projects.js";
import { renderRoute } from "./app.js";
import { refsRenderMarkdown } from "./app-markdown.js";

async function deleteReference(reference) {
  const used = reference.usedInProjects.length;
  const message =
    used > 0
      ? `„${reference.name}“ ist ${used} Projekt(en) zugeordnet. Trotzdem löschen?`
      : `„${reference.name}“ löschen?`;
  const sure = await askConfirm({
    title: "Referenz löschen?",
    message,
    confirmLabel: "Löschen",
    danger: true,
  });
  if (!sure) return;
  try {
    await api(`/api/references/${reference.id}${used > 0 ? "?force=1" : ""}`, {
      method: "DELETE",
    });
    // Das offene Fenster zeigt eine geloeschte Referenz: erst schliessen.
    if (refsInspector && refsInspector.dialog.open) refsInspector.dialog.close();
    refsToast("Referenz gelöscht");
    // The deleted detail is gone: fall back to the library list.
    if (location.hash.startsWith("#/references")) location.hash = "#/references";
    else await renderRoute();
  } catch (error) {
    failed(error);
  }
}

/* Referenzen-Bibliothek (T14): die Liste mit linker Leiste, Sammlungen,
   Vergleich, Anlegen und Stil-Guide im Zuschnitt des Vorbilds. Der Zustand lebt
   in der Adresse (`?q=&collection=&sort=&view=`), die Texte sind Deutsch mit
   englischen Fachbegriffen. */

const REFS_ACCENT_FALLBACK = "#8b91a0";
const REFS_MAX_COMPARE = 3;
const REFS_SEARCH_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';

// Symbole als eingebettete SVG statt typografischer Zeichen (▦ ◈ ＋ ↗ ✕ ← →).
// Alle 24x24 mit `currentColor`, feste Groesse je Einbauort: 15px in der Leiste
// und an den Karten, 17px in den Icon-Knoepfen, 25px in der Vergleichsauswahl.

function refsIcon(path, size) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

const REFS_ICON_LIBRARY = refsIcon(
  '<rect x="3.6" y="3.6" width="7" height="7" rx="1.6"/><rect x="13.4" y="3.6" width="7" height="7" rx="1.6"/><rect x="3.6" y="13.4" width="7" height="7" rx="1.6"/><rect x="13.4" y="13.4" width="7" height="7" rx="1.6"/>',
  15,
);
const REFS_ICON_STYLES = refsIcon(
  '<path d="M12 3.6 20.4 12 12 20.4 3.6 12Z"/><path d="M12 8.6 15.4 12 12 15.4 8.6 12Z"/>',
  15,
);
const REFS_ICON_LINK = refsIcon('<path d="M8.2 15.8 15.8 8.2M9.6 8.2h6.2v6.2"/>', 15);
const REFS_ICON_LINK_BUTTON = refsIcon('<path d="M8.2 15.8 15.8 8.2M9.6 8.2h6.2v6.2"/>', 13);
const REFS_ICON_LINK_LABEL = refsIcon('<path d="M8.2 15.8 15.8 8.2M9.6 8.2h6.2v6.2"/>', 12);
const REFS_ICON_PLUS = refsIcon('<path d="M12 5.4v13.2M5.4 12h13.2"/>', 15);
const REFS_ICON_PLUS_BUTTON = refsIcon('<path d="M12 5.4v13.2M5.4 12h13.2"/>', 13);
const REFS_ICON_PLUS_UPLOAD = refsIcon('<path d="M12 5.4v13.2M5.4 12h13.2"/>', 25);
const REFS_ICON_CLOSE = refsIcon('<path d="M6.8 6.8 17.2 17.2M17.2 6.8 6.8 17.2"/>', 17);
const REFS_ICON_PREV = refsIcon('<path d="M14.4 5.6 8 12l6.4 6.4"/>', 17);
const REFS_ICON_NEXT = refsIcon('<path d="M9.6 5.6 16 12l-6.4 6.4"/>', 17);
const REFS_ICON_SEARCH_LARGE = refsIcon(
  '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  35,
);
const REFS_ICON_PLUS_BOX = refsIcon('<path d="M12 6.2v11.6M6.2 12h11.6"/>', 25);
const REFS_ICON_CHECK_BOX = refsIcon('<path d="M5.6 12.4 10 16.8 18.4 7.6"/>', 25);

let refsCollections = [];
let refsStyleCatalog = null;
let refsRouteActive = false;

// Der Router setzt das Flag, wenn die Referenzroute laeuft: das Tray blendet
// sich aus, sobald die Route die Bibliothek verlaesst.
export function setRefsRouteActive(value) {
  refsRouteActive = value;
}

export function isRefsRouteActive() {
  return refsRouteActive;
}

let refsDom = null;
export let refsTray = null;
let refsQueryTimer = null;
let refsEmptyMode = "reset";
let refsTrayIds = [];
let refsPending = 0;

// Eine Snapshot-Vorschau laedt das Programm genau einmal und teilt sie sich:
// Karte, Miniatur, Vergleich und Detailseite zeigen dieselbe Blob-Adresse.
// Sonst fragt jeder Neuaufbau dieselben Bilder erneut an und laeuft ins
// Kontingent der API.

const refsImageSources = new Map();

function refsImageSource(url) {
  let pending = refsImageSources.get(url);
  if (!pending) {
    pending = fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`);
        return URL.createObjectURL(await response.blob());
      })
      .catch((error) => {
        refsImageSources.delete(url);
        throw error;
      });
    refsImageSources.set(url, pending);
  }
  return pending;
}

// Kartenbilder laden erst, wenn die Karte in Sicht kommt: die Bibliothek kann
// mehrere hundert Referenzen halten, und jede Aufnahme ist ein paar hundert
// Kilobyte gross.

let refsImageObserver = null;

function refsLoadOnSight(image, load) {
  if (typeof IntersectionObserver !== "function") {
    load();
    return;
  }
  if (refsImageObserver === null) {
    refsImageObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          refsImageObserver.unobserve(entry.target);
          entry.target.refsLoad?.();
        }
      },
      { rootMargin: "320px" },
    );
  }
  image.refsLoad = load;
  refsImageObserver.observe(image);
}

function refsPreviewImage(url, alt, fallback) {
  const image = el("img", { alt });
  refsLoadOnSight(image, () => {
    refsImageSource(url).then(
      (src) => {
        image.src = src;
      },
      () => {
        if (fallback) image.replaceWith(fallback());
      },
    );
  });
  return image;
}

const refsState = {
  query: "",
  collection: "",
  sort: "newest",
  view: "",
  selected: [],
};

function refsHex(value) {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value : REFS_ACCENT_FALLBACK;
}

function refsSplit(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// Zustand aus dem Hash lesen und zurueckschreiben (replaceState, kein Reload).

function refsApplyAddress(hash) {
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

function refsSyncAddress() {
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

function refsActiveCollection() {
  if (refsState.view === "styles") return null;
  if (refsState.collection === "" || refsState.collection === "none") return null;
  return refsCollections.find((entry) => entry.id === refsState.collection) ?? null;
}

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

function refsCopy(text, message) {
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

function refsIsSelected(id) {
  return refsState.selected.some((entry) => entry.id === id);
}

function refsToggleSelection(entry) {
  const index = refsState.selected.findIndex((item) => item.id === entry.id);
  if (index >= 0) {
    refsState.selected.splice(index, 1);
  } else if (refsState.selected.length < REFS_MAX_COMPARE) {
    refsState.selected.push(entry);
  } else {
    refsToast("Drei ausgewählt. Entferne eine, um eine andere hinzuzufügen.");
    return;
  }
  // Die Auswahl ist reine Ansichtssache: nur die Knöpfe und die Leiste
  // nachziehen, kein neuer Listenabruf (sonst laeuft der Rate-Limiter voll).
  refsRenderTray();
  refsUpdateSelectionUI();
}

function refsClearSelection() {
  refsState.selected = [];
  refsRenderTray();
  refsUpdateSelectionUI();
}

// Nur die Auswahl-Knoepfe der vorhandenen Karten umschalten, damit die
// Vorschaubilder nicht erneut geladen werden.

function refsUpdateSelectionUI() {
  if (!refsDom || !refsDom.root.isConnected) return;
  for (const card of refsDom.gallery.querySelectorAll(".refs-card")) {
    const id = card.dataset.reference;
    const on = refsIsSelected(id);
    const button = card.querySelector(".refs-select");
    if (!button) continue;
    button.classList.toggle("selected", on);
    button.innerHTML = on ? REFS_ICON_CHECK_BOX : REFS_ICON_PLUS_BOX;
    button.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

function refsEntryFor(reference) {
  // Die Motion-Aufnahme ist ein Video und taugt nicht als Standbild.
  const snapshot = (reference.snapshots ?? []).find(
    (shot) => shot.previewPath && shot.kind !== "motion",
  );
  return {
    id: reference.id,
    name: reference.name,
    previewPath: snapshot ? snapshotImageURL(reference.id, snapshot) : null,
    family: reference.family ?? (reference.families ?? [])[0] ?? null,
    collectionName: reference.collection ? reference.collection.name : null,
    vocabulary: reference.vocabulary ?? [],
    note: reference.note ?? null,
  };
}

function refsNavItem(input) {
  const button = el(
    "button",
    {
      type: "button",
      class: `refs-nav-item${input.active ? " active" : ""}`,
      onclick: input.onClick,
      ...(input.active ? { "aria-current": "page" } : {}),
    },
    input.dot
      ? el("span", { class: "refs-dot", style: `--refs-dot:${input.dot}` })
      : el("span", { class: "refs-nav-icon", "aria-hidden": "true", html: input.icon }),
    el("span", { text: input.label }),
    el("span", { class: "refs-nav-count", text: String(input.count) }),
  );
  return button;
}

/* ------------------------------------------------------------- comparison */

function refsTrayEnsure() {
  if (refsTray) return refsTray;
  refsTray = el(
    "div",
    { class: "refs-compare-tray", hidden: "hidden" },
    el("div", { class: "refs-tray-thumbs" }),
    el("span", { class: "refs-tray-count", text: `0 / ${REFS_MAX_COMPARE} ausgewählt` }),
    el("button", {
      type: "button",
      class: "refs-button quiet",
      text: "Leeren",
      onclick: () => refsClearSelection(),
    }),
    el("button", {
      type: "button",
      class: "refs-button primary",
      onclick: () => refsOpenComparison(),
    }, "Referenzen vergleichen", el("span", { "aria-hidden": "true", html: REFS_ICON_LINK_BUTTON })),
  );
  document.body.append(refsTray);
  return refsTray;
}

function refsThumbNode(entry) {
  if (entry.previewPath) {
    return refsPreviewImage(entry.previewPath, `Vorschau ${entry.name}`);
  }
  return el("div", { class: "refs-tray-more", text: initials(entry.name) });
}

export function refsRenderTray() {
  const tray = refsTrayEnsure();
  const selected = refsState.selected;
  tray.hidden = selected.length === 0 || !isRefsRouteActive();
  const ids = selected.map((entry) => entry.id);
  // Die Miniaturen nur neu aufbauen, wenn sich die Auswahl geaendert hat
  // (jede Neuanlage laedt die Vorschauen erneut und kostet Rate-Limit).
  if (ids.join(",") !== refsTrayIds.join(",")) {
    refsTrayIds = ids;
    tray
      .querySelector(".refs-tray-thumbs")
      .replaceChildren(...selected.map((entry) => refsThumbNode(entry)));
  }
  tray.querySelector(".refs-tray-count").textContent =
    `${selected.length} / ${REFS_MAX_COMPARE} ausgewählt`;
  const compareButton = tray.querySelector(".refs-button.primary");
  compareButton.disabled = selected.length < 2;
}

async function refsOpenComparison() {
  if (refsState.selected.length < 2) return;
  const entries = [...refsState.selected];
  const grid = el("div", { class: "refs-compare-grid" });
  grid.style.setProperty("--refs-cols", String(entries.length));
  for (const entry of entries) {
    grid.append(
      el(
        "article",
        { class: "refs-compare-item" },
        el(
          "div",
          { class: "refs-compare-image" },
          entry.previewPath
            ? refsPreviewImage(entry.previewPath, `Vorschau ${entry.name}`)
            : el("div", { class: "refs-card-placeholder", text: initials(entry.name) }),
        ),
        el("h3", { text: entry.name }),
        el("p", { class: "refs-brief-family", text: entry.family ?? "Ohne Familie" }),
        el(
          "div",
          { class: "refs-tags" },
          (entry.vocabulary ?? []).slice(0, 3).map((word) => el("span", { text: word })),
        ),
        el("p", { text: entry.note ?? "Keine Notiz." }),
        el("button", {
          type: "button",
          class: "refs-button",
          onclick: () => {
            dialog.close();
            location.hash = `#/references/${entry.id}`;
          },
        }, "Referenz öffnen", el("span", { "aria-hidden": "true", html: REFS_ICON_LINK_BUTTON })),
      ),
    );
  }
  const dialog = el(
    "dialog",
    { class: "refs-dialog wide refs-compare-dialog" },
    el(
      "div",
      { class: "refs-dialog-head" },
      el(
        "div",
        {},
        el("div", { class: "refs-eyebrow", text: "Zusammen erkunden" }),
        el("h2", { text: "Referenzen vergleichen" }),
      ),
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
    grid,
    el(
      "div",
      { class: "refs-compare-footer" },
      el("p", {
        text: "Ein Brief mit allen gewählten Referenzen, ihrem Vokabular und Bildrezept.",
      }),
      el("button", {
        type: "button",
        class: "refs-button primary",
        text: "Brief zusammen kopieren",
        onclick: () => refsCopyCombined(entries.map((entry) => entry.id)),
      }),
    ),
  );
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  refsBindBackdropClose(dialog);
  dialog.showModal();
}

async function refsCopyCombined(ids) {
  try {
    const result = await api("/api/references/brief", {
      method: "POST",
      body: { referenceIds: ids },
    });
    refsCopy(result.brief.text, "Brief kopiert");
  } catch (error) {
    failed(error);
  }
}

/* ------------------------------------------------------------ collections */

function refsOpenCollectionPicker(collections) {
  const dialog = el(
    "dialog",
    { class: "refs-dialog refs-collection-picker" },
    el(
      "div",
      { class: "refs-dialog-head" },
      el("h2", { text: "Weitere Sammlungen" }),
      el("button", {
        type: "button",
        class: "refs-icon-button",
        "aria-label": "Schließen",
        html: REFS_ICON_CLOSE,
        onclick: () => dialog.close(),
      }),
    ),
    el(
      "div",
      { class: "refs-dialog-body refs-collection-picker-body" },
      collections.map((collection) =>
        el(
          "button",
          {
            type: "button",
            class: "refs-collection-picker-item",
            onclick: () => {
              dialog.close();
              refsSetCollection(collection.id);
            },
          },
          el("span", { class: "refs-dot", style: `--refs-dot:${refsHex(collection.accent)}` }),
          el("span", { text: collection.name }),
          el("span", { class: "refs-nav-count", text: String(collection.referenceCount ?? 0) }),
        ),
      ),
    ),
  );
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  refsBindBackdropClose(dialog);
  dialog.showModal();
}

function refsOpenCollectionDialog(collection) {
  if (!collection) return;
  const dialog = el(
    "dialog",
    { class: "refs-dialog refs-collection-dialog" },
    el(
      "div",
      { class: "refs-dialog-head" },
      el("h2", { text: collection.name }),
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
      el("p", { text: collection.description || "Keine Beschreibung." }),
      el(
        "div",
        { class: "refs-detail-section" },
        el("h3", { text: "Passt gut für" }),
        el("p", { text: collection.deployFor || "Nicht angegeben." }),
      ),
      el(
        "div",
        { class: "refs-detail-section" },
        el("h3", { text: "Design-Vokabular" }),
        el("div", { class: "refs-tags" }, collection.vocabulary.map((word) => el("span", { text: word }))),
      ),
      el(
        "div",
        { class: "refs-detail-section" },
        el("h3", { text: "Eine Richtung zum Erkunden" }),
        el("p", { text: collection.risk || "Nicht angegeben." }),
      ),
      el(
        "div",
        { class: "refs-row-actions" },
        el("button", {
          type: "button",
          class: "refs-button primary",
          text: "Sammlungs-Brief kopieren",
          onclick: () => refsCopyCollectionBrief(collection.id),
        }),
        el("button", {
          type: "button",
          class: "refs-button",
          text: "Vokabular kopieren",
          onclick: () => refsCopy(collection.vocabulary.join(", "), "Vokabular kopiert"),
        }),
        el("button", {
          type: "button",
          class: "refs-button quiet",
          text: "Bearbeiten",
          onclick: () => {
            dialog.close();
            refsOpenCollectionForm(collection);
          },
        }),
        el("button", {
          type: "button",
          class: "refs-button danger",
          text: "Löschen",
          onclick: () => refsDeleteCollection(collection),
        }),
      ),
    ),
  );
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  refsBindBackdropClose(dialog);
  dialog.showModal();
}

async function refsCopyCollectionBrief(collectionId) {
  try {
    const result = await api(`/api/reference-collections/${collectionId}/brief`);
    refsCopy(result.brief.text, "Sammlungs-Brief kopiert");
  } catch (error) {
    failed(error);
  }
}

function refsOpenCollectionForm(collection) {
  const editing = collection ?? null;
  const nameInput = el("input", {
    class: "refs-input",
    type: "text",
    maxlength: "120",
    placeholder: "Name der Sammlung",
  });
  nameInput.value = editing ? editing.name : "";
  const descriptionInput = el("textarea", { class: "refs-input", rows: "3", maxlength: "2000" });
  descriptionInput.value = editing ? editing.description : "";
  const deployInput = el("input", { class: "refs-input", type: "text", maxlength: "400" });
  deployInput.value = editing ? editing.deployFor : "";
  const vocabularyInput = el("input", {
    class: "refs-input",
    type: "text",
    maxlength: "2000",
    placeholder: "oversized typography, grain, quiet space",
  });
  vocabularyInput.value = editing ? editing.vocabulary.join(", ") : "";
  const riskInput = el("input", { class: "refs-input", type: "text", maxlength: "500" });
  riskInput.value = editing ? editing.risk : "";
  const accentInput = el("input", { class: "refs-input", type: "color" });
  accentInput.value = editing ? refsHex(editing.accent) : "#6346d7";
  const imageInput = el("textarea", { class: "refs-input", rows: "3", maxlength: "2000" });
  imageInput.value = editing ? editing.imageStyle : "";
  const errorEl = el("p", { class: "refs-form-error", role: "alert" });
  const submit = el("button", {
    type: "submit",
    class: "refs-button primary",
    text: editing ? "Sammlung speichern" : "Sammlung anlegen",
  });

  const dialog = el(
    "dialog",
    { class: "refs-dialog refs-collection-form" },
    el(
      "div",
      { class: "refs-dialog-head" },
      el("h2", { text: editing ? "Sammlung bearbeiten" : "Sammlung anlegen" }),
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
      "form",
      {
        class: "refs-dialog-body",
        onsubmit: async (event) => {
          event.preventDefault();
          const name = nameInput.value.trim();
          if (name === "") {
            errorEl.textContent = "Bitte einen Namen angeben.";
            return;
          }
          const body = {
            name,
            description: descriptionInput.value.trim(),
            deployFor: deployInput.value.trim(),
            vocabulary: refsSplit(vocabularyInput.value),
            risk: riskInput.value.trim(),
            accent: accentInput.value,
            imageStyle: imageInput.value.trim(),
          };
          submit.disabled = true;
          try {
            const result = editing
              ? await api(`/api/reference-collections/${editing.id}`, {
                  method: "PATCH",
                  body,
                })
              : await api("/api/reference-collections", { method: "POST", body });
            refsToast(editing ? "Sammlung gespeichert" : "Sammlung angelegt");
            dialog.close();
            refsState.collection = result.collection.id;
            refsState.view = "";
            refsSyncAddress();
            await refsRefresh();
          } catch (error) {
            errorEl.textContent = error.message;
          } finally {
            submit.disabled = false;
          }
        },
      },
      el("label", { class: "refs-field-label", text: "Name" }),
      nameInput,
      el("label", { class: "refs-field-label", text: "Beschreibung" }),
      descriptionInput,
      el("label", { class: "refs-field-label", text: "Passt gut für" }),
      deployInput,
      el("label", { class: "refs-field-label", text: "Vokabular (Komma-getrennt)" }),
      vocabularyInput,
      el("label", { class: "refs-field-label", text: "Eine Richtung zum Erkunden" }),
      riskInput,
      el("label", { class: "refs-field-label", text: "Farbe" }),
      accentInput,
      el("label", { class: "refs-field-label", text: "Bildrezept" }),
      imageInput,
      errorEl,
      el("div", { class: "refs-row-actions" }, submit),
    ),
  );
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  refsBindBackdropClose(dialog);
  dialog.showModal();
}

async function refsDeleteCollection(collection) {
  const count = collection.referenceCount ?? 0;
  const message =
    count > 0
      ? `„${collection.name}“ löschen? ${count} Referenz(en) bleiben erhalten und werden keiner Sammlung mehr zugeordnet.`
      : `„${collection.name}“ löschen?`;
  const sure = await askConfirm({
    title: "Sammlung löschen?",
    message,
    confirmLabel: "Löschen",
    danger: true,
  });
  if (!sure) return;
  try {
    const result = await api(`/api/reference-collections/${collection.id}`, {
      method: "DELETE",
    });
    refsToast(
      result.affectedReferences > 0
        ? `Sammlung gelöscht, ${result.affectedReferences} Referenz(en) ohne Sammlung`
        : "Sammlung gelöscht",
    );
    if (refsState.collection === collection.id) refsState.collection = "";
    refsSyncAddress();
    await refsRefresh();
  } catch (error) {
    failed(error);
  }
}

/* ------------------------------------------------------------ add dialog */

function refsReadBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new window.FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Die Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

function refsOpenAddDialog() {
  const fileInput = el("input", {
    type: "file",
    accept: "image/png,image/jpeg,image/webp",
    "aria-label": "Screenshot wählen",
  });
  const uploadLabel = el("strong", { text: "Screenshot wählen" });
  const preview = el("img", { class: "refs-upload-preview", alt: "Vorschau der neuen Referenz" });
  preview.hidden = true;
  const nameInput = el("input", {
    class: "refs-input",
    type: "text",
    maxlength: "120",
    placeholder: "Ein Name, den du wiedererkennst",
  });
  const collectionSelect = el("select", {});
  collectionSelect.append(el("option", { value: "", text: "Ohne Sammlung" }));
  for (const item of refsCollections.filter((entry) => entry.kind === "collection")) {
    collectionSelect.append(el("option", { value: item.id, text: item.name }));
  }
  if (refsActiveCollection()) collectionSelect.value = refsState.collection;
  const noteInput = el("textarea", {
    class: "refs-input",
    rows: "3",
    maxlength: "1000",
    placeholder: "Die Komposition, die Typografie, dieser bestimmte Blauton…",
  });
  const vocabularyInput = el("input", {
    class: "refs-input",
    type: "text",
    placeholder: "oversized typography, grain, quiet space",
  });
  const recipeInput = el("textarea", {
    class: "refs-input",
    rows: "3",
    placeholder: "Optional. Ohne Angabe greift das Rezept der Sammlung.",
  });
  const errorEl = el("p", { class: "refs-form-error", role: "alert" });
  const uploadSubmit = el("button", {
    type: "submit",
    class: "refs-button primary",
    text: "Referenz speichern",
  });

  const urlInput = el("input", {
    class: "refs-input",
    type: "text",
    placeholder: "https://…",
  });
  const urlNameInput = el("input", {
    class: "refs-input",
    type: "text",
    maxlength: "120",
    placeholder: "Optionaler Name",
  });
  const urlSubmit = el("button", {
    type: "submit",
    class: "refs-button primary",
    text: "URL analysieren",
  });

  const uploadForm = el(
    "form",
    {
      class: "refs-add-upload",
      onsubmit: async (event) => {
        event.preventDefault();
        const file = fileInput.files[0];
        const name = nameInput.value.trim();
        if (!file) {
          errorEl.textContent = "Bitte ein Bild wählen.";
          return;
        }
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
          errorEl.textContent = "Bitte ein PNG, JPEG oder WebP wählen.";
          return;
        }
        if (file.size > 20 * 1024 * 1024) {
          errorEl.textContent = "Bitte ein Bild kleiner als 20 MB wählen.";
          return;
        }
        if (name === "") {
          errorEl.textContent = "Bitte einen Namen angeben.";
          return;
        }
        uploadSubmit.disabled = true;
        uploadSubmit.textContent = "Speichere…";
        try {
          const image = await refsReadBase64(file);
          const result = await api("/api/references/manual", {
            method: "POST",
            body: {
              name,
              collectionId: collectionSelect.value === "" ? null : collectionSelect.value,
              note: noteInput.value.trim(),
              vocabulary: refsSplit(vocabularyInput.value),
              imageRecipe: recipeInput.value.trim(),
              image,
              author: AUTHOR,
            },
          });
          refsToast("Referenz gespeichert");
          dialog.close();
          refsState.collection = result.reference.collectionId ?? "";
          refsState.view = "";
          refsSyncAddress();
          await refsRefresh();
        } catch (error) {
          errorEl.textContent = error.message;
        } finally {
          uploadSubmit.disabled = false;
          uploadSubmit.textContent = "Referenz speichern";
        }
      },
    },
    el(
      "label",
      { class: "refs-upload-zone" },
      el("span", { class: "refs-upload-icon", "aria-hidden": "true", html: REFS_ICON_PLUS_UPLOAD }),
      uploadLabel,
      el("span", { text: "PNG, JPEG oder WebP · bis 20 MB" }),
      fileInput,
    ),
    preview,
    el("label", { class: "refs-field-label", text: "Name" }),
    nameInput,
    el("label", { class: "refs-field-label", text: "Sammlung" }),
    collectionSelect,
    el("label", { class: "refs-field-label", text: "Was ist dir aufgefallen?" }),
    noteInput,
    el(
      "details",
      { class: "refs-additional" },
      el("summary", { text: "Vokabular und Bildrezept hinzufügen" }),
      el("label", { class: "refs-field-label", text: "Vokabular (Komma-getrennt)" }),
      vocabularyInput,
      el("label", { class: "refs-field-label", text: "Bildrezept" }),
      recipeInput,
    ),
    el("p", {
      class: "refs-field-help",
      text: "Gespeichert in deiner Referenz-Bibliothek und nach dem Neuladen verfügbar.",
    }),
    errorEl,
    el("div", { class: "refs-row-actions" }, uploadSubmit),
  );
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    errorEl.textContent = "";
    preview.hidden = true;
    if (!file) return;
    uploadLabel.textContent = file.name;
    if (file.size <= 20 * 1024 * 1024 && file.type.startsWith("image/")) {
      preview.src = URL.createObjectURL(file);
      preview.hidden = false;
    }
    if (nameInput.value === "") {
      nameInput.value = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
    }
  });

  const urlForm = el(
    "form",
    {
      class: "refs-add-url",
      onsubmit: async (event) => {
        event.preventDefault();
        const url = urlInput.value.trim();
        if (url === "") {
          errorEl.textContent = "Bitte eine URL angeben.";
          return;
        }
        urlSubmit.disabled = true;
        urlSubmit.textContent = "Analysiere…";
        try {
          const body = { url, author: AUTHOR, wait: true };
          const name = urlNameInput.value.trim();
          if (name !== "") body.name = name;
          const result = await api("/api/references", { method: "POST", body });
          const reference = result.reference;
          if (reference.status === "failed") {
            refsToast(
              `Analyse fehlgeschlagen: ${reference.failureReason ?? "unbekannt"} — nutze „Aus Quelltext“ als Fallback.`,
            );
          } else {
            refsToast("Referenz analysiert");
          }
          dialog.close();
          location.hash = `#/references/${reference.id}`;
        } catch (error) {
          errorEl.textContent = error.message;
        } finally {
          urlSubmit.disabled = false;
          urlSubmit.textContent = "URL analysieren";
        }
      },
    },
    el("label", { class: "refs-field-label", text: "URL" }),
    urlInput,
    el("label", { class: "refs-field-label", text: "Name (optional)" }),
    urlNameInput,
    el("p", {
      class: "refs-field-help",
      text: "Die Analyse startet direkt; bei blockierten Seiten hilft der Weg über den Seiten-Quelltext.",
    }),
    errorEl,
    el(
      "div",
      { class: "refs-row-actions" },
      urlSubmit,
      el("button", {
        type: "button",
        class: "refs-button quiet",
        text: "Aus Quelltext",
        onclick: () => {
          dialog.close();
          openSnapshotDialog();
        },
      }),
    ),
  );

  urlForm.hidden = true;
  const uploadTab = el("button", { type: "button", class: "active", text: "Screenshot hochladen" });
  const urlTab = el("button", { type: "button", text: "URL analysieren" });
  const showMode = (mode) => {
    const upload = mode === "upload";
    uploadForm.hidden = !upload;
    urlForm.hidden = upload;
    uploadTab.classList.toggle("active", upload);
    urlTab.classList.toggle("active", !upload);
    errorEl.textContent = "";
  };
  uploadTab.addEventListener("click", () => showMode("upload"));
  urlTab.addEventListener("click", () => showMode("url"));

  const dialog = el(
    "dialog",
    { class: "refs-dialog refs-add-dialog" },
    el(
      "div",
      { class: "refs-dialog-head" },
      el("h2", { text: "Referenz hinzufügen" }),
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
      el("div", { class: "refs-modal-tabs" }, uploadTab, urlTab),
      uploadForm,
      urlForm,
    ),
  );
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  refsBindBackdropClose(dialog);
  dialog.showModal();
}

/* ------------------------------------------------------------ style guide */

function refsStyleCard(collection) {
  const accent = refsHex(collection.accent);
  const preview = el(
    "div",
    { class: "refs-style-preview" },
    el("strong", { text: collection.name }),
    el("small", { text: collection.deployFor || "Stilfamilie" }),
  );
  if (/^#[0-9a-f]{6}$/i.test(collection.accent ?? "")) {
    preview.style.setProperty("--refs-preview", `${accent}22`);
    preview.style.setProperty("--refs-preview-ink", accent);
  }
  return el(
    "article",
    { class: "refs-style-card" },
    preview,
    el(
      "div",
      { class: "refs-style-copy" },
      el("h2", { text: collection.name }),
      el("p", { text: collection.recognize.join(" · ") || collection.description || "" }),
      el(
        "div",
        { class: "refs-tags" },
        collection.vocabulary.map((word) => el("span", { text: word })),
      ),
      collection.warning
        ? el("p", { class: "refs-style-warning", text: collection.warning })
        : undefined,
      el(
        "div",
        { class: "refs-style-links" },
        collection.examples
          .filter((example) => /^https?:\/\//.test(example.url))
          .map((example) =>
            el(
              "a",
              {
                href: example.url,
                target: "_blank",
                rel: "noopener noreferrer",
              },
              example.name,
              el("span", { class: "refs-style-arrow", "aria-hidden": "true", html: REFS_ICON_LINK_LABEL }),
            ),
          ),
      ),
      el(
        "div",
        { class: "refs-style-actions" },
        el("button", {
          type: "button",
          class: "refs-button",
          text: "Brief kopieren",
          onclick: () => refsCopyCollectionBrief(collection.id),
        }),
        el("button", {
          type: "button",
          class: "refs-button quiet",
          text: "Vokabular kopieren",
          onclick: () => refsCopy(collection.vocabulary.join(", "), "Vokabular kopiert"),
        }),
      ),
    ),
  );
}

/* ---------------------------------------------------------------- shell */

function refsBuildShell() {
  const libraryNav = el("nav", { "aria-label": "Bibliothek" });
  const collectionNav = el("nav", { "aria-label": "Sammlungen" });
  const collectionCount = el("span", { class: "refs-nav-count" });
  const sidebarCount = el("span", {});
  const sidebar = el(
    "aside",
    { class: "refs-sidebar", "aria-label": "Bibliothek-Navigation" },
    el("div", { class: "refs-sidebar-heading", style: "margin-top: 0" }, el("span", { text: "Bibliothek" })),
    libraryNav,
    el(
      "div",
      { class: "refs-sidebar-heading refs-collection-label" },
      el("span", {}, "Sammlungen ", collectionCount),
      el("button", {
        type: "button",
        class: "refs-sidebar-add",
        title: "Sammlung anlegen",
        html: REFS_ICON_PLUS,
        onclick: () => refsOpenCollectionForm(null),
      }),
    ),
    collectionNav,
    el(
      "div",
      { class: "refs-sidebar-footer" },
      el("span", {}, el("span", { class: "refs-status-dot" }), "Deine Sammlung, auf deinem Rechner."),
      sidebarCount,
    ),
  );

  const titleText = el("h1", { text: "Alle Referenzen" });
  const countEl = el("span", { class: "refs-count", text: "0" });
  const description = el("p", {});
  const aboutButton = el(
    "button",
    {
      type: "button",
      class: "refs-button quiet",
      onclick: () => refsOpenCollectionDialog(refsActiveCollection()),
    },
    "Über diese Sammlung ",
    el("span", { "aria-hidden": "true", html: REFS_ICON_LINK }),
  );
  aboutButton.hidden = true;
  // Die Seitenaktionen sitzen im Kopf (rechter Platz der Ueberschrift), weil
  // unsere App-Kopfzeile die Navigation traegt. Der Hauptbereich beginnt so
  // genau wie im Vorbild unter der Kopfzeile.
  const addButton = el(
    "button",
    {
      type: "button",
      class: "refs-button primary",
      onclick: () => refsOpenAddDialog(),
    },
    el("span", { "aria-hidden": "true", html: REFS_ICON_PLUS_BUTTON }),
    " Referenz hinzufügen",
  );
  const headingActions = el(
    "div",
    { class: "refs-heading-actions" },
    aboutButton,
    addButton,
  );
  const heading = el(
    "section",
    { class: "refs-heading" },
    el(
      "div",
      {},
      el("div", { class: "refs-heading-title" }, titleText, countEl),
      description,
    ),
    headingActions,
  );

  const searchInput = el("input", {
    type: "search",
    "aria-label": "Referenzen, Stile und Details suchen",
    placeholder: "Referenzen, Stile, Details suchen…",
  });
  searchInput.value = refsState.query;
  searchInput.addEventListener("input", () => {
    refsState.query = searchInput.value.trim();
    refsSyncAddress();
    if (refsQueryTimer) clearTimeout(refsQueryTimer);
    refsQueryTimer = setTimeout(() => void refsRefresh(), 220);
  });
  const search = el("label", { class: "refs-search" });
  search.innerHTML = REFS_SEARCH_ICON;
  search.append(searchInput, el("kbd", { "aria-hidden": "true", text: "/" }));
  const sortSelect = el("select", { "aria-label": "Sortierung" });
  sortSelect.append(
    el("option", { value: "newest", text: "Neueste zuerst" }),
    el("option", { value: "name", text: "Name A–Z" }),
  );
  sortSelect.value = refsState.sort;
  sortSelect.addEventListener("change", () => {
    refsState.sort = sortSelect.value === "name" ? "name" : "newest";
    refsSyncAddress();
    void refsRefresh();
  });
  const toolbar = el(
    "div",
    { class: "refs-toolbar" },
    search,
    el("label", { class: "refs-sort" }, el("span", { text: "Sortieren" }), sortSelect),
  );

  // Fortschrittsbalken unter der Werkzeugleiste. Seine Hoehe ist immer
  // reserviert, damit die Liste beim Wechsel nicht springt.
  const progress = el(
    "div",
    { class: "refs-progress", "aria-hidden": "true" },
    el("span", { class: "refs-progress-bar" }),
  );

  const hint = el(
    "div",
    { class: "refs-hint" },
    el("span", { text: "Wähle bis zu 3 Referenzen zum Vergleichen" }),
  );
  const error = el(
    "section",
    { class: "refs-error", role: "alert", hidden: "hidden" },
    el("strong", { text: "Bibliothek konnte nicht geladen werden" }),
    el("span", { class: "refs-error__detail" }),
    el("button", {
      type: "button",
      class: "refs-button",
      text: "Erneut versuchen",
      onclick: () => void refsRefresh(),
    }),
  );
  const gallery = el("div", { class: "refs-gallery" });
  const empty = el(
    "section",
    { class: "refs-empty", hidden: "hidden" },
    el("span", { class: "refs-empty-icon", "aria-hidden": "true", html: REFS_ICON_SEARCH_LARGE }),
    el("h2", { text: "Keine Referenzen gefunden" }),
    el("p", { text: "Versuche ein anderes Wort oder durchsuche die ganze Bibliothek." }),
    el("button", {
      type: "button",
      class: "refs-button",
      text: "Filter zurücksetzen",
      onclick: () => refsEmptyAction(),
    }),
  );
  const footer = el(
    "div",
    { class: "refs-page-footer" },
    el("span", { class: "refs-footer-count" }),
    el("span", { text: "Gute Arbeit beginnt mit einer guten Referenz." }),
  );

  // Unter 1000px ist die linke Leiste ausgeblendet, dann waehlt man die
  // Ansicht ueber dieses Feld (Muster und Maße wie im Vorbild).
  const mobileSelect = el("select", { "aria-label": "Sammlung oder Ansicht wählen" });
  mobileSelect.addEventListener("change", () => {
    if (mobileSelect.value === "styles") refsSetView("styles");
    else if (mobileSelect.value === "") refsSetView("");
    else refsSetCollection(mobileSelect.value);
  });
  const mobileNav = el(
    "label",
    { class: "refs-mobile-nav" },
    el("span", { text: "Sammlung" }),
    mobileSelect,
  );

  const main = el(
    "div",
    { class: "refs-main", id: "refs-main", tabindex: "-1" },
    mobileNav,
    heading,
    toolbar,
    progress,
    hint,
    gallery,
    empty,
    footer,
  );

  // Skip-Link: der erste Fokus der Seite springt zum Hauptinhalt.
  const skipLink = el(
    "a",
    {
      class: "refs-skip-link",
      href: "#refs-main",
      onclick: (event) => {
        event.preventDefault();
        main.focus();
      },
    },
    "Zum Hauptinhalt springen",
  );

  const root = el("div", { class: "refs-shell" }, skipLink, sidebar, main);
  // Die App-Kopfzeile steht sticky ueber der Seite; die Leiste beginnt genau
  // darunter. Statt die Hoehe zu schaetzen, messen wir sie.
  const header = document.querySelector(".topbar");
  if (header) {
    root.style.setProperty(
      "--refs-top",
      `${Math.round(header.getBoundingClientRect().height)}px`,
    );
  }
  refsDom = {
    root,
    main,
    mobileSelect,
    libraryNav,
    collectionNav,
    collectionCount,
    sidebarCount,
    titleText,
    countEl,
    description,
    aboutButton,
    hint,
    error,
    progress,
    searchInput,
    sortSelect,
    gallery,
    empty,
    footer,
  };
  return refsDom;
}

function refsResetFilters() {
  refsState.query = "";
  refsState.collection = "";
  refsState.view = "";
  refsState.sort = "newest";
  if (refsDom) {
    refsDom.searchInput.value = "";
    refsDom.sortSelect.value = "newest";
  }
  refsSyncAddress();
  void refsRefresh();
}

export async function referencesView() {
  const current = routeScope();
  activeTab("references");
  refsApplyAddress();
  const dom = refsBuildShell();
  if (!render([dom.root], current)) return;
  await refsRefresh();
  refsRenderTray();
}

async function refsRefresh() {
  if (!refsDom) return;
  // Adresszustand zuerst in die Bedienelemente spiegeln: Suche und Sortierung
  // stimmen so auch dann, wenn der Listenabruf scheitert.
  refsDom.searchInput.value = refsState.query;
  refsDom.sortSelect.value = refsState.sort;
  // Beim Wechsel bleiben die bisherigen Karten mit reduzierter Deckkraft
  // stehen, darueber laeuft der Fortschrittsbalken. Der Zaehler haelt den
  // Zustand, solange noch ein Abruf offen ist (Suche tippt sich schneller).
  const root = refsDom.root;
  refsPending += 1;
  root.classList.add("refs-loading");
  let data;
  try {
    data = await api(`/api/references?${refsSearchParams().toString()}`);
  } catch (error) {
    // Ein kurzer Fehler (etwa ein erschoepftes Kontingent) darf die Ansicht
    // nicht leeren: die vorhandenen Karten bleiben stehen, nur eine Meldung.
    refsDom.error.hidden = false;
    refsDom.error.querySelector(".refs-error__detail").textContent = friendlyError(error);
    failed(error);
    return;
  } finally {
    refsPending = Math.max(0, refsPending - 1);
    if (refsPending === 0) root.classList.remove("refs-loading");
  }
  refsDom.error.hidden = true;
  refsCollections = data.collections ?? [];
  refsStyleCatalog = data.styleCatalog ?? null;
  const counts = data.counts ?? {};
  const styleMode = refsState.view === "styles";
  const activeCollection = refsActiveCollection();
  const styleFamilies = refsCollections.filter((entry) => entry.kind === "style");
  const personalCollections = refsCollections.filter((entry) => entry.kind !== "style");

  // Mobil: dasselbe Ziel wie die linke Leiste, nur als Auswahlfeld.
  refsDom.mobileSelect.replaceChildren(
    el("option", { value: "", text: "Alle Referenzen" }),
    ...personalCollections.map((collection) =>
      el("option", {
        value: collection.id,
        text: `${collection.name} (${collection.referenceCount ?? 0})`,
      }),
    ),
    el("option", { value: "styles", text: "Stil-Guide" }),
  );
  refsDom.mobileSelect.value = styleMode ? "styles" : refsState.collection;

  // Linke Leiste
  refsDom.libraryNav.replaceChildren(
    refsNavItem({
      label: "Alle Referenzen",
      count: counts.references ?? 0,
      icon: REFS_ICON_LIBRARY,
      active: !styleMode && refsState.collection === "",
      onClick: () => refsSetView(""),
    }),
    refsNavItem({
      label: "Stil-Guide",
      count: counts.styles ?? 0,
      icon: REFS_ICON_STYLES,
      active: styleMode,
      onClick: () => refsSetView("styles"),
    }),
  );
  refsDom.collectionCount.textContent = String(personalCollections.length);
  if (personalCollections.length === 0) {
    refsDom.collectionNav.replaceChildren(
      el("div", { class: "muted", style: "font-size: 11px; padding: 0 12px", text: "Noch keine Sammlungen." }),
    );
  } else {
    const sortedCollections = [...personalCollections].sort(
      (a, b) => (b.referenceCount ?? 0) - (a.referenceCount ?? 0),
    );
    const visibleCollections = sortedCollections.slice(0, 6);
    const activeCollection = sortedCollections.find(
      (collection) => !styleMode && refsState.collection === collection.id,
    );
    if (activeCollection && !visibleCollections.includes(activeCollection)) {
      visibleCollections.push(activeCollection);
    }
    const remainingCollections = sortedCollections.filter(
      (collection) => !visibleCollections.includes(collection),
    );
    refsDom.collectionNav.replaceChildren(
      ...visibleCollections.map((collection) =>
        refsNavItem({
          label: collection.name,
          count: collection.referenceCount ?? 0,
          dot: refsHex(collection.accent),
          active: !styleMode && refsState.collection === collection.id,
          onClick: () => refsSetCollection(collection.id),
        }),
      ),
      remainingCollections.length > 0
        ? refsNavItem({
            label: "Weitere …",
            count: remainingCollections.length,
            icon: REFS_ICON_LIBRARY,
            onClick: () => refsOpenCollectionPicker(remainingCollections),
          })
        : null,
    );
  }
  refsDom.sidebarCount.textContent =
    `${counts.references ?? 0} Referenzen · ${personalCollections.length} Sammlungen`;

  // Kopfbereich
  if (styleMode) {
    refsDom.titleText.textContent = "Stil-Guide";
    refsDom.description.textContent = "Erkunde die visuellen Sprachen hinter der Arbeit.";
  } else if (activeCollection) {
    refsDom.titleText.textContent = activeCollection.name;
    refsDom.description.textContent = "Ein anderer Blickwinkel. Für das richtige Projekt aufgehoben.";
  } else if (refsState.collection === "none") {
    refsDom.titleText.textContent = "Ohne Sammlung";
    refsDom.description.textContent = "Referenzen, die noch keiner Sammlung zugeordnet sind.";
  } else {
    refsDom.titleText.textContent = "Alle Referenzen";
    refsDom.description.textContent = "Sammle, was dein Auge fängt. Mach es zu deinem.";
  }
  refsDom.aboutButton.hidden = !activeCollection;
  refsDom.hint.hidden = styleMode;

  // Hauptbereich
  if (styleMode) {
    const filtered = styleFamilies.filter((collection) => refsStyleMatches(collection, refsState.query));
    if (filtered.length === 0 && styleFamilies.length === 0 && (refsStyleCatalog?.total ?? 0) > 0) {
      refsEmptyMode = "seed";
      refsDom.gallery.replaceChildren();
      refsDom.empty.querySelector("h2").textContent = "Stil-Katalog noch nicht eingespielt";
      refsDom.empty.querySelector("p").textContent =
        "Die Stilfamilien des Stil-Guides liegen bereit und lassen sich einmalig laden.";
      refsDom.empty.querySelector("button").textContent = "Stil-Katalog einspielen";
      refsDom.empty.hidden = false;
    } else {
      refsEmptyMode = "reset";
      refsDom.empty.querySelector("h2").textContent = "Keine Stile gefunden";
      refsDom.empty.querySelector("p").textContent = "Versuche ein anderes Wort.";
      refsDom.empty.querySelector("button").textContent = "Filter zurücksetzen";
      refsDom.empty.hidden = filtered.length > 0;
      refsDom.gallery.replaceChildren(...filtered.map((collection) => refsStyleCard(collection)));
    }
    refsDom.countEl.textContent = String(filtered.length);
    refsDom.footer.querySelector(".refs-footer-count").textContent = refsFooterText(
      filtered.length,
      "Stile",
      refsState.query,
    );
  } else {
    const references = data.references ?? [];
    refsEmptyMode = "reset";
    refsDom.empty.querySelector("h2").textContent = "Keine Referenzen gefunden";
    refsDom.empty.querySelector("p").textContent =
      "Versuche ein anderes Wort oder durchsuche die ganze Bibliothek.";
    refsDom.empty.querySelector("button").textContent = "Filter zurücksetzen";
    refsDom.empty.hidden = references.length > 0;
    refsRenderCards(references, refsDom.gallery);
    // Die Zaehlung im Fenster ("Referenz x von n") folgt der vollen Auswahl,
    // nicht nur den bereits gezeichneten Karten.
    refsInspectorIds = references.map((reference) => reference.id);
    refsDom.countEl.textContent = String(counts.inView ?? references.length);
    refsDom.footer.querySelector(".refs-footer-count").textContent = refsFooterText(
      counts.inView ?? references.length,
      "Referenzen",
      refsState.query,
    );
  }
  refsTrayResync();
}

// Karten in Bloecken zeichnen: bei mehreren hundert Referenzen waeren alle
// Karten samt Bildern auf einmal zu viel. Der Waechter am Ende der Liste zieht
// den naechsten Block nach, sobald er in Sicht kommt.

const REFS_CARD_BATCH = 48;
let refsCardObserver = null;

function refsRenderCards(references, gallery) {
  gallery.replaceChildren();
  if (references.length === 0) return;
  // Der Waechter steht von Anfang an in der Liste: die Karten werden jeweils
  // davor eingefuegt, und er zieht den naechsten Block nach, sobald er in Sicht
  // kommt.
  const sentinel = el("div", { class: "refs-sentinel", "aria-hidden": "true" });
  gallery.append(sentinel);
  let rendered = 0;
  const renderNext = () => {
    const next = references.slice(rendered, rendered + REFS_CARD_BATCH);
    rendered += next.length;
    for (const reference of next) gallery.insertBefore(refsCard(reference), sentinel);
  };
  const finish = () => {
    refsCardObserver?.unobserve(sentinel);
    sentinel.remove();
  };
  renderNext();
  if (rendered >= references.length) {
    finish();
    return;
  }
  if (typeof IntersectionObserver !== "function") {
    // Ohne Beobachter bleibt nur der volle Aufbau.
    while (rendered < references.length) renderNext();
    finish();
    return;
  }
  if (refsCardObserver === null) {
    refsCardObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) entry.target.refsMore?.();
        }
      },
      { rootMargin: "600px" },
    );
  }
  sentinel.refsMore = () => {
    renderNext();
    if (rendered >= references.length) finish();
  };
  refsCardObserver.observe(sentinel);
}

function refsEmptyAction() {
  if (refsEmptyMode === "seed") void refsSeedStyles();
  else refsResetFilters();
}

function refsStyleMatches(collection, query) {
  if (query === "") return true;
  return [collection.name, ...(collection.recognize ?? []), ...(collection.vocabulary ?? [])]
    .join(" ")
    .toLowerCase()
    .includes(query.toLowerCase());
}

function refsFooterText(count, noun, query) {
  return `${count} ${noun}${query === "" ? " in Sicht" : ` passend zu “${query}”`}`;
}

function refsSetView(view) {
  refsState.view = view;
  refsState.collection = "";
  refsSyncAddress();
  void refsRefresh();
}

function refsSetCollection(collectionId) {
  refsState.collection = collectionId;
  refsState.view = "";
  refsSyncAddress();
  void refsRefresh();
}

async function refsSeedStyles() {
  try {
    const result = await api("/api/reference-collections/styles", { method: "POST" });
    refsToast(`${result.seed?.created ?? 0} Stilfamilien eingespielt`);
    await refsRefresh();
  } catch (error) {
    failed(error);
  }
}

function refsSearchParams() {
  const params = new window.URLSearchParams();
  if (refsState.query !== "") params.set("q", refsState.query);
  if (refsState.collection !== "") params.set("collection", refsState.collection);
  if (refsState.sort !== "newest") params.set("sort", refsState.sort);
  return params;
}

function refsTrayResync() {
  refsRenderTray();
}

function refsCard(reference) {
  const selected = refsIsSelected(reference.id);
  const entry = refsEntryFor(reference);
  const art = el(
    "div",
    {
      class: "refs-card-art",
      role: "button",
      tabindex: "0",
      "aria-label": `Referenz öffnen: ${reference.name}`,
      onclick: () => refsOpenDetail(reference.id),
      onkeydown: (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          refsOpenDetail(reference.id);
        }
      },
    },
    refsCardImage(reference),
    el(
      "span",
      { class: "refs-open-label" },
      "Referenz öffnen",
      el("span", { "aria-hidden": "true", html: REFS_ICON_LINK_LABEL }),
    ),
  );
  const select = el("button", {
    type: "button",
    class: `refs-select${selected ? " selected" : ""}`,
    "aria-pressed": selected ? "true" : "false",
    "aria-label": `${selected ? "Aus Vergleich entfernen" : "Zum Vergleich wählen"}: ${reference.name}`,
    html: selected ? REFS_ICON_CHECK_BOX : REFS_ICON_PLUS_BOX,
    onclick: (event) => {
      event.stopPropagation();
      refsToggleSelection(entry);
    },
  });
  const meta = el(
    "div",
    { class: "refs-card-meta" },
    el(
      "div",
      {},
      el("p", { class: "refs-card-title", text: reference.name }),
      el(
        "div",
        { class: "refs-card-collection" },
        el("span", {
          class: "refs-dot",
          style: `--refs-dot:${reference.collection ? refsHex(reference.collection.accent) : REFS_ACCENT_FALLBACK}`,
        }),
        reference.collection ? reference.collection.name : "Ohne Sammlung",
      ),
    ),
    el("span", { class: "refs-card-arrow", "aria-hidden": "true", html: REFS_ICON_LINK }),
  );
  return el("article", { class: "refs-card", "data-reference": reference.id }, select, art, meta);
}

function refsCardImage(reference) {
  // The engine marks the card snapshot (hero slot first); older payloads
  // without it fall back to the first viewable shot, never motion.
  const card =
    reference.cardSnapshot && reference.cardSnapshot.previewPath
      ? reference.cardSnapshot
      : (reference.snapshots ?? []).find(
          (shot) => shot.previewPath && shot.kind !== "motion",
        );
  const snapshot = card ?? null;
  const placeholder = () =>
    el("div", {
      class: "refs-card-placeholder",
      text: initials(reference.name || "R"),
    });
  if (!snapshot) return placeholder();
  return refsPreviewImage(
    snapshotImageURL(reference.id, snapshot),
    `Vorschau ${reference.name}`,
    placeholder,
  );
}

// Aufklappbare Bausteine der Detailspalte (Rezept, Profil und Aktionen).

export function refsFold(title, body, open) {
  const details = el("details", { class: "refs-fold" });
  if (open) details.open = true;
  details.append(el("summary", { text: title }), el("div", { class: "refs-fold-body" }, body));
  return details;
}

/* Referenz-Fenster (Popup). Aufbau, Masse und Verhalten stammen aus dem Vorbild
   `Repos/taste-vault` (MIT, Taste Vault von cth9191): `<dialog>` mit
   `showModal()`, Kopfbereich mit Zaehler und Werkzeugen, zwei Spalten
   (Bildbuehne + Detailspalte) und ein aufklappbares Bildrezept. Die Texte sind
   deutsch. */

const REFS_ZOOM_IN = "Zoom";
const REFS_ZOOM_OUT = "Einpassen";

export let refsInspector = null;
let refsInspectorIds = [];
let refsInspectorId = null;
let refsInspectorReturn = null;
let refsInspectorToken = 0;

// Ids der aktuellen Ansicht: die volle Auswahl der Liste (Suche, Sammlung und
// Sortierung zaehlen mit). So zaehlt „Referenz x von n" auch dann richtig, wenn
// die Karten erst in Bloecken gezeichnet werden.

function refsInspectorList() {
  return refsInspectorIds;
}

// Klick auf eine Karte (oder Enter): oeffnet das Fenster — ohne neuen
// Verlaufseintrag und ohne Hash-Wechsel, wie im Vorbild.

function refsOpenDetail(referenceId) {
  void refsOpenInspector(referenceId);
}

function refsInspectorBuild() {
  const label = el("span", { class: "refs-dialog-label", text: "Referenz" });
  const previous = el("button", {
    type: "button",
    id: "refs-inspector-previous",
    class: "refs-icon-button",
    "aria-label": "Vorherige Referenz",
    html: REFS_ICON_PREV,
    onclick: () => refsInspectorStep(-1),
  });
  const next = el("button", {
    type: "button",
    id: "refs-inspector-next",
    class: "refs-icon-button",
    "aria-label": "Nächste Referenz",
    html: REFS_ICON_NEXT,
    onclick: () => refsInspectorStep(1),
  });
  const zoom = el("button", {
    type: "button",
    id: "refs-inspector-zoom",
    class: "refs-button quiet",
    "aria-pressed": "false",
    text: REFS_ZOOM_IN,
    onclick: () => refsInspectorSetZoom(!refsInspector.zoomed),
  });
  const close = el("button", {
    type: "button",
    id: "refs-inspector-close",
    class: "refs-icon-button",
    "aria-label": "Referenz schließen",
    html: REFS_ICON_CLOSE,
    onclick: () => refsInspector.dialog.close(),
  });
  const image = el("img", { id: "refs-inspector-image", class: "refs-inspector-image", alt: "" });
  const placeholder = el("div", { class: "refs-card-placeholder" });
  const stage = el("div", { id: "refs-inspector-stage", class: "refs-inspector-stage" }, image);
  const panel = el("section", { id: "refs-inspector-panel", class: "refs-inspector-panel" });
  const dialog = el(
    "dialog",
    {
      id: "refs-inspector",
      class: "refs-dialog refs-inspector",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Referenz-Detail",
    },
    el(
      "div",
      { class: "refs-inspector-head" },
      label,
      el("div", { class: "refs-dialog-tools" }, previous, next, zoom, close),
    ),
    el("div", { class: "refs-inspector-layout" }, stage, panel),
  );

  // Klick auf den Hintergrund schliesst, ein Klick im Fenster (auch im
  // Kopfbereich) nicht — dieselbe Regel wie bei den uebrigen Dialogen.
  refsBindBackdropClose(dialog);
  dialog.addEventListener("close", () => {
    document.documentElement.style.overflow = "";
    refsInspector.zoomed = false;
    refsInspectorId = null;
    const back = refsInspectorReturn;
    refsInspectorReturn = null;
    if (back && back.isConnected) back.focus();
  });
  // Pfeiltasten blaettern (kein Feld fokussiert) — wie im Vorbild.
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName ?? "")) return;
    event.preventDefault();
    refsInspectorStep(event.key === "ArrowRight" ? 1 : -1);
  });
  document.body.append(dialog);
  return {
    dialog,
    label,
    previous,
    next,
    zoom,
    close,
    stage,
    image,
    placeholder,
    panel,
    zoomed: false,
  };
}

// Zoom vergroessert das Bild auf Originalmasse; die Buehne scrollt dann intern.

function refsInspectorSetZoom(on) {
  const dom = refsInspector;
  if (!dom) return;
  dom.zoomed = Boolean(on);
  dom.stage.classList.toggle("zoomed", dom.zoomed);
  dom.zoom.textContent = dom.zoomed ? REFS_ZOOM_OUT : REFS_ZOOM_IN;
  dom.zoom.setAttribute("aria-pressed", dom.zoomed ? "true" : "false");
}

// Blaettern innerhalb der aktuellen Ansicht (Knoepfe und Pfeiltasten).

function refsInspectorStep(delta) {
  const ids = refsInspectorList();
  const position = ids.indexOf(refsInspectorId);
  if (position < 0) return;
  const target = ids[position + delta];
  if (target) void refsInspectorShow(target);
}

// Aktionen des Fensters. Die Analyse-Daten (Profil, Aufnahmen, Evidenzen) bleiben
// bewusst draussen: sie gehoeren dem Agenten und der API, nicht der Oberflaeche.

function refsInspectorActions(reference) {
  return el(
    "div",
    { class: "refs-inspector-extras" },
    el(
      "div",
      { class: "refs-row-actions" },
      el("button", {
        type: "button",
        class: "refs-button danger",
        text: "Referenz löschen",
        onclick: () => void deleteReference(reference),
      }),
    ),
  );
}

// Der Umschalter der Vorschaubilder (Desktop/Mobil) am Rand der Bildbuehne.

function refsShotLabel(shot) {
  if (shot.breakpoint === "mobile") return "Mobil";
  if (shot.breakpoint === "tablet") return "Tablet";
  return "Desktop";
}

/* Inhalte des Fensters aus den echten Daten: Sammlung, Titel, Familie, Notiz,
   Vokabular, Komposition, Bildrezept und die zwei Brief-Kopierer. */
async function refsInspectorShow(referenceId) {
  const dom = refsInspector;
  if (!dom) return;
  const token = (refsInspectorToken += 1);
  let reference;
  try {
    reference = await api(`/api/references/${referenceId}`);
  } catch (error) {
    failed(error);
    return;
  }
  const brief = await api(`/api/references/${referenceId}/brief`).catch(() => null);
  if (token !== refsInspectorToken) return;
  refsInspectorId = referenceId;

  const ids = refsInspectorList();
  const position = ids.indexOf(referenceId);
  dom.label.textContent =
    position >= 0 ? `Referenz ${position + 1} von ${ids.length}` : "Referenz";
  dom.previous.disabled = position <= 0;
  dom.next.disabled = position < 0 || position >= ids.length - 1;

  // Jede Referenz startet wieder in der Einpass-Ansicht (wie im Vorbild).
  refsInspectorSetZoom(false);

  const shots = (reference.snapshots ?? []).filter(
    (entry) => entry.previewPath && entry.kind !== "motion",
  );
  const shot = shots[0] ?? null;
  const showShot = (entry) => {
    if (entry === undefined || entry === null) return;
    refsImageSource(snapshotImageURL(reference.id, entry)).then(
      (src) => {
        if (refsInspectorId === referenceId) dom.image.src = src;
      },
      () => {
        if (refsInspectorId === referenceId) dom.image.removeAttribute("src");
      },
    );
  };
  if (shot) {
    dom.placeholder.remove();
    dom.image.hidden = false;
    dom.image.alt = reference.name;
    showShot(shot);
  } else {
    dom.image.removeAttribute("src");
    dom.image.hidden = true;
    dom.image.alt = "";
    dom.placeholder.textContent = initials(reference.name || "R");
    if (!dom.placeholder.isConnected) dom.stage.append(dom.placeholder);
  }
  // Umschalter nur, wenn es wirklich mehrere Bilder gibt (Import: Desktop/Mobil).
  dom.stage.querySelector(".refs-shot-switch")?.remove();
  if (shots.length > 1) {
    const buttons = shots.map((entry, index) =>
      el("button", {
        type: "button",
        "aria-pressed": index === 0 ? "true" : "false",
        text: refsShotLabel(entry),
        onclick: () => {
          for (const other of buttons) other.setAttribute("aria-pressed", "false");
          buttons[index]?.setAttribute("aria-pressed", "true");
          showShot(entry);
        },
      }),
    );
    dom.stage.append(
      el("div", { class: "refs-shot-switch", role: "group", "aria-label": "Vorschaubild" }, ...buttons),
    );
  }

  const profile = reference.profile;
  const collection = reference.collection;
  const family = reference.family ?? (reference.families ?? [])[0] ?? null;
  const note =
    reference.note ??
    (profile?.styleBrief
      ? profile.styleBrief
      : "Eine visuelle Referenz für dein nächstes Projekt.");
  const heroUsage = reference.heroUsage ?? "Nutze die Referenz für Komposition und Hierarchie.";
  const recipe = reference.imageRecipe ?? collection?.imageStyle ?? null;
  const vocabulary =
    (reference.vocabulary ?? []).length > 0
      ? reference.vocabulary
      : (collection?.vocabulary ?? []);
  const selected = refsIsSelected(reference.id);

  const copyPrompt = el("button", {
    type: "button",
    class: "refs-button refs-copy-prompt",
    text: "Bild-Prompt kopieren",
    onclick: () => {
      if (!brief?.imagePrompt) return;
      refsCopy(brief.imagePrompt, "Bild-Prompt kopiert");
    },
  });
  copyPrompt.disabled = !brief?.imagePrompt;

  const copyBrief = el("button", {
    type: "button",
    class: "refs-button primary refs-copy-brief",
    text: "Design-Brief kopieren",
    onclick: () => refsCopy(brief?.brief?.text ?? "", "Brief kopiert"),
  });

  const select = el("button", {
    type: "button",
    class: `refs-button refs-detail-select${selected ? " quiet" : ""}`,
    "aria-pressed": selected ? "true" : "false",
    text: selected ? "Aus dem Vergleich nehmen" : "Zum Vergleich wählen",
    onclick: () => {
      refsToggleSelection(refsEntryFor(reference));
      const on = refsIsSelected(reference.id);
      select.classList.toggle("quiet", on);
      select.setAttribute("aria-pressed", on ? "true" : "false");
      select.textContent = on ? "Aus dem Vergleich nehmen" : "Zum Vergleich wählen";
    },
  });

  const recipeDetails = el(
    "details",
    { class: "refs-recipe" },
    el(
      "summary",
      {},
      "Bildrezept ",
      el("span", { "aria-hidden": "true", html: REFS_ICON_PLUS_BUTTON }),
    ),
    el("p", { text: recipe ?? "Kein Bildrezept gespeichert." }),
    copyPrompt,
  );

  // Reiter des Fensters: die Uebersicht kennt jede Referenz, die Dokumente
  // (design.md, Guidelines, Komponenten) nur die importierten.
  const documents = reference.documents ?? {};
  const documentTabs = [
    { id: "design", label: "Design.md", text: documents.design },
    { id: "guidelines", label: "Guidelines", text: documents.guidelines },
    { id: "components", label: "Komponenten", text: documents.components },
  ].filter((entry) => typeof entry.text === "string" && entry.text.trim() !== "");

  const overview = el(
    "div",
    { class: "refs-doc-page", "data-page": "overview" },
    el(
      "div",
      { class: "refs-detail-section" },
      el("h3", { text: "Notiz" }),
      el("p", { text: note }),
    ),
    el(
      "div",
      { class: "refs-detail-section" },
      el("h3", { text: "Design-Vokabular" }),
      el(
        "div",
        { class: "refs-tags" },
        vocabulary.length === 0
          ? el("span", { text: "Kein Vokabular erfasst." })
          : vocabulary.map((word) => el("span", { text: word })),
      ),
    ),
    el(
      "div",
      { class: "refs-detail-section" },
      el("h3", { text: "Komposition & Platzierung" }),
      el("p", { text: heroUsage }),
    ),
    recipeDetails,
    el(
      "div",
      { class: "refs-detail-actions" },
      copyBrief,
      select,
      el("p", {
        class: "refs-preference-status",
        text: brief?.brief?.status ?? "Referenz-Brief.",
      }),
    ),
    refsInspectorActions(reference),
  );

  const pages = [{ id: "overview", label: "Übersicht", page: overview }];
  for (const entry of documentTabs) {
    pages.push({
      id: entry.id,
      label: entry.label,
      page: el(
        "div",
        { class: "refs-doc-page", "data-page": entry.id, hidden: true },
        el(
          "div",
          { class: "refs-doc-actions" },
          el("button", {
            type: "button",
            class: "refs-button quiet refs-copy-document",
            text: "Dokument kopieren",
            onclick: () => refsCopy(entry.text, "Dokument kopiert"),
          }),
        ),
        el("div", { class: "refs-doc", html: refsRenderMarkdown(entry.text) }),
      ),
    });
  }

  const head = el(
    "div",
    {},
    el("div", { class: "refs-eyebrow", text: collection ? collection.name : "Ohne Sammlung" }),
    el("h2", { text: reference.name }),
    el("p", { class: "refs-brief-family", text: family ?? "Ohne Familie" }),
    typeof reference.sourceUrl === "string" && reference.sourceUrl !== ""
      ? el("p", { class: "refs-source-row" }, el("a", {
          class: "refs-source-link",
          href: reference.sourceUrl,
          target: "_blank",
          rel: "noreferrer",
          text: "Live-Preview öffnen",
        }))
      : null,
  );

  if (pages.length > 1) {
    const tabs = el("div", { class: "refs-doc-tabs", role: "tablist" });
    const buttons = pages.map((entry, index) =>
      el("button", {
        type: "button",
        class: "refs-doc-tab",
        role: "tab",
        "data-tab": entry.id,
        "aria-selected": index === 0 ? "true" : "false",
        text: entry.label,
        onclick: () => {
          buttons.forEach((button, buttonIndex) => {
            const active = buttonIndex === index;
            button.setAttribute("aria-selected", active ? "true" : "false");
            pages[buttonIndex].page.hidden = !active;
          });
        },
      }),
    );
    tabs.append(...buttons);
    dom.panel.replaceChildren(head, tabs, ...pages.map((entry) => entry.page));
  } else {
    dom.panel.replaceChildren(head, ...pages.map((entry) => entry.page));
  }
}

// Fenster oeffnen bzw. fuellen. `options.replace` schreibt die Adresse zurueck
// auf die Bibliothek, wenn der Aufruf von einem Deep-Link kommt.

export async function refsOpenInspector(referenceId, options = {}) {
  if (!refsInspector) refsInspector = refsInspectorBuild();
  const dom = refsInspector;
  if (options.list) refsInspectorIds = options.list;
  if (!dom.dialog.open) {
    const active = document.activeElement;
    refsInspectorReturn = active && active.classList.contains("refs-card-art") ? active : null;
    // Seiten-Scroll bleibt gesperrt, solange das Fenster offen ist.
    document.documentElement.style.overflow = "hidden";
    dom.dialog.showModal();
    await refsInspectorShow(referenceId);
    // Startfokus auf den Weiter-Knopf (wie im Vorbild).
    dom.next.focus();
    dom.stage.scrollTop = 0;
    dom.stage.scrollLeft = 0;
    dom.panel.scrollTop = 0;
  } else {
    await refsInspectorShow(referenceId);
  }
  if (options.replace) refsSyncAddress();
}

/* Vorlieben und Haus-DNA im Einstellungen-Tab (T12/T14). */
export function refsSettingsSection(settings) {
  const dna = settings.referenceDna ?? { name: "", description: "", constants: [], never: [] };
  const preferences = settings.referencePreferences ?? { includeDna: false, overrides: "" };
  const toggle = el("input", { type: "checkbox" });
  toggle.checked = preferences.includeDna;
  const constants = el("textarea", { class: "refs-input", rows: "5", "aria-label": "Grundsätze" });
  constants.value = dna.constants.join("\n");
  const never = el("textarea", { class: "refs-input", rows: "5", "aria-label": "No-Gos" });
  never.value = dna.never.join("\n");
  const overrides = el("textarea", { class: "refs-input", rows: "4", "aria-label": "Für dieses Projekt" });
  overrides.value = preferences.overrides;
  return el(
    "section",
    { class: "panel refs-settings" },
    el("h2", { text: "Referenzen" }),
    el("p", {
      class: "muted",
      text: "Haus-DNA und Projekt-Notizen gelten für alle kopierten Briefe — auch für Agenten über MCP.",
    }),
    el(
      "label",
      { class: "refs-toggle-row" },
      el(
        "span",
        {},
        "Haus-DNA in kopierte Briefe aufnehmen",
        el("small", { text: "Aus hält den Brief auf die gewählten Referenzen fokussiert." }),
      ),
      toggle,
    ),
    el(
      "details",
      { class: "refs-preference-list" },
      el("summary", { text: "Woran ich mich üblicherweise halte" }),
      constants,
      el("p", { class: "refs-field-help", text: "Eine Zeile pro Grundsatz." }),
    ),
    el(
      "details",
      { class: "refs-preference-list" },
      el("summary", { text: "Was ich üblicherweise vermeide" }),
      never,
      el("p", { class: "refs-field-help", text: "Eine Zeile pro No-Go." }),
    ),
    el("label", { class: "refs-field-label", text: "Für dieses Projekt" }),
    overrides,
    el("p", {
      class: "refs-field-help",
      text: "Diese Notizen haben Vorrang vor den allgemeinen Grundsätzen.",
    }),
    el("button", {
      type: "button",
      class: "refs-button primary",
      text: "Referenz-Einstellungen speichern",
      onclick: async () => {
        try {
          await api("/api/settings", {
            method: "PUT",
            body: {
              referenceDna: {
                name: dna.name,
                description: dna.description,
                constants: linesToList(constants.value),
                never: linesToList(never.value),
              },
              referencePreferences: { includeDna: toggle.checked, overrides: overrides.value },
            },
          });
          toast("Referenz-Einstellungen gespeichert");
          await renderRoute();
        } catch (error) {
          failed(error);
        }
      },
    }),
  );
}
