import { SectionShell, str, type SectionProps } from "./shared.tsx";

export function ServicesProcess({ node }: SectionProps): React.JSX.Element {
  const steps = (Array.isArray(node.props.steps) ? node.props.steps : []) as {
    nr?: unknown;
    title?: unknown;
    text?: unknown;
  }[];
  return (
    <SectionShell node={node} section="services-process">
      <div className="mx-auto max-w-6xl px-4 py-16">
        {str(node.props.title) !== "" && (
          <h2 className="font-[var(--font-display)] text-3xl font-bold">{str(node.props.title)}</h2>
        )}
        {str(node.props.intro) !== "" && (
          <p className="mt-3 max-w-2xl text-lg text-[var(--fg-muted)]">{str(node.props.intro)}</p>
        )}
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {steps.map((step, index) => (
            <li
              key={index}
              className="rounded-[var(--radius-lg)] border border-[var(--line)] p-6"
            >
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
