import type { DomDocument } from "./dom.ts";

// The workbench chrome: toolbar, rail, stage, panels, spotlight. The editor
// injects this once per document via `ensureEditorStyles`, so every host gets
// the same shell. Colors follow the platform tokens with safe fallbacks; the
// frame content stays untouched — each iframe owns its own document.

export const EDITOR_STYLES = `
.senify-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 24rem;
  overflow: hidden;
  background: var(--bg-muted, #f4f4f5);
  color: var(--fg-base, #18181b);
  font-family: var(--font-body, system-ui, sans-serif);
  font-size: 13px;
  line-height: 1.45;
  border: 1px solid var(--line, rgba(0, 0, 0, 0.12));
  border-radius: var(--radius-md, 0.5rem);
}
.senify-editor__toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding: 0.5rem 0.75rem;
  background: var(--bg-base, #ffffff);
  border-bottom: 1px solid var(--line, rgba(0, 0, 0, 0.12));
}
.senify-editor__group { display: flex; gap: 0.25rem; }
.senify-editor__button {
  padding: 0.25rem 0.6rem;
  border: 1px solid var(--line, rgba(0, 0, 0, 0.18));
  border-radius: 999px;
  background: var(--bg-base, #ffffff);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.senify-editor__button:hover { border-color: var(--accent, #4f46e5); }
.senify-editor__button[data-active="true"] {
  background: var(--accent, #4f46e5);
  border-color: var(--accent, #4f46e5);
  color: var(--accent-ink, #ffffff);
}
.senify-editor__button[data-enabled="false"] { opacity: 0.45; }
.senify-editor__title { margin-left: auto; color: var(--fg-muted, #52525b); }
.senify-editor__main {
  display: grid;
  grid-template-columns: minmax(11rem, 13rem) minmax(0, 1fr) minmax(13rem, 17rem);
  flex: 1;
  min-height: 0;
}
.senify-editor__rail {
  overflow: auto;
  background: var(--bg-base, #ffffff);
  border-right: 1px solid var(--line, rgba(0, 0, 0, 0.12));
}
.senify-editor__panels {
  overflow: auto;
  padding: 0.6rem;
  background: var(--bg-base, #ffffff);
  border-left: 1px solid var(--line, rgba(0, 0, 0, 0.12));
}
.senify-editor__stage {
  position: relative;
  overflow: auto;
  background-color: var(--bg-muted, #ececef);
  background-image: radial-gradient(var(--line, rgba(0, 0, 0, 0.14)) 1px, transparent 1px);
  background-size: 16px 16px;
}
.senify-editor__frame {
  margin: 1.25rem;
  background: #ffffff;
  border-radius: 6px;
  box-shadow: 0 14px 36px rgba(15, 15, 22, 0.22);
  overflow: hidden;
}
.senify-editor__iframe { display: block; background: #ffffff; }
.senify-editor__tabs {
  display: flex;
  gap: 0.15rem;
  padding: 0.4rem;
  position: sticky;
  top: 0;
  background: var(--bg-base, #ffffff);
  border-bottom: 1px solid var(--line, rgba(0, 0, 0, 0.12));
}
.senify-editor__tab {
  flex: 1;
  padding: 0.25rem 0;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: var(--fg-muted, #52525b);
  font: inherit;
  cursor: pointer;
}
.senify-editor__tab[data-active="true"] {
  background: var(--bg-muted, #f4f4f5);
  color: var(--fg-base, #18181b);
  font-weight: 600;
}
.senify-editor__list { padding: 0.3rem; }
.senify-editor__row {
  display: block;
  width: 100%;
  padding: 0.3rem 0.45rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.senify-editor__row:hover { background: var(--bg-muted, #f4f4f5); }
.senify-editor__row[data-active="true"] {
  background: color-mix(in srgb, var(--accent, #4f46e5) 14%, transparent);
}
.senify-editor__row[data-hidden="true"] { opacity: 0.5; }
.senify-editor__section {
  padding: 0.5rem 0.45rem 0.15rem;
  color: var(--fg-muted, #52525b);
  font-size: 0.78em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.senify-editor__search {
  width: calc(100% - 0.8rem);
  margin: 0.4rem;
  padding: 0.3rem 0.45rem;
  border: 1px solid var(--line, rgba(0, 0, 0, 0.18));
  border-radius: 0.25rem;
  background: var(--bg-base, #ffffff);
  color: inherit;
  font: inherit;
}
.senify-editor__panel { margin-bottom: 0.9rem; }
.senify-editor__panel-title { font-weight: 600; margin-bottom: 0.35rem; }
.senify-editor__field {
  display: grid;
  grid-template-columns: 5.5rem minmax(0, 1fr);
  gap: 0.35rem;
  align-items: center;
  margin-bottom: 0.4rem;
}
.senify-editor__label {
  color: var(--fg-muted, #52525b);
  overflow: hidden;
  text-overflow: ellipsis;
}
.senify-editor__control {
  min-width: 0;
  padding: 0.25rem 0.4rem;
  border: 1px solid var(--line, rgba(0, 0, 0, 0.18));
  border-radius: 0.25rem;
  background: var(--bg-base, #ffffff);
  color: inherit;
  font: inherit;
}
textarea.senify-editor__control { min-height: 3.4rem; resize: vertical; }
input[type="checkbox"].senify-editor__control { justify-self: start; }
.senify-editor__badge {
  grid-column: 2;
  justify-self: start;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: var(--accent, #4f46e5);
  color: var(--accent-ink, #ffffff);
  font-size: 0.75em;
}
.senify-editor__reset {
  grid-column: 2;
  justify-self: start;
  padding: 0.1rem 0.4rem;
  border: 1px solid var(--line, rgba(0, 0, 0, 0.18));
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.senify-editor__warning {
  grid-column: 2;
  color: var(--warning, #b45309);
  font-size: 0.85em;
}
.senify-editor__empty { padding: 0.5rem; color: var(--fg-muted, #52525b); }
.senify-editor__status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 1.9rem;
  padding: 0.25rem 0.75rem;
  background: var(--bg-base, #ffffff);
  border-top: 1px solid var(--line, rgba(0, 0, 0, 0.12));
  color: var(--danger, #dc2626);
}
.senify-editor__reload {
  padding: 0.1rem 0.5rem;
  border: 1px solid var(--line, rgba(0, 0, 0, 0.18));
  border-radius: 999px;
  background: var(--bg-base, #ffffff);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.senify-editor__spotlight {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding-top: 12vh;
  background: rgba(12, 12, 16, 0.45);
}
.senify-editor__spotlight[hidden] { display: none; }
.senify-editor__spotlight-input {
  width: min(34rem, 86vw);
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--line, rgba(0, 0, 0, 0.18));
  border-radius: 0.6rem;
  background: var(--bg-base, #ffffff);
  color: var(--fg-base, #18181b);
  font: inherit;
  font-size: 1rem;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.3);
}
.senify-editor__spotlight-list {
  width: min(34rem, 86vw);
  max-height: 50vh;
  overflow: auto;
  border-radius: 0.6rem;
  background: var(--bg-base, #ffffff);
  color: var(--fg-base, #18181b);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.3);
}
.senify-editor__spotlight-row {
  display: block;
  width: 100%;
  padding: 0.5rem 0.8rem;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.senify-editor__spotlight-row:hover { background: var(--bg-muted, #f4f4f5); }
`;

export function ensureEditorStyles(doc: DomDocument): void {
  if (doc.querySelector("style[data-senify-editor-styles]")) return;
  const style = doc.createElement("style");
  style.setAttribute("data-senify-editor-styles", "");
  style.textContent = EDITOR_STYLES;
  (doc.head ?? doc.body).appendChild(style);
}
