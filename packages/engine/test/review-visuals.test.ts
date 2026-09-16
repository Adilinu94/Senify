import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Mutation, ReviewVisualDriver, ReviewVisualRequest } from "@senify/engine";
import {
  applyMutationsRequest,
  bootEngine,
  createTestPage,
  createTestSite,
  TEST_AUTHOR,
  type BootEnv,
  type PageResponse,
} from "./helpers.ts";

// Prüfstelle 1 für die Review-Artefakte (T07): der Submit ruft den injizierten
// Treiber auf, legt Screenshots, Diff und das Motion-Video am Review-Item ab
// und liefert sie über die Visual-Route aus. Kein Browser in diesem Test: der
// Treiber ist ein Doppel, der echte Pfad (Playwright) läuft in
// references-capture.test.ts und im Betrieb.

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
  "hex",
);
const WEBM = Buffer.from("1a45dfa3a3", "hex");

type ReviewView = {
  id: string;
  status: string;
  visuals: {
    capturedAt: string;
    note?: string;
    assets: { pageId: string; role: string; breakpoint: string; previewPath: string; bytes: number }[];
    diffs: { pageId: string; breakpoint: string; ratio: number; changedPixels: number; bounds: unknown; previewPath: string }[];
    video?: { durationMs: number; previewPath: string; bytes: number };
  } | null;
  structureDiff: { pageId: string; sections: { fields: string[] }[] }[];
};

let env: BootEnv;
let siteId: string;
let page: PageResponse;
let failNext = false;
const requests: ReviewVisualRequest[] = [];

const driver: ReviewVisualDriver = async (input) => {
  requests.push(input);
  if (failNext) throw new Error("Browser nicht gefunden");
  const target = input.pages[0];
  if (target === undefined) throw new Error("kein Ziel");
  return {
    screenshots: [
      {
        pageId: target.pageId,
        path: target.path,
        role: "after",
        breakpoint: "desktop",
        width: 1440,
        height: 900,
        bytes: PNG,
      },
      {
        pageId: target.pageId,
        path: target.path,
        role: "before",
        breakpoint: "desktop",
        width: 1440,
        height: 900,
        bytes: PNG,
      },
    ],
    diffs: [
      {
        pageId: target.pageId,
        breakpoint: "desktop",
        changedPixels: 12,
        ratio: 0.01,
        bounds: { left: 1, top: 2, right: 3, bottom: 4 },
        bytes: PNG,
      },
    ],
    ...(input.recordMotion ? { video: { bytes: WEBM, durationMs: 3840 } } : {}),
  };
};

beforeAll(async () => {
  env = await bootEngine({ reviewVisuals: driver });
  siteId = (await createTestSite(env.api, "Visual Studio")).id;
  page = await createTestPage(env.api, siteId, { title: "Start", path: "/" });
});

afterAll(async () => {
  await env.close();
});

async function loadPage(): Promise<PageResponse> {
  const response = await env.api.request<PageResponse>({
    method: "GET",
    path: `/api/pages/${page.id}`,
  });
  expect(response.status).toBe(200);
  return response.body;
}

async function apply(mutations: Mutation[]): Promise<void> {
  const result = await applyMutationsRequest(env.api, await loadPage(), mutations);
  expect(result.status).toBe(200);
}

async function submitReview(): Promise<ReviewView> {
  const submitted = await env.api.request<{ review: ReviewView }>({
    method: "POST",
    path: `/api/sites/${siteId}/reviews`,
    body: { author: TEST_AUTHOR, note: "Bitte prüfen" },
  });
  expect(submitted.status, JSON.stringify(submitted.body)).toBe(201);
  return submitted.body.review;
}

describe("review visuals (T07)", () => {
  it("captures screenshots and the diff against the active release", async () => {
    await apply([
      {
        op: "insertNode",
        parent: { nodeId: (await loadPage()).draft.rootNodeId },
        node: { id: "hero-1", type: "hero", props: { headline: "Vorher" } },
      },
    ]);
    const published = await env.api.request({
      method: "POST",
      path: `/api/sites/${siteId}/releases`,
      body: { author: TEST_AUTHOR, note: "Basis" },
    });
    expect(published.status).toBe(201);

    await apply([{ op: "updateNodeProps", id: "hero-1", patch: { headline: "Nachher" } }]);
    const review = await submitReview();

    // The driver saw both build directories, the changed page and no motion.
    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request?.baseDir).toContain("releases");
    expect(request?.afterDir).toContain("previews");
    expect(request?.pages.map((entry) => entry.path)).toContain("/");
    expect(request?.recordMotion).toBe(false);
    expect(request?.breakpoints).toEqual(["desktop", "tablet", "mobile"]);

    // The item carries the artifacts and the files exist on disk.
    const visuals = review.visuals;
    expect(visuals).not.toBeNull();
    expect(visuals?.assets.map((asset) => asset.role).sort()).toEqual(["after", "before"]);
    expect(visuals?.diffs).toHaveLength(1);
    expect(visuals?.diffs[0]?.changedPixels).toBe(12);
    expect(visuals?.video).toBeUndefined();
    const first = visuals?.assets[0];
    expect(first?.previewPath).toContain(`/api/reviews/${review.id}/visuals/`);
    const fileName = first?.previewPath.split("/").at(-1) ?? "";
    expect(
      existsSync(join(env.engine.dataDir, "reviews", review.id, "visuals", fileName)),
    ).toBe(true);

    // The mapped item (read path) still carries them.
    const loaded = await env.api.request<ReviewView>({
      method: "GET",
      path: `/api/reviews/${review.id}`,
    });
    expect(loaded.body.visuals?.assets).toHaveLength(2);
    expect(loaded.body.visuals?.diffs[0]?.bounds).toEqual({
      left: 1,
      top: 2,
      right: 3,
      bottom: 4,
    });

    // Served with the right content type, PNG bytes unchanged.
    const served = await fetch(`${env.server.origin}${first?.previewPath}`, {
      headers: { authorization: `Bearer ${env.token}` },
    });
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await served.arrayBuffer())).toEqual(PNG);

    // Traversal and foreign names never resolve.
    for (const name of [
      "..%2F..%2Fsecret.png",
      "%2Fetc%2Fpasswd",
      "unbekannt.png",
    ]) {
      const response = await fetch(
        `${env.server.origin}/api/reviews/${review.id}/visuals/${name}`,
        { headers: { authorization: `Bearer ${env.token}` } },
      );
      expect(response.status).toBe(404);
    }
  }, 90_000);

  it("records a motion video when the change touches motion", async () => {
    // hero-1 is part of the active release, so the motion preset shows up as a
    // field change ("motion") of an existing section.
    await apply([{ op: "setMotion", id: "hero-1", spec: { preset: "fade-up" } }]);

    const review = await submitReview();

    expect(requests.at(-1)?.recordMotion).toBe(true);
    const video = review.visuals?.video;
    expect(video).toBeDefined();
    expect(video?.durationMs).toBe(3840);
    expect(video?.bytes).toBe(WEBM.byteLength);
    const served = await fetch(`${env.server.origin}${video?.previewPath}`, {
      headers: { authorization: `Bearer ${env.token}` },
    });
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("video/webm");
    expect(Buffer.from(await served.arrayBuffer())).toEqual(WEBM);
  }, 90_000);

  it("keeps the review when the capture fails and notes it", async () => {
    await apply([{ op: "updateNodeProps", id: "hero-1", patch: { headline: "Fehlerfall" } }]);
    failNext = true;
    try {
      const review = await submitReview();
      expect(review.status).toBe("submitted");
      expect(review.visuals?.assets).toEqual([]);
      expect(review.visuals?.diffs).toEqual([]);
      expect(review.visuals?.note).toContain("Visuelle Aufnahme fehlgeschlagen");
      expect(review.visuals?.note).toContain("Browser nicht gefunden");
    } finally {
      failNext = false;
    }
  }, 90_000);
});
