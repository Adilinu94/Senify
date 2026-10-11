import {
  alignStyle,
  cardStyle,
  contentWidthClass,
  cx,
  headingStyle,
  SectionShell,
  str,
  type SectionProps,
} from "./shared.tsx";
import { FormFields, readFormData } from "./FormFields.tsx";

export function Newsletter({ node, ctx }: SectionProps): React.JSX.Element {
  const form = readFormData(node);
  const endpoint = str(node.props.endpoint);
  // `boxed` lifts the sign-up into a panel, `split` sets the pitch beside the
  // form, and `inline` (also what a section without a variant gets) is the
  // plain centred band.
  const variant = node.variant === "boxed" || node.variant === "split" ? node.variant : "inline";
  const split = variant === "split";
  const headline = (
    <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold" style={headingStyle(node)}>
      {str(node.props.headline)}
    </h2>
  );
  const sub =
    str(node.props.sub) !== "" ? (
      <p className="mt-3 text-lg text-[var(--fg-muted)]">{str(node.props.sub)}</p>
    ) : null;
  const note =
    str(node.props.note) !== "" ? (
      <p className="mt-3 text-sm text-[var(--fg-muted)]">{str(node.props.note)}</p>
    ) : null;
  const signup =
    form !== undefined ? (
      <div className={cx(!split && "mt-8", "flex", split ? "justify-start" : "justify-center")}>
        <FormFields form={form} ctx={ctx} />
      </div>
    ) : (
      <form
        method="post"
        action={endpoint !== "" ? endpoint : "#"}
        data-form-unscheduled=""
        className={cx("flex max-w-md flex-col gap-3 sm:flex-row", !split && "mx-auto mt-8")}
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
          style={{
            backgroundColor: "var(--button-bg, var(--accent))",
            color: "var(--button-fg, var(--accent-ink))",
            borderRadius: "var(--button-radius, 9999px)",
          }}
        >
          {str(node.props.buttonLabel, "Anmelden")}
        </button>
      </form>
    );

  if (split) {
    return (
      <SectionShell node={node} section="newsletter">
        <div
          className={cx(
            "mx-auto grid items-center gap-10 px-4 py-16 md:grid-cols-2",
            contentWidthClass(node),
          )}
        >
          <div style={alignStyle(node)}>
            {headline}
            {sub}
          </div>
          <div>
            {signup}
            {note}
          </div>
        </div>
      </SectionShell>
    );
  }

  const content = (
    <>
      {headline}
      {sub}
      {signup}
      {note}
    </>
  );
  return (
    <SectionShell node={node} section="newsletter">
      <div
        className={cx(
          "mx-auto px-4 py-16 text-center",
          contentWidthClass(node, "max-w-3xl"),
        )}
        style={alignStyle(node)}
      >
        {variant === "boxed" ? (
          <div
            className="border"
            style={cardStyle(node, { background: "var(--bg-muted)", padding: "3rem 1.5rem" })}
          >
            {content}
          </div>
        ) : (
          content
        )}
      </div>
    </SectionShell>
  );
}
