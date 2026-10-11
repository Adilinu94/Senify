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
  // `spotlight` gives the first quote the stage: large, centred and without a
  // card; the remaining quotes follow as a quieter row beneath it.
  const spotlight = node.variant === "spotlight" && items.length > 0;
  const quote = (item: (typeof items)[number]): string =>
    typeof item.quote === "string" ? item.quote : "";
  const author = (item: (typeof items)[number]): string =>
    typeof item.author === "string" ? item.author : "";
  const person = (item: (typeof items)[number], centered: boolean): React.JSX.Element => {
    const avatar = resolveAsset(item.avatar, ctx);
    return (
      <footer className={cx("mt-4 flex items-center gap-3", centered && "justify-center")}>
        {avatar && (
          <ResponsiveImage
            asset={avatar}
            alt={author(item)}
            sizes={imageSizes(node)}
            className={cx(centered ? "h-14 w-14" : "h-10 w-10", "object-cover")}
            style={mediaStyle(node, "9999px")}
          />
        )}
        <div className={centered ? "text-left" : undefined}>
          <cite className="font-semibold not-italic">{author(item)}</cite>
          {typeof item.role === "string" && item.role !== "" && (
            <p className="text-sm text-[var(--fg-muted)]">{item.role}</p>
          )}
        </div>
      </footer>
    );
  };
  const card = (item: (typeof items)[number], index: number): React.JSX.Element => (
    <li key={index}>
      <blockquote className="h-full border" style={cardStyle(node)}>
        <p className="text-lg leading-relaxed">„{quote(item)}"</p>
        {person(item, false)}
      </blockquote>
    </li>
  );
  const featured = spotlight ? items[0] : undefined;
  const rest = spotlight ? items.slice(1) : items;
  return (
    <SectionShell node={node} section="testimonials">
      <div className={cx("mx-auto px-4 py-16", contentWidthClass(node))}>
        {str(node.props.title) !== "" && (
          <h2
            className="font-[family-name:var(--font-display)] text-3xl font-bold"
            style={{ ...headingStyle(node), ...alignStyle(node) }}
          >
            {str(node.props.title)}
          </h2>
        )}
        {featured !== undefined && (
          <figure className="mx-auto mt-10 max-w-3xl text-center">
            <blockquote>
              <p className="font-[family-name:var(--font-display)] text-2xl font-medium leading-snug md:text-4xl">
                „{quote(featured)}"
              </p>
            </blockquote>
            {person(featured, true)}
          </figure>
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
          {(!spotlight || rest.length > 0) && (
            <ul
              className={cx(
                spotlight ? "mt-12 grid gap-6" : "mt-8 grid gap-6",
                !slider && columnsClass(node, "md:grid-cols-2"),
              )}
              style={gapStyle(node)}
            >
              {rest.map((item, index) => card(item, index))}
            </ul>
          )}
        </div>
      </div>
    </SectionShell>
  );
}
