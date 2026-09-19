import type { ReactNode } from "react";
import { motionPends, type Node, type PropValue } from "@senify/section-sdk";
import { scopeNameFor } from "@senify/widget-engine";
import { partVarsFor, styleValue } from "../style.ts";

export { styleValue } from "../style.ts";

export type SectionContext = {
  pagePaths: Record<string, string>;
  assets: Record<string, AssetDelivery>;
};

export type AssetVariantFormat = "avif" | "webp";

export type AssetVariant = {
  format: AssetVariantFormat;
  width: number;
  url: string;
};

// A delivered asset: plain URL string (simple callers, legacy builds) or the
// full bake payload with dimensions, blur hash and the encoded ladder.
export type AssetDelivery =
  | string
  | {
      src: string;
      width?: number | null;
      height?: number | null;
      blurhash?: string | null;
      variants?: AssetVariant[];
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
  const parts = partVarsFor(node.props, "heading");
  const style: React.CSSProperties = {
    ...(parts as React.CSSProperties | undefined),
    color: "var(--heading-fg, inherit)",
  };
  // Only when a prop set the variable: a plain `var(--heading-size, inherit)`
  // would force every heading onto `inherit` and beat the theme's own h1/h2
  // sizes (40 to 72px) with the body size.
  if (parts?.["--heading-size"] !== undefined) {
    style.fontSize = "var(--heading-size)";
  }
  return style;
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

export type ResolvedAsset = {
  src: string;
  missing: boolean;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  variants: AssetVariant[];
};

export function resolveAsset(
  asset: unknown,
  ctx: SectionContext,
): ResolvedAsset | undefined {
  if (!asset || typeof asset !== "object" || Array.isArray(asset)) return undefined;
  const record = asset as Record<string, unknown>;
  if (typeof record.assetId !== "string") return undefined;
  const delivery = ctx.assets[record.assetId];
  if (delivery === undefined) {
    return {
      src: `/assets/${record.assetId}`,
      missing: true,
      width: null,
      height: null,
      blurhash: null,
      variants: [],
    };
  }
  if (typeof delivery === "string") {
    return {
      src: delivery,
      missing: false,
      width: null,
      height: null,
      blurhash: null,
      variants: [],
    };
  }
  return {
    src: delivery.src,
    missing: false,
    width: delivery.width ?? null,
    height: delivery.height ?? null,
    blurhash: delivery.blurhash ?? null,
    variants: delivery.variants ?? [],
  };
}

// Grid sections mirror their column count after the Tailwind breakpoint the
// component sets; the rest (media, logos, marquee) span their slot. Unknown
// sections fall back to 100vw, the safe upper bound.
const GRID_IMAGE_SECTIONS: Record<
  string,
  { breakpoint: number; columns: number }
> = {
  gallery: { breakpoint: 768, columns: 3 },
  projects: { breakpoint: 768, columns: 2 },
  team: { breakpoint: 640, columns: 3 },
  testimonials: { breakpoint: 768, columns: 2 },
};

export function imageSizes(node: Node): string {
  if (str(node.props.contentWidth) === "full") return "100vw";
  const grid = GRID_IMAGE_SECTIONS[node.type];
  if (grid === undefined) return "100vw";
  const raw = str(node.props.columns);
  const columns =
    raw === "2" || raw === "3" || raw === "4" ? Number(raw) : grid.columns;
  return `(min-width: ${grid.breakpoint}px) ${Math.round(100 / columns)}vw, 100vw`;
}

function srcsetForFormat(asset: ResolvedAsset, format: AssetVariantFormat): string {
  return asset.variants
    .filter((variant) => variant.format === format)
    .sort((a, b) => a.width - b.width)
    .map((variant) => `${variant.url} ${variant.width}w`)
    .join(", ");
}

// Shared image output: `<picture>` with AVIF and WebP sources when the bake
// delivered a ladder, a plain `<img>` otherwise (the pre-ladder markup).
export function ResponsiveImage({
  asset,
  alt,
  sizes,
  className,
  style,
  loading = "lazy",
}: {
  asset: ResolvedAsset;
  alt: string;
  sizes: string;
  className?: string;
  style?: React.CSSProperties;
  loading?: "lazy" | "eager";
}): React.JSX.Element {
  if (asset.variants.length === 0) {
    return (
      <img
        src={asset.src}
        alt={alt}
        loading={loading}
        data-missing-asset={asset.missing ? "" : undefined}
        className={className}
        style={style}
      />
    );
  }
  const avif = srcsetForFormat(asset, "avif");
  const webp = srcsetForFormat(asset, "webp");
  return (
    <picture>
      {avif !== "" && <source type="image/avif" srcSet={avif} sizes={sizes} />}
      {webp !== "" && <source type="image/webp" srcSet={webp} sizes={sizes} />}
      <img
        src={asset.src}
        srcSet={webp !== "" ? webp : undefined}
        sizes={sizes}
        width={asset.width ?? undefined}
        height={asset.height ?? undefined}
        alt={alt}
        loading={loading}
        data-missing-asset={asset.missing ? "" : undefined}
        data-blurhash={asset.blurhash ?? undefined}
        className={className}
        style={style}
      />
    </picture>
  );
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

// FOUC marker for hiding presets (ticket 19, M2): the bake's page script
// releases the attribute when it takes over, a 1.6 s failsafe and <noscript>
// cover a broken or disabled script. The canvas renders the same markup — the
// attribute is inert there because the pending CSS lives only in the bake.
export function motionPendingAttrs(node: Node): Record<string, string> {
  const motion = node.motion;
  if (motion === undefined || motion.enabled === false) return {};
  return motionPends(motion.preset) ? { "data-motion-pending": "" } : {};
}

// The classes of the element that carries `data-node-id` (ticket 21): the
// assigned user classes (`node.classes`) and the node's generated scope class.
// The compiler anchors `class` rules as `[data-node-id].name` and `scoped`
// rules as `[data-node-id].__senify_scope_<id>` (ADR-0005), so both need the
// attribute in the DOM. The scope class is deterministic — every node carries
// it, and it stays inert until a scoped rule exists for that node. No rule
// registry has to reach the renderer this way.
export function nodeRootClasses(node: Node): string[] {
  return [...(node.classes ?? []), scopeNameFor(node.id)];
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
      {...motionPendingAttrs(node)}
      className={cx(className, ...nodeRootClasses(node))}
      style={{ ...sectionStyle(node), ...style }}
    >
      {children}
    </section>
  );
}
