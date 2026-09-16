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

// Real thumbnail when the capture wrote a file, initials otherwise.
function referenceThumb(reference) {
  const fallback = el("div", { class: "card-thumb", text: initials(reference.name || "R") });
  const snapshot = (reference.snapshots || []).find((entry) => entry.previewPath);
  if (!snapshot) return fallback;
  const image = el("img", {
    class: "card-thumb image",
    src: snapshotImageURL(reference.id, snapshot),
    alt: `Vorschau ${reference.name}`,
  });
  image.addEventListener("error", () => image.replaceWith(fallback));
  return image;
}

// Detail view: compare the captured breakpoints as a small slider. Keyboard
// (arrow left/right) and mouse (buttons, breakpoint tabs) drive the same index.
function referenceSnapshotsPanel(reference, snapshots) {
  const shots = [...snapshots].sort((a, b) => b.width - a.width);
  let index = 0;
  const image = el("img", { class: "snapshot-image", alt: "Snapshot" });
  const meta = el("div", { class: "snapshot-meta muted" });
  const tabs = el("div", { class: "snapshot-tabs" });
  const show = (next) => {
    index = (next + shots.length) % shots.length;
    const shot = shots[index];
    image.src = snapshotImageURL(reference.id, shot);
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
        class: "ghost",
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
      el("button", { type: "button", class: "ghost", text: "Zurück", onclick: () => show(index - 1) }),
      tabs,
      el("button", { type: "button", class: "ghost", text: "Weiter", onclick: () => show(index + 1) }),
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
  return el(
    "div",
    { class: "panel" },
    el("h2", { text: "Snapshots" }),
    el("p", {
      class: "muted",
      text: "Breakpoint-Vergleich. Pfeiltasten oder Klick wechseln das Bild.",
    }),
    slider,
  );
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

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function statusDotFor(status) {
  if (status === "ready") return "live";
  if (status === "failed") return "review";
  return "";
}

async function createReference() {
  const url = prompt("URL der Referenz");
  if (!url) return;
  try {
    const result = await api("/api/references", {
      method: "POST",
      body: { url, author: AUTHOR, wait: true },
    });
    const reference = result.reference;
    if (reference.status === "failed") {
      toast(
        `Analyse fehlgeschlagen: ${reference.failureReason ?? "unbekannt"} — nutze „Aus Quelltext“ als Fallback.`,
        "error",
      );
    } else {
      toast("Referenz analysiert");
    }
    location.hash = `#/references/${reference.id}`;
  } catch (error) {
    failed(error);
  }
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
    await renderRoute();
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

async function referencesView() {
  const { references } = await api("/api/references");
  activeTab("references");
  const cards = references.map((reference) =>
    el(
      "article",
      { class: "card" },
      referenceThumb(reference),
      el(
        "div",
        { class: "card-body" },
        el(
          "div",
          { class: "card-title" },
          el("span", { class: `status-dot ${statusDotFor(reference.status)}` }),
          reference.name,
        ),
        el("div", {
          class: "muted",
          text: `${hostOf(reference.sourceUrl)} · ${reference.method === "snapshot" ? "Snapshot" : "Live"}`,
        }),
        el("div", {
          class: "muted",
          text:
            reference.families.length > 0
              ? reference.families.slice(0, 3).join(", ")
              : "keine Familien erkannt",
        }),
        el("div", {
          class: "muted",
          text:
            reference.usedInProjects.length > 0
              ? `In ${reference.usedInProjects.length} Projekt(en)`
              : "Nicht zugeordnet",
        }),
        el(
          "div",
          { class: "card-actions" },
          el("a", { href: `#/references/${reference.id}`, text: "Details" }),
          el("button", {
            class: "danger",
            text: "Löschen",
            onclick: () => deleteReference(reference),
          }),
        ),
      ),
    ),
  );
  render([
    el(
      "div",
      { class: "toolbar" },
      el("h1", { text: "Referenzen", style: "margin: 0" }),
      el("div", { class: "spacer" }),
      el("button", { class: "ghost", text: "Aus Quelltext", onclick: openSnapshotDialog }),
      el("button", { class: "primary", text: "Neue Referenz", onclick: createReference }),
    ),
    references.length === 0
      ? el("div", {
          class: "empty",
          text: "Noch keine Referenzen — analysiere eine URL oder füge Seiten-Quelltext ein.",
        })
      : el("div", { class: "card-grid" }, cards),
  ]);
}

async function referenceDetailView(referenceId) {
  const reference = await api(`/api/references/${referenceId}`);
  const { sites } = await api("/api/sites");
  activeTab("references");
  const profile = reference.profile;
  const nodes = [
    el(
      "div",
      { class: "toolbar" },
      el("a", { href: "#/references", text: "← Referenzen" }),
      el("h1", { text: reference.name, style: "margin: 0" }),
      el("span", { class: "tag", text: reference.status }),
      el("div", { class: "spacer" }),
      el("button", {
        class: "danger",
        text: "Löschen",
        onclick: () => deleteReference(reference),
      }),
    ),
    el(
      "div",
      { class: "panel" },
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
        text: `Methode: ${reference.method === "snapshot" ? "Snapshot (reduziert)" : "Live-Capture"} · Stand: ${formatDate(reference.provenance?.capturedAt)} · Revision ${reference.revision}`,
      }),
      reference.failureReason
        ? el("p", { class: "muted", text: `Fehler: ${reference.failureReason}` })
        : undefined,
      profile?.styleBrief ? el("p", { text: profile.styleBrief }) : undefined,
      profile?.reduced
        ? el("p", {
            class: "muted",
            text: "Reduziertes Profil (Snapshot-Fallback) — Runtime-Werte fehlen.",
          })
        : undefined,
    ),
  ];
  if (!profile) {
    nodes.push(
      el("div", {
        class: "empty",
        text: "Noch kein Profil — die Analyse läuft oder ist fehlgeschlagen. Nutze „Aus Quelltext“ als Fallback.",
      }),
    );
    render(nodes);
    return;
  }
  if (profile.tokens.color.length > 0) {
    nodes.push(
      el(
        "div",
        { class: "panel" },
        el("h2", { text: "Farben" }),
        el(
          "div",
          { class: "chip-row" },
          profile.tokens.color.slice(0, 24).map((token) => referenceTokenChip(token, true)),
        ),
      ),
    );
  }
  if (profile.tokens.type.length > 0) {
    nodes.push(
      el(
        "div",
        { class: "panel" },
        el("h2", { text: "Typografie" }),
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
    nodes.push(
      el(
        "div",
        { class: "panel" },
        el("h2", { text: "Skalen" }),
        ...scaleGroups.map(([label, tokens]) =>
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
    nodes.push(
      el(
        "div",
        { class: "panel" },
        el("h2", { text: "Motion" }),
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
  if (profile.vocabulary.length > 0 || profile.rules.constants.length > 0 || profile.rules.never.length > 0) {
    nodes.push(
      el(
        "div",
        { class: "panel" },
        el("h2", { text: "Design-Sprache" }),
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
      ),
    );
  }
  if (profile.guardrails.length > 0) {
    nodes.push(
      el(
        "div",
        { class: "panel" },
        el("h2", { text: "Schutzregeln" }),
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
  const snapshotImages = reference.snapshots.filter((snapshot) => snapshot.previewPath);
  if (snapshotImages.length > 0) {
    nodes.push(referenceSnapshotsPanel(reference, snapshotImages));
  } else if (reference.snapshots.length > 0) {
    nodes.push(
      el(
        "div",
        { class: "panel" },
        el("h2", { text: "Snapshots" }),
        el(
          "div",
          { class: "chip-row" },
          reference.snapshots.map((snapshot) =>
            el("span", {
              class: "token",
              text: `${snapshot.kind} · ${snapshot.breakpoint} · ${snapshot.width}×${snapshot.height}`,
            }),
          ),
        ),
      ),
    );
  }
  const scaleBoxes = ["color", "type", "motion", "rest"].map((scale) => {
    const box = el("input", { type: "checkbox", "data-scale": scale, id: `assign-${scale}` });
    box.checked = true;
    return el("label", { class: "inline" }, box, scale);
  });
  nodes.push(
    el(
      "div",
      { class: "panel" },
      el("h2", { text: "Projekt zuordnen" }),
      sites.length === 0
        ? el("p", { class: "muted", text: "Noch keine Projekte." })
        : el(
            "div",
            { class: "inline" },
            el(
              "select",
              { id: "assign-site" },
              ...sites.map((site) => el("option", { value: site.id, text: site.name })),
            ),
            ...scaleBoxes,
            el("button", {
              class: "primary",
              text: "Zuordnen",
              onclick: async () => {
                const siteId = document.getElementById("assign-site").value;
                const scales = [...document.querySelectorAll("[data-scale]")]
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
                  await renderRoute();
                } catch (error) {
                  failed(error);
                }
              },
            }),
          ),
    ),
  );
  nodes.push(
    el(
      "div",
      { class: "panel" },
      el("h2", { text: "Nachbearbeitung" }),
      el("p", {
        class: "muted",
        text: "Jede Änderung erzeugt eine neue Profil-Revision (append-only).",
      }),
      el("label", { class: "muted", for: "edit-vocabulary" }, "Vokabular (Komma-getrennt)"),
      el("input", { id: "edit-vocabulary", type: "text", value: profile.vocabulary.join(", ") }),
      el("label", { class: "muted", for: "edit-families" }, "Familien (Komma-getrennt)"),
      el("input", { id: "edit-families", type: "text", value: profile.families.join(", ") }),
      el("label", { class: "muted", for: "edit-note" }, "Notiz"),
      el("input", { id: "edit-note", type: "text" }),
      el("button", {
        class: "ghost",
        text: "Neue Revision",
        onclick: async () => {
          const split = (value) =>
            value
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean);
          try {
            await api(`/api/references/${reference.id}/revisions`, {
              method: "POST",
              body: {
                author: AUTHOR,
                vocabulary: split(document.getElementById("edit-vocabulary").value),
                families: split(document.getElementById("edit-families").value),
                note: document.getElementById("edit-note").value || undefined,
              },
            });
            toast("Profil-Revision erstellt");
            await renderRoute();
          } catch (error) {
            failed(error);
          }
        },
      }),
    ),
  );
  render(nodes);
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
  ["review", "Prüfen"],
  ["activity", "Aktivität"],
  ["settings", "Einstellungen"],
];

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
  render([
    el(
      "div",
      { class: "toolbar" },
      el("a", { href: `#/projects/${siteId}/articles`, text: "← Artikel" }),
      el("h1", { text: String(entry.cells?.title ?? entry.slug), style: "margin: 0" }),
      el("span", { class: "tag", text: entry.status }),
      el("span", { class: "muted", text: `v${entry.version}` }),
      el("div", { class: "spacer" }),
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
    el("div", { class: "panel" }, controls),
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

async function pageView(siteId, pageId) {
  const page = await api(`/api/pages/${pageId}`);
  let currentTree = page.draft;

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
          void api(`/api/pages/${pageId}`)
            .then((fresh) => {
              currentTree = fresh.draft;
            })
            .catch(() => undefined);
        },
      });
      editor.mountEditor(host, {
        session,
        registry: editor.createRegistry(),
        tree: () => currentTree,
        page: { pageId, title: page.title, path: page.path },
        theme: editor.defaultTheme(),
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
  try {
    const project = hash.match(/^#\/projects\/([^/]+)\/(pages|articles|templates|review|activity|settings)$/);
    const pageMatch = hash.match(/^#\/projects\/([^/]+)\/pages\/([^/]+)$/);
    const articleMatch = hash.match(/^#\/projects\/([^/]+)\/articles\/([^/]+)$/);
    const referenceMatch = hash.match(/^#\/references\/([^/]+)$/);
    if (articleMatch) {
      activeTab("projects");
      await articleEditorView(articleMatch[1], articleMatch[2]);
    } else if (pageMatch) {
      activeTab("projects");
      await pageView(pageMatch[1], pageMatch[2]);
    } else if (project && project[2] === "articles") {
      await articlesView(project[1]);
    } else if (project) {
      await projectView(project[1], project[2]);
    } else if (hash === "#/settings") {
      activeTab("settings");
      await settingsView();
    } else if (hash === "#/references") {
      activeTab("references");
      await referencesView();
    } else if (referenceMatch) {
      activeTab("references");
      await referenceDetailView(referenceMatch[1]);
    } else if (hash === "#/trash") {
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
}

window.addEventListener("hashchange", () => void renderRoute());
void renderRoute();
