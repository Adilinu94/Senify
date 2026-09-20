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
// - `setNodeMeta` maps field by field onto `updateNodeMeta` (whole class list,
//   hidden, locked). `assignClass` / `removeClass` use the diff form
//   (`addClasses` / `removeClasses`), because the bridge is stateless and the
//   caller does not send the surrounding list.
// - `setMotion` / `clearMotion` map 1:1 onto the section motion ops; the spec
//   travels unchanged (the v2 fields are additive to the v1 schema).
// - slot and collection ops map onto their section forms (same names, ticket 13
//   rest): `setSlotContent` replaces a slot, `createCollectionEntry` inserts
//   into the `item` slot, `updateCollectionEntry` patches one entry.
// - style rule ops are site-wide now (Phase 2): the registry lives on the site,
//   not in a page draft, so a page-scoped batch cannot carry them. They are
//   written through the site routes (`/api/sites/:siteId/style-rules`) and this
//   bridge points there instead of silently dropping the op.

import { SenifyError } from "@senify/core";
import type { PropValue } from "@senify/section-sdk";
import {
  type Mutation,
  type NodeSpec,
  type OverrideBreakpoint,
} from "./contract.ts";
import type { EditorMutation, EditorNodeSpec } from "./editor-contract.ts";

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
        "Struktur-, Werte-, Meta-, Motion-, Klassen-, Slot- und Sammlungs-Vorgaenge sind gespeichert.",
    },
  );
}

// The editor node spec as the section store reads it: `primitive` becomes
// `type`, device suffixes are stripped (the base value wins on insert), the
// remaining fields keep their names.
function sectionNodeSpec(spec: EditorNodeSpec): NodeSpec {
  const props: Record<string, PropValue> = {};
  for (const [key, value] of Object.entries(spec.props ?? {})) {
    props[baseKeyOf(key)] = value;
  }
  // Ticket 11: the per-breakpoint hidden flags travel as v1 overrides.
  const overrides: NonNullable<NodeSpec["overrides"]> = {};
  for (const device of spec.hiddenDevices ?? []) overrides[device] = { hidden: true };
  return {
    type: spec.primitive,
    ...(spec.variant === undefined ? {} : { variant: spec.variant }),
    ...(Object.keys(props).length > 0 ? { props } : {}),
    ...(spec.id === undefined ? {} : { id: spec.id }),
    ...(spec.classes === undefined ? {} : { classes: [...spec.classes] }),
    ...(spec.hidden === undefined ? {} : { hidden: spec.hidden }),
    ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
    ...(spec.locked === undefined ? {} : { locked: spec.locked }),
    ...(spec.motion === undefined ? {} : { motion: structuredClone(spec.motion) }),
  };
}

// Style rules are site-wide (Phase 2), so they never belong to a page batch.
function siteWide(op: string): never {
  throw new SenifyError(
    "validation",
    `Der Vorgang "${op}" gehoert zur Seite, nicht zur Seite-Datei`,
    {
      field: "mutations",
      suggestion:
        "Stilregeln liegen site-weit auf der Site: nutze /api/sites/:siteId/style-rules.",
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
      // Selective clear (ticket 11, L2): only the one prop goes away, the
      // other overrides of that breakpoint stay.
      return [
        {
          op: "clearBreakpointOverride",
          id: mutation.id,
          breakpoint: overrideBreakpoint(device),
          props: [mutation.key],
        },
      ];
    }
    case "insertNode": {
      return [
        {
          op: "insertNode",
          parent: { ...mutation.parent },
          ...(mutation.index === undefined ? {} : { index: mutation.index }),
          node: sectionNodeSpec(mutation.node),
        },
      ];
    }
    case "setSlotContent":
      return [
        {
          op: "setSlotContent",
          id: mutation.id,
          slot: mutation.slot,
          nodes: mutation.nodes.map((spec) => sectionNodeSpec(spec)),
        },
      ];
    case "createCollectionEntry":
      return [
        {
          op: "createCollectionEntry",
          id: mutation.id,
          node: sectionNodeSpec(mutation.node),
          ...(mutation.index === undefined ? {} : { index: mutation.index }),
        },
      ];
    case "updateCollectionEntry":
      return [
        {
          op: "updateCollectionEntry",
          id: mutation.id,
          index: mutation.index,
          patch: { ...mutation.patch },
        },
      ];
    case "setNodeMeta":
      return [
        {
          op: "updateNodeMeta",
          id: mutation.id,
          meta: {
            ...(mutation.meta.classes === undefined
              ? {}
              : { classes: mutation.meta.classes === null ? null : [...mutation.meta.classes] }),
            ...(mutation.meta.hidden === undefined ? {} : { hidden: mutation.meta.hidden }),
            ...(mutation.meta.locked === undefined ? {} : { locked: mutation.meta.locked }),
          },
        },
      ];
    case "setNodeHiddenDevices": {
      // Ticket 11: both devices are written idempotently — set when listed,
      // selectively cleared (the hidden flag only) when not. The selective
      // clear keeps other overrides of that breakpoint intact.
      const wanted = new Set(mutation.devices);
      return (["tablet", "mobile"] as const).map((device) =>
        wanted.has(device)
          ? {
              op: "setBreakpointOverride" as const,
              id: mutation.id,
              breakpoint: device,
              override: { hidden: true },
            }
          : {
              op: "clearBreakpointOverride" as const,
              id: mutation.id,
              breakpoint: device,
              hidden: true as const,
            },
      );
    }
    case "setMotion":
      return [{ op: "setMotion", id: mutation.id, spec: mutation.spec }];
    case "clearMotion":
      return [{ op: "clearMotion", id: mutation.id }];
    case "assignClass":
      return [
        {
          op: "updateNodeMeta",
          id: mutation.id,
          meta: { addClasses: [mutation.classId] },
        },
      ];
    case "removeClass":
      return [
        {
          op: "updateNodeMeta",
          id: mutation.id,
          meta: { removeClasses: [mutation.classId] },
        },
      ];
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
    case "renameStyleRule":
    case "upsertStyleRule":
    case "deleteStyleRule":
    case "reorderStyleRule":
      return siteWide(mutation.op);
    default: {
      // The vocabulary is fully covered; a newer client may still send an op
      // this bridge does not know yet. Keep the loud rejection instead of
      // dropping it silently (the type narrowing reaches `never` here).
      const unknown = (mutation as { op: string }).op;
      return unsupported(unknown);
    }
  }
}

export function editorMutationsToSection(
  mutations: readonly EditorMutation[],
): Mutation[] {
  return mutations.flatMap((mutation) => editorMutationToSection(mutation));
}
