// Editor typography: the local font files and the @font-face rules that bind
// them. This module is the one source for every font the editor injects; the
// files themselves live in `packages/editor/assets/fonts/` (SIL OFL 1.1, see
// `LICENSE.txt`) and are served under `/editor-fonts/*`, so the editor never
// fetches a font over the network at runtime.
//
// ONE role: the tool / chrome face. Inter Display for headings, Inter for text
// (`--ed-font-display`, `--ed-font-body` in `tokens.ts`; the binding design
// language `.scratch/refs/precious-board/design-guidelines.md`).
//
// NOT the content face. Sora - the theme's display family - is deliberately
// absent from the injected rules. The theme binds it itself:
// `emitCss()` appends `fontFaceBlocks()` (packages/tokens/src/emit.ts), and
// `defaultTheme().fonts.display.files` names the three files under
// `/assets/sora-*.woff2`. `packages/app/src/server.ts` serves exactly that
// pattern from `packages/renderer/assets/fonts`, locally, and the frame
// already loads the theme (`frameStyles` in public/app.js).
//
// Binding Sora here as well gave the frame two @font-face blocks per weight
// (six instead of three). The browser took the first one, and the headline
// rendered with a fallback face: 387 px wide in the canvas against 409 px in
// the release - the whole 3.1 % the parity gate reported on 02.10.2026.
// The theme is the only source that knows which font a project actually uses,
// so it stays the one that binds it; the editor only brings the tool's own
// face. `EDITOR_CONTENT_FONT_FILES` still lists the bytes (the preview and
// `plan-tokens.test.ts` check that they are on disk) - they simply are not
// injected into the frames.
//
// `font-display: swap` is required: it lets the text render with the fallback
// immediately and swaps in when the font is ready. Because the chrome uses
// fixed px sizes and line heights (`--ed-lh-*`), the swap does not move layout.

export type EditorFontFile = {
  /** Font family name as declared in the @font-face and the tokens. */
  readonly family: string;
  /** Weight of this file. */
  readonly weight: number;
  /** File name inside `packages/editor/assets/fonts/`. */
  readonly file: string;
};

// Inter (text) then Inter Display (headings). Four weights each, the ones the
// chrome actually uses: 400 text, 500 controls, 600 titles, 700 emphasis.
export const EDITOR_FONT_FILES: readonly EditorFontFile[] = [
  { family: "Inter", weight: 400, file: "Inter-Regular.woff2" },
  { family: "Inter", weight: 500, file: "Inter-Medium.woff2" },
  { family: "Inter", weight: 600, file: "Inter-SemiBold.woff2" },
  { family: "Inter", weight: 700, file: "Inter-Bold.woff2" },
  { family: "Inter Display", weight: 400, file: "InterDisplay-Regular.woff2" },
  { family: "Inter Display", weight: 500, file: "InterDisplay-Medium.woff2" },
  { family: "Inter Display", weight: 600, file: "InterDisplay-SemiBold.woff2" },
  { family: "Inter Display", weight: 700, file: "InterDisplay-Bold.woff2" },
];

// Sora, the content display face of the site theme. The three weights are the
// ones `defaultTheme().fonts.display.weights` names ([400, 600, 700]).
//
// These bytes ship with the editor so the standalone preview and the
// `keeps every bundled font file present on disk` check have them, but they
// are NOT injected into the frames - see the note at the top of this file.
// The theme binds Sora itself through `fontFaceBlocks()`, and that binding is
// the one that must win: only the theme knows which face a project uses.
export const EDITOR_CONTENT_FONT_FILES: readonly EditorFontFile[] = [
  { family: "Sora", weight: 400, file: "Sora-Regular.woff2" },
  { family: "Sora", weight: 600, file: "Sora-SemiBold.woff2" },
  { family: "Sora", weight: 700, file: "Sora-Bold.woff2" },
];

// JetBrains Mono, the monospace face of the dashboard (token prefixes, ids).
// Without a bound face `--ui-font-mono` falls back to the system monospace -
// Cascadia/Consolas on Windows, DejaVu Sans Mono on Linux - whose glyphs differ
// in width. A table column sizes itself to its widest cell, so the same page was
// 11px wider on Linux (measured on the Settings table, one code cell) and the
// PNG gate compared two operating systems instead of two builds.
//
// Like Sora, the bytes ship on disk and in the dashboard's fonts.css but are
// NOT injected into the frames.
export const EDITOR_MONO_FONT_FILES: readonly EditorFontFile[] = [
  { family: "JetBrains Mono", weight: 400, file: "JetBrainsMono-Regular.woff2" },
];

// Every font file the editor carries on disk: chrome faces, the content face
// and the mono face. Used to check that the bytes exist, not to generate
// @font-face rules.
export const EDITOR_BUNDLED_FONT_FILES: readonly EditorFontFile[] = [
  ...EDITOR_FONT_FILES,
  ...EDITOR_CONTENT_FONT_FILES,
  ...EDITOR_MONO_FONT_FILES,
];

function quoteFamily(family: string): string {
  return /[\s"']/.test(family) ? `"${family.replace(/"/g, "")}"` : family;
}

// The default base URL is the dashboard route that serves the files
// (`packages/app/src/server.ts` proxies `/editor-fonts/*` to this directory).
//
// Only `EDITOR_FONT_FILES` - the tool's own face. Injecting the content face
// here as well put two @font-face blocks per weight into the frame (six
// instead of three) and the browser preferred the theme's, so the canvas
// rendered its headline with a fallback: 387 px against 409 px in the
// release, the 3.1 % the parity gate reported on 02.10.2026.
export function editorFontFaceCss(baseUrl = "/editor-fonts"): string {
  const prefix = baseUrl.replace(/\/$/, "");
  return EDITOR_FONT_FILES.map(({ family, weight, file }) => {
    return [
      "@font-face {",
      `  font-family: ${quoteFamily(family)};`,
      "  font-style: normal;",
      `  font-weight: ${weight};`,
      "  font-display: swap;",
      `  src: url("${prefix}/${file}") format("woff2");`,
      "}",
    ].join("\n");
  }).join("\n");
}

export const EDITOR_FONT_FACE_CSS = editorFontFaceCss();
