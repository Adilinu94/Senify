import { resolveAsset, resolveLink, SectionShell, str, type SectionProps } from "./shared.tsx";

export function Projects({ node, ctx }: SectionProps): React.JSX.Element {
  const items = (Array.isArray(node.props.items) ? node.props.items : []) as {
    cover?: unknown;
    tag?: unknown;
    title?: unknown;
    text?: unknown;
    link?: unknown;
  }[];
  return (
    <SectionShell node={node} section="projects">
      <div className="mx-auto max-w-6xl px-4 py-16">
        {str(node.props.title) !== "" && (
          <h2 className="font-[var(--font-display)] text-3xl font-bold">{str(node.props.title)}</h2>
        )}
        {str(node.props.intro) !== "" && (
          <p className="mt-3 max-w-2xl text-lg text-[var(--fg-muted)]">{str(node.props.intro)}</p>
        )}
        <ul className="mt-10 grid gap-6 md:grid-cols-2">
          {items.map((item, index) => {
            const asset = resolveAsset(item.cover, ctx);
            const target = resolveLink(item.link, ctx);
            return (
              <li key={index}>
                <article className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)]">
                  {asset && (
                    <img
                      src={asset.src}
                      alt={typeof item.title === "string" ? item.title : ""}
                      loading="lazy"
                      data-missing-asset={asset.missing ? "" : undefined}
                      className="aspect-[16/9] w-full object-cover"
                    />
                  )}
                  <div className="p-6">
                    {typeof item.tag === "string" && item.tag !== "" && (
                      <p className="text-sm font-semibold uppercase tracking-widest text-[var(--accent)]">
                        {item.tag}
                      </p>
                    )}
                    <h3 className="mt-2 text-xl font-semibold">
                      {typeof item.title === "string" ? item.title : ""}
                    </h3>
                    {typeof item.text === "string" && item.text !== "" && (
                      <p className="mt-2 text-[var(--fg-muted)]">{item.text}</p>
                    )}
                    {target && (
                      <a
                        href={target.href}
                        target={target.target}
                        rel={target.rel}
                        data-broken-link={target.broken ? "" : undefined}
                        className="mt-3 inline-block font-semibold text-[var(--accent)]"
                      >
                        Ansehen →
                      </a>
                    )}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </div>
    </SectionShell>
  );
}
