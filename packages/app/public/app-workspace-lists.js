// Die Listen-Tabs des Projekt-Workspace: Seiten, Pruefen und Aktivitaet
// (P3-2, Schritt 49).
//
// Die drei standen als `if`/`else if`-Zweige in `projectView`. Sie haben
// dieselbe Form - eine Ueberschrift, dann eine Tabelle oder ein leerer
// Zustand -, und sie brauchen von der Datei nur eins: `openNewPageDialog`
// im Seiten-Zweig. Das kommt als Rueckruf herein, das Markup geht zurueck.

import { MUTATION_LABELS, api, el, formatDate } from "./app-core.js";
import { reviewPanel } from "./app-review.js";

/**
 * Baut den Inhalt der Listen-Tabs.
 *
 * `pages` ist die Seitenliste der Site, `ctx.openNewPageDialog(siteId)`
 * oeffnet den Dialog fuer eine neue Seite.
 */
export async function workspaceListTab(siteId, tab, pages, ctx) {
  const teile = [];
if (tab === "pages") {
  teile.push(
    el(
      "div",
      { class: "toolbar" },
      el("h2", { text: "Seiten", style: "margin: 0" }),
      el("div", { class: "spacer" }),
      el("button", {
        class: "primary",
        text: "Neue Seite",
        "data-action": "new-page",
        onclick: () => void ctx.openNewPageDialog(siteId),
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
  teile.push(
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
  teile.push(
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
}
  return teile;
}
