import { SenifyError } from "@senify/core";
import type { PropSpec, Registry, SectionDefinition } from "@senify/section-sdk";

// Puck is the renderer only (artifacts/09 §1) — pinned, MIT. The editor owns
// the data (NodeTree), the frames, the overlays and the toolbar; Puck never
// becomes the source of truth.

export const PUCK_PACKAGE = "@puckeditor/core";

// 0.23.0 is the analysed baseline (research/28). Pinning is deliberate:
// Puck is 0.x and the overrides API is "highly experimental".
export const PUCK_VERSION = "0.23.0";

export const PUCK_PACKAGE_SPEC = `${PUCK_PACKAGE}@${PUCK_VERSION}`;

export type PuckKnownIssue = {
  id: number;
  version: string;
  area: "overlays" | "inline";
  title: string;
  summary: string;
  workaround: string;
  regression: string;
};

// Upgrade regression cases (artifacts/24 §1, research/28):
// both bugs must stay covered when Puck is bumped.
export const PUCK_KNOWN_ISSUES: readonly PuckKnownIssue[] = [
  {
    id: 1829,
    version: "0.23.0",
    area: "overlays",
    title: "Default-Overlay / overrides.actionBar mountet nie",
    summary:
      "In manchen Setups (drop zones, startTransition) mountet das Per-Item-Overlay inklusive ActionBar nie, obwohl die Selection im Store stimmt.",
    workaround:
      "Eigene Overlays und eigene Mini-Toolbar statt der Puck-Defaults (overrides.actionBar/componentOverlay überschreiben).",
    regression: "puck-regression.test.ts: eigene Overlays + Toolbar, kein Puck-Default",
  },
  {
    id: 1794,
    version: "0.23.0",
    area: "inline",
    title: "Inline-Fields im Root funktionieren nicht",
    summary:
      "contentEditable-Felder der Puck-Root-Komponente committen nicht; Inline-Text für Kinder funktioniert.",
    workaround:
      "Inline-Text nur für Kindknoten aktivieren (assertInlineEditingSupported); Root-Texte über das Panel bearbeiten.",
    regression: "inline-text.test.ts + puck-regression.test.ts: Root-Inline wird abgelehnt",
  },
];

export const KNOWN_ISSUE_IDS: readonly number[] = PUCK_KNOWN_ISSUES.map((issue) => issue.id);

export type PuckFieldType =
  | "text"
  | "textarea"
  | "number"
  | "radio"
  | "select"
  | "array"
  | "object"
  | "custom"
  | "slot";

export type PuckField = {
  type: PuckFieldType;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: unknown }[];
  allow?: string[];
  arrayFields?: Record<string, PuckField>;
};

export type PuckComponentConfig = {
  label: string;
  fields: Record<string, PuckField>;
  defaultProps: Record<string, unknown>;
  categories?: string[];
  metadata: Record<string, unknown>;
};

export type PuckConfig = {
  components: Record<string, PuckComponentConfig>;
};

// Our own control implementations replace Puck's defaults for the controls
// that carry Senify semantics (artifacts/09 „Registry → UI").
export const SENIFY_FIELD_TYPES: Record<string, string> = {
  color: "senify-token-picker",
  scale: "senify-token-picker",
  asset: "senify-media-picker",
  link: "senify-link-picker",
};

export type PuckOverrides = {
  actionBar: "custom";
  componentOverlay: "custom";
  iframe: { enabled: boolean; syncHostStyles: boolean };
  fieldTypes: Record<string, string>;
};

// #1829 workaround as a hard design decision: we never rely on Puck's default
// overlay/action bar, we render our own (see mount.ts).
export function puckOverrides(): PuckOverrides {
  return {
    actionBar: "custom",
    componentOverlay: "custom",
    // The editor's frame manager already owns the iframes.
    iframe: { enabled: false, syncHostStyles: true },
    fieldTypes: { ...SENIFY_FIELD_TYPES },
  };
}

export function puckFieldFor(spec: PropSpec): PuckField {
  const base: PuckField = { type: "text", label: spec.label };
  switch (spec.control) {
    case "richtext":
      return { ...base, type: "textarea" };
    case "number":
      return {
        ...base,
        type: "number",
        ...(spec.min === undefined ? {} : { min: spec.min }),
        ...(spec.max === undefined ? {} : { max: spec.max }),
        ...(spec.step === undefined ? {} : { step: spec.step }),
      };
    case "boolean":
      return {
        ...base,
        type: "radio",
        options: [
          { label: "Ja", value: true },
          { label: "Nein", value: false },
        ],
      };
    case "enum":
      return {
        ...base,
        type: "select",
        options: (spec.options ?? []).map((option) => ({
          label: option.label,
          value: option.value,
        })),
      };
    case "list":
    case "slot":
      return { ...base, type: "array" };
    case "color":
    case "scale":
    case "asset":
    case "link":
      return { ...base, type: "custom" };
    case "text":
      return base;
  }
}

function slotFields(definition: SectionDefinition): Record<string, PuckField> {
  const fields: Record<string, PuckField> = {};
  for (const [name, spec] of Object.entries(definition.slots ?? {})) {
    fields[name] = {
      type: "slot",
      label: name,
      ...(spec.allowedTypes === undefined ? {} : { allow: [...spec.allowedTypes] }),
    };
  }
  return fields;
}

// Registry → Puck config. The render functions stay with the shell: the
// editor never owns section markup.
export function buildPuckConfig(registry: Registry): PuckConfig {
  const components: Record<string, PuckComponentConfig> = {};
  for (const definition of registry.list()) {
    const fields: Record<string, PuckField> = {};
    for (const spec of [...definition.props, ...(definition.styleProps ?? [])]) {
      fields[spec.key] = puckFieldFor(spec);
    }
    Object.assign(fields, slotFields(definition));
    components[definition.type] = {
      label: definition.title,
      fields,
      defaultProps: { ...definition.golden.tree.props },
      categories: [definition.category],
      metadata: {
        type: definition.type,
        version: definition.version,
        description: definition.description,
        variants: Object.keys(definition.variants ?? {}),
        motionPresets: [...(definition.motionPresets ?? [])],
        thumbnails: { ...definition.golden.thumbnails },
        styleProps: (definition.styleProps ?? []).map((spec: PropSpec) => spec.key),
      },
    };
  }
  return { components };
}

export const INLINE_ROOT_UNSUPPORTED =
  "Inline-Text im Root wird von Puck #1794 nicht unterstützt";

// #1794: inline fields inside Puck's root component never commit. Our page
// root is a normal node, but the guard keeps the workaround explicit.
export function assertInlineEditingSupported(
  nodeId: string,
  rootNodeId: string,
): void {
  if (nodeId === rootNodeId) {
    throw new SenifyError("guardrail", INLINE_ROOT_UNSUPPORTED, {
      field: "nodeId",
      suggestion:
        "Root-Texte über das Eigenschaften-Panel bearbeiten (Puck #1794).",
    });
  }
}

export type PuckModule = Record<string, unknown>;

// Loads the pinned Puck build. The specifier is deliberately not a literal:
// the package is injected by the program shell (T12) and must not become a
// build-time dependency of the editor core.
export async function loadPuck(): Promise<PuckModule> {
  const specifier: string = PUCK_PACKAGE;
  const loaded = (await import(specifier)) as PuckModule;
  return loaded;
}

export function isPuckIssueCovered(id: number): boolean {
  return KNOWN_ISSUE_IDS.includes(id);
}
