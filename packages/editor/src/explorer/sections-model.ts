// Elemente-Panel, Reiter „Sektionen“: welche Registry-Sektionen es zum
// Einfuegen gibt, mit deutschem Namen, Variantenwahl und Vorschaubild. Rein und
// ohne DOM wie `elements-model.ts`, damit ein Vitest-Test Zaehlung, Suche und
// die Einfuege-Daten pruefen kann.
//
// Eine Sektion ist ein einzelner Knoten: der Typ, die Variante und die Props des
// Golden-Trees (der Beispielinhalt der Registry), dazu das Preset der gewaehlten
// Variante. Das ist dieselbe Zusammensetzung wie beim Redesign-Apply der Engine.

import { bundledSections } from "@senify/registry";
import type { SectionDefinition } from "@senify/section-sdk";
import {
  SECTION_NOT_INSERTABLE,
  defaultSectionVariant,
  sectionInsertSpec,
  type SectionInsertSpec,
} from "../state/sections.ts";

// Die Einfuege-Daten leben im State (`state/sections.ts`), weil auch der Canvas
// sie braucht; das Panel zeigt sie hier unter seinem Namen an.
export { SECTION_NOT_INSERTABLE, sectionInsertSpec, type SectionInsertSpec };

// Der deutsche Name und die eine Zeile dazu. Die Registry beschreibt ihre
// Sektionen fuer Agenten auf Englisch; die Kachel spricht Deutsch. Der Test
// haelt die Tabelle mit der Registry deckungsgleich.
export const SECTION_INFO: Readonly<Record<string, { name: string; description: string }>> = {
  navbar: { name: "Navigation", description: "Kopfzeile mit Logo und Links." },
  footer: { name: "Footer", description: "Fußbereich mit Links, Kontakt und Rechtlichem." },
  hero: { name: "Hero", description: "Einstieg der Seite mit Überschrift, Text und Buttons." },
  content: { name: "Textabschnitt", description: "Fließtext, auch in Spalten oder hervorgehoben." },
  media: { name: "Medien", description: "Bild, Video oder 3D-Szene." },
  cta: { name: "Handlungsaufruf", description: "Aufforderung mit Button, etwa zum Kontakt." },
  features: { name: "Leistungen", description: "Vorteile oder Leistungen mit Icon und Text." },
  "services-process": {
    name: "Leistungen & Ablauf",
    description: "Angebot oder Ablauf als Schritte, Karten oder Zeitstrahl.",
  },
  stats: { name: "Kennzahlen", description: "Zahlen, die überzeugen." },
  "logo-cloud": { name: "Logo-Wand", description: "Logos von Kunden oder Partnern." },
  projects: { name: "Projekte", description: "Referenzen als Karten, Liste oder Showcase." },
  testimonials: { name: "Kundenstimmen", description: "Zitate und Bewertungen von Kunden." },
  pricing: { name: "Preise", description: "Tarife und Preisvergleich." },
  faq: { name: "FAQ", description: "Häufige Fragen mit Antworten." },
  team: { name: "Team", description: "Die Menschen hinter dem Projekt." },
  contact: { name: "Kontakt", description: "Kontaktformular, Adresse und Telefon." },
  banner: { name: "Banner", description: "Hinweisleiste oder Ankündigung." },
  newsletter: { name: "Newsletter", description: "Anmeldung zum Newsletter." },
  divider: { name: "Trenner", description: "Linie, Abstand oder Punkte zwischen Bereichen." },
  embed: { name: "Einbettung", description: "Karte, Frame oder Social-Media-Beitrag." },
  gallery: { name: "Galerie", description: "Bilder als Raster, Mauerwerk oder Karussell." },
  timeline: { name: "Zeitstrahl", description: "Meilensteine und Verlauf." },
  comparison: { name: "Vergleich", description: "Gegenüberstellung als Tabelle oder Karten." },
  "cookie-note": { name: "Cookie-Hinweis", description: "Hinweis zur Einwilligung, ohne Tracking." },
  marquee: { name: "Laufband", description: "Endlos laufender Text, Logos oder Bilder." },
};

// Kategorien der Registry in der Reihenfolge, in der sie im Panel stehen.
export const SECTION_GROUP_ORDER: readonly string[] = [
  "structure",
  "content",
  "media",
  "commerce",
  "utility",
];

export const SECTION_GROUP_NAMES: Readonly<Record<string, string>> = {
  structure: "Aufbau",
  content: "Inhalt",
  media: "Medien",
  commerce: "Verkauf",
  utility: "Hilfen",
};

export type SectionVariantTile = {
  key: string;
  label: string;
  // Dateiname des Vorschaubilds, ohne Ordner (`hero-split.png`).
  thumbnail: string;
};

export type SectionTile = {
  type: string;
  name: string;
  description: string;
  defaultVariant: string;
  variants: SectionVariantTile[];
};

export type SectionGroup = {
  id: string;
  name: string;
  sections: SectionTile[];
};

// Das Vorschaubild einer Variante: eine Datei je Sektion und Variante, vom
// Skript `pnpm thumbnails:generate` aus dem Golden-Tree erzeugt.
export function sectionThumbnailFile(type: string, variant: string): string {
  return `${type}-${variant}.png`;
}

function insertableSections(): SectionDefinition[] {
  return bundledSections.filter((section) => !SECTION_NOT_INSERTABLE.has(section.type));
}

function tileOf(definition: SectionDefinition): SectionTile {
  const info = SECTION_INFO[definition.type];
  const variants = Object.entries(definition.variants ?? {}).map(([key, variant]) => ({
    key,
    label: variant.label,
    thumbnail: sectionThumbnailFile(definition.type, key),
  }));
  return {
    type: definition.type,
    name: info?.name ?? definition.title,
    description: info?.description ?? definition.description,
    defaultVariant: defaultSectionVariant(definition),
    variants,
  };
}

function matches(tile: SectionTile, needle: string): boolean {
  if (needle === "") return true;
  const haystack = [
    tile.name,
    tile.type,
    tile.description,
    ...tile.variants.flatMap((variant) => [variant.label, variant.key]),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

// Kategorien in fester Reihenfolge; leere Kategorien (etwa nach einer Suche)
// entfallen. Die Suche trifft deutschen Namen, Typ, Beschreibung und Varianten,
// ohne auf Gross-/Kleinschreibung zu achten; ein Treffer zeigt die ganze Sektion
// mit allen Varianten.
export function buildSectionGroups(query = ""): SectionGroup[] {
  const needle = query.trim().toLowerCase();
  const byCategory = new Map<string, SectionTile[]>();
  for (const definition of insertableSections()) {
    const tile = tileOf(definition);
    if (!matches(tile, needle)) continue;
    const list = byCategory.get(definition.category) ?? [];
    list.push(tile);
    byCategory.set(definition.category, list);
  }
  const groups: SectionGroup[] = [];
  const ordered = [
    ...SECTION_GROUP_ORDER,
    ...[...byCategory.keys()].filter((id) => !SECTION_GROUP_ORDER.includes(id)),
  ];
  for (const id of ordered) {
    const sections = byCategory.get(id);
    if (sections === undefined || sections.length === 0) continue;
    groups.push({ id, name: SECTION_GROUP_NAMES[id] ?? id, sections });
  }
  return groups;
}

// Jede Variante jeder einfuegbaren Sektion in flacher Form, fuer die Spotlight.
export function listSectionVariants(): {
  type: string;
  name: string;
  description: string;
  category: string;
  variant: SectionVariantTile;
}[] {
  return insertableSections().flatMap((definition) => {
    const tile = tileOf(definition);
    return tile.variants.map((variant) => ({
      type: tile.type,
      name: tile.name,
      description: tile.description,
      category: definition.category,
      variant,
    }));
  });
}
