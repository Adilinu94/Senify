import type { ErrorCategory } from "@senify/core";
import { TOOLS, type ToolScope } from "@senify/mcp/tools";
import { createRegistry } from "@senify/registry";
import type {
  PropSpec,
  SectionCategory,
  SectionDefinition,
} from "@senify/section-sdk";

export type PropDoc = {
  key: string;
  label: string;
  control: string;
  group?: string;
  part?: string;
  tokenGroup?: string;
  options?: string[];
};

export type SectionDoc = {
  type: string;
  title: string;
  description: string;
  category: SectionCategory;
  version: number;
  props: PropDoc[];
  styleProps: PropDoc[];
  variants: { name: string; label: string }[];
  slots: { name: string; allowedTypes: string[]; max?: number }[];
  allowedChildren: string[];
  motionPresets: string[];
  golden: string;
};

function propDoc(spec: PropSpec): PropDoc {
  return {
    key: spec.key,
    label: spec.label,
    control: spec.control,
    ...(spec.group === undefined ? {} : { group: spec.group }),
    ...(spec.part === undefined ? {} : { part: spec.part }),
    ...(spec.tokenGroup === undefined ? {} : { tokenGroup: spec.tokenGroup }),
    ...(spec.options === undefined
      ? {}
      : { options: spec.options.map((option) => option.value) }),
  };
}

function sectionDoc(definition: SectionDefinition): SectionDoc {
  return {
    type: definition.type,
    title: definition.title,
    description: definition.description,
    category: definition.category,
    version: definition.version,
    props: definition.props.map(propDoc),
    styleProps: (definition.styleProps ?? []).map(propDoc),
    variants: Object.entries(definition.variants ?? {}).map(([name, variant]) => ({
      name,
      label: variant.label,
    })),
    slots: Object.entries(definition.slots ?? {}).map(([name, spec]) => ({
      name,
      allowedTypes: [...(spec.allowedTypes ?? [])],
      ...(spec.max === undefined ? {} : { max: spec.max }),
    })),
    allowedChildren:
      definition.allowedChildren === undefined ||
      definition.allowedChildren === "none"
        ? []
        : [...definition.allowedChildren],
    motionPresets: [...(definition.motionPresets ?? [])],
    golden: JSON.stringify(definition.golden.tree, null, 2),
  };
}

// The same registry the engine and the agents use — no second catalog to drift.
export function sectionCatalog(): SectionDoc[] {
  return createRegistry().list().map(sectionDoc);
}

export type ToolParameterDoc = {
  name: string;
  type: string;
  required: boolean;
};

export type ToolDoc = {
  name: string;
  title: string;
  description: string;
  scope: ToolScope;
  parameters: ToolParameterDoc[];
};

function typeLabel(schema: unknown): string {
  if (typeof schema !== "object" || schema === null) return "any";
  const record = schema as Record<string, unknown>;
  if (Array.isArray(record.enum)) return record.enum.map(String).join(" | ");
  const type = typeof record.type === "string" ? record.type : "any";
  if (type === "array") return `array<${typeLabel(record.items)}>`;
  return type;
}

function parametersFrom(schema: Record<string, unknown>): ToolParameterDoc[] {
  const properties = (schema.properties ?? {}) as Record<string, unknown>;
  const required = new Set(
    Array.isArray(schema.required) ? schema.required.map(String) : [],
  );
  return Object.entries(properties).map(([name, property]) => ({
    name,
    type: typeLabel(property),
    required: required.has(name),
  }));
}

export function toolCatalog(): ToolDoc[] {
  return TOOLS.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    scope: tool.scope,
    parameters: parametersFrom(tool.inputSchema),
  }));
}

export type ErrorDoc = {
  category: ErrorCategory;
  title: string;
  summary: string;
  example: { message: string; suggestion: string };
};

// Keyed by the ErrorCategory union: a new category in core fails the
// typecheck here until it is documented (no drift between code and docs).
export const ERROR_GUIDES: Record<ErrorCategory, Omit<ErrorDoc, "category">> = {
  validation: {
    title: "Validation",
    summary:
      "Die Eingabe ist formal ungültig: unbekanntes Feld, falscher Typ oder fehlender Wert. `field` und `suggestion` zeigen die Fundstelle.",
    example: {
      message: 'Unknown prop "headlin" for section "hero"',
      suggestion: "Allowed props: eyebrow, headline, sub, ctas",
    },
  },
  guardrail: {
    title: "Guardrail",
    summary:
      "Die Änderung verletzt eine harte Design-Regel (z. B. nur ein Pin-Preset pro Seite). Die Aktion ist blockiert, bis der Konflikt gelöst ist.",
    example: {
      message:
        "max 1 Pin-Preset pro Seite — „sticky-stack“ in Abschnitt 3 kollidiert mit „scrub-pin“ in Abschnitt 5",
      suggestion:
        "Entferne eines der Pin-Presets oder senke die Intensity auf < 4 (kein Pin).",
    },
  },
  conflict: {
    title: "Conflict",
    summary:
      "Optimistisches Locking: `baseDraftVersion` ist veraltet, weil sich der Draft geändert hat. Seite neu laden und den Batch mit der aktuellen Version wiederholen.",
    example: {
      message: "Draft version mismatch: expected 42, current 43",
      suggestion:
        "Lade die Seite mit get_page neu und wiederhole den Batch mit der aktuellen baseDraftVersion.",
    },
  },
  auth: {
    title: "Auth",
    summary:
      "Token fehlt, ist abgelaufen, widerrufen oder hat den nötigen Scope nicht. Der Fehler nennt den benötigten Scope.",
    example: {
      message: "Missing scope `publish` for this operation",
      suggestion:
        'Erstelle ein Token mit publish-Scope: senify tokens create --name "Publish Agent" --scopes read,write,publish.',
    },
  },
  not_found: {
    title: "Not found",
    summary:
      "Die referenzierte Entität existiert nicht (mehr) — falsche ID oder gelöscht.",
    example: {
      message: 'Unknown section type "heroo"',
      suggestion: "Prüfe den Typ über list_sections oder das Sektions-Register.",
    },
  },
};

export function errorCatalog(): ErrorDoc[] {
  return (Object.keys(ERROR_GUIDES) as ErrorCategory[]).map((category) => ({
    category,
    ...ERROR_GUIDES[category],
  }));
}
