import {
  alignStyle,
  buttonStyle,
  cardStyle,
  contentWidthClass,
  cx,
  headingStyle,
  resolveLink,
  SectionShell,
  str,
  type SectionProps,
} from "./shared.tsx";

export function Cta({ node, ctx }: SectionProps): React.JSX.Element {
  const buttons = (Array.isArray(node.props.buttons) ? node.props.buttons : []) as {
    label?: unknown;
    link?: unknown;
  }[];
  // `simple` stacks heading and buttons, centred. `split` puts the message
  // beside its buttons and reads from the left. `banner-cta` is a contained
  // panel, tinted with the accent, for a call that should read as a band.
  const split = node.variant === "split";
  const banner = node.variant === "banner-cta";
  const inner = (
    <div
      className={cx(
        "mx-auto",
        split ? "gap-8 text-left md:flex md:items-center md:justify-between" : "text-center",
        contentWidthClass(node, split ? "max-w-5xl" : "max-w-3xl"),
      )}
      style={alignStyle(node)}
    >
      <div className={split ? "md:max-w-xl" : undefined}>
        <h2
          className="font-[family-name:var(--font-display)] text-3xl font-bold md:text-4xl"
          style={headingStyle(node)}
        >
          {str(node.props.headline)}
        </h2>
        {str(node.props.sub) !== "" && (
          <p className="mt-4 text-lg text-[var(--fg-muted)]">{str(node.props.sub)}</p>
        )}
      </div>
      {buttons.length > 0 && (
        <div
          className={cx(
            "flex flex-wrap gap-3",
            split ? "mt-8 md:mt-0 md:shrink-0 md:justify-end" : "mt-8 justify-center",
          )}
        >
          {buttons.map((button, index) => {
            const target = resolveLink(button.link, ctx);
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
                {typeof button.label === "string" ? button.label : ""}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
  return (
    <SectionShell node={node} section="cta" className="px-4 py-16">
      {banner ? (
        <div
          className="mx-auto max-w-5xl border px-6 py-12 md:px-12"
          style={cardStyle(node, {
            background: "color-mix(in srgb, var(--accent) 10%, transparent)",
            border: "color-mix(in srgb, var(--accent) 35%, transparent)",
            padding: null,
          })}
        >
          {inner}
        </div>
      ) : (
        inner
      )}
    </SectionShell>
  );
}
