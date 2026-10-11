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
import { WebglScene } from "./Scene.tsx";

export function Hero({ node, slots, ctx }: SectionProps): React.JSX.Element {
  const ctas = (Array.isArray(node.props.ctas) ? node.props.ctas : []) as {
    label?: unknown;
    link?: unknown;
  }[];
  const reversed = node.props.reverse === true;
  // `split` sets the text beside the visual and reads from the left; `centered`
  // (and the showcase, whose scene spans the width) stack text over visual and
  // centre it. A split without a visual has no second column to fill.
  const split = node.variant === "split";
  const hasVisual = Boolean(slots?.visual) || node.variant === "showcase-3d";
  const sideBySide = split && hasVisual;
  return (
    <SectionShell node={node} section="hero" className="overflow-hidden">
      <div
        className={cx(
          "mx-auto grid items-center gap-10 px-4 py-16 md:py-24",
          sideBySide && "md:grid-cols-2",
          contentWidthClass(node),
        )}
      >
        <div
          className={split ? "text-left" : "text-center"}
          style={{ ...alignStyle(node), order: reversed ? 2 : undefined }}
        >
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
            <p className={cx("mt-4 max-w-xl text-lg text-[var(--fg-muted)]", !split && "mx-auto")}>
              {str(node.props.sub)}
            </p>
          )}
          {ctas.length > 0 && (
            <div className={cx("mt-8 flex flex-wrap gap-3", !split && "justify-center")}>
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
        {(slots?.visual || node.variant === "showcase-3d") && (
          <div className="visual" style={reversed ? { order: 1 } : undefined}>
            {slots?.visual ?? (
              // The showcase-3d variant promises a scene: without a filled
              // visual slot the section brings its own surface (M6).
              <WebglScene node={node} className="w-full" style={{ aspectRatio: "16 / 10" }} />
            )}
          </div>
        )}
      </div>
    </SectionShell>
  );
}
