// Die Mutations-Werkzeuge (R12-Schnitt): eine Mutationsliste anwenden, die
// letzten Stapel zuruecknehmen, Bewegung setzen und loeschen.
//
// Die vier Werkzeuge standen zusammenhaengend in `tools.ts`. Sie teilen den
// Schreibweg einer Seite: alle vier schicken nach `/api/pages/:id/mutations`
// (das Ruecknehmen ueber `/undo-batch`, dieselbe Transaktion von der anderen
// Seite) und tragen denselben `baseDraftVersion`-Vertrag. Die Reihenfolge in
// `MUTATION_TOOLS` ist die Reihenfolge im Manifest.

import {
  objectSchema,
  optionalBoolean,
  optionalNumber,
  optionalString,
  optionalStringArray,
  requireArray,
  requireNumber,
  requireString,
} from "./tools-support.ts";
import type { ToolDefinition } from "./tools.ts";

/** Die Werkzeuge des Mutations-Schreibwegs einer Seite. */
export const MUTATION_TOOLS: ToolDefinition[] = [
  {
    name: "apply_mutations",
    title: "Apply mutations",
    description:
      "The single write API: applies a batch of canonical mutations (insertNode, updateNodeProps, moveNode, setMotion, …) atomically. Send baseDraftVersion from get_page; use dry_run to validate without writing. Conflicts return a conflict error — reload the page and retry.",
    scope: "write",
    inputSchema: objectSchema(
      {
        pageId: { type: "string" },
        baseDraftVersion: { type: "number" },
        dry_run: { type: "boolean" },
        mutations: { type: "array", items: { type: "object" }, minItems: 1 },
      },
      ["pageId", "baseDraftVersion", "mutations"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const name = await context.client.tokenName();
      return context.client.request("POST", `/api/pages/${pageId}/mutations`, {
        baseDraftVersion: requireNumber(args, "baseDraftVersion"),
        author: { kind: "agent", id: name, label: name },
        dry_run: optionalBoolean(args, "dry_run") ?? false,
        mutations: requireArray(args, "mutations"),
      });
    },
  },
  {
    name: "undo_batch",
    title: "Undo batches",
    description:
      "Agent undo: reverts the newest mutation batches of a page server-side. Every apply_mutations call is one batch in the page's audit log (list it with the audit route or get_page); send baseDraftVersion from get_page plus either steps (default 1) or the exact batchIds of the newest remaining batches. Only the newest remaining batches can be undone — an older one would replay against a state that no longer exists. A stale baseDraftVersion is a conflict: reload the page and retry. Each undo is itself audited (undoBatch); to redo, re-apply the original mutations.",
    scope: "write",
    inputSchema: objectSchema(
      {
        pageId: { type: "string" },
        baseDraftVersion: { type: "number" },
        steps: { type: "number" },
        batchIds: { type: "array", items: { type: "string" } },
      },
      ["pageId", "baseDraftVersion"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const steps = optionalNumber(args, "steps");
      const batchIds = optionalStringArray(args, "batchIds");
      const body: Record<string, unknown> = {
        baseDraftVersion: requireNumber(args, "baseDraftVersion"),
      };
      if (steps !== undefined) body.steps = steps;
      if (batchIds !== undefined) body.batchIds = batchIds;
      return context.client.request("POST", `/api/pages/${pageId}/undo-batch`, body);
    },
  },
  {
    name: "set_motion",
    title: "Set motion",
    description:
      "Sets the motion spec of one node: preset + intensity (1-10) + trigger + delay + tokens (ease/durationScale/stagger) + reduced-motion policy (static|fade|off) + enabled. Presets come from the registry (get_section.motionPresets); the site profile caps the intensity and narrows the preset classes. Send baseDraftVersion from get_page.",
    scope: "write",
    inputSchema: objectSchema(
      {
        pageId: { type: "string" },
        nodeId: { type: "string" },
        baseDraftVersion: { type: "number" },
        preset: { type: "string" },
        intensity: { type: "number" },
        trigger: { type: "string" },
        delay: { type: "number" },
        tokens: { type: "object" },
        reducedMotion: { type: "string" },
        enabled: { type: "boolean" },
      },
      ["pageId", "nodeId", "baseDraftVersion", "preset"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const name = await context.client.tokenName();
      const intensity = optionalNumber(args, "intensity");
      const trigger = optionalString(args, "trigger");
      const delay = optionalNumber(args, "delay");
      const reducedMotion = optionalString(args, "reducedMotion");
      const enabled = optionalBoolean(args, "enabled");
      const tokens = args.tokens;
      const spec: Record<string, unknown> = { preset: requireString(args, "preset") };
      if (intensity !== undefined) spec.intensity = intensity;
      if (trigger !== undefined) spec.trigger = trigger;
      if (delay !== undefined) spec.delay = delay;
      if (reducedMotion !== undefined) spec.reducedMotion = reducedMotion;
      if (enabled !== undefined) spec.enabled = enabled;
      if (tokens !== undefined && typeof tokens === "object" && tokens !== null) {
        spec.tokens = tokens;
      }
      return context.client.request("POST", `/api/pages/${pageId}/mutations`, {
        baseDraftVersion: requireNumber(args, "baseDraftVersion"),
        author: { kind: "agent", id: name, label: name },
        mutations: [{ op: "setMotion", id: requireString(args, "nodeId"), spec }],
      });
    },
  },
  {
    name: "clear_motion",
    title: "Clear motion",
    description:
      "Removes the motion spec of one node (the node stays, only the animation goes). Send baseDraftVersion from get_page.",
    scope: "write",
    inputSchema: objectSchema(
      { pageId: { type: "string" }, nodeId: { type: "string" }, baseDraftVersion: { type: "number" } },
      ["pageId", "nodeId", "baseDraftVersion"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const name = await context.client.tokenName();
      return context.client.request("POST", `/api/pages/${pageId}/mutations`, {
        baseDraftVersion: requireNumber(args, "baseDraftVersion"),
        author: { kind: "agent", id: name, label: name },
        mutations: [{ op: "clearMotion", id: requireString(args, "nodeId") }],
      });
    },
  },
];
