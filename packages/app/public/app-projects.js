// Die Projekte, die Seiten und die Einstellungen. Die Bloecke standen in `app.js` und
// sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt
// ESLint.

import { AUTHOR, api, askConfirm, askText, duplicateDialog, duplicateForm, duplicateName, el, failed, formatDate, initials, render, routeScope, toast } from "./app-core.js";
import { refsToast } from "./app-references.js";
import { renderRoute } from "./app.js";

export async function projectsView() {
  const current = routeScope();
  const { sites } = await api("/api/sites");
  const releases = await Promise.all(
    sites.map((site) =>
      api(`/api/sites/${site.id}/releases`)
        .then((data) => (data.releases ?? []).length > 0)
        .catch(() => false),
    ),
  );
  const cards = sites.map((site, index) => {
    const open = () => (location.hash = `#/projects/${site.id}/pages`);
    return el(
      "article",
      {
        class: "card project-card",
        role: "link",
        tabindex: "0",
        "aria-label": `Projekt ${site.name} öffnen`,
        onclick: (event) => {
          if (event.target.closest(".card-actions")) return;
          open();
        },
        onkeydown: (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            open();
          }
        },
      },
      el("div", { class: "card-thumb", text: initials(site.name) }),
      el(
        "div",
        { class: "card-body" },
        el(
          "div",
          { class: "card-title" },
          el("span", { class: `status-dot ${releases[index] ? "live" : ""}` }),
          site.name,
        ),
        el("div", { class: "muted", text: `Geändert ${formatDate(site.updatedAt)}` }),
        el(
          "div",
          { class: "card-actions", onclick: (event) => event.stopPropagation() },
          el("button", { class: "primary", text: "Öffnen", onclick: open }),
          el("button", { class: "ghost", text: "Umbenennen", onclick: () => renameSite(site) }),
          el("button", { class: "ghost", text: "Duplizieren", onclick: () => openDuplicate(site) }),
          el("button", { class: "danger", text: "Papierkorb", onclick: () => trashSite(site) }),
        ),
      ),
    );
  });
  render([
    el(
      "div",
      { class: "toolbar" },
      el("h1", { text: "Projekte" }),
      el("div", { class: "spacer" }),
      el("button", { class: "primary", text: "Neues Projekt", onclick: createSite }),
      el("a", { href: "#/trash", class: "muted", text: "Papierkorb" }),
    ),
    sites.length === 0
      ? el("div", { class: "empty", text: "Noch keine Projekte — lege das erste an." })
      : el("div", { class: "card-grid" }, cards),
  ], current);
}

export async function createSite() {
  const name = await askText({
    title: "Neues Projekt",
    label: "Name des Projekts",
    required: true,
    requiredMessage: "Bitte einen Namen eingeben.",
    confirmLabel: "Anlegen",
  });
  if (!name) return;
  try {
    const site = await api("/api/sites", { method: "POST", body: { name } });
    toast(`Projekt „${site.name}“ angelegt`);
    await renderRoute();
  } catch (error) {
    failed(error);
  }
}

async function renameSite(site) {
  const name = await askText({
    title: "Projekt umbenennen",
    label: "Neuer Name",
    value: site.name,
    required: true,
    requiredMessage: "Bitte einen Namen eingeben.",
    confirmLabel: "Umbenennen",
  });
  if (!name || name === site.name) return;
  try {
    await api(`/api/sites/${site.id}`, {
      method: "PATCH",
      body: { name, author: AUTHOR },
    });
    toast("Projekt umbenannt");
    await renderRoute();
  } catch (error) {
    failed(error);
  }
}

let duplicateTarget = null;
function openDuplicate(site) {
  duplicateTarget = site;
  duplicateName.textContent = site.name;
  duplicateDialog.showModal();
}
duplicateForm.addEventListener("submit", async (event) => {
  const submitter = event.submitter;
  event.preventDefault();
  const mode = new FormData(duplicateForm).get("mode") ?? "full";
  duplicateDialog.close();
  if (submitter?.value !== "ok" || !duplicateTarget) return;
  try {
    await api(`/api/sites/${duplicateTarget.id}/duplicate`, {
      method: "POST",
      body: { withContent: mode === "full", author: AUTHOR },
    });
    toast("Projekt dupliziert");
    await renderRoute();
  } catch (error) {
    failed(error);
  }
});

async function trashSite(site) {
  const move = await askConfirm({
    title: "In den Papierkorb verschieben?",
    message: `„${site.name}“ wird in den Papierkorb verschoben.`,
    confirmLabel: "Verschieben",
    danger: true,
  });
  if (!move) return;
  try {
    await api(`/api/sites/${site.id}/trash`, {
      method: "POST",
      body: { author: AUTHOR },
    });
    toast("Projekt in den Papierkorb verschoben");
    await renderRoute();
  } catch (error) {
    failed(error);
  }
}

const snapshotDialog = document.getElementById("snapshot-dialog");
const snapshotForm = document.getElementById("snapshot-form");

export function openSnapshotDialog() {
  document.getElementById("snapshot-url").value = "";
  document.getElementById("snapshot-html").value = "";
  snapshotDialog.showModal();
}

snapshotForm.addEventListener("submit", async (event) => {
  const submitter = event.submitter;
  event.preventDefault();
  const url = document.getElementById("snapshot-url").value.trim();
  const html = document.getElementById("snapshot-html").value;
  snapshotDialog.close();
  if (submitter?.value !== "ok") return;
  if (!url || html.trim() === "") {
    refsToast("URL und HTML werden benötigt.");
    return;
  }
  try {
    const result = await api("/api/references", {
      method: "POST",
      body: { url, author: AUTHOR, wait: true, snapshot: { html } },
    });
    refsToast("Referenz aus Quelltext analysiert (reduziertes Profil)");
    location.hash = `#/references/${result.reference.id}`;
  } catch (error) {
    failed(error);
  }
});

export function linesToList(value) {
  return String(value ?? "")
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
