import {
  alignStyle,
  buttonStyle,
  contentWidthClass,
  cx,
  headingStyle,
  resolveLink,
  SectionShell,
  str,
  type SectionProps,
} from "./shared.tsx";

export function Hero({ node, slots, ctx }: SectionProps): React.JSX.Element {
  const ctas = (Array.isArray(node.props.ctas) ? node.props.ctas : []) as {
    label?: unknown;
    link?: unknown;
  }[];
  const reversed = node.props.reverse === true;
  return (
    <SectionShell node={node} section="hero" className="overflow-hidden">
      <div
        className={cx(
          "mx-auto grid items-center gap-10 px-4 py-16 md:py-24",
          contentWidthClass(node),
        )}
      >
        <div style={{ ...alignStyle(node), order: reversed ? 2 : undefined }}>
          {str(node.props.eyebrow) !== "" && (
            <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-[var(--fg-muted)]">
              {str(node.props.eyebrow)}
            </p>
          )}
          <h1
            className="font-[family-name:var(--font-display)] text-5xl font-bold leading-tight"
            style={headingStyle(node)}
          >
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
                    className="px-6 py-3 font-semibold"
                    style={buttonStyle(node, index === 0 ? "solid" : "outline")}
                  >
                    {typeof cta.label === "string" ? cta.label : ""}
                  </a>
                );
              })}
            </div>
          )}
        </div>
        {slots?.visual && (
          <div className="visual" style={reversed ? { order: 1 } : undefined}>
            {slots.visual}
          </div>
        )}
      </div>
    </SectionShell>
  );
}
