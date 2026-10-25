import type {
  CategoryDefinition,
  Choice,
  Control,
  GapsValue,
  PrimitiveDefinition,
  PropValue,
  SpacingValue,
  StyleGroup,
  StyleGroupDefinition,
  Unit,
} from "./types.ts";
import { componentPrimitive, legacyPrimitive } from "./legacy.ts";

export const CATEGORIES: readonly CategoryDefinition[] = [
  { id: "layout", name: "Layout", order: 1 },
  { id: "basic", name: "Basis", order: 2 },
  { id: "media", name: "Media", order: 3 },
  { id: "form", name: "Formular", order: 4 },
  { id: "advanced", name: "Erweitert", order: 5 },
];

// Display order of the inspector's style sections. Since ADR-0005 this is a
// *presentation* order — it no longer decides which property a primitive may
// carry. `layout` leads because display, position and overflow are the ground
// the other values sit on.
export const STYLE_GROUPS: readonly StyleGroupDefinition[] = [
  { id: "layout", name: "Layout" },
  { id: "spacing", name: "Abstand" },
  { id: "typography", name: "Schrift" },
  { id: "color", name: "Farbe" },
  { id: "border", name: "Rahmen" },
  { id: "size", name: "Größe" },
  { id: "effects", name: "Effekte" },
];

const ALL_STYLE_GROUPS: StyleGroup[] = [
  "layout",
  "spacing",
  "typography",
  "color",
  "border",
  "size",
  "effects",
];

export const ALL_PRIMITIVE_STYLE_GROUPS = ALL_STYLE_GROUPS;

// --- control builders -------------------------------------------------------

function ctrl(
  key: string,
  label: string,
  kind: Control["kind"],
  valueType: Control["valueType"],
  value: PropValue,
  extra: Partial<Control> = {},
): Control {
  return { key, label, kind, valueType, default: value, ...extra };
}

const text = (key: string, label: string, value = ""): Control =>
  ctrl(key, label, "text", "string", value);

const area = (key: string, label: string, value = ""): Control =>
  ctrl(key, label, "textarea", "string", value, { responsive: false });

const url = (key: string, label: string, value = ""): Control =>
  ctrl(key, label, "url", "string", value);

const num = (
  key: string,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
): Control => ctrl(key, label, "number", "number", value, { min, max, step });

const slider = (
  key: string,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  units: Unit[] = ["px"],
): Control =>
  ctrl(key, label, "slider", "number", value, { min, max, step, units });

const toggle = (key: string, label: string, value = false): Control =>
  ctrl(key, label, "switcher", "boolean", value, { responsive: false });

const color = (key: string, label: string, value = "#ffffff"): Control =>
  ctrl(key, label, "color", "color", value, { alpha: true });

const media = (key: string, label: string): Control =>
  ctrl(key, label, "media", "asset", "", { responsive: false });

function O(...pairs: Array<[string, string]>): Choice[] {
  return pairs.map(([value, label]) => ({ value, label }));
}

function S(...values: string[]): Choice[] {
  return values.map((value) => ({ value, label: value }));
}

const choose = (
  key: string,
  label: string,
  options: Choice[],
  value: string,
): Control => ctrl(key, label, "choose", "enum", value, { options });

const select = (
  key: string,
  label: string,
  options: Choice[],
  value: string,
): Control => ctrl(key, label, "select", "enum", value, { options });

const spacing = (key: string, label: string, value: SpacingValue): Control =>
  ctrl(key, label, "dimensions", "spacing", value, {
    units: ["px", "rem", "em", "%"],
    min: 0,
    max: 400,
    step: 1,
    linkable: true,
  });

const gaps = (key: string, label: string, value: GapsValue): Control =>
  ctrl(key, label, "gaps", "gaps", value, {
    units: ["px", "rem", "em", "%", "fr"],
    min: 0,
    max: 400,
    step: 1,
    linkable: true,
  });

const repeater = (
  key: string,
  label: string,
  fields: Control[],
  value: PropValue[],
  extra: Partial<Control> = {},
): Control =>
  ctrl(key, label, "repeater", "list", value, { fields, ...extra });

const zeroSpacing = (value = "0rem"): SpacingValue => ({
  top: value,
  right: value,
  bottom: value,
  left: value,
  isLinked: true,
  unit: "rem",
});

const evenGaps = (value = "1rem"): GapsValue => ({
  row: value,
  column: value,
  isLinked: true,
  unit: "rem",
});

// --- primitive catalog ------------------------------------------------------

export const PRIMITIVES: readonly PrimitiveDefinition[] = [
  // Layout -----------------------------------------------------------------
  {
    type: "frame",
    name: "Rahmen",
    category: "layout",
    description:
      "Neutraler Container (Div, Section, Nav …). Umschließt beliebige Kinder und steuert Abstand, Ausrichtung und Effekte.",
    container: true,
    allowedChildren: "any",
    slots: {},
    controls: [
      select(
        "semantic",
        "HTML-Tag",
        O(
          ["div", "Div"],
          ["section", "Section"],
          ["nav", "Nav"],
          ["header", "Header"],
          ["footer", "Footer"],
          ["main", "Main"],
          ["aside", "Aside"],
        ),
        "div",
      ),
      choose(
        "display",
        "Anzeige",
        O(["block", "Block"], ["flex", "Flex"], ["grid", "Grid"]),
        "block",
      ),
      spacing("padding", "Abstand", zeroSpacing()),
      url("link", "Link-Ziel", ""),
      toggle("newTab", "Neuer Tab", false),
      text("anchorId", "Anker-ID", ""),
    ],
    styleGroups: ALL_STYLE_GROUPS,
  },
  {
    type: "column",
    name: "Spalte",
    category: "layout",
    description:
      "Kind eines Rasters oder Rahmens. Steuert Breite und Reihenfolge innerhalb des umgebenden Containers.",
    container: true,
    allowedChildren: "any",
    slots: {},
    controls: [
      slider("width", "Breite", 100, 10, 100, 1, ["%"]),
      num("order", "Reihenfolge", 0, 0, 20, 1),
    ],
    styleGroups: ALL_STYLE_GROUPS,
  },
  {
    type: "grid",
    name: "Raster",
    category: "layout",
    description:
      "Raster-Container mit fester Spaltenzahl und Abstand. Verteilt Spalten und Karten gleichmäßig.",
    container: true,
    allowedChildren: "any",
    slots: {},
    controls: [
      slider("columns", "Spalten", 3, 1, 12, 1, ["fr"]),
      gaps("gap", "Abstand", evenGaps()),
    ],
    styleGroups: ALL_STYLE_GROUPS,
  },
  {
    type: "section",
    name: "Bereich",
    category: "layout",
    description:
      "Sektions-Wurzel mit Inhaltsbreite und Ausrichtung. Erste Ebene unter der Wurzel.",
    container: true,
    allowedChildren: "any",
    slots: {},
    controls: [
      text("label", "Name", "Bereich"),
      choose(
        "contentWidth",
        "Inhaltsbreite",
        O(
          ["narrow", "Schmal"],
          ["regular", "Regulär"],
          ["wide", "Breit"],
          ["full", "Voll"],
        ),
        "regular",
      ),
      choose("align", "Ausrichtung", O(["left", "Links"], ["center", "Zentriert"]), "left"),
    ],
    styleGroups: ALL_STYLE_GROUPS,
  },

  // Basis ------------------------------------------------------------------
  {
    type: "heading",
    name: "Überschrift",
    category: "basic",
    description:
      "Überschrift mit Ebene (h1–h6), optionalem Kicker und vollem Schrift-Styling.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: [
      area("text", "Überschrift", "Neue Überschrift"),
      choose("level", "Ebene", S("h1", "h2", "h3", "h4", "h5", "h6"), "h2"),
      text("eyebrow", "Kicker", ""),
    ],
    styleGroups: ["spacing", "typography", "color", "effects"],
  },
  {
    type: "text",
    name: "Text",
    category: "basic",
    description: "Einzeiliger oder kurzer Textabsatz ohne Auszeichnung.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: [area("text", "Text", "")],
    styleGroups: ["spacing", "typography", "color"],
  },
  {
    type: "body",
    name: "Textkörper",
    category: "basic",
    description:
      "Ausgezeichneter Fließtext (Markdown/HTML) für Prosa und lange Absätze, optional mit Initial.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: [
      area("html", "Inhalt", ""),
      toggle("dropCap", "Initial", false),
      ctrl("dropCapLines", "Initial-Zeilen", "number", "number", 2, {
        min: 1,
        max: 5,
        step: 1,
        condition: { prop: "dropCap", equals: true },
      }),
    ],
    styleGroups: ["spacing", "typography", "color"],
  },
  {
    type: "button",
    name: "Knopf",
    category: "basic",
    description:
      "Aktionsknopf mit Variante, Größe und Ziel. Immer mit Beschriftung.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: [
      text("label", "Beschriftung", "Knopf"),
      url("link", "Ziel", "#"),
      choose(
        "variant",
        "Stil",
        O(["solid", "Gefüllt"], ["outline", "Umriss"], ["ghost", "Nur Text"]),
        "solid",
      ),
      choose("size", "Größe", S("sm", "md", "lg"), "md"),
    ],
    styleGroups: ALL_STYLE_GROUPS,
  },
  {
    type: "link",
    name: "Link",
    category: "basic",
    description: "Textlink mit Ziel und optionalem neuen Tab.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: [
      text("label", "Beschriftung", "Link"),
      url("link", "Ziel", "#"),
      toggle("newTab", "Neuer Tab", false),
    ],
    styleGroups: ["spacing", "typography", "color"],
  },
  {
    type: "list",
    name: "Liste",
    category: "basic",
    description:
      "Liste mit Marker oder Nummerierung. Nimmt Text-, Link-, Symbol- und Medien-Kinder auf.",
    container: true,
    allowedChildren: ["text", "link", "icon", "heading", "image"],
    slots: {},
    controls: [
      toggle("ordered", "Nummeriert", false),
      choose(
        "marker",
        "Marker",
        O(["disc", "Punkt"], ["decimal", "Zahl"], ["none", "Kein"]),
        "disc",
      ),
    ],
    styleGroups: ["spacing", "typography", "color"],
  },

  // Media ------------------------------------------------------------------
  {
    type: "image",
    name: "Bild",
    category: "media",
    description:
      "Bild aus der Asset-Bibliothek mit Alt-Text, Seitenverhältnis und Zuschnitt.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: [
      media("asset", "Bild"),
      text("alt", "Alt-Text", ""),
      choose(
        "aspect",
        "Seitenverhältnis",
        O(["auto", "Auto"], ["16/9", "16:9"], ["4/3", "4:3"], ["1/1", "1:1"], ["3/4", "3:4"]),
        "auto",
      ),
      choose("fit", "Zuschnitt", O(["cover", "Füllen"], ["contain", "Einpassen"]), "cover"),
    ],
    styleGroups: ["spacing", "size", "border", "effects"],
  },
  {
    type: "video",
    name: "Video",
    category: "media",
    description:
      "Video von Datei, YouTube oder Vimeo, mit Poster und Wiedergabe-Optionen.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: [
      url("url", "Video-URL", ""),
      choose(
        "provider",
        "Anbieter",
        O(["file", "Datei"], ["youtube", "YouTube"], ["vimeo", "Vimeo"]),
        "file",
      ),
      media("poster", "Vorschaubild"),
      toggle("autoplay", "Autoplay", false),
      toggle("loop", "Wiederholen", false),
      toggle("muted", "Stumm", true),
      toggle("showControls", "Bedienelemente", true),
    ],
    styleGroups: ["spacing", "size", "border", "effects"],
  },
  {
    type: "icon",
    name: "Symbol",
    category: "media",
    description: "Symbol oder Icon mit Größe und Strichstärke, optional mit eigener SVG-Grafik.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: [
      ctrl("name", "Symbol", "icon", "string", "symbol", { responsive: false }),
      area("svg", "SVG-Grafik", ""),
      slider("size", "Größe", 24, 8, 200, 1, ["px", "rem"]),
      slider("strokeWidth", "Strichstärke", 1.5, 0.5, 4, 0.5, ["px"]),
    ],
    styleGroups: ["spacing", "typography", "color", "size"],
  },

  // Formular ---------------------------------------------------------------
  {
    type: "input",
    name: "Textfeld",
    category: "form",
    description:
      "Eingabefeld für Text, E-Mail, Telefon, Zahl, Datum, Passwort oder mehrzeiligen Text.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: [
      text("name", "Feldname", "feld"),
      text("label", "Beschriftung", "Textfeld"),
      choose(
        "inputType",
        "Feldtyp",
        O(
          ["text", "Text"],
          ["email", "E-Mail"],
          ["tel", "Telefon"],
          ["number", "Zahl"],
          ["date", "Datum"],
          ["password", "Passwort"],
          ["textarea", "Mehrzeilig"],
        ),
        "text",
      ),
      text("placeholder", "Platzhalter", ""),
      toggle("required", "Pflichtfeld", false),
    ],
    styleGroups: ALL_STYLE_GROUPS,
  },
  {
    type: "select",
    name: "Auswahlfeld",
    category: "form",
    description: "Auswahlliste mit festen Optionen.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: [
      text("name", "Feldname", "auswahl"),
      text("label", "Beschriftung", "Auswahl"),
      repeater(
        "options",
        "Optionen",
        [text("value", "Wert"), text("label", "Anzeige")],
        [{ value: "option-1", label: "Option 1" }],
        { minItems: 1, maxItems: 50 },
      ),
      toggle("required", "Pflichtfeld", false),
    ],
    styleGroups: ALL_STYLE_GROUPS,
  },
  {
    type: "checkbox",
    name: "Kontrollkästchen",
    category: "form",
    description:
      "Kästchen zum Anhaken, etwa für Einwilligungen. Mit Beschriftung und Pflicht-Option.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: [
      text("name", "Feldname", "zustimmung"),
      text("label", "Beschriftung", "Ich stimme zu"),
      toggle("checked", "Vorausgewählt", false),
      toggle("required", "Pflichtfeld", false),
    ],
    styleGroups: ["spacing", "typography", "color"],
  },
  {
    type: "submit",
    name: "Absenden",
    category: "form",
    description: "Absende-Knopf eines Formulars mit Variante und Größe.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: [
      text("label", "Beschriftung", "Absenden"),
      choose(
        "variant",
        "Stil",
        O(["solid", "Gefüllt"], ["outline", "Umriss"], ["ghost", "Nur Text"]),
        "solid",
      ),
      choose("size", "Größe", S("sm", "md", "lg"), "md"),
    ],
    styleGroups: ALL_STYLE_GROUPS,
  },

  // Erweitert --------------------------------------------------------------
  {
    type: "table",
    name: "Tabelle",
    category: "advanced",
    description:
      "Datentabelle mit Kopfzeile, Zeilen und Gestaltungsoptionen. Auf schmalen Geräten als Karten darstellbar.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: [
      repeater(
        "columns",
        "Spalten",
        [text("header", "Kopfzeile")],
        [{ header: "Spalte 1" }, { header: "Spalte 2" }],
        { minItems: 1, maxItems: 12 },
      ),
      repeater(
        "rows",
        "Zeilen",
        [text("label", "Bezeichnung"), area("values", "Werte")],
        [{ label: "Zeile 1", values: "Wert 1, Wert 2" }],
        { maxItems: 100 },
      ),
      toggle("striped", "Zebrastreifen", true),
      ctrl("stripeColor", "Streifenfarbe", "color", "color", "#f3f4f6", {
        alpha: true,
        condition: { prop: "striped", notEquals: false },
      }),
      toggle("bordered", "Rahmen", true),
    ],
    styleGroups: ["spacing", "typography", "color", "border"],
  },
  {
    type: "accordion",
    name: "Klapptext",
    category: "advanced",
    description:
      "Aufklappbarer Textblock mit Titel und Inhalt. Nimmt Überschrift- und Textkörper-Kinder auf.",
    container: true,
    allowedChildren: ["heading", "body", "text"],
    slots: {},
    controls: [
      text("summary", "Titel", "Zusammenfassung"),
      toggle("open", "Geöffnet", false),
      choose(
        "icon",
        "Symbol",
        O(["chevron", "Chevron"], ["plus", "Plus"], ["arrow", "Pfeil"]),
        "chevron",
      ),
      toggle("multiple", "Mehrere offen", false),
    ],
    styleGroups: ["spacing", "typography", "color", "border"],
  },
  {
    type: "divider",
    name: "Trennlinie",
    category: "advanced",
    description:
      "Rhythmus-Werkzeug: sichtbare Linie oder reiner Abstand zwischen Elementen.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: [
      choose(
        "style",
        "Stil",
        O(
          ["line", "Linie"],
          ["dashed", "Gestrichelt"],
          ["dotted", "Gepunktet"],
          ["space", "Nur Abstand"],
        ),
        "line",
      ),
      slider("thickness", "Stärke", 1, 1, 20, 1, ["px"]),
      slider("spacing", "Abstand", 24, 0, 200, 4, ["px", "rem"]),
    ],
    styleGroups: ["spacing", "color", "border", "size"],
  },
  {
    type: "embed",
    name: "Einbettung",
    category: "advanced",
    description:
      "Externer Inhalt per URL: Iframe, Karte, Video oder Social-Post. Nur https aus erlaubten Anbietern.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: [
      url("url", "Einbettungs-URL", ""),
      choose(
        "provider",
        "Anbieter",
        O(["iframe", "Iframe"], ["map", "Karte"], ["video", "Video"], ["social", "Social"]),
        "iframe",
      ),
      choose(
        "aspect",
        "Seitenverhältnis",
        O(["16/9", "16:9"], ["4/3", "4:3"], ["1/1", "1:1"]),
        "16/9",
      ),
      text("title", "Titel", "Einbettung"),
    ],
    styleGroups: ["spacing", "border", "size"],
  },
  {
    type: "collection",
    name: "Sammlung",
    category: "advanced",
    description:
      "Wiederholte Liste aus einer Quelle mit Filter, Sortierung, Limit und Blätterung. Der Item-Slot hält einen Baustein.",
    container: true,
    allowedChildren: "none",
    slots: {
      item: { max: 1 },
    },
    controls: [
      text("source", "Quelle", "sammlung"),
      text("filterField", "Filter: Feld", ""),
      choose(
        "filterOp",
        "Filter: Operator",
        O(
          ["is", "ist"],
          ["isNot", "ist nicht"],
          ["isTrue", "ist wahr"],
          ["isFalse", "ist falsch"],
          ["isSet", "ist gesetzt"],
          ["isEmpty", "ist leer"],
        ),
        "is",
      ),
      text("filterValue", "Filter: Wert", ""),
      text("orderBy", "Sortierung: Feld", ""),
      choose("direction", "Richtung", O(["desc", "Absteigend"], ["asc", "Aufsteigend"]), "desc"),
      num("limit", "Anzahl", 6, 1, 48, 1),
      choose("pagination", "Blättern", O(["none", "Ohne"], ["pages", "Seiten"]), "none"),
      text("emptyText", "Leerer Zustand", "Keine Einträge"),
    ],
    styleGroups: ["spacing", "typography", "color"],
  },
  {
    type: "payload",
    name: "Fremd-Code",
    category: "advanced",
    description:
      "Träger für importierten Fremd-Code (ADR-0010). Läuft im Release als Island, im Editor nur als Poster oder Platte; die Innereien sind nicht editierbar.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: [
      // The payload id is the reference into `site_code_payloads`; the editor
      // picks it, never types it (a free-text field would invent ids).
      ctrl("payloadId", "Payload", "text", "string", "", { responsive: false }),
      media("poster", "Poster"),
      text("alt", "Alternativtext", ""),
      text("label", "Bezeichnung", ""),
      // A carrier that stands for the whole page (the Framer runtime): the
      // release renders it instead of the structure. The canvas shows the
      // structure — the foreign code never runs there.
      ctrl("coversPage", "Deckt die Seite ab", "switcher", "boolean", false, { responsive: false }),
    ],
    styleGroups: ["spacing", "size", "border", "effects"],
  },
  {
    type: "root",
    name: "Wurzel",
    category: "advanced",
    description:
      "Dokument-Wurzel der Seite. Hält Sprache, Seitentitel und alle Bereiche als Kinder.",
    container: true,
    allowedChildren: "any",
    slots: {},
    controls: [
      text("title", "Seitentitel", "Neue Seite"),
      text("lang", "Sprache", "de"),
      color("background", "Hintergrund", "#ffffff"),
    ],
    styleGroups: ALL_STYLE_GROUPS,
  },
];

export function primitiveTypes(): string[] {
  return PRIMITIVES.map((primitive) => primitive.type);
}

export function getPrimitive(type: string): PrimitiveDefinition | undefined {
  // The section types of the running registry get a permissive stand-in so a
  // migrated v1 page stays loadable (Phase 0, fifth slice; see `legacy.ts`).
  // The reserved component types (ticket 04) resolve the same way.
  return (
    PRIMITIVES.find((primitive) => primitive.type === type) ??
    legacyPrimitive(type) ??
    componentPrimitive(type)
  );
}

// The Content controls for a twin name (see `SECTION_PRIMITIVE_TWINS`): until
// the cutover the *running section* renders the node, so the editor must write
// the section's props — the primitive's own controls (style/thickness vs.
// provider) would be dead writes. At the parity gate the section component is
// removed and `getPrimitive(type).controls` take over unchanged.
export function sectionTwinControls(type: string): Control[] | undefined {
  if (type === "divider") {
    return [
      choose(
        "spacing",
        "Abstand",
        O(["xs", "XS"], ["s", "S"], ["m", "M"], ["l", "L"], ["xl", "XL"]),
        "m",
      ),
    ];
  }
  if (type === "embed") {
    return [
      url("url", "Einbettungs-URL", ""),
      choose(
        "aspect",
        "Seitenverhältnis",
        O(["16/9", "16:9"], ["4/3", "4:3"], ["1/1", "1:1"]),
        "16/9",
      ),
      text("title", "Titel", "Eingebetteter Inhalt"),
    ];
  }
  return undefined;
}

export function primitivesByCategory(category: PrimitiveDefinition["category"]): PrimitiveDefinition[] {
  return PRIMITIVES.filter((primitive) => primitive.category === category);
}
