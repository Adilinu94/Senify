import type { SectionDefinition } from "@senify/section-sdk";
import {
  cardPart,
  columnsProp,
  gapProp,
  headingPart,
  introProp,
  sectionStyleProps,
  sectionTitleProp,
  thumbs,
} from "../shared.ts";

// Closed filter set (Instatic pattern): operators that compare one field.
const FILTER_OPS = [
  { value: "is", label: "ist" },
  { value: "isNot", label: "ist nicht" },
  { value: "isTrue", label: "ist wahr" },
  { value: "isFalse", label: "ist falsch" },
  { value: "isSet", label: "ist gesetzt" },
  { value: "isEmpty", label: "ist leer" },
];

export const collectionListSection: SectionDefinition = {
  type: "collection-list",
  version: 1,
  title: "Collection list",
  description:
    "Gebackene Liste einer Collection mit geschlossenem Filter-Set, Sortierung, Limit, Pagination (?seite=N) und Ausschluss des aktuellen Eintrags. Der Item-Slot enthält genau eine card; die Abfrage läuft zur Buildzeit.",
  category: "content",
  props: [
    sectionTitleProp(),
    introProp(),
    { key: "collectionId", control: "text", label: "Collection", group: "Content" },
    { key: "filterField", control: "text", label: "Filter: Feld", group: "Content" },
    {
      key: "filterOp",
      control: "enum",
      label: "Filter: Operator",
      group: "Content",
      options: FILTER_OPS,
    },
    { key: "filterValue", control: "text", label: "Filter: Wert", group: "Content" },
    { key: "orderByField", control: "text", label: "Sortierung: Feld", group: "Content" },
    {
      key: "orderByDirection",
      control: "enum",
      label: "Sortierung: Richtung",
      group: "Content",
      options: [
        { value: "desc", label: "Absteigend" },
        { value: "asc", label: "Aufsteigend" },
      ],
    },
    {
      key: "limit",
      control: "number",
      label: "Limit",
      group: "Content",
      min: 1,
      max: 48,
      step: 1,
    },
    {
      key: "excludeCurrent",
      control: "boolean",
      label: "Aktuellen Eintrag ausschließen",
      group: "Content",
    },
    {
      key: "pagination",
      control: "enum",
      label: "Blättern",
      group: "Content",
      options: [
        { value: "none", label: "Ohne" },
        { value: "pages", label: "Seiten" },
      ],
    },
    { key: "paramName", control: "text", label: "URL-Parameter", group: "Content" },
    { key: "emptyText", control: "text", label: "Leerer Zustand", group: "Content" },
  ],
  variants: {
    cards: { label: "Cards", preset: {} },
    grid: { label: "Grid", preset: {} },
    list: { label: "List", preset: {} },
  },
  styleProps: [
    ...sectionStyleProps(),
    columnsProp(),
    gapProp(),
    ...headingPart(),
    ...cardPart(),
  ],
  slots: {
    item: { max: 1, allowedTypes: ["card"] },
  },
  allowedChildren: "none",
  motionPresets: ["scroll-reveal", "stagger-cascade"],
  golden: {
    tree: {
      type: "collection-list",
      variant: "cards",
      props: {
        title: "Neues aus dem Blog",
        limit: 3,
      },
    },
    thumbnails: thumbs("collection-list", "cards"),
    variantThumbnails: {
      grid: thumbs("collection-list", "grid"),
      list: thumbs("collection-list", "list"),
    },
  },
};
