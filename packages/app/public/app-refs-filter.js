// Der Filter- und Kopfblock der Referenzen-Seite: Suchparameter, Stil-Treffer,
// Fusszeilentext, Kopfzeile und Standardfilter. Hier steht nur die Rechnung;
// die Seite spiegelt das Ergebnis in ihre Bedienelemente.

// Was der Zuruecksetzen-Knopf setzt. Eine Stelle statt vier Zuweisungen: wer
// einen Filter ergaenzt, ergaenzt ihn hier, und `refsResetFilters` folgt.
export const REFS_DEFAULT_FILTER = Object.freeze({
  query: "",
  collection: "",
  view: "",
  sort: "newest",
});

// Nur was vom Standard abweicht, steht in der Adresse der Liste. Der
// Ansichts-Schalter (`view=styles`) gehoert nicht dazu: die Stilfamilien
// filtert die Seite selbst, die API kennt ihn nicht.
export function refsSearchParams(state) {
  const params = new URLSearchParams();
  if (state.query !== "") params.set("q", state.query);
  if (state.collection !== "") params.set("collection", state.collection);
  if (state.sort !== "newest") params.set("sort", state.sort);
  return params;
}

// Ein Stil trifft, wenn Name, Wiedererkennung oder Vokabular den Suchbegriff
// enthalten - die drei Felder sind das, was der Stil-Guide beschreibt.
export function refsStyleMatches(collection, query) {
  if (query === "") return true;
  return [collection.name, ...(collection.recognize ?? []), ...(collection.vocabulary ?? [])]
    .join(" ")
    .toLowerCase()
    .includes(query.toLowerCase());
}

export function refsFooterText(count, noun, query) {
  return `${count} ${noun}${query === "" ? " in Sicht" : ` passend zu “${query}”`}`;
}

// Die Reihenfolge ist die Regel: Stil-Guide schlaegt alles, dann die gewaehlte
// Sammlung, dann der Sonderfall "ohne Sammlung", dann die ganze Bibliothek.
export function refsHeaderText({ styleMode, collection, activeCollection }) {
  if (styleMode) {
    return { title: "Stil-Guide", description: "Erkunde die visuellen Sprachen hinter der Arbeit." };
  }
  if (activeCollection) {
    return {
      title: activeCollection.name,
      description: "Ein anderer Blickwinkel. Für das richtige Projekt aufgehoben.",
    };
  }
  if (collection === "none") {
    return {
      title: "Ohne Sammlung",
      description: "Referenzen, die noch keiner Sammlung zugeordnet sind.",
    };
  }
  return {
    title: "Alle Referenzen",
    description: "Sammle, was dein Auge fängt. Mach es zu deinem.",
  };
}
