import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildPageRuntimePayload,
  buildRuntimePayload,
  collectRuntimeFiles,
  detectFramerRuntime,
  rewriteAddressesInData,
  rewriteCss,
  rewriteMarkup,
} from "../src/runtime-payload.ts";

// The Framer runtime as a payload (step 2 of `docs/fahrplan-framer-1zu1.md`).
//
// The measured ground truth: a Framer page replayed locally from its own
// HTML + CSS + runtime is pixel-identical to the original (notes: 0,03 % /
// 0,06 % / 0,15 %, same height). These tests hold the mechanism down: what
// the detection reads, what the bundle contains, and that the runtime starts
// only AFTER the markup stands — the runtime looks for `#main` and dies
// without it.

const PAGE_URL = "https://example.framer.website/";

const RUNTIME = "https://framerusercontent.com/sites/abc/_script0.AAA.mjs";
const CHUNK = "https://framerusercontent.com/sites/abc/chunk-BBB.mjs";
const PAGE_MODULE = "https://framerusercontent.com/sites/abc/page-CCC.mjs";

const PAGE_HTML = `<!doctype html>
<html lang="de"><head>
<title>Portfolio</title>
<style>.framer-1 { color: red; }</style>
<script type="module" data-framer-bundle src="${RUNTIME}"></script>
<link rel="modulepreload" href="${CHUNK}">
</head>
<body>
<div id="main" data-framer-hydrate-v2='{"routeId":"abc"}'><div class="framer-1">Hallo</div></div>
</body></html>`;

// The runtime as Framer writes it: a static import of the chunk, a dynamic
// import of the page module, and the top-level code that looks for `#main`.
const RUNTIME_SOURCE = `
import { helper } from "./chunk-BBB.mjs";
const page = () => import("./page-CCC.mjs");
globalThis.__framerRuntime = { helper, page, main: document.getElementById("main") };
`;
const CHUNK_SOURCE = `export const helper = "chunk";`;
const PAGE_MODULE_SOURCE = `export const page = "page";`;

const files = new Map<string, string>([
  [RUNTIME, RUNTIME_SOURCE],
  [CHUNK, CHUNK_SOURCE],
  [PAGE_MODULE, PAGE_MODULE_SOURCE],
]);

const loadFile = async (url: string): Promise<string | null> => files.get(url) ?? null;

describe("the runtime of a page", () => {
  it("finds the bundle, the root element and the CSS", () => {
    const detection = detectFramerRuntime(PAGE_HTML, PAGE_URL);
    expect(detection).not.toBeNull();
    expect(detection?.entry).toBe(RUNTIME);
    expect(detection?.mainId).toBe("main");
    // The root element WITH its state attribute: the runtime reads the route
    // from it and not from the path — the release page may live elsewhere.
    expect(detection?.mainHtml).toContain('data-framer-hydrate-v2');
    expect(detection?.mainHtml).toContain("Hallo");
    expect(detection?.css).toContain(".framer-1");
  });

  it("has no runtime when the page carries none", () => {
    expect(detectFramerRuntime("<html><body><p>Text</p></body></html>", PAGE_URL)).toBeNull();
  });

  it("has no runtime when the root element has no state", () => {
    // Without `data-framer-hydrate-v2` the runtime falls back to
    // `location.pathname` — the release path would then decide which page
    // runs. That is not a payload, it is a guess.
    const withoutState = PAGE_HTML.replace(/ data-framer-hydrate-v2='[^']*'/, "");
    expect(detectFramerRuntime(withoutState, PAGE_URL)).toBeNull();
  });

  it("collects the runtime files transitively (the page module is dynamic)", async () => {
    const collected = await collectRuntimeFiles(RUNTIME, loadFile);
    expect([...collected.keys()].sort()).toEqual([CHUNK, PAGE_MODULE, RUNTIME].sort());
  });
});

describe("the runtime payload", () => {
  it("bundles markup, CSS and runtime into one module", async () => {
    const detection = detectFramerRuntime(PAGE_HTML, PAGE_URL);
    const collected = await collectRuntimeFiles(RUNTIME, loadFile);
    const payload = await buildRuntimePayload({
      detection: detection as NonNullable<typeof detection>,
      files: collected,
      loadFile,
    });
    // The markup and the CSS travel inside the module.
    expect(payload.bundle).toContain("Hallo");
    expect(payload.bundle).toContain(".framer-1");
    // The mount contract of the island script (esbuild writes the export
    // list at the end of the module).
    expect(payload.bundle).toMatch(/export\s*\{[^}]*\bmount\b/);
    expect(payload.bytes).toBeGreaterThan(0);
    expect(payload.integrity).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses a payload over the budget of ADR-0010", async () => {
    const detection = detectFramerRuntime(PAGE_HTML, PAGE_URL);
    const collected = await collectRuntimeFiles(RUNTIME, loadFile);
    await expect(
      buildRuntimePayload({
        detection: detection as NonNullable<typeof detection>,
        files: collected,
        loadFile,
        maxBytes: 100,
      }),
    ).rejects.toThrow(/Budget/);
  });

  it("starts the runtime only after the markup stands", async () => {
    // The runtime's top-level code reads `document.getElementById("main")`.
    // If the bundle started it on import, the element would not be there yet
    // and the runtime would die — that is exactly what happened in the first
    // attempt.
    const detection = detectFramerRuntime(PAGE_HTML, PAGE_URL);
    const collected = await collectRuntimeFiles(RUNTIME, loadFile);
    const payload = await buildRuntimePayload({
      detection: detection as NonNullable<typeof detection>,
      files: collected,
      loadFile,
    });

    const appended: { textContent: string }[] = [];
    const previousDocument = (globalThis as { document?: unknown }).document;
    const stage = { innerHTML: "", querySelector: () => null };
    (globalThis as { document?: unknown }).document = {
      head: { appendChild: (node: { textContent: string }) => appended.push(node) },
      createElement: () => ({ setAttribute: () => undefined, textContent: "" }),
      querySelectorAll: () => [],
      // The runtime's top-level code asks for `#main`. The fake document only
      // knows it when the markup already stands — that is the order the
      // payload has to keep.
      getElementById: (id: string) =>
        stage.innerHTML.includes(`id="${id}"`) ? { id } : null,
    };
    try {
      const dir = mkdtempSync(join(tmpdir(), "senify-payload-"));
      const file = join(dir, "payload.mjs");
      writeFileSync(file, payload.bundle, "utf8");
      const module = (await import(pathToFileURL(file).toString())) as {
        mount: (stage: unknown, options?: unknown) => Promise<unknown>;
      };
      // The runtime has NOT run before the mount.
      expect((globalThis as { __framerRuntime?: unknown }).__framerRuntime).toBeUndefined();
      await module.mount(stage, { host: { setAttribute: () => undefined } });
      // Now it has — and it FOUND the markup (the fake document only knows
      // `#main` when the stage already carries it).
      const runtime = (globalThis as { __framerRuntime?: { main: unknown } }).__framerRuntime;
      expect(runtime).toBeDefined();
      expect(runtime?.main).not.toBeNull();
      expect(stage.innerHTML).toContain("Hallo");
      // The CSS went into the head of the document.
      expect(appended.some((node) => node.textContent.includes(".framer-1"))).toBe(true);
    } finally {
      (globalThis as { document?: unknown }).document = previousDocument;
    }
  });
});

describe("the CSS of the payload", () => {
  it("rewrites the addresses the import replaced", () => {
    const css = `.a { background: url("https://cdn.test/font.woff2"); } .b { background: url(/bild.png); }`;
    const rewritten = rewriteCss(css, (url) =>
      url === "https://cdn.test/font.woff2" ? "/assets/a1/font.woff2" : null,
    );
    expect(rewritten).toContain('url("/assets/a1/font.woff2")');
    // An address the import does not know stays as it is — silently dropping
    // it would change the picture.
    expect(rewritten).toContain("url(/bild.png)");
  });

  it("leaves data URLs alone", () => {
    const css = `.a { background: url(data:image/svg+xml;base64,AAA); }`;
    expect(rewriteCss(css, () => "/assets/x.svg")).toBe(css);
  });
});

describe("the page payload", () => {
  it("says honestly that a page has no runtime", async () => {
    const result = await buildPageRuntimePayload({
      html: "<html><body><p>Text</p></body></html>",
      pageUrl: PAGE_URL,
      loadFile,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected no runtime");
    expect(result.hasRuntime).toBe(false);
  });

  it("names the reason when the runtime cannot be read", async () => {
    const result = await buildPageRuntimePayload({
      html: PAGE_HTML,
      pageUrl: PAGE_URL,
      loadFile: async () => null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failure");
    expect(result.hasRuntime).toBe(true);
    expect(result.reason).toContain("nicht lesbar");
  });

  it("builds the payload of a page with a runtime", async () => {
    const result = await buildPageRuntimePayload({
      html: PAGE_HTML,
      pageUrl: PAGE_URL,
      loadFile,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.bytes).toBeGreaterThan(0);
    expect(result.detection.entry).toBe(RUNTIME);
  });

  it("reads the WHOLE #main element, not the fragment up to the first </div>", () => {
    // Measured before the fix: the payload carried 620 of 46.520 bytes on
    // notes (1,3 %), 1.647 of 204.742 on donutshop (0,8 %) and 2.085 of
    // 424.893 on unifiersofjapan (0,5 %). A regex `<div …>…</div>` stops at the
    // first child's close tag; the element's own depth has to be walked.
    const nested = `<html><head><script type="module" data-framer-bundle src="${RUNTIME}"></script></head><body>
    <div id="main" data-framer-hydrate-v2='{"routeId":"abc"}'>
      <div class="outer"><div class="inner">tief</div><p>Text</p></div>
      <div class="second">zwei</div>
    </div></body></html>`;
    const detection = detectFramerRuntime(nested, PAGE_URL);
    expect(detection).not.toBeNull();
    const body = detection?.mainHtml ?? "";
    expect(body).toContain("tief");
    expect(body).toContain("zwei");
    // The outer element's close tag is the LAST one: nothing follows it.
    expect(body.trimEnd().endsWith("</div>")).toBe(true);
    expect((body.match(/<\/div>/g) ?? []).length).toBe(4);
  });

  it("rewrites the addresses inside the runtime's data", () => {
    // The runtime builds its images from JSON (`image: new URL("https://…")`),
    // not from the markup's `<img src>`. Measured on donutshop: 87 of 88 image
    // addresses stayed at `framerusercontent.com` after the markup pass alone.
    const source = 'const a = { image: new URL("https://cdn.test/a.png").href }; const b = "https:\\/\\/cdn.test\\/a.png";';
    const out = rewriteAddressesInData(source, new Map([["https://cdn.test/a.png", "https://site.test/assets/1/a.png"]]));
    expect(out).toContain("https://site.test/assets/1/a.png");
    expect(out).not.toContain("cdn.test");
  });

  it("rewrites the poster and srcset of the markup, not only src", () => {
    const html = `<div id="main" data-framer-hydrate-v2><video poster="https://cdn.test/p.jpg" src="https://cdn.test/v.mp4"></video>
      <img src="https://cdn.test/a.png" srcset="https://cdn.test/a-1x.png 1x, https://cdn.test/a-2x.png 2x" style="background:url(https://cdn.test/bg.png)" /></div>`;
    const rewrites = new Map([
      ["https://cdn.test/p.jpg", "/assets/1/p.jpg"],
      ["https://cdn.test/v.mp4", "/assets/1/v.mp4"],
      ["https://cdn.test/a.png", "/assets/1/a.png"],
      ["https://cdn.test/a-1x.png", "/assets/1/a-1x.png"],
      ["https://cdn.test/a-2x.png", "/assets/1/a-2x.png"],
      ["https://cdn.test/bg.png", "/assets/1/bg.png"],
    ]);
    const out = rewriteMarkup(html, (url) => rewrites.get(url) ?? null);
    expect(out).not.toContain("cdn.test");
    expect(out).toContain("/assets/1/p.jpg");
    expect(out).toContain("/assets/1/a-2x.png 2x");
    expect(out).toContain("url(/assets/1/bg.png)");
  });
});
