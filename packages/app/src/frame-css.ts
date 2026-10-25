import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import {
  sectionBreakpointThemeOf,
  type SectionBreakpoints,
} from "@senify/widget-engine/section-breakpoints";

// Frame stylesheet of the visual editor (T17): Tailwind v4 utilities for the
// registry components plus the renderer's component styles. Compiled once per
// program run and served as /editor-frame.css — the frame also loads
// /theme.css for the platform tokens.
//
// **Die Raster-Schwellen folgen dem Paar der Site** (ADR-0020). Tailwind
// uebersetzt die Utilities der Sektionen (`md:grid-cols-3`) ueber seine
// Breakpoint-Variablen; der `@theme`-Block hier setzt sie auf die Schwellen
// der Site. Ohne das zeigte der Canvas ein anderes Raster als das Release -
// und das Paritaets-Tor faellt genau darueber.
//
// Die Datei wird deshalb je Paar kompiliert und je Paar gehalten. Die Zahl
// der Paare ist klein (eine Site, ein Paar), und der Cache verhindert, dass
// der Compiler je Frame laeuft.
const entryFile = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "editor",
  "frame.css",
);

// Der Schluessel des Caches: das Paar, auf das der Block zeigt. `null` ist
// das Standardpaar (die Site hat kein eigenes).
const cache = new Map<string, Promise<string>>();

function keyOf(breakpoints: SectionBreakpoints | null): string {
  if (breakpoints === null) return "default";
  return `${breakpoints.sm}-${breakpoints.md}-${breakpoints.lg}`;
}

// Das Stylesheet fuer ein Paar. Ohne Paar (der Aufrufer kennt keines) gilt
// das Standardpaar - dieselben Zahlen, die der Bake ohne Paar schreibt.
export function loadFrameCss(breakpoints?: SectionBreakpoints | null): Promise<string> {
  const key = keyOf(breakpoints ?? null);
  const vorhanden = cache.get(key);
  if (vorhanden !== undefined) return vorhanden;
  const promise = compileFrameCss(breakpoints ?? null).catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, promise);
  return promise;
}

async function compileFrameCss(breakpoints: SectionBreakpoints | null): Promise<string> {
  // Der Breakpoint-Block kommt NACH dem Tailwind-Import: Tailwind verarbeitet
  // `@theme`-Bloecke erst, wenn der Import vorbei ist - ein Block davor wird
  // uebersehen, und die Utilities blieben auf den Standardwerten. Die
  // spaetere `@theme`-Definition gewinnt gegen die Vorgabe von Tailwind
  // (das ist der dokumentierte Weg, eigene Breakpoints zu setzen).
  const block = breakpoints === null ? "" : sectionBreakpointThemeOf(breakpoints);
  const quelle = `${readFileSync(entryFile, "utf8")}\n${block}`;
  const compiler = await compile(quelle, {
    base: dirname(entryFile),
    onDependency: () => {},
  });
  const scanner = new Scanner({ sources: compiler.sources });
  return compiler.build(scanner.scan());
}
