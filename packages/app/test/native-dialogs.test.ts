import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Das Dashboard fragt nicht über die nativen Browser-Dialoge. `prompt()` und
// `confirm()` lassen sich nicht gestalten, nicht beschriften, nicht in einem
// Test bedienen (Playwright schließt sie unbemerkt) und blockieren die ganze
// Seite. Stattdessen gibt es `askText` und `askConfirm` auf Basis von
// `<dialog class="modal">`. Dieser Test hält die Schwelle fest: er meldet jede
// Zeile, die einen nativen Dialog wieder aufruft.

const publicDir = fileURLToPath(new URL("../public", import.meta.url));

// Die Oberflaeche liegt in mehreren Modulen (`app.js` und die `app-*.js`);
// der Wächter liest alle, damit ein Modul nicht durchrutscht.
const module = readdirSync(publicDir).filter((name) => name.endsWith(".js"));

function nativeDialogCalls(source: string): string[] {
  const hits: string[] = [];
  source.split("\n").forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
    if (/(^|[^.\w$])(prompt|confirm|alert)\(|window\.(prompt|confirm|alert)\b/.test(line)) {
      hits.push(`app.js:${index + 1}: ${trimmed.slice(0, 100)}`);
    }
  });
  return hits;
}

describe("keine nativen Browser-Dialoge im Dashboard", () => {
  it("kein Modul ruft prompt() oder confirm() oder alert() auf", () => {
    const funde: string[] = [];
    for (const name of module) {
      const quelle = readFileSync(`${publicDir}/${name}`, "utf8");
      funde.push(...nativeDialogCalls(quelle).map((fund) => `${name}: ${fund}`));
    }
    expect(funde).toEqual([]);
  });

  it("der Wächter erkennt einen nativen Aufruf (Gegenprobe)", () => {
    expect(nativeDialogCalls('const name = prompt("Name");')).toHaveLength(1);
    expect(nativeDialogCalls("if (!confirm(message)) return;")).toHaveLength(1);
    expect(nativeDialogCalls("const ok = window.confirm(message);")).toHaveLength(1);
  });

  it("der Wächter lässt Methoden, Bezeichner und Kommentare in Ruhe", () => {
    expect(nativeDialogCalls("await askText(label);")).toEqual([]);
    expect(nativeDialogCalls("form.prompt.trim();")).toEqual([]);
    expect(nativeDialogCalls("// früher: confirm(message)")).toEqual([]);
  });
});
