import {
  alignStyle,
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
  return (
    <SectionShell node={node} section="timeline">
      <div className={cx("mx-auto px-4 py-16", contentWidthClass(node, "max-w-3xl"))}>
        {str(node.props.title) !== "" && (
          <h2
            className="font-[family-name:var(--font-display)] text-3xl font-bold"
            style={{ ...headingStyle(node), ...alignStyle(node) }}
          >
            {str(node.props.title)}
          </h2>
        )}
        <ol
          className="mt-10 flex flex-col gap-8 border-l-2 border-[var(--line)] pl-6"
          style={gapStyle(node)}
        >
          {items.map((item, index) => (
            <li key={index}>
              <time className="text-sm font-semibold uppercase tracking-widest text-[var(--accent)]">
                {typeof item.date === "string" ? item.date : ""}
              </time>
              <h3 className="mt-1 text-lg font-semibold">
                {typeof item.title === "string" ? item.title : ""}
              </h3>
              {typeof item.text === "string" && item.text !== "" && (
                <p className="mt-1 text-[var(--fg-muted)]">{item.text}</p>
              )}
            </li>
          ))}
        </ol>
      </div>
    </SectionShell>
  );
}
