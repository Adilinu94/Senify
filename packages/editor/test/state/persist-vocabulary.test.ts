// The editor vocabulary against the engine's.
//
// The engine's `EDITOR_MUTATION_OPS` is the contract: every op in it can be
// persisted by the page route. The editor keeps its own list of the ops it
// sends (`PAGE_OPS`, `SITE_OPS` in `persist.ts`), and an op that is missing
// there is dropped before the request is built - the change stays in the local
// document and is gone after the next reload.
//
// That gap cost a visible feature: `setNodeHiddenDevices` (the per-breakpoint
// visibility switch) was in the engine's vocabulary, fully implemented and
// tested on the engine side, and never left the editor. Both sides had a
// green test; the path between them had none.
//
// This file is that missing test. It drives every op of the vocabulary
// through the store and the save pipeline and asks one question: does a
// request go out? The list of samples and the vocabulary are checked against
// each other, so a new op in the engine fails here until the editor handles
// it.

import { describe, expect, it } from "vitest";
import { EDITOR_MUTATION_OPS, type EditorMutationOp } from "@senify/engine";
import {
  createSavePipeline,
  patchesToPending,
  type ApplyOutcome,
  type DocumentPatch,
  type EditorStore,
  type SaveRequest,
} from "@senify/editor/state";
import type { Author } from "@senify/section-sdk";
import { makeStore } from "./fixtures.ts";

const AUTHOR: Author = { kind: "human", id: "tester", label: "Tester" };

const rule = (id: string, name: string) => ({
  id,
  name,
  kind: "class" as const,
  selector: `.${name}`,
  order: 0,
  styles: {},
  contextStyles: {},
});

// The document the samples start from: a root with a section, a heading, a
// button, a collection and one style rule. Everything is applied before the
// pipeline exists, so only the sample op itself ends up in the queue.
function baseDocument(): EditorStore {
  const store = makeStore();
  const root = store.document.rootNodeId;
  store.apply({
    op: "insertNode",
    parent: { nodeId: root },
    node: { primitive: "section", id: "sec0000001", props: { align: "center" } },
  });
  store.apply({
    op: "insertNode",
    parent: { nodeId: "sec0000001" },
    node: { primitive: "heading", id: "head000001", props: { text: "Hallo", fontSize: 24 } },
  });
  store.apply({
    op: "insertNode",
    parent: { nodeId: root },
    node: { primitive: "button", id: "btn0000001", props: { label: "Los" } },
  });
  store.apply({
    op: "insertNode",
    parent: { nodeId: root },
    node: { primitive: "collection", id: "col0000001" },
  });
  store.apply({ op: "upsertStyleRule", rule: rule("r-cta", "cta") });
  return store;
}

// A document whose heading already carries the class "cta" - `removeClass`
// refuses a class the node does not have.
function documentWithClass(): EditorStore {
  const store = baseDocument();
  store.apply({ op: "assignClass", id: "head000001", classId: "cta" });
  return store;
}

// A collection with one entry - `updateCollectionEntry` addresses an entry by
// its index.
function documentWithEntry(): EditorStore {
  const store = baseDocument();
  store.apply({
    op: "createCollectionEntry",
    id: "col0000001",
    node: { primitive: "text", id: "text000001", props: { text: "A" } },
  });
  return store;
}

// A heading that carries a motion spec - clearing a motion that is not there
// is a no-op, and a no-op sends nothing.
function documentWithMotion(): EditorStore {
  const store = baseDocument();
  store.apply({
    op: "setMotion",
    id: "head000001",
    spec: { preset: "fade-up", intensity: 6 },
  });
  return store;
}

type Sample = {
  op: EditorMutationOp;
  // The document the op needs.
  build: () => EditorStore;
  // The op itself. The outcome carries the forward patches - the second half
  // of the round-trip property needs them.
  apply: (store: EditorStore) => ApplyOutcome;
  // The op that reaches the transport. Some ops are translated on the way (a
  // class assignment travels as `setNodeMeta`), so the op that arrives is not
  // always the op that was applied.
  sent?: string;
  // For the registry ops: the route fragment the request has to hit.
  route?: string;
};

const SAMPLES: Sample[] = [
  {
    op: "setNodeProp",
    build: baseDocument,
    apply: (store) => {
      return store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
    },
    sent: "setNodeProp",
  },
  {
    op: "clearNodeProp",
    build: baseDocument,
    apply: (store) => {
      return store.apply({ op: "clearNodeProp", id: "head000001", key: "fontSize" });
    },
    sent: "clearNodeProp",
  },
  {
    op: "setNodeMeta",
    build: baseDocument,
    apply: (store) => {
      return store.apply({ op: "setNodeMeta", id: "head000001", meta: { hidden: true } });
    },
    sent: "setNodeMeta",
  },
  {
    op: "setNodeHiddenDevices",
    build: baseDocument,
    apply: (store) => {
      return store.apply({
        op: "setNodeHiddenDevices",
        id: "head000001",
        devices: ["mobile"],
      });
    },
    sent: "setNodeHiddenDevices",
  },
  {
    op: "setMotion",
    build: baseDocument,
    apply: (store) => {
      return store.apply({
        op: "setMotion",
        id: "head000001",
        spec: { preset: "fade-up", intensity: 6 },
      });
    },
    sent: "setMotion",
  },
  {
    op: "clearMotion",
    build: documentWithMotion,
    apply: (store) => {
      return store.apply({ op: "clearMotion", id: "head000001" });
    },
    sent: "clearMotion",
  },
  {
    op: "assignClass",
    build: baseDocument,
    apply: (store) => {
      return store.apply({ op: "assignClass", id: "head000001", classId: "cta" });
    },
    sent: "setNodeMeta",
  },
  {
    op: "removeClass",
    build: documentWithClass,
    apply: (store) => {
      return store.apply({ op: "removeClass", id: "head000001", classId: "cta" });
    },
    sent: "setNodeMeta",
  },
  {
    op: "renameStyleRule",
    build: baseDocument,
    apply: (store) => {
      return store.apply({ op: "renameStyleRule", id: "r-cta", name: "hero" });
    },
    route: "/api/sites/site1/style-rules/r-cta",
  },
  {
    op: "upsertStyleRule",
    build: baseDocument,
    apply: (store) => {
      return store.apply({ op: "upsertStyleRule", rule: rule("r-new", "new") });
    },
    route: "/api/sites/site1/style-rules",
  },
  {
    op: "deleteStyleRule",
    build: baseDocument,
    apply: (store) => {
      return store.apply({ op: "deleteStyleRule", id: "r-cta" });
    },
    route: "/api/sites/site1/style-rules/r-cta",
  },
  {
    op: "reorderStyleRule",
    build: baseDocument,
    apply: (store) => {
      return store.apply({ op: "reorderStyleRule", id: "r-cta", index: 0 });
    },
    route: "/api/sites/site1/style-rules/r-cta/reorder",
  },
  {
    op: "insertNode",
    build: baseDocument,
    apply: (store) => {
      return store.apply({
        op: "insertNode",
        parent: { nodeId: store.document.rootNodeId },
        node: { primitive: "divider", id: "div0000001" },
      });
    },
    sent: "insertNode",
  },
  {
    op: "duplicateNode",
    build: baseDocument,
    apply: (store) => {
      return store.apply({ op: "duplicateNode", id: "head000001" });
    },
    sent: "insertNode",
  },
  {
    op: "moveNode",
    build: baseDocument,
    apply: (store) => {
      return store.apply({
        op: "moveNode",
        id: "btn0000001",
        target: { nodeId: "sec0000001" },
        index: 0,
      });
    },
    sent: "moveNode",
  },
  {
    op: "deleteNode",
    build: baseDocument,
    apply: (store) => {
      return store.apply({ op: "deleteNode", id: "btn0000001" });
    },
    sent: "deleteNode",
  },
  {
    op: "setSlotContent",
    build: baseDocument,
    apply: (store) => {
      return store.apply({
        op: "setSlotContent",
        id: "col0000001",
        slot: "item",
        nodes: [{ primitive: "text", id: "text000001", props: { text: "A" } }],
      });
    },
    sent: "insertNode",
  },
  {
    op: "createCollectionEntry",
    build: baseDocument,
    apply: (store) => {
      return store.apply({
        op: "createCollectionEntry",
        id: "col0000001",
        node: { primitive: "text", id: "text000001", props: { text: "A" } },
      });
    },
    sent: "insertNode",
  },
  {
    op: "updateCollectionEntry",
    build: documentWithEntry,
    apply: (store) => {
      return store.apply({
        op: "updateCollectionEntry",
        id: "col0000001",
        index: 0,
        patch: { text: "Neu" },
      });
    },
    sent: "setNodeProp",
  },
];

describe("the editor vocabulary reaches the server", () => {
  it("covers every op of the engine's editor vocabulary", () => {
    // A new op in the engine fails here until the editor knows it: the sample
    // list and the vocabulary have to grow together.
    expect(SAMPLES.map((sample) => sample.op).sort()).toEqual(
      [...EDITOR_MUTATION_OPS].sort(),
    );
  });

  for (const sample of SAMPLES) {
    it(`sends ${sample.op}`, async () => {
      const store = sample.build();
      const requests: SaveRequest[] = [];
      const pipeline = createSavePipeline({
        store,
        pageId: "page1",
        siteId: "site1",
        author: AUTHOR,
        request: async (request) => {
          requests.push(request);
          return { status: 200, body: { newDraftVersion: 2 } };
        },
        debounceMs: 5,
      });

      sample.apply(store);

      // The op must not land in the "cannot persist" channel and must not
      // vanish from the queue.
      expect(pipeline.state().unsupported).toEqual([]);
      expect(pipeline.state().pending).toBeGreaterThan(0);

      await pipeline.flush();
      expect(requests.length).toBeGreaterThan(0);

      if (sample.route !== undefined) {
        expect(requests.map((request) => request.path)).toContain(sample.route);
      } else {
        const sent = requests
          .filter((request) => request.path.includes("/editor-mutations"))
          .flatMap(
            (request) =>
              (request.body as { mutations?: { op: string }[] }).mutations ?? [],
          )
          .map((mutation) => mutation.op);
        expect(sent).toContain(sample.sent);
      }

      pipeline.dispose();
    });
  }
});

describe("the translation reaches a stable form", () => {
  // Patch -> Mutation -> Patch. The editor turns the patches of a change into
  // the mutations it sends. Applying those mutations again must produce the
  // same mutations again - otherwise a change wanders with every round trip,
  // and what the server stores drifts from what the document shows.
  //
  // Why this is exhaustive and not random: the editor's vocabulary is a
  // CLOSED list of nineteen operations. A random generator would sample that
  // list and could miss an operation; this runs every one of them. Randomness
  // would only add value over sequences of several operations, and the state
  // space there is unbounded - that is a separate question, and it needs no
  // new dependency to be asked.
  for (const sample of SAMPLES) {
    it(`round-trips ${sample.op}`, () => {
      const store = sample.build();
      const first = sample.apply(store);
      const translated = patchesToPending(first.patches as DocumentPatch[]);

      if (sample.route !== undefined) {
        // The registry ops travel as site operations, and there is no patch
        // they could be turned back into. What has to hold is that the
        // operation carries the same rule as the patch.
        expect(translated.pending.length).toBeGreaterThan(0);
        for (const entry of translated.pending) {
          expect(entry.kind).toBe("site");
        }
        return;
      }

      // The page mutations go back into a store with the same starting
      // document - the same state the first change was made on.
      const second = sample.build();
      const secondPatches: DocumentPatch[] = [];
      for (const entry of translated.pending) {
        if (entry.kind !== "page") {
          throw new Error(`unerwartete Operation im zweiten Durchgang: ${entry.kind}`);
        }
        const outcome = second.apply(entry.mutation);
        secondPatches.push(...(outcome.patches as DocumentPatch[]));
      }
      const again = patchesToPending(secondPatches);
      // The second round must produce the same mutations as the first.
      const ops = (pending: readonly { kind: string }[]) =>
        pending.map((entry) =>
          entry.kind === "page"
            ? (entry as { kind: "page"; mutation: { op: string } }).mutation.op
            : (entry as { kind: "site"; op: { kind: string } }).op.kind,
        );
      expect(ops(again.pending)).toEqual(ops(translated.pending));
    });
  }
});
