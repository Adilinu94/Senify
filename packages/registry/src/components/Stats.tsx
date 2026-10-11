import {
  alignStyle,
  cardStyle,
  columnsClass,
  contentWidthClass,
  cx,
  gapStyle,
  headingStyle,
  SectionShell,
  str,
  type SectionProps,
} from "./shared.tsx";

export function Stats({ node }: SectionProps): React.JSX.Element {
  const items = (Array.isArray(node.props.items) ? node.props.items : []) as {
    value?: unknown;
    label?: unknown;
    prefix?: unknown;
    suffix?: unknown;
  }[];
  const variant = node.variant === "grid" || node.variant === "counter" ? node.variant : "row";
  return (
    <SectionShell node={node} section="stats">
      <div className={cx("mx-auto px-4 py-12", contentWidthClass(node))}>
        {str(node.props.title) !== "" && (
          <h2
            className="font-[family-name:var(--font-display)] text-3xl font-bold"
            style={{ ...headingStyle(node), ...alignStyle(node) }}
          >
            {str(node.props.title)}
          </h2>
        )}
        <dl
          className={cx(
            "mt-8 grid gap-8 text-center",
            columnsClass(node, "sm:grid-cols-3"),
          )}
          style={gapStyle(node)}
        >
          {items.map((item, index) => (
            <div
              key={index}
              // `grid` boxes every figure, `row` runs them side by side
              // separated by hairlines, `counter` lets the numerals carry the
              // section.
              className={cx(
                variant === "grid" && "border",
                variant === "row" && "sm:border-l sm:border-[var(--line)] sm:first:border-l-0",
              )}
              style={variant === "grid" ? cardStyle(node) : undefined}
            >
              <dd
                className={cx(
                  "font-[family-name:var(--font-display)] font-bold",
                  variant === "counter"
                    ? "text-5xl tabular-nums md:text-7xl"
                    : "text-4xl md:text-5xl",
                )}
                data-count={typeof item.value === "string" ? item.value : undefined}
                data-prefix={typeof item.prefix === "string" ? item.prefix : undefined}
                data-suffix={typeof item.suffix === "string" ? item.suffix : undefined}
              >
                {typeof item.prefix === "string" ? item.prefix : ""}
                {typeof item.value === "string" ? item.value : ""}
                {typeof item.suffix === "string" ? item.suffix : ""}
              </dd>
              <dt
                className={cx(
                  "mt-2 text-[var(--fg-muted)]",
                  variant === "counter" && "text-sm uppercase tracking-widest",
                )}
              >
                {typeof item.label === "string" ? item.label : ""}
              </dt>
            </div>
          ))}
        </dl>
      </div>
    </SectionShell>
  );
}
