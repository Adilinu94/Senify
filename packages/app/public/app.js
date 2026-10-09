// Senify program shell: a dependency-free hash-router SPA over the local
// engine API (proxied same-origin by the app server).

const view = document.getElementById("view");
const toasts = document.getElementById("toasts");
const cmdk = document.getElementById("cmdk");
const cmdkInput = document.getElementById("cmdk-input");
const cmdkResults = document.getElementById("cmdk-results");
const duplicateDialog = document.getElementById("duplicate-dialog");
const duplicateForm = document.getElementById("duplicate-form");
const duplicateName = document.getElementById("duplicate-name");
const themeToggle = document.getElementById("theme-toggle");

const MODE_STORAGE_KEY = "senify-mode";

const MUTATION_LABELS = {
  insertNode: "Sektion eingefügt",
  deleteNode: "Sektion entfernt",
  duplicateNode: "Sektion dupliziert",
  moveNode: "Sektion verschoben",
  wrapNode: "Sektion umgebaut",
  updateNodeProps: "Props geändert",
  updateNodeMeta: "Meta geändert",
  setBreakpointOverride: "Breakpoint-Override gesetzt",
  clearBreakpointOverride: "Breakpoint-Override entfernt",
  setMotion: "Motion gesetzt",
  clearMotion: "Motion entfernt",
  updatePageMeta: "Seiten-Meta geändert",
  update_theme: "Theme geändert",
  rename_site: "Projekt umbenannt",
  trash_site: "Projekt in den Papierkorb",
  restore_site: "Projekt wiederhergestellt",
  duplicate_site: "Projekt dupliziert",
};

// The dashboard writes as the human operator; agents use their own tokens.
const AUTHOR = { kind: "human", id: "programm", label: "Programm" };

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (value !== undefined && value !== null) node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === undefined || child === null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: options.body === undefined ? undefined : { "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let data = {};
  try {
    data = text === "" ? {} : JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const error = data.error ?? {};
    const failure = new Error(error.message ?? `HTTP ${response.status}`);
    failure.suggestion = error.suggestion;
    failure.status = response.status;
    throw failure;
  }
  return data;
}

function toast(message, kind = "info") {
  const node = el("div", { class: `toast ${kind}`, text: message });
  toasts.append(node);
  setTimeout(() => node.remove(), kind === "error" ? 7000 : 4000);
}

function friendlyError(error) {
  const status = Number(error?.status ?? 0);
  if (status === 429) return "Der Server ist gerade ausgelastet. Bitte in einen Moment erneut versuchen.";
  if (status === 401 || status === 403) return "Diese Aktion ist für die aktuelle Sitzung nicht freigegeben.";
  if (status >= 500) return "Der Server konnte die Anfrage nicht abschließen. Bitte erneut versuchen.";
  return String(error?.message ?? "Unbekannter Fehler");
}

function failed(error) {
  const hint = error?.suggestion ? ` — ${error.suggestion}` : "";
  toast(`${friendlyError(error)}${hint}`, "error");
}

function settingField(label, control, help) {
  const field = el("label", { class: "field" });
  field.append(el("span", { class: "field__label", text: label }), control);
  if (help !== undefined) field.append(el("span", { class: "field__help", text: help }));
  return field;
}

function readMode() {
  try {
    return localStorage.getItem(MODE_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function syncThemeToggle() {
  if (!themeToggle) return;
  const dark = document.documentElement.dataset.mode === "dark";
  themeToggle.setAttribute("aria-pressed", String(dark));
  themeToggle.setAttribute(
    "aria-label",
    dark ? "Dunkelmodus deaktivieren" : "Dunkelmodus aktivieren",
  );
  themeToggle.title = dark ? "Dunkelmodus deaktivieren" : "Dunkelmodus aktivieren";
  themeToggle.querySelector("[data-theme-label]").textContent = dark ? "Hell" : "Dunkel";
}

function applyMode(mode, persist = true) {
  const next = mode === "dark" ? "dark" : "light";
  document.documentElement.dataset.mode = next;
  if (persist) {
    try {
      localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
      // Private Fenster dürfen die Einstellung nicht blockieren.
    }
  }
  syncThemeToggle();
}

applyMode(readMode(), false);
themeToggle?.addEventListener("click", () => {
  applyMode(document.documentElement.dataset.mode === "dark" ? "light" : "dark");
});

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function notificationStatus(status) {
  if (status === "sent") return "Gesendet";
  if (status === "failed") return "Fehlgeschlagen";
  return "Wartet";
}

function formatBytes(value) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function initials(name) {
  return name.trim().slice(0, 2).toUpperCase();
}

// References (T14): a stored snapshot arrives as a served PNG. The preview
// path comes from the engine, the fallback reconstructs it from the storage
// ref (both use posix separators).
function snapshotImageURL(referenceId, snapshot) {
  if (snapshot.previewPath) return snapshot.previewPath;
  const name = String(snapshot.storageRef).split("/").pop();
  return `/api/references/${referenceId}/snapshots/${name}`;
}

function activeTab(tab) {
  for (const link of document.querySelectorAll(".tabs a")) {
    link.classList.toggle("active", link.dataset.tab === tab);
  }
  for (const link of document.querySelectorAll(".workspace-tabs a")) {
    link.classList.toggle("active", link.dataset.wtab === tab);
  }
}

function render(nodes) {
  view.replaceChildren(...nodes);
}

/* Views */

async function libraryView(componentId = null) {
  activeTab("library");
  const [{ components }, { sites }] = await Promise.all([
    api("/api/library-components"),
    api("/api/sites"),
  ]);
  const rawQuery = location.hash.split("?")[1] ?? "";
  const query = (rawQuery.startsWith("q=") ? decodeURIComponent(rawQuery.slice(2).replace(/\+/g, " ")) : "").toLowerCase();
  const visible = components.filter((component) =>
    `${component.name} ${component.tags.join(" ")} ${component.fingerprint}`.toLowerCase().includes(query),
  );
  const select = el("select", { "aria-label": "Zielprojekt" });
  select.append(el("option", { value: "", text: "Zielprojekt wählen …" }));
  for (const site of sites) select.append(el("option", { value: site.id, text: site.name }));
  const search = el("input", { type: "search", placeholder: "Bausteine durchsuchen …", "aria-label": "Bausteine durchsuchen" });
  search.value = query;
  search.addEventListener("input", () => {
    const suffix = search.value.trim() === "" ? "" : `?q=${encodeURIComponent(search.value.trim())}`;
    history.replaceState(null, "", `#/library${suffix}`);
    void libraryView();
  });
  const installFor = async (component, mode = "linked") => {
    if (select.value === "") {
      toast("Zuerst ein Zielprojekt wählen");
      return;
    }
    try {
      await api(`/api/sites/${select.value}/library-installs`, {
        method: "POST",
        body: { componentId: component.id, mode, author: AUTHOR },
      });
      toast(`„${component.name}“ installiert`);
      await libraryView(component.id);
    } catch (error) {
      failed(error);
    }
  };
  const list = visible.length === 0
    ? el("div", { class: "empty", text: "Noch keine Bausteine vorhanden." })
    : el(
        "div",
        { class: "library-grid" },
        visible.map((component) =>
          el(
            "article",
            { class: "library-card" },
            el(
              "a",
              { href: `#/library/${component.id}` },
              el("h2", { text: component.name }),
              el("p", { class: "muted", text: `${component.kind} · v${component.version} · ${component.fingerprint}` }),
              el("div", { class: "library-tags" }, component.tags.map((tag) => el("span", { text: tag }))),
            ),
            el(
              "div",
              { class: "library-card-actions" },
              el("button", { class: "primary", text: "Installieren", onclick: () => void installFor(component) }),
              el("a", { href: `#/library/${component.id}`, text: "Details" }),
            ),
          ),
        ),
      );
  const head = el("div", { class: "toolbar library-toolbar" },
    el("h1", { text: componentId ? "Baustein" : "Bausteine" }),
    el("div", { class: "spacer" }),
    componentId ? el("a", { href: "#/library", text: "← Bibliothek" }) : null,
    select);
  const body = [head, el("div", { class: "library-search" }, search)];
  if (componentId === null) {
    body.push(list);
  } else {
    const component = components.find((entry) => entry.id === componentId);
    if (component === undefined) {
      body.push(el("div", { class: "empty", text: "Baustein nicht gefunden." }));
    } else {
      const installs = [];
      for (const site of sites) {
        const { installs: entries } = await api(`/api/sites/${site.id}/library-installs`);
        const install = entries.find((entry) => entry.componentId === component.id);
        if (install === undefined) continue;
        installs.push(el("div", { class: "library-install" },
          el("strong", { text: site.name }),
          el("span", { class: "muted", text: `Pin v${install.installedVersion}` }),
          el("button", { text: "Aktualisieren", onclick: async () => {
            try {
              await api(`/api/sites/${site.id}/library-installs/${install.id}/update`, { method: "POST", body: { author: AUTHOR } });
              toast(`Installation in „${site.name}“ aktualisiert`);
              await libraryView(component.id);
            } catch (error) { failed(error); }
          } }),
          el("button", { class: "danger", text: "Detach", onclick: async () => {
            try {
              await api(`/api/sites/${site.id}/library-installs/${install.id}`, { method: "DELETE", body: { author: AUTHOR } });
              toast("Installation gelöst, lokale Definition behalten");
              await libraryView(component.id);
            } catch (error) { failed(error); }
          } })));
      }
      const definition = component.definition;
      const nodeRows = Object.values(definition?.nodes ?? {}).map((node) => el("tr", {},
        el("td", {}, el("code", { text: node.id })),
        el("td", { text: node.type }),
        el("td", { text: Object.entries(node.props ?? {}).map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join(" · ") })));
      body.push(el("div", { class: "library-detail" },
        el("h2", { text: component.name }),
        el("p", { class: "muted", text: component.notes || "Keine Notiz." }),
        el("div", { class: "library-meta" },
          el("span", { text: `Version ${component.version}` }),
          el("span", { text: `Fingerprint ${component.fingerprint}` }),
          el("span", { text: `Lizenz ${component.license.id} (${component.license.status})` }),
          el("span", { text: `Herkunft ${component.provenance.kind}` })),
        el("div", { class: "card-actions" },
          el("button", { class: "primary", text: "Installieren", onclick: () => void installFor(component) }),
          el("button", { text: "Notiz", onclick: async () => {
            const notes = prompt("Notiz", component.notes ?? "");
            if (notes === null) return;
            try {
              await api(`/api/library-components/${component.id}`, { method: "PATCH", body: { notes, author: AUTHOR } });
              await libraryView(component.id);
            } catch (error) { failed(error); }
          } }),
          el("button", { text: component.deprecatedAt ? "Reaktivieren" : "Deprecate", onclick: async () => {
            try {
              await api(`/api/library-components/${component.id}`, { method: "PATCH", body: { deprecated: component.deprecatedAt === null, author: AUTHOR } });
              await libraryView(component.id);
            } catch (error) { failed(error); }
          } })),
        el("h3", { text: "Struktur" }),
        el("table", {}, el("thead", {}, el("tr", {}, el("th", { text: "ID" }), el("th", { text: "Typ" }), el("th", { text: "Props" }))), el("tbody", {}, nodeRows)),
        el("h3", { text: "Installationen" }),
        installs.length === 0 ? el("div", { class: "empty", text: "Noch in keinem Projekt installiert." }) : el("div", { class: "stack" }, installs)));
    }
  }
  render(body);
}

async function projectsView() {
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
  ]);
}

async function createSite() {
  const name = prompt("Name des Projekts");
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
  const name = prompt("Neuer Name", site.name);
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
  if (!confirm(`„${site.name}“ in den Papierkorb verschieben?`)) return;
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

async function trashView() {
  const { sites } = await api("/api/sites?trash=1");
  render([
    el(
      "div",
      { class: "toolbar" },
      el("h1", { text: "Papierkorb", style: "margin: 0" }),
      el("div", { class: "spacer" }),
      el("a", { href: "#/", class: "muted", text: "← Projekte" }),
    ),
    sites.length === 0
      ? el("div", { class: "empty", text: "Der Papierkorb ist leer." })
      : el(
          "table",
          {},
          el(
            "thead",
            {},
            el(
              "tr",
              {},
              el("th", { text: "Projekt" }),
              el("th", { text: "Gelöscht" }),
              el("th", {}),
            ),
          ),
          el(
            "tbody",
            {},
            sites.map((site) =>
              el(
                "tr",
                {},
                el("td", { text: site.name }),
                el("td", { text: formatDate(site.trashedAt) }),
                el(
                  "td",
                  {},
                  el(
                    "div",
                    { class: "row-actions" },
                    el("button", {
                      class: "ghost",
                      text: "Wiederherstellen",
                      onclick: async () => {
                        try {
                          await api(`/api/sites/${site.id}/restore`, {
                            method: "POST",
                            body: { author: AUTHOR },
                          });
                          toast("Projekt wiederhergestellt");
                          await renderRoute();
                        } catch (error) {
                          failed(error);
                        }
                      },
                    }),
                    el("button", {
                      class: "danger",
                      text: "Endgültig löschen",
                      onclick: async () => {
                        if (
                          !confirm(
                            `„${site.name}“ endgültig löschen? Das kann nicht rückgängig gemacht werden.`,
                          )
                        ) {
                          return;
                        }
                        try {
                          await api(`/api/sites/${site.id}`, { method: "DELETE" });
                          toast("Projekt endgültig gelöscht");
                          await renderRoute();
                        } catch (error) {
                          failed(error);
                        }
                      },
                    }),
                  ),
                ),
              ),
            ),
          ),
        ),
  ]);
}

const snapshotDialog = document.getElementById("snapshot-dialog");
const snapshotForm = document.getElementById("snapshot-form");

function openSnapshotDialog() {
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

async function deleteReference(reference) {
  const used = reference.usedInProjects.length;
  const message =
    used > 0
      ? `„${reference.name}“ ist ${used} Projekt(en) zugeordnet. Trotzdem löschen?`
      : `„${reference.name}“ löschen?`;
  if (!confirm(message)) return;
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
let refsDom = null;
let refsTray = null;
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
function refsToast(message) {
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
function refsBindBackdropClose(dialog) {
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

function refsRenderTray() {
  const tray = refsTrayEnsure();
  const selected = refsState.selected;
  tray.hidden = selected.length === 0 || !refsRouteActive;
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
  if (!confirm(message)) return;
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

async function referencesView() {
  activeTab("references");
  refsApplyAddress();
  const dom = refsBuildShell();
  render([dom.root]);
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
function refsFold(title, body, open) {
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

let refsInspector = null;
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

/* Dokumente der importierten Referenzen (design.md, Guidelines, Komponenten).
   Der Renderer deckt genau ab, was diese Dateien nutzen: Ueberschriften,
   Tabellen, Listen, Blockzitate, Code, Hervorhebungen und Links. Rohes HTML
   wird immer maskiert, es gibt keinen Durchgriff auf das Dokument. */
function refsEscapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function refsInlineMarkdown(value) {
  return String(value)
    .split(/(`[^`]+`)/g)
    .map((part) => {
      if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
        return `<code>${refsEscapeHtml(part.slice(1, -1))}</code>`;
      }
      return refsEscapeHtml(part)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
        .replace(
          /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
          '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
        );
    })
    .join("");
}

function refsMarkdownTable(rows) {
  const cells = (row) =>
    String(row)
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
  const head = cells(rows[0] ?? "")
    .map((cell) => `<th>${refsInlineMarkdown(cell)}</th>`)
    .join("");
  const body = rows
    .slice(2)
    .map(
      (row) =>
        `<tr>${cells(row)
          .map((cell) => `<td>${refsInlineMarkdown(cell)}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function refsRenderMarkdown(source) {
  const lines = String(source ?? "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let paragraph = [];
  let listKind = null;
  let codeLines = null;

  const closeList = () => {
    if (listKind !== null) {
      out.push(`</${listKind}>`);
      listKind = null;
    }
  };
  const flushParagraph = () => {
    if (paragraph.length > 0) {
      out.push(`<p>${refsInlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    closeList();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (codeLines !== null) {
      if (trimmed.startsWith("```")) {
        out.push(`<pre><code>${refsEscapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = null;
      } else {
        codeLines.push(line);
      }
      continue;
    }
    if (trimmed.startsWith("```")) {
      flushAll();
      codeLines = [];
      continue;
    }
    if (trimmed === "") {
      flushAll();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading !== null) {
      flushAll();
      const level = (heading[1] ?? "#").length;
      out.push(`<h${level}>${refsInlineMarkdown(heading[2] ?? "")}</h${level}>`);
      continue;
    }

    const next = (lines[index + 1] ?? "").trim();
    if (trimmed.startsWith("|") && next.startsWith("|") && /^\|?[\s:|-]+\|/.test(next)) {
      flushAll();
      const table = [];
      while (index < lines.length && (lines[index] ?? "").trim().startsWith("|")) {
        table.push((lines[index] ?? "").trim());
        index += 1;
      }
      index -= 1;
      out.push(refsMarkdownTable(table));
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    const ordered = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (bullet !== null || ordered !== null) {
      flushParagraph();
      const kind = ordered === null ? "ul" : "ol";
      if (listKind !== kind) {
        closeList();
        out.push(`<${kind}>`);
        listKind = kind;
      }
      out.push(`<li>${refsInlineMarkdown((bullet ?? ordered)[1] ?? "")}</li>`);
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushAll();
      out.push(`<blockquote>${refsInlineMarkdown(trimmed.replace(/^>\s?/, ""))}</blockquote>`);
      continue;
    }

    paragraph.push(trimmed);
  }
  if (codeLines !== null) {
    out.push(`<pre><code>${refsEscapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  flushAll();
  return out.join("");
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
async function refsOpenInspector(referenceId, options = {}) {
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
function refsSettingsSection(settings) {
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

function linesToList(value) {
  return String(value ?? "")
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// One backup row: the restore runs through POST /api/backups/:id/restore
// (destructive) and needs an explicit second click; the engine writes a
// safety backup of the replaced state before it touches anything.
function backupRow(backup) {
  const cancel = el("button", { class: "ghost", text: "Abbrechen", hidden: true });
  const button = el("button", { class: "ghost", text: "Wiederherstellen" });
  cancel.addEventListener("click", () => {
    button.dataset.stage = "";
    button.textContent = "Wiederherstellen";
    button.disabled = false;
    cancel.hidden = true;
  });
  button.addEventListener("click", async () => {
    if (button.dataset.stage !== "confirm") {
      button.dataset.stage = "confirm";
      button.textContent = "Wirklich wiederherstellen?";
      cancel.hidden = false;
      return;
    }
    button.disabled = true;
    button.textContent = "Stelle wieder her …";
    try {
      const result = await api(`/api/backups/${encodeURIComponent(backup.id)}/restore`, {
        method: "POST",
        body: { confirm: true },
      });
      toast(`Wiederhergestellt — Schutznetz: ${result.safetyBackup}`);
      await renderRoute();
    } catch (error) {
      failed(error);
      button.disabled = false;
      button.textContent = "Wiederherstellen";
      button.dataset.stage = "";
      cancel.hidden = true;
    }
  });
  return el(
    "tr",
    {},
    el("td", { text: formatDate(backup.createdAt) }),
    el("td", { text: formatBytes(backup.bytes) }),
    el("td", {
      text: `${backup.fileCount} Dateien · ${Object.keys(backup.tables).length} Tabellen`,
    }),
    el("td", {}, el("span", { class: "inline" }, button, cancel)),
  );
}

async function settingsView() {
  const { tokens } = await api("/api/tokens");
  const settings = await api("/api/settings");
  const backups = await api("/api/backups");
  const rows = tokens.map((token) =>
    el(
      "tr",
      {},
      el("td", { text: token.name }),
      el("td", { text: token.scopes.join(", ") }),
      el("td", {}, el("code", { text: token.prefix })),
      el("td", { text: token.lastUsedAt ? formatDate(token.lastUsedAt) : "nie" }),
      el("td", {}, token.revokedAt ? el("span", { class: "tag", text: "widerrufen" }) : el("span", { class: "muted", text: "aktiv" })),
      el(
        "td",
        {},
        el(
          "div",
          { class: "row-actions" },
          token.revokedAt
            ? undefined
            : el("button", {
                class: "danger",
                text: "Widerrufen",                 onclick: async () => {
                   if (!confirm(`Token „${token.name}“ wirklich widerrufen? Danach kann der Client nicht mehr zugreifen.`)) return;
                   try {
                     await api(`/api/tokens/${token.id}`, { method: "DELETE" });
                    toast("Token widerrufen");
                    await renderRoute();
                  } catch (error) {
                    failed(error);
                  }
                },
              }),
        ),
      ),
    ),
  );
  render([
    el("h1", { text: "Einstellungen" }),
    el(
      "section",
      { class: "panel" },
      el("h2", { text: "Agenten-Zugänge" }),
      el("p", {
        class: "muted",
        text: "Scoped Tokens für MCP-Clients (Claude Code, Cursor, opencode). Clients verbindest du im Terminal mit `senify mcp configure`.",
      }),
      tokens.length === 0
        ? el("p", { class: "muted", text: "Noch keine Tokens." })
        : el(
            "table",
            {},
            el(
              "thead",
              {},
              el(
                "tr",
                {},
                el("th", { text: "Name" }),
                el("th", { text: "Scopes" }),
                el("th", { text: "Prefix" }),
                el("th", { text: "Letzte Nutzung" }),
                el("th", { text: "Status" }),
                el("th", {}),
              ),
            ),
            el("tbody", {}, rows),
          ),
      el(
        "div",
        { class: "settings-grid settings-grid--two", style: "margin-top: 0.9rem" },
        settingField(
          "Name",
          el("input", { id: "token-name", type: "text", placeholder: "z. B. Claude Code" }),
          "Eine lesbare Bezeichnung für den Client.",
        ),
        settingField(
          "Berechtigungen",
          el("input", { id: "token-scopes", type: "text", value: "read,write" }),
          "Kommagetrennt, zum Beispiel read,write.",
        ),
        el(
          "div",
          { class: "settings-actions" },
          el("button", {
            class: "primary",
            text: "Token anlegen",
            onclick: async () => {
              const name = document.getElementById("token-name").value.trim();
              const scopes = document
                .getElementById("token-scopes")
                .value.split(",")
                .map((entry) => entry.trim())
                .filter(Boolean);
              if (!name) {
                toast("Bitte einen Namen angeben.", "error");
                document.getElementById("token-name").focus();
                return;
              }
              try {
                const created = await api("/api/tokens", { method: "POST", body: { name, scopes } });
                toast(`Token angelegt — Secret (einmalig): ${created.secret}`);
                await renderRoute();
              } catch (error) {
                failed(error);
              }
            },
          }),
        ),
      ),
    ),
    el(
      "section",
      { class: "panel" },
      el("h2", { text: "E-Mail" }),
      el("p", {
        class: "muted",
        text: "SMTP-Postfach für Formular-Benachrichtigungen und Newsletter. Das Passwort wird verschlüsselt gespeichert und nie angezeigt.",
      }),
      el(
        "div",
        { class: "settings-grid" },
        settingField("Server", el("input", { id: "smtp-host", type: "text", placeholder: "smtp.example.com", value: settings.email.host })),
        settingField("Port", el("input", { id: "smtp-port", type: "number", placeholder: "587", value: String(settings.email.port) })),
        settingField(
          "Verschlüsselung",
          el(
            "select",
            { id: "smtp-tls" },
            ...["starttls", "tls", "none"].map((mode) =>
              el("option", {
                value: mode,
                text: mode === "starttls" ? "STARTTLS" : mode.toUpperCase(),
                selected: mode === settings.email.tls ? "" : undefined,
              }),
            ),
          ),
        ),
      ),
      el(
        "div",
        { class: "settings-grid", style: "margin-top: 0.75rem" },
        settingField("Benutzer", el("input", { id: "smtp-user", type: "text", placeholder: "Benutzer", value: settings.email.user })),
        settingField(
          "Passwort",
          el("input", {
            id: "smtp-password",
            type: "password",
            placeholder: settings.email.hasPassword
              ? "gespeichert — leer lassen zum Beibehalten"
              : "noch nicht gespeichert",
          }),
        ),
        settingField("Absender", el("input", { id: "smtp-from", type: "text", placeholder: "Absender, z. B. formular@kunde.de", value: settings.email.from })),
      ),
      el(
        "div",
        { class: "settings-actions", style: "margin-top: 0.9rem" },
        el("button", {
          class: "primary",
          text: "E-Mail-Einstellungen speichern",
          onclick: async () => {
            const value = (id) => document.getElementById(id).value;
            const password = value("smtp-password");
            try {
              await api("/api/settings", {
                method: "PUT",
                body: {
                  email: {
                    host: value("smtp-host"),
                    port: Number(value("smtp-port")) || 587,
                    tls: value("smtp-tls"),
                    user: value("smtp-user"),
                    from: value("smtp-from"),
                    ...(password ? { password } : {}),
                  },
                },
              });
              toast("E-Mail-Einstellungen gespeichert");
              await renderRoute();
            } catch (error) {
              failed(error);
            }
          },
        }),
        settingField(
          "Testempfänger",
          el("input", { id: "smtp-test-to", type: "text", placeholder: "name@example.de" }),
        ),
        el("button", {
          class: "ghost",
          text: "Testmail senden",
          onclick: async () => {
            const to = document.getElementById("smtp-test-to").value.trim();
            const result = document.getElementById("smtp-test-result");
            if (!to) {
              toast("Bitte eine Empfängeradresse angeben.", "error");
              return;
            }
            result.textContent = "Sende …";
            try {
              const response = await api("/api/settings/email/test", { method: "POST", body: { to } });
              result.textContent = response.ok
                ? `Gesendet an ${response.to}.`
                : `Fehler (${response.reason}): ${response.message}`;
              result.dataset.tone = response.ok ? "success" : "error";
              if (!response.ok) toast(response.message, "error");
            } catch (error) {
              result.textContent = friendlyError(error);
              result.dataset.tone = "error";
              failed(error);
            }
          },
        }),
        el("span", { id: "smtp-test-result", class: "settings-message", role: "status" }),
      ),
    ),
    el(
      "section",
      { class: "panel" },
      el("h2", { text: "Bildgenerierung" }),
      el("p", {
        class: "muted",
        text: "Provider-Kette für generate_image: Der erste Provider springt ein; fällt er aus, übernimmt der Fallback, am Ende immer die lokale ComfyUI-Reserve. Der API-Key des Custom-Endpoints wird verschlüsselt gespeichert und nie angezeigt.",
      }),
      el(
        "div",
        { class: "settings-grid" },
        settingField(
          "Provider",
          el(
            "select",
            { id: "image-provider" },
            ...["image-use", "comfyui", "custom", "off"].map((provider) =>
              el("option", {
                value: provider,
                text: provider === "image-use" ? "Image Use" : provider === "off" ? "Aus" : provider,
                selected: provider === settings.image.provider ? "" : undefined,
              }),
            ),
          ),
        ),
        settingField(
          "Fallback",
          el(
            "select",
            { id: "image-fallback" },
            ...["comfyui", "image-use", "custom", "none"].map((provider) =>
              el("option", {
                value: provider,
                text: provider === "none" ? "Kein Fallback" : provider === "image-use" ? "Image Use" : provider,
                selected: provider === settings.image.fallbackProvider ? "" : undefined,
              }),
            ),
          ),
        ),
      ),
      el("h3", { text: "Custom-Endpoint (eigene API)" }),
      el(
        "div",
        { class: "settings-grid" },
        settingField(
          "Format",
          el(
            "select",
            { id: "image-custom-format" },
            ...["minimax", "openai"].map((format) =>
              el("option", {
                value: format,
                text: format === "minimax" ? "MiniMax" : "OpenAI-kompatibel",
                selected: format === settings.image.customFormat ? "" : undefined,
              }),
            ),
          ),
        ),
        settingField(
          "Basis-URL",
          el("input", {
            id: "image-custom-url",
            type: "text",
            placeholder: "https://api.minimax.io/v1",
            value: settings.image.customBaseUrl,
          }),
        ),
        settingField(
          "Modell",
          el("input", {
            id: "image-custom-model",
            type: "text",
            placeholder: "image-01",
            value: settings.image.customModel,
          }),
        ),
      ),
      el(
        "div",
        { class: "settings-actions", style: "margin-top: 0.9rem" },
        settingField(
          "API-Key",
          el("input", {
            id: "image-custom-key",
            type: "password",
            placeholder: settings.image.hasCustomApiKey
              ? "gespeichert — leer lassen zum Beibehalten"
              : "noch nicht gespeichert",
          }),
        ),
        el("button", {
          class: "primary",
          text: "Bild-API-Einstellungen speichern",
          onclick: async () => {
            const value = (id) => document.getElementById(id).value;
            const key = value("image-custom-key");
            try {
              await api("/api/settings", {
                method: "PUT",
                body: {
                  image: {
                    provider: value("image-provider"),
                    fallbackProvider: value("image-fallback"),
                    customFormat: value("image-custom-format"),
                    customBaseUrl: value("image-custom-url"),
                    customModel: value("image-custom-model"),
                    ...(key ? { customApiKey: key } : {}),
                  },
                },
              });
              toast("Bildgenerierung gespeichert");
              await renderRoute();
            } catch (error) {
              failed(error);
            }
          },
        }),
        el("button", {
          class: "ghost",
          text: "Status prüfen",
          onclick: async () => {
            const out = document.getElementById("image-health");
            out.textContent = "prüfe …";
            try {
              const health = await api("/api/images/health");
              const custom = health.providers?.custom;
              out.textContent = `Custom: ${custom?.ok ? "bereit" : "nicht bereit"} – ${custom?.detail ?? "keine Antwort"}`;
              out.dataset.tone = custom?.ok ? "success" : "error";
            } catch (error) {
              out.textContent = friendlyError(error);
              out.dataset.tone = "error";
            }
          },
        }),
        el("span", { id: "image-health", class: "settings-message", role: "status" }),
      ),
      el("p", {
        class: "muted",
        text: "Formate: minimax (POST /image_generation, aspect_ratio) oder openai (POST /images/generations, size).",
      }),
    ),
    el(
      "section",
      { class: "panel" },
      el("h2", { text: "Speicher & Sicherung" }),
      el("p", {
        class: "muted",
        text: backups.status.lastBackup
          ? `Letzte Sicherung: ${formatDate(backups.status.lastBackup.createdAt)}, ${formatBytes(backups.status.lastBackup.bytes)}, ${backups.status.lastBackup.fileCount} Dateien`
          : "Noch keine Sicherung erstellt.",
      }),
      el("p", {
        class: "muted",
        text: `${backups.status.count} Sicherung(en), Zielordner: ${backups.status.targetDir}`,
      }),
      el(
        "div",
        { class: "settings-actions" },
        settingField(
          "Zielordner",
          el("input", { id: "backup-dir", type: "text", placeholder: "Standard verwenden", value: settings.backup.targetDir }),
          "Leer lassen, um den Standardpfad zu verwenden.",
        ),
        el("button", {
          class: "ghost",
          text: "Zielordner speichern",
          onclick: async () => {
            try {
              await api("/api/settings", {
                method: "PUT",
                body: { backup: { targetDir: document.getElementById("backup-dir").value.trim() || null } },
              });
              toast("Zielordner gespeichert");
              await renderRoute();
            } catch (error) {
              failed(error);
            }
          },
        }),
        el("button", {
          class: "primary",
          text: "Sicherung jetzt erstellen",
          onclick: async () => {
            try {
              const created = await api("/api/backups", { method: "POST" });
              toast(`Sicherung erstellt: ${created.backup.id}`);
              await renderRoute();
            } catch (error) {
              failed(error);
            }
          },
        }),
      ),
      el(
        "div",
        { class: "backup-list" },
        (backups.backups ?? []).length === 0
          ? el("p", {
              class: "muted",
              text: "Noch keine Sicherung vorhanden — oben eine erstellen.",
            })
          : el(
              "table",
              {},
              el(
                "thead",
                {},
                el(
                  "tr",
                  {},
                  el("th", { text: "Zeitpunkt" }),
                  el("th", { text: "Größe" }),
                  el("th", { text: "Inhalt" }),
                  el("th", {}),
                ),
              ),
              el("tbody", {}, ...(backups.backups ?? []).map((backup) => backupRow(backup))),
            ),
      ),
      el("p", {
        class: "muted",
        text: "Die Wiederherstellung ersetzt Tabellen und Dateien durch die Sicherung; der bisherige Stand wird vorher automatisch als Schutznetz gesichert. Währenddessen nicht im Programm arbeiten.",
      }),
      el(
        "details",
        {},
        el("summary", { text: "Manuelle Wiederherstellung (ohne laufende Engine)" }),
        el(
          "ol",
          {},
          el("li", { text: "Engine beenden (`senify start` mit Strg+C)." }),
          el("li", { text: "Zielordner öffnen, den gewünschten Zeitstempel-Ordner wählen und das Manifest prüfen." }),
          el("li", { text: "Tabellen aus `tables/*.json` in die Zieldatenbank einspielen (psql, z. B. TRUNCATE dann COPY)." }),
          el("li", { text: "Dateien aus `files/` über das Datenverzeichnis kopieren (SENIFY_DATA_DIR, Standard ~/.senify)." }),
          el("li", { text: "Engine starten und Projektliste sowie Health-Check prüfen." }),
        ),
      ),
    ),
    refsSettingsSection(settings),
    el(
      "section",
      { class: "panel" },
      el("h2", { text: "Standardwerte" }),
      el("p", {
        class: "muted",
        text: "Gelten für neue Projekte, das Standard-Layout und den Programmstart.",
      }),
      el(
        "div",
        { class: "inline" },
        el("label", { class: "muted", for: "defaults-profile" }, "Standard-Niveau"),
        el(
          "select",
          { id: "defaults-profile" },
          ...["clean", "standard", "showcase"].map((profile) =>
            el("option", {
              value: profile,
              text: profile,
              selected: profile === settings.defaults.defaultProfile ? "" : undefined,
            }),
          ),
        ),
        el("label", { class: "muted", for: "defaults-layout" }, "Standard-Layout"),
        el("input", { id: "defaults-layout", type: "text", value: settings.defaults.defaultLayout }),
      ),
      el(
        "label",
        { class: "muted", for: "defaults-autostart" },
        el("input", {
          id: "defaults-autostart",
          type: "checkbox",
          checked: settings.defaults.autostart ? "" : undefined,
        }),
        " Autostart: beim `senify start` den Browser automatisch öffnen",
      ),
      el("button", {
        class: "primary",
        text: "Standard-Einstellungen speichern",
        onclick: async () => {
          try {
            await api("/api/settings", {
              method: "PUT",
              body: {
                defaults: {
                  defaultProfile: document.getElementById("defaults-profile").value,
                  defaultLayout: document.getElementById("defaults-layout").value.trim(),
                  autostart: document.getElementById("defaults-autostart").checked,
                },
              },
            });
            toast("Standardwerte gespeichert");
            await renderRoute();
          } catch (error) {
            failed(error);
          }
        },
      }),
    ),
  ]);
}

const WORKSPACE_TABS = [
  ["pages", "Seiten"],
  ["articles", "Artikel"],
  ["templates", "Vorlagen"],
  ["submissions", "Einsendungen"],
  ["review", "Prüfen"],
  ["activity", "Aktivität"],
  ["settings", "Einstellungen"],
];

// Selected form in the submissions tab (per program run, not per project).
let selectedFormId = null;

// The open SSE channel of the active canvas view (ticket 05): a route change
// closes it before the next view subscribes, so streams do not stack up.
let activeLiveStream = null;
let activeToolbarMenuCleanup = null;

// The entry preview stays open across re-renders of the article editor.
let entryPreviewOpen = false;

function workspaceFrame(siteId, site, tab, live) {
  const head = el(
    "div",
    { class: "workspace-head" },
    el(
      "div",
      {},
      el("div", { class: "muted", text: "Projekt" }),
      el("h1", { style: "margin: 0", text: site.name }),
    ),
    el("span", { class: `status-dot ${live ? "live" : ""}` }),
    el("span", { class: "muted", text: live ? "Live" : "Entwurf" }),
  );
  const tabs = WORKSPACE_TABS.map(([id, label]) =>
    el("a", {
      href: `#/projects/${siteId}/${id}`,
      "data-wtab": id,
      class: id === tab ? "active" : "",
      text: label,
    }),
  );
  return [head, el("div", { class: "workspace-tabs" }, tabs)];
}

async function projectView(siteId, tab) {
  const [site, { pages }, { releases }] = await Promise.all([
    api(`/api/sites/${siteId}`),
    api(`/api/sites/${siteId}/pages`),
    api(`/api/sites/${siteId}/releases`),
  ]);
  activeTab("projects");
  const frame = workspaceFrame(siteId, site, tab, releases.length > 0);
  const body = [];
  if (tab === "pages") {
    body.push(
      el("h2", { text: "Seiten" }),
      pages.length === 0
        ? el("div", { class: "empty", text: "Noch keine Seiten." })
        : el(
            "table",
            {},
            el(
              "thead",
              {},
              el(
                "tr",
                {},
                el("th", { text: "Pfad" }),
                el("th", { text: "Titel" }),
                el("th", { text: "Draft" }),
                el("th", { text: "Geändert" }),
                el("th", {}),
              ),
            ),
            el(
              "tbody",
              {},
              pages.map((page) =>
                el(
                  "tr",
                  {},
                  el("td", {}, el("code", { text: page.path })),
                  el("td", { text: page.title || "—" }),
                  el("td", { text: `v${page.draftVersion}` }),
                  el("td", { text: formatDate(page.updatedAt) }),
                  el(
                    "td",
                    {},
                    el(
                      "div",
                      { class: "row-actions" },
                      el("a", {
                        href: `#/projects/${siteId}/pages/${page.id}`,
                        text: "Öffnen",
                      }),
                    ),
                  ),
                ),
              ),
            ),
          ),
    );
  } else if (tab === "review") {
    const { reviews } = await api(`/api/sites/${siteId}/reviews`);
    body.push(
      el("h2", { text: "Prüfen" }),
      reviews.length === 0
        ? el("div", { class: "empty", text: "Keine Review-Items." })
        : el(
            "div",
            { class: "stack" },
            reviews.map((review) => reviewPanel(siteId, review)),
          ),
    );
  } else if (tab === "activity") {
    const { entries } = await api(`/api/sites/${siteId}/audit?limit=50`);
    body.push(
      el("h2", { text: "Aktivität" }),
      entries.length === 0
        ? el("div", { class: "empty", text: "Noch keine Aktivität." })
        : el(
            "table",
            {},
            el(
              "thead",
              {},
              el(
                "tr",
                {},
                el("th", { text: "Zeit" }),
                el("th", { text: "Quelle" }),
                el("th", { text: "Änderung" }),
                el("th", { text: "Seite" }),
              ),
            ),
            el(
              "tbody",
              {},
              entries.map((entry) =>
                el(
                  "tr",
                  {},
                  el("td", { text: formatDate(entry.createdAt) }),
                  el("td", {
                    text: `${entry.author.kind === "agent" ? "Agent" : "Mensch"} · ${entry.author.label}`,
                  }),
                  el("td", { text: MUTATION_LABELS[entry.mutation] ?? entry.mutation }),
                  el("td", {}, el("code", { text: entry.pageId ?? "—" })),
                ),
              ),
            ),
          ),
    );
  } else if (tab === "settings") {
    body.push(
      el("h2", { text: "Projekt-Einstellungen" }),
      el(
        "div",
        { class: "panel" },
        el("p", {}, el("strong", { text: "Pfad-Präfix: " }), el("code", { text: site.slug })),
        el("p", {}, el("strong", { text: "Niveau: " }), site.profile),
        el("p", {
          class: "muted",
          text: "Name ändern, Stil-Referenz und Domain/Deploy folgen mit den nächsten Schritten.",
        }),
      ),
    );
    const [referenceData, { references: allReferences }] = await Promise.all([
      api(`/api/sites/${siteId}/references`),
      api("/api/references"),
    ]);
    const nameById = new Map(allReferences.map((entry) => [entry.id, entry.name]));
    body.push(
      el(
        "div",
        { class: "panel" },
        el("h2", { text: "Referenzen" }),
        referenceData.assignments.length === 0
          ? el("p", {
              class: "muted",
              text: "Noch keine Referenz für dieses Projekt hinterlegt.",
            })
          : el(
              "table",
              {},
              el(
                "thead",
                {},
                el(
                  "tr",
                  {},
                  el("th", { text: "Referenz" }),
                  el("th", { text: "Skalen" }),
                  el("th", {}),
                ),
              ),
              el(
                "tbody",
                {},
                referenceData.assignments.map((assignment) =>
                  el(
                    "tr",
                    {},
                    el("td", {
                      text: nameById.get(assignment.referenceId) ?? assignment.referenceId,
                    }),
                    el("td", { text: assignment.scales.join(", ") }),
                    el(
                      "td",
                      {},
                      el(
                        "div",
                        { class: "row-actions" },
                        el("button", {
                          class: "danger",
                          text: "Entfernen",
                          onclick: async () => {
                            try {
                              await api(
                                `/api/sites/${siteId}/references/${assignment.referenceId}`,
                                { method: "DELETE" },
                              );
                              toast("Zuordnung entfernt");
                              await renderRoute();
                            } catch (error) {
                              failed(error);
                            }
                          },
                        }),
                      ),
                    ),
                  ),
                ),
              ),
            ),
        el("p", {
          class: "muted",
          text:
            referenceData.unchanged?.unchanged === true
              ? "Round-Trip verifiziert: Anwenden ändert den Bake nicht ✓"
              : "Hinweis: Die Theme-Ableitung weicht vom Bake ab — Details im Referenzen-Tab.",
        }),
      ),
    );

    // Deploy (E14): der aktive Release wandert als statische Dateien in ein
    // Zielverzeichnis. Der erste Adapter ist lokal; die Historie zeigt Status
    // und Ziel jedes Deploys.
    const { deployments } = await api(`/api/sites/${siteId}/deployments`);
    const targetInput = el("input", {
      type: "text",
      placeholder: "C:\\sites\\meine-seite",
      style: "min-width: 22rem",
    });
    const deployButton = el("button", {
      type: "button",
      class: "primary",
      text: "Jetzt deployen",
    });
    deployButton.addEventListener("click", async () => {
      const targetDir = targetInput.value.trim();
      if (targetDir === "") {
        toast("Bitte ein Zielverzeichnis angeben", "error");
        return;
      }
      deployButton.disabled = true;
      try {
        const result = await api(`/api/sites/${siteId}/deployments`, {
          method: "POST",
          body: { provider: "static", targetDir },
        });
        const deployment = result.deployment;
        toast(
          `Deployt: ${deployment.fileCount} Dateien (${Math.round(deployment.byteSize / 1024)} KB) → ${deployment.target}`,
          "info",
        );
        await renderRoute();
      } catch (error) {
        failed(error);
      } finally {
        deployButton.disabled = false;
      }
    });
    body.push(
      el(
        "div",
        { class: "panel" },
        el("h2", { text: "Deploy" }),
        el("p", {
          class: "muted",
          text: "Liefert den aktiven Release als statische Dateien in ein Zielverzeichnis (lokal oder gemountet). Der Deploy läuft über eine Staging-Kopie; ein Fehler lässt den vorherigen Stand unangetastet.",
        }),
        el("div", { class: "row-actions" }, targetInput, deployButton),
        deployments.length === 0
          ? el("p", { class: "muted", text: "Noch kein Deploy." })
          : el(
              "table",
              {},
              el(
                "thead",
                {},
                el(
                  "tr",
                  {},
                  el("th", { text: "Zeit" }),
                  el("th", { text: "Status" }),
                  el("th", { text: "Ziel" }),
                  el("th", { text: "Dateien" }),
                  el("th", { text: "Fehler" }),
                ),
              ),
              el(
                "tbody",
                {},
                deployments.map((deployment) =>
                  el(
                    "tr",
                    {},
                    el("td", { text: formatDate(deployment.createdAt) }),
                    el("td", { text: deployment.status }),
                    el("td", {}, el("code", { text: deployment.target })),
                    el("td", { text: String(deployment.fileCount) }),
                    el("td", { text: deployment.error ?? "—" }),
                  ),
                ),
              ),
            ),
      ),
    );
  } else if (tab === "submissions") {
    const { forms } = await api(`/api/sites/${siteId}/forms`);
    body.push(el("h2", { text: "Einsendungen" }));
    if (forms.length === 0) {
      body.push(
        el("div", {
          class: "empty",
          text: "Noch keine Formulare. Ein Formular wird beim Veröffentlichen eingefroren — danach erscheinen hier die Einsendungen.",
        }),
      );
    } else {
      if (
        selectedFormId === null ||
        !forms.some((form) => form.formId === selectedFormId)
      ) {
        selectedFormId = forms[0].formId;
      }
      if (forms.length > 1) {
        const select = el("select", { id: "submissions-form" });
        for (const entry of forms) {
          const option = el("option", {
            value: entry.formId,
            text: `${entry.pagePath} · ${entry.sectionType}`,
          });
          if (entry.formId === selectedFormId) option.selected = true;
          select.append(option);
        }
        select.addEventListener("change", () => {
          selectedFormId = select.value;
          void renderRoute();
        });
        body.push(
          el(
            "div",
            { class: "toolbar" },
            el("span", { class: "muted", text: "Formular" }),
            select,
          ),
        );
      }
      const form = forms.find((entry) => entry.formId === selectedFormId) ?? forms[0];
      const view = await api(`/api/forms/${form.formId}/submissions`);
      body.push(
        el(
          "div",
          { class: "toolbar" },
          el("h3", { style: "margin: 0", text: `${form.pagePath} · ${form.sectionType}` }),
          el("span", { class: "muted", text: `${view.rows.length} Einsendungen` }),
          el("div", { class: "spacer" }),
          el("a", {
            href: `/api/forms/${form.formId}/submissions.csv`,
            download: `${form.sectionType}-submissions.csv`,
            text: "CSV herunterladen",
          }),
        ),
      );
      if (view.rows.length === 0) {
        body.push(el("div", { class: "empty", text: "Noch keine Einsendungen." }));
      } else {
        body.push(
          el(
            "table",
            {},
            el(
              "thead",
              {},
              el(
                "tr",
                {},
                view.columns.map((column) => el("th", { text: column.label })),
                el("th", {}),
              ),
            ),
            el(
              "tbody",
              {},
              view.rows.map((row) =>
                el(
                  "tr",
                  {},
                  row.values.map((value) =>
                    el("td", { text: value.value === "" ? "—" : value.value }),
                  ),
                  el(
                    "td",
                    {},
                    el("a", {
                      href: `#/projects/${siteId}/articles/${row.entryId}`,
                      text: "Öffnen",
                    }),
                  ),
                ),
              ),
            ),
          ),
        );
      }
      const { notifications } = await api(`/api/sites/${siteId}/notifications`);
      const jobs = notifications.filter((job) => job.formId === form.formId);
      body.push(el("h3", { text: "Benachrichtigungen" }));
      if (jobs.length === 0) {
        body.push(
          el("div", {
            class: "empty",
            text: "Keine Benachrichtigungs-Jobs zu diesem Formular.",
          }),
        );
      } else {
        body.push(
          el(
            "table",
            {},
            el(
              "thead",
              {},
              el(
                "tr",
                {},
                [
                  "Empfänger",
                  "Betreff",
                  "Status",
                  "Versuche",
                  "Nächster Versuch",
                  "Letzter Fehler",
                ].map((label) => el("th", { text: label })),
              ),
            ),
            el(
              "tbody",
              {},
              jobs.map((job) =>
                el(
                  "tr",
                  {},
                  el("td", { text: job.recipient }),
                  el("td", { text: job.subject }),
                  el("td", { text: notificationStatus(job.status) }),
                  el("td", { text: String(job.attempts) }),
                  el("td", {
                    text: job.status === "queued" ? formatDate(job.nextAttemptAt) : "—",
                  }),
                  el("td", { text: job.lastError ?? "—" }),
                ),
              ),
            ),
          ),
          el(
            "div",
            { class: "row-actions" },
            el("button", {
              text: "Fällige Jobs jetzt senden",
              onclick: async () => {
                try {
                  const result = await api("/api/notifications/tick", {
                    method: "POST",
                    body: {},
                  });
                  toast(
                    `Versand: ${result.sent.length} gesendet, ${result.retried.length} erneut geplant, ${result.failed.length} fehlgeschlagen`,
                  );
                  await renderRoute();
                } catch (error) {
                  failed(error);
                }
              },
            }),
          ),
        );
      }
    }
  } else if (tab === "templates") {
    // Vorlagen (O14): Layout- und Entry-Vorlagen samt Layout-Zuordnung. Die
    // Engine-Route ist die eine Quelle; hier wird nur markiert und zugewiesen.
    const { collections } = await api(`/api/sites/${siteId}/collections`);
    const layoutTemplates = pages.filter((page) => page.template?.kind === "layout");
    const entryTemplates = pages.filter((page) => page.template?.kind === "collection");
    const plainPages = pages.filter((page) => page.template === null);
    const collectionName = (id) =>
      collections.find((collection) => collection.id === id)?.name ?? id;
    const setTemplate = async (pageId, body) => {
      try {
        await api(`/api/pages/${pageId}/template`, {
          method: "PUT",
          body: { ...body, author: AUTHOR },
        });
        toast("Vorlage aktualisiert");
        await renderRoute();
      } catch (error) {
        failed(error);
      }
    };

    body.push(el("h2", { text: "Vorlagen" }));
    if (layoutTemplates.length + entryTemplates.length === 0) {
      body.push(
        el("div", {
          class: "empty",
          text: "Noch keine Vorlagen — markiere unten eine Seite als Layout- oder Entry-Vorlage.",
        }),
      );
    } else {
      body.push(
        el(
          "table",
          {},
          el(
            "thead",
            {},
            el(
              "tr",
              {},
              el("th", { text: "Pfad" }),
              el("th", { text: "Titel" }),
              el("th", { text: "Rolle" }),
              el("th", { text: "Details" }),
              el("th", {}),
            ),
          ),
          el(
            "tbody",
            {},
            [...layoutTemplates, ...entryTemplates].map((page) =>
              el(
                "tr",
                {},
                el("td", {}, el("code", { text: page.path })),
                el("td", { text: page.title || "—" }),
                el("td", { text: page.template?.kind === "layout" ? "Layout" : "Entry" }),
                el("td", {
                  text:
                    page.template?.kind === "collection"
                      ? page.template.collectionIds.map(collectionName).join(", ")
                      : page.template?.label || "—",
                }),
                el(
                  "td",
                  {},
                  el(
                    "div",
                    { class: "row-actions" },
                    el("a", {
                      href: `#/projects/${siteId}/pages/${page.id}`,
                      text: "Öffnen",
                    }),
                    el("button", {
                      type: "button",
                      text: "Markierung entfernen",
                      onclick: () => void setTemplate(page.id, { template: null }),
                    }),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    body.push(el("h2", { text: "Seiten & Layouts" }));
    if (plainPages.length === 0) {
      body.push(el("div", { class: "empty", text: "Keine Seiten ohne Vorlage." }));
    } else {
      body.push(
        el(
          "table",
          {},
          el(
            "thead",
            {},
            el(
              "tr",
              {},
              el("th", { text: "Pfad" }),
              el("th", { text: "Titel" }),
              el("th", { text: "Layout" }),
              el("th", { text: "Vorlage" }),
              el("th", {}),
            ),
          ),
          el(
            "tbody",
            {},
            plainPages.map((page) => {
              const layoutSelect = el("select", { "aria-label": "Layout dieser Vorlage" });
              layoutSelect.append(el("option", { value: "", text: "— kein Layout —" }));
              for (const template of layoutTemplates) {
                const option = el("option", {
                  value: template.id,
                  text: template.title || template.path,
                });
                if (page.layoutId === template.id) option.selected = true;
                layoutSelect.append(option);
              }
              layoutSelect.addEventListener("change", () => {
                void setTemplate(page.id, {
                  layoutId: layoutSelect.value === "" ? null : layoutSelect.value,
                });
              });
              const collectionSelect = el("select", { "aria-label": "Sammlung dieser Vorlage" });
              collectionSelect.append(
                el("option", { value: "", text: "Sammlung wählen …" }),
              );
              for (const collection of collections) {
                collectionSelect.append(
                  el("option", { value: collection.id, text: collection.name }),
                );
              }
              return el(
                "tr",
                {},
                el("td", {}, el("code", { text: page.path })),
                el("td", { text: page.title || "—" }),
                el("td", {}, layoutSelect),
                el(
                  "td",
                  {},
                  el(
                    "div",
                    { class: "row-actions" },
                    el("button", {
                      type: "button",
                      text: "Als Layout",
                      // Der Anzeigename ist der Seitentitel (die Engine leitet
                      // ihn beim Lesen ab).
                      onclick: () =>
                        void setTemplate(page.id, {
                          template: { kind: "layout" },
                        }),
                    }),
                    collectionSelect,
                    el("button", {
                      type: "button",
                      text: "Als Entry",
                      onclick: () => {
                        if (collectionSelect.value === "") {
                          toast("Bitte eine Sammlung wählen", "error");
                          return;
                        }
                        void setTemplate(page.id, {
                          template: {
                            kind: "collection",
                            collectionIds: [collectionSelect.value],
                          },
                        });
                      },
                    }),
                  ),
                ),
              );
            }),
          ),
        ),
      );
    }
  }
  render([...frame, ...body]);
}

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

async function articlesView(siteId) {
  const [site, { releases }, { collections }] = await Promise.all([
    api(`/api/sites/${siteId}`),
    api(`/api/sites/${siteId}/releases`),
    api(`/api/sites/${siteId}/collections`),
  ]);
  activeTab("projects");
  const frame = workspaceFrame(siteId, site, "articles", releases.length > 0);
  if (collections.length === 0) {
    render([
      ...frame,
      el("div", {
        class: "empty",
        text: "Noch keine Sammlungen. Agenten legen sie an (create_collection) — oder ein Formular erzeugt sie per Klick.",
      }),
    ]);
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
          const title = prompt("Titel des Artikels");
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
  ]);
}

async function articleEditorView(siteId, entryId) {
  const entry = await api(`/api/entries/${entryId}`);
  const collection = await api(`/api/collections/${entry.collectionId}`);
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
  ]);
}

function reviewPanel(siteId, review) {
  const details = el("div", { class: "review-detail", hidden: "" });
  const toggle = el("button", {
    class: "ghost",
    text: "Details",
    onclick: async () => {
      const opening = details.hasAttribute("hidden");
      if (opening) details.removeAttribute("hidden");
      else details.setAttribute("hidden", "");
      toggle.textContent = opening ? "Details schließen" : "Details";
      if (!opening) return;
      details.replaceChildren(el("p", { class: "muted", text: "Lädt …" }));
      try {
        const data = await api(`/api/reviews/${review.id}`);
        details.replaceChildren(...reviewDetailBlocks(data));
      } catch (error) {
        failed(error);
      }
    },
  });
  return el(
    "div",
    { class: "panel" },
    el(
      "div",
      { class: "inline" },
      el("span", { class: "tag", text: review.status }),
      el("strong", { text: review.title ?? review.pagePath ?? review.id }),
      el("span", { class: "muted", text: formatDate(review.createdAt) }),
    ),
    el(
      "div",
      { class: "inline", style: "margin-top: 0.5rem" },
      toggle,
      el("button", {
        class: "primary",
        text: "Approve",
        onclick: () => reviewAction(siteId, review.id, "approve"),
      }),
      el("button", {
        class: "ghost",
        text: "Änderungen anfragen",
        onclick: () => reviewAction(siteId, review.id, "request-changes"),
      }),
      el("button", {
        class: "danger",
        text: "Verwerfen",
        onclick: () => reviewAction(siteId, review.id, "discard"),
      }),
    ),
    details,
  );
}

function importReportBlock(report) {
  const counts = report?.counts ?? {};
  const assets = report?.assets ?? {};
  const declarations = report?.declarations ?? {};
  const motion = report?.motion ?? { measured: 0, mappedToPreset: 0, documented: 0 };
  const findings = report?.findings ?? [];
  const resolutions = report?.resolutions ?? [];
  const candidates = report?.candidates ?? [];
  const marquee = report?.marqueeCandidates ?? [];
  const findingItems = findings.length > 0
    ? el(
        "ul",
        { class: "framer-report-list" },
        findings.map((finding) =>
          el(
            "li",
            {},
            el("span", { class: "tag", text: finding.severity ?? "info" }),
            ` ${finding.kind}: ${finding.message}`,
            el("p", { class: "muted", text: finding.evidence ?? "" }),
            finding.suggestion ? el("p", { class: "muted", text: finding.suggestion }) : "",
          ),
        ),
      )
    : el("p", { class: "muted", text: "Keine Funde." });
  const resolutionItems = resolutions.length > 0
    ? el(
        "ul",
        { class: "framer-report-list" },
        resolutions.map((resolution) =>
          el(
            "li",
            {},
            el("span", { class: "tag", text: resolution.kind }),
            ` ${resolution.nodeKey}: ${resolution.reason}`,
            el("p", { class: "muted", text: resolution.evidence ?? "" }),
          ),
        ),
      )
    : el("p", { class: "muted", text: "Keine Klasse-C-Fälle." });
  const candidateItems = candidates.length > 0
    ? el(
        "ul",
        { class: "framer-report-list" },
        candidates.map((candidate) =>
          el(
            "li",
            {},
            el("strong", { text: candidate.label }),
            ` · ${candidate.occurrences.length} Vorkommen · ${candidate.kind}`,
            el("p", { class: "muted", text: `Fingerprint: ${candidate.fingerprint}` }),
            el("p", { class: "muted", text: candidate.reason }),
          ),
        ),
      )
    : el("p", { class: "muted", text: "Keine wiederholten Strukturen erkannt." });
  const marqueeItems = marquee.length > 0
    ? el(
        "ul",
        { class: "framer-report-list" },
        marquee.map((candidate) =>
          el("li", {}, `${candidate.preset}: ${candidate.reason}`),
        ),
      )
    : el("p", { class: "muted", text: "Keine Marquee-Kandidaten." });
  return el(
    "div",
    { class: "framer-report" },
    el("h3", { text: "Import-Bericht" }),
    report?.existingPage
      ? el("p", {
          class: "framer-report-warning",
          "data-role": "framer-existing-page",
          text: `Unter diesem Pfad liegt bereits „${report.existingPage.title}". Übernehmen ersetzt ihren gesamten Inhalt, auch spätere Änderungen im Editor.`,
        })
      : "",
    el(
      "p",
      { class: "framer-report-summary" },
      `Score ${report?.score ?? 0}/100 · ${counts.mapped ?? 0}/${counts.nodes ?? 0} Knoten · ${counts.placeholders ?? 0} Platzhalter`,
    ),
    el(
      "p",
      { class: "muted" },
      `Deklarationen: ${declarations.carried ?? 0}/${declarations.total ?? 0} übernommen, ${declarations.dropped ?? 0} verworfen. Assets: ${assets.downloaded ?? 0} geladen, ${assets.deduped ?? 0} dedupliziert, ${assets.failed ?? 0} fehlgeschlagen. Fonts: ${assets.fonts ?? 0}. Motion: ${motion.mappedToPreset}/${motion.measured} Presets, ${motion.documented} dokumentiert.`,
    ),
    refsFold(`Funde (${findings.length})`, findingItems, findings.length > 0),
    refsFold("Klasse-C", resolutionItems, resolutions.length > 0),
    refsFold(`Baustein-Kandidaten (${candidates.length})`, candidateItems, candidates.length > 0),
    refsFold(`Marquee-Kandidaten (${marquee.length})`, marqueeItems, marquee.length > 0),
    refsFold("Schritte", el("ol", {}, (report?.steps ?? []).map((step) => el("li", { text: step })))),
  );
}

// Review-Details (T07): Struktur-Diff in Klartext, dann die Aufnahmen aus
// review.visuals - Vorher/Nachher je Breakpoint, das Diff-Bild mit Quote und
// die Motion-Aufnahme, wenn die Aenderung Bewegung beruehrt hat.
function reviewDetailBlocks(review) {
  const blocks = [];
  const diff = review.structureDiff ?? [];
  if (diff.length > 0) {
    const pages = diff.map((entry) => {
      const head = el(
        "div",
        { class: "review-diff-head" },
        el("code", { text: entry.path }),
        el("span", { class: "review-state", text: reviewStatusLabel(entry.status) }),
      );
      const sections = (entry.sections ?? []).map((section) =>
        el(
          "div",
          { class: "review-diff-row" },
          el("span", { class: "tag", text: section.type }),
          el("span", { text: reviewChangeLabel(section.change) }),
          (section.fields ?? []).length > 0
            ? el("span", {
                class: "muted",
                text: (section.fields ?? []).map(reviewFieldLabel).join(", "),
              })
            : "",
        ),
      );
      return el("div", { class: "review-diff-page" }, head, ...sections);
    });
    blocks.push(el("div", { class: "review-block" }, el("h3", { text: "Struktur-Diff" }), ...pages));
  }
  for (const report of review.importReports ?? []) blocks.push(importReportBlock(report));
  blocks.push(reviewVisualsBlock(review));
  return blocks;
}

const REVIEW_BREAKPOINTS = [
  ["desktop", "Desktop"],
  ["tablet", "Tablet"],
  ["mobile", "Mobil"],
];

function reviewStatusLabel(status) {
  return (
    {
      added: "neu",
      removed: "entfernt",
      changed: "geändert",
      unchanged: "unverändert",
    }[status] ?? status
  );
}

function reviewChangeLabel(change) {
  return { added: "neu", removed: "entfernt", changed: "geändert" }[change] ?? change;
}

function reviewFieldLabel(field) {
  return (
    {
      variant: "Variante",
      props: "Inhalte",
      overrides: "Überschreibungen",
      motion: "Bewegung",
      hidden: "Sichtbarkeit",
    }[field] ?? field
  );
}

function reviewVisualsBlock(review) {
  const visuals = review.visuals;
  const node = el("div", { class: "review-block review-visuals" }, el("h3", { text: "Aufnahmen" }));
  if (!visuals) {
    node.append(
      el("p", { class: "muted", text: "Keine visuellen Aufnahmen zu diesem Stand." }),
    );
    return node;
  }
  if (visuals.note) {
    node.append(el("p", { class: "muted", text: visuals.note }));
  }
  const diffs = visuals.diffs ?? [];
  const byPage = new Map();
  for (const asset of visuals.assets ?? []) {
    if (!byPage.has(asset.pageId)) byPage.set(asset.pageId, []);
    byPage.get(asset.pageId).push(asset);
  }
  const captured = new Date(visuals.capturedAt);
  if (!Number.isNaN(captured.getTime())) {
    node.append(el("p", { class: "muted", text: `Aufgenommen ${formatDate(visuals.capturedAt)}` }));
  }
  for (const [pageId, assets] of byPage) {
    const pagePath = assets[0]?.path ?? pageId;
    const breakpoints = REVIEW_BREAKPOINTS.filter(([key]) =>
      assets.some((asset) => asset.breakpoint === key),
    );
    const stage = el("div", { class: "review-stage" });
    const tabs = el("div", { class: "review-tabs" });
    const show = (breakpoint) => {
      [...tabs.children].forEach((tab) =>
        tab.classList.toggle("active", tab.dataset.breakpoint === breakpoint),
      );
      const figures = [];
      const before = assets.find((asset) => asset.role === "before" && asset.breakpoint === breakpoint);
      const after = assets.find((asset) => asset.role === "after" && asset.breakpoint === breakpoint);
      if (before) figures.push(reviewFigure("Vorher", before.previewPath));
      if (after) figures.push(reviewFigure("Nachher", after.previewPath));
      const diff = diffs.find((entry) => entry.pageId === pageId && entry.breakpoint === breakpoint);
      if (diff) {
        figures.push(reviewFigure(`Diff · ${(diff.ratio * 100).toFixed(2)} %`, diff.previewPath, "diff"));
      }
      stage.replaceChildren(...figures);
    };
    for (const [key, label] of breakpoints) {
      tabs.append(
        el("button", {
          type: "button",
          class: "ghost",
          "data-breakpoint": key,
          text: label,
          onclick: () => show(key),
        }),
      );
    }
    node.append(
      el(
        "div",
        { class: "review-page" },
        el("div", { class: "review-page-head" }, el("code", { text: pagePath }), breakpoints.length > 1 ? tabs : ""),
        stage,
      ),
    );
    show(breakpoints[0]?.[0] ?? "desktop");
  }
  if (visuals.video) {
    node.append(
      el(
        "div",
        { class: "review-video" },
        el("div", {
          class: "muted",
          text: `Motion-Aufnahme · ${(visuals.video.durationMs / 1000).toFixed(1)} s`,
        }),
        el("video", {
          controls: "",
          muted: "",
          playsinline: "",
          preload: "metadata",
          src: visuals.video.previewPath,
        }),
      ),
    );
  }
  return node;
}

function reviewFigure(label, src, kind = "") {
  return el(
    "figure",
    { class: `review-figure ${kind}`.trim() },
    el("figcaption", { text: label }),
    el("img", { src, alt: label, loading: "lazy" }),
  );
}

async function reviewAction(siteId, reviewId, action) {
  const comment = prompt("Kommentar (optional)") ?? "";
  try {
    await api(`/api/reviews/${reviewId}/${action}`, {
      method: "POST",
      body: comment === "" ? {} : { comment },
    });
    toast("Review aktualisiert");
    await renderRoute();
  } catch (error) {
    failed(error);
  }
}

// The new canvas view (rebuild Phase 0, fifth slice). It reads the very page
// draft of the running engine (`GET /api/pages/:pageId`) and lifts it to the v2
// editor document with the existing migration; changes are written back through
// the engine's mutations path (`POST /api/pages/:pageId/editor-mutations`), so
// the canvas owns no storage of its own.
//
// E5 Scheibe 1: der Umbau-Pfad ist der **eine sichtbare Editor**.
//
// P3-1 Punkt 4 (R5): the v1 editor is gone - `mount.ts`, `mountEditor` and the
// page that mounted it are all deleted. There is no mode to compute any more,
// so there is no `canvasModeOf`: the page below mounts the canvas, and the only
// thing left of the old deep link is the hint that says so. Keeping a function
// that returns a constant would be a lie about there being a choice.
//
// `?view=editor` is no longer a second editing path but a **notice**: the
// deep link lands on the canvas and says why. Someone with the old URL
// bookmarked therefore does not end up in a surface nobody maintains, and the
// parameter is cleaned out so a reload does not repeat the notice.
//
// Erkennt den alten Deep-Link, damit der Umstieg **sichtbar** ist: der
// Hinweistext erscheint im Canvas, und der Parameter wird aus dem Hash
// entfernt, damit ein Neuladen nicht erneut umgeleitet wird. Ohne das
// Entfernen bliebe der Hinweis bei jedem Reload stehen und wuerde zum
// Normalzustand.
function legacyEditorDeepLink(search) {
  return /(?:^|&)view=editor(?:&|$)/.test(String(search ?? ""));
}

function openFramerImportDialog({ siteId, pageId, session, onImported }) {
  const dialog = el("dialog", { class: "refs-dialog framer-import-dialog", "data-role": "framer-import-dialog" });
  const sourceSelect = el("select", { class: "refs-input", "data-role": "framer-source-mode" });
  sourceSelect.append(
    el("option", { value: "url", text: "Framer-URL" }),
    el("option", { value: "html", text: "HTML-Datei" }),
    el("option", { value: "mirror", text: "Lokaler Mirror" }),
  );
  const sourceInput = el("input", { class: "refs-input", type: "url", "data-role": "framer-source-input", placeholder: "https://…" });
  const fileInput = el("input", { class: "refs-input", type: "file", accept: ".html,text/html" });
  const pagePathInput = el("input", { class: "refs-input", type: "text", value: "/", placeholder: "/landingpage" });
  const targetSelect = el("select", { class: "refs-input", "data-role": "framer-target" });
  targetSelect.append(
    el("option", { value: "new", text: "Neue Seite" }),
    el("option", { value: "current", text: "Aktuelle Seite ersetzen" }),
  );
  const assetsSelect = el("select", { class: "refs-input" });
  assetsSelect.append(
    el("option", { value: "upload", text: "Hochladen" }),
    el("option", { value: "skip", text: "Überspringen" }),
  );
  const fontsSelect = el("select", { class: "refs-input" });
  fontsSelect.append(
    el("option", { value: "rewrite", text: "Lokal umschreiben" }),
    el("option", { value: "skip", text: "CDN beibehalten" }),
  );
  const modeSelect = el("select", { class: "refs-input", "data-role": "framer-mode" });
  modeSelect.append(
    el("option", { value: "fidelity", text: "Originalgetreu (Verläufe, Schatten, Rundungen bleiben)" }),
    el("option", { value: "dna", text: "Design-DNA (verbotene Stilmittel werden umgeschrieben)" }),
  );
  const themeCheck = el("input", { type: "checkbox" });
  // Importing onto a path that already holds a page replaces its content. The
  // analysis names that page; applying needs this explicit confirmation.
  const replaceCheck = el("input", { type: "checkbox", "data-role": "framer-confirm-replace" });
  const replaceRow = el("label", { class: "inline framer-confirm-replace", hidden: true }, replaceCheck, " Vorhandene Seite ersetzen");
  const syncApply = () => {
    apply.disabled = report === null || (report.existingPage !== undefined && !replaceCheck.checked);
  };
  replaceCheck.addEventListener("change", syncApply);
  const errorEl = el("p", { class: "refs-form-error", role: "alert" });
  const reportHost = el("div", { class: "framer-import-report-host", "data-role": "framer-import-report" });
  let report = null;
  const analyze = el("button", { type: "submit", class: "refs-button primary", text: "Analysieren" });
  const apply = el("button", {
    type: "button",
    class: "refs-button primary",
    text: "Übernehmen",
    "data-action": "framer-import-apply",
  });
  apply.disabled = true;

  const syncSource = () => {
    const value = sourceSelect.value;
    sourceInput.hidden = value !== "url" && value !== "mirror";
    sourceInput.type = value === "mirror" ? "text" : "url";
    sourceInput.placeholder = value === "mirror" ? "C:\\Pfad\\zum\\Mirror" : "https://…";
    fileInput.hidden = value !== "html";
  };
  sourceSelect.addEventListener("change", syncSource);
  syncSource();

  const sourceValue = async () => {
    if (sourceSelect.value === "html") {
      const file = fileInput.files?.[0];
      if (!file) throw new Error("Bitte eine HTML-Datei wählen.");
      return { html: await file.text() };
    }
    const value = sourceInput.value.trim();
    if (value === "") throw new Error("Bitte eine Importquelle angeben.");
    return sourceSelect.value === "url" ? { url: value } : { rootDir: value };
  };
  const bodyFor = async (write) => ({
    source: await sourceValue(),
    ...(pagePathInput.value.trim() === "" ? {} : { pagePath: pagePathInput.value.trim() }),
    ...(targetSelect.value === "current"
      ? { pageId, baseDraftVersion: session.version }
      : {}),
    assets: assetsSelect.value,
    fonts: fontsSelect.value,
    applyTheme: themeCheck.checked,
    mode: modeSelect.value,
    // The write must be the thing that was analysed: same source hash, and the
    // page it replaces still at the version the analysis saw.
    ...(write && report !== null
      ? {
          expectedIrHash: report.irHash,
          ...(targetSelect.value !== "current" && report.existingPage !== undefined
            ? { baseDraftVersion: report.existingPage.draftVersion }
            : {}),
        }
      : {}),
    write,
    idempotencyKey: window.crypto.randomUUID(),
  });
  const submit = async (event) => {
    event.preventDefault();
    analyze.disabled = true;
    errorEl.textContent = "";
    analyze.textContent = "Analysiere …";
    try {
      const result = await api(`/api/sites/${siteId}/imports/framer`, {
        method: "POST",
        body: await bodyFor(false),
      });
      report = result.report;
      reportHost.replaceChildren(importReportBlock(report));
      replaceCheck.checked = false;
      replaceRow.hidden = report.existingPage === undefined;
      syncApply();
    } catch (error) {
      errorEl.textContent = error.message;
    } finally {
      analyze.disabled = false;
      analyze.textContent = "Neu analysieren";
    }
  };
  apply.addEventListener("click", async () => {
    if (report === null) return;
    apply.disabled = true;
    analyze.disabled = true;
    errorEl.textContent = "";
    apply.textContent = "Importiere …";
    try {
      await session.flush();
      const result = await api(`/api/sites/${siteId}/imports/framer`, {
        method: "POST",
        body: await bodyFor(true),
      });
      dialog.close();
      onImported(result.report);
    } catch (error) {
      errorEl.textContent = error.message;
      apply.disabled = false;
    } finally {
      analyze.disabled = false;
      apply.textContent = "Übernehmen";
    }
  });
  const form = el(
    "form",
    { class: "framer-import-form", onsubmit: submit },
    el("h2", { text: "Framer-Seite importieren" }),
    el("label", {}, "Quelle", sourceSelect),
    sourceInput,
    fileInput,
    el("label", {}, "Ziel", targetSelect),
    el("label", {}, "Seitenpfad", pagePathInput),
    el("div", { class: "inline" }, el("label", {}, "Assets", assetsSelect), el("label", {}, "Fonts", fontsSelect)),
    el("label", {}, "Modus", modeSelect),
    el("label", { class: "inline" }, themeCheck, " Theme-Fonts übernehmen"),
    replaceRow,
    el("div", { class: "framer-import-actions" }, analyze, apply),
    errorEl,
  );
  dialog.append(form, reportHost);
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  sourceInput.focus();
}

// How a media need is presented. The wording stays short so a card with six
// needs stays readable.
function mediaLabel(treatment) {
  if (treatment === "reuse") return "wiederverwenden";
  if (treatment === "select") return "auswählen";
  if (treatment === "upload") return "hochladen";
  if (treatment === "generate") return "erzeugen";
  if (treatment === "avoid") return "vermeiden";
  return "manuell";
}

// The human direction step of a redesign (ADR-0012). The agent proposed the
// cards; this is where a person actually chooses one. Nothing is preselected:
// a click on a card only selects, the confirm button creates the draft.
function openRedesignDirectionDialog(proposal) {
  const cards = Array.isArray(proposal.cards) ? proposal.cards : [];
  const errorEl = el("p", { class: "redesign-dialog__error", "data-role": "redesign-error", role: "alert" });
  const confirmButton = el("button", {
    type: "button",
    class: "redesign-dialog__button primary",
    "data-action": "redesign-confirm",
    text: "Richtung als Draft übernehmen",
  });
  confirmButton.disabled = true;

  const grid = el("fieldset", { class: "redesign-direction-grid" });
  grid.append(el("legend", { class: "redesign-direction-legend", text: "Welche Richtung?" }));

  let chosen = null;
  const select = (directionId) => {
    chosen = directionId;
    for (const input of grid.querySelectorAll('input[type="radio"]')) {
      input.checked = input.value === directionId;
    }
    confirmButton.disabled = false;
    errorEl.textContent = "";
  };

  for (const card of cards) {
    const specimen = card.theme?.specimen ?? {};
    const image = el("img", {
      class: "redesign-direction-shot",
      src: `/api/redesign-proposals/${encodeURIComponent(proposal.id)}/cards/${encodeURIComponent(card.id)}/screenshot`,
      alt: card.screenshot?.alt ?? `Vorschau ${card.reference?.name ?? ""}`,
      loading: "lazy",
    });
    const swatches = el("div", { class: "redesign-specimen-swatches" });
    for (const [name, value] of [
      ["Marke", specimen.brand],
      ["Neutral", specimen.neutralBase],
    ]) {
      if (typeof value !== "string" || value === "") continue;
      swatches.append(
        el("span", { class: "redesign-specimen-swatch", "data-role": name.toLowerCase() }, [
          el("i", { style: `background:${value}` }),
          el("span", { text: `${name}: ${value}` }),
        ]),
      );
    }
    const rules = el("div", { class: "redesign-direction-rules" });
    for (const [label, values] of [
      ["Grundsätze", card.rules?.constants],
      ["Nicht übernehmen", card.rules?.never],
    ]) {
      const list = Array.isArray(values) ? values.filter((entry) => String(entry).trim() !== "") : [];
      if (list.length === 0) continue;
      rules.append(
        el("p", { class: "redesign-direction-rules-line" }, [
          el("strong", { text: `${label}: ` }),
          el("span", { text: list.slice(0, 4).join(" · ") }),
        ]),
      );
    }
    const warnings = el("div", { class: "redesign-direction-warnings", "data-role": "redesign-warnings" });
    for (const warning of Array.isArray(card.warnings) ? card.warnings : []) {
      warnings.append(el("p", { text: String(warning) }));
    }
    const fonts = el("p", {
      class: "redesign-direction-fonts",
      text: `${specimen.displayFont ?? ""} / ${specimen.bodyFont ?? ""}`,
    });
    // ADR-0013: what this direction does to the page's own sections and which
    // media it needs. The build scope is the agent's binding work order.
    const plan = card.sectionPlan ?? null;
    const summary = plan?.summary ?? {};
    const scope = el("div", { class: "redesign-build-scope", "data-role": "redesign-build-scope" });
    if (plan === null) {
      scope.append(
        el("p", { class: "redesign-direction-warnings", text: "Für diese Richtung liegt kein Sektions-Plan vor." }),
      );
    } else {
      scope.append(
        el("p", { class: "redesign-scope-summary" }, [
          el("strong", { text: "Bauumfang: " }),
          el("span", {
            "data-role": "redesign-scope-counts",
            text: `${summary.exact ?? 0} exakt · ${summary.fallback ?? 0} Vorgabe · ${summary.manual ?? 0} manuell`,
          }),
        ]),
      );
      const entryList = el("ul", { class: "redesign-scope-list" });
      for (const entry of (plan.entries ?? []).slice(0, 8)) {
        const target = entry.target?.type ?? entry.source?.type ?? "—";
        const variant = entry.target?.variant ? ` / ${entry.target.variant}` : "";
        entryList.append(
          el("li", {
            class: "redesign-scope-entry",
            "data-role": "redesign-section-entry",
            "data-status": entry.status ?? "manual",
          }, [
            el("span", { text: `${target}${variant}` }),
            el("span", { class: "redesign-scope-status", text: entry.status ?? "manual" }),
          ]),
        );
      }
      if ((plan.entries ?? []).length > 8) {
        entryList.append(
          el("li", { class: "redesign-scope-more", text: `+ ${plan.entries.length - 8} weitere` }),
        );
      }
      if (entryList.childElementCount > 0) scope.append(entryList);

      const mediaList = el("ul", { class: "redesign-media-list" });
      for (const need of (plan.media ?? []).slice(0, 6)) {
        mediaList.append(
          el("li", {
            class: "redesign-media-need",
            "data-role": "redesign-media-need",
            "data-treatment": need.treatment ?? "manual",
          }, [
            el("span", { class: "redesign-media-treatment", text: mediaLabel(need.treatment) }),
            el("span", { class: "redesign-media-reason", text: need.reason ?? "" }),
          ]),
        );
      }
      if (mediaList.childElementCount > 0) {
        scope.append(
          el("p", { class: "redesign-scope-subtitle", text: "Medienbedarf" }),
          mediaList,
        );
      }
    }
    const radio = el("input", {
      type: "radio",
      name: "redesign-direction",
      value: card.id,
    });
    radio.addEventListener("change", () => select(card.id));
    grid.append(
      el(
        "label",
        { class: "redesign-direction-card", "data-direction-card": card.id },
        [image, el("h3", { text: card.reference?.name ?? "Richtung" }), radio, swatches, fonts, rules, scope, warnings],
      ),
    );
  }

  const staleNote = proposal.freshness?.current === false
    ? el("p", { class: "redesign-dialog__stale", "data-role": "redesign-stale" }, [
        el("strong", { text: "Plan veraltet. " }),
        el("span", { text: (proposal.freshness.reasons ?? []).join(" ") }),
      ])
    : null;

  const dialog = el(
    "dialog",
    {
      class: "redesign-dialog",
      "data-role": "redesign-dialog",
      "aria-labelledby": "redesign-direction-title",
    },
    el("div", { class: "redesign-dialog__head" }, [
      el("p", { class: "redesign-dialog__eyebrow", text: "Agentenvorschlag" }),
      el("h2", { id: "redesign-direction-title", text: `Richtung für „${proposal.source?.title ?? "diese Seite"}“ wählen` }),
      el("p", {
        class: "redesign-dialog__hint",
        "data-role": "redesign-readonly-note",
        text: "Originalseite und veröffentlichtes Release bleiben unverändert. Es entsteht eine neue Draft-Seite.",
      }),
      el("p", {
        class: "redesign-dialog__hint",
        "data-role": "redesign-apply-scope",
        text: "Bestätigt werden Theme und Draft-Grundstruktur. Der Sektions-Plan ist die verbindliche Arbeitsgrundlage für den Agenten.",
      }),
    ]),
    staleNote,
    grid,
    el("div", { class: "redesign-dialog__actions" }, [
      errorEl,
      el("button", {
        type: "button",
        class: "redesign-dialog__button",
        "data-action": "redesign-cancel",
        text: "Abbrechen",
        onclick: () => dialog.close(),
      }),
      confirmButton,
    ]),
  );
  if (staleNote !== null) confirmButton.disabled = true;

  confirmButton.addEventListener("click", async () => {
    if (chosen === null) return;
    confirmButton.disabled = true;
    for (const input of grid.querySelectorAll('input[type="radio"]')) input.disabled = true;
    errorEl.textContent = "";
    confirmButton.textContent = "Wird angewendet …";
    try {
      const result = await api(`/api/redesign-proposals/${encodeURIComponent(proposal.id)}/confirm`, {
        method: "POST",
        body: { directionId: chosen, idempotencyKey: window.crypto.randomUUID() },
      });
      const applied = result.proposal?.applyResult;
      if (result.proposal?.status === "failed") {
        throw new Error(applied?.error?.message ?? "Die Richtung konnte nicht angewendet werden.");
      }
      const siteId = applied?.siteId;
      const pageId = applied?.pageId;
      // P2-2: ein Apply, der Medienbedarfe offen laesst, ist nicht fertig. Der
      // Dialog bleibt offen und zeigt die Bedarfe - der Mensch schliesst sie hier
      // ab, statt sie in einem Toast zu verlieren. Erst ohne offene Bedarfe geht
      // es weiter zur Draft-Seite.
      const openNeeds = Array.isArray(applied?.openMediaNeeds) ? applied.openMediaNeeds : [];
      if (openNeeds.length > 0) {
        dialog.close();
        openMediaNeedPanel({
          proposalId: proposal.id,
          siteId,
          pageId,
          needs: openNeeds,
          onDone: (remaining) => {
            if (remaining === 0) {
              location.hash = `#/projects/${siteId}/pages/${pageId}`;
            } else {
              toast(
                `${remaining} Medienbedarf${remaining === 1 ? "" : "e"} bleiben offen.`,
                "info",
              );
            }
          },
        });
        return;
      }
      dialog.close();
      if (typeof siteId === "string" && typeof pageId === "string") {
        location.hash = `#/projects/${siteId}/pages/${pageId}`;
      } else {
        toast("Richtung bestätigt.", "info");
      }
    } catch (error) {
      // A stale plan keeps the dialog open: the operator has to plan again.
      errorEl.textContent = error?.message ?? "Die Richtung konnte nicht angewendet werden.";
      confirmButton.textContent = "Richtung als Draft übernehmen";
      for (const input of grid.querySelectorAll('input[type="radio"]')) input.disabled = false;
      if (error?.status === 409) confirmButton.disabled = true;
    }
  });

  document.body.append(dialog);
  dialog.addEventListener("close", () => {
    dialog.remove();
    document.querySelector('[data-action="redesign-inbox-open"]')?.focus();
  });
  refsBindBackdropClose(dialog);
  dialog.showModal();
}

// P2-2: die Bedienung der offenen Medienbedarfe. Das Apply hat die Seite gebaut,
// aber ein Bild fehlt noch - und genau hier wird das entschieden, nicht in einem
// Toast, den niemand liest.
//
// Je Bedarf stehen vier Wege offen, und jeder beantwortet dieselbe Frage anders:
//   - `select`   ein vorhandenes Asset der Zielsite waehlen (die Bibliothek des
//                Releases, nicht die der Quelle)
//   - `upload`   eine Datei aus dem Rechner hochladen
//   - `generate` den mitgelieferten Prompt an die Provider-Kette geben
//   - `manual`   bewusst offen lassen: der Slot bleibt leer, der Bedarf gilt als
//                entschieden, und das wird auch so protokolliert
//
// Die Schluesselung laeuft in EINEM Aufruf: eine Bedarf-Id, die der Server nicht
// kennt, ist ein Fehler und kein stiller Fortschritt. `onDone` bekommt die Zahl
// derer, die wirklich noch offen sind - nicht die Zahl vor dem Schliessen, sonst
// wuerde der Dialog eine Erledigung melden, die nicht stattgefunden hat.
async function openMediaNeedPanel({ proposalId, siteId, pageId, needs, onDone }) {
  const list = el("div", { class: "media-needs", "data-role": "media-needs" });
  const errorEl = el("p", { class: "media-needs__error", "data-role": "media-needs-error" });
  const doneButton = el("button", {
    type: "button",
    class: "btn",
    "data-action": "media-needs-done",
    text: "Fertig",
  });

  // Nur die Zielsite, und nur wenn es eine gibt: ein Bedarf ohne Site hat keine
  // Bibliothek, aus der man waehlen koennte.
  //
  // Die Antwort ist `{ assets: [...] }`, NICHT das Array selbst - und der
  // Unterschied ist der Grund fuer den `Array.isArray`: die Liste kommt aus
  // einer Route, deren Form sich aendern darf, ohne dass dieser Dialog
  // stillschweigt und ein leeres Panel zeigt. Lieber kein Auswahlfeld als ein
  // geratenes.
  let assets = [];
  if (typeof siteId === "string") {
    const antwort = await api(`/api/sites/${siteId}/assets?limit=200`).catch(() => null);
    const liste = antwort?.assets;
    assets = Array.isArray(liste) ? liste : [];
  }

  const dialog = el(
    "dialog",
    { class: "redesign-dialog media-needs-dialog", "data-role": "media-needs-dialog" },
    el("div", { class: "redesign-dialog__head" }, [
      el("p", { class: "redesign-dialog__eyebrow", text: "Medienbedarf" }),
      el("h2", { text: `${needs.length} Bild${needs.length === 1 ? "" : "e"} fehlt noch` }),
      el("p", {
        class: "redesign-dialog__hint",
        text: "Die Seite ist gebaut, aber diese Slots sind leer. Waehlen, laden, erzeugen - oder bewusst offen lassen.",
      }),
    ]),
    list,
    errorEl,
    el("div", { class: "redesign-dialog__foot" }, [doneButton]),
  );

  const answers = new Map();
  const pending = new Set(needs.map((need) => need.needId));

  async function submit() {
    if (answers.size === 0) {
      onDone(pending.size);
      dialog.close();
      return;
    }
    doneButton.disabled = true;
    errorEl.textContent = "";
    try {
      const result = await api(`/api/redesign-proposals/${encodeURIComponent(proposalId)}/media-needs`, {
        method: "POST",
        body: {
          resolutions: [...answers.entries()].map(([needId, resolution]) => ({ needId, ...resolution })),
          idempotencyKey: window.crypto.randomUUID(),
        },
      });
      for (const need of result.stillOpen ?? []) pending.add(need.needId);
      for (const need of result.closed ?? []) pending.delete(need.needId);
      onDone(pending.size);
      dialog.close();
    } catch (error) {
      errorEl.textContent = error?.message ?? "Die Medienbedarfe konnten nicht geschlossen werden.";
      doneButton.disabled = false;
    }
  }

  for (const need of needs) {
    const select = el("select", { "data-role": "media-need-select", "data-need": need.needId });
    select.append(el("option", { value: "", text: "— Asset wählen —" }));
    for (const asset of assets) {
      select.append(el("option", { value: asset.id, text: asset.filename }));
    }

    const fileInput = el("input", {
      type: "file",
      accept: "image/*",
      "data-role": "media-need-file",
      "data-need": need.needId,
    });
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file || typeof siteId !== "string") return;
      // Hochgeladen wird in die ZIELsite, nicht in die Quelle - die Quellseite
      // bleibt unangetastet, und das Asset landet dort, wo der Slot liegt.
      const body = new FormData();
      body.append("file", file);
      errorEl.textContent = "Wird hochgeladen …";
      try {
        const uploaded = await api(`/api/sites/${siteId}/assets`, { method: "POST", body });
        answers.set(need.needId, { treatment: "upload", assetId: uploaded.id });
        errorEl.textContent = "";
        row.dataset.state = "uploaded";
      } catch (error) {
        errorEl.textContent = error?.message ?? "Der Upload ist fehlgeschlagen.";
      }
    });

    const manualButton = el("button", {
      type: "button",
      class: "btn btn--ghost",
      "data-action": "media-need-manual",
      text: "Bewusst offen lassen",
    });
    manualButton.addEventListener("click", () => {
      answers.set(need.needId, { treatment: "manual" });
      row.dataset.state = "manual";
    });

    const generateButton = el("button", {
      type: "button",
      class: "btn",
      "data-action": "media-need-generate",
      text: "Bild erzeugen",
    });
    generateButton.addEventListener("click", async () => {
      if (typeof siteId !== "string") return;
      generateButton.disabled = true;
      errorEl.textContent = "Wird erzeugt …";
      try {
        // Der Prompt kommt aus dem Bedarf selbst. Die Engine nimmt ihn, wie er
        // ist - eine "Verbesserung" hier wuerde das Vorbild kopieren, und genau
        // das soll der Bedarf verhindern.
        //
        // Bildgenerierung ist ein JOB, kein synchroner Aufruf: die Route
        // antwortet 202 mit einer Job-Id, und der Lauf macht die Arbeit
        // asynchron. Deshalb wird hier gepollt statt geraten - ein Dialog, der
        // eine Job-Id fuer ein fertiges Bild haelt, wuerde einen leeren Slot
        // als geschlossen melden.
        const queued = await api(`/api/sites/${siteId}/images/jobs`, {
          method: "POST",
          body: {
            prompt: need.prompt ?? `${need.targetPath} für ${pageId ?? "die Seite"}`,
            ...(need.decorative ? { decorative: true } : {}),
            ...(need.alt === null ? {} : { altText: need.alt }),
          },
        });
        const assetId = await waitForImageJob(siteId, queued.jobId, (text) => {
          errorEl.textContent = text;
        });
        answers.set(need.needId, { treatment: "generate", assetId });
        errorEl.textContent = "";
        row.dataset.state = "generated";
        generateButton.disabled = false;
      } catch (error) {
        errorEl.textContent = error?.message ?? "Die Bildgenerierung ist fehlgeschlagen.";
        generateButton.disabled = false;
      }
    });

    select.addEventListener("change", () => {
      if (select.value === "") answers.delete(need.needId);
      else answers.set(need.needId, { treatment: "select", assetId: select.value });
      row.dataset.state = "selected";
    });

    const row = el(
      "div",
      {
        class: "media-need",
        "data-role": "media-need",
        "data-need": need.needId,
        "data-treatment": need.treatment,
      },
      [
        el("p", { class: "media-need__title" }, [
          el("code", { text: need.targetPath }),
          el("span", { class: "media-need__reason", text: need.reason ?? "" }),
        ]),
        // A `generate` need carries the prompt. Showing it is the whole point:
        // the human decides whether the prompt is acceptable BEFORE paying for
        // the image.
        need.prompt === null
          ? null
          : el("p", { class: "media-need__prompt", "data-role": "media-need-prompt" }, [
              el("span", { class: "media-need__label", text: "Prompt" }),
              el("span", { text: need.prompt }),
            ]),
        el("div", { class: "media-need__actions" }, [select, fileInput, generateButton, manualButton]),
      ],
    );
    list.append(row);
  }

  doneButton.addEventListener("click", () => void submit());
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  refsBindBackdropClose(dialog);
  dialog.showModal();
}

// Wartet auf einen Bild-Job und liefert die Asset-Id (P2-2).
//
// Ein Job ist asynchron: die Route antwortet 202, der Lauf arbeitet weiter. Der
// Dialog darf also nicht auf eine fertige Bilddatei warten, sondern auf einen
// ENTSCHIEDENEN Zustand. Beendet wird gewartet bei `succeeded` (mit Asset), bei
// `failed`/`canceled` (mit der Fehlermeldung des Laufs) und nach einer Frist.
//
// Die Statusnamen kommen aus dem Engine-Typ (`IMAGE_JOB_STATUSES`): `succeeded`
// und `canceled`, nicht `done` und `cancelled`. Hier standen zuerst die
// falschen - der Dialog wartete dann endlos auf einen Zustand, den es nicht
// gibt, während der Job längst fertig war.
//
// Die Frist ist kein Optimismus: ein hängender Job darf einen Menschen nicht
// ewig am Dialog festhalten. Nach Ablauf wird ein Fehler gemeldet und der Slot
// bleibt offen - der Bedarf ist dann noch da und wird beim nächsten Versuch
// neu erzeugt, statt still als geschlossen zu gelten.
const BILDJOB_FRIST_MS = 120000;
const BILDJOB_ABSTAND_MS = 1200;

async function waitForImageJob(siteId, jobId, onStatus) {
  const ende = Date.now() + BILDJOB_FRIST_MS;
  let letzterText = "";
  while (Date.now() < ende) {
    const job = await api(`/api/images/jobs/${encodeURIComponent(jobId)}`);
    if (job.status === "succeeded" && typeof job.assetId === "string") return job.assetId;
    if (job.status === "failed" || job.status === "canceled") {
      const gruende = Array.isArray(job.error) ? job.error : [];
      const letzterFehler = gruende[gruende.length - 1]?.message;
      throw new Error(letzterFehler ?? `Der Bild-Job endete mit „${job.status}“.`);
    }
    // Der Text wechselt nur, wenn sich etwas geaendert hat: ein Dialog, der
    // im Sekundentakt dieselbe Zeile neu schreibt, ist unruhig und macht die
    // tatsaechliche Wartezeit schwerer lesbar als noetig.
    const text = `Wird erzeugt … (Versuch ${job.attempts ?? 1}/${job.maxAttempts ?? 1})`;
    if (text !== letzterText) {
      letzterText = text;
      onStatus(text);
    }
    await new Promise((resolve) => setTimeout(resolve, BILDJOB_ABSTAND_MS));
  }
  throw new Error(
    `Der Bild-Job hat nach ${Math.round(BILDJOB_FRIST_MS / 1000)} s kein Ergebnis geliefert.`,
  );
}

async function mountCanvasView({ pageId, siteId, page, host, toolbar, editor, pagesCache, mediaCache, libraryComponents, assetContext, siteProfile, siteTheme, siteThemeVersion, styleRules, styleRegistryVersion }) {
  const loaded = editor.loadDocument(page.draft);
  loaded.document.styleRules = styleRules ?? [];

  // Drei Spalten: Ebenen-Explorer, Arbeitsflaeche (Canvas) und Inspektor
  // (Tickets 02/03). Alle drei lesen denselben Store — die Auswahl im Canvas
  // ist die Auswahl in beiden Panels, eine Aenderung erscheint ueberall.
  const explorerHost = el("aside", { class: "canvas-view__explorer" });
  const canvasHost = el("div", { class: "canvas-view__stage" });
  const inspectorHost = el("aside", { class: "canvas-view__inspector" });
  host.classList.add("canvas-view");
  host.replaceChildren(explorerHost, canvasHost, inspectorHost);

  const statusEl = el("span", { class: "muted", "data-role": "canvas-status" });
  const statusGroup = el(
    "div",
    { class: "toolbar__status", "aria-live": "polite", "aria-atomic": "true" },
    statusEl,
  );
  // Re-Bake-Status (E12): Inhaltsaenderungen laufen als durabler Job; der
  // Badge zeigt den letzten Stand, ohne dass jemand die Job-Route oeffnen muss.
  const bakeBadge = el("span", {
    class: "muted",
    "data-role": "bake-status",
  });
  bakeBadge.hidden = true;
  statusGroup.append(bakeBadge);
  const showBake = (text, isError) => {
    bakeBadge.textContent = text;
    bakeBadge.hidden = false;
    if (isError === true) bakeBadge.dataset.state = "error";
    else delete bakeBadge.dataset.state;
  };
  const refreshBakeJobs = async () => {
    try {
      const result = await api(`/api/sites/${siteId}/bake-jobs`);
      const job = (result.jobs ?? [])[0];
      if (!job) return;
      if (job.status === "queued" || job.status === "running") {
        showBake("Inhalt wird neu gebaut …");
      } else if (job.status === "failed") {
        showBake(`Re-Bake fehlgeschlagen: ${job.lastError ?? "unbekannt"}`, true);
      } else if (job.status === "done") {
        showBake("Inhalt neu gebaut");
      }
    } catch {
      // Der Status ist ein Hinweis, nie ein Blocker.
    }
  };
  void refreshBakeJobs();
  const publishButton = el("button", {
    type: "button",
    class: "primary",
    "data-action": "canvas-publish",
    text: "Veröffentlichen",
  });
  const saveButton = el("button", {
    type: "button",
    class: "ghost",
    "data-action": "canvas-save",
    text: "Speichern",
  });
  saveButton.disabled = true;
  // Conflict hint (decided 18.09.): reload the draft or resend the own change.
  const reloadButton = el("button", {
    type: "button",
    "data-action": "canvas-reload",
    text: "Neu laden",
  });
  const retryButton = el("button", {
    type: "button",
    "data-action": "canvas-retry",
    text: "Erneut versuchen",
  });
  reloadButton.hidden = true;
  retryButton.hidden = true;

  const setVersion = (version) => {
    const badge = document.getElementById("page-version");
    if (badge) badge.textContent = `Draft v${version}`;
  };

  // The save pipeline owns batching, version tracking and conflict handling;
  // the transport is the same `api` helper the rest of the shell uses, so a
  // `409` keeps its status.
  const transport = async (request) => {
    try {
      const body = await api(request.path, {
        method: request.method,
        ...(request.body === undefined ? {} : { body: request.body }),
      });
      return { status: 200, body };
    } catch (error) {
      return {
        status: typeof error?.status === "number" ? error.status : 500,
        body: { error: { message: error?.message ?? String(error) } },
      };
    }
  };

  // Ein Session-Kern (E5 Scheibe 1): Dokument + Auswahl + History + Server-
  // version + Pending in einem Objekt. Canvas und Inspektor sind Projektionen
  // derselben Session; der Ansichtszustand (Geraet, Tab, Zoom, Auswahl)
  // ueberlebt das Neuladen ueber den lokalen Speicher.
  const storage = {
    get: (key) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // Ein privates Fenster verweigert den Schreibzugriff; der Editor laeuft weiter.
      }
    },
  };
  const session = editor.createEditorSession({
    document: loaded.document,
    pageId,
    siteId,
    author: AUTHOR,
    request: transport,
    initialVersion: page.draftVersion,
    styleRegistryVersion,
    storage,
  });
  const savedUi = session.ui();

  const applyState = (state) => {
    saveButton.disabled = state.pending === 0;
    saveButton.textContent = state.pending > 0 ? `Speichern (${state.pending})` : "Speichern";
    const conflict = state.status === "conflict";
    reloadButton.hidden = !conflict;
    retryButton.hidden = !conflict;
    if (state.status === "saving") statusEl.textContent = "Speichert …";
    else if (state.status === "saved") statusEl.textContent = "Gespeichert";
    else if (conflict) statusEl.textContent = state.message ?? "Entwurf wurde geändert";
    else if (state.status === "error") statusEl.textContent = state.message ?? "Speichern fehlgeschlagen";
    else statusEl.textContent = state.pending > 0 ? `${state.pending} offen` : "";
    if (state.unsupported.length > 0) {
      statusEl.textContent = `${statusEl.textContent} · nicht speicherbar: ${state.unsupported.join(", ")}`.trim();
    }
    syncConflictDialog(editor.conflictDialogModel(state));
  };

  // Konflikt-Dialog (L17): Server-Stand vs. eigene Aenderungen mit beiden Wegen
  // und ihren Folgen. Er oeffnet einmal je Konfliktlage; "Spaeter" schliesst
  // ihn, die Toolbar-Knoepfe bleiben der direkte Weg.
  const conflictDialog = el("dialog", {
    class: "conflict-dialog",
    "data-role": "conflict-dialog",
  });
  host.append(conflictDialog);
  let conflictKey = null;
  const closeConflictDialog = () => {
    conflictKey = null;
    if (conflictDialog.open) conflictDialog.close();
  };
  const reloadDraft = async () => {
    try {
      const fresh = await api(`/api/pages/${pageId}`);
      session.replaceDocument(editor.loadDocument(fresh.draft).document, fresh.draftVersion);
      // Der Server-Stand ersetzt das Dokument; die offenen eigenen Aenderungen
      // sind damit verworfen (so steht es im Dialog).
      session.discardPending();
      setVersion(fresh.draftVersion);
      statusEl.textContent = "Neu geladen";
    } catch (error) {
      failed(error);
    }
  };
  const retrySave = async () => {
    try {
      const fresh = await api(`/api/pages/${pageId}`);
      await session.retry(fresh.draftVersion);
    } catch (error) {
      failed(error);
    }
  };
  const syncConflictDialog = (model) => {
    if (model === null) {
      closeConflictDialog();
      return;
    }
    const key = `${model.expectedVersion}:${model.serverVersion ?? "?"}:${model.pending}`;
    if (conflictDialog.open || key === conflictKey) return;
    conflictKey = key;
    const reload = el("button", {
      type: "button",
      class: "danger",
      "data-action": "conflict-reload",
      text: model.reloadLabel,
    });
    reload.addEventListener("click", () => {
      closeConflictDialog();
      void reloadDraft();
    });
    const retry = el("button", {
      type: "button",
      class: "primary",
      "data-action": "conflict-retry",
      text: model.retryLabel,
    });
    retry.addEventListener("click", () => {
      closeConflictDialog();
      void retrySave();
    });
    const later = el("button", {
      type: "button",
      "data-action": "conflict-later",
      text: model.dismissLabel,
    });
    later.addEventListener("click", () => closeConflictDialog());
    conflictDialog.replaceChildren(
      el("h2", { text: model.title }),
      el("p", { text: model.hint }),
      el("div", { class: "conflict-dialog__actions" }, reload, retry, later),
    );
    conflictDialog.showModal();
  };
  session.subscribe(() => {
    const state = session.saveState();
    setVersion(state.version);
    applyState(state);
  });
  applyState(session.saveState());

  const canvas = editor.mountCanvas(canvasHost, {
    store: session.store,
    registry: editor.createRegistry(),
    renderer: editor.createReactRenderer({
      context: () => ({
        pagePaths: Object.fromEntries(pagesCache.map((entry) => [entry.id, entry.path])),
        assets: assetContext,
      }),
    }),
    theme: siteTheme ?? editor.defaultTheme(),
    frameStyles: [
      `/api/sites/${encodeURIComponent(siteId)}/theme.css?v=${encodeURIComponent(siteThemeVersion ?? 0)}`,
      "/editor-frame.css",
    ],
    zoom: savedUi.zoom,
    // Design/Live (Ticket 03 Punkt 6): live zeigt die echte Seite (M4 Stufe 1).
    mode: savedUi.mode,
    breakpoint: savedUi.device,
    profile: siteProfile ?? "standard",
    onState: (state) => {
      session.patchUi({
        zoom: state.zoom,
        selectedId: state.selected,
        mode: state.mode,
        device: state.breakpoint,
      });
    },
    onMessage: (message) => {
      statusEl.textContent = message ?? "";
    },
  });
  // Start im Einpassen-Zoom: alle drei Frames sind sofort sichtbar (Framer/Webflow).
  // Ein bewusst gesetzter Zoom bleibt nach dem Neuladen erhalten; nur der
  // Standardzoom (100 %) wird eingepasst. Der Fit läuft erst, wenn jeder Frame
  // gerendert ist: ein Fit vor dem Laden der Iframes verlor in den
  // Browser-Tests die Klick-Selektion (Ursache offen).
  if (canvas.mode() === "design" && savedUi.zoom === 1) {
    const fitWhenRendered = (attempt) => {
      const frames = [...canvasHost.querySelectorAll(".senify-canvas__iframe")];
      const rendered =
        frames.length > 0 &&
        frames.every((frame) => frame.contentDocument?.querySelector("[data-node-id]") != null);
      if (rendered) {
        canvas.fit();
        canvasHost.dataset.startFit = "done";
      } else if (attempt < 100) {
        setTimeout(() => fitWhenRendered(attempt + 1), 50);
      } else {
        canvasHost.dataset.startFit = "skipped";
      }
    };
    fitWhenRendered(0);
  } else {
    canvasHost.dataset.startFit = "skipped";
  }
  const framerImportButton = el("button", {
    type: "button",
    class: "ghost",
    text: "Seite importieren",
    "data-action": "framer-import-open",
  });
  // Redesign-Inbox (ADR-0012): a non-modal hint that only appears while a
  // proposal waits for a human. It never opens by itself — an agent run must
  // not steal the editor's focus.
  const redesignInbox = el("button", {
    type: "button",
    class: "ghost",
    "data-action": "redesign-inbox-open",
    "data-role": "redesign-inbox",
    hidden: true,
    text: "Richtungen",
  });
  let redesignProposals = [];
  let redesignPoll = null;
  // `window.` keeps the timers on the browser globals eslint already knows.
  const stopRedesignPolling = () => {
    if (redesignPoll !== null) window.clearInterval(redesignPoll);
    redesignPoll = null;
  };
  const renderRedesignInbox = () => {
    const open = redesignProposals.filter((entry) => entry.status === "proposed");
    redesignInbox.hidden = open.length === 0;
    if (open.length === 0) {
      delete redesignInbox.dataset.count;
      return;
    }
    redesignInbox.dataset.count = String(open.length);
    redesignInbox.textContent = `${open.length} ${open.length === 1 ? "Richtung" : "Richtungen"}`;
  };
  const loadRedesignProposals = async () => {
    try {
      const listed = await api(`/api/pages/${pageId}/redesign-proposals`);
      redesignProposals = Array.isArray(listed.proposals) ? listed.proposals : [];
      renderRedesignInbox();
    } catch {
      // A missing inbox is never a blocker for editing.
      redesignProposals = [];
      renderRedesignInbox();
    }
  };
  redesignInbox.addEventListener("click", () => {
    const open = redesignProposals.filter((entry) => entry.status === "proposed");
    const proposal = open[0];
    if (proposal === undefined) return;
    openRedesignDirectionDialog(proposal);
  });
  void loadRedesignProposals();
  redesignPoll = window.setInterval(() => {
    void loadRedesignProposals();
  }, 12000);
  framerImportButton.addEventListener("click", () => {
    openFramerImportDialog({
      siteId,
      pageId,
      session,
      onImported: async (report) => {
        if (report.pageId === pageId) {
          const fresh = await api(`/api/pages/${pageId}`);
          session.replaceDocument(editor.loadDocument(fresh.draft).document, fresh.draftVersion);
          session.discardPending();
          setVersion(fresh.draftVersion);
          statusEl.textContent = "Framer-Import übernommen";
        } else if (report.pageId !== null) {
          location.hash = `#/projects/${siteId}/pages/${report.pageId}`;
        }
        toast("Framer-Import übernommen");
      },
    });
  });

  // Die Session ist die eine Quelle (E5): wechselt der Inspektor das Geraet,
  // folgt die Arbeitsflaeche; der Canvas meldet seine Wechsel ueber `onState`.
  session.subscribe(() => {
    const ui = session.ui();
    canvas.setMode(ui.mode);
    canvas.setBreakpoint(ui.device);
  });

  // Der Ebenen-Explorer (Ticket 03 Scheibe 1): Tree mit Tastatur,
  // Kontextmenue und Fokus-Rueckgabe. Die Site-Tabs (Ticket 03 Punkt 1)
  // speisen sich aus den Caches der Shell: Seiten wechseln, Medien als Bild
  // einfuegen; Vorlagen/Komponenten folgen mit ihrer Datenquelle (O14).
  // Das Elemente-Panel (E4) wird einmal gebaut und bleibt ueber Neuzeichnen
  // des Explorers erhalten (Suchtext, eingeklappte Kategorien). Klick fuegt
  // hinter der Auswahl ein, Ziehen setzt per Drag and Drop - beides ueber den
  // Controller des Canvas, wie die Schnellzugriff-Chips.
  let elementsPanel = null;
  const explorer = editor.createExplorer({
    host: explorerHost,
    store: session.store,
    tabs: [
      {
        id: "elements",
        label: "Elemente",
        items: () => [],
        element: (doc) => {
          if (elementsPanel === null) {
            elementsPanel = editor.createElementsPanel(doc, {
              insert: (primitive) => canvas.insert(primitive, "after"),
              bindDragSource: (element, primitive) => canvas.bindDragSource(element, primitive),
            });
          }
          return elementsPanel.element;
        },
      },
      {
        id: "pages",
        label: "Seiten",
        empty: "Keine Seiten gefunden.",
        items: () =>
          pagesCache.map((entry) => ({
            id: entry.id,
            label: entry.title || entry.path,
            hint: entry.path,
            active: entry.id === pageId,
          })),
        onActivate: (id) => {
          // Eine eigene Seitenwahl beendet die Agent-Vorschau: der Nutzer
          // will diese Seite sehen, kein Auto-Wechsel soll ihn wegziehen.
          if (id !== pageId) setFollowAgent(false);
          location.hash = `#/projects/${siteId}/pages/${id}`;
        },
      },
      {
        id: "components",
        label: "Komponenten",
        empty: "Noch keine Komponenten - Rechtsklick auf eine Ebene, dann ,Als Komponente anlegen'.",
        items: () =>
          editor.buildComponentList(session.store.document).map((entry) => ({
            id: entry.id,
            label: entry.name,
            hint: `v${entry.version} · ${
              entry.instances === 1 ? "1 Instanz" : `${entry.instances} Instanzen`
            }${entry.drift > 0 ? ` · ${entry.drift} alt` : ""}`,
          })),
        onActivate: (id) => {
          const target = session.store.selection.focus ?? null;
          const instanceId = editor.instantiateComponent(session.store, id, target);
          if (instanceId === null) {
            statusEl.textContent = "Die Instanz ließ sich nicht einfügen.";
            return;
          }
          session.select(instanceId);
          statusEl.textContent = "Instanz eingefügt";
        },
      },
      {
        id: "library",
        label: "Bibliothek",
        empty: "Noch keine globalen Bausteine.",
        items: () => (libraryComponents ?? []).map((component) => ({
          id: component.id,
          label: component.name,
          hint: `${component.kind} · v${component.version} · ${component.license.status}`,
        })),
        onActivate: (id) => {
          const component = (libraryComponents ?? []).find((entry) => entry.id === id);
          if (component === undefined) return;
          void (async () => {
            try {
              await api(`/api/sites/${siteId}/library-installs`, {
                method: "POST",
                body: {
                  componentId: id,
                  mode: "linked",
                  pageId,
                  parentNodeId: page.draft.rootNodeId,
                  author: AUTHOR,
                },
              });
              statusEl.textContent = `„${component.name}“ installiert`;
              const fresh = await api(`/api/pages/${pageId}`);
              session.replaceDocument(editor.loadDocument(fresh.draft).document, fresh.draftVersion);
              session.discardPending();
              setVersion(fresh.draftVersion);
            } catch (error) {
              failed(error);
            }
          })();
        },
      },
      {
        id: "media",
        label: "Medien",
        empty: "Keine Dateien in der Mediathek.",
        items: () =>
          mediaCache.map((asset) => ({
            id: asset.id,
            label: asset.name,
            hint: asset.kind,
          })),
        onActivate: (id) => {
          if (canvas.insert("image", "after", { asset: id })) {
            statusEl.textContent = "";
          }
        },
      },
    ],
    onMessage: (message) => {
      if (message !== null) statusEl.textContent = message;
    },
  });

  // Die Spotlight (Cmd+K, Ticket 03 Scheibe 1): Bausteine, Seiten und
  // Aktionen ueber die bestehende Suchlogik; `insert-primitive` fuegt am
  // ausgewaehlten Knoten ein.
  const spotlightIndex = editor.buildEditorSpotlightIndex({
    pages: pagesCache,
    primitives: editor.primitiveTypes().map((type) => {
      const definition = editor.getPrimitive(type);
      return {
        type,
        name: definition?.name ?? type,
        description: definition?.description ?? "",
        category: definition?.category ?? "",
      };
    }),
    currentPageId: pageId,
  });
  const spotlight = editor.createSpotlightDialog({
    index: spotlightIndex,
    onCommand: (command) => {
      if (command.type === "open-page") {
        location.hash = `#/projects/${siteId}/pages/${command.pageId}`;
      } else if (command.type === "insert-primitive") {
        canvas.insert(command.primitive, "after");
      } else if (command.type === "publish") {
        location.hash = `#/projects/${siteId}/review`;
      } else if (command.type === "set-mode") {
        canvas.setMode(command.mode);
      }
    },
  });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey === true || event.ctrlKey === true) && event.key === "k") {
      event.preventDefault?.();
      spotlight.open();
    }
  });

  // Der Inspektor (Ticket 02 Scheibe 1): Tabs Content/Style/Interactions/
  // Advanced, Feld-Familie aus der Vorschau, Token<->Literal.
  const inspector = editor.createInspector({
    host: inspectorHost,
    store: session.store,
    theme: siteTheme ?? editor.defaultTheme(),
    profile: siteProfile ?? "standard",
    breakpoint: savedUi.device,
    onTabChange: (tab) => session.setTab(tab),
    onBreakpointChange: (device) => session.setDevice(device),
    // Der Zustand des Style-Tabs ist die Vorschau (Ticket 02 Punkt 5): der
    // Canvas erzwingt :hover/:focus/:active/:disabled am gewaehlten Knoten.
    onStateChange: (state) => {
      canvas.setPreviewState(state);
    },
    onMessage: (message) => {
      if (message !== null) statusEl.textContent = message;
    },
  });
  inspector.setTab(savedUi.tab);
  // Die Auswahl aus der letzten Sitzung wiederherstellen, sofern der Knoten
  // noch existiert; `store.select` umgeht den Persistenz-Schreibpfad nicht.
  if (savedUi.selectedId && session.document.nodes[savedUi.selectedId]) {
    session.store.select(savedUi.selectedId);
  }

  /* ------------------------------------------------------- Live-Mitverfolgung
   * Ticket 05: die Engine meldet Aenderungen ueber SSE (`GET /api/events`).
   * Der Editor laedt die offene Seite nach (Store-Patch statt Voll-Neuladen),
   * hebt die geaenderten Knoten kurz hervor (Lime-Ring, 1200 ms) und fuehrt
   * ein Bau-Protokoll. Eigene offene Aenderungen blockieren das Nachladen,
   * sonst gingen sie verloren; ohne Kanal bleibt alles beim manuellen Neuladen. */
  const protocol = el("div", {
    class: "canvas-view__protocol",
    "data-role": "protocol",
  });
  protocol.hidden = true;
  canvasHost.append(protocol);
  const protocolRows = [];
  const protocolAction = (action) => MUTATION_LABELS[action] ?? action ?? "Änderung";
  const protocolTime = () =>
    new Date().toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  function logProtocol(payload) {
    protocolRows.unshift({
      actor: payload.actor?.label ?? "Unbekannt",
      action: protocolAction(payload.action),
      time: protocolTime(),
    });
    protocolRows.length = Math.min(protocolRows.length, 6);
    protocol.replaceChildren(
      el("div", { class: "canvas-view__protocol-title", text: "Was gerade passiert" }),
      ...protocolRows.map((row) =>
        el(
          "div",
          { class: "canvas-view__protocol-row" },
          el("span", { class: "canvas-view__protocol-actor", text: row.actor }),
          el("span", { class: "canvas-view__protocol-action", text: row.action }),
          el("span", { class: "canvas-view__protocol-time", text: row.time }),
        ),
      ),
    );
    protocol.hidden = false;
  }
  const parseEngineEvent = (event) => {
    try {
      return JSON.parse(event.data ?? "{}");
    } catch {
      return {};
    }
  };
  // Eigene Schreibvorgaenge tragen den Programm-Token; sie sind kein
  // "Agent baut" und werden weder protokolliert noch nachgeladen.
  const isOwnEvent = (payload) => payload.actor?.label === AUTHOR.label;
  // Agent-Vorschau (Ticket 05, Punkt 5): der Schalter laesst die Ansicht dem
  // Agenten ueber Seitengrenzen folgen - "Agent baut, Nutzer sieht es im
  // Canvas wachsen". Er liegt global (nicht je Seite), ist standardmaessig an
  // und schaltet sich aus, sobald der Nutzer selbst eine Seite waehlt; offene
  // Aenderungen blockieren jeden Wechsel.
  let followAgent = storage.get("senify-agent-preview") !== "0";
  const followButton = el("button", {
    type: "button",
    "data-action": "canvas-follow",
    "aria-pressed": String(followAgent),
    text: "Agent-Vorschau",
    title: "Fremden Änderungen folgen — auch auf andere Seiten",
  });
  followButton.classList.toggle("active", followAgent);
  const setFollowAgent = (value) => {
    followAgent = value;
    storage.set("senify-agent-preview", value ? "1" : "0");
    followButton.setAttribute("aria-pressed", String(value));
    followButton.classList.toggle("active", value);
  };
  followButton.addEventListener("click", () => {
    setFollowAgent(!followAgent);
    statusEl.textContent = followAgent ? "Agent-Vorschau an" : "Agent-Vorschau aus";
  });

  // Sekundäre Editor-Aktionen liegen in einem echten Overflow-Menü. Die
  // bestehenden data-action-Selektoren bleiben erhalten, damit Import, Follow
  // und die Konfliktwege direkt addressierbar und testbar bleiben.
  activeToolbarMenuCleanup?.();
  const overflowMenuId = "canvas-toolbar-overflow";
  const overflowButton = el("button", {
    type: "button",
    class: "toolbar-overflow__trigger",
    "data-action": "canvas-overflow",
    "aria-haspopup": "menu",
    "aria-expanded": "false",
    "aria-controls": overflowMenuId,
    text: "Mehr",
  });
  const overflowMenu = el("div", {
    class: "toolbar-overflow__menu",
    id: overflowMenuId,
    role: "menu",
    "aria-label": "Weitere Editor-Aktionen",
  });
  const overflowHost = el("div", { class: "toolbar-overflow" }, overflowButton, overflowMenu);
  overflowMenu.hidden = true;
  for (const item of [framerImportButton, followButton, reloadButton, retryButton]) {
    item.setAttribute("role", item === followButton ? "menuitemcheckbox" : "menuitem");
    item.classList.add("toolbar-overflow__item");
    overflowMenu.append(item);
  }
  const overflowItems = () =>
    [...overflowMenu.querySelectorAll("button:not([hidden])")];
  const setOverflowOpen = (open, restoreFocus = false) => {
    overflowMenu.hidden = !open;
    overflowButton.setAttribute("aria-expanded", String(open));
    if (open) overflowItems()[0]?.focus();
    else if (restoreFocus) overflowButton.focus();
  };
  overflowButton.addEventListener("click", (event) => {
    event.stopPropagation();
    setOverflowOpen(overflowMenu.hidden);
  });
  overflowButton.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    setOverflowOpen(true);
    const items = overflowItems();
    (event.key === "ArrowUp" ? items[items.length - 1] : items[0])?.focus();
  });
  overflowMenu.addEventListener("click", () => setOverflowOpen(false));
  overflowMenu.addEventListener("keydown", (event) => {
    const items = overflowItems();
    const current = items.indexOf(document.activeElement);
    let next = -1;
    if (event.key === "ArrowDown") next = (current + 1) % items.length;
    else if (event.key === "ArrowUp") next = (current - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      setOverflowOpen(false, true);
      return;
    } else return;
    event.preventDefault();
    items[next]?.focus();
  });
  const closeOverflowOnOutsidePointer = (event) => {
    if (!overflowHost.contains(event.target)) setOverflowOpen(false);
  };
  const cleanup = () => {
    document.removeEventListener("pointerdown", closeOverflowOnOutsidePointer);
    if (overflowButton.isConnected) setOverflowOpen(false);
    if (activeToolbarMenuCleanup === cleanup) activeToolbarMenuCleanup = null;
    // The redesign inbox only makes sense on the page it belongs to.
    stopRedesignPolling();
  };
  activeToolbarMenuCleanup = cleanup;
  document.addEventListener("pointerdown", closeOverflowOnOutsidePointer);
  // Wechselt auf die Seite, an der der Agent gerade arbeitet - nur ohne
  // offene lokale Aenderungen (sonst gingen sie beim Routenwechsel verloren).
  const followPage = (targetPageId) => {
    if (!followAgent || targetPageId === pageId) return false;
    const state = session.saveState();
    if (state.pending > 0 || state.status === "saving") {
      statusEl.textContent = "Fremde Änderung auf einer anderen Seite - bitte speichern";
      return false;
    }
    location.hash = `#/projects/${siteId}/pages/${targetPageId}`;
    return true;
  };
  // Nur eine Canvas-Ansicht ist aktiv; die vorige schliesst ihren Kanal beim
  // Routenwechsel (sonst leckt jede Navigation eine SSE-Verbindung).
  activeLiveStream?.close();
  const live =
    typeof EventSource === "function"
      ? new EventSource(`/api/events?site=${encodeURIComponent(siteId)}`)
      : null;
  activeLiveStream = live;
  live?.addEventListener("draft.changed", (event) => {
    const payload = parseEngineEvent(event);
    if (isOwnEvent(payload)) return;
    logProtocol(payload);
    if (payload.pageId !== pageId) {
      followPage(payload.pageId);
      return;
    }
    const state = session.saveState();
    if (state.pending > 0 || state.status === "saving") {
      statusEl.textContent = "Fremde Änderung erkannt - bitte speichern oder neu laden";
      return;
    }
    void (async () => {
      try {
        const fresh = await api(`/api/pages/${pageId}`);
        session.replaceDocument(
          editor.loadDocument(fresh.draft).document,
          fresh.draftVersion,
        );
        canvas.flashNodes(Array.isArray(payload.nodeIds) ? payload.nodeIds : []);
        setVersion(fresh.draftVersion);
        statusEl.textContent = `Live: ${protocolAction(payload.action)}`;
      } catch (error) {
        failed(error);
      }
    })();
  });
  live?.addEventListener("page.created", (event) => {
    const payload = parseEngineEvent(event);
    if (isOwnEvent(payload)) return;
    logProtocol(payload);
    // Die Seitenliste der Shell nachziehen, damit die neue Seite im Explorer
    // waehlbar ist; mit Agent-Vorschau wechselt die Ansicht gleich dorthin.
    void (async () => {
      try {
        const listed = await api(`/api/sites/${siteId}/pages`);
        pagesCache.length = 0;
        pagesCache.push(
          ...(listed.pages ?? []).map((entry) => ({
            id: entry.id,
            title: entry.title || entry.path,
            path: entry.path,
          })),
        );
        explorer.refresh();
        if (!followPage(payload.pageId)) {
          statusEl.textContent = "Neue Seite angelegt - im Explorer wählbar";
        }
      } catch (error) {
        failed(error);
      }
    })();
  });
  live?.addEventListener("asset.uploaded", (event) => {
    const payload = parseEngineEvent(event);
    if (isOwnEvent(payload)) return;
    logProtocol(payload);
  });
  live?.addEventListener("release.published", (event) => {
    const payload = parseEngineEvent(event);
    if (isOwnEvent(payload)) return;
    logProtocol(payload);
  });
  // Re-Bake (E12): der Worker meldet das Ergebnis; der Badge zeigt es direkt,
  // ein Fehler zusaetzlich als Toast (die Job-Route traegt die Details).
  live?.addEventListener("bake.done", (event) => {
    const payload = parseEngineEvent(event);
    logProtocol(payload);
    showBake("Inhalt neu gebaut");
  });
  live?.addEventListener("bake.failed", (event) => {
    const payload = parseEngineEvent(event);
    logProtocol(payload);
    showBake("Re-Bake fehlgeschlagen", true);
    toast("Re-Bake fehlgeschlagen — Details in der Job-Liste", "error");
  });
  // Beim Verlassen der Ansicht den Kanal schliessen (kein abgebrochener
  // Request, kein Leck beim Wechsel der Route).
  window.addEventListener("pagehide", () => {
    live?.close();
    if (activeLiveStream === live) activeLiveStream = null;
    cleanup();
  });

  saveButton.addEventListener("click", () => {
    void session.flush();
  });
  // Veroeffentlichen ueber die echte Route (Ticket 17): erst die offenen
  // Aenderungen speichern, dann `POST /api/sites/:siteId/releases` — derselbe
  // Pfad wie der MCP-`publish_release` (Revisionen, Theme-Snapshot, Release,
  // O9-Vorhang, aktives Release). Der Editor baut nichts selbst.
  publishButton.addEventListener("click", async () => {
    publishButton.disabled = true;
    statusEl.textContent = "Veröffentliche …";
    try {
      await session.flush();
      const result = await api(`/api/sites/${siteId}/releases`, {
        method: "POST",
        body: { author: AUTHOR },
      });
      const releaseId = result.release?.id ?? "?";
      statusEl.textContent = `Release ${releaseId} aktiv`;
      toast(`Veröffentlicht — Release ${releaseId}`, "info");
    } catch (error) {
      statusEl.textContent = error?.message ?? "Veröffentlichen fehlgeschlagen";
      toast(`Veröffentlichen fehlgeschlagen: ${error?.message ?? error}`, "error");
    } finally {
      publishButton.disabled = false;
    }
  });
  reloadButton.addEventListener("click", () => {
    void reloadDraft();
  });
  retryButton.addEventListener("click", () => {
    void retrySave();
  });

  toolbar.append(statusGroup, redesignInbox, saveButton, publishButton, overflowHost);
  return { session, canvas, inspector, explorer, spotlight };
}

async function pageView(siteId, pageId, initialSearch) {
  const page = await api(`/api/pages/${pageId}`);
  // Das Site-Profil (Ticket 20): der Editor zeigt es und validiert Profil-
  // Wechsel gegen das Dokument, bevor er den PATCH ausloest.
  let siteProfile = "standard";
  try {
    const site = await api(`/api/sites/${siteId}`);
    siteProfile = site.profile ?? "standard";
  } catch {
    // Kein Site-Kontext erreichbar: der Editor faellt auf `standard` zurueck.
  }
  let siteTheme = null;
  let siteThemeVersion = 0;
  try {
    const themeResponse = await api(`/api/sites/${siteId}/theme`);
    siteTheme = themeResponse.theme ?? null;
    siteThemeVersion = Number.isInteger(themeResponse.version) ? themeResponse.version : 0;
  } catch {
    siteTheme = null;
    siteThemeVersion = 0;
  }
  let siteStyleRules = [];
  let styleRegistryVersion = 0;
  let libraryComponents = [];
  try {
    const [rules, library] = await Promise.all([
      api(`/api/sites/${siteId}/style-rules`),
      api("/api/library-components"),
    ]);
    siteStyleRules = rules.rules ?? [];
    styleRegistryVersion = Number.isInteger(rules.version) ? rules.version : 0;
    libraryComponents = library.components ?? [];
  } catch {
    siteStyleRules = [];
    styleRegistryVersion = 0;
    libraryComponents = [];
  }
  let currentTree = page.draft;
  let pagesCache = [];
  try {
    const listed = await api(`/api/sites/${siteId}/pages`);
    pagesCache = (listed.pages ?? []).map((entry) => ({
      id: entry.id,
      title: entry.title || entry.path,
      path: entry.path,
    }));
  } catch {
    pagesCache = [];
  }
  let mediaCache = [];
  // Die Bausteine holen ihre Bilder über den Auslieferungs-Kontext
  // (`/assets/<id>/<datei>`); ohne ihn fällt der Renderer auf
  // `/assets/<id>` ohne Dateinamen zurück und jedes Bild läuft ins Leere.
  let assetContext = {};
  async function refreshMedia() {
    try {
      const listed = await api(`/api/sites/${siteId}/assets`);
      const assets = listed.assets ?? [];
      mediaCache = assets.map((asset) => ({
        id: asset.id,
        name: asset.filename,
        kind: asset.kind,
        folders: asset.folderId ? [asset.folderId] : [],
        tags: asset.tags ?? [],
        createdAt: Date.parse(asset.createdAt) || undefined,
      }));
      assetContext = Object.fromEntries(
        assets.map((asset) => {
          // Der Versionsparameter bricht den Cache nach einem Austausch.
          const version = Date.parse(asset.updatedAt) || 0;
          return [
            asset.id,
            {
              src: `/assets/${asset.id}/${encodeURIComponent(asset.filename)}?v=${version}`,
              width: asset.width ?? null,
              height: asset.height ?? null,
              blurhash: asset.blurhash ?? null,
              variants: (asset.variants ?? []).map((variant) => ({
                format: variant.format,
                width: variant.width,
                url: `/assets/${asset.id}/variants/${variant.width}.${variant.format}?v=${version}`,
              })),
            },
          ];
        }),
      );
    } catch {
      mediaCache = [];
      assetContext = {};
    }
  }
  await refreshMedia();

  // Ein sichtbarer Editorpfad (E5 Scheibe 1): der Umbau-Canvas (`mountCanvas`,
  // v2-Dokument) ist der Editor. Seit P3-1 Punkt 4 gibt es keinen zweiten
  // mehr und keinen Modus zu berechnen - der Aufrufer pflegt den Canvas.
  // `data-senify-editor` macht die --ed-*-Tokens fuer die Workspace-Leiste verfuegbar
  // (sie liegt ausserhalb des Editor-Wurzelelements).
  const toolbar = el(
    "div",
    { class: "toolbar", "data-senify-editor": "true" },
    el("a", { href: `#/projects/${siteId}/pages`, text: "← Seiten" }),
    el("h1", { text: page.title || page.path, style: "margin: 0" }),
    el("code", { text: page.path }),
    el("div", { class: "spacer" }),
    el("span", { class: "muted", id: "page-version", text: `Draft v${page.draftVersion}` }),
  );
  const host = el("div", { class: "editor-host", id: "editor-host" });
  render([toolbar, host]);

  let editor = null;
  try {
    editor = await import("/editor.js");
  } catch {
    editor = null;
  }

  // P3-1 Punkt 4 (R5): the v1 editor is deleted, so `?view=editor` is no longer
  // a second editing path but a **notice**: the deep link lands on the canvas
  // and says why. The block sits before the mount, not after it, or the notice
  // would never appear.
  if (legacyEditorDeepLink(initialSearch)) {
    // Der Parameter wird aus dem Hash entfernt, damit ein Reload den Hinweis
    // nicht erneut zeigt - sonst wird er zum Normalzustand statt zur
    // einmaligen Nachricht. Er steht **im Hash**, nicht in `location.search`:
    // das Dashboard routet ueber `#/projects/…?view=editor`, und `location.search`
    // ist bei diesem Routing leer.
    const [path, search = ""] = String(location.hash).split("?");
    const cleaned = search
      .split("&")
      .filter((part) => part !== "" && part !== "view=editor")
      .join("&");
    history.replaceState(
      null,
      "",
      `${location.origin}${location.pathname}${location.search}${path}${cleaned === "" ? "" : `?${cleaned}`}`,
    );
    toast(
      "Der alte Editor ist abgeloest — der Canvas ist jetzt der einzige Bearbeitungsweg.",
      "info",
    );
  }

  if (editor) {
    mountCanvasView({
      pageId,
      siteId,
      page,
      host,
      toolbar,
      editor,
      pagesCache,
      mediaCache,
      libraryComponents,
      assetContext,
      siteProfile,
      siteTheme,
      siteThemeVersion,
      styleRules: siteStyleRules,
      styleRegistryVersion,
    });
    return;
  }

  // The editor bundle did not load. What is left is the raw structure, read
  // only: enough to see what the page is made of, not enough to change it. The
  // v1 editor used to be a second path here; there is no second path any more.
  const nodes = currentTree?.nodes ?? {};
  const root = nodes[currentTree?.rootNodeId] ?? { children: [] };
  function outline(nodeId) {
    const node = nodes[nodeId];
    if (!node) return [];
    return [
      el("div", { class: "outline-node" }, [
        el("span", { class: "tag", text: node.type }),
        node.variant ? el("span", { class: "tag", text: node.variant }) : "",
        el("code", { text: ` ${node.id}` }),
        node.hidden ? el("span", { class: "muted", text: " · versteckt" }) : "",
      ]),
      ...(node.children ?? []).flatMap((child) => outline(child)),
    ];
  }
  host.className = "panel";
  host.replaceChildren(
    el("h2", { text: "Aufbau (read-only)" }),
    el(
      "div",
      { class: "outline-tree" },
      (root.children ?? []).flatMap((child) => outline(child)),
    ),
  );
}

/* Command palette */

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
  if (!refsRouteActive) return;
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
    el("p", { text: "Die Verbindung zum lokalen Senify-Dienst ist kurz nicht verfügbar oder die Route enthält ungültige Daten." }),
    retry,
  );
}

async function renderRoute() {
  const hash = location.hash || "#/";
  const question = hash.indexOf("?");
  const route = question === -1 ? hash : hash.slice(0, question);
  const deepLink = question === -1 ? "" : hash.slice(question + 1);
  const referenceMatch = route.match(/^#\/references\/([^/]+)$/);
  const isReferences = route === "#/references" || referenceMatch !== null;
  view.classList.toggle("refs-view", isReferences);
  // Der Seiten-Editor ist eine Arbeitsfläche: die 68rem-Spalte der übrigen
  // Ansichten würde ihn auf 1088px einengen, obwohl die Bühne 1440px zeigt.
  const isEditor = /^#\/projects\/[^/]+\/pages\/[^/]+$/.test(route);
  view.classList.toggle("editor-view", isEditor);
  // Workspace-Modus: im Seiten-Editor ersetzt eine einzige Leiste die Portal-Leiste.
  document.body.classList.toggle("is-editor", isEditor);
  refsRouteActive = isReferences;
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
      // Bibliothek zurueck, damit „Zurueck" das Fenster nicht schliesst.
      await referencesView();
      await refsOpenInspector(referenceMatch[1], { replace: true });
    } else if (route === "#/trash") {
      activeTab("projects");
      await trashView();
    } else {
      activeTab("projects");
      await projectsView();
    }
  } catch (error) {
    failed(error);
    render([routeErrorView(error)]);
  }
  if (refsTray) refsRenderTray();
}

window.addEventListener("hashchange", () => void renderRoute());
void renderRoute();
