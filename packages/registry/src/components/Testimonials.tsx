import {
  alignStyle,
  cardStyle,
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

export function Testimonials({ node, ctx }: SectionProps): React.JSX.Element {
  const items = (Array.isArray(node.props.items) ? node.props.items : []) as {
    quote?: unknown;
    author?: unknown;
    role?: unknown;
    avatar?: unknown;
  }[];
  const slider = node.variant === "slider";
  return (
    <SectionShell node={node} section="testimonials">
      <div className={cx("mx-auto px-4 py-16", contentWidthClass(node))}>
        {str(node.props.title) !== "" && (
          <h2
            className="font-[var(--font-display)] text-3xl font-bold"
            style={{ ...headingStyle(node), ...alignStyle(node) }}
          >
            {str(node.props.title)}
          </h2>
        )}
        <div data-island={slider ? "slider" : undefined} className={cx(slider && "slider")}>
          {slider && (
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
              "mt-8 grid gap-6",
              !slider && columnsClass(node, "md:grid-cols-2"),
            )}
            style={gapStyle(node)}
          >
            {items.map((item, index) => {
              const avatar = resolveAsset(item.avatar, ctx);
              return (
                <li key={index}>
                  <blockquote className="h-full border" style={cardStyle(node)}>
                    <p className="text-lg leading-relaxed">
                      „{typeof item.quote === "string" ? item.quote : ""}"
                    </p>
                    <footer className="mt-4 flex items-center gap-3">
                      {avatar && (
                        <ResponsiveImage
                          asset={avatar}
                          alt={typeof item.author === "string" ? item.author : ""}
                          sizes={imageSizes(node)}
                          className="h-10 w-10 object-cover"
                          style={mediaStyle(node, "9999px")}
                        />
                      )}
                      <div>
                        <cite className="font-semibold not-italic">
                          {typeof item.author === "string" ? item.author : ""}
                        </cite>
                        {typeof item.role === "string" && item.role !== "" && (
                          <p className="text-sm text-[var(--fg-muted)]">{item.role}</p>
                        )}
                      </div>
                    </footer>
                  </blockquote>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </SectionShell>
  );
}
