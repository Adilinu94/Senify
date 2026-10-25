import { describe, expect, it } from "vitest";
import { collectRuntimeFiles } from "../src/runtime-payload.ts";

// Unreachable runtime files (measured on `rare-works-510047.framer.app`,
// 25.10.2026).
//
// A Framer site's entry module carries a SECOND kind of dynamic import besides
// the route table: the CMS collection loaders and the badge. They are written as
// `{[collectionId]:async()=>(await import(`./<hash>.mjs`))?.utils,...}` and the
// runtime calls them only when a page of that collection is asked for. On the
// home page nobody asks: measured in Chromium, the page requested the badge
// module once and the collection behind `/solutions/:slug` never.
//
// The collector took both, because an unclaimed dynamic import was kept "when it
// is small" (DYNAMIC_MODULE_MAX_BYTES = 512 KB). On this site that was 54 KB of a
// 3092 KB payload - over ADR-0010's 3072 KB budget by 20 KB, so the WHOLE payload
// failed and the page fell back to the structure tree. Without them: 3057 KB.
//
// The rule is reachability, not size: a file that no reachable file imports
// (statically or dynamically) is not part of this page. The route table's own
// modules stay as stubs, so the router's `import()` resolves instead of 404ing.

const ENTRY = "https://cdn.test/script_main.mjs";
const PAGE = "https://cdn.test/page-own.mjs";
const LIB = "https://cdn.test/react.mjs";
const OTHER_ROUTE = "https://cdn.test/route-other.mjs";
const COLLECTION = "https://cdn.test/collection-solutions.mjs";
const COLLECTION_LOADER = "https://cdn.test/dOJh-collection-loader.mjs";

// The entry in Framer's own shapes:
//   * the route table: `page:E(()=>import(`./x.mjs`)),path:`/` `
//   * the collection loaders: `{id:async()=>(await import(`./y.mjs`))?.utils}`
const entrySource = [
  'import{r as t}from"./react.mjs";',
  "const routes={",
  "augiA20Il:{elements:{},page:E(()=>import(`./page-own.mjs`)),path:`/`},",
  "ghhjfXFIZ:{elements:{},page:E(()=>import(`./route-other.mjs`)),path:`/about`},",
  "};",
  "const sa={c1gl7lJ_F:async()=>(await import(`./dOJh-collection-loader.mjs`))?.utils};",
].join("");

const files: Record<string, string> = {
  [ENTRY]: entrySource,
  [PAGE]: 'import{r as t}from"./react.mjs";export const Page=t;',
  [LIB]: "export const r=1;",
  [OTHER_ROUTE]: "export const Page=2;",
  [COLLECTION_LOADER]: 'import{x as e}from"./collection-solutions.mjs";export default e;',
  [COLLECTION]: `export const x=3;`.repeat(400),
};

const load = async (url: string): Promise<string | null> => files[url] ?? null;

describe("unreachable runtime files", () => {
  it("leaves out a collection module that no reachable file imports", async () => {
    const collected = await collectRuntimeFiles(ENTRY, load, { routeId: "augiA20Il" });
    expect(collected.has(ENTRY)).toBe(true);
    expect(collected.has(LIB)).toBe(true);
    expect(collected.has(PAGE)).toBe(true);
    expect(collected.has(OTHER_ROUTE)).toBe(true);
    // Asked for only by `/solutions/:slug` - not this page.
    expect(collected.has(COLLECTION)).toBe(false);
    expect(collected.has(COLLECTION_LOADER)).toBe(false);
  });

  it("keeps the route stub so the router's import resolves", async () => {
    const collected = await collectRuntimeFiles(ENTRY, load, { routeId: "augiA20Il" });
    expect(collected.get(OTHER_ROUTE)).toBe("export default function Page(){ return null; }");
  });

  it("keeps a dynamic import that the reachable page itself makes", async () => {
    const pageWithLazy = 'import{r as t}from"./react.mjs";export const load=()=>import("./lazy-widget.mjs");';
    const withWidget: Record<string, string> = {
      ...files,
      [PAGE]: pageWithLazy,
      "https://cdn.test/lazy-widget.mjs": "export const w=4;",
    };
    const collected = await collectRuntimeFiles(ENTRY, async (url) => withWidget[url] ?? null, {
      routeId: "augiA20Il",
    });
    expect(collected.has("https://cdn.test/lazy-widget.mjs")).toBe(true);
  });
});
