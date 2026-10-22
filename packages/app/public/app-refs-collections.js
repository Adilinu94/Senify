// Die Sammlungen der Referenzen (P3-2, Schritt 39): anlegen, bearbeiten,
// loeschen, den Brief kopieren und die Auswahl beim Zuordnen. `app-references.js`
// importiert die Einstiegspunkte.
//
// Das Modul war bis hierhin blockiert: es ruft `refsRefresh` (die Liste neu
// laden) und `refsSetCollection` (den Filter setzen), und beide lagen in
// `app-references.js`. Ein Import waere ein Zyklus gewesen. Jetzt kommen sie als
// Rueckrufe herein - dasselbe Muster wie beim Zustands-Modul.
//
// Den Zustand liest es direkt: `refsState`, `refsHex`, `refsSplit` und
// `refsSyncAddress` liegen in `app-refs-state.js`, das keine Abhaengigkeit
// zurueck hat.

import { api, askConfirm, el, failed } from "./app-core.js";
import { refsBindBackdropClose, refsCopy, refsToast } from "./app-refs-dialog.js";
import { REFS_ICON_CLOSE } from "./app-refs-icons.js";
import { refsHex, refsSplit, refsState, refsSyncAddress } from "./app-refs-state.js";

// Die zwei Rueckrufe der Seite. Sie werden gesetzt, bevor das erste Fenster
// aufgeht.
let refresh = () => {};
let setCollection = () => {};

export function refsBindCollectionHandlers(next) {
  if (next.refresh) refresh = next.refresh;
  if (next.setCollection) setCollection = next.setCollection;
}

/* ------------------------------------------------------------ collections */

export function refsOpenCollectionPicker(collections) {
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
              setCollection(collection.id);
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

export function refsOpenCollectionDialog(collection) {
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

export async function refsCopyCollectionBrief(collectionId) {
  try {
    const result = await api(`/api/reference-collections/${collectionId}/brief`);
    refsCopy(result.brief.text, "Sammlungs-Brief kopiert");
  } catch (error) {
    failed(error);
  }
}

export function refsOpenCollectionForm(collection) {
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
            await refresh();
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

export async function refsDeleteCollection(collection) {
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
    await refresh();
  } catch (error) {
    failed(error);
  }
}
