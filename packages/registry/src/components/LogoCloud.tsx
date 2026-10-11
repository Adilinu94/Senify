import {
  alignStyle,
  contentWidthClass,
  cx,
  gapStyle,
  headingStyle,
  imageSizes,
  mediaStyle,
  resolveAsset,
  ResponsiveImage,
  SectionShell,
  str,
  type SectionProps,
} from "./shared.tsx";

export function LogoCloud({ node, ctx }: SectionProps): React.JSX.Element {
  const logos = (Array.isArray(node.props.logos) ? node.props.logos : []) as {
    asset?: unknown;
    alt?: unknown;
  }[];
  const marquee = node.variant === "marquee";
  // `grid` sets every logo in an equal, framed tile so rows line up; `wrap`
  // (and a section without a variant) keeps the loose centred flow.
  const grid = node.variant === "grid";
  const list = (hidden: boolean): React.JSX.Element => (
    <ul
      aria-hidden={hidden || undefined}
      className={
        marquee && !hidden
          ? "marquee-track"
          : cx(
              grid && "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4",
              !marquee && !grid && "flex flex-wrap items-center justify-center gap-8",
            )
      }
      style={marquee ? undefined : gapStyle(node)}
    >
      {logos.map((logo, index) => {
        const asset = resolveAsset(logo.asset, ctx);
        return (
          <li
            key={index}
            className={grid ? "flex items-center justify-center border border-[var(--line)] px-6 py-8" : undefined}
          >
            {asset ? (
              <ResponsiveImage
                asset={asset}
                alt={typeof logo.alt === "string" ? logo.alt : ""}
                sizes={imageSizes(node)}
                className="h-8 w-auto opacity-70 grayscale"
                style={mediaStyle(node, "0px")}
              />
            ) : (
              <span>{typeof logo.alt === "string" ? logo.alt : ""}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
  return (
    <SectionShell node={node} section="logo-cloud">
      <div className={cx("mx-auto px-4 py-10 text-center", contentWidthClass(node))}>
        {str(node.props.title) !== "" && (
          <h2
            className="mb-8 text-sm font-semibold uppercase tracking-widest text-[var(--fg-muted)]"
            style={{ ...headingStyle(node), ...alignStyle(node) }}
          >
            {str(node.props.title)}
          </h2>
        )}
        {marquee ? (
          <div data-marquee className="marquee overflow-hidden">
            {list(false)}
            {list(true)}
          </div>
        ) : (
          list(false)
        )}
      </div>
    </SectionShell>
  );
}
