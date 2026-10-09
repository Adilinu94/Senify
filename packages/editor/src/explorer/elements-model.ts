// Elemente-Panel (E4), Datenseite: welche Bausteine als Kachel erscheinen, in
// welchen Kategorien, mit welchem Symbol. Rein und ohne DOM, damit ein
// Vitest-Test die Zaehlung und die Suche pruefen kann.

import { CATEGORIES, primitivesByCategory } from "@senify/widget-engine";
import type { EditorIconName } from "../ui/icons.ts";

// Die Seitenwurzel und der Traeger fuer importierten Fremd-Code setzt niemand
// von Hand ein; die Schnellzugriff-Chips lassen die Wurzel ebenfalls aus.
export const ELEMENT_NOT_INSERTABLE: ReadonlySet<string> = new Set(["root", "payload"]);

// Ein Symbol je Baustein. Fehlt ein Eintrag, faellt die Kachel auf `box` zurueck;
// der Test haelt die Tabelle mit dem Katalog deckungsgleich.
export const ELEMENT_ICONS: Readonly<Record<string, EditorIconName>> = {
  frame: "frame",
  column: "columns",
  grid: "grid",
  section: "rows",
  heading: "heading",
  text: "text",
  body: "paragraph",
  button: "button",
  link: "link",
  list: "list",
  image: "image",
  video: "video",
  icon: "star",
  input: "input",
  select: "select",
  checkbox: "checkbox",
  submit: "send",
  table: "table",
  accordion: "accordion",
  divider: "divider",
  embed: "code",
  collection: "collection",
};

export type ElementTile = {
  type: string;
  name: string;
  description: string;
  icon: EditorIconName;
};

export type ElementGroup = {
  id: string;
  name: string;
  tiles: ElementTile[];
};

// Kategorien in Katalog-Reihenfolge; leere Kategorien (etwa nach einer Suche)
// entfallen. Die Suche trifft Anzeigename und Typ, ohne auf Gross-/Kleinschreibung
// zu achten.
export function buildElementGroups(query = ""): ElementGroup[] {
  const needle = query.trim().toLowerCase();
  const groups: ElementGroup[] = [];
  for (const category of [...CATEGORIES].sort((a, b) => a.order - b.order)) {
    const tiles: ElementTile[] = [];
    for (const primitive of primitivesByCategory(category.id)) {
      if (ELEMENT_NOT_INSERTABLE.has(primitive.type)) continue;
      if (
        needle !== "" &&
        !primitive.name.toLowerCase().includes(needle) &&
        !primitive.type.toLowerCase().includes(needle)
      ) {
        continue;
      }
      tiles.push({
        type: primitive.type,
        name: primitive.name,
        description: primitive.description,
        icon: ELEMENT_ICONS[primitive.type] ?? "box",
      });
    }
    if (tiles.length > 0) groups.push({ id: category.id, name: category.name, tiles });
  }
  return groups;
}
