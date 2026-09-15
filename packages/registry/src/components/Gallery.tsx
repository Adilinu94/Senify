import { resolveAsset, SectionShell, str, type SectionProps } from "./shared.tsx";

export function Gallery({ node, ctx }: SectionProps): React.JSX.Element {
  const items = (Array.isArray(node.props.items) ? node.props.items : []) as {
    asset?: unknown;
    caption?: unknown;
  }[];
  const carousel = node.variant === "carousel";
  return (
    <SectionShell node={node} section="gallery">
      <div className="mx-auto max-w-6xl px-4 py-16">
        {str(node.props.title) !== "" && (
          <h2 className="font-[var(--font-display)] text-3xl font-bold">{str(node.props.title)}</h2>
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
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {items.map((item, index) => {
              const asset = resolveAsset(item.asset, ctx);
              return (
                <li key={index}>
                  <figure>
                    {asset && (
                      <img
                        src={asset.src}
                        alt={typeof item.caption === "string" && item.caption !== "" ? item.caption : `Bild ${index + 1}`}
                        loading="lazy"
                        data-missing-asset={asset.missing ? "" : undefined}
                        className="aspect-[4/3] w-full rounded-[var(--radius-lg)] object-cover"
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
