// Der Projekt-Workspace (P3-2, Schritt 44): die Ansicht eines Projekts mit
// seinen Tabs, der Tab-Leiste, dem Dialog fuer eine neue Seite und der
// Breakpoint-Steuerung. `app-projects.js` importiert die View.
//
// Die vier Teile haengen nicht an den Projekten: `workspaceFrame` und
// `breakpointsPanel` brauchen je eine eigene Konstante, die mitgewandert ist;
// `projectView` braucht die drei und sonst nichts aus der Datei.

import { activeTab, api, el, failed, render, routeScope, toast, AUTHOR, errorHint, friendlyError, nextDialogId } from "./app-core.js";
import { renderRoute } from "./app.js";
import { submissionsTab } from "./app-workspace-submissions.js";
import { templatesTab } from "./app-workspace-templates.js";
import { settingsTab } from "./app-workspace-settings.js";
import { workspaceListTab } from "./app-workspace-lists.js";

// Die ausgewaehlte Formular-Einreichung im Tab. Sie stand bis R12 in
// `app-projects.js`; nur der Projekt-Workspace liest und schreibt sie.
let selectedFormId = null;

// Die Tabs, deren Inhalt `app-workspace-lists.js` baut. Die anderen haben
// eigene Module; diese drei teilen sich eines, weil sie dieselbe Form haben
// und zusammen kleiner sind als ein Modul je Tab.
const listTabs = new Set(["pages", "review", "activity"]);

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
  if (listTabs.has(tab)) {
    body.push(...(await workspaceListTab(siteId, tab, pages, { openNewPageDialog })));
  } else if (tab === "settings") {
    body.push(...(await settingsTab(siteId, site, {
      reload: renderRoute,
      breakpointsPanel,
    })));
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
