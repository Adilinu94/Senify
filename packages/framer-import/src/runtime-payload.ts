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
const MAIN_ELEMENT = /<(\w+)\b([^>]*\bid\s*=\s*["']main["'][^>]*)>([\s\S]*?)<\/\1>/i;

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
  const mainBody = main[3] ?? "";
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

  // The wrapper: the runtime starts in `mount()`, after the markup stands.
  // The runtime module is imported ONLY dynamically — a static import would
  // make esbuild initialize it when the payload file loads, and the runtime
  // looks for `#main` at that moment (it would find nothing and die).
  const wrapper = [
    `const PAGE = ${escapeForJs(input.detection.mainHtml)};`,
    `const CSS = ${escapeForJs(css)};`,
    `const SHEETS = ${escapeForJs(sheets)};`,
    "export function mount(stage, options) {",
    "  if (!stage) throw new Error('Der Payload braucht eine Bühne.');",
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
  const bundle = result.outputFiles[0]?.text ?? "";
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
  return css.replace(/url\((["']?)([^"')]+)\1\)/g, (whole, quote: string, url: string) => {
    if (url.startsWith("data:") || url.startsWith("#")) return whole;
    const rewritten = rewriteUrl(url);
    return rewritten === null ? whole : `url(${quote}${rewritten}${quote})`;
  });
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
