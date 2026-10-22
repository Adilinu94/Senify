// Der Inspector der Referenzen (P3-2, Schritt 41): die Detailansicht mit
// Bildbuehne, Zoom, Schritten, Aktionen und dem Loeschen. `app-references.js`
// importiert die zwei Einstiegspunkte.
//
// Der Block hat keinen Zugriff auf den Zustand der Seite (`refsState`) - er
// bekommt die Referenz, die er zeigt, als Argument. Deshalb liess er sich als
// Ganzes schneiden, waehrend die Liste und die Sammlungen am Zustand hingen.
//
// Drei Helfer wandern mit, weil nur der Inspector sie braucht: das Loeschen,
// das Laden eines Bildes und der Blick auf eine Referenz (Vorschau, Name).

import { api, el, failed, initials, snapshotImageURL, askConfirm } from "./app-core.js";
import { renderRoute } from "./app.js";
import { refsRenderMarkdown } from "./app-markdown.js";
import { refsBindBackdropClose, refsCopy, refsToast } from "./app-refs-dialog.js";
import {
  REFS_ICON_CLOSE,
  REFS_ICON_NEXT,
  REFS_ICON_PLUS_BUTTON,
  REFS_ICON_PREV,
} from "./app-refs-icons.js";
import { refsIsSelected, refsSyncAddress, refsToggleSelection } from "./app-refs-state.js";

// Die Bild-Quellen, die schon geladen werden (verhindert doppelte Anfragen),
// und die zwei Beschriftungen des Zoom-Knopfs. Sie standen bis R12 in
// `app-references.js`.
const refsImageSources = new Map();
const REFS_ZOOM_IN = "Zoom";
const REFS_ZOOM_OUT = "Einpassen";

// Der Zustand des Fensters: das offene Dialog-Objekt, die Ids der aktuellen
// Ansicht, die gezeigte Referenz, wohin der Schliessen-Knopf zurueckfuehrt und
// ein Zaehler gegen veraltete Antworten. Er stand bis R12 in
// `app-references.js`; nur dieses Modul liest und schreibt ihn.
export let refsInspector = null;
let refsInspectorIds = [];
let refsInspectorId = null;
let refsInspectorReturn = null;
let refsInspectorToken = 0;

// `refsInspectorIds` wird von der Liste gesetzt (sie kennt die aktuelle
// Auswahl), gelesen wird es hier.
export function refsSetInspectorIds(ids) {
  refsInspectorIds = ids;
}

async function deleteReference(reference) {
  const used = reference.usedInProjects.length;
  const message =
    used > 0
      ? `„${reference.name}“ ist ${used} Projekt(en) zugeordnet. Trotzdem löschen?`
      : `„${reference.name}“ löschen?`;
  const sure = await askConfirm({
    title: "Referenz löschen?",
    message,
    confirmLabel: "Löschen",
    danger: true,
  });
  if (!sure) return;
  try {
    await api(`/api/references/${reference.id}${used > 0 ? "?force=1" : ""}`, {
      method: "DELETE",
    });
    // Das offene Fenster zeigt eine geloeschte Referenz: erst schliessen.
    if (refsInspector && refsInspector.dialog.open) refsInspector.dialog.close();
    refsToast("Referenz gelöscht");
    // The deleted detail is gone: fall back to the library list.
    if (location.hash.startsWith("#/references")) location.hash = "#/references";
    else await renderRoute();
  } catch (error) {
    failed(error);
  }
}

export function refsImageSource(url) {
  let pending = refsImageSources.get(url);
  if (!pending) {
    pending = fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`);
        return URL.createObjectURL(await response.blob());
      })
      .catch((error) => {
        refsImageSources.delete(url);
        throw error;
      });
    refsImageSources.set(url, pending);
  }
  return pending;
}

export function refsEntryFor(reference) {
  // Die Motion-Aufnahme ist ein Video und taugt nicht als Standbild.
  const snapshot = (reference.snapshots ?? []).find(
    (shot) => shot.previewPath && shot.kind !== "motion",
  );
  return {
    id: reference.id,
    name: reference.name,
    previewPath: snapshot ? snapshotImageURL(reference.id, snapshot) : null,
    family: reference.family ?? (reference.families ?? [])[0] ?? null,
    collectionName: reference.collection ? reference.collection.name : null,
    vocabulary: reference.vocabulary ?? [],
    note: reference.note ?? null,
  };
}

export function refsInspectorList() {
  return refsInspectorIds;
}

// Klick auf eine Karte (oder Enter): oeffnet das Fenster — ohne neuen
// Verlaufseintrag und ohne Hash-Wechsel, wie im Vorbild.

export function refsOpenDetail(referenceId) {
  void refsOpenInspector(referenceId);
}

export function refsInspectorBuild() {
  const label = el("span", { class: "refs-dialog-label", text: "Referenz" });
  const previous = el("button", {
    type: "button",
    id: "refs-inspector-previous",
    class: "refs-icon-button",
    "aria-label": "Vorherige Referenz",
    html: REFS_ICON_PREV,
    onclick: () => refsInspectorStep(-1),
  });
  const next = el("button", {
    type: "button",
    id: "refs-inspector-next",
    class: "refs-icon-button",
    "aria-label": "Nächste Referenz",
    html: REFS_ICON_NEXT,
    onclick: () => refsInspectorStep(1),
  });
  const zoom = el("button", {
    type: "button",
    id: "refs-inspector-zoom",
    class: "refs-button quiet",
    "aria-pressed": "false",
    text: REFS_ZOOM_IN,
    onclick: () => refsInspectorSetZoom(!refsInspector.zoomed),
  });
  const close = el("button", {
    type: "button",
    id: "refs-inspector-close",
    class: "refs-icon-button",
    "aria-label": "Referenz schließen",
    html: REFS_ICON_CLOSE,
    onclick: () => refsInspector.dialog.close(),
  });
  const image = el("img", { id: "refs-inspector-image", class: "refs-inspector-image", alt: "" });
  const placeholder = el("div", { class: "refs-card-placeholder" });
  const stage = el("div", { id: "refs-inspector-stage", class: "refs-inspector-stage" }, image);
  const panel = el("section", { id: "refs-inspector-panel", class: "refs-inspector-panel" });
  const dialog = el(
    "dialog",
    {
      id: "refs-inspector",
      class: "refs-dialog refs-inspector",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Referenz-Detail",
    },
    el(
      "div",
      { class: "refs-inspector-head" },
      label,
      el("div", { class: "refs-dialog-tools" }, previous, next, zoom, close),
    ),
    el("div", { class: "refs-inspector-layout" }, stage, panel),
  );

  // Klick auf den Hintergrund schliesst, ein Klick im Fenster (auch im
  // Kopfbereich) nicht — dieselbe Regel wie bei den uebrigen Dialogen.
  refsBindBackdropClose(dialog);
  dialog.addEventListener("close", () => {
    document.documentElement.style.overflow = "";
    refsInspector.zoomed = false;
    refsInspectorId = null;
    const back = refsInspectorReturn;
    refsInspectorReturn = null;
    if (back && back.isConnected) back.focus();
  });
  // Pfeiltasten blaettern (kein Feld fokussiert) — wie im Vorbild.
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName ?? "")) return;
    event.preventDefault();
    refsInspectorStep(event.key === "ArrowRight" ? 1 : -1);
  });
  document.body.append(dialog);
  return {
    dialog,
    label,
    previous,
    next,
    zoom,
    close,
    stage,
    image,
    placeholder,
    panel,
    zoomed: false,
  };
}

// Zoom vergroessert das Bild auf Originalmasse; die Buehne scrollt dann intern.

export function refsInspectorSetZoom(on) {
  const dom = refsInspector;
  if (!dom) return;
  dom.zoomed = Boolean(on);
  dom.stage.classList.toggle("zoomed", dom.zoomed);
  dom.zoom.textContent = dom.zoomed ? REFS_ZOOM_OUT : REFS_ZOOM_IN;
  dom.zoom.setAttribute("aria-pressed", dom.zoomed ? "true" : "false");
}

// Blaettern innerhalb der aktuellen Ansicht (Knoepfe und Pfeiltasten).

export function refsInspectorStep(delta) {
  const ids = refsInspectorList();
  const position = ids.indexOf(refsInspectorId);
  if (position < 0) return;
  const target = ids[position + delta];
  if (target) void refsInspectorShow(target);
}

// Aktionen des Fensters. Die Analyse-Daten (Profil, Aufnahmen, Evidenzen) bleiben
// bewusst draussen: sie gehoeren dem Agenten und der API, nicht der Oberflaeche.

export function refsInspectorActions(reference) {
  return el(
    "div",
    { class: "refs-inspector-extras" },
    el(
      "div",
      { class: "refs-row-actions" },
      el("button", {
        type: "button",
        class: "refs-button danger",
        text: "Referenz löschen",
        onclick: () => void deleteReference(reference),
      }),
    ),
  );
}

// Der Umschalter der Vorschaubilder (Desktop/Mobil) am Rand der Bildbuehne.

export function refsShotLabel(shot) {
  if (shot.breakpoint === "mobile") return "Mobil";
  if (shot.breakpoint === "tablet") return "Tablet";
  return "Desktop";
}

/* Inhalte des Fensters aus den echten Daten: Sammlung, Titel, Familie, Notiz,
   Vokabular, Komposition, Bildrezept und die zwei Brief-Kopierer. */
export async function refsInspectorShow(referenceId) {
  const dom = refsInspector;
  if (!dom) return;
  const token = (refsInspectorToken += 1);
  let reference;
  try {
    reference = await api(`/api/references/${referenceId}`);
  } catch (error) {
    failed(error);
    return;
  }
  const brief = await api(`/api/references/${referenceId}/brief`).catch(() => null);
  if (token !== refsInspectorToken) return;
  refsInspectorId = referenceId;

  const ids = refsInspectorList();
  const position = ids.indexOf(referenceId);
  dom.label.textContent =
    position >= 0 ? `Referenz ${position + 1} von ${ids.length}` : "Referenz";
  dom.previous.disabled = position <= 0;
  dom.next.disabled = position < 0 || position >= ids.length - 1;

  // Jede Referenz startet wieder in der Einpass-Ansicht (wie im Vorbild).
  refsInspectorSetZoom(false);

  const shots = (reference.snapshots ?? []).filter(
    (entry) => entry.previewPath && entry.kind !== "motion",
  );
  const shot = shots[0] ?? null;
  const showShot = (entry) => {
    if (entry === undefined || entry === null) return;
    refsImageSource(snapshotImageURL(reference.id, entry)).then(
      (src) => {
        if (refsInspectorId === referenceId) dom.image.src = src;
      },
      () => {
        if (refsInspectorId === referenceId) dom.image.removeAttribute("src");
      },
    );
  };
  if (shot) {
    dom.placeholder.remove();
    dom.image.hidden = false;
    dom.image.alt = reference.name;
    showShot(shot);
  } else {
    dom.image.removeAttribute("src");
    dom.image.hidden = true;
    dom.image.alt = "";
    dom.placeholder.textContent = initials(reference.name || "R");
    if (!dom.placeholder.isConnected) dom.stage.append(dom.placeholder);
  }
  // Umschalter nur, wenn es wirklich mehrere Bilder gibt (Import: Desktop/Mobil).
  dom.stage.querySelector(".refs-shot-switch")?.remove();
  if (shots.length > 1) {
    const buttons = shots.map((entry, index) =>
      el("button", {
        type: "button",
        "aria-pressed": index === 0 ? "true" : "false",
        text: refsShotLabel(entry),
        onclick: () => {
          for (const other of buttons) other.setAttribute("aria-pressed", "false");
          buttons[index]?.setAttribute("aria-pressed", "true");
          showShot(entry);
        },
      }),
    );
    dom.stage.append(
      el("div", { class: "refs-shot-switch", role: "group", "aria-label": "Vorschaubild" }, ...buttons),
    );
  }

  const profile = reference.profile;
  const collection = reference.collection;
  const family = reference.family ?? (reference.families ?? [])[0] ?? null;
  const note =
    reference.note ??
    (profile?.styleBrief
      ? profile.styleBrief
      : "Eine visuelle Referenz für dein nächstes Projekt.");
  const heroUsage = reference.heroUsage ?? "Nutze die Referenz für Komposition und Hierarchie.";
  const recipe = reference.imageRecipe ?? collection?.imageStyle ?? null;
  const vocabulary =
    (reference.vocabulary ?? []).length > 0
      ? reference.vocabulary
      : (collection?.vocabulary ?? []);
  const selected = refsIsSelected(reference.id);

  const copyPrompt = el("button", {
    type: "button",
    class: "refs-button refs-copy-prompt",
    text: "Bild-Prompt kopieren",
    onclick: () => {
      if (!brief?.imagePrompt) return;
      refsCopy(brief.imagePrompt, "Bild-Prompt kopiert");
    },
  });
  copyPrompt.disabled = !brief?.imagePrompt;

  const copyBrief = el("button", {
    type: "button",
    class: "refs-button primary refs-copy-brief",
    text: "Design-Brief kopieren",
    onclick: () => refsCopy(brief?.brief?.text ?? "", "Brief kopiert"),
  });

  const select = el("button", {
    type: "button",
    class: `refs-button refs-detail-select${selected ? " quiet" : ""}`,
    "aria-pressed": selected ? "true" : "false",
    text: selected ? "Aus dem Vergleich nehmen" : "Zum Vergleich wählen",
    onclick: () => {
      refsToggleSelection(refsEntryFor(reference));
      const on = refsIsSelected(reference.id);
      select.classList.toggle("quiet", on);
      select.setAttribute("aria-pressed", on ? "true" : "false");
      select.textContent = on ? "Aus dem Vergleich nehmen" : "Zum Vergleich wählen";
    },
  });

  const recipeDetails = el(
    "details",
    { class: "refs-recipe" },
    el(
      "summary",
      {},
      "Bildrezept ",
      el("span", { "aria-hidden": "true", html: REFS_ICON_PLUS_BUTTON }),
    ),
    el("p", { text: recipe ?? "Kein Bildrezept gespeichert." }),
    copyPrompt,
  );

  // Reiter des Fensters: die Uebersicht kennt jede Referenz, die Dokumente
  // (design.md, Guidelines, Komponenten) nur die importierten.
  const documents = reference.documents ?? {};
  const documentTabs = [
    { id: "design", label: "Design.md", text: documents.design },
    { id: "guidelines", label: "Guidelines", text: documents.guidelines },
    { id: "components", label: "Komponenten", text: documents.components },
  ].filter((entry) => typeof entry.text === "string" && entry.text.trim() !== "");

  const overview = el(
    "div",
    { class: "refs-doc-page", "data-page": "overview" },
    el(
      "div",
      { class: "refs-detail-section" },
      el("h3", { text: "Notiz" }),
      el("p", { text: note }),
    ),
    el(
      "div",
      { class: "refs-detail-section" },
      el("h3", { text: "Design-Vokabular" }),
      el(
        "div",
        { class: "refs-tags" },
        vocabulary.length === 0
          ? el("span", { text: "Kein Vokabular erfasst." })
          : vocabulary.map((word) => el("span", { text: word })),
      ),
    ),
    el(
      "div",
      { class: "refs-detail-section" },
      el("h3", { text: "Komposition & Platzierung" }),
      el("p", { text: heroUsage }),
    ),
    recipeDetails,
    el(
      "div",
      { class: "refs-detail-actions" },
      copyBrief,
      select,
      el("p", {
        class: "refs-preference-status",
        text: brief?.brief?.status ?? "Referenz-Brief.",
      }),
    ),
    refsInspectorActions(reference),
  );

  const pages = [{ id: "overview", label: "Übersicht", page: overview }];
  for (const entry of documentTabs) {
    pages.push({
      id: entry.id,
      label: entry.label,
      page: el(
        "div",
        { class: "refs-doc-page", "data-page": entry.id, hidden: true },
        el(
          "div",
          { class: "refs-doc-actions" },
          el("button", {
            type: "button",
            class: "refs-button quiet refs-copy-document",
            text: "Dokument kopieren",
            onclick: () => refsCopy(entry.text, "Dokument kopiert"),
          }),
        ),
        el("div", { class: "refs-doc", html: refsRenderMarkdown(entry.text) }),
      ),
    });
  }

  const head = el(
    "div",
    {},
    el("div", { class: "refs-eyebrow", text: collection ? collection.name : "Ohne Sammlung" }),
    el("h2", { text: reference.name }),
    el("p", { class: "refs-brief-family", text: family ?? "Ohne Familie" }),
    typeof reference.sourceUrl === "string" && reference.sourceUrl !== ""
      ? el("p", { class: "refs-source-row" }, el("a", {
          class: "refs-source-link",
          href: reference.sourceUrl,
          target: "_blank",
          rel: "noreferrer",
          text: "Live-Preview öffnen",
        }))
      : null,
  );

  if (pages.length > 1) {
    const tabs = el("div", { class: "refs-doc-tabs", role: "tablist" });
    const buttons = pages.map((entry, index) =>
      el("button", {
        type: "button",
        class: "refs-doc-tab",
        role: "tab",
        "data-tab": entry.id,
        "aria-selected": index === 0 ? "true" : "false",
        text: entry.label,
        onclick: () => {
          buttons.forEach((button, buttonIndex) => {
            const active = buttonIndex === index;
            button.setAttribute("aria-selected", active ? "true" : "false");
            pages[buttonIndex].page.hidden = !active;
          });
        },
      }),
    );
    tabs.append(...buttons);
    dom.panel.replaceChildren(head, tabs, ...pages.map((entry) => entry.page));
  } else {
    dom.panel.replaceChildren(head, ...pages.map((entry) => entry.page));
  }
}

// Fenster oeffnen bzw. fuellen. `options.replace` schreibt die Adresse zurueck
// auf die Bibliothek, wenn der Aufruf von einem Deep-Link kommt.

export async function refsOpenInspector(referenceId, options = {}) {
  if (!refsInspector) refsInspector = refsInspectorBuild();
  const dom = refsInspector;
  if (options.list) refsInspectorIds = options.list;
  if (!dom.dialog.open) {
    const active = document.activeElement;
    refsInspectorReturn = active && active.classList.contains("refs-card-art") ? active : null;
    // Seiten-Scroll bleibt gesperrt, solange das Fenster offen ist.
    document.documentElement.style.overflow = "hidden";
    dom.dialog.showModal();
    await refsInspectorShow(referenceId);
    // Startfokus auf den Weiter-Knopf (wie im Vorbild).
    dom.next.focus();
    dom.stage.scrollTop = 0;
    dom.stage.scrollLeft = 0;
    dom.panel.scrollTop = 0;
  } else {
    await refsInspectorShow(referenceId);
  }
  if (options.replace) refsSyncAddress();
}

/* Vorlieben und Haus-DNA im Einstellungen-Tab (T12/T14). */
