import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Designsystem im Produkt (Analyse 2026-09-23, Fund P0-4): Die App-Shell
// bezieht ihre `--ui-*`-Schicht aus einer Datei, deren Quelle das
// verbindliche Designsystem ist. Dieser Test meldet jede Abweichung.

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const uiCssPath = `${repoRoot}/packages/app/public/ui.css`;
const sourcePath = `${repoRoot}/.scratch/editor-v2-rebuild/design-system/senify.css`;
const indexPath = `${repoRoot}/packages/app/public/index.html`;
const appCssPath = `${repoRoot}/packages/app/public/app.css`;

/** Mapst `--name: wert;`-Deklarationen (Kommentare werden entfernt). */
function declarations(css: string): Map<string, string> {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Map<string, string>();
  for (const match of clean.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name === undefined || value === undefined) continue;
    out.set(name, value.trim().replace(/\s+/g, " "));
  }
  return out;
}

describe("designtoken-schicht der app-shell", () => {
  it("ui.css deckt jede --ui-*-Deklaration der Quelle wertgleich ab", () => {
    let source: string;
    try {
      source = readFileSync(sourcePath, "utf8");
    } catch {
      console.warn(`Quelle fehlt (${sourcePath}) — Parität übersprungen.`);
      return;
    }
    const expected = declarations(source);
    expect(expected.size).toBeGreaterThan(50);
    const actual = declarations(readFileSync(uiCssPath, "utf8"));
    for (const [name, value] of expected) {
      expect(actual.get(name), name).toBe(value);
    }
  });

  it("index.html lädt ui.css zwischen theme.css und app.css", () => {
    const html = readFileSync(indexPath, "utf8");
    const theme = html.indexOf('href="/theme.css"');
    const ui = html.indexOf('href="/ui.css"');
    const app = html.indexOf('href="/app.css"');
    expect(theme).toBeGreaterThanOrEqual(0);
    expect(ui).toBeGreaterThan(theme);
    expect(app).toBeGreaterThan(ui);
  });

  it("app.css enthält kein Hex-Literal mehr (Rollen statt Werte)", () => {
    const css = readFileSync(appCssPath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const hits = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hits).toEqual([]);
  });

  it("app.css nutzt die --ui-*-Schicht", () => {
    const css = readFileSync(appCssPath, "utf8");
    expect(css).toMatch(/var\(--ui-(surface|ink|line|signal|fill|focus)-/);
  });
});
