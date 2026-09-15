import {
  alignStyle,
  buttonStyle,
  contentWidthClass,
  cx,
  headingStyle,
  SectionShell,
  str,
  type SectionProps,
} from "./shared.tsx";

export function Newsletter({ node }: SectionProps): React.JSX.Element {
  const endpoint = str(node.props.endpoint);
  return (
    <SectionShell node={node} section="newsletter">
      <div
        className={cx(
          "mx-auto px-4 py-16 text-center",
          contentWidthClass(node, "max-w-3xl"),
        )}
        style={alignStyle(node)}
      >
        <h2 className="font-[var(--font-display)] text-3xl font-bold" style={headingStyle(node)}>
          {str(node.props.headline)}
        </h2>
        {str(node.props.sub) !== "" && (
          <p className="mt-3 text-lg text-[var(--fg-muted)]">{str(node.props.sub)}</p>
        )}
        <form
          method="post"
          action={endpoint !== "" ? endpoint : "#"}
          data-form="newsletter"
          className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
        >
          <label className="sr-only" htmlFor={`nl-${node.id}`}>
            E-Mail
          </label>
          <input
            id={`nl-${node.id}`}
            type="email"
            name="email"
            required
            placeholder="name@beispiel.de"
            className="flex-1 rounded-full border border-[var(--line)] px-5 py-3"
          />
          <button
            type="submit"
            className="px-6 py-3 font-semibold"
            style={buttonStyle(node)}
          >
            {str(node.props.buttonLabel, "Anmelden")}
          </button>
        </form>
        {str(node.props.note) !== "" && (
          <p className="mt-3 text-sm text-[var(--fg-muted)]">{str(node.props.note)}</p>
        )}
      </div>
    </SectionShell>
  );
}
