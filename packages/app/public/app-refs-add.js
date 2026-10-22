// Der Dialog zum Hinzufuegen einer Referenz (P3-2, Schritt 40): Datei oder
// Adresse waehlen, Vorschau, Metadaten, Sammlung. `app-references.js`
// importiert den Einstiegspunkt.
//
// Der Block haengt an genau einer Stelle draussen: `refsRefresh` (die Liste neu
// laden). Sie kommt als Rueckruf herein, weil sie in `app-references.js` liegt
// und ein Import ein Zyklus waere - dasselbe Muster wie bei den Sammlungen.
//
// Den Zustand liest das Modul direkt: `refsState`, `refsSplit`,
// `refsSyncAddress`, `refsActiveCollection` und `refsGetCollections` liegen in
// `app-refs-state.js`, das keine Abhaengigkeit zurueck hat.

import { AUTHOR, api, el } from "./app-core.js";
import { openSnapshotDialog } from "./app-projects.js";
import { refsBindBackdropClose, refsToast } from "./app-refs-dialog.js";
import { REFS_ICON_CLOSE, REFS_ICON_PLUS_UPLOAD } from "./app-refs-icons.js";
import { refsActiveCollection, refsGetCollections, refsSplit, refsState, refsSyncAddress } from "./app-refs-state.js";

// Der Rueckruf der Seite: die Liste neu laden.
let refresh = () => {};

export function refsBindAddHandlers(next) {
  if (next.refresh) refresh = next.refresh;
}

/* ------------------------------------------------------------ add dialog */

export function refsReadBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new window.FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Die Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

export function refsOpenAddDialog() {
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
  for (const item of refsGetCollections().filter((entry) => entry.kind === "collection")) {
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
          await refresh();
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
