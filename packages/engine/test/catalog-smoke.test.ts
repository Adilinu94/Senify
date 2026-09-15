import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { goldenTreeToMutations } from "@senify/engine";
import { EXPECTED_SECTION_TYPES } from "@senify/registry";
import {
  applyMutationsRequest,
  bootEngine,
  createTestPage,
  createTestSite,
  type BootEnv,
} from "./helpers.ts";

let env: BootEnv;
let siteId: string;

beforeAll(async () => {
  env = await bootEngine();
  siteId = (await createTestSite(env.api, "Catalog Smoke Site")).id;
});

afterAll(async () => {
  await env.close();
});

describe("catalog insertion smoke test", () => {
  it("inserts every section golden through the engine API", async () => {
    const types = env.registry
      .list()
      .map((section) => section.type)
      .filter((type) => (EXPECTED_SECTION_TYPES as readonly string[]).includes(type));
    expect(types).toHaveLength(EXPECTED_SECTION_TYPES.length);
    for (const type of types) {
      const definition = env.registry.get(type);
      const page = await createTestPage(env.api, siteId, {
        title: definition.type,
      });
      const placement = goldenTreeToMutations(definition.golden.tree, {
        nodeId: page.draft.rootNodeId,
      });
      const response = await applyMutationsRequest(
        env.api,
        page,
        placement.mutations,
      );
      expect(response.status, `insert ${definition.type}`).toBe(200);
      expect(response.body.newDraftVersion).toBe(2);
    }
  });
});
