import type { ReactNode } from "react";
import type { Node, PropValue } from "@senify/section-sdk";
import { partVarsFor, sectionVarsFor } from "../style.ts";

export { styleValue } from "../style.ts";

export type SectionContext = {
  pagePaths: Record<string, string>;
  assets: Record<string, string>;
};

export type SectionProps = {
  node: Node;
  slots?: Record<string, ReactNode>;
  ctx: SectionContext;
};

export function cx(...parts: (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function str(value: PropValue | undefined, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

// Section and part values land as CSS variables on the section element
// (inline) so the bake and the editor preview share one code path.
// Components consume them with fallback chains, e.g.
// `var(--card-bg, var(--bg-base))` — unset props keep the current look.
export function sectionStyle(node: Node): React.CSSProperties | undefined {
  return sectionVarsFor(node.props) as React.CSSProperties | undefined;
}

export function partStyle(
  node: Node,
  part: string,
): React.CSSProperties | undefined {
  return partVarsFor(node.props, part) as React.CSSProperties | undefined;
}

const CONTENT_WIDTHS: Record<string, string> = {
  narrow: "max-w-3xl",
  regular: "max-w-6xl",
  wide: "max-w-7xl",
  full: "max-w-none",
};

export function contentWidthClass(node: Node, fallback = "max-w-6xl"): string {
  return CONTENT_WIDTHS[str(node.props.contentWidth)] ?? fallback;
}

export function alignClass(node: Node): string | undefined {
  const align = str(node.props.align);
  if (align === "center") return "text-center";
  if (align === "left") return "text-left";
  return undefined;
}

export type LinkTarget = {
  href: string;
  target?: string;
  rel?: string;
  broken?: boolean;
};

export function resolveLink(
  link: unknown,
  ctx: SectionContext,
): LinkTarget | undefined {
  if (!link || typeof link !== "object" || Array.isArray(link)) return undefined;
  const record = link as Record<string, unknown>;
  if (typeof record.pageId === "string") {
    const path = ctx.pagePaths[record.pageId];
    if (!path) {
      return { href: "#", broken: true };
    }
    return { href: path };
  }
  if (typeof record.url === "string") {
    return {
      href: record.url,
      target: record.newTab === true ? "_blank" : undefined,
      rel: record.newTab === true ? "noopener" : undefined,
    };
  }
  return undefined;
}

export function resolveAsset(
  asset: unknown,
  ctx: SectionContext,
): { src: string; missing: boolean } | undefined {
  if (!asset || typeof asset !== "object" || Array.isArray(asset)) return undefined;
  const record = asset as Record<string, unknown>;
  if (typeof record.assetId !== "string") return undefined;
  const url = ctx.assets[record.assetId];
  if (url) return { src: url, missing: false };
  return { src: `/assets/${record.assetId}`, missing: true };
}

export function focalStyle(asset: unknown): React.CSSProperties | undefined {
  if (!asset || typeof asset !== "object" || Array.isArray(asset)) return undefined;
  const focal = (asset as Record<string, unknown>).focal as
    | { x?: unknown; y?: unknown }
    | undefined;
  if (!focal || typeof focal.x !== "number" || typeof focal.y !== "number") {
    return undefined;
  }
  return { objectPosition: `${focal.x * 100}% ${focal.y * 100}%` };
}

export function SectionShell({
  node,
  section,
  className,
  children,
  style,
}: {
  node: Node;
  section: string;
  className?: string;
  children: ReactNode;
  style?: React.CSSProperties;
}): React.JSX.Element {
  return (
    <section
      data-section={section}
      data-variant={node.variant}
      data-node-id={node.id}
      className={className}
      style={{ ...sectionStyle(node), ...style }}
    >
      {children}
    </section>
  );
}
