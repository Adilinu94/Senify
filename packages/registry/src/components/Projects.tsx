import {
  alignBlockStyle,
  alignStyle,
  aspectStyle,
  cardPaddingStyle,
  cardStyle,
  columnsClass,
  contentWidthClass,
  cx,
  gapStyle,
  headingStyle,
  imageSizes,
  mediaStyle,
  resolveAsset,
  resolveLink,
  ResponsiveImage,
  SectionShell,
  str,
  type SectionProps,
} from "./shared.tsx";

type ProjectItem = {
  cover?: unknown;
  tag?: unknown;
  title?: unknown;
  text?: unknown;
  link?: unknown;
};

export function Projects({ node, ctx }: SectionProps): React.JSX.Element {
  const items = (Array.isArray(node.props.items) ? node.props.items : []) as ProjectItem[];
  // `cards` (and a section without a variant) keeps the framed card grid. `list`
  // sets the projects as quiet rows with a small cover; `showcase` gives each
  // project a full row with a large cover, alternating the side it sits on.
  const list = node.variant === "list";
  const showcase = node.variant === "showcase";

  const tagLine = (item: ProjectItem): React.JSX.Element | null =>
    typeof item.tag === "string" && item.tag !== "" ? (
      <p className="text-sm font-semibold uppercase tracking-widest text-[var(--accent)]">
        {item.tag}
      </p>
    ) : null;
  const textLine = (item: ProjectItem): React.JSX.Element | null =>
    typeof item.text === "string" && item.text !== "" ? (
      <p className="mt-2 text-[var(--fg-muted)]">{item.text}</p>
    ) : null;
  const linkLine = (item: ProjectItem, label: string): React.JSX.Element | null => {
    const target = resolveLink(item.link, ctx);
    return target ? (
      <a
        href={target.href}
        target={target.target}
        rel={target.rel}
        data-broken-link={target.broken ? "" : undefined}
        className="mt-3 inline-block font-semibold text-[var(--accent)]"
      >
        {label}
      </a>
    ) : null;
  };
  const cover = (
    item: ProjectItem,
    index: number,
    className: string,
  ): React.JSX.Element | null => {
    const asset = resolveAsset(item.cover, ctx);
    return asset ? (
      <ResponsiveImage
        asset={asset}
        alt={typeof item.title === "string" ? item.title : ""}
        sizes={imageSizes(node)}
        priority={index === 0 && ctx.priorityNodeId === node.id}
        className={className}
        style={{ ...mediaStyle(node, "0px"), ...aspectStyle(node) }}
      />
    ) : null;
  };
  const title = (item: ProjectItem, className: string): React.JSX.Element => (
    <h3 className={className}>{typeof item.title === "string" ? item.title : ""}</h3>
  );

  return (
    <SectionShell node={node} section="projects">
      <div className={cx("mx-auto px-4 py-16", contentWidthClass(node))}>
        {str(node.props.title) !== "" && (
          <h2
            className="font-[family-name:var(--font-display)] text-3xl font-bold"
            style={{ ...headingStyle(node), ...alignStyle(node) }}
          >
            {str(node.props.title)}
          </h2>
        )}
        {str(node.props.intro) !== "" && (
          <p
            className="mt-3 max-w-2xl text-lg text-[var(--fg-muted)]"
            style={alignBlockStyle(node)}
          >
            {str(node.props.intro)}
          </p>
        )}
        {list ? (
          <ul className="mt-10 flex flex-col" style={gapStyle(node)}>
            {items.map((item, index) => (
              <li key={index}>
                <article className="flex flex-col gap-4 border-t border-[var(--line)] py-6 sm:flex-row sm:items-center sm:gap-8">
                  {cover(item, index, "aspect-[4/3] w-full object-cover sm:w-56 sm:shrink-0")}
                  <div className="min-w-0 flex-1">
                    {tagLine(item)}
                    {title(item, "mt-1 text-xl font-semibold")}
                    {textLine(item)}
                    {linkLine(item, "Ansehen →")}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        ) : showcase ? (
          <ul className="mt-12 flex flex-col gap-16" style={gapStyle(node)}>
            {items.map((item, index) => (
              <li key={index}>
                <article className="grid items-center gap-8 md:grid-cols-12 md:gap-12">
                  <div className={cx("md:col-span-7", index % 2 === 1 && "md:order-last")}>
                    {cover(item, index, "aspect-[16/10] w-full object-cover")}
                  </div>
                  <div className="md:col-span-5">
                    {tagLine(item)}
                    {title(item, "mt-2 font-[family-name:var(--font-display)] text-3xl font-bold")}
                    {textLine(item)}
                    {linkLine(item, "Projekt ansehen →")}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <ul
            className={cx("mt-10 grid gap-6", columnsClass(node, "md:grid-cols-2"))}
            style={gapStyle(node)}
          >
            {items.map((item, index) => (
              <li key={index}>
                <article
                  className="overflow-hidden border"
                  style={cardStyle(node, { padding: null })}
                >
                  {cover(item, index, "aspect-[16/9] w-full object-cover")}
                  <div style={cardPaddingStyle(node)}>
                    {tagLine(item)}
                    {title(item, "mt-2 text-xl font-semibold")}
                    {textLine(item)}
                    {linkLine(item, "Ansehen →")}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionShell>
  );
}
