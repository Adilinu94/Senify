import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { buildSync } from "esbuild";
import type { FramerIrDocument, IrCodeModule, IrFinding, IrNode } from "./ir.ts";

export type ExtractedPayload = {
  nodeKey: string;
  name: string;
  kind: "module" | "webgl-scene";
  // What the payload carries: one code component of the source tree
  // (`node`) or the whole runtime of the page (`page`). The Framer runtime
  // hydrates `#main` and therefore belongs to the page, not to a section
  // (see `runtime-payload.ts`).
  scope: "node" | "page";
  bundle: string;
  bytes: number;
  integrity: string;
  sourcePath: string;
  license: { id: string; note: string | null };
  adapter: IrCodeModule["adapter"];
};

export type ExtractPayloadsInput = {
  document: FramerIrDocument;
  rootDir: string;
};

function walk(node: IrNode, visit: (node: IrNode) => void): void {
  visit(node);
  for (const child of node.children) walk(child, visit);
}

function safeModulePath(rootDir: string, modulePath: string): string | null {
  if (isAbsolute(modulePath)) return null;
  const base = resolve(rootDir);
  const full = resolve(base, modulePath);
  const rel = relative(base, full);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel) ? full : null;
}

function mountExportModule(source: string, modulePath: string): string | null {
  if (!/export\s+(?:async\s+)?function\s+mount\s*\(/.test(source)) return null;
  if (/\bimport\s[^;]*from\s*["']\.{1,2}\//.test(source)) return null;
  if (/\b(?:import|export)\s[^;]*["']https?:\/\//.test(source)) return null;
  return `${source}\n// imported from ${modulePath}\n`;
}

function waveMountModule(source: string): string | null {
  const roleldown = /import \{[^}]*}\s*from ["']\.\/rolldown-runtime\.[^"']+["'];\s*/g;
  const framerReact = /import \{[^}]*}\s*from ["']\.\/react\.[^"']+["'];\s*/g;
  const threeLoader = /\(s\.src\s*=\s*`three\.min\.js`\),\s*\(s\.onload\s*=\s*\(\)\s*=>\s*\{\s*let e\s*=\s*t\.THREE;\s*if\s*\(!e\)\s*return;/;
  const loaderEnd = /\}\),\s*document\.head\.appendChild\(s\),/;
  let body = source.replace(roleldown, "").replace(framerReact, "");
  body = body.replace(/s\s*=\s*document\.createElement\(`script`\);/, "s = null;");
  body = body.replace(threeLoader, "(() => { let e = __THREE__; if (!e.Scene) return;");
  body = body.replace(loaderEnd, "})(),");
  const prelude = [
    'import * as React from "react";',
    'import * as ReactDOM from "react-dom/client";',
    'import { jsx } from "react/jsx-runtime";',
    'import * as __THREE__ from "three";',
    "const t = globalThis;",
    "const n = React.useEffect;",
    "const o = React.useRef;",
    "const a = jsx;",
    "const r = () => {};",
    "const i = () => {};",
    "const s = () => {};",
    "const e = (init) => { let ran = false; return () => (ran ? undefined : ((ran = true), init())); };",
  ].join("\n");
  const alias = /export\s*\{\s*l as n,\s*c as t\s*\}\s*;?/;
  if (!alias.test(body)) return null;
  body = body.replace(alias, "const WAVE_COMPONENT = c;\nexport { l as n };");
  const mount = [
    "export function mount(stage, options = {}) {",
    "  stage.style.display = 'block';",
    "  stage.style.position = 'absolute';",
    "  stage.style.inset = '0';",
    "  const root = ReactDOM.createRoot(stage);",
    "  root.render(React.createElement(WAVE_COMPONENT, options.props ?? {}));",
    "  options.host?.setAttribute('data-payload-state', 'mounted');",
    "}",
  ].join("\n");
  return `${prelude}\n${body}\n${mount}\n`;
}

function bundle(input: {
  source: string;
  sourceName: string;
  rootDir: string;
  adapter: IrCodeModule["adapter"];
}): string {
  const direct = input.adapter === "mount-export" ? mountExportModule(input.source, input.sourceName) : null;
  const wave = input.adapter === "wave-background" ? waveMountModule(input.source) : null;
  const entry = direct ?? wave;
  if (entry === null) throw new Error(`Kein unterstützter Mount-Adapter für ${input.sourceName}`);
  if (direct !== null) return entry;
  const result = buildSync({
    stdin: { contents: entry, resolveDir: input.rootDir, sourcefile: input.sourceName, loader: "js" },
    bundle: true,
    write: false,
    format: "esm",
    target: "es2020",
    legalComments: "none",
  });
  return result.outputFiles[0]?.text ?? "";
}

function finding(
  document: FramerIrDocument,
  node: IrNode,
  module: IrCodeModule,
  message: string,
): void {
  document.findings.push({
    kind: module.kind === "webgl-scene" ? "shader" : "code-component",
    nodeKey: node.key,
    message,
    evidence: module.path,
    severity: "warn",
    suggestion: "Modulzuordnung und Mirror-Datei prüfen; ohne Beleg bleibt die Stelle eine sichtbare Platte.",
  } satisfies IrFinding);
}

export function extractPayloads(input: ExtractPayloadsInput): ExtractedPayload[] {
  const out: ExtractedPayload[] = [];
  walk(input.document.pages[0]?.root ?? { key: "root", kind: "frame", name: null, componentType: null, baseClasses: [], tag: "root", href: null, states: [], children: [], appearId: null, stylesPresetId: null, svg: null }, (node) => {
    const module = node.codeModule;
    if (module === null || module === undefined) return;
    const fullPath = safeModulePath(input.rootDir, module.path);
    if (fullPath === null) {
      finding(input.document, node, module, "Der Framer-Modulpfad verlässt den Mirror und wurde nicht importiert.");
      return;
    }
    let source: string;
    try {
      source = readFileSync(fullPath, "utf8");
    } catch {
      finding(input.document, node, module, "Die Framer-Moduldatei fehlt im Mirror; die Stelle bleibt eine Platte.");
      return;
    }
    try {
      const output = bundle({ source, sourceName: module.path, rootDir: input.rootDir, adapter: module.adapter });
      if (!/export\s+(?:async\s+)?function\s+mount\s*\(/.test(output)) throw new Error("Mount-Export fehlt");
      out.push({
        nodeKey: node.key,
        name: node.name ?? module.path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "Framer-Island",
        kind: module.kind,
        scope: "node",
        bundle: output,
        bytes: Buffer.byteLength(output, "utf8"),
        integrity: createHash("sha256").update(output).digest("hex"),
        sourcePath: module.path,
        license: module.license,
        adapter: module.adapter,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unbekannter Bundle-Fehler";
      finding(input.document, node, module, `Framer-Modul konnte nicht als Island gebündelt werden: ${reason}`);
    }
  });
  return out;
}
