// v2 editor ops -> section (v1) mutations (rebuild Phase 0, fifth slice).
//
// The canvas edits a v2 editor document (`packages/editor/src/state`). The page
// draft, however, stays a section `NodeTree` (v1) so the older editor keeps
// working unchanged. This bridge is the only translation between the two: it
// maps the canvas vocabulary onto the section ops and lets `applyMutations` +
// `persistBatch` do the actual write. The canvas therefore has no save path of
// its own.
//
// The mapping is intentionally small and explicit:
// - `setNodeProp` / `clearNodeProp` on the desktop level become `updateNodeProps`
//   (a `null` value removes the key), on tablet/mobile they become
//   `setBreakpointOverride` / `clearBreakpointOverride` (v1 carries device levels
//   as overrides).
// - structure ops keep the same meaning and only rename the node spec field
//   (`primitive` -> `type`).
// - class and collection ops have no section equivalent yet; they fail loudly
//   instead of writing something the section store cannot express.

import { SenifyError } from "@senify/core";
import type { PropValue } from "@senify/section-sdk";
import { type Mutation, type OverrideBreakpoint } from "./contract.ts";
import type { EditorMutation } from "./editor-contract.ts";

const TABLET_SUFFIX = "_tablet";
const MOBILE_SUFFIX = "_mobile";

type Device = "desktop" | "tablet" | "mobile";

function deviceOf(device: string | undefined): Device {
  return device === "tablet" || device === "mobile" ? device : "desktop";
}

function overrideBreakpoint(device: Device): OverrideBreakpoint {
  return device === "mobile" ? "mobile" : "tablet";
}

// Strip the device suffix a fresh spec may carry; on insert the base value wins.
function baseKeyOf(key: string): string {
  if (key.endsWith(TABLET_SUFFIX)) return key.slice(0, -TABLET_SUFFIX.length);
  if (key.endsWith(MOBILE_SUFFIX)) return key.slice(0, -MOBILE_SUFFIX.length);
  return key;
}

function unsupported(op: string): never {
  throw new SenifyError(
    "validation",
    `Der Vorgang "${op}" kann im Abschnitts-Baum noch nicht gespeichert werden`,
    {
      field: "mutations",
      suggestion:
        "Der Canvas speichert in Phase 0 nur Struktur- und Basiswerte; Klassen und Sammlungen folgen in Phase 1/2.",
    },
  );
}

// Translates one editor op. A single editor op becomes exactly one section
// mutation (a per-device prop write maps onto one override op).
export function editorMutationToSection(mutation: EditorMutation): Mutation[] {
  switch (mutation.op) {
    case "setNodeProp": {
      const device = deviceOf(mutation.device);
      if (device === "desktop") {
        return [
          { op: "updateNodeProps", id: mutation.id, patch: { [mutation.key]: mutation.value } },
        ];
      }
      return [
        {
          op: "setBreakpointOverride",
          id: mutation.id,
          breakpoint: overrideBreakpoint(device),
          override: { props: { [mutation.key]: mutation.value } },
        },
      ];
    }
    case "clearNodeProp": {
      const device = deviceOf(mutation.device);
      if (device === "desktop") {
        return [
          { op: "updateNodeProps", id: mutation.id, patch: { [mutation.key]: null } },
        ];
      }
      return [
        {
          op: "clearBreakpointOverride",
          id: mutation.id,
          breakpoint: overrideBreakpoint(device),
        },
      ];
    }
    case "insertNode": {
      const props: Record<string, PropValue> = {};
      for (const [key, value] of Object.entries(mutation.node.props ?? {})) {
        props[baseKeyOf(key)] = value;
      }
      return [
        {
          op: "insertNode",
          parent: { ...mutation.parent },
          ...(mutation.index === undefined ? {} : { index: mutation.index }),
          node: {
            type: mutation.node.primitive,
            ...(Object.keys(props).length > 0 ? { props } : {}),
            ...(mutation.node.id === undefined ? {} : { id: mutation.node.id }),
          },
        },
      ];
    }
    case "deleteNode":
      return [{ op: "deleteNode", id: mutation.id }];
    case "moveNode":
      return [
        {
          op: "moveNode",
          id: mutation.id,
          target: { ...mutation.target },
          ...(mutation.index === undefined ? {} : { index: mutation.index }),
        },
      ];
    case "duplicateNode":
      return [
        {
          op: "duplicateNode",
          id: mutation.id,
          ...(mutation.target === undefined ? {} : { target: { ...mutation.target } }),
          ...(mutation.index === undefined ? {} : { index: mutation.index }),
        },
      ];
    default:
      return unsupported(mutation.op);
  }
}

export function editorMutationsToSection(
  mutations: readonly EditorMutation[],
): Mutation[] {
  return mutations.flatMap((mutation) => editorMutationToSection(mutation));
}
