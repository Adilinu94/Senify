import { describe, expect, it } from "vitest";
import { detectFramerRuntime } from "../src/runtime-payload.ts";

// The siblings of `#main` (measured on 7 of 7 blind-test pages, 23.10.2026).
//
// Framer puts two elements NEXT TO the page container:
//   <div id="svg-templates">              the SVG symbols every `use` points at
//   <div id="__framer-badge-container">   where the runtime mounts the badge
// A payload that carried only `#main` left both out. The runtime then calls
// `hydrateRoot(document.getElementById("__framer-badge-container"))` with null
// and throws on EVERY page:
//
//   Minified React error #405: hydrateRoot(...): Target container is not a DOM
//   element.
//
// Every icon stayed blank as well, because `<use href="#svg-…">` found no
// template. The source itself throws nothing — the missing element was ours.

const RUNTIME = "https://cdn.test/runtime/script_main.AAA.mjs";
const PAGE_URL = "https://example.test/";

function page(body: string): string {
  return `<!doctype html><html><head>
<script type="module" data-framer-bundle src="${RUNTIME}"></script>
</head><body>${body}</body></html>`;
}

const SVG_TEMPLATES = `<div id="svg-templates" style="position: absolute; overflow: hidden; width: 0; height: 0"><svg id="svg-1"><path d="M0 0h10v10H0z"/></svg></div>`;
const BADGE = `<div id="__framer-badge-container"></div>`;

describe("the siblings of #main", () => {
  it("reads the SVG templates and the badge container", () => {
    const html = page(`
      <div id="main" data-framer-hydrate-v2='{"routeId":"abc"}'>Seite</div>
      ${SVG_TEMPLATES}
      ${BADGE}
    `);
    const detection = detectFramerRuntime(html, PAGE_URL);
    expect(detection).not.toBeNull();
    expect(detection?.bodyTail).toContain('id="svg-templates"');
    expect(detection?.bodyTail).toContain("M0 0h10v10H0z");
    expect(detection?.bodyTail).toContain('id="__framer-badge-container"');
  });

  it("keeps them OUT of the page container", () => {
    // The runtime hydrates `#main`; a sibling inside it would become part of
    // the page tree and confuse the hydration.
    const html = page(`
      <div id="main" data-framer-hydrate-v2='{"routeId":"abc"}'>Seite</div>
      ${SVG_TEMPLATES}
      ${BADGE}
    `);
    const detection = detectFramerRuntime(html, PAGE_URL);
    expect(detection?.mainHtml).not.toContain("svg-templates");
    expect(detection?.mainHtml).not.toContain("__framer-badge-container");
    expect(detection?.mainHtml).toContain("Seite");
  });

  it("leaves the tail empty when the page has no siblings", () => {
    const html = page(`<div id="main" data-framer-hydrate-v2='{"routeId":"abc"}'>Nur die Seite</div>`);
    const detection = detectFramerRuntime(html, PAGE_URL);
    expect(detection?.bodyTail).toBe("");
  });

  it("reads a nested sibling to its own close tag", () => {
    // `svg-templates` holds dozens of `<svg>` elements; a regex that stops at
    // the first `</div>` would cut it after the first symbol. Three closing
    // tags: `svg-templates`, its `.inner`, and the badge container.
    const nested = `<div id="svg-templates"><div class="inner"><svg id="a"></svg><svg id="b"></svg></div></div>`;
    const html = page(`<div id="main" data-framer-hydrate-v2='{"routeId":"abc"}'>Seite</div>${nested}${BADGE}`);
    const detection = detectFramerRuntime(html, PAGE_URL);
    expect(detection?.bodyTail).toContain('id="a"');
    expect(detection?.bodyTail).toContain('id="b"');
    expect((detection?.bodyTail.match(/<\/div>/g) ?? []).length).toBe(3);
  });
});
