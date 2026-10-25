import { describe, expect, it } from "vitest";
import {
  collectRuntimeFiles,
  currentPageModule,
  detectFramerRuntime,
  readFramerRoutes,
} from "../src/runtime-payload.ts";

// The runtime of ONE page (measured on `unifiersofjapan`, 23.10.2026).
//
// The page showed 15,0 / 22,8 / 21,2 % pixel difference. The cause was not the
// layout: the runtime died on start. Framer writes its route map with BACKTICK
// imports, the collector knew only `"` and `'`, so the page module was never in
// the payload. The release asked for it, got a 404, React threw #405 and the
// runtime made the page non-interactive — the hero stayed at its
// `translateY(320px)` start state. With the page module delivered: 1,99 / 3,12 %.

const ENTRY = "https://cdn.test/runtime/script_main.AAA.mjs";
const HOME = "https://cdn.test/runtime/home.BBB.mjs";
const ABOUT = "https://cdn.test/runtime/about.CCC.mjs";
const SHARED = "https://cdn.test/runtime/shared.DDD.mjs";
const CHUNK = "https://cdn.test/runtime/chunk-EEE.mjs";

// The entry as Framer writes it: a static import, a route map with template
// strings, and a small dynamic module that is not a route (the badge).
const ENTRY_SOURCE = `
import { shared } from "./shared.DDD.mjs";
const ROUTES = {
  VY7qktIfI: { elements: { a: "1", b: { c: "2" } }, page: E(() => import(\`./home.BBB.mjs\`)), path: \`/\` },
  x86j2mRbR: { elements: { d: "3" }, page: E(() => import(\`./about.CCC.mjs\`)), path: \`/about\` },
};
const badge = () => import("./chunk-EEE.mjs");
export { ROUTES, badge, shared };
`;
const HOME_SOURCE = `import { shared } from "./shared.DDD.mjs";\nexport default function Home(){ return shared; }`;
const ABOUT_SOURCE = `export default function About(){ return "about"; }`;
const SHARED_SOURCE = `export const shared = "shared";`;
const CHUNK_SOURCE = `export const badge = "badge";`;

const PAGE_HTML = `<!doctype html><html><head>
<script type="module" data-framer-bundle src="${ENTRY}"></script>
</head><body>
<div id="main" data-framer-hydrate-v2='{"routeId":"VY7qktIfI","localeId":"default"}'>Inhalt</div>
</body></html>`;

const files = new Map<string, string>([
  [ENTRY, ENTRY_SOURCE],
  [HOME, HOME_SOURCE],
  [ABOUT, ABOUT_SOURCE],
  [SHARED, SHARED_SOURCE],
  [CHUNK, CHUNK_SOURCE],
]);
const loadFile = async (url: string): Promise<string | null> => files.get(url) ?? null;

describe("the route of a page", () => {
  it("reads the route id from the state, not from the path", () => {
    // The release page may live at another path; only the state knows which
    // page of the site it is.
    const detection = detectFramerRuntime(PAGE_HTML, "https://example.test/");
    expect(detection?.routeId).toBe("VY7qktIfI");
  });

  it("reads the state even when its quotes are entities", () => {
    // What a live Framer page actually serves: `&quot;` instead of `"`.
    const html = PAGE_HTML.replace(
      `'{"routeId":"VY7qktIfI","localeId":"default"}'`,
      `"{&quot;routeId&quot;:&quot;VY7qktIfI&quot;,&quot;localeId&quot;:&quot;default&quot;}"`,
    );
    expect(detectFramerRuntime(html, "https://example.test/")?.routeId).toBe("VY7qktIfI");
  });

  it("finds the page module of the current route, not a neighbour's", () => {
    // `elements:{…}` is nested inside the route object, so the module cannot be
    // found with a brace-free pattern; the id's own position decides.
    expect(currentPageModule(ENTRY_SOURCE, ENTRY, "VY7qktIfI")).toBe(HOME);
    expect(currentPageModule(ENTRY_SOURCE, ENTRY, "x86j2mRbR")).toBe(ABOUT);
    expect(currentPageModule(ENTRY_SOURCE, ENTRY, "unbekannt")).toBeNull();
  });

  it("reads every route with its path", () => {
    expect(readFramerRoutes(ENTRY_SOURCE, ENTRY)).toEqual([
      { path: "/", module: HOME },
      { path: "/about", module: ABOUT },
    ]);
  });
});

describe("the runtime of one page, not of the site", () => {
  it("follows a backtick import (the route map) — the case that killed the runtime", async () => {
    const collected = await collectRuntimeFiles(ENTRY, loadFile, { routeId: "VY7qktIfI" });
    // The page module of the route is IN the payload. Without it the release
    // asked for a file that was never delivered, React threw #405 and the page
    // stopped at its start state (15 % of the pixels differed).
    expect(collected.has(HOME)).toBe(true);
    expect(collected.get(HOME)).toBe(HOME_SOURCE);
  });

  it("stubs the page modules of the OTHER routes instead of shipping them", async () => {
    const collected = await collectRuntimeFiles(ENTRY, loadFile, { routeId: "VY7qktIfI" });
    // A resolvable import: the router must not hit a 404 for a page it will
    // never show.
    expect(collected.has(ABOUT)).toBe(true);
    expect(collected.get(ABOUT)).not.toContain("about");
    expect(collected.get(ABOUT)).toContain("export default");
    // The stub is tiny — that is the point.
    expect(Buffer.byteLength(collected.get(ABOUT) ?? "")).toBeLessThan(200);
  });

  it("keeps the static closure and the small dynamic modules", async () => {
    const collected = await collectRuntimeFiles(ENTRY, loadFile, { routeId: "VY7qktIfI" });
    expect(collected.has(SHARED)).toBe(true);
    // The badge is not a route: the page fetches it while it loads.
    expect(collected.has(CHUNK)).toBe(true);
  });

  it("leaves a big registry out — the source does not fetch it either", async () => {
    // Measured: the 2.5 MB font registry `google-H6SFY4F5` was never requested
    // by the source, but the old collector read every dynamic import.
    const big = `${ENTRY.replace("script_main.AAA.mjs", "google-H6SFY4F5.mjs")}`;
    const withRegistry = new Map(files);
    withRegistry.set(ENTRY, `${ENTRY_SOURCE}\nconst fonts = () => import("./google-H6SFY4F5.mjs");`);
    withRegistry.set(big, `export const registry = "${"x".repeat(600 * 1024)}";`);
    const collected = await collectRuntimeFiles(ENTRY, async (url) => withRegistry.get(url) ?? null, {
      routeId: "VY7qktIfI",
    });
    expect(collected.has(big)).toBe(false);
  });

  it("without a route id it collects every route (the old behaviour)", async () => {
    const collected = await collectRuntimeFiles(ENTRY, loadFile);
    expect(collected.get(ABOUT)).toBe(ABOUT_SOURCE);
  });
});
