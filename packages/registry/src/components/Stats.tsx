import {
  alignStyle,
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
            <div key={index}>
              <dd
                className="font-[family-name:var(--font-display)] text-4xl font-bold md:text-5xl"
                data-count={typeof item.value === "string" ? item.value : undefined}
                data-prefix={typeof item.prefix === "string" ? item.prefix : undefined}
                data-suffix={typeof item.suffix === "string" ? item.suffix : undefined}
              >
                {typeof item.prefix === "string" ? item.prefix : ""}
                {typeof item.value === "string" ? item.value : ""}
                {typeof item.suffix === "string" ? item.suffix : ""}
              </dd>
              <dt className="mt-2 text-[var(--fg-muted)]">
                {typeof item.label === "string" ? item.label : ""}
              </dt>
            </div>
          ))}
        </dl>
      </div>
    </SectionShell>
  );
}
