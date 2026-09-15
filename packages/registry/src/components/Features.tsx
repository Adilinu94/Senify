import { resolveLink, SectionShell, str, type SectionProps } from "./shared.tsx";

export function Features({ node, ctx }: SectionProps): React.JSX.Element {
  const items = (Array.isArray(node.props.items) ? node.props.items : []) as {
    icon?: unknown;
    title?: unknown;
    text?: unknown;
    link?: unknown;
  }[];
  return (
    <SectionShell node={node} section="features">
      <div className="mx-auto max-w-6xl px-4 py-16">
        {str(node.props.title) !== "" && (
          <h2 className="font-[var(--font-display)] text-3xl font-bold">{str(node.props.title)}</h2>
        )}
        {str(node.props.intro) !== "" && (
          <p className="mt-3 max-w-2xl text-lg text-[var(--fg-muted)]">{str(node.props.intro)}</p>
        )}
        <ul className="mt-10 grid gap-6 md:grid-cols-3">
          {items.map((item, index) => {
            const target = resolveLink(item.link, ctx);
            return (
              <li
                key={index}
                className="rounded-[var(--radius-lg)] border border-[var(--line)] p-6"
              >
                {typeof item.icon === "string" && item.icon !== "" && (
                  <span aria-hidden className="mb-4 inline-block text-2xl">
                    {item.icon}
                  </span>
                )}
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
              </li>
            );
          })}
        </ul>
      </div>
    </SectionShell>
  );
}
