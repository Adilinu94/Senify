import {
  alignStyle,
  cardStyle,
  contentWidthClass,
  cx,
  gapStyle,
  headingStyle,
  SectionShell,
  str,
  type SectionProps,
} from "./shared.tsx";

export function Timeline({ node }: SectionProps): React.JSX.Element {
  const items = (Array.isArray(node.props.items) ? node.props.items : []) as {
    date?: unknown;
    title?: unknown;
    text?: unknown;
  }[];
  // `vertical` runs down a rule; `horizontal` lays the stations side by side
  // along a rule on desktop (they stack on a phone); `cards` sets each one in
  // a card with its date as a label.
  const variant = node.variant === "horizontal" || node.variant === "cards" ? node.variant : "vertical";
  type Item = (typeof items)[number];
  const dateOf = (item: Item): string => (typeof item.date === "string" ? item.date : "");
  const titleOf = (item: Item): string => (typeof item.title === "string" ? item.title : "");
  const textOf = (item: Item): React.JSX.Element | null =>
    typeof item.text === "string" && item.text !== "" ? (
      <p className="mt-1 text-[var(--fg-muted)]">{item.text}</p>
    ) : null;
  const dateClass = "text-sm font-semibold uppercase tracking-widest text-[var(--accent)]";
  return (
    <SectionShell node={node} section="timeline">
      <div
        className={cx(
          "mx-auto px-4 py-16",
          contentWidthClass(node, variant === "vertical" ? "max-w-3xl" : "max-w-6xl"),
        )}
      >
        {str(node.props.title) !== "" && (
          <h2
            className="font-[family-name:var(--font-display)] text-3xl font-bold"
            style={{ ...headingStyle(node), ...alignStyle(node) }}
          >
            {str(node.props.title)}
          </h2>
        )}
        {variant === "vertical" && (
          <ol
            className="mt-10 flex flex-col gap-8 border-l-2 border-[var(--line)] pl-6"
            style={gapStyle(node)}
          >
            {items.map((item, index) => (
              <li key={index}>
                <time className={dateClass}>{dateOf(item)}</time>
                <h3 className="mt-1 text-lg font-semibold">{titleOf(item)}</h3>
                {textOf(item)}
              </li>
            ))}
          </ol>
        )}
        {variant === "horizontal" && (
          <ol className="mt-10 grid gap-8 md:grid-flow-col md:auto-cols-fr" style={gapStyle(node)}>
            {items.map((item, index) => (
              <li key={index} className="relative border-t-2 border-[var(--line)] pt-6">
                <span
                  aria-hidden
                  className="absolute left-0 h-3 w-3 rounded-full bg-[var(--accent)]"
                  style={{ top: "calc(-0.375rem - 1px)" }}
                />
                <time className={dateClass}>{dateOf(item)}</time>
                <h3 className="mt-1 text-lg font-semibold">{titleOf(item)}</h3>
                {textOf(item)}
              </li>
            ))}
          </ol>
        )}
        {variant === "cards" && (
          <ol className="mt-10 grid gap-6 md:grid-cols-2" style={gapStyle(node)}>
            {items.map((item, index) => (
              <li key={index} className="border" style={cardStyle(node)}>
                <time
                  className="inline-block rounded-full bg-[var(--bg-muted)] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[var(--accent)]"
                >
                  {dateOf(item)}
                </time>
                <h3 className="mt-3 text-lg font-semibold">{titleOf(item)}</h3>
                {textOf(item)}
              </li>
            ))}
          </ol>
        )}
      </div>
    </SectionShell>
  );
}
