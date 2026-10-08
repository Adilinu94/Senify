import { buttonStyle, contentWidthClass, cx, resolveLink, SectionShell, str, type SectionProps } from "./shared.tsx";

export function CookieNote({ node, ctx }: SectionProps): React.JSX.Element {
  const policy = resolveLink(node.props.policyLink, ctx);
  // `card` floats as a rounded card (what a section without a variant gets);
  // `bar` is a full-width strip along the edge whose content lines up with the
  // page.
  const bar = node.variant === "bar";
  const body = (
    <>
      <p className="flex-1 text-sm">
        {str(node.props.text)}{" "}
        {policy && (
          <a
            href={policy.href}
            target={policy.target}
            rel={policy.rel}
            data-broken-link={policy.broken ? "" : undefined}
            className="underline"
          >
            Datenschutzerklärung
          </a>
        )}
      </p>
      <div className="flex gap-2">
        {str(node.props.declineLabel) !== "" && (
          <button
            type="button"
            data-consent="decline"
            className="border px-4 py-2 text-sm font-semibold"
            style={buttonStyle(node, "outline")}
          >
            {str(node.props.declineLabel)}
          </button>
        )}
        <button
          type="button"
          data-consent="accept"
          className="px-4 py-2 text-sm font-semibold"
          style={buttonStyle(node)}
        >
          {str(node.props.acceptLabel, "OK")}
        </button>
      </div>
    </>
  );
  return (
    <SectionShell node={node} section="cookie-note" className={bar ? undefined : "px-4 pb-4"}>
      <div
        role="dialog"
        aria-live="polite"
        aria-label="Cookie-Hinweis"
        data-island="consent"
        className={
          bar
            ? "w-full border-t border-[var(--line)] bg-[var(--bg-base)] px-4 py-4 shadow-[var(--shadow-lg)]"
            : "mx-auto flex max-w-3xl flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--bg-base)] p-5 shadow-[var(--shadow-lg)] md:flex-row md:items-center"
        }
      >
        {bar ? (
          <div
            className={cx(
              "mx-auto flex flex-col gap-3 md:flex-row md:items-center md:gap-6",
              contentWidthClass(node),
            )}
          >
            {body}
          </div>
        ) : (
          body
        )}
      </div>
    </SectionShell>
  );
}
