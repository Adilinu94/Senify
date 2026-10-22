// Die Bausteinbibliothek und der Papierkorb (P3-2, Schritt 42). Beide Views
// standen in `app-projects.js`; sie teilen sich nichts mit den Projekten -
// keine Modulvariable, keinen Zustand, nur die Kern-Helfer.
//
// Sie liegen zusammen, weil sie dasselbe Fachgebiet bedienen: was nicht mehr
// in einem Projekt steht (die Bibliothek) und was nicht mehr in der Liste
// steht (der Papierkorb).

import { AUTHOR, activeTab, api, askConfirm, askText, el, failed, formatDate, render, routeScope, toast } from "./app-core.js";
import { renderRoute } from "./app.js";

export async function libraryView(componentId = null) {
  const current = routeScope();
  activeTab("library");
  const [{ components }, { sites }] = await Promise.all([
    api("/api/library-components"),
    api("/api/sites"),
  ]);
  const rawQuery = location.hash.split("?")[1] ?? "";
  const query = (rawQuery.startsWith("q=") ? decodeURIComponent(rawQuery.slice(2).replace(/\+/g, " ")) : "").toLowerCase();
  const visible = components.filter((component) =>
    `${component.name} ${component.tags.join(" ")} ${component.fingerprint}`.toLowerCase().includes(query),
  );
  const select = el("select", { "aria-label": "Zielprojekt" });
  select.append(el("option", { value: "", text: "Zielprojekt wählen …" }));
  for (const site of sites) select.append(el("option", { value: site.id, text: site.name }));
  const search = el("input", { type: "search", placeholder: "Bausteine durchsuchen …", "aria-label": "Bausteine durchsuchen" });
  search.value = query;
  search.addEventListener("input", () => {
    const suffix = search.value.trim() === "" ? "" : `?q=${encodeURIComponent(search.value.trim())}`;
    history.replaceState(null, "", `#/library${suffix}`);
    void libraryView();
  });
  const installFor = async (component, mode = "linked") => {
    if (select.value === "") {
      toast("Zuerst ein Zielprojekt wählen");
      return;
    }
    try {
      await api(`/api/sites/${select.value}/library-installs`, {
        method: "POST",
        body: { componentId: component.id, mode, author: AUTHOR },
      });
      toast(`„${component.name}“ installiert`);
      await libraryView(component.id);
    } catch (error) {
      failed(error);
    }
  };
  const list = visible.length === 0
    ? el("div", { class: "empty", text: "Noch keine Bausteine vorhanden." })
    : el(
        "div",
        { class: "library-grid" },
        visible.map((component) =>
          el(
            "article",
            { class: "library-card" },
            el(
              "a",
              { href: `#/library/${component.id}` },
              el("h2", { text: component.name }),
              el("p", { class: "muted", text: `${component.kind} · v${component.version} · ${component.fingerprint}` }),
              el("div", { class: "library-tags" }, component.tags.map((tag) => el("span", { text: tag }))),
            ),
            el(
              "div",
              { class: "library-card-actions" },
              el("button", { class: "primary", text: "Installieren", onclick: () => void installFor(component) }),
              el("a", { href: `#/library/${component.id}`, text: "Details" }),
            ),
          ),
        ),
      );
  const head = el("div", { class: "toolbar library-toolbar" },
    el("h1", { text: componentId ? "Baustein" : "Bausteine" }),
    el("div", { class: "spacer" }),
    componentId ? el("a", { href: "#/library", text: "← Bibliothek" }) : null,
    select);
  const body = [head, el("div", { class: "library-search" }, search)];
  if (componentId === null) {
    body.push(list);
  } else {
    const component = components.find((entry) => entry.id === componentId);
    if (component === undefined) {
      body.push(el("div", { class: "empty", text: "Baustein nicht gefunden." }));
    } else {
      const installs = [];
      for (const site of sites) {
        const { installs: entries } = await api(`/api/sites/${site.id}/library-installs`);
        const install = entries.find((entry) => entry.componentId === component.id);
        if (install === undefined) continue;
        installs.push(el("div", { class: "library-install" },
          el("strong", { text: site.name }),
          el("span", { class: "muted", text: `Pin v${install.installedVersion}` }),
          el("button", { text: "Aktualisieren", onclick: async () => {
            try {
              await api(`/api/sites/${site.id}/library-installs/${install.id}/update`, { method: "POST", body: { author: AUTHOR } });
              toast(`Installation in „${site.name}“ aktualisiert`);
              await libraryView(component.id);
            } catch (error) { failed(error); }
          } }),
          el("button", { class: "danger", text: "Detach", onclick: async () => {
            try {
              await api(`/api/sites/${site.id}/library-installs/${install.id}`, { method: "DELETE", body: { author: AUTHOR } });
              toast("Installation gelöst, lokale Definition behalten");
              await libraryView(component.id);
            } catch (error) { failed(error); }
          } })));
      }
      const definition = component.definition;
      const nodeRows = Object.values(definition?.nodes ?? {}).map((node) => el("tr", {},
        el("td", {}, el("code", { text: node.id })),
        el("td", { text: node.type }),
        el("td", { text: Object.entries(node.props ?? {}).map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join(" · ") })));
      body.push(el("div", { class: "library-detail" },
        el("h2", { text: component.name }),
        el("p", { class: "muted", text: component.notes || "Keine Notiz." }),
        el("div", { class: "library-meta" },
          el("span", { text: `Version ${component.version}` }),
          el("span", { text: `Fingerprint ${component.fingerprint}` }),
          el("span", { text: `Lizenz ${component.license.id} (${component.license.status})` }),
          el("span", { text: `Herkunft ${component.provenance.kind}` })),
        el("div", { class: "card-actions" },
          el("button", { class: "primary", text: "Installieren", onclick: () => void installFor(component) }),
          el("button", { text: "Notiz", onclick: async () => {
            const notes = await askText({
              title: "Notiz zur Komponente",
              label: "Notiz",
              value: component.notes ?? "",
              multiline: true,
              confirmLabel: "Speichern",
            });
            if (notes === null) return;
            try {
              await api(`/api/library-components/${component.id}`, { method: "PATCH", body: { notes, author: AUTHOR } });
              await libraryView(component.id);
            } catch (error) { failed(error); }
          } }),
          el("button", { text: component.deprecatedAt ? "Reaktivieren" : "Deprecate", onclick: async () => {
            try {
              await api(`/api/library-components/${component.id}`, { method: "PATCH", body: { deprecated: component.deprecatedAt === null, author: AUTHOR } });
              await libraryView(component.id);
            } catch (error) { failed(error); }
          } })),
        el("h3", { text: "Struktur" }),
        el("table", {}, el("thead", {}, el("tr", {}, el("th", { text: "ID" }), el("th", { text: "Typ" }), el("th", { text: "Props" }))), el("tbody", {}, nodeRows)),
        el("h3", { text: "Installationen" }),
        installs.length === 0 ? el("div", { class: "empty", text: "Noch in keinem Projekt installiert." }) : el("div", { class: "stack" }, installs)));
    }
  }
  render(body, current);
}

export async function trashView() {
  const current = routeScope();
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
                        const sure = await askConfirm({
                          title: "Endgültig löschen?",
                          message: `„${site.name}“ endgültig löschen? Das kann nicht rückgängig gemacht werden.`,
                          confirmLabel: "Endgültig löschen",
                          danger: true,
                        });
                        if (!sure) return;
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
  ], current);
}
