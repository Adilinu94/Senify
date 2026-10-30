// Die Vergleichs-Ablage und das Vergleichs-Fenster der Referenzen-Seite
// (P3-2). Der Block stand unveraendert in `app-references.js`; hierher gehoert
// er, weil er ein eigener Gegenstand ist: bis zu drei gewaehlte Referenzen
// unten am Fensterrand und das Fenster, das sie nebeneinander zeigt. Die Seite
// selbst - Leiste, Karten, Stil-Guide - bleibt in `app-references.js`.
//
// Das Routen-Flag kommt aus `app-refs-state.js`: die Ablage blendet sich aus,
// sobald die Route die Bibliothek verlaesst. Ein Rueckimport aus
// `app-references.js` waere ein Zyklus.
//
// Was hier NICHT liegt: die Auswahlknoepfe auf den Karten
// (`refsUpdateSelectionUI`). Sie laufen ueber `refsDom`, den Aufbau der Seite,
// und bleiben deshalb in `app-references.js` - der Zustand meldet ihnen die
// Auswahl ueber `refsBindHandlers`.

import { api, el, failed, initials } from "./app-core.js";
import {
  REFS_MAX_COMPARE,
  isRefsRouteActive,
  refsClearSelection,
  refsState,
} from "./app-refs-state.js";
import { refsPreviewImage } from "./app-refs-cards.js";
import { refsBindBackdropClose, refsCopy } from "./app-refs-dialog.js";
import { REFS_ICON_CLOSE, REFS_ICON_LINK_BUTTON } from "./app-refs-icons.js";

export let refsTray = null;
let refsTrayIds = [];

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
