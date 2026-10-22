// Die Projekte, die Seiten und die Einstellungen. Die Bloecke standen in `app.js` und
// sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt
// ESLint.

import { AUTHOR, MUTATION_LABELS, PROFILE_LABELS, activeTab, api, askConfirm, askText, duplicateDialog, duplicateForm, duplicateName, el, errorHint, failed, formatDate, friendlyError, initials, nextDialogId, notificationStatus, render, routeScope, toast } from "./app-core.js";
import { refsToast } from "./app-references.js";
import { reviewPanel } from "./app-review.js";
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

// One backup row: the restore runs through POST /api/backups/:id/restore
// (destructive) and needs an explicit second click; the engine writes a
// safety backup of the replaced state before it touches anything.

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

export function workspaceFrame(siteId, site, tab, live) {
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

// "Neue Seite": title, optional path and a start template. The templates come
// from the engine (`GET /api/page-starters`), so the dashboard never lists one
// the server does not know. A page without a typed path gets one derived from
// the title by the server.

async function openNewPageDialog(siteId) {
  let starters;
  try {
    starters = (await api("/api/page-starters")).starters;
  } catch (error) {
    failed(error);
    return;
  }
  const previousFocus = document.activeElement;
  const id = nextDialogId("new-page");
  const titleInput = el("input", { id: `${id}-title`, type: "text", autocomplete: "off", "data-role": "new-page-title" });
  const pathInput = el("input", {
    id: `${id}-path`,
    type: "text",
    autocomplete: "off",
    placeholder: "Wird aus dem Titel erzeugt",
    "data-role": "new-page-path",
    "aria-describedby": `${id}-path-help`,
  });
  const problem = el("p", { class: "ask-dialog__problem", role: "alert", hidden: "" });
  const group = el(
    "div",
    { role: "radiogroup", "aria-labelledby": `${id}-starter-label`, class: "starter-list" },
    starters.map((starter, index) =>
      el(
        "label",
        { class: "radio starter-option" },
        el("input", {
          type: "radio",
          name: "starter",
          value: starter.id,
          ...(index === 0 ? { checked: "" } : {}),
        }),
        el(
          "span",
          {},
          el("strong", { text: starter.label }),
          el("span", { class: "muted", text: ` — ${starter.description}` }),
        ),
      ),
    ),
  );
  const submitButton = el("button", { type: "submit", value: "ok", class: "primary", text: "Seite anlegen" });
  const form = el(
    "form",
    { method: "dialog" },
    el("h2", { id: `${id}-heading`, text: "Neue Seite" }),
    el("label", { class: "muted", for: titleInput.id, text: "Titel" }),
    titleInput,
    el("label", { class: "muted", for: pathInput.id, text: "Adresse (optional)" }),
    pathInput,
    el("p", { class: "muted", id: `${id}-path-help`, text: "Zum Beispiel /ueber-uns. Leer lassen, dann wählen wir die Adresse passend zum Titel." }),
    el("p", { class: "muted", id: `${id}-starter-label`, text: "Vorlage" }),
    group,
    problem,
    el(
      "div",
      { class: "modal-actions" },
      el("button", { type: "button", class: "ghost", text: "Abbrechen", onclick: () => dialog.close("cancel") }),
      submitButton,
    ),
  );
  const dialog = el("dialog", { class: "modal ask-dialog", "aria-labelledby": `${id}-heading`, "data-role": "new-page-dialog" }, form);
  const close = () => {
    dialog.remove();
    if (previousFocus?.isConnected && typeof previousFocus.focus === "function") previousFocus.focus();
  };
  dialog.addEventListener("close", close);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close("cancel");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    problem.hidden = true;
    const starter = new FormData(form).get("starter") ?? "blank";
    const title = titleInput.value.trim();
    let path = pathInput.value.trim();
    if (path !== "" && !path.startsWith("/")) path = `/${path}`;
    submitButton.disabled = true;
    submitButton.textContent = "Lege an …";
    try {
      const page = await api(`/api/sites/${siteId}/pages`, {
        method: "POST",
        body: {
          starter,
          ...(title === "" ? {} : { title }),
          ...(path === "" ? {} : { path }),
        },
      });
      dialog.close("ok");
      if (page.starter && page.starter.applied === false) {
        toast(`Seite angelegt, die Vorlage ließ sich nicht einsetzen: ${page.starter.reason}`, "error");
      } else {
        toast("Seite angelegt");
      }
      location.hash = `#/projects/${siteId}/pages/${page.id}`;
    } catch (error) {
      // The two answers a person can cause with the address field, in plain
      // words; everything else keeps the general wording.
      problem.textContent =
        error?.status === 409
          ? "Diese Adresse gehört schon zu einer anderen Seite. Bitte eine andere wählen."
          : error?.status === 400 && path !== ""
            ? "Die Adresse ist ungültig. Sie beginnt mit „/“ und enthält keine Leerzeichen, „?“ oder „#“."
            : `${friendlyError(error)}${errorHint(error)}`;
      problem.hidden = false;
      pathInput.setAttribute("aria-invalid", String(error?.status === 409 || (error?.status === 400 && path !== "")));
      submitButton.disabled = false;
      submitButton.textContent = "Seite anlegen";
    }
  });
  document.body.append(dialog);
  dialog.showModal();
  titleInput.focus();
}

// Die Standardwerte der Plattform (Spiegel von `DEFAULT_BREAKPOINTS` im
// Widget-Engine; ein Test hält beide gleich). Sie stehen nur als Hinweis im
// Feld: gespeichert wird, was eingetragen ist, und die Engine prüft die Grenzen.

const BREAKPOINT_DEFAULTS = { tablet: 1024, mobile: 640 };

// Umbruchpunkte der Website (ADR-0020): ab welcher Breite das Tablet- und das
// Handy-Layout gelten. Sie wirken auf die ganze Website: Editor-Blätter,
// Vorschau und Veröffentlichung rechnen mit denselben zwei Zahlen.

function breakpointsPanel(siteId, site) {
  const own = site.breakpoints ?? null;
  const field = (id, label, value, placeholder) =>
    el(
      "div",
      { class: "inline" },
      el("label", { class: "muted", for: id }, label),
      el("input", { id, type: "number", min: "1", step: "1", inputmode: "numeric", value: value === null ? "" : String(value), placeholder: String(placeholder) }),
      el("span", { class: "muted", text: "Pixel" }),
    );
  const read = (id) => {
    const text = document.getElementById(id).value.trim();
    return text === "" ? null : Number(text);
  };
  const save = async (breakpoints, done) => {
    try {
      await api(`/api/sites/${siteId}`, { method: "PATCH", body: { breakpoints, author: AUTHOR } });
      toast(done);
      await renderRoute();
    } catch (error) {
      failed(error);
    }
  };
  return el(
    "div",
    { class: "panel", "data-panel": "breakpoints" },
    el("h2", { text: "Umbruchpunkte (Breakpoints)" }),
    el("p", {
      class: "muted",
      text: "Ab welcher Breite die Seite auf Tablet und auf Handy umbaut. Das gilt für die ganze Website: für die Blätter im Editor, die Vorschau und die Veröffentlichung.",
    }),
    field("site-breakpoint-tablet", "Tablet-Layout unter", own?.tablet ?? null, BREAKPOINT_DEFAULTS.tablet),
    field("site-breakpoint-mobile", "Handy-Layout unter", own?.mobile ?? null, BREAKPOINT_DEFAULTS.mobile),
    el(
      "div",
      { class: "inline" },
      el("button", {
        class: "primary",
        text: "Umbruchpunkte speichern",
        onclick: () => {
          const tablet = read("site-breakpoint-tablet");
          const mobile = read("site-breakpoint-mobile");
          // Beide leer heißt: zurück auf den Standard der Plattform.
          if (tablet === null && mobile === null) return save(null, "Umbruchpunkte auf den Standard gesetzt");
          // Ein leeres Feld nimmt den Standardwert, damit man nur eine Zahl ändern muss.
          return save(
            { tablet: tablet ?? BREAKPOINT_DEFAULTS.tablet, mobile: mobile ?? BREAKPOINT_DEFAULTS.mobile },
            "Umbruchpunkte gespeichert",
          );
        },
      }),
      el("button", {
        text: "Auf Standard zurücksetzen",
        // `el` setzt jedes Attribut als Text: `disabled: false` wäre noch gesperrt.
        disabled: own === null ? "" : undefined,
        onclick: () => save(null, "Umbruchpunkte auf den Standard gesetzt"),
      }),
    ),
    el("p", {
      class: "muted",
      text: `Leer lassen heißt: Standard (Tablet unter ${BREAKPOINT_DEFAULTS.tablet}, Handy unter ${BREAKPOINT_DEFAULTS.mobile} Pixel). Neue Werte erscheinen im Editor nach dem Neuladen und auf der veröffentlichten Seite mit der nächsten Veröffentlichung.`,
    }),
  );
}

export async function projectView(siteId, tab) {
  const current = routeScope();
  const [site, { pages }, { releases }] = await Promise.all([
    api(`/api/sites/${siteId}`),
    api(`/api/sites/${siteId}/pages`),
    api(`/api/sites/${siteId}/releases`),
  ]);
  if (!current()) return;
  activeTab("projects");
  const frame = workspaceFrame(siteId, site, tab, releases.length > 0);
  const body = [];
  if (tab === "pages") {
    body.push(
      el(
        "div",
        { class: "toolbar" },
        el("h2", { text: "Seiten", style: "margin: 0" }),
        el("div", { class: "spacer" }),
        el("button", {
          class: "primary",
          text: "Neue Seite",
          "data-action": "new-page",
          onclick: () => void openNewPageDialog(siteId),
        }),
      ),
      pages.length === 0
        ? el("div", { class: "empty", text: "Noch keine Seiten — lege die erste an, am schnellsten mit einer Vorlage." })
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
        el("p", {}, el("strong", { text: "Kurzname (steht in Adressen und Dateinamen): " }), el("code", { text: site.slug })),
        el("p", {}, el("strong", { text: "Niveau (Bewegung und Effekte): " }), PROFILE_LABELS[site.profile] ?? site.profile),
        el("p", {
          class: "muted",
          text: "Den Namen änderst du in der Projektliste unter „Umbenennen“. Auslieferung und Deploy findest du weiter unten.",
        }),
        el(
          "div",
          { class: "inline" },
          el("label", { class: "muted", for: "site-base-url" }, "Öffentliche Adresse"),
          el("input", {
            id: "site-base-url",
            type: "text",
            value: site.baseUrl ?? "",
            placeholder: "https://www.kunde.de",
          }),
          el("button", {
            class: "primary",
            text: "Adresse speichern",
            onclick: async () => {
              try {
                await api(`/api/sites/${siteId}`, {
                  method: "PATCH",
                  body: {
                    baseUrl: document.getElementById("site-base-url").value,
                    author: AUTHOR,
                  },
                });
                toast("Öffentliche Adresse gespeichert");
                await renderRoute();
              } catch (error) {
                failed(error);
              }
            },
          }),
        ),
        el("p", {
          class: "muted",
          text: `Unter dieser Adresse öffnen Besucher die Seite. Sie steckt in canonical, Sitemap, og:url und der Formularprüfung. Leer lassen: Platzhalter ${site.slug}.senify.xyz.`,
        }),
      ),
      breakpointsPanel(siteId, site),
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
  render([...frame, ...body], current);
}
