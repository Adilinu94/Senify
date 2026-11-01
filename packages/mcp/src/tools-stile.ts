// Die Stil-Werkzeuge (R12-Schnitt): Stil-Deklarationen auf einen Knoten
// schreiben und Stil-Regeln anlegen.
//
// Die zwei Werkzeuge standen zusammenhaengend in `tools.ts`, und mit ihnen sechs
// Helfer, die nur sie benutzen: die Eigenschaftspruefung gegen die dokumentierte
// Tabelle (ADR-0005), die Uebersetzung nach Deklarationen samt Geraete-Suffix,
// die Pseudo-Zustaende und die Werte-Grammatik. Kein anderes Werkzeug ruft
// einen davon auf — die Grenze ist gemessen, nicht geraten. Die Reihenfolge in
// `STYLE_TOOLS` ist die Reihenfolge im Manifest.

import { SenifyError } from "@senify/core";
import { stylePropertyFor } from "@senify/registry";
import { selectNodes } from "./outline.ts";
import {
  objectSchema,
  optionalNumber,
  optionalString,
  pageFor,
  requireRecord,
  requireString,
} from "./tools-support.ts";
import type { ToolDefinition } from "./tools.ts";

// The style properties an agent may write: the documented table (ADR-0005
// keeps the property space open for humans; agents stay on the schema, ticket
// 02 point 7). Accepts both spellings and returns the canonical camelCase key.
function requireStyleKey(property: string): string {
  const spec = stylePropertyFor(property);
  if (spec === undefined) {
    throw new SenifyError("validation", `Unknown style property "${property}"`, {
      field: "styles",
      suggestion:
        "Agents write the documented style properties (see get_widget.styleProperties); the editor's open CSS space stays a human capability.",
    });
  }
  return spec.prop;
}

// property → value as the style routes read it. `device` adds the engine's
// breakpoint suffix (`padding_tablet`), the same shape the editor writes.
function styleDeclarations(
  styles: Record<string, unknown>,
  device?: "tablet" | "mobile",
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [property, value] of Object.entries(styles)) {
    const key = requireStyleKey(property);
    out[device === undefined ? key : `${key}_${device}`] = styleValue(property, value);
  }
  return out;
}

function styleStates(states: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [state, bag] of Object.entries(states)) {
    if (!STATE_NAMES.includes(state as StyleState)) {
      throw new SenifyError("validation", `Unknown pseudo state "${state}"`, {
        field: "states",
        suggestion: `Use one of: ${STATE_NAMES.join(", ")}.`,
      });
    }
    if (bag === null || typeof bag !== "object" || Array.isArray(bag)) {
      throw new SenifyError("validation", `"states.${state}" must be an object`, {
        field: `states.${state}`,
      });
    }
    out[state] = styleDeclarations(bag as Record<string, unknown>);
  }
  return out;
}

function styleValue(property: string, value: unknown): unknown {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    (typeof value === "object" && value !== null && !Array.isArray(value))
  ) {
    return value;
  }
  throw new SenifyError("validation", `Unsupported value for "${property}"`, {
    field: `styles.${property}`,
    suggestion: 'Use a string, a number or a token reference ({ $token: "accent" }).',
  });
}

const STATE_NAMES: readonly StyleState[] = [
  "hover",
  "focus",
  "focus-visible",
  "focus-within",
  "active",
  "disabled",
];

// The pseudo states of O11 (plus the two focus refinements), as the style
// routes spell them.
type StyleState = "hover" | "focus" | "focus-visible" | "focus-within" | "active" | "disabled";

function requireDevice(args: Record<string, unknown>): "tablet" | "mobile" | undefined {
  const value = optionalString(args, "device");
  if (value === undefined) return undefined;
  if (value !== "tablet" && value !== "mobile") {
    throw new SenifyError("validation", `Unknown device "${value}"`, {
      field: "device",
      suggestion: 'Use "tablet" or "mobile" (desktop is the base value).',
    });
  }
  return value;
}

function requireState(args: Record<string, unknown>): StyleState | undefined {
  const value = optionalString(args, "state");
  if (value === undefined) return undefined;
  if (!STATE_NAMES.includes(value as StyleState)) {
    throw new SenifyError("validation", `Unknown pseudo state "${value}"`, {
      field: "state",
      suggestion: `Use one of: ${STATE_NAMES.join(", ")}.`,
    });
  }
  return value as StyleState;
}

// The rule shape the style routes answer with (the fields the tools read).
type StyleRuleResponse = {
  id: string;
  name: string;
  kind: "class" | "ambient" | "scoped";
  selector: string;
  styles: Record<string, unknown>;
  states?: Record<string, Record<string, unknown>>;
  scope?: { type: "node"; nodeId: string; role: "module-style" };
};

/** Die Stil-Werkzeuge. */
export const STYLE_TOOLS: ToolDefinition[] = [
  {
    name: "set_styles",
    title: "Set styles",
    description:
      "Writes style declarations onto one node through its scoped style rule (the same carrier the editor uses for pseudo states). Pass styles as property → value (string, number or { $token }), device \"tablet\"/\"mobile\" for a breakpoint override and state \"hover\"/\"focus\"/\"active\"/\"disabled\" for a pseudo state. Only documented style properties are accepted; raw colour literals that match a theme token are rejected — use the token. Returns the written rule.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        pageId: { type: "string" },
        nodeId: { type: "string" },
        styles: { type: "object" },
        device: { type: "string" },
        state: { type: "string" },
      },
      ["siteId", "pageId", "nodeId", "styles"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const pageId = requireString(args, "pageId");
      const nodeId = requireString(args, "nodeId");
      const styles = requireRecord(args, "styles");
      const device = requireDevice(args);
      const state = requireState(args);
      const name = await context.client.tokenName();
      const author = { kind: "agent", id: name, label: name };
      // The node must exist on the page: a rule for a typo'd id would be dead
      // weight nobody sees.
      const page = await pageFor(context, pageId);
      const { nodes, missing } = selectNodes(page, [nodeId]);
      if (nodes.length === 0) {
        throw new SenifyError("not_found", `Node "${missing[0] ?? nodeId}" is not on the page`, {
          field: "nodeId",
          suggestion: "Read the page outline (get_page) and use a node id from it.",
        });
      }
      const declared = styleDeclarations(styles, device);
      const rules = await context.client.request<{ rules: StyleRuleResponse[]; version: number }>(
        "GET",
        `/api/sites/${siteId}/style-rules`,
      );
      const existing = rules.rules.find(
        (rule) => rule.kind === "scoped" && rule.scope?.nodeId === nodeId,
      );
      if (existing === undefined) {
        return context.client.request("POST", `/api/sites/${siteId}/style-rules`, {
          kind: "scoped",
          name: `scoped-${nodeId}`,
          nodeId,
          ...(state === undefined ? { styles: declared } : { states: { [state]: declared } }),
          baseVersion: rules.version,
          author,
        });
      }
      const next =
        state === undefined
          ? { ...existing.styles, ...declared }
          : { ...(existing.states ?? {}), [state]: { ...(existing.states?.[state] ?? {}), ...declared } };
      return context.client.request("PATCH", `/api/sites/${siteId}/style-rules/${existing.id}`, {
        ...(state === undefined ? { styles: next } : { states: next }),
        baseVersion: rules.version,
        author,
      });
    },
  },
  {
    name: "create_style_rule",
    title: "Create style rule",
    description:
      "Creates a style rule: a class rule (name required) that nodes can be assigned, or a scoped rule for one node (nodeId). Pass styles and optional per-state styles (hover/focus/active/disabled). Ambient selectors and rawCss stay a human capability; raw colour literals that match a theme token are rejected — use { $token }.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        name: { type: "string" },
        nodeId: { type: "string" },
        description: { type: "string" },
        styles: { type: "object" },
        states: { type: "object" },
        baseVersion: { type: "number" },
      },
      ["siteId", "styles"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const nodeId = optionalString(args, "nodeId");
      const name = optionalString(args, "name");
      if (nodeId === undefined && name === undefined) {
        throw new SenifyError("validation", "A style rule needs a name or a nodeId", {
          field: "name",
          suggestion: "Pass `name` for a class rule or `nodeId` for a scoped rule.",
        });
      }
      const description = optionalString(args, "description");
      const states = args.states;
      const baseVersion = optionalNumber(args, "baseVersion");
      const scoped = nodeId !== undefined;
      const author = await context.client.tokenName();
      return context.client.request("POST", `/api/sites/${siteId}/style-rules`, {
        kind: scoped ? "scoped" : "class",
        name: scoped ? `scoped-${nodeId}` : (name ?? ""),
        ...(scoped ? { nodeId } : {}),
        ...(description === undefined ? {} : { description }),
        styles: styleDeclarations(requireRecord(args, "styles")),
        ...(states === undefined
          ? {}
          : {
              states: styleStates(requireRecord(args, "states")),
            }),
        ...(baseVersion === undefined ? {} : { baseVersion }),
        author: { kind: "agent", id: author, label: author },
      });
    },
  },
];
