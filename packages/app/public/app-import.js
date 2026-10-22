// Der Import aus Framer und die Redesign-Dialoge. Die Bloecke standen in `app.js` und
// sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt
// ESLint.

import { api, el, toast } from "./app-core.js";
import { waitForImageJob } from "./app-editor.js";
import { refsBindBackdropClose } from "./app-references.js";

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
