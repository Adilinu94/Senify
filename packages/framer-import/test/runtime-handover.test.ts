import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { buildRuntimePayload, detectFramerRuntime } from "../src/runtime-payload.ts";

// The preloaded collection data of a Framer page (measured on `rare-works`,
// 25.10.2026).
//
// Framer writes the result of its CMS queries into the document as
//   <script type="framer/handover" id="__framer__handoverData">[…]</script>
// The runtime reads that element's text when it first needs a collection:
//
//   let e = document.getElementById(`__framer__handoverData`);
//   if (e) { Nv = sn(e.text) ?? mn(); … U_(() => { e?.remove() }) }
//
// Without the element it falls back to the network and calls `loadModel()` on
// a `.framercms` file. A payload does not deliver that file and the CSP
// (`connect-src 'self'`) forbids the foreign fetch, so the promise rejects with
// `TypeError: Failed to fetch`, React catches it, and Framer empties `#main`:
//
//   Made UI non-interactive due to an error.
//
// Measured: 4,4 s after load the page was white — `#main` had 1 child instead of
// 3, 2.600 of 3.135 nodes were gone. The SOURCE never fetches a `.framercms`
// (0 requests over 8 s plus scrolling): it carries the data in this script.
// With the script injected into the preview, the fatal error disappeared and
// the collection requests stayed at 0.

const PAGE_URL = "https://example.framer.website/";
const RUNTIME = "https://framerusercontent.com/sites/abc/_script0.AAA.mjs";

const HANDOVER_TEXT = `[{"0":1,"1":77},["Map",2,3],"{\\"from\\":\\"269821a7\\",\\"limit\\":3}"]`;

function page(body: string): string {
  return `<!doctype html><html><head>
<script type="module" data-framer-bundle src="${RUNTIME}"></script>
</head><body>${body}</body></html>`;
}

const MAIN = `<div id="main" data-framer-hydrate-v2='{"routeId":"abc"}'><div class="framer-1">Hallo</div></div>`;
const HANDOVER = `<script type="framer/handover" id="__framer__handoverData">${HANDOVER_TEXT}</script>`;

describe("the preloaded collection data", () => {
  it("reads the handover script out of the page", () => {
    const detection = detectFramerRuntime(page(`${MAIN}${HANDOVER}`), PAGE_URL);
    expect(detection).not.toBeNull();
    expect(detection?.handover).toBe(HANDOVER_TEXT);
  });

  it("reports null when the page carries no collections", () => {
    // Most pages have no CMS. An empty string would claim "there was data and
    // it was empty"; null says the page never had any.
    const detection = detectFramerRuntime(page(MAIN), PAGE_URL);
    expect(detection?.handover).toBeNull();
  });

  it("finds the script when its attributes stand in another order", () => {
    // Framer writes type first, id second — but the payload must not depend on
    // attribute order: a re-serialized page may write either.
    const reversed = `<script id="__framer__handoverData" type="framer/handover">${HANDOVER_TEXT}</script>`;
    const detection = detectFramerRuntime(page(`${MAIN}${reversed}`), PAGE_URL);
    expect(detection?.handover).toBe(HANDOVER_TEXT);
  });

  it("keeps the script OUT of the page container", () => {
    // The script belongs to the document, not to the tree the runtime hydrates.
    // Inside `#main` React would treat it as part of the page.
    const detection = detectFramerRuntime(page(`${MAIN}${HANDOVER}`), PAGE_URL);
    expect(detection?.mainHtml).not.toContain("framer/handover");
    expect(detection?.bodyTail).not.toContain("framer/handover");
  });

  it("ships the data in the payload and mounts it before the runtime", async () => {
    // The contract: `mount()` puts `#__framer__handoverData` into the document
    // BEFORE it imports the runtime — the runtime looks the element up when it
    // starts, and an element added afterwards is never seen.
    const detection = detectFramerRuntime(page(`${MAIN}${HANDOVER}`), PAGE_URL);
    expect(detection).not.toBeNull();
    if (detection === null) return;
    const files = new Map<string, string>([[RUNTIME, "globalThis.__runtimeStart = true;"]]);
    const payload = await buildRuntimePayload({ detection, files, loadFile: async () => null });
    expect(payload.bundle).toContain("__framer__handoverData");
    expect(payload.bundle).toContain("framer/handover");
    // Order matters: the handover block comes before the runtime starts.
    // esbuild turns the dynamic import into a lazy init (`Promise.resolve()
    // .then(() => (init(), module))`), so the start is marked by that call.
    const handoverAt = payload.bundle.indexOf("__framer__handoverData");
    const startAt = payload.bundle.indexOf("Promise.resolve().then");
    expect(handoverAt).toBeGreaterThan(-1);
    expect(startAt).toBeGreaterThan(handoverAt);
  });

  it("mounts the payload so the runtime finds the data", async () => {
    // A real run of the built module: a minimal document, then `mount()`.
    // The runtime module reads the element at import time, like Framer's does.
    const detection = detectFramerRuntime(page(`${MAIN}${HANDOVER}`), PAGE_URL);
    if (detection === null) throw new Error("detection fehlt");
    const files = new Map<string, string>([
      [
        RUNTIME,
        `globalThis.__seen = document.getElementById("__framer__handoverData")?.textContent ?? null;`,
      ],
    ]);
    const payload = await buildRuntimePayload({ detection, files, loadFile: async () => null });
    const dir = mkdtempSync(join(tmpdir(), "senify-handover-"));
    const file = join(dir, "payload.mjs");
    writeFileSync(file, payload.bundle, "utf8");

    const stage = { innerHTML: "", parentNode: null, querySelector: () => null, appendChild: () => undefined };
    const created: { tag: string; text: string; attributes: Map<string, string> }[] = [];
    const document = {
      baseURI: "https://release.test/",
      body: { appendChild: (node: { tag: string }) => { created.push(node as never); } },
      head: { appendChild: () => undefined },
      createElement: (tag: string) => {
        const node = { tag, text: "", attributes: new Map<string, string>(),
          setAttribute(name: string, value: string) { this.attributes.set(name, value); } };
        return node;
      },
      getElementById: (id: string) =>
        created.find((node) => node.attributes.get("id") === id) ?? null,
      querySelectorAll: () => [],
    };
    const scope = globalThis as unknown as {
      document: unknown;
      __seen?: string | null;
      URL: typeof URL;
    };
    const previous = { document: scope.document, URL: scope.URL };
    scope.document = document;
    try {
      const module = (await import(pathToFileURL(file).href)) as {
        mount: (stage: unknown) => Promise<unknown>;
      };
      await module.mount(stage);
    } finally {
      scope.document = previous.document;
      scope.URL = previous.URL;
    }
    // The runtime ran (its side effect), and it found the data.
    expect(scope.__seen).toBe(HANDOVER_TEXT);
    const handover = created.find((node) => node.attributes.get("id") === "__framer__handoverData");
    expect(handover?.attributes.get("type")).toBe("framer/handover");
  });
});
