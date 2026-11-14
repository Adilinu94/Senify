import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootEngine, type BootEnv } from "./helpers.ts";

let env: BootEnv;

beforeAll(async () => {
  env = await bootEngine();
});

afterAll(async () => {
  await env.close();
});

// The editor's live preview (spec 2026-11-12, Task 9) imports the widget cores
// from the engine and mounts them into the canvas frame; the local program
// proxies `/api/` with its operator token. The body is JavaScript, so the
// assertions read it as text (the JSON harness would drop it).
function get(path: string): Promise<Response> {
  return fetch(`${env.server.origin}${path}`, {
    headers: { authorization: `Bearer ${env.token}` },
  });
}

describe("widget module route", () => {
  it("serves a widget core as ESM", async () => {
    const response = await get("/api/widget-module?type=ribbon-gallery");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/javascript");
    expect(await response.text()).toContain("mount");
  });

  it("rejects unknown widget types", async () => {
    const response = await get("/api/widget-module?type=evil-widget");
    expect(response.status).toBe(404);
  });

  it("rejects a missing type", async () => {
    const response = await get("/api/widget-module");
    expect(response.status).toBe(404);
  });
});
