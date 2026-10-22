// Der Artikel-Workspace: die Liste der Artikel, ihr Editor, die Feldsteuerung
// und das Lesen der Zellen. Die Bloecke standen in `app.js`, dann in
// `app-projects.js` und sind unveraendert hierher gewandert; die Importe
// zwischen den Modulen sagt ESLint.
//
// Das Modul haengt an einer Stelle ausserhalb: `workspaceFrame` (Rahmen und
// Tab-Leiste des Projekt-Workspace) kommt aus `app-projects.js` herein. Alles
// andere - die API-Aufrufe, das Rendern, die Oberflaechen-Bausteine - sind
// eigene oder Kern-Importe.

import { AUTHOR, activeTab, api, askText, el, failed, formatDate, render, routeScope, toast } from "./app-core.js";
import { workspaceFrame } from "./app-workspace.js";
import { renderRoute } from "./app.js";

// Die Artikel-Vorschau bleibt ueber Re-Renderings des Editors offen. Der Zustand
// liegt hier, weil nur dieses Modul ihn liest und schreibt - er braucht deshalb
// keine Funktion nach aussen.
let entryPreviewOpen = false;

/* Artikel-Workspace */

let articlesCollectionId = null;

function fieldControl(field, value) {
  const inputId = `cell-${field.id}`;
  const common = { id: inputId, "data-field": field.id, "data-type": field.type };
  if (field.type === "boolean") {
    const input = el("input", { ...common, type: "checkbox" });
    if (value === true) input.checked = true;
    return input;
  }
  if (field.type === "select" || field.type === "multiSelect") {
    const select = el("select", {
      ...common,
      ...(field.type === "multiSelect" ? { multiple: "multiple", size: String(Math.min((field.options ?? []).length || 3, 6)) } : {}),
    });
    for (const option of field.options ?? []) {
      const optionEl = el("option", { value: option.value, text: option.label ?? option.value });
      const selected =
        field.type === "multiSelect"
          ? Array.isArray(value) && value.includes(option.value)
          : value === option.value;
      if (selected) optionEl.selected = true;
      select.append(optionEl);
    }
    return select;
  }
  if (field.type === "longText" || field.type === "richtext") {
    const area = el("textarea", { ...common, rows: "6" });
    area.value = typeof value === "string" ? value : "";
    return area;
  }
  if (["media", "mediaMulti", "relation", "relationMulti", "repeater", "dateTime"].includes(field.type)) {
    const area = el("textarea", { ...common, rows: "3", placeholder: "JSON" });
    area.value = value === undefined ? "" : JSON.stringify(value);
    return area;
  }
  const input = el("input", {
    ...common,
    type: field.type === "number" ? "number" : field.type === "date" ? "date" : "text",
    value: value === undefined || value === null ? "" : String(value),
  });
  return input;
}

function readCells(fields) {
  const cells = {};
  for (const field of fields) {
    const input = document.getElementById(`cell-${field.id}`);
    if (!input) continue;
    if (field.type === "boolean") {
      cells[field.id] = input.checked;
    } else if (field.type === "multiSelect") {
      cells[field.id] = [...input.selectedOptions].map((option) => option.value);
    } else if (["media", "mediaMulti", "relation", "relationMulti", "repeater", "dateTime"].includes(field.type)) {
      const raw = input.value.trim();
      if (raw === "") continue;
      try {
        cells[field.id] = JSON.parse(raw);
      } catch {
        cells[field.id] = raw;
      }
    } else if (field.type === "number") {
      const raw = input.value.trim();
      if (raw === "") continue;
      cells[field.id] = Number(raw);
    } else if (field.type === "date") {
      const raw = input.value.trim();
      if (raw === "") continue;
      cells[field.id] = raw;
    } else {
      cells[field.id] = input.value;
    }
  }
  return cells;
}

export async function articlesView(siteId) {
  const current = routeScope();
  const [site, { releases }, { collections }] = await Promise.all([
    api(`/api/sites/${siteId}`),
    api(`/api/sites/${siteId}/releases`),
    api(`/api/sites/${siteId}/collections`),
  ]);
  if (!current()) return;
  activeTab("projects");
  const frame = workspaceFrame(siteId, site, "articles", releases.length > 0);
  if (collections.length === 0) {
    render([
      ...frame,
      el("div", {
        class: "empty",
        text: "Noch keine Sammlungen. Agenten legen sie an (create_collection) — oder ein Formular erzeugt sie per Klick.",
      }),
    ], current);
    return;
  }
  if (!collections.some((collection) => collection.id === articlesCollectionId)) {
    articlesCollectionId = collections[0].id;
  }
  const { entries } = await api(
    `/api/sites/${siteId}/entries?collectionId=${articlesCollectionId}`,
  );
  const selector = el(
    "select",
    {
      onchange: (event) => {
        articlesCollectionId = event.target.value;
        void renderRoute();
      },
    },
    ...collections.map((collection) => {
      const option = el("option", { value: collection.id, text: collection.name });
      if (collection.id === articlesCollectionId) option.selected = true;
      return option;
    }),
  );
  render([
    ...frame,
    el(
      "div",
      { class: "toolbar" },
      el("h2", { text: "Artikel", style: "margin: 0" }),
      selector,
      el("div", { class: "spacer" }),
      el("button", {
        class: "primary",
        text: "Neuer Artikel",
        onclick: async () => {
          const title = await askText({
            title: "Neuer Artikel",
            label: "Titel des Artikels",
            required: true,
            requiredMessage: "Bitte einen Titel eingeben.",
            confirmLabel: "Anlegen",
          });
          if (!title) return;
          try {
            const created = await api(`/api/sites/${siteId}/entries`, {
              method: "POST",
              body: {
                collectionId: articlesCollectionId,
                cells: { title },
                author: AUTHOR,
              },
            });
            location.hash = `#/projects/${siteId}/articles/${created.id}`;
          } catch (error) {
            failed(error);
          }
        },
      }),
    ),
    entries.length === 0
      ? el("div", { class: "empty", text: "Noch keine Artikel in dieser Sammlung." })
      : el(
          "table",
          {},
          el(
            "thead",
            {},
            el(
              "tr",
              {},
              el("th", { text: "Titel" }),
              el("th", { text: "Slug" }),
              el("th", { text: "Status" }),
              el("th", { text: "Version" }),
              el("th", { text: "Geändert" }),
              el("th", {}),
            ),
          ),
          el(
            "tbody",
            {},
            entries.map((entry) =>
              el(
                "tr",
                {},
                el("td", { text: String(entry.cells?.title ?? "—") }),
                el("td", {}, el("code", { text: entry.slug })),
                el("td", {}, el("span", { class: "tag", text: entry.status })),
                el("td", { text: `v${entry.version}` }),
                el("td", { text: formatDate(entry.updatedAt) }),
                el(
                  "td",
                  {},
                  el(
                    "div",
                    { class: "row-actions" },
                    el("a", {
                      href: `#/projects/${siteId}/articles/${entry.id}`,
                      text: "Bearbeiten",
                    }),
                  ),
                ),
              ),
            ),
          ),
        ),
  ], current);
}

export async function articleEditorView(siteId, entryId) {
  const current = routeScope();
  const entry = await api(`/api/entries/${entryId}`);
  const collection = await api(`/api/collections/${entry.collectionId}`);
  if (!current()) return;
  activeTab("projects");
  const fields = (collection.fields ?? []).filter((field) => field.deprecated !== true);
  const controls = fields.map((field) =>
    el(
      "div",
      { class: "stack", style: "margin-bottom: 0.9rem" },
      el(
        "label",
        { for: `cell-${field.id}`, class: "muted" },
        field.label,
        field.required ? " *" : "",
      ),
      fieldControl(field, entry.cells?.[field.id]),
      field.description
        ? el("div", { class: "muted", style: "font-size: 0.78rem", text: field.description })
        : undefined,
    ),
  );
  const controlsHost = el("div", { class: "panel" }, controls);

  // Live preview (T10): read-only render through the same bake path, with the
  // current form values overlaid — debounced while typing, no writes.
  const previewFrame = el("iframe", {
    class: "entry-preview-frame",
    sandbox: "allow-same-origin",
    title: "Vorschau",
  });
  const previewPath = el("code", { text: "—" });
  let previewBusy = false;
  let previewDirty = false;
  const runPreview = async () => {
    if (previewBusy) {
      previewDirty = true;
      return;
    }
    previewBusy = true;
    try {
      const result = await api(`/api/entries/${entryId}/preview`, {
        method: "POST",
        body: { cells: readCells(fields), slug: entry.slug },
      });
      previewPath.textContent = result.path;
      previewFrame.setAttribute("srcdoc", result.html);
    } catch (error) {
      failed(error);
    } finally {
      previewBusy = false;
      if (previewDirty) {
        previewDirty = false;
        void runPreview();
      }
    }
  };
  let previewStarted = false;
  let previewTimer = null;
  const previewPanel = el(
    "div",
    { class: "panel", ...(entryPreviewOpen ? {} : { hidden: "hidden" }) },
    el(
      "div",
      { class: "toolbar" },
      el("strong", { text: "Vorschau" }),
      previewPath,
      el("div", { class: "spacer" }),
      el("button", {
        class: "ghost",
        text: "Aktualisieren",
        onclick: () => void runPreview(),
      }),
    ),
    previewFrame,
    el("p", {
      class: "muted",
      style: "font-size: 0.78rem",
      text: "Read-only, dieselbe Bake-Kette wie die Veröffentlichung — ungespeicherte Eingaben sind sichtbar.",
    }),
  );
  controlsHost.addEventListener("input", () => {
    if (previewPanel.hidden) return;
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => void runPreview(), 1200);
  });
  const previewToggle = el("button", {
    class: "ghost",
    text: entryPreviewOpen ? "Vorschau ausblenden" : "Vorschau",
    onclick: () => {
      entryPreviewOpen = previewPanel.hidden;
      previewPanel.hidden = !entryPreviewOpen;
      previewToggle.textContent = entryPreviewOpen ? "Vorschau ausblenden" : "Vorschau";
      if (entryPreviewOpen && !previewStarted) {
        previewStarted = true;
        void runPreview();
      }
    },
  });

  render([
    el(
      "div",
      { class: "toolbar" },
      el("a", { href: `#/projects/${siteId}/articles`, text: "← Artikel" }),
      el("h1", { text: String(entry.cells?.title ?? entry.slug), style: "margin: 0" }),
      el("span", { class: "tag", text: entry.status }),
      el("span", { class: "muted", text: `v${entry.version}` }),
      el("div", { class: "spacer" }),
      previewToggle,
      el("button", {
        class: "ghost",
        text: "Artikel speichern",
        onclick: async () => {
          try {
            await api(`/api/entries/${entryId}`, {
              method: "PUT",
              body: {
                baseVersion: entry.version,
                cells: readCells(fields),
                author: AUTHOR,
              },
            });
            toast("Artikel gespeichert");
            await renderRoute();
          } catch (error) {
            if (error.status === 409) {
              toast("Der Artikel wurde zwischenzeitlich geändert — neu geladen.", "error");
              await renderRoute();
              return;
            }
            failed(error);
          }
        },
      }),
      el("button", {
        class: "primary",
        text: "Veröffentlichen",
        onclick: async () => {
          try {
            await api(`/api/entries/${entryId}`, {
              method: "PUT",
              body: {
                baseVersion: entry.version,
                cells: readCells(fields),
                author: AUTHOR,
              },
            });
            const fresh = await api(`/api/entries/${entryId}`);
            await api(`/api/entries/${entryId}/publish`, {
              method: "POST",
              body: { author: AUTHOR, baseVersion: fresh.version },
            });
            toast("Artikel veröffentlicht");
            await renderRoute();
          } catch (error) {
            failed(error);
          }
        },
      }),
    ),
    controlsHost,
    previewPanel,
  ], current);
}
