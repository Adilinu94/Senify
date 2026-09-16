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

export function Cta({ node, ctx }: SectionProps): React.JSX.Element {
  const buttons = (Array.isArray(node.props.buttons) ? node.props.buttons : []) as {
    label?: unknown;
    link?: unknown;
  }[];
  return (
    <SectionShell node={node} section="cta" className="px-4 py-16">
      <div
        className={cx("mx-auto text-center", contentWidthClass(node, "max-w-3xl"))}
        style={alignStyle(node)}
      >
        <h2
          className="font-[family-name:var(--font-display)] text-3xl font-bold md:text-4xl"
          style={headingStyle(node)}
        >
          {str(node.props.headline)}
        </h2>
        {str(node.props.sub) !== "" && (
          <p className="mt-4 text-lg text-[var(--fg-muted)]">{str(node.props.sub)}</p>
        )}
        {buttons.length > 0 && (
          <div className="mt-8 flex flex-wrap justify-center gap-3">
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
    </SectionShell>
  );
}
