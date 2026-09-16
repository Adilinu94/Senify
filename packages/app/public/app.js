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

function failed(error) {
  const hint = error.suggestion ? ` — ${error.suggestion}` : "";
  toast(`${error.message}${hint}`, "error");
}

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

function breakpointLabel(breakpoint) {
  const width = Number.parseInt(breakpoint, 10);
  if (!Number.isFinite(width)) return String(breakpoint);
  if (width >= 1200) return "Desktop";
  if (width >= 700) return "Tablet";
  return "Mobile";
}

// Detail stage: the captured breakpoints as a small slider. Keyboard (arrow
// left/right) and mouse (buttons, breakpoint tabs) drive the same index.
function refsSnapshotStage(reference, snapshots) {
  const shots = [...snapshots].sort((a, b) => b.width - a.width);
  let index = 0;
  const image = el("img", { class: "snapshot-image", alt: "Snapshot" });
  const meta = el("div", { class: "snapshot-meta" });
  const tabs = el("div", { class: "snapshot-tabs" });
  let loadToken = 0;
  const show = (next) => {
    index = (next + shots.length) % shots.length;
    const shot = shots[index];
    const token = (loadToken += 1);
    refsImageSource(snapshotImageURL(reference.id, shot)).then(
      (src) => {
        if (token === loadToken) image.src = src;
      },
      () => {
        if (token === loadToken) image.removeAttribute("src");
      },
    );
    image.alt = `Snapshot ${breakpointLabel(shot.breakpoint)}`;
    meta.textContent = `${breakpointLabel(shot.breakpoint)} · ${shot.width}×${shot.height} px · ${shot.kind === "section" ? "Section" : "Fullpage"}`;
    [...tabs.children].forEach((tab, position) =>
      tab.classList.toggle("active", position === index),
    );
  };
  shots.forEach((shot, position) =>
    tabs.append(
      el("button", {
        type: "button",
        class: "refs-button quiet",
        text: breakpointLabel(shot.breakpoint),
        onclick: () => show(position),
      }),
    ),
  );
  show(0);
  const slider = el(
    "div",
    { class: "snapshot-slider", tabindex: "0" },
    el("div", { class: "snapshot-frame" }, image),
    el(
      "div",
      { class: "snapshot-controls" },
      el("button", {
        type: "button",
        class: "refs-button quiet",
        text: "Zurück",
        onclick: () => show(index - 1),
      }),
      tabs,
      el("button", {
        type: "button",
        class: "refs-button quiet",
        text: "Weiter",
        onclick: () => show(index + 1),
      }),
    ),
    meta,
  );
  slider.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      show(index - 1);
      event.preventDefault();
    } else if (event.key === "ArrowRight") {
      show(index + 1);
      event.preventDefault();
    }
  });
  return slider;
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

async function projectsView() {
  const { sites } = await api("/api/sites");
  const releases = await Promise.all(
    sites.map((site) =>
      api(`/api/sites/${site.id}/releases`)
        .then((data) => (data.releases ?? []).length > 0)
        .catch(() => false),
    ),
  );
  const cards = sites.map((site, index) =>
    el(
      "article",
      { class: "card" },
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
          { class: "card-actions" },
          el("button", {
            class: "primary",
            text: "Öffnen",
            onclick: () => (location.hash = `#/projects/${site.id}/pages`),
          }),
          el("button", {
            class: "ghost",
            text: "Umbenennen",
            onclick: () => renameSite(site),
          }),
          el("button", {
            class: "ghost",
            text: "Duplizieren",
            onclick: () => openDuplicate(site),
          }),
          el("button", {
            class: "danger",
            text: "Papierkorb",
            onclick: () => trashSite(site),
          }),
        ),
      ),
    ),
  );
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
    toast("URL und HTML werden benötigt.", "error");
    return;
  }
  try {
    const result = await api("/api/references", {
      method: "POST",
      body: { url, author: AUTHOR, wait: true, snapshot: { html } },
    });
    toast("Referenz aus Quelltext analysiert (reduziertes Profil)");
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
    toast("Referenz gelöscht");
    // The deleted detail is gone: fall back to the library list.
    if (location.hash.startsWith("#/references/")) location.hash = "#/references";
    else await renderRoute();
  } catch (error) {
    failed(error);
  }
}

function referenceTokenChip(token, withSwatch) {
  return el(
    "span",
    { class: "token", title: token.where.join(" · ") },
    withSwatch ? el("span", { class: "swatch", style: `background: ${token.value}` }) : undefined,
    el("code", { text: token.value }),
    el("span", { class: "tag", text: token.level }),
    token.uses > 1 ? el("span", { class: "muted", text: `×${token.uses}` }) : undefined,
  );
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
const REFS_ICON_BACK = refsIcon('<path d="M14.4 5.6 8 12l6.4 6.4"/>', 13);
const REFS_ICON_SEARCH_LARGE = refsIcon(
  '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  35,
);
const REFS_ICON_PLUS_BOX = refsIcon('<path d="M12 6.2v11.6M6.2 12h11.6"/>', 25);
const REFS_ICON_CHECK_BOX = refsIcon('<path d="M5.6 12.4 10 16.8 18.4 7.6"/>', 25);

let refsCollections = [];
let refsStyleCatalog = null;
let refsRouteActive = false;
let refsDetailIds = [];
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

function refsPreviewImage(url, alt, fallback) {
  const image = el("img", { alt });
  refsImageSource(url).then(
    (src) => {
      image.src = src;
    },
    () => {
      if (fallback) image.replaceWith(fallback());
    },
  );
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
  if (!/^#\/references(\?|$)/.test(location.hash)) return;
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

// Brief kopieren: Clipboard wenn verfuegbar, sonst Dialog zum Markieren.
function refsCopy(text, message) {
  const clipboard = window.navigator ? window.navigator.clipboard : undefined;
  if (clipboard && typeof clipboard.writeText === "function") {
    clipboard.writeText(text).then(
      () => toast(message ?? "Brief kopiert"),
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
    toast("Drei ausgewählt. Entferne eine, um eine andere hinzuzufügen.", "error");
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
  const snapshot = (reference.snapshots ?? []).find((shot) => shot.previewPath);
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

function refsChip(word, onClick) {
  return el("button", {
    type: "button",
    class: "refs-chip",
    text: word,
    onclick: onClick ?? (() => refsFilterByVocabulary(word)),
  });
}

// Vokabular-Chips filtern die Liste (Adresse traegt den Suchbegriff).
function refsFilterByVocabulary(word) {
  refsState.query = word;
  refsState.view = "";
  if (refsDom && refsDom.searchInput) refsDom.searchInput.value = word;
  if (location.hash.startsWith("#/references/")) {
    location.hash = `#/references?q=${encodeURIComponent(word)}`;
    return;
  }
  refsSyncAddress();
  void refsRefresh();
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
        el("h2", { text: "Wähle deine Richtung." }),
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
            toast(editing ? "Sammlung gespeichert" : "Sammlung angelegt");
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
    toast(
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
          toast("Referenz gespeichert");
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
            toast(
              `Analyse fehlgeschlagen: ${reference.failureReason ?? "unbekannt"} — nutze „Aus Quelltext“ als Fallback.`,
              "error",
            );
          } else {
            toast("Referenz analysiert");
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

  const titleText = el("span", { text: "Alle Referenzen" });
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
  const heading = el(
    "section",
    { class: "refs-heading" },
    el("div", {}, el("h1", {}, titleText, countEl), description),
    aboutButton,
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
    { class: "refs-main" },
    mobileNav,
    el(
      "div",
      { class: "refs-topbar" },
      el("span", { class: "refs-topbar-label", text: "Referenz-Bibliothek" }),
      el(
        "div",
        { class: "refs-actions" },
        el("button", {
          type: "button",
          class: "refs-button quiet",
          text: "Einstellungen",
          onclick: () => (location.hash = "#/settings"),
        }),
        el("button", {
          type: "button",
          class: "refs-button primary",
          onclick: () => refsOpenAddDialog(),
        }, el("span", { "aria-hidden": "true", html: REFS_ICON_PLUS_BUTTON }), " Referenz hinzufügen"),
      ),
    ),
    heading,
    toolbar,
    progress,
    hint,
    gallery,
    empty,
    footer,
  );

  const root = el("div", { class: "refs-shell" }, sidebar, main);
  refsDom = {
    root,
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
    failed(error);
    return;
  } finally {
    refsPending = Math.max(0, refsPending - 1);
    if (refsPending === 0) root.classList.remove("refs-loading");
  }
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
    refsDom.collectionNav.replaceChildren(
      ...personalCollections.map((collection) =>
        refsNavItem({
          label: collection.name,
          count: collection.referenceCount ?? 0,
          dot: refsHex(collection.accent),
          active: !styleMode && refsState.collection === collection.id,
          onClick: () => refsSetCollection(collection.id),
        }),
      ),
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
    refsDom.gallery.replaceChildren(...references.map((reference) => refsCard(reference)));
    refsDom.countEl.textContent = String(counts.inView ?? references.length);
    refsDom.footer.querySelector(".refs-footer-count").textContent = refsFooterText(
      counts.inView ?? references.length,
      "Referenzen",
      refsState.query,
    );
  }
  refsTrayResync();
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
  return `${count} ${noun}${query === "" ? " in Ansicht" : ` passend zu “${query}”`}`;
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
    toast(`${result.seed?.created ?? 0} Stilfamilien eingespielt`);
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
      el("h2", { text: reference.name }),
      el(
        "p",
        {},
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
  const snapshot = (reference.snapshots ?? []).find((shot) => shot.previewPath);
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

function refsOpenDetail(referenceId) {
  location.hash = `#/references/${referenceId}`;
}

// Aufklappbare Bausteine der Detailseite (Rezept, Historie, Evidenz, Profil).
function refsFold(title, body, open) {
  const details = el("details", { class: "refs-fold" });
  if (open) details.open = true;
  details.append(el("summary", { text: title }), el("div", { class: "refs-fold-body" }, body));
  return details;
}

function refsRevisionsFold(referenceId) {
  const details = el("details", { class: "refs-fold" }, el("summary", { text: "Revisions-Historie" }));
  const body = el("div", { class: "refs-fold-body" });
  details.append(body);
  let loaded = false;
  details.addEventListener("toggle", async () => {
    if (!details.open || loaded) return;
    loaded = true;
    body.replaceChildren(el("p", { class: "muted", text: "Lädt…" }));
    try {
      const data = await api(`/api/references/${referenceId}/revisions`);
      const revisions = data.revisions ?? [];
      if (revisions.length === 0) {
        body.replaceChildren(el("p", { class: "muted", text: "Noch keine Profil-Revision." }));
        return;
      }
      body.replaceChildren(
        el(
          "table",
          {},
          el(
            "thead",
            {},
            el(
              "tr",
              {},
              el("th", { text: "Revision" }),
              el("th", { text: "Zeit" }),
              el("th", { text: "Quelle" }),
              el("th", { text: "Notiz" }),
            ),
          ),
          el(
            "tbody",
            {},
            revisions.map((revision) =>
              el(
                "tr",
                {},
                el("td", { text: String(revision.revision) }),
                el("td", { text: formatDate(revision.createdAt) }),
                el("td", {
                  text: `${revision.author?.kind === "agent" ? "Agent" : "Mensch"} · ${revision.author?.label ?? "—"}`,
                }),
                el("td", { text: revision.note ?? "—" }),
              ),
            ),
          ),
        ),
      );
    } catch (error) {
      body.replaceChildren(el("p", { class: "muted", text: error.message }));
    }
  });
  return details;
}

function refsEvidenceFold(reference) {
  const evidence = reference.evidence ?? [];
  return refsFold(
    `Evidenz (${evidence.length})`,
    evidence.length === 0
      ? el("p", { class: "muted", text: "Keine Evidenz erfasst." })
      : el(
          "ul",
          {},
          evidence.slice(0, 40).map((entry) =>
            el(
              "li",
              {},
              el("span", { class: "tag", text: entry.level }),
              ` ${entry.claim}`,
            ),
          ),
        ),
  );
}

function refsProvenanceFold(reference) {
  return refsFold(
    "Provenienz",
    el(
      "div",
      { class: "refs-fold-body" },
      el(
        "p",
        {},
        el("strong", { text: "Quelle: " }),
        el("a", {
          href: reference.sourceUrl,
          target: "_blank",
          rel: "noreferrer",
          text: reference.sourceUrl,
        }),
      ),
      el("p", {
        class: "muted",
        text: `Methode: ${reference.method === "snapshot" ? "Snapshot (reduziert)" : reference.method === "manual" ? "Manuell" : "Live-Capture"} · Stand: ${formatDate(reference.provenance?.capturedAt)} · Revision ${reference.revision}`,
      }),
      reference.failureReason
        ? el("p", { class: "muted", text: `Fehler: ${reference.failureReason}` })
        : undefined,
      reference.usedInProjects.length > 0
        ? el("p", {
            class: "muted",
            text: `In ${reference.usedInProjects.length} Projekt(en) verwendet.`,
          })
        : undefined,
    ),
  );
}

function refsProfileFolds(reference) {
  const profile = reference.profile;
  if (!profile) {
    return [
      el("div", {
        class: "refs-fold",
        style: "border-top: 1px solid #e5e1ec; margin-top: 24px; padding-top: 16px; font-size: 12px; color: #737d8c",
        text: "Noch kein Profil: Die Analyse läuft oder ist fehlgeschlagen. Nutze „Aus Quelltext“ als Fallback.",
      }),
    ];
  }
  const folds = [refsProvenanceFold(reference)];
  if (profile.tokens.color.length > 0) {
    folds.push(
      refsFold(
        "Farben",
        el(
          "div",
          { class: "chip-row" },
          profile.tokens.color.slice(0, 24).map((token) => referenceTokenChip(token, true)),
        ),
      ),
    );
  }
  if (profile.tokens.type.length > 0) {
    folds.push(
      refsFold(
        "Typografie",
        el(
          "table",
          {},
          el(
            "thead",
            {},
            el(
              "tr",
              {},
              el("th", { text: "Rolle" }),
              el("th", { text: "Größe" }),
              el("th", { text: "Zeilenhöhe" }),
              el("th", { text: "Gewicht" }),
              el("th", { text: "Evidenz" }),
            ),
          ),
          el(
            "tbody",
            {},
            profile.tokens.type.slice(0, 14).map((step) =>
              el(
                "tr",
                {},
                el("td", { text: step.role }),
                el("td", {}, el("code", { text: step.size })),
                el("td", { text: step.lineHeight ?? "—" }),
                el("td", { text: step.weight === null ? "—" : String(step.weight) }),
                el("td", {}, el("span", { class: "tag", text: step.level })),
              ),
            ),
          ),
        ),
      ),
    );
  }
  const scaleGroups = [
    ["Schriftfamilien", profile.tokens.families],
    ["Abstände", profile.tokens.space],
    ["Radien", profile.tokens.radius],
    ["Schatten", profile.tokens.shadow],
  ].filter(([, tokens]) => tokens.length > 0);
  if (scaleGroups.length > 0) {
    folds.push(
      refsFold(
        "Skalen",
        scaleGroups.map(([label, tokens]) =>
          el(
            "div",
            { style: "margin-bottom: 0.75rem" },
            el("div", { class: "muted", text: label }),
            el(
              "div",
              { class: "chip-row" },
              tokens.slice(0, 12).map((token) => referenceTokenChip(token, false)),
            ),
          ),
        ),
      ),
    );
  }
  if (profile.motion.length > 0) {
    folds.push(
      refsFold(
        "Motion",
        el(
          "table",
          {},
          el(
            "thead",
            {},
            el(
              "tr",
              {},
              el("th", { text: "Effekt" }),
              el("th", { text: "Preset" }),
              el("th", { text: "Trigger" }),
              el("th", { text: "Evidenz" }),
            ),
          ),
          el(
            "tbody",
            {},
            profile.motion.slice(0, 12).map((recipe) =>
              el(
                "tr",
                {},
                el("td", { text: recipe.name }),
                el("td", {}, el("code", { text: recipe.preset ?? "—" })),
                el("td", { text: recipe.trigger }),
                el("td", {}, el("span", { class: "tag", text: recipe.level })),
              ),
            ),
          ),
        ),
      ),
    );
  }
  if (
    profile.vocabulary.length > 0 ||
    profile.rules.constants.length > 0 ||
    profile.rules.never.length > 0
  ) {
    folds.push(
      refsFold(
        "Design-Sprache",
        [
          profile.vocabulary.length > 0
            ? el(
                "div",
                { class: "chip-row", style: "margin-bottom: 0.6rem" },
                profile.vocabulary.map((word) => el("span", { class: "tag", text: word })),
              )
            : undefined,
          profile.rules.constants.length > 0
            ? el("p", {}, el("strong", { text: "Konstanten: " }), profile.rules.constants.join(" · "))
            : undefined,
          profile.rules.never.length > 0
            ? el("p", {}, el("strong", { text: "Nie: " }), profile.rules.never.join(" · "))
            : undefined,
        ],
      ),
    );
  }
  if (profile.guardrails.length > 0) {
    folds.push(
      refsFold(
        "Schutzregeln",
        el(
          "ul",
          {},
          profile.guardrails.map((finding) =>
            el(
              "li",
              {},
              el("span", { class: "tag", text: finding.severity }),
              ` ${finding.message} — ${finding.suggestion}`,
            ),
          ),
        ),
      ),
    );
  }
  return folds;
}

function refsAssignPanel(reference, sites) {
  const scaleBoxes = ["color", "type", "motion", "rest"].map((scale) => {
    const box = el("input", { type: "checkbox", "data-scale": scale });
    box.checked = true;
    return el("label", { class: "inline" }, box, scale);
  });
  const host =
    sites.length === 0
      ? el("p", { class: "muted", text: "Noch keine Projekte." })
      : el(
          "div",
          { class: "inline" },
          el(
            "select",
            { "aria-label": "Projekt" },
            ...sites.map((site) => el("option", { value: site.id, text: site.name })),
          ),
          ...scaleBoxes,
          el("button", {
            type: "button",
            class: "refs-button primary",
            text: "Zuordnen",
            onclick: async (event) => {
              const select = event.target.closest(".inline")?.querySelector("select");
              const siteId = select ? select.value : "";
              const scales = [...event.target.closest(".inline").querySelectorAll("[data-scale]")]
                .filter((box) => box.checked)
                .map((box) => box.dataset.scale);
              if (scales.length === 0) {
                toast("Mindestens eine Skala auswählen.", "error");
                return;
              }
              try {
                await api(`/api/sites/${siteId}/references`, {
                  method: "POST",
                  body: { author: AUTHOR, referenceId: reference.id, scales },
                });
                toast("Referenz zugeordnet");
              } catch (error) {
                failed(error);
              }
            },
          }),
        );
  return refsFold("Projekt zuordnen", host);
}

async function referenceDetailView(referenceId) {
  activeTab("references");
  refsApplyAddress();
  let reference;
  try {
    reference = await api(`/api/references/${referenceId}`);
  } catch (error) {
    failed(error);
    render([el("div", { class: "empty", text: "Referenz nicht gefunden." })]);
    return;
  }
  const [listData, briefData, sitesData] = await Promise.all([
    api(`/api/references?sort=${refsState.sort}`).catch(() => ({ references: [] })),
    api(`/api/references/${referenceId}/brief`).catch(() => null),
    api("/api/sites").catch(() => ({ sites: [] })),
  ]);
  const sites = sitesData.sites ?? [];
  refsDetailIds = (listData.references ?? []).map((entry) => entry.id);
  const position = refsDetailIds.indexOf(referenceId);

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
    reference.vocabulary.length > 0 ? reference.vocabulary : (collection?.vocabulary ?? []);
  const selected = refsIsSelected(reference.id);

  const stage = el("div", { class: "refs-stage" });
  const snapshotImages = reference.snapshots.filter((shot) => shot.previewPath);
  if (snapshotImages.length > 0) {
    stage.append(refsSnapshotStage(reference, snapshotImages));
    stage.append(
      el("p", {
        class: "snapshot-meta",
        text: "Breakpoint-Vergleich. Pfeiltasten oder Klick wechseln das Bild.",
      }),
    );
  } else {
    stage.append(
      el("div", { class: "refs-card-placeholder", text: initials(reference.name || "R") }),
    );
  }

  const zoomButton = el("button", { type: "button", class: "refs-button quiet", text: "Zoom" });
  zoomButton.addEventListener("click", () => {
    const zoomed = stage.classList.toggle("zoomed");
    zoomButton.textContent = zoomed ? "Bild einpassen" : "Zoom";
  });

  const imagePromptButton = () => {
    const button = el("button", {
      type: "button",
      class: "refs-button",
      text: "Bild-Prompt kopieren",
      onclick: () => {
        if (briefData?.imagePrompt) refsCopy(briefData.imagePrompt, "Bild-Prompt kopiert");
        else toast("Kein Bildrezept gespeichert.", "error");
      },
    });
    button.disabled = !briefData?.imagePrompt;
    return button;
  };

  const recipeDetails = el(
    "details",
    { class: "refs-recipe" },
    el("summary", {}, "Bildrezept", el("span", { "aria-hidden": "true", html: REFS_ICON_PLUS_BUTTON })),
    el("p", { text: recipe ?? "Kein Bildrezept gespeichert." }),
    imagePromptButton(),
  );

  const selectButton = el("button", {
    type: "button",
    class: selected ? "refs-button quiet" : "refs-button",
    text: selected ? "Aus Vergleich entfernen" : "Zum Vergleich",
  });
  selectButton.addEventListener("click", () => {
    refsToggleSelection(refsEntryFor(reference));
    selectButton.textContent = refsIsSelected(reference.id)
      ? "Aus Vergleich entfernen"
      : "Zum Vergleich";
  });

  const brief = el(
    "section",
    { class: "refs-brief" },
    el("div", { class: "refs-eyebrow", text: collection ? collection.name : "Ohne Sammlung" }),
    el("h2", { text: reference.name }),
    el("p", { class: "refs-brief-family", text: family ?? "Ohne Familie" }),
    el(
      "div",
      { class: "refs-detail-section" },
      el("h3", { text: "Die Idee zum Mitnehmen" }),
      el("p", { text: note }),
    ),
    el(
      "div",
      { class: "refs-detail-section" },
      el("h3", { text: "Design-Vokabular" }),
      el("div", { class: "refs-tags" }, vocabulary.map((word) => refsChip(word))),
    ),
    el(
      "div",
      { class: "refs-detail-section" },
      el("h3", { text: "Aufbau & Platzierung" }),
      el("p", { text: heroUsage }),
    ),
    recipeDetails,
    el(
      "div",
      { class: "refs-detail-actions" },
      el("button", {
        type: "button",
        class: "refs-button primary",
        text: "Design-Brief kopieren",
        onclick: () => refsCopy(briefData?.brief?.text ?? "", "Brief kopiert"),
      }),
      imagePromptButton(),
      selectButton,
    ),
    el("p", {
      class: "refs-preference-status",
      text: briefData?.brief?.status ?? "Referenz-Brief.",
    }),
  );

  // Bearbeiten: Name, Sammlung, Notiz, Vokabular, Rezept (PATCH /api/references/:id).
  const nameEdit = el("input", { class: "refs-input", type: "text", maxlength: "120" });
  nameEdit.value = reference.name;
  const collectionEdit = el("select", {});
  collectionEdit.append(el("option", { value: "", text: "Ohne Sammlung" }));
  for (const item of refsCollections.filter((entry) => entry.kind === "collection")) {
    collectionEdit.append(el("option", { value: item.id, text: item.name }));
  }
  collectionEdit.value = reference.collectionId ?? "";
  const noteEdit = el("textarea", { class: "refs-input", rows: "3", maxlength: "1000" });
  noteEdit.value = reference.note ?? "";
  const vocabularyEdit = el("input", { class: "refs-input", type: "text" });
  vocabularyEdit.value = vocabulary.join(", ");
  const recipeEdit = el("textarea", { class: "refs-input", rows: "3", maxlength: "2000" });
  recipeEdit.value = reference.imageRecipe ?? "";
  const editFold = refsFold(
    "Bearbeiten",
    el(
      "div",
      {},
      el("label", { class: "refs-field-label", text: "Name" }),
      nameEdit,
      el("label", { class: "refs-field-label", text: "Sammlung" }),
      collectionEdit,
      el("label", { class: "refs-field-label", text: "Notiz" }),
      noteEdit,
      el("label", { class: "refs-field-label", text: "Vokabular (Komma-getrennt)" }),
      vocabularyEdit,
      el("label", { class: "refs-field-label", text: "Bildrezept" }),
      recipeEdit,
      el(
        "div",
        { class: "refs-row-actions" },
        el("button", {
          type: "button",
          class: "refs-button primary",
          text: "Speichern",
          onclick: async () => {
            const name = nameEdit.value.trim();
            try {
              await api(`/api/references/${referenceId}`, {
                method: "PATCH",
                body: {
                  ...(name === "" ? {} : { name }),
                  collectionId: collectionEdit.value === "" ? null : collectionEdit.value,
                  note: noteEdit.value.trim(),
                  vocabulary: refsSplit(vocabularyEdit.value),
                  imageRecipe: recipeEdit.value.trim(),
                },
              });
              toast("Referenz gespeichert");
              await referenceDetailView(referenceId);
            } catch (error) {
              failed(error);
            }
          },
        }),
      ),
    ),
  );

  const prevButton = el("button", {
    type: "button",
    class: "refs-icon-button",
    "aria-label": "Vorherige Referenz",
    html: REFS_ICON_PREV,
    onclick: () => refsNavigate(-1),
  });
  const nextButton = el("button", {
    type: "button",
    class: "refs-icon-button",
    "aria-label": "Nächste Referenz",
    html: REFS_ICON_NEXT,
    onclick: () => refsNavigate(1),
  });
  prevButton.disabled = position <= 0;
  nextButton.disabled = position < 0 || position >= refsDetailIds.length - 1;

  render([
    el(
      "div",
      { class: "refs-detail-head" },
      el("button", {
        type: "button",
        class: "refs-button quiet",
        onclick: () => (location.hash = "#/references"),
      }, el("span", { "aria-hidden": "true", html: REFS_ICON_BACK }), "Referenzen"),
      el("span", {
        class: "refs-dialog-label",
        text: position >= 0 ? `Referenz ${position + 1} von ${refsDetailIds.length}` : "Referenz",
      }),
      el(
        "div",
        { class: "refs-actions" },
        prevButton,
        nextButton,
        zoomButton,
        el("span", { class: "tag", text: reference.status }),
        el("button", {
          type: "button",
          class: "refs-button danger",
          text: "Löschen",
          onclick: () => deleteReference(reference),
        }),
      ),
    ),
    el("div", { class: "refs-detail" }, stage, brief),
    editFold,
    refsRevisionsFold(referenceId),
    refsEvidenceFold(reference),
    ...refsProfileFolds(reference),
    refsAssignPanel(reference, sites),
  ]);
}

function refsNavigate(delta) {
  const match = location.hash.match(/^#\/references\/([^/?]+)/);
  if (!match) return;
  const position = refsDetailIds.indexOf(match[1]);
  if (position < 0) return;
  const target = refsDetailIds[position + delta];
  if (target) location.hash = `#/references/${target}`;
}

// Tastatur: `/` fokussiert die Suche, Pfeiltasten blättern in der Detailseite.
document.addEventListener("keydown", (event) => {
  const editing = /INPUT|TEXTAREA|SELECT/.test(event.target.tagName ?? "");
  const dialogOpen = document.querySelector("dialog[open]") !== null;
  if (
    event.key === "/" &&
    !editing &&
    !dialogOpen &&
    refsDom &&
    refsDom.searchInput &&
    refsDom.root.isConnected
  ) {
    event.preventDefault();
    refsDom.searchInput.focus();
    return;
  }
  if (editing || dialogOpen || !refsRouteActive) return;
  if (!/^#\/references\/[^/?]+/.test(location.hash)) return;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    refsNavigate(-1);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    refsNavigate(1);
  }
});

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
                text: "Widerrufen",
                onclick: async () => {
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
        { class: "inline", style: "margin-top: 0.9rem" },
        el("input", { id: "token-name", type: "text", placeholder: "Name, z. B. Claude Code" }),
        el("input", { id: "token-scopes", type: "text", value: "read,write" }),
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
        { class: "inline" },
        el("input", { id: "smtp-host", type: "text", placeholder: "smtp.example.com", value: settings.email.host }),
        el("input", { id: "smtp-port", type: "number", placeholder: "587", value: String(settings.email.port) }),
        el(
          "select",
          { id: "smtp-tls" },
          ...["starttls", "tls", "none"].map((mode) =>
            el("option", {
              value: mode,
              text: mode,
              selected: mode === settings.email.tls ? "" : undefined,
            }),
          ),
        ),
      ),
      el(
        "div",
        { class: "inline" },
        el("input", { id: "smtp-user", type: "text", placeholder: "Benutzer", value: settings.email.user }),
        el("input", {
          id: "smtp-password",
          type: "password",
          placeholder: settings.email.hasPassword
            ? "Passwort gespeichert (leer lassen = unverändert)"
            : "kein Passwort gespeichert",
        }),
        el("input", { id: "smtp-from", type: "text", placeholder: "Absender, z. B. formular@kunde.de", value: settings.email.from }),
      ),
      el(
        "div",
        { class: "inline", style: "margin-top: 0.6rem" },
        el("button", {
          class: "primary",
          text: "Speichern",
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
        el("input", { id: "smtp-test-to", type: "text", placeholder: "Testmail an …" }),
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
              if (!response.ok) toast(response.message, "error");
            } catch (error) {
              result.textContent = "";
              failed(error);
            }
          },
        }),
        el("span", { id: "smtp-test-result", class: "muted" }),
      ),
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
        { class: "inline" },
        el("input", { id: "backup-dir", type: "text", placeholder: "Zielordner (leer = Standard)", value: settings.backup.targetDir }),
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
        "details",
        {},
        el("summary", { text: "Restore-Anleitung" }),
        el("p", {
          class: "muted",
          text: "Die Wiederherstellung ist ein manueller Schritt: die Engine schreibt nie automatisch zurück.",
        }),
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
        text: "Speichern",
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
              text: "Keine Referenz zugeordnet — im Referenzen-Tab einem Projekt zuordnen.",
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
  } else {
    body.push(
      el("div", {
        class: "empty",
        text: "Die Vorlagen-Verwaltung folgt mit dem Templates-Ticket.",
      }),
    );
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
        text: "Speichern",
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
  const details = el("div", { style: "margin-top: 0.6rem" });
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
      el("button", {
        class: "ghost",
        text: "Detail ansehen",
        onclick: async () => {
          try {
            const data = await api(`/api/reviews/${review.id}`);
            details.replaceChildren(
              el("pre", { text: JSON.stringify(data, null, 2) }),
            );
          } catch (error) {
            failed(error);
          }
        },
      }),
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

async function pageView(siteId, pageId, initialSearch) {
  const page = await api(`/api/pages/${pageId}`);
  let currentTree = page.draft;
  let editorInstance = null;
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
  try {
    const listed = await api(`/api/sites/${siteId}/assets`);
    mediaCache = (listed.assets ?? []).map((asset) => ({
      id: asset.id,
      name: asset.filename,
      kind: asset.kind,
      folders: [],
      tags: asset.tags ?? [],
      createdAt: Date.parse(asset.createdAt) || undefined,
    }));
  } catch {
    mediaCache = [];
  }

  const toolbar = el(
    "div",
    { class: "toolbar" },
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
  let refreshSeq = 0;
  if (editor) {
    try {
      const session = new editor.MutationsSession({
        transport: editor.createHttpTransport({
          pageId,
          baseUrl: location.origin,
          onConflict: () => {
            toast("Draft hat sich geändert — Seite wird neu geladen.", "error");
            void renderRoute();
          },
        }),
        initialVersion: page.draftVersion,
        author: AUTHOR,
        onVersion: (version) => {
          const badge = document.getElementById("page-version");
          if (badge) badge.textContent = `Draft v${version}`;
          // Rapid edits fire refetches faster than they resolve; only the
          // newest request may write the tree, or an older snapshot wins.
          const seq = ++refreshSeq;
          const load = (attempt) =>
            api(`/api/pages/${pageId}`)
              .then((fresh) => {
                if (seq !== refreshSeq) return;
                currentTree = fresh.draft;
                editorInstance?.refresh();
              })
              .catch(() => {
                // The local engine rate-limits bursts; a few short waits keep
                // the canvas from freezing on a stale tree.
                if (attempt < 3 && seq === refreshSeq) {
                  setTimeout(() => void load(attempt + 1), 400 + attempt * 500);
                }
              });
          void load(0);
        },
      });
      editorInstance = editor.mountEditor(host, {
        session,
        registry: editor.createRegistry(),
        tree: () => currentTree,
        page: { pageId, title: page.title, path: page.path },
        theme: editor.defaultTheme(),
        renderer: editor.createReactRenderer({
          context: () => ({
            pagePaths: Object.fromEntries(
              pagesCache.map((entry) => [entry.id, entry.path]),
            ),
            assets: {},
          }),
        }),
        frameStyles: ["/theme.css", "/editor-frame.css"],
        pages: () => pagesCache,
        media: () => mediaCache,
        ...(initialSearch ? { initialSearch } : {}),
        onDeepLink: (search) => {
          const base = `${location.origin}${location.pathname}${location.search}`;
          const suffix = search === "" ? "" : `?${search}`;
          history.replaceState(
            null,
            "",
            `${base}#/projects/${siteId}/pages/${pageId}${suffix}`,
          );
        },
        onCommand: (command) => {
          if (command.type === "open-page") {
            location.hash = `#/projects/${siteId}/pages/${command.pageId}`;
          } else if (command.type === "set-mode") {
            editorInstance?.setMode(command.mode);
          } else if (command.type === "open-media") {
            editorInstance?.openTab("media");
          } else if (command.type === "publish") {
            location.hash = `#/projects/${siteId}/review`;
          }
        },
      });
      return;
    } catch (error) {
      toast(
        `Editor konnte nicht starten (${error instanceof Error ? error.message : "unbekannter Fehler"}) — zeige den Aufbau.`,
        "error",
      );
    }
  }
  // Fallback without the editor bundle: read-only outline.
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
    event.preventDefault();
    void openCmdk();
  }
});

/* Router */

async function renderRoute() {
  const hash = location.hash || "#/";
  const question = hash.indexOf("?");
  const route = question === -1 ? hash : hash.slice(0, question);
  const deepLink = question === -1 ? "" : hash.slice(question + 1);
  const referenceMatch = route.match(/^#\/references\/([^/]+)$/);
  const isReferences = route === "#/references" || referenceMatch !== null;
  view.classList.toggle("refs-view", isReferences);
  refsRouteActive = isReferences;
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
    } else if (referenceMatch) {
      await referenceDetailView(referenceMatch[1]);
    } else if (route === "#/trash") {
      activeTab("projects");
      await trashView();
    } else {
      activeTab("projects");
      await projectsView();
    }
  } catch (error) {
    failed(error);
    render([el("div", { class: "empty", text: "Ansicht konnte nicht geladen werden." })]);
  }
  if (refsTray) refsRenderTray();
}

window.addEventListener("hashchange", () => void renderRoute());
void renderRoute();
