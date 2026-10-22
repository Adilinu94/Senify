// Senify program shell: a dependency-free hash-router SPA over the local
// engine API (proxied same-origin by the app server).
//
// Die Bereiche der Oberflaeche liegen in eigenen Modulen (siehe die Importe
// unten); diese Datei haelt den Router, die Kommandoleiste und den Start.

import { activeTab, api, cmdk, cmdkInput, cmdkResults, currentRouteGeneration, el, failed, friendlyError, nextRouteGeneration, render, view } from "./app-core.js";
import { pageView } from "./app-editor.js";
import { createSite, projectView, projectsView } from "./app-projects.js";
import { settingsView } from "./app-settings.js";
import { libraryView, trashView } from "./app-library.js";
import { articleEditorView, articlesView } from "./app-articles.js";
import { isRefsRouteActive, referencesView, refsInspector, refsOpenInspector, refsRenderTray, refsTray, setRefsRouteActive } from "./app-references.js";

function cmdkItems() {
  return (async () => {
    const items = [
      { label: "Neues Projekt", hint: "Aktion", run: createSite },
      { label: "Einstellungen", hint: "Aktion", run: () => (location.hash = "#/settings") },
      { label: "Referenzen", hint: "Aktion", run: () => (location.hash = "#/references") },
      { label: "Papierkorb", hint: "Aktion", run: () => (location.hash = "#/trash") },
    ];
    try {
      const { sites } = await api("/api/sites");
      for (const site of sites) {
        items.push({
          label: site.name,
          hint: "Projekt",
          run: () => (location.hash = `#/projects/${site.id}/pages`),
        });
      }
      const match = location.hash.match(/^#\/projects\/([^/]+)/);
      if (match) {
        const { pages } = await api(`/api/sites/${match[1]}/pages`);
        for (const page of pages) {
          items.push({
            label: page.title || page.path,
            hint: "Seite",
            run: () => (location.hash = `#/projects/${match[1]}/pages/${page.id}`),
          });
        }
      }
    } catch {
      // Palette still offers the static actions.
    }
    return items;
  })();
}

let cmdkState = { items: [], filtered: [], selected: 0 };

function renderCmdk() {
  cmdkResults.replaceChildren(
    ...cmdkState.filtered.slice(0, 12).map((item, index) =>
      el(
        "div",
        {
          class: `cmdk-item ${index === cmdkState.selected ? "selected" : ""}`,
          onclick: () => {
            cmdk.close();
            item.run();
          },
        },
        el("span", { text: item.label }),
        el("span", { class: "hint", text: item.hint }),
      ),
    ),
  );
}

async function openCmdk() {
  cmdk.showModal();
  cmdkInput.value = "";
  cmdkState = { items: await cmdkItems(), filtered: [], selected: 0 };
  cmdkState.filtered = cmdkState.items;
  renderCmdk();
  cmdkInput.focus();
}

cmdkInput.addEventListener("input", () => {
  const query = cmdkInput.value.toLowerCase();
  cmdkState.filtered = cmdkState.items.filter((item) =>
    item.label.toLowerCase().includes(query),
  );
  cmdkState.selected = 0;
  renderCmdk();
});

cmdkInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    cmdkState.selected = Math.min(cmdkState.selected + 1, cmdkState.filtered.length - 1);
    renderCmdk();
    event.preventDefault();
  } else if (event.key === "ArrowUp") {
    cmdkState.selected = Math.max(cmdkState.selected - 1, 0);
    renderCmdk();
    event.preventDefault();
  } else if (event.key === "Enter") {
    const item = cmdkState.filtered[cmdkState.selected];
    if (item) {
      cmdk.close();
      item.run();
    }
  }
});

document.getElementById("cmdk-open").addEventListener("click", openCmdk);
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    // Auf der Editor-Seite uebernimmt die Editor-Spotlight (Ticket 03); die
    // allgemeine Befehlspalette bleibt den uebrigen Ansichten.
    if (document.querySelector(".senify-canvas")) return;
    event.preventDefault();
    void openCmdk();
  }
});

// Tastenkuerzel `/` setzt den Fokus ins Suchfeld (wie im Vorbild): nur auf der
// Referenzen-Seite und nur, wenn kein Dialog offen und kein Feld fokussiert ist.
document.addEventListener("keydown", (event) => {
  if (event.key !== "/" || event.defaultPrevented) return;
  if (!isRefsRouteActive()) return;
  if (document.querySelector("dialog[open]")) return;
  const active = document.activeElement;
  if (active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return;
  const input = document.querySelector(".refs-search input");
  if (!input) return;
  event.preventDefault();
  input.focus();
});

/* Router */

function routeErrorView(error) {
  const retry = el("button", {
    type: "button",
    class: "primary",
    text: "Erneut versuchen",
    onclick: () => void renderRoute(),
  });
  return el(
    "section",
    { class: "route-error", role: "alert" },
    el("h1", { text: "Ansicht konnte nicht geladen werden" }),
    el("p", { class: "route-error__detail", text: friendlyError(error) }),
    el("p", { text: "Die Verbindung zum lokalen Senify-Dienst ist kurz nicht verf├╝gbar oder die Route enth├ñlt ung├╝ltige Daten." }),
    retry,
  );
}

export async function renderRoute() {
  const generation = nextRouteGeneration();
  const hash = location.hash || "#/";
  const question = hash.indexOf("?");
  const route = question === -1 ? hash : hash.slice(0, question);
  const deepLink = question === -1 ? "" : hash.slice(question + 1);
  const referenceMatch = route.match(/^#\/references\/([^/]+)$/);
  const isReferences = route === "#/references" || referenceMatch !== null;
  view.classList.toggle("refs-view", isReferences);
  // Der Seiten-Editor ist eine Arbeitsfl├ñche: die 68rem-Spalte der ├╝brigen
  // Ansichten w├╝rde ihn auf 1088px einengen, obwohl die B├╝hne 1440px zeigt.
  const isEditor = /^#\/projects\/[^/]+\/pages\/[^/]+$/.test(route);
  view.classList.toggle("editor-view", isEditor);
  // Workspace-Modus: im Seiten-Editor ersetzt eine einzige Leiste die Portal-Leiste.
  document.body.classList.toggle("is-editor", isEditor);
  setRefsRouteActive(isReferences);
  // Verlaesst die Route die Referenzen, schliesst das offene Fenster mit.
  if (!isReferences && refsInspector && refsInspector.dialog.open) {
    refsInspector.dialog.close();
  }
  try {
    const project = route.match(/^#\/projects\/([^/]+)\/(pages|articles|templates|submissions|review|activity|settings)$/);
    const pageMatch = route.match(/^#\/projects\/([^/]+)\/pages\/([^/]+)$/);
    const articleMatch = route.match(/^#\/projects\/([^/]+)\/articles\/([^/]+)$/);
    if (articleMatch) {
      activeTab("projects");
      await articleEditorView(articleMatch[1], articleMatch[2]);
    } else if (pageMatch) {
      activeTab("projects");
      await pageView(pageMatch[1], pageMatch[2], deepLink);
    } else if (project && project[2] === "articles") {
      await articlesView(project[1]);
    } else if (project) {
      await projectView(project[1], project[2]);
    } else if (route === "#/settings") {
      activeTab("settings");
      await settingsView();
    } else if (route === "#/references") {
      await referencesView();
    } else if (route === "#/library") {
      await libraryView();
    } else if (route.match(/^#\/library\/[^/]+$/)) {
      await libraryView(route.split("/").pop());
    } else if (referenceMatch) {
      // Deep-Link auf eine Referenz: die Bibliothek steht, die Detailansicht
      // liegt als Fenster darueber. Die Adresse faellt danach auf die
      // Bibliothek zurueck, damit ΓÇ₧Zurueck" das Fenster nicht schliesst.
      await referencesView();
      if (generation === currentRouteGeneration()) await refsOpenInspector(referenceMatch[1], { replace: true });
    } else if (route === "#/trash") {
      activeTab("projects");
      await trashView();
    } else {
      activeTab("projects");
      await projectsView();
    }
  } catch (error) {
    // Ein Fehler der veralteten Route geh├╢rt nicht auf die B├╝hne der neuen.
    if (generation === currentRouteGeneration()) {
      failed(error);
      render([routeErrorView(error)]);
    }
  }
  if (refsTray) refsRenderTray();
}

window.addEventListener("hashchange", () => void renderRoute());
void renderRoute();
