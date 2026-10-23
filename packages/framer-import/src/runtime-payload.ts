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
  // Das Original-CSS der Seite (inline + verlinkte Blätter).
  css: string;
  // Die verlinkten Stylesheets der Seite (inline ist oben schon drin).
  sheets: string[];
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
const HYDRATE_STATE = /data-framer-hydrate-v2\s*=\s*["'][^"']*["']/i;

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
  if (!HYDRATE_STATE.test(mainAttrs)) return null;

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
    css: css.join("\n"),
    sheets,
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

// A relative import inside a runtime file: `from "./x.mjs"`, `import("./x.mjs")`,
// `import "./x.mjs"`. Framer's runtime files reference each other that way.
const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g;

function baseNameOf(url: string): string {
  const path = new URL(url).pathname;
  const name = path.split("/").pop() ?? "module.mjs";
  return name === "" ? "module.mjs" : name;
}

/**
 * The runtime files of a page: the entry and everything it imports, directly
 * or indirectly. Framer splits the runtime into a bundle, chunks and one
 * module per page; the page module is loaded with a *dynamic* import, so a
 * scan of the file text is the only way to find it.
 */
export async function collectRuntimeFiles(
  entry: string,
  loadFile: RuntimeFileLoader,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const queue: string[] = [entry];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const url = queue.shift() as string;
    if (seen.has(url)) continue;
    seen.add(url);
    const source = await loadFile(url);
    if (source === null) continue;
    files.set(url, source);
    for (const match of source.matchAll(RELATIVE_IMPORT)) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      const resolved = absolute(url, specifier);
      if (!seen.has(resolved)) queue.push(resolved);
    }
  }
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
    "  var NativeURL = window.URL;",
    "  if (typeof NativeURL === 'function' && NativeURL.__senifyBaseShim !== true) {",
    "    var PatchedURL = function (value, base) {",
    "      return base === undefined ? new NativeURL(value, document.baseURI) : new NativeURL(value, base);",
    "    };",
    "    PatchedURL.prototype = NativeURL.prototype;",
    "    PatchedURL.createObjectURL = NativeURL.createObjectURL;",
    "    PatchedURL.revokeObjectURL = NativeURL.revokeObjectURL;",
    "    PatchedURL.canParse = NativeURL.canParse;",
    "    PatchedURL.parse = NativeURL.parse;",
    "    PatchedURL.__senifyBaseShim = true;",
    "    window.URL = PatchedURL;",
    "  }",
    "  stage.innerHTML = PAGE;",
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
    const files = await collectRuntimeFiles(detection.entry, input.loadFile);
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
