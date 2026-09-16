import { FRAME_BREAKPOINTS } from "./frames.ts";
import type { EditorMode, FrameBreakpoint } from "./types.ts";

// URL deep links (artifacts/24 §4): `?page=&node=&mode=&bp=` — selection, mode
// and breakpoint survive a reload and are shareable.

export type DeepLinkState = {
  page: string | null;
  node: string | null;
  mode: EditorMode;
  bp: FrameBreakpoint;
};

export const DEFAULT_DEEP_LINK: DeepLinkState = {
  page: null,
  node: null,
  mode: "design",
  bp: "desktop",
};

function queryOf(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") return "";
  const hashless = trimmed.startsWith("#") ? "" : trimmed;
  const question = hashless.indexOf("?");
  if (question >= 0) return hashless.slice(question + 1);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(hashless)) return "";
  return hashless.startsWith("?") ? hashless.slice(1) : hashless;
}

function readString(params: URLSearchParams, key: string): string | null {
  const value = params.get(key);
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function parseDeepLink(search: string): DeepLinkState {
  const params = new URLSearchParams(queryOf(search));
  const rawMode = params.get("mode");
  const rawBp = params.get("bp");
  const mode: EditorMode = rawMode === "live" ? "live" : "design";
  const bp: FrameBreakpoint = FRAME_BREAKPOINTS.includes(rawBp as FrameBreakpoint)
    ? (rawBp as FrameBreakpoint)
    : "desktop";
  return {
    page: readString(params, "page"),
    node: readString(params, "node"),
    mode,
    bp,
  };
}

export function serializeDeepLink(state: DeepLinkState): string {
  const params = new URLSearchParams();
  if (state.page) params.set("page", state.page);
  if (state.node) params.set("node", state.node);
  if (state.mode !== "design") params.set("mode", state.mode);
  if (state.bp !== "desktop") params.set("bp", state.bp);
  return params.toString();
}

export function deepLinksEqual(a: DeepLinkState, b: DeepLinkState): boolean {
  return (
    a.page === b.page && a.node === b.node && a.mode === b.mode && a.bp === b.bp
  );
}
