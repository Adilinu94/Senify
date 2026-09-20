// The shared chrome base (E16 P0): one block for every editor root.
//
// The marker `data-senify-editor` sits on the canvas, the inspector, the
// explorer, the spotlight and the legacy editor, so this sheet reaches all of
// them without a second selector list per module. It carries what the UI audit
// found missing and what the design plan asks for globally:
//
// - `color-scheme: dark` for the new (dark) surfaces — the legacy alt skin
//   keeps the light default and is left out on purpose,
// - `::selection`, thin scrollbars and antialiasing from the token colours,
// - press feedback (`:active` scales) and the disabled state (38 %),
// - `prefers-reduced-motion`: no transition or animation above 0.001 ms.
//
// Focus rings stay with the components: they know whether the ring belongs on
// the control or on its wrapper (`.ed-field:focus-within`), and a global rule
// would double it.

import { EDITOR_ROOT_ATTRIBUTE } from "./tokens.ts";

export function editorBaseCss(selector = `[${EDITOR_ROOT_ATTRIBUTE}]`): string {
  return [
    // The new chrome is dark; the legacy alt skin stays light on purpose.
    ".senify-canvas, .senify-inspector, .senify-explorer, .senify-spotlight { color-scheme: dark; }",
    `${selector} { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }`,
    `${selector} ::selection { background: var(--ed-signal-accent); color: var(--ed-ink-on-lime); }`,
    `${selector} * { scrollbar-width: thin; scrollbar-color: var(--ed-line-control) transparent; }`,
    `${selector} ::-webkit-scrollbar { width: 10px; height: 10px; }`,
    `${selector} ::-webkit-scrollbar-thumb { background: var(--ed-line-control); border-radius: var(--ed-radius-full); }`,
    `${selector} ::-webkit-scrollbar-track { background: transparent; }`,
    `${selector} button:active { transform: scale(0.97); }`,
    `${selector} button:disabled, ${selector} button[aria-disabled="true"] { opacity: 0.38; cursor: default; }`,
    `@media (prefers-reduced-motion: reduce) {
  ${selector} *, ${selector} *::before, ${selector} *::after {
    transition-duration: 0.001ms !important;
    animation-duration: 0.001ms !important;
  }
}`,
  ].join("\n");
}

export const EDITOR_BASE_STYLES = editorBaseCss();
