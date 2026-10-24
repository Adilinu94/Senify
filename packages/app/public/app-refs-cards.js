// Die Karten der Referenzen-Seite (P3-2, Schritt 59): das Blockrendering
// mit dem Waechter, die einzelne Karte und ihr Vorschaubild.
//
// Der Block stand in `app-references.js` und ist dort nicht zusammenhaengend:
// zwischen dem Rendering und der Karte liegt die Filter- und Tray-Logik.
// Fachlich gehoert beides zusammen - `refsRenderCards` ruft `refsCard`, und
// beide teilen den Beobachter `refsCardObserver`. Sie brauchen keinen Zugriff
// auf `refsState`: Auswahl und Eintrag kommen ueber `refsIsSelected` und
// `refsEntryFor` herein, das Oeffnen ueber `refsOpenDetail`. `refsPreviewImage`
// bleibt in `app-references.js` - Miniatur und Vergleich nutzen es ebenfalls.

import { el, initials, snapshotImageURL } from "./app-core.js";
import {
  REFS_ICON_CHECK_BOX,
  REFS_ICON_LINK,
  REFS_ICON_LINK_LABEL,
  REFS_ICON_PLUS_BOX,
} from "./app-refs-icons.js";
import { refsHex, refsIsSelected, refsToggleSelection } from "./app-refs-state.js";
import { refsEntryFor, refsImageSource, refsOpenDetail } from "./app-refs-inspector.js";

/** Die Akzentfarbe, wenn eine Referenz keiner Sammlung angehoert. */
export const REFS_ACCENT_FALLBACK = "#8b91a0";

// Kartenbilder laden erst, wenn die Karte in Sicht kommt: die Bibliothek kann
// mehrere hundert Referenzen halten, und jede Aufnahme ist ein paar hundert
// Kilobyte gross.

let refsImageObserver = null;

function refsLoadOnSight(image, load) {
  if (typeof IntersectionObserver !== "function") {
    load();
    return;
  }
  if (refsImageObserver === null) {
    refsImageObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          refsImageObserver.unobserve(entry.target);
          entry.target.refsLoad?.();
        }
      },
      { rootMargin: "320px" },
    );
  }
  image.refsLoad = load;
  refsImageObserver.observe(image);
}

/** Eine Vorschau, die erst laedt, wenn sie in Sicht kommt. */
export function refsPreviewImage(url, alt, fallback) {
  const image = el("img", { alt });
  refsLoadOnSight(image, () => {
    refsImageSource(url).then(
      (src) => {
        image.src = src;
      },
      () => {
        if (fallback) image.replaceWith(fallback());
      },
    );
  });
  return image;
}

// Karten in Bloecken zeichnen: bei mehreren hundert Referenzen waeren alle
// Karten samt Bildern auf einmal zu viel. Der Waechter am Ende der Liste zieht
// den naechsten Block nach, sobald er in Sicht kommt.

const REFS_CARD_BATCH = 48;
let refsCardObserver = null;

export function refsRenderCards(references, gallery) {
  gallery.replaceChildren();
  if (references.length === 0) return;
  // Der Waechter steht von Anfang an in der Liste: die Karten werden jeweils
  // davor eingefuegt, und er zieht den naechsten Block nach, sobald er in Sicht
  // kommt.
  const sentinel = el("div", { class: "refs-sentinel", "aria-hidden": "true" });
  gallery.append(sentinel);
  let rendered = 0;
  const renderNext = () => {
    const next = references.slice(rendered, rendered + REFS_CARD_BATCH);
    rendered += next.length;
    for (const reference of next) gallery.insertBefore(refsCard(reference), sentinel);
  };
  const finish = () => {
    refsCardObserver?.unobserve(sentinel);
    sentinel.remove();
  };
  renderNext();
  if (rendered >= references.length) {
    finish();
    return;
  }
  if (typeof IntersectionObserver !== "function") {
    // Ohne Beobachter bleibt nur der volle Aufbau.
    while (rendered < references.length) renderNext();
    finish();
    return;
  }
  if (refsCardObserver === null) {
    refsCardObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) entry.target.refsMore?.();
        }
      },
      { rootMargin: "600px" },
    );
  }
  sentinel.refsMore = () => {
    renderNext();
    if (rendered >= references.length) finish();
  };
  refsCardObserver.observe(sentinel);
}

export function refsCard(reference) {
  const selected = refsIsSelected(reference.id);
  const entry = refsEntryFor(reference);
  const art = el(
    "div",
    {
      class: "refs-card-art",
      role: "button",
      tabindex: "0",
      "aria-label": `Referenz öffnen: ${reference.name}`,
      onclick: () => refsOpenDetail(reference.id),
      onkeydown: (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          refsOpenDetail(reference.id);
        }
      },
    },
    refsCardImage(reference),
    el(
      "span",
      { class: "refs-open-label" },
      "Referenz öffnen",
      el("span", { "aria-hidden": "true", html: REFS_ICON_LINK_LABEL }),
    ),
  );
  const select = el("button", {
    type: "button",
    class: `refs-select${selected ? " selected" : ""}`,
    "aria-pressed": selected ? "true" : "false",
    "aria-label": `${selected ? "Aus Vergleich entfernen" : "Zum Vergleich wählen"}: ${reference.name}`,
    html: selected ? REFS_ICON_CHECK_BOX : REFS_ICON_PLUS_BOX,
    onclick: (event) => {
      event.stopPropagation();
      refsToggleSelection(entry);
    },
  });
  const meta = el(
    "div",
    { class: "refs-card-meta" },
    el(
      "div",
      {},
      el("p", { class: "refs-card-title", text: reference.name }),
      el(
        "div",
        { class: "refs-card-collection" },
        el("span", {
          class: "refs-dot",
          style: `--refs-dot:${reference.collection ? refsHex(reference.collection.accent) : REFS_ACCENT_FALLBACK}`,
        }),
        reference.collection ? reference.collection.name : "Ohne Sammlung",
      ),
    ),
    el("span", { class: "refs-card-arrow", "aria-hidden": "true", html: REFS_ICON_LINK }),
  );
  return el("article", { class: "refs-card", "data-reference": reference.id }, select, art, meta);
}

export function refsCardImage(reference) {
  // The engine marks the card snapshot (hero slot first); older payloads
  // without it fall back to the first viewable shot, never motion.
  const card =
    reference.cardSnapshot && reference.cardSnapshot.previewPath
      ? reference.cardSnapshot
      : (reference.snapshots ?? []).find(
          (shot) => shot.previewPath && shot.kind !== "motion",
        );
  const snapshot = card ?? null;
  const placeholder = () =>
    el("div", {
      class: "refs-card-placeholder",
      text: initials(reference.name || "R"),
    });
  if (!snapshot) return placeholder();
  return refsPreviewImage(
    snapshotImageURL(reference.id, snapshot),
    `Vorschau ${reference.name}`,
    placeholder,
  );
}
