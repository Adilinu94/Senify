// Der Import aus Framer und die Redesign-Dialoge. Die Bloecke standen in `app.js` und
// sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt
// ESLint.

import { api, el, toast } from "./app-core.js";
import { waitForImageJob } from "./app-editor.js";
import { refsBindBackdropClose, refsFold } from "./app-references.js";

export function importReportBlock(report) {
  const counts = report?.counts ?? {};
  const assets = report?.assets ?? {};
  const declarations = report?.declarations ?? {};
  const motion = report?.motion ?? { measured: 0, mappedToPreset: 0, documented: 0 };
  const findings = report?.findings ?? [];
  const resolutions = report?.resolutions ?? [];
  const candidates = report?.candidates ?? [];
  const marquee = report?.marqueeCandidates ?? [];
  const findingItems = findings.length > 0
    ? el(
        "ul",
        { class: "framer-report-list" },
        findings.map((finding) =>
          el(
            "li",
            {},
            el("span", { class: "tag", text: finding.severity ?? "info" }),
            ` ${finding.kind}: ${finding.message}`,
            el("p", { class: "muted", text: finding.evidence ?? "" }),
            finding.suggestion ? el("p", { class: "muted", text: finding.suggestion }) : "",
          ),
        ),
      )
    : el("p", { class: "muted", text: "Keine Funde." });
  const resolutionItems = resolutions.length > 0
    ? el(
        "ul",
        { class: "framer-report-list" },
        resolutions.map((resolution) =>
          el(
            "li",
            {},
            el("span", { class: "tag", text: resolution.kind }),
            ` ${resolution.nodeKey}: ${resolution.reason}`,
            el("p", { class: "muted", text: resolution.evidence ?? "" }),
          ),
        ),
      )
    : el("p", { class: "muted", text: "Keine Klasse-C-Fälle." });
  const candidateItems = candidates.length > 0
    ? el(
        "ul",
        { class: "framer-report-list" },
        candidates.map((candidate) =>
          el(
            "li",
            {},
            el("strong", { text: candidate.label }),
            ` · ${candidate.occurrences.length} Vorkommen · ${candidate.kind}`,
            el("p", { class: "muted", text: `Fingerprint: ${candidate.fingerprint}` }),
            el("p", { class: "muted", text: candidate.reason }),
          ),
        ),
      )
    : el("p", { class: "muted", text: "Keine wiederholten Strukturen erkannt." });
  const marqueeItems = marquee.length > 0
    ? el(
        "ul",
        { class: "framer-report-list" },
        marquee.map((candidate) =>
          el("li", {}, `${candidate.preset}: ${candidate.reason}`),
        ),
      )
    : el("p", { class: "muted", text: "Keine Marquee-Kandidaten." });
  return el(
    "div",
    { class: "framer-report" },
    el("h3", { text: "Import-Bericht" }),
    report?.existingPage
      ? el("p", {
          class: "framer-report-warning",
          "data-role": "framer-existing-page",
          text: `Unter diesem Pfad liegt bereits „${report.existingPage.title}". Übernehmen ersetzt ihren gesamten Inhalt, auch spätere Änderungen im Editor.`,
        })
      : "",
    el(
      "p",
      { class: "framer-report-summary" },
      `Score ${report?.score ?? 0}/100 · ${counts.mapped ?? 0}/${counts.nodes ?? 0} Knoten · ${counts.placeholders ?? 0} Platzhalter`,
    ),
    el(
      "p",
      { class: "muted" },
      `Deklarationen: ${declarations.carried ?? 0}/${declarations.total ?? 0} übernommen, ${declarations.dropped ?? 0} verworfen. Assets: ${assets.downloaded ?? 0} geladen, ${assets.deduped ?? 0} dedupliziert, ${assets.failed ?? 0} fehlgeschlagen. Fonts: ${assets.fonts ?? 0}. Motion: ${motion.mappedToPreset}/${motion.measured} Presets, ${motion.documented} dokumentiert.`,
    ),
    refsFold(`Funde (${findings.length})`, findingItems, findings.length > 0),
    refsFold("Klasse-C", resolutionItems, resolutions.length > 0),
    refsFold(`Baustein-Kandidaten (${candidates.length})`, candidateItems, candidates.length > 0),
    refsFold(`Marquee-Kandidaten (${marquee.length})`, marqueeItems, marquee.length > 0),
    refsFold("Schritte", el("ol", {}, (report?.steps ?? []).map((step) => el("li", { text: step })))),
  );
}

export function openFramerImportDialog({ siteId, pageId, session, onImported }) {
  const dialog = el("dialog", { class: "refs-dialog framer-import-dialog", "data-role": "framer-import-dialog" });
  const sourceSelect = el("select", { class: "refs-input", "data-role": "framer-source-mode" });
  sourceSelect.append(
    el("option", { value: "url", text: "Framer-URL" }),
    el("option", { value: "html", text: "HTML-Datei" }),
    el("option", { value: "mirror", text: "Lokaler Mirror" }),
  );
  const sourceInput = el("input", { class: "refs-input", type: "url", "data-role": "framer-source-input", placeholder: "https://…" });
  const fileInput = el("input", { class: "refs-input", type: "file", accept: ".html,text/html" });
  // A scraped mirror writes its own links and media as absolute URLs: only with
  // the address of the original site can the import tell them from other sites.
  const baseUrlInput = el("input", {
    class: "refs-input",
    type: "url",
    "data-role": "framer-base-url",
    placeholder: "Adresse der Originalseite, z. B. https://beispiel.de (optional)",
  });
  const mirrorBase = () => (baseUrlInput.value.trim() === "" ? {} : { baseUrl: baseUrlInput.value.trim() });
  const pagePathInput = el("input", { class: "refs-input", type: "text", value: "/", placeholder: "/landingpage" });
  const targetSelect = el("select", { class: "refs-input", "data-role": "framer-target" });
  targetSelect.append(
    el("option", { value: "new", text: "Neue Seite" }),
    el("option", { value: "current", text: "Aktuelle Seite ersetzen" }),
  );
  const assetsSelect = el("select", { class: "refs-input" });
  assetsSelect.append(
    el("option", { value: "upload", text: "Hochladen" }),
    el("option", { value: "skip", text: "Überspringen" }),
  );
  const fontsSelect = el("select", { class: "refs-input" });
  fontsSelect.append(
    el("option", { value: "rewrite", text: "Lokal umschreiben" }),
    el("option", { value: "skip", text: "CDN beibehalten" }),
  );
  const modeSelect = el("select", { class: "refs-input", "data-role": "framer-mode" });
  modeSelect.append(
    el("option", { value: "fidelity", text: "Originalgetreu (Verläufe, Schatten, Rundungen bleiben)" }),
    el("option", { value: "dna", text: "Design-DNA (verbotene Stilmittel werden umgeschrieben)" }),
  );
  const themeCheck = el("input", { type: "checkbox" });
  // Importing onto a path that already holds a page replaces its content. The
  // analysis names that page; applying needs this explicit confirmation.
  const replaceCheck = el("input", { type: "checkbox", "data-role": "framer-confirm-replace" });
  const replaceRow = el("label", { class: "inline framer-confirm-replace", hidden: true }, replaceCheck, " Vorhandene Seite ersetzen");
  const syncApply = () => {
    apply.disabled = report === null || (report.existingPage !== undefined && !replaceCheck.checked);
  };
  replaceCheck.addEventListener("change", syncApply);
  // The other pages of the site the analysed page links to. Importing them is
  // opt-in; each one is analysed and written on its own (own hash, own guard).
  const sitePagesHost = el("div", { class: "framer-site-pages", "data-role": "framer-site-pages", hidden: true });
  const siteReplaceCheck = el("input", { type: "checkbox", "data-role": "framer-site-replace" });
  let sitePageChecks = [];
  const renderSitePages = () => {
    sitePageChecks = [];
    const pages = report?.discoveredPages ?? [];
    const canImportMore = pages.length > 0 && sourceSelect.value !== "html" && targetSelect.value !== "current";
    sitePagesHost.hidden = !canImportMore;
    if (!canImportMore) {
      sitePagesHost.replaceChildren();
      return;
    }
    const all = el("input", { type: "checkbox", "data-role": "framer-site-all" });
    all.addEventListener("change", () => sitePageChecks.forEach((entry) => { entry.input.checked = all.checked; }));
    const list = el("ul", { class: "framer-site-list" });
    for (const path of pages) {
      const input = el("input", { type: "checkbox", value: path, "data-role": "framer-site-page" });
      sitePageChecks.push({ path, input });
      list.append(el("li", {}, el("label", { class: "inline" }, input, ` ${path}`)));
    }
    sitePagesHost.replaceChildren(
      el("h3", { text: `Weitere Seiten dieser Site (${pages.length})` }),
      el("p", { class: "muted", text: "Jede Seite wird für sich analysiert und unter ihrem eigenen Pfad angelegt." }),
      el("label", { class: "inline" }, all, " Alle auswählen"),
      list,
      el("label", { class: "inline" }, siteReplaceCheck, " Vorhandene Seiten unter diesen Pfaden ersetzen"),
    );
  };
  const sourceForPath = (path) =>
    sourceSelect.value === "url"
      ? { url: new URL(path, sourceInput.value.trim()).href }
      : { rootDir: sourceInput.value.trim(), page: path, ...mirrorBase() };
  const importSitePages = async () => {
    const results = [];
    for (const { path, input } of sitePageChecks) {
      if (!input.checked) continue;
      const base = {
        source: sourceForPath(path),
        pagePath: path,
        assets: assetsSelect.value,
        fonts: fontsSelect.value,
        applyTheme: false,
        mode: modeSelect.value,
      };
      try {
        const dry = await api(`/api/sites/${siteId}/imports/framer`, {
          method: "POST",
          body: { ...base, write: false, idempotencyKey: window.crypto.randomUUID() },
        });
        const existing = dry.report.existingPage;
        if (existing !== undefined && !siteReplaceCheck.checked) {
          results.push({ path, state: "übersprungen", detail: "Unter diesem Pfad liegt schon eine Seite." });
          continue;
        }
        const written = await api(`/api/sites/${siteId}/imports/framer`, {
          method: "POST",
          body: {
            ...base,
            write: true,
            expectedIrHash: dry.report.irHash,
            ...(existing === undefined ? {} : { baseDraftVersion: existing.draftVersion }),
            idempotencyKey: window.crypto.randomUUID(),
          },
        });
        // A replaced page keeps its old draft as a revision: the way back.
        // The same content again is a no-op (the receipt of the first write
        // answers): nothing was written, so there is nothing to undo.
        results.push({
          path,
          state: written.report.replayed === true ? "unverändert" : "importiert",
          detail: written.report.replayed === true ? "Gleicher Inhalt wie beim letzten Import." : "",
          ...(written.report.replacedRevisionId === undefined
            ? {}
            : { pageId: written.report.pageId, revisionId: written.report.replacedRevisionId }),
        });
      } catch (error) {
        results.push({ path, state: "Fehler", detail: error.message });
      }
    }
    return results;
  };
  // The preview: the source and the import side by side at the three widths.
  // Needs a browser on the server, so it is asked for, never run by itself.
  const previewHost = el("div", { class: "framer-preview", "data-role": "framer-preview", hidden: true });
  const previewButton = el("button", { type: "button", class: "refs-button", text: "Vorschau", "data-action": "framer-import-preview", disabled: true });
  const showPreview = async () => {
    previewButton.disabled = true;
    previewButton.textContent = "Vorschau wird erstellt …";
    errorEl.textContent = "";
    try {
      const { source, pagePath, mode } = await bodyFor(false);
      const result = await api(`/api/sites/${siteId}/imports/framer/preview`, {
        method: "POST",
        body: { source, pagePath, mode },
      });
      const rows = result.shots.map((shot) =>
        el(
          "div",
          { class: "framer-preview-row", "data-breakpoint": shot.breakpoint },
          el("p", { class: "muted", text: `${shot.breakpoint} · ${shot.width} px · Höhe ${shot.beforeHeight} → ${shot.afterHeight} px` }),
          el(
            "div",
            { class: "framer-preview-pair" },
            el("figure", {}, el("img", { src: shot.before, alt: `Original bei ${shot.width} px` }), el("figcaption", { text: "Original" })),
            el("figure", {}, el("img", { src: shot.after, alt: `Import bei ${shot.width} px` }), el("figcaption", { text: "Import" })),
          ),
        ),
      );
      previewHost.hidden = false;
      previewHost.replaceChildren(
        el("h3", { text: "Vorschau" }),
        el("p", { class: "muted", text: "Oben die Seite, wie sie ist; daneben das Ergebnis des Imports. Bilder und Schriften der Quelle können hier fehlen, wenn sie nur online erreichbar sind." }),
        ...rows,
      );
    } catch (error) {
      errorEl.textContent = error.message;
    } finally {
      previewButton.disabled = false;
      previewButton.textContent = "Vorschau";
    }
  };
  previewButton.addEventListener("click", showPreview);
  const errorEl = el("p", { class: "refs-form-error", role: "alert" });
  const reportHost = el("div", { class: "framer-import-report-host", "data-role": "framer-import-report" });
  let report = null;
  const analyze = el("button", { type: "submit", class: "refs-button primary", text: "Analysieren" });
  const apply = el("button", {
    type: "button",
    class: "refs-button primary",
    text: "Übernehmen",
    "data-action": "framer-import-apply",
  });
  apply.disabled = true;

  const syncSource = () => {
    const value = sourceSelect.value;
    sourceInput.hidden = value !== "url" && value !== "mirror";
    sourceInput.type = value === "mirror" ? "text" : "url";
    sourceInput.placeholder = value === "mirror" ? "C:\\Pfad\\zum\\Mirror" : "https://…";
    fileInput.hidden = value !== "html";
    baseUrlInput.hidden = value !== "mirror";
  };
  sourceSelect.addEventListener("change", syncSource);
  syncSource();

  const sourceValue = async () => {
    if (sourceSelect.value === "html") {
      const file = fileInput.files?.[0];
      if (!file) throw new Error("Bitte eine HTML-Datei wählen.");
      return { html: await file.text() };
    }
    const value = sourceInput.value.trim();
    if (value === "") throw new Error("Bitte eine Importquelle angeben.");
    return sourceSelect.value === "url" ? { url: value } : { rootDir: value, ...mirrorBase() };
  };
  const bodyFor = async (write) => ({
    source: await sourceValue(),
    ...(pagePathInput.value.trim() === "" ? {} : { pagePath: pagePathInput.value.trim() }),
    ...(targetSelect.value === "current"
      ? { pageId, baseDraftVersion: session.version }
      : {}),
    assets: assetsSelect.value,
    fonts: fontsSelect.value,
    applyTheme: themeCheck.checked,
    mode: modeSelect.value,
    // The write must be the thing that was analysed: same source hash, and the
    // page it replaces still at the version the analysis saw.
    ...(write && report !== null
      ? {
          expectedIrHash: report.irHash,
          ...(targetSelect.value !== "current" && report.existingPage !== undefined
            ? { baseDraftVersion: report.existingPage.draftVersion }
            : {}),
        }
      : {}),
    write,
    idempotencyKey: window.crypto.randomUUID(),
  });
  const submit = async (event) => {
    event.preventDefault();
    analyze.disabled = true;
    errorEl.textContent = "";
    analyze.textContent = "Analysiere …";
    try {
      const result = await api(`/api/sites/${siteId}/imports/framer`, {
        method: "POST",
        body: await bodyFor(false),
      });
      report = result.report;
      reportHost.replaceChildren(importReportBlock(report));
      replaceCheck.checked = false;
      replaceRow.hidden = report.existingPage === undefined;
      renderSitePages();
      previewHost.hidden = true;
      previewHost.replaceChildren();
      previewButton.disabled = false;
      syncApply();
    } catch (error) {
      errorEl.textContent = error.message;
    } finally {
      analyze.disabled = false;
      analyze.textContent = "Neu analysieren";
    }
  };
  apply.addEventListener("click", async () => {
    if (report === null) return;
    apply.disabled = true;
    analyze.disabled = true;
    errorEl.textContent = "";
    apply.textContent = "Importiere …";
    try {
      await session.flush();
      const wantsMore = sitePageChecks.some((entry) => entry.input.checked);
      const result = await api(`/api/sites/${siteId}/imports/framer`, {
        method: "POST",
        body: await bodyFor(true),
      });
      // A page the import replaced stays reachable: its old draft is a revision,
      // and the way back is offered here, before the dialog closes.
      const replacedRevisionId = result.report.replacedRevisionId;
      if (!wantsMore && replacedRevisionId === undefined) {
        dialog.close();
        onImported(result.report);
        return;
      }
      let results = [];
      if (wantsMore) {
        // The first page is written; the others follow one by one and the
        // dialog stays open to say what happened to each.
        apply.textContent = "Importiere weitere Seiten …";
        results = await importSitePages();
      }
      const summary = [];
      if (replacedRevisionId !== undefined) {
        summary.push(
          el("h3", { text: "Seite ersetzt" }),
          el("p", { class: "muted", text: "Der vorherige Inhalt der Seite ist als Version „Vor dem Framer-Import“ gesichert." }),
        );
      }
      if (results.length > 0) {
        summary.push(
          el("h3", { text: "Ergebnis der weiteren Seiten" }),
          el(
            "ul",
            { class: "framer-site-list", "data-role": "framer-site-results" },
            results.map((entry) => {
              const row = el("li", { "data-state": entry.state }, el("strong", { text: entry.path }), ` · ${entry.state}`, entry.detail === "" ? "" : el("span", { class: "muted", text: ` – ${entry.detail}` }));
              if (entry.revisionId !== undefined) {
                const back = el("button", { type: "button", class: "refs-button", text: "Rückgängig", "data-action": "framer-site-undo", "data-path": entry.path });
                back.addEventListener("click", async () => {
                  back.disabled = true;
                  errorEl.textContent = "";
                  try {
                    await api(`/api/pages/${entry.pageId}/restore`, { method: "POST", body: { revisionId: entry.revisionId } });
                    back.textContent = "Rückgängig gemacht";
                  } catch (error) {
                    errorEl.textContent = error.message;
                    back.disabled = false;
                  }
                });
                row.append(" ", back);
              }
              return row;
            }),
          ),
        );
      }
      sitePagesHost.hidden = false;
      sitePagesHost.replaceChildren(...summary);
      const close = el("button", { type: "button", class: "refs-button primary", text: "Schließen", "data-action": "framer-import-close" });
      close.addEventListener("click", () => {
        dialog.close();
        onImported(result.report);
      });
      const actions = [close];
      if (replacedRevisionId !== undefined) {
        const undo = el("button", { type: "button", class: "refs-button", text: "Import rückgängig machen", "data-action": "framer-import-undo" });
        undo.addEventListener("click", async () => {
          undo.disabled = true;
          errorEl.textContent = "";
          try {
            await api(`/api/pages/${result.report.pageId}/restore`, { method: "POST", body: { revisionId: replacedRevisionId } });
            undo.textContent = "Rückgängig gemacht";
          } catch (error) {
            errorEl.textContent = error.message;
            undo.disabled = false;
          }
        });
        actions.unshift(undo);
      }
      apply.replaceWith(...actions);
    } catch (error) {
      errorEl.textContent = error.message;
      apply.disabled = false;
    } finally {
      analyze.disabled = false;
      apply.textContent = "Übernehmen";
    }
  });
  const form = el(
    "form",
    { class: "framer-import-form", onsubmit: submit },
    el("h2", { text: "Framer-Seite importieren" }),
    el("label", {}, "Quelle", sourceSelect),
    sourceInput,
    baseUrlInput,
    fileInput,
    el("label", {}, "Ziel", targetSelect),
    el("label", {}, "Seitenpfad", pagePathInput),
    el("div", { class: "inline" }, el("label", {}, "Assets", assetsSelect), el("label", {}, "Fonts", fontsSelect)),
    el("label", {}, "Modus", modeSelect),
    el("label", { class: "inline" }, themeCheck, " Theme-Fonts übernehmen"),
    replaceRow,
    sitePagesHost,
    previewHost,
    el("div", { class: "framer-import-actions" }, analyze, previewButton, apply),
    errorEl,
  );
  dialog.append(form, reportHost);
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  sourceInput.focus();
}

// How a media need is presented. The wording stays short so a card with six
// needs stays readable.

function mediaLabel(treatment) {
  if (treatment === "reuse") return "wiederverwenden";
  if (treatment === "select") return "auswählen";
  if (treatment === "upload") return "hochladen";
  if (treatment === "generate") return "erzeugen";
  if (treatment === "avoid") return "vermeiden";
  return "manuell";
}

// The human direction step of a redesign (ADR-0012). The agent proposed the
// cards; this is where a person actually chooses one. Nothing is preselected:
// a click on a card only selects, the confirm button creates the draft.

export function openRedesignDirectionDialog(proposal) {
  const cards = Array.isArray(proposal.cards) ? proposal.cards : [];
  const errorEl = el("p", { class: "redesign-dialog__error", "data-role": "redesign-error", role: "alert" });
  const confirmButton = el("button", {
    type: "button",
    class: "redesign-dialog__button primary",
    "data-action": "redesign-confirm",
    text: "Richtung als Draft übernehmen",
  });
  confirmButton.disabled = true;

  const grid = el("fieldset", { class: "redesign-direction-grid" });
  grid.append(el("legend", { class: "redesign-direction-legend", text: "Welche Richtung?" }));

  let chosen = null;
  const select = (directionId) => {
    chosen = directionId;
    for (const input of grid.querySelectorAll('input[type="radio"]')) {
      input.checked = input.value === directionId;
    }
    confirmButton.disabled = false;
    errorEl.textContent = "";
  };

  for (const card of cards) {
    const specimen = card.theme?.specimen ?? {};
    const image = el("img", {
      class: "redesign-direction-shot",
      src: `/api/redesign-proposals/${encodeURIComponent(proposal.id)}/cards/${encodeURIComponent(card.id)}/screenshot`,
      alt: card.screenshot?.alt ?? `Vorschau ${card.reference?.name ?? ""}`,
      loading: "lazy",
    });
    const swatches = el("div", { class: "redesign-specimen-swatches" });
    for (const [name, value] of [
      ["Marke", specimen.brand],
      ["Neutral", specimen.neutralBase],
    ]) {
      if (typeof value !== "string" || value === "") continue;
      swatches.append(
        el("span", { class: "redesign-specimen-swatch", "data-role": name.toLowerCase() }, [
          el("i", { style: `background:${value}` }),
          el("span", { text: `${name}: ${value}` }),
        ]),
      );
    }
    const rules = el("div", { class: "redesign-direction-rules" });
    for (const [label, values] of [
      ["Grundsätze", card.rules?.constants],
      ["Nicht übernehmen", card.rules?.never],
    ]) {
      const list = Array.isArray(values) ? values.filter((entry) => String(entry).trim() !== "") : [];
      if (list.length === 0) continue;
      rules.append(
        el("p", { class: "redesign-direction-rules-line" }, [
          el("strong", { text: `${label}: ` }),
          el("span", { text: list.slice(0, 4).join(" · ") }),
        ]),
      );
    }
    const warnings = el("div", { class: "redesign-direction-warnings", "data-role": "redesign-warnings" });
    for (const warning of Array.isArray(card.warnings) ? card.warnings : []) {
      warnings.append(el("p", { text: String(warning) }));
    }
    const fonts = el("p", {
      class: "redesign-direction-fonts",
      text: `${specimen.displayFont ?? ""} / ${specimen.bodyFont ?? ""}`,
    });
    // ADR-0013: what this direction does to the page's own sections and which
    // media it needs. The build scope is the agent's binding work order.
    const plan = card.sectionPlan ?? null;
    const summary = plan?.summary ?? {};
    const scope = el("div", { class: "redesign-build-scope", "data-role": "redesign-build-scope" });
    if (plan === null) {
      scope.append(
        el("p", { class: "redesign-direction-warnings", text: "Für diese Richtung liegt kein Sektions-Plan vor." }),
      );
    } else {
      scope.append(
        el("p", { class: "redesign-scope-summary" }, [
          el("strong", { text: "Bauumfang: " }),
          el("span", {
            "data-role": "redesign-scope-counts",
            text: `${summary.exact ?? 0} exakt · ${summary.fallback ?? 0} Vorgabe · ${summary.manual ?? 0} manuell`,
          }),
        ]),
      );
      const entryList = el("ul", { class: "redesign-scope-list" });
      for (const entry of (plan.entries ?? []).slice(0, 8)) {
        const target = entry.target?.type ?? entry.source?.type ?? "—";
        const variant = entry.target?.variant ? ` / ${entry.target.variant}` : "";
        entryList.append(
          el("li", {
            class: "redesign-scope-entry",
            "data-role": "redesign-section-entry",
            "data-status": entry.status ?? "manual",
          }, [
            el("span", { text: `${target}${variant}` }),
            el("span", { class: "redesign-scope-status", text: entry.status ?? "manual" }),
          ]),
        );
      }
      if ((plan.entries ?? []).length > 8) {
        entryList.append(
          el("li", { class: "redesign-scope-more", text: `+ ${plan.entries.length - 8} weitere` }),
        );
      }
      if (entryList.childElementCount > 0) scope.append(entryList);

      const mediaList = el("ul", { class: "redesign-media-list" });
      for (const need of (plan.media ?? []).slice(0, 6)) {
        mediaList.append(
          el("li", {
            class: "redesign-media-need",
            "data-role": "redesign-media-need",
            "data-treatment": need.treatment ?? "manual",
          }, [
            el("span", { class: "redesign-media-treatment", text: mediaLabel(need.treatment) }),
            el("span", { class: "redesign-media-reason", text: need.reason ?? "" }),
          ]),
        );
      }
      if (mediaList.childElementCount > 0) {
        scope.append(
          el("p", { class: "redesign-scope-subtitle", text: "Medienbedarf" }),
          mediaList,
        );
      }
    }
    const radio = el("input", {
      type: "radio",
      name: "redesign-direction",
      value: card.id,
    });
    radio.addEventListener("change", () => select(card.id));
    grid.append(
      el(
        "label",
        { class: "redesign-direction-card", "data-direction-card": card.id },
        [image, el("h3", { text: card.reference?.name ?? "Richtung" }), radio, swatches, fonts, rules, scope, warnings],
      ),
    );
  }

  const staleNote = proposal.freshness?.current === false
    ? el("p", { class: "redesign-dialog__stale", "data-role": "redesign-stale" }, [
        el("strong", { text: "Plan veraltet. " }),
        el("span", { text: (proposal.freshness.reasons ?? []).join(" ") }),
      ])
    : null;

  const dialog = el(
    "dialog",
    {
      class: "redesign-dialog",
      "data-role": "redesign-dialog",
      "aria-labelledby": "redesign-direction-title",
    },
    el("div", { class: "redesign-dialog__head" }, [
      el("p", { class: "redesign-dialog__eyebrow", text: "Agentenvorschlag" }),
      el("h2", { id: "redesign-direction-title", text: `Richtung für „${proposal.source?.title ?? "diese Seite"}“ wählen` }),
      el("p", {
        class: "redesign-dialog__hint",
        "data-role": "redesign-readonly-note",
        text: "Originalseite und veröffentlichtes Release bleiben unverändert. Es entsteht eine neue Draft-Seite.",
      }),
      el("p", {
        class: "redesign-dialog__hint",
        "data-role": "redesign-apply-scope",
        text: "Bestätigt werden Theme und Draft-Grundstruktur. Der Sektions-Plan ist die verbindliche Arbeitsgrundlage für den Agenten.",
      }),
    ]),
    staleNote,
    grid,
    el("div", { class: "redesign-dialog__actions" }, [
      errorEl,
      el("button", {
        type: "button",
        class: "redesign-dialog__button",
        "data-action": "redesign-cancel",
        text: "Abbrechen",
        onclick: () => dialog.close(),
      }),
      confirmButton,
    ]),
  );
  if (staleNote !== null) confirmButton.disabled = true;

  confirmButton.addEventListener("click", async () => {
    if (chosen === null) return;
    confirmButton.disabled = true;
    for (const input of grid.querySelectorAll('input[type="radio"]')) input.disabled = true;
    errorEl.textContent = "";
    confirmButton.textContent = "Wird angewendet …";
    try {
      const result = await api(`/api/redesign-proposals/${encodeURIComponent(proposal.id)}/confirm`, {
        method: "POST",
        body: { directionId: chosen, idempotencyKey: window.crypto.randomUUID() },
      });
      const applied = result.proposal?.applyResult;
      if (result.proposal?.status === "failed") {
        throw new Error(applied?.error?.message ?? "Die Richtung konnte nicht angewendet werden.");
      }
      const siteId = applied?.siteId;
      const pageId = applied?.pageId;
      // P2-2: ein Apply, der Medienbedarfe offen laesst, ist nicht fertig. Der
      // Dialog bleibt offen und zeigt die Bedarfe - der Mensch schliesst sie hier
      // ab, statt sie in einem Toast zu verlieren. Erst ohne offene Bedarfe geht
      // es weiter zur Draft-Seite.
      const openNeeds = Array.isArray(applied?.openMediaNeeds) ? applied.openMediaNeeds : [];
      if (openNeeds.length > 0) {
        dialog.close();
        openMediaNeedPanel({
          proposalId: proposal.id,
          siteId,
          pageId,
          needs: openNeeds,
          onDone: (remaining) => {
            if (remaining === 0) {
              location.hash = `#/projects/${siteId}/pages/${pageId}`;
            } else {
              toast(
                `${remaining} Medienbedarf${remaining === 1 ? "" : "e"} bleiben offen.`,
                "info",
              );
            }
          },
        });
        return;
      }
      dialog.close();
      if (typeof siteId === "string" && typeof pageId === "string") {
        location.hash = `#/projects/${siteId}/pages/${pageId}`;
      } else {
        toast("Richtung bestätigt.", "info");
      }
    } catch (error) {
      // A stale plan keeps the dialog open: the operator has to plan again.
      errorEl.textContent = error?.message ?? "Die Richtung konnte nicht angewendet werden.";
      confirmButton.textContent = "Richtung als Draft übernehmen";
      for (const input of grid.querySelectorAll('input[type="radio"]')) input.disabled = false;
      if (error?.status === 409) confirmButton.disabled = true;
    }
  });

  document.body.append(dialog);
  dialog.addEventListener("close", () => {
    dialog.remove();
    document.querySelector('[data-action="redesign-inbox-open"]')?.focus();
  });
  refsBindBackdropClose(dialog);
  dialog.showModal();
}

// P2-2: die Bedienung der offenen Medienbedarfe. Das Apply hat die Seite gebaut,
// aber ein Bild fehlt noch - und genau hier wird das entschieden, nicht in einem
// Toast, den niemand liest.
//
// Je Bedarf stehen vier Wege offen, und jeder beantwortet dieselbe Frage anders:
//   - `select`   ein vorhandenes Asset der Zielsite waehlen (die Bibliothek des
//                Releases, nicht die der Quelle)
//   - `upload`   eine Datei aus dem Rechner hochladen
//   - `generate` den mitgelieferten Prompt an die Provider-Kette geben
//   - `manual`   bewusst offen lassen: der Slot bleibt leer, der Bedarf gilt als
//                entschieden, und das wird auch so protokolliert
//
// Die Schluesselung laeuft in EINEM Aufruf: eine Bedarf-Id, die der Server nicht
// kennt, ist ein Fehler und kein stiller Fortschritt. `onDone` bekommt die Zahl
// derer, die wirklich noch offen sind - nicht die Zahl vor dem Schliessen, sonst
// wuerde der Dialog eine Erledigung melden, die nicht stattgefunden hat.

async function openMediaNeedPanel({ proposalId, siteId, pageId, needs, onDone }) {
  const list = el("div", { class: "media-needs", "data-role": "media-needs" });
  const errorEl = el("p", { class: "media-needs__error", "data-role": "media-needs-error" });
  const doneButton = el("button", {
    type: "button",
    class: "btn",
    "data-action": "media-needs-done",
    text: "Fertig",
  });

  // Nur die Zielsite, und nur wenn es eine gibt: ein Bedarf ohne Site hat keine
  // Bibliothek, aus der man waehlen koennte.
  //
  // Die Antwort ist `{ assets: [...] }`, NICHT das Array selbst - und der
  // Unterschied ist der Grund fuer den `Array.isArray`: die Liste kommt aus
  // einer Route, deren Form sich aendern darf, ohne dass dieser Dialog
  // stillschweigt und ein leeres Panel zeigt. Lieber kein Auswahlfeld als ein
  // geratenes.
  let assets = [];
  if (typeof siteId === "string") {
    const antwort = await api(`/api/sites/${siteId}/assets?limit=200`).catch(() => null);
    const liste = antwort?.assets;
    assets = Array.isArray(liste) ? liste : [];
  }

  const dialog = el(
    "dialog",
    { class: "redesign-dialog media-needs-dialog", "data-role": "media-needs-dialog" },
    el("div", { class: "redesign-dialog__head" }, [
      el("p", { class: "redesign-dialog__eyebrow", text: "Medienbedarf" }),
      el("h2", { text: `${needs.length} Bild${needs.length === 1 ? "" : "e"} fehlt noch` }),
      el("p", {
        class: "redesign-dialog__hint",
        text: "Die Seite ist gebaut, aber diese Slots sind leer. Waehlen, laden, erzeugen - oder bewusst offen lassen.",
      }),
    ]),
    list,
    errorEl,
    el("div", { class: "redesign-dialog__foot" }, [doneButton]),
  );

  const answers = new Map();
  const pending = new Set(needs.map((need) => need.needId));

  async function submit() {
    if (answers.size === 0) {
      onDone(pending.size);
      dialog.close();
      return;
    }
    doneButton.disabled = true;
    errorEl.textContent = "";
    try {
      const result = await api(`/api/redesign-proposals/${encodeURIComponent(proposalId)}/media-needs`, {
        method: "POST",
        body: {
          resolutions: [...answers.entries()].map(([needId, resolution]) => ({ needId, ...resolution })),
          idempotencyKey: window.crypto.randomUUID(),
        },
      });
      for (const need of result.stillOpen ?? []) pending.add(need.needId);
      for (const need of result.closed ?? []) pending.delete(need.needId);
      onDone(pending.size);
      dialog.close();
    } catch (error) {
      errorEl.textContent = error?.message ?? "Die Medienbedarfe konnten nicht geschlossen werden.";
      doneButton.disabled = false;
    }
  }

  for (const need of needs) {
    const select = el("select", { "data-role": "media-need-select", "data-need": need.needId });
    select.append(el("option", { value: "", text: "— Asset wählen —" }));
    for (const asset of assets) {
      select.append(el("option", { value: asset.id, text: asset.filename }));
    }

    const fileInput = el("input", {
      type: "file",
      accept: "image/*",
      "data-role": "media-need-file",
      "data-need": need.needId,
    });
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file || typeof siteId !== "string") return;
      // Hochgeladen wird in die ZIELsite, nicht in die Quelle - die Quellseite
      // bleibt unangetastet, und das Asset landet dort, wo der Slot liegt.
      const body = new FormData();
      body.append("file", file);
      errorEl.textContent = "Wird hochgeladen …";
      try {
        const uploaded = await api(`/api/sites/${siteId}/assets`, { method: "POST", body });
        answers.set(need.needId, { treatment: "upload", assetId: uploaded.id });
        errorEl.textContent = "";
        row.dataset.state = "uploaded";
      } catch (error) {
        errorEl.textContent = error?.message ?? "Der Upload ist fehlgeschlagen.";
      }
    });

    const manualButton = el("button", {
      type: "button",
      class: "btn btn--ghost",
      "data-action": "media-need-manual",
      text: "Bewusst offen lassen",
    });
    manualButton.addEventListener("click", () => {
      answers.set(need.needId, { treatment: "manual" });
      row.dataset.state = "manual";
    });

    const generateButton = el("button", {
      type: "button",
      class: "btn",
      "data-action": "media-need-generate",
      text: "Bild erzeugen",
    });
    generateButton.addEventListener("click", async () => {
      if (typeof siteId !== "string") return;
      generateButton.disabled = true;
      errorEl.textContent = "Wird erzeugt …";
      try {
        // Der Prompt kommt aus dem Bedarf selbst. Die Engine nimmt ihn, wie er
        // ist - eine "Verbesserung" hier wuerde das Vorbild kopieren, und genau
        // das soll der Bedarf verhindern.
        //
        // Bildgenerierung ist ein JOB, kein synchroner Aufruf: die Route
        // antwortet 202 mit einer Job-Id, und der Lauf macht die Arbeit
        // asynchron. Deshalb wird hier gepollt statt geraten - ein Dialog, der
        // eine Job-Id fuer ein fertiges Bild haelt, wuerde einen leeren Slot
        // als geschlossen melden.
        const queued = await api(`/api/sites/${siteId}/images/jobs`, {
          method: "POST",
          body: {
            prompt: need.prompt ?? `${need.targetPath} für ${pageId ?? "die Seite"}`,
            ...(need.decorative ? { decorative: true } : {}),
            ...(need.alt === null ? {} : { altText: need.alt }),
          },
        });
        const assetId = await waitForImageJob(siteId, queued.jobId, (text) => {
          errorEl.textContent = text;
        });
        answers.set(need.needId, { treatment: "generate", assetId });
        errorEl.textContent = "";
        row.dataset.state = "generated";
        generateButton.disabled = false;
      } catch (error) {
        errorEl.textContent = error?.message ?? "Die Bildgenerierung ist fehlgeschlagen.";
        generateButton.disabled = false;
      }
    });

    select.addEventListener("change", () => {
      if (select.value === "") answers.delete(need.needId);
      else answers.set(need.needId, { treatment: "select", assetId: select.value });
      row.dataset.state = "selected";
    });

    const row = el(
      "div",
      {
        class: "media-need",
        "data-role": "media-need",
        "data-need": need.needId,
        "data-treatment": need.treatment,
      },
      [
        el("p", { class: "media-need__title" }, [
          el("code", { text: need.targetPath }),
          el("span", { class: "media-need__reason", text: need.reason ?? "" }),
        ]),
        // A `generate` need carries the prompt. Showing it is the whole point:
        // the human decides whether the prompt is acceptable BEFORE paying for
        // the image.
        need.prompt === null
          ? null
          : el("p", { class: "media-need__prompt", "data-role": "media-need-prompt" }, [
              el("span", { class: "media-need__label", text: "Prompt" }),
              el("span", { text: need.prompt }),
            ]),
        el("div", { class: "media-need__actions" }, [select, fileInput, generateButton, manualButton]),
      ],
    );
    list.append(row);
  }

  doneButton.addEventListener("click", () => void submit());
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  refsBindBackdropClose(dialog);
  dialog.showModal();
}
