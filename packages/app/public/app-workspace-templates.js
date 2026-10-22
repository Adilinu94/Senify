// Der Workspace-Tab „Vorlagen": Layout- und Entry-Vorlagen einer Site samt
// der Zuordnung, welche Seite welche Vorlage traegt (P3-2, Schritt 47).
//
// Der Block stand als `else if`-Zweig in `projectView`. Er brauchte von der
// Datei nur die Seitenliste (ein Argument) und das Neuladen der Route (ein
// Rueckruf); das Markup haengt er zurueck.

import { AUTHOR, api, el, failed, toast } from "./app-core.js";

/**
 * Baut den Inhalt des Tabs „Vorlagen".
 *
 * `pages` ist die Seitenliste der Site (sie kommt aus `projectView`),
 * `ctx.reload()` laedt die Route neu.
 */
export async function templatesTab(siteId, pages, ctx) {
  const teile = [];
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
      await ctx.reload();
    } catch (error) {
      failed(error);
    }
  };

  teile.push(el("h2", { text: "Vorlagen" }));
  if (layoutTemplates.length + entryTemplates.length === 0) {
    teile.push(
      el("div", {
        class: "empty",
        text: "Noch keine Vorlagen — markiere unten eine Seite als Layout- oder Entry-Vorlage.",
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

  teile.push(el("h2", { text: "Seiten & Layouts" }));
  if (plainPages.length === 0) {
    teile.push(el("div", { class: "empty", text: "Keine Seiten ohne Vorlage." }));
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
  return teile;
}
