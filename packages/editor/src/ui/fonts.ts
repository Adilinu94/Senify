// Editor chrome typography: the local font files and the @font-face rules that
// bind them.
//
// The binding design language (`.scratch/refs/precious-board/design.md` and
// `design-guidelines.md`) names "Inter Display" for headings and "Inter" for
// text. The editor chrome uses exactly these two families (`--ed-font-display`,
// `--ed-font-body` in `tokens.ts`). Both files are bundled under
// `packages/editor/assets/fonts/` (SIL OFL 1.1, see `LICENSE.txt`), so the
// editor never fetches a font over the network at runtime.
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

function quoteFamily(family: string): string {
  return /[\s"']/.test(family) ? `"${family.replace(/"/g, "")}"` : family;
}

// The default base URL is the dashboard route that serves the files
// (`packages/app/src/server.ts` proxies `/editor-fonts/*` to this directory).
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
