import { SectionShell, str, type SectionProps } from "./shared.tsx";

export function Stats({ node }: SectionProps): React.JSX.Element {
  const items = (Array.isArray(node.props.items) ? node.props.items : []) as {
    value?: unknown;
    label?: unknown;
    prefix?: unknown;
    suffix?: unknown;
  }[];
  return (
    <SectionShell node={node} section="stats">
      <div className="mx-auto max-w-6xl px-4 py-12">
        {str(node.props.title) !== "" && (
          <h2 className="font-[var(--font-display)] text-3xl font-bold">{str(node.props.title)}</h2>
        )}
        <dl className="mt-8 grid gap-8 text-center sm:grid-cols-3">
          {items.map((item, index) => (
            <div key={index}>
              <dd
                className="font-[var(--font-display)] text-4xl font-bold md:text-5xl"
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
