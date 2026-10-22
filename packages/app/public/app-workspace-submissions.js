// Der Workspace-Tab „Einsendungen": die Formulare einer Site, ihre
// Einsendungen und die Benachrichtigungs-Jobs dazu (P3-2, Schritt 47).
//
// Der Block stand als `else if`-Zweig in `projectView` und hing an drei
// Dingen der Datei: der ausgewaehlten Formular-Id (die dem Workspace gehoert
// und dort bleibt), dem Neuladen der Route und der Liste, an die das Markup
// gehaengt wird. Die ersten zwei kommen als Rueckruf herein, die Liste
// zurueck - dieselbe Naht wie bei den Referenz-Modulen.

import { api, el, failed, formatDate, notificationStatus, toast } from "./app-core.js";

/**
 * Baut den Inhalt des Tabs „Einsendungen".
 *
 * `ctx.getFormId()` und `ctx.setFormId()` lesen und schreiben die Auswahl,
 * die der Workspace haelt; `ctx.reload()` laedt die Route neu.
 */
export async function submissionsTab(siteId, ctx) {
  const teile = [];
  const { forms } = await api(`/api/sites/${siteId}/forms`);
  teile.push(el("h2", { text: "Einsendungen" }));
  if (forms.length === 0) {
    teile.push(
      el("div", {
        class: "empty",
        text: "Noch keine Formulare. Ein Formular wird beim Veröffentlichen eingefroren — danach erscheinen hier die Einsendungen.",
      }),
    );
  } else {
    if (
      ctx.getFormId() === null ||
      !forms.some((form) => form.formId === ctx.getFormId())
    ) {
      ctx.setFormId(forms[0].formId);
    }
    if (forms.length > 1) {
      const select = el("select", { id: "submissions-form" });
      for (const entry of forms) {
        const option = el("option", {
          value: entry.formId,
          text: `${entry.pagePath} · ${entry.sectionType}`,
        });
        if (entry.formId === ctx.getFormId()) option.selected = true;
        select.append(option);
      }
      select.addEventListener("change", () => {
        ctx.setFormId(select.value);
        void ctx.reload();
      });
      teile.push(
        el(
          "div",
          { class: "toolbar" },
          el("span", { class: "muted", text: "Formular" }),
          select,
        ),
      );
    }
    const form = forms.find((entry) => entry.formId === ctx.getFormId()) ?? forms[0];
    const view = await api(`/api/forms/${form.formId}/submissions`);
    teile.push(
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
      teile.push(el("div", { class: "empty", text: "Noch keine Einsendungen." }));
    } else {
      teile.push(
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
    teile.push(el("h3", { text: "Benachrichtigungen" }));
    if (jobs.length === 0) {
      teile.push(
        el("div", {
          class: "empty",
          text: "Keine Benachrichtigungs-Jobs zu diesem Formular.",
        }),
      );
    } else {
      teile.push(
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
                await ctx.reload();
              } catch (error) {
                failed(error);
              }
            },
          }),
        ),
      );
    }
  }
  return teile;
}
