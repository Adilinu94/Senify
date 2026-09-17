// Editor typography: the local font files and the @font-face rules that bind
// them. This module is the one source for every font the editor bundles; the
// files themselves live in `packages/editor/assets/fonts/` (SIL OFL 1.1, see
// `LICENSE.txt`) and are served under `/editor-fonts/*`, so the editor never
// fetches a font over the network at runtime.
//
// Two roles, one directory and one route:
//   * Tool / chrome face — Inter Display for headings, Inter for text
//     (`--ed-font-display`, `--ed-font-body` in `tokens.ts`; the binding design
//     language `.scratch/refs/precious-board/design-guidelines.md`).
//   * Content face — Sora, the theme's display family
//     (`packages/tokens/src/default-theme.ts`, `fonts.display`). The editor
//     draws page content inside its frames, so the file is bundled here too and
//     injected into every frame document; the theme only names the family.
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
// ones `defaultTheme().fonts.display.weights` names ([400, 600, 700]); without
// the files the theme emits no @font-face (`fontFaceBlocks()` skips a weight
// without a file) and content falls back to system-ui. Bundling them here makes
// the theme's family name resolve locally.
export const EDITOR_CONTENT_FONT_FILES: readonly EditorFontFile[] = [
  { family: "Sora", weight: 400, file: "Sora-Regular.woff2" },
  { family: "Sora", weight: 600, file: "Sora-SemiBold.woff2" },
  { family: "Sora", weight: 700, file: "Sora-Bold.woff2" },
];

// The single list the @font-face rules are generated from: chrome faces, then
// the content face.
export const EDITOR_BUNDLED_FONT_FILES: readonly EditorFontFile[] = [
  ...EDITOR_FONT_FILES,
  ...EDITOR_CONTENT_FONT_FILES,
];

function quoteFamily(family: string): string {
  return /[\s"']/.test(family) ? `"${family.replace(/"/g, "")}"` : family;
}

// The default base URL is the dashboard route that serves the files
// (`packages/app/src/server.ts` proxies `/editor-fonts/*` to this directory).
export function editorFontFaceCss(baseUrl = "/editor-fonts"): string {
  const prefix = baseUrl.replace(/\/$/, "");
  return EDITOR_BUNDLED_FONT_FILES.map(({ family, weight, file }) => {
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
