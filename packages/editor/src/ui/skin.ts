// Editor skin (Hautumstellung): the appearance of the editor chrome expressed
// in the token vocabulary of `tokens.ts`.
//
// One source. Every value below is a `var(--ed-*)` reference; there is no second
// hex, no second palette. `tokens.ts` stays the only place a colour or a measure
// is written down, exactly as Aufgabe 1 requires. The running (T17) chrome keeps
// its own class structure and its own legacy `--ed-accent`, `--ed-text`, … names;
// this sheet only re-paints the very same class names, so structure, operation
// and functions are untouched — the switch changes the look, nothing else.
//
// The switch. The rules are scoped to `.senify-editor[data-senify-editor]
// [data-editor-skin="tiefwasser"]`. The editor root sets `data-senify-editor`
// (the token marker, Aufgabe 1) and `data-editor-skin="tiefwasser"` by default,
// so the new skin is what you see. Setting `data-editor-skin="alt"` (or removing
// the attribute) turns the sheet off and the previous Elementor-like light chrome
// shows through unchanged — that is the "Umschaltung zwischen alter und neuer
// Ansicht" this sheet must leave intact.
//
// Two roots, one appearance source. The new canvas view (`?view=canvas`,
// `.senify-canvas`) carries the very same token marker and the same skin name,
// so `canvasSkinCss()` below paints it from these same `var(--ed-*)` values.
// There is no second palette: the canvas sheet holds no hex at all. The sheet
// itself (`.senify-canvas__frame` / `__iframe`, the white paper with the page
// content) stays neutral — it is a separate document that the skin never
// reaches, so nothing of the chrome bleeds into the content.

import { EDITOR_ROOT_ATTRIBUTE } from "./tokens.ts";

/** Attribute that selects the skin, on the editor root node. */
export const EDITOR_SKIN_ATTRIBUTE = "data-editor-skin";

/** Name of the new deep-water skin (the plan's appearance). */
export const EDITOR_SKIN_TIEFWASSER = "tiefwasser";

/** Name that switches back to the previous light chrome. */
export const EDITOR_SKIN_ALT = "alt";

/** The skin the editor mounts with. */
export const EDITOR_SKIN_DEFAULT = EDITOR_SKIN_TIEFWASSER;

export type EditorSkin = typeof EDITOR_SKIN_TIEFWASSER | typeof EDITOR_SKIN_ALT;

// The scope every skin rule lives under: token marker + new skin selected.
const SCOPE = `.senify-editor[${EDITOR_ROOT_ATTRIBUTE}][${EDITOR_SKIN_ATTRIBUTE}="${EDITOR_SKIN_TIEFWASSER}"]`;

function skinCss(): string {
  const blocks: string[] = [];
  const rule = (selector: string, body: string): void => {
    blocks.push(`${SCOPE}${selector} {\n${body}\n}`);
  };
  const group = (selector: string, body: string): void => {
    blocks.push(`${selector.split("|").map((part) => `${SCOPE}${part}`).join(",\n")} {\n${body}\n}`);
  };

  // ------------------------------------------------------------- Grundfläche
  rule(
    "",
    [
      "border: 1px solid var(--ed-line-hairline);",
      "border-radius: var(--ed-radius-0);",
      "background: var(--ed-surface-canvas);",
      "color: var(--ed-ink-base);",
      "color-scheme: dark;",
      "font-family: var(--ed-font-body);",
      "font-size: var(--ed-text-13);",
      "line-height: var(--ed-lh-13);",
      "box-shadow: var(--ed-edge-top);",
    ].join("\n"),
  );

  // ------------------------------------------------------------- Kopfleiste
  rule(
    " .senify-editor__topbar",
    [
      "min-height: var(--ed-h-topbar);",
      "padding: 0 var(--ed-space-3);",
      "gap: var(--ed-space-2);",
      "background: var(--ed-surface-raised);",
      "border-bottom: 1px solid var(--ed-line-hairline);",
      "box-shadow: var(--ed-edge-top);",
    ].join("\n"),
  );
  rule(
    " .senify-editor__brand",
    [
      "min-height: var(--ed-h-btn-sm);",
      "gap: var(--ed-space-2);",
      "border-radius: var(--ed-radius-sm);",
      "color: var(--ed-ink-strong);",
      // Aufgabe 4 / ui-plan.md Abschnitt 1: die Wortmarke traegt die Titel-
      // Schrift (Inter Display), Gewicht 600, Laufweite --ed-track-display.
      "font-family: var(--ed-font-display);",
      "font-size: var(--ed-text-13);",
      "font-weight: var(--ed-weight-semibold);",
      "letter-spacing: var(--ed-track-display);",
    ].join("\n"),
  );
  rule(
    " .senify-editor__brand:hover",
    "background: var(--ed-fill-hover);\ncolor: var(--ed-ink-strong);",
  );
  rule(
    " .senify-editor__brand-mark",
    [
      "width: 20px;",
      "height: 20px;",
      "border-radius: var(--ed-radius-sm);",
      "background: var(--ed-signal-accent);",
      "color: var(--ed-ink-on-lime);",
      "font-size: var(--ed-text-11);",
      "font-weight: var(--ed-weight-semibold);",
    ].join("\n"),
  );
  group(
    " .senify-editor__button| .senify-editor__iconbtn",
    [
      "min-height: var(--ed-h-btn-sm);",
      "min-width: var(--ed-h-iconbtn);",
      "padding: 0 var(--ed-space-2);",
      "border-radius: var(--ed-radius-sm);",
      "color: var(--ed-ink-base);",
      "transition: background-color var(--ed-t-1) var(--ed-ease-standard), color var(--ed-t-1) var(--ed-ease-standard);",
    ].join("\n"),
  );
  group(
    " .senify-editor__button:hover| .senify-editor__iconbtn:hover",
    "background: var(--ed-fill-hover);\ncolor: var(--ed-ink-strong);",
  );
  group(
    " .senify-editor__button[data-active=\"true\"]| .senify-editor__tab[data-active=\"true\"]| .senify-editor__row[data-active=\"true\"]",
    [
      "background: var(--ed-fill-select);",
      "color: var(--ed-ink-strong);",
      "box-shadow: inset 2px 0 0 var(--ed-signal-select);",
    ].join("\n"),
  );
  group(
    " .senify-editor__button[data-enabled=\"false\"]| .senify-editor__menu-item[data-enabled=\"false\"]",
    "opacity: 0.38;\ncolor: var(--ed-ink-faint);",
  );
  rule(
    " .senify-editor__button--primary",
    [
      "min-height: var(--ed-h-btn-md);",
      "padding: 0 var(--ed-space-4);",
      "border-radius: var(--ed-radius-full);",
      "background: var(--ed-signal-accent);",
      "color: var(--ed-ink-on-lime);",
      "font-weight: var(--ed-weight-medium);",
    ].join("\n"),
  );
  rule(
    " .senify-editor__button--primary:hover",
    "background: var(--ed-fill-accent-hover);\ncolor: var(--ed-ink-on-lime);",
  );
  rule(
    " .senify-editor__devices",
    [
      "gap: 1px;",
      "margin: 0 var(--ed-space-1);",
      "padding: 2px;",
      "border: 0;",
      "border-radius: var(--ed-radius-full);",
      "background: var(--ed-surface-inset);",
    ].join("\n"),
  );
  rule(
    " .senify-editor__devices .senify-editor__button",
    "min-height: 24px;\nborder-radius: var(--ed-radius-full);",
  );
  rule(
    " .senify-editor__devices .senify-editor__button[data-active=\"true\"]",
    "background: var(--ed-surface-raised);\ncolor: var(--ed-ink-strong);\nbox-shadow: var(--ed-edge-hairline);",
  );
  rule(" .senify-editor__sep", "width: 1px;\nheight: 24px;\nmargin: 0 var(--ed-space-1);\nbackground: var(--ed-line-hairline);");
  rule(
    " .senify-editor__title",
    [
      "border-radius: var(--ed-radius-sm);",
      "padding: 0 var(--ed-space-2);",
      "color: var(--ed-ink-base);",
    ].join("\n"),
  );
  rule(" .senify-editor__title:hover", "background: var(--ed-fill-hover);");
  rule(
    " .senify-editor__title strong",
    [
      "color: var(--ed-ink-strong);",
      "font-family: var(--ed-font-display);",
      "font-weight: var(--ed-weight-medium);",
    ].join("\n"),
  );
  rule(" .senify-editor__title small", "color: var(--ed-ink-muted);");
  group(
    " .senify-editor__publish| .senify-editor__publish-caret",
    [
      "min-height: var(--ed-h-btn-md);",
      "background: var(--ed-signal-accent);",
      "color: var(--ed-ink-on-lime);",
      "font-weight: var(--ed-weight-medium);",
    ].join("\n"),
  );
  rule(
    " .senify-editor__publish",
    "padding: 0 var(--ed-space-4);\nborder-radius: var(--ed-radius-full) 0 0 var(--ed-radius-full);",
  );
  rule(
    " .senify-editor__publish-caret",
    [
      "min-width: var(--ed-h-btn-md);",
      "border-left: 1px solid color-mix(in srgb, var(--ed-ink-on-lime) 30%, transparent);",
      "border-radius: 0 var(--ed-radius-full) var(--ed-radius-full) 0;",
    ].join("\n"),
  );
  group(
    " .senify-editor__publish:hover| .senify-editor__publish-caret:hover",
    "background: var(--ed-fill-accent-hover);",
  );
  // Alt-Haut-Reste, die sonst unter dem Standard-Skin Magenta zeigen: Auge,
  // Ablage-Kante, Widget-Signet und Status-Badge folgen dem Canvas-Satz.
  rule(" .senify-editor__eye:hover", "color: var(--ed-ink-strong);");
  rule(
    ' .senify-editor__row[data-drop="before"]',
    "box-shadow: inset 0 2px 0 var(--ed-snap-line), inset 0 3px 0 rgb(1 20 32 / 0.35);",
  );
  rule(
    ' .senify-editor__row[data-drop="after"]',
    "box-shadow: inset 0 -2px 0 var(--ed-snap-line), inset 0 -3px 0 rgb(1 20 32 / 0.35);",
  );
  rule(
    " .senify-editor__widget-icon",
    "background: var(--ed-signal-accent);\ncolor: var(--ed-ink-on-lime);",
  );
  rule(
    " .senify-editor__badge",
    "background: var(--ed-fill-select);\ncolor: var(--ed-ink-strong);",
  );

  // ----------------------------------------------------------------- Menüs
  group(
    " .senify-editor__menu| .senify-editor__context",
    [
      "background: var(--ed-surface-raised);",
      "border: 1px solid var(--ed-line-hairline);",
      "border-radius: var(--ed-radius-md);",
      "box-shadow: var(--ed-shadow-float), var(--ed-edge-top);",
      "padding: var(--ed-space-1);",
    ].join("\n"),
  );
  group(
    " .senify-editor__menu-item| .senify-editor__context-item",
    [
      "min-height: var(--ed-h-row-menu);",
      "padding: 0 var(--ed-space-2);",
      "gap: var(--ed-space-2);",
      "border-radius: var(--ed-radius-sm);",
      "color: var(--ed-ink-base);",
      "font-size: var(--ed-text-13);",
    ].join("\n"),
  );
  group(
    " .senify-editor__menu-item:hover| .senify-editor__context-item:hover",
    "background: var(--ed-fill-hover);\ncolor: var(--ed-ink-strong);",
  );
  rule(" .senify-editor__menu-sep", "height: 1px;\nmargin: var(--ed-space-1) var(--ed-space-2);\nbackground: var(--ed-line-hairline);");
  rule(
    " .senify-editor__menu-label",
    "padding: var(--ed-space-1) var(--ed-space-2) 2px;\ncolor: var(--ed-ink-muted);\nletter-spacing: var(--ed-track-micro);\ntext-transform: uppercase;",
  );
  rule(" .senify-editor__history-time", "color: var(--ed-ink-muted);\nfont-family: var(--ed-font-mono);\nfont-size: var(--ed-text-11);");
  rule(
    " .senify-editor__context-item[data-danger=\"true\"]:hover",
    "background: var(--ed-fill-danger);\ncolor: var(--ed-signal-danger-ink);",
  );

  // ------------------------------------------------------------- Panels/Rail
  rule(
    " .senify-editor__main",
    [
      // Die Trennkanten sitzen absolut im Raster; ihr Bezug ist `main`.
      "position: relative;",
      // Aufgabe 29: das Inspektor-Panel links (--ed-w-inspector), die
      // Ebenenliste (Explorer) daneben (--ed-w-explorer); beide sind ziehbar.
      "grid-template-columns: var(--ed-w-inspector) var(--ed-w-explorer) minmax(0, 1fr);",
    ].join("\n"),
  );
  rule(
    " .senify-editor__main--norail",
    "grid-template-columns: var(--ed-w-inspector) 0 minmax(0, 1fr);",
  );
  // Aufgabe 29: die Trennkanten. Sie folgen dem Zeiger und verstellen die
  // Spaltenbreite; Doppelklick setzt den Standard, die Pfeiltasten verstellen
  // ohne Zeiger. Kein zweiter Wert: die Grenzen und der Standard kommen aus
  // `tokens.ts` (--ed-w-inspector = 320px, --ed-w-explorer = 264px).
  rule(
    " .senify-editor__split",
    [
      "display: block;",
      "position: absolute;",
      "top: 0;",
      "bottom: 0;",
      "z-index: 4;",
      "width: 9px;",
      "background: transparent;",
      "cursor: ew-resize;",
      "touch-action: none;",
    ].join("\n"),
  );
  rule(
    " .senify-editor__main--norail .senify-editor__split[data-panel=\"explorer\"]",
    "display: none;",
  );
  rule(
    " .senify-editor__split[data-panel=\"inspector\"]",
    "left: calc(var(--ed-w-inspector) - 4px);",
  );
  rule(
    " .senify-editor__split[data-panel=\"explorer\"]",
    "left: calc(var(--ed-w-inspector) + var(--ed-w-explorer) - 4px);",
  );
  rule(
    " .senify-editor__split::after",
    [
      "content: \"\";",
      "position: absolute;",
      "top: 0;",
      "bottom: 0;",
      "left: 4px;",
      "width: 1px;",
      "background: var(--ed-line-hairline);",
    ].join("\n"),
  );
  group(
    " .senify-editor__split:hover::after| .senify-editor__split[data-aktiv=\"true\"]::after",
    "background: var(--ed-signal-select);",
  );
  rule(
    " .senify-editor__split:focus-visible",
    "outline: 2px solid var(--ed-focus);\noutline-offset: -1px;",
  );
  rule(
    " .senify-editor__panels",
    "background: var(--ed-surface-panel);\nborder-right: 1px solid var(--ed-line-hairline);",
  );
  rule(
    " .senify-editor__rail",
    "background: var(--ed-surface-panel);\nborder-right: 1px solid var(--ed-line-hairline);",
  );
  rule(
    " .senify-editor__panel-header",
    [
      "min-height: var(--ed-h-panelhead);",
      "gap: var(--ed-space-2);",
      "padding: 0 var(--ed-space-2);",
      "background: var(--ed-surface-panel);",
      "border-bottom: 1px solid var(--ed-line-hairline);",
    ].join("\n"),
  );
  rule(
    " .senify-editor__panel-heading",
    [
      "color: var(--ed-ink-strong);",
      // Panel-Titel tragen die Titel-Schrift (Aufgabe 4: "--ed-font-display").
      "font-family: var(--ed-font-display);",
      "font-size: var(--ed-text-12);",
      "font-weight: var(--ed-weight-semibold);",
    ].join("\n"),
  );
  rule(
    " .senify-editor__ptabs",
    "border-bottom: 1px solid var(--ed-line-hairline);\nbackground: var(--ed-surface-panel);",
  );
  rule(
    " .senify-editor__ptab",
    [
      "min-height: var(--ed-h-tabrow);",
      "padding: 0;",
      "border-bottom: 2px solid transparent;",
      "color: var(--ed-ink-muted);",
      "font-size: var(--ed-text-12);",
      "transition: color var(--ed-t-1) var(--ed-ease-standard);",
    ].join("\n"),
  );
  rule(" .senify-editor__ptab:hover", "color: var(--ed-ink-strong);");
  rule(
    " .senify-editor__ptab[data-active=\"true\"]",
    "color: var(--ed-ink-strong);\nborder-bottom-color: var(--ed-signal-accent);\nfont-weight: var(--ed-weight-medium);",
  );
  rule(
    " .senify-editor__tabs",
    "gap: 0;\npadding: var(--ed-space-1);\nbackground: var(--ed-surface-panel);\nborder-bottom: 1px solid var(--ed-line-hairline);",
  );
  rule(
    " .senify-editor__tab",
    "min-height: var(--ed-h-tabrow);\nborder-radius: var(--ed-radius-0);\ncolor: var(--ed-ink-muted);\nfont-size: var(--ed-text-12);",
  );
  rule(" .senify-editor__tab:hover", "background: var(--ed-fill-hover);\ncolor: var(--ed-ink-base);");
  rule(" .senify-editor__tab[data-active=\"true\"]", "box-shadow: inset 0 -2px 0 var(--ed-signal-accent);");
  rule(" .senify-editor__list", "padding: var(--ed-space-1);");
  rule(
    " .senify-editor__row",
    [
      "min-height: var(--ed-h-row);",
      "padding: 0 var(--ed-space-2);",
      "gap: var(--ed-space-1);",
      "border-radius: var(--ed-radius-0);",
      "color: var(--ed-ink-base);",
      "font-size: var(--ed-text-12);",
    ].join("\n"),
  );
  rule(" .senify-editor__row:hover", "background: var(--ed-fill-hover);color: var(--ed-ink-strong);");
  rule(" .senify-editor__row-label", "color: var(--ed-ink-base);");
  rule(" .senify-editor__eye", "color: var(--ed-ink-faint);\nopacity: 1;");
  rule(" .senify-editor__eye:hover", "color: var(--ed-line-strong);");
  rule(" .senify-editor__row[data-hidden=\"true\"]", "opacity: 0.5;");
  rule(
    " .senify-editor__section",
    "padding: var(--ed-space-2) var(--ed-space-2) var(--ed-space-1);\ncolor: var(--ed-ink-muted);\nfont-size: var(--ed-text-11);\nletter-spacing: var(--ed-track-micro);",
  );
  group(
    " .senify-editor__search| .senify-editor__control",
    [
      "min-height: var(--ed-h-field);",
      "padding: 0 var(--ed-space-2);",
      "border: 0;",
      "border-radius: var(--ed-radius-0);",
      "background: var(--ed-surface-inset);",
      "box-shadow: inset 0 0 0 1px var(--ed-line-control);",
      "color: var(--ed-ink-strong);",
      "font-size: var(--ed-text-12);",
    ].join("\n"),
  );
  group(
    " .senify-editor__search:focus| .senify-editor__control:focus",
    "outline: none;\nbox-shadow: inset 0 0 0 1px var(--ed-line-control), 0 0 0 2px var(--ed-focus);",
  );
  rule(" .senify-editor__search", "width: calc(100% - var(--ed-space-2));\nmargin: var(--ed-space-1);");

  // ------------------------------------------------------------- Katalog
  rule(" .senify-editor__widget-category", "color: var(--ed-ink-muted);\nfont-size: var(--ed-text-11);\nletter-spacing: var(--ed-track-micro);");
  rule(
    " .senify-editor__widget-card",
    [
      "border: 1px solid var(--ed-line-hairline);",
      "border-radius: var(--ed-radius-0);",
      "background: var(--ed-surface-raised);",
      "color: var(--ed-ink-base);",
      "transition: background-color var(--ed-t-1) var(--ed-ease-standard), box-shadow var(--ed-t-1) var(--ed-ease-standard);",
    ].join("\n"),
  );
  rule(
    " .senify-editor__widget-card:hover",
    "background: var(--ed-fill-hover);\nbox-shadow: var(--ed-edge-hairline);",
  );
  rule(
    " .senify-editor__widget-icon",
    [
      "display: grid;",
      "place-items: center;",
      "width: 28px;",
      "height: 28px;",
      "border-radius: var(--ed-radius-sm);",
      "background: var(--ed-surface-inset);",
      "opacity: 1;",
    ].join("\n"),
  );
  rule(
    " .senify-editor__hint",
    "border-radius: var(--ed-radius-sm);\nbackground: var(--ed-fill-select);\ncolor: var(--ed-ink-strong);",
  );

  // ------------------------------------------------------------- Einstellungen
  rule(" .senify-editor__panel", "border-bottom: 1px solid var(--ed-line-hairline);");
  rule(" .senify-editor__panel-title", "color: var(--ed-ink-strong);\nfont-weight: var(--ed-weight-medium);");
  rule(" .senify-editor__panel-title:hover", "color: var(--ed-ink-strong);");
  rule(" .senify-editor__label", "color: var(--ed-ink-muted);\nfont-size: var(--ed-text-12);");
  rule(" .senify-editor__empty", "color: var(--ed-ink-muted);");
  rule(" .senify-editor__warning", "color: var(--ed-signal-warning);");
  rule(
    " .senify-editor__badge",
    "border-radius: var(--ed-radius-sm);\nbackground: var(--ed-fill-select);\ncolor: var(--ed-ink-strong);",
  );
  rule(
    " .senify-editor__reset",
    "border: 1px solid var(--ed-line-control);\nborder-radius: var(--ed-radius-sm);\nbackground: transparent;\ncolor: var(--ed-ink-base);",
  );
  rule(" .senify-editor__reset:hover", "border-color: var(--ed-line-strong);\ncolor: var(--ed-ink-strong);");
  rule(
    " .senify-editor__device-dot",
    "width: 8px;\nheight: 8px;\nborder: 1px solid var(--ed-line-control);\nborder-radius: var(--ed-radius-full);\nbackground: var(--ed-surface-inset);",
  );
  group(
    " .senify-editor__device-dot[data-dot=\"tablet\"]| .senify-editor__device-dot[data-dot=\"mobile\"]",
    "border-color: var(--ed-signal-select);\nbackground: color-mix(in srgb, var(--ed-signal-select) 40%, transparent);",
  );

  // ------------------------------------------------------------- Bühne/Rahmen
  rule(" .senify-editor__stage", "background: var(--ed-surface-canvas);");
  rule(
    " .senify-editor__frame",
    "background: #ffffff;\nborder-radius: var(--ed-radius-sm);\nbox-shadow: var(--ed-shadow-float), var(--ed-edge-hairline);",
  );
  rule(
    " .senify-editor__handle",
    "border-radius: var(--ed-radius-sm);\nbackground: var(--ed-signal-accent);\nbox-shadow: var(--ed-shadow-float);",
  );
  rule(
    " .senify-editor__handle-btn",
    "border-radius: var(--ed-radius-sm);\ncolor: var(--ed-ink-on-lime);",
  );
  rule(" .senify-editor__handle-btn:hover", "background: color-mix(in srgb, var(--ed-ink-on-lime) 18%, transparent);");
  rule(
    " .senify-editor__insert",
    "border-radius: var(--ed-radius-full);\nbackground: var(--ed-signal-accent);\ncolor: var(--ed-ink-on-lime);\nbox-shadow: var(--ed-shadow-float);",
  );
  rule(" .senify-editor__insert:hover", "background: var(--ed-fill-accent-hover);");
  rule(
    " .senify-editor__inline-bar",
    "border: 1px solid var(--ed-line-hairline);\nborder-radius: var(--ed-radius-sm);\nbackground: var(--ed-surface-raised);\ncolor: var(--ed-ink-strong);\nbox-shadow: var(--ed-shadow-float);",
  );
  rule(" .senify-editor__inline-bar button", "border-radius: var(--ed-radius-sm);\ncolor: var(--ed-ink-strong);");
  rule(" .senify-editor__inline-bar button:hover", "background: var(--ed-fill-hover);");

  // ------------------------------------------------------------- Statusleiste
  rule(
    " .senify-editor__status",
    [
      "min-height: var(--ed-h-statusbar);",
      "gap: var(--ed-space-2);",
      "padding: 0 var(--ed-space-3);",
      "background: var(--ed-surface-panel);",
      "border-top: 1px solid var(--ed-line-hairline);",
    ].join("\n"),
  );
  rule(
    " .senify-editor__status-message",
    "color: var(--ed-ink-muted);\nfont-size: var(--ed-text-11);",
  );
  rule(
    " .senify-editor__status[data-tone=\"error\"] .senify-editor__status-message",
    "color: var(--ed-signal-danger-ink);",
  );
  rule(
    " .senify-editor__zoom",
    "border: 0;\nborder-radius: var(--ed-radius-sm);\nbackground: var(--ed-surface-inset);",
  );
  rule(
    " .senify-editor__reload",
    "border-radius: var(--ed-radius-full);\nborder: 1px solid var(--ed-line-control);\nbackground: transparent;\ncolor: var(--ed-ink-base);",
  );
  rule(" .senify-editor__reload:hover", "border-color: var(--ed-line-strong);\ncolor: var(--ed-ink-strong);");

  // ------------------------------------------------------------- Spotlight
  rule(
    " .senify-editor__spotlight",
    "background: var(--ed-scrim);\nbackdrop-filter: blur(var(--ed-blur-scrim));",
  );
  rule(
    " .senify-editor__spotlight-input",
    [
      "min-height: var(--ed-h-btn-lg);",
      "border: 1px solid var(--ed-line-hairline);",
      "border-radius: var(--ed-radius-md);",
      "background: var(--ed-surface-raised);",
      "color: var(--ed-ink-strong);",
      "font-size: var(--ed-text-17);",
      "box-shadow: var(--ed-shadow-dialog);",
    ].join("\n"),
  );
  rule(
    " .senify-editor__spotlight-list",
    "border-radius: var(--ed-radius-md);\nbackground: var(--ed-surface-raised);\ncolor: var(--ed-ink-base);\nbox-shadow: var(--ed-shadow-dialog);",
  );
  rule(
    " .senify-editor__spotlight-row",
    "min-height: var(--ed-h-tabrow);\npadding: 0 var(--ed-space-3);\ncolor: var(--ed-ink-base);\nfont-size: var(--ed-text-13);",
  );
  rule(" .senify-editor__spotlight-row:hover", "background: var(--ed-fill-select);\ncolor: var(--ed-ink-strong);");

  return `${blocks.join("\n")}\n`;
}

export const EDITOR_SKIN_STYLES = skinCss();

// The scope of the canvas skin: the canvas root carries the same token marker
// and the same skin name, so the very same `--ed-*` vocabulary paints it.
const CANVAS_SCOPE = `.senify-canvas[${EDITOR_ROOT_ATTRIBUTE}][${EDITOR_SKIN_ATTRIBUTE}="${EDITOR_SKIN_TIEFWASSER}"]`;

// The canvas view's chrome, expressed in the tokens of `tokens.ts` alone (no
// hex, no second palette). The sheet with the page content is untouched: the
// frame keeps its neutral white in the structural sheet, and the content lives
// in its own document where this scope never matches — the skin does not bleed
// into the content area.
function canvasSkinCss(): string {
  const blocks: string[] = [];
  const rule = (selector: string, body: string): void => {
    blocks.push(`${CANVAS_SCOPE}${selector} {\n${body}\n}`);
  };
  // --------------------------------------------------------------- Grundfläche
  rule(
    "",
    [
      "border: 1px solid var(--ed-line-hairline);",
      "border-radius: var(--ed-radius-0);",
      "background: var(--ed-surface-canvas);",
      "color: var(--ed-ink-base);",
      "color-scheme: dark;",
      "font-family: var(--ed-font-body);",
      "font-size: var(--ed-text-13);",
      "line-height: var(--ed-lh-13);",
      "box-shadow: var(--ed-edge-top);",
    ].join("\n"),
  );

  // --------------------------------------------------------------- Kopfleiste
  rule(
    " .senify-canvas__topbar",
    [
      "min-height: var(--ed-h-topbar);",
      "padding: 0 var(--ed-space-3);",
      "gap: var(--ed-space-2);",
      "background: var(--ed-surface-raised);",
      "border-bottom: 1px solid var(--ed-line-hairline);",
      "box-shadow: var(--ed-edge-top);",
    ].join("\n"),
  );
  rule(
    " .senify-canvas__group",
    [
      "gap: 1px;",
      "padding: 2px;",
      "border: 0;",
      "border-radius: var(--ed-radius-full);",
      "background: var(--ed-surface-inset);",
    ].join("\n"),
  );
  rule(
    " .senify-canvas__button",
    [
      "min-height: var(--ed-h-btn-sm);",
      "min-width: var(--ed-h-iconbtn);",
      "padding: 0 var(--ed-space-2);",
      "border-radius: var(--ed-radius-sm);",
      "color: var(--ed-ink-base);",
      "transition: background-color var(--ed-t-1) var(--ed-ease-standard), color var(--ed-t-1) var(--ed-ease-standard);",
    ].join("\n"),
  );
  rule(
    " .senify-canvas__button:hover",
    "background: var(--ed-fill-hover);\ncolor: var(--ed-ink-strong);",
  );
  rule(
    " .senify-canvas__button[data-active=\"true\"]",
    [
      "background: var(--ed-surface-raised);",
      "color: var(--ed-ink-strong);",
      "box-shadow: var(--ed-edge-hairline);",
    ].join("\n"),
  );
  rule(
    " .senify-canvas__select",
    [
      "min-height: var(--ed-h-field);",
      "padding: 0 var(--ed-space-2);",
      "border: 0;",
      "border-radius: var(--ed-radius-0);",
      "background: var(--ed-surface-inset);",
      "box-shadow: inset 0 0 0 1px var(--ed-line-control);",
      "color: var(--ed-ink-strong);",
      "font-size: var(--ed-text-12);",
    ].join("\n"),
  );
  rule(
    " .senify-canvas__zoom-label",
    "color: var(--ed-ink-base);\nfont-family: var(--ed-font-mono);\nfont-size: var(--ed-text-12);\nfont-variant-numeric: tabular-nums;",
  );
  rule(
    " .senify-canvas__status",
    [
      "display: flex;",
      "align-items: center;",
      "min-height: var(--ed-h-statusbar);",
      "color: var(--ed-ink-muted);",
      "font-size: var(--ed-text-11);",
    ].join("\n"),
  );
  // Der Fuss (Ticket 03 Punkt 6) traegt Meldung und Zoom.
  rule(
    " .senify-canvas__footer",
    [
      "min-height: var(--ed-h-statusbar);",
      "padding: 0 var(--ed-space-3);",
      "gap: var(--ed-space-2);",
      "background: var(--ed-surface-raised);",
      "border-top: 1px solid var(--ed-line-hairline);",
      "color: var(--ed-ink-muted);",
      "font-size: var(--ed-text-11);",
    ].join("\n"),
  );
  rule(
    " .senify-canvas__button:disabled",
    "color: var(--ed-ink-faint);\nbackground: transparent;\nbox-shadow: none;",
  );
  rule(
    " .senify-canvas__zoom-label:disabled",
    "color: var(--ed-ink-faint);\nbackground: transparent;\nbox-shadow: none;",
  );
  // Das Frame-Label: dezent ueber dem Blatt, im aktiven Blatt staerker.
  rule(
    " .senify-canvas__frame-label",
    [
      "background: var(--ed-surface-inset);",
      "color: var(--ed-ink-muted);",
      "box-shadow: inset 0 0 0 1px var(--ed-line-hairline);",
    ].join("\n"),
  );
  rule(
    ' .senify-canvas__frame[data-active="true"] .senify-canvas__frame-label',
    "color: var(--ed-ink-strong);",
  );

  // ------------------------------------------------------------------- Bühne
  // Nur der Grund um die Blätter traegt die Haut; das Blatt selbst
  // (`.senify-canvas__frame`, `.senify-canvas__iframe`) bleibt neutral weiss
  // (siehe `CANVAS_STYLES`). Hier wird kein Inhalt eingefaerbt.
  rule(" .senify-canvas__stage", "background: var(--ed-surface-canvas);");
  rule(
    " .senify-canvas__frame",
    "border-radius: var(--ed-radius-sm);\nbox-shadow: var(--ed-shadow-float), var(--ed-edge-hairline);",
  );

  // ------------------------------------------------------ Marker-Portal (16)
  // Die Doppelkante: aussen die feste Tiefwasser-Kante, innen
  // `--ed-signal-select` — eine der beiden Linien erreicht auf hellem und
  // dunklem Inhalt 3:1 (`ui-design.md` §8). Das Plaetzchen traegt den Namen,
  // das Groessenpaar sitzt am rechten oberen Eck.
  rule(
    " .senify-canvas__hover-ring",
    "box-shadow: 0 0 0 1px var(--ed-selection-edge), inset 0 0 0 1px var(--ed-signal-select);",
  );
  rule(
    " .senify-canvas__select-ring",
    "box-shadow: 0 0 0 1px var(--ed-selection-edge), inset 0 0 0 2px var(--ed-signal-select);",
  );
  rule(
    " .senify-canvas__select-label",
    "background: var(--ed-signal-select);\ncolor: var(--ed-ink-on-lime);\nfont-weight: var(--ed-weight-medium);",
  );
  rule(
    " .senify-canvas__select-size",
    "background: var(--ed-surface-raised);\ncolor: var(--ed-ink-strong);\nbox-shadow: inset 0 0 0 1px var(--ed-line-hairline);",
  );
  rule(
    " .senify-canvas__handle-dot",
    "background: var(--ed-ink-strong);\nbox-shadow: inset 0 0 0 1px var(--ed-signal-select);",
  );

  return `${blocks.join("\n")}\n`;
}

export const EDITOR_CANVAS_SKIN_STYLES = canvasSkinCss();

/** True when `value` names one of the two known skins. */
export function isEditorSkin(value: string | null): value is EditorSkin {
  return value === EDITOR_SKIN_TIEFWASSER || value === EDITOR_SKIN_ALT;
}

// Small structural type so the function works with the editor's own DOM slice
// and with a plain browser element alike (the project ships no DOM lib).
type SkinRoot = {
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
};

/**
 * The Umschaltung: put the root on the given skin. `tiefwasser` shows the new
 * chrome, `alt` turns the skin sheet off and the previous light chrome returns.
 * The token marker (`data-senify-editor`) is left untouched.
 */
export function applyEditorSkin(root: SkinRoot, skin: EditorSkin): void {
  root.setAttribute(EDITOR_SKIN_ATTRIBUTE, skin);
}
