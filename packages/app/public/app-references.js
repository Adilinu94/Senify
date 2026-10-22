// Die Referenzbibliothek. Die Bloecke standen in `app.js` und
// sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt
// ESLint.

import { activeTab, api, el, failed, friendlyError, initials, render, routeScope, snapshotImageURL } from "./app-core.js";
import "./app.js";
import "./app-markdown.js";
import { refsBindBackdropClose, refsCopy, refsToast } from "./app-refs-dialog.js";
import { REFS_ICON_LIBRARY, REFS_ICON_STYLES, REFS_ICON_LINK, REFS_ICON_LINK_BUTTON, REFS_ICON_LINK_LABEL, REFS_ICON_PLUS, REFS_ICON_PLUS_BUTTON, REFS_ICON_CLOSE, REFS_ICON_SEARCH_LARGE, REFS_ICON_PLUS_BOX, REFS_ICON_CHECK_BOX } from "./app-refs-icons.js";
import { refsGetCollections, refsState, refsBindCollections, refsBindHandlers, refsHex, refsApplyAddress, refsSyncAddress, refsActiveCollection, refsIsSelected, refsToggleSelection, refsClearSelection } from "./app-refs-state.js";
import { refsBindCollectionHandlers, refsOpenCollectionPicker, refsOpenCollectionDialog, refsCopyCollectionBrief, refsOpenCollectionForm } from "./app-refs-collections.js";
import { refsBindAddHandlers, refsOpenAddDialog } from "./app-refs-add.js";
import { refsImageSource, refsEntryFor, refsOpenDetail, refsSetInspectorIds } from "./app-refs-inspector.js";

// `app.js` holt diese zwei ueber diese Datei (der Router kennt nur die Views).
// Der Re-Export haelt seine Import-Quelle, waehrend die Definition im
// Inspector-Modul liegt.
export { refsInspector, refsOpenInspector } from "./app-refs-inspector.js";

// Zwei Helfer, die andere Module ueber diese Datei beziehen (app-import.js holt
// refsBindBackdropClose, app-projects.js holt refsToast). Der Re-Export haelt
// ihre Import-Quelle, waehrend die Definition im Dialog-Modul liegt.
export { refsBindBackdropClose, refsToast } from "./app-refs-dialog.js";

/* Referenzen-Bibliothek (T14): die Liste mit linker Leiste, Sammlungen,
   Vergleich, Anlegen und Stil-Guide im Zuschnitt des Vorbilds. Der Zustand lebt
   in der Adresse (`?q=&collection=&sort=&view=`), die Texte sind Deutsch mit
   englischen Fachbegriffen. */

const REFS_ACCENT_FALLBACK = "#8b91a0";
const REFS_MAX_COMPARE = 3;
const REFS_SEARCH_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';

let refsStyleCatalog = null;
let refsRouteActive = false;

// Der Router setzt das Flag, wenn die Referenzroute laeuft: das Tray blendet
// sich aus, sobald die Route die Bibliothek verlaesst.
export function setRefsRouteActive(value) {
  refsRouteActive = value;
}

export function isRefsRouteActive() {
  return refsRouteActive;
}

let refsDom = null;
export let refsTray = null;
let refsQueryTimer = null;
let refsEmptyMode = "reset";
let refsTrayIds = [];
let refsPending = 0;

// Eine Snapshot-Vorschau laedt das Programm genau einmal und teilt sie sich:
// Karte, Miniatur, Vergleich und Detailseite zeigen dieselbe Blob-Adresse.
// Sonst fragt jeder Neuaufbau dieselben Bilder erneut an und laeuft ins
// Kontingent der API.

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

function refsPreviewImage(url, alt, fallback) {
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

function refsNavItem(input) {
  const button = el(
    "button",
    {
      type: "button",
      class: `refs-nav-item${input.active ? " active" : ""}`,
      onclick: input.onClick,
      ...(input.active ? { "aria-current": "page" } : {}),
    },
    input.dot
      ? el("span", { class: "refs-dot", style: `--refs-dot:${input.dot}` })
      : el("span", { class: "refs-nav-icon", "aria-hidden": "true", html: input.icon }),
    el("span", { text: input.label }),
    el("span", { class: "refs-nav-count", text: String(input.count) }),
  );
  return button;
}

/* ------------------------------------------------------------- comparison */

function refsTrayEnsure() {
  if (refsTray) return refsTray;
  refsTray = el(
    "div",
    { class: "refs-compare-tray", hidden: "hidden" },
    el("div", { class: "refs-tray-thumbs" }),
    el("span", { class: "refs-tray-count", text: `0 / ${REFS_MAX_COMPARE} ausgewählt` }),
    el("button", {
      type: "button",
      class: "refs-button quiet",
      text: "Leeren",
      onclick: () => refsClearSelection(),
    }),
    el("button", {
      type: "button",
      class: "refs-button primary",
      onclick: () => refsOpenComparison(),
    }, "Referenzen vergleichen", el("span", { "aria-hidden": "true", html: REFS_ICON_LINK_BUTTON })),
  );
  document.body.append(refsTray);
  return refsTray;
}

function refsThumbNode(entry) {
  if (entry.previewPath) {
    return refsPreviewImage(entry.previewPath, `Vorschau ${entry.name}`);
  }
  return el("div", { class: "refs-tray-more", text: initials(entry.name) });
}

function refsUpdateSelectionUI() {
  if (!refsDom || !refsDom.root.isConnected) return;
  for (const card of refsDom.gallery.querySelectorAll(".refs-card")) {
    const id = card.dataset.reference;
    const on = refsIsSelected(id);
    const button = card.querySelector(".refs-select");
    if (!button) continue;
    button.classList.toggle("selected", on);
    button.innerHTML = on ? REFS_ICON_CHECK_BOX : REFS_ICON_PLUS_BOX;
    button.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

export function refsRenderTray() {
  const tray = refsTrayEnsure();
  const selected = refsState.selected;
  tray.hidden = selected.length === 0 || !isRefsRouteActive();
  const ids = selected.map((entry) => entry.id);
  // Die Miniaturen nur neu aufbauen, wenn sich die Auswahl geaendert hat
  // (jede Neuanlage laedt die Vorschauen erneut und kostet Rate-Limit).
  if (ids.join(",") !== refsTrayIds.join(",")) {
    refsTrayIds = ids;
    tray
      .querySelector(".refs-tray-thumbs")
      .replaceChildren(...selected.map((entry) => refsThumbNode(entry)));
  }
  tray.querySelector(".refs-tray-count").textContent =
    `${selected.length} / ${REFS_MAX_COMPARE} ausgewählt`;
  const compareButton = tray.querySelector(".refs-button.primary");
  compareButton.disabled = selected.length < 2;
}

async function refsOpenComparison() {
  if (refsState.selected.length < 2) return;
  const entries = [...refsState.selected];
  const grid = el("div", { class: "refs-compare-grid" });
  grid.style.setProperty("--refs-cols", String(entries.length));
  for (const entry of entries) {
    grid.append(
      el(
        "article",
        { class: "refs-compare-item" },
        el(
          "div",
          { class: "refs-compare-image" },
          entry.previewPath
            ? refsPreviewImage(entry.previewPath, `Vorschau ${entry.name}`)
            : el("div", { class: "refs-card-placeholder", text: initials(entry.name) }),
        ),
        el("h3", { text: entry.name }),
        el("p", { class: "refs-brief-family", text: entry.family ?? "Ohne Familie" }),
        el(
          "div",
          { class: "refs-tags" },
          (entry.vocabulary ?? []).slice(0, 3).map((word) => el("span", { text: word })),
        ),
        el("p", { text: entry.note ?? "Keine Notiz." }),
        el("button", {
          type: "button",
          class: "refs-button",
          onclick: () => {
            dialog.close();
            location.hash = `#/references/${entry.id}`;
          },
        }, "Referenz öffnen", el("span", { "aria-hidden": "true", html: REFS_ICON_LINK_BUTTON })),
      ),
    );
  }
  const dialog = el(
    "dialog",
    { class: "refs-dialog wide refs-compare-dialog" },
    el(
      "div",
      { class: "refs-dialog-head" },
      el(
        "div",
        {},
        el("div", { class: "refs-eyebrow", text: "Zusammen erkunden" }),
        el("h2", { text: "Referenzen vergleichen" }),
      ),
      el(
        "div",
        { class: "refs-dialog-tools" },
        el("button", {
          type: "button",
          class: "refs-icon-button",
          "aria-label": "Schliessen",
          html: REFS_ICON_CLOSE,
          onclick: () => dialog.close(),
        }),
      ),
    ),
    grid,
    el(
      "div",
      { class: "refs-compare-footer" },
      el("p", {
        text: "Ein Brief mit allen gewählten Referenzen, ihrem Vokabular und Bildrezept.",
      }),
      el("button", {
        type: "button",
        class: "refs-button primary",
        text: "Brief zusammen kopieren",
        onclick: () => refsCopyCombined(entries.map((entry) => entry.id)),
      }),
    ),
  );
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  refsBindBackdropClose(dialog);
  dialog.showModal();
}

async function refsCopyCombined(ids) {
  try {
    const result = await api("/api/references/brief", {
      method: "POST",
      body: { referenceIds: ids },
    });
    refsCopy(result.brief.text, "Brief kopiert");
  } catch (error) {
    failed(error);
  }
}

/* ------------------------------------------------------------ style guide */

function refsStyleCard(collection) {
  const accent = refsHex(collection.accent);
  const preview = el(
    "div",
    { class: "refs-style-preview" },
    el("strong", { text: collection.name }),
    el("small", { text: collection.deployFor || "Stilfamilie" }),
  );
  if (/^#[0-9a-f]{6}$/i.test(collection.accent ?? "")) {
    preview.style.setProperty("--refs-preview", `${accent}22`);
    preview.style.setProperty("--refs-preview-ink", accent);
  }
  return el(
    "article",
    { class: "refs-style-card" },
    preview,
    el(
      "div",
      { class: "refs-style-copy" },
      el("h2", { text: collection.name }),
      el("p", { text: collection.recognize.join(" · ") || collection.description || "" }),
      el(
        "div",
        { class: "refs-tags" },
        collection.vocabulary.map((word) => el("span", { text: word })),
      ),
      collection.warning
        ? el("p", { class: "refs-style-warning", text: collection.warning })
        : undefined,
      el(
        "div",
        { class: "refs-style-links" },
        collection.examples
          .filter((example) => /^https?:\/\//.test(example.url))
          .map((example) =>
            el(
              "a",
              {
                href: example.url,
                target: "_blank",
                rel: "noopener noreferrer",
              },
              example.name,
              el("span", { class: "refs-style-arrow", "aria-hidden": "true", html: REFS_ICON_LINK_LABEL }),
            ),
          ),
      ),
      el(
        "div",
        { class: "refs-style-actions" },
        el("button", {
          type: "button",
          class: "refs-button",
          text: "Brief kopieren",
          onclick: () => refsCopyCollectionBrief(collection.id),
        }),
        el("button", {
          type: "button",
          class: "refs-button quiet",
          text: "Vokabular kopieren",
          onclick: () => refsCopy(collection.vocabulary.join(", "), "Vokabular kopiert"),
        }),
      ),
    ),
  );
}

/* ---------------------------------------------------------------- shell */

function refsBuildShell() {
  const libraryNav = el("nav", { "aria-label": "Bibliothek" });
  const collectionNav = el("nav", { "aria-label": "Sammlungen" });
  const collectionCount = el("span", { class: "refs-nav-count" });
  const sidebarCount = el("span", {});
  const sidebar = el(
    "aside",
    { class: "refs-sidebar", "aria-label": "Bibliothek-Navigation" },
    el("div", { class: "refs-sidebar-heading", style: "margin-top: 0" }, el("span", { text: "Bibliothek" })),
    libraryNav,
    el(
      "div",
      { class: "refs-sidebar-heading refs-collection-label" },
      el("span", {}, "Sammlungen ", collectionCount),
      el("button", {
        type: "button",
        class: "refs-sidebar-add",
        title: "Sammlung anlegen",
        html: REFS_ICON_PLUS,
        onclick: () => refsOpenCollectionForm(null),
      }),
    ),
    collectionNav,
    el(
      "div",
      { class: "refs-sidebar-footer" },
      el("span", {}, el("span", { class: "refs-status-dot" }), "Deine Sammlung, auf deinem Rechner."),
      sidebarCount,
    ),
  );

  const titleText = el("h1", { text: "Alle Referenzen" });
  const countEl = el("span", { class: "refs-count", text: "0" });
  const description = el("p", {});
  const aboutButton = el(
    "button",
    {
      type: "button",
      class: "refs-button quiet",
      onclick: () => refsOpenCollectionDialog(refsActiveCollection()),
    },
    "Über diese Sammlung ",
    el("span", { "aria-hidden": "true", html: REFS_ICON_LINK }),
  );
  aboutButton.hidden = true;
  // Die Seitenaktionen sitzen im Kopf (rechter Platz der Ueberschrift), weil
  // unsere App-Kopfzeile die Navigation traegt. Der Hauptbereich beginnt so
  // genau wie im Vorbild unter der Kopfzeile.
  const addButton = el(
    "button",
    {
      type: "button",
      class: "refs-button primary",
      onclick: () => refsOpenAddDialog(),
    },
    el("span", { "aria-hidden": "true", html: REFS_ICON_PLUS_BUTTON }),
    " Referenz hinzufügen",
  );
  const headingActions = el(
    "div",
    { class: "refs-heading-actions" },
    aboutButton,
    addButton,
  );
  const heading = el(
    "section",
    { class: "refs-heading" },
    el(
      "div",
      {},
      el("div", { class: "refs-heading-title" }, titleText, countEl),
      description,
    ),
    headingActions,
  );

  const searchInput = el("input", {
    type: "search",
    "aria-label": "Referenzen, Stile und Details suchen",
    placeholder: "Referenzen, Stile, Details suchen…",
  });
  searchInput.value = refsState.query;
  searchInput.addEventListener("input", () => {
    refsState.query = searchInput.value.trim();
    refsSyncAddress();
    if (refsQueryTimer) clearTimeout(refsQueryTimer);
    refsQueryTimer = setTimeout(() => void refsRefresh(), 220);
  });
  const search = el("label", { class: "refs-search" });
  search.innerHTML = REFS_SEARCH_ICON;
  search.append(searchInput, el("kbd", { "aria-hidden": "true", text: "/" }));
  const sortSelect = el("select", { "aria-label": "Sortierung" });
  sortSelect.append(
    el("option", { value: "newest", text: "Neueste zuerst" }),
    el("option", { value: "name", text: "Name A–Z" }),
  );
  sortSelect.value = refsState.sort;
  sortSelect.addEventListener("change", () => {
    refsState.sort = sortSelect.value === "name" ? "name" : "newest";
    refsSyncAddress();
    void refsRefresh();
  });
  const toolbar = el(
    "div",
    { class: "refs-toolbar" },
    search,
    el("label", { class: "refs-sort" }, el("span", { text: "Sortieren" }), sortSelect),
  );

  // Fortschrittsbalken unter der Werkzeugleiste. Seine Hoehe ist immer
  // reserviert, damit die Liste beim Wechsel nicht springt.
  const progress = el(
    "div",
    { class: "refs-progress", "aria-hidden": "true" },
    el("span", { class: "refs-progress-bar" }),
  );

  const hint = el(
    "div",
    { class: "refs-hint" },
    el("span", { text: "Wähle bis zu 3 Referenzen zum Vergleichen" }),
  );
  const error = el(
    "section",
    { class: "refs-error", role: "alert", hidden: "hidden" },
    el("strong", { text: "Bibliothek konnte nicht geladen werden" }),
    el("span", { class: "refs-error__detail" }),
    el("button", {
      type: "button",
      class: "refs-button",
      text: "Erneut versuchen",
      onclick: () => void refsRefresh(),
    }),
  );
  const gallery = el("div", { class: "refs-gallery" });
  const empty = el(
    "section",
    { class: "refs-empty", hidden: "hidden" },
    el("span", { class: "refs-empty-icon", "aria-hidden": "true", html: REFS_ICON_SEARCH_LARGE }),
    el("h2", { text: "Keine Referenzen gefunden" }),
    el("p", { text: "Versuche ein anderes Wort oder durchsuche die ganze Bibliothek." }),
    el("button", {
      type: "button",
      class: "refs-button",
      text: "Filter zurücksetzen",
      onclick: () => refsEmptyAction(),
    }),
  );
  const footer = el(
    "div",
    { class: "refs-page-footer" },
    el("span", { class: "refs-footer-count" }),
    el("span", { text: "Gute Arbeit beginnt mit einer guten Referenz." }),
  );

  // Unter 1000px ist die linke Leiste ausgeblendet, dann waehlt man die
  // Ansicht ueber dieses Feld (Muster und Maße wie im Vorbild).
  const mobileSelect = el("select", { "aria-label": "Sammlung oder Ansicht wählen" });
  mobileSelect.addEventListener("change", () => {
    if (mobileSelect.value === "styles") refsSetView("styles");
    else if (mobileSelect.value === "") refsSetView("");
    else refsSetCollection(mobileSelect.value);
  });
  const mobileNav = el(
    "label",
    { class: "refs-mobile-nav" },
    el("span", { text: "Sammlung" }),
    mobileSelect,
  );

  const main = el(
    "div",
    { class: "refs-main", id: "refs-main", tabindex: "-1" },
    mobileNav,
    heading,
    toolbar,
    progress,
    hint,
    gallery,
    empty,
    footer,
  );

  // Skip-Link: der erste Fokus der Seite springt zum Hauptinhalt.
  const skipLink = el(
    "a",
    {
      class: "refs-skip-link",
      href: "#refs-main",
      onclick: (event) => {
        event.preventDefault();
        main.focus();
      },
    },
    "Zum Hauptinhalt springen",
  );

  const root = el("div", { class: "refs-shell" }, skipLink, sidebar, main);
  // Die App-Kopfzeile steht sticky ueber der Seite; die Leiste beginnt genau
  // darunter. Statt die Hoehe zu schaetzen, messen wir sie.
  const header = document.querySelector(".topbar");
  if (header) {
    root.style.setProperty(
      "--refs-top",
      `${Math.round(header.getBoundingClientRect().height)}px`,
    );
  }
  refsDom = {
    root,
    main,
    mobileSelect,
    libraryNav,
    collectionNav,
    collectionCount,
    sidebarCount,
    titleText,
    countEl,
    description,
    aboutButton,
    hint,
    error,
    progress,
    searchInput,
    sortSelect,
    gallery,
    empty,
    footer,
  };
  return refsDom;
}

function refsResetFilters() {
  refsState.query = "";
  refsState.collection = "";
  refsState.view = "";
  refsState.sort = "newest";
  if (refsDom) {
    refsDom.searchInput.value = "";
    refsDom.sortSelect.value = "newest";
  }
  refsSyncAddress();
  void refsRefresh();
}

export async function referencesView() {
  const current = routeScope();
  activeTab("references");
  refsApplyAddress();
  const dom = refsBuildShell();
  if (!render([dom.root], current)) return;
  await refsRefresh();
  refsRenderTray();
}

async function refsRefresh() {
  if (!refsDom) return;
  // Adresszustand zuerst in die Bedienelemente spiegeln: Suche und Sortierung
  // stimmen so auch dann, wenn der Listenabruf scheitert.
  refsDom.searchInput.value = refsState.query;
  refsDom.sortSelect.value = refsState.sort;
  // Beim Wechsel bleiben die bisherigen Karten mit reduzierter Deckkraft
  // stehen, darueber laeuft der Fortschrittsbalken. Der Zaehler haelt den
  // Zustand, solange noch ein Abruf offen ist (Suche tippt sich schneller).
  const root = refsDom.root;
  refsPending += 1;
  root.classList.add("refs-loading");
  let data;
  try {
    data = await api(`/api/references?${refsSearchParams().toString()}`);
  } catch (error) {
    // Ein kurzer Fehler (etwa ein erschoepftes Kontingent) darf die Ansicht
    // nicht leeren: die vorhandenen Karten bleiben stehen, nur eine Meldung.
    refsDom.error.hidden = false;
    refsDom.error.querySelector(".refs-error__detail").textContent = friendlyError(error);
    failed(error);
    return;
  } finally {
    refsPending = Math.max(0, refsPending - 1);
    if (refsPending === 0) root.classList.remove("refs-loading");
  }
  refsDom.error.hidden = true;
  refsBindCollections(data.collections ?? []);
  refsStyleCatalog = data.styleCatalog ?? null;
  const counts = data.counts ?? {};
  const styleMode = refsState.view === "styles";
  const activeCollection = refsActiveCollection();
  const styleFamilies = refsGetCollections().filter((entry) => entry.kind === "style");
  const personalCollections = refsGetCollections().filter((entry) => entry.kind !== "style");

  // Mobil: dasselbe Ziel wie die linke Leiste, nur als Auswahlfeld.
  refsDom.mobileSelect.replaceChildren(
    el("option", { value: "", text: "Alle Referenzen" }),
    ...personalCollections.map((collection) =>
      el("option", {
        value: collection.id,
        text: `${collection.name} (${collection.referenceCount ?? 0})`,
      }),
    ),
    el("option", { value: "styles", text: "Stil-Guide" }),
  );
  refsDom.mobileSelect.value = styleMode ? "styles" : refsState.collection;

  // Linke Leiste
  refsDom.libraryNav.replaceChildren(
    refsNavItem({
      label: "Alle Referenzen",
      count: counts.references ?? 0,
      icon: REFS_ICON_LIBRARY,
      active: !styleMode && refsState.collection === "",
      onClick: () => refsSetView(""),
    }),
    refsNavItem({
      label: "Stil-Guide",
      count: counts.styles ?? 0,
      icon: REFS_ICON_STYLES,
      active: styleMode,
      onClick: () => refsSetView("styles"),
    }),
  );
  refsDom.collectionCount.textContent = String(personalCollections.length);
  if (personalCollections.length === 0) {
    refsDom.collectionNav.replaceChildren(
      el("div", { class: "muted", style: "font-size: 11px; padding: 0 12px", text: "Noch keine Sammlungen." }),
    );
  } else {
    const sortedCollections = [...personalCollections].sort(
      (a, b) => (b.referenceCount ?? 0) - (a.referenceCount ?? 0),
    );
    const visibleCollections = sortedCollections.slice(0, 6);
    const activeCollection = sortedCollections.find(
      (collection) => !styleMode && refsState.collection === collection.id,
    );
    if (activeCollection && !visibleCollections.includes(activeCollection)) {
      visibleCollections.push(activeCollection);
    }
    const remainingCollections = sortedCollections.filter(
      (collection) => !visibleCollections.includes(collection),
    );
    refsDom.collectionNav.replaceChildren(
      ...visibleCollections.map((collection) =>
        refsNavItem({
          label: collection.name,
          count: collection.referenceCount ?? 0,
          dot: refsHex(collection.accent),
          active: !styleMode && refsState.collection === collection.id,
          onClick: () => refsSetCollection(collection.id),
        }),
      ),
      remainingCollections.length > 0
        ? refsNavItem({
            label: "Weitere …",
            count: remainingCollections.length,
            icon: REFS_ICON_LIBRARY,
            onClick: () => refsOpenCollectionPicker(remainingCollections),
          })
        : null,
    );
  }
  refsDom.sidebarCount.textContent =
    `${counts.references ?? 0} Referenzen · ${personalCollections.length} Sammlungen`;

  // Kopfbereich
  if (styleMode) {
    refsDom.titleText.textContent = "Stil-Guide";
    refsDom.description.textContent = "Erkunde die visuellen Sprachen hinter der Arbeit.";
  } else if (activeCollection) {
    refsDom.titleText.textContent = activeCollection.name;
    refsDom.description.textContent = "Ein anderer Blickwinkel. Für das richtige Projekt aufgehoben.";
  } else if (refsState.collection === "none") {
    refsDom.titleText.textContent = "Ohne Sammlung";
    refsDom.description.textContent = "Referenzen, die noch keiner Sammlung zugeordnet sind.";
  } else {
    refsDom.titleText.textContent = "Alle Referenzen";
    refsDom.description.textContent = "Sammle, was dein Auge fängt. Mach es zu deinem.";
  }
  refsDom.aboutButton.hidden = !activeCollection;
  refsDom.hint.hidden = styleMode;

  // Hauptbereich
  if (styleMode) {
    const filtered = styleFamilies.filter((collection) => refsStyleMatches(collection, refsState.query));
    if (filtered.length === 0 && styleFamilies.length === 0 && (refsStyleCatalog?.total ?? 0) > 0) {
      refsEmptyMode = "seed";
      refsDom.gallery.replaceChildren();
      refsDom.empty.querySelector("h2").textContent = "Stil-Katalog noch nicht eingespielt";
      refsDom.empty.querySelector("p").textContent =
        "Die Stilfamilien des Stil-Guides liegen bereit und lassen sich einmalig laden.";
      refsDom.empty.querySelector("button").textContent = "Stil-Katalog einspielen";
      refsDom.empty.hidden = false;
    } else {
      refsEmptyMode = "reset";
      refsDom.empty.querySelector("h2").textContent = "Keine Stile gefunden";
      refsDom.empty.querySelector("p").textContent = "Versuche ein anderes Wort.";
      refsDom.empty.querySelector("button").textContent = "Filter zurücksetzen";
      refsDom.empty.hidden = filtered.length > 0;
      refsDom.gallery.replaceChildren(...filtered.map((collection) => refsStyleCard(collection)));
    }
    refsDom.countEl.textContent = String(filtered.length);
    refsDom.footer.querySelector(".refs-footer-count").textContent = refsFooterText(
      filtered.length,
      "Stile",
      refsState.query,
    );
  } else {
    const references = data.references ?? [];
    refsEmptyMode = "reset";
    refsDom.empty.querySelector("h2").textContent = "Keine Referenzen gefunden";
    refsDom.empty.querySelector("p").textContent =
      "Versuche ein anderes Wort oder durchsuche die ganze Bibliothek.";
    refsDom.empty.querySelector("button").textContent = "Filter zurücksetzen";
    refsDom.empty.hidden = references.length > 0;
    refsRenderCards(references, refsDom.gallery);
    // Die Zaehlung im Fenster ("Referenz x von n") folgt der vollen Auswahl,
    // nicht nur den bereits gezeichneten Karten.
    refsSetInspectorIds(references.map((reference) => reference.id));
    refsDom.countEl.textContent = String(counts.inView ?? references.length);
    refsDom.footer.querySelector(".refs-footer-count").textContent = refsFooterText(
      counts.inView ?? references.length,
      "Referenzen",
      refsState.query,
    );
  }
  refsTrayResync();
}

// Karten in Bloecken zeichnen: bei mehreren hundert Referenzen waeren alle
// Karten samt Bildern auf einmal zu viel. Der Waechter am Ende der Liste zieht
// den naechsten Block nach, sobald er in Sicht kommt.

const REFS_CARD_BATCH = 48;
let refsCardObserver = null;

function refsRenderCards(references, gallery) {
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

function refsEmptyAction() {
  if (refsEmptyMode === "seed") void refsSeedStyles();
  else refsResetFilters();
}

function refsStyleMatches(collection, query) {
  if (query === "") return true;
  return [collection.name, ...(collection.recognize ?? []), ...(collection.vocabulary ?? [])]
    .join(" ")
    .toLowerCase()
    .includes(query.toLowerCase());
}

function refsFooterText(count, noun, query) {
  return `${count} ${noun}${query === "" ? " in Sicht" : ` passend zu “${query}”`}`;
}

function refsSetView(view) {
  refsState.view = view;
  refsState.collection = "";
  refsSyncAddress();
  void refsRefresh();
}

function refsSetCollection(collectionId) {
  refsState.collection = collectionId;
  refsState.view = "";
  refsSyncAddress();
  void refsRefresh();
}

async function refsSeedStyles() {
  try {
    const result = await api("/api/reference-collections/styles", { method: "POST" });
    refsToast(`${result.seed?.created ?? 0} Stilfamilien eingespielt`);
    await refsRefresh();
  } catch (error) {
    failed(error);
  }
}

function refsSearchParams() {
  const params = new window.URLSearchParams();
  if (refsState.query !== "") params.set("q", refsState.query);
  if (refsState.collection !== "") params.set("collection", refsState.collection);
  if (refsState.sort !== "newest") params.set("sort", refsState.sort);
  return params;
}

function refsTrayResync() {
  refsRenderTray();
}

function refsCard(reference) {
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

function refsCardImage(reference) {
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

// Aufklappbare Bausteine der Detailspalte (Rezept, Profil und Aktionen).

export function refsFold(title, body, open) {
  const details = el("details", { class: "refs-fold" });
  if (open) details.open = true;
  details.append(el("summary", { text: title }), el("div", { class: "refs-fold-body" }, body));
  return details;
}

/* Referenz-Fenster (Popup). Aufbau, Masse und Verhalten stammen aus dem Vorbild
   `Repos/taste-vault` (MIT, Taste Vault von cth9191): `<dialog>` mit
   `showModal()`, Kopfbereich mit Zaehler und Werkzeugen, zwei Spalten
   (Bildbuehne + Detailspalte) und ein aufklappbares Bildrezept. Die Texte sind
   deutsch. */

// Ids der aktuellen Ansicht: die volle Auswahl der Liste (Suche, Sammlung und
// Sortierung zaehlen mit). So zaehlt „Referenz x von n" auch dann richtig, wenn
// die Karten erst in Bloecken gezeichnet werden.

// Die Rueckrufe des Zustands-Moduls an die echten Funktionen binden.
// Sie stehen am Ende, weil beide Funktionen Funktionsdeklarationen sind und
// damit gehoisted werden - der Aufruf ist zur Ladezeit sicher.
refsBindHandlers({ toast: refsToast, renderTray: refsRenderTray, updateSelectionUI: refsUpdateSelectionUI });

// Die zwei Rueckrufe der Sammlungen. `refsRefresh` und `refsSetCollection`
// liegen hier, weil sie die ganze Seite betreffen; das Sammlungs-Modul ruft
// sie ueber diese Bindung.
refsBindCollectionHandlers({ refresh: refsRefresh, setCollection: refsSetCollection });

// Der Rueckruf des Add-Dialogs: die Liste neu laden.
refsBindAddHandlers({ refresh: refsRefresh });
