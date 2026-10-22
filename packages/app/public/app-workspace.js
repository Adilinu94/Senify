// Der Projekt-Workspace (P3-2, Schritt 44): die Ansicht eines Projekts mit
// seinen Tabs, der Tab-Leiste, dem Dialog fuer eine neue Seite und der
// Breakpoint-Steuerung. `app-projects.js` importiert die View.
//
// Die vier Teile haengen nicht an den Projekten: `workspaceFrame` und
// `breakpointsPanel` brauchen je eine eigene Konstante, die mitgewandert ist;
// `projectView` braucht die drei und sonst nichts aus der Datei.

import { MUTATION_LABELS, PROFILE_LABELS, activeTab, api, el, failed, formatDate, render, routeScope, toast, AUTHOR, errorHint, friendlyError, nextDialogId } from "./app-core.js";
import { reviewPanel } from "./app-review.js";
import { renderRoute } from "./app.js";
import { submissionsTab } from "./app-workspace-submissions.js";
import { templatesTab } from "./app-workspace-templates.js";

// Die ausgewaehlte Formular-Einreichung im Tab. Sie stand bis R12 in
// `app-projects.js`; nur der Projekt-Workspace liest und schreibt sie.
let selectedFormId = null;

export const WORKSPACE_TABS = [
  ["pages", "Seiten"],
  ["articles", "Artikel"],
  ["templates", "Vorlagen"],
  ["submissions", "Einsendungen"],
  ["review", "Prüfen"],
  ["activity", "Aktivität"],
  ["settings", "Einstellungen"],
];

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

export async function openNewPageDialog(siteId) {
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

export const BREAKPOINT_DEFAULTS = { tablet: 1024, mobile: 640 };

export function breakpointsPanel(siteId, site) {
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
    body.push(...(await submissionsTab(siteId, {
      getFormId: () => selectedFormId,
      setFormId: (value) => { selectedFormId = value; },
      reload: renderRoute,
    })));
  } else if (tab === "templates") {
    body.push(...(await templatesTab(siteId, pages, { reload: renderRoute })));
  }
  render([...frame, ...body], current);
}
