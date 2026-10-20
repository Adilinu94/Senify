import type { Registry } from "@senify/section-sdk";

// Cmd+K spotlight (artifacts/24 §3): pages, sections (with thumbnails) and
// actions in one index. Keyboard-first, no Puck feature exists for it.

export type SpotlightKind = "page" | "section" | "action";

export type SpotlightCommand =
  | { type: "open-page"; pageId: string }
  | { type: "insert-section"; sectionType: string; variant?: string }
  | { type: "insert-primitive"; primitive: string }
  | { type: "set-mode"; mode: "design" | "live" }
  | { type: "open-media" }
  | { type: "publish" };

export type SpotlightItem = {
  id: string;
  kind: SpotlightKind;
  label: string;
  description: string;
  group: string;
  thumbnail: string | undefined;
  keywords: string[];
  command: SpotlightCommand;
};

export type PageRef = { id: string; title: string; path: string };

export type SpotlightIndexInput = {
  pages: readonly PageRef[];
  registry: Registry;
  currentPageId?: string | null;
};

export const SPOTLIGHT_ACTIONS: readonly SpotlightItem[] = [
  {
    id: "action:mode-live",
    kind: "action",
    label: "Live-Modus",
    description: "Ein Frame in echter Größe",
    group: "Aktionen",
    thumbnail: undefined,
    keywords: ["live", "preview", "frame"],
    command: { type: "set-mode", mode: "live" },
  },
  {
    id: "action:mode-design",
    kind: "action",
    label: "Design-Modus",
    description: "Ein Frame im Blattmaß des Geräts",
    group: "Aktionen",
    thumbnail: undefined,
    keywords: ["design", "breakpoints", "frames"],
    command: { type: "set-mode", mode: "design" },
  },
  {
    id: "action:media",
    kind: "action",
    label: "Medien öffnen",
    description: "Bibliothek durchsuchen und einsetzen",
    group: "Aktionen",
    thumbnail: undefined,
    keywords: ["media", "bild", "asset"],
    command: { type: "open-media" },
  },
  {
    id: "action:publish",
    kind: "action",
    label: "Publizieren",
    description: "Entwurf zur Prüfung geben",
    group: "Aktionen",
    thumbnail: undefined,
    keywords: ["publish", "release", "prüfen"],
    command: { type: "publish" },
  },
];

function thumbnailOf(thumbnails: {
  desktop?: string;
  tablet?: string;
  mobile?: string;
}): string | undefined {
  return thumbnails.desktop ?? thumbnails.tablet ?? thumbnails.mobile;
}

export function buildSpotlightIndex(input: SpotlightIndexInput): SpotlightItem[] {
  const pages: SpotlightItem[] = input.pages.map((page) => ({
    id: `page:${page.id}`,
    kind: "page",
    label: page.title,
    description: page.path,
    group: "Seiten",
    thumbnail: undefined,
    keywords: [page.path],
    command: { type: "open-page", pageId: page.id },
  }));
  const sections: SpotlightItem[] = input.registry.list().map((definition) => ({
    id: `section:${definition.type}`,
    kind: "section",
    label: definition.title,
    description: definition.description,
    group: "Sektionen",
    thumbnail: thumbnailOf(definition.golden.thumbnails),
    keywords: [definition.type, definition.category],
    command: { type: "insert-section", sectionType: definition.type },
  }));
  const current = input.currentPageId ?? null;
  const ordered = [...pages].sort((a, b) => {
    const aActive = a.command.type === "open-page" && a.command.pageId === current;
    const bActive = b.command.type === "open-page" && b.command.pageId === current;
    return Number(bActive) - Number(aActive);
  });
  return [...ordered, ...sections, ...SPOTLIGHT_ACTIONS];
}

export type EditorSpotlightInput = {
  pages: readonly PageRef[];
  primitives: readonly {
    type: string;
    name: string;
    description: string;
    category: string;
  }[];
  // Eine Zeile je Variante einer Registry-Sektion (`listSectionVariants`); ohne
  // sie bietet die Spotlight nur Bausteine an.
  sections?: readonly {
    type: string;
    name: string;
    description: string;
    category: string;
    variant: { key: string; label: string; thumbnail: string };
  }[];
  // Ordner der Vorschaubilder, Schraegstrich am Ende.
  thumbnailBase?: string;
  currentPageId?: string | null;
};

// The rebuild canvas indexes the widget catalog instead of the section
// registry: the same model, the same scoring, `insert-primitive` as the
// command.
export function buildEditorSpotlightIndex(input: EditorSpotlightInput): SpotlightItem[] {
  const pages: SpotlightItem[] = input.pages.map((page) => ({
    id: `page:${page.id}`,
    kind: "page",
    label: page.title,
    description: page.path,
    group: "Seiten",
    thumbnail: undefined,
    keywords: [page.path],
    command: { type: "open-page", pageId: page.id },
  }));
  const primitives: SpotlightItem[] = input.primitives
    .filter((primitive) => primitive.type !== "root")
    .map((primitive) => ({
      id: `primitive:${primitive.type}`,
      kind: "section",
      label: primitive.name,
      description: primitive.description,
      group: "Bausteine",
      thumbnail: undefined,
      keywords: [primitive.type, primitive.category],
      command: { type: "insert-primitive", primitive: primitive.type },
    }));
  const base = input.thumbnailBase ?? "/editor-section-thumbnails/";
  const sections: SpotlightItem[] = (input.sections ?? []).map((entry) => ({
    id: `section:${entry.type}:${entry.variant.key}`,
    kind: "section",
    label: `${entry.name} · ${entry.variant.label}`,
    description: entry.description,
    group: "Sektionen",
    thumbnail: `${base}${entry.variant.thumbnail}`,
    keywords: [entry.type, entry.category, entry.variant.key, entry.name, entry.variant.label],
    command: { type: "insert-section", sectionType: entry.type, variant: entry.variant.key },
  }));
  const current = input.currentPageId ?? null;
  const ordered = [...pages].sort((a, b) => {
    const aActive = a.command.type === "open-page" && a.command.pageId === current;
    const bActive = b.command.type === "open-page" && b.command.pageId === current;
    return Number(bActive) - Number(aActive);
  });
  return [...ordered, ...primitives, ...sections, ...SPOTLIGHT_ACTIONS];
}

function haystack(item: SpotlightItem): string {
  return [item.label, item.description, ...item.keywords].join(" ").toLowerCase();
}

// Subsequence match: "hw" finds "Hero Wrapper", "pub" finds "Publizieren".
export function matchesSpotlight(item: SpotlightItem, query: string): boolean {
  return scoreSpotlight(item, query) > 0;
}

export function scoreSpotlight(item: SpotlightItem, query: string): number {
  const needle = query.trim().toLowerCase();
  if (needle === "") return 1;
  const label = item.label.toLowerCase();
  if (label === needle) return 100;
  if (label.startsWith(needle)) return 80;
  if (label.includes(needle)) return 60;
  const text = haystack(item);
  if (text.includes(needle)) return 40;
  let position = 0;
  for (const char of needle) {
    const found = text.indexOf(char, position);
    if (found < 0) return 0;
    position = found + 1;
  }
  return 20;
}

const KIND_WEIGHT: Record<SpotlightKind, number> = {
  page: 3,
  action: 2,
  section: 1,
};

export function searchSpotlight(
  index: readonly SpotlightItem[],
  query: string,
  limit = 12,
): SpotlightItem[] {
  const scored = index
    .map((item) => ({ item, score: scoreSpotlight(item, query) }))
    .filter((entry) => entry.score > 0)
    .map((entry) => ({
      ...entry,
      weight: entry.score + KIND_WEIGHT[entry.item.kind],
    }))
    .sort((a, b) => b.weight - a.weight);
  return scored.slice(0, Math.max(0, limit)).map((entry) => entry.item);
}
