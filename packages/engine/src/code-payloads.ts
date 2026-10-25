import { SenifyError } from "@senify/core";
import { MAX_PAYLOAD_BYTES } from "./guardrails.ts";
import { newEntityId } from "./ids.ts";
import type { Store } from "./store.ts";
import type { CodePayload, CodePayloadLicense, CodePayloadProvenance } from "./types.ts";
import type { CreateCodePayloadBody } from "./code-payloads-contract.ts";

// Imported foreign code (ADR-0010). The engine owns the rules *around* the
// bundle — size, provenance, licence — the importer owns the bundle itself.

// The loader contract of the bake script (`renderIslandsScript`): a payload
// module must export a mount function. Checking for the keyword is a cheap
// gate, not a sandbox — a module that passes it can still fail at runtime, and
// then the page falls back to the poster (ADR-0010 §7).
function isModuleSource(bundle: string): boolean {
  return /\bexport\b/.test(bundle) && /\bmount\b/.test(bundle);
}

export function prepareCodePayload(input: {
  id: string;
  name: string;
  kind: CodePayload["kind"];
  bundle: string;
  provenance: CreateCodePayloadBody["provenance"] | {
    kind: CodePayloadProvenance["kind"];
    sourceUrl: string | null;
    pagePath: string | null;
    irHash: string | null;
    capturedAt: string | null;
  };
  license: CreateCodePayloadBody["license"] | { id: string; note: string | null; assertedBy: string | null };
}): {
  id: string;
  name: string;
  kind: CodePayload["kind"];
  bundle: string;
  provenance: CodePayloadProvenance;
  license: CodePayloadLicense;
} {
  const { bundle, name } = input;
  const bytes = Buffer.byteLength(bundle, "utf8");
  if (bytes > MAX_PAYLOAD_BYTES) {
    throw new SenifyError(
      "validation",
      `Payload "${name}" is ${bytes} bytes (max ${MAX_PAYLOAD_BYTES})`,
      {
        field: "bundle",
        suggestion:
          "Split the component or drop the parts the import report marked as unrenderable.",
      },
    );
  }
  if (!isModuleSource(bundle)) {
    throw new SenifyError(
      "validation",
      `Payload "${name}" does not export a mount function`,
      {
        field: "bundle",
        suggestion:
          'A payload is an ES module with `export function mount(host, options)`; the bake script calls it.',
      },
    );
  }
  return {
    id: input.id,
    name,
    kind: input.kind,
    bundle,
    provenance: normalizeProvenance(input.provenance),
    license: {
      id: input.license.id,
      note: input.license.note ?? null,
      assertedBy: input.license.assertedBy ?? null,
    },
  };
}

export async function createCodePayload(
  store: Store,
  input: { siteId: string; body: CreateCodePayloadBody },
): Promise<CodePayload> {
  const prepared = prepareCodePayload({ ...input.body, id: newEntityId() });
  return store.createCodePayload({
    ...prepared,
    siteId: input.siteId,
  });
}

/**
 * The carriers of a run point at the payload ids they got.
 *
 * The import names a payload by its integrity (the id of the store is not
 * known while the import runs); the write path and the preview replace that
 * name with the id they use. Without this the carrier would keep a name no
 * payload answers to and the release would show the plate instead of the
 * code.
 */
export function applyPayloadIds(
  document: { nodes: Record<string, { primitive: string; props: Record<string, unknown> }> },
  payloads: readonly { integrity: string; id: string }[],
): void {
  const byIntegrity = new Map(payloads.map((payload) => [payload.integrity, payload.id]));
  for (const node of Object.values(document.nodes)) {
    if (node.primitive !== "payload") continue;
    const key = node.props["framerPayloadKey"];
    const id = typeof key === "string" ? byIntegrity.get(key) : undefined;
    if (id !== undefined) node.props["payloadId"] = id;
    delete node.props["framerPayloadKey"];
  }
}

// A Framer import must name its source page: it is what the import report, the
// audit trail and "open in original" read. Every other kind may stay unnamed.
export function normalizeProvenance(
  input: CreateCodePayloadBody["provenance"] | {
    kind: CodePayloadProvenance["kind"];
    sourceUrl: string | null;
    pagePath: string | null;
    irHash: string | null;
    capturedAt: string | null;
  },
): CodePayloadProvenance {
  if (input.kind === "framer-import" && (input.sourceUrl ?? "") === "") {
    throw new SenifyError(
      "validation",
      "An imported payload must name the page it came from",
      {
        field: "provenance.sourceUrl",
        suggestion: "Pass the published URL of the imported page as `provenance.sourceUrl`.",
      },
    );
  }
  return {
    kind: input.kind,
    sourceUrl: input.sourceUrl ?? null,
    pagePath: input.pagePath ?? null,
    irHash: input.irHash ?? null,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
  };
}
