// Bündelt einen Widget-Kern aus @senify/widgets zur Bake-Zeit zu ESM (Vorbild
// webgl-vendor.ts). Nur die je Seite genutzten Typen werden geschrieben.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { isWidgetPrimitive } from "@senify/widget-engine";
import { buildSync } from "esbuild";

const require = createRequire(import.meta.url);

function widgetEntry(type: string): string {
  if (!isWidgetPrimitive(type)) {
    throw new Error(`unknown widget type: ${type}`);
  }
  // Auflösung über das Paket-Export; der Kern liegt in packages/widgets/src/<type>.ts.
  const widgetsDir = dirname(require.resolve("@senify/widgets"));
  return join(widgetsDir, `${type}.ts`);
}

const cache = new Map<string, { stamp: string; code: string }>();
export function widgetVendorCode(type: string): string {
  const entry = widgetEntry(type);
  const stat = statSync(entry);
  const stamp = `${stat.mtimeMs}:${stat.size}`;
  const hit = cache.get(type);
  if (hit !== undefined && hit.stamp === stamp) return hit.code;
  let code: string;
  try {
    const result = buildSync({
      entryPoints: [entry],
      bundle: true,
      minify: true,
      format: "esm",
      target: "es2020",
      write: false,
      legalComments: "none",
    });
    const file = result.outputFiles[0];
    if (file === undefined) throw new Error("no output");
    code = file.text;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`widget bundle failed for "${type}" (${entry}): ${reason}`);
  }
  cache.set(type, { stamp, code });
  return code;
}

export function widgetFileName(type: string, code: string): string {
  const hash = createHash("sha256").update(code).digest("hex").slice(0, 8);
  return `${type}.${hash}.js`;
}
