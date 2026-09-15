import {
  alignStyle,
  aspectStyle,
  columnsClass,
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

export function Gallery({ node, ctx }: SectionProps): React.JSX.Element {
  const items = (Array.isArray(node.props.items) ? node.props.items : []) as {
    asset?: unknown;
    caption?: unknown;
  }[];
  const carousel = node.variant === "carousel";
  return (
    <SectionShell node={node} section="gallery">
      <div className={cx("mx-auto px-4 py-16", contentWidthClass(node))}>
        {str(node.props.title) !== "" && (
          <h2
            className="font-[var(--font-display)] text-3xl font-bold"
            style={{ ...headingStyle(node), ...alignStyle(node) }}
          >
            {str(node.props.title)}
          </h2>
        )}
        <div data-island={carousel ? "slider" : undefined} className={carousel ? "slider" : undefined}>
          {carousel && (
            <div className="mt-6 flex gap-2">
              <button type="button" data-slider-prev aria-label="Zurück">
                ←
              </button>
              <button type="button" data-slider-next aria-label="Weiter">
                →
              </button>
            </div>
          )}
          <ul
            className={cx(
              "mt-8 grid gap-4 sm:grid-cols-2",
              columnsClass(node, "md:grid-cols-3"),
            )}
            style={gapStyle(node)}
          >
            {items.map((item, index) => {
              const asset = resolveAsset(item.asset, ctx);
              return (
                <li key={index}>
                  <figure>
                    {asset && (
                      <ResponsiveImage
                        asset={asset}
                        alt={typeof item.caption === "string" && item.caption !== "" ? item.caption : `Bild ${index + 1}`}
                        sizes={imageSizes(node)}
                        className="aspect-[4/3] w-full object-cover"
                        style={{ ...mediaStyle(node), ...aspectStyle(node) }}
                      />
                    )}
                    {typeof item.caption === "string" && item.caption !== "" && (
                      <figcaption className="mt-2 text-sm text-[var(--fg-muted)]">
                        {item.caption}
                      </figcaption>
                    )}
                  </figure>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </SectionShell>
  );
}
