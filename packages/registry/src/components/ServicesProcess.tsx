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
  return (
    <SectionShell node={node} section="services-process">
      <div className={cx("mx-auto px-4 py-16", contentWidthClass(node))}>
        {str(node.props.title) !== "" && (
          <h2
            className="font-[var(--font-display)] text-3xl font-bold"
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
        <ol
          className={cx("mt-10 grid gap-6", columnsClass(node, "md:grid-cols-3"))}
          style={gapStyle(node)}
        >
          {steps.map((step, index) => (
            <li key={index} className="border" style={cardStyle(node)}>
              <span className="font-[var(--font-display)] text-4xl font-bold text-[var(--fg-faint)]">
                {typeof step.nr === "string" && step.nr !== "" ? step.nr : `0${index + 1}`}
              </span>
              <h3 className="mt-3 text-lg font-semibold">
                {typeof step.title === "string" ? step.title : ""}
              </h3>
              <p className="mt-2 text-[var(--fg-muted)]">
                {typeof step.text === "string" ? step.text : ""}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </SectionShell>
  );
}
