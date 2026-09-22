import type { SectionDefinition } from "@senify/section-sdk";
import {
  COMPONENT_DEFINITION_TYPE,
  COMPONENT_INSTANCE_TYPE,
  COMPONENT_SLOT_TYPE,
} from "@senify/section-sdk";

// Structural node types of the component model (ticket 04): the tree
// vocabulary, not the authorable catalog. The registry knows them — mutation
// validation accepts and checks them — but `list()` never shows them, so the
// editor's section list and the agents' `list_sections` stay the curated
// surface. The descriptions mirror the editor's widget primitives
// (`widget-engine/legacy.ts`), one wording for both worlds.

export const componentDefinitionSection: SectionDefinition = {
  type: COMPONENT_DEFINITION_TYPE,
  version: 1,
  title: "Komponente",
  description:
    "Definition einer Visual Component: der eine Wurzelknoten in den Kindern ist die wiederverwendbare Struktur, `__component_slot`-Knoten sind ihre Füllplätze, `variants` sind benannte Props-Overlays auf die Teile.",
  category: "utility",
  props: [
    { key: "name", control: "text", label: "Name" },
    { key: "version", control: "number", label: "Version", group: "Komponente" },
    { key: "variants", control: "json", label: "Varianten", group: "Komponente" },
  ],
  allowedChildren: "any",
  golden: {
    tree: { type: COMPONENT_DEFINITION_TYPE, props: { name: "Komponente", version: 1 } },
    thumbnails: {},
  },
};

export const componentInstanceSection: SectionDefinition = {
  type: COMPONENT_INSTANCE_TYPE,
  version: 1,
  title: "Komponenten-Instanz",
  description:
    "Instanz einer Komponente: `componentId` nennt die Definition, `componentVersion` die gepinnte Version, `variants` die aktivierten Varianten, die Slots tragen den Inhalt, `overrides` die Werte, die nur diese Instanz ändert. Wird beim Rendern und beim Bake inlined.",
  category: "utility",
  props: [
    { key: "componentId", control: "text", label: "Komponente" },
    {
      key: "componentVersion",
      control: "number",
      label: "Version",
      group: "Instanz",
    },
    {
      key: "variants",
      control: "json",
      label: "Varianten",
      group: "Instanz",
    },
    {
      key: "overrides",
      control: "json",
      label: "Overrides",
      group: "Instanz",
    },
  ],
  // Open container: the slots are declared by the definition, not by this
  // type, so child and slot placement stay free (validated in the editor).
  allowedChildren: "any",
  golden: {
    tree: {
      type: COMPONENT_INSTANCE_TYPE,
      props: { componentId: "component-1", componentVersion: 1 },
    },
    thumbnails: {},
  },
};

export const componentSlotSection: SectionDefinition = {
  type: COMPONENT_SLOT_TYPE,
  version: 1,
  title: "Komponenten-Slot",
  description:
    "Füllplatz in einer Komponenten-Definition: `name` ist der Slot-Name, den eine Instanz füllt, `allowedTypes` und `max` sind seine Regeln.",
  category: "utility",
  props: [
    { key: "name", control: "text", label: "Slot-Name" },
    {
      key: "allowedTypes",
      control: "list",
      label: "Erlaubte Bausteine",
      group: "Slot",
    },
    { key: "max", control: "number", label: "Maximal", group: "Slot" },
  ],
  allowedChildren: "none",
  golden: {
    tree: {
      type: COMPONENT_SLOT_TYPE,
      props: { name: "inhalt", allowedTypes: [], max: 1 },
    },
    thumbnails: {},
  },
};

export const structuralSections: SectionDefinition[] = [
  componentDefinitionSection,
  componentInstanceSection,
  componentSlotSection,
];
