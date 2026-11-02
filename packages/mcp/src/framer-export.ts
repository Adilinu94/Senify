import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { SenifyError } from "@senify/core";

const require = createRequire(import.meta.url);

export async function exportFramerSite(
  input: { url: string; outputDir: string; subpages: boolean },
  cliPath = join(dirname(require.resolve("framer-export/package.json")), "bin", "framer-export.js"),
  onOutput?: (text: string) => void,
): Promise<string> {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    throw new SenifyError("validation", "Ungültige Website-URL", { field: "url" });
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new SenifyError("validation", "Website-URL muss HTTP oder HTTPS ohne Zugangsdaten verwenden", { field: "url" });
  }
  const outputDir = resolve(input.outputDir);
  mkdirSync(dirname(outputDir), { recursive: true });
  try {
    mkdirSync(outputDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    throw new SenifyError("validation", "Das Exportziel existiert bereits", {
      field: "outputDir",
      suggestion: "Einen neuen Ordner für den Export wählen.",
    });
  }
  const env = { ...process.env };
  if (!env.PUPPETEER_EXECUTABLE_PATH) {
    try {
      const { chromium } = await import("playwright");
      const browser = chromium.executablePath();
      if (existsSync(browser)) env.PUPPETEER_EXECUTABLE_PATH = browser;
    } catch {
      // Puppeteer can use its own installed browser.
    }
  }
  const code = await new Promise<number>((done, reject) => {
    const child = spawn(process.execPath, [cliPath, input.url, outputDir, "--no-update", ...(input.subpages ? ["--subpages"] : [])], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    child.stdout.on("data", (chunk: Buffer) => onOutput?.(chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => onOutput?.(chunk.toString()));
    child.once("error", reject);
    child.once("close", (status) => done(status ?? 1));
  });
  if (code !== 0 || !existsSync(join(outputDir, "index.html"))) {
    throw new SenifyError("validation", "FramerExport konnte den Export nicht abschließen", {
      field: "url",
      suggestion: `Ausgabe prüfen: ${outputDir}`,
    });
  }
  return outputDir;
}
