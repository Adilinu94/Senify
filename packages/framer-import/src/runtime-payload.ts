// Die Framer-Runtime als Payload (Schritt 2 von `docs/fahrplan-framer-1zu1.md`).
//
// **Was gemessen ist.** Eine Framer-Seite besteht aus drei Teilen: dem
// SSR-Markup (inklusive des Zustands `data-framer-hydrate-v2` an `#main`),
// dem CSS und der Runtime — einem ES-Modul, das `#main` hydriert und die
// Seitendaten aus dem Zustand liest. Die Runtime ist der Teil, den der
// Struktur-Baum nicht abbilden kann: Lenis, three.js, Ticker, Hover-Bewegung.
//
// **Der Beleg, dass das trägt.** `notes.framer.website` lokal nachgespielt
// (Original-HTML + Original-CSS + Original-Runtime, alles lokal): **0,03 %
// / 0,06 % / 0,15 %** Pixel-Differenz zu Original (Desktop/Tablet/Mobil),
// Seitenhöhe **exakt gleich** (1743 / 1677 / 1906 px). Die Runtime hydriert
// also auch in fremder Umgebung.
//
// **Warum die Runtime den Weg über ein Payload nimmt (ADR-0010).** Sie ist
// ausführbarer Fremdcode: Sie läuft nur in Preview und Release, nie im
// Editor-Canvas, und sie wird ausschließlich aus dem eigenen Bake-Ausgang
// geladen — keine Fremd-URL zur Laufzeit.
//
// **Zwei Entscheidungen, die die Messung erzwungen hat:**
//
// 1. **Die Runtime ist seiten-, nicht abschnittsweise.** Sie liest
//    `document.getElementById("main")` und hydriert *diesen* Baum. Ein
//    Abschnitts-Payload wäre mit derselben Runtime nicht möglich; die
//    Route kommt aus dem Zustand (`data-framer-hydrate-v2` → `routeId`),
//    nicht aus `location.pathname` — die Release-Seite darf also einen
//    anderen Pfad haben.
// 2. **Die Runtime darf erst laufen, wenn `#main` steht.** Sie sucht das
//    Element beim Start. Deshalb startet das gebündelte Modul sie *nicht*
//    beim Import, sondern in `mount()` — esbuild hält einen dynamischen
//    Import lazy (`init_x()`), der erst beim Aufruf läuft.

import { createHash } from "node:crypto";
import { build } from "esbuild";

/* -------------------------------------------------------------- detection */

export type FramerRuntimeDetection = {
  // Das Runtime-Modul der Seite (das `data-framer-bundle`-Skript).
  entry: string;
  // Die id des Wurzelelements, das die Runtime hydriert (`main`).
  mainId: string;
  // Das **äußere** Markup dieses Elements, inklusive des Zustandsattributs.
  mainHtml: string;
  // Die Geschwister, die zum Seitenrumpf gehören, aber NICHT in `#main` liegen.
  // Framer legt zwei davon an, und die Laufzeit sucht sie per id:
  //   `<div id="svg-templates">`  — die SVG-Vorlagen, die `use`-Elemente
  //                                 referenzieren; ohne sie bleibt jedes Icon leer
  //   `<div id="__framer-badge-container">` — die Montagestelle des Badges; die
  //                                 Laufzeit ruft dort `hydrateRoot` und wirft
  //                                 sonst React #405 (`Target container is not a
  //                                 DOM element`), gemessen auf jeder Seite.
  bodyTail: string;
  // Das Original-CSS der Seite (inline + verlinkte Blätter).
  css: string;
  // Die verlinkten Stylesheets der Seite (inline ist oben schon drin).
  sheets: string[];
  // Die Route aus `data-framer-hydrate-v2`. Sie entscheidet, welches
  // Seitenmodul die Seite braucht — die anderen Routen der Site gehen den
  // Release nichts an (gemessen an `unifiersofjapan`: 4 Seitenmodule, das
  // Startseiten-Modul allein wiegt 147 KB; alle vier zusammen sprengen mit den
  // Schrift-Metadaten das Budget von ADR-0010).
  routeId: string | null;
};

// Das Bundle-Skript: Framer markiert es mit `data-framer-bundle`. Der
// Attributwert ist die Wahrheit — der Dateiname (`_script0.<hash>.mjs`)
// wechselt, das Attribut nicht.
const BUNDLE_SCRIPT = /<script\b([^>]*\bdata-framer-bundle\b[^>]*)>/i;
const STYLESHEET = /<link\b[^>]*\brel\s*=\s*["']?stylesheet["']?[^>]*>/gi;
const LINK_HREF = /\bhref\s*=\s*["']([^"']+)["']/i;
const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const MAIN_ELEMENT = /<(\w+)\b([^>]*\bid\s*=\s*["']main["'][^>]*)>/i;

// Die Route steht im Zustand, nicht im Pfad: `data-framer-hydrate-v2` trägt
// `routeId` und `pathVariables`. Ohne dieses Attribut fällt die Runtime auf
// `location.pathname` zurück — und die Release-Seite liegt woanders.
// The attribute may be quoted with either character, and its JSON uses the other
// one inside (`data-framer-hydrate-v2='{"routeId":"abc"}'` is what Framer writes).
// A capture class that excludes both quotes stops at the first inner quote.
const HYDRATE_STATE = /data-framer-hydrate-v2\s*=\s*(["'])([\s\S]*?)\1/i;

// The state attribute is JSON with HTML entities (`&quot;`), because it sits in
// an attribute of a server-rendered page.
function hydrateState(attrs: string): { routeId?: string } | null {
  const raw = HYDRATE_STATE.exec(attrs)?.[2];
  if (raw === undefined) return null;
  const decoded = raw
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  try {
    return JSON.parse(decoded) as { routeId?: string };
  } catch {
    return null;
  }
}

function absolute(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

// The body of the element with `id="main"`: from the end of its open tag to the
// close tag that matches it. A regex for `<div …>…</div>` cannot do this — the
// first `</div>` belongs to a child. Measured: the old expression read 620 of
// 46.520 bytes on `notes` (1,3 %), 1.647 of 204.742 on `donutshop` (0,8 %) and
// 2.085 of 424.893 on `unifiersofjapan` (0,5 %) — the payload carried a fragment
// and not the page.
const BLOCK_TAG = /<(\/?)(div|section|header|footer|nav|article|aside|main|form)\b[^>]*?(\/?)>/gi;

function elementBody(html: string, openTagEnd: number): string {
  // Depth 1 is the element itself: it was already opened before the scan.
  let depth = 1;
  BLOCK_TAG.lastIndex = openTagEnd;
  let match: RegExpExecArray | null;
  while ((match = BLOCK_TAG.exec(html)) !== null) {
    if (match[3] === "/") continue;
    if (match[1] === "/") {
      depth -= 1;
      if (depth === 0) return html.slice(openTagEnd, match.index);
    } else {
      depth += 1;
    }
  }
  // No matching close tag: the rest of the document is the best answer there is
  // (a truncated source is reported by the caller as a failed runtime).
  return html.slice(openTagEnd);
}

function attr(attrs: string, name: string): string | null {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i");
  const found = pattern.exec(attrs);
  return found?.[1] ?? null;
}

// The elements Framer puts NEXT TO `#main`. The runtime finds them by id and
// `hydrateRoot` throws React #405 when one is missing — measured: every release
// page reported it, the source reported none.
const BODY_SIBLINGS = ["svg-templates", "__framer-badge-container"] as const;

// The markup of one element by id, `<div …>…</div>` with its own depth walked.
function elementById(html: string, id: string): string {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const open = new RegExp(`<([a-z][\\w-]*)\\b[^>]*\\bid\\s*=\\s*["']${escaped}["'][^>]*>`, "i").exec(html);
  if (open === null) return "";
  const body = elementBody(html, (open.index ?? 0) + open[0].length);
  return `${open[0]}${body}</${open[1] ?? "div"}>`;
}

/**
 * The two siblings of `#main` the runtime expects, as one markup string.
 *
 * Measured on 7 of 7 blind-test pages: every one carries
 * `<div id="__framer-badge-container">` and most carry `<div id="svg-templates">`
 * outside `#main`. A payload that carries only `#main` leaves both missing; the
 * runtime then calls `hydrateRoot(null)` and throws
 * `Minified React error #405: Target container is not a DOM element` on every
 * page — and every `<use href="#svg-…">` resolves to nothing, so the icons of
 * the page stay blank.
 */
function bodySiblings(html: string): string {
  const parts: string[] = [];
  for (const id of BODY_SIBLINGS) {
    const element = elementById(html, id);
    if (element !== "") parts.push(element);
  }
  return parts.join("");
}

/**
 * The Framer runtime of a page — or null when the page carries none.
 *
 * The CSS is read from the inline `<style>` blocks; the linked sheets are
 * named, not fetched (the caller fetches them — the import already reads the
 * sheets of a page for its style rules).
 */
export function detectFramerRuntime(html: string, pageUrl: string): FramerRuntimeDetection | null {
  const bundle = BUNDLE_SCRIPT.exec(html);
  if (bundle === null) return null;
  const entry = attr(bundle[1] ?? "", "src");
  if (entry === null || entry === "") return null;

  const main = MAIN_ELEMENT.exec(html);
  if (main === null) return null;
  const mainTag = main[1];
  const mainAttrs = main[2] ?? "";
  const mainBody = elementBody(html, main.index + main[0].length);
  const state = hydrateState(mainAttrs);
  if (state === null) return null;

  const css: string[] = [];
  for (const block of html.matchAll(STYLE_BLOCK)) css.push(block[1] ?? "");
  const sheets: string[] = [];
  for (const tag of html.matchAll(STYLESHEET)) {
    const href = LINK_HREF.exec(tag[0])?.[1];
    if (href !== undefined && href !== "") sheets.push(absolute(pageUrl, href));
  }

  return {
    entry: absolute(pageUrl, entry),
    mainId: attr(mainAttrs, "id") ?? "main",
    mainHtml: `<${mainTag}${mainAttrs}>${mainBody}</${mainTag}>`,
    bodyTail: bodySiblings(html),
    css: css.join("\n"),
    sheets,
    routeId: typeof state.routeId === "string" ? state.routeId : null,
  };
}

/* ---------------------------------------------------------------- bundling */

export type RuntimeFileLoader = (url: string) => Promise<string | null>;

export type RuntimePayloadInput = {
  detection: FramerRuntimeDetection;
  // Reads one runtime file. The caller decides where the bytes come from
  // (network for a live page, the mirror's disk for an offline import).
  loadFile: RuntimeFileLoader;
  // Rewrites an address inside the CSS (fonts, images) to the site's own
  // asset path. A URL the callback does not know stays as it is.
  rewriteUrl?: (url: string) => string | null;
  // The same rewrite as a table, for the runtime's data (JSON strings with
  // escaped slashes). A callback cannot be enumerated, so the caller passes
  // its map for the pass over the finished bundle.
  addressRewrites?: Readonly<Record<string, string>>;
  // The origin the rewritten addresses are made absolute against. The source's
  // addresses were absolute CDN URLs, and the runtime calls `new URL(…)` on
  // them — a root-relative path throws there (`TypeError: Failed to construct
  // 'URL': Invalid URL`, measured on notes). Absent: the addresses stay as the
  // map wrote them (a caller that knows they are only used as `src`).
  assetOrigin?: string;
  // The linked stylesheets of the page, read with the same loader.
  sheetsText?: string;
  // Ceiling for the whole bundle (ADR-0010: 3 MB per payload).
  maxBytes?: number;
};

export type RuntimePayload = {
  // The ESM module the bake writes: `export function mount(stage, options)`.
  bundle: string;
  bytes: number;
  // SHA-256 over the bundle — the manifest's integrity proof (ADR-0010 §8).
  integrity: string;
  // The runtime files that went into the bundle.
  files: string[];
  // The size of the runtime before bundling.
  rawBytes: number;
};

export const RUNTIME_PAYLOAD_MAX_BYTES = 3 * 1024 * 1024;

// A relative STATIC import: `from "./x.mjs"`, `import "./x.mjs"`. These are
// always part of the closure — the module is evaluated with its importer.
const STATIC_IMPORT = /(?:from|import)\s*["'](\.[^"']+)["']/g;

// A relative DYNAMIC import: `import("./x.mjs")`, and Framer writes the route
// map as `` page:E(()=>import(`./44cP2oi….mjs`)),path:`/` `` — a template string
// without substitution. A collector that only knew `"` and `'` missed every page
// module (measured on `unifiersofjapan`: 5 files instead of 28). The release then
// asked for a chunk that was never delivered, React threw #405, and the runtime
// switched the page to non-interactive — the hero stayed at its `translateY(320px)`
// start state and 15 % of the pixels differed.
const DYNAMIC_IMPORT = /import\s*\(\s*["'`](\.[^"'`]+)["'`]/g;

// The route map of a Framer site's runtime:
//   W={VY7qktIfI:{elements:{…},page:E(()=>import(`./44cP….mjs`)),path:`/`},…}
// Only the route named by `routeId` belongs to this page. Every other entry is a
// page of the same site, and shipping them all is not "the runtime of this page"
// — it is the whole site, and it does not fit ADR-0010's budget.
const ROUTE_ENTRY =
  /page:\s*[A-Za-z_$][\w$]*\(\s*\(\s*\)\s*=>\s*import\(\s*[`"']([^`"']+)[`"']\s*\)\s*\)\s*,\s*path:\s*[`"']([^`"']*)[`"']/g;

function baseNameOf(url: string): string {
  const path = new URL(url).pathname;
  const name = path.split("/").pop() ?? "module.mjs";
  return name === "" ? "module.mjs" : name;
}

/**
 * The route map of a Framer site, read from its runtime entry:
 * `{path, module}` per route.
 *
 * The map is what tells "this page" apart from "the other pages of the same
 * site". A site's runtime carries all of them; a release needs one.
 */
export type FramerRoute = { path: string; module: string };

export function readFramerRoutes(entrySource: string, entry: string): FramerRoute[] {
  const routes: FramerRoute[] = [];
  for (const match of entrySource.matchAll(ROUTE_ENTRY)) {
    routes.push({ path: match[2] ?? "", module: absolute(entry, match[1] ?? "") });
  }
  return routes;
}

/**
 * The page module of ONE route, found by the `routeId` the document's state
 * carries: `…{VY7qktIfI:{elements:{…},page:E(()=>import(`./44cP….mjs`)),path:`/`}…`
 *
 * The id is the key of the route object, and that object cannot be found with a
 * brace-free pattern — `elements:{…}` is nested inside it. Searching forward
 * from the id's own position is exact and needs no parser: the next
 * `page:E(()=>import(…))` after the id is that route's module.
 */
export function currentPageModule(entrySource: string, entry: string, routeId: string): string | null {
  if (routeId === "") return null;
  const escaped = routeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = new RegExp(`(?:^|[{,\\s])${escaped}\\s*:\\s*\\{`).exec(entrySource);
  if (start === null) return null;
  const after = entrySource.slice(start.index, start.index + 4000);
  const module = /\bpage:\s*[A-Za-z_$][\w$]*\(\s*\(\s*\)\s*=>\s*import\(\s*[`"']([^`"']+)[`"']/.exec(after);
  return module === null ? null : absolute(entry, module[1] ?? "");
}

/**
 * The runtime files of a page: the entry and everything it imports STATICALLY,
 * plus the page module of `options.routeId`.
 *
 * **Why not follow every dynamic import.** A Framer site's runtime carries the
 * page modules of ALL its routes and the font metadata of every family it might
 * ever use. Measured on `unifiersofjapan`: 28 files, 4.9 MB raw — the 2.5 MB
 * `google-H6SFY4F5` registry alone, which the SOURCE never fetches (it loads
 * 2.0 MB in total). Shipping that is not "the runtime of this page", and it
 * breaks ADR-0010's budget three times over.
 *
 * **What the page needs.** The static closure (react, framer, motion, the shared
 * lib) plus ONE page module (147 KB of the bundle). A page module of another
 * route is replaced with a stub, so the router's `import()` resolves instead of
 * asking for a file that was never delivered — that 404 was what killed the
 * runtime with React #405 and left the hero at its start state (15 % of pixels
 * different; with the fix 1,72 %).
 *
 * A dynamic import that is NOT a route (badge, snippet loader, editor bar) is
 * kept when it is small: the page fetches those while it loads, and a missing
 * one is an error at runtime. A big registry is left out — the source does not
 * fetch it either.
 */
export const DYNAMIC_MODULE_MAX_BYTES = 512 * 1024;

// Framer's font-metadata registries: `google-<hash>.mjs`, `fontshare-<hash>.mjs`,
// `framer-font-<hash>.mjs`. They describe which families exist, not which the
// page uses — the page's CSS names its `@font-face` files directly. Measured on
// three sites: the runtime requests NONE of them while the page loads or while
// it is scrolled through. They are dead weight in a payload (2.7 MB together on
// `unifiersofjapan`), so they stay out.
const FONT_REGISTRY = /\/(?:google|fontshare|framer-font)-[^/]+\.mjs$/i;

function isFontRegistry(url: string): boolean {
  return FONT_REGISTRY.test(new URL(url).pathname);
}

export async function collectRuntimeFiles(
  entry: string,
  loadFile: RuntimeFileLoader,
  options: { routeId?: string | null; dynamicMaxBytes?: number } = {},
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const seen = new Set<string>();
  const queue: string[] = [entry];
  const dynamic = new Set<string>();
  const collect = async (url: string): Promise<string | null> => {
    if (seen.has(url)) return files.get(url) ?? null;
    seen.add(url);
    const source = await loadFile(url);
    if (source === null) return null;
    files.set(url, source);
    for (const match of source.matchAll(STATIC_IMPORT)) {
      const specifier = match[1];
      if (specifier !== undefined) queue.push(absolute(url, specifier));
    }
    for (const match of source.matchAll(DYNAMIC_IMPORT)) {
      const specifier = match[1];
      if (specifier !== undefined) dynamic.add(absolute(url, specifier));
    }
    return source;
  };
  while (queue.length > 0) await collect(queue.shift() as string);

  // The route map lives in the entry; only this page's own module belongs here.
  const entrySource = files.get(entry);
  const own = entrySource !== undefined && options.routeId != null
    ? currentPageModule(entrySource, entry, options.routeId)
    : null;
  const routes = entrySource === undefined ? [] : readFramerRoutes(entrySource, entry);
  if (own !== null) {
    await collect(own);
    while (queue.length > 0) await collect(queue.shift() as string);
  }

  const max = options.dynamicMaxBytes ?? DYNAMIC_MODULE_MAX_BYTES;
  for (const url of dynamic) {
    if (own !== null && url === own) continue;
    if (files.has(url)) continue;
    // Only a KNOWN current route justifies a stub: without it, "other route"
    // cannot be told apart from "this page", and stubbing would throw away a
    // page module the caller expects.
    const isOtherRoute = own !== null && routes.some((route) => route.module === url && route.module !== own);
    if (isOtherRoute) {
      // Resolvable, but not this page: the router never shows another route.
      files.set(url, "export default function Page(){ return null; }");
      continue;
    }
    const source = await loadFile(url);
    if (source === null) continue;
    if (isFontRegistry(url)) continue;
    if (Buffer.byteLength(source, "utf8") > max) continue;
    files.set(url, source);
    for (const match of source.matchAll(STATIC_IMPORT)) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      queue.push(absolute(url, specifier));
    }
  }
  while (queue.length > 0) await collect(queue.shift() as string);
  return files;
}

function escapeForJs(value: string): string {
  return JSON.stringify(value);
}

/**
 * The payload: the original page (markup + CSS) plus the original runtime,
 * bundled into one ESM module the bake writes to `assets/payloads/`.
 *
 * The module exports `mount(stage, options)` — the contract of the island
 * script (`packages/renderer/src/motion.ts`): the stage receives the page,
 * the runtime starts afterwards.
 */
export async function buildRuntimePayload(input: RuntimePayloadInput & { files: Map<string, string> }): Promise<RuntimePayload> {
  const files = input.files;
  const entryName = baseNameOf(input.detection.entry);
  const byName = new Map<string, string>();
  for (const [url, source] of files) byName.set(baseNameOf(url), source);

  const css = rewriteCss(input.detection.css, input.rewriteUrl);
  const sheets = input.sheetsText ?? "";
  // The markup names its media by CDN address; the runtime carries the page as
  // JSON and builds the images from THAT (`donutshop`: 87 of 88 addresses).
  // Both have to be rewritten, or the release loads the source's CDN and no
  // useful security policy can be written.
  const page = rewriteMarkup(
    input.detection.mainHtml,
    input.rewriteUrl,
    new Map(Object.entries(input.addressRewrites ?? {})),
  );

  // The wrapper: the runtime starts in `mount()`, after the markup stands.
  // The runtime module is imported ONLY dynamically — a static import would
  // make esbuild initialize it when the payload file loads, and the runtime
  // looks for `#main` at that moment (it would find nothing and die).
  const wrapper = [
    `const PAGE = ${escapeForJs(page)};`,
    `const TAIL = ${escapeForJs(input.detection.bodyTail)};`,
    `const CSS = ${escapeForJs(css)};`,
    `const SHEETS = ${escapeForJs(sheets)};`,
    "export function mount(stage, options) {",
    "  if (!stage) throw new Error('Der Payload braucht eine Bühne.');",
    // The runtime builds its images from its own data with `new URL(address)` —
    // one argument, no base. The source's addresses were absolute CDN URLs, so
    // that worked. Ours are the site's own paths (`/assets/…`), and
    // `new URL('/assets/x.png')` throws `TypeError: Failed to construct 'URL':
    // Invalid URL` — measured on notes: the page stayed empty (900 px instead of
    // 1743 px). The shim gives the constructor the document as its base, which
    // is exactly what a relative address means. Everything else stays native.
    "  var scope = typeof window === 'object' && window !== null ? window : globalThis;",
    "  var NativeURL = scope.URL;",
    "  if (typeof NativeURL === 'function' && NativeURL.__senifyBaseShim !== true) {",
    "    var PatchedURL = function (value, base) {",
    "      var fallback = typeof document === 'object' && document !== null && typeof document.baseURI === 'string' ? document.baseURI : undefined;",
    "      return base === undefined ? new NativeURL(value, fallback) : new NativeURL(value, base);",
    "    };",
    "    PatchedURL.prototype = NativeURL.prototype;",
    "    PatchedURL.createObjectURL = NativeURL.createObjectURL;",
    "    PatchedURL.revokeObjectURL = NativeURL.revokeObjectURL;",
    "    PatchedURL.canParse = NativeURL.canParse;",
    "    PatchedURL.parse = NativeURL.parse;",
    "    PatchedURL.__senifyBaseShim = true;",
    "    scope.URL = PatchedURL;",
    "  }",
    "  stage.innerHTML = PAGE;",
    "  // The two siblings of `#main` the runtime finds by id: the SVG templates",
    "  // (the `use` elements of the page point at them) and the badge container",
    "  // (`hydrateRoot` on it — without it React #405, measured on every page).",
    "  // They belong NEXT TO #main, never inside it: the runtime hydrates #main",
    "  // and would treat them as part of the page tree.",
    "  if (TAIL !== '') {",
    "    var tail = document.createElement('div');",
    "    tail.setAttribute('data-framer-siblings', '1');",
    "    tail.style.display = 'contents';",
    "    tail.innerHTML = TAIL;",
    "    if (stage.parentNode) stage.parentNode.insertBefore(tail, stage.nextSibling);",
    "    else stage.appendChild(tail);",
    "  }",
    "  // The runtime looks for `#main` — and the Senify page has a `<main id=\"main\">`",
    "  // of its own. Two elements with one id: the runtime would take the wrong one.",
    "  // The id therefore belongs to the payload; the other element keeps its",
    "  // landmark and gives the id up.",
    "  var own = stage.querySelector('#main');",
    "  var others = document.querySelectorAll('#main');",
    "  for (var index = 0; index < others.length; index += 1) {",
    "    if (others[index] === own) continue;",
    "    others[index].removeAttribute('id');",
    "    others[index].setAttribute('data-senify-main', '1');",
    "  }",
    "  if (CSS !== '') {",
    "    var style = document.createElement('style');",
    "    style.setAttribute('data-framer-payload', '1');",
    "    style.textContent = CSS;",
    "    document.head.appendChild(style);",
    "  }",
    "  if (SHEETS !== '') {",
    "    var sheet = document.createElement('style');",
    "    sheet.setAttribute('data-framer-payload', '1');",
    "    sheet.textContent = SHEETS;",
    "    document.head.appendChild(sheet);",
    "  }",
    "  return import('./" + entryName + "').then(function (module) {",
    "    if (options && options.host) options.host.setAttribute('data-payload-state', 'mounted');",
    "    return module;",
    "  });",
    "}",
  ].join("\n");

  // The runtime files live in the plugin's virtual filesystem: the bytes come
  // from the network (live page) or from the mirror's disk (offline import),
  // and neither path needs a temporary folder on disk.
  const result = await build({
    stdin: {
      contents: wrapper,
      resolveDir: process.cwd(),
      sourcefile: "senify-framer-payload.mjs",
      loader: "js",
    },
    bundle: true,
    write: false,
    format: "esm",
    target: "es2020",
    // Framer ships already-minified modules; esbuild's own output around them is
    // NOT minified and inflates a 2047 KB closure to 3369 KB. Measured on
    // `unifiersofjapan`: with `minify` the same closure is 2633 KB — inside
    // ADR-0010's 3 MB. Nothing changes semantically: the runtime is the source's
    // own code, minified once more.
    minify: true,
    legalComments: "none",
    plugins: [
      {
        name: "framer-runtime",
        setup(build) {
          build.onResolve({ filter: /^\.\// }, (args) => {
            const name = args.path.replace(/^\.\//, "");
            if (byName.has(name)) return { path: name, namespace: "framer-runtime" };
            return { path: args.path, external: true };
          });
          build.onLoad({ filter: /.*/, namespace: "framer-runtime" }, (args) => ({
            contents: byName.get(args.path) ?? "",
            loader: "js",
          }));
        },
      },
    ],
  });
  const bundled = result.outputFiles[0]?.text ?? "";
  // One last pass over the finished bundle: the runtime's own data holds the
  // page as JSON (with `/` escaped), and a string replacement cannot be written
  // as a `url()` rule. Longest address first, so a prefix cannot cut a longer
  // one.
  //
  // The replacement is ABSOLUTE: the source's addresses were absolute CDN URLs
  // and the runtime calls `new URL(...)` on them — a root-relative path throws
  // `TypeError: Failed to construct 'URL': Invalid URL` and the page stays
  // empty (measured on `notes`: 900 px instead of 1743 px).
  const rewrites = new Map<string, string>();
  for (const [from, to] of Object.entries(input.addressRewrites ?? {})) {
    rewrites.set(from, input.assetOrigin === undefined || /^https?:\/\//i.test(to) ? to : `${input.assetOrigin}${to}`);
  }
  const bundle = rewriteAddressesInData(bundled, rewrites);
  const bytes = Buffer.byteLength(bundle, "utf8");
  if (input.maxBytes !== undefined && bytes > input.maxBytes) {
    throw new Error(
      `Die Framer-Runtime wiegt ${bytes} Bytes — über dem Budget von ${input.maxBytes} Bytes.`,
    );
  }
  let rawBytes = 0;
  for (const source of files.values()) rawBytes += Buffer.byteLength(source, "utf8");
  return {
    bundle,
    bytes,
    integrity: createHash("sha256").update(bundle).digest("hex"),
    files: [...files.keys()],
    rawBytes,
  };
}

/** The CSS of the payload with every known asset address rewritten. */
export function rewriteCss(css: string, rewriteUrl?: (url: string) => string | null): string {
  if (rewriteUrl === undefined) return css;
  // A declaration may name the address without `url()`:
  // `background: url('…')` is the common form, but the source also writes
  // `background: -100% 0% / 200% 100% text rgb(…)` and plain `src="…"` inside
  // an inline style. Both passes below cover the two forms.
  const viaUrl = css.replace(/url\((["']?)([^"')]+)\1\)/g, (whole, quote: string, url: string) => {
    if (url.startsWith("data:") || url.startsWith("#")) return whole;
    const rewritten = rewriteUrl(url);
    return rewritten === null ? whole : `url(${quote}${rewritten}${quote})`;
  });
  return viaUrl;
}

/**
 * The payload's ORIGINAL markup with every known asset address rewritten.
 *
 * The markup is the source's own page — and it names its pictures, videos and
 * posters by CDN address. Leaving them there means the release loads the
 * original CDN: the page works, but the visitor's browser talks to the source,
 * and a content-security policy tight enough to be worth anything cannot be
 * written. Measured on `donutshop`: 764 CDN addresses inside the bundle.
 *
 * Rewritten are the attributes that load a resource (`src`, `poster`, `href`
 * of a `<link>`), `srcset` (each candidate), and `url()` inside an inline
 * `style` attribute. The picture behind each address is the one the asset
 * pipeline already downloaded — the rewrite map is the same one the CSS uses,
 * so markup and styles can never point at two different files.
 */
export function rewriteMarkup(
  html: string,
  rewriteUrl?: (url: string) => string | null,
  table?: ReadonlyMap<string, string>,
): string {
  if (rewriteUrl === undefined) return html;
  // A source's `srcset` names the same file with size parameters
  // (`…/bild.jpg?width=840&height=841`). The asset pipeline downloaded the file
  // WITHOUT them, so the lookup drops the query before it asks. The rewritten
  // address then names the one file the site holds — the ladder is the site's
  // own (the bake delivers it), not the CDN's.
  const lookup = (value: string): string | null => {
    // An attribute holds `&amp;` where the URL has `&`; the asset map knows the
    // plain address.
    const decoded = value.replace(/&amp;/g, "&");
    const direct = rewriteUrl(decoded);
    if (direct !== null) return direct;
    // A source names variants of ONE file (`?width=840&height=841`,
    // `?scale-down-to=512`). The pipeline downloaded the file itself, so the
    // lookup drops the parameters before it asks.
    const withoutQuery = decoded.split(/[?#]/, 1)[0] ?? "";
    if (withoutQuery === "" || withoutQuery === decoded) return null;
    return rewriteUrl(withoutQuery);
  };
  const one = (value: string): string => {
    if (value === "" || value.startsWith("data:") || value.startsWith("#")) return value;
    return lookup(value) ?? value;
  };
  return html
    .replace(/\b(src|poster|href)="([^"]*)"/g, (whole, attribute: string, value: string) => {
      const next = one(value);
      return next === value ? whole : `${attribute}="${next}"`;
    })
    .replace(/\bsrcset="([^"]*)"/g, (whole, value: string) => {
      // The separators are split BEFORE the entities are decoded: a `&amp;`
      // holds a `;`, and a naive split on `,` cut the address at the wrong
      // place (`…?scale-down-to=512&amp;width=840` became two candidates).
      const next = value
        .split(/,(?![^&]*;)/)
        .map((entry) => {
          const [url, ...rest] = entry.trim().split(/\s+/);
          return [one(url ?? ""), ...rest].join(" ");
        })
        .join(", ");
      return next === value ? whole : `srcset="${next}"`;
    })
    .replace(/\bstyle="([^"]*)"/g, (whole, value: string) => {
      let next = rewriteCss(value, (url) => lookup(url));
      // A plain address without `url()` inside a style attribute
      // (`background:url(...)` is the common form; `src="…"` also appears).
      for (const [from, to] of table ?? new Map<string, string>()) {
        if (!next.includes(from)) continue;
        next = next.split(from).join(to);
      }
      return next === value ? whole : `style="${next}"`;
    });
}

/**
 * The addresses inside the runtime's own data, rewritten.
 *
 * The runtime does not read the markup's `<img src>`: it carries the page as
 * JSON (`data-framer-hydrate-v2`, the route module) and builds the images from
 * that. A rewrite of the markup alone therefore misses every picture — measured
 * on `donutshop`: 87 of 88 image addresses stayed at `framerusercontent.com`.
 *
 * A JSON string holds the URL with its `/` escaped (`https:\/\/…`), and the
 * address may also appear plain. Both forms are replaced, longest address
 * first so a prefix cannot cut a longer one.
 *
 * Variants of one file are replaced with it: the source asks for
 * `…/bild.jpg?width=840&height=841` or `?scale-down-to=512`, the site holds ONE
 * file, and that is the one every variant means. The query is cut before the
 * lookup, the way the markup pass does it.
 */
export function rewriteAddressesInData(source: string, rewrites: ReadonlyMap<string, string>): string {
  if (rewrites.size === 0) return source;
  let out = source;
  // 1. Whole addresses (the plain form).
  const keys = [...rewrites.keys()].sort((a, b) => b.length - a.length);
  for (const from of keys) {
    const to = rewrites.get(from);
    if (to === undefined) continue;
    if (out.includes(from)) out = out.split(from).join(to);
    const escaped = from.replace(/\//g, "\\/");
    if (out.includes(escaped)) out = out.split(escaped).join(to.replace(/\//g, "\\/"));
  }
  // 2. Addresses with a query (`?width=840…`, `?scale-down-to=512`): a variant
  // of a file the site already holds. Longest base first, so a longer name is
  // never cut by a shorter one.
  for (const from of keys) {
    const to = rewrites.get(from);
    if (to === undefined) continue;
    const base = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`${base}\\?[^"'\\\\\\s)]*`, "g");
    const escapedPattern = new RegExp(`${base.replace(/\//g, "\\\\/")}\\?[^"'\\\\\\s)]*`, "g");
    out = out.replace(pattern, to).replace(escapedPattern, to.replace(/\//g, "\\/"));
  }
  return out;
}

/* ------------------------------------------------------------ page payload */

export type RuntimePayloadResult =
  | { ok: true; payload: RuntimePayload; detection: FramerRuntimeDetection }
  | { ok: false; reason: string; hasRuntime: boolean };

export type PageRuntimePayloadInput = {
  html: string;
  pageUrl: string;
  loadFile: RuntimeFileLoader;
  rewriteUrl?: (url: string) => string | null;
  addressRewrites?: Readonly<Record<string, string>>;
  maxBytes?: number;
};

/**
 * The runtime payload of a page: the original runtime, the original markup
 * and the original CSS, bundled into one module.
 *
 * The result is honest about failure: a page without a runtime is not an
 * error (many sources are plain HTML), a page whose runtime cannot be read
 * says so.
 */
export async function buildPageRuntimePayload(
  input: PageRuntimePayloadInput,
): Promise<RuntimePayloadResult> {
  const detection = detectFramerRuntime(input.html, input.pageUrl);
  if (detection === null) {
    return { ok: false, reason: "Die Seite trägt keine Framer-Runtime.", hasRuntime: false };
  }
  try {
    const files = await collectRuntimeFiles(detection.entry, input.loadFile, {
      routeId: detection.routeId,
    });
    if (!files.has(detection.entry)) {
      return {
        ok: false,
        reason: `Die Framer-Runtime war nicht lesbar (${detection.entry}).`,
        hasRuntime: true,
      };
    }
    let sheetsText = "";
    for (const sheet of detection.sheets) {
      const text = await input.loadFile(sheet);
      if (text !== null) sheetsText += `${text}\n`;
    }
    const payload = await buildRuntimePayload({
      detection,
      files,
      loadFile: input.loadFile,
      sheetsText,
      ...(input.rewriteUrl !== undefined ? { rewriteUrl: input.rewriteUrl } : {}),
      ...(input.addressRewrites !== undefined ? { addressRewrites: input.addressRewrites } : {}),
      ...(input.maxBytes !== undefined ? { maxBytes: input.maxBytes } : {}),
    });
    return { ok: true, payload, detection };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Die Framer-Runtime ließ sich nicht bündeln.",
      hasRuntime: true,
    };
  }
}
