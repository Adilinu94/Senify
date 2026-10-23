// Die Huelle der Referenzen-Seite (P3-2, Schritt 52): Kopfzeile,
// Seitenleiste, Suche, Sortierung, Galerie und Fusszeile.
//
// Der Block stand in `app-references.js` und war mit 231 Zeilen der letzte
// grosse Rest. Er baut nur Markup und haengt an vier Stellen am Zustand:
// Suche und Sortierung (gelesen und geschrieben), die DOM-Sammlung (die
// zurueckgeht) und der Timer der Suche (gelesen, geloescht, neu gesetzt).
// Die vier eigenen Funktionen der Seite kommen als Rueckrufe herein.

import { el } from "./app-core.js";
import {
  REFS_ICON_LINK,
  REFS_ICON_PLUS,
  REFS_ICON_PLUS_BUTTON,
  REFS_ICON_SEARCH_LARGE,
} from "./app-refs-icons.js";
import { refsActiveCollection, refsState, refsSyncAddress } from "./app-refs-state.js";
import { refsOpenCollectionDialog, refsOpenCollectionForm } from "./app-refs-collections.js";
import { refsOpenAddDialog } from "./app-refs-add.js";

// Das Lupensymbol der Suche. Es stand als lokale Konstante in
// `app-references.js`; es gehoert zu dieser Huelle und zu keiner anderen
// Seite - deshalb steht es hier und nicht im Symbol-Modul.
const REFS_SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';

/**
 * Baut die Huelle und gibt die DOM-Sammlung zurueck.
 *
 * `ctx.refresh()`, `ctx.emptyAction()`, `ctx.setView()` und
 * `ctx.setCollection()` sind die Funktionen der Seite;
 * `ctx.getQueryTimer()`/`ctx.setQueryTimer()` verwalten den Suchtimer.
 */
export function refsBuildShell(ctx) {
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
    const laufend = ctx.getQueryTimer();
    if (laufend) clearTimeout(laufend);
    ctx.setQueryTimer(setTimeout(() => void ctx.refresh(), 220));
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
    void ctx.refresh();
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
      onclick: () => void ctx.refresh(),
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
      onclick: () => ctx.emptyAction(),
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
    if (mobileSelect.value === "styles") ctx.setView("styles");
    else if (mobileSelect.value === "") ctx.setView("");
    else ctx.setCollection(mobileSelect.value);
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
  const dom = {
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
  return dom;
}
