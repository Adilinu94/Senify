import type { ReactNode } from "react";
import type { Node, PropValue } from "@senify/section-sdk";
import { partVarsFor, styleValue } from "../style.ts";

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
  const vars: Record<string, string> = {};
  const background = styleValue(node.props.background);
  if (background !== undefined) vars.background = background;
  const textColor = styleValue(node.props.textColor);
  if (textColor !== undefined) vars.color = textColor;
  const paddingY = styleValue(node.props.paddingY);
  if (paddingY !== undefined) {
    vars["--section-pad-y"] = paddingY;
    vars.paddingTop = "var(--section-pad-y)";
    vars.paddingBottom = "var(--section-pad-y)";
  }
  return Object.keys(vars).length > 0 ? (vars as React.CSSProperties) : undefined;
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

export function alignStyle(node: Node): React.CSSProperties | undefined {
  const align = str(node.props.align);
  if (align === "center") return { textAlign: "center" };
  if (align === "left") return { textAlign: "left" };
  return undefined;
}

export function alignBlockStyle(node: Node): React.CSSProperties | undefined {
  if (str(node.props.align) !== "center") return undefined;
  return { textAlign: "center", marginInline: "auto" };
}

export function columnsClass(node: Node, fallback: string): string {
  const value = str(node.props.columns);
  if (value !== "2" && value !== "3" && value !== "4") return fallback;
  const prefix = fallback.includes(":")
    ? fallback.slice(0, fallback.indexOf(":") + 1)
    : "";
  return `${prefix}grid-cols-${value}`;
}

export function gapStyle(node: Node): React.CSSProperties | undefined {
  const gap = styleValue(node.props.gap);
  return gap === undefined ? undefined : { gap };
}

const ASPECTS: Record<string, string> = {
  "16/9": "16 / 9",
  "4/3": "4 / 3",
  "1/1": "1 / 1",
  "3/4": "3 / 4",
};

export function aspectStyle(node: Node): React.CSSProperties | undefined {
  const value = ASPECTS[str(node.props.aspect)];
  return value === undefined ? undefined : { aspectRatio: value };
}

export type CardOptions = {
  border?: string;
  background?: string;
  radius?: string;
  shadow?: string;
  padding?: string | null;
};

export function cardStyle(
  node: Node,
  options: CardOptions = {},
): React.CSSProperties {
  const style: React.CSSProperties = {
    ...partStyle(node, "card"),
    backgroundColor: `var(--card-bg, ${options.background ?? "transparent"})`,
    borderColor: `var(--card-border, ${options.border ?? "var(--line)"})`,
    borderRadius: `var(--card-radius, ${options.radius ?? "var(--radius-lg)"})`,
    boxShadow: `var(--card-shadow, ${options.shadow ?? "none"})`,
  };
  if (options.padding !== null) {
    style.padding = `var(--card-pad, ${options.padding ?? "1.5rem"})`;
  }
  return style;
}

export function cardPaddingStyle(
  node: Node,
  fallback = "1.5rem",
): React.CSSProperties {
  return { padding: `var(--card-pad, ${fallback})` };
}

export function buttonStyle(
  node: Node,
  variant: "solid" | "outline" = "solid",
): React.CSSProperties {
  return {
    ...partStyle(node, "button"),
    backgroundColor:
      variant === "solid"
        ? "var(--button-bg, var(--accent))"
        : "var(--button-bg, transparent)",
    color:
      variant === "solid"
        ? "var(--button-fg, var(--accent-ink))"
        : "var(--button-fg, inherit)",
    borderColor:
      variant === "outline"
        ? "var(--button-border, var(--line))"
        : "var(--button-border, transparent)",
    borderRadius: "var(--button-radius, 9999px)",
  };
}

export function headingStyle(node: Node): React.CSSProperties {
  return {
    ...partStyle(node, "heading"),
    color: "var(--heading-fg, inherit)",
    fontSize: "var(--heading-size, inherit)",
  };
}

export function mediaStyle(
  node: Node,
  radiusFallback = "var(--radius-lg)",
): React.CSSProperties {
  return {
    ...partStyle(node, "media"),
    borderRadius: `var(--media-radius, ${radiusFallback})`,
    boxShadow: "var(--media-shadow, none)",
  };
}

export function linkStyle(node: Node): React.CSSProperties {
  return {
    ...partStyle(node, "link"),
    color: "var(--link-fg, inherit)",
  };
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
