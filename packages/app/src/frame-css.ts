import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";

// Frame stylesheet of the visual editor (T17): Tailwind v4 utilities for the
// registry components plus the renderer's component styles. Compiled once per
// program run and served as /editor-frame.css — the frame also loads
// /theme.css for the platform tokens.
const entryFile = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "editor",
  "frame.css",
);

let frameCss: Promise<string> | undefined;

export function loadFrameCss(): Promise<string> {
  frameCss ??= compileFrameCss().catch((error: unknown) => {
    frameCss = undefined;
    throw error;
  });
  return frameCss;
}

async function compileFrameCss(): Promise<string> {
  const compiler = await compile(readFileSync(entryFile, "utf8"), {
    base: dirname(entryFile),
    onDependency: () => {},
  });
  const scanner = new Scanner({ sources: compiler.sources });
  return compiler.build(scanner.scan());
}
