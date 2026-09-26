import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  breakpointForWidth,
  type ReferenceDiffDeps,
} from "@senify/engine";
import {
  bootEngine,
  createTestPage,
  createTestSite,
  TEST_AUTHOR,
  type BootEnv,
  type ErrorResponse,
} from "./helpers.ts";

// Prüfstelle 1 für den Referenz-Diff (E26 slice 2): die Route backt den Draft
// in ein Wegwerf-Verzeichnis, nimmt ihn in den Slot-Breiten der Referenz auf
// und legt Kennzahl + Heatmap je Slot ab. Kein Browser in diesem Test: Capture
// und Differ sind Doppel; der echte Pfad (Playwright) läuft im Betrieb.

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
  "hex",
);

function pngImage(width: number, height: number): string {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

type DiffView = {
  referenceId: string;
  note: string | null;
  diffs: {
    snapshotKind: string;
    breakpoint: string;
    width: number;
    pageId: string;
    pagePath: string;
    changedPixels: number;
    ratio: number;
    bounds: { left: number; top: number; right: number; bottom: number } | null;
    storageRef: string;
    previewPath: string;
  }[];
};

let env: BootEnv;
let siteId: string;
let pageId: string;
let referenceId: string;
const captureWidths: Record<string, number | undefined>[] = [];

const deps: ReferenceDiffDeps = {
  captureScreenshots: async (options) => {
    const breakpoint = options.breakpoints?.[0] ?? "desktop";
    const width = options.widths?.[breakpoint] ?? 1440;
    captureWidths.push({ ...(options.widths ?? {}) });
    mkdirSync(options.outDir, { recursive: true });
    const path = join(options.outDir, `${breakpoint}.png`);
    writeFileSync(path, PNG);
    return [{ breakpoint, path, width, height: 900, bytes: PNG.byteLength }];
  },
  diffScreenshots: async (input) => ({
    width: 100,
    height: 100,
    changedPixels: 42,
    ratio: 0.0042,
    bounds: { left: 1, top: 2, right: 3, bottom: 4 },
    // The heatmap comes back as the captured file itself.
    path: input.after,
  }),
};

beforeAll(async () => {
  env = await bootEngine({ referenceDiffs: deps });
  siteId = (await createTestSite(env.api, "Diff Studio")).id;
  const page = await createTestPage(env.api, siteId, { title: "Start", path: "/" });
  pageId = page.id;
  const stored = await env.api.request<{ reference: { id: string } }>({
    method: "POST",
    path: "/api/references/manual",
    body: {
      name: "Diff-Vorbild",
      image: pngImage(1920, 1080),
      imageMobile: pngImage(360, 800),
      author: TEST_AUTHOR,
    },
  });
  expect(stored.status).toBe(201);
  referenceId = stored.body.reference.id;
});

afterAll(async () => {
  await env.close();
});

describe("reference visual diff (E26 slice 2)", () => {
  it("maps widths to the nearest breakpoint", () => {
    expect(breakpointForWidth(1920)).toBe("desktop");
    expect(breakpointForWidth(1440)).toBe("desktop");
    expect(breakpointForWidth(810)).toBe("tablet");
    expect(breakpointForWidth(390)).toBe("mobile");
    expect(breakpointForWidth(360)).toBe("mobile");
  });

  it("diffs every hero slot at its own width with number and heatmap", async () => {    const response = await env.api.request<DiffView>({
      method: "POST",
      path: `/api/references/${referenceId}/visual-diff`,
      body: { siteId },
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.referenceId).toBe(referenceId);
    expect(response.body.note).toBeNull();
    expect(response.body.diffs).toHaveLength(2);
    const [desktop, mobile] = response.body.diffs;
    expect(desktop?.snapshotKind).toBe("hero-desktop");
    expect(desktop?.breakpoint).toBe("desktop");
    expect(desktop?.width).toBe(1920);
    expect(desktop?.pageId).toBe(pageId);
    expect(desktop?.changedPixels).toBe(42);
    expect(desktop?.ratio).toBe(0.0042);
    expect(desktop?.bounds).toEqual({ left: 1, top: 2, right: 3, bottom: 4 });
    expect(desktop?.previewPath).toContain(
      `/api/references/${referenceId}/visual-diffs/`,
    );
    expect(mobile?.snapshotKind).toBe("hero-mobile");
    expect(mobile?.breakpoint).toBe("mobile");
    expect(mobile?.width).toBe(360);
    // The result was captured at the slot widths, not the fixed viewports.
    expect(captureWidths).toContainEqual({ desktop: 1920 });
    expect(captureWidths).toContainEqual({ mobile: 360 });

    // The heatmap is served through the whitelisted file route.
    const heat = await env.api.request<Buffer>({
      method: "GET",
      path: desktop?.previewPath ?? "",
    });
    expect(heat.status).toBe(200);
  }, 60000);

  it("narrows to one page when pageId is given", async () => {
    const response = await env.api.request<DiffView>({
      method: "POST",
      path: `/api/references/${referenceId}/visual-diff`,
      body: { siteId, pageId },
    });
    expect(response.status).toBe(200);
    expect(response.body.diffs).toHaveLength(2);
    expect(
      response.body.diffs.every((diff) => diff.pageId === pageId),
    ).toBe(true);
  }, 60000);

  it("names unknown references, pages and missing input", async () => {
    const unknown = await env.api.request<ErrorResponse>({
      method: "POST",
      path: "/api/references/ref_gibt_es_nicht/visual-diff",
      body: { siteId },
    });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.field).toBe("referenceId");

    const noPage = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/references/${referenceId}/visual-diff`,
      body: { siteId, pageId: "page_gibt_es_nicht" },
    });
    expect(noPage.status).toBe(404);
    expect(noPage.body.error.field).toBe("pageId");

    const noSite = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/references/${referenceId}/visual-diff`,
      body: {},
    });
    expect(noSite.status).toBe(400);
  }, 60000);

  it("reports honestly when the reference has no diffable slots", async () => {
    const stored = await env.api.request<{ reference: { id: string } }>({
      method: "POST",
      path: "/api/references",
      body: {
        url: "https://ohne-bild.test",
        author: TEST_AUTHOR,
        wait: true,
        snapshot: { html: "<html><body><h1>Ohne Bild</h1></body></html>" },
      },
    });
    expect(stored.status).toBe(201);
    const empty = await env.api.request<DiffView>({
      method: "POST",
      path: `/api/references/${stored.body.reference.id}/visual-diff`,
      body: { siteId },
    });
    expect(empty.status).toBe(200);
    expect(empty.body.diffs).toEqual([]);
    expect(empty.body.note).toContain("keine vergleichbaren Screenshots");
  }, 60000);

  it("rejects traversal in the heatmap file route", async () => {
    const evil = await env.api.request<ErrorResponse>({
      method: "GET",
      path: `/api/references/${referenceId}/visual-diffs/..%2F..%2Fpackage.json`,
    });
    expect(evil.status).toBe(404);
  }, 60000);
});
