import {
  alignBlockStyle,
  alignStyle,
  cardStyle,
  columnsClass,
  contentWidthClass,
  cx,
  gapStyle,
  headingStyle,
  resolveLink,
  SectionShell,
  str,
  type SectionProps,
} from "./shared.tsx";

export function Features({ node, ctx }: SectionProps): React.JSX.Element {
  const items = (Array.isArray(node.props.items) ? node.props.items : []) as {
    icon?: unknown;
    title?: unknown;
    text?: unknown;
    link?: unknown;
  }[];
  const variant = node.variant === "alternating" || node.variant === "list" ? node.variant : "grid";
  return (
    <SectionShell node={node} section="features">
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
        <ul
          className={cx(
            "mt-10",
            // `grid` is the card grid; `alternating` sets one row per item and
            // flips every second row; `list` is a plain divided list.
            variant === "grid" ? cx("grid gap-6", columnsClass(node, "md:grid-cols-3")) : "grid gap-6",
            variant === "list" && "gap-0 divide-y divide-[var(--line)] border-y border-[var(--line)]",
          )}
          style={gapStyle(node)}
        >
          {items.map((item, index) => {
            const target = resolveLink(item.link, ctx);
            const flipped = variant === "alternating" && index % 2 === 1;
            const row = variant !== "grid";
            return (
              <li
                key={index}
                className={cx(
                  variant === "list" ? "py-5" : "border",
                  row && "md:flex md:items-start md:gap-8",
                  flipped && "md:flex-row-reverse md:text-right",
                )}
                style={variant === "list" ? undefined : cardStyle(node)}
              >
                {typeof item.icon === "string" && item.icon !== "" && (
                  <span
                    aria-hidden
                    className={cx("inline-block text-2xl", row ? "mb-3 md:mb-0 md:shrink-0" : "mb-4")}
                  >
                    {item.icon}
                  </span>
                )}
                <div className={row ? "md:flex-1" : undefined}>
                  <h3 className="text-lg font-semibold">
                    {typeof item.title === "string" ? item.title : ""}
                  </h3>
                  <p className="mt-2 text-[var(--fg-muted)]">
                    {typeof item.text === "string" ? item.text : ""}
                  </p>
                  {target && (
                    <a
                      href={target.href}
                      target={target.target}
                      rel={target.rel}
                      data-broken-link={target.broken ? "" : undefined}
                      className="mt-3 inline-block font-semibold text-[var(--accent)]"
                    >
                      Mehr →
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </SectionShell>
  );
}
