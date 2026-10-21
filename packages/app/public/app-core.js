// Die Grundlagen der Oberflaeche. Die Bloecke standen in `app.js` und
// sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt
// ESLint.

export const view = document.getElementById("view");
const toasts = document.getElementById("toasts");
export const cmdk = document.getElementById("cmdk");
export const cmdkInput = document.getElementById("cmdk-input");
export const cmdkResults = document.getElementById("cmdk-results");
export const duplicateDialog = document.getElementById("duplicate-dialog");
export const duplicateForm = document.getElementById("duplicate-form");
export const duplicateName = document.getElementById("duplicate-name");
const themeToggle = document.getElementById("theme-toggle");

const MODE_STORAGE_KEY = "senify-mode";

// The technical keys stay in brackets: documentation, MCP tools and the editor
// still call them clean / standard / showcase.

export const PROFILE_LABELS = {
  clean: "Ruhig (clean) — wenig Bewegung, keine schweren Effekte",
  standard: "Ausgewogen (standard) — sanfte Bewegung, sparsame Effekte",
  showcase: "Auffällig (showcase) — alle Effekte, auch 3D",
};

export const IMAGE_PROVIDER_LABELS = {
  "image-use": "Image Use",
  comfyui: "ComfyUI (auf diesem Rechner)",
  custom: "Eigener Dienst",
  off: "Aus",
};

export const MUTATION_LABELS = {
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
  update_site_base_url: "Öffentliche Adresse geändert",
  update_site_breakpoints: "Umbruchpunkte geändert",
  trash_site: "Projekt in den Papierkorb",
  restore_site: "Projekt wiederhergestellt",
  duplicate_site: "Projekt dupliziert",
};

// The dashboard writes as the human operator; agents use their own tokens.

export const AUTHOR = { kind: "human", id: "programm", label: "Programm" };

export function el(tag, props = {}, ...children) {
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

export async function api(path, options = {}) {
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
    failure.category = error.category;
    failure.field = error.field;
    throw failure;
  }
  return data;
}

export function toast(message, kind = "info") {
  const node = el("div", { class: `toast ${kind}`, text: message });
  if (kind === "error") {
    // Announced at once, and kept until it has been read and closed: a message
    // that vanishes after seconds cannot be read by everyone. The same error
    // twice (a failing background request) is shown once.
    for (const shown of toasts.children) {
      if (shown.classList.contains("error") && shown.firstChild?.textContent === message) return;
    }
    node.setAttribute("role", "alert");
    node.append(
      el("button", {
        type: "button",
        class: "toast__close",
        "aria-label": "Meldung schließen",
        text: "×",
        onclick: () => node.remove(),
      }),
    );
    toasts.append(node);
    return;
  }
  toasts.append(node);
  setTimeout(() => node.remove(), 4000);
}

// Die Engine antwortet auf Englisch (MCP und Agenten lesen dieselben Texte).
// Hier stehen die Meldungen, die im Dashboard tatsächlich auftauchen, als
// deutsche Sätze; alles andere bekommt unten einen deutschen Vorspann, und der
// technische Originaltext bleibt als Detail sichtbar.

const ENGINE_MESSAGES = [
  [/^Site name is required$/, () => "Bitte einen Projektnamen eingeben."],
  [/^Token name is required$/, () => "Bitte einen Namen für den Zugang eingeben."],
  [/^Site slug "(.+)" is already in use$/, (m) => `Die Adresse „${m[1]}“ ist schon vergeben. Bitte einen anderen Namen wählen.`],
  [/^Page path "(.+)" is already in use( on this site)?$/, (m) => `Die Seitenadresse „${m[1]}“ gehört schon einer anderen Seite.`],
  [/^Invalid page path "(.*)"$/, (m) => `Die Seitenadresse „${m[1]}“ ist ungültig.`],
  [/^Style class "(.+)" already exists$/, (m) => `Die Style-Klasse „${m[1]}“ gibt es schon.`],
  [/^Invalid style rule: (.+)$/, (m) => `Die Style-Regel ist ungültig: ${m[1]}`],
  [/^Site "(.+)" is already in the trash$/, () => "Das Projekt liegt schon im Papierkorb."],
  [/^Release "(.+)" is already finalized$/, () => "Diese Veröffentlichung ist bereits abgeschlossen."],
  [/^Site has no active release to deploy$/, () => "Das Projekt hat noch keine aktive Veröffentlichung, die ausgeliefert werden könnte."],
  [/^The build is empty$/, () => "Der Build ist leer — es gibt noch nichts zu veröffentlichen."],
  [/^Library component is still installed$/, () => "Der Baustein ist noch in einem Projekt installiert und lässt sich nicht löschen."],
  [/^There is nothing to undo on this page$/, () => "Auf dieser Seite gibt es nichts rückgängig zu machen."],
  [/^The direction was already decided$/, () => "Über diese Richtung ist bereits entschieden."],
  [/^The page root cannot be deleted$/, () => "Die Wurzel einer Seite lässt sich nicht löschen."],
  [/^The page root cannot be moved$/, () => "Die Wurzel einer Seite lässt sich nicht verschieben."],
  [/^The page root cannot be wrapped$/, () => "Die Wurzel einer Seite lässt sich nicht umhüllen."],
  [/^Uploaded file is empty$/, () => "Die hochgeladene Datei ist leer."],
  [/^Upload URL is expired$/, () => "Der Upload-Link ist abgelaufen. Bitte die Datei erneut hochladen."],
  [/^Request body must be valid JSON$/, () => "Die Anfrage war kein gültiges JSON."],
  [/^Breakpoints must be an object with tablet and mobile\.$/, () => "Bitte beide Werte angeben: Tablet und Handy."],
  [/^Breakpoints tablet and mobile must be whole numbers of pixels\.$/, () => "Tablet und Handy brauchen ganze Pixelwerte, zum Beispiel 1024 und 640."],
  [/^The tablet breakpoint must lie between (\d+) and (\d+) px\.$/, (m) => `Der Tablet-Wert muss zwischen ${m[1]} und ${m[2]} Pixel liegen.`],
  [/^The mobile breakpoint must lie between (\d+) and (\d+) px\.$/, (m) => `Der Handy-Wert muss zwischen ${m[1]} und ${m[2]} Pixel liegen.`],
  [/^The tablet breakpoint must be at least (\d+) px larger than the mobile breakpoint\.$/, (m) => `Der Tablet-Wert muss mindestens ${m[1]} Pixel größer sein als der Handy-Wert.`],
  [/^Missing (.+)$/, (m) => `Es fehlt eine Angabe (${m[1]}).`],
];

// Übersetzt eine Engine-Meldung, wenn die Tabelle sie kennt; sonst null.

function translateEngineMessage(message) {
  for (const [pattern, build] of ENGINE_MESSAGES) {
    const match = pattern.exec(message);
    if (match) return build(match);
  }
  return null;
}

// Deutscher Vorspann für Meldungen, die die Tabelle nicht kennt: der
// technische Originaltext bleibt dahinter lesbar.

const STATUS_LEAD = {
  400: "Die Eingabe wurde abgelehnt",
  404: "Nicht gefunden",
  409: "Das kollidiert mit dem aktuellen Stand",
  422: "Das widerspricht einer Qualitätsregel",
};

export function friendlyError(error) {
  const status = Number(error?.status ?? 0);
  if (status === 429) return "Der Server ist gerade ausgelastet. Bitte in einen Moment erneut versuchen.";
  if (status === 401 || status === 403) return "Diese Aktion ist für die aktuelle Sitzung nicht freigegeben.";
  if (status >= 500) return "Der Server konnte die Anfrage nicht abschließen. Bitte erneut versuchen.";
  const message = String(error?.message ?? "Unbekannter Fehler");
  const translated = translateEngineMessage(message);
  if (translated) return translated;
  const lead = STATUS_LEAD[status];
  // Texte, die schon Deutsch sind (die Engine mischt beides), bleiben wie sie sind.
  const german = /[äöüÄÖÜß]|\b(der|die|das|nicht|keine|wurde|bitte)\b/i.test(message);
  return lead && !german ? `${lead}: ${message}` : message;
}

// Der englische Vorschlag der Engine gehört nur dazu, wenn die Meldung
// nicht schon als vollständiger deutscher Satz dasteht.

export function errorHint(error) {
  if (!error?.suggestion) return "";
  if (translateEngineMessage(String(error?.message ?? ""))) return "";
  return ` — ${error.suggestion}`;
}

export function failed(error) {
  toast(`${friendlyError(error)}${errorHint(error)}`, "error");
}

// In-app replacements for window.prompt / window.confirm. The native dialogs
// look like a browser warning, cannot be styled, block the page and read as
// "something went wrong" on a phone. These use the same <dialog class="modal">
// as the rest of the dashboard: a title, a labelled field, a button that says
// what it does. Enter confirms, Escape and a click on the backdrop cancel, the
// focus returns to where it was. Both return a promise:
//   askText    -> the entered text, or null when cancelled
//   askConfirm -> true / false
// No native `prompt()`/`confirm()` anywhere: `native-dialogs.test.ts` guards
// the threshold, `dialogs-browser.test.ts` drives them in a browser.

let dialogSequence = 0;

// Jeder Dialog bekommt eine eigene Nummer: zwei Dialoge mit derselben Nummer
// teilen sich ihre Kennung, und der zweite waere nicht mehr auffindbar.
export function nextDialogId(prefix) {
  return `${prefix}-${(dialogSequence += 1)}`;
}

function openAskDialog({
  title,
  message,
  label,
  value = "",
  multiline = false,
  required = false,
  requiredMessage = "Bitte etwas eingeben.",
  confirmLabel = "OK",
  cancelLabel = "Abbrechen",
  danger = false,
}) {
  return new Promise((resolve) => {
    const id = nextDialogId("ask-dialog");
    const previousFocus = document.activeElement;
    const wantsInput = label !== undefined;
    const input = wantsInput
      ? el(multiline ? "textarea" : "input", {
          id: `${id}-input`,
          ...(multiline ? { rows: "4" } : { type: "text", autocomplete: "off" }),
        })
      : null;
    if (input) input.value = value;
    const problem = el("p", { class: "ask-dialog__problem", role: "alert", hidden: "" });
    const cancelButton = el("button", {
      type: "button",
      class: "ghost",
      text: cancelLabel,
      onclick: () => dialog.close("cancel"),
    });
    // The only submit button: Enter in the field confirms, never cancels.
    const confirmButton = el("button", {
      type: "submit",
      value: "ok",
      class: danger ? "danger" : "primary",
      text: confirmLabel,
    });
    const form = el(
      "form",
      { method: "dialog" },
      el("h2", { id: `${id}-title`, text: title }),
      message === undefined ? null : el("p", { class: "muted", id: `${id}-message`, text: message }),
      input ? el("label", { class: "muted", for: input.id, text: label }) : null,
      input,
      problem,
      el("div", { class: "modal-actions" }, cancelButton, confirmButton),
    );
    const dialog = el(
      "dialog",
      {
        class: "modal ask-dialog",
        "aria-labelledby": `${id}-title`,
        ...(message === undefined ? {} : { "aria-describedby": `${id}-message` }),
        "data-role": "ask-dialog",
      },
      form,
    );
    form.addEventListener("submit", (event) => {
      if (required && input && input.value.trim() === "") {
        event.preventDefault();
        problem.textContent = requiredMessage;
        problem.hidden = false;
        input.setAttribute("aria-invalid", "true");
        input.focus();
      }
    });
    // A click on the backdrop lands on the <dialog> itself, never on the form.
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close("cancel");
    });
    dialog.addEventListener("close", () => {
      const confirmed = dialog.returnValue !== "cancel" && dialog.returnValue !== "";
      const answer = input ? (confirmed ? input.value.trim() : null) : confirmed;
      dialog.remove();
      if (previousFocus?.isConnected && typeof previousFocus.focus === "function") previousFocus.focus();
      resolve(answer);
    });
    document.body.append(dialog);
    dialog.showModal();
    if (input) {
      input.focus();
      input.select();
    } else {
      // A destructive question starts on "Abbrechen": Enter must not delete.
      (danger ? cancelButton : confirmButton).focus();
    }
  });
}

export const askText = (options) => openAskDialog(options);
export const askConfirm = (options) => openAskDialog({ ...options, label: undefined });

export function settingField(label, control, help) {
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
  // Der zugaengliche Name muss den sichtbaren Text als GANZES Wort enthalten
  // (WCAG 2.5.3, axe-Regel `label-content-name-mismatch`). "Dunkel" ist ein
  // Teil von "Dunkelmodus" und damit kein eigenes Wort - der Name beginnt
  // deshalb mit dem Wort, das der Schalter zeigt.
  themeToggle.setAttribute(
    "aria-label",
    dark ? "Hell: Dunkelmodus deaktivieren" : "Dunkel: Dunkelmodus aktivieren",
  );
  themeToggle.title = dark ? "Hell: Dunkelmodus deaktivieren" : "Dunkel: Dunkelmodus aktivieren";
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

export function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export function notificationStatus(status) {
  if (status === "sent") return "Gesendet";
  if (status === "failed") return "Fehlgeschlagen";
  return "Wartet";
}

export function formatBytes(value) {
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

export function initials(name) {
  return name.trim().slice(0, 2).toUpperCase();
}

// References (T14): a stored snapshot arrives as a served PNG. The preview
// path comes from the engine, the fallback reconstructs it from the storage
// ref (both use posix separators).

export function snapshotImageURL(referenceId, snapshot) {
  if (snapshot.previewPath) return snapshot.previewPath;
  const name = String(snapshot.storageRef).split("/").pop();
  return `/api/references/${referenceId}/snapshots/${name}`;
}

export function activeTab(tab) {
  for (const link of document.querySelectorAll(".tabs a")) {
    link.classList.toggle("active", link.dataset.tab === tab);
  }
  for (const link of document.querySelectorAll(".workspace-tabs a")) {
    link.classList.toggle("active", link.dataset.wtab === tab);
  }
}

// Stale-Render-Guard: jede Runde von renderRoute bekommt eine Nummer. Eine
// Ansicht holt sich beim Start (vor dem ersten await) ihren Stand mit
// routeScope() und übergibt ihn an render(). Wird sie erst fertig, nachdem schon
// eine neuere Navigation gestartet ist, schreibt sie nicht mehr über die Bühne:
// sonst überschreibt die langsame Antwort der alten Route die neue Ansicht.

let routeGeneration = 0;

// Jeder Routenwechsel erhaelt eine Nummer: eine Antwort, die zu einer
// aelteren Route gehoert, erkennt daran, dass sie nicht mehr aktuell ist.
export function nextRouteGeneration() {
  routeGeneration += 1;
  return routeGeneration;
}

export function currentRouteGeneration() {
  return routeGeneration;
}

export function routeScope() {
  const generation = currentRouteGeneration();
  return () => generation === routeGeneration;
}

// Liefert false, wenn die Ansicht veraltet ist und nichts geschrieben wurde.

export function render(nodes, current = () => true) {
  if (!current()) return false;
  view.replaceChildren(...nodes);
  return true;
}

/* Views */
