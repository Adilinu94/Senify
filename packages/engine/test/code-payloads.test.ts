import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PAGE_ROOT_TYPE, type NodeTree } from "@senify/section-sdk";
import {
  bakePages,
  createCodePayload,
  hardGuardrailsForTree,
  MAX_PAYLOAD_BYTES,
  payloadRefOf,
  type CodePayload,
  type Page,
  type Site,
} from "@senify/engine";
import {
  bootEngine,
  createTestPage,
  createTestSite,
  type BootEnv,
  type ErrorResponse,
  type SiteResponse,
} from "./helpers.ts";

// Imported foreign code (ADR-0010): the payload is a site's code package with
// mandatory provenance and licence, delivered by the bake as
// `assets/payloads/<id>.<hash>.js`. The tests pin the rules *around* the
// bundle: size gate, provenance gate, integrity, guardrail budgets and the
// three-stage fallback in the emitted markup.

const BUNDLE = `/* test payload */
export function mount(stage, options) {
  stage.textContent = "payload mounted " + (options?.id ?? "");
}
`;

const framerProvenance = {
  kind: "framer-import" as const,
  sourceUrl: "https://yeuxtest.framer.website/hero",
  pagePath: "/hero",
  irHash: "ir-1",
  capturedAt: "2026-09-23T00:00:00.000Z",
};

function payloadNode(id: string, payloadId: string): NodeTree["nodes"][string] {
  return { id, type: "payload", props: { payloadId } };
}

let env: BootEnv;
let site: SiteResponse;

beforeAll(async () => {
  env = await bootEngine();
  site = await createTestSite(env.api, "Payload Werk");
});

afterAll(async () => {
  await env.close();
});

describe("createCodePayload", () => {
  it("stores a payload and derives bytes and integrity from the bundle", async () => {
    const payload = await createCodePayload(env.engine.store, {
      siteId: site.id,
      body: {
        name: "Hero 3D",
        kind: "module",
        bundle: BUNDLE,
        provenance: framerProvenance,
        license: { id: "MIT", assertedBy: "import" },
      },
    });
    expect(payload.name).toBe("Hero 3D");
    expect(payload.kind).toBe("module");
    expect(payload.bytes).toBe(Buffer.byteLength(BUNDLE, "utf8"));
    expect(payload.integrity).toMatch(/^[0-9a-f]{64}$/);
    expect(payload.provenance).toMatchObject({ kind: "framer-import" });
    expect(payload.license).toMatchObject({ id: "MIT", assertedBy: "import" });
    expect(payload.version).toBe(1);
  });

  it("rejects an oversized bundle", async () => {
    const oversized = `export function mount(h) {}\n// ${"x".repeat(MAX_PAYLOAD_BYTES)}`;
    await expect(
      createCodePayload(env.engine.store, {
        siteId: site.id,
        body: {
          name: "Zu groß",
          kind: "module",
          bundle: oversized,
          provenance: { kind: "hand" },
          license: { id: "unknown" },
        },
      }),
    ).rejects.toMatchObject({ category: "validation" });
  });

  it("rejects a bundle without a mount export", async () => {
    await expect(
      createCodePayload(env.engine.store, {
        siteId: site.id,
        body: {
          name: "Kein Mount",
          kind: "module",
          bundle: "export const answer = 42;\n",
          provenance: { kind: "hand" },
          license: { id: "unknown" },
        },
      }),
    ).rejects.toMatchObject({ category: "validation" });
  });

  it("demands a sourceUrl for a framer import", async () => {
    await expect(
      createCodePayload(env.engine.store, {
        siteId: site.id,
        body: {
          name: "Ohne Herkunft",
          kind: "module",
          bundle: BUNDLE,
          provenance: { kind: "framer-import" },
          license: { id: "unknown" },
        },
      }),
    ).rejects.toMatchObject({ field: "provenance.sourceUrl" });
  });

  it("creates a payload through the HTTP route and lists it", async () => {
    const created = await env.api.request<CodePayload & ErrorResponse>({
      method: "POST",
      path: `/api/sites/${site.id}/code-payloads`,
      body: {
        name: "Slider",
        kind: "module",
        bundle: BUNDLE,
        provenance: { kind: "upload", sourceUrl: "https://example.test/slider.js" },
        license: { id: "MIT", note: "vendor bundle" },
      },
    });
    expect(created.status).toBe(201);
    const payload = created.body as unknown as CodePayload;
    expect(payload.license).toMatchObject({ id: "MIT" });

    const list = await env.api.request<{ payloads: CodePayload[] }>({
      method: "GET",
      path: `/api/sites/${site.id}/code-payloads`,
    });
    expect(list.status).toBe(200);
    expect(list.body.payloads.some((entry) => entry.id === payload.id)).toBe(true);

    const read = await env.api.request<{ id: string }>({
      method: "GET",
      path: `/api/code-payloads/${payload.id}`,
    });
    expect(read.status).toBe(200);
  });

  it("hides the bundle from metadata reads", async () => {
    const created = await env.api.request<CodePayload>({
      method: "POST",
      path: `/api/sites/${site.id}/code-payloads`,
      body: {
        name: "Diskret",
        kind: "module",
        bundle: BUNDLE,
        provenance: { kind: "hand" },
        license: { id: "unknown" },
      },
    });
    expect(created.status).toBe(201);
    const id = (created.body as unknown as CodePayload).id;
    const read = await env.api.request<Record<string, unknown>>({
      method: "GET",
      path: `/api/code-payloads/${id}`,
    });
    expect(JSON.stringify(read.body)).not.toContain("payload mounted");
  });
});

describe("payload guardrails", () => {
  it("recognises a payload carrier through payloadRefOf", () => {
    expect(payloadRefOf({ type: "payload", props: { payloadId: "p1" } })).toBe("p1");
    expect(payloadRefOf({ type: "payload", props: {} })).toBeUndefined();
    expect(payloadRefOf({ type: "frame", props: { payloadId: "p1" } })).toBeUndefined();
  });

  it("flags payload excess per profile budget", () => {
    const tree = (count: number): NodeTree => ({
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: PAGE_ROOT_TYPE, props: {} },
        ...Object.fromEntries(
          Array.from({ length: count }, (_, index) => [
            `p${index}`,
            payloadNode(`p${index}`, `payload-${index}`),
          ]),
        ),
      },
    });
    expect(hardGuardrailsForTree(tree(1), "clean")).toEqual([]);
    expect(hardGuardrailsForTree(tree(2), "clean")[0]?.code).toBe("payload-excess");
    expect(hardGuardrailsForTree(tree(3), "standard")).toEqual([]);
    expect(hardGuardrailsForTree(tree(4), "standard")[0]?.code).toBe("payload-excess");
    expect(hardGuardrailsForTree(tree(8), "showcase")).toEqual([]);
    // Without a profile the generic budget (1) applies.
    expect(hardGuardrailsForTree(tree(2))[0]?.code).toBe("payload-excess");
  });

  it("shares one heavy-surface budget between payloads and 3D scenes", () => {
    const mixed: NodeTree = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: PAGE_ROOT_TYPE, props: {} },
        scene: { id: "scene", type: "media", variant: "3d-scene", props: {} },
        p1: payloadNode("p1", "payload-1"),
      },
    };
    // standard allows 3; one scene + one payload is inside it.
    expect(hardGuardrailsForTree(mixed, "standard")).toEqual([]);
    // clean allows 1 heavy surface: the pair is over it.
    const codes = hardGuardrailsForTree(mixed, "clean").map((entry) => entry.code);
    expect(codes).toContain("heavy-surface-excess");
  });
});

describe("payload fallback in the bake", () => {
  it(
    "emits the payload file, the island wiring and the manifest entry",
    async () => {
    const payload = await createCodePayload(env.engine.store, {
      siteId: site.id,
      body: {
        name: "Bake Hero",
        kind: "module",
        bundle: BUNDLE,
        provenance: framerProvenance,
        license: { id: "MIT" },
      },
    });
    const created = await createTestPage(env.api, site.id, { title: "Bake", path: "/bake" });
    const tree: NodeTree = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: PAGE_ROOT_TYPE, props: {}, children: ["carrier"] },
        carrier: {
          id: "carrier",
          type: "payload",
          props: { payloadId: payload.id, alt: "3D-Hero", label: "Hero 3D" },
        },
      },
    };
    await env.engine.store.updatePage(created.id, created.draftVersion, {
      draft: tree,
      title: "Bake",
      path: "/bake",
    });
    const page: Page = await env.engine.store.getPage(created.id);
    const storedSite: Site = await env.engine.store.getSite(site.id);
    const outDir = mkdtempSync(join(tmpdir(), "senify-payload-bake-"));
    try {
      const result = await bakePages(env.engine.store, {
        site: storedSite,
        pages: [page],
        outDir,
        dataDir: env.engine.dataDir,
      });
      // The manifest names the payload and its URL rides the integrity prefix.
      expect(result.payloads).toHaveLength(1);
      expect(result.payloads[0]?.id).toBe(payload.id);
      expect(result.payloads[0]?.url).toBe(`/assets/payloads/${payload.id}.${payload.integrity.slice(0, 8)}.js`);
      // The island script wires the host to the payload URL.
      const islands = readFileSync(join(result.outDir, "assets", "islands.js"), "utf8");
      expect(islands).toContain('data-island="payload"');
      expect(islands).toContain(`/assets/payloads/${payload.id}.${payload.integrity.slice(0, 8)}.js`);
      // The page carries the markup states: poster stands, plate is the answer
      // when there is no poster and no module.
      const html = readFileSync(join(result.outDir, "bake", "index.html"), "utf8");
      expect(html).toContain('data-payload-id="' + payload.id + '"');
      expect(html).toContain("w-payload--plate");
      } finally {
        rmSync(outDir, { recursive: true, force: true });
      }
    },
    120000,
  );

  it("reports a carrier whose payload is missing instead of dropping it", async () => {
    const created = await createTestPage(env.api, site.id, { title: "Leer", path: "/leer" });
    const tree: NodeTree = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: PAGE_ROOT_TYPE, props: {}, children: ["carrier"] },
        carrier: { id: "carrier", type: "payload", props: { payloadId: "does-not-exist" } },
      },
    };
    await env.engine.store.updatePage(created.id, created.draftVersion, {
      draft: tree,
      title: "Leer",
      path: "/leer",
    });
    const page: Page = await env.engine.store.getPage(created.id);
    const storedSite: Site = await env.engine.store.getSite(site.id);
    const outDir = mkdtempSync(join(tmpdir(), "senify-payload-miss-"));
    try {
      const result = await bakePages(env.engine.store, {
        site: storedSite,
        pages: [page],
        outDir,
        dataDir: env.engine.dataDir,
      });
      expect(result.payloads).toHaveLength(0);
      const missing = result.warnings.find((warning) => warning.code === "payload-missing");
      expect(missing?.page).toBe("/leer");
      expect(missing?.message).toContain("does-not-exist");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 120000);
});
