import { resolveLink, SectionShell, str, type SectionProps } from "./shared.tsx";

export function Hero({ node, slots, ctx }: SectionProps): React.JSX.Element {
  const ctas = (Array.isArray(node.props.ctas) ? node.props.ctas : []) as {
    label?: unknown;
    link?: unknown;
  }[];
  return (
    <SectionShell node={node} section="hero" className="overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:py-24">
        <div>
          {str(node.props.eyebrow) !== "" && (
            <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-[var(--fg-muted)]">
              {str(node.props.eyebrow)}
            </p>
          )}
          <h1 className="font-[var(--font-display)] text-5xl font-bold leading-tight">
            {str(node.props.headline)}
          </h1>
          {str(node.props.sub) !== "" && (
            <p className="mt-4 max-w-xl text-lg text-[var(--fg-muted)]">{str(node.props.sub)}</p>
          )}
          {ctas.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-3">
              {ctas.map((cta, index) => {
                const target = resolveLink(cta.link, ctx);
                return (
                  <a
                    key={index}
                    href={target?.href ?? "#"}
                    target={target?.target}
                    rel={target?.rel}
                    data-broken-link={target?.broken ? "" : undefined}
                    className={
                      index === 0
                        ? "rounded-full bg-[var(--accent)] px-6 py-3 font-semibold text-[var(--accent-ink)]"
                        : "rounded-full border border-[var(--line)] px-6 py-3 font-semibold"
                    }
                  >
                    {typeof cta.label === "string" ? cta.label : ""}
                  </a>
                );
              })}
            </div>
          )}
        </div>
        {slots?.visual && <div className="visual">{slots.visual}</div>}
      </div>
    </SectionShell>
  );
}
