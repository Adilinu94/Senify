// Der Referenz-Block der Einstellungen (P3-2, Schritt 36): die Auswahl der
// Bibliothek, die Bildqualitaet, das Ziel der Analyse und der Schalter fuer die
// automatische Uebernahme. `app-projects.js` haengt ihn in die Einstellungen.
//
// `refsSettingsSection` gehoert fachlich zu den Einstellungen, lag aber in
// `app-references.js`, weil sie die Referenz-Einstellungen beschreibt. Sie hat
// keinen Zugriff auf den Zustand der Bibliothek und keine Abhaengigkeit in der
// Datei - deshalb steht sie fuer sich.

import { api, el, failed, toast } from "./app-core.js";
import { linesToList } from "./app-projects.js";
import { renderRoute } from "./app.js";

export function refsSettingsSection(settings) {
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
