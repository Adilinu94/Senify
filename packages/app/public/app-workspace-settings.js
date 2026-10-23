// Der Workspace-Tab „Einstellungen": die Projekteinstellungen (Kurzname,
// Niveau, öffentliche Adresse), die Breakpoints, die hinterlegten Referenzen
// und der Deploy (P3-2, Schritt 48).
//
// Der Block stand als `else if`-Zweig in `projectView` und war mit 211 Zeilen
// der größte Rest. Er braucht von der Datei drei Dinge: `site` (ein
// Argument), das Neuladen der Route und `breakpointsPanel` - das in
// `app-workspace.js` bleibt, weil der Tab „Seiten" es nicht braucht und ein
// Rueckimport einen Zyklus ergäbe. Also kommt es als Rueckruf herein.

import { AUTHOR, PROFILE_LABELS, api, el, failed, formatDate, toast } from "./app-core.js";

/**
 * Baut den Inhalt des Tabs „Einstellungen".
 *
 * `ctx.reload()` laedt die Route neu, `ctx.breakpointsPanel(siteId, site)`
 * liefert die Breakpoint-Steuerung.
 */
export async function settingsTab(siteId, site, ctx) {
  const teile = [];
  teile.push(
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
              await ctx.reload();
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
    ctx.breakpointsPanel(siteId, site),
  );
  const [referenceData, { references: allReferences }] = await Promise.all([
    api(`/api/sites/${siteId}/references`),
    api("/api/references"),
  ]);
  const nameById = new Map(allReferences.map((entry) => [entry.id, entry.name]));
  teile.push(
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
                            await ctx.reload();
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
      await ctx.reload();
    } catch (error) {
      failed(error);
    } finally {
      deployButton.disabled = false;
    }
  });
  teile.push(
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
  return teile;
}
