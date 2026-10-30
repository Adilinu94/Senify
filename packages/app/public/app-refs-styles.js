// Der Stil-Guide der Referenzen-Seite: je Stilfamilie eine Karte mit Vorschau,
// Vokabular, Beispielen und den beiden Kopier-Aktionen. Der Block stand in
// `app-references.js` und ist bis auf das `export` unveraendert hierher gewandert;
// was dort bleibt, sind Auswahl, Suche und der Aufbau der Seite.

import { el } from "./app-core.js";
import { refsCopy } from "./app-refs-dialog.js";
import { refsHex } from "./app-refs-state.js";
import { refsCopyCollectionBrief } from "./app-refs-collections.js";
import { REFS_ICON_LINK_LABEL } from "./app-refs-icons.js";

/* Referenzen-Bibliothek (T14): die Stil-Karten. Jede Karte ist eine Sammlung im
   Stil-Guide; die Aktionen schreiben in die Zwischenablage und melden sich ueber
   den Dialog des Referenzen-Moduls. */

/* ------------------------------------------------------------ style guide */

export function refsStyleCard(collection) {
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
