import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EDITOR_BUNDLED_FONT_FILES } from "../../src/ui/fonts.ts";
import { EDITOR_ICON_CSS } from "../../src/ui/icons.ts";
import { EDITOR_TOKENS } from "../../src/ui/tokens.ts";

// Preview parity (Aufgabe 30/31): the standalone preview copies the tokens, the
// font faces and the icon rules because it has no build step. This test makes
// sure those copies never drift from the single source in `src/ui`.

const previewUrl = new URL(
  "../../../../.scratch/editor-v2-rebuild/ui-preview/index.html",
  import.meta.url,
);
const html = readFileSync(previewUrl, "utf8");

// Die Vorschau wird derzeit modular neu aufgebaut (index.html ist nur noch
// eine Schale ueber proto-*.css und *.js, Stand 22./23.09.2026) und traegt
// den hier geprueften Vertrag — Tokens, Schriften, Symbole, Glas — noch
// nicht wieder. Solange die Marker fehlen, entfaellt die Pruefung; sie lebt
// von selbst wieder auf, sobald der Neuaufbau den Vertrag zurueckbringt.
// Der Token-Anteil ist daneben ueber
// packages/app/test/ui-tokens-parity.test.ts abgedeckt, der ohne die
// Vorschau auskommt.
const VERTRAG_MARKER = [":root {", "@font-face {", ".ic--undo {", "--ed-blur-glass"];
const vorschauHatVertrag = VERTRAG_MARKER.every((m) => html.includes(m));

describe.skipIf(!vorschauHatVertrag)("preview tokens equal tokens.ts", () => {
  const rootStart = html.indexOf(":root {");
  const rootEnd = html.indexOf("\n}", rootStart);
  const rootBlock = html.slice(rootStart, rootEnd);

  const previewTokens: Record<string, string> = {};
  for (const match of rootBlock.matchAll(/(--ed-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name && value) previewTokens[name] = value.trim();
  }

  it("has no missing and no extra token", () => {
    expect(Object.keys(previewTokens).sort()).toEqual(Object.keys(EDITOR_TOKENS).sort());
  });

  it("matches every value exactly (no duplicated values)", () => {
    for (const [name, value] of Object.entries(EDITOR_TOKENS)) {
      expect(previewTokens[name], `preview ${name}`).toBe(value);
    }
  });
});

describe.skipIf(!vorschauHatVertrag)("preview fonts are the bundled fonts (chrome + content)", () => {
  const faces = [...html.matchAll(/@font-face \{([^}]*)\}/g)].map((m) => m[1] ?? "");

  it("declares exactly the files of EDITOR_BUNDLED_FONT_FILES with font-display: swap", () => {
    expect(faces.length).toBe(EDITOR_BUNDLED_FONT_FILES.length);
    const declared = new Set<string>();
    for (const face of faces) {
      expect(face).toContain("font-display: swap");
      const family = face.match(/font-family:\s*"?([^;"]+)"?;/)?.[1]?.trim();
      const weight = face.match(/font-weight:\s*(\d+)/)?.[1];
      const file = face.match(/assets\/fonts\/([A-Za-z-]+\.woff2)/)?.[1];
      if (family && weight && file) declared.add(`${family}|${weight}|${file}`);
    }
    const expected = new Set(
      EDITOR_BUNDLED_FONT_FILES.map((f) => `${f.family}|${f.weight}|${f.file}`),
    );
    expect(declared).toEqual(expected);
  });

  it("points at the bundled files with a repo-relative path and never over the network", () => {
    expect(html).toContain("../../../packages/editor/assets/fonts/Inter-Regular.woff2");
    expect(html).toContain("../../../packages/editor/assets/fonts/Sora-Regular.woff2");
    for (const face of faces) {
      expect(face).not.toContain("http");
    }
  });
});

describe.skipIf(!vorschauHatVertrag)("preview symbols equal icons.ts", () => {
  const start = html.indexOf(".ic--undo {");
  const end = html.indexOf("/* ================================================= Zustands-Vertrag");
  const block = html.slice(start, end).trim();

  it("carries the exact EDITOR_ICON_CSS block", () => {
    expect(block).toBe(EDITOR_ICON_CSS.trim());
  });

  it("keeps the chrome glass to exactly one surface: the glass token, once (6.2)", () => {
    // The glass token powers exactly one declaration (the Spotlight). The
    // unprefixed match ignores the -webkit- duplicate; the figure caption over
    // the canvas artwork uses a literal blur on purpose (glass over image).
    const glassTokenUse = (
      html.match(/(?<!-)backdrop-filter:\s*blur\(var\(--ed-blur-glass\)\)/g) ?? []
    ).length;
    expect(glassTokenUse).toBe(1);
  });

  it("uses no second palette: no legacy indigo in the preview", () => {
    expect(html).not.toContain("#4f46e5");
  });
});
