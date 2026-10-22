// Die Symbole der Referenzen-Seite (P3-2, Schritt 37): `refsIcon` erzeugt aus
// einem Pfad ein eingebettetes SVG mit `currentColor` und fester Groesse.
//
// Vorher lagen sie in `app-references.js`. Sie stehen jetzt fuer sich, weil
// mehrere Module sie brauchen: die Seite selbst und der Dialog-Block. Ein
// eigenes Modul ist die einzige Loesung, die keine Kopie einfuehrt.

export function refsIcon(path, size) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export const REFS_ICON_LIBRARY = refsIcon(
  '<rect x="3.6" y="3.6" width="7" height="7" rx="1.6"/><rect x="13.4" y="3.6" width="7" height="7" rx="1.6"/><rect x="3.6" y="13.4" width="7" height="7" rx="1.6"/><rect x="13.4" y="13.4" width="7" height="7" rx="1.6"/>',
  15,
);

export const REFS_ICON_STYLES = refsIcon(
  '<path d="M12 3.6 20.4 12 12 20.4 3.6 12Z"/><path d="M12 8.6 15.4 12 12 15.4 8.6 12Z"/>',
  15,
);

export const REFS_ICON_LINK = refsIcon('<path d="M8.2 15.8 15.8 8.2M9.6 8.2h6.2v6.2"/>', 15);

export const REFS_ICON_LINK_BUTTON = refsIcon('<path d="M8.2 15.8 15.8 8.2M9.6 8.2h6.2v6.2"/>', 13);

export const REFS_ICON_LINK_LABEL = refsIcon('<path d="M8.2 15.8 15.8 8.2M9.6 8.2h6.2v6.2"/>', 12);

export const REFS_ICON_PLUS = refsIcon('<path d="M12 5.4v13.2M5.4 12h13.2"/>', 15);

export const REFS_ICON_PLUS_BUTTON = refsIcon('<path d="M12 5.4v13.2M5.4 12h13.2"/>', 13);

export const REFS_ICON_PLUS_UPLOAD = refsIcon('<path d="M12 5.4v13.2M5.4 12h13.2"/>', 25);
export const REFS_ICON_CLOSE = refsIcon('<path d="M6.8 6.8 17.2 17.2M17.2 6.8 6.8 17.2"/>', 17);

export const REFS_ICON_PREV = refsIcon('<path d="M14.4 5.6 8 12l6.4 6.4"/>', 17);

export const REFS_ICON_NEXT = refsIcon('<path d="M9.6 5.6 16 12l-6.4 6.4"/>', 17);

export const REFS_ICON_SEARCH_LARGE = refsIcon(
  '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  35,
);

export const REFS_ICON_PLUS_BOX = refsIcon('<path d="M12 6.2v11.6M6.2 12h11.6"/>', 25);

export const REFS_ICON_CHECK_BOX = refsIcon('<path d="M5.6 12.4 10 16.8 18.4 7.6"/>', 25);
