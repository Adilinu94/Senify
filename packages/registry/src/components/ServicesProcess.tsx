import {
  alignBlockStyle,
  alignStyle,
  cardStyle,
  columnsClass,
  contentWidthClass,
  cx,
  gapStyle,
  headingStyle,
  SectionShell,
  str,
  type SectionProps,
} from "./shared.tsx";

export function ServicesProcess({ node }: SectionProps): React.JSX.Element {
  const steps = (Array.isArray(node.props.steps) ? node.props.steps : []) as {
    nr?: unknown;
    title?: unknown;
    text?: unknown;
  }[];
  // `cards` is the grid of cards, `steps` a row of numbered discs joined by a
  // line, `timeline` a vertical line with the numbered stations along it. A
  // section without a variant keeps the cards it always had.
  const variant = node.variant === "steps" || node.variant === "timeline" ? node.variant : "cards";
  const numberOf = (step: (typeof steps)[number], index: number): string =>
    typeof step.nr === "string" && step.nr !== "" ? step.nr : `0${index + 1}`;
  const titleOf = (step: (typeof steps)[number]): string => (typeof step.title === "string" ? step.title : "");
  const textOf = (step: (typeof steps)[number]): string => (typeof step.text === "string" ? step.text : "");
  const disc =
    "flex shrink-0 items-center justify-center rounded-full bg-[var(--accent)] font-[family-name:var(--font-display)] font-bold text-[var(--accent-ink)]";
  return (
    <SectionShell node={node} section="services-process">
      <div className={cx("mx-auto px-4 py-16", contentWidthClass(node, variant === "timeline" ? "max-w-4xl" : "max-w-6xl"))}>
        {str(node.props.title) !== "" && (
          <h2
            className="font-[family-name:var(--font-display)] text-3xl font-bold"
            style={{ ...headingStyle(node), ...alignStyle(node) }}
          >
            {str(node.props.title)}
          </h2>
        )}
        {str(node.props.intro) !== "" && (
          <p
            className="mt-3 max-w-2xl text-lg text-[var(--fg-muted)]"
            style={alignBlockStyle(node)}
          >
            {str(node.props.intro)}
          </p>
        )}
        {variant === "cards" && (
          <ol
            className={cx("mt-10 grid gap-6", columnsClass(node, "md:grid-cols-3"))}
            style={gapStyle(node)}
          >
            {steps.map((step, index) => (
              <li key={index} className="border" style={cardStyle(node)}>
                <span className="font-[family-name:var(--font-display)] text-4xl font-bold text-[var(--fg-faint)]">
                  {numberOf(step, index)}
                </span>
                <h3 className="mt-3 text-lg font-semibold">{titleOf(step)}</h3>
                <p className="mt-2 text-[var(--fg-muted)]">{textOf(step)}</p>
              </li>
            ))}
          </ol>
        )}
        {variant === "steps" && (
          <ol
            className={cx("mt-10 grid gap-8", columnsClass(node, "md:grid-cols-3"))}
            style={gapStyle(node)}
          >
            {steps.map((step, index) => (
              <li
                key={index}
                className="relative md:after:absolute md:after:-right-8 md:after:left-14 md:after:top-6 md:after:h-px md:after:bg-[var(--line)] md:after:content-[''] md:last:after:hidden"
              >
                <span className={cx(disc, "h-12 w-12 text-lg")}>{numberOf(step, index)}</span>
                <h3 className="mt-4 text-lg font-semibold">{titleOf(step)}</h3>
                <p className="mt-2 text-[var(--fg-muted)]">{textOf(step)}</p>
              </li>
            ))}
          </ol>
        )}
        {variant === "timeline" && (
          <ol
            className="mt-10 flex flex-col gap-10 border-l-2 border-[var(--line)] pl-10"
            style={gapStyle(node)}
          >
            {steps.map((step, index) => (
              <li key={index} className="relative">
                <span
                  className={cx(disc, "absolute top-0 h-9 w-9 text-sm")}
                  style={{ left: "calc(-2.5rem - 1px - 1.125rem)" }}
                >
                  {numberOf(step, index)}
                </span>
                <h3 className="text-lg font-semibold">{titleOf(step)}</h3>
                <p className="mt-2 text-[var(--fg-muted)]">{textOf(step)}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </SectionShell>
  );
}
