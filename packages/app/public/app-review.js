// Die Reviews und ihre Belege. Die Bloecke standen in `app.js` und
// sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt
// ESLint.

import { api, askText, el, failed, formatDate, toast } from "./app-core.js";
import { importReportBlock } from "./app-import.js";
import { renderRoute } from "./app.js";

export function reviewPanel(siteId, review) {
  const details = el("div", { class: "review-detail", hidden: "" });
  const toggle = el("button", {
    class: "ghost",
    text: "Details",
    onclick: async () => {
      const opening = details.hasAttribute("hidden");
      if (opening) details.removeAttribute("hidden");
      else details.setAttribute("hidden", "");
      toggle.textContent = opening ? "Details schließen" : "Details";
      if (!opening) return;
      details.replaceChildren(el("p", { class: "muted", text: "Lädt …" }));
      try {
        const data = await api(`/api/reviews/${review.id}`);
        details.replaceChildren(...reviewDetailBlocks(data));
      } catch (error) {
        failed(error);
      }
    },
  });
  return el(
    "div",
    { class: "panel" },
    el(
      "div",
      { class: "inline" },
      el("span", { class: "tag", text: review.status }),
      el("strong", { text: review.title ?? review.pagePath ?? review.id }),
      el("span", { class: "muted", text: formatDate(review.createdAt) }),
    ),
    el(
      "div",
      { class: "inline", style: "margin-top: 0.5rem" },
      toggle,
      el("button", {
        class: "primary",
        text: "Approve",
        onclick: () => reviewAction(siteId, review.id, "approve"),
      }),
      el("button", {
        class: "ghost",
        text: "Änderungen anfragen",
        onclick: () => reviewAction(siteId, review.id, "request-changes"),
      }),
      el("button", {
        class: "danger",
        text: "Verwerfen",
        onclick: () => reviewAction(siteId, review.id, "discard"),
      }),
    ),
    details,
  );
}


// Review-Details (T07): Struktur-Diff in Klartext, dann die Aufnahmen aus
// review.visuals - Vorher/Nachher je Breakpoint, das Diff-Bild mit Quote und
// die Motion-Aufnahme, wenn die Aenderung Bewegung beruehrt hat.
function reviewDetailBlocks(review) {
  const blocks = [];
  const diff = review.structureDiff ?? [];
  if (diff.length > 0) {
    const pages = diff.map((entry) => {
      const head = el(
        "div",
        { class: "review-diff-head" },
        el("code", { text: entry.path }),
        el("span", { class: "review-state", text: reviewStatusLabel(entry.status) }),
      );
      const sections = (entry.sections ?? []).map((section) =>
        el(
          "div",
          { class: "review-diff-row" },
          el("span", { class: "tag", text: section.type }),
          el("span", { text: reviewChangeLabel(section.change) }),
          (section.fields ?? []).length > 0
            ? el("span", {
                class: "muted",
                text: (section.fields ?? []).map(reviewFieldLabel).join(", "),
              })
            : "",
        ),
      );
      return el("div", { class: "review-diff-page" }, head, ...sections);
    });
    blocks.push(el("div", { class: "review-block" }, el("h3", { text: "Struktur-Diff" }), ...pages));
  }
  for (const report of review.importReports ?? []) blocks.push(importReportBlock(report));
  blocks.push(reviewVisualsBlock(review));
  return blocks;
}


const REVIEW_BREAKPOINTS = [
  ["desktop", "Desktop"],
  ["tablet", "Tablet"],
  ["mobile", "Mobil"],
];


function reviewStatusLabel(status) {
  return (
    {
      added: "neu",
      removed: "entfernt",
      changed: "geändert",
      unchanged: "unverändert",
    }[status] ?? status
  );
}


function reviewChangeLabel(change) {
  return { added: "neu", removed: "entfernt", changed: "geändert" }[change] ?? change;
}


function reviewFieldLabel(field) {
  return (
    {
      variant: "Variante",
      props: "Inhalte",
      overrides: "Überschreibungen",
      motion: "Bewegung",
      hidden: "Sichtbarkeit",
    }[field] ?? field
  );
}


function reviewVisualsBlock(review) {
  const visuals = review.visuals;
  const node = el("div", { class: "review-block review-visuals" }, el("h3", { text: "Aufnahmen" }));
  if (!visuals) {
    node.append(
      el("p", { class: "muted", text: "Keine visuellen Aufnahmen zu diesem Stand." }),
    );
    return node;
  }
  if (visuals.note) {
    node.append(el("p", { class: "muted", text: visuals.note }));
  }
  const diffs = visuals.diffs ?? [];
  const byPage = new Map();
  for (const asset of visuals.assets ?? []) {
    if (!byPage.has(asset.pageId)) byPage.set(asset.pageId, []);
    byPage.get(asset.pageId).push(asset);
  }
  const captured = new Date(visuals.capturedAt);
  if (!Number.isNaN(captured.getTime())) {
    node.append(el("p", { class: "muted", text: `Aufgenommen ${formatDate(visuals.capturedAt)}` }));
  }
  for (const [pageId, assets] of byPage) {
    const pagePath = assets[0]?.path ?? pageId;
    const breakpoints = REVIEW_BREAKPOINTS.filter(([key]) =>
      assets.some((asset) => asset.breakpoint === key),
    );
    const stage = el("div", { class: "review-stage" });
    const tabs = el("div", { class: "review-tabs" });
    const show = (breakpoint) => {
      [...tabs.children].forEach((tab) =>
        tab.classList.toggle("active", tab.dataset.breakpoint === breakpoint),
      );
      const figures = [];
      const before = assets.find((asset) => asset.role === "before" && asset.breakpoint === breakpoint);
      const after = assets.find((asset) => asset.role === "after" && asset.breakpoint === breakpoint);
      if (before) figures.push(reviewFigure("Vorher", before.previewPath));
      if (after) figures.push(reviewFigure("Nachher", after.previewPath));
      const diff = diffs.find((entry) => entry.pageId === pageId && entry.breakpoint === breakpoint);
      if (diff) {
        figures.push(reviewFigure(`Diff · ${(diff.ratio * 100).toFixed(2)} %`, diff.previewPath, "diff"));
      }
      stage.replaceChildren(...figures);
    };
    for (const [key, label] of breakpoints) {
      tabs.append(
        el("button", {
          type: "button",
          class: "ghost",
          "data-breakpoint": key,
          text: label,
          onclick: () => show(key),
        }),
      );
    }
    node.append(
      el(
        "div",
        { class: "review-page" },
        el("div", { class: "review-page-head" }, el("code", { text: pagePath }), breakpoints.length > 1 ? tabs : ""),
        stage,
      ),
    );
    show(breakpoints[0]?.[0] ?? "desktop");
  }
  if (visuals.video) {
    node.append(
      el(
        "div",
        { class: "review-video" },
        el("div", {
          class: "muted",
          text: `Motion-Aufnahme · ${(visuals.video.durationMs / 1000).toFixed(1)} s`,
        }),
        el("video", {
          controls: "",
          muted: "",
          playsinline: "",
          preload: "metadata",
          src: visuals.video.previewPath,
        }),
      ),
    );
  }
  return node;
}


function reviewFigure(label, src, kind = "") {
  return el(
    "figure",
    { class: `review-figure ${kind}`.trim() },
    el("figcaption", { text: label }),
    el("img", { src, alt: label, loading: "lazy" }),
  );
}


async function reviewAction(siteId, reviewId, action) {
  const labels = {
    approve: ["Review freigeben", "Freigeben"],
    "request-changes": ["Änderungen anfordern", "Anfordern"],
    discard: ["Review verwerfen", "Verwerfen"],
  };
  const [reviewTitle, reviewConfirm] = labels[action] ?? ["Review aktualisieren", "Senden"];
  // Cancelling now cancels the action. The native prompt answered "Abbrechen"
  // with null, which the old `?? ""` turned into an empty comment — the review
  // was approved, requested or discarded although the user backed out.
  const comment = await askText({
    title: reviewTitle,
    label: "Kommentar (optional)",
    multiline: true,
    confirmLabel: reviewConfirm,
    danger: action === "discard",
  });
  if (comment === null) return;
  try {
    await api(`/api/reviews/${reviewId}/${action}`, {
      method: "POST",
      body: comment === "" ? {} : { note: comment },
    });
    toast("Review aktualisiert");
    await renderRoute();
  } catch (error) {
    failed(error);
  }
}

// The new canvas view (rebuild Phase 0, fifth slice). It reads the very page
// draft of the running engine (`GET /api/pages/:pageId`) and lifts it to the v2
// editor document with the existing migration; changes are written back through
// the engine's mutations path (`POST /api/pages/:pageId/editor-mutations`), so
// the canvas owns no storage of its own.
//
// E5 Scheibe 1: der Umbau-Pfad ist der **eine sichtbare Editor**.
//
// P3-1 Punkt 4 (R5): the v1 editor is gone - `mount.ts`, `mountEditor` and the
// page that mounted it are all deleted. There is no mode to compute any more,
// so there is no `canvasModeOf`: the page below mounts the canvas, and the only
// thing left of the old deep link is the hint that says so. Keeping a function
// that returns a constant would be a lie about there being a choice.
//
// `?view=editor` is no longer a second editing path but a **notice**: the
// deep link lands on the canvas and says why. Someone with the old URL
// bookmarked therefore does not end up in a surface nobody maintains, and the
// parameter is cleaned out so a reload does not repeat the notice.
//
// Erkennt den alten Deep-Link, damit der Umstieg **sichtbar** ist: der
// Hinweistext erscheint im Canvas, und der Parameter wird aus dem Hash
// entfernt, damit ein Neuladen nicht erneut umgeleitet wird. Ohne das
// Entfernen bliebe der Hinweis bei jedem Reload stehen und wuerde zum
// Normalzustand.