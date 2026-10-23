// Der Import aus Framer (P3-2, Schritt 45): der Bericht nach der Analyse und
// der Dialog, der die Adresse abfragt, analysiert und den Write ausloest.
// `app-import.js` importiert die zwei Einstiegspunkte.
//
// Der Block haengt an nichts aus seiner Datei: `importReportBlock` baut nur
// aus dem Bericht Markup, `openFramerImportDialog` ruft die API und den
// Write. Deshalb liess er sich als Ganzes schneiden - die Redesign-Dialoge
// bleiben vorerst zusammen.

import { api, el } from "./app-core.js";
import { refsFold } from "./app-references.js";

export function importReportBlock(report) {
  const counts = report?.counts ?? {};
  const assets = report?.assets ?? {};
  const declarations = report?.declarations ?? {};
  const motion = report?.motion ?? { measured: 0, mappedToPreset: 0, documented: 0 };
  const findings = report?.findings ?? [];
  const resolutions = report?.resolutions ?? [];
  const candidates = report?.candidates ?? [];
  const marquee = report?.marqueeCandidates ?? [];
  // The honest split (step 7 of the 1:1 plan): how much of the page the editor
  // edits, and how much runs as original code in the release. A page-level
  // payload carries the whole page, so the number is 0/100 there — saying
  // "100 % editable" would be a lie about the release.
  const share = report?.editableShare;
  const shareBlock = share === undefined
    ? ""
    : el(
        "p",
        { class: "framer-report-share", "data-role": "framer-editable-share" },
        `${share.editable} % bearbeitbar, ${share.original} % Original-Code`,
        el("span", {
          class: "muted",
          text:
            share.original > 0
              ? ` · ${share.nodes} Knoten im Baum; der Release zeigt die Originalseite mit ihrer Laufzeit.`
              : ` · ${share.nodes} Knoten, alle im Editor änderbar.`,
        }),
      );
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
    shareBlock,
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
  // "Originalgetreu" keeps the fonts of the source on the page — they only
  // render when the theme carries them. The choice is therefore offered with
  // that mode (and can still be taken back).
  const syncThemeFonts = () => {
    themeCheck.checked = modeSelect.value === "fidelity";
  };
  modeSelect.addEventListener("change", syncThemeFonts);
  syncThemeFonts();
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
